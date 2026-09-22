import { describe, expect, it } from 'vitest'
import { teamWeek, windowWeeks } from '@main/lineup/build'
import { evaluateTrade, rosterSize, TradeError } from '@main/trade/evaluate'
import {
  acceptanceOf,
  DOMINANCE_PTS,
  passesStance,
  STANCES,
  SUGGEST_MAX,
  suggestTrades
} from '@main/trade/suggest'
import type { TradeSuggestQuery, TradeSuggestion } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import { generateLeague, SMALL_LEAGUE, syntheticBuild } from '../../fixtures/synthetic'

describe('stance filters (spec 6b §3.3)', () => {
  it.each([
    ['premium', 1, 1, true],
    ['premium', 0.99, 1, false],
    ['premium', 1, 0.999, false],
    ['fair', 0, 0.85, false], // Δ/week exactly 0 fails: fair is "> 0"
    ['fair', 0.01, 0.85, true],
    ['fair', 0.01, 0.849, false],
    ['overpay', -1, 0.7, true],
    ['overpay', -1.01, 0.7, false],
    ['overpay', -1, 0.69, false]
  ] as const)('%s: Δ/week %s, ratio %s → %s', (stance, deltaPerWeek, ratio, ok) => {
    expect(passesStance(stance, deltaPerWeek, ratio)).toBe(ok)
  })

  it('treats an unpriced give as +∞ and an unpriced get as 0', () => {
    expect(passesStance('premium', 5, Number.POSITIVE_INFINITY)).toBe(true)
    expect(passesStance('overpay', 5, 0)).toBe(false)
  })

  it('labels why they would accept', () => {
    expect(acceptanceOf(0.01, 0.5)).toBe('lineup')
    expect(acceptanceOf(0, 0.9)).toBe('market')
    expect(acceptanceOf(-3, Number.POSITIVE_INFINITY)).toBe('market')
    expect(acceptanceOf(0.01, 0.9)).toBe('both')
    expect(acceptanceOf(0, 0.899)).toBeNull()
  })

  it('pins the constants', () => {
    expect(STANCES).toEqual({
      premium: { deltaPerWeek: 1, strict: false, ratio: 1 },
      fair: { deltaPerWeek: 0, strict: true, ratio: 0.85 },
      overpay: { deltaPerWeek: -1, strict: false, ratio: 0.7 }
    })
    expect(DOMINANCE_PTS).toBe(0.5)
    expect(SUGGEST_MAX).toBe(30)
  })
})

describe('synthetic league fixture', () => {
  it('builds the small league as its table says', () => {
    const { build } = syntheticBuild(SMALL_LEAGUE)
    expect(windowWeeks(build)).toEqual([16, 17])
    expect(rosterSize(build)).toBe(4)
    expect(build.inputs.teams.map((t) => [t.rosterId, t.isMe])).toEqual([
      [1, true],
      [2, false],
      [3, false]
    ])
    // Me: RB A20 · WR B8 · FLEX C18; Rival: RB G7 · WR F19 · FLEX E17; Other: RB J4 · WR I25 · FLEX L9
    expect(teamWeek(build, 1, 16).optimalTotal).toBe(46)
    expect(teamWeek(build, 2, 16).optimalTotal).toBe(43)
    expect(teamWeek(build, 3, 17).optimalTotal).toBe(38)
    expect(build.rowById.get('I')?.market?.value).toBe(7000)
    expect(build.rowById.get('D')?.rosPoints).toBe(10) // 5 + 5 over the two window weeks
    expect(
      build.rosters
        .get(3)
        ?.map((s) => s.base.playerId)
        .sort()
    ).toEqual(['I', 'J', 'K', 'L'])
  })

  it('generates a full league deterministically', () => {
    const league = generateLeague(7)
    expect(league.teams).toHaveLength(16)
    expect(league.teams.every((t) => t.players.length === 16)).toBe(true)
    expect(league.weeks).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
    expect(generateLeague(7)).toEqual(league)
    const { build } = syntheticBuild(league)
    expect(windowWeeks(build)).toHaveLength(15)
    expect(rosterSize(build)).toBe(16)
    expect(teamWeek(build, 1, 3).optimalTotal).toBeGreaterThan(0)
  })
})

const query = (over: Partial<TradeSuggestQuery> = {}): TradeSuggestQuery => ({
  season: SEASON,
  focus: null,
  stance: 'fair',
  partnerRosterId: null,
  ...over
})
/** "A+B→I@3": my give ids, their get ids (each sorted), partner roster. */
const shape = (s: TradeSuggestion): string => {
  const ids = (list: { playerId: string }[]): string =>
    list
      .map((p) => p.playerId)
      .sort()
      .join('+')
  return `${ids(s.evaluation.me.give)}→${ids(s.evaluation.me.get)}@${s.evaluation.them.rosterId}`
}
const shapes = (list: TradeSuggestion[]): string[] => list.map(shape)

/** The TradeError code a call throws, or a marker when it does not throw / throws something else. */
function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    if (err instanceof TradeError) return err.code
    throw err
  }
  return 'no error'
}

