import { DERIVED_STATS } from '@main/scoring/engine'
import type { Position } from '@shared/rules'
import { SCORING_PRESETS, type Scoring, type ScoringRules } from '@shared/stats/scoring'
import { sqlIdent } from '../db'
import { columnsOf, postWeek, type Built, type Have } from './sql'

const col = (have: Set<string>, key: string): string =>
  have.has(key) ? `coalesce(s.${sqlIdent(key)}, 0)` : '0'

const atLeast = (value: string, min: number, max?: number): string =>
  `coalesce((${value} >= ${min}${max === undefined ? '' : ` AND ${value} <= ${max}`})::INT, 0)`

/**
 * The SQL twin of `DERIVED_STATS` (`src/main/scoring/engine.ts`): bonus and tier keys are computed
 * from the line, not read. A defense that played allowed 0 when Sleeper leaves the key out
 * (`sleeperStatLine`). Before 2024 Sleeper had one 50+ bucket (`fgm_50p`), counted as 50–59.
 */
function derivedSql(have: Set<string>, key: string): string | null {
  const c = (k: string): string => col(have, k)
  const raw = (k: string): string => (have.has(k) ? `s.${sqlIdent(k)}` : 'NULL')
  const played = `s.position = 'DEF' AND ${c('gp')} >= 1`
  const pts = `(CASE WHEN ${played} THEN ${c('pts_allow')} ELSE ${raw('pts_allow')} END)`
  const yds = `(CASE WHEN ${played} THEN ${c('yds_allow')} ELSE ${raw('yds_allow')} END)`
  const rec = (pos: string): string => `CASE WHEN s.position = '${pos}' THEN ${c('rec')} ELSE 0 END`
  const sql: Record<string, string> = {
    bonus_pass_yd_300: atLeast(c('pass_yd'), 300),
    bonus_pass_yd_400: atLeast(c('pass_yd'), 400),
    bonus_rush_yd_100: atLeast(c('rush_yd'), 100),
    bonus_rush_yd_200: atLeast(c('rush_yd'), 200),
    bonus_rec_yd_100: atLeast(c('rec_yd'), 100),
    bonus_rec_yd_200: atLeast(c('rec_yd'), 200),
    bonus_rush_rec_yd_100: atLeast(`(${c('rush_yd')} + ${c('rec_yd')})`, 100),
    bonus_rush_rec_yd_200: atLeast(`(${c('rush_yd')} + ${c('rec_yd')})`, 200),
    bonus_pass_cmp_25: atLeast(c('pass_cmp'), 25),
    bonus_rush_att_20: atLeast(c('rush_att'), 20),
    bonus_rec_te: rec('TE'),
    bonus_rec_rb: rec('RB'),
    bonus_rec_wr: rec('WR'),
    pts_allow_0: atLeast(pts, 0, 0),
    pts_allow_1_6: atLeast(pts, 1, 6),
    pts_allow_7_13: atLeast(pts, 7, 13),
    pts_allow_14_20: atLeast(pts, 14, 20),
    pts_allow_21_27: atLeast(pts, 21, 27),
    pts_allow_28_34: atLeast(pts, 28, 34),
    pts_allow_35p: atLeast(pts, 35),
    yds_allow_0_100: atLeast(yds, 0, 99),
    yds_allow_100_199: atLeast(yds, 100, 199),
    yds_allow_200_299: atLeast(yds, 200, 299),
    yds_allow_300_349: atLeast(yds, 300, 349),
    yds_allow_350_399: atLeast(yds, 350, 399),
    yds_allow_400_449: atLeast(yds, 400, 449),
    yds_allow_450_499: atLeast(yds, 450, 499),
    yds_allow_500_549: atLeast(yds, 500, 549),
    yds_allow_550p: atLeast(yds, 550)
  }
  if (key === 'fgm_50_59' && have.has('fgm_50p')) {
    return `coalesce(${raw('fgm_50_59')}, CASE WHEN ${raw('fgm_60p')} IS NULL THEN s.fgm_50p END, 0)`
  }
  if (key in sql) return sql[key]
  return key in DERIVED_STATS ? '0' : null
}

