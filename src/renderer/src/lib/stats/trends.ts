import { fmtStat, ordinal } from '@/lib/stats/format'
import { qualifies } from '@/lib/stats/leaderboard'
import { ageOn, appliesToPosition, positionTab } from '@/lib/stats/player'
import { FIRST_SEASON, latestSeason, type StatsScope } from '@/lib/stats/scope'
import { teamRank } from '@/lib/stats/team'
import { teamAbbr } from '@shared/stats/nflTeams'
import type {
  MetricFamily,
  MetricInfo,
  PositionGroup,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'

/** Trends (spec §9.5): a metric by season, 2019 → now, for a player or a team. */
export type TrendEntity = 'player' | 'team'

/** Up to two more series for context: --s2 (square) and --s3 (diamond). */
export const MAX_COMPARISONS = 2

/** "Career at a glance": six core metrics per position, or a team's offense. */
export const TREND_CORE: Record<PositionGroup | 'team', string[]> = {
  QB: ['qb_epa_db', 'cpoe', 'qb_success', 'pass_anya', 'sack_rate', 'fantasy_ppg'],
  RB: ['carry_share', 'snap_share', 'rush_ypc', 'ryoe_att', 'target_share', 'fantasy_ppg'],
  WR: [
    'target_share',
    'air_yards_share',
    'yprr',
    'separation',
    'route_participation',
    'fantasy_ppg'
  ],
  TE: ['target_share', 'route_participation', 'yprr', 'separation', 'snap_share', 'fantasy_ppg'],
  K: ['fg_pct', 'fgoe_pct', 'fg_pct_50p', 'pat_pct', 'kicker_epa', 'fantasy_ppg'],
  P: ['punt_net_avg', 'punt_in20_rate', 'punter_epa', 'punt_avg', 'punt_tb_rate'],
  DL: ['pressures', 'sacks', 'qb_hits', 'tfl', 'def_stuffs', 'def_snap_share'],
  LB: ['tackles', 'tfl', 'def_stuffs', 'missed_tackle_pct', 'pressures', 'def_snap_share'],
  DB: [
    'coverage_ypt',
    'coverage_cmp_pct',
    'coverage_rating',
    'pass_defended',
    'def_ints',
    'def_snap_share'
  ],
  OL: ['snap_share', 'on_field_epa'],
  team: [
    'off_epa_play',
    'off_success_rate',
    'off_explosive_rate',
    'off_pass_epa',
    'off_rush_epa',
    'off_rz_td_pct'
  ]
}

const FAMILIES: MetricFamily[] = ['traditional', 'advanced', 'ngs', 'charting', 'predictive']

/** Whether a metric belongs on a Trends chart for this entity (season grain, not stored-only). */
function trendable(
  info: MetricInfo | undefined,
  entity: TrendEntity,
  position: PositionGroup
): boolean {
  if (!info || info.tier === 'stored' || !info.grains.includes('season')) return false
  // A team metric applies to 'all' positions: a player's list asks for player metrics too.
  return entity === 'team'
    ? info.entity === 'team'
    : info.entity === 'player' && appliesToPosition(info, position)
}

/** The core metrics a position (or a team) shows at a glance, those the catalogue has. */
export function trendCore(
  entity: TrendEntity,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): string[] {
  return TREND_CORE[entity === 'team' ? 'team' : position].filter((id) =>
    trendable(byId.get(id), entity, position)
  )
}

/** The metric select: every metric for the entity, grouped by family, the catalogue's order. */
export function trendMetrics(
  entity: TrendEntity,
  position: PositionGroup,
  catalogue: readonly MetricInfo[]
): { family: MetricFamily; metrics: MetricInfo[] }[] {
  return FAMILIES.map((family) => ({
    family,
    metrics: catalogue.filter((m) => m.family === family && trendable(m, entity, position))
  })).filter((g) => g.metrics.length > 0)
}

/** The seasons Trends spans: 2019 through the season the data runs through. */
export function trendSeasons(status: StatsStatus | null, now = new Date()): number[] {
  const last = latestSeason(status, now)
  return Array.from({ length: last - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i)
}

/**
 * Every row at the position (or every team) by season: the line, the comparisons, the band and the
 * ranks of each season come from one query. Whole seasons; counts per game when asked.
 */
export function trendQuery(
  entity: TrendEntity,
  position: PositionGroup,
  metrics: string[],
  scope: StatsScope,
  status: StatsStatus | null,
  perGame: boolean
): StatsQuery {
  const qualifier = entity === 'player' ? positionTab(position).qualifier : undefined
  const ids = [...new Set([...metrics, ...(qualifier ? [qualifier] : [])])]
  return {
    entity,
    metrics: ids,
    scope: {
      seasons: trendSeasons(status),
      seasonType: scope.seasonType,
      ...(entity === 'player' ? { positions: [position] } : {})
    },
    groupBy: ['season'],
    transform: perGame ? 'perGame' : 'raw',
    sort: { metric: ids[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: 5000
  }
}

/**
 * A player's games by week, each with that week's team: his teams in the order he played for them
 * (the team changes on the axis). About 20 rows a season.
 */
export function playerTeamsQuery(
  player: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'player',
    metrics: ['games'],
    scope: { seasons: trendSeasons(status), seasonType: scope.seasonType, players: [player] },
    groupBy: ['season', 'week'],
    transform: 'raw',
    sort: { metric: 'games', dir: 'desc' },
    scoring: scope.scoring,
    limit: 1000
  }
}

const seasonOf = (r: StatsRow): number => Number(r.group.season)

/** A season's rows of a by-season result. */
function inSeason(result: StatsResult, season: number): StatsResult {
  return { ...result, rows: result.rows.filter((r) => seasonOf(r) === season) }
}

/** Who a season ranks among: the position's players its leaderboard qualifies, or every team. */
function poolIn(
  rows: readonly StatsRow[],
  entity: TrendEntity,
  position: PositionGroup
): Set<string> {
  if (entity === 'team') return new Set(rows.map((r) => r.id))
  const tab = positionTab(position)
  return new Set(rows.filter((r) => r.position === position && qualifies(r, tab)).map((r) => r.id))
}

export interface TrendPoint {
  season: number
  value: number | null
  /** In the pool that season: the position's qualifier (players) and the metric's own sample. */
  qualified: boolean
  /** 0–100 among the season's pool; null when not qualified. */
  percentile: number | null
  rank: number | null
  of: number
  sample: number | null
  estimated: boolean
}

/** One entity's line: its value each season, ranked among that season's pool. */
export function trendLine(
  result: StatsResult | null,
  id: string,
  metric: string,
  seasons: readonly number[],
  entity: TrendEntity,
  position: PositionGroup,
  direction: MetricInfo['direction']
): TrendPoint[] {
  return seasons.map((season) => {
    const sub = result ? inSeason(result, season) : null
    const r = sub?.rows.find((x) => x.id === id)
    const v = r?.values[metric]
    const pool = sub ? poolIn(sub.rows, entity, position) : new Set<string>()
    const place =
      sub && pool.has(id) ? teamRank(sub, id, metric, direction, (x) => pool.has(x.id)) : null
    return {
      season,
      value: v?.value ?? null,
      qualified: place !== null,
      percentile: place?.percentile ?? null,
      rank: place?.rank ?? null,
      of: place?.of ?? 0,
      sample: v?.sample ?? null,
      estimated: v?.estimated ?? false
    }
  })
}

export interface BandPoint {
  season: number
  p25: number | null
  median: number | null
  p75: number | null
}

const quantile = (sorted: readonly number[], q: number): number | null => {
  if (!sorted.length) return null
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo)
}

/** The position's qualified 25th, 50th and 75th percentile values each season. */
export function trendBand(
  result: StatsResult | null,
  metric: string,
  seasons: readonly number[],
  entity: TrendEntity,
  position: PositionGroup
): BandPoint[] {
  return seasons.map((season) => {
    const rows = (result?.rows ?? []).filter((r) => seasonOf(r) === season)
    const pool = poolIn(rows, entity, position)
    const vs = rows
      .filter((r) => pool.has(r.id) && r.values[metric]?.qualified)
      .map((r) => r.values[metric]!.value)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)
    return {
      season,
      p25: quantile(vs, 0.25),
      median: quantile(vs, 0.5),
      p75: quantile(vs, 0.75)
    }
  })
}

/** The seasons a player or team has rows: from the first to the last (a missed season stays). */
export function careerSpan(
  result: StatsResult | null,
  id: string,
  seasons: readonly number[]
): number[] {
  const has = new Set((result?.rows ?? []).filter((r) => r.id === id).map(seasonOf))
  const first = seasons.findIndex((s) => has.has(s))
  if (first < 0) return []
  let last = seasons.length - 1
  while (!has.has(seasons[last])) last--
  return seasons.slice(first, last + 1)
}

/** A player's team(s) each season, in the order he played for them (his weekly rows). */
export function teamsBySeason(result: StatsResult | null): Map<number, string[]> {
  const out = new Map<number, string[]>()
  const weeks = [...(result?.rows ?? [])]
    .filter((r) => r.team && r.games > 0)
    .sort((a, b) => seasonOf(a) - seasonOf(b) || Number(a.group.week) - Number(b.group.week))
  for (const r of weeks) {
    const s = seasonOf(r)
    const teams = out.get(s) ?? []
    if (teams[teams.length - 1] !== r.team) out.set(s, [...teams, r.team!])
  }
  return out
}

/** His games each season, from the same weekly rows. */
export function gamesBySeason(result: StatsResult | null): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of result?.rows ?? []) out.set(seasonOf(r), (out.get(seasonOf(r)) ?? 0) + r.games)
  return out
}

