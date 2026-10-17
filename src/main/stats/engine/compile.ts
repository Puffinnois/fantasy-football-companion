import { componentsOf, METRICS } from '@shared/stats/catalogue'
import { SCORINGS, type Scoring } from '@shared/stats/scoring'
import {
  POSITION_GROUPS,
  type Grain,
  type GroupBy,
  type MetricDef,
  type StatsQuery,
  type Transform
} from '@shared/stats/types'
import {
  BOX,
  PERSONNEL,
  PLAYER_PLAY_COMPONENTS,
  ROLE_SOURCES,
  TEAM_PLAY_COMPONENTS,
  type PlayComponent,
  type Role
} from '../derived/plays'
import { STATS_FIRST_SEASON } from '../sources'
import { grainsOf, PLAYER_FANTASY, TEAM_FANTASY } from './registry'

/** A query the engine refuses, with a message a person (or an LLM) can act on. */
export class StatsQueryError extends Error {}

export const MAX_METRICS = 40
export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 1000
/** Spec §6.1: `minSample` is for 17 games; it scales with the weeks a row covers. */
export const FULL_SEASON = 17

const TRANSFORMS: Transform[] = ['raw', 'perGame', 'percentile', 'zScore', 'vsLeague']
const TABLE_DIMS: GroupBy[] = ['season', 'week', 'team', 'opponent']
const PLAY_DIMS: GroupBy[] = ['down', 'quarter', 'personnel', 'coverage', 'formation']
const TEAM_CODE = /^[A-Z]{2,3}$/
const GSIS = /^00-[0-9]{7}$/
const PLAY_DIM_SQL: Partial<Record<GroupBy, string>> = {
  season: 'p.season',
  week: 'p.week',
  down: 'p.down::INTEGER',
  quarter: 'p.qtr::INTEGER',
  personnel: PERSONNEL,
  coverage:
    "CASE p.defense_man_zone_type WHEN 'MAN_COVERAGE' THEN 'man' WHEN 'ZONE_COVERAGE' THEN 'zone' END",
  formation: 'p.offense_formation'
}

type Value = string | number | boolean

/** Bound parameters, numbered as they are added ($1, $2, …): no user value is spliced into SQL. */
class Params {
  readonly values: Value[] = []
  add(value: Value): string {
    this.values.push(value)
    return `$${this.values.length}`
  }
  list(values: Value[]): string {
    return `(${values.map((v) => this.add(v)).join(', ')})`
  }
}

export interface CompileContext {
  /** The latest season in the database: `lastSeason: 'prior'` metrics stop the season before. */
  currentSeason: number
  /** A league is imported, so `scoring: 'league'` exists. */
  hasLeague: boolean
}

/** What `runQuery` runs: the weeks in scope (they scale `minSample`), then the query. */
export interface Compiled {
  grain: Grain
  metrics: MetricDef[]
  transform: Transform
  weeksSql: string
  weeksParams: Value[]
  /** `$factor` is replaced by the qualification factor before it runs. */
  sql: string
  params: Value[]
  /** The weeks one row covers, given the weeks and seasons in scope. */
  rowWeeks(weeks: number, seasons: number): number
  notes: string[]
}

function fail(message: string): never {
  throw new StatsQueryError(message)
}

function integers(values: unknown, what: string, min: number, max: number): number[] {
  if (!Array.isArray(values) || values.length === 0) fail(`${what} must be a non-empty list`)
  for (const v of values) {
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
      fail(`${what} must be whole numbers from ${min} to ${max}`)
    }
  }
  return values as number[]
}

function range(value: unknown, what: string): [number, number] {
  const ok =
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    value[0] <= value[1]
  return ok ? (value as [number, number]) : fail(`${what} must be [min, max]`)
}

function texts(values: unknown, what: string, pattern: RegExp): string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > 64) {
    fail(`${what} must list 1–64 values`)
  }
  for (const v of values) {
    if (typeof v !== 'string' || !pattern.test(v)) fail(`${what}: "${String(v)}" is not valid`)
  }
  return values as string[]
}

function flag(value: unknown, what: string): boolean {
  return typeof value === 'boolean' ? value : fail(`${what} must be true or false`)
}

