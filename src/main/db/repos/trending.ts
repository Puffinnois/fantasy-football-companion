import type { Db } from '../connection'

export interface TrendingRecord {
  playerId: string
  count: number
}

/** Slice 6c spec §5.1: only the latest fetch is kept; the weekly history lives in `ros_snapshots`. */
export function replaceTrendingAdds(db: Db, records: TrendingRecord[], fetchedAt: string): number {
  db.prepare('DELETE FROM trending_adds').run()
  const insert = db.prepare(
    'INSERT OR REPLACE INTO trending_adds (player_id, count, fetched_at) VALUES (?, ?, ?)'
  )
  for (const r of records) insert.run(r.playerId, r.count, fetchedAt)
  return records.length
}

export function listTrendingAdds(db: Db): Map<string, number> {
  const rows = db.prepare('SELECT player_id, count FROM trending_adds').all() as unknown as {
    player_id: string
    count: number
  }[]
  return new Map(rows.map((r) => [r.player_id, r.count]))
}

/** When the stored list was fetched; null before the first fetch. */
export function trendingFetchedAt(db: Db): string | null {
  const row = db.prepare('SELECT MAX(fetched_at) AS at FROM trending_adds').get() as
    { at: string | null } | undefined
  return row?.at ?? null
}
