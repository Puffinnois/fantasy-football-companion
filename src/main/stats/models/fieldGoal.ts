import { logisticFit, logisticPredict } from './linear'

/**
 * Field-goal make probability (stats-analysis spec §8.4): a logistic regression on distance (a
 * linear spline with a knot every 5 yards from 25 to 55), the roof, cold, wind (and wind ×
 * distance) and grass, fitted on every attempt from 2019 to the prior season. Kickers get better
 * from long range year after year, so a season counts half as much as the one two seasons after
 * it. FG over expected = makes − Σ p.
 */

export interface FieldGoalAttempt {
  game_id: string
  play_id: number
  season: number
  distance: number
  made: boolean
  /** `dome` / `closed` count as indoors. */
  roof: string | null
  surface: string | null
  temp: number | null
  wind: number | null
}

/** Outdoor weather the schedule does not record reads as the 2019–2025 outdoor average. */
const MEAN_TEMP = 58
const MEAN_WIND = 8

/** A season's weight halves every this many seasons back from the latest one fitted. */
export const FG_HALF_LIFE = 2
const KNOTS = [25, 30, 35, 40, 45, 50, 55]

export const FG_FEATURES = [
  'intercept',
  'distance',
  ...KNOTS.map((k) => `beyond${k}`),
  'indoors',
  'cold',
  'wind',
  'windDistance',
  'grass'
] as const

const indoorsOf = (roof: string | null): boolean => roof === 'dome' || roof === 'closed'

/** One attempt's features, scaled to about one unit (tens of yards, degrees and mph). */
export function fgFeatures(
  a: Omit<FieldGoalAttempt, 'game_id' | 'play_id' | 'season' | 'made'>
): number[] {
  const d = a.distance
  const indoors = indoorsOf(a.roof)
  const temp = indoors ? MEAN_TEMP : (a.temp ?? MEAN_TEMP)
  const wind = indoors ? 0 : (a.wind ?? MEAN_WIND)
  return [
    1,
    (d - 35) / 10,
    ...KNOTS.map((k) => Math.max(0, d - k) / 10),
    indoors ? 1 : 0,
    Math.max(0, 50 - temp) / 10,
    wind / 10,
    ((wind / 10) * (d - 35)) / 10,
    (a.surface ?? '').trim() === 'grass' ? 1 : 0
  ]
}

/** Fits the coefficients on the attempts given (spec: 2019 to the prior season). */
export function fitFieldGoals(attempts: FieldGoalAttempt[]): number[] {
  const latest = Math.max(...attempts.map((a) => a.season))
  return logisticFit(
    attempts.map(fgFeatures),
    attempts.map((a) => (a.made ? 1 : 0)),
    { weights: attempts.map((a) => 0.5 ** ((latest - a.season) / FG_HALF_LIFE)) }
  )
}

export const fgProbability = (a: Parameters<typeof fgFeatures>[0], beta: number[]): number =>
  logisticPredict(fgFeatures(a), beta)

export interface CalibrationBucket {
  /** The bucket's shortest distance: 18–19 count with 20–24. */
  from: number
  attempts: number
  made: number
  expected: number
  /** Made % minus expected %, in percentage points. */
  gap: number
  /** The gap in standard errors of a calibrated model's makes. */
  z: number
}

/** Spec §8.4 gate: made vs expected by 5-yard bucket (under 25 and 55+ pooled). */
export function calibration(attempts: FieldGoalAttempt[], beta: number[]): CalibrationBucket[] {
  const buckets = new Map<number, Omit<CalibrationBucket, 'gap' | 'z'> & { v: number }>()
  for (const a of attempts) {
    const from = Math.min(55, Math.max(20, Math.floor(a.distance / 5) * 5))
    const b = buckets.get(from) ?? { from, attempts: 0, made: 0, expected: 0, v: 0 }
    const p = fgProbability(a, beta)
    b.attempts += 1
    b.made += a.made ? 1 : 0
    b.expected += p
    b.v += p * (1 - p)
    buckets.set(from, b)
  }
  return [...buckets.values()]
    .sort((x, y) => x.from - y.from)
    .map(({ v, ...b }) => ({
      ...b,
      gap: (100 * (b.made - b.expected)) / b.attempts,
      z: v > 0 ? (b.made - b.expected) / Math.sqrt(v) : 0
    }))
}

/**
 * The calibration gate (amendment): a one-season bucket's gap carries 2–9 points of noise, so the
 * buckets are tested together. Hosmer–Lemeshow: Σ z² over the buckets is χ² with as many degrees
 * of freedom; it passes at p ≥ 0.05. Returns the statistic and its 5 % critical value.
 */
export function hosmerLemeshow(buckets: CalibrationBucket[]): { chi2: number; critical: number } {
  const chi2 = buckets.reduce((s, b) => s + b.z * b.z, 0)
  return { chi2, critical: CHI2_95[buckets.length] ?? Infinity }
}

/** χ² 95th percentiles by degrees of freedom. */
const CHI2_95: Record<number, number> = {
  1: 3.841,
  2: 5.991,
  3: 7.815,
  4: 9.488,
  5: 11.07,
  6: 12.592,
  7: 14.067,
  8: 15.507,
  9: 16.919,
  10: 18.307
}
