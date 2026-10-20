import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { deleteStatsView, listStatsViews, saveStatsView } from '@main/db/repos/statsViews'
import type { LeaderboardBoard } from '@shared/stats/types'

const board = (over: Partial<LeaderboardBoard> = {}): LeaderboardBoard => ({
  entity: 'player',
  tab: 'WR',
  columns: ['targets', 'target_share', 'yprr'],
  sort: { by: 'yprr', dir: 'desc' },
  perGame: false,
  qualifiedOnly: true,
  team: null,
  owner: 'all',
  ...over
})

describe('stats views repo', () => {
  it('saves, lists by name and deletes', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const wr = saveStatsView(db, '  Slot WRs ', board(), 't1')
    saveStatsView(
      db,
      'Air raid',
      board({ entity: 'team', tab: 'offense', columns: ['proe'] }),
      't1'
    )
    expect(wr).toEqual({ id: wr.id, name: 'Slot WRs', board: board(), updatedAt: 't1' })
    expect(listStatsViews(db).map((v) => v.name)).toEqual(['Air raid', 'Slot WRs'])
    deleteStatsView(db, wr.id)
    expect(listStatsViews(db).map((v) => v.name)).toEqual(['Air raid'])
  })

  it('replaces a view of the same name, whatever its case', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const first = saveStatsView(db, 'Deep threats', board(), 't1')
    const second = saveStatsView(db, 'deep threats', board({ perGame: true }), 't2')
    expect(second.id).toBe(first.id)
    expect(listStatsViews(db)).toEqual([
      { id: first.id, name: 'deep threats', board: board({ perGame: true }), updatedAt: 't2' }
    ])
  })

  it('rejects an empty or long name', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(() => saveStatsView(db, '  ', board(), 't')).toThrow('A view needs a name')
    expect(() => saveStatsView(db, 'x'.repeat(61), board(), 't')).toThrow('at most 60')
  })

  it('refuses a malformed board and skips a corrupt row (review fix)', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const bad =
      (b: unknown): (() => unknown) =>
      () =>
        saveStatsView(db, 'x', b as LeaderboardBoard, 't')
    expect(bad(undefined)).toThrow('This view cannot be saved')
    expect(bad({ ...board(), entity: 'coach' })).toThrow('This view cannot be saved')
    expect(bad({ ...board(), columns: 'yprr' })).toThrow('This view cannot be saved')
    expect(bad({ ...board(), columns: Array(41).fill('yprr') })).toThrow(
      'This view cannot be saved'
    )
    expect(bad({ ...board(), sort: { by: 'yprr', dir: 'up' } })).toThrow(
      'This view cannot be saved'
    )
    saveStatsView(db, 'Good', board(), 't')
    db.prepare(
      "INSERT INTO stats_views (name, board_json, created_at, updated_at) VALUES ('Broken', '{not json', 't', 't'), ('Odd', '{}', 't', 't')"
    ).run()
    expect(listStatsViews(db).map((v) => v.name)).toEqual(['Good'])
  })
})
