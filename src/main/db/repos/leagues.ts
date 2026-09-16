import type { League } from '@shared/types'
import type { Db } from '../connection'

export interface LeagueRecord extends League {
  sleeperRaw: string
}

interface Row {
  league_id: string
  name: string
  season: string
  status: string
  total_rosters: number
  synced_at: string | null
}

export function upsertLeague(db: Db, league: LeagueRecord, updatedAt: string): void {
  db.prepare(
    `INSERT INTO leagues (league_id, name, season, status, total_rosters, sleeper_raw, synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(league_id) DO UPDATE SET name = excluded.name, season = excluded.season, status = excluded.status,
       total_rosters = excluded.total_rosters, sleeper_raw = excluded.sleeper_raw, synced_at = excluded.synced_at,
       updated_at = excluded.updated_at`
  ).run(
    league.leagueId,
    league.name,
    league.season,
    league.status,
    league.totalRosters,
    league.sleeperRaw,
    league.syncedAt,
    updatedAt
  )
}

export function getLeague(db: Db, leagueId: string): League | null {
  const row = db
    .prepare(
      'SELECT league_id, name, season, status, total_rosters, synced_at FROM leagues WHERE league_id = ?'
    )
    .get(leagueId) as Row | undefined
  if (!row) return null
  return {
    leagueId: row.league_id,
    name: row.name,
    season: row.season,
    status: row.status,
    totalRosters: row.total_rosters,
    syncedAt: row.synced_at
  }
}
