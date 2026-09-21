import { describe, expect, it } from 'vitest'
import { lastFantasyWeek, scoringFormat, type Rules } from '@shared/rules'
import { rules } from '../fixtures/rules'

describe('scoringFormat', () => {
  const withRec = (rec: number): Rules => rules({ scoring: { ...rules().scoring, rec } })

  it('is PPR at 1 point per reception or more, HALF between 0 and 1, STD at 0', () => {
    expect(scoringFormat(withRec(1))).toBe('PPR')
    expect(scoringFormat(withRec(1.5))).toBe('PPR')
    expect(scoringFormat(withRec(0.5))).toBe('HALF')
    expect(scoringFormat(withRec(0.25))).toBe('HALF')
    expect(scoringFormat(withRec(0))).toBe('STD')
  })

  it('is STD without rules or without a rec entry', () => {
    expect(scoringFormat(null)).toBe('STD')
    const scoring = { ...rules().scoring }
    delete scoring.rec
    expect(scoringFormat(rules({ scoring }))).toBe('STD')
  })
})

describe('lastFantasyWeek (slice 6b spec §2.1)', () => {
  const base = { numTeams: 12, waiverType: 'faab' as const }
  it.each([
    ['no playoff settings', {}, 18],
    ['6 teams from week 15, one week per round', { playoffStartWeek: 15, playoffTeams: 6 }, 17],
    ['4 teams from week 15', { playoffStartWeek: 15, playoffTeams: 4 }, 16],
    ['two-week final', { playoffStartWeek: 15, playoffTeams: 4, playoffRoundType: 1 }, 17],
    ['two weeks per round', { playoffStartWeek: 14, playoffTeams: 4, playoffRoundType: 2 }, 17],
    ['capped at 18', { playoffStartWeek: 16, playoffTeams: 6, playoffRoundType: 1 }, 18],
    ['missing playoffTeams means one round', { playoffStartWeek: 16 }, 16],
    ['playoffStartWeek 0 means no playoffs', { playoffStartWeek: 0, playoffTeams: 6 }, 18]
  ])('%s', (_name, settings, expected) => {
    expect(lastFantasyWeek({ ...base, ...settings })).toBe(expected)
  })

  it('is 18 without settings at all', () => {
    expect(lastFantasyWeek(null)).toBe(18)
    expect(lastFantasyWeek(undefined)).toBe(18)
  })
})
