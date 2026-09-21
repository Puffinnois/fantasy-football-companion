import { describe, expect, it } from 'vitest'
import {
  closeCallTitle,
  flagBadge,
  isNewStarter,
  leftOnBench,
  matchupHeader,
  rowDelta,
  swapLine,
  swapsEmptyText,
  WEEKS
} from '@/lib/lineupView'
import { lineupPlayer, lineupWeek, slotEntry, teamLineup } from '../../fixtures/lineup'

describe('lineupView', () => {
  it('lists 18 weeks and maps flags to badges', () => {
    expect(WEEKS).toHaveLength(18)
    expect(flagBadge('out')).toEqual({ text: 'O', tone: 'red' })
    expect(flagBadge('doubtful')).toEqual({ text: 'D', tone: 'red' })
    expect(flagBadge('questionable')).toEqual({ text: 'Q', tone: 'amber' })
    expect(flagBadge('bye')).toEqual({ text: 'BYE', tone: 'muted' })
    expect(flagBadge(null)).toBeNull()
  })

  it('tints only starters who are not in the current lineup, and gives their row delta', () => {
    const a = lineupPlayer({ playerId: 'a', value: 10 })
    const b = lineupPlayer({ playerId: 'b', value: 8 })
    const c = lineupPlayer({ playerId: 'c', value: 12 })
    const current = [slotEntry('RB', b), slotEntry('FLEX', a)]
    expect(isNewStarter(slotEntry('RB', a), current)).toBe(false) // moved, not new
    expect(isNewStarter(slotEntry('RB', c), current)).toBe(true)
    expect(isNewStarter(slotEntry('RB', c), null)).toBe(false)
    expect(isNewStarter(slotEntry('RB', null), current)).toBe(false)
    expect(rowDelta(slotEntry('RB', c), slotEntry('RB', b), current)).toBe(4)
    expect(rowDelta(slotEntry('RB', c), slotEntry('RB', null), current)).toBe(12)
    expect(rowDelta(slotEntry('RB', a), slotEntry('RB', b), current)).toBeNull()
    expect(rowDelta(slotEntry('RB', c), undefined, null)).toBeNull()
  })

  it('formats the header for upcoming, final and matchup-less weeks', () => {
    expect(matchupHeader(lineupWeek())).toEqual({
      mine: 'You 34.60 optimal · 34.60 current',
      theirs: 'Rival 28.70 current',
      result: null,
      note: null
    })
    const unset = lineupWeek({
      me: teamLineup({ current: null, currentTotal: null }),
      opponent: teamLineup({
        isMe: false,
        name: 'Rival',
        current: null,
        currentTotal: null,
        optimalTotal: 30.1
      })
    })
    expect(matchupHeader(unset)).toMatchObject({
      mine: 'You 34.60 optimal',
      theirs: 'Rival 30.10 optimal'
    })
    const final = lineupWeek({
      status: 'final',
      me: teamLineup({ actualTotal: 121.3, optimalTotal: 133.6 }),
      opponent: teamLineup({ isMe: false, name: 'Rival', actualTotal: 98 })
    })
    expect(matchupHeader(final)).toEqual({
      mine: 'You 121.30',
      theirs: 'Rival 98.00',
      result: 'W',
      note: null
    })
    expect(
      matchupHeader(
        lineupWeek({
          status: 'final',
          me: teamLineup({ actualTotal: 90 }),
          opponent: teamLineup({ isMe: false, actualTotal: 90 })
        })
      ).result
    ).toBe('T')
    expect(matchupHeader(lineupWeek({ opponent: null, matchupId: null }))).toMatchObject({
      theirs: null,
      note: 'No matchup this week'
    })
    expect(matchupHeader(lineupWeek({ me: null, opponent: null }))).toEqual({
      mine: '',
      theirs: null,
      result: null,
      note: "Your team isn't identified — re-import from Setup"
    })
    expect(matchupHeader(lineupWeek({ projectionsStored: false })).note).toBe(
      'No projections stored — values are actuals only'
    )
  })

  it('computes points left on the bench for a final week only', () => {
    expect(leftOnBench(teamLineup({ actualTotal: 121.3, optimalTotal: 133.6 }))).toBe(12.3)
    expect(leftOnBench(teamLineup())).toBeNull()
  })

  it('writes swap lines and the empty-state text', () => {
    const a = lineupPlayer({ playerId: 'a', fullName: 'A. Adams', value: 12.1 })
    const b = lineupPlayer({ playerId: 'b', fullName: 'B. Brown', value: 9 })
    expect(swapLine({ slot: 'FLEX', out: b, in: a, delta: 3.1 })).toBe(
      'Start A. Adams over B. Brown (FLEX, +3.10)'
    )
    expect(swapLine({ slot: 'WR', out: null, in: a, delta: 12.1 })).toBe(
      'Start A. Adams (WR, +12.10)'
    )
    expect(swapsEmptyText(teamLineup())).toBe('Your lineup is optimal')
    expect(swapsEmptyText(teamLineup({ current: null }))).toBe('Lineup not set on Sleeper yet')
  })

  it('describes both sides of a close call', () => {
    const starter = lineupPlayer({
      playerId: 'a',
      fullName: 'A. Adams',
      value: 11,
      floor: 5.5,
      ceiling: 17,
      expert: { ecrPosRank: 14, grade: 'B+' },
      opponent: 'DAL',
      dvpRank: 20
    })
    const alt = lineupPlayer({
      playerId: 'b',
      fullName: 'B. Brown',
      position: 'WR',
      value: 9.6,
      floor: null,
      ceiling: null,
      expert: null,
      opponent: null,
      dvpRank: null
    })
    expect(closeCallTitle(starter, alt)).toBe(
      'Close call\nA. Adams: 11.00 · floor 5.50 / ceiling 17.00 · ECR RB14 (B+) · vs DAL (DvP 20)\nB. Brown: 9.60'
    )
  })
})
