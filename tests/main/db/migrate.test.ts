import { describe, expect, it } from 'vitest'
import { openDatabase, withTransaction } from '@main/db/connection'
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
    expect(version).toBe(3)
    expect(tables).toEqual(
      expect.arrayContaining([
        'app_settings',
        'nfl_state',
        'leagues',
        'teams',
        'players',
        'roster_players',
        'sync_log',
        'rules',
        'scoring_rules',
        'roster_slots',
        'crosswalk',
        'player_ids',
        'player_week_stats',
        'team_week_stats',
        'player_week_snaps',
        'games',
        'player_week_points',
        'schema_version'
      ])
    )
  })

  it('is idempotent', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    const row = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }
    expect(row.n).toBe(3)
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

  it('rolls back the transaction when the callback throws', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(() =>
      withTransaction(db, () => {
        db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('foo', 'bar')
        throw new Error('boom')
      })
    ).toThrow('boom')
    const row = db.prepare('SELECT COUNT(*) AS n FROM app_settings WHERE key = ?').get('foo') as {
      n: number
    }
    expect(row.n).toBe(0)

    // the connection is not left mid-transaction: a subsequent transaction still works
    withTransaction(db, () => {
      db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('baz', 'qux')
    })
    const row2 = db.prepare('SELECT COUNT(*) AS n FROM app_settings WHERE key = ?').get('baz') as {
      n: number
    }
    expect(row2.n).toBe(1)
  })
})