interface Checked {
  metrics: MetricDef[]
  grain: Grain
  scoring: Scoring
  transform: Transform
  groupBy: GroupBy[]
}

const QUERY_FIELDS = [
  'entity',
  'metrics',
  'scope',
  'situation',
  'groupBy',
  'transform',
  'sort',
  'limit',
  'scoring'
]
const SCOPE_FIELDS = [
  'seasons',
  'seasonType',
  'weeks',
  'lastNGames',
  'positions',
  'teams',
  'opponents',
  'players',
  'qualifiedOnly'
]
const SITUATION_FIELDS = [
  'down',
  'distance',
  'quarter',
  'fieldZone',
  'scoreMargin',
  'winProbability',
  'neutral',
  'pressure',
  'blitz',
  'playAction',
  'coverage',
  'formation',
  'personnel',
  'box',
  'airYards',
  'withOnField',
  'withoutOnField'
]

/** Fields the engine does not know are refused, not ignored: a typo would silently change the answer. */
function knownFields(value: unknown, fields: string[], what: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(`${what} must be an object`)
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) fail(`unknown ${what} field "${key}"`)
  }
}

/** Spec §7.2: the checks, with readable messages, before anything reaches SQL. */
function validate(q: StatsQuery, ctx: CompileContext): Checked {
  knownFields(q, QUERY_FIELDS, 'query')
  knownFields(q.scope, SCOPE_FIELDS, 'scope')
  if (q.situation !== undefined) {
    if (q.situation === null || typeof q.situation !== 'object') fail('situation must be an object')
    for (const key of Object.keys(q.situation)) {
      if (!SITUATION_FIELDS.includes(key)) fail(`unknown situation filter "${key}"`)
    }
  }
  if (q.entity !== 'player' && q.entity !== 'team') fail('entity must be "player" or "team"')
  if (!Array.isArray(q.metrics) || q.metrics.length === 0 || q.metrics.length > MAX_METRICS) {
    fail(`metrics must list 1–${MAX_METRICS} catalogue ids`)
  }
  if (new Set(q.metrics).size !== q.metrics.length) fail('metrics must not repeat')
  const metrics = q.metrics.map((id) => {
    const def = METRICS.get(id) ?? fail(`unknown metric "${id}"`)
    if (def.entity !== q.entity) fail(`"${id}" is a ${def.entity} metric, not a ${q.entity} one`)
    return def
  })
  const scope = q.scope ?? fail('scope is required')
  integers(scope.seasons, 'scope.seasons', STATS_FIRST_SEASON, ctx.currentSeason)
  if (scope.seasonType !== undefined && !['REG', 'POST', 'ALL'].includes(scope.seasonType)) {
    fail('scope.seasonType must be REG, POST or ALL')
  }
  if (scope.weeks !== undefined) integers(range(scope.weeks, 'scope.weeks'), 'scope.weeks', 1, 22)
  if (scope.lastNGames !== undefined) integers([scope.lastNGames], 'scope.lastNGames', 1, 100)
  if (scope.positions !== undefined) {
    texts(scope.positions, 'scope.positions', /^[A-Z]{1,2}$/)
    for (const p of scope.positions) {
      if (!(POSITION_GROUPS as readonly string[]).includes(p)) {
        fail(`unknown position "${p}"; use ${POSITION_GROUPS.join(', ')}`)
      }
    }
  }
  if (scope.teams !== undefined) texts(scope.teams, 'scope.teams', TEAM_CODE)
  if (scope.opponents !== undefined) texts(scope.opponents, 'scope.opponents', TEAM_CODE)
  if (scope.players !== undefined) texts(scope.players, 'scope.players', GSIS)
  if (scope.qualifiedOnly !== undefined) flag(scope.qualifiedOnly, 'scope.qualifiedOnly')
  const groupBy = q.groupBy ?? []
  for (const g of groupBy) {
    if (![...TABLE_DIMS, ...PLAY_DIMS].includes(g)) fail(`cannot group by "${g}"`)
  }
  if (new Set(groupBy).size !== groupBy.length) fail('groupBy must not repeat')
  const transform = q.transform ?? 'raw'
  if (!TRANSFORMS.includes(transform)) fail(`transform must be one of ${TRANSFORMS.join(', ')}`)
  const scoring = q.scoring ?? 'ppr'
  if (!SCORINGS.includes(scoring)) fail(`scoring must be one of ${SCORINGS.join(', ')}`)
  if (scoring === 'league' && !ctx.hasLeague) fail('scoring "league" needs an imported league')
  if (q.sort !== undefined && (q.sort === null || typeof q.sort !== 'object')) {
    fail('sort must be { metric, dir }')
  }
  if (q.sort !== undefined) {
    if (!q.metrics.includes(q.sort.metric)) fail('sort.metric must be one of the metrics')
    if (q.sort.dir !== 'asc' && q.sort.dir !== 'desc') fail('sort.dir must be asc or desc')
  }
  if (q.limit !== undefined) integers([q.limit], 'limit', 1, MAX_LIMIT)

  const situational =
    Object.keys(q.situation ?? {}).length > 0 || groupBy.some((g) => PLAY_DIMS.includes(g))
  let grain: Grain = 'season'
  if (situational) grain = 'play'
  else if (
    scope.weeks !== undefined ||
    scope.lastNGames !== undefined ||
    scope.opponents !== undefined ||
    scope.teams !== undefined ||
    groupBy.some((g) => g !== 'season')
  ) {
    grain = 'week'
  }
  if (grain === 'play' && scope.lastNGames !== undefined) {
    fail('lastNGames cannot be combined with situation filters')
  }
  for (const m of metrics) {
    if (!grainsOf(m).includes(grain)) {
      fail(
        grain === 'play'
          ? `"${m.id}" cannot be split by situation: it does not come from plays`
          : `"${m.id}" is only available with situation filters`
      )
    }
  }
  return { metrics, grain, scoring, transform, groupBy }
}

