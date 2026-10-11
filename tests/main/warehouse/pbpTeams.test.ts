import { describe, expect, it } from 'vitest'
import type { WhData, WhTeamWeek } from '@main/db/repos/warehouse'
import { summarizeDrive, TeamWeeks } from '@main/warehouse/pbpTeams'
import { dropback, play, run, type PbpRow } from '../../fixtures/pbp'

function weeks(rows: PbpRow[]): WhTeamWeek[] {
  const teams = new TeamWeeks()
  for (const r of rows) teams.add(play(r))
  return teams.finish()
}

const dataOf = (rows: WhTeamWeek[], team: string): WhData | undefined =>
  rows.find((r) => r.team === team)?.data

/** DAL with the ball against PHI. */
const dal = (row: PbpRow): PbpRow => ({ ...row, posteam: 'DAL', defteam: 'PHI' })

describe('pbp team-weeks (spec §6.3)', () => {
  it('writes each play to the offense as off_* and to the defense as def_*', () => {
    const rows = weeks([
      dropback({
        complete_pass: 1,
        yards_gained: 25,
        epa: 0.5,
        success: 1,
        shotgun: 1,
        wp: 0.5,
        qtr: 1,
        xpass: 0.6,
        pass_oe: 40
      })
    ])
    const metrics = {
      plays: 1,
      epa_sum: 0.5,
      success_n: 1,
      pass_plays: 1,
      pass_epa_sum: 0.5,
      pass_success_n: 1,
      early_plays: 1,
      early_epa_sum: 0.5,
      explosive_pass: 1,
      xpass_sum: 0.6,
      pass_oe_sum: 40,
      xpass_n: 1,
      neutral_plays: 1,
      neutral_passes: 1,
      shotgun: 1
    }
    const prefixed = (prefix: string): WhData =>
      Object.fromEntries(Object.entries(metrics).map(([k, v]) => [prefix + k, v]))
    expect(rows.find((r) => r.team === 'PHI')).toMatchObject({
      opponent: 'DAL',
      data: prefixed('off_')
    })
    expect(dataOf(rows, 'PHI')).toEqual(prefixed('off_'))
    expect(dataOf(rows, 'DAL')).toEqual(prefixed('def_'))
  })

  it('downs, turnovers, havoc, punts, two-point tries and penalties', () => {
    const rows = weeks([
      run({ down: 3, third_down_converted: 1 }),
      run({ down: 4, fourth_down_failed: 1, tackled_for_loss: 1, yards_gained: -2 }),
      { play_type: 'punt', punt_attempt: 1, special: 1, down: 4 },
      { play_type: 'field_goal', field_goal_attempt: 1, special: 1, down: 4 },
      dropback({ down: 2, interception: 1 }),
      run({ two_point_attempt: 1, two_point_conv_result: 'success', down: '' }),
      { play_type: 'no_play', penalty: 1, penalty_team: 'DAL', penalty_yards: 15 }
    ])
    expect(dataOf(rows, 'PHI')).toEqual({
      off_plays: 3,
      off_rush_plays: 2,
      off_pass_plays: 1,
      off_early_plays: 1,
      off_third_att: 1,
      off_third_conv: 1,
      off_fourth_go: 1,
      off_fourth_failed: 1,
      off_fourth_downs: 3,
      off_punts: 1,
      off_turnovers: 1,
      off_havoc: 2,
      off_two_pt_att: 1,
      off_two_pt_conv: 1,
      off_pen_defense_n: 1,
      off_pen_defense_yds: 15
    })
    expect(dataOf(rows, 'DAL')).toMatchObject({
      def_punts: 1,
      def_fourth_failed: 1,
      def_havoc: 2,
      def_pen_defense_n: 1
    })
  })

  it('pace: seconds between consecutive neutral snaps of one drive', () => {
    const snap = (clock: number, drive: number, wp = 0.5): PbpRow =>
      run({ game_seconds_remaining: clock, fixed_drive: drive, wp, qtr: 1 })
    const rows = weeks([
      snap(3500, 1),
      snap(3470, 1),
      snap(3440, 1),
      snap(3400, 2),
      snap(3380, 2, 0.9),
      snap(3360, 2)
    ])
    expect(dataOf(rows, 'PHI')).toMatchObject({ off_pace_sum: 60, off_pace_n: 2 })
    expect(dataOf(rows, 'DAL')).toMatchObject({ def_pace_sum: 60, def_pace_n: 2 })
  })

  describe('drives', () => {
    const td: PbpRow[] = [
      {
        play_type: 'kickoff',
        kickoff_attempt: 1,
        special: 1,
        yardline_100: 35,
        posteam_score: 0,
        posteam_score_post: 0
      },
      run({ yardline_100: 75, ydsnet: 10, posteam_score: 0, posteam_score_post: 0 }),
      dropback({ yardline_100: 65, ydsnet: 72, posteam_score: 0, posteam_score_post: 0 }),
      run({
        yardline_100: 3,
        goal_to_go: 1,
        ydsnet: 75,
        rush_touchdown: 1,
        posteam_score: 0,
        posteam_score_post: 6
      }),
      {
        play_type: 'extra_point',
        extra_point_attempt: 1,
        special: 1,
        posteam_score: 6,
        posteam_score_post: 7
      }
    ].map((r) => ({
      ...r,
      fixed_drive: 1,
      fixed_drive_result: 'Touchdown',
      drive_time_of_possession: '2:30',
      drive_first_downs: 2,
      drive_ended_with_score: 1
    }))
    const threeAndOut: PbpRow[] = [
      run({ yardline_100: 80, ydsnet: 2 }),
      run({ down: 2, yardline_100: 78, ydsnet: 3 }),
      run({ down: 3, yardline_100: 77, ydsnet: 3 }),
      { play_type: 'punt', punt_attempt: 1, special: 1, down: 4, yardline_100: 77, ydsnet: 3 }
    ].map((r) => ({
      ...dal(r),
      fixed_drive: 2,
      fixed_drive_result: 'Punt',
      drive_time_of_possession: '1:40',
      drive_first_downs: 0,
      drive_ended_with_score: 0
    }))

    it('summarizes a touchdown drive from its own rows', () => {
      expect(summarizeDrive(td.map(play))).toMatchObject({
        team: 'PHI',
        opponent: 'DAL',
        plays: 3,
        yards: 75,
        seconds: 150,
        points: 7,
        threeAndOut: false,
        scored: true,
        turnover: false,
        punt: false,
        redZone: true,
        touchdown: true,
        goalToGo: true
      })
      expect(summarizeDrive(td.map(play))?.first.yardline).toBe(75)
      expect(summarizeDrive(td.slice(0, 1).map(play))).toBeNull()
    })

    it('counts a turnover for a pick six', () => {
      const pick = dropback({
        fixed_drive: 3,
        fixed_drive_result: 'Opp touchdown',
        interception: 1
      })
      expect(summarizeDrive([play(pick)])).toMatchObject({ turnover: true, points: 0 })
    })

    it('adds drives to both teams', () => {
      const rows = weeks([...td, ...threeAndOut])
      expect(dataOf(rows, 'PHI')).toMatchObject({
        off_drives: 1,
        off_drive_plays: 3,
        off_drive_yds: 75,
        off_drive_seconds: 150,
        off_drive_points: 7,
        off_drive_start_sum: 75,
        off_drive_scores: 1,
        off_rz_trips: 1,
        off_rz_tds: 1,
        off_gtg_drives: 1,
        off_gtg_tds: 1,
        def_drives: 1,
        def_three_and_outs: 1,
        def_drive_punts: 1,
        def_drive_start_sum: 80,
        def_drive_seconds: 100
      })
      expect(dataOf(rows, 'DAL')).toMatchObject({
        off_drives: 1,
        off_three_and_outs: 1,
        def_drive_points: 7
      })
    })
  })
})
