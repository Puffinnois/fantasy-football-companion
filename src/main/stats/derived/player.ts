import { PLAYER_PLAY_COMPONENTS, ROLE_SOURCES, type PlayComponent, type Role } from './plays'
import { groupAvailable, hasAll, postWeek, sums, type Built, type Have } from './sql'

/**
 * Box-score components from nflverse `stats_player` (spec §6.2 Traditional): what plays do not
 * carry well (kicking and punting buckets, returns, fumbles, penalties) or where the official
 * count differs from the plays (tackles for loss before 2024).
 */
export const BOX_COMPONENTS: Record<string, string> = {
  fumbles: 'fumbles_total',
  fumbles_lost: 'fumbles_lost_total',
  penalties: 'penalties',
  penalty_yds: 'penalty_yards',
  st_tds: 'special_teams_tds',
  tfl: 'def_tackles_for_loss',
  def_tds: 'def_tds',
  kr: 'kickoff_returns',
  kr_yds: 'kickoff_return_yards',
  pr: 'punt_returns',
  pr_yds: 'punt_return_yards',
  fg_made: 'fg_made',
  fg_att: 'fg_att',
  fg_made_0_19: 'fg_made_0_19',
  fg_made_20_29: 'fg_made_20_29',
  fg_made_30_39: 'fg_made_30_39',
  fg_made_40_49: 'fg_made_40_49',
  fg_made_50_59: 'fg_made_50_59',
  fg_made_60p: 'fg_made_60_',
  fg_missed_0_19: 'fg_missed_0_19',
  fg_missed_20_29: 'fg_missed_20_29',
  fg_missed_30_39: 'fg_missed_30_39',
  fg_missed_40_49: 'fg_missed_40_49',
  fg_missed_50_59: 'fg_missed_50_59',
  fg_missed_60p: 'fg_missed_60_',
  pat_made: 'pat_made',
  pat_att: 'pat_att',
  punts: 'pt_att',
  punt_yds: 'pt_yards',
  punt_net_yds: 'pt_net_yards',
  punt_in20: 'pt_inside_20',
  punt_tb: 'pt_touchback'
}

/**
 * Next Gen Stats, as sums weighted by NGS's own denominators. NGS publishes a week only for
 * players over its weekly minimum, so `player_season` takes these from the season rows (week 0).
 */
export const NGS_COMPONENTS: Record<'passing' | 'rushing' | 'receiving', Record<string, string>> = {
  passing: {
    ngs_pass_att: 'attempts',
    ngs_ttt_sum: 'avg_time_to_throw * attempts',
    ngs_aggr_sum: 'aggressiveness * attempts'
  },
  rushing: {
    ngs_rush_att: 'rush_attempts',
    ngs_ryoe: 'rush_yards_over_expected',
    ngs_roe_sum: 'rush_pct_over_expected * rush_attempts',
    ngs_box8_sum: 'percent_attempts_gte_eight_defenders * rush_attempts'
  },
  receiving: {
    ngs_targets: 'targets',
    ngs_receptions: 'receptions',
    ngs_sep_sum: 'avg_separation * targets',
    ngs_cushion_sum: 'avg_cushion * targets',
    ngs_yacoe_sum: 'avg_yac_above_expectation * receptions'
  }
}

/** PFR advanced stats (weekly, keyed by PFR id). */
const PFR_COMPONENTS: Record<'pass' | 'rush' | 'rec' | 'def', Record<string, string>> = {
  pass: {
    pfr_bad_throws: 'passing_bad_throws',
    pfr_times_pressured: 'times_pressured'
  },
  rush: {
    pfr_carries: 'carries',
    pfr_ybc: 'rushing_yards_before_contact',
    pfr_yac: 'rushing_yards_after_contact',
    pfr_rush_btkl: 'rushing_broken_tackles'
  },
  rec: {
    pfr_rec_btkl: 'receiving_broken_tackles'
  },
  def: {
    cov_targets: 'def_targets',
    cov_cmp: 'def_completions_allowed',
    cov_yds: 'def_yards_allowed',
    cov_td: 'def_receiving_td_allowed',
    cov_int: 'def_ints',
    cov_yac: 'def_yards_after_catch',
    cov_adot_sum: 'def_adot * def_targets',
    pfr_blitzes: 'def_times_blitzed',
    pfr_hurries: 'def_times_hurried',
    pfr_pressures: 'def_pressures',
    pfr_missed_tackles: 'def_missed_tackles',
    pfr_tackles: 'def_tackles_combined'
  }
}

