import type {
  ChartKind,
  ResultCard,
  SplitStat,
  StatsCard,
  ToolError,
  ToolName,
  ToolOutcome,
  ToolResult
} from '@shared/ask'
import { METRIC_ALIASES } from '@shared/stats/aliases'
import { CATALOGUE, METRICS } from '@shared/stats/catalogue'
import { DIMENSION_BY_ID } from '@shared/stats/dimensions'
import { STATS_TEAMS, TEAM_NAMES } from '@shared/stats/nflTeams'
import {
  POSITION_GROUPS,
  type GroupBy,
  type MetricInfo,
  type StatsQuery,
  type StatsResult,
  type StatsRow
} from '@shared/stats/types'
import type { StatsClient } from '../stats/client'
import { fmt } from './format'
import { type LeagueReader, scoringSummary } from './league'
import { lexicalRetriever } from './metrics'
import { playerIndex, type PlayerIndex } from './players'
import { check, type Schema } from './schema'
import { splitStat, spreadOf } from './splits'
import { findTeams } from './teams'
import type { Now } from './time'

/**
 * The analyst tools (Ask spec §3): few, each the shape of a question, with flat arguments and
 * defaults filled by the app. Each builds `StatsQuery`s for the engine (never SQL), reads the rows,
 * and returns compact text for the model and cards for the screen. An invalid call returns why and
 * how to fix it.
 */
export type AnalystStats = Pick<
  StatsClient,
  'query' | 'catalogue' | 'status' | 'games' | 'outlook' | 'player' | 'people'
>

export interface TurnContext {
  now: Now
  /** The seasons the warehouse holds, oldest first. */
  seasons: number[]
  catalogue: ReadonlyMap<string, MetricInfo>
  people: PlayerIndex
  league: LeagueReader | null
  /** Splits shown in this turn (Ask spec §3.3: the split counter). */
  splits: number
}

export interface ToolDef {
  name: ToolName
  description: string
  schema: Schema
}

export interface AnalystDeps {
  stats: AnalystStats
  /** The imported league, or null without one. */
  league: () => LeagueReader | null
  /** Exact results kept (Ask spec §5.3). */
  cacheSize?: number
}

export interface Analyst {
  /** What a turn needs, read once: now, the catalogue, the player index, the league. */
  turn(): Promise<TurnContext>
  definitions(turn: TurnContext): ToolDef[]
  run(name: string, args: unknown, turn: TurnContext): Promise<ToolOutcome>
}

// ---------------------------------------------------------------------------------------------
// Schemas (the full profile; the compact profile is built from the resolver's output, compact.ts)

const GSIS = '^00-[0-9]{7}$'
const TEAM = { type: 'string', enum: STATS_TEAMS } as const satisfies Schema
const upTo = (n: number): Schema => ({ enum: Array.from({ length: n }, (_, i) => i + 1) })
const SHOWN = CATALOGUE.filter((m) => m.tier !== 'stored').map((m) => m.id)
const METRIC: Schema = { type: 'string', enum: SHOWN }
const METRIC_LIST = (max: number): Schema => ({
  type: 'array',
  items: METRIC,
  minItems: 1,
  maxItems: max
})
const BY: GroupBy[] = [
  'week',
  'season',
  'opponent',
  'team',
  'down',
  'quarter',
  'personnel',
  'coverage',
  'formation'
]
const DETAIL: Schema = {
  enum: ['concise', 'full'],
  description: 'concise (default): up to 15 rows and 6 columns; full: everything.'
}
const CHART: Schema = {
  enum: ['table', 'bar', 'line', 'scatter'],
  description: 'A hint; the app decides.'
}

function timeProps(seasons: number[]): Record<string, Schema> {
  return {
    seasons: {
      type: 'array',
      items: { enum: seasons },
      minItems: 1,
      maxItems: 8,
      description: 'Default: the current season.'
    },
    weeks: {
      type: 'array',
      items: upTo(22),
      minItems: 2,
      maxItems: 2,
      description: 'First and last week, inclusive.'
    },
    last_games: { type: 'integer', description: 'Each row’s last N games.' },
    season_type: { enum: ['REG', 'POST', 'ALL'], description: 'Default REG.' }
  }
}

const SITUATION: Record<string, Schema> = {
  down: { type: 'array', items: upTo(4), minItems: 1, maxItems: 4 },
  third_down: { type: 'boolean' },
  red_zone: { type: 'boolean', description: 'Inside the opponent’s 20.' },
  inside_10: { type: 'boolean' },
  goal_line: { type: 'boolean', description: 'Inside the opponent’s 5.' },
  pressure: { type: 'boolean', description: 'QB pressured (through the prior season).' },
  blitz: { type: 'boolean', description: 'Defense blitzed (2022+).' },
  play_action: { type: 'boolean', description: '2022+.' },
  coverage: { enum: ['man', 'zone'], description: 'Through the prior season.' },
  neutral: { type: 'boolean', description: 'Win probability 20–80 %, not the last two minutes.' },
  two_minute: { type: 'boolean' },
  personnel: { type: 'array', items: { type: 'string', pattern: '^[0-9]{2}$' }, maxItems: 4 },
  with_player: { type: 'array', items: { type: 'string', pattern: GSIS }, maxItems: 3 },
  without_player: { type: 'array', items: { type: 'string', pattern: GSIS }, maxItems: 3 },
  home: { type: 'boolean', description: 'true: home games; false: road games.' },
  opponent: TEAM
}

const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
})

