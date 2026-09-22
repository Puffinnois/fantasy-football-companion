import { describe, expect, it } from 'vitest'
import {
  acceptanceOf,
  DOMINANCE_PTS,
  passesStance,
  STANCES,
  SUGGEST_MAX
} from '@main/trade/suggest'

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
