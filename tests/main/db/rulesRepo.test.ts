import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, withTransaction, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { upsertLeague } from '@main/db/repos/leagues'
import { getRules, saveRules } from '@main/db/repos/rules'
import { rules } from '../../fixtures/rules'

const T = '2026-09-17T12:00:00.000Z'

describe('rules repo', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    upsertLeague(
      db,
      {
        leagueId: 'L1',
        name: 'L',
        season: '2026',
        status: 'in_season',
        totalRosters: 12,
        syncedAt: null,
        sleeperRaw: '{}'
      },
      T
    )
  })

  it('returns null when no rules are stored', () => {
    expect(getRules(db, 'L1')).toBeNull()
  })

  it('round-trips scoring, overrides, slots and settings', () => {
    const r = rules({ positionOverrides: { TE: { rec: 1.5 }, RB: { rec: 0.5, rec_yd: 0.2 } } })
    withTransaction(db, () => saveRules(db, 'L1', r))
    expect(getRules(db, 'L1')).toEqual(r)
  })

  it('replaces rows on save (removed keys, slots and overrides disappear)', () => {
    withTransaction(db, () =>
      saveRules(db, 'L1', rules({ positionOverrides: { TE: { rec: 1.5 } } }))
    )
    const next = rules({
      source: 'custom',
      updatedAt: '2026-09-18T00:00:00.000Z',
      scoring: { rec: 0.5 },
      rosterSlots: [{ slot: 'QB', count: 1 }],
      settings: { numTeams: 10, waiverType: 'priority' }
    })
    withTransaction(db, () => saveRules(db, 'L1', next))
    expect(getRules(db, 'L1')).toEqual(next)
  })

  it('keeps roster slot order', () => {
    const r = rules({
      rosterSlots: [
        { slot: 'WR', count: 3 },
        { slot: 'BN', count: 5 },
        { slot: 'QB', count: 1 }
      ]
    })
    withTransaction(db, () => saveRules(db, 'L1', r))
    expect(getRules(db, 'L1')?.rosterSlots.map((s) => s.slot)).toEqual(['WR', 'BN', 'QB'])
  })

  it('requires the league row', () => {
    expect(() => saveRules(db, 'nope', rules())).toThrow(/FOREIGN KEY/)
  })
})
