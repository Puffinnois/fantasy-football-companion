import type { StatsDb } from '@main/stats/db'
import { buildViews } from '@main/stats/views'

type Value = string | number | boolean | null
export type Row = Record<string, Value>

/** A SQL literal for a fixture value. */
function literal(v: Value, type: string): string {
  if (v === null) return `NULL::${type}`
  if (typeof v === 'string') return `'${v.replaceAll("'", "''")}'::${type}`
  return `${v}::${type}`
}

function typeOf(column: string, rows: Row[]): string {
  const v = rows.map((r) => r[column]).find((x) => x !== null && x !== undefined)
  if (typeof v === 'boolean') return 'BOOLEAN'
  if (typeof v === 'string') return 'VARCHAR'
  if (column === 'season' || column === 'week' || column === 'play_id') return 'INTEGER'
  return 'DOUBLE'
}

/** Creates `name` from the rows (every row may leave columns out: they are NULL). */
export async function seedTable(db: StatsDb, name: string, rows: Row[]): Promise<void> {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const types = new Map(columns.map((c) => [c, typeOf(c, rows)]))
  const selects = rows.map(
    (r) =>
      `SELECT ${columns.map((c) => `${literal(r[c] ?? null, types.get(c)!)} AS "${c}"`).join(', ')}`
  )
  await db.exec(`CREATE OR REPLACE TABLE "${name}" AS ${selects.join(' UNION ALL ')}`)
}

/** Text and flag columns of `src_pbp`; every other column the code reads is a number (0 by default). */
const PBP_TEXT = [
  'game_id',
  'season_type',
  'posteam',
  'defteam',
  'play_type',
  'passer_player_id',
  'passer_id',
  'rusher_player_id',
  'receiver_player_id',
  'kicker_player_id',
  'punter_player_id',
  'pass_defense_1_player_id',
  'fixed_drive_result',
  'defense_man_zone_type',
  'defense_coverage_type',
  'offense_personnel',
  'offense_formation'
]
const PBP_FLAGS = [
  'was_pressure',
  'is_play_action',
  'is_rpo',
  'is_screen_pass',
  'is_motion',
  'is_interception_worthy',
  'is_throw_away',
  'is_qb_out_of_pocket',
  'is_catchable_ball',
  'is_contested_ball',
  'is_created_reception',
  'is_drop'
]
const PBP_NUMBERS = [
  'pass',
  'rush',
  'qb_kneel',
  'qb_spike',
  'qb_dropback',
  'qb_scramble',
  'pass_attempt',
  'sack',
  'complete_pass',
  'pass_touchdown',
  'rush_touchdown',
  'interception',
  'first_down',
  'first_down_pass',
  'first_down_rush',
  'two_point_attempt',
  'play_deleted',
  'passing_yards',
  'rushing_yards',
  'receiving_yards',
  'yards_gained',
  'air_yards',
  'yards_after_catch',
  'xyac_mean_yardage',
  'epa',
  'qb_epa',
  'wpa',
  'wp',
  'success',
  'cp',
  'cpoe',
  'xpass',
  'pass_oe',
  'down',
  'ydstogo',
  'qtr',
  'yardline_100',
  'half_seconds_remaining',
  'game_seconds_remaining',
  'score_differential',
  'posteam_score',
  'posteam_score_post',
  'fixed_drive',
  'shotgun',
  'no_huddle',
  'field_goal_attempt',
  'kickoff_attempt',
  'punt_attempt',
  'touchback',
  'fumble',
  'fumble_lost',
  'fumble_forced',
  'tackled_for_loss',
  'defenders_in_box',
  'n_defense_box',
  'n_blitzers',
  'n_pass_rushers'
]

/** Numbers that are not plain 0 by default: a play has a time, a down, a place on the field. */
const PBP_DEFAULTS: Row = {
  wp: 0.5,
  down: 1,
  ydstogo: 10,
  qtr: 1,
  yardline_100: 60,
  half_seconds_remaining: 1500,
  game_seconds_remaining: 3300,
  fixed_drive: 1
}

/**
 * `src_pbp` from plays that name only what they need, then the views (`plays` with the counting
 * flags). FTN and participation columns sit in `src_pbp` itself here; leave `ftn` / `part` off to
 * leave those columns out, as when their sources are not loaded.
 */