/** The axis's team marks: the team under his first season and every season it changed. */
export function teamMarks(
  span: readonly number[],
  teams: ReadonlyMap<number, string[]>
): Map<number, string> {
  const marks = new Map<number, string>()
  let prev: string | null = null
  for (const s of span) {
    const ts = teams.get(s)
    if (!ts?.length) continue
    const label = ts.map(teamAbbr).join(' → ')
    if (ts[0] !== prev || ts.length > 1) marks.set(s, label)
    prev = ts[ts.length - 1]
  }
  return marks
}

/** "BRK 2021–23, HAR since 2024": a player's teams over his seasons. */
export function teamRuns(span: readonly number[], teams: ReadonlyMap<number, string[]>): string {
  const runs: { team: string; from: number; to: number }[] = []
  for (const s of span) {
    for (const t of teams.get(s) ?? []) {
      const last = runs[runs.length - 1]
      if (last && last.team === t) last.to = s
      else runs.push({ team: t, from: s, to: s })
    }
  }
  if (runs.length < 2) return ''
  return runs
    .map((r, i) =>
      i === runs.length - 1
        ? `${teamAbbr(r.team)} since ${r.from}`
        : `${teamAbbr(r.team)} ${r.from}${r.to > r.from ? `–${String(r.to).slice(2)}` : ''}`
    )
    .join(', ')
}

