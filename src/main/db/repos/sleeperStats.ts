import type { Db } from '../connection'

/** One player-week of Sleeper's actual stats (Sleeper stats scoring spec §3.2). */
export interface SleeperStatsRecord {
  /** Sleeper player id; team defenses use the team code. */
  playerId: string
  season: number
  week: number
  team: string | null
  opponent: string | null
  /** Sleeper stat keys → value; zeros are absent, as Sleeper publishes them. */
  stats: Record<string, number>
}

interface Row {
  player_id: string
  season: number
  week: number
  team: string | null
  opponent: string | null
  stats_json: string
}

const SELECT = 'SELECT player_id, season, week, team, opponent, stats_json FROM sleeper_week_stats'

const toRecord = (r: Row): SleeperStatsRecord => ({
  playerId: r.player_id,
  season: r.season,
  week: r.week,
  team: r.team,
  opponent: r.opponent,
  stats: JSON.parse(r.stats_json) as Record<string, number>
})

/** Full replace of one week. Wrap in `withTransaction`. */
export function replaceSleeperStats(
  db: Db,
  season: number,
  week: number,
  records: SleeperStatsRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM sleeper_week_stats WHERE season = ? AND week = ?').run(season, week)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO sleeper_week_stats (player_id, season, week, team, opponent, stats_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  for (const r of records) {
    insert.run(r.playerId, season, week, r.team, r.opponent, JSON.stringify(r.stats), updatedAt)
  }
  return records.length
}

/** Every stored line, for `recomputePoints`. */
export function listSleeperStats(db: Db): SleeperStatsRecord[] {
  return (db.prepare(`${SELECT} ORDER BY season, week, player_id`).all() as unknown as Row[]).map(
    toRecord
  )
}

export function listSleeperStatsByWeek(db: Db, season: number, week: number): SleeperStatsRecord[] {
  return (
    db
      .prepare(`${SELECT} WHERE season = ? AND week = ? ORDER BY player_id`)
      .all(season, week) as unknown as Row[]
  ).map(toRecord)
}

export function listSleeperStatsBySeason(db: Db, season: number): SleeperStatsRecord[] {
  return (
    db
      .prepare(`${SELECT} WHERE season = ? ORDER BY week, player_id`)
      .all(season) as unknown as Row[]
  ).map(toRecord)
}
