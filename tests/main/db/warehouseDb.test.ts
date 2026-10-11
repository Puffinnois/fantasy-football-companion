import { describe, expect, it } from 'vitest'
import { openWarehouseDatabase } from '@main/db/warehouseDb'

const tables = (db: ReturnType<typeof openWarehouseDatabase>): string[] =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string
    }[]
  ).map((r) => r.name)

describe('openWarehouseDatabase', () => {
  it('creates the warehouse tables and its own sync log, and nothing of the app database', () => {
    const db = openWarehouseDatabase(':memory:')
    expect(tables(db)).toEqual(
      expect.arrayContaining([
        'wh_player_week',
        'wh_team_week',
        'wh_game',
        'wh_player',
        'wh_source_state',
        'sync_log',
        'schema_version'
      ])
    )
    expect(tables(db)).not.toContain('players')
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number }
    expect(row.v).toBe(1)
  })
})
