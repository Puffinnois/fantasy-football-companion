import { fitAdjusted, recencyWeight, type AdjustedFit, type EpaCell } from './adjusted'
import { ADJUSTED_STATES } from './columns'
import { ratingsAfter, type EloGame, type EloRow } from './elo'
import type { SeasonCell } from './load'
import { srs } from './ratings'
import { DIVISIONS, type TeamOdds } from './simulate'

/** Every team, by nflverse code. */
export const TEAMS = Object.values(DIVISIONS).flat().sort()

/** Regular-season weeks: 17 through 2020, 18 since. */
export const regWeeks = (season: number): number => (season <= 2020 ? 17 : 18)

type Fits = Record<string, AdjustedFit>

/**
 * Adjusted EPA as of each week of a season (spec §8.2): all plays, dropbacks and other runs, each
 * plain and recency-weighted (`recent_all`, …), from the plays of the weeks so far.
 */
export function adjustedAsOf(
  cells: SeasonCell[],
  season: number,
  lastWeek: number
): Map<number, Fits> {
  const own = cells.filter((c) => c.season === season)
  const out = new Map<number, Fits>()
  for (let w = 1; w <= lastWeek; w++) {
    const fits: Fits = {}
    for (const kind of ['all', 'pass', 'rush'] as const) {
      // The fit's cells are offense × defense × home × week; a kind keeps its own plays.
      const merged = new Map<string, EpaCell>()
      for (const c of own) {
        if (c.week > w || (kind !== 'all' && c.kind !== kind)) continue
        const key = `${c.off}|${c.def}|${c.home}|${c.week}`
        const m = merged.get(key) ?? {
          off: c.off,
          def: c.def,
          home: c.home,
          week: c.week,
          plays: 0,
          epa: 0
        }
        m.plays += c.plays
        m.epa += c.epa
        merged.set(key, m)
      }
      const list = [...merged.values()]
      fits[kind] = fitAdjusted(list, TEAMS)
      fits[`recent_${kind}`] = fitAdjusted(list, TEAMS, { weight: recencyWeight(w) })
    }
    out.set(w, fits)
  }
  return out
}

/** `adj_[recent_]{off,def}[_kind]_epa` → its fit and side. */
function adjustedOf(name: string): { fit: string; side: 'off' | 'def' } {
  const m = /^adj_(recent_)?(off|def)(?:_(pass|rush))?_epa$/.exec(name)
  if (!m) throw new Error(`not an adjusted column: ${name}`)
  return { fit: `${m[1] ?? ''}${m[3] ?? 'all'}`, side: m[2] as 'off' | 'def' }
}

/** Sums over a team's game in a week (spec §8.1: expected wins; §8.4: field goals). */
export interface GameSums {
  elo_games: number
  elo_wp: number
  vegas_games: number
  vegas_wp: number
  elo_pre: number
  opp_elo_pre: number
}

/** Per team and week (`team|season|week`): the Elo and Vegas sums of its played games. */
export function gameSums(elo: EloRow[]): Map<string, GameSums> {
  const out = new Map<string, GameSums>()
  for (const r of elo) {
    if (!r.played) continue
    for (const home of [true, false]) {
      const key = `${home ? r.home_team : r.away_team}|${r.season}|${r.week}`
      const s = out.get(key) ?? {
        elo_games: 0,
        elo_wp: 0,
        vegas_games: 0,
        vegas_wp: 0,
        elo_pre: 0,
        opp_elo_pre: 0
      }
      s.elo_games += 1
      s.elo_wp += home ? r.home_wp : 1 - r.home_wp
      if (r.vegas_home_wp !== null) {
        s.vegas_games += 1
        s.vegas_wp += home ? r.vegas_home_wp : 1 - r.vegas_home_wp
      }
      s.elo_pre += home ? r.home_elo_pre : r.away_elo_pre
      s.opp_elo_pre += home ? r.away_elo_pre : r.home_elo_pre
      out.set(key, s)
    }
  }
  return out
}

export interface FgSums {
  fg_model_att: number
  fg_model_made: number
  fg_xmade: number
}

