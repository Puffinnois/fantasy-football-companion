import { CROSSWALK_URL, NFLVERSE_RELEASES_URL } from '@main/sources/nflverse'
import { sqlIdent, sqlString } from './db'
import type { Columns } from './load'

export const FF_OPPORTUNITY_RELEASE =
  'https://github.com/ffverse/ffopportunity/releases/download/latest-data'

/** Stats-analysis spec §4: 2019 through the current season, as the warehouse before it. */
export const STATS_FIRST_SEASON = 2019
/** FTN charting starts in 2022. */
export const FTN_FIRST_SEASON = 2022
/** From 2025 nflverse publishes depth charts as timestamped snapshots, not weekly rows. */
export const DEPTH_SNAPSHOT_FIRST_SEASON = 2025

const nflverse = (tag: string, name: string): string =>
  `${NFLVERSE_RELEASES_URL}/${tag}/${name}.parquet`

const parquet = (path: string): string => `read_parquet(${sqlString(path)})`

/** What a source's extra tables are built from: the downloaded file and its columns. */
export interface FileContext {
  from: string
  columns: Columns
  season: number
  /** Replaces this season's rows of `table` with `select` (the sync's loader); returns its rows. */
  replace(table: string, select: string): Promise<number>
}

export interface FileSource {
  /** `stats:<id>:<season>` (or `stats:<id>`) in `sync_log`, `<id>` in `source_state`. */
  id: string
  table: string
  /** Bump to re-fetch sealed seasons after a change to how the source is stored. */
  version: number
  firstSeason: number
  lastSeason?: number
  /** One file holding every season, fetched as season 0. */
  allSeasons: boolean
  url(season: number): string
  /** The table function reading the downloaded file. */
  read(path: string): string
  /**
   * Spec §4.1 standard columns by expression over the file's columns (see `standardSelect`); it
   * gets the file's columns so it can leave out what the file lacks.
   */
  standard(season: number, columns: Columns): Record<string, string>
  exclude?: (column: string) => boolean
  /** A filter over the file's columns. */
  where?: string
  /** Tables built from the same file, replaced for the same season; returns their rows. */
  extra?: (ctx: FileContext) => Promise<number>
}

const team = (column: string): string => `nfl_team(${column})`
/** nflverse files that spell the season type as a game type (REG / WC / DIV / CON / SB). */
const gameType = { season_type: 'season_type_of(game_type)' }
/** ESPN spells season types "Regular" / "Playoffs". */
const ESPN_SEASON_TYPE =
  "CASE season_type WHEN 'Regular' THEN 'REG' WHEN 'Playoffs' THEN 'POST' ELSE season_type END"
/** Regular-season weeks: 17 through 2020, 18 since. */
export const regularWeeks = (season: number): number => (season <= 2020 ? 17 : 18)

function seasonFile(
  id: string,
  table: string,
  url: (season: number) => string,
  standard: FileSource['standard'],
  rest: Partial<FileSource> = {}
): FileSource {
  return {
    id,
    table,
    version: 1,
    firstSeason: STATS_FIRST_SEASON,
    allSeasons: false,
    url,
    read: parquet,
    standard,
    ...rest
  }
}

function allSeasonsFile(
  id: string,
  table: string,
  url: string,
  standard: Record<string, string>,
  rest: Partial<FileSource> = {}
): FileSource {
  return {
    id,
    table,
    version: 1,
    firstSeason: STATS_FIRST_SEASON,
    allSeasons: true,
    url: () => url,
    read: parquet,
    standard: () => standard,
    ...rest
  }
}