export function toolDefinitions(seasons: number[]): ToolDef[] {
  const time = timeProps(seasons)
  const view = { detail: DETAIL, chart: CHART }
  return [
    {
      name: 'find',
      description:
        'Ids for names: players, teams or metrics ("Bijan", "Niners", "yards per route").',
      schema: object(
        { text: { type: 'string', maxLength: 100 }, kind: { enum: ['player', 'team', 'metric'] } },
        ['text']
      )
    },
    {
      name: 'leaderboard',
      description:
        'Rankings: who leads in a metric. Qualified rows only; ranks and percentiles among the same position.',
      schema: object(
        {
          metric: METRIC,
          also: { type: 'array', items: METRIC, maxItems: 5, description: 'More metrics to show.' },
          position: { enum: [...POSITION_GROUPS] },
          ...time,
          team: TEAM,
          rostered: {
            enum: ['any', 'mine', 'free'],
            description: 'With a league: my players, or free agents only.'
          },
          ...SITUATION,
          order: { enum: ['best', 'worst'] },
          per_game: { type: 'boolean', description: 'Counts per game.' },
          limit: { type: 'integer', description: '1–50, default 10.' },
          ...view
        },
        ['metric']
      )
    },
    {
      name: 'player_stats',
      description: 'A player’s line, game log (by: week) or splits, with his rank at his position.',
      schema: object(
        {
          player: { type: 'string', pattern: GSIS },
          metrics: METRIC_LIST(6),
          ...time,
          by: { enum: BY },
          ...SITUATION,
          ...view
        },
        ['player']
      )
    },
    {
      name: 'team_stats',
      description: 'A team’s line, by week or split, with its rank among the 32.',
      schema: object(
        {
          team: TEAM,
          side: { enum: ['offense', 'defense'] },
          metrics: METRIC_LIST(6),
          ...time,
          by: { enum: BY.filter((b) => b !== 'team') },
          ...SITUATION,
          ...view
        },
        ['team']
      )
    },
    {
      name: 'compare',
      description: '2–4 players or 2–4 teams side by side.',
      schema: object(
        {
          ids: {
            type: 'array',
            items: { type: 'string', pattern: `${GSIS}|^[A-Z]{2,3}$` },
            minItems: 2,
            maxItems: 4
          },
          metrics: METRIC_LIST(6),
          ...time,
          ...view
        },
        ['ids']
      )
    },
    {
      name: 'trend',
      description: 'A metric across seasons for one player or team.',
      schema: object(
        {
          id: { type: 'string', pattern: `${GSIS}|^[A-Z]{2,3}$` },
          metric: METRIC,
          from: { enum: seasons },
          to: { enum: seasons },
          ...view
        },
        ['id', 'metric']
      )
    },
    {
      name: 'outlook',
      description:
        'A player’s forecast signals: ceiling, floor, boom and bust, role trend, regression.',
      schema: object({ player: { type: 'string', pattern: GSIS }, season: { enum: seasons } }, [
        'player'
      ])
    },
    {
      name: 'games',
      description:
        'Schedule and results with Elo and the betting market; a team’s games or a week’s.',
      schema: object({ season: { enum: seasons }, week: upTo(22), team: TEAM })
    },
    {
      name: 'league',
      description:
        'The imported league, read only: my roster, a team’s roster, who rosters a player, the scoring.',
      schema: object(
        {
          what: { enum: ['my_roster', 'roster', 'owner_of', 'scoring'] },
          team: { type: 'string', maxLength: 60, description: 'A fantasy team’s name (roster).' },
          player: { type: 'string', pattern: GSIS }
        },
        ['what']
      )
    },
    {
      name: 'describe',
      description:
        'What a metric (or a filter such as "pressure") means: its sample, seasons and stability.',
      schema: object({ metric: { type: 'string', maxLength: 60 } }, ['metric'])
    },
    {
      name: 'query',
      description: 'Anything StatsQuery can express (the engine validates it).',
      schema: object({ query: { type: 'object' } }, ['query'])
    }
  ]
}

// ---------------------------------------------------------------------------------------------
// Arguments → StatsQuery

type Args = Record<string, unknown>

class ToolFailure extends Error {}
const fail = (message: string): never => {
  throw new ToolFailure(message)
}

const PLAY_DIMS: GroupBy[] = ['down', 'quarter', 'personnel', 'coverage', 'formation']

function situationOf(a: Args): {
  situation: NonNullable<StatsQuery['situation']>
  scope: Partial<StatsQuery['scope']>
} {
  const s: NonNullable<StatsQuery['situation']> = {}
  const scope: Partial<StatsQuery['scope']> = {}
  const downs = new Set<number>((a.down as number[] | undefined) ?? [])
  if (a.third_down) downs.add(3)
  if (downs.size > 0) s.down = [...downs].sort()
  if (a.red_zone) s.fieldZone = 'redzone'
  if (a.inside_10) s.fieldZone = 'inside10'
  if (a.goal_line) s.fieldZone = 'inside5'
  for (const [arg, key] of [
    ['pressure', 'pressure'],
    ['blitz', 'blitz'],
    ['play_action', 'playAction'],
    ['neutral', 'neutral'],
    ['two_minute', 'twoMinute']
  ] as const) {
    if (typeof a[arg] === 'boolean') s[key] = a[arg] as boolean
  }
  if (a.coverage) s.coverage = a.coverage as 'man' | 'zone'
  if (a.personnel) s.personnel = a.personnel as string[]
  if (a.with_player) s.withOnField = a.with_player as string[]
  if (a.without_player) s.withoutOnField = a.without_player as string[]
  if (typeof a.home === 'boolean') scope.home = a.home
  if (a.opponent) scope.opponents = [a.opponent as string]
  return { situation: s, scope }
}

function scopeOf(a: Args, turn: TurnContext): StatsQuery['scope'] {
  return {
    seasons: (a.seasons as number[] | undefined) ?? [turn.now.season],
    ...(a.weeks ? { weeks: a.weeks as [number, number] } : {}),
    ...(a.last_games ? { lastNGames: Math.max(1, a.last_games as number) } : {}),
    ...(a.season_type && a.season_type !== 'REG'
      ? { seasonType: a.season_type as 'POST' | 'ALL' }
      : {})
  }
}

/** A player's default line: what his position is read by. */
const DEFAULT_PLAYER: Record<string, string[]> = {
  QB: ['pass_yds', 'pass_td', 'pass_int', 'qb_epa_db', 'cpoe', 'rush_yds', 'fantasy_ppg'],
  RB: ['carries', 'rush_yds', 'rush_ypc', 'targets', 'rec_yds', 'fantasy_ppg'],
  WR: ['targets', 'receptions', 'rec_yds', 'yprr', 'target_share', 'fantasy_ppg'],
  TE: ['targets', 'receptions', 'rec_yds', 'yprr', 'target_share', 'fantasy_ppg'],
  K: ['fg_made', 'fg_att', 'fg_pct', 'fg_pct_50p'],
  P: ['punts', 'punt_net_avg', 'punt_in20_rate'],
  DL: ['tackles', 'sacks', 'pressures', 'qb_hits', 'tfl'],
  LB: ['tackles', 'sacks', 'pressures', 'tfl', 'coverage_rating'],
  DB: ['tackles', 'coverage_targets', 'coverage_rating', 'def_ints', 'pass_defended'],
  OL: ['off_snaps', 'snap_share']
}
const DEFAULT_TEAM: Record<'offense' | 'defense', string[]> = {
  offense: [
    'off_epa_play',
    'off_success_rate',
    'points_per_drive',
    'off_pass_epa',
    'off_rush_epa',
    'proe'
  ],
  defense: [
    'def_epa_play',
    'def_success_rate',
    'def_points_per_drive',
    'def_pass_epa',
    'def_rush_epa',
    'def_pressure_rate'
  ]
}

