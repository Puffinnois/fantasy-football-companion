import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { modelsStale, rebuildModels } from '@main/stats/models/build'
import { eloShift, winProbability } from '@main/stats/models/elo'
import { measureStability, readStability, writeStability } from '@main/stats/models/stability'
import { buildViews } from '@main/stats/views'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, seedTable } from '../../../fixtures/statsDerived'

const KICKER = '00-0000030'

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  await seedGame(db)
  // Two field goals by BUF's kicker: a 30-yard make and a 55-yard miss.
  await db.exec('ALTER TABLE src_pbp ADD COLUMN kick_distance DOUBLE')
  await db.exec('ALTER TABLE src_pbp ADD COLUMN field_goal_result VARCHAR')
  await db.exec(`INSERT INTO src_pbp BY NAME
    SELECT 100 + i AS play_id, 2025 AS season, 1 AS week, 'REG' AS season_type, 'g1' AS game_id,
           'BUF' AS posteam, 'KC' AS defteam, 'field_goal' AS play_type, 1.0 AS field_goal_attempt,
           '${KICKER}' AS kicker_player_id, d AS kick_distance, r AS field_goal_result,
           1.0 AS down, 4.0 AS qtr, 0.5 AS wp, 0.0 AS epa
    FROM (VALUES (1, 30.0, 'made'), (2, 55.0, 'missed')) t(i, d, r)`)
  await buildViews(db)
  await rebuildDerived(db, { seasons: 'all', league: null })
  return db
}