/** Play-by-play columns not stored (spec §4.2): running totals, duplicates, names, game-level copies. */
const PBP_DROPPED =
  /^total_(home|away)_|_player_name$|_jersey_number$|^(solo_tackle|assist_tackle|tackle_with_assist|fumbled|fumble_recovery|forced_fumble_player)_\d_team$|^(fantasy|fantasy_id|fantasy_player_id|fantasy_player_name|name|id|passer|rusher|receiver|jersey_number|time_of_day|end_clock_time|drive_real_start_time|start_time|order_sequence|away_wp|home_wp|def_wp|away_wp_post|home_wp_post|vegas_home_wp|vegas_home_wpa|no_score_prob|opp_td_prob|opp_fg_prob|safety_prob|opp_safety_prob|td_prob|fg_prob|nfl_api_id|old_game_id|stadium|game_stadium|stadium_id|home_coach|away_coach|weather|temp|wind|roof|surface|spread_line|total_line|result|total|home_score|away_score|div_game|location|game_date|home_opening_kickoff)$/

/** Team-coded play-by-play columns, normalised like every other source. */
const PBP_TEAMS = [
  'posteam',
  'defteam',
  'home_team',
  'away_team',
  'side_of_field',
  'return_team',
  'penalty_team',
  'td_team',
  'timeout_team'
]

/** Every play-by-play column naming a player, with the role `play_players` gives it (spec §4.2). */
export const PLAY_PLAYER_ROLES: Record<string, string> = {
  passer_player_id: 'passer',
  passer_id: 'dropback',
  rusher_player_id: 'rusher',
  receiver_player_id: 'receiver',
  interception_player_id: 'interception',
  sack_player_id: 'sack',
  half_sack_1_player_id: 'half_sack',
  half_sack_2_player_id: 'half_sack',
  qb_hit_1_player_id: 'qb_hit',
  qb_hit_2_player_id: 'qb_hit',
  tackle_for_loss_1_player_id: 'tackle_for_loss',
  tackle_for_loss_2_player_id: 'tackle_for_loss',
  solo_tackle_1_player_id: 'solo_tackle',
  solo_tackle_2_player_id: 'solo_tackle',
  assist_tackle_1_player_id: 'assist_tackle',
  assist_tackle_2_player_id: 'assist_tackle',
  assist_tackle_3_player_id: 'assist_tackle',
  assist_tackle_4_player_id: 'assist_tackle',
  tackle_with_assist_1_player_id: 'tackle_with_assist',
  tackle_with_assist_2_player_id: 'tackle_with_assist',
  pass_defense_1_player_id: 'pass_defense',
  pass_defense_2_player_id: 'pass_defense',
  forced_fumble_player_1_player_id: 'forced_fumble',
  forced_fumble_player_2_player_id: 'forced_fumble',
  fumbled_1_player_id: 'fumbled',
  fumbled_2_player_id: 'fumbled',
  fumble_recovery_1_player_id: 'fumble_recovery',
  fumble_recovery_2_player_id: 'fumble_recovery',
  kicker_player_id: 'kicker',
  punter_player_id: 'punter',
  kickoff_returner_player_id: 'kick_returner',
  punt_returner_player_id: 'punt_returner',
  own_kickoff_recovery_player_id: 'own_kickoff_recovery',
  blocked_player_id: 'blocked_kick',
  td_player_id: 'touchdown',
  safety_player_id: 'safety',
  penalty_player_id: 'penalty',
  lateral_receiver_player_id: 'lateral_receiver',
  lateral_rusher_player_id: 'lateral_rusher',
  lateral_interception_player_id: 'lateral_interception',
  lateral_sack_player_id: 'lateral_sack',
  lateral_kickoff_returner_player_id: 'lateral_returner',
  lateral_punt_returner_player_id: 'lateral_returner'
}

/** `play_players` for one season: every player a non-deleted play names, with a role. */
async function playPlayers({ from, columns, season, replace }: FileContext): Promise<number> {
  const roles = Object.entries(PLAY_PLAYER_ROLES).filter(([column]) => columns.has(column))
  const role = `CASE col ${roles.map(([c, r]) => `WHEN '${c}' THEN '${r}'`).join(' ')} END`
  const deleted = columns.has('play_deleted') ? 'AND coalesce(play_deleted, 0) = 0' : ''
  const select = `SELECT ${season} AS season, game_id, play_id, ${role} AS role, gsis FROM (
      UNPIVOT (SELECT game_id, play_id::INTEGER AS play_id, ${roles.map(([c]) => sqlIdent(c)).join(', ')}
               FROM ${from} WHERE season_type IN ('REG', 'POST') ${deleted})
      ON ${roles.map(([c]) => sqlIdent(c)).join(', ')} INTO NAME col VALUE gsis)`
  return replace('play_players', select)
}

