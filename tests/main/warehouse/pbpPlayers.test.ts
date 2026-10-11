import { describe, expect, it } from 'vitest'
import type { WhPlayerWeek } from '@main/db/repos/warehouse'
import { PlayerWeeks } from '@main/warehouse/pbpPlayers'
import { dropback, LB, play, QB, RB, run, WR, type PbpRow } from '../../fixtures/pbp'

function weeks(rows: PbpRow[]): WhPlayerWeek[] {
  const players = new PlayerWeeks()
  for (const r of rows) players.add(play(r))
  return players.finish()
}

const dataOf = (rows: WhPlayerWeek[], key: string): WhPlayerWeek['data'] | undefined =>
  rows.find((r) => r.playerKey === key)?.data

describe('pbp player-weeks (spec §6.2)', () => {
  it('passer: dropbacks with sacks and scrambles, deep throws, downs', () => {
    const rows = weeks([
      dropback({
        complete_pass: 1,
        air_yards: 25,
        passing_yards: 40,
        receiving_yards: 40,
        yards_after_catch: 15,
        xyac_mean_yardage: 6.5,
        pass_touchdown: 1,
        first_down_pass: 1,
        yardline_100: 40,
        epa: 3.4,
        qb_epa: 3.5,
        air_epa: 2,
        yac_epa: 1.5,
        cpoe: 30,
        wpa: 0.1,
        success: 1
      }),
      dropback({ sack: 1, receiver_player_id: '', down: 3, qb_epa: -2, epa: -2 }),
      {
        ...run({ rusher_player_id: QB, qb_scramble: 1, down: 3, yardline_100: 15 }),
        pass: 1,
        rush: 0,
        qb_dropback: 1,
        passer_id: QB,
        rushing_yards: 12,
        third_down_converted: 1,
        epa: 1.2,
        qb_epa: 1.2,
        success: 1
      }
    ])
    expect(dataOf(rows, QB)).toEqual({
      pass_dropbacks: 3,
      pass_qb_epa_sum: 2.7,
      pass_success_n: 2,
      pass_wpa_sum: 0.1,
      pass_cpoe_sum: 30,
      pass_cpoe_n: 1,
      pass_scrambles: 1,
      pass_scramble_yds: 12,
      pass_early_dropbacks: 1,
      pass_early_epa_sum: 3.5,
      pass_3d_dropbacks: 2,
      pass_3d_conv: 1,
      pass_air_epa_sum: 2,
      pass_yac_epa_sum: 1.5,
      pass_long_cmp: 40,
      pass_deep_att: 1,
      pass_deep_cmp: 1,
      pass_deep_yds: 40,
      pass_deep_td: 1,
      // the scramble is a carry too
      rush_carries: 1,
      rush_epa_sum: 1.2,
      rush_success_n: 1,
      rush_10p: 1,
      rush_long: 12,
      rush_i20: 1
    })
    expect(dataOf(rows, WR)).toEqual({
      rec_targets: 1,
      hvt: 1,
      rec_air_yards_sum: 25,
      rec_epa_sum: 3.4,
      rec_success_n: 1,
      rec_wpa_sum: 0.1,
      rec_deep_tgt: 1,
      rec_xyac_sum: 6.5,
      rec_xyac_n: 1,
      rec_yac_sum: 15,
      rec_long: 40,
      rec_first_downs: 1
    })
  })

  it('rusher: thresholds, red zone, goal to go, location and gap; defenders credited', () => {
    const rows = weeks([
      run({
        yardline_100: 30,
        rushing_yards: 22,
        yards_gained: 22,
        run_location: 'left',
        run_gap: 'end',
        first_down_rush: 1,
        epa: 1.5,
        wpa: 0.05,
        success: 1
      }),
      run({
        yardline_100: 4,
        goal_to_go: 1,
        rushing_yards: -1,
        yards_gained: -1,
        run_location: 'middle',
        epa: -0.8,
        solo_tackle_1_player_id: LB
      }),
      run({
        yardline_100: 2,
        goal_to_go: 1,
        rushing_yards: 2,
        yards_gained: 2,
        rush_touchdown: 1,
        run_location: 'right',
        run_gap: 'guard',
        epa: 1.1,
        success: 1
      })
    ])
    expect(dataOf(rows, RB)).toEqual({
      rush_carries: 3,
      rush_designed: 3,
      rush_epa_sum: 1.8,
      rush_success_n: 2,
      rush_wpa_sum: 0.05,
      rush_stuffs: 1,
      rush_10p: 1,
      rush_15p: 1,
      rush_20p: 1,
      rush_long: 22,
      rush_i20: 2,
      rush_i10: 2,
      rush_i5: 2,
      rush_td_i20: 1,
      rush_td_i10: 1,
      rush_td_i5: 1,
      hvt: 2,
      rush_gtg: 2,
      rush_first_downs: 1,
      rush_left_n: 1,
      rush_left_yds: 22,
      rush_end_n: 1,
      rush_end_yds: 22,
      rush_middle_n: 1,
      rush_middle_yds: -1,
      rush_right_n: 1,
      rush_right_yds: 2,
      rush_guard_n: 1,
      rush_guard_yds: 2
    })
    expect(rows.find((r) => r.playerKey === LB)).toMatchObject({
      team: 'DAL',
      opponent: 'PHI',
      data: { def_stuffs: 1, def_tackle_depth_sum: -1, def_tackle_depth_n: 1 }
    })
    expect(rows.find((r) => r.playerKey === RB)).toMatchObject({ team: 'PHI', opponent: 'DAL' })
  })

  it('receiver: red-zone, end-zone and third-down targets', () => {
    const rows = weeks([dropback({ yardline_100: 8, air_yards: 10, down: 3, epa: -0.5 })])
    expect(dataOf(rows, WR)).toEqual({
      rec_targets: 1,
      hvt: 1,
      rec_air_yards_sum: 10,
      rec_epa_sum: -0.5,
      rec_tgt_i20: 1,
      rec_tgt_i10: 1,
      rec_ez_tgt: 1,
      rec_3d_tgt: 1
    })
    expect(dataOf(rows, QB)).toMatchObject({ pass_att_i20: 1, pass_att_i10: 1, pass_ez_att: 1 })
  })

  it('kickers, punters and returners, each on their own side', () => {
    // nflverse gives kickoffs to the receiving team: PHI receives, DAL kicks.
    const kickoff = (over: PbpRow): PbpRow => ({
      play_type: 'kickoff',
      kickoff_attempt: 1,
      special: 1,
      kicker_player_id: 'DK',
      ...over
    })
    const rows = weeks([
      kickoff({ touchback: 1 }),
      kickoff({ desc: 'B.Aubrey kicks onside 11 yards', own_kickoff_recovery: 1 }),
      kickoff({ kickoff_returner_player_id: 'KR', return_team: 'PHI', return_yards: 30 }),
      kickoff({
        kickoff_returner_player_id: 'KR',
        return_team: 'PHI',
        return_yards: 100,
        return_touchdown: 1,
        td_player_id: 'KR'
      }),
      {
        play_type: 'field_goal',
        field_goal_attempt: 1,
        special: 1,
        kicker_player_id: 'PK',
        epa: 0.9
      },
      {
        play_type: 'punt',
        punt_attempt: 1,
        special: 1,
        punter_player_id: 'PP',
        punt_returner_player_id: 'PR',
        punt_inside_twenty: 1,
        punt_fair_catch: 1,
        epa: -0.3
      }
    ])
    const of = (key: string): Partial<WhPlayerWeek> | undefined => {
      const r = rows.find((x) => x.playerKey === key)
      return r && { team: r.team, data: r.data }
    }
    expect(of('DK')).toEqual({
      team: 'DAL',
      data: { k_kickoffs: 4, k_ko_touchbacks: 1, k_onside_att: 1, k_onside_rec: 1 }
    })
    expect(of('KR')).toEqual({
      team: 'PHI',
      data: { kr_returns: 2, kr_yds: 130, kr_long: 100, kr_td: 1 }
    })
    expect(of('PK')).toEqual({ team: 'PHI', data: { k_epa_sum: 0.9 } })
    expect(of('PP')).toEqual({
      team: 'PHI',
      data: { p_punts: 1, p_epa_sum: -0.3, p_inside_20: 1, p_fair_catches: 1 }
    })
    expect(of('PR')).toEqual({ team: 'DAL', data: { pr_fair_catches: 1 } })
  })

  it('penalties count on wiped-out snaps, which count for nothing else', () => {
    const rows = weeks([
      {
        ...dropback({ complete_pass: 1, receiving_yards: 30 }),
        play_type: 'no_play',
        penalty: 1,
        penalty_player_id: 'OL',
        penalty_team: 'PHI',
        penalty_yards: 10,
        penalty_type: 'Offensive Holding'
      },
      {
        play_type: 'no_play',
        penalty: 1,
        penalty_player_id: 'OL',
        penalty_team: 'PHI',
        penalty_yards: 5,
        penalty_type: 'False Start'
      },
      dropback({ two_point_attempt: 1, down: '' }),
      { play_type: 'qb_kneel', qb_kneel: 1, rusher_player_id: QB },
      { play_type: 'qb_spike', qb_spike: 1, pass_attempt: 1, passer_player_id: QB }
    ])
    expect(rows.find((r) => r.playerKey === 'OL')).toMatchObject({
      team: 'PHI',
      data: { pen_n: 2, pen_yds: 15, pen_types: { 'Offensive Holding': 1, 'False Start': 1 } }
    })
    expect(dataOf(rows, WR)).toBeUndefined()
    expect(dataOf(rows, QB)).toEqual({ pass_kneels: 1, pass_spikes: 1 })
  })
})
