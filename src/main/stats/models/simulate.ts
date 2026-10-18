import { ELO, eloShift, MARGIN_SD, winProbability } from './elo'
import { rng } from './linear'

/**
 * Season simulation (stats-analysis spec §8.1): the rest of the regular season played many times
 * from the current Elo ratings, ratings updated within each run, then the playoffs. NFL
 * tiebreakers through head-to-head, division record, common games, conference record, strength of
 * victory and strength of schedule, then a coin flip: an approximation (the points-based steps are
 * left out).
 */

/** Divisions since 2002; nflverse codes. */
export const DIVISIONS: Record<string, string[]> = {
  'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'],
  'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
  'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
  'AFC West': ['DEN', 'KC', 'LAC', 'LV'],
  'NFC East': ['DAL', 'NYG', 'PHI', 'WAS'],
  'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
  'NFC South': ['ATL', 'CAR', 'NO', 'TB'],
  'NFC West': ['ARI', 'LA', 'SF', 'SEA']
}

export const SIM_RUNS = 10_000

export interface SimGame {
  week: number
  home: string
  away: string
  /** Home field in Elo points (0 at a neutral site). */
  homeField: number
  /** Home minus away once played. */
  result: number | null
}

export interface SimInput {
  season: number
  /** The whole regular season, played games with their results. */
  games: SimGame[]
  /** Every team's rating now. */
  ratings: Map<string, number>
  runs?: number
  seed?: number
}

export interface TeamOdds {
  team: string
  wins: number
  losses: number
  ties: number
  playoffs: number
  division: number
  /** A first-round bye: the top seed (the top two in 2019). */
  bye: number
  /** Reaches the Super Bowl. */
  conference: number
  superBowl: number
}

const TEAMS = Object.values(DIVISIONS).flat().sort()
const T = TEAMS.length
const INDEX = new Map(TEAMS.map((t, i) => [t, i]))
const DIVISION_OF = new Int8Array(T)
Object.values(DIVISIONS).forEach((teams, d) =>
  teams.forEach((t) => (DIVISION_OF[INDEX.get(t)!] = d))
)
const conferenceOf = (i: number): number => (DIVISION_OF[i] < 4 ? 0 : 1)

/** One season's results: wins, losses and ties of each team against each other team. */
class Table {
  readonly w = new Uint8Array(T * T)
  readonly l = new Uint8Array(T * T)
  readonly t = new Uint8Array(T * T)
  copy(from: Table): void {
    this.w.set(from.w)
    this.l.set(from.l)
    this.t.set(from.t)
  }
  add(home: number, away: number, result: number): void {
    if (result > 0) {
      this.w[home * T + away] += 1
      this.l[away * T + home] += 1
    } else if (result < 0) {
      this.l[home * T + away] += 1
      this.w[away * T + home] += 1
    } else {
      this.t[home * T + away] += 1
      this.t[away * T + home] += 1
    }
  }
  games(a: number, b: number): number {
    const i = a * T + b
    return this.w[i] + this.l[i] + this.t[i]
  }
  /** Win % (a tie counts half) of `team` against the teams `vs` accepts. */
  pct(team: number, vs: (o: number) => boolean): number {
    let p = 0
    let g = 0
    for (let o = 0; o < T; o++) {
      if (o === team || !vs(o)) continue
      const i = team * T + o
      p += this.w[i] + this.t[i] / 2
      g += this.w[i] + this.l[i] + this.t[i]
    }
    return g > 0 ? p / g : 0
  }
  record(team: number): { pct: number; w: number; l: number; t: number } {
    let w = 0
    let l = 0
    let t = 0
    for (let i = team * T; i < team * T + T; i++) {
      w += this.w[i]
      l += this.l[i]
      t += this.t[i]
    }
    const g = w + l + t
    return { pct: g > 0 ? (w + t / 2) / g : 0, w, l, t }
  }
}

/** The teams of `group` with the best value; the rest are out of this step. */
function best(group: number[], value: (t: number) => number): number[] {
  const values = group.map(value)
  const top = Math.max(...values)
  return group.filter((_, i) => values[i] >= top - 1e-9)
}

/**
 * Picks the winner of a tie (NFL procedure, approximated). Within a division: head-to-head among
 * the tied, division record, common games, conference record. Across divisions (wild cards,
 * seeds): head-to-head when every pair met, conference record, common games (four or more).
 * When a step separates some teams but not all, it starts over with the rest; then a coin flip.
 */