/** ffopportunity's expected stats (spec §6.2 Fantasy opportunity); expected points are in `fantasy_week`. */
const FF_OPPORTUNITY_COMPONENTS: Record<string, string> = {
  x_rec: 'receptions_exp',
  x_rec_yds: 'rec_yards_gained_exp',
  x_rush_yds: 'rush_yards_gained_exp',
  x_td: 'total_touchdown_exp',
  ff_td: 'total_touchdown'
}

/** Team context joined into each player-week, for shares (spec §5.2). */
export const TEAM_CONTEXT: Record<string, string> = {
  tm_targets: 'off_targets',
  tm_air_yds: 'off_pass_air_yds',
  tm_carries: 'off_carries',
  tm_dropbacks: 'off_dropbacks',
  tm_rz_targets: 'off_rz_targets',
  tm_rz_carries: 'off_rz_carries'
}

const SNAP_COMPONENTS: Record<string, string> = {
  off_snaps: 's.offense_snaps',
  def_snaps: 's.defense_snaps',
  st_snaps: 's.st_snaps',
  tm_off_snaps: 'CASE WHEN s.offense_pct > 0 THEN round(s.offense_snaps / s.offense_pct) END',
  tm_def_snaps: 'CASE WHEN s.defense_pct > 0 THEN round(s.defense_snaps / s.defense_pct) END'
}

const NGS_NAMES = Object.values(NGS_COMPONENTS).flatMap((c) => Object.keys(c))

/** Every summed column of `player_week` and `player_season`. */
export function playerComponentNames(): string[] {
  return [
    ...new Set([
      ...PLAYER_PLAY_COMPONENTS.map((c) => c.name),
      ...Object.keys(BOX_COMPONENTS),
      ...Object.keys(SNAP_COMPONENTS),
      ...NGS_NAMES,
      ...Object.values(PFR_COMPONENTS).flatMap((c) => Object.keys(c)),
      'qbr_sum',
      'qbr_plays',
      ...Object.keys(FF_OPPORTUNITY_COMPONENTS),
      ...Object.keys(TEAM_CONTEXT),
      'routes_est',
      'games'
    ])
  ]
}

const KEY = 'gsis_id, season, season_type, week'

/**
 * One source's weekly aggregate, one row per `KEY`. `context` parts also give the game and the
 * team (plays, box score, snaps).
 */
interface Part {
  tables: string[]
  sql: string
  components: string[]
  context: boolean
}

function rolePart(role: Role, components: PlayComponent[], season: number): Part {
  const src = ROLE_SOURCES[role]
  return {
    tables: src.tables,
    sql: `SELECT ${src.id} AS gsis_id, p.season, p.season_type, p.week,
                 any_value(p.game_id) AS game_id, any_value(${src.team}) AS team,
                 ${components.map((c) => `sum(${c.expr}) AS ${c.name}`).join(', ')}
          FROM ${src.from}
          WHERE ${src.id} IS NOT NULL AND ${src.where} AND p.season = ${season}
          GROUP BY ALL`,
    components: components.map((c) => c.name),
    context: true
  }
}

/** The per-role play aggregates; a component whose source is not loaded is NULL. */
function playParts(have: Have, season: number): Part[] {
  const byRole = new Map<Role, PlayComponent[]>()
  for (const c of PLAYER_PLAY_COMPONENTS) {
    const kept = groupAvailable(have, c.group) ? c : { ...c, expr: 'NULL::DOUBLE' }
    byRole.set(c.role, [...(byRole.get(c.role) ?? []), kept])
  }
  return [...byRole].map(([role, components]) => rolePart(role, components, season))
}

