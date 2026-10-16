import { describe, expect, it } from 'vitest'
import {
  addableKeys,
  addableSlots,
  categoryTabs,
  irStatusesOf,
  isOverridable,
  lineupShape,
  rosterSummary,
  scoringGroups,
  seasonStrip,
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

  it('scores the keys nflverse lacks, so only unknown keys are unsupported', () => {
    expect(unsupportedKeys({ pass_td_40p: 2, st_ff: 1, def_3_and_out: 1, weird_key: 1 })).toEqual([
      'weird_key'
    ])
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

describe('Edition rulebook helpers', () => {
  const slots = [
    { slot: 'QB', count: 1 },
    { slot: 'BN', count: 6 },
    { slot: 'FLEX', count: 2 },
    { slot: 'RB', count: 2 },
    { slot: 'IR', count: 1 }
  ]

  it('lays out the starting lineup and sums the roster', () => {
    expect(lineupShape(slots)).toEqual(['QB', 'RB', 'RB', 'FLEX', 'FLEX'])
    expect(rosterSummary(slots)).toBe('5 starters · Bench 6 · IR 1 · 11-man roster')
    expect(rosterSummary([...slots, { slot: 'TAXI', count: 3 }])).toBe(
      '5 starters · Bench 6 · IR 1 · Taxi 3 · 11-man roster'
    )
  })

  it('draws the season with playoff rounds and the deadline', () => {
    const base = { numTeams: 12, waiverType: 'faab' as const }
    const strip = seasonStrip(
      {
        ...base,
        playoffStartWeek: 15,
        playoffTeams: 6,
        playoffRoundType: 0,
        tradeDeadlineWeek: 11
      },
      6
    )
    expect(strip).toHaveLength(18)
    expect(strip[4].kind).toBe('past')
    expect(strip[5].kind).toBe('now')
    expect(strip[6].kind).toBe('next')
    expect(strip[10].deadline).toBe(true)
    expect(strip.slice(14).map((w) => [w.kind, w.round])).toEqual([
      ['playoff', 'Round 1'],
      ['playoff', 'Semis'],
      ['playoff', 'Final'],
      ['next', null]
    ])
    const twoWeekFinal = seasonStrip(
      { ...base, playoffStartWeek: 15, playoffTeams: 4, playoffRoundType: 1 },
      1
    )
    expect(twoWeekFinal.slice(14).map((w) => w.round)).toEqual(['Semis', 'Final', null, null])
    expect(twoWeekFinal[16].kind).toBe('playoff')
    expect(twoWeekFinal[17].kind).toBe('next')
  })

  it('counts stats, overrides and unsaved changes per category', () => {
    const saved = { scoring: { pass_yd: 0.04, pass_td: 4, rec: 1 }, positionOverrides: {} }
    const draft = {
      scoring: { pass_yd: 0.04, pass_td: 6, rec: 1 },
      positionOverrides: { TE: { rec: 1.5 } }
    }
    const tabs = categoryTabs(draft, saved)
    expect(tabs.map((t) => [t.category, t.count, t.overrides, t.changed])).toEqual([
      ['passing', 2, 0, true],
      ['receiving', 1, 1, true]
    ])
  })
})
