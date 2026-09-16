import type { NflState } from '@shared/types'
import type { Db } from '../connection'

interface Row {
  season: string
  week: number
  display_week: number
  season_type: string
  fetched_at: string
}

export function setNflState(db: Db, state: NflState): void {
  db.prepare(
    `INSERT INTO nfl_state (id, season, week, display_week, season_type, fetched_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET season = excluded.season, week = excluded.week,
       display_week = excluded.display_week, season_type = excluded.season_type, fetched_at = excluded.fetched_at`
  ).run(state.season, state.week, state.displayWeek, state.seasonType, state.fetchedAt)
}

export function getNflState(db: Db): NflState | null {
  const row = db
    .prepare(
      'SELECT season, week, display_week, season_type, fetched_at FROM nfl_state WHERE id = 1'
    )
    .get() as Row | undefined
  if (!row) return null
  return {
    season: row.season,
    week: row.week,
    displayWeek: row.display_week,
    seasonType: row.season_type,
    fetchedAt: row.fetched_at
  }
}
