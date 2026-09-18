import { describe, expect, it } from 'vitest'
import {
  rosterRelative,
  UNSTARTABLE_SLOTS,
  type RosterInput,
  type RosterRelative
} from '@main/value/roster'
import type { RosterSlot } from '@shared/types'

const player = (
  playerId: string,
  position: string | null,
  rosValue: number | null,
  owner: 'me' | 'other' | 'fa' = 'fa',
  rosterSlot: RosterSlot | null = owner === 'fa' ? null : 'starter'
): RosterInput => ({
  playerId,
  fullName: playerId,
  position,
  ownerRosterId: owner === 'fa' ? null : owner === 'me' ? 1 : 2,
  ownerIsMe: owner === 'me',
  rosterSlot,
  rosValue
})

const NONE = { vsMine: null, droppable: null }

describe('rosterRelative', () => {
  const players = [
    player('myRb1', 'RB', 12, 'me'),
    player('myRb2', 'RB', 4, 'me', 'bench'),
    player('faRb', 'RB', 9),
    player('faRb2', 'RB', 3),
    player('rivalRb', 'RB', 20, 'other'),
    player('myWr', 'WR', 6, 'me'),
    player('faWr', 'WR', 2),
    player('faK', 'K', 1)
  ]
  const view = rosterRelative(players, true)
  const rel = (id: string): RosterRelative | undefined => view.byPlayer.get(id)

  it('measures every free agent against my lowest-valued startable player at the position', () => {
    expect(rel('faRb')).toEqual({ vsMine: 5, droppable: null }) // 9 − 4 (myRb2, not myRb1)
    expect(rel('faRb2')).toEqual({ vsMine: -1, droppable: null })
    expect(rel('faWr')).toEqual({ vsMine: -4, droppable: null })
    expect(view.baseline.get('RB')).toEqual({ playerId: 'myRb2', fullName: 'myRb2', rosValue: 4 })
    expect(view.baseline.get('WR')).toEqual({ playerId: 'myWr', fullName: 'myWr', rosValue: 6 })
  })

  it('flags each of my players the best free agent beats, with the delta (symmetric with vsMine)', () => {
    expect(rel('myRb2')).toEqual({
      vsMine: null,
      droppable: { playerId: 'faRb', fullName: 'faRb', delta: 5 }
    })
    expect(rel('myRb2')?.droppable?.delta).toBe(rel('faRb')?.vsMine)
    expect(rel('myRb1')).toEqual(NONE) // 12 > 9
    expect(rel('myWr')).toEqual(NONE) // the best WR free agent is worse
  })

  it('leaves players rostered by other teams out on both sides', () => {
    expect(rel('rivalRb')).toEqual(NONE)
    expect(rel('faRb')?.vsMine).toBe(5) // rivalRb's 20 is not my baseline
  })

  it('is null when I roster nobody at the position', () => {
    expect(rel('faK')).toEqual(NONE)
    expect(view.baseline.has('K')).toBe(false)
  })

  it('needs a ROS value on both sides; an equal value is not droppable', () => {
    const v = rosterRelative(
      [
        player('mine', 'RB', 5, 'me'),
        player('mineNoRos', 'RB', null, 'me'),
        player('fa', 'RB', null),
        player('fa2', 'RB', 5)
      ],
      true
    )
    expect(v.byPlayer.get('fa')).toEqual(NONE)
    expect(v.byPlayer.get('fa2')).toEqual({ vsMine: 0, droppable: null })
    expect(v.byPlayer.get('mine')).toEqual(NONE)
    expect(v.byPlayer.get('mineNoRos')).toEqual(NONE)
    expect(v.baseline.get('RB')?.playerId).toBe('mine')
  })

  it('excludes my IR and taxi players from the baseline and never flags them', () => {
    expect([...UNSTARTABLE_SLOTS]).toEqual(['ir', 'taxi'])
    const v = rosterRelative(
      [
        player('ir', 'RB', 1, 'me', 'ir'),
        player('taxi', 'RB', 2, 'me', 'taxi'),
        player('bench', 'RB', 7, 'me', 'bench'),
        player('fa', 'RB', 8)
      ],
      true
    )
    expect(v.byPlayer.get('fa')?.vsMine).toBe(1) // 8 − 7, not 8 − 1
    expect(v.byPlayer.get('ir')).toEqual(NONE)
    expect(v.byPlayer.get('taxi')).toEqual(NONE)
    expect(v.byPlayer.get('bench')?.droppable?.delta).toBe(1)
    // only unstartable players at the position → no baseline
    const only = rosterRelative([player('ir', 'RB', 1, 'me', 'ir'), player('fa', 'RB', 8)], true)
    expect(only.byPlayer.get('fa')).toEqual(NONE)
    expect(only.baseline.size).toBe(0)
  })

  it('is null everywhere without a team flagged as mine', () => {
    const v = rosterRelative(players, false)
    expect(v.byPlayer.size).toBe(players.length)
    expect([...v.byPlayer.values()].every((r) => r.vsMine === null && r.droppable === null)).toBe(
      true
    )
    expect(v.baseline.size).toBe(0)
  })

  it('rounds to two decimals and breaks ties by name', () => {
    const v = rosterRelative(
      [player('b', 'RB', 1.5, 'me'), player('a', 'RB', 1.5, 'me'), player('fa', 'RB', 2.333)],
      true
    )
    expect(v.baseline.get('RB')?.playerId).toBe('a')
    expect(v.byPlayer.get('fa')?.vsMine).toBe(0.83)
    expect(v.byPlayer.get('a')?.droppable?.delta).toBe(0.83)
    expect(v.byPlayer.get('b')?.droppable?.delta).toBe(0.83) // both are beaten
  })

  it('ignores players without a position', () => {
    const v = rosterRelative([player('x', null, 9, 'me'), player('fa', null, 10)], true)
    expect(v.byPlayer.get('fa')).toEqual(NONE)
    expect(v.byPlayer.get('x')).toEqual(NONE)
  })
})
