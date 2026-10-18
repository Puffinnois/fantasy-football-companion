import type { StatsDb } from '../db'
import { columnsOf, type Have } from '../derived/sql'
import { STATS_FIRST_SEASON } from '../sources'
import type { EpaCell } from './adjusted'
import type { EloGame } from './elo'
import type { FieldGoalAttempt } from './fieldGoal'

/** What the models read from the raw layer (stats-analysis spec §8); a missing column reads as NULL. */

/** `alias.column`, or a typed NULL when the table lacks it (a source can drop a column). */
export const col =
  (have: Have, table: string, alias: string) =>
  (name: string, type = 'DOUBLE'): string =>
    columnsOf(have, table).has(name) ? `${alias}.${name}` : `NULL::${type}`

/** A neutral site, from the schedule's location (alias `g`). */
const neutralOf = (have: Have): string =>
  `coalesce(${col(have, 'games', 'g')('location', 'VARCHAR')} = 'Neutral', false)`

/** Every game since 2019, played or scheduled; the margin is home minus away. */
export async function loadGames(db: StatsDb, have: Have): Promise<EloGame[]> {
  const g = col(have, 'games', 'g')
  return db.all<EloGame>(
    `SELECT g.game_id, g.season, season_type_of(g.game_type) AS season_type, g.week, g.home_team,
            g.away_team, ${neutralOf(have)} AS neutral,
            (g.home_score - g.away_score)::DOUBLE AS result,
            ${g('spread_line')}::DOUBLE AS spread_line,
            ${g('home_moneyline')}::DOUBLE AS home_moneyline,
            ${g('away_moneyline')}::DOUBLE AS away_moneyline
     FROM games g
     WHERE g.season >= ${STATS_FIRST_SEASON} AND season_type_of(g.game_type) IS NOT NULL`
  )
}

export type PlayKind = 'pass' | 'rush'
export type SeasonCell = EpaCell & { season: number; kind: PlayKind }

/**
 * Scrimmage plays summed by offense × defense × home × week and kind (dropbacks, other runs),
 * garbage time left out (spec §8.2: the fourth quarter with win probability outside 10–90 %).
 */
export async function loadCells(db: StatsDb, have: Have): Promise<SeasonCell[]> {
  return db.all<SeasonCell>(
    `SELECT p.season, p.week, p.posteam AS off, p.defteam AS def,
            CASE WHEN ${neutralOf(have)} THEN 0 WHEN p.posteam = g.home_team THEN 1 ELSE -1 END AS home,
            CASE WHEN p.is_dropback THEN 'pass' ELSE 'rush' END AS kind,
            count(*)::DOUBLE AS plays, sum(p.epa) AS epa
     FROM plays p JOIN games g ON g.game_id = p.game_id
     WHERE p.counts AND p.play_type IN ('pass', 'run') AND p.epa IS NOT NULL
       AND p.posteam IS NOT NULL AND p.defteam IS NOT NULL
       AND NOT (p.qtr = 4 AND (p.wp < 0.1 OR p.wp > 0.9))
     GROUP BY ALL`
  )
}

export interface Kick extends FieldGoalAttempt {
  season_type: 'REG' | 'POST'
  week: number
  kicker: string | null
  team: string | null
}

/** Every field-goal attempt with its kicker, team and weather. */
export async function loadFieldGoals(db: StatsDb, have: Have): Promise<Kick[]> {
  const p = col(have, 'plays', 'p')
  const g = col(have, 'games', 'g')
  const rows = await db.all<Omit<Kick, 'made'> & { made: unknown }>(
    `SELECT p.game_id, p.play_id::INTEGER AS play_id, p.season, p.season_type, p.week,
            ${p('kicker_player_id', 'VARCHAR')} AS kicker, p.posteam AS team,
            ${p('kick_distance')}::DOUBLE AS distance,
            ${p('field_goal_result', 'VARCHAR')} = 'made' AS made, ${g('roof', 'VARCHAR')} AS roof,
            ${g('surface', 'VARCHAR')} AS surface, ${g('temp')}::DOUBLE AS temp,
            ${g('wind')}::DOUBLE AS wind
     FROM plays p JOIN games g ON g.game_id = p.game_id
     WHERE ${p('field_goal_attempt')} = 1 AND ${p('kick_distance')} IS NOT NULL`
  )
  return rows.map((r) => ({ ...r, made: r.made === true }))
}

/**
 * Turnover luck components (spec §8.3) by team and week. Fumbles: the team's own and its
 * opponents', and those lost. Interceptions (FTN, 2022+): thrown and taken, and the expected number
 * (interception-worthy throws × that season's league rate of interceptions per such throw, since
 * FTN's charting changed: 0.44 in 2022, 0.69 in 2025). Without FTN, the expected ones are NULL.
 */
export function turnoversSql(have: Have): string {
  const p = col(have, 'plays', 'p')
  return `
  WITH att AS (
    SELECT p.season, p.week, p.posteam, p.defteam, coalesce(${p('fumble')}, 0) = 1 AS fumble,
           coalesce(${p('fumble_lost')}, 0) = 1 AS lost,
           coalesce(${p('pass_attempt')}, 0) = 1 AND coalesce(${p('sack')}, 0) = 0 AS attempt,
           coalesce(${p('interception')}, 0) = 1 AS int,
           ${p('is_interception_worthy', 'BOOLEAN')} AS worthy
    FROM plays p WHERE p.counts AND p.play_type IN ('pass', 'run')
  ),
  rate AS (
    SELECT season,
           count(*) FILTER (attempt AND int)::DOUBLE
             / nullif(count(*) FILTER (attempt AND worthy), 0) AS r
    FROM att WHERE worthy IS NOT NULL GROUP BY season
  ),
  side AS (
    SELECT season, week, posteam AS team, 'off' AS side, fumble, lost, attempt, int, worthy FROM att
    UNION ALL
    SELECT season, week, defteam, 'def', fumble, lost, attempt, int, worthy FROM att
  )
  SELECT s.team, s.season, s.week,
         count(*) FILTER (s.side = 'off' AND s.fumble) AS off_fumbles,
         count(*) FILTER (s.side = 'off' AND s.lost) AS off_fumbles_lost,
         count(*) FILTER (s.side = 'def' AND s.fumble) AS def_fumbles,
         count(*) FILTER (s.side = 'def' AND s.lost) AS def_fumbles_lost,
         count(*) FILTER (s.side = 'off' AND s.attempt AND s.worthy IS NOT NULL) AS off_ftn_att,
         count(*) FILTER (s.side = 'off' AND s.attempt AND s.worthy IS NOT NULL AND s.int) AS off_ftn_ints,
         count(*) FILTER (s.side = 'off' AND s.attempt AND s.worthy) * any_value(r.r) AS off_xints,
         count(*) FILTER (s.side = 'def' AND s.attempt AND s.worthy IS NOT NULL AND s.int) AS def_ftn_ints,
         count(*) FILTER (s.side = 'def' AND s.attempt AND s.worthy) * any_value(r.r) AS def_xints
  FROM side s LEFT JOIN rate r ON r.season = s.season
  WHERE s.team IS NOT NULL
  GROUP BY ALL`
}
