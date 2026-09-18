import { fmtPct, fmtSigned, fmtSignedPct } from '@/lib/format'
import type {
  GameInfo,
  PlayerBaseRow,
  PlayerSignals,
  PlayerValueRow,
  PlayerWeekRow,
  PositionTab,
  TableMode,
  Trend,
  UsageMetric,
  UsageTrend,
  ValueContext
} from '@shared/types'

export type TableRow = PlayerWeekRow | PlayerValueRow
export const isValueRow = (row: TableRow): row is PlayerValueRow => 'ppg' in row
export const isWeekRow = (row: TableRow): row is PlayerWeekRow => 'game' in row

export type ColumnKind =
  'points' | 'delta' | 'stat' | 'snapPct' | 'targetShare' | 'value' | 'signal'
export type ValueField =
  'gamesPlayed' | 'ppg' | 'stdValue' | 'stdRank' | 'rosPoints' | 'rosValue' | 'rosRank'
/** `usage` is the position's primary metric (spec §3.1); the rest read PlayerSignals directly. */
export type SignalField =
  'rosSos' | 'byesRemaining' | 'floor' | 'ceiling' | 'startRate' | 'usage' | 'tdDelta' | 'vsProjPct'
export type CellFormat = 'int' | 'fixed' | 'signed' | 'pct' | 'signedPct'

export interface Column {
  /** Sort key (`points`, `delta`, `snapPct`, `targetShare`, `stat:<key>`, `value:<field>`, `signal:<field>`). */
  key: string
  label: string
  kind: ColumnKind
  statKey?: string
  field?: ValueField
  signal?: SignalField
  /** Value / signal columns: how the number renders. */
  format?: CellFormat
  /** Value / signal columns: one-line definition shown in the header tooltip and the help panel. */
  description?: string
}

export interface ColumnGroup {
  label: string
  columns: Column[]
}

const stat = (statKey: string, label: string): Column => ({
  key: `stat:${statKey}`,
  label,
  kind: 'stat',
  statKey
})
const group = (label: string, columns: Column[]): ColumnGroup => ({ label, columns })

const POINTS: Column = { key: 'points', label: 'PTS', kind: 'points' }
const DELTA: Column = { key: 'delta', label: 'Δ', kind: 'delta' }
const SNAP: Column = { key: 'snapPct', label: 'SNAP%', kind: 'snapPct' }
const TGT: Column = { key: 'targetShare', label: 'TGT%', kind: 'targetShare' }
const RUSHING = group('Rushing', [
  stat('rush_att', 'ATT'),
  stat('rush_yd', 'YD'),
  stat('rush_td', 'TD')
])
const RECEIVING = group('Receiving', [
  stat('rec', 'REC'),
  stat('rec_tgt', 'TAR'),
  stat('rec_yd', 'YD'),
  stat('rec_td', 'TD')
])
const PASSING = group('Passing', [
  stat('pass_cmp', 'CMP'),
  stat('pass_att', 'ATT'),
  stat('pass_yd', 'YD'),
  stat('pass_td', 'TD')
])
const PASSING_QB = group('Passing', [...PASSING.columns, stat('pass_int', 'INT')])
const FIELD_GOALS = group('Field goals', [
  stat('fgm', 'FGM'),
  stat('fga', 'FGA'),
  stat('fgm_0_39', '0–39'),
  stat('fgm_40_49', '40–49'),
  stat('fgm_50p', '50+')
])
const XP = group('XP', [stat('xpm', 'XPM'), stat('xpa', 'XPA')])
const DEFENSE = group('Defense', [
  stat('sack', 'SACK'),
  stat('int', 'INT'),
  stat('ff', 'FF'),
  stat('fum_rec', 'FR'),
  stat('def_td', 'TD'),
  stat('safe', 'SAFE'),
  stat('blk_kick', 'BLK')
])
const ALLOWED = group('Allowed', [stat('pts_allow', 'PTS'), stat('yds_allow', 'YDS')])
const value = (
  field: ValueField,
  label: string,
  format: 'int' | 'fixed' | 'signed',
  description: string
): Column => ({
  key: `value:${field}`,
  label,
  kind: 'value',
  field,
  format,
  description
})
const SEASON = group('Season', [
  value('gamesPlayed', 'G', 'int', 'Games played (weeks with a points row)'),
  value('ppg', 'PPG', 'fixed', 'League points per game over games played'),
  value('stdValue', 'VAL', 'signed', "PPG minus the position's replacement PPG"),
  value('stdRank', 'RK', 'int', 'Rank within position by VAL')
])
const signal = (
  field: SignalField,
  label: string,
  format: CellFormat,
  description: string
): Column => ({
  key: `signal:${field}`,
  label,
  kind: 'signal',
  signal: field,
  format,
  description
})
const REST_OF_SEASON = group('Rest of season', [
  value(
    'rosPoints',
    'ROS',
    'fixed',
    "Projected points for the remaining weeks under this league's rules"
  ),
  value('rosValue', 'VAL', 'signed', "ROS minus the position's replacement ROS points"),
  value('rosRank', 'RK', 'int', 'Rank within position by ROS VAL'),
  signal(
    'rosSos',
    'SOS',
    'fixed',
    'Mean defense-vs-position rank of the remaining opponents: 1 = hardest, 32 = easiest'
  ),
  signal('byesRemaining', 'BYES', 'int', 'Remaining weeks without a game')
])
const SIGNALS = group('Signals', [
  signal('floor', 'FLOOR', 'fixed', '25th percentile of weekly points (3+ games)'),
  signal('ceiling', 'CEIL', 'fixed', '75th percentile of weekly points (3+ games)'),
  signal(
    'startRate',
    'START%',
    'pct',
    "Share of games scoring at least the position's replacement PPG (3+ games)"
  ),
  signal(
    'usage',
    'USAGE',
    'pct',
    'Target share (WR/TE) or snap % (RB) over the last 3 games; the arrow is the trend against the season mean'
  ),
  signal(
    'tdDelta',
    'TD',
    'signed',
    "TDs minus the TDs expected from opportunities at the position's rate: ↓ likely to regress, ↑ due for more"
  ),
  signal(
    'vsProjPct',
    'VS PROJ',
    'signedPct',
    "Points minus Sleeper's projection over played weeks, as a share of the projection"
  )
])

