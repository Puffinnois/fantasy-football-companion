import { describe, expect, it } from 'vitest'
import {
  addableKeys,
  addableSlots,
  irStatusesOf,
  isOverridable,
  scoringGroups,
  toggleIrStatus,
  unsupportedKeys
} from '@/lib/rulesView'

describe('rulesView', () => {
  const scoring = { rec_yd: 0.1, rec: 1, pass_td: 4, weird_key: 1, pass_td_40p: 0, sack: 1 }

  it('groups scoring rows by category in catalogue order, unknown keys last', () => {
    const groups = scoringGroups(scoring)
    expect(groups.map((g) => g.category)).toEqual(['passing', 'receiving', 'defense', 'other'])
    expect(groups[0].rows.map((r) => r.key)).toEqual(['pass_td', 'pass_td_40p'])
    expect(groups[1].rows.map((r) => r.key)).toEqual(['rec', 'rec_yd'])
    expect(groups[3].rows).toEqual([
      { key: 'weird_key', label: 'weird_key', category: 'other', points: 1, supported: false }
    ])
    expect(groups[1].rows[0]).toMatchObject({ label: 'Reception', points: 1, supported: true })
  })

  it('lists unsupported keys that carry points', () => {
    expect(unsupportedKeys(scoring)).toEqual(['weird_key'])
  })

  it('offers catalogue keys not yet in scoring', () => {
    const keys = addableKeys(scoring).map((k) => k.key)
    expect(keys).toContain('bonus_rec_te')
    expect(keys).not.toContain('rec')
  })

  it('offers known slots not yet in the roster', () => {
    expect(
      addableSlots([
        { slot: 'QB', count: 1 },
        { slot: 'BN', count: 6 }
      ])
    ).toContain('FLEX')
    expect(addableSlots([{ slot: 'QB', count: 1 }])).not.toContain('QB')
  })

  it('allows overrides on offense categories only', () => {
    expect(isOverridable('receiving')).toBe(true)
    expect(isOverridable('bonus')).toBe(true)
    expect(isOverridable('kicking')).toBe(false)
    expect(isOverridable('defense')).toBe(false)
  })
})

describe('IR statuses (slice 6c spec §5.4)', () => {
  it('always includes IR', () => {
    expect(irStatusesOf({ numTeams: 12, waiverType: 'priority' })).toEqual(['IR'])
    expect(
      irStatusesOf({ numTeams: 12, waiverType: 'priority', irStatuses: ['Out', 'IR'] })
    ).toEqual(['IR', 'Out'])
  })

  it('toggles a status in canonical order and never removes IR', () => {
    expect(toggleIrStatus(['IR'], 'COV')).toEqual(['IR', 'COV'])
    expect(toggleIrStatus(['IR', 'COV'], 'Out')).toEqual(['IR', 'Out', 'COV'])
    expect(toggleIrStatus(['IR', 'Out'], 'Out')).toEqual(['IR'])
    expect(toggleIrStatus(['IR'], 'IR')).toEqual(['IR'])
    expect(toggleIrStatus(undefined, 'PUP')).toEqual(['IR', 'PUP'])
  })
})
