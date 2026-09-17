import type { CrosswalkRecord } from '@main/sources/nflverse-types'
import type { Db } from '../connection'

export type Resolution =
  'crosswalk' | 'sleeper_gsis' | 'sportradar' | 'name' | 'team' | 'unresolved'

export interface PlayerIdRecord {
  playerId: string
  gsisId: string | null
  pfrId: string | null
  sportradarId: string | null
  espnId: string | null
  /** nflverse team code, team defenses only. */
  nflverseTeam: string | null
  resolution: Resolution
}

/** What the resolver needs from the `players` table. */
export interface PlayerIdentitySource {
  playerId: string
  fullName: string
  position: string | null
  gsisId: string | null
  sportradarId: string | null
  espnId: string | null
}

/** What `recomputePoints` needs: every resolvable player with its Sleeper position. */
export interface ScoringIdentity {
  playerId: string
  position: string | null
  gsisId: string | null
  nflverseTeam: string | null
}

interface CrosswalkRow {
  sleeper_id: string | null
  gsis_id: string | null
  pfr_id: string | null
  sportradar_id: string | null
  espn_id: string | null
  name: string | null
  position: string | null
}

interface PlayerIdRow {
  player_id: string
  gsis_id: string | null
  pfr_id: string | null
  sportradar_id: string | null
  espn_id: string | null
  nflverse_team: string | null
  resolution: Resolution
}

interface SourceRow {
  player_id: string
  full_name: string
  position: string | null
  gsis_id: string | null
  sportradar_id: string | null
  espn_id: string | null
}

interface ScoringRow {
  player_id: string
  position: string | null
  gsis_id: string | null
  nflverse_team: string | null
}

export function replaceCrosswalk(db: Db, records: CrosswalkRecord[], updatedAt: string): number {
  db.exec('DELETE FROM crosswalk')
  const insert = db.prepare(
    `INSERT INTO crosswalk (sleeper_id, gsis_id, pfr_id, sportradar_id, espn_id, name, position, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      r.sleeperId,
      r.gsisId,
      r.pfrId,
      r.sportradarId,
      r.espnId,
      r.name,
      r.position,
      updatedAt
    )
    written++
  }
  return written
}

export function listCrosswalk(db: Db): CrosswalkRecord[] {
  const rows = db
    .prepare(
      'SELECT sleeper_id, gsis_id, pfr_id, sportradar_id, espn_id, name, position FROM crosswalk ORDER BY rowid'
    )
    .all() as unknown as CrosswalkRow[]
  return rows.map((r) => ({
    sleeperId: r.sleeper_id,
    gsisId: r.gsis_id,
    pfrId: r.pfr_id,
    sportradarId: r.sportradar_id,
    espnId: r.espn_id,
    name: r.name,
    position: r.position
  }))
}

export function replacePlayerIds(db: Db, records: PlayerIdRecord[], updatedAt: string): number {
  db.exec('DELETE FROM player_ids')
  const insert = db.prepare(
    `INSERT INTO player_ids (player_id, gsis_id, pfr_id, sportradar_id, espn_id, nflverse_team, resolution, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      r.playerId,
      r.gsisId,
      r.pfrId,
      r.sportradarId,
      r.espnId,
      r.nflverseTeam,
      r.resolution,
      updatedAt
    )
    written++
  }
  return written
}

export function getPlayerIds(db: Db, playerId: string): PlayerIdRecord | null {
  const r = db
    .prepare(
      'SELECT player_id, gsis_id, pfr_id, sportradar_id, espn_id, nflverse_team, resolution FROM player_ids WHERE player_id = ?'
    )
    .get(playerId) as PlayerIdRow | undefined
  if (!r) return null
  return {
    playerId: r.player_id,
    gsisId: r.gsis_id,
    pfrId: r.pfr_id,
    sportradarId: r.sportradar_id,
    espnId: r.espn_id,
    nflverseTeam: r.nflverse_team,
    resolution: r.resolution
  }
}

export function countPlayerIds(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM player_ids').get() as { n: number }).n
}

export function listPlayerIdentitySources(db: Db): PlayerIdentitySource[] {
  const rows = db
    .prepare(
      'SELECT player_id, full_name, position, gsis_id, sportradar_id, espn_id FROM players ORDER BY player_id'
    )
    .all() as unknown as SourceRow[]
  return rows.map((r) => ({
    playerId: r.player_id,
    fullName: r.full_name,
    position: r.position,
    gsisId: r.gsis_id,
    sportradarId: r.sportradar_id,
    espnId: r.espn_id
  }))
}

export function listScoringIdentities(db: Db): ScoringIdentity[] {
  const rows = db
    .prepare(
      `SELECT i.player_id, p.position, i.gsis_id, i.nflverse_team
       FROM player_ids i JOIN players p ON p.player_id = i.player_id
       WHERE i.gsis_id IS NOT NULL OR i.nflverse_team IS NOT NULL
       ORDER BY i.player_id`
    )
    .all() as unknown as ScoringRow[]
  return rows.map((r) => ({
    playerId: r.player_id,
    position: r.position,
    gsisId: r.gsis_id,
    nflverseTeam: r.nflverse_team
  }))
}

/** Rostered players in the league with no usable nflverse id (missing row or `unresolved`). */
export function countUnresolvedRostered(db: Db, leagueId: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(DISTINCT rp.player_id) AS n
         FROM roster_players rp LEFT JOIN player_ids i ON i.player_id = rp.player_id
         WHERE rp.league_id = ? AND (i.player_id IS NULL OR i.resolution = 'unresolved')`
      )
      .get(leagueId) as { n: number }
  ).n
}
