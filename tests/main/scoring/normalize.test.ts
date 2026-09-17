import { describe, expect, it } from 'vitest'
import { normalizeRules } from '@main/scoring/normalize'
import { rules } from '../../fixtures/rules'

const T = '2026-09-18T00:00:00.000Z'

describe('normalizeRules', () => {
  it('stamps source=custom and updatedAt, rounds points, drops empty overrides', () => {
    const out = normalizeRules(
      rules({
        scoring: { rec: 1.00004, rec_yd: 0.1 },
        positionOverrides: { TE: { rec: 1.5 }, RB: {} }
      }),
      T
    )
    expect(out.source).toBe('custom')
    expect(out.updatedAt).toBe(T)
    expect(out.scoring).toEqual({ rec: 1, rec_yd: 0.1 })
    expect(out.positionOverrides).toEqual({ TE: { rec: 1.5 } })
    expect(out.rosterSlots).toEqual(rules().rosterSlots)
    expect(out.settings).toEqual(rules().settings)
  })

  it('normalizes slot names', () => {
    const out = normalizeRules(rules({ rosterSlots: [{ slot: ' flex ', count: 2 }] }), T)
    expect(out.rosterSlots).toEqual([{ slot: 'FLEX', count: 2 }])
  })

  it('drops undefined optional settings', () => {
    const out = normalizeRules(
      rules({ settings: { numTeams: 10, waiverType: 'priority', faabBudget: undefined } }),
      T
    )
    expect(out.settings).toEqual({ numTeams: 10, waiverType: 'priority' })
  })

  it('rejects invalid input with a readable message', () => {
    expect(() => normalizeRules(rules({ scoring: { rec: Number.NaN } }), T)).toThrow(
      'scoring.rec: points must be a number'
    )
    expect(() =>
      normalizeRules(rules({ positionOverrides: { XX: { rec: 1 } } as never }), T)
    ).toThrow('Unknown position "XX"')
    expect(() => normalizeRules(rules({ rosterSlots: [{ slot: 'RB', count: -1 }] }), T)).toThrow(
      'Slot RB count must be a whole number >= 0'
    )
    expect(() => normalizeRules(rules({ rosterSlots: [{ slot: 'RB', count: 1.5 }] }), T)).toThrow(
      'Slot RB count must be a whole number >= 0'
    )
    expect(() =>
      normalizeRules(
        rules({
          rosterSlots: [
            { slot: 'RB', count: 1 },
            { slot: 'rb', count: 1 }
          ]
        }),
        T
      )
    ).toThrow('Duplicate roster slot RB')
    expect(() => normalizeRules(rules({ rosterSlots: [{ slot: '', count: 1 }] }), T)).toThrow(
      'Roster slot name is required'
    )
    expect(() =>
      normalizeRules(rules({ settings: { numTeams: 1, waiverType: 'faab' } }), T)
    ).toThrow('Number of teams must be a whole number >= 2')
    expect(() =>
      normalizeRules(rules({ settings: { numTeams: 12, waiverType: 'auction' as never } }), T)
    ).toThrow('Waiver type must be faab or priority')
    expect(() =>
      normalizeRules(rules({ settings: { numTeams: 12, waiverType: 'faab', playoffTeams: -6 } }), T)
    ).toThrow('playoffTeams must be a whole number >= 0')
  })
})
