import { describe, expect, it } from 'vitest'
import {
  offensiveYards,
  PLAYER_STAT_MAP,
  playerStatLine,
  TEAM_STAT_MAP,
  teamStatLine
} from '@main/scoring/adapters'
import { DERIVED_STATS } from '@main/scoring/engine'
import { STAT_KEYS } from '@shared/statKeys'

describe('playerStatLine', () => {
  it('maps offense, sums multi-column keys, derives incompletions, stays sparse', () => {
    const line = playerStatLine({
      completions: 20,
      attempts: 30,
      passing_yards: 250,
      passing_tds: 2,
      passing_interceptions: 1,
      sacks_suffered: 3,
      carries: 4,
      rushing_yards: 22,
      sack_fumbles: 1,
      rushing_fumbles: 1,
      receiving_fumbles: 0,
      sack_fumbles_lost: 1,
      rushing_fumbles_lost: 0,
      receiving_fumbles_lost: 0,
      fumble_recovery_own: 1,
      fumble_recovery_opp: 0
    })
    expect(line).toEqual({
      pass_cmp: 20,
      pass_att: 30,
      pass_inc: 10,
      pass_yd: 250,
      pass_td: 2,
      pass_int: 1,
      pass_sack: 3,
      rush_att: 4,
      rush_yd: 22,
      fum: 2,
      fum_lost: 1,
      fum_rec: 1,
      idp_fum_rec: 0 // fumble_recovery_opp feeds both keys
    })
  })

  it('maps kicking buckets including the 50+ roll-ups and blocked kicks as misses', () => {
    const line = playerStatLine({
      pat_made: 3,
      pat_missed: 0,
      pat_blocked: 1,
      fg_made: 3,
      fg_missed: 1,
      fg_blocked: 1,
      fg_made_40_49: 1,
      fg_made_50_59: 1,
      fg_made_60_: 1,
      fg_missed_50_59: 1,
      fg_missed_60_: 0,
      fg_made_distance: 155
    })
    expect(line).toMatchObject({
      xpm: 3,
      xpmiss: 1,
      fgm: 3,
      fgmiss: 2,
      fgm_40_49: 1,
      fgm_50_59: 1,
      fgm_60p: 1,
      fgm_50p: 2,
      fgmiss_50p: 1,
      fgm_yds: 155
    })
    expect(line).not.toHaveProperty('fgm_0_19')
  })

  it('maps IDP columns', () => {
    const line = playerStatLine({
      def_tackles_solo: 5,
      def_tackles_with_assist: 2,
      def_tackle_assists: 3,
      def_sacks: 1.5,
      def_punt_blocks: 1,
      def_fg_blocks: 0
    })
    expect(line).toMatchObject({
      idp_tkl: 7,
      idp_tkl_solo: 5,
      idp_tkl_ast: 3,
      idp_sack: 1.5,
      idp_blk_kick: 1
    })
    expect(line).not.toHaveProperty('sack') // team-DEF keys never come from a player row
  })
})

describe('teamStatLine', () => {
  it('maps the team row plus points/yards allowed from context', () => {
    const line = teamStatLine(
      {
        def_sacks: 4,
        def_interceptions: 2,
        def_fumbles_forced: 1,
        fumble_recovery_opp: 1,
        def_tds: 1,
        special_teams_tds: 0,
        def_pat_blocks: 1,
        def_2pt_made: 0,
        def_pass_defended: 5,
        def_safeties: 0
      },
      { pointsAllowed: 9, yardsAllowed: 280 }
    )
    expect(line).toEqual({
      sack: 4,
      int: 2,
      ff: 1,
      fum_rec: 1,
      safe: 0,
      blk_kick: 1,
      def_td: 1,
      def_st_td: 0,
      def_2pt: 0,
      def_pass_def: 5,
      pts_allow: 9,
      yds_allow: 280
    })
  })

  it('omits pts/yds allowed when unknown', () => {
    const line = teamStatLine({ def_sacks: 1 }, { pointsAllowed: null, yardsAllowed: null })
    expect(line).toEqual({ sack: 1 })
  })

  it('offensiveYards = rushing + passing - sack yards', () => {
    expect(offensiveYards({ rushing_yards: 120, passing_yards: 180, sack_yards_lost: 5 })).toBe(295)
    expect(offensiveYards({})).toBe(0)
  })
})

describe('adapter contract with the stat-key catalogue', () => {
  it('emits every supported, non-derived catalogue key from a full row', () => {
    const one = (cols: string[]): Record<string, number> =>
      Object.fromEntries(cols.map((c) => [c, 1]))
    const playerRow = one([...Object.values(PLAYER_STAT_MAP).flat(), 'attempts', 'completions'])
    const teamRow = one(Object.values(TEAM_STAT_MAP).flat())
    const emitted = new Set([
      ...Object.keys(playerStatLine(playerRow)),
      ...Object.keys(teamStatLine(teamRow, { pointsAllowed: 0, yardsAllowed: 0 }))
    ])
    const expected = STAT_KEYS.filter((k) => k.supported && !(k.key in DERIVED_STATS)).map(
      (k) => k.key
    )
    const missing = expected.filter((k) => !emitted.has(k))
    expect(missing).toEqual([])
  })

  it('never emits a key the catalogue marks unsupported', () => {
    const unsupported = new Set(STAT_KEYS.filter((k) => !k.supported).map((k) => k.key))
    for (const key of [
      ...Object.keys(PLAYER_STAT_MAP),
      ...Object.keys(TEAM_STAT_MAP),
      'pass_inc'
    ]) {
      expect(unsupported.has(key), key).toBe(false)
    }
  })
})