/** Participation lists the players on the field as "id;id;…" (positions from 2023 only). */
async function onField({ from, columns, season, replace }: FileContext): Promise<number> {
  const side = (name: 'offense' | 'defense', code: string): string => {
    const pos = columns.has(`${name}_positions`)
      ? `unnest(string_split(${name}_positions, ';'))`
      : 'NULL::VARCHAR'
    return `SELECT nflverse_game_id AS game_id, play_id::INTEGER AS play_id, '${code}' AS side,
              unnest(string_split(${name}_players, ';')) AS gsis, ${pos} AS position
            FROM ${from} WHERE coalesce(${name}_players, '') <> ''`
  }
  const select = `SELECT ${season} AS season, * FROM (${side('offense', 'O')} UNION ALL ${side('defense', 'D')})`
  return replace('on_field', select)
}

const PARTICIPATION_LISTS = [
  'offense_players',
  'defense_players',
  'offense_names',
  'defense_names',
  'offense_positions',
  'defense_positions',
  'offense_numbers',
  'defense_numbers',
  'players_on_play',
  'nflverse_game_id'
]

/** Spec §4.1–§4.2, in sync order: identity first, the schedule before depth charts. */
export const FILE_SOURCES: FileSource[] = [
  allSeasonsFile(
    'schedules',
    'games',
    nflverse('schedules', 'games'),
    {
      home_team: team('home_team'),
      away_team: team('away_team')
    },
    { where: `season >= ${STATS_FIRST_SEASON}` }
  ),
  allSeasonsFile('players', 'src_players', nflverse('players', 'players'), {
    latest_team: team('latest_team')
  }),
  allSeasonsFile(
    'crosswalk',
    'src_crosswalk',
    CROSSWALK_URL,
    {},
    {
      read: (path) =>
        `read_csv(${sqlString(path)}, header = true, all_varchar = true, nullstr = 'NA')`
    }
  ),
  allSeasonsFile('combine', 'src_combine', nflverse('combine', 'combine'), {}),
  seasonFile(
    'player_stats',
    'src_player_stats',
    (s) => nflverse('stats_player', `stats_player_week_${s}`),
    () => ({
      team: team('team'),
      opponent_team: team('opponent_team')
    })
  ),
  seasonFile(
    'team_stats',
    'src_team_stats',
    (s) => nflverse('stats_team', `stats_team_week_${s}`),
    () => ({
      team: team('team'),
      opponent_team: team('opponent_team')
    })
  ),
  seasonFile(
    'snaps',
    'src_snaps',
    (s) => nflverse('snap_counts', `snap_counts_${s}`),
    () => ({
      team: team('team'),
      opponent: team('opponent'),
      ...gameType
    })
  ),
  seasonFile(
    'ff_opportunity',
    'src_ff_opportunity',
    (s) => `${FF_OPPORTUNITY_RELEASE}/ep_weekly_${s}.parquet`,
    (s) => ({
      team: team('posteam'),
      season_type: `CASE WHEN week > ${regularWeeks(s)} THEN 'POST' ELSE 'REG' END`
    })
  ),
  ...(['passing', 'rushing', 'receiving'] as const).map((kind) =>
    allSeasonsFile(
      `ngs_${kind}`,
      `src_ngs_${kind}`,
      nflverse('nextgen_stats', `ngs_${kind}`),
      {
        team_abbr: team('team_abbr'),
        team: team('team_abbr')
      },
      { where: `season >= ${STATS_FIRST_SEASON}` }
    )
  ),
  ...(['pass', 'rush', 'rec', 'def'] as const).map((kind) =>
    seasonFile(
      `pfr_${kind}`,
      `src_pfr_${kind}`,
      (s) => nflverse('pfr_advstats', `advstats_week_${kind}_${s}`),
      () => ({
        team: team('team'),
        opponent: team('opponent'),
        ...gameType
      })
    )
  ),
  // ESPN's `team` is the nickname; it moves to `team_name` and `team` takes the code. Its season
  // type is spelled "Regular" / "Playoffs" (version 2: REG / POST, as in every other table).
  allSeasonsFile(
    'qbr_week',
    'src_qbr_week',
    nflverse('espn_data', 'qbr_week_level'),
    {
      team_name: 'team',
      team_abb: team('team_abb'),
      opp_abb: team('opp_abb'),
      team: team('team_abb'),
      opponent: team('opp_abb'),
      week: 'game_week::INTEGER',
      season_type: ESPN_SEASON_TYPE
    },
    { where: `season >= ${STATS_FIRST_SEASON}`, version: 2 }
  ),
  allSeasonsFile(
    'qbr_season',
    'src_qbr_season',
    nflverse('espn_data', 'qbr_season_level'),
    {
      team_name: 'team',
      team_abb: team('team_abb'),
      team: team('team_abb'),
      season_type: ESPN_SEASON_TYPE
    },
    { where: `season >= ${STATS_FIRST_SEASON}`, version: 2 }
  ),
  seasonFile(
    'injuries',
    'src_injuries',
    (s) => nflverse('injuries', `injuries_${s}`),
    () => ({
      team: team('team'),
      ...gameType
    })
  ),
  seasonFile(
    'depth_charts',
    'src_depth_charts',
    (s) => nflverse('depth_charts', `depth_charts_${s}`),
    () => ({
      club_code: team('club_code'),
      team: team('club_code'),
      ...gameType
    }),
    // 2: `club_code` normalised in place (review of Plan X); re-fetches the sealed seasons.
    { lastSeason: DEPTH_SNAPSHOT_FIRST_SEASON - 1, version: 2 }
  ),
  seasonFile(
    'depth_chart_snapshots',
    'src_depth_chart_snapshots',
    (s) => nflverse('depth_charts', `depth_charts_${s}`),
    (s) => ({
      season: String(s),
      team: team('team')
    }),
    { firstSeason: DEPTH_SNAPSHOT_FIRST_SEASON }
  ),
  seasonFile(
    'rosters',
    'src_rosters',
    (s) => nflverse('weekly_rosters', `roster_weekly_${s}`),
    () => ({
      team: team('team'),
      ...gameType
    })
  ),
  seasonFile(
    'pbp',
    'src_pbp',
    (s) => nflverse('pbp', `play_by_play_${s}`),
    (_, columns) => ({
      ...Object.fromEntries(PBP_TEAMS.filter((c) => columns.has(c)).map((c) => [c, team(c)])),
      play_id: 'play_id::INTEGER'
    }),
    {
      exclude: (column) => PBP_DROPPED.test(column),
      where: "season_type IN ('REG', 'POST')",
      extra: playPlayers
    }
  ),
  seasonFile(
    'ftn',
    'src_ftn',
    (s) => nflverse('ftn_charting', `ftn_charting_${s}`),
    () => ({
      game_id: 'nflverse_game_id',
      play_id: 'nflverse_play_id::INTEGER'
    }),
    {
      firstSeason: FTN_FIRST_SEASON,
      exclude: (column) => column === 'nflverse_game_id' || column === 'nflverse_play_id'
    }
  ),
  seasonFile(
    'participation',
    'src_participation',
    (s) => nflverse('pbp_participation', `pbp_participation_${s}`),
    (s) => ({
      season: String(s),
      game_id: 'nflverse_game_id',
      play_id: 'play_id::INTEGER',
      possession_team: team('possession_team')
    }),
    {
      exclude: (column) => PARTICIPATION_LISTS.includes(column),
      extra: onField
    }
  )
]
