import { solve } from './linear'

/**
 * The Simple Rating System (stats-analysis spec §8.3): a team's rating is its average margin plus
 * the average rating of its opponents. A rating of +5 means five points better than an average
 * team on a neutral field.
 */

export interface MarginGame {
  home: string
  away: string
  /** Home minus away. */
  margin: number
}

/**
 * Solves the SRS equations directly: games × rating − Σ opponents' ratings = Σ margins for each
 * team. Iterating them instead oscillates when the schedule splits teams in two groups (every week
 * 1). The system is singular (a constant can be added to every rating), so a tiny ridge picks the
 * solution centred on 0 within each group of teams that played each other.
 */
export function srs(games: MarginGame[]): Map<string, number> {
  const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))].sort()
  const n = teams.length
  const index = new Map(teams.map((t, i) => [t, i]))
  const a = new Float64Array(n * n)
  const b = new Float64Array(n)
  for (const g of games) {
    const h = index.get(g.home)!
    const v = index.get(g.away)!
    a[h * n + h] += 1
    a[v * n + v] += 1
    a[h * n + v] -= 1
    a[v * n + h] -= 1
    b[h] += g.margin
    b[v] -= g.margin
  }
  for (let i = 0; i < n; i++) a[i * n + i] += 1e-6
  const x = n > 0 ? solve(a, b, n) : new Float64Array()
  return new Map(teams.map((t, i) => [t, x[i]]))
}
