import { describe, expect, it } from 'vitest'
import { openTestDb, tempDir, writeFixture } from '../../fixtures/stats'
import { runSync, urlOf } from '../../fixtures/statsSync'

describe('file sources (stats-analysis spec §4.1)', () => {
  it('normalises team codes and keeps the published columns', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const file = await writeFixture(
      db,
      dir,
      'stats_player_week_2019.parquet',
      `SELECT '00-0033873' AS player_id, 2019 AS season, 1 AS week, 'REG' AS season_type,
              'OAK' AS team, 'DEN' AS opponent_team, 5 AS receptions, 0 AS targets`
    )
    const { steps } = await runSync(db, {
      files: { [urlOf('player_stats', 2019)]: file },
      only: ['player_stats']
    })
    expect(steps.find((s) => s.source === 'stats:player_stats:2019')).toMatchObject({
      status: 'ok',
      rowsWritten: 1
    })
    expect(
      await db.all(
        'SELECT player_id, team, opponent_team, receptions, targets FROM src_player_stats'
      )
    ).toEqual([
      { player_id: '00-0033873', team: 'LV', opponent_team: 'DEN', receptions: 5, targets: 0 }
    ])
  })

  it('derives the season type from game types, once even when the file has the column', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const snaps = await writeFixture(
      db,
      dir,
      'snap_counts_2025.parquet',
      `SELECT 'AlleJo02' AS pfr_player_id, 2025 AS season, 19 AS week, 'WC' AS game_type,
              'BUF' AS team, 'LAR' AS opponent, 60 AS offense_snaps`
    )
    const injuries = await writeFixture(
      db,
      dir,
      'injuries_2025.parquet',
      `SELECT '00-0034857' AS gsis_id, 2025 AS season, 3 AS week, 'REG' AS game_type,
              'REG' AS season_type, 'BUF' AS team`
    )
    await runSync(db, {
      files: { [urlOf('snaps', 2025)]: snaps, [urlOf('injuries', 2025)]: injuries },
      only: ['snaps', 'injuries']
    })
    expect(await db.all('SELECT season_type, opponent FROM src_snaps')).toEqual([
      { season_type: 'POST', opponent: 'LA' }
    ])
    const columns = await db.all<{ column_name: string }>(
      "SELECT column_name FROM duckdb_columns() WHERE table_name = 'src_injuries' AND column_name LIKE 'season_type%'"
    )
    expect(columns).toEqual([{ column_name: 'season_type' }])
  })

  it("moves ESPN's nickname to team_name and takes the code as team", async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'qbr_week_level.parquet',
      `SELECT 2025 AS season, 'Regular' AS season_type, 4 AS game_week, '3139477' AS player_id,
              'LAR' AS team_abb, 'WSH' AS opp_abb, 'Rams' AS team, 71.2 AS qbr_total
       UNION ALL SELECT 2018, 'Regular', 1, '1', 'KC', 'LAC', 'Chiefs', 50.0`
    )
    await runSync(db, { files: { [urlOf('qbr_week')]: file }, only: ['qbr_week'] })
    expect(
      await db.all(
        'SELECT season, week, team, team_name, opponent, team_abb, opp_abb FROM src_qbr_week'
      )
    ).toEqual([
      {
        season: 2025,
        week: 4,
        team: 'LA',
        team_name: 'Rams',
        opponent: 'WAS',
        team_abb: 'LA',
        opp_abb: 'WAS'
      }
    ])
  })

  it('stores season and week as integers whatever type the file uses', async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'ep_weekly_2025.parquet',
      "SELECT '2025' AS season, 3.0::DOUBLE AS week, 'g' AS player_id, 'BUF' AS posteam"
    )
    await runSync(db, {
      files: { [urlOf('ff_opportunity', 2025)]: file },
      only: ['ff_opportunity']
    })
    const types = await db.all<{ column_name: string; data_type: string }>(
      "SELECT column_name, data_type FROM duckdb_columns() WHERE table_name = 'src_ff_opportunity' AND column_name IN ('season', 'week') ORDER BY 1"
    )
    expect(types).toEqual([
      { column_name: 'season', data_type: 'INTEGER' },
      { column_name: 'week', data_type: 'INTEGER' }
    ])
  })

  it('reads the crosswalk CSV as text with NA as missing', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const file = `${dir}/db_playerids.csv`
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      file,
      'sleeper_id,gsis_id,name\n13324,NA,Matt Hibner\n4866,00-0034844,Saquon Barkley\n'
    )
    await runSync(db, { files: { [urlOf('crosswalk')]: file }, only: ['crosswalk'] })
    expect(await db.all('SELECT sleeper_id, gsis_id FROM src_crosswalk ORDER BY name')).toEqual([
      { sleeper_id: '13324', gsis_id: null },
      { sleeper_id: '4866', gsis_id: '00-0034844' }
    ])
  })

  it('stores play-by-play without the dropped columns and lists every named player', async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'play_by_play_2025.parquet',
      `SELECT * FROM (VALUES
         ('2025_01_BUF_BAL', 40.0, 2025, 1, 'REG', 'BUF', 'BAL', 'BUF', 'BAL', 'pass', '00-0034857', '00-0036', NULL, '00-0038', 0, 1.5, 'J.Allen'),
         ('2025_01_BUF_BAL', 41.0, 2025, 1, 'REG', 'BUF', 'BAL', 'BUF', 'BAL', 'run', NULL, NULL, '00-0037', NULL, 1, 0.2, NULL)
       ) t(game_id, play_id, season, week, season_type, posteam, defteam, home_team, away_team, play_type,
           passer_player_id, receiver_player_id, rusher_player_id, solo_tackle_1_player_id, play_deleted,
           total_home_epa, passer_player_name)`
    )
    const { steps } = await runSync(db, { files: { [urlOf('pbp', 2025)]: file }, only: ['pbp'] })
    expect(steps.find((s) => s.source === 'stats:pbp:2025')).toMatchObject({
      status: 'ok',
      message: null
    })
    const columns = await db.all<{ column_name: string; data_type: string }>(
      "SELECT column_name, data_type FROM duckdb_columns() WHERE table_name = 'src_pbp'"
    )
    const names = columns.map((c) => c.column_name)
    expect(names).not.toContain('total_home_epa')
    expect(names).not.toContain('passer_player_name')
    expect(columns.find((c) => c.column_name === 'play_id')?.data_type).toBe('INTEGER')
    // The deleted play (41) names nobody in play_players.
    expect(await db.all('SELECT play_id, role, gsis FROM play_players ORDER BY role')).toEqual([
      { play_id: 40, role: 'passer', gsis: '00-0034857' },
      { play_id: 40, role: 'receiver', gsis: '00-0036' },
      { play_id: 40, role: 'solo_tackle', gsis: '00-0038' }
    ])
  })

  it('splits participation into its play columns and the players on the field', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const withPositions = await writeFixture(
      db,
      dir,
      'pbp_participation_2025.parquet',
      `SELECT '2025_01_BUF_BAL' AS nflverse_game_id, 40.0 AS play_id, 'OAK' AS possession_team,
              'a;b' AS offense_players, 'c' AS defense_players, 'QB;WR' AS offense_positions,
              'CB' AS defense_positions, 'A;B' AS offense_names, true AS was_pressure`
    )
    const without = await writeFixture(
      db,
      dir,
      'pbp_participation_2019.parquet',
      `SELECT '2019_01_OAK_DEN' AS nflverse_game_id, 7.0 AS play_id, 'OAK' AS possession_team,
              'x' AS offense_players, '' AS defense_players, false AS was_pressure`
    )
    await runSync(db, {
      files: {
        [urlOf('participation', 2025)]: withPositions,
        [urlOf('participation', 2019)]: without
      },
      only: ['participation']
    })
    expect(
      await db.all(
        'SELECT season, game_id, play_id, possession_team, was_pressure FROM src_participation ORDER BY season'
      )
    ).toEqual([
      {
        season: 2019,
        game_id: '2019_01_OAK_DEN',
        play_id: 7,
        possession_team: 'LV',
        was_pressure: false
      },
      {
        season: 2025,
        game_id: '2025_01_BUF_BAL',
        play_id: 40,
        possession_team: 'LV',
        was_pressure: true
      }
    ])
    expect(
      await db.all('SELECT season, side, gsis, position FROM on_field ORDER BY season, side, gsis')
    ).toEqual([
      { season: 2019, side: 'O', gsis: 'x', position: null },
      { season: 2025, side: 'D', gsis: 'c', position: 'CB' },
      { season: 2025, side: 'O', gsis: 'a', position: 'QB' },
      { season: 2025, side: 'O', gsis: 'b', position: 'WR' }
    ])
  })

  it('keys FTN charting by the nflverse game and play', async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'ftn_charting_2022.parquet',
      `SELECT '2022_01_BUF_LA' AS nflverse_game_id, 55 AS nflverse_play_id, 2022 AS season, 1 AS week, true AS is_play_action`
    )
    await runSync(db, { files: { [urlOf('ftn', 2022)]: file }, only: ['ftn'] })
    expect(await db.all('SELECT game_id, play_id, is_play_action FROM src_ftn')).toEqual([
      { game_id: '2022_01_BUF_LA', play_id: 55, is_play_action: true }
    ])
  })

  it('stores 2025+ depth-chart snapshots apart from the weekly rows, with their season', async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'depth_charts_2026.parquet',
      `SELECT '2026-09-08T07:00:00Z' AS dt, 'LAR' AS team, 'Player' AS player_name, '1' AS espn_id,
              '00-1' AS gsis_id, 'Offense' AS pos_grp, 'WR' AS pos_abb, 1 AS pos_rank`
    )
    const { steps } = await runSync(db, {
      files: { [urlOf('depth_chart_snapshots', 2026)]: file },
      only: ['depth_charts', 'depth_chart_snapshots']
    })
    // Weekly depth charts end in 2024; snapshots start in 2025.
    expect(steps.map((s) => s.source).filter((s) => s.includes('2026'))).toEqual([
      'stats:depth_chart_snapshots:2026'
    ])
    expect(await db.all('SELECT season, team FROM src_depth_chart_snapshots')).toEqual([
      { season: 2026, team: 'LA' }
    ])
  })
})
