import { describe, expect, it } from 'vitest'
import { METRIC_ALIASES, phraseKey } from '@shared/stats/aliases'
import { CATALOGUE, METRICS } from '@shared/stats/catalogue'
import { DIMENSIONS } from '@shared/stats/dimensions'
import { GLOSSARY, glossaryText } from '@shared/stats/glossary'
import { semanticModel, semanticModelYaml } from '@shared/stats/semanticModel'
import type { GroupBy, StatsQuery } from '@shared/stats/types'

describe('metric aliases (Ask spec §4.2)', () => {
  it('names only catalogue metrics, and every core and extended one', () => {
    for (const id of Object.keys(METRIC_ALIASES)) expect(METRICS.has(id), id).toBe(true)
    const missing = CATALOGUE.filter(
      (m) => m.tier !== 'stored' && (METRIC_ALIASES[m.id]?.length ?? 0) === 0
    ).map((m) => m.id)
    expect(missing).toEqual([])
  })

  it('never points one alias at two metrics', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const [id, aliases] of Object.entries(METRIC_ALIASES)) {
      for (const a of aliases) {
        const key = phraseKey(a)
        const other = seen.get(key)
        if (other && other !== id) clashes.push(`"${a}": ${other} and ${id}`)
        seen.set(key, id)
      }
    }
    expect(clashes).toEqual([])
  })

  it('compares phrases without case, apostrophes or punctuation', () => {
    expect(phraseKey("His Team's  Targets!")).toBe('his teams targets')
    expect(phraseKey('ANY/A')).toBe('any a')
  })
})

describe('dimensions (Ask spec §4.2)', () => {
  it('cover every situation filter and every groupBy of StatsQuery', () => {
    const situation: (keyof NonNullable<StatsQuery['situation']>)[] = [
      'down',
      'distance',
      'quarter',
      'fieldZone',
      'scoreMargin',
      'winProbability',
      'neutral',
      'twoMinute',
      'pressure',
      'blitz',
      'playAction',
      'coverage',
      'formation',
      'personnel',
      'box',
      'airYards',
      'withOnField',
      'withoutOnField'
    ]
    const groupBy: GroupBy[] = [
      'season',
      'week',
      'team',
      'opponent',
      'down',
      'quarter',
      'personnel',
      'coverage',
      'formation'
    ]
    const has = (q: object): boolean =>
      DIMENSIONS.some((d) => JSON.stringify(d.query) === JSON.stringify(q))
    for (const s of situation) expect(has({ situation: s }), s).toBe(true)
    for (const g of groupBy) expect(has({ groupBy: g }), g).toBe(true)
  })

  it('have unique ids, a description and synonyms, and no synonym shared by two', () => {
    expect(new Set(DIMENSIONS.map((d) => d.id)).size).toBe(DIMENSIONS.length)
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const d of DIMENSIONS) {
      expect(d.description.length, d.id).toBeGreaterThan(10)
      expect(d.synonyms.length, d.id).toBeGreaterThan(0)
      for (const s of [...d.synonyms, ...(d.values ?? []).flatMap((v) => v.synonyms)]) {
        const key = phraseKey(s)
        const other = seen.get(key)
        if (other && other !== d.id) clashes.push(`"${s}": ${other} and ${d.id}`)
        seen.set(key, d.id)
      }
    }
    expect(clashes).toEqual([])
  })

  it('say which seasons have them: FTN from 2022, participation through the prior season', () => {
    const d = (id: string): (typeof DIMENSIONS)[number] => DIMENSIONS.find((x) => x.id === id)!
    expect(d('blitz')).toMatchObject({ firstSeason: 2022 })
    expect(d('pressure')).toMatchObject({ lastSeason: 'prior' })
    expect(d('down').lastSeason).toBeUndefined()
  })
})

describe('the glossary and the semantic model (Ask spec §4.2)', () => {
  it('takes dimension terms from their definitions', () => {
    const pressure = GLOSSARY.find((g) => g.term === 'Pressure')
    expect(pressure?.text).toBe(DIMENSIONS.find((d) => d.id === 'pressure')?.description)
    expect(glossaryText()).toContain('- Qualified: ')
  })

  it('lists datasets, the shown metrics with synonyms, and the dimensions', () => {
    const model = semanticModel(
      new Map([
        ['yprr', { yearToYear: 0.6, pairs: 9, splitHalf: 0.7, prior: 120, reliability: 'high' }]
      ])
    )
    expect(model.datasets.map((d) => d.name)).toEqual(['players', 'teams'])
    expect(model.metrics.length).toBe(CATALOGUE.filter((m) => m.tier !== 'stored').length)
    expect(model.metrics.find((m) => m.name === 'yprr')).toMatchObject({
      dataset: 'players',
      synonyms: expect.arrayContaining(['yards per route run']),
      stability: { yearToYear: 0.6, reliability: 'high' }
    })
    expect(model.dimensions.find((d) => d.name === 'personnel')?.values).toContain('11')
  })

  it('writes block YAML, quoting what needs it', () => {
    const yaml = semanticModelYaml()
    expect(yaml).toMatch(/^name: FantasyCompanion stats\n/)
    expect(yaml).toContain('\n  - name: yprr\n')
    expect(yaml).toContain('    synonyms:\n      - yards per route run\n')
    // "11" would read as a number, and ": " would break the line: both are quoted.
    expect(yaml).toContain('      - "11"\n')
    const unquoted = yaml.split('\n').filter((line) => {
      const value = /^\s*(?:- )?[A-Za-z_]+: (.*)$/.exec(line)?.[1]
      return value !== undefined && !value.startsWith('"') && value.includes(': ')
    })
    expect(unquoted).toEqual([])
  })
})
