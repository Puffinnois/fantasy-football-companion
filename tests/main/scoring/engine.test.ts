import { describe, expect, it } from 'vitest'
import { DERIVED_STATS, effectiveScoring, scoreStatLine, statValue } from '@main/scoring/engine'
import { STAT_KEY_INFO } from '@shared/statKeys'
import { rules } from '../../fixtures/rules'

describe('scoreStatLine', () => {
  const rbLine = { rec: 7, rec_yd: 87, rec_td: 1, rush_yd: 12, fum_lost: 1 }

  it('scores a PPR line', () => {
    // 7 + 8.7 + 6 + 1.2 - 2
    expect(scoreStatLine(rbLine, rules(), 'RB')).toBe(20.9)
  })

  it('scores a half-PPR line', () => {
    const r = rules({ scoring: { ...rules().scoring, rec: 0.5 } })
    expect(scoreStatLine(rbLine, r, 'RB')).toBe(17.4)
  })

  it('scores a QB line with a 300-yard bonus', () => {
    const r = rules({ scoring: { pass_yd: 0.04, pass_td: 4, pass_int: -1, bonus_pass_yd_300: 2 } })
    // 13 + 8 - 1 + 2
    expect(scoreStatLine({ pass_yd: 325, pass_td: 2, pass_int: 1 }, r, 'QB')).toBe(22)
    expect(scoreStatLine({ pass_yd: 299, pass_td: 2, pass_int: 1 }, r, 'QB')).toBe(18.96)
  })

  it('applies TE premium via bonus_rec_te', () => {
    const r = rules({ scoring: { rec: 1, bonus_rec_te: 0.5 } })
    expect(scoreStatLine({ rec: 6 }, r, 'TE')).toBe(9)
    expect(scoreStatLine({ rec: 6 }, r, 'WR')).toBe(6)
  })

  it('applies TE premium via positionOverrides', () => {
    const r = rules({ scoring: { rec: 1 }, positionOverrides: { TE: { rec: 1.5 } } })
    expect(scoreStatLine({ rec: 6 }, r, 'TE')).toBe(9)
    expect(scoreStatLine({ rec: 6 }, r, 'WR')).toBe(6)
    expect(scoreStatLine({ rec: 6 }, r, null)).toBe(6)
  })

  it('fires yardage bonuses at the threshold', () => {
    const r = rules({ scoring: { rush_yd: 0.1, bonus_rush_yd_100: 3, bonus_rush_rec_yd_100: 1 } })
    expect(scoreStatLine({ rush_yd: 99 }, r, 'RB')).toBe(9.9)
    expect(scoreStatLine({ rush_yd: 100 }, r, 'RB')).toBe(14)
    expect(scoreStatLine({ rush_yd: 60, rec_yd: 45 }, r, 'RB')).toBe(7)
  })

  it('scores kicker distance buckets', () => {
    const r = rules({
      scoring: {
        xpm: 1,
        fgm_0_19: 3,
        fgm_20_29: 3,
        fgm_30_39: 3,
        fgm_40_49: 4,
        fgm_50p: 5,
        fgmiss_0_19: -1
      }
    })
    // 3 + 3 + 4 + 10
    expect(scoreStatLine({ xpm: 3, fgm_30_39: 1, fgm_40_49: 1, fgm_50p: 2 }, r, 'K')).toBe(20)
  })

  it('scores team defense points-allowed tiers', () => {
    const r = rules({
      scoring: {
        sack: 1,
        int: 2,
        def_td: 6,
        pts_allow_0: 10,
        pts_allow_1_6: 7,
        pts_allow_7_13: 4,
        pts_allow_14_20: 1,
        pts_allow_21_27: 0,
        pts_allow_28_34: -1,
        pts_allow_35p: -4
      }
    })
    expect(scoreStatLine({ sack: 3, int: 1, pts_allow: 10 }, r, 'DEF')).toBe(9)
    expect(scoreStatLine({ sack: 3, int: 1, pts_allow: 0 }, r, 'DEF')).toBe(15)
    expect(scoreStatLine({ sack: 3, int: 1, pts_allow: 24 }, r, 'DEF')).toBe(5)
    expect(scoreStatLine({ sack: 3, int: 1, pts_allow: 41 }, r, 'DEF')).toBe(1)
    // no pts_allow in the line (offensive player) → no tier fires
    expect(scoreStatLine({ sack: 3, int: 1 }, r, 'DEF')).toBe(5)
  })

  it('scores yards-allowed tiers and per-yard', () => {
    const r = rules({ scoring: { yds_allow_0_100: 5, yds_allow_100_199: 3, yds_allow: -0.01 } })
    expect(scoreStatLine({ yds_allow: 99 }, r, 'DEF')).toBe(4.01)
    expect(scoreStatLine({ yds_allow: 100 }, r, 'DEF')).toBe(2)
  })

  it('scores unknown or unsupported keys as 0 and ignores stats without a rule', () => {
    const r = rules({ scoring: { def_3_and_out: 1, rec: 1 } })
    expect(scoreStatLine({ rec: 2, rush_yd: 500 }, r, 'WR')).toBe(2)
  })

  it('rounds to 2 decimals', () => {
    const r = rules({ scoring: { rec_yd: 0.1 } })
    expect(scoreStatLine({ rec_yd: 3 }, r, 'WR')).toBe(0.3)
  })
})

describe('effectiveScoring / statValue', () => {
  it('merges position overrides over base scoring', () => {
    const r = rules({ scoring: { rec: 1, rec_yd: 0.1 }, positionOverrides: { TE: { rec: 1.5 } } })
    expect(effectiveScoring(r, 'TE')).toEqual({ rec: 1.5, rec_yd: 0.1 })
    expect(effectiveScoring(r, 'RB')).toEqual({ rec: 1, rec_yd: 0.1 })
  })

  it('reads raw keys directly and derives bonus keys', () => {
    expect(statValue('rec', { rec: 4 }, 'WR')).toBe(4)
    expect(statValue('rec', {}, 'WR')).toBe(0)
    expect(statValue('bonus_rec_yd_100', { rec_yd: 120 }, 'WR')).toBe(1)
    expect(statValue('bonus_rec_rb', { rec: 5 }, 'RB')).toBe(5)
    expect(statValue('bonus_rec_rb', { rec: 5 }, 'WR')).toBe(0)
  })

  it('every derived key is a supported catalogue entry', () => {
    for (const key of Object.keys(DERIVED_STATS)) {
      expect(STAT_KEY_INFO.get(key)?.supported, key).toBe(true)
    }
  })
})
