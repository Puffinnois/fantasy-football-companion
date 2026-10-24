import { describe, expect, it } from 'vitest'
import { grainsOf } from '@main/stats/engine/registry'
import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
import { statsQuerySchema } from '@shared/stats/querySchema'
import { SAMPLE_LABELS } from '@shared/stats/samples'
import { POSITION_GROUPS } from '@shared/stats/types'

describe('the metric catalogue (stats-analysis spec §6)', () => {
  it('has unique ids, for players and teams', () => {
    const ids = CATALOGUE.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(CATALOGUE.filter((m) => m.entity === 'player').length).toBeGreaterThan(150)
    expect(CATALOGUE.filter((m) => m.entity === 'team').length).toBeGreaterThan(60)
  })

  it('computes every metric from components the derived and model tables hold', () => {
    const missing = CATALOGUE.filter((m) => !grainsOf(m).includes('week')).map((m) => m.id)
    expect(missing).toEqual([])
    // Weekly quantiles need one row per game; every other metric also has a season grain.
    const weekly = CATALOGUE.filter((m) => !grainsOf(m).includes('season')).map((m) => m.id)
    expect(weekly).toEqual(['fp_ceiling', 'fp_floor'])
  })

  it('splits by situation exactly the metrics that come from plays', () => {
    const play = (id: string): boolean =>
      grainsOf(CATALOGUE.find((m) => m.id === id)!).includes('play')
    expect(
      ['qb_epa_db', 'yprr', 'target_share', 'sacks', 'off_epa_play', 'def_man_epa'].map(play)
    ).toEqual([true, true, false, true, true, true])
    expect(['separation', 'qbr', 'fantasy_points', 'pressures', 'win_pct'].some(play)).toBe(false)
  })

  it('describes every metric for a person and an LLM', () => {
    for (const m of CATALOGUE) {
      expect(m.description, m.id).toMatch(/^[A-Z].+[.)]$/)
      expect(m.label.length, m.id).toBeGreaterThan(1)
      expect(m.short.length, m.id).toBeLessThanOrEqual(14)
      expect(componentsOf(m), m.id).toContain(m.sample)
      if (m.entity === 'team') expect(m.side, m.id).toBeDefined()
      if (m.positions !== 'all') {
        for (const p of m.positions) expect(POSITION_GROUPS, m.id).toContain(p)
      }
      if (m.kind === 'rate' && m.sample !== 'games' && m.entity === 'player') {
        expect(m.minSample, m.id).toBeGreaterThan(0)
      }
    }
  })

  it('reads NGS shares as fractions and percentages as published', () => {
    const unit = (id: string): string => CATALOGUE.find((m) => m.id === id)!.unit
    // NGS publishes rush % over expected as a fraction (0.38), 8+ box and aggressiveness in percent.
    expect([unit('rush_pct_over_expected'), unit('box8_rate'), unit('aggressiveness')]).toEqual([
      'pct',
      'pct',
      'pct'
    ])
  })

  it('lists its ids as the metric enum of the query schema (spec §10)', () => {
    const schema = statsQuerySchema(CATALOGUE.map((m) => m.id)) as {
      required: string[]
      properties: Record<
        string,
        { items?: { enum: string[] }; properties?: Record<string, unknown> }
      >
    }
    expect(schema.required).toEqual(['entity', 'metrics', 'scope'])
    expect(schema.properties.metrics.items?.enum).toHaveLength(CATALOGUE.length)
    expect(Object.keys(schema.properties.situation.properties ?? {})).toContain('withOnField')
  })

  it('reads a defense’s sacks and pressures as its own, red-zone drives both ways', () => {
    const m = (id: string): (typeof CATALOGUE)[number] => CATALOGUE.find((x) => x.id === id)!
    // A defense's sack and pressure rates are what it does to the passer: higher is better.
    expect([m('def_sack_rate'), m('def_pressure_rate')].map((x) => [x.label, x.direction])).toEqual(
      [
        ['Sack rate (defense)', 'higher'],
        ['Pressure rate (defense)', 'higher']
      ]
    )
    expect(m('off_rz_td_pct')).toMatchObject({
      label: 'Red-zone TD rate',
      sample: 'rz_drives',
      side: 'offense',
      direction: 'higher'
    })
    expect(m('def_rz_td_pct')).toMatchObject({
      label: 'Red-zone TD rate allowed',
      sample: 'def_rz_drives',
      side: 'defense',
      direction: 'lower'
    })
  })

  it('names what every sample counts (spec §9.2)', () => {
    expect(CATALOGUE.filter((m) => !SAMPLE_LABELS[m.sample]).map((m) => m.sample)).toEqual([])
  })
})