/** Sleeper's column groups per tab; Δ and usage only exist for played weeks (stats mode). */
export function columnGroups(tabId: string, mode: TableMode): ColumnGroup[] {
  if (mode === 'value') return [SEASON, REST_OF_SEASON, SIGNALS]
  const fantasy = group('Fantasy', mode === 'stats' ? [POINTS, DELTA] : [POINTS])
  const usage = (...cols: Column[]): ColumnGroup[] =>
    mode === 'stats' ? [group('Usage', cols)] : []
  switch (tabId) {
    case 'QB':
      return [fantasy, PASSING_QB, RUSHING, ...usage(SNAP)]
    case 'K':
      return [fantasy, FIELD_GOALS, XP]
    case 'DEF':
      return [fantasy, DEFENSE, ALLOWED]
    default:
      return [fantasy, RUSHING, RECEIVING, PASSING, ...usage(SNAP, TGT)]
  }
}

export function cellValue(row: TableRow, col: Column, mode: TableMode): number | null {
  if (col.kind === 'value') return col.field && isValueRow(row) ? row[col.field] : null
  if (col.kind === 'signal')
    return col.signal && isValueRow(row) ? signalValue(row, col.signal) : null
  if (!isWeekRow(row)) return null
  switch (col.kind) {
    case 'points':
      return mode === 'proj' ? row.projected : row.points
    case 'delta':
      return row.delta
    case 'snapPct':
      return row.snapPct
    case 'targetShare':
      return row.targetShare
    case 'stat': {
      const line = mode === 'proj' ? row.projection : row.actual
      return line?.[col.statKey ?? ''] ?? null
    }
  }
}

