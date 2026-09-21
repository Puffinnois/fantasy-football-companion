import type { Db } from '../connection'

export interface MatchupRecord {
  rosterId: number
  /** Rosters sharing a matchup id play each other; null on a bye week. */
  matchupId: number | null
  /** Sleeper's `starters` in slot order; `'0'` = empty slot. */
  starters: string[]
  /** The roster that week. */
  players: string[]
  points: number
}

export interface MatchupRow extends MatchupRecord {
  week: number
  updatedAt: string
}

interface Row {
  week: number
  roster_id: number
  matchup_id: number | null
  starters_json: string
  players_json: string
  points: number
  updated_at: string
}

/** Full replace of one (league, season, week); empty `records` clears the week. Wrap in `withTransaction`. */
export function replaceMatchupsWeek(
  db: Db,
  leagueId: string,
  season: number,
  week: number,
  records: MatchupRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM matchups WHERE league_id = ? AND season = ? AND week = ?').run(
    leagueId,
    season,
    week
  )
  const insert = db.prepare(
    `INSERT INTO matchups (league_id, season, week, roster_id, matchup_id, starters_json, players_json, points, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const r of records) {
    insert.run(
      leagueId,
      season,
      week,
      r.rosterId,
      r.matchupId,
      JSON.stringify(r.starters),
      JSON.stringify(r.players),
      r.points,
      updatedAt
    )
  }
  return records.length
}

export function listMatchups(db: Db, leagueId: string, season: number): MatchupRow[] {
  const rows = db
    .prepare(
      `SELECT week, roster_id, matchup_id, starters_json, players_json, points, updated_at
       FROM matchups WHERE league_id = ? AND season = ? ORDER BY week, roster_id`
    )
    .all(leagueId, season) as unknown as Row[]
  return rows.map((r) => ({
    week: r.week,
    rosterId: r.roster_id,
    matchupId: r.matchup_id,
    starters: JSON.parse(r.starters_json) as string[],
    players: JSON.parse(r.players_json) as string[],
    points: r.points,
    updatedAt: r.updated_at
  }))
}

/** When the week was last written (its rows share one timestamp); null when nothing is stored. */
export function matchupsWeekUpdatedAt(
  db: Db,
  leagueId: string,
  season: number,
  week: number
): string | null {
  const row = db
    .prepare(
      'SELECT MAX(updated_at) AS updated_at FROM matchups WHERE league_id = ? AND season = ? AND week = ?'
    )
    .get(leagueId, season, week) as { updated_at: string | null } | undefined
  return row?.updated_at ?? null
}