export async function seedPlays(
  db: StatsDb,
  plays: Row[],
  include: { ftn?: boolean; part?: boolean } = { ftn: true, part: true }
): Promise<void> {
  const part = new Set([
    'was_pressure',
    'defense_man_zone_type',
    'defense_coverage_type',
    'offense_personnel',
    'offense_formation',
    'defenders_in_box'
  ])
  const ftn = new Set([
    ...PBP_FLAGS.filter((f) => f !== 'was_pressure'),
    'n_defense_box',
    'n_blitzers',
    'n_pass_rushers'
  ])
  const keep = (c: string): boolean =>
    (include.part || !part.has(c)) && (include.ftn || !ftn.has(c))
  const rows = plays.map((p, i) => {
    const row: Row = { play_id: i + 1, season: 2025, week: 1, season_type: 'REG', game_id: 'g1' }
    for (const c of PBP_TEXT) row[c] ??= null
    for (const c of PBP_FLAGS) row[c] = null
    for (const c of PBP_NUMBERS) row[c] = PBP_DEFAULTS[c] ?? 0
    for (const c of ['n_defense_box', 'n_blitzers', 'n_pass_rushers', 'defenders_in_box']) {
      row[c] = null
    }
    Object.assign(row, p)
    return Object.fromEntries(Object.entries(row).filter(([c]) => keep(c)))
  })
  // Typed by name: a flag column that is NULL in every row is still a BOOLEAN.
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const type = (c: string): string =>
    PBP_TEXT.includes(c)
      ? 'VARCHAR'
      : PBP_FLAGS.includes(c)
        ? 'BOOLEAN'
        : ['season', 'week', 'play_id'].includes(c)
          ? 'INTEGER'
          : 'DOUBLE'
  const selects = rows.map(
    (r) => `SELECT ${columns.map((c) => `${literal(r[c] ?? null, type(c))} AS "${c}"`).join(', ')}`
  )
  await db.exec(`CREATE OR REPLACE TABLE src_pbp AS ${selects.join(' UNION ALL ')}`)
  await buildViews(db)
}

export const QB = '00-0000001'
export const WR = '00-0000002'
export const RB = '00-0000003'
export const KC_RB = '00-0000004'
export const EDGE = '00-0000010'
export const CB = '00-0000011'

const pass = (over: Row): Row => ({
  posteam: 'BUF',
  defteam: 'KC',
  play_type: 'pass',
  pass: 1,
  qb_dropback: 1,
  pass_attempt: 1,
  passer_player_id: QB,
  passer_id: QB,
  ...over
})
const run = (over: Row): Row => ({
  posteam: 'BUF',
  defteam: 'KC',
  play_type: 'run',
  rush: 1,
  ...over
})

/**
 * One game of 2025, KC at BUF (27–20), as every derived table needs it: four BUF plays (a 20-yard
 * catch, a sack under pressure, a 5-yard run, a deep incompletion in man coverage) and one KC run,
 * with players on the field, the schedule, ids, rosters, box score, snaps, NGS, PFR, QBR,
 * ffopportunity and Sleeper lines.
 */