function breakTie(
  group: number[],
  table: Table,
  sameDivision: boolean,
  random: () => number
): number {
  if (group.length === 1) return group[0]
  const among = (t: number): number => table.pct(t, (o) => group.includes(o))
  const common = (t: number): number => {
    const opponents = TEAMS.map((_, o) => o).filter(
      (o) => !group.includes(o) && group.every((g) => table.games(g, o) > 0)
    )
    return table.pct(t, (o) => opponents.includes(o))
  }
  const enoughCommon = (): boolean => {
    let n = Infinity
    for (const g of group) {
      let c = 0
      for (let o = 0; o < T; o++) {
        if (!group.includes(o) && group.every((x) => table.games(x, o) > 0)) c += table.games(g, o)
      }
      n = Math.min(n, c)
    }
    return n >= 4
  }
  const metAll = group.every((a) => group.every((b) => a === b || table.games(a, b) > 0))
  const division = (t: number): number => table.pct(t, (o) => DIVISION_OF[o] === DIVISION_OF[t])
  const conference = (t: number): number => table.pct(t, (o) => conferenceOf(o) === conferenceOf(t))
  const strength = (t: number, beaten: boolean): number => {
    let p = 0
    let g = 0
    for (let o = 0; o < T; o++) {
      const n = beaten ? table.w[t * T + o] : table.games(t, o)
      if (n === 0) continue
      const r = table.record(o)
      p += n * (r.w + r.t / 2)
      g += n * (r.w + r.l + r.t)
    }
    return g > 0 ? p / g : 0
  }
  const victory = (t: number): number => strength(t, true)
  const schedule = (t: number): number => strength(t, false)
  // A step that does not apply reads as a tie; common games across divisions need four of them.
  const level = (): number => 0
  const steps: (() => (t: number) => number)[] = sameDivision
    ? [() => among, () => division, () => common, () => conference, () => victory, () => schedule]
    : [
        () => (metAll ? among : level),
        () => conference,
        () => (enoughCommon() ? common : level),
        () => victory,
        () => schedule
      ]
  for (const step of steps) {
    const left = best(group, step())
    if (left.length === 1) return left[0]
    if (left.length < group.length) return breakTie(left, table, sameDivision, random)
  }
  return group[Math.floor(random() * group.length)]
}

/** Orders teams best first by win %, ties broken one place at a time (the NFL's restart rule). */
function order(
  teams: number[],
  table: Table,
  sameDivision: boolean,
  random: () => number
): number[] {
  const pct = new Map(teams.map((t) => [t, table.record(t).pct]))
  const left = [...teams]
  const out: number[] = []
  while (left.length > 0) {
    const tied = best(left, (t) => pct.get(t)!)
    const pick = breakTie(tied, table, sameDivision, random)
    out.push(pick)
    left.splice(left.indexOf(pick), 1)
  }
  return out
}

/**
 * A conference's seeds: division winners first (seeded among themselves), then the wild cards.
 * Before a wild-card comparison, only each division's best remaining team takes part.
 */
function seedConference(
  conference: number,
  table: Table,
  playoffTeams: number,
  random: () => number
): { seeds: number[]; winners: number[] } {
  const divisions = [0, 1, 2, 3].map((d) => conference * 4 + d)
  const ranked = divisions.map((d) =>
    order(
      TEAMS.map((_, i) => i).filter((i) => DIVISION_OF[i] === d),
      table,
      true,
      random
    )
  )
  const winners = ranked.map((r) => r[0])
  const seeds = order(winners, table, false, random)
  const rest = ranked.map((r) => r.slice(1))
  while (seeds.length < playoffTeams) {
    const pct = (t: number): number => table.record(t).pct
    const heads = rest.filter((r) => r.length > 0).map((r) => r[0])
    // Each division's next team; the best record among them, then the tiebreakers.
    const top = best(heads, pct)
    const pick = breakTie(top, table, false, random)
    seeds.push(pick)
    const from = rest.find((r) => r[0] === pick)!
    from.shift()
  }
  return { seeds, winners }
}

/** Playoff teams per conference: 6 through 2019, 7 since. */
export const playoffTeamsOf = (season: number): number => (season <= 2019 ? 6 : 7)