export interface TeamWeekInput {
  season: number
  /** The last week with a played game (0 before the season). */
  lastWeek: number
  games: EloGame[]
  elo: EloRow[]
  cells: SeasonCell[]
  /** `team|week` → the simulation as of that week (regular season only). */
  forecast: Map<string, TeamOdds>
  /** `team|week` → field goals the model rated. */
  kicks: Map<string, FgSums>
  sums: Map<string, GameSums>
}

const mean = (xs: (number | null | undefined)[]): number | null => {
  const ok = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return ok.length > 0 ? ok.reduce((a, b) => a + b, 0) / ok.length : null
}

/**
 * `team_model_week` rows of one season (spec §8): every team at the end of every week from 0
 * (before the season) to the last played one, byes included, so a state "at the end of the
 * scope" always has a row. States: Elo, SRS and average margin, adjusted EPA, schedule strength
 * played and left (opponents' current Elo and adjusted EPA margin), the simulation. Sums: the
 * team's game that week.
 */
export function teamWeekRows(input: TeamWeekInput): Record<string, unknown>[] {
  const { season, games } = input
  const own = games.filter((g) => g.season === season)
  const adjusted = adjustedAsOf(input.cells, season, input.lastWeek)
  const rows: Record<string, unknown>[] = []
  for (let w = 0; w <= input.lastWeek; w++) {
    const played = own.filter((g) => g.result !== null && g.week <= w)
    const ratings =
      played.length > 0
        ? srs(
            played.map((g) => ({
              home: g.home_team,
              away: g.away_team,
              margin: g.result as number
            }))
          )
        : new Map<string, number>()
    const fits = adjusted.get(w)
    const elo = ratingsAfter(input.elo, season, w)
    const net = (t: string): number | null =>
      fits ? (fits.all.off.get(t) ?? 0) - (fits.all.def.get(t) ?? 0) : null
    const left = own.filter((g) => g.season_type === 'REG' && g.week > w)
    const seasonType = w > regWeeks(season) ? 'POST' : 'REG'
    for (const team of TEAMS) {
      const opponents = (list: EloGame[]): string[] =>
        list
          .filter((g) => g.home_team === team || g.away_team === team)
          .map((g) => (g.home_team === team ? g.away_team : g.home_team))
      const faced = opponents(played)
      const ahead = opponents(left)
      const margins = played
        .filter((g) => g.home_team === team || g.away_team === team)
        .map((g) => (g.home_team === team ? (g.result as number) : -(g.result as number)))
      const odds = w <= regWeeks(season) ? input.forecast.get(`${team}|${w}`) : undefined
      const sums = input.sums.get(`${team}|${season}|${w}`)
      const fg = input.kicks.get(`${team}|${w}`)
      const row: Record<string, unknown> = {
        team,
        season,
        season_type: seasonType,
        week: w,
        elo: elo.get(team) ?? null,
        srs: ratings.get(team) ?? null,
        mov: mean(margins)
      }
      for (const name of ADJUSTED_STATES) {
        const { fit, side } = adjustedOf(name)
        row[name] = fits
          ? fits[fit].mean + ((side === 'off' ? fits[fit].off : fits[fit].def).get(team) ?? 0)
          : null
      }
      Object.assign(row, {
        sos_elo: mean(faced.map((o) => elo.get(o))),
        sos_adj: mean(faced.map(net)),
        sos_left_elo: mean(ahead.map((o) => elo.get(o))),
        sos_left_adj: mean(ahead.map(net)),
        games_left: ahead.length,
        proj_wins: odds?.wins ?? null,
        proj_losses: odds?.losses ?? null,
        proj_ties: odds?.ties ?? null,
        playoff_pct: odds?.playoffs ?? null,
        division_pct: odds?.division ?? null,
        bye_pct: odds?.bye ?? null,
        conference_pct: odds?.conference ?? null,
        sb_pct: odds?.superBowl ?? null,
        elo_games: sums?.elo_games ?? 0,
        elo_wp: sums?.elo_wp ?? 0,
        vegas_games: sums?.vegas_games ?? 0,
        vegas_wp: sums?.vegas_wp ?? 0,
        elo_pre: sums?.elo_pre ?? 0,
        opp_elo_pre: sums?.opp_elo_pre ?? 0,
        fg_model_att: fg?.fg_model_att ?? 0,
        fg_model_made: fg?.fg_model_made ?? 0,
        fg_xmade: fg?.fg_xmade ?? 0
      })
      rows.push(row)
    }
  }
  return rows
}