/** His age that season (September 1), this season's today: as the player dashboard's header. */
export function seasonAge(
  birthDate: string | null,
  season: number,
  today = new Date()
): number | null {
  return ageOn(birthDate, season < today.getFullYear() ? new Date(season, 8, 1) : today)
}

export interface TrendRow {
  season: number
  team: string
  age: number | null
  games: number | null
  value: string
  /** Signed, written like the value ("+0.25", "+2.1 pts" for a rate in percent). */
  delta: string
  deltaTone: 'good' | 'bad' | 'none'
  percentile: number | null
  /** "12th of 110"; "—" when not qualified. */
  rank: string
  sample: string
  qualified: boolean
}

/** The change from the season before, toned by the metric's better side. */
export function trendDelta(
  info: MetricInfo | undefined,
  now: number | null,
  before: number | null,
  perGame: boolean
): { text: string; tone: 'good' | 'bad' | 'none' } {
  if (now === null || before === null) return { text: '—', tone: 'none' }
  const d = now - before
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±'
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const text =
    info?.unit === 'pct'
      ? `${sign}${Math.abs(d * 100).toFixed(1)} pts`
      : `${sign}${fmtStat(Math.abs(d), f, perGame).replace(/^[+−-]/, '')}`
  const direction = info?.direction ?? 'neutral'
  const tone =
    d === 0 || direction === 'neutral'
      ? 'none'
      : d > 0 === (direction === 'higher')
        ? 'good'
        : 'bad'
  return { text, tone }
}

