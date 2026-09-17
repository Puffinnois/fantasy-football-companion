import { describe, expect, it } from 'vitest'
import { STAT_CATEGORIES, STAT_KEY_INFO, STAT_KEYS, isSupported } from '@shared/statKeys'

describe('stat key catalogue', () => {
  it('has unique keys', () => {
    const keys = STAT_KEYS.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses only declared categories', () => {
    const ids = new Set(STAT_CATEGORIES.map((c) => c.id))
    for (const k of STAT_KEYS) expect(ids.has(k.category), k.key).toBe(true)
  })

  it('reports support', () => {
    expect(STAT_KEY_INFO.get('rec')?.label).toBe('Reception')
    expect(isSupported('rec')).toBe(true)
    expect(isSupported('pass_td_40p')).toBe(false)
    expect(isSupported('totally_unknown')).toBe(false)
  })
})
