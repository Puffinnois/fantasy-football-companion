import { describe, expect, it } from 'vitest'
import {
  closeCallTitle,
  isNewStarter,
  rowDelta,
  swapLine,
  benchFor,
  matchupTone,
  pointsLeft,
  scoreboard,
  shortName,
  shownStarters
} from '@/lib/lineupView'
import { lineupPlayer, lineupWeek, slotEntry, teamLineup } from '../../fixtures/lineup'

describe('lineupView', () => {
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

  it('writes swap lines', () => {
    const a = lineupPlayer({ playerId: 'a', fullName: 'A. Adams', value: 12.1 })
    const b = lineupPlayer({ playerId: 'b', fullName: 'B. Brown', value: 9 })
    expect(swapLine({ slot: 'FLEX', out: b, in: a, delta: 3.1 })).toBe(
      'Start A. Adams over B. Brown (FLEX, +3.10)'
    )
    expect(swapLine({ slot: 'WR', out: null, in: a, delta: 12.1 })).toBe(
      'Start A. Adams (WR, +12.10)'
    )
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

describe('Edition lineup helpers', () => {
  const rb1 = lineupPlayer({ playerId: 'rb1', value: 18 })
  const rb2 = lineupPlayer({ playerId: 'rb2', value: 11, ceiling: 20 })
  const rb3 = lineupPlayer({ playerId: 'rb3', value: 10 })
  const hurt = lineupPlayer({ playerId: 'rb4', value: 0, flag: 'out' })
  const me = teamLineup({
    optimal: [slotEntry('RB', rb1), slotEntry('RB', rb2)],
    optimalTotal: 29,
    current: [slotEntry('RB', rb1), slotEntry('RB', hurt)],
    currentTotal: 18,
    bench: [rb3],
    unavailable: [hurt],
    swaps: [{ slot: 'RB', out: hurt, in: rb2, delta: 11 }]
  })

  it('shows the set lineup until swaps are applied, then the optimal one', () => {
    expect(shownStarters(me, false)[1].player?.playerId).toBe('rb4')
    expect(shownStarters(me, true)[1].player?.playerId).toBe('rb2')
    expect(shownStarters({ ...me, current: null }, false)[1].player?.playerId).toBe('rb2')
  })

  it('benches everyone startable off the display, best first, without the unavailable', () => {
    expect(benchFor(me, shownStarters(me, false)).map((p) => p.playerId)).toEqual(['rb2', 'rb3'])
    expect(benchFor(me, shownStarters(me, true)).map((p) => p.playerId)).toEqual(['rb3'])
    expect(pointsLeft(me)).toBe(11)
    expect(pointsLeft({ ...me, currentTotal: null })).toBe(0)
  })

  it('tones matchups and abbreviates close calls', () => {
    expect(matchupTone(lineupPlayer({ playerId: 'a', dvpRank: 5 }))).toBe('bad')
    expect(matchupTone(lineupPlayer({ playerId: 'a', dvpRank: 22 }))).toBe('good')
    expect(matchupTone(lineupPlayer({ playerId: 'a', dvpRank: null }))).toBe('neutral')
    expect(matchupTone(lineupPlayer({ playerId: 'a', opponent: null }))).toBe('dashed')
    expect(shortName('Rico Dowdle')).toBe('R. Dowdle')
    expect(shortName('Bills')).toBe('Bills')
  })

  it('scores the matchup: current or applied totals, finals, no opponent', () => {
    const w = lineupWeek({ me, opponent: teamLineup({ isMe: false, currentTotal: 20 }) })
    expect(scoreboard(w, false)).toEqual({
      mine: 18,
      theirs: 20,
      edge: 'Behind by 2.0',
      tone: 'bad'
    })
    expect(scoreboard(w, true)?.edge).toBe('Ahead by 9.0')
    const fin = lineupWeek({
      status: 'final',
      me: { ...me, actualTotal: 25 },
      opponent: teamLineup({ isMe: false, actualTotal: 25 })
    })
    expect(scoreboard(fin, false)?.edge).toBe('Dead even')
    expect(scoreboard(lineupWeek({ opponent: null }), false)?.edge).toBe('No opponent')
    expect(scoreboard(lineupWeek({ me: null }), false)).toBeNull()
  })
})