/** The table under the chart, newest first. */
export function trendRows(
  points: readonly TrendPoint[],
  info: MetricInfo | undefined,
  rows: { season: number; team: string; games: number | null; age: number | null }[],
  perGame: boolean
): TrendRow[] {
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const sampleLabel = info?.sampleLabel ?? 'sample'
  return points
    .map((p, i) => {
      const meta = rows.find((r) => r.season === p.season)
      const delta = trendDelta(info, p.value, i > 0 ? points[i - 1].value : null, perGame)
      return {
        season: p.season,
        team: meta?.team ?? '',
        age: meta?.age ?? null,
        games: meta?.games ?? null,
        value:
          p.value === null
            ? info && p.season < info.firstSeason
              ? 'not charted'
              : '—'
            : `${fmtStat(p.value, f, perGame)}${p.estimated ? ' est.' : ''}`,
        delta: delta.text,
        deltaTone: delta.tone,
        percentile: p.percentile,
        rank: p.rank !== null ? `${ordinal(p.rank)} of ${p.of}` : '—',
        sample:
          p.sample === null
            ? ''
            : `${p.qualified ? '' : 'Not qualified · '}${Math.round(p.sample).toLocaleString('en-US')} ${sampleLabel}`,
        qualified: p.qualified
      }
    })
    .reverse()
}

/**
 * What a metric's coverage says about the span: "Charted from 2022.", "Next Gen Stats from 2019.",
 * "Not published for 2026 yet.", "Routes for 2026 are estimated."
 */
export function trendNotes(
  info: MetricInfo | undefined,
  span: readonly number[],
  current: number,
  estimated: boolean
): string[] {
  if (!info || !span.length) return []
  const notes: string[] = []
  if (info.firstSeason > span[0]) {
    notes.push(
      info.family === 'charting'
        ? `Charted from ${info.firstSeason}.`
        : info.family === 'ngs'
          ? `Next Gen Stats from ${info.firstSeason}.`
          : `From ${info.firstSeason}.`
    )
  }
  if (info.lastSeason === 'prior' && span.includes(current)) {
    notes.push(`Not published for ${current} yet.`)
  }
  if (estimated) notes.push(`Estimated for ${current}.`)
  return notes
}

export interface GlanceView {
  metric: string
  label: string
  /** The last value ("(2025)" after it when the last value is not the latest season). */
  value: string
  percentile: number | null
  /** Percentile by season over the span, for the sparkline. */
  spark: (number | null)[]
  note: string | null
}

/** "Career at a glance": per core metric, its last value and percentile, and a sparkline. */
export function glanceViews(
  result: StatsResult | null,
  id: string,
  metrics: readonly string[],
  span: readonly number[],
  entity: TrendEntity,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  current: number,
  perGame: boolean
): GlanceView[] {
  return metrics.map((metric) => {
    const info = byId.get(metric)
    const points = trendLine(
      result,
      id,
      metric,
      span,
      entity,
      position,
      info?.direction ?? 'neutral'
    )
    const last = [...points].reverse().find((p) => p.value !== null) ?? null
    const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
    const latest = span[span.length - 1]
    return {
      metric,
      label: info?.label ?? metric,
      value: last
        ? `${fmtStat(last.value, f, perGame)}${last.estimated ? ' est.' : ''}${last.season !== latest ? ` (${last.season})` : ''}`
        : '—',
      percentile: last?.percentile ?? null,
      spark: points.map((p) => p.percentile),
      note: trendNotes(info, span, current, last?.estimated ?? false)[0] ?? null
    }
  })
}
