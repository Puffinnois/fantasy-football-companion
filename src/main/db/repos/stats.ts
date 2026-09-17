import type {
  GameRecord,
  PlayerWeekStatsRecord,
  SnapCountRecord,
  TeamWeekStatsRecord
} from '@main/sources/nflverse-types'
import type { Db } from '../connection'

export interface PlayerWeekRow {
  gsisId: string
  season: number
  week: number
  team: string | null
  opponent: string | null
  position: string | null
  stats: Record<string, number>
}

export interface TeamWeekRow {
  team: string
  season: number
  week: number
  opponent: string | null
  stats: Record<string, number>
}

export interface GameRow {
  gameId: string
  season: number
  week: number
  gameType: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
}

/** A player as the nflverse stats file names it — the last-resort identity source. */
export interface NflverseIdentity {
  gsisId: string
  name: string
  position: string | null
}

export interface SnapRow {
  week: number
  offenseSnaps: number | null
  offensePct: number | null
  defenseSnaps: number | null
  defensePct: number | null
  stSnaps: number | null
  stPct: number | null
}

interface PlayerWeekDbRow {
  gsis_id: string
  season: number
  week: number
  team: string | null
  opponent: string | null
  position: string | null
  stats_json: string
}

interface TeamWeekDbRow {
  team: string
  season: number
  week: number
  opponent: string | null
  stats_json: string
}

interface GameDbRow {
  game_id: string
  season: number
  week: number
  game_type: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
}

interface SnapDbRow {
  week: number
  offense_snaps: number | null
  offense_pct: number | null
  defense_snaps: number | null
  defense_pct: number | null
  st_snaps: number | null
  st_pct: number | null
}

const PLAYER_WEEK_SELECT =
  'SELECT gsis_id, season, week, team, opponent, position, stats_json FROM player_week_stats'

function toPlayerWeek(r: PlayerWeekDbRow): PlayerWeekRow {
  return {
    gsisId: r.gsis_id,
    season: r.season,
    week: r.week,
    team: r.team,
    opponent: r.opponent,
    position: r.position,
    stats: JSON.parse(r.stats_json) as Record<string, number>
  }
}

/** Full-file replace for one season (the nflverse file is regenerated whole). Wrap in `withTransaction`. */
export function replacePlayerWeekStats(
  db: Db,
  season: number,
  records: PlayerWeekStatsRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM player_week_stats WHERE season = ?').run(season)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO player_week_stats
       (gsis_id, season, week, season_type, player_name, position, team, opponent, stats_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      r.gsisId,
      season,
      r.week,
      r.seasonType,
      r.playerName,
      r.position,
      r.team,
      r.opponent,
      JSON.stringify(r.stats),
      updatedAt
    )
    written++
  }
  return written
}

export function replaceTeamWeekStats(
  db: Db,
  season: number,
  records: TeamWeekStatsRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM team_week_stats WHERE season = ?').run(season)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO team_week_stats (team, season, week, season_type, opponent, stats_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(r.team, season, r.week, r.seasonType, r.opponent, JSON.stringify(r.stats), updatedAt)
    written++
  }
  return written
}

export function replaceSnaps(
  db: Db,
  season: number,
  records: SnapCountRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM player_week_snaps WHERE season = ?').run(season)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO player_week_snaps
       (pfr_id, season, week, team, opponent, position, offense_snaps, offense_pct, defense_snaps, defense_pct,
        st_snaps, st_pct, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      r.pfrId,
      season,
      r.week,
      r.team,
      r.opponent,
      r.position,
      r.offenseSnaps,
      r.offensePct,
      r.defenseSnaps,
      r.defensePct,
      r.stSnaps,
      r.stPct,
      updatedAt
    )
    written++
  }
  return written
}

/** Games are keyed globally; scores fill in as the season progresses. */
export function upsertGames(db: Db, records: GameRecord[], updatedAt: string): number {
  const stmt = db.prepare(
    `INSERT INTO games (game_id, season, week, game_type, gameday, home_team, away_team, home_score, away_score, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(game_id) DO UPDATE SET season = excluded.season, week = excluded.week,
       game_type = excluded.game_type, gameday = excluded.gameday, home_team = excluded.home_team,
       away_team = excluded.away_team, home_score = excluded.home_score, away_score = excluded.away_score,
       updated_at = excluded.updated_at`
  )
  let written = 0
  for (const g of records) {
    stmt.run(
      g.gameId,
      g.season,
      g.week,
      g.gameType,
      g.gameday,
      g.homeTeam,
      g.awayTeam,
      g.homeScore,
      g.awayScore,
      updatedAt
    )
    written++
  }
  return written
}