function sourceParts(have: Have, season: number): Part[] {
  const ngs = (kind: keyof typeof NGS_COMPONENTS): Part => ({
    tables: [`src_ngs_${kind}`],
    sql: `SELECT player_gsis_id AS gsis_id, season, season_type,
                 ${postWeek('season', 'season_type', 'week', 'ngs')} AS week,
                 ${sums(have, `src_ngs_${kind}`, NGS_COMPONENTS[kind])}
          FROM src_ngs_${kind} WHERE week > 0 AND season = ${season} GROUP BY ALL`,
    components: Object.keys(NGS_COMPONENTS[kind]),
    context: false
  })
  const pfr = (kind: keyof typeof PFR_COMPONENTS): Part => ({
    tables: [`src_pfr_${kind}`, 'players'],
    sql: `SELECT pl.gsis_id, s.season, s.season_type, s.week,
                 ${sums(have, `src_pfr_${kind}`, PFR_COMPONENTS[kind], 's')}
          FROM src_pfr_${kind} s JOIN players pl ON pl.pfr_id = s.pfr_player_id
          WHERE s.season = ${season} GROUP BY ALL`,
    components: Object.keys(PFR_COMPONENTS[kind]),
    context: false
  })
  return [
    {
      tables: ['src_player_stats'],
      sql: `SELECT player_id AS gsis_id, season, season_type, week, any_value(game_id) AS game_id,
                   any_value(team) AS team, ${sums(have, 'src_player_stats', BOX_COMPONENTS)}
            FROM src_player_stats WHERE season = ${season} GROUP BY ALL`,
      components: Object.keys(BOX_COMPONENTS),
      context: true
    },
    {
      tables: ['src_snaps', 'players'],
      sql: `SELECT pl.gsis_id, s.season, s.season_type, s.week, any_value(s.game_id) AS game_id,
                   any_value(s.team) AS team,
                   ${Object.entries(SNAP_COMPONENTS)
                     .map(([name, expr]) => `sum(${expr}) AS ${name}`)
                     .join(', ')}
            FROM src_snaps s JOIN players pl ON pl.pfr_id = s.pfr_player_id
            WHERE s.season = ${season} GROUP BY ALL`,
      components: Object.keys(SNAP_COMPONENTS),
      context: true
    },
    ngs('passing'),
    ngs('rushing'),
    ngs('receiving'),
    pfr('pass'),
    pfr('rush'),
    pfr('rec'),
    pfr('def'),
    {
      tables: ['src_qbr_week', 'players'],
      sql: `SELECT pl.gsis_id, q.season, q.season_type,
                   ${postWeek('q.season', 'q.season_type', 'q.week', 'qbr')} AS week,
                   sum(q.qbr_total * q.qb_plays) AS qbr_sum, sum(q.qb_plays) AS qbr_plays
            FROM src_qbr_week q JOIN players pl ON pl.espn_id = q.player_id
            WHERE q.season = ${season} GROUP BY ALL`,
      components: ['qbr_sum', 'qbr_plays'],
      context: false
    },
    {
      tables: ['src_ff_opportunity'],
      sql: `SELECT player_id AS gsis_id, season, season_type, week,
                   ${sums(have, 'src_ff_opportunity', FF_OPPORTUNITY_COMPONENTS)}
            FROM src_ff_opportunity WHERE season = ${season} GROUP BY ALL`,
      components: Object.keys(FF_OPPORTUNITY_COMPONENTS),
      context: false
    }
  ]
}

/**
 * `player_week` (spec §5.2): one row per player × season type × week of one season, every
 * component from every source joined on gsis, plus the week's position (nflverse rosters), the
 * team context for shares, and routes: exact from participation, else estimated as team dropbacks
 * × offensive snap share (`routes_est` = 1). Each source is aggregated into its own temporary
 * table first, then joined to the keys, so no wide intermediate is built.
 */
