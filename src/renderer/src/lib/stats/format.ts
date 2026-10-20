import type { MetricInfo, MetricUnit, MetricValue, StatsResultColumn } from '@shared/stats/types'

/** What a value needs to be written: its unit, decimals and kind (a count can be per game). */
export type ValueFormat = Pick<StatsResultColumn, 'unit' | 'decimals'> & { kind?: 'count' | 'rate' }

const MINUS = '−'

/** Units whose values sit around zero: written with their sign. */
const SIGNED: MetricUnit[] = ['pp', 'epa']

/**
 * A value as the stats screens write it (handoff "Stats", Geist Mono): a fraction as a percentage,
 * a count whole (one decimal per game), EPA and percentage points signed, a real minus sign.
 */
export function fmtStat(value: number | null, f: ValueFormat, perGame = false): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const perGameCount = perGame && f.kind === 'count'
  const decimals = perGameCount ? Math.max(1, f.decimals) : f.decimals
  const shown = f.unit === 'pct' ? value * 100 : value
  let text = Math.abs(shown).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
  if (f.unit === 'pct') text += '%'
  const zero = Number(Math.abs(shown).toFixed(decimals)) === 0
  if (shown < 0 && !zero) return MINUS + text
  if (SIGNED.includes(f.unit) && shown > 0 && !zero) return `+${text}`
  return text
}

/** The 7 shading steps of the Ledger (handoff 3d): ≥90 / ≥75 / ≥60 good, ≤10 / ≤25 / ≤40 bad. */
export type Heat = 'h3' | 'h2' | 'h1' | 'n' | 'l1' | 'l2' | 'l3'

export function heatOf(percentile: number | null, direction: MetricInfo['direction']): Heat {
  if (percentile === null || direction === 'neutral') return 'n'
  if (percentile >= 90) return 'h3'
  if (percentile >= 75) return 'h2'
  if (percentile >= 60) return 'h1'
  if (percentile <= 10) return 'l3'
  if (percentile <= 25) return 'l2'
  if (percentile <= 40) return 'l1'
  return 'n'
}

/** "1st", "22nd", "73rd", "11th". */
export function ordinal(n: number): string {
  const r = Math.round(n)
  const teen = r % 100 >= 11 && r % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[r % 10]
  return `${r}${suffix ?? 'th'}`
}

/**
 * A cell's hover (spec §9.2): percentile and rank within the position, the sample in words,
 * whether it qualifies, and the estimate.
 */
export function cellTitle(
  v: MetricValue,
  info: Pick<MetricInfo, 'sampleLabel' | 'direction'>,
  position: string | null
): string {
  const among = position ? `${position}s` : 'teams'
  const lines: string[] = []
  if (v.percentile !== null && info.direction !== 'neutral')
    lines.push(`${ordinal(v.percentile)} percentile among qualified ${among}`)
  if (v.rank !== null) lines.push(`Rank ${v.rank}${position ? ` among ${among}` : ''}`)
  if (v.sample !== null)
    lines.push(`${fmtStat(v.sample, { unit: 'count', decimals: 0 })} ${info.sampleLabel}`)
  if (!v.qualified && v.value !== null) lines.push('Below the qualifying sample')
  if (v.estimated) lines.push('Estimated: participation for this season is not published yet')
  return lines.join('\n')
}

const FAMILY_LABELS: Record<MetricInfo['family'], string> = {
  traditional: 'Traditional',
  advanced: 'Advanced',
  ngs: 'Next Gen',
  charting: 'Charting',
  predictive: 'Predictive'
}

export function familyLabel(family: MetricInfo['family']): string {
  return FAMILY_LABELS[family]
}

/** A metric's reliability (spec §8.6) for its marker, null until the models have measured it. */
export function reliabilityOf(info: Pick<MetricInfo, 'stability'>): {
  level: 'high' | 'medium' | 'low'
  text: string
} | null {
  const s = info.stability
  if (!s?.reliability) return null
  const r = s.yearToYear === null ? '' : ` (year-to-year r ${s.yearToYear.toFixed(2)})`
  const words = { high: 'carries over well', medium: 'carries over partly', low: 'mostly noise' }
  return {
    level: s.reliability,
    text: `Reliability ${s.reliability}: ${words[s.reliability]} from one season to the next${r}`
  }
}