function defaultsFor(ids: string[], turn: TurnContext, plays: boolean): string[] {
  return ids.filter((id) => {
    const info = turn.catalogue.get(id)
    return info !== undefined && (!plays || info.grains.includes('play'))
  })
}

function metricOf(id: string): NonNullable<ReturnType<typeof METRICS.get>> {
  return METRICS.get(id) ?? fail(`unknown metric "${id}"`)
}

function checkPosition(metric: string, position: string | undefined): void {
  const m = metricOf(metric)
  if (!position || m.positions === 'all' || m.positions.includes(position as never)) return
  const fits = m.positions.join(', ')
  fail(
    `${metric} applies to ${fits}, not ${position}; did you mean position: ${m.positions[m.positions.length > 1 ? 1 : 0]}?`
  )
}

// ---------------------------------------------------------------------------------------------
// Text for the model

const ROWS = { concise: 15, full: 50 }
const COLUMNS = { concise: 4, full: 12 }

function seasonsText(scope: StatsQuery['scope']): string {
  const s = [...scope.seasons].sort()
  const years =
    s.length > 2 && s[s.length - 1] - s[0] === s.length - 1
      ? `${s[0]}–${s[s.length - 1]}`
      : s.join(', ')
  const weeks = scope.weeks ? ` weeks ${scope.weeks[0]}–${scope.weeks[1]}` : ''
  const last = scope.lastNGames ? `, last ${scope.lastNGames} games` : ''
  const type =
    scope.seasonType === 'POST'
      ? ' postseason'
      : scope.seasonType === 'ALL'
        ? ' incl. postseason'
        : ''
  return `${years}${type}${weeks}${last}`
}

function situationText(q: StatsQuery): string {
  const s = q.situation ?? {}
  const parts: string[] = []
  if (s.down) parts.push(`down ${s.down.join('/')}`)
  if (s.fieldZone) {
    parts.push(
      { redzone: 'red zone', inside10: 'inside the 10', inside5: 'goal line', own20: 'own 20' }[
        s.fieldZone
      ]
    )
  }
  if (s.pressure !== undefined) parts.push(s.pressure ? 'under pressure' : 'not pressured')
  if (s.blitz !== undefined) parts.push(s.blitz ? 'vs the blitz' : 'no blitz')
  if (s.playAction !== undefined) parts.push(s.playAction ? 'play-action' : 'no play-action')
  if (s.coverage) parts.push(`vs ${Array.isArray(s.coverage) ? s.coverage.join('/') : s.coverage}`)
  if (s.neutral) parts.push('neutral situations')
  if (s.twoMinute) parts.push('two-minute')
  if (s.personnel) parts.push(`${s.personnel.join('/')} personnel`)
  if (q.scope.home !== undefined) parts.push(q.scope.home ? 'home' : 'road')
  if (q.scope.opponents) parts.push(`vs ${q.scope.opponents.join('/')}`)
  if (s.withOnField) parts.push(`with ${s.withOnField.join(', ')} on the field`)
  if (s.withoutOnField) parts.push(`without ${s.withoutOnField.join(', ')}`)
  return parts.length > 0 ? `, ${parts.join(', ')}` : ''
}

const ordinal = (n: number): string => {
  const r = Math.round(n)
  const suffix =
    r % 100 >= 11 && r % 100 <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[r % 10] ?? 'th')
  return `${r}${suffix}`
}

function who(row: StatsRow, player: boolean): string {
  if (!player) return `${TEAM_NAMES[row.id] ?? row.name} (${row.id})`
  return `${row.name} (${row.id}${row.position ? `, ${row.position}` : ''}${row.team ? `, ${row.team}` : ''})`
}

function valueText(
  row: StatsRow,
  id: string,
  turn: TurnContext,
  opts: { sample?: boolean; percentile?: boolean } = {}
): string {
  const info = turn.catalogue.get(id)
  const v = row.values[id]
  if (!info || !v) return ''
  let text = `${info.short} ${fmt(v.value, info.unit, info.decimals)}${v.estimated ? ' (est.)' : ''}`
  if (opts.sample && info.kind === 'rate' && v.sample !== null) {
    text += ` on ${Math.round(v.sample)} ${info.sampleLabel}${v.qualified ? '' : ' (not qualified)'}`
  }
  if (opts.percentile && v.percentile !== null) text += `, ${ordinal(v.percentile)} pct`
  return text
}

function groupText(row: StatsRow, by: GroupBy): string {
  const g = row.group[by]
  if (by === 'week') return `Week ${g}`
  if (by === 'season') return `${g}`
  if (by === 'opponent') return `vs ${g}`
  if (by === 'down') return `Down ${g}`
  if (by === 'quarter') return g === 5 ? 'OT' : `Q${g}`
  if (by === 'coverage') return `vs ${g ?? 'unknown'}`
  return `${by} ${g ?? 'unknown'}`
}

// ---------------------------------------------------------------------------------------------
// Cards

function chartOf(
  hint: unknown,
  shape: { by?: GroupBy; metrics: number; rows: number; ranked: boolean }
): ChartKind {
  const time = shape.by === 'week' || shape.by === 'season'
  const natural: ChartKind = time ? 'line' : shape.ranked && shape.metrics === 1 ? 'bar' : 'table'
  if (hint === 'table') return 'table'
  if (hint === 'line' && time) return 'line'
  if (hint === 'bar' && shape.metrics >= 1 && !time) return 'bar'
  if (hint === 'scatter' && shape.metrics >= 2 && shape.rows >= 5) return 'scatter'
  return natural
}

function statsCard(
  title: string,
  result: StatsResult,
  chart: ChartKind,
  base: StatsRow | null = null,
  splits: Record<string, Record<string, SplitStat>> | null = null
): StatsCard {
  return { kind: 'stats', title, result, base, splits, chart }
}

// ---------------------------------------------------------------------------------------------
// The analyst

