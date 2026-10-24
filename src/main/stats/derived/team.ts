import { NEUTRAL, TEAM_PLAY_COMPONENTS } from './plays'
import { columnsOf, groupAvailable, type Built, type Have } from './sql'

/** Special teams from nflverse `stats_team` (spec §6.2 Teams). */
export const TEAM_BOX_COMPONENTS: Record<string, string> = {
  fg_made: 'fg_made',
  fg_att: 'fg_att',
  punts: 'pt_att',
  punt_net_yds: 'pt_net_yards',
  kr: 'kickoff_returns',
  kr_yds: 'kickoff_return_yards',
  pr: 'punt_returns',
  pr_yds: 'punt_return_yards',
  st_tds: 'special_teams_tds'
}

/** Every summed column of `team_week` and `team_season`. */
export function teamComponentNames(): string[] {
  return [
    ...TEAM_PLAY_COMPONENTS.flatMap((c) => [`off_${c.name}`, `def_${c.name}`]),
    ...Object.keys(TEAM_BOX_COMPONENTS),
    'games',
    'wins',
    'losses',
    'ties',
    'points_for',
    'points_against',
    'drives',
    'drive_points',
    'td_drives',
    'three_and_outs',
    'drive_start_sum',
    'def_drives',
    'def_drive_points',
    'rz_drives',
    'rz_td_drives',
    'def_rz_drives',
    'def_rz_td_drives',
    'pace_secs',
    'pace_plays',
    'implied_points',
    'line_margin',
    'total_line'
  ]
}

/**
 * `team_week` (spec §5.2): one row per team × game of one season, scheduled games included
 * (`games` = 0 until played). Offense (`off_`, by `posteam`) and defense (`def_`, by `defteam`)
 * from the same play components; the result and the betting lines from `games`; drives; neutral
 * pace; special teams from the box score.
 */
export function teamWeekSelect(have: Have, season: number): Built {
  const expr = (c: (typeof TEAM_PLAY_COMPONENTS)[number]): string =>
    groupAvailable(have, c.group) ? c.expr : 'NULL::DOUBLE'
  const side = (prefix: 'off' | 'def', team: 'posteam' | 'defteam'): string =>
    `SELECT p.${team} AS team, p.game_id,
            ${TEAM_PLAY_COMPONENTS.map((c) => `sum(${expr(c)}) AS ${prefix}_${c.name}`).join(', ')}
     FROM plays p WHERE p.${team} IS NOT NULL AND p.season = ${season} GROUP BY ALL`
  const boxCols = columnsOf(have, 'src_team_stats')
  const box = boxCols.has('game_id')
    ? 'src_team_stats'
    : '(SELECT NULL::VARCHAR AS team, NULL::VARCHAR AS game_id)'
  const sql = `
    WITH off_side AS (${side('off', 'posteam')}),
    def_side AS (${side('def', 'defteam')}),
    drive AS (
      SELECT p.game_id, p.posteam AS team, p.fixed_drive,
             max(p.posteam_score_post) - min(p.posteam_score) AS points,
             any_value(p.fixed_drive_result) = 'Touchdown' AS td,
             count(*) FILTER (p.counts AND p.play_type IN ('pass', 'run')) <= 3
               AND any_value(p.fixed_drive_result) = 'Punt' AS three_out,
             arg_min(p.yardline_100, p.play_id) AS start_yardline,
             coalesce(bool_or(p.yardline_100 <= 20), false) AS rz
      FROM plays p
      WHERE p.posteam IS NOT NULL AND p.fixed_drive IS NOT NULL AND p.season = ${season}
        AND coalesce(p.kickoff_attempt, 0) = 0
      GROUP BY ALL
    ),
    drives AS (
      SELECT game_id, team, count(*) AS drives, sum(points) AS drive_points,
             count(*) FILTER (td) AS td_drives, count(*) FILTER (three_out) AS three_and_outs,
             sum(start_yardline) AS drive_start_sum,
             count(*) FILTER (rz) AS rz_drives, count(*) FILTER (rz AND td) AS rz_td_drives
      FROM drive GROUP BY ALL
    ),
    pace AS (
      SELECT game_id, team, sum(secs) AS pace_secs, count(*) AS pace_plays
      FROM (SELECT p.game_id, p.posteam AS team,
                   lag(p.game_seconds_remaining) OVER (PARTITION BY p.game_id, p.fixed_drive ORDER BY p.play_id)
                     - p.game_seconds_remaining AS secs,
                   ${NEUTRAL} AND p.counts AND p.play_type IN ('pass', 'run') AS neutral
            FROM plays p WHERE p.posteam IS NOT NULL AND p.season = ${season})
      WHERE neutral AND secs BETWEEN 1 AND 60 GROUP BY ALL
    ),
    sides AS (
      SELECT game_id, season, game_type, week, home_team AS team, away_team AS opponent, true AS home,
             home_score AS points_for, away_score AS points_against, spread_line AS margin,
             total_line, roof, surface, temp, wind, home_rest AS rest
      FROM games WHERE season = ${season}
      UNION ALL
      SELECT game_id, season, game_type, week, away_team, home_team, false, away_score, home_score,
             -spread_line, total_line, roof, surface, temp, wind, away_rest
      FROM games WHERE season = ${season}
    )
    SELECT s.team, s.season, CASE WHEN s.game_type = 'REG' THEN 'REG' ELSE 'POST' END AS season_type,
           s.week, s.game_id, s.opponent, s.home, s.roof, s.surface, s.temp, s.wind, s.rest,
           s.margin AS line_margin, s.total_line, (s.total_line + s.margin) / 2 AS implied_points,
           (s.points_for IS NOT NULL)::INT AS games,
           (s.points_for > s.points_against)::INT AS wins,
           (s.points_for < s.points_against)::INT AS losses,
           (s.points_for = s.points_against)::INT AS ties,
           s.points_for, s.points_against,
           o.* EXCLUDE (team, game_id), d.* EXCLUDE (team, game_id),
           dr.drives, dr.drive_points, dr.td_drives, dr.three_and_outs, dr.drive_start_sum,
           od.drives AS def_drives, od.drive_points AS def_drive_points,
           dr.rz_drives, dr.rz_td_drives,
           od.rz_drives AS def_rz_drives, od.rz_td_drives AS def_rz_td_drives,
           pc.pace_secs, pc.pace_plays,
           ${Object.entries(TEAM_BOX_COMPONENTS)
             .map(([name, col]) => `${boxCols.has(col) ? `b.${col}` : 'NULL::DOUBLE'} AS ${name}`)
             .join(', ')}
    FROM sides s
    LEFT JOIN off_side o ON o.team = s.team AND o.game_id = s.game_id
    LEFT JOIN def_side d ON d.team = s.team AND d.game_id = s.game_id
    LEFT JOIN drives dr ON dr.team = s.team AND dr.game_id = s.game_id
    LEFT JOIN drives od ON od.team = s.opponent AND od.game_id = s.game_id
    LEFT JOIN pace pc ON pc.team = s.team AND pc.game_id = s.game_id
    LEFT JOIN ${box} b ON b.team = s.team AND b.game_id = s.game_id`
  return { sql }
}

/** `team_season`: `team_week` summed by season type, played games only. */
export function teamSeasonSelect(season: number): Built {
  return {
    sql: `SELECT team, season, season_type,
                 ${teamComponentNames()
                   .map((c) => `sum(${c}) AS ${c}`)
                   .join(', ')}
          FROM team_week WHERE games = 1 AND season = ${season} GROUP BY ALL`
  }
}
