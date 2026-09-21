import { toNflverseTeam } from '@shared/teams'
import type { PointsContext, RosterPlayer, RosterSlot, Team } from '@shared/types'
import type { Db } from '../connection'
import { NO_POINTS_CONTEXT, POINTS_CTE, round2 } from './points'
import { teamByeWeeks } from './stats'

export interface RosterPlayerRecord {
  rosterId: number
  playerId: string
  slot: RosterSlot
  starterIndex: number | null
}

interface TeamRow {
  league_id: string
  roster_id: number
  owner_id: string | null
  display_name: string
  team_name: string | null
  avatar: string | null
  wins: number
  losses: number
  ties: number
  fpts: number
  fpts_against: number
  is_me: number
}

interface RosterRow {
  player_id: string
  slot: RosterSlot
  starter_index: number | null
  full_name: string
  position: string | null
  team: string | null
  status: string | null
  injury_status: string | null
  season_points: number | null
  last_week_points: number | null
  stats_available: number
}

export function replaceTeams(db: Db, leagueId: string, teams: Team[], updatedAt: string): void {
  db.prepare('DELETE FROM teams WHERE league_id = ?').run(leagueId)
  const insert = db.prepare(
    `INSERT INTO teams (league_id, roster_id, owner_id, display_name, team_name, avatar, wins, losses, ties, fpts,
       fpts_against, is_me, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const t of teams) {
    insert.run(
      leagueId,
      t.rosterId,
      t.ownerId,
      t.displayName,
      t.teamName,
      t.avatar,
      t.wins,
      t.losses,
      t.ties,
      t.fpts,
      t.fptsAgainst,
      t.isMe ? 1 : 0,
      updatedAt
    )
  }
}

export function listTeams(db: Db, leagueId: string): Team[] {
  const rows = db
    .prepare('SELECT * FROM teams WHERE league_id = ? ORDER BY is_me DESC, wins DESC, fpts DESC')
    .all(leagueId) as unknown as TeamRow[]
  return rows.map((r) => ({
    leagueId: r.league_id,
    rosterId: r.roster_id,
    ownerId: r.owner_id,
    displayName: r.display_name,
    teamName: r.team_name,
    avatar: r.avatar,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    fpts: r.fpts,
    fptsAgainst: r.fpts_against,
    isMe: r.is_me === 1
  }))
}

export function replaceRosterPlayers(
  db: Db,
  leagueId: string,
  rows: RosterPlayerRecord[],
  updatedAt: string
): void {
  db.prepare('DELETE FROM roster_players WHERE league_id = ?').run(leagueId)
  const insert = db.prepare(
    'INSERT INTO roster_players (league_id, roster_id, player_id, slot, starter_index, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const r of rows)
    insert.run(leagueId, r.rosterId, r.playerId, r.slot, r.starterIndex, updatedAt)
}

export function listRoster(
  db: Db,
  leagueId: string,
  rosterId: number,
  ctx: PointsContext = NO_POINTS_CONTEXT
): RosterPlayer[] {
  const byes = teamByeWeeks(db, ctx.season)
  const rows = db
    .prepare(
      `${POINTS_CTE}
       SELECT rp.player_id, rp.slot, rp.starter_index,
         COALESCE(p.full_name, rp.player_id) AS full_name, p.position, p.team, p.status, p.injury_status,
         pts.season_points, pts.last_week_points,
         CASE WHEN i.gsis_id IS NOT NULL OR i.nflverse_team IS NOT NULL THEN 1 ELSE 0 END AS stats_available
       FROM roster_players rp
       LEFT JOIN players p ON p.player_id = rp.player_id
       LEFT JOIN pts ON pts.player_id = rp.player_id
       LEFT JOIN player_ids i ON i.player_id = rp.player_id
       WHERE rp.league_id = ? AND rp.roster_id = ?
       ORDER BY CASE rp.slot WHEN 'starter' THEN 0 WHEN 'bench' THEN 1 WHEN 'ir' THEN 2 ELSE 3 END,
         rp.starter_index, p.position, full_name`
    )
    .all(ctx.lastWeek, leagueId, ctx.season, leagueId, rosterId) as unknown as RosterRow[]
  return rows.map((r) => ({
    playerId: r.player_id,
    slot: r.slot,
    starterIndex: r.starter_index,
    fullName: r.full_name,
    position: r.position,
    team: r.team,
    status: r.status,
    injuryStatus: r.injury_status,
    byeWeek: r.team ? (byes.get(toNflverseTeam(r.team)) ?? null) : null,
    seasonPoints: round2(r.season_points),
    lastWeekPoints: round2(r.last_week_points),
    statsAvailable: r.stats_available === 1
  }))
}

/**
 * Per roster, the current starters by Sleeper slot index (`null` = empty slot) — the current-week
 * fallback for the lineup screen when no matchups row exists yet (slice 6a spec §3.4).
 */
export function listStarterIndexes(db: Db, leagueId: string): Map<number, (string | null)[]> {
  const rows = db
    .prepare(
      `SELECT roster_id, player_id, starter_index FROM roster_players
       WHERE league_id = ? AND slot = 'starter' AND starter_index IS NOT NULL
       ORDER BY roster_id, starter_index`
    )
    .all(leagueId) as unknown as { roster_id: number; player_id: string; starter_index: number }[]
  const out = new Map<number, (string | null)[]>()
  for (const r of rows) {
    const starters = out.get(r.roster_id) ?? []
    while (starters.length < r.starter_index) starters.push(null)
    starters[r.starter_index] = r.player_id
    out.set(r.roster_id, starters)
  }
  return out
}