/** The points a key is worth, with the league's position overrides as a CASE. */
function pointsOf(rules: ScoringRules, key: string): string {
  const base = rules.scoring[key] ?? 0
  const overrides = Object.entries(rules.positionOverrides).filter(
    ([, o]) => o !== undefined && key in o && o[key] !== base
  )
  if (overrides.length === 0) return String(base)
  return `CASE s.position ${overrides
    .map(([pos, o]) => `WHEN '${pos}' THEN ${o![key]}`)
    .join(' ')} ELSE ${base} END`
}

function scoredKeys(rules: ScoringRules): string[] {
  return [
    ...new Set([
      ...Object.keys(rules.scoring),
      ...Object.values(rules.positionOverrides).flatMap((o) => Object.keys(o ?? {}))
    ])
  ].sort()
}

/** One scoring's points for a Sleeper line `s` (with `s.position`), as one SQL expression. */
export function pointsSql(rules: ScoringRules, have: Set<string>): string {
  const terms: string[] = []
  for (const key of scoredKeys(rules)) {
    const value = derivedSql(have, key) ?? col(have, key)
    const points = pointsOf(rules, key)
    if (value !== '0' && points !== '0') terms.push(`${points} * ${value}`)
  }
  return terms.length > 0 ? `round(${terms.join(' + ')}, 2)` : '0'
}

/**
 * Spec §5.2: expected points under the same rules, from ffopportunity's expected stats (`f`):
 * each scoring key with an expected count is scored on it. Bonuses and fumbles have none.
 */
const EXPECTED: Record<string, string> = {
  pass_att: 'f.pass_attempt',
  pass_cmp: 'f.pass_completions_exp',
  pass_inc: '(f.pass_attempt - f.pass_completions_exp)',
  pass_yd: 'f.pass_yards_gained_exp',
  pass_td: 'f.pass_touchdown_exp',
  pass_int: 'f.pass_interception_exp',
  pass_2pt: 'f.pass_two_point_conv_exp',
  pass_fd: 'f.pass_first_down_exp',
  rush_att: 'f.rush_attempt',
  rush_yd: 'f.rush_yards_gained_exp',
  rush_td: 'f.rush_touchdown_exp',
  rush_2pt: 'f.rush_two_point_conv_exp',
  rush_fd: 'f.rush_first_down_exp',
  rec_tgt: 'f.rec_attempt',
  rec: 'f.receptions_exp',
  rec_yd: 'f.rec_yards_gained_exp',
  rec_td: 'f.rec_touchdown_exp',
  rec_2pt: 'f.rec_two_point_conv_exp',
  rec_fd: 'f.rec_first_down_exp',
  bonus_rec_te: "CASE WHEN s.position = 'TE' THEN f.receptions_exp ELSE 0 END",
  bonus_rec_rb: "CASE WHEN s.position = 'RB' THEN f.receptions_exp ELSE 0 END",
  bonus_rec_wr: "CASE WHEN s.position = 'WR' THEN f.receptions_exp ELSE 0 END"
}

export function expectedPointsSql(rules: ScoringRules, ffo?: Set<string>): string {
  const keys = new Set(scoredKeys(rules))
  // A column ffopportunity does not have (yet) adds nothing.
  const known = (value: string): boolean =>
    ffo === undefined || [...value.matchAll(/f\.([a-z0-9_]+)/g)].every((m) => ffo.has(m[1]))
  const terms = Object.entries(EXPECTED)
    .filter(([key, value]) => keys.has(key) && known(value))
    .map(([key, value]) => [pointsOf(rules, key), value])
    .filter(([points]) => points !== '0')
    .map(([points, value]) => `${points} * coalesce(${value}, 0)`)
  return terms.length > 0 ? `round(${terms.join(' + ')}, 2)` : '0'
}

