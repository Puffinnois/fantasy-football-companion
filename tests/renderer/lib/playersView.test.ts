import { describe, expect, it } from 'vitest'
import { formatStat, parseOwner, weekColumns } from '@/lib/playersView'

describe('weekColumns', () => {
  it('picks position-specific nflverse columns', () => {
    expect(weekColumns('QB').map((c) => c.key)).toEqual([
      'completions',
      'attempts',
      'passing_yards',
      'passing_tds',
      'passing_interceptions',
      'carries',
      'rushing_yards',
      'rushing_tds'
    ])
    expect(weekColumns('RB').map((c) => c.key)).toContain('targets')
    expect(weekColumns('TE')).toEqual(weekColumns('WR'))
    expect(weekColumns('WR').find((c) => c.key === 'target_share')?.format).toBe('pct')
    expect(weekColumns('K').map((c) => c.key)).toEqual([
      'fg_made',
      'fg_att',
      'fg_long',
      'pat_made',
      'pat_att'
    ])
    expect(weekColumns('DEF').map((c) => c.key)).toContain('def_sacks')
    expect(weekColumns('LB').map((c) => c.key)).toContain('def_tackles_solo')
    expect(weekColumns(null)).toEqual(weekColumns('LB'))
  })
})

describe('formatStat', () => {
  it('formats missing, integer, fractional and percentage values', () => {
    expect(formatStat(undefined)).toBe('—')
    expect(formatStat(60)).toBe('60')
    expect(formatStat(2.5)).toBe('2.5')
    expect(formatStat(0.234, 'pct')).toBe('23%')
  })
})

describe('parseOwner', () => {
  it('maps the select value to an OwnerFilter', () => {
    expect(parseOwner('all')).toBe('all')
    expect(parseOwner('fa')).toBe('fa')
    expect(parseOwner('3')).toBe(3)
  })
})
