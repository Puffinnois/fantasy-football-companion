import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { openTestDb } from '../../../fixtures/stats'
import { CB, EDGE, QB, RB, WR, seedGame, seedTable } from '../../../fixtures/statsDerived'

type R = Record<string, unknown>

describe('the derived tables (stats-analysis spec §5)', () => {
  it('sums every source into player_week, one row per player and week', async () => {
    const db = await openTestDb()
    await seedGame(db)
    const written = await rebuildDerived(db, { seasons: 'all', league: null })
    expect(written).toMatchObject({
      team_week: 4,
      player_week: 7,
      player_season: 7,
      team_season: 2
    })
    const week = async (id: string): Promise<R> =>
      (await db.get<R>('SELECT * FROM player_week WHERE gsis_id = ?', [id]))!
    const qb = await week(QB)
    expect(qb).toMatchObject({
      team: 'BUF',
      opponent: 'KC',
      home: true,
      position: 'QB',
      games: 1,
      pass_att: 2,
      pass_cmp: 1,
      pass_yds: 20,
      sacks_taken: 1,
      sack_yds_lost: 7,
      dropbacks: 3,
      db_pressured: 1,
      db_pressure_known: 3,
      deep_att: 1,
      cpoe_n: 2,
      cpoe_sum: 10,
      qbr_sum: 280,
      qbr_plays: 4,
      fumbles: 1
    })
    expect(qb.db_epa).toBeCloseTo(-1.0)
    const wr = await week(WR)
    expect(wr).toMatchObject({
      targets: 2,
      receptions: 1,
      rec_yds: 20,
      rec_air_yds: 37,
      rec_yac: 8,
      rec_fd: 1,
      routes: 3,
      routes_est: 0,
      tm_targets: 2,
      tm_dropbacks: 3,
      tm_air_yds: 37,
      off_snaps: 48,
      tm_off_snaps: 60,
      kr: 2,
      kr_yds: 50,
      tgt_man: 1,
      tgt_zone: 1,
      routes_man: 2,
      routes_zone: 1,
      tgt_catchable: 1,
      tgt_ftn: 2,
      ngs_targets: 2,
      ngs_sep_sum: 6,
      x_rec: 1.2,
      x_td: 0.1
    })
    expect(await week(RB)).toMatchObject({
      carries: 1,
      rush_yds: 5,
      rush_td: 1,
      i10_carries: 1,
      box8_carries: 1,
      box_known: 1
    })
    expect(await week(EDGE)).toMatchObject({ sacks: 1, def_pass_snaps: 3, team: 'KC' })
    expect(await week(CB)).toMatchObject({
      pass_defended: 1,
      tackles_solo: 1,
      cov_targets: 1,
      cov_adot_sum: 25
    })
  })

  it('credits a player to his own team on kickoffs and punts, where posteam is the other one', async () => {
    const db = await openTestDb()
    await seedGame(db)
    // nflfastR's posteam on a kickoff is the receiving team; a punt's tacklers are on the punting team.
    await db.exec(`INSERT INTO src_pbp BY NAME
      SELECT 6 AS play_id, 2025 AS season, 1 AS week, 'REG' AS season_type, 'g1' AS game_id,
             'KC' AS posteam, 'BUF' AS defteam, 'kickoff' AS play_type, 1.0 AS kickoff_attempt,
             1.0 AS touchback, '00-0000030' AS kicker_player_id, 0.0 AS play_deleted
      UNION ALL BY NAME
      SELECT 7 AS play_id, 2025 AS season, 1 AS week, 'REG' AS season_type, 'g1' AS game_id,
             'BUF' AS posteam, 'KC' AS defteam, 'punt' AS play_type, 1.0 AS punt_attempt, 0.0 AS play_deleted`)
    await seedTable(db, 'play_players', [
      { season: 2025, game_id: 'g1', play_id: 7, role: 'solo_tackle', gsis: '00-0000031' }
    ])
    await db.exec(`INSERT INTO src_player_stats BY NAME
      SELECT '00-0000030' AS player_id, 2025 AS season, 1 AS week, 'REG' AS season_type, 'g1' AS game_id, 'BUF' AS team`)
    await db.exec(`INSERT INTO src_snaps BY NAME
      SELECT 'pfr31' AS pfr_player_id, 2025 AS season, 1 AS week, 'REG' AS season_type, 'g1' AS game_id,
             'BUF' AS team, 0.0 AS offense_snaps, 0.0 AS offense_pct, 0.0 AS defense_snaps, 0.0 AS defense_pct, 5.0 AS st_snaps`)
    await db.exec(
      `INSERT INTO players BY NAME SELECT '00-0000031' AS gsis_id, 'pfr31' AS pfr_id, 'LB' AS position_group`
    )
    await rebuildDerived(db, { seasons: 'all', league: null })
    expect(
      await db.all(
        'SELECT gsis_id, team, opponent, kickoffs, tackles_solo FROM player_week WHERE gsis_id IN (?, ?) ORDER BY 1',
        ['00-0000030', '00-0000031']
      )
    ).toEqual([
      { gsis_id: '00-0000030', team: 'BUF', opponent: 'KC', kickoffs: 1, tackles_solo: null },
      { gsis_id: '00-0000031', team: 'BUF', opponent: 'KC', kickoffs: null, tackles_solo: 1 }
    ])
  })

  it('takes NGS and QBR season figures from their season rows', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    const wr = await db.get<R>('SELECT * FROM player_season WHERE gsis_id = ?', [WR])
    expect(wr).toMatchObject({
      season_type: 'REG',
      targets: 2,
      routes: 3,
      ngs_targets: 2,
      ngs_sep_sum: 5,
      games: 1
    })
    const qb = await db.get<R>('SELECT qbr_sum, qbr_plays FROM player_season WHERE gsis_id = ?', [
      QB
    ])
    expect(qb).toEqual({ qbr_sum: 260, qbr_plays: 4 })
  })

  it('builds team_week from both sides of each play, with the result, drives and lines', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    const buf = (await db.get<R>("SELECT * FROM team_week WHERE team = 'BUF' AND week = 1"))!
    expect(buf).toMatchObject({
      opponent: 'KC',
      home: true,
      games: 1,
      wins: 1,
      losses: 0,
      points_for: 27,
      points_against: 20,
      off_plays: 4,
      off_dropbacks: 3,
      off_carries: 1,
      off_targets: 2,
      off_sacks: 1,
      def_plays: 1,
      def_carries: 1,
      def_rush_stuffed: 1,
      def_havoc: 1,
      off_pressured: 1,
      off_pressure_known: 3,
      off_man: 2,
      off_zone: 1,
      off_personnel_11: 3,
      off_personnel_21: 1,
      off_personnel_known: 4,
      drives: 2,
      td_drives: 1,
      drive_points: 7,
      def_drives: 1,
      line_margin: 2.5,
      total_line: 48.5,
      implied_points: 25.5
    })
    expect(buf.off_epa).toBeCloseTo(-0.7)
    const next = await db.get<R>(
      "SELECT games, line_margin, implied_points FROM team_week WHERE team = 'BUF' AND week = 2"
    )
    expect(next).toEqual({ games: 0, line_margin: 1.5, implied_points: 25.75 })
    expect(await db.get<R>("SELECT games, wins FROM team_season WHERE team = 'KC'")).toEqual({
      games: 1,
      wins: 0
    })
  })

  it('estimates routes in a season without participation', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await db.exec('DELETE FROM on_field')
    await rebuildDerived(db, { seasons: 'all', league: null })
    // 3 team dropbacks × 48 of 60 snaps
    expect(
      await db.get<R>('SELECT routes, routes_est FROM player_week WHERE gsis_id = ?', [WR])
    ).toEqual({
      routes: 2,
      routes_est: 1
    })
  })

  it('leaves out what an unloaded source would give', async () => {
    const db = await openTestDb()
    await seedGame(db)
    for (const t of [
      'src_ngs_receiving',
      'src_qbr_week',
      'src_qbr_season',
      'src_snaps',
      'on_field',
      'src_sleeper',
      'src_sleeper_def'
    ]) {
      await db.exec(`DROP TABLE ${t}`)
    }
    const written = await rebuildDerived(db, { seasons: 'all', league: null })
    expect(written.fantasy_week).toBeUndefined()
    expect(
      await db.get<R>(
        'SELECT targets, ngs_targets, qbr_plays, off_snaps, routes FROM player_week WHERE gsis_id = ?',
        [WR]
      )
    ).toEqual({
      targets: 2,
      ngs_targets: null,
      qbr_plays: null,
      off_snaps: null,
      routes: null
    })
  })

  it('rebuilds only the seasons asked for, in place', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    await db.exec(
      "INSERT INTO player_week (gsis_id, season, season_type, week, targets) VALUES ('00-0000099', 2024, 'REG', 1, 9)"
    )
    await db.exec('UPDATE src_pbp SET receiving_yards = 30 WHERE play_id = 1')
    await rebuildDerived(db, { seasons: [2025], league: null })
    expect(await db.get<R>('SELECT rec_yds FROM player_week WHERE gsis_id = ?', [WR])).toEqual({
      rec_yds: 30
    })
    expect(await db.get<R>('SELECT targets FROM player_week WHERE season = 2024')).toEqual({
      targets: 9
    })
  })

  it('replaces every table when the derived version is new, and only fantasy tables for new rules', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: [], league: null })
    expect(await db.get<R>("SELECT version FROM derived_state WHERE name = 'derived'")).toEqual({
      version: 1
    })
    await db.exec('UPDATE player_week SET targets = 99')
    await rebuildDerived(db, {
      seasons: 'all',
      league: { scoring: { rec: 2 }, positionOverrides: {} },
      fantasyOnly: true
    })
    expect(await db.get<R>('SELECT targets FROM player_week WHERE gsis_id = ?', [WR])).toEqual({
      targets: 99
    })
    expect(await db.get<R>("SELECT points FROM fantasy_week WHERE scoring = 'league'")).toEqual({
      points: 2
    })
  })

  it('builds nothing without play-by-play', async () => {
    const db = await openTestDb()
    expect(await rebuildDerived(db, { seasons: 'all', league: null })).toEqual({})
  })
})
