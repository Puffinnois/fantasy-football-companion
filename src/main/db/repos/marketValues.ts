import type { Db } from '../connection'

export interface MarketValueRecord {
  /** Sleeper id. */
  playerId: string
  value: number
  overallRank: number
  posRank: number
  tier: number | null
  trend30d: number
}

export interface MarketValueRow extends MarketValueRecord {
  updatedAt: string
}

interface Row {
  player_id: string
  value: number
  overall_rank: number
  pos_rank: number
  tier: number | null
  trend_30d: number
  updated_at: string
}

/** Full replace of one season. Wrap in `withTransaction`. */
export function replaceMarketValues(
  db: Db,
  season: number,
  records: MarketValueRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM market_values WHERE season = ?').run(season)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO market_values (season, player_id, value, overall_rank, pos_rank, tier, trend_30d, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(season, r.playerId, r.value, r.overallRank, r.posRank, r.tier, r.trend30d, updatedAt)
    written++
  }
  return written
}

export function listMarketValues(db: Db, season: number): MarketValueRow[] {
  const rows = db
    .prepare(
      `SELECT player_id, value, overall_rank, pos_rank, tier, trend_30d, updated_at
       FROM market_values WHERE season = ? ORDER BY overall_rank, player_id`
    )
    .all(season) as unknown as Row[]
  return rows.map((r) => ({
    playerId: r.player_id,
    value: r.value,
    overallRank: r.overall_rank,
    posRank: r.pos_rank,
    tier: r.tier,
    trend30d: r.trend_30d,
    updatedAt: r.updated_at
  }))
}