export function cellText(value: number | null, col: Column, mode: TableMode): string {
  if (value === null) return '—'
  if (col.kind === 'value' || col.kind === 'signal') {
    if (col.format === 'int') return String(value)
    if (col.format === 'signed') return fmtSigned(value)
    if (col.format === 'pct') return fmtPct(value)
    if (col.format === 'signedPct') return fmtSignedPct(value)
    return value.toFixed(1)
  }
  if (col.kind === 'snapPct' || col.kind === 'targetShare') return fmtPct(value)
  if (col.kind === 'points') return value.toFixed(1)
  if (col.kind === 'delta') return fmtSigned(value)
  if (mode === 'proj') return value.toFixed(1)
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** "Sun 1:00 PM" in `timeZone` (default: the machine's). */
export function kickoffLabel(iso: string, timeZone?: string, locale = 'en-US'): string {
  return new Date(iso).toLocaleString(locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone
  })
}

/** "Sun 1:00 PM vs GB" · "@ DAL · L 20-24" · "BYE". */
export function gameLabel(g: GameInfo | null, timeZone?: string): string {
  if (!g) return 'BYE'
  const vs = `${g.home ? 'vs' : '@'} ${g.opponent}`
  if (g.final && g.homeScore !== null && g.awayScore !== null) {
    const us = g.home ? g.homeScore : g.awayScore
    const them = g.home ? g.awayScore : g.homeScore
    const result = us > them ? 'W' : us < them ? 'L' : 'T'
    return `${vs} · ${result} ${us}-${them}`
  }
  return g.kickoff ? `${kickoffLabel(g.kickoff, timeZone)} ${vs}` : vs
}

/** Second line under the name: "PHI (bye 7) · Sun 1:00 PM vs GB"; value rows have no game: "PHI (bye 7)"; "FA" without a team. */
export function subLabel(row: TableRow, timeZone?: string): string {
  if (!row.team) return 'FA'
  const team = row.byeWeek ? `${row.team} (bye ${row.byeWeek})` : row.team
  return isWeekRow(row) ? `${team} · ${gameLabel(row.game, timeZone)}` : team
}

export const TABLE_LIMIT = 250

export interface TableFilters {
  search: string
  freeAgents: boolean
  watchlist: boolean
  rookies: boolean
  owner: number | null
}

export interface TableSort {
  /** 'points' | 'delta' | 'name' | 'snapPct' | 'targetShare' | `stat:<key>` | `value:<field>` | `signal:<field>` */
  key: string
  dir: 'asc' | 'desc'
}

/** Lowercase letters/digits/spaces only, so "Ja'Marr" matches "jamarr". */
function searchable(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '')
}

export function filterRows<T extends PlayerBaseRow>(
  rows: T[],
  tab: PositionTab | undefined,
  f: TableFilters
): T[] {
  const positions = tab ? new Set(tab.positions) : null
  const needle = searchable(f.search.trim())
  return rows.filter(
    (r) =>
      (!positions || positions.has(r.position ?? '')) &&
      (!f.freeAgents || r.ownerRosterId === null) &&
      (!f.watchlist || r.watched) &&
      (!f.rookies || r.rookie) &&
      (f.owner === null || r.ownerRosterId === f.owner) &&
      (!needle || searchable(r.fullName).includes(needle))
  )
}

function sortValue(row: TableRow, key: string, mode: TableMode): number | string | null {
  if (key === 'name') return row.fullName
  if (key.startsWith('value:')) return isValueRow(row) ? row[key.slice(6) as ValueField] : null
  if (key.startsWith('signal:'))
    return isValueRow(row) ? signalValue(row, key.slice(7) as SignalField) : null
  if (!isWeekRow(row)) return null
  if (key === 'points') return mode === 'proj' ? row.projected : row.points
  if (key === 'delta') return row.delta
  if (key === 'snapPct') return row.snapPct
  if (key === 'targetShare') return row.targetShare
  if (key.startsWith('stat:')) {
    const line = mode === 'proj' ? row.projection : row.actual
    return line?.[key.slice(5)] ?? null
  }
  return null
}

/** Returns a sorted copy; nulls last in both directions; ties broken by name. */
export function sortRows<T extends TableRow>(rows: T[], sort: TableSort, mode: TableMode): T[] {
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key, mode)
    const vb = sortValue(b, sort.key, mode)
    if (va === null && vb === null) return a.fullName.localeCompare(b.fullName)
    if (va === null) return 1
    if (vb === null) return -1
    const cmp =
      typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb
    return cmp !== 0 ? cmp * dir : a.fullName.localeCompare(b.fullName)
  })
}

