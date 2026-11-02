import type { MetricUnit } from '@shared/stats/types'

/** Units whose values sit around zero: written with their sign. */
const SIGNED: MetricUnit[] = ['pp', 'epa']

/**
 * A value as the model reads it (Ask spec §3.3): rounded to the catalogue's decimals, a fraction as
 * a percentage, EPA and percentage points signed. Plain digits, an ASCII minus and no thousands
 * separator, so the number check (§4.3) reads back exactly what the model was shown.
 */
export function fmt(value: number | null, unit: MetricUnit, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const shown = unit === 'pct' ? value * 100 : value
  const text = shown.toFixed(decimals)
  const zero = Number(Math.abs(shown).toFixed(decimals)) === 0
  const signed =
    SIGNED.includes(unit) && shown > 0 && !zero ? `+${text}` : zero ? (0).toFixed(decimals) : text
  return unit === 'pct' ? `${signed}%` : signed
}