describe('the model tables (stats-analysis spec §8)', () => {
  it('rates every game, every team-week, the simulation and the kicks', async () => {
    const db = await seeded()
    expect(await modelsStale(db)).toBe(true)
    const first = await rebuildModels(db, { stability: true, through: 2024, runs: 200 })
    expect(first).toMatchObject({
      rows: { elo_games: 2, team_forecast: 64, team_model_week: 64, player_model_week: 1 },
      simulated: 2,
      measured: 0
    })
    expect(await modelsStale(db)).toBe(false)
    // g1: BUF 27–20 KC at home; g2 (week 2) is rated with the ratings after it.
    const shift = eloShift(48, 7)
    const games = await db.all<Record<string, number | boolean>>(
      'SELECT game_id, played, home_elo_pre, home_wp, home_elo_post, away_elo_pre FROM elo_games ORDER BY week'
    )
    expect(games[0]).toMatchObject({ played: true, home_elo_pre: 1500 })
    expect(games[0].home_wp).toBeCloseTo(winProbability(48), 9)
    expect(games[0].home_elo_post).toBeCloseTo(1500 + shift, 9)
    expect(games[1]).toMatchObject({ played: false })
    expect(games[1].away_elo_pre).toBeCloseTo(1500 + shift, 9)

    const week = async (team: string, w: number): Promise<Record<string, number | null>> =>
      (await db.get(`SELECT * FROM team_model_week WHERE team = '${team}' AND week = ${w}`))!
    const buf0 = await week('BUF', 0)
    const buf1 = await week('BUF', 1)
    expect(buf0).toMatchObject({
      elo: 1500,
      srs: null,
      adj_off_epa: null,
      elo_games: 0,
      games_left: 2
    })
    expect(buf1).toMatchObject({ srs: expect.closeTo(3.5, 3), mov: 7, games_left: 1, elo_games: 1 })
    expect(buf1.elo).toBeCloseTo(1500 + shift, 9)
    expect(buf1.elo_wp).toBeCloseTo(winProbability(48), 9)
    expect(buf1.sos_elo).toBeCloseTo(1500 - shift, 9)
    expect(buf1.adj_off_epa).not.toBeNull()
    expect(buf1.playoff_pct).toBeGreaterThan(0)
    expect(buf1).toMatchObject({
      fg_model_att: 2,
      fg_model_made: 1,
      off_fumbles: 0,
      off_xints: null
    })
    expect(buf1.fg_xmade).toBeGreaterThan(0.6)
    expect(buf1.fg_xmade).toBeLessThan(1.9)
    // A team without a game that week still has its row (the state at the end of the week); one
    // without a game all season has no rating.
    expect(await week('KC', 0)).toMatchObject({ elo: 1500, elo_games: 0 })
    expect(await week('DAL', 1)).toMatchObject({ elo: null, elo_games: 0 })
    expect(
      await db.get(
        `SELECT fg_model_att, fg_model_made FROM player_model_week WHERE gsis_id = '${KICKER}'`
      )
    ).toEqual({ fg_model_att: 2, fg_model_made: 1 })

    // Sealed weeks are cached: only the current season's latest week runs again.
    expect(
      (await rebuildModels(db, { stability: false, through: 2024, runs: 200 })).simulated
    ).toBe(1)
  })

  it('scores the combine by position percentile', async () => {
    const db = await seeded()
    const wr = (
      name: string,
      forty: number,
      extra: Record<string, number | null> = {}
    ): Record<string, string | number | null> => ({
      season: 2020,
      player_name: name,
      school: 'State',
      pos: 'WR',
      ht: '6-1',
      wt: 200,
      forty,
      bench: 15,
      vertical: 36,
      broad_jump: 120,
      cone: 7,
      shuttle: 4.2,
      draft_round: 1,
      draft_ovr: 10,
      ...extra
    })
    await seedTable(db, 'src_combine', [
      wr('Fast', 4.3),
      wr('Mid', 4.5),
      wr('Slow', 4.7),
      // Only height, weight and the 40: too few measures for a score.
      wr('Partial', 4.4, {
        bench: null,
        vertical: null,
        broad_jump: null,
        cone: null,
        shuttle: null
      })
    ])
    await seedTable(db, 'combine_ids', [
      {
        season: 2020,
        player_name: 'Fast',
        school: 'State',
        gsis_id: '00-0000101',
        resolution: 'pfr'
      },
      {
        season: 2020,
        player_name: 'Slow',
        school: 'State',
        gsis_id: '00-0000103',
        resolution: 'pfr'
      },
      {
        season: 2020,
        player_name: 'Partial',
        school: 'State',
        gsis_id: '00-0000104',
        resolution: 'pfr'
      }
    ])
    await rebuildModels(db, { stability: false, through: 2024, runs: 50 })
    const rows = await db.all<Record<string, number | null>>(
      'SELECT gsis_id, forty_score, ras_measures, ras, speed_score FROM player_profile ORDER BY gsis_id'
    )
    // Percentiles count every combine row, linked or not: the fastest of four 40s scores 10.
    expect(rows.map((r) => [r.gsis_id, r.forty_score, r.ras_measures])).toEqual([
      ['00-0000101', 10, 8],
      ['00-0000103', 0, 8],
      ['00-0000104', expect.closeTo(20 / 3, 6), 3]
    ])
    expect(rows[2].ras).toBeNull()
    expect(rows[0].speed_score).toBeCloseTo((200 * 200) / 4.3 ** 4, 6)
    // Every other measure ties at 5 of 10 among the three who did it.
    expect(rows[0].ras).toBeCloseTo((10 + 7 * 5) / 8, 1)
  })

  // About sixty queries over the whole catalogue.
  it(
    'measures the catalogue on the database and keeps it with the file',
    { timeout: 30_000 },
    async () => {
      const db = await openTestDb()
      await seedGame(db)
      await rebuildDerived(db, { seasons: 'all', league: null })
      await rebuildModels(db, { stability: false, through: 2024, runs: 50 })
      // One season: nothing to pair.
      expect((await measureStability(db, 2025)).size).toBe(0)
      // A copy of 2025 as 2024 pairs every player with himself: too few pairs for an r.
      for (const t of ['player_week', 'player_season', 'team_week', 'team_season']) {
        await db.exec(
          `INSERT INTO ${t} SELECT * REPLACE (2024 AS season) FROM ${t} WHERE season = 2025`
        )
      }
      const measured = await measureStability(db, 2025)
      expect(measured.get('targets')).toMatchObject({
        yearToYear: null,
        pairs: 0,
        reliability: null
      })
      expect(measured.size).toBeGreaterThan(250)
      expect(measured.has('ras')).toBe(false)
      await writeStability(db, measured, 2025)
      expect(await readStability(db)).toEqual(measured)
    }
  )
})