export function createAnalyst(deps: AnalystDeps): Analyst {
  const cacheSize = deps.cacheSize ?? 64
  const cache = new Map<string, StatsResult>()
  let stamp = ''
  let catalogue: ReadonlyMap<string, MetricInfo> = new Map()
  let people: PlayerIndex = playerIndex([])
  const retriever = lexicalRetriever()

  async function turn(): Promise<TurnContext> {
    const status = await deps.stats.status()
    if (!status.through)
      throw new Error('the stats are still being built; try again in a few minutes')
    const now: Now = {
      season: status.through.season,
      week: status.through.week,
      seasonType: status.through.seasonType
    }
    const next = `${status.through.season}|${status.through.seasonType}|${status.through.week}|${status.updatedAt}`
    if (next !== stamp) {
      const [info, all] = await Promise.all([deps.stats.catalogue(), deps.stats.people()])
      catalogue = new Map(info.map((m) => [m.id, m]))
      people = playerIndex(all)
      cache.clear()
      stamp = next
    }
    const seasons = Array.from({ length: now.season - 2019 + 1 }, (_, i) => 2019 + i)
    return { now, seasons, catalogue, people, league: deps.league(), splits: 0 }
  }

  /** Ask spec §5.3: an exact cache keyed on the query; cleared when the warehouse changes. */
  async function query(q: StatsQuery, used: { hits: number; total: number }): Promise<StatsResult> {
    const key = JSON.stringify(q)
    used.total++
    const hit = cache.get(key)
    if (hit) {
      used.hits++
      cache.delete(key)
      cache.set(key, hit)
      return hit
    }
    const result = await deps.stats.query(q)
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!)
    cache.set(key, result)
    return result
  }

  /** "Errors teach": the problem, then what the arguments probably meant. */
  function teach(message: string, args: unknown, turn: TurnContext): string {
    const hints: string[] = []
    const a = (args ?? {}) as Args
    const values = (key: string): string[] =>
      ([] as unknown[]).concat(a[key] ?? []).filter((v): v is string => typeof v === 'string')
    for (const key of ['metric', 'metrics', 'also']) {
      for (const v of values(key)) {
        if (METRICS.has(v)) continue
        const near = retriever
          .rank(v.replace(/_/g, ' '), 3)
          .map((c) => `${c.id} (${METRICS.get(c.id)!.label})`)
        if (near.length > 0)
          hints.push(`"${v}" is not a metric id; did you mean ${near.join(', ')}?`)
      }
    }
    for (const key of ['player', 'ids', 'with_player', 'without_player', 'id']) {
      for (const v of values(key)) {
        if (/^00-[0-9]{7}$/.test(v) || /^[A-Z]{2,3}$/.test(v)) continue
        const found = turn.people.find(v)
        for (const f of found) {
          const list = f.people.map(
            (p) => `${p.id} ${p.name} (${[p.position, p.team].filter(Boolean).join(', ')})`
          )
          hints.push(`"${f.mention}" matched ${list.join('; ')}`)
        }
        for (const t of findTeams(v)) hints.push(`"${t.mention}" is the team ${t.code}`)
      }
    }
    for (const key of ['team', 'opponent']) {
      for (const v of values(key)) {
        if (STATS_TEAMS.includes(v)) continue
        for (const t of findTeams(v)) hints.push(`"${v}" is the team ${t.code}`)
      }
    }
    return hints.length > 0 ? `${message}. ${hints.join('. ')}.` : message
  }

  async function run(name: string, args: unknown, turn: TurnContext): Promise<ToolOutcome> {
    const started = Date.now()
    const def = toolDefinitions(turn.seasons).find((d) => d.name === name)
    const error = (message: string): ToolError => ({
      ok: false,
      tool: name,
      error: message,
      ms: Date.now() - started
    })
    if (!def)
      return error(
        `there is no tool "${name}"; the tools are ${toolDefinitions(turn.seasons)
          .map((d) => d.name)
          .join(', ')}`
      )
    const problem = check(def.schema, args)
    if (problem) return error(teach(problem, args, turn))
    const used = { hits: 0, total: 0 }
    try {
      const result = await HANDLERS[def.name](args as Args, turn, {
        query: (q) => query(q, used),
        deps
      })
      return {
        ...result,
        ms: Date.now() - started,
        cached: used.total > 0 && used.hits === used.total
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return error(teach(message, args, turn))
    }
  }

  return { turn, definitions: (t) => toolDefinitions(t.seasons), run }
}

// ---------------------------------------------------------------------------------------------
// Handlers

interface Io {
  query(q: StatsQuery): Promise<StatsResult>
  deps: AnalystDeps
}

type Done = Omit<ToolResult, 'ms' | 'cached'>
type Handler = (a: Args, turn: TurnContext, io: Io) => Promise<Done>

const done = (
  tool: ToolName,
  title: string,
  text: string[],
  cards: ResultCard[],
  notes: string[],
  queries: StatsQuery[]
): Done => ({
  ok: true,
  tool,
  title,
  text: [title, ...text, ...(notes.length > 0 ? [`Notes: ${notes.join(' ')}`] : [])].join('\n'),
  cards,
  notes,
  queries
})

const detailOf = (a: Args): 'concise' | 'full' => (a.detail === 'full' ? 'full' : 'concise')

/** Why a ranking is empty, and what to change (Ask spec §3.3). */
async function explainEmpty(q: StatsQuery, io: Io, turn: TurnContext): Promise<string> {
  const loose = await io.query({ ...q, scope: { ...q.scope, qualifiedOnly: false }, limit: 3 })
  const metric = turn.catalogue.get(q.metrics[0])
  if (loose.rows.length === 0) {
    return `No rows: nothing in this scope has ${metric?.label ?? q.metrics[0]}. Try another season, fewer filters or another position.`
  }
  const best = loose.rows[0]
  const v = best.values[q.metrics[0]]
  return `No qualified rows: ${loose.total} below the minimum sample${metric?.minSample ? ` (${metric.minSample} ${metric.sampleLabel} over 17 games, scaled to the weeks in scope)` : ''}. The best unqualified: ${best.name} on ${Math.round(v?.sample ?? 0)} ${metric?.sampleLabel ?? ''}. Ask for more weeks, or without qualification.`
}