/** Spec §7.1 situation filters, as conditions on `p` (a row of `plays`). */
function situationWhere(
  s: NonNullable<StatsQuery['situation']>,
  params: Params,
  notes: Set<string>
): string[] {
  const where: string[] = []
  const part = (): void => {
    notes.add(
      'Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season.'
    )
  }
  const ftn = (): void => {
    notes.add('Blitz and play-action filters use FTN charting, which starts in 2022.')
  }
  const between = (column: string, value: unknown, what: string): void => {
    const [a, b] = range(value, what)
    where.push(`${column} BETWEEN ${params.add(a)} AND ${params.add(b)}`)
  }
  if (s.down !== undefined) {
    where.push(`p.down IN ${params.list(integers(s.down, 'situation.down', 1, 4))}`)
  }
  if (s.distance !== undefined) between('p.ydstogo', s.distance, 'situation.distance')
  if (s.quarter !== undefined) {
    where.push(`p.qtr IN ${params.list(integers(s.quarter, 'situation.quarter', 1, 5))}`)
  }
  if (s.fieldZone !== undefined) {
    const zones: Record<string, string> = {
      redzone: 'p.yardline_100 <= 20',
      inside10: 'p.yardline_100 <= 10',
      inside5: 'p.yardline_100 <= 5',
      own20: 'p.yardline_100 >= 80'
    }
    where.push(
      (Object.hasOwn(zones, s.fieldZone) ? zones[s.fieldZone] : undefined) ??
        fail('situation.fieldZone must be redzone, inside10, inside5 or own20')
    )
  }
  if (s.scoreMargin !== undefined) {
    between('p.score_differential', s.scoreMargin, 'situation.scoreMargin')
  }
  if (s.winProbability !== undefined) between('p.wp', s.winProbability, 'situation.winProbability')
  if (s.neutral !== undefined) {
    const neutral =
      'coalesce(p.wp BETWEEN 0.2 AND 0.8 AND p.qtr <= 4 AND p.half_seconds_remaining > 120, false)'
    where.push(flag(s.neutral, 'situation.neutral') ? neutral : `NOT ${neutral}`)
  }
  if (s.pressure !== undefined) {
    part()
    where.push(`p.was_pressure = ${params.add(flag(s.pressure, 'situation.pressure'))}`)
  }
  if (s.blitz !== undefined) {
    ftn()
    where.push(`(p.n_blitzers > 0) = ${params.add(flag(s.blitz, 'situation.blitz'))}`)
  }
  if (s.playAction !== undefined) {
    ftn()
    where.push(`p.is_play_action = ${params.add(flag(s.playAction, 'situation.playAction'))}`)
  }
  if (s.coverage !== undefined) {
    part()
    if (s.coverage === 'man' || s.coverage === 'zone') {
      const type = s.coverage === 'man' ? 'MAN_COVERAGE' : 'ZONE_COVERAGE'
      where.push(`p.defense_man_zone_type = ${params.add(type)}`)
    } else {
      const types = texts(s.coverage, 'situation.coverage', /^[A-Z0-9_]+$/)
      where.push(`p.defense_coverage_type IN ${params.list(types)}`)
    }
  }
  if (s.formation !== undefined) {
    part()
    const forms = texts(s.formation, 'situation.formation', /^[A-Z_ ]+$/)
    where.push(`p.offense_formation IN ${params.list(forms)}`)
  }
  if (s.personnel !== undefined) {
    part()
    const codes = texts(s.personnel, 'situation.personnel', /^[0-9]{2}$/)
    where.push(`(${PERSONNEL}) IN ${params.list(codes)}`)
  }
  if (s.box !== undefined) {
    part()
    between(BOX, s.box, 'situation.box')
  }
  if (s.airYards !== undefined) between('p.air_yards', s.airYards, 'situation.airYards')
  const onField = (ids: string[]): string =>
    `SELECT 1 FROM on_field o WHERE o.game_id = p.game_id AND o.play_id = p.play_id AND o.gsis IN ${params.list(ids)}`
  if (s.withOnField !== undefined) {
    part()
    for (const id of texts(s.withOnField, 'situation.withOnField', GSIS)) {
      where.push(`EXISTS (${onField([id])})`)
    }
  }
  if (s.withoutOnField !== undefined) {
    part()
    where.push(`NOT EXISTS (${onField(texts(s.withoutOnField, 'situation.withoutOnField', GSIS))})`)
  }
  return where
}

