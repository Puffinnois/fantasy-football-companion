import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'

describe('migrate', () => {
  it('creates all slice-1 tables on an empty database', () => {
    const db = openDatabase(':memory:')
    const version = migrate(db)
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string
      }[]
    ).map((r) => r.name)
    expect(version).toBe(1)
    expect(tables).toEqual(
      expect.arrayContaining([
        'app_settings',
        'nfl_state',
        'leagues',
        'teams',
        'players',
        'roster_players',
        'sync_log',
        'schema_version'
      ])
    )
  })

  it('is idempotent', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    const row = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }
    expect(row.n).toBe(1)
  })

  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(() =>
      db
        .prepare(
          "INSERT INTO teams (league_id, roster_id, display_name, updated_at) VALUES ('nope', 1, 'x', 'now')"
        )
        .run()
    ).toThrow(/FOREIGN KEY/)
  })
})