const leaderboard: Handler = async (a, turn, io) => {
  const id = a.metric as string
  const m = metricOf(id)
  const position = a.position as string | undefined
  if (m.entity === 'team' && position) fail(`${id} is a team metric; leave out position`)
  checkPosition(id, position)
  const also = ((a.also as string[] | undefined) ?? []).filter((x) => x !== id)
  for (const x of also) {
    if (metricOf(x).entity !== m.entity)
      fail(`${x} is a ${metricOf(x).entity} metric and ${id} a ${m.entity} one; list one kind`)
  }
  const { situation, scope: extra } = situationOf(a)
  const limit = Math.min(50, Math.max(1, (a.limit as number | undefined) ?? 10))
  const rostered = (a.rostered as string | undefined) ?? 'any'
  const owned =
    rostered !== 'any'
      ? (turn.league?.ownership() ?? fail('no league is imported, so rostered cannot be used'))
      : null
  const mine = owned
    ? Object.entries(m.entity === 'player' ? owned.players : owned.teams)
        .filter(([, o]) => o.mine)
        .map(([k]) => k)
    : []
  const worst = a.order === 'worst'
  const best = m.direction === 'lower' ? 'asc' : 'desc'
  const q: StatsQuery = {
    entity: m.entity,
    metrics: [id, ...also],
    scope: {
      ...scopeOf(a, turn),
      ...extra,
      ...(position ? { positions: [position as never] } : {}),
      ...(a.team ? { teams: [a.team as string] } : {}),
      ...(rostered === 'mine'
        ? {
            [m.entity === 'player' ? 'players' : 'teams']:
              mine.length > 0 ? mine : fail('your roster has no player the stats know')
          }
        : {}),
      qualifiedOnly: true
    },
    ...(Object.keys(situation).length > 0 ? { situation } : {}),
    ...(worst ? { sort: { metric: id, dir: best === 'asc' ? 'desc' : 'asc' } } : {}),
    ...(a.per_game ? { transform: 'perGame' as const } : {}),
    limit: rostered === 'free' ? 300 : limit
  }
  let result = await io.query(q)
  if (rostered === 'free' && owned) {
    const taken = m.entity === 'player' ? owned.players : owned.teams
    const rows = result.rows.filter((r) => !taken[r.id]).slice(0, limit)
    result = { ...result, rows, total: rows.length }
  }
  const info = turn.catalogue.get(id)
  const title = `${info?.label ?? id} (${id})${position ? `, ${position}` : ''}, ${seasonsText(q.scope)}${situationText(q)}${rostered === 'free' ? ', free agents' : rostered === 'mine' ? ', my team' : ''}: ${worst ? 'worst' : 'best'} first, qualified only.`
  const notes = [...result.notes]
  if (result.rows.length === 0) notes.push(await explainEmpty(q, io, turn))
  const detail = detailOf(a)
  const player = m.entity === 'player'
  const lines = result.rows.slice(0, ROWS[detail]).map((r) => {
    const v = r.values[id]
    const rest = also
      .slice(0, COLUMNS[detail] - 1)
      .map((x) => valueText(r, x, turn))
      .filter(Boolean)
    return `${v?.rank ?? '–'}. ${who(r, player)} — ${[valueText(r, id, turn, { sample: true, percentile: true }), ...rest].join(' · ')}`
  })
  const card = statsCard(
    title,
    result,
    chartOf(a.chart, { metrics: 1 + also.length, rows: result.rows.length, ranked: true })
  )
  return done('leaderboard', title, lines, [card], notes, [q])
}

/** The league query a player's or team's line is read from: his rank among his position (or the 32). */
function leagueQuery(base: StatsQuery, position: string | null): StatsQuery {
  const scope = { ...base.scope }
  delete scope.players
  delete scope.teams
  return {
    ...base,
    groupBy: undefined,
    scope: {
      ...scope,
      ...(position ? { positions: [position as never] } : {}),
      qualifiedOnly: false
    },
    limit: 5000
  }
}

async function lineAndSplits(
  tool: 'player_stats' | 'team_stats',
  a: Args,
  turn: TurnContext,
  io: Io,
  subject: { id: string; label: string; position: string | null; entity: 'player' | 'team' },
  metrics: string[]
): Promise<Done> {
  const { situation, scope: extra } = situationOf(a)
  const by = a.by as GroupBy | undefined
  const q: StatsQuery = {
    entity: subject.entity,
    metrics,
    scope: {
      ...scopeOf(a, turn),
      ...extra,
      [subject.entity === 'player' ? 'players' : 'teams']: [subject.id],
      qualifiedOnly: false
    },
    ...(Object.keys(situation).length > 0 ? { situation } : {}),
    ...(by ? { groupBy: [by] } : {}),
    limit: 200
  }
  const league = leagueQuery(q, subject.entity === 'player' ? subject.position : null)
  const [leagueResult, splitResult] = await Promise.all([
    io.query(league),
    by ? io.query(q) : Promise.resolve(null)
  ])
  const own = leagueResult.rows.find((r) => r.id === subject.id) ?? null
  const detail = detailOf(a)
  const shown = metrics.slice(0, COLUMNS[detail] + 2)
  const title = `${subject.label}, ${seasonsText(q.scope)}${situationText(q)}${by ? `, by ${by}` : ''}.`
  const notes = [...leagueResult.notes, ...(splitResult?.notes ?? [])].filter(
    (n, i, all) => all.indexOf(n) === i
  )
  const queries = by ? [q, league] : [league]
  if (!by) {
    const rows = own ? [own] : []
    if (!own)
      notes.push(
        'No rows: nothing in this scope for this player or team (no game, or the metric starts later).'
      )
    const result = { ...leagueResult, rows, total: rows.length }
    const among =
      subject.entity === 'player' ? `among ${subject.position ?? 'his position'}s` : 'among the 32'
    const lines = own
      ? [
          `${shown
            .map((x) => valueText(own, x, turn, { sample: true, percentile: true }))
            .filter(Boolean)
            .join(' · ')} (percentiles ${among}, qualified rows only)`
        ]
      : []
    const card = statsCard(
      title,
      result,
      chartOf(a.chart, { metrics: metrics.length, rows: 1, ranked: false })
    )
    return done(tool, title, lines, [card], notes, queries)
  }
  // Rows with no value for the split (a play participation did not chart) are left out, and time
  // and down splits read in order.
  const ordered = ['week', 'season', 'down', 'quarter'].includes(by)
  const splitRows = splitResult!.rows
    .filter((r) => r.group[by] !== null && r.group[by] !== undefined)
    .sort((x, y) => (ordered ? Number(x.group[by]) - Number(y.group[by]) : 0))
  const split = { ...splitResult!, rows: splitRows, total: splitRows.length }
  turn.splits++
  const stats: Record<string, Record<string, SplitStat>> = {}
  const spreads = new Map(metrics.map((x) => [x, spreadOf(leagueResult.rows, x)]))
  for (const row of split.rows) {
    const key = String(row.group[by])
    stats[key] = Object.fromEntries(
      metrics.map((x) => [
        x,
        splitStat(
          turn.catalogue.get(x) ?? { kind: 'count', stability: null },
          row.values[x],
          own?.values[x],
          spreads.get(x) ?? null
        )
      ])
    )
  }
  const lines: string[] = []
  if (own)
    lines.push(
      `All: ${shown
        .map((x) => valueText(own, x, turn, { sample: true }))
        .filter(Boolean)
        .join(' · ')}`
    )
  for (const row of split.rows.slice(0, by === 'week' || by === 'season' ? 25 : ROWS[detail])) {
    const key = String(row.group[by])
    const parts = shown.map((x) => {
      const t = valueText(row, x, turn, { sample: by !== 'week' })
      const s = stats[key][x]
      if (!t || s.diff === null || s.withinNoise === null || by === 'week' || by === 'season')
        return t
      const info = turn.catalogue.get(x)!
      const diff = `${s.diff >= 0 ? '+' : ''}${fmt(s.diff, info.unit, info.decimals).replace(/^\+/, '')}`
      return `${t} (${diff} vs all, ${s.withinNoise ? 'within noise' : 'beyond noise'})`
    })
    lines.push(`${groupText(row, by)}: ${parts.filter(Boolean).join(' · ')}`)
  }
  if (split.rows.length === 0)
    notes.push(
      'No rows: nothing in this split (the filter or split may need participation or FTN seasons).'
    )
  if (turn.splits >= 3) {
    notes.push(
      `This is split ${turn.splits} looked at in this answer; with many splits, one will look unusual by chance.`
    )
  }
  const card = statsCard(
    title,
    split,
    chartOf(a.chart, { by, metrics: metrics.length, rows: split.rows.length, ranked: false }),
    own,
    stats
  )
  return done(tool, title, lines, [card], notes, queries)
}