function seasonTypeWhere(column: string, q: StatsQuery, params: Params): string[] {
  const t = q.scope.seasonType ?? 'REG'
  return t === 'ALL' ? [] : [`${column} = ${params.add(t)}`]
}

/** The components a metric reads, its estimate flag included. */
const neededBy = (m: MetricDef): string[] => [
  ...componentsOf(m),
  ...(m.estimatedBy ? [m.estimatedBy] : [])
]

/** Each metric's value, sample and estimated weeks, from component sums. */
function metricColumns(
  metrics: MetricDef[],
  sumOf: (c: string) => string,
  perGame: boolean
): string[] {
  return metrics.flatMap((m, i) => {
    let value = m.value.replace(/\{([a-z0-9_]+)\}/g, (_, c: string) => sumOf(c))
    if (perGame && m.kind === 'count') value = `(${value}) / nullif(${sumOf('games')}, 0)`
    return [
      `(${value})::DOUBLE AS v${i}`,
      `(${sumOf(m.sample)})::DOUBLE AS s${i}`,
      `(${m.estimatedBy ? sumOf(m.estimatedBy) : '0'})::DOUBLE AS e${i}`
    ]
  })
}

/** The week and season grains: rows of the derived tables, summed per output row. */
function tableAgg(q: StatsQuery, c: Checked, params: Params): { ctes: string; dims: GroupBy[] } {
  const player = q.entity === 'player'
  const season = c.grain === 'season'
  const table = `${player ? 'player' : 'team'}_${season ? 'season' : 'week'}`
  const key = player ? 'gsis_id' : 'team'
  const fantasy = player ? PLAYER_FANTASY : TEAM_FANTASY
  const needed = new Set(['games', ...c.metrics.flatMap(neededBy)])
  const where = [
    `w.season IN ${params.list(q.scope.seasons)}`,
    ...seasonTypeWhere('w.season_type', q, params)
  ]
  if (q.scope.weeks) {
    where.push(`w.week BETWEEN ${params.add(q.scope.weeks[0])} AND ${params.add(q.scope.weeks[1])}`)
  }
  if (player && q.scope.positions) where.push(`w.position IN ${params.list(q.scope.positions)}`)
  if (q.scope.teams) where.push(`w.team IN ${params.list(q.scope.teams)}`)
  if (q.scope.opponents) where.push(`w.opponent IN ${params.list(q.scope.opponents)}`)
  if (player && q.scope.players) where.push(`w.gsis_id IN ${params.list(q.scope.players)}`)
  if (!player && !season) where.push('w.games = 1')

  let join = ''
  if ([...needed].some((n) => fantasy.includes(n))) {
    // A gsis id can have two Sleeper ids; one line per person and week.
    const weekly = player
      ? `SELECT gsis_id, season, season_type, week, max(points) AS fp, max(xpoints) AS xfp
         FROM fantasy_week WHERE scoring = ${params.add(c.scoring)} AND gsis_id IS NOT NULL GROUP BY ALL`
      : `SELECT team, season, season_type, week, ${TEAM_FANTASY.map((f) => `max(${f}) AS ${f}`).join(', ')}
         FROM team_fantasy_week WHERE scoring = ${params.add(c.scoring)} GROUP BY ALL`
    const rows = season
      ? `SELECT ${key}, season, season_type, ${fantasy.map((f) => `sum(${f}) AS ${f}`).join(', ')}
         FROM (${weekly}) GROUP BY ALL`
      : weekly
    join = `LEFT JOIN (${rows}) f ON f.${key} = w.${key} AND f.season = w.season
            AND f.season_type = w.season_type${season ? '' : ' AND f.week = w.week'}`
  }
  const cols = [...needed].map((n) => `${fantasy.includes(n) ? 'f' : 'w'}.${n}`)
  const last =
    q.scope.lastNGames === undefined
      ? ''
      : `QUALIFY row_number() OVER (PARTITION BY w.${key}
           ORDER BY w.season DESC, w.week DESC) <= ${params.add(q.scope.lastNGames)}`
  const base = `SELECT w.${key} AS id, w.season, ${season ? 'NULL::INTEGER' : 'w.week'} AS week,
                       w.team, ${player ? 'w.position' : 'NULL::VARCHAR AS position'},
                       ${season ? 'NULL::VARCHAR' : 'w.opponent'} AS opponent, ${cols.join(', ')}
                FROM ${table} w ${join}
                WHERE ${where.join(' AND ')} ${last}`
  const dims = c.groupBy
  const agg = `SELECT id, ${dims.map((d) => `${d} AS g_${d}, `).join('')}
                      arg_max(team, season * 100 + coalesce(week, 0)) AS team,
                      mode(position) AS position, sum(games)::DOUBLE AS games,
                      ${metricColumns(c.metrics, (n) => `sum(${n})`, c.transform === 'perGame').join(', ')}
               FROM base GROUP BY id${dims.map((d) => `, ${d}`).join('')}`
  return { ctes: `base AS (${base}), agg AS (${agg})`, dims }
}

