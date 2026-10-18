import { describe, expect, it } from 'vitest'
import { fitAdjusted, recencyWeight, type EpaCell } from '@main/stats/models/adjusted'

const TEAMS = ['A', 'B', 'C', 'D']
/** Every offense against every defense, at home and away, with EPA/play = 0.05 + off + def ± home. */
function league(
  off: Record<string, number>,
  def: Record<string, number>,
  home: number,
  plays = 1000
): EpaCell[] {
  const cells: EpaCell[] = []
  for (const o of TEAMS) {
    for (const d of TEAMS) {
      if (o === d) continue
      for (const h of [1, -1]) {
        cells.push({
          off: o,
          def: d,
          home: h,
          week: 1,
          plays,
          epa: plays * (0.05 + off[o] + def[d] + home * h)
        })
      }
    }
  }
  return cells
}

describe('opponent-adjusted EPA (stats-analysis spec §8.2)', () => {
  it('separates offense, defense and home field', () => {
    const off = { A: 0.1, B: 0, C: -0.05, D: -0.05 }
    const def = { A: -0.08, B: 0.02, C: 0.03, D: 0.03 }
    const fit = fitAdjusted(league(off, def, 0.02), TEAMS, { lambda: 1e-6 })
    expect(fit.home).toBeCloseTo(0.02, 6)
    // Effects are identified up to the mean: compare differences.
    expect(fit.off.get('A')! - fit.off.get('B')!).toBeCloseTo(0.1, 6)
    expect(fit.def.get('C')! - fit.def.get('A')!).toBeCloseTo(0.11, 6)
    expect(fit.mean + fit.off.get('A')! + fit.def.get('B')!).toBeCloseTo(0.05 + 0.1 + 0.02, 6)
  })

  it('credits a defense for the offenses it faced', () => {
    // B's defense allows 0.10 only because it faced A's great offense; C allows 0.05 to D's.
    const cells: EpaCell[] = [
      { off: 'A', def: 'B', home: 0, week: 1, plays: 500, epa: 50 },
      { off: 'A', def: 'C', home: 0, week: 1, plays: 500, epa: 100 },
      { off: 'D', def: 'B', home: 0, week: 1, plays: 500, epa: -25 },
      { off: 'D', def: 'C', home: 0, week: 1, plays: 500, epa: 25 }
    ]
    const fit = fitAdjusted(cells, TEAMS, { lambda: 1e-6 })
    expect(fit.def.get('B')!).toBeLessThan(fit.def.get('C')!)
  })

  it('shrinks a team with few plays toward the mean', () => {
    const cells: EpaCell[] = [{ off: 'A', def: 'B', home: 0, week: 1, plays: 20, epa: 10 }]
    const strong = fitAdjusted(cells, TEAMS, { lambda: 1e-6 })
    const ridge = fitAdjusted(cells, TEAMS, { lambda: 300 })
    expect(Math.abs(ridge.off.get('A')!)).toBeLessThan(Math.abs(strong.off.get('A')!))
    expect(ridge.off.get('C')).toBe(0)
  })

  it('halves a week every four weeks back', () => {
    expect(recencyWeight(9)(9)).toBe(1)
    expect(recencyWeight(9)(5)).toBe(0.5)
    expect(recencyWeight(9)(1)).toBe(0.25)
  })
})