const playerStats: Handler = async (a, turn, io) => {
  const person =
    turn.people.byId(a.player as string) ??
    fail(`no player with id ${a.player as string}; call find with his name`)
  const plays =
    Object.keys(situationOf(a).situation).length > 0 || PLAY_DIMS.includes(a.by as GroupBy)
  const asked = a.metrics as string[] | undefined
  for (const x of asked ?? []) {
    if (metricOf(x).entity !== 'player') fail(`${x} is a team metric; use team_stats`)
    checkPosition(x, person.position ?? undefined)
  }
  const metrics =
    asked ?? defaultsFor(DEFAULT_PLAYER[person.position ?? ''] ?? DEFAULT_PLAYER.WR, turn, plays)
  if (metrics.length === 0)
    fail('none of this player’s default metrics can be split by situation; name the metrics')
  return lineAndSplits(
    'player_stats',
    a,
    turn,
    io,
    {
      id: person.id,
      label: `${person.name} (${person.id}, ${[person.position, person.team].filter(Boolean).join(', ')})`,
      position: person.position,
      entity: 'player'
    },
    metrics
  )
}

const teamStats: Handler = async (a, turn, io) => {
  const team = a.team as string
  const plays =
    Object.keys(situationOf(a).situation).length > 0 || PLAY_DIMS.includes(a.by as GroupBy)
  const asked = a.metrics as string[] | undefined
  for (const x of asked ?? []) {
    if (metricOf(x).entity !== 'team')
      fail(`${x} is a player metric; use player_stats or leaderboard with team: ${team}`)
  }
  const side = (a.side as 'offense' | 'defense' | undefined) ?? 'offense'
  const metrics = asked ?? defaultsFor(DEFAULT_TEAM[side], turn, plays)
  if (metrics.length === 0)
    fail('none of the default metrics can be split by situation; name the metrics')
  return lineAndSplits(
    'team_stats',
    a,
    turn,
    io,
    { id: team, label: `${TEAM_NAMES[team]} (${team})`, position: null, entity: 'team' },
    metrics
  )
}

const compare: Handler = async (a, turn, io) => {
  const ids = [...new Set(a.ids as string[])]
  const teams = ids.every((x) => STATS_TEAMS.includes(x))
  const players = ids.every((x) => /^00-[0-9]{7}$/.test(x))
  if (!teams && !players) fail('ids must be all player ids or all team codes')
  if (ids.length < 2) fail('compare needs 2–4 different ids')
  const people = players
    ? ids.map((x) => turn.people.byId(x) ?? fail(`no player with id ${x}; call find with his name`))
    : []
  const positions = [...new Set(people.map((p) => p.position).filter((p): p is string => !!p))]
  const metrics =
    (a.metrics as string[] | undefined) ??
    (players
      ? defaultsFor(DEFAULT_PLAYER[positions[0] ?? 'WR'] ?? DEFAULT_PLAYER.WR, turn, false)
      : DEFAULT_TEAM.offense)
  for (const x of metrics) {
    if (metricOf(x).entity !== (players ? 'player' : 'team'))
      fail(`${x} is a ${metricOf(x).entity} metric`)
  }
  const q: StatsQuery = {
    entity: players ? 'player' : 'team',
    metrics,
    scope: {
      ...scopeOf(a, turn),
      ...(positions.length > 0 ? { positions: positions as never[] } : {}),
      qualifiedOnly: false
    },
    limit: 5000
  }
  const all = await io.query(q)
  const rows = ids.map((x) => all.rows.find((r) => r.id === x)).filter((r): r is StatsRow => !!r)
  const result = { ...all, rows, total: rows.length }
  const title = `${players ? people.map((p) => p.name).join(' vs ') : ids.join(' vs ')}, ${seasonsText(q.scope)}.`
  const detail = detailOf(a)
  const lines = rows.map(
    (r) =>
      `${who(r, players)}: ${metrics
        .slice(0, COLUMNS[detail] + 2)
        .map((x) => valueText(r, x, turn, { sample: true, percentile: true }))
        .filter(Boolean)
        .join(' · ')}`
  )
  const notes = [...all.notes]
  const missing = ids.filter((x) => !rows.some((r) => r.id === x))
  if (missing.length > 0) notes.push(`No rows for ${missing.join(', ')} in this scope.`)
  if (players && positions.length > 1)
    notes.push('Percentiles are among each player’s own position.')
  const card = statsCard(
    title,
    result,
    chartOf(a.chart, { metrics: metrics.length, rows: rows.length, ranked: false })
  )
  return done('compare', title, lines, [card], notes, [q])
}