/** The play grain: components summed again from plays under the situation filter (spec §7.2). */
function playAgg(
  q: StatsQuery,
  c: Checked,
  params: Params,
  notes: Set<string>
): { ctes: string; dims: GroupBy[] } {
  const player = q.entity === 'player'
  const dims = c.groupBy
  const needed = new Set(c.metrics.flatMap(componentsOf))
  const situation = situationWhere(q.situation ?? {}, params, notes)
  const scopeWhere = (team: string, opp: string, id: string): string[] => {
    const w = [
      `p.season IN ${params.list(q.scope.seasons)}`,
      ...seasonTypeWhere('p.season_type', q, params)
    ]
    if (q.scope.weeks) {
      w.push(`p.week BETWEEN ${params.add(q.scope.weeks[0])} AND ${params.add(q.scope.weeks[1])}`)
    }
    if (q.scope.teams) w.push(`${team} IN ${params.list(q.scope.teams)}`)
    if (q.scope.opponents) w.push(`${opp} IN ${params.list(q.scope.opponents)}`)
    if (player && q.scope.players) w.push(`${id} IN ${params.list(q.scope.players)}`)
    return w
  }
  const part = (
    id: string,
    team: string,
    from: string,
    where: string[],
    cols: string[]
  ): string => {
    const opp = team === 'p.posteam' ? 'p.defteam' : 'p.posteam'
    const dimCols = dims.map(
      (d) => `${d === 'team' ? team : d === 'opponent' ? opp : PLAY_DIM_SQL[d]} AS g_${d}`
    )
    return `SELECT ${[`${id} AS id`, ...dimCols, `any_value(${team}) AS team`, 'count(DISTINCT p.game_id) AS games', ...cols].join(', ')}
            FROM ${from}
            WHERE ${[`${id} IS NOT NULL`, ...where, ...scopeWhere(team, opp, id), ...situation].join(' AND ')}
            GROUP BY ALL`
  }
  const parts: { sql: string; cols: string[] }[] = []
  if (player) {
    const byRole = new Map<Role, PlayComponent[]>()
    for (const comp of PLAYER_PLAY_COMPONENTS) {
      if (needed.has(comp.name)) byRole.set(comp.role, [...(byRole.get(comp.role) ?? []), comp])
    }
    for (const [role, comps] of byRole) {
      const src = ROLE_SOURCES[role]
      parts.push({
        sql: part(
          src.id,
          src.team,
          src.from,
          [src.where],
          comps.map((x) => `sum(${x.expr}) AS ${x.name}`)
        ),
        cols: comps.map((x) => x.name)
      })
    }
  } else {
    for (const [prefix, team] of [
      ['off', 'p.posteam'],
      ['def', 'p.defteam']
    ] as const) {
      const comps = TEAM_PLAY_COMPONENTS.filter((x) => needed.has(`${prefix}_${x.name}`))
      if (comps.length === 0) continue
      parts.push({
        sql: part(
          team,
          team,
          'plays p',
          [],
          comps.map((x) => `sum(${x.expr}) AS ${prefix}_${x.name}`)
        ),
        cols: comps.map((x) => `${prefix}_${x.name}`)
      })
    }
  }
  if (parts.length === 0) fail('no metric here is computed from plays')
  const key = ['id', ...dims.map((d) => `g_${d}`)]
  const colOf = new Map<string, string>()
  parts.forEach((p, i) => p.cols.forEach((col) => colOf.set(col, `r${i}.${col}`)))
  const games = `greatest(${parts.map((_, i) => `coalesce(r${i}.games, 0)`).join(', ')})`
  // Not a play component: routes' estimate flag (routes from plays are exact).
  const sumOf = (n: string): string =>
    n === 'games' ? games : colOf.has(n) ? `coalesce(${colOf.get(n)}, 0)` : '0'
  // A dim can be NULL (a play without a down), so the parts join with IS NOT DISTINCT FROM.
  const joins = parts
    .map(
      (_, i) =>
        `LEFT JOIN r${i} ON ${key.map((k) => `k.${k} IS NOT DISTINCT FROM r${i}.${k}`).join(' AND ')}`
    )
    .join('\n')
  const pos = player
    ? `pos AS (SELECT gsis_id, arg_max(position, season) AS position FROM player_season
               WHERE season IN ${params.list(q.scope.seasons)} GROUP BY gsis_id),`
    : ''
  const posWhere =
    player && q.scope.positions ? `WHERE pos.position IN ${params.list(q.scope.positions)}` : ''
  const agg = `SELECT k.*, coalesce(${parts.map((_, i) => `r${i}.team`).join(', ')}) AS team,
                      ${player ? 'pos.position' : 'NULL::VARCHAR'} AS position, ${games}::DOUBLE AS games,
                      ${metricColumns(c.metrics, sumOf, c.transform === 'perGame').join(', ')}
               FROM keys k ${joins} ${player ? 'LEFT JOIN pos ON pos.gsis_id = k.id' : ''} ${posWhere}`
  const ctes = [
    ...parts.map((p, i) => `r${i} AS (${p.sql})`),
    `keys AS (${parts.map((_, i) => `SELECT ${key.join(', ')} FROM r${i}`).join(' UNION ')})`,
    ...(pos ? [pos.replace(/,$/, '')] : []),
    `agg AS (${agg})`
  ]
  return { ctes: ctes.join(',\n'), dims }
}

