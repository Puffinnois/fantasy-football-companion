import { describe, expect, it } from 'vitest'
import { buildViews } from '@main/stats/views'
import { openTestDb } from '../../fixtures/stats'

/** A play-by-play row: only the columns the flags read, defaults for the rest. */
function play(id: number, over: Record<string, string | number | null>): string {
  const p: Record<string, string | number | null> = {
    game_id: "'g'",
    play_id: id,
    season: 2025,
    week: 1,
    play_type: "'pass'",
    two_point_attempt: 0,
    pass: 0,
    rush: 0,
    qb_kneel: 0,
    qb_spike: 0,
    qb_dropback: 0,
    pass_attempt: 0,
    sack: 0,
    passer_id: 'NULL',
    rusher_player_id: 'NULL',
    receiver_player_id: 'NULL',
    play_deleted: 0,
    ...over
  }
  return `SELECT ${Object.entries(p)
    .map(([k, v]) => `${v}${typeof v === 'number' ? '' : '::VARCHAR'} AS ${k}`)
    .join(', ')}`
}

describe('plays view (stats-analysis spec §4.2)', () => {
  it('carries the counting rules of the warehouse spec §11–§12', async () => {
    const db = await openTestDb()
    await db.exec(
      `CREATE TABLE src_pbp AS ${[
        play(1, {
          pass: 1,
          qb_dropback: 1,
          pass_attempt: 1,
          passer_id: "'qb'",
          receiver_player_id: "'wr'"
        }),
        play(2, {
          pass: 1,
          qb_dropback: 1,
          pass_attempt: 1,
          sack: 1,
          passer_id: "'qb'",
          receiver_player_id: "'wr'"
        }),
        play(3, { play_type: "'run'", rush: 1, rusher_player_id: "'rb'" }),
        play(4, { play_type: "'qb_kneel'", qb_kneel: 1, rusher_player_id: "'qb'" }),
        play(5, { play_type: "'no_play'", rush: 1, rusher_player_id: "'rb'" }),
        play(6, { play_type: "'run'", rush: 1, two_point_attempt: 1, rusher_player_id: "'rb'" }),
        play(7, { play_type: "'run'", rush: 1, rusher_player_id: "'rb'", play_deleted: 1 })
      ].join(' UNION ALL ')}`
    )
    expect(await buildViews(db)).toEqual(['plays'])
    expect(
      await db.all(
        'SELECT play_id, counts, is_snap, is_dropback, is_carry, is_target FROM plays ORDER BY play_id'
      )
    ).toEqual([
      {
        play_id: 1,
        counts: true,
        is_snap: true,
        is_dropback: true,
        is_carry: false,
        is_target: true
      },
      {
        play_id: 2,
        counts: true,
        is_snap: true,
        is_dropback: true,
        is_carry: false,
        is_target: false
      },
      {
        play_id: 3,
        counts: true,
        is_snap: true,
        is_dropback: false,
        is_carry: true,
        is_target: false
      },
      {
        play_id: 4,
        counts: true,
        is_snap: true,
        is_dropback: false,
        is_carry: true,
        is_target: false
      },
      {
        play_id: 5,
        counts: false,
        is_snap: true,
        is_dropback: false,
        is_carry: false,
        is_target: false
      },
      {
        play_id: 6,
        counts: false,
        is_snap: true,
        is_dropback: false,
        is_carry: false,
        is_target: false
      }
    ])
  })

  it('joins FTN and participation on game and play when they exist', async () => {
    const db = await openTestDb()
    await db.exec(`CREATE TABLE src_pbp AS ${play(1, {})} UNION ALL ${play(2, {})}`)
    await db.exec(
      "CREATE TABLE src_ftn AS SELECT 'g' AS game_id, 1 AS play_id, 2025 AS season, 1 AS week, true AS is_play_action"
    )
    await db.exec(
      "CREATE TABLE src_participation AS SELECT 'g' AS game_id, 2 AS play_id, 2025 AS season, 'x' AS old_game_id, true AS was_pressure"
    )
    await buildViews(db)
    expect(
      await db.all('SELECT play_id, is_play_action, was_pressure FROM plays ORDER BY play_id')
    ).toEqual([
      { play_id: 1, is_play_action: true, was_pressure: null },
      { play_id: 2, is_play_action: null, was_pressure: true }
    ])
  })
})

describe('depth_chart_week view (coverage audit fix 1)', () => {
  it('maps snapshots to the last one before each kickoff, playoff weeks included', async () => {
    const db = await openTestDb()
    await db.exec(`CREATE TABLE games AS SELECT * FROM (VALUES
        (2025, 'REG', 18, '2026-01-04', '13:00'),
        (2025, 'WC', 19, '2026-01-10', '16:30'),
        (2025, 'DIV', 20, '2026-01-17', '16:30'),
        (2025, 'CON', 21, '2026-01-25', '15:00')
      ) t(season, game_type, week, gameday, gametime)`)
    await db.exec(`CREATE TABLE src_depth_chart_snapshots AS SELECT * FROM (VALUES
        ('2026-01-03T07:00:00Z', 2025, 'BUF', 'A', '1', 'g1', 'Offense', 'QB', 1),
        ('2026-01-09T07:00:00Z', 2025, 'BUF', 'B', '2', 'g2', 'Offense', 'QB', 1),
        ('2026-01-12T07:00:00Z', 2025, 'BUF', 'C', '3', 'g3', 'Offense', 'QB', 1)
      ) t(dt, season, team, player_name, espn_id, gsis_id, pos_grp, pos_abb, pos_rank)`)
    await buildViews(db)
    // Week 21 kicks off after the latest snapshot and is not the next week, so it is left out.
    expect(
      await db.all('SELECT season_type, week, gsis_id FROM depth_chart_week ORDER BY week')
    ).toEqual([
      { season_type: 'REG', week: 18, gsis_id: 'g1' },
      { season_type: 'POST', week: 19, gsis_id: 'g2' },
      { season_type: 'POST', week: 20, gsis_id: 'g3' }
    ])
  })

  it('keeps the weekly rows of earlier seasons in the same shape', async () => {
    const db = await openTestDb()
    await db.exec(`CREATE TABLE src_depth_charts AS SELECT 2024 AS season, 'POST' AS season_type, 19 AS week,
        'g1' AS gsis_id, 'KC' AS team, 'Pat' AS full_name, 'Offense' AS formation, 'QB' AS depth_position,
        'QB' AS position, '1' AS depth_team`)
    await buildViews(db)
    expect(
      await db.all('SELECT season, week, gsis_id, position, depth FROM depth_chart_week')
    ).toEqual([{ season: 2024, week: 19, gsis_id: 'g1', position: 'QB', depth: 1 }])
  })
})