const trend: Handler = async (a, turn, io) => {
  const id = a.id as string
  const player = /^00-[0-9]{7}$/.test(id)
  const metric = a.metric as string
  if (metricOf(metric).entity !== (player ? 'player' : 'team'))
    fail(`${metric} is a ${metricOf(metric).entity} metric`)
  const person = player
    ? (turn.people.byId(id) ?? fail(`no player with id ${id}; call find with his name`))
    : null
  const from = (a.from as number | undefined) ?? Math.max(2019, person?.firstSeason ?? 2019)
  const to = (a.to as number | undefined) ?? turn.now.season
  if (to < from) fail('from must be before to')
  const seasons = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const q: StatsQuery = {
    entity: player ? 'player' : 'team',
    metrics: [metric],
    scope: { seasons, [player ? 'players' : 'teams']: [id], qualifiedOnly: false },
    groupBy: ['season'],
    limit: 50
  }
  const result = await io.query(q)
  const info = turn.catalogue.get(metric)
  const title = `${person?.name ?? TEAM_NAMES[id] ?? id} (${id}): ${info?.label ?? metric} (${metric}) by season, ${from}–${to}.`
  const rows = [...result.rows].sort((x, y) => Number(x.group.season) - Number(y.group.season))
  const lines = rows.map(
    (r) => `${r.group.season}: ${valueText(r, metric, turn, { sample: true })}`
  )
  const notes = [...result.notes]
  if (rows.length === 0) notes.push('No rows: no season in this range has this metric for this id.')
  return done('trend', title, lines, [statsCard(title, { ...result, rows }, 'line')], notes, [q])
}

const outlook: Handler = async (a, turn, io) => {
  const person =
    turn.people.byId(a.player as string) ??
    fail(`no player with id ${a.player as string}; call find with his name`)
  const season = (a.season as number | undefined) ?? turn.now.season
  const o = await io.deps.stats.outlook({ player: person.id, season })
  const pts = (x: number | null): string => (x === null ? '—' : x.toFixed(1))
  const pct = (x: number | null): string => (x === null ? '—' : `${(x * 100).toFixed(0)}%`)
  const title = `${person.name} (${person.id}) outlook, ${season}, ${o.scoring.toUpperCase()} scoring, ${o.games} games.`
  const lines = [
    `Ceiling (80th pct week) ${pts(o.ceiling.season)} this season, ${pts(o.ceiling.last16)} over his last 16 games; floor (20th) ${pts(o.floor.season)} / ${pts(o.floor.last16)}.`,
    `Boom rate ${pct(o.boomRate)}, bust rate ${pct(o.bustRate)}.`,
    ...o.trend
      .filter((t) => t.change !== null)
      .map(
        (t) =>
          `Role: ${METRICS.get(t.metric)?.label ?? t.metric} ${t.change! >= 0 ? 'up' : 'down'} over his last 4 games${t.roleChange ? ' (beyond noise)' : ' (within noise)'}.`
      ),
    ...o.regression
      .filter((r) => r.signal)
      .map(
        (r) =>
          `Regression: ${METRICS.get(r.metric)?.label ?? r.metric} is running ${r.signal} (expected to move back toward the position mean).`
      ),
    o.schedule.easierBy !== null
      ? `Rest of season: ${o.schedule.opponents.length} games, opponents allow ${o.schedule.easierBy >= 0 ? '+' : ''}${o.schedule.easierBy.toFixed(1)} points per game to his position vs average.`
      : ''
  ].filter(Boolean)
  return done('outlook', title, lines, [{ kind: 'outlook', title, outlook: o }], [], [])
}

const games: Handler = async (a, turn, io) => {
  const season = (a.season as number | undefined) ?? turn.now.season
  const team = a.team as string | undefined
  const nextWeek = turn.now.seasonType === 'REG' ? Math.min(22, turn.now.week + 1) : turn.now.week
  const week =
    (a.week as number | undefined) ?? (team ? undefined : season === turn.now.season ? nextWeek : 1)
  const all = await io.deps.stats.games({
    season,
    ...(team ? { team } : {}),
    ...(week ? { weeks: [week, week] as [number, number] } : {})
  })
  const title = `Games, ${season}${week ? ` week ${week}` : ''}${team ? `, ${TEAM_NAMES[team]}` : ''}.`
  const lines = all.slice(0, 25).map((g) => {
    const score =
      g.homeScore !== null
        ? `${g.away} ${g.awayScore} @ ${g.home} ${g.homeScore}`
        : `${g.away} @ ${g.home}${g.kickoff ? ` (${g.kickoff})` : ''}`
    const elo = `Elo: ${g.home} ${(g.homeWinProb * 100).toFixed(0)}%`
    const market =
      g.spread !== null
        ? `, spread ${g.home} ${g.spread > 0 ? '−' : '+'}${Math.abs(g.spread).toFixed(1)}, total ${g.total?.toFixed(1) ?? '—'}`
        : ''
    return `Week ${g.week}: ${score}. ${elo}${market}.`
  })
  const notes = all.length === 0 ? ['No games in this scope.'] : []
  return done('games', title, lines, [{ kind: 'games', title, games: all }], notes, [])
}