/**
 * Qualification at the play grain (amendment E): the share of the scope's scrimmage plays each row
 * keeps, per play-dimension group (a third-down row keeps about a fifth). With on-field filters or
 * a team scope, the plays counted are those teams' own, so a starter on the field keeps most.
 */
function sharesCte(q: StatsQuery, c: Checked, params: Params): string {
  const dims = c.groupBy.filter((d) => PLAY_DIMS.includes(d))
  const where = [
    `p.season IN ${params.list(q.scope.seasons)}`,
    ...seasonTypeWhere('p.season_type', q, params),
    "p.counts AND p.play_type IN ('pass', 'run')"
  ]
  if (q.scope.weeks) {
    where.push(`p.week BETWEEN ${params.add(q.scope.weeks[0])} AND ${params.add(q.scope.weeks[1])}`)
  }
  const s = q.situation ?? {}
  const onField = [...(s.withOnField ?? []), ...(s.withoutOnField ?? [])]
  if (q.scope.teams) {
    const teams = params.list(q.scope.teams)
    where.push(`(p.posteam IN ${teams} OR p.defteam IN ${teams})`)
  } else if (onField.length > 0) {
    const teams = `(SELECT DISTINCT CASE o.side WHEN 'O' THEN t.posteam ELSE t.defteam END
                    FROM on_field o JOIN plays t ON t.game_id = o.game_id AND t.play_id = o.play_id
                    WHERE o.gsis IN ${params.list(onField)} AND t.season IN ${params.list(q.scope.seasons)})`
    where.push(`(p.posteam IN ${teams} OR p.defteam IN ${teams})`)
  }
  const kept = situationWhere(s, params, new Set())
  const filter = kept.length > 0 ? kept.join(' AND ') : 'true'
  return `shares AS (
    SELECT ${dims.map((d) => `${PLAY_DIM_SQL[d]} AS g_${d}, `).join('')}
           count(*) FILTER (WHERE ${filter})::DOUBLE / sum(count(*)) OVER () AS share
    FROM plays p WHERE ${where.join(' AND ')} GROUP BY ALL)`
}

