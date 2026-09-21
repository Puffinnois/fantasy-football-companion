import { describe, expect, it } from 'vitest'
import { openDatabase, withTransaction } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { migrations } from '@main/db/migrations'

describe('migrate', () => {
  it('creates all slice-1 tables on an empty database', () => {
    const db = openDatabase(':memory:')
    const version = migrate(db)
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string
      }[]
    ).map((r) => r.name)
    expect(version).toBe(6)
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
        'player_week_projections',
        'watchlist',
        'expert_ranks',
        'market_values',
        'schema_version'
      ])
    )
  })

  it('is idempotent', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    const row = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }
    expect(row.n).toBe(6)
  })

  it('005 adds crosswalk.fantasypros_id and forgets the crosswalk step so it is re-downloaded', () => {
    const db = openDatabase(':memory:')
    // apply 001–004 by hand, then a crosswalk step that would otherwise still be fresh
    db.exec(
      'CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)'
    )
    for (const m of migrations.slice(0, 4)) {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        'x'
      )
    }
    db.prepare(
      `INSERT INTO sync_log (source, started_at, finished_at, status, message, rows_written)
       VALUES ('nflverse:crosswalk', 't', 't', 'ok', NULL, 10), ('nflverse:games', 't', 't', 'ok', NULL, 1)`
    ).run()

    expect(migrate(db)).toBe(6)
    const columns = (db.prepare('PRAGMA table_info(crosswalk)').all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(columns).toContain('fantasypros_id')
    const sources = (
      db.prepare('SELECT source FROM sync_log ORDER BY source').all() as { source: string }[]
    ).map((r) => r.source)
    expect(sources).toEqual(['nflverse:games'])
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
