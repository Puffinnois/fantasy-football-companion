import { solve } from './linear'

/**
 * Opponent-adjusted EPA (stats-analysis spec §8.2): a ridge regression of play EPA on an offense
 * effect, a defense effect and home field. Plays are summed into cells (offense × defense × home ×
 * week) first, which gives the same normal equations as one row per play.
 */

export interface EpaCell {
  off: string
  def: string
  /** +1 when the offense is at home, −1 away, 0 at a neutral site. */
  home: number
  week: number
  plays: number
  epa: number
}

export interface AdjustedFit {
  /** League EPA per play at a neutral site against an average opponent. */
  mean: number
  /** EPA per play the home offense gains (and the away offense loses). */
  home: number
  /** Team effects; adjusted EPA/play is `mean + effect`. */
  off: Map<string, number>
  def: Map<string, number>
}

/** Prior strength of a team effect, in plays: chosen by predicting the next week (Plan Z findings). */
export const RIDGE_PLAYS = 300
/** The recency-weighted fit halves a week's weight every 4 weeks (spec §8.2). */
export const RECENCY_HALF_LIFE = 4

/**
 * Fits the effects on the cells. `weight(week)` scales a cell (the recency-weighted version);
 * `lambda` shrinks each team effect toward 0, so a team with few plays sits near the mean.
 */
export function fitAdjusted(
  cells: EpaCell[],
  teams: string[],
  {
    lambda = RIDGE_PLAYS,
    weight = () => 1
  }: { lambda?: number; weight?: (week: number) => number } = {}
): AdjustedFit {
  const t = teams.length
  const n = 2 + 2 * t
  const index = new Map(teams.map((team, i) => [team, i]))
  const a = new Float64Array(n * n)
  const b = new Float64Array(n)
  for (const c of cells) {
    const o = index.get(c.off)
    const d = index.get(c.def)
    if (o === undefined || d === undefined || c.plays <= 0) continue
    const w = weight(c.week)
    const cols: [number, number][] = [
      [0, 1],
      [1, c.home],
      [2 + o, 1],
      [2 + t + d, 1]
    ]
    const wn = w * c.plays
    for (const [i, xi] of cols) {
      b[i] += w * c.epa * xi
      for (const [j, xj] of cols) a[i * n + j] += wn * xi * xj
    }
  }
  for (let i = 2; i < n; i++) a[i * n + i] += lambda
  // No plays yet (before week 1): the mean and home field are 0.
  a[0] += 1e-9
  a[n + 1] += 1e-9
  const x = solve(a, b, n)
  return {
    mean: x[0],
    home: x[1],
    off: new Map(teams.map((team, i) => [team, x[2 + i]])),
    def: new Map(teams.map((team, i) => [team, x[2 + t + i]]))
  }
}

/** The weight of week `week` as of week `asOf`: half every `RECENCY_HALF_LIFE` weeks. */
export const recencyWeight =
  (asOf: number) =>
  (week: number): number =>
    0.5 ** ((asOf - week) / RECENCY_HALF_LIFE)