/** Spec §7.2: validates a query and compiles it to parameterised, read-only SQL. */
export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {
  const c = validate(q, ctx)
  const params = new Params()
  const notes = new Set<string>()
  const { ctes, dims } = c.grain === 'play' ? playAgg(q, c, params, notes) : tableAgg(q, c, params)
  // Percentiles and ranks among qualified rows of the same position (players) and group.
  const group = [...(q.entity === 'player' ? ['position'] : []), ...dims.map((d) => `g_${d}`)]
  const over = (i: number, order: string): string =>
    `OVER (PARTITION BY ${[...group, `(q${i} AND v${i} IS NOT NULL)`].join(', ')} ORDER BY v${i} ${order})`
  const among = group.length > 0 ? `PARTITION BY ${group.join(', ')}` : ''
  const ranked = c.metrics.flatMap((m, i) => {
    const ok = `q${i} AND v${i} IS NOT NULL`
    const up = m.direction === 'lower' ? 'DESC' : 'ASC'
    const best = m.direction === 'lower' ? 'ASC' : 'DESC'
    return [
      `CASE WHEN ${ok} THEN 100 * percent_rank() ${over(i, up)} END AS p${i}`,
      `CASE WHEN ${ok} THEN rank() ${over(i, best)} END AS r${i}`,
      // The league mean and spread, for the transforms that need them.
      ...(c.transform === 'zScore' || c.transform === 'vsLeague'
        ? [
            `avg(v${i}) FILTER (WHERE ${ok}) OVER (${among}) AS m${i}`,
            `stddev_samp(v${i}) FILTER (WHERE ${ok}) OVER (${among}) AS d${i}`
          ]
        : [])
    ]
  })
  const shaped = c.metrics.map((_, i) => {
    switch (c.transform) {
      case 'percentile':
        return `p${i} AS t${i}`
      case 'zScore':
        return `(v${i} - m${i}) / nullif(d${i}, 0) AS t${i}`
      case 'vsLeague':
        return `v${i} - m${i} AS t${i}`
      default:
        return `v${i} AS t${i}`
    }
  })
  const play = c.grain === 'play'
  const flags = c.metrics.map(
    (m, i) =>
      `(s${i} > 0 AND s${i} >= ${m.minSample ?? 0} * $factor${play ? ' * coalesce(sh.share, 0)' : ''}) AS q${i}`
  )
  const playDims = dims.filter((d) => PLAY_DIMS.includes(d))
  const sharesJoin = play
    ? `LEFT JOIN shares sh ON ${playDims.length > 0 ? playDims.map((d) => `sh.g_${d} IS NOT DISTINCT FROM a.g_${d}`).join(' AND ') : 'true'}`
    : ''
  const sort = q.sort ? q.metrics.indexOf(q.sort.metric) : 0
  const lower = c.metrics[sort].direction === 'lower' && c.transform !== 'percentile'
  const dir = q.sort?.dir ?? (lower ? 'asc' : 'desc')
  const player = q.entity === 'player'
  const sql = `WITH ${ctes},${play ? `\n    ${sharesCte(q, c, params)},` : ''}
    flagged AS (SELECT a.*, ${play ? 'sh.share, ' : ''}${flags.join(', ')} FROM agg a ${sharesJoin}),
    ranked AS (SELECT *, ${ranked.join(', ')} FROM flagged),
    shaped AS (SELECT *, ${shaped.join(', ')} FROM ranked)
    SELECT x.*, ${player ? 'coalesce(pl.name, x.id)' : 'x.id'} AS name, count(*) OVER () AS total
    FROM shaped x ${player ? 'LEFT JOIN players pl ON pl.gsis_id = x.id' : ''}
    ${q.scope.qualifiedOnly ? `WHERE q${sort}` : ''}
    ORDER BY q${sort} DESC, t${sort} ${dir.toUpperCase()} NULLS LAST, name
    LIMIT ${q.limit ?? DEFAULT_LIMIT}`

  // Qualification scales `minSample` to the weeks a row covers (and, at the play grain, to the
  // share of plays it keeps: 150 routes over a season is about 45 when pressured).
  const wp = new Params()
  const weeksWhere = [
    `season IN ${wp.list(q.scope.seasons)}`,
    ...seasonTypeWhere('season_type', q, wp),
    'games = 1'
  ]
  if (q.scope.weeks) {
    weeksWhere.push(`week BETWEEN ${wp.add(q.scope.weeks[0])} AND ${wp.add(q.scope.weeks[1])}`)
  }
  for (const m of c.metrics) {
    if (m.lastSeason === 'prior' && q.scope.seasons.includes(ctx.currentSeason)) {
      notes.add(`${m.label}: published through ${ctx.currentSeason - 1}.`)
    }
    if (q.scope.seasons.some((s) => s < m.firstSeason)) {
      notes.add(`${m.label}: starts in ${m.firstSeason}.`)
    }
  }
  const last = q.scope.lastNGames
  return {
    grain: c.grain,
    metrics: c.metrics,
    transform: c.transform,
    weeksSql: `SELECT count(DISTINCT (season, season_type, week))::INTEGER AS weeks FROM team_week
               WHERE ${weeksWhere.join(' AND ')}`,
    weeksParams: wp.values,
    sql,
    params: params.values,
    rowWeeks: (weeks, seasons) => {
      if (last !== undefined) return Math.min(weeks, last)
      if (c.groupBy.includes('week')) return 1
      const bySeason = c.groupBy.includes('season')
      // A team meets an opponent about once a season.
      if (c.groupBy.includes('opponent')) return bySeason ? 1 : seasons
      if (q.scope.opponents) return q.scope.opponents.length * (bySeason ? 1 : seasons)
      return bySeason ? weeks / Math.max(1, seasons) : weeks
    },
    notes: [...notes]
  }
}
