import { describe, expect, it } from 'vitest'
import { teamWeek, windowWeeks } from '@main/lineup/build'
import { rosterSize } from '@main/trade/evaluate'
import {
  acceptanceOf,
  DOMINANCE_PTS,
  passesStance,
  STANCES,
  SUGGEST_MAX
} from '@main/trade/suggest'
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
