import type { Db } from '../connection'

/** Adds the player when absent, removes it when present. Returns the new state. */
export function toggleWatch(db: Db, playerId: string, now: string): boolean {
  const removed = db.prepare('DELETE FROM watchlist WHERE player_id = ?').run(playerId).changes
  if (removed > 0) return false
  db.prepare('INSERT INTO watchlist (player_id, added_at) VALUES (?, ?)').run(playerId, now)
  return true
}

export function listWatched(db: Db): string[] {
  return (
    db.prepare('SELECT player_id FROM watchlist ORDER BY added_at').all() as unknown as {
      player_id: string
    }[]
  ).map((r) => r.player_id)
}
