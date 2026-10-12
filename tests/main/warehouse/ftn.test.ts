import { describe, expect, it } from 'vitest'
import { headerOf } from '@main/sources/warehouse/parse'
import { aggregatePbp } from '@main/warehouse/aggregate'
import { aggregateFtn, FTN_COLUMNS } from '@main/warehouse/ftn'
import { PlayIndex } from '@main/warehouse/playIndex'
import { captured } from '../../fixtures/warehouse'
import { dropback, ftnCsv, playIndex, QB, RB, run, WR, type PbpRow } from '../../fixtures/pbp'

const T = 'TRUE'

/** FTN rows joined to `plays`; FTN row i charts play i + 1 unless it sets `nflverse_play_id`. */
function ftn(plays: PbpRow[], charts: PbpRow[]): ReturnType<typeof aggregateFtn> {
  const rows = charts.map((c, i) => ({ nflverse_play_id: i + 1, ...c }))
  return aggregateFtn(ftnCsv(rows), playIndex(plays))
}

const dataOf = (out: ReturnType<typeof aggregateFtn>, id: string): unknown =>
  out.playerWeeks.find((r) => r.playerKey === id)?.data

describe('aggregateFtn (spec §6.4)', () => {
  it('passer: play action, blitzes, RPOs, screens, pocket, throws and reads', () => {
    const out = ftn(
      [
        dropback({ complete_pass: 1, qb_epa: 0.5 }),
        dropback({ qb_epa: -0.25 }),
        dropback({ sack: 1, receiver_player_id: '', qb_epa: -2 }),
        dropback({ receiver_player_id: '', qb_epa: -0.5 })
      ],
      [
        { is_play_action: T, n_blitzers: 2, read_thrown: '1', is_qb_out_of_pocket: T },
        { is_rpo: T, is_screen_pass: T, read_thrown: ' CHK', is_interception_worthy: T },
        { is_qb_fault_sack: T, read_thrown: '0' },
        { is_throw_away: T }
      ]
    )
    expect(dataOf(out, QB)).toEqual({
      pass_pa_dropbacks: 1,
      pass_pa_epa_sum: 0.5,
      pass_blitz_dropbacks: 1,
      pass_blitz_epa_sum: 0.5,
      pass_rpo: 1,
      pass_screens: 1,
      pass_out_of_pocket: 1,
      pass_int_worthy: 1,
      pass_throwaways: 1,
      pass_qb_fault_sacks: 1,
      pass_read: { '1': 1, CHK: 1 }
    })
  })

  it('receiver: catchable, contested, created, drops and screen targets', () => {
    const out = ftn(
      [dropback({ complete_pass: 1 }), dropback()],
      [
        { is_catchable_ball: T, is_contested_ball: T, is_created_reception: T },
        { is_catchable_ball: T, is_contested_ball: T, is_drop: T, is_screen_pass: T }
      ]
    )
    expect(dataOf(out, WR)).toEqual({
      rec_catchable: 2,
      rec_contested: 2,
      rec_contested_catches: 1,
      rec_created: 1,
      rec_drops: 1,
      rec_screen_tgt: 1
    })
  })

  it('rusher: box counts, 8-man boxes, RPO carries and QB sneaks', () => {
    const out = ftn(
      [run(), run(), run(), run({ rusher_player_id: QB })],
      [
        { n_defense_box: 8, is_rpo: T },
        { n_defense_box: 6 },
        { n_defense_box: 0 },
        { n_defense_box: 9, is_qb_sneak: T }
      ]
    )
    expect(dataOf(out, RB)).toEqual({
      rush_box_sum: 14,
      rush_box_n: 2,
      rush_box_8p: 1,
      rush_rpo: 1
    })
    expect(dataOf(out, QB)).toEqual({
      rush_box_sum: 9,
      rush_box_n: 1,
      rush_box_8p: 1,
      rush_qb_sneaks: 1
    })
  })

  it('team: every count as off_* for the offense and def_* for the defense', () => {
    const out = ftn(
      [dropback(), run({ posteam: 'DAL', defteam: 'PHI' })],
      [
        {
          is_motion: T,
          is_play_action: T,
          is_no_huddle: T,
          n_blitzers: 1,
          n_pass_rushers: 5,
          n_defense_box: 6
        },
        { is_trick_play: T, is_motion: T, n_defense_box: 7, n_blitzers: 1, n_pass_rushers: 0 }
      ]
    )
    expect(out.teamWeeks.map((r) => [r.team, r.data])).toEqual([
      [
        'PHI',
        {
          off_motion: 1,
          off_play_action: 1,
          off_no_huddle: 1,
          off_box_sum: 6,
          off_box_n: 1,
          off_blitzes: 1,
          off_rushers_sum: 5,
          off_rushers_n: 1,
          def_motion: 1,
          def_trick_plays: 1,
          def_box_sum: 7,
          def_box_n: 1
        }
      ],
      [
        'DAL',
        {
          def_motion: 1,
          def_play_action: 1,
          def_no_huddle: 1,
          def_box_sum: 6,
          def_box_n: 1,
          def_blitzes: 1,
          def_rushers_sum: 5,
          def_rushers_n: 1,
          off_motion: 1,
          off_trick_plays: 1,
          off_box_sum: 7,
          off_box_n: 1
        }
      ]
    ])
  })

  it('counts only plays the pbp families count; misses and keyless rows are counted', () => {
    const out = ftn(
      [
        run({ play_type: 'no_play' }),
        dropback({ two_point_attempt: 1 }),
        { play_type: 'kickoff', kickoff_attempt: 1 }
      ],
      [
        { is_motion: T, n_defense_box: 7 },
        { is_play_action: T },
        { is_motion: T },
        { nflverse_play_id: 99, is_motion: T },
        { nflverse_play_id: '', is_motion: T }
      ]
    )
    expect(out).toEqual({ playerWeeks: [], teamWeeks: [], skipped: 1, unmatched: 1 })
  })

  it('fails on a missing column and accepts a header-only file', () => {
    const header = FTN_COLUMNS.filter((c) => c !== 'is_drop').join(',')
    expect(() => aggregateFtn(`${header}\n`, playIndex([]))).toThrow(
      'ftn: column "is_drop" is missing'
    )
    expect(aggregateFtn(ftnCsv([]), playIndex([]))).toEqual({
      playerWeeks: [],
      teamWeeks: [],
      skipped: 0,
      unmatched: 0
    })
  })

  it('reads only columns the real file has', () => {
    const header = new Set(headerOf(captured('ftn_2025_game.csv')))
    expect(FTN_COLUMNS.filter((c) => !header.has(c))).toEqual([])
  })

  it('joins every charted play of a real game', () => {
    const index = new PlayIndex()
    aggregatePbp(captured('pbp_2025_game.csv'), index)
    const out = aggregateFtn(captured('ftn_2025_game.csv'), index)
    expect(out).toMatchObject({ skipped: 0, unmatched: 0 })
    const lamb = out.playerWeeks.find((r) => r.playerKey === '00-0036358')
    expect(lamb?.data).toEqual({ rec_catchable: 11, rec_drops: 4, rec_contested: 1 })
    const phi = out.teamWeeks.find((r) => r.team === 'PHI')?.data
    const hurts = out.playerWeeks.find((r) => r.playerKey === QB)?.data
    expect(phi?.off_play_action).toBe(hurts?.pass_pa_dropbacks)
  })
})
