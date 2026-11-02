import type { SplitStat } from '@shared/ask'
import type { MetricInfo, StatsRow } from '@shared/stats/types'

/**
 * A split compared with its base (Ask spec §3.3, report D5). For a rate with a stability estimate,
 * the noise in a split of `n` against its base of `N` (the split is part of the base) is
 *
 *   SE(diff) = sqrt(σ²_u · (1/n − 1/N)),  σ²_u = k · σ²_t,  σ²_t = σ²_obs / (1 + k / n̄)
 *
 * where `k` is the metric's prior (the sample at which half of it is signal, from odd and even
 * weeks), σ²_obs the variance of the qualified rows it is ranked among and n̄ their mean sample. The
 * interval is diff ± 1.96 · SE; inside it, the split is within noise. Counts and metrics without a
 * stability estimate get no interval.
 */
export interface Spread {
  /** Variance of the qualified rows' raw values. */
  variance: number
  /** Their mean sample. */
  meanSample: number
}

export function spreadOf(rows: StatsRow[], metric: string): Spread | null {
  const xs = rows
    .map((r) => r.values[metric])
    .filter((v) => v && v.qualified && v.raw !== null && v.sample !== null)
  if (xs.length < 5) return null
  const mean = xs.reduce((s, v) => s + v.raw!, 0) / xs.length
  const variance = xs.reduce((s, v) => s + (v.raw! - mean) ** 2, 0) / (xs.length - 1)
  const meanSample = xs.reduce((s, v) => s + v.sample!, 0) / xs.length
  return variance > 0 && meanSample > 0 ? { variance, meanSample } : null
}

export function splitStat(
  info: Pick<MetricInfo, 'kind' | 'stability'>,
  split: StatsRow['values'][string] | undefined,
  base: StatsRow['values'][string] | undefined,
  spread: Spread | null
): SplitStat {
  const diff =
    split?.raw !== null && split?.raw !== undefined && base?.raw !== null && base?.raw !== undefined
      ? split.raw - base.raw
      : null
  const k = info.stability?.prior ?? null
  const n = split?.sample ?? null
  const total = base?.sample ?? null
  if (diff === null || info.kind !== 'rate' || k === null || k <= 0 || !spread || !n || !total) {
    return { diff, interval: null, withinNoise: null }
  }
  const trueVariance = spread.variance / (1 + k / spread.meanSample)
  const unitVariance = k * trueVariance
  const share = Math.max(0, 1 / n - 1 / total)
  const se = Math.sqrt(unitVariance * share)
  if (!Number.isFinite(se) || se === 0) return { diff, interval: null, withinNoise: null }
  const half = 1.96 * se
  return { diff, interval: [diff - half, diff + half], withinNoise: Math.abs(diff) < half }
}