export const DEFAULT_SORT: Record<TableMode, TableSort> = {
  proj: { key: 'points', dir: 'desc' },
  stats: { key: 'points', dir: 'desc' },
  value: { key: 'value:rosValue', dir: 'desc' }
}

/** Tooltip for a VAL header: "Replacement PPG · RB 8.4 (44 starters) · WR —". */
export function replacementLabel(
  context: ValueContext | null,
  positions: string[],
  kind: 'std' | 'ros'
): string {
  if (!context) return ''
  const parts = positions.map((pos) => {
    const level = context.replacement[pos]?.[kind] ?? null
    return level ? `${pos} ${level.level.toFixed(1)} (${level.starters} starters)` : `${pos} —`
  })
  return [kind === 'std' ? 'Replacement PPG' : 'Replacement ROS pts', ...parts].join(' · ')
}

/** Header tooltip of a value column: its definition, plus the replacement line for the VAL columns. */
export function valueHeaderTitle(
  col: Column,
  context: ValueContext | null,
  positions: string[]
): string | undefined {
  if ((col.kind !== 'value' && col.kind !== 'signal') || !col.description) return undefined
  if (col.field !== 'stdValue' && col.field !== 'rosValue') return col.description
  const line = replacementLabel(context, positions, col.field === 'stdValue' ? 'std' : 'ros')
  return line ? `${col.description}\n${line}` : col.description
}

/** Spec §3.1: the usage metric behind the USAGE column per position; QB, K and DEF have none. */
export const PRIMARY_USAGE: Partial<Record<string, UsageMetric>> = {
  RB: 'snapPct',
  WR: 'targetShare',
  TE: 'targetShare'
}

export function primaryUsage(row: PlayerValueRow): UsageTrend | null {
  const metric = row.position ? PRIMARY_USAGE[row.position] : undefined
  return metric && row.signals ? row.signals.usage[metric] : null
}

export const TREND_ARROW: Record<Trend, string> = { rising: '↑', flat: '→', falling: '↓' }

/** Numeric value of a signal column (sorting, colouring); USAGE is the primary metric's recent share. */
export function signalValue(row: PlayerValueRow, field: SignalField): number | null {
  const s: PlayerSignals | null = row.signals
  if (!s) return null
  if (field === 'usage') return primaryUsage(row)?.recent ?? null
  return s[field]
}

/** Text of a signal cell: USAGE = recent share + trend arrow, TD = the regression badge ('' without one), else the number; "—" for null. */
export function signalText(row: TableRow, col: Column): string {
  if (!col.signal || !isValueRow(row)) return '—'
  if (col.signal === 'usage') {
    const t = primaryUsage(row)
    return t ? `${fmtPct(t.recent)} ${TREND_ARROW[t.trend]}` : '—'
  }
  if (col.signal === 'tdDelta') {
    if (!row.signals || row.signals.tdDelta === null) return '—'
    return row.signals.tdFlag === 'down' ? '↓' : row.signals.tdFlag === 'up' ? '↑' : ''
  }
  return cellText(signalValue(row, col.signal), col, 'value')
}

/** SOS tint buckets (spec §6.1 "easy to hard"): ranks ≤ SOS_HARD_MAX read hard, ≥ SOS_EASY_MIN easy. */
export const SOS_HARD_MAX = 11
export const SOS_EASY_MIN = 22

export function sosTone(value: number | null): 'hard' | 'easy' | null {
  if (value === null) return null
  return value <= SOS_HARD_MAX ? 'hard' : value >= SOS_EASY_MIN ? 'easy' : null
}

/** Colour of a signal cell: SOS by difficulty, TD by regression direction (down = negative), vs proj by sign. */
export function signalTone(row: TableRow, col: Column): 'pos' | 'neg' | null {
  if (!isValueRow(row) || !row.signals) return null
  if (col.signal === 'rosSos') {
    const tone = sosTone(row.signals.rosSos)
    return tone === 'hard' ? 'neg' : tone === 'easy' ? 'pos' : null
  }
  if (col.signal === 'tdDelta') {
    const flag = row.signals.tdFlag
    return flag === 'down' ? 'neg' : flag === 'up' ? 'pos' : null
  }
  if (col.signal === 'vsProjPct') {
    const v = row.signals.vsProjPct
    return v === null ? null : v >= 0 ? 'pos' : 'neg'
  }
  return null
}
