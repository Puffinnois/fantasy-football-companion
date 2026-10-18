import { describe, expect, it } from 'vitest'
import { logisticFit, logisticPredict, pearson, rng, solve } from '@main/stats/models/linear'

describe('model linear algebra', () => {
  it('solves a linear system', () => {
    // 2x + y = 5, x + 3y = 10 → x = 1, y = 3.
    const x = solve(Float64Array.from([2, 1, 1, 3]), Float64Array.from([5, 10]), 2)
    expect(x[0]).toBeCloseTo(1, 12)
    expect(x[1]).toBeCloseTo(3, 12)
    expect(() => solve(Float64Array.from([1, 1, 1, 1]), Float64Array.from([1, 2]), 2)).toThrow(
      'singular'
    )
  })

  it('recovers logistic coefficients, and counts weighted rows that many times', () => {
    const random = rng(7)
    const x: number[][] = []
    const y: number[] = []
    for (let i = 0; i < 20_000; i++) {
      const d = random() * 4 - 2
      x.push([1, d])
      y.push(random() < logisticPredict([1, d], [0.5, -1.5]) ? 1 : 0)
    }
    const beta = logisticFit(x, y, { ridge: 0 })
    expect(beta[0]).toBeCloseTo(0.5, 1)
    expect(beta[1]).toBeCloseTo(-1.5, 1)
    // Two copies of a row weigh the same as weight 2.
    const once = logisticFit(
      [
        [1, 0],
        [1, 1],
        [1, 1]
      ],
      [1, 0, 1],
      { ridge: 0.1 }
    )
    const weighted = logisticFit(
      [
        [1, 0],
        [1, 1]
      ],
      [1, 0],
      { ridge: 0.1, weights: [1, 1] }
    )
    expect(weighted).not.toEqual(once)
    const doubled = logisticFit(
      [
        [1, 0],
        [1, 1],
        [1, 1]
      ],
      [1, 1, 0],
      { ridge: 0.1 }
    )
    const asWeight = logisticFit(
      [
        [1, 0],
        [1, 1],
        [1, 1]
      ],
      [1, 1, 0],
      { ridge: 0.1, weights: [1, 1, 1] }
    )
    expect(asWeight[1]).toBeCloseTo(doubled[1], 9)
  })

  it('correlates', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12)
    expect(pearson([1, 2], [1, 2])).toBeNaN()
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNaN()
  })
})
