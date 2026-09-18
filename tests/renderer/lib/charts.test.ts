import { describe, expect, it } from 'vitest'
import { barPath, barsLayout, sparklinePoints } from '@/lib/charts'

describe('barsLayout', () => {
  it('lays equal bands with a 2px gap, bars from the baseline, markers on the same scale', () => {
    const { bars, max } = barsLayout(
      [
        { label: '1', value: 10, marker: 8 },
        { label: '2', value: null, marker: 20 }
      ],
      48,
      40
    )
    expect(max).toBe(20)
    expect(bars[0]).toMatchObject({ x: 1, width: 22, y: 20, height: 20, markerY: 24 })
    expect(bars[1]).toMatchObject({ x: 25, width: 22, y: 40, height: 0, markerY: 0 })
  })

  it('never divides by zero: no items, all-zero values', () => {
    expect(barsLayout([], 48, 40).bars).toEqual([])
    expect(barsLayout([{ label: '1', value: 0, marker: null }], 24, 40).bars[0]).toMatchObject({
      height: 0,
      y: 40,
      markerY: null
    })
  })
})

describe('barPath', () => {
  it('rounds the data end only, square at the baseline, and caps the radius on tiny bars', () => {
    expect(barPath(0, 10, 20, 30)).toBe('M0,40 V14 Q0,10 4,10 H16 Q20,10 20,14 V40 Z')
    expect(barPath(0, 38, 20, 2)).toBe('M0,40 V40 Q0,38 2,38 H18 Q20,38 20,40 V40 Z')
    expect(barPath(0, 40, 20, 0)).toBe('')
  })
})

describe('sparklinePoints', () => {
  it('scales min..max into the padded box and breaks the line at nulls', () => {
    expect(sparklinePoints([0, null, 10, 5], 38, 28)).toEqual([
      [{ x: 4, y: 24 }],
      [
        { x: 24, y: 4 },
        { x: 34, y: 14 }
      ]
    ])
  })

  it('is empty without values and sits mid-height for a constant series', () => {
    expect(sparklinePoints([null, null], 38, 28)).toEqual([])
    expect(sparklinePoints([3, 3], 38, 28)).toEqual([
      [
        { x: 4, y: 14 },
        { x: 34, y: 14 }
      ]
    ])
    expect(sparklinePoints([3], 38, 28)).toEqual([[{ x: 4, y: 14 }]])
  })
})