describe('suggestTrades on the small league (spec 6b §3)', () => {
  const { build } = syntheticBuild(SMALL_LEAGUE)

  it('finds the offers that help me and that they would take, ranked', () => {
    const out = suggestTrades(build, query())
    expect(shapes(out)).toEqual(['A+B→I@3', 'C→F@2'])
    const [abi, cf] = out
    expect(abi.acceptance).toBe('market')
    expect(abi.evaluation.me).toMatchObject({ delta: 4, deltaPerWeek: 2, drops: [] })
    expect(abi.evaluation.them.delta).toBe(-2)
    expect(abi.evaluation.them.drops.map((p) => p.playerId)).toEqual(['J'])
    expect(cf.acceptance).toBe('market')
    expect(cf.evaluation.me).toMatchObject({ delta: 2, deltaPerWeek: 1 })
    expect(cf.evaluation.them.delta).toBe(-2)
    // a suggestion carries exactly what the builder would compute for it
    for (const s of out) {
      const { me, them } = s.evaluation
      expect(
        evaluateTrade(build, {
          rosterId: them.rosterId,
          give: me.give.map((p) => p.playerId),
          get: me.get.map((p) => p.playerId)
        })
      ).toEqual(s.evaluation)
    }
  })

  it('applies the stance on my side only', () => {
    // C→F sits exactly on premium's +1.0 / week bound and clears 100 % of market
    expect(shapes(suggestTrades(build, query({ stance: 'premium' })))).toEqual(['A+B→I@3', 'C→F@2'])
    const overpay = suggestTrades(build, query({ stance: 'overpay' }))
    expect(shapes(overpay)).toEqual(['A+B→I@3', 'C→F@2', 'C→E@2', 'A→F@2'])
    // the two I overpay in are win-win for them: ordered by my market ratio (0.95 before 0.88)
    expect(overpay.slice(2).map((s) => s.acceptance)).toEqual(['both', 'both'])
    expect(overpay.slice(2).map((s) => s.evaluation.me.delta)).toEqual([-2, -2])
  })

  it('drops a padded 2-for-1 but keeps one whose 1-for-1 they would refuse', () => {
    // C+D→F passes on its own (me +2, them market 0.98) but adds nothing over C→F: dropped.
    // A+B→I is kept: A→I and B→I both fail on their side, so the pair is what makes it work.
    const out = shapes(suggestTrades(build, query()))
    expect(out).not.toContain('C+D→F@2')
    expect(out).toContain('A+B→I@3')
    // at overpay, A+D→F and C+D→E are padding over A→F and C→E
    const wide = shapes(suggestTrades(build, query({ stance: 'overpay' })))
    expect(wide).not.toContain('A+D→F@2')
    expect(wide).not.toContain('C+D→E@2')
  })

  it('restricts the scan to one partner', () => {
    expect(shapes(suggestTrades(build, query({ partnerRosterId: 2 })))).toEqual(['C→F@2'])
    expect(shapes(suggestTrades(build, query({ partnerRosterId: 3 })))).toEqual(['A+B→I@3'])
    expect(suggestTrades(build, query({ partnerRosterId: 9 }))).toEqual([])
  })

  it('honours the focus: a player I give, a position I want', () => {
    expect(shapes(suggestTrades(build, query({ focus: { give: 'C' } })))).toEqual(['C→F@2'])
    expect(shapes(suggestTrades(build, query({ focus: { give: 'A' } })))).toEqual(['A+B→I@3'])
    // C→F is outside the focus, so C+D→F is not dominated by it
    expect(shapes(suggestTrades(build, query({ focus: { give: 'D' } })))).toEqual(['C+D→F@2'])
    expect(suggestTrades(build, query({ focus: { give: 'nobody' } }))).toEqual([])
    expect(suggestTrades(build, query({ focus: { want: 'RB' } }))).toEqual([])
    expect(shapes(suggestTrades(build, query({ focus: { want: 'WR' } })))).toEqual([
      'A+B→I@3',
      'C→F@2'
    ])
  })

  it('caps the list', () => {
    expect(shapes(suggestTrades(build, query({ stance: 'overpay' }), { max: 3 }))).toEqual([
      'A+B→I@3',
      'C→F@2',
      'C→E@2'
    ])
  })

  it('fails the ratio when what I get is unvalued', () => {
    const unvalued = syntheticBuild({
      ...SMALL_LEAGUE,
      teams: SMALL_LEAGUE.teams.map((t) => ({
        ...t,
        players: t.players.map((p) => (p.id === 'I' ? { ...p, market: null } : p))
      }))
    })
    expect(shapes(suggestTrades(unvalued.build, query({ stance: 'overpay' })))).toEqual([
      'C→F@2',
      'C→E@2',
      'A→F@2'
    ])
  })

  it('throws NO_ME and NO_PROJECTIONS like the evaluator', () => {
    const nobody = syntheticBuild({
      ...SMALL_LEAGUE,
      teams: SMALL_LEAGUE.teams.map((t) => ({ ...t, isMe: false }))
    })
    expect(codeOf(() => suggestTrades(nobody.build, query()))).toBe('NO_ME')
    const blind = syntheticBuild({ ...SMALL_LEAGUE, weeks: [] })
    expect(codeOf(() => suggestTrades(blind.build, query()))).toBe('NO_PROJECTIONS')
  })
})
