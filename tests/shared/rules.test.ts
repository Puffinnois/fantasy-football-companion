import { describe, expect, it } from 'vitest'
import { scoringFormat, type Rules } from '@shared/rules'
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