export function listPlayerWeeks(db: Db, gsisId: string, season: number): PlayerWeekRow[] {
  const rows = db
    .prepare(`${PLAYER_WEEK_SELECT} WHERE gsis_id = ? AND season = ? ORDER BY week`)
    .all(gsisId, season) as unknown as PlayerWeekDbRow[]
  return rows.map(toPlayerWeek)
}

export function listAllPlayerWeeks(db: Db): PlayerWeekRow[] {
  const rows = db
    .prepare(`${PLAYER_WEEK_SELECT} ORDER BY season, week`)
    .all() as unknown as PlayerWeekDbRow[]
  return rows.map(toPlayerWeek)
}

export function listTeamWeeks(db: Db): TeamWeekRow[] {
  const rows = db
    .prepare(
      'SELECT team, season, week, opponent, stats_json FROM team_week_stats ORDER BY season, week'
    )
    .all() as unknown as TeamWeekDbRow[]
  return rows.map((r) => ({
    team: r.team,
    season: r.season,
    week: r.week,
    opponent: r.opponent,
    stats: JSON.parse(r.stats_json) as Record<string, number>
  }))
}

export function listGames(db: Db): GameRow[] {
  const rows = db
    .prepare(
      'SELECT game_id, season, week, game_type, home_team, away_team, home_score, away_score FROM games ORDER BY season, week'
    )
    .all() as unknown as GameDbRow[]
  return rows.map((r) => ({
    gameId: r.game_id,
    season: r.season,
    week: r.week,
    gameType: r.game_type,
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    homeScore: r.home_score,
    awayScore: r.away_score
  }))
}

export function listSnaps(db: Db, pfrId: string, season: number): SnapRow[] {
  const rows = db
    .prepare(
      `SELECT week, offense_snaps, offense_pct, defense_snaps, defense_pct, st_snaps, st_pct
       FROM player_week_snaps WHERE pfr_id = ? AND season = ? ORDER BY week`
    )
    .all(pfrId, season) as unknown as SnapDbRow[]
  return rows.map((r) => ({
    week: r.week,
    offenseSnaps: r.offense_snaps,
    offensePct: r.offense_pct,
    defenseSnaps: r.defense_snaps,
    defensePct: r.defense_pct,
    stSnaps: r.st_snaps,
    stPct: r.st_pct
  }))
}

/**
 * nflverse team code -> bye week, derived from the regular-season schedule: the first week
 * (1..max scheduled week) in which the team has no game. Empty when no games are stored.
 */
export function teamByeWeeks(db: Db, season: number): Map<string, number> {
  const rows = db
    .prepare("SELECT week, home_team, away_team FROM games WHERE season = ? AND game_type = 'REG'")
    .all(season) as unknown as { week: number; home_team: string; away_team: string }[]
  const played = new Map<string, Set<number>>()
  let maxWeek = 0
  for (const r of rows) {
    maxWeek = Math.max(maxWeek, r.week)
    for (const team of [r.home_team, r.away_team]) {
      if (!played.has(team)) played.set(team, new Set())
      played.get(team)?.add(r.week)
    }
  }
  const byes = new Map<string, number>()
  for (const [team, weeks] of played) {
    for (let w = 1; w <= maxWeek; w++) {
      if (!weeks.has(w)) {
        byes.set(team, w)
        break
      }
    }
  }
  return byes
}

export function listNflverseIdentities(db: Db): NflverseIdentity[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT gsis_id, player_name, position FROM player_week_stats
       WHERE player_name IS NOT NULL ORDER BY gsis_id`
    )
    .all() as unknown as { gsis_id: string; player_name: string; position: string | null }[]
  return rows.map((r) => ({ gsisId: r.gsis_id, name: r.player_name, position: r.position }))
}
