import { describe, expect, it } from 'vitest'
import type { StatsCard, ToolResult } from '@shared/ask'
import { briefHash, briefText } from '@main/analyst/brief'
import { checkAnswer } from '@main/analyst/checks'
import { catalogueInfo } from '@main/stats/engine/registry'
import { NOW, statsResult, statsRow } from '../../fixtures/analyst'

const CATALOGUE = new Map(catalogueInfo().map((m) => [m.id, m]))
const CHASE = '00-0036900'

const result = (card: Partial<StatsCard>, text = ''): ToolResult => ({
  ok: true,
  tool: 'player_stats',
  title: '',
  text,
  cards: [
    {
      kind: 'stats',
      title: '',
      result: statsResult([]),
      base: null,
      splits: null,
      chart: 'table',
      ...card
    }
  ],
  notes: [],
  queries: [],
  ms: 1,
  cached: false
})

describe('the answer checks (Ask spec §4.3)', () => {
  const leaders = result(
    {
      result: statsResult([
        statsRow(CHASE, "Ja'Marr Chase", {
          yprr: { raw: 2.45, sample: 210, percentile: 97, rank: 1 },
          target_share: { raw: 0.285, sample: 80 }
        })
      ])
    },
    "1. Ja'Marr Chase (00-0036900, WR, CIN) — YPRR 2.45 on 210 routes, 97th pct"
  )

  it('accepts numbers from the results, the question and small prose numbers', () => {
    const answer =
      "Ja'Marr Chase leads WRs since week 5 with 2.45 yards per route on 210 routes (97th percentile), a 28.5% target share; the top 3 are close."
    expect(
      checkAnswer(answer, [leaders], CATALOGUE, { question: 'Who leads WRs since week 5?' })
    ).toEqual([])
  })

  it('flags a number no result has', () => {
    const checks = checkAnswer(
      'Chase has 2.61 yards per route and 1,203 yards.',
      [leaders],
      CATALOGUE,
      { question: '' }
    )
    expect(checks.map((c) => [c.kind, c.text])).toEqual([
      ['number', '2.61'],
      ['number', '1,203']
    ])
  })

  it('flags an unqualified rate given without its sample', () => {
    const thin = result({
      result: statsResult([
        statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 3.1, sample: 41, qualified: false } })
      ])
    })
    expect(
      checkAnswer('Chase is at 3.10 yards per route.', [thin], CATALOGUE, { question: '' })
    ).toMatchObject([
      {
        kind: 'sample',
        text: '3.10',
        message: expect.stringMatching(/on 41 routes, below the qualified sample/)
      }
    ])
    expect(
      checkAnswer('Chase is at 3.10 yards per route on 41 routes.', [thin], CATALOGUE, {
        question: ''
      })
    ).toEqual([])
  })

  it('flags a split without its base, and a cause softly', () => {
    const split = result({
      result: statsResult([
        statsRow(
          CHASE,
          "Ja'Marr Chase",
          { yprr: { raw: 1.8, sample: 210 } },
          { group: { coverage: 'man' } }
        )
      ]),
      base: statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2.26, sample: 626 } }),
      splits: { man: { yprr: { diff: -0.46, interval: [-0.9, -0.02], withinNoise: false } } }
    })
    expect(
      checkAnswer('Against man he drops to 1.80 because of press coverage.', [split], CATALOGUE, {
        question: ''
      }).map((c) => [c.kind, c.text, c.severity])
    ).toEqual([
      ['base', '1.80', 'flag'],
      ['causal', 'because of', 'soft']
    ])
    expect(
      checkAnswer(
        'He is at 2.26 overall and 1.80 against man (0.46 lower, beyond noise).',
        [split],
        CATALOGUE,
        { question: '' }
      )
    ).toEqual([])
  })
})

describe('the analyst brief (Ask spec §4.4)', () => {
  it('fills the data range, the week and the glossary; hashes the template', () => {
    const text = briefText('analyst', NOW)
    expect(text).toContain(
      'Data: NFL seasons 2019–2026. The current season is 2026, played through week 7 (regular season).'
    )
    expect(text).toContain('- Qualified: ')
    expect(text).not.toMatch(/\{\{/)
    expect(briefHash('analyst')).toMatch(/^[0-9a-f]{12}$/)
    expect(briefHash('analyst')).not.toBe(briefHash('compact-call'))
  })

  it('names the tool the app chose in the compact call brief', () => {
    const text = briefText('compact-call', NOW, {
      tool: 'leaderboard',
      description: 'Rank players or teams by one metric.'
    })
    expect(text).toMatch(
      /^You are FantasyCompanion's NFL data analyst\. The app has read the question and chosen the tool: leaderboard — Rank players/
    )
    expect(text).toContain('"default" for the usual line')
  })
})
