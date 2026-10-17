import { describe, expect, it } from 'vitest'
import { sleeperStatLine } from '@main/scoring/adapters'
import { scoreStatLine } from '@main/scoring/engine'
import { rebuildDerived } from '@main/stats/derived/build'
import { expectedPointsSql, pointsSql } from '@main/stats/derived/fantasy'
import type { Position, Rules } from '@shared/rules'
import { SCORING_PRESETS } from '@shared/stats/scoring'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, seedTable, WR } from '../../../fixtures/statsDerived'

type Line = Record<string, number>

/** A league that scores bonuses, tiers, first downs and a TE premium. */
const LEAGUE: Pick<Rules, 'scoring' | 'positionOverrides'> = {
  scoring: {
    ...SCORING_PRESETS.ppr.scoring,
    pass_fd: 0.5,
    rec_fd: 0.5,
    bonus_rec_yd_100: 3,
    bonus_rush_rec_yd_200: 2,
    bonus_pass_yd_300: 2,
    yds_allow_100_199: 3,
    yds_allow_550p: -7,
    bonus_rec_te: 0.5
  },
  positionOverrides: { TE: { rec: 1.5, rec_td: 7 } }
}

const LINES: [Position, Line][] = [
  ['WR', { gp: 1, rec: 7, rec_yd: 104, rec_td: 1, rec_fd: 5, fum_lost: 1 }],
  ['TE', { gp: 1, rec: 5, rec_yd: 48, rec_td: 1, rec_fd: 3 }],
  ['RB', { gp: 1, rush_att: 22, rush_yd: 140, rec: 3, rec_yd: 65, rush_td: 2, rush_2pt: 1 }],
  ['QB', { gp: 1, pass_yd: 312, pass_td: 3, pass_int: 2, pass_fd: 16, rush_yd: 12 }],
  ['K', { gp: 1, fgm_40_49: 1, fgm_50_59: 1, fgm_60p: 1, xpm: 3, fgmiss: 1 }],
  ['DEF', { gp: 1, sack: 4, int: 1, yds_allow: 180 }],
  ['DEF', { gp: 1, sack: 1, pts_allow: 41, yds_allow: 560, def_td: 1 }],
  ['DEF', { gp: 0 }]
]

async function sqlPoints(
  rules: Pick<Rules, 'scoring' | 'positionOverrides'>,
  lines: [Position, Line][]
): Promise<number[]> {
  const db = await openTestDb()
  const keys = [...new Set(lines.flatMap(([, l]) => Object.keys(l)))]
  await seedTable(
    db,
    'lines',
    lines.map(([position, l], i) => ({
      i,
      position,
      ...Object.fromEntries(keys.map((k) => [k, l[k] ?? null]))
    }))
  )
  const rows = await db.all<{ points: number }>(
    `SELECT ${pointsSql(rules, new Set(keys))} AS points FROM lines s ORDER BY i`
  )
  return rows.map((r) => r.points)
}

describe('fantasy scoring in SQL (stats-analysis spec §5.2)', () => {
  it('scores like the app’s scoring engine, bonuses, tiers and overrides included', async () => {
    const rules = {
      ...LEAGUE,
      source: 'custom',
      updatedAt: '',
      rosterSlots: [],
      settings: { numTeams: 12, waiverType: 'faab' }
    } as Rules
    const expected = LINES.map(([pos, line]) =>
      scoreStatLine(sleeperStatLine(line, pos), rules, pos)
    )
    expect(await sqlPoints(LEAGUE, LINES)).toEqual(expected)
  })

  it('counts Sleeper’s single 50+ bucket of seasons before 2024 as 50–59', async () => {
    const lines: [Position, Line][] = [['K', { gp: 1, fgm_50p: 2, fgm_30_39: 1 }]]
    expect(await sqlPoints(SCORING_PRESETS.ppr, lines)).toEqual([13])
  })

  it('scores the expected stats with the same rules', async () => {
    const db = await openTestDb()
    await seedTable(db, 'f', [
      {
        receptions_exp: 4.5,
        rec_yards_gained_exp: 52,
        rec_touchdown_exp: 0.4,
        rec_first_down_exp: 2,
        rush_yards_gained_exp: 10
      }
    ])
    await seedTable(db, 's', [{ position: 'TE' }])
    const sql = expectedPointsSql(
      LEAGUE,
      new Set([
        'receptions_exp',
        'rec_yards_gained_exp',
        'rec_touchdown_exp',
        'rec_first_down_exp',
        'rush_yards_gained_exp'
      ])
    )
    // 4.5 × (1.5 TE + 0.5 premium) + 5.2 + 0.4 × 7 + 2 × 0.5 + 1.0
    expect((await db.get<{ x: number }>(`SELECT ${sql} AS x FROM f, s`))?.x).toBeCloseTo(19)
  })

  it('builds fantasy_week for each scoring, linked by gsis id, and points allowed by position', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: LEAGUE })
    const rows = await db.all(
      'SELECT scoring, points, xpoints FROM fantasy_week WHERE gsis_id = ? ORDER BY scoring',
      [WR]
    )
    expect(rows).toEqual([
      { scoring: 'half', points: 2.5, xpoints: 2.6 },
      { scoring: 'league', points: 3, xpoints: 3.5 },
      { scoring: 'ppr', points: 3, xpoints: 3.2 },
      { scoring: 'std', points: 2, xpoints: 2 }
    ])
    expect(
      await db.get("SELECT points FROM fantasy_week WHERE player_id = 'KC' AND scoring = 'ppr'")
    ).toEqual({ points: 1 })
    expect(
      await db.get("SELECT fpa_wr FROM team_fantasy_week WHERE team = 'KC' AND scoring = 'std'")
    ).toEqual({ fpa_wr: 2 })
  })

  it('numbers Sleeper’s playoff weeks as nflverse does', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await db.exec("UPDATE src_sleeper SET season_type = 'POST', week = 2")
    await rebuildDerived(db, { seasons: 'all', league: null })
    expect(
      await db.get(
        "SELECT season_type, week FROM fantasy_week WHERE player_id = '9001' AND scoring = 'ppr'"
      )
    ).toEqual({ season_type: 'POST', week: 20 })
  })
})
