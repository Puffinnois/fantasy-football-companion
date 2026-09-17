import { describe, expect, it } from 'vitest'
import { kickoffIso } from '@shared/time'

describe('kickoffIso', () => {
  it('interprets gameday + gametime as Eastern time (EDT and EST)', () => {
    expect(kickoffIso('2026-09-17', '20:15')).toBe('2026-09-18T00:15:00.000Z')
    expect(kickoffIso('2026-12-06', '13:00')).toBe('2026-12-06T18:00:00.000Z')
  })
  it('returns null without a time or with junk', () => {
    expect(kickoffIso('2026-09-17', null)).toBeNull()
    expect(kickoffIso(null, '13:00')).toBeNull()
    expect(kickoffIso('2026-09-17', 'TBD')).toBeNull()
  })
})
