import { describe, expect, it } from 'vitest'
import { heap } from '@main/trade/heap'

describe('heap', () => {
  it('pops in the order `before` defines', () => {
    const h = heap<number>((a, b) => a < b)
    for (const n of [5, 1, 4, 1, 3, 9, 2]) h.push(n)
    expect(h.size).toBe(7)
    const out: number[] = []
    for (let n = h.pop(); n !== undefined; n = h.pop()) out.push(n)
    expect(out).toEqual([1, 1, 2, 3, 4, 5, 9])
    expect(h.size).toBe(0)
  })

  it('interleaves pushes and pops', () => {
    const h = heap<number>((a, b) => a > b)
    h.push(2)
    h.push(7)
    expect(h.pop()).toBe(7)
    h.push(5)
    h.push(1)
    expect([h.pop(), h.pop(), h.pop(), h.pop()]).toEqual([5, 2, 1, undefined])
  })
})