/** Sleeper positions as the scoring rules name them (overrides, `bonus_rec_*`). */
const SLEEPER_POSITION = `CASE
    WHEN sp.position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB') THEN sp.position
    WHEN sp.position IN ('DE', 'DT', 'NT') THEN 'DL'
    WHEN sp.position IN ('ILB', 'OLB', 'MLB') THEN 'LB'
    WHEN sp.position IN ('CB', 'S', 'SS', 'FS') THEN 'DB'
    WHEN sp.position = 'FB' THEN 'RB'
    WHEN sp.position = 'K/P' THEN 'K'
    ELSE sp.position END`

/** The scorings to build: the presets, and the league's rules when a league is imported. */
export function scoringsToBuild(league: ScoringRules | null): [Scoring, ScoringRules][] {
  const presets = Object.entries(SCORING_PRESETS) as [Scoring, ScoringRules][]
  return league ? [...presets, ['league', league]] : presets
}

/**
 * `fantasy_week` (spec §5.2): one row per Sleeper player or defense × week × scoring of one
 * season, with the points and the expected points under that scoring. Weeks are in nflverse's
 * numbering; `gsis_id` links a player to the rest of the database.
 */
export function fantasyWeekSelect(
  have: Have,
  season: number,
  scorings: [Scoring, ScoringRules][]
): Built {
  const lines = [
    ...(have.tables.has('src_sleeper')
      ? [
          `SELECT t.*, ${SLEEPER_POSITION} AS position FROM src_sleeper t
           LEFT JOIN src_sleeper_players sp ON sp.player_id = t.player_id AND sp.season = t.season
           WHERE t.season = ${season}`
        ]
      : []),
    ...(have.tables.has('src_sleeper_def')
      ? [`SELECT *, 'DEF' AS position FROM src_sleeper_def WHERE season = ${season}`]
      : [])
  ]
  const week = postWeek('s.season', 's.season_type', 's.week', 'sleeper')
  const sleeper = new Set([
    ...columnsOf(have, 'src_sleeper'),
    ...columnsOf(have, 'src_sleeper_def')
  ])
  const ffoCols = columnsOf(have, 'src_ff_opportunity')
  const ffo = ffoCols.has('player_id')
    ? 'src_ff_opportunity'
    : '(SELECT NULL::VARCHAR AS player_id, NULL::INTEGER AS season, NULL::VARCHAR AS season_type, NULL::INTEGER AS week)'
  const one = ([id, rules]: [Scoring, ScoringRules]): string =>
    `SELECT s.player_id, i.gsis_id, s.season, s.season_type, ${week} AS week, s.team, s.opponent,
            s.position, '${id}' AS scoring, ${pointsSql(rules, sleeper)} AS points,
            CASE WHEN f.player_id IS NOT NULL THEN ${expectedPointsSql(rules, ffoCols)} END AS xpoints
     FROM s
     LEFT JOIN sleeper_ids i ON i.sleeper_id = s.player_id
     LEFT JOIN ${ffo} f ON f.player_id = i.gsis_id AND f.season = s.season
       AND f.season_type = s.season_type AND f.week = ${week}`
  return {
    sql: `WITH s AS (${lines.join('\nUNION ALL BY NAME\n')})
          ${scorings.map(one).join('\nUNION ALL\n')}`
  }
}

/** Positions whose fantasy points a defense allows (spec §6.2 Teams). */
const ALLOWED: Position[] = ['QB', 'RB', 'WR', 'TE', 'K']

/** `team_fantasy_week`: the points each defense allowed by position and scoring. */
export function teamFantasyWeekSelect(season: number): Built {
  return {
    sql: `SELECT opponent AS team, season, season_type, week, scoring,
                 ${ALLOWED.map((p) => `sum(points) FILTER (position = '${p}') AS fpa_${p.toLowerCase()}`).join(', ')}
          FROM fantasy_week
          WHERE opponent IS NOT NULL AND position <> 'DEF' AND season = ${season}
          GROUP BY ALL`
  }
}
