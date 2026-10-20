import type { LeaderboardBoard, StatsView } from '@shared/stats/types'
import type { Db } from '../connection'

interface ViewRow {
  id: number
  name: string
  board_json: string
  updated_at: string
}

const toView = (r: ViewRow): StatsView => ({
  id: r.id,
  name: r.name,
  board: JSON.parse(r.board_json) as LeaderboardBoard,
  updatedAt: r.updated_at
})

/** Every custom view, by name. */
export function listStatsViews(db: Db): StatsView[] {
  return (
    db
      .prepare(
        'SELECT id, name, board_json, updated_at FROM stats_views ORDER BY name COLLATE NOCASE'
      )
      .all() as unknown as ViewRow[]
  ).map(toView)
}

/** Saves a view under `name`; a view of the same name (any case) is replaced. */
export function saveStatsView(
  db: Db,
  name: string,
  board: LeaderboardBoard,
  now: string
): StatsView {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A view needs a name')
  if (trimmed.length > 60) throw new Error('A view name is at most 60 characters')
  const row = db
    .prepare(
      `INSERT INTO stats_views (name, board_json, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET name = excluded.name, board_json = excluded.board_json,
         updated_at = excluded.updated_at
       RETURNING id, name, board_json, updated_at`
    )
    .get(trimmed, JSON.stringify(board), now, now) as unknown as ViewRow
  return toView(row)
}

export function deleteStatsView(db: Db, id: number): void {
  db.prepare('DELETE FROM stats_views WHERE id = ?').run(id)
}
