import type { Db } from '../connection'

export interface ProjectionRecord {
  playerId: string
  season: number
  week: number
  company: string | null
  team: string | null
  opponent: string | null
  /** Sleeper stat keys → projected value. */
  stats: Record<string, number>
}

interface Row {
  player_id: string
  season: number
  week: number
  company: string | null
  team: string | null
  opponent: string | null
  stats_json: string
}

/** Full replace of one week. Wrap in `withTransaction`. */
export function replaceProjections(
  db: Db,
  season: number,
  week: number,
  records: ProjectionRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM player_week_projections WHERE season = ? AND week = ?').run(season, week)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO player_week_projections (player_id, season, week, company, team, opponent, stats_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      r.playerId,
      season,
      week,
      r.company,
      r.team,
      r.opponent,
      JSON.stringify(r.stats),
      updatedAt
    )
    written++
  }
  return written
}

export function listProjections(db: Db, season: number, week: number): ProjectionRecord[] {
  const rows = db
    .prepare(
      `SELECT player_id, season, week, company, team, opponent, stats_json
       FROM player_week_projections WHERE season = ? AND week = ? ORDER BY player_id`
    )
    .all(season, week) as unknown as Row[]
  return rows.map((r) => ({
    playerId: r.player_id,
    season: r.season,
    week: r.week,
    company: r.company,
    team: r.team,
    opponent: r.opponent,
    stats: JSON.parse(r.stats_json) as Record<string, number>
  }))
}

export function listProjectionWeeks(db: Db): { season: number; week: number }[] {
  return db
    .prepare('SELECT DISTINCT season, week FROM player_week_projections ORDER BY season, week')
    .all() as unknown as { season: number; week: number }[]
}
