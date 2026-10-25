import type { CompareState } from '@/lib/stats/compare'
import { fmtStat } from '@/lib/stats/format'
import { qualifies, rankWithinTab, searchKey } from '@/lib/stats/leaderboard'
import { positionTab } from '@/lib/stats/player'
import { queryScope, type StatsScope } from '@/lib/stats/scope'
import { missingFor } from '@/lib/stats/team'
import { teamAbbr } from '@shared/stats/nflTeams'
import type {
  MetricInfo,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'

/** The chart explorer (spec §9.5): any metric against any other, players at one position or teams. */
export type ChartEntity = 'player' | 'team'

/** What the chart explorer shows, kept by StatsApp across tabs. */
export interface ChartState {
  entity: ChartEntity
  position: PositionGroup
  perGame: boolean
  /** Null: the position's (or the teams') first preset. */
  x: string | null
  y: string | null
  size: string | null
  colour: string | null
  /** Only this team's dots (the axes and the means stay the position's). */
  team: string | null
  qualifiedOnly: boolean
  /** My players ringed (players with a league). */
  mine: boolean
  search: string
  /** Shift-clicked, up to three: Compare's slots. */
  picks: string[]
  /** The table's order: a metric's percentile best first (1) or worst first (-1), or names A–Z. */
  sort: { by: string; dir: 1 | -1 }
}

export const DEFAULT_CHART: ChartState = {
  entity: 'player',
  position: 'WR',
  perGame: true,
  x: null,
  y: null,
  size: null,
  colour: null,
  team: null,
  qualifiedOnly: true,
  mine: true,
  search: '',
  picks: [],
  sort: { by: 'y', dir: 1 }
}

/** The same chart for another position or entity: its own axes, no picks or filters. */
export function resetChart(state: ChartState, next: Partial<ChartState>): ChartState {
  return {
    ...state,
    ...next,
    x: null,
    y: null,
    size: null,
    colour: null,
    team: null,
    search: '',
    picks: [],
    sort: DEFAULT_CHART.sort
  }
}

/** Shift-click picks this many for Compare. */
export const MAX_PICKS = 3

/** Below this many dots a scatter says nothing: "Too few qualifiers to chart". */
export const MIN_DOTS = 10

export interface ChartPreset {
  label: string
  x: string
  y: string
}

/** A volume against an efficiency per position (handoff §15: WR's two), and the teams'. */
export const PRESETS: Record<PositionGroup | 'team', ChartPreset[]> = {
  QB: [
    { label: 'Volume vs efficiency', x: 'pass_att', y: 'qb_epa_db' },
    { label: 'Accuracy vs efficiency', x: 'cpoe', y: 'qb_epa_db' }
  ],
  RB: [
    { label: 'Volume vs efficiency', x: 'carries', y: 'ryoe_att' },
    { label: 'Rushing vs receiving', x: 'carry_share', y: 'target_share' }
  ],
  WR: [
    { label: 'Volume vs efficiency', x: 'targets', y: 'yprr' },
    { label: 'Targets vs air yards', x: 'targets', y: 'air_yards_share' }
  ],
  TE: [
    { label: 'Volume vs efficiency', x: 'targets', y: 'yprr' },
    { label: 'Targets vs air yards', x: 'targets', y: 'air_yards_share' }
  ],
  K: [{ label: 'Volume vs accuracy', x: 'fg_att', y: 'fgoe_pct' }],
  P: [{ label: 'Volume vs distance', x: 'punts', y: 'punt_net_avg' }],
  DL: [{ label: 'Pass rush vs run stops', x: 'pressures', y: 'def_stuffs' }],
  LB: [{ label: 'Tackles vs misses', x: 'tackles', y: 'missed_tackle_pct' }],
  DB: [{ label: 'Completions vs yards allowed', x: 'coverage_cmp_pct', y: 'coverage_ypt' }],
  OL: [{ label: 'Snaps vs on-field EPA', x: 'snap_share', y: 'on_field_epa' }],
  team: [
    { label: 'Offense vs defense EPA', x: 'off_epa_play', y: 'def_epa_play' },
    { label: 'Pass vs rush EPA', x: 'off_rush_epa', y: 'off_pass_epa' }
  ]
}

export function presetsFor(entity: ChartEntity, position: PositionGroup): ChartPreset[] {
  return PRESETS[entity === 'team' ? 'team' : position]
}

/** The axes shown: the state's, else the first preset's. */
export function chartAxes(state: ChartState): { x: string; y: string } {
  const first = presetsFor(state.entity, state.position)[0]
  return { x: state.x ?? first.x, y: state.y ?? first.y }
}

/** The metrics sized or coloured by, and in the table, besides the axes. */
export function chartExtras(state: ChartState, axes: { x: string; y: string }): string[] {
  return [...new Set([state.size, state.colour])].filter(
    (m): m is string => m !== null && m !== axes.x && m !== axes.y
  )
}

/** Size and colour read a percentile: metrics with a better side only. */
export function scaled(metrics: readonly MetricInfo[]): MetricInfo[] {
  return metrics.filter((m) => m.direction !== 'neutral')
}

/** Every row at the position (a percentile is among the position), or the 32 teams. */
const ROWS: Record<ChartEntity, number> = { player: 5000, team: 40 }

/** One query: the axes, size and colour, and the position's qualifier. Counts per game when asked. */
export function chartQuery(
  entity: ChartEntity,
  position: PositionGroup,
  metrics: readonly string[],
  scope: StatsScope,
  status: StatsStatus | null,
  perGame: boolean
): StatsQuery {
  const qualifier = entity === 'player' ? positionTab(position).qualifier : undefined
  const all = [...new Set([...metrics, ...(qualifier ? [qualifier] : [])])]
  return {
    entity,
    metrics: all,
    scope: {
      ...queryScope(scope, status),
      ...(entity === 'player' ? { positions: [position] } : {})
    },
    transform: entity === 'player' && perGame ? 'perGame' : 'raw',
    sort: { metric: metrics[1] ?? metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: ROWS[entity]
  }
}

/** "Pressure rate (defense) is not published for 2026 yet.", "Separation starts in 2016." */
export function missingAxis(
  result: StatsResult,
  axes: readonly string[],
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): string | null {
  for (const id of axes) {
    const info = byId.get(id)
    const column = result.columns.find((c) => c.id === id)
    if (!missingFor(column, info, season)) continue
    const label = info?.label ?? id
    return info && info.firstSeason > season
      ? `${label} starts in ${info.firstSeason}.`
      : `${label} is not published for ${season} yet.`
  }
  return null
}

export interface ChartDot {
  id: string
  name: string
  team: string | null
  x: number
  y: number
  /** The position's qualifier and both axes' own samples. */
  qualified: boolean
  /** By metric (axes, size, colour). */
  values: Record<string, number | null>
  /** 0–100 among the qualified, by metric; null when not qualified. */
  percentiles: Record<string, number | null>
  mine: boolean
  /** The search finds it. */
  matched: boolean
  /** 0–2: its slot in Compare; -1 not picked. */
  pick: number
  /** The metrics whose value is estimated (routes in the current season). */
  estimated: string[]
  games: number
  /** The y axis's sample ("512 routes"). */
  sample: number | null
}

export type ChartView =
  | { kind: 'missing'; text: string }
  | {
      kind: 'few'
      /** Rows that qualify on both axes. */
      qualified: number
      /** Rows with both values. */
      all: number
    }
  | {
      kind: 'ready'
      /** The dots shown, every special one (mine, searched, picked) last. */
      dots: ChartDot[]
      /** The axes' domains: every dot the filters would show but the team's. */
      domain: { x: [number, number]; y: [number, number] }
      /** The qualified mean of each axis: the quadrant lines. */
      mean: { x: number; y: number }
      /** Pearson r with both axes oriented, so positive is better on both; null under 3 dots. */
      r: number | null
      /** Qualified rows on both axes. */
      qualified: number
      /** The picks still plotted, in order (a team filter may hide their dots): Compare's slots. */
      picks: { id: string; name: string }[]
    }

/** A row's value of a metric. */
const valueOf = (r: StatsRow, id: string): number | null => r.values[id]?.value ?? null

/**
 * The dots: rows with both values (the position's, or the 32), qualified ones only when asked,
 * a team's only when asked; percentiles among the position's qualified players (Compare's pool).
 */
export function chartView(
  result: StatsResult,
  state: ChartState,
  byId: ReadonlyMap<string, MetricInfo>,
  ownership: StatsOwnership | null,
  season: number
): ChartView {
  const axes = chartAxes(state)
  const missing = missingAxis(result, [axes.x, axes.y], byId, season)
  if (missing) return { kind: 'missing', text: missing }
  const isPlayer = state.entity === 'player'
  const tab = positionTab(state.position)
  const ranked = isPlayer ? rankWithinTab(result, tab) : result
  const metrics = [axes.x, axes.y, ...chartExtras(state, axes)]
  const rows = ranked.rows.filter(
    (r) =>
      (!isPlayer || r.position === state.position) &&
      valueOf(r, axes.x) !== null &&
      valueOf(r, axes.y) !== null
  )
  const ok = (r: StatsRow): boolean =>
    (!isPlayer || qualifies(r, tab)) &&
    r.values[axes.x].qualified === true &&
    r.values[axes.y].qualified === true
  const pool = rows.filter(ok)
  const plotted = state.qualifiedOnly ? pool : rows
  if (plotted.length < MIN_DOTS) return { kind: 'few', qualified: pool.length, all: rows.length }

  const needle = searchKey(state.search.trim())
  const finds = (r: StatsRow): boolean =>
    needle.length > 1 &&
    (searchKey(r.name).includes(needle) || (!isPlayer && searchKey(teamAbbr(r.id)) === needle))
  const picked = state.picks.flatMap((id) => plotted.filter((r) => r.id === id))
  const picks = picked.map((r) => r.id)
  const dot = (r: StatsRow): ChartDot => ({
    id: r.id,
    name: r.name,
    team: r.team,
    x: valueOf(r, axes.x)!,
    y: valueOf(r, axes.y)!,
    qualified: ok(r),
    values: Object.fromEntries(metrics.map((m) => [m, valueOf(r, m)])),
    percentiles: Object.fromEntries(metrics.map((m) => [m, r.values[m]?.percentile ?? null])),
    mine: isPlayer && state.mine && ownership?.players[r.id]?.mine === true,
    matched: finds(r),
    pick: picks.indexOf(r.id),
    estimated: metrics.filter((m) => r.values[m]?.estimated),
    games: r.games,
    sample: r.values[axes.y].sample
  })
  const special = (d: ChartDot): boolean => d.mine || d.matched || d.pick >= 0
  const shown = plotted.filter((r) => !state.team || r.team === state.team).map(dot)
  const span = (vs: number[]): [number, number] => [Math.min(...vs), Math.max(...vs)]
  const mean = (vs: number[]): number => vs.reduce((t, v) => t + v, 0) / vs.length
  const sign = (id: string): number => (byId.get(id)?.direction === 'lower' ? -1 : 1)
  return {
    kind: 'ready',
    dots: [...shown.filter((d) => !special(d)), ...shown.filter(special)],
    domain: {
      x: span(plotted.map((r) => valueOf(r, axes.x)!)),
      y: span(plotted.map((r) => valueOf(r, axes.y)!))
    },
    mean: {
      x: mean((pool.length ? pool : plotted).map((r) => valueOf(r, axes.x)!)),
      y: mean((pool.length ? pool : plotted).map((r) => valueOf(r, axes.y)!))
    },
    r: pearson(
      shown.map((d) => d.x * sign(axes.x)),
      shown.map((d) => d.y * sign(axes.y))
    ),
    qualified: pool.length,
    picks: picked.map((r) => ({ id: r.id, name: r.name }))
  }
}

/** Pearson's r; null under three points or with no spread. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((t, v) => t + v, 0) / n
  const my = ys.reduce((t, v) => t + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
}

/** Corner words, [better, worse], for the quadrant labels; others "high …" / "low …". */
const WORDS: Record<string, [string, string]> = {
  targets: ['high volume', 'low volume'],
  carries: ['high volume', 'low volume'],
  pass_att: ['high volume', 'low volume'],
  fg_att: ['high volume', 'low volume'],
  punts: ['high volume', 'low volume'],
  yprr: ['efficient', 'inefficient'],
  qb_epa_db: ['efficient', 'inefficient'],
  ryoe_att: ['efficient', 'inefficient'],
  air_yards_share: ['deep usage', 'short usage'],
  separation: ['gets open', 'covered'],
  drop_rate: ['sure hands', 'drops'],
  pressures: ['pass rusher', 'little pressure'],
  def_stuffs: ['run stopper', 'few stops'],
  off_epa_play: ['good offense', 'poor offense'],
  def_epa_play: ['good defense', 'poor defense'],
  off_pass_epa: ['good passing', 'poor passing'],
  off_rush_epa: ['good rushing', 'poor rushing']
}

function words(info: MetricInfo | undefined, id: string): [string, string] {
  if (WORDS[id]) return WORDS[id]
  const s = lowerFirst(info?.label ?? id)
  return info?.direction === 'lower' ? [`low ${s}`, `high ${s}`] : [`high ${s}`, `low ${s}`]
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The four corners' labels: up and right is better on both (a lower-is-better axis runs reversed). */
export function corners(
  x: MetricInfo | undefined,
  xId: string,
  y: MetricInfo | undefined,
  yId: string
): { tl: string; tr: string; bl: string; br: string } {
  const [xg, xb] = words(x, xId)
  const [yg, yb] = words(y, yId)
  return {
    tr: cap(`${xg}, ${yg}`),
    tl: cap(`${xb}, ${yg}`),
    br: cap(`${xg}, ${yb}`),
    bl: cap(`${xb}, ${yb}`)
  }
}

/** A label's first letter lowered ("targets"), unless it starts an acronym ("EPA per play"). */
function lowerFirst(s: string): string {
  return /^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1)
}

/** "Yards per route run vs targets", "EPA per play allowed vs EPA per play". */
export function chartTitle(
  x: MetricInfo | undefined,
  xId: string,
  y: MetricInfo | undefined,
  yId: string
): string {
  return `${y?.label ?? yId} vs ${lowerFirst(x?.label ?? xId)}`
}

/** "6 TEs qualify on both axes in the postseason. A scatter needs at least 10." */
export function fewNote(qualified: number, who: string, range: string): string {
  const when = /season$/.test(range) ? `the ${range.toLowerCase()}` : range.toLowerCase()
  return `${qualified} ${who} qualify on both axes in ${when}. A scatter needs at least ${MIN_DOTS}.`
}

/** An axis's label: "Sack rate ↓" when lower is better (it runs reversed). */
export function axisLabel(info: MetricInfo | undefined, id: string): string {
  return `${info?.label ?? id}${info?.direction === 'lower' ? ' ↓' : ''}`
}

/** Round tick steps: 1, 2, 2.5, 5 × a power of ten. */
export function ticks(lo: number, hi: number, n: number): number[] {
  const raw = (hi - lo || Math.abs(hi) || 1) / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step)
    out.push(Number(v.toFixed(6)))
  return out
}

/** The scatter's box: the plot sits inside the margins. */
export const PLOT = { width: 952, height: 430, left: 56, right: 18, top: 28, bottom: 44 }

export interface Scales {
  x: (v: number) => number
  y: (v: number) => number
  xTicks: number[]
  yTicks: number[]
}

/** The axes' scales, padded 7 %; a lower-is-better axis reversed so up and right is better. */
export function scales(
  domain: { x: [number, number]; y: [number, number] },
  flip: { x: boolean; y: boolean }
): Scales {
  const pad = ([lo, hi]: [number, number]): [number, number] => {
    const p = (hi - lo) * 0.07 || Math.abs(hi) * 0.1 || 1
    return [lo - p, hi + p]
  }
  const [x0, x1] = pad(domain.x)
  const [y0, y1] = pad(domain.y)
  const w = PLOT.width - PLOT.left - PLOT.right
  const h = PLOT.height - PLOT.top - PLOT.bottom
  const along = (v: number, lo: number, hi: number, reversed: boolean): number => {
    const t = (v - lo) / (hi - lo)
    return reversed ? 1 - t : t
  }
  return {
    x: (v) => PLOT.left + along(v, x0, x1, flip.x) * w,
    y: (v) => PLOT.top + (1 - along(v, y0, y1, flip.y)) * h,
    xTicks: ticks(x0, x1, 7).filter((v) => v >= x0 && v <= x1),
    yTicks: ticks(y0, y1, 6).filter((v) => v >= y0 && v <= y1)
  }
}

export interface LabelItem {
  id: string
  text: string
  cx: number
  cy: number
  r: number
  kind: 'strong' | 'mine' | 'muted' | 'team'
}

export interface PlacedLabel extends LabelItem {
  /** The label's left and top. */
  left: number
  top: number
}

/** Labels in order of importance, each right, left, above or below its dot; skipped on a collision. */
export function placeLabels(items: readonly LabelItem[], charWidth: number): PlacedLabel[] {
  const [L, R] = [PLOT.left + 2, PLOT.width - PLOT.right - 2]
  const [T, B] = [PLOT.top + 2, PLOT.height - PLOT.bottom - 2]
  const boxes: { l: number; t: number; w: number; h: number }[] = []
  const out: PlacedLabel[] = []
  for (const it of items) {
    const w = it.text.length * charWidth + 2
    const h = 13
    const o = it.r + 4
    const spots: [number, number][] = [
      [it.cx + o, it.cy - 7],
      [it.cx - o - w, it.cy - 7],
      [it.cx - w / 2, it.cy - it.r - 16],
      [it.cx - w / 2, it.cy + it.r + 3]
    ]
    const hit = spots.find(
      ([l, t]) =>
        l >= L &&
        l + w <= R &&
        t >= T &&
        t + h <= B &&
        !boxes.some((b) => l < b.l + b.w && l + w > b.l && t < b.t + b.h && t + h > b.t)
    )
    if (!hit) continue
    boxes.push({ l: hit[0], t: hit[1], w, h })
    out.push({ ...it, left: hit[0], top: hit[1] })
  }
  return out
}

/** How many of the dots farthest from the centre a player chart labels. */
export const EXTREME_LABELS = 6

/** "J. Jefferson"; a team by its abbreviation. */
export function shortName(entity: ChartEntity, dot: Pick<ChartDot, 'id' | 'name'>): string {
  return entity === 'team' ? teamAbbr(dot.id) : dot.name.replace(/^(\S)\S*\s/, '$1. ')
}

/**
 * What gets a label: searched and picked dots, mine, then (players) the six farthest from the
 * crowd (in standard deviations on both axes, so a corner of dense dots does not take them all),
 * or (teams) every team.
 */
export function labelItems(
  entity: ChartEntity,
  dots: readonly ChartDot[],
  at: (d: ChartDot) => { cx: number; cy: number; r: number }
): LabelItem[] {
  const item = (d: ChartDot, kind: LabelItem['kind']): LabelItem => ({
    id: d.id,
    text: shortName(entity, d),
    ...at(d),
    kind
  })
  const strong = dots.filter((d) => d.matched || d.pick >= 0)
  const mine = dots.filter((d) => d.mine && !d.matched && d.pick < 0)
  const rest = dots.filter((d) => !d.mine && !d.matched && d.pick < 0)
  const spots = dots.map(at)
  const spread = (vs: number[]): [number, number] => {
    const m = vs.reduce((t, v) => t + v, 0) / vs.length
    const sd = Math.sqrt(vs.reduce((t, v) => t + (v - m) ** 2, 0) / vs.length) || 1
    return [m, sd]
  }
  const [mx, sx] = spread(spots.map((p) => p.cx))
  const [my, sy] = spread(spots.map((p) => p.cy))
  const far = (d: ChartDot): number => {
    const { cx, cy } = at(d)
    return ((cx - mx) / sx) ** 2 + ((cy - my) / sy) ** 2
  }
  const others =
    entity === 'team' ? rest : [...rest].sort((a, b) => far(b) - far(a)).slice(0, EXTREME_LABELS)
  return [
    ...strong.map((d) => item(d, 'strong')),
    ...mine.map((d) => item(d, 'mine')),
    ...others.map((d) => item(d, entity === 'team' ? 'team' : 'muted'))
  ]
}

/** A dot's radius: by the size metric's percentile (3.5 + 6.5 × p), else 5 (players) or 6.5. */
export function dotRadius(entity: ChartEntity, dot: ChartDot, size: string | null): number {
  if (size === null) return entity === 'team' ? 6.5 : 5
  return 3.5 + 6.5 * ((dot.percentiles[size] ?? 50) / 100)
}

/** The table's rows: by a metric's percentile (best first, unranked last), or by name. */
export function chartRows(
  dots: readonly ChartDot[],
  sort: ChartState['sort'],
  axes: { x: string; y: string }
): ChartDot[] {
  const metric = sort.by === 'x' ? axes.x : sort.by === 'y' ? axes.y : sort.by
  return [...dots].sort((a, b) => {
    if (sort.by === 'name') return sort.dir * a.name.localeCompare(b.name)
    const pa = a.percentiles[metric] ?? null
    const pb = b.percentiles[metric] ?? null
    if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1
    return sort.dir * (pb - pa)
  })
}

/** "24.1%", "+0.12", "8.4" (a count per game with one decimal). */
export function chartValue(
  info: MetricInfo | undefined,
  v: number | null,
  perGame: boolean
): string {
  return fmtStat(
    v,
    { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind },
    perGame
  )
}

/** "WRs · 2026 · weeks 1–7 · per game". */
export function chartSubtitle(
  entity: ChartEntity,
  position: PositionGroup,
  season: number,
  range: string,
  perGame: boolean
): string {
  const who = entity === 'team' ? 'Teams' : `${position}s`
  return [
    who,
    String(season),
    range.toLowerCase(),
    ...(entity === 'player' ? [perGame ? 'per game' : 'totals'] : [])
  ].join(' · ')
}

/** Compare's state from the picks: the same entity and position, the picks in the slots. */
export function compareFromPicks(
  entity: ChartEntity,
  position: PositionGroup,
  picks: readonly string[]
): Pick<CompareState, 'entity' | 'position' | 'slots' | 'seed'> {
  return {
    entity,
    position,
    slots: [picks[0] ?? null, picks[1] ?? null, picks[2] ?? null],
    seed: null
  }
}
