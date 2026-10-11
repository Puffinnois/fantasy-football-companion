import { describe, expect, it } from 'vitest'
import { Bag } from '@main/warehouse/bag'

describe('Bag', () => {
  it('sums, counts, keeps maxima and tallies; drops zeros and empty columns', () => {
    const b = new Bag()
    b.add('plays')
    b.add('plays')
    b.add('epa_sum', 0.1)
    b.add('epa_sum', 0.2)
    b.add('epa_sum', null)
    b.add('nothing', 0)
    b.addIf('stuffs', false)
    b.addIf('shotgun', true)
    b.max('long', -3)
    b.max('long', 12)
    b.max('long', 7)
    b.max('long_none', null)
    b.tally('types', 'False Start')
    b.tally('types', 'False Start')
    b.tally('types', null)
    expect(b.data('off_')).toEqual({
      off_plays: 2,
      off_epa_sum: 0.3,
      off_shotgun: 1,
      off_long: 12,
      off_types: { 'False Start': 2 }
    })
  })

  it('rounds sums to 4 decimals and drops what rounds to zero', () => {
    const b = new Bag()
    b.add('a', 1.234567)
    b.add('b', 0.00001)
    b.add('c', -0.00001)
    expect(b.data()).toEqual({ a: 1.2346 })
  })
})
