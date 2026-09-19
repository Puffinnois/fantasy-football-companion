import { describe, expect, it } from 'vitest'
import { NEWS_PAGE_SIZE, newsAge, sourceBadge } from '@/lib/newsView'

describe('sourceBadge', () => {
  it('abbreviates the three known outlets and passes others through', () => {
    expect(sourceBadge('fantasy_pros')).toBe('FP')
    expect(sourceBadge('rotowire')).toBe('RW')
    expect(sourceBadge('rotoballer')).toBe('RB')
    expect(sourceBadge('espn')).toBe('espn')
  })
})

describe('newsAge', () => {
  const now = Date.UTC(2026, 8, 18, 12, 0, 0)
  const ago = (ms: number): string => new Date(now - ms).toISOString()

  it('says "now" under a minute and minutes under an hour', () => {
    expect(newsAge(ago(10_000), now)).toBe('now')
    expect(newsAge(ago(5 * 60_000), now)).toBe('5m')
    expect(newsAge(ago(59 * 60_000), now)).toBe('59m')
  })

  it('uses hours under a day and days under a week', () => {
    expect(newsAge(ago(60 * 60_000), now)).toBe('1h')
    expect(newsAge(ago(23.9 * 3_600_000), now)).toBe('23h')
    expect(newsAge(ago(24 * 3_600_000), now)).toBe('1d')
    expect(newsAge(ago(6.9 * 86_400_000), now)).toBe('6d')
  })

  it('falls back to a short date after a week, adding the year when it differs', () => {
    // Local-time rendering: a ±14 h zone may move the day by one.
    expect(newsAge(ago(7 * 86_400_000), now)).toMatch(/^Sep 1[012]$/)
    expect(newsAge('2025-12-25T12:00:00.000Z', now)).toMatch(/^Dec 2[456], 2025$/)
  })

  it('is empty for an unparseable timestamp and never negative for a future one', () => {
    expect(newsAge('nope', now)).toBe('')
    expect(newsAge(new Date(now + 60_000).toISOString(), now)).toBe('now')
  })

  it('pages eight items', () => {
    expect(NEWS_PAGE_SIZE).toBe(8)
  })
})