export function playerWeekSelect(have: Have, season: number): Built {
  const all = [...playParts(have, season), ...sourceParts(have, season)]
  const parts = all.filter((p) => hasAll(have, p.tables))
  const missing = all.filter((p) => !parts.includes(p)).flatMap((p) => p.components)
  const name = (i: number): string => `pw_part${i}`
  const temps = parts.map((p, i): [string, string] => [name(i), p.sql])
  const keys = parts.map((_, i) => `SELECT ${KEY} FROM ${name(i)}`).join(' UNION ')
  const joins = parts.map((_, i) => `LEFT JOIN ${name(i)} USING (${KEY})`).join('\n')
  const ctx = parts.flatMap((p, i) => (p.context ? [i] : []))
  const components = parts
    .flatMap((p, i) => p.components.map((c) => `${name(i)}.${c}`))
    .filter((c) => !c.endsWith('.routes'))
  const routes = parts.findIndex((p) => p.components.includes('routes'))
  const exact = have.tables.has('on_field')
    ? `EXISTS (SELECT 1 FROM on_field WHERE season = ${season})`
    : 'false'
  const position = have.tables.has('src_rosters')
    ? `(SELECT any_value(r.position) FROM src_rosters r
        WHERE r.gsis_id = s.gsis_id AND r.season = s.season AND r.week = s.week)`
    : 'NULL'
  const sql = `
    WITH keys AS (${keys}),
    joined AS (
      SELECT ${KEY},
             coalesce(${ctx.map((i) => `${name(i)}.game_id`).join(', ')}) AS game_id,
             coalesce(${ctx.map((i) => `${name(i)}.team`).join(', ')}) AS team,
             ${[...components, ...missing.filter((c) => c !== 'routes').map((c) => `NULL::DOUBLE AS ${c}`)].join(', ')},
             ${routes >= 0 ? `${name(routes)}.routes` : 'NULL::DOUBLE'} AS routes_part
      FROM keys ${joins}
    )
    SELECT s.* EXCLUDE (routes_part),
           coalesce(${position}, pl.position_group) AS position,
           CASE WHEN g.home_team = s.team THEN g.away_team WHEN g.away_team = s.team THEN g.home_team END AS opponent,
           g.home_team = s.team AS home,
           ${Object.entries(TEAM_CONTEXT)
             .map(([n, col]) => `t.${col} AS ${n}`)
             .join(', ')},
           CASE WHEN ${exact} THEN coalesce(s.routes_part, 0)
                WHEN s.off_snaps > 0 AND s.tm_off_snaps > 0 THEN round(t.off_dropbacks * s.off_snaps / s.tm_off_snaps)
           END AS routes,
           CASE WHEN NOT ${exact} AND s.off_snaps > 0 AND s.tm_off_snaps > 0 THEN 1 ELSE 0 END AS routes_est,
           1 AS games
    FROM joined s
    LEFT JOIN players pl ON pl.gsis_id = s.gsis_id
    LEFT JOIN games g ON g.game_id = s.game_id
    LEFT JOIN team_week t ON t.team = s.team AND t.game_id = s.game_id
    WHERE s.gsis_id IS NOT NULL`
  return { temps, sql }
}

/**
 * `player_season`: `player_week` summed by season type, with the season's team (latest week) and
 * position (most weeks), and the season-level sources in place of the weekly sums: NGS's season
 * rows (its weekly rows only cover players over a weekly minimum; postseason keeps the weekly
 * sums) and ESPN's season QBR.
 */
export function playerSeasonSelect(have: Have, season: number): Built {
  const own = (c: string): boolean => !NGS_NAMES.includes(c) && c !== 'qbr_sum' && c !== 'qbr_plays'
  const totals = playerComponentNames()
    .filter(own)
    .map((c) => `sum(w.${c}) AS ${c}`)
  const seasonRows = (['passing', 'rushing', 'receiving'] as const)
    .filter((k) => have.tables.has(`src_ngs_${k}`))
    .map(
      (k) => `SELECT player_gsis_id AS gsis_id, season, season_type,
                     ${sums(have, `src_ngs_${k}`, NGS_COMPONENTS[k])}
              FROM src_ngs_${k} WHERE week = 0 AND season = ${season} GROUP BY ALL`
    )
  const ngs = `SELECT gsis_id, season, season_type, ${NGS_NAMES.map((c) => `sum(${c}) AS ${c}`).join(', ')}
               FROM (${[
                 `SELECT gsis_id, season, season_type, ${NGS_NAMES.join(', ')}
                  FROM player_week WHERE season_type = 'POST' AND season = ${season}`,
                 ...seasonRows
               ].join('\nUNION ALL BY NAME\n')})
               GROUP BY ALL`
  const qbr = hasAll(have, ['src_qbr_season', 'players'])
    ? `SELECT pl.gsis_id, q.season, q.season_type,
              sum(q.qbr_total * q.qb_plays) AS qbr_sum, sum(q.qb_plays) AS qbr_plays
       FROM src_qbr_season q JOIN players pl ON pl.espn_id = q.player_id
       WHERE q.season = ${season} GROUP BY ALL`
    : `SELECT NULL::VARCHAR AS gsis_id, NULL::INTEGER AS season, NULL::VARCHAR AS season_type,
              NULL::DOUBLE AS qbr_sum, NULL::DOUBLE AS qbr_plays`
  const sql = `
    WITH base AS (
      SELECT w.gsis_id, w.season, w.season_type, arg_max(w.team, w.week) AS team,
             mode(w.position) AS position, ${totals.join(', ')}
      FROM player_week w WHERE w.season = ${season} GROUP BY ALL
    ),
    ngs AS (${ngs}),
    qbr AS (${qbr})
    SELECT b.*, ${NGS_NAMES.map((c) => `n.${c}`).join(', ')}, q.qbr_sum, q.qbr_plays
    FROM base b
    LEFT JOIN ngs n USING (gsis_id, season, season_type)
    LEFT JOIN qbr q USING (gsis_id, season, season_type)`
  return { sql }
}