const league: Handler = async (a, turn) => {
  const reader = turn.league ?? fail('no league is imported; league data is not available')
  const what = a.what as string
  if (what === 'scoring') {
    const rules = reader.rules() ?? fail('the league has no scoring rules yet; sync the league')
    const lines = scoringSummary(rules)
    return done(
      'league',
      'League scoring.',
      lines,
      [{ kind: 'list', title: 'League scoring', columns: ['Rule'], rows: lines.map((l) => [l]) }],
      [],
      []
    )
  }
  if (what === 'owner_of') {
    const id = (a.player as string | undefined) ?? fail('owner_of needs player (an id)')
    const owner = reader.ownership().players[id]
    const person = turn.people.byId(id)
    const name = person?.name ?? id
    const line = owner
      ? `${name} is on ${owner.name}${owner.mine ? ' (your team)' : ''}.`
      : `${name} is not rostered in the league (a free agent).`
    return done(
      'league',
      `Who rosters ${name}.`,
      [line],
      [
        {
          kind: 'list',
          title: 'Owner',
          columns: ['Player', 'Team'],
          rows: [[name, owner?.name ?? 'Free agent']]
        }
      ],
      [],
      []
    )
  }
  const teams = reader.teams()
  const wanted =
    what === 'my_roster'
      ? teams.find((t) => t.mine)
      : teams.find(
          (t) => t.name.toLowerCase().includes(String(a.team ?? '').toLowerCase()) && a.team
        )
  if (!wanted) {
    fail(
      what === 'my_roster'
        ? 'the league has no team marked as yours'
        : `no fantasy team named "${String(a.team ?? '')}"; the teams are ${teams.map((t) => t.name).join(', ')}`
    )
  }
  const team = wanted!
  const roster = reader.roster(team.rosterId)
  const lines = roster.map(
    (p) =>
      `${p.slot}: ${p.name}${p.gsis ? ` (${p.gsis})` : ''}, ${[p.position, p.team].filter(Boolean).join(', ')}`
  )
  return done(
    'league',
    `${team.name}${team.mine ? ' (your team)' : ''}: roster.`,
    lines,
    [
      {
        kind: 'list',
        title: `${team.name} roster`,
        columns: ['Slot', 'Player', 'Pos', 'Team'],
        rows: roster.map((p) => [p.slot, p.name, p.position, p.team])
      }
    ],
    [],
    []
  )
}

const describe: Handler = async (a, turn) => {
  const text = (a.metric as string).trim()
  const dim = DIMENSION_BY_ID.get(text)
  if (dim) {
    const seasons = `${dim.firstSeason}${dim.lastSeason === 'prior' ? ' to the prior season' : ' on'}`
    const lines = [
      dim.description,
      `Seasons: ${seasons}. Grain: ${dim.grain}. Sources: ${dim.sources.join(', ')}.`
    ]
    return done(
      'describe',
      `${dim.label} (${dim.id}).`,
      lines,
      [{ kind: 'list', title: dim.label, columns: ['About'], rows: lines.map((l) => [l]) }],
      [],
      []
    )
  }
  const info =
    turn.catalogue.get(text) ??
    (() => {
      const near = lexicalRetriever().rank(text, 3)
      return fail(
        near.length > 0
          ? `"${text}" is not a metric id; did you mean ${near.map((c) => `${c.id} (${METRICS.get(c.id)!.label})`).join(', ')}?`
          : `"${text}" is not a metric id`
      )
    })()
  const s = info.stability
  const stability =
    s?.yearToYear !== null && s?.yearToYear !== undefined
      ? `Stability: year-to-year r ${s.yearToYear.toFixed(2)} (${s.reliability}), half signal at ${s.prior ? Math.round(s.prior) : '—'} ${info.sampleLabel}.`
      : 'Stability: not measured.'
  const lines = [
    info.description,
    `Unit: ${info.unit}; ${info.direction === 'lower' ? 'lower is better' : info.direction === 'higher' ? 'higher is better' : 'neither better nor worse'}. Sample: ${info.sampleLabel}${info.minSample ? `, qualified at ${info.minSample} over 17 games` : ''}.`,
    `${info.entity === 'player' ? `Positions: ${info.positions === 'all' ? 'all' : info.positions.join(', ')}. ` : ''}Seasons: ${info.firstSeason}${info.lastSeason === 'prior' ? ' to the prior season' : ' on'}. Sources: ${info.sources.join(', ')}.`,
    stability
  ]
  return done(
    'describe',
    `${info.label} (${info.id}).`,
    lines,
    [
      {
        kind: 'describe',
        title: info.label,
        metric: info,
        aliases: [...(METRIC_ALIASES[info.id] ?? [])]
      }
    ],
    [],
    []
  )
}

const find: Handler = async (a, turn) => {
  const text = a.text as string
  const kind = a.kind as string | undefined
  const lines: string[] = []
  if (!kind || kind === 'player') {
    for (const m of turn.people.find(text)) {
      for (const p of m.people)
        lines.push(
          `Player: ${p.name} = ${p.id} (${[p.position, p.team].filter(Boolean).join(', ')}), last played ${p.lastSeason}`
        )
    }
  }
  if (!kind || kind === 'team')
    for (const t of findTeams(text)) lines.push(`Team: ${TEAM_NAMES[t.code]} = ${t.code}`)
  if (!kind || kind === 'metric') {
    for (const c of lexicalRetriever().rank(text, 5))
      lines.push(`Metric: ${c.id} = ${METRICS.get(c.id)!.label}`)
  }
  if (lines.length === 0) lines.push('Nothing matched; try other words.')
  return done(
    'find',
    `Matches for "${text}".`,
    lines,
    [{ kind: 'list', title: 'Matches', columns: ['Match'], rows: lines.map((l) => [l]) }],
    [],
    []
  )
}

const query: Handler = async (a, turn, io) => {
  const q = a.query as StatsQuery
  const result = await io.query(q)
  const player = q.entity === 'player'
  const title = `${q.metrics.map((x) => turn.catalogue.get(x)?.label ?? x).join(', ')}, ${seasonsText(q.scope)}${situationText(q)}.`
  const detail = detailOf(a)
  const by = q.groupBy?.[0]
  const lines = result.rows.slice(0, ROWS[detail]).map((r) => {
    const g = q.groupBy?.map((x) => groupText(r, x)).join(', ')
    return `${r.values[q.metrics[0]]?.rank ?? '–'}. ${who(r, player)}${g ? ` [${g}]` : ''} — ${q.metrics
      .slice(0, COLUMNS[detail])
      .map((x) => valueText(r, x, turn, { sample: true }))
      .filter(Boolean)
      .join(' · ')}`
  })
  const notes = [...result.notes]
  if (result.rows.length === 0) notes.push('No rows in this scope.')
  return done(
    'query',
    title,
    lines,
    [
      statsCard(
        title,
        result,
        chartOf(undefined, { by, metrics: q.metrics.length, rows: result.rows.length, ranked: !by })
      )
    ],
    notes,
    [q]
  )
}

const HANDLERS: Record<ToolName, Handler> = {
  find,
  leaderboard,
  player_stats: playerStats,
  team_stats: teamStats,
  compare,
  trend,
  outlook,
  games,
  league,
  describe,
  query
}

export { ToolFailure }