/**
 * Plays the rest of the season `runs` times. A game is won with its Elo probability; the margin
 * (for the rating update) is drawn around the Elo spread. Returns each team's averages.
 */
export function simulateSeason(input: SimInput): TeamOdds[] {
  const runs = input.runs ?? SIM_RUNS
  const random = rng(input.seed ?? input.season)
  const fixed = new Table()
  for (const g of input.games) {
    const home = INDEX.get(g.home)
    const away = INDEX.get(g.away)
    if (home !== undefined && away !== undefined && g.result !== null)
      fixed.add(home, away, g.result)
  }
  const left = input.games
    .filter((g) => g.result === null && INDEX.has(g.home) && INDEX.has(g.away))
    .sort((a, b) => a.week - b.week)
    .map((g) => ({ home: INDEX.get(g.home)!, away: INDEX.get(g.away)!, homeField: g.homeField }))
  const start = new Float64Array(T)
  TEAMS.forEach((t, i) => (start[i] = input.ratings.get(t) ?? ELO.base))
  const seedsPer = playoffTeamsOf(input.season)
  const byes = input.season <= 2019 ? 2 : 1
  const sum = {
    wins: new Float64Array(T),
    losses: new Float64Array(T),
    ties: new Float64Array(T),
    playoffs: new Float64Array(T),
    division: new Float64Array(T),
    bye: new Float64Array(T),
    conference: new Float64Array(T),
    superBowl: new Float64Array(T)
  }
  const table = new Table()
  const elo = new Float64Array(T)
  // Box–Muller gives two normals at a time; the second is kept for the next margin.
  let spare: number | null = null
  const normal = (): number => {
    if (spare !== null) {
      const z = spare
      spare = null
      return z
    }
    const r = Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12)))
    const a = 2 * Math.PI * random()
    spare = r * Math.sin(a)
    return r * Math.cos(a)
  }
  /** A margin around the Elo spread, at least a point. */
  const margin = (diff: number): number =>
    Math.max(1, Math.abs(Math.round(diff / ELO.perPoint + MARGIN_SD * normal())))
  const play = (home: number, away: number, homeField: number): number => {
    const diff = elo[home] + homeField - elo[away]
    const p = winProbability(diff)
    const result = random() < p ? margin(diff) : -margin(diff)
    const shift = eloShift(diff, result, p)
    elo[home] += shift
    elo[away] -= shift
    return result
  }
  for (let run = 0; run < runs; run++) {
    table.copy(fixed)
    elo.set(start)
    for (const g of left) table.add(g.home, g.away, play(g.home, g.away, g.homeField))
    for (let i = 0; i < T; i++) {
      const r = table.record(i)
      sum.wins[i] += r.w
      sum.losses[i] += r.l
      sum.ties[i] += r.t
    }
    const champions: number[] = []
    for (const conf of [0, 1]) {
      const { seeds, winners } = seedConference(conf, table, seedsPer, random)
      for (const w of winners) sum.division[w] += 1
      for (const s of seeds) sum.playoffs[s] += 1
      for (const s of seeds.slice(0, byes)) sum.bye[s] += 1
      // Wild card round: the bye seeds rest; then the best seed left hosts the worst.
      let alive = seeds.map((team, i) => ({ team, seed: i + 1 }))
      while (alive.length > 1) {
        const resting = alive.length === seedsPer ? alive.slice(0, byes) : []
        const playing = alive.slice(resting.length)
        const next = [...resting]
        for (let i = 0; i < playing.length / 2; i++) {
          const hi = playing[i]
          const lo = playing[playing.length - 1 - i]
          next.push(play(hi.team, lo.team, ELO.homeField) > 0 ? hi : lo)
        }
        alive = next.sort((a, b) => a.seed - b.seed)
      }
      sum.conference[alive[0].team] += 1
      champions.push(alive[0].team)
    }
    sum.superBowl[play(champions[0], champions[1], 0) > 0 ? champions[0] : champions[1]] += 1
  }
  return TEAMS.map((team, i) => ({
    team,
    wins: sum.wins[i] / runs,
    losses: sum.losses[i] / runs,
    ties: sum.ties[i] / runs,
    playoffs: sum.playoffs[i] / runs,
    division: sum.division[i] / runs,
    bye: sum.bye[i] / runs,
    conference: sum.conference[i] / runs,
    superBowl: sum.superBowl[i] / runs
  }))
}