export async function seedGame(db: StatsDb): Promise<void> {
  await seedPlays(db, [
    pass({
      receiver_player_id: WR,
      complete_pass: 1,
      passing_yards: 20,
      receiving_yards: 20,
      yards_gained: 20,
      air_yards: 12,
      yards_after_catch: 8,
      xyac_mean_yardage: 5,
      first_down_pass: 1,
      first_down: 1,
      epa: 1.5,
      qb_epa: 1.5,
      success: 1,
      cp: 0.6,
      cpoe: 40,
      xpass: 0.6,
      pass_oe: 40,
      was_pressure: false,
      is_play_action: true,
      is_catchable_ball: true,
      n_blitzers: 0,
      n_pass_rushers: 4,
      defense_man_zone_type: 'ZONE_COVERAGE',
      offense_personnel: '1 RB, 1 TE, 3 WR',
      shotgun: 1,
      posteam_score: 0,
      posteam_score_post: 0
    }),
    pass({
      sack: 1,
      yards_gained: -7,
      epa: -1.8,
      qb_epa: -1.8,
      down: 2,
      was_pressure: true,
      is_play_action: false,
      n_blitzers: 2,
      n_pass_rushers: 6,
      defense_man_zone_type: 'MAN_COVERAGE',
      offense_personnel: '1 RB, 1 TE, 3 WR',
      posteam_score: 0,
      posteam_score_post: 0
    }),
    run({
      rusher_player_id: RB,
      rushing_yards: 5,
      yards_gained: 5,
      epa: 0.3,
      success: 1,
      down: 3,
      yardline_100: 8,
      defenders_in_box: 8,
      offense_personnel: '2 RB, 1 TE, 2 WR',
      posteam_score: 0,
      posteam_score_post: 7,
      rush_touchdown: 1,
      fixed_drive_result: 'Touchdown'
    }),
    pass({
      receiver_player_id: WR,
      air_yards: 25,
      epa: -0.7,
      qb_epa: -0.7,
      cp: 0.3,
      cpoe: -30,
      was_pressure: false,
      is_play_action: false,
      is_catchable_ball: false,
      n_blitzers: 0,
      n_pass_rushers: 4,
      defense_man_zone_type: 'MAN_COVERAGE',
      offense_personnel: '1 RB, 1 TE, 3 WR',
      fixed_drive: 2,
      fixed_drive_result: 'Punt',
      posteam_score: 7,
      posteam_score_post: 7
    }),
    run({
      posteam: 'KC',
      defteam: 'BUF',
      rusher_player_id: KC_RB,
      rushing_yards: -2,
      yards_gained: -2,
      epa: -0.6,
      success: 0,
      tackled_for_loss: 1,
      fixed_drive: 3,
      fixed_drive_result: 'Punt',
      posteam_score: 0,
      posteam_score_post: 0
    })
  ])
  const onField = (play: number, side: string, ids: string[]): Row[] =>
    ids.map((gsis) => ({ season: 2025, game_id: 'g1', play_id: play, side, gsis, position: null }))
  await seedTable(db, 'on_field', [
    ...[1, 2, 3, 4].flatMap((p) => [
      ...onField(p, 'O', [QB, WR, RB]),
      ...onField(p, 'D', [EDGE, CB])
    ]),
    ...onField(5, 'O', [KC_RB])
  ])
  await seedTable(db, 'play_players', [
    { season: 2025, game_id: 'g1', play_id: 2, role: 'sack', gsis: EDGE },
    { season: 2025, game_id: 'g1', play_id: 4, role: 'pass_defense', gsis: CB },
    { season: 2025, game_id: 'g1', play_id: 3, role: 'solo_tackle', gsis: CB },
    { season: 2025, game_id: 'g1', play_id: 5, role: 'solo_tackle', gsis: '00-0000020' }
  ])
  await seedTable(db, 'games', [
    {
      game_id: 'g1',
      season: 2025,
      game_type: 'REG',
      week: 1,
      gameday: '2025-09-07',
      gametime: '13:00',
      home_team: 'BUF',
      away_team: 'KC',
      home_score: 27,
      away_score: 20,
      spread_line: 2.5,
      total_line: 48.5,
      roof: 'outdoors',
      surface: 'grass',
      temp: 60,
      wind: 5,
      home_rest: 7,
      away_rest: 7
    },
    {
      game_id: 'g2',
      season: 2025,
      game_type: 'REG',
      week: 2,
      gameday: '2025-09-14',
      gametime: null,
      home_team: 'KC',
      away_team: 'BUF',
      home_score: null,
      away_score: null,
      spread_line: -1.5,
      total_line: 50,
      roof: 'dome',
      surface: 'turf',
      temp: null,
      wind: null,
      home_rest: 7,
      away_rest: 7
    }
  ])
  const player = (gsis_id: string, name: string, position_group: string): Row => ({
    gsis_id,
    name,
    position_group,
    pfr_id: `pfr${gsis_id.slice(-2)}`,
    espn_id: `espn${gsis_id.slice(-2)}`
  })
  await seedTable(db, 'players', [
    player(QB, 'Quinn Quarterback', 'QB'),
    player(WR, 'Wes Wideout', 'WR'),
    player(RB, 'Ray Runner', 'RB'),
    player(KC_RB, 'Kyle Carrier', 'RB'),
    player(EDGE, 'Eddie Edge', 'DL'),
    player(CB, 'Cory Corner', 'DB')
  ])
  await seedTable(db, 'src_rosters', [
    { gsis_id: WR, season: 2025, week: 1, position: 'WR' },
    { gsis_id: RB, season: 2025, week: 1, position: 'RB' }
  ])
  await seedTable(db, 'src_player_stats', [
    {
      player_id: QB,
      season: 2025,
      week: 1,
      season_type: 'REG',
      game_id: 'g1',
      team: 'BUF',
      fumbles_total: 1,
      fumbles_lost_total: 0
    },
    {
      player_id: WR,
      season: 2025,
      week: 1,
      season_type: 'REG',
      game_id: 'g1',
      team: 'BUF',
      kickoff_returns: 2,
      kickoff_return_yards: 50
    }
  ])
  await seedTable(db, 'src_snaps', [
    {
      pfr_player_id: 'pfr02',
      season: 2025,
      week: 1,
      season_type: 'REG',
      game_id: 'g1',
      team: 'BUF',
      offense_snaps: 48,
      offense_pct: 0.8,
      defense_snaps: 0,
      defense_pct: 0,
      st_snaps: 3
    }
  ])
  await seedTable(db, 'src_ngs_receiving', [
    {
      player_gsis_id: WR,
      season: 2025,
      season_type: 'REG',
      week: 1,
      targets: 2,
      receptions: 1,
      avg_separation: 3,
      avg_cushion: 6,
      avg_yac_above_expectation: 3
    },
    {
      player_gsis_id: WR,
      season: 2025,
      season_type: 'REG',
      week: 0,
      targets: 2,
      receptions: 1,
      avg_separation: 2.5,
      avg_cushion: 6,
      avg_yac_above_expectation: 3
    }
  ])
  await seedTable(db, 'src_qbr_week', [
    { player_id: 'espn01', season: 2025, season_type: 'REG', week: 1, qbr_total: 70, qb_plays: 4 }
  ])
  await seedTable(db, 'src_qbr_season', [
    { player_id: 'espn01', season: 2025, season_type: 'REG', qbr_total: 65, qb_plays: 4 }
  ])
  await seedTable(db, 'src_pfr_def', [
    {
      pfr_player_id: 'pfr11',
      season: 2025,
      season_type: 'REG',
      week: 1,
      def_targets: 1,
      def_completions_allowed: 0,
      def_yards_allowed: 0,
      def_receiving_td_allowed: 0,
      def_ints: 0,
      def_yards_after_catch: 0,
      def_adot: 25,
      def_times_blitzed: 0,
      def_times_hurried: 0,
      def_pressures: 0,
      def_missed_tackles: 0,
      def_tackles_combined: 1
    }
  ])
  await seedTable(db, 'src_ff_opportunity', [
    {
      player_id: WR,
      season: 2025,
      season_type: 'REG',
      week: 1,
      receptions_exp: 1.2,
      rec_yards_gained_exp: 14,
      rush_yards_gained_exp: 0,
      total_touchdown_exp: 0.1,
      total_touchdown: 0,
      rec_attempt: 2,
      rec_touchdown_exp: 0.1,
      rec_first_down_exp: 0.6,
      rec_two_point_conv_exp: 0,
      pass_attempt: 0,
      rush_attempt: 0
    }
  ])
  await seedTable(db, 'sleeper_ids', [{ sleeper_id: '9001', gsis_id: WR, resolution: 'crosswalk' }])
  await seedTable(db, 'src_sleeper_players', [
    {
      season: 2025,
      player_id: '9001',
      first_name: 'Wes',
      last_name: 'Wideout',
      position: 'WR',
      team: 'BUF'
    }
  ])
  await seedTable(db, 'src_sleeper', [
    {
      season: 2025,
      season_type: 'REG',
      week: 1,
      player_id: '9001',
      team: 'BUF',
      opponent: 'KC',
      game_id: 'x',
      gp: 1,
      rec: 1,
      rec_yd: 20,
      rec_tgt: 2
    }
  ])
  await seedTable(db, 'src_sleeper_def', [
    {
      season: 2025,
      season_type: 'REG',
      week: 1,
      player_id: 'KC',
      team: 'KC',
      opponent: 'BUF',
      game_id: 'x',
      gp: 1,
      pts_allow: 27,
      sack: 1
    }
  ])
}
