/**
 * Team Elo (stats-analysis spec §8.1), nfelo-style: every game since 2019 in order, 2019 as the
 * burn-in. Pure functions over the schedule, so the model is testable without a database.
 */

export const ELO = {
  /** A new team, and the mean ratings regress to. */
  base: 1500,
  k: 20,
  /** Home field in Elo points: 0 at a neutral site and in 2020 (no fans). */
  homeField: 48,
  /** The share of a rating kept between seasons (one third regresses to the mean). */
  carry: 2 / 3,
  /** Elo points per point of spread. */
  perPoint: 25
} as const

export interface EloGame {
  game_id: string
  season: number
  season_type: 'REG' | 'POST'
  week: number
  home_team: string
  away_team: string
  neutral: boolean
  /** Home minus away; null until played. */
  result: number | null
  /** Vegas: the home team's expected margin, and the moneylines (American odds). */
  spread_line: number | null
  home_moneyline: number | null
  away_moneyline: number | null
}

export interface EloRow {
  game_id: string
  season: number
  season_type: 'REG' | 'POST'
  week: number
  home_team: string
  away_team: string
  played: boolean
  home_elo_pre: number
  away_elo_pre: number
  home_field: number
  /** The home team's win probability and expected margin, from Elo. */
  home_wp: number
  elo_spread: number
  /** The home team's win probability implied by the betting market (no-vig moneyline, else the spread). */
  vegas_home_wp: number | null
  home_elo_post: number | null
  away_elo_post: number | null
}

/** The home team's win probability for an Elo difference (home field included). */
export const winProbability = (diff: number): number =>
  1 / (1 + Math.exp((-diff * Math.LN10) / 400))

/** Home field for a game: none at a neutral site or without fans (2020). */
export const homeFieldOf = (g: Pick<EloGame, 'season' | 'neutral'>): number =>
  g.neutral || g.season === 2020 ? 0 : ELO.homeField

/** nfelo's margin-of-victory multiplier: big wins count more, less so for the favourite. */
export function movMultiplier(margin: number, winnerDiff: number): number {
  return (Math.log(Math.abs(margin) + 1) * 2.2) / (winnerDiff * 0.001 + 2.2)
}

/** The rating change of the home team (the away team's is its negative); `p` is its win probability. */
export function eloShift(diff: number, result: number, p = winProbability(diff)): number {
  const outcome = result > 0 ? 1 : result < 0 ? 0 : 0.5
  const winnerDiff = result >= 0 ? diff : -diff
  return ELO.k * movMultiplier(result, winnerDiff) * (outcome - p)
}

/** No-vig probability from two American moneylines. */
export function moneylineProbability(home: number, away: number): number | null {
  const implied = (odds: number): number => (odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100))
  if (!Number.isFinite(home) || !Number.isFinite(away) || home === 0 || away === 0) return null
  const h = implied(home)
  const a = implied(away)
  return h / (h + a)
}

/** The standard normal CDF (Abramowitz and Stegun 26.2.17, error below 1e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2)
  const p =
    d *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}

/** NFL margins around the spread have a spread of about 13.5 points. */
export const MARGIN_SD = 13.5

function vegasProbability(g: EloGame): number | null {
  if (g.home_moneyline !== null && g.away_moneyline !== null) {
    const p = moneylineProbability(g.home_moneyline, g.away_moneyline)
    if (p !== null) return p
  }
  return g.spread_line === null ? null : normalCdf(g.spread_line / MARGIN_SD)
}

const order = (a: EloGame, b: EloGame): number =>
  a.season - b.season ||
  (a.season_type === b.season_type ? 0 : a.season_type === 'REG' ? -1 : 1) ||
  a.week - b.week ||
  a.game_id.localeCompare(b.game_id)

/**
 * Runs Elo over the games in order. A played game updates both ratings; an unplayed one is rated
 * with the teams' latest ratings. A team's first game of a season starts from its rating regressed
 * a third of the way to the mean. Returns one row per game and every team's latest rating.
 */
export function runElo(games: EloGame[]): { rows: EloRow[]; ratings: Map<string, number> } {
  const ratings = new Map<string, number>()
  const seasonOf = new Map<string, number>()
  const rating = (team: string, season: number): number => {
    const last = seasonOf.get(team)
    let r = ratings.get(team) ?? ELO.base
    if (last !== undefined && last < season)
      r = ELO.base + (r - ELO.base) * ELO.carry ** (season - last)
    if (last !== season) {
      ratings.set(team, r)
      seasonOf.set(team, season)
    }
    return r
  }
  const rows: EloRow[] = []
  for (const g of [...games].sort(order)) {
    const home = rating(g.home_team, g.season)
    const away = rating(g.away_team, g.season)
    const hfa = homeFieldOf(g)
    const diff = home + hfa - away
    const played = g.result !== null
    const shift = played ? eloShift(diff, g.result as number) : 0
    if (played) {
      ratings.set(g.home_team, home + shift)
      ratings.set(g.away_team, away - shift)
    }
    rows.push({
      game_id: g.game_id,
      season: g.season,
      season_type: g.season_type,
      week: g.week,
      home_team: g.home_team,
      away_team: g.away_team,
      played,
      home_elo_pre: home,
      away_elo_pre: away,
      home_field: hfa,
      home_wp: winProbability(diff),
      elo_spread: diff / ELO.perPoint,
      vegas_home_wp: vegasProbability(g),
      home_elo_post: played ? home + shift : null,
      away_elo_post: played ? away - shift : null
    })
  }
  return { rows, ratings }
}

/** Brier score of probabilities against outcomes (a tie counts as half a win). */
export function brier(pairs: { p: number; result: number }[]): number {
  if (pairs.length === 0) return NaN
  const outcome = (r: number): number => (r > 0 ? 1 : r < 0 ? 0 : 0.5)
  return pairs.reduce((s, x) => s + (x.p - outcome(x.result)) ** 2, 0) / pairs.length
}

/**
 * Every team's rating after a week's games of a season (before its first game, its preseason
 * rating, regressed toward the mean). Teams without a game that season are left out.
 */
export function ratingsAfter(rows: EloRow[], season: number, week: number): Map<string, number> {
  const out = new Map<string, number>()
  const seen = new Set<string>()
  for (const r of rows) {
    if (r.season !== season) continue
    for (const [team, pre, post] of [
      [r.home_team, r.home_elo_pre, r.home_elo_post],
      [r.away_team, r.away_elo_pre, r.away_elo_post]
    ] as const) {
      if (!seen.has(team)) {
        seen.add(team)
        out.set(team, pre)
      }
      if (r.played && r.week <= week && post !== null) out.set(team, post)
    }
  }
  return out
}
