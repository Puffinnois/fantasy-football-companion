import { describe, expect, it } from 'vitest'
import { PlayIndex } from '@main/warehouse/playIndex'
import { dropback, LB, play, playIndex, QB, RB, run, WR } from '../../fixtures/pbp'

const GAME = '2025_01_DAL_PHI'

describe('PlayIndex (spec §6.1)', () => {
  it('finds a play by game and play id, with its week, teams and figures', () => {
    const index = playIndex([
      dropback({ complete_pass: 1, receiving_yards: 12, epa: 0.8, qb_epa: 0.9 })
    ])
    expect(index.size).toBe(1)
    expect(index.get(GAME, 1)).toEqual({
      season: 2025,
      seasonType: 'REG',
      week: 1,
      home: 'PHI',
      away: 'DAL',
      posteam: 'PHI',
      defteam: 'DAL',
      snap: true,
      scrimmage: true,
      passerId: QB,
      rusherId: null,
      receiverId: WR,
      epa: 0.8,
      qbEpa: 0.9,
      receivingYards: 12,
      complete: true
    })
    expect(index.get(GAME, 2)).toBeUndefined()
    expect(index.get('2025_01_KC_LAC', 1)).toBeUndefined()
  })

  it('sets a role only where the pbp families count the play', () => {
    const index = playIndex([
      run(),
      dropback({ sack: 1, receiver_player_id: '' }),
      run({ play_type: 'no_play' }),
      dropback({ two_point_attempt: 1 }),
      { play_type: 'qb_kneel', qb_kneel: 1, rusher_player_id: QB },
      { play_type: 'kickoff', kickoff_attempt: 1, kicker_player_id: LB }
    ])
    const roles = [1, 2, 3, 4, 5, 6].map((id) => {
      const p = index.get(GAME, id)
      return [p?.snap, p?.scrimmage, p?.passerId, p?.rusherId, p?.receiverId]
    })
    expect(roles).toEqual([
      [true, true, null, RB, null],
      [true, true, QB, null, null],
      [true, false, null, null, null],
      [true, false, null, null, null],
      [true, false, null, null, null],
      [false, false, null, null, null]
    ])
  })

  it('leaves out a play without a play id', () => {
    const index = new PlayIndex()
    index.add(play(run()))
    expect(index.size).toBe(0)
  })
})
