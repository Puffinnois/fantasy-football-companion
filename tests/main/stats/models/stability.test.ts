import { describe, expect, it } from 'vitest'
import { rng } from '@main/stats/models/linear'
import { reliabilityOf, stabilityFrom, type StabilityRow } from '@main/stats/models/stability'

/**
 * 200 players over two seasons: a true rate each, seen through binomial-like noise of a given
 * sample per half (each season is two halves).
 */
function players(
  sd: number,
  sample: number,
  seed = 1
): { full: StabilityRow[]; halves: StabilityRow[] } {
  const random = rng(seed)
  const normal = (): number =>
    Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random())
  const full: StabilityRow[] = []
  const halves: StabilityRow[] = []
  for (let i = 0; i < 200; i++) {
    const p = Math.min(0.95, Math.max(0.05, 0.5 + sd * normal()))
    for (const season of [2023, 2024]) {
      const h = [0, 1].map(() => {
        let made = 0
        for (let k = 0; k < sample; k++) made += random() < p ? 1 : 0
        return made / sample
      })
      const id = `p${i}`
      full.push({ id, season, half: null, position: 'WR', v: (h[0] + h[1]) / 2, s: 2 * sample })
      h.forEach((v, half) => halves.push({ id, season, half, position: 'WR', v, s: sample }))
    }
  }
  return { full, halves }
}

describe('metric stability (stats-analysis spec §8.6)', () => {
  it('finds a sticky rate sticky and a noisy one noisy', () => {
    const sticky = players(0.15, 100)
    const noisy = players(0.01, 20)
    const a = stabilityFrom(sticky.full, sticky.halves, 'rate')
    const b = stabilityFrom(noisy.full, noisy.halves, 'rate')
    expect(a.pairs).toBe(200)
    expect(a.yearToYear!).toBeGreaterThan(0.75)
    expect(a.reliability).toBe('high')
    expect(b.yearToYear!).toBeLessThan(0.2)
    expect(b.reliability).toBe('low')
    expect(a.splitHalf!).toBeGreaterThan(b.splitHalf!)
  })

  it('sets the prior where half of a rate is signal', () => {
    // True spread 0.05 and binomial noise √(0.25 / n): half signal at n = 0.25 / 0.0025 = 100.
    const { full, halves } = players(0.05, 100, 3)
    const s = stabilityFrom(full, halves, 'rate')
    expect(s.prior!).toBeGreaterThan(60)
    expect(s.prior!).toBeLessThan(160)
    // A count has no prior, a state no split halves.
    expect(stabilityFrom(full, halves, 'count').prior).toBeNull()
    expect(stabilityFrom(full, null, 'rate')).toMatchObject({ splitHalf: null, prior: null })
  })

  it('reports nothing under thirty pairs', () => {
    const { full, halves } = players(0.15, 100)
    const few = stabilityFrom(full.slice(0, 40), halves.slice(0, 80), 'rate')
    expect(few).toMatchObject({ yearToYear: null, pairs: 20, reliability: null })
  })

  it('grades reliability from the year-to-year r', () => {
    expect([
      reliabilityOf(0.7),
      reliabilityOf(0.4),
      reliabilityOf(0.1),
      reliabilityOf(null)
    ]).toEqual(['high', 'medium', 'low', null])
  })
})
