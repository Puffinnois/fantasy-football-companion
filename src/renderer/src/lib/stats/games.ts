import { kickoffLabel } from '@/lib/playersTableView'
import { fmtStat, ordinal } from '@/lib/stats/format'
import { FIRST_SEASON } from '@/lib/stats/scope'
import { roundOf, teamRank } from '@/lib/stats/team'
import { TEAM_NAMES, teamAbbr } from '@shared/stats/nflTeams'
import type { Scoring } from '@shared/stats/scoring'
import type {
  GameForecast,
  MetricInfo,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow
} from '@shared/stats/types'
import type { PlayerWeekRow } from '@shared/types'

/** Games (stats-analysis spec §9.5, Plan AE): a week's games, a preview and a box score. */

export type GamesTab = 'preview' | 'box'

/** The screen's own choices, kept for the session; the season and scoring are the shared scope's. */
export interface GamesState {
  /** null: the week of the next game, else the last played. */
  week: number | null
  /** A game id; null: the rail's first. */
  game: string | null
  /** null: the box score once the game is final, else the preview. */
  tab: GamesTab | null
}

export const DEFAULT_GAMES: GamesState = { week: null, game: null, tab: null }

export const isPlayed = (g: GameForecast): boolean => g.homeScore !== null && g.awayScore !== null

const ROUNDS: Record<string, string> = {
  WC: 'Wild card',
  DIV: 'Divisional round',
  CONF: 'Conference championships',
  SB: 'Super Bowl'
}

/** "Week 8", or the postseason round ("Wild card"). */
export function weekLabel(season: number, seasonType: 'REG' | 'POST', week: number): string {
  return seasonType === 'POST' ? (ROUNDS[roundOf(season, week)] ?? `Week ${week}`) : `Week ${week}`
}

/** The season's weeks with games, regular season first. */
export function weekOptions(games: readonly GameForecast[]): { value: number; label: string }[] {
  const weeks = new Map<number, string>()
  for (const g of games) weeks.set(g.week, weekLabel(g.season, g.seasonType, g.week))
  return [...weeks].sort((a, b) => a[0] - b[0]).map(([value, label]) => ({ value, label }))
}

/** YYYY-MM-DD in the machine's time zone. */
const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The week the screen opens on: the next game's (the first not played whose day has not passed: a
 * game past its day without a score was postponed), else the last week played.
 */
export function defaultWeek(games: readonly GameForecast[], today = new Date()): number | null {
  const day = localDay(today)
  const ahead = games
    .filter((g) => !isPlayed(g) && (g.gameday === null || g.gameday >= day))
    .sort((a, b) => a.week - b.week)
  if (ahead.length) return ahead[0].week
  const played = games.filter(isPlayed)
  if (played.length) return Math.max(...played.map((g) => g.week))
  return games[0]?.week ?? null
}

/**
 * My fantasy players' teams: the games with my players are marked and come first. The season
 * before counts too: a player who has not played yet this season (week 1, injured) is on the team
 * of his latest game.
 */
export function myPlayersQuery(
  ownership: StatsOwnership | null,
  season: number
): StatsQuery | null {
  const mine = Object.entries(ownership?.players ?? {})
    .filter(([, o]) => o.mine)
    .map(([id]) => id)
  if (!mine.length) return null
  return {
    entity: 'player',
    metrics: ['games'],
    scope: {
      seasons: season > FIRST_SEASON ? [season - 1, season] : [season],
      seasonType: 'ALL',
      players: mine
    },
    transform: 'raw',
    sort: { metric: 'games', dir: 'desc' },
    limit: 100
  }
}

export function myTeams(
  ownership: StatsOwnership | null,
  players: StatsResult | null
): ReadonlySet<string> {
  const teams = new Set<string>()
  for (const r of players?.rows ?? []) if (r.team) teams.add(r.team)
  for (const [team, o] of Object.entries(ownership?.teams ?? {})) if (o.mine) teams.add(team)
  return teams
}

/** A rail item (handoff "9. Game"): away over home, the scores or the kickoff and the line. */
export interface RailGame {
  id: string
  away: string
  home: string
  played: boolean
  awayScore: string
  homeScore: string
  awayWon: boolean
  homeWon: boolean
  /** "Sun 1:00 PM" before the game. */
  when: string
  /** The home team's line ("−3.5", "+2.5", "PK"); null without one. */
  line: string | null
  mine: boolean
}

/** The home team's line as a book writes it: negative when it is favored. */
export function homeLine(spread: number | null): string | null {
  if (spread === null) return null
  if (Math.abs(spread) < 0.25) return 'PK'
  return `${spread > 0 ? '−' : '+'}${Math.abs(spread).toFixed(1)}`
}

/** A week's games: mine first, then by kickoff, then the away team. */
export function railGames(
  games: readonly GameForecast[],
  week: number,
  mine: ReadonlySet<string>,
  timeZone?: string
): RailGame[] {
  const isMine = (g: GameForecast): boolean => mine.has(g.home) || mine.has(g.away)
  const at = (g: GameForecast): number => (g.kickoff ? Date.parse(g.kickoff) : Infinity)
  return games
    .filter((g) => g.week === week)
    .sort(
      (a, b) =>
        Number(isMine(b)) - Number(isMine(a)) || at(a) - at(b) || a.away.localeCompare(b.away)
    )
    .map((g) => {
      const played = isPlayed(g)
      return {
        id: g.gameId,
        away: teamAbbr(g.away),
        home: teamAbbr(g.home),
        played,
        awayScore: played ? String(g.awayScore) : '',
        homeScore: played ? String(g.homeScore) : '',
        awayWon: played && g.awayScore! > g.homeScore!,
        homeWon: played && g.homeScore! > g.awayScore!,
        when: g.kickoff ? kickoffLabel(g.kickoff, timeZone) : (g.gameday ?? 'TBD'),
        line: homeLine(g.spread),
        mine: isMine(g)
      }
    })
}

/** The teams with a regular-season week off: every team of the season not playing that week. */
export function byeTeams(games: readonly GameForecast[], week: number): string[] {
  const reg = games.filter((g) => g.seasonType === 'REG')
  if (!reg.some((g) => g.week === week)) return []
  const all = new Set(reg.flatMap((g) => [g.home, g.away]))
  for (const g of reg) if (g.week === week) [g.home, g.away].forEach((t) => all.delete(t))
  return [...all].sort().map(teamAbbr)
}

/** One side of the header: the team, its record and Elo before the game, its last four results. */
export interface HeaderSide {
  team: string
  abbr: string
  name: string
  meta: string
  form: { result: 'W' | 'L' | 'T'; title: string }[]
  /** Its score, or its Elo win probability before the game. */
  big: string
  /** The loser's score, or the underdog's probability, reads quieter. */
  dim: boolean
}

export interface HeaderView {
  away: HeaderSide
  home: HeaderSide
  played: boolean
  bigLabel: string
  status: string
  sub: string
}

const pct0 = (x: number): string => `${Math.round(x * 100)}%`

/** "Sun, Nov 1 · 4:25 PM" in `timeZone` (default: the machine's). */
export function kickoffText(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone
  })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
  return `${day} · ${time}`
}

/** "Indoors" under a dome or a closed roof, "Outdoors", or nothing when the schedule does not say. */
export function roofText(roof: string | null): string | null {
  if (roof === 'dome' || roof === 'closed') return 'Indoors'
  if (roof === 'outdoors' || roof === 'open') return 'Outdoors'
  return null
}

export function headerView(
  games: readonly GameForecast[],
  g: GameForecast,
  timeZone?: string
): HeaderView {
  const played = isPlayed(g)
  const before = games.filter((x) => isPlayed(x) && x.week < g.week)
  const side = (team: string, home: boolean): HeaderSide => {
    const results = before
      .filter((x) => x.home === team || x.away === team)
      .sort((a, b) => a.week - b.week)
      .map((x) => {
        const us = x.home === team ? x.homeScore! : x.awayScore!
        const them = x.home === team ? x.awayScore! : x.homeScore!
        const opp = teamAbbr(x.home === team ? x.away : x.home)
        const result: 'W' | 'L' | 'T' = us > them ? 'W' : us < them ? 'L' : 'T'
        return {
          result,
          title: `${weekLabel(x.season, x.seasonType, x.week)}: ${result} ${us}–${them} ${x.home === team ? 'vs' : 'at'} ${opp}`
        }
      })
    const count = (r: string): number => results.filter((x) => x.result === r).length
    const t = count('T')
    const record = `${count('W')}–${count('L')}${t ? `–${t}` : ''}`
    const elo = Math.round(home ? g.homeElo : g.awayElo).toLocaleString('en-US')
    const p = home ? g.homeWinProb : 1 - g.homeWinProb
    const us = home ? g.homeScore : g.awayScore
    const them = home ? g.awayScore : g.homeScore
    return {
      team,
      abbr: teamAbbr(team),
      name: TEAM_NAMES[team] ?? team,
      meta: `${record} · Elo ${elo} · ${g.neutral ? 'neutral site' : home ? 'home' : 'away'}`,
      form: results.slice(-4),
      big: played ? String(us) : pct0(p),
      dim: played ? us! < them! : p < 0.5
    }
  }
  const week = weekLabel(g.season, g.seasonType, g.week)
  const roof = roofText(g.roof)
  return {
    away: side(g.away, false),
    home: side(g.home, true),
    played,
    bigLabel: played ? 'Final' : 'Win probability · Elo',
    status: played
      ? `Final · ${week}`
      : g.kickoff
        ? kickoffText(g.kickoff, timeZone)
        : g.gameday
          ? new Date(`${g.gameday}T12:00:00`).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })
          : 'Date to be set',
    sub: [played ? null : week, g.neutral ? 'Neutral site' : null, roof].filter(Boolean).join(' · ')
  }
}

/** "The forecast" (spec §9.5): Elo and the market, the line, the conditions. */
export interface ForecastView {
  probs: { label: string; away: string; home: string; awayShare: number }[]
  agree: string
  /** After the game: who won, and whether the favorite did. */
  result: { text: string; upset: boolean } | null
  tiles: { key: string; value: string; sub: string }[]
  conditions: { big: string; line: string; note: string | null }
}

/** "KC −3.5", "Pick’em": the favorite and its margin. */
function spreadText(home: string, away: string, homeMargin: number): string {
  if (Math.abs(homeMargin) < 0.25) return 'Pick’em'
  return `${teamAbbr(homeMargin > 0 ? home : away)} −${Math.abs(homeMargin).toFixed(1)}`
}

export function forecastView(g: GameForecast): ForecastView {
  const [A, H] = [teamAbbr(g.away), teamAbbr(g.home)]
  const probs = [{ label: 'Elo', hp: g.homeWinProb }]
  if (g.vegasHomeWinProb !== null) probs.push({ label: 'Market', hp: g.vegasHomeWinProb })
  let agree = 'No betting line for this game: Elo only.'
  if (g.vegasHomeWinProb !== null) {
    const gap = g.homeWinProb - g.vegasHomeWinProb
    const fav = g.vegasHomeWinProb >= 0.5 ? H : A
    if (Math.abs(gap) < 0.04)
      agree = `Elo and the market agree: ${fav} ${g.spread !== null && Math.abs(g.spread) >= 0.25 ? `by ${Math.abs(g.spread).toFixed(1)}` : 'in a coin flip'}.`
    else {
      const team = gap > 0 ? H : A
      const elo = gap > 0 ? g.homeWinProb : 1 - g.homeWinProb
      const market = gap > 0 ? g.vegasHomeWinProb : 1 - g.vegasHomeWinProb
      agree = `Elo likes ${team} more than the market does (${pct0(elo)} against ${pct0(market)}).`
    }
  }
  let result: ForecastView['result'] = null
  if (isPlayed(g)) {
    const hs = g.homeScore!
    const as = g.awayScore!
    const favHome = (g.vegasHomeWinProb ?? g.homeWinProb) >= 0.5
    if (hs === as) result = { text: `A ${hs}–${as} tie`, upset: false }
    else {
      const homeWon = hs > as
      result = {
        text: `${homeWon ? H : A} won ${Math.max(hs, as)}–${Math.min(hs, as)} · ${homeWon === favHome ? 'the favorite won' : 'an upset'}`,
        upset: homeWon !== favHome
      }
    }
  }
  const tiles = [
    g.spread === null
      ? { key: 'Spread', value: '—', sub: `Elo: ${spreadText(g.home, g.away, g.eloSpread)}` }
      : {
          key: 'Spread',
          value: spreadText(g.home, g.away, g.spread),
          sub: `Elo: ${spreadText(g.home, g.away, g.eloSpread)}`
        },
    { key: 'Total', value: g.total === null ? '—' : g.total.toFixed(1), sub: 'over / under' }
  ]
  if (g.total !== null && g.spread !== null) {
    const home = (g.total + g.spread) / 2
    tiles.push({
      key: 'Implied',
      value: `${(g.total - home).toFixed(1)}–${home.toFixed(1)}`,
      sub: `${A} – ${H} points`
    })
  }
  const roof = roofText(g.roof)
  let conditions: ForecastView['conditions']
  if (roof === 'Indoors')
    conditions = {
      big: 'Indoors',
      line: g.roof === 'closed' ? 'Roof closed: no weather.' : 'A dome: no weather.',
      note: null
    }
  else if (g.temp !== null || g.wind !== null) {
    const wind = g.wind === null ? null : Math.round(g.wind)
    conditions = {
      big: g.temp === null ? 'Outdoors' : `${Math.round(g.temp)}°F`,
      line: [
        'Outdoors',
        wind === null ? null : `wind ${wind} mph`,
        wind !== null && wind >= 15 ? 'enough to slow the passing game' : null
      ]
        .filter(Boolean)
        .join(' · '),
      note: isPlayed(g) ? 'At kickoff.' : 'From the schedule.'
    }
  } else
    conditions = {
      big: roof ?? '—',
      line: isPlayed(g) ? 'No weather in the schedule.' : 'No weather in the schedule yet.',
      note: null
    }
  return {
    probs: probs.map((p) => ({
      label: p.label,
      away: pct0(1 - p.hp),
      home: pct0(p.hp),
      awayShare: 1 - p.hp
    })),
    agree,
    result,
    tiles,
    conditions
  }
}

/**
 * The stats a preview reads: the weeks of the season before the game. Week 1 reads the season
 * before; a postseason game, its regular season. null: nothing before it (2019 week 1).
 */
export interface BeforeScope {
  scope: StatsQuery['scope']
  season: number
  label: string
}

export function beforeGame(g: GameForecast, firstSeason = 2019): BeforeScope | null {
  if (g.seasonType === 'POST')
    return {
      scope: { seasons: [g.season], seasonType: 'REG' },
      season: g.season,
      label: `the ${g.season} regular season`
    }
  if (g.week === 1) {
    if (g.season - 1 < firstSeason) return null
    return {
      scope: { seasons: [g.season - 1], seasonType: 'REG' },
      season: g.season - 1,
      label: `the ${g.season - 1} season`
    }
  }
  const last = g.week - 1
  return {
    scope: { seasons: [g.season], seasonType: 'REG', weeks: [1, last] },
    season: g.season,
    label: last === 1 ? 'week 1' : `weeks 1–${last}`
  }
}

/** Phase by phase (spec §9.5): each row is a label, the offense's metric and the defense's. */
export const PHASES: { label: string; rows: [string, string, string][] }[] = [
  {
    label: 'Overall',
    rows: [
      ['Adjusted EPA per play', 'adj_off_epa', 'adj_def_epa'],
      ['Success rate', 'off_success_rate', 'def_success_rate'],
      ['Explosive-play rate', 'off_explosive_rate', 'def_explosive_rate']
    ]
  },
  {
    label: 'Passing',
    rows: [
      ['EPA per dropback', 'off_pass_epa', 'def_pass_epa'],
      ['Dropback success rate', 'off_pass_success', 'def_pass_success']
    ]
  },
  {
    label: 'Rushing',
    rows: [
      ['EPA per carry', 'off_rush_epa', 'def_rush_epa'],
      ['Stuff rate', 'off_stuff_rate', 'def_stuff_rate']
    ]
  },
  {
    label: 'Protection vs pass rush',
    rows: [
      ['Sack rate', 'off_sack_rate', 'def_sack_rate'],
      ['Pressure rate', 'off_pressure_rate', 'def_pressure_rate']
    ]
  },
  {
    label: 'Finishing',
    rows: [
      ['Red-zone TD rate', 'off_rz_td_pct', 'def_rz_td_pct'],
      ['Third-down %', 'off_third_down_pct', 'def_third_down_pct']
    ]
  }
]

/** Fantasy points a defense allows, by the position it faces. */
export const ALLOWED: Record<KeyPosition, string> = {
  QB: 'fpa_qb',
  RB: 'fpa_rb',
  WR: 'fpa_wr',
  TE: 'fpa_te'
}

type KeyPosition = 'QB' | 'RB' | 'WR' | 'TE'

/**
 * Answers to several queries over the same rows, as one: each row's values together. DuckDB ranks
 * every metric in its own window step (10–30 ms each, even over 32 rows), so a screen splits a
 * wide query into a few narrow ones that run at once.
 */
export function mergeResults(results: readonly StatsResult[]): StatsResult | null {
  if (!results.length) return null
  const rows = new Map<string, StatsRow>()
  for (const r of results)
    for (const row of r.rows) {
      const had = rows.get(row.id)
      rows.set(row.id, had ? { ...had, values: { ...had.values, ...row.values } } : row)
    }
  return {
    grain: results[0].grain,
    columns: results.flatMap((r) => r.columns),
    rows: [...rows.values()],
    total: rows.size,
    notes: [...new Set(results.flatMap((r) => r.notes))],
    ms: Math.max(...results.map((r) => r.ms))
  }
}

/**
 * Every team before the game: the offenses' phases, the defenses' and the fantasy points each
 * defense allows by position, as three queries that run at once.
 */
export function matchupQueries(
  before: BeforeScope,
  scoring: Scoring
): Map<'off' | 'def' | 'fpa', StatsQuery> {
  const q = (metrics: string[]): StatsQuery => ({
    entity: 'team',
    metrics,
    scope: before.scope,
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring,
    limit: 40
  })
  const rows = PHASES.flatMap((p) => p.rows)
  return new Map([
    ['off', q(rows.map(([, o]) => o))],
    ['def', q(rows.map(([, , d]) => d))],
    ['fpa', q(Object.values(ALLOWED))]
  ])
}

/** A team's value of a metric, ranked among the teams. */
export interface TeamCell {
  value: string
  rank: string
  percentile: number
  title: string
}

function teamCell(
  result: StatsResult,
  team: string,
  metric: string,
  byId: ReadonlyMap<string, MetricInfo>
): TeamCell | null {
  const info = byId.get(metric)
  const v = result.rows.find((r) => r.id === team)?.values[metric]?.value ?? null
  const place = teamRank(result, team, metric, info?.direction ?? 'neutral')
  if (v === null || !place) return null
  const value = fmtStat(v, {
    unit: info?.unit ?? 'number',
    decimals: info?.decimals ?? 1,
    kind: info?.kind
  })
  const rank = `${place.tied ? 'T-' : ''}${ordinal(place.rank)}`
  return {
    value,
    rank,
    percentile: place.percentile,
    title: `${info?.label ?? metric}: ${value}, ${rank} of ${place.of}${info?.direction === 'lower' ? ' (lower is better)' : ''}`
  }
}

export interface FaceRow {
  label: string
  off: TeamCell | null
  def: TeamCell | null
  /** The offense's percentile minus the defense's (each on its own better side): + leans offense. */
  edge: number | null
  /** Why the row is empty ("Not published for 2026 yet."). */
  missing: string | null
}

export interface FaceView {
  off: string
  def: string
  groups: { label: string; rows: FaceRow[] }[]
  summary: string | null
}

/** One offense against the other defense, phase by phase. */
export function faceView(
  result: StatsResult,
  off: string,
  def: string,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): FaceView {
  let best: { edge: number; label: string } | null = null
  const groups = PHASES.map((p) => ({
    label: p.label,
    rows: p.rows.map(([label, o, d]): FaceRow => {
      const oc = teamCell(result, off, o, byId)
      const dc = teamCell(result, def, d, byId)
      const published = (id: string): boolean =>
        (result.columns.find((c) => c.id === id)?.seasons.length ?? 0) > 0
      const missing =
        published(o) && published(d)
          ? null
          : (byId.get(o)?.firstSeason ?? 0) > season
            ? `Charted from ${byId.get(o)!.firstSeason}.`
            : `Not published for ${season} yet.`
      const edge = oc && dc && !missing ? Math.round(oc.percentile - dc.percentile) : null
      if (edge !== null && (!best || Math.abs(edge) > Math.abs(best.edge))) best = { edge, label }
      return { label, off: missing ? null : oc, def: missing ? null : dc, edge, missing }
    })
  }))
  const b = best as { edge: number; label: string } | null
  const lower = (s: string): string => (/^[A-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1))
  return {
    off: teamAbbr(off),
    def: teamAbbr(def),
    groups,
    summary:
      b && b.edge !== 0
        ? `Biggest edge: ${b.edge > 0 ? `${teamAbbr(off)} offense` : `${teamAbbr(def)} defense`}, on ${lower(b.label)} (${Math.abs(b.edge)} percentile points).`
        : null
  }
}

/** Every QB, RB, WR and TE before the game: their fantasy points, the order of the key players. */
export function seasonPlayersQuery(before: BeforeScope, scoring: Scoring): StatsQuery {
  return {
    entity: 'player',
    metrics: ['fantasy_points', 'fantasy_ppg'],
    scope: { ...before.scope, positions: ['QB', 'RB', 'WR', 'TE'] },
    transform: 'raw',
    sort: { metric: 'fantasy_points', dir: 'desc' },
    scoring,
    limit: 5000
  }
}

/** Each team's last game before this one, this season: its players are the ones who play. */
export function lastGames(
  games: readonly GameForecast[],
  g: GameForecast
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {}
  for (const team of [g.away, g.home]) {
    const before = games.filter(
      (x) => isPlayed(x) && x.week < g.week && (x.home === team || x.away === team)
    )
    if (before.length) out[team] = Math.max(...before.map((x) => x.week))
  }
  return out
}

/**
 * Before a team's first game of the season (week 1, read from the season before), its key players
 * and pass rusher are chosen from last season's teams: a player who moved in the offseason is on
 * the wrong one. Says so; null otherwise (and for a final game, which reads its box score).
 */
export function keyNote(
  g: GameForecast,
  last: Partial<Record<string, number>>,
  before: BeforeScope
): string | null {
  if (isPlayed(g) || before.season >= g.season) return null
  const waiting = [g.away, g.home].filter((t) => last[t] === undefined).map(teamAbbr)
  if (!waiting.length) return null
  const one = waiting.length === 1
  return `${waiting.join(' and ')} ${one ? 'has' : 'have'} not played yet in ${g.season}: ${one ? 'its' : 'their'} key players and pass rushers come from ${before.label}, without the offseason’s moves.`
}

/**
 * Who played in each team's last game (before a game not played yet): the key players are chosen
 * among them, so a player out for the season is not. A final game reads its own box score.
 */
export function participantsQuery(
  g: GameForecast,
  last: Partial<Record<string, number>>
): StatsQuery | null {
  const weeks = Object.values(last).filter((w): w is number => w !== undefined)
  if (!weeks.length) return null
  return {
    entity: 'player',
    metrics: ['games'],
    scope: {
      seasons: [g.season],
      seasonType: 'ALL',
      weeks: [Math.min(...weeks), Math.max(...weeks)],
      teams: Object.keys(last),
      positions: ['QB', 'RB', 'WR', 'TE']
    },
    groupBy: ['week'],
    transform: 'raw',
    sort: { metric: 'games', dir: 'desc' },
    limit: 1000
  }
}

/** The players of each team's last game, by team. */
export function participants(
  result: StatsResult | null,
  last: Partial<Record<string, number>>
): Map<string, StatsRow[]> {
  const out = new Map<string, StatsRow[]>()
  for (const r of result?.rows ?? []) {
    if (!r.team || r.group.week !== last[r.team]) continue
    out.set(r.team, [...(out.get(r.team) ?? []), r])
  }
  return out
}

/** The box score (handoff "9. Game"): every player of both teams that week. */
export const BOX_METRICS = [
  'fantasy_points',
  'pass_cmp',
  'pass_att',
  'pass_yds',
  'pass_td',
  'pass_int',
  'carries',
  'rush_yds',
  'rush_td',
  'targets',
  'receptions',
  'rec_yds',
  'rec_td',
  'fg_made',
  'fg_att',
  'sacks',
  'def_tds'
]

/**
 * The box score as queries that run at once: the players' passing, rushing and receiving, and the
 * rest; and each team's takeaways (the opponents' interceptions and lost fumbles: a defender's
 * fumble recoveries count his own team's fumbles too).
 */
export function boxQueries(
  g: GameForecast,
  scoring: Scoring
): Map<'pass' | 'run' | 'rest' | 'team', StatsQuery> {
  const scope = {
    seasons: [g.season],
    seasonType: g.seasonType,
    weeks: [g.week, g.week] as [number, number],
    teams: [g.away, g.home]
  }
  const q = (metrics: string[], positions: PositionGroup[]): StatsQuery => ({
    entity: 'player',
    metrics,
    scope: { ...scope, positions },
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring,
    limit: 300
  })
  const [pass, run, rest] = [
    BOX_METRICS.slice(0, 6),
    BOX_METRICS.slice(6, 13),
    BOX_METRICS.slice(13)
  ]
  return new Map([
    ['pass', q(pass, ['QB', 'RB', 'WR', 'TE', 'K'])],
    ['run', q(run, ['QB', 'RB', 'WR', 'TE'])],
    ['rest', q(rest, ['K', 'DL', 'LB', 'DB'])],
    [
      'team',
      {
        entity: 'team',
        metrics: ['def_turnovers'],
        scope,
        transform: 'raw',
        sort: { metric: 'def_turnovers', dir: 'desc' },
        limit: 40
      }
    ]
  ])
}

/**
 * The players a team's key players are chosen from: those with a pass, a carry or a target in a
 * final game's box score, else those of its last game before.
 */
export function keyPool(
  team: string,
  box: StatsResult | null,
  last: ReadonlyMap<string, StatsRow[]>
): StatsRow[] | null {
  if (box)
    return box.rows.filter(
      (r) =>
        r.team === team &&
        ['pass_att', 'carries', 'targets'].some((id) => (r.values[id]?.value ?? 0) > 0)
    )
  return last.get(team) ?? null
}

/** Each defense's leading pass rusher before the game. */
export function rushersQuery(before: BeforeScope, teams: string[]): StatsQuery {
  return {
    entity: 'player',
    metrics: ['sacks', 'qb_hits'],
    scope: { ...before.scope, teams, positions: ['DL', 'LB', 'DB'] },
    transform: 'raw',
    sort: { metric: 'sacks', dir: 'desc' },
    limit: 300
  }
}

const num = (r: StatsRow | undefined, id: string): number => r?.values[id]?.value ?? 0
const one = (x: number): string => x.toFixed(1)

export type Tone = 'good' | 'bad' | 'neutral'

/** A key player against the other defense (spec §9.5 "key player matchups"). */
export interface KeyPlayer {
  id: string
  name: string
  position: KeyPosition
  mine: boolean
  /** "FP/G 17.9 · WR6": his points per game and his rank at the position before the game. */
  meta: string
  /** The defense's rank against the position: 1 allows the fewest points (handoff's matchup chip). */
  matchup: { opponent: string; rank: string; tone: Tone; title: string } | null
  /** Sleeper's projection before the game, the points he scored after it; null without either. */
  last: { value: string; label: string } | null
}

export interface KeySide {
  team: string
  players: KeyPlayer[]
  rush: { head: string; line: string } | null
}

const SLOTS: [KeyPosition, number][] = [
  ['QB', 1],
  ['RB', 1],
  ['WR', 2],
  ['TE', 1]
]

/**
 * A team's key players: its leading QB, RB, two WRs and TE by fantasy points before the game,
 * among the players of its last game (or its box score); the season's rows when it has none.
 */
export function keySide(
  team: string,
  opponent: string,
  options: {
    played: StatsRow[] | null
    season: StatsResult | null
    matchups: StatsResult | null
    rushers: StatsResult | null
    ownership: StatsOwnership | null
    /** Fantasy points in this game (a final game's box score). */
    scored: ReadonlyMap<string, number> | null
    /** Sleeper's projection for this game, by gsis id. */
    projected: ReadonlyMap<string, number> | null
    range: string
  }
): KeySide {
  const { played, season, matchups, rushers, ownership, scored, projected, range } = options
  const rows = season?.rows ?? []
  const points = new Map(rows.map((r) => [r.id, num(r, 'fantasy_points')]))
  const pool: StatsRow[] = played ?? rows.filter((r) => r.team === team)
  const players: KeyPlayer[] = []
  for (const [position, n] of SLOTS) {
    const at = rows
      .filter((r) => r.position === position)
      .sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0))
    const picks = pool
      .filter((r) => r.position === position)
      .sort((a, b) => (points.get(b.id) ?? -1) - (points.get(a.id) ?? -1))
      .slice(0, n)
    for (const r of picks) {
      const own = at.find((x) => x.id === r.id)
      const rank = own ? at.indexOf(own) + 1 : null
      const place = matchups ? teamRank(matchups, opponent, ALLOWED[position], 'lower') : null
      const tone: Tone = !place
        ? 'neutral'
        : place.rank <= 11
          ? 'bad'
          : place.rank >= 22
            ? 'good'
            : 'neutral'
      const s = scored?.get(r.id)
      const p = projected?.get(r.id)
      players.push({
        id: r.id,
        name: r.name,
        position,
        mine: ownership?.players[r.id]?.mine === true,
        meta: own
          ? `FP/G ${one(num(own, 'fantasy_ppg'))} · ${position}${rank}`
          : 'No games before this one',
        matchup: place
          ? {
              opponent: teamAbbr(opponent),
              rank: ordinal(place.rank),
              tone,
              title: `${teamAbbr(opponent)} allows the ${place.rank === 1 ? 'fewest' : `${ordinal(place.rank)}-fewest`} fantasy points per game to ${position}s (1st is the toughest)`
            }
          : null,
        last:
          s !== undefined
            ? { value: one(s), label: 'scored' }
            : p !== undefined
              ? { value: one(p), label: 'Sleeper' }
              : null
      })
    }
  }
  // The other defense's leading pass rusher against this team's protection.
  const rusher = (rushers?.rows ?? [])
    .filter((r) => r.team === opponent)
    .sort((a, b) => num(b, 'sacks') - num(a, 'sacks') || num(b, 'qb_hits') - num(a, 'qb_hits'))[0]
  let rush: KeySide['rush'] = null
  if (rusher && matchups) {
    const ours = teamRank(matchups, team, 'off_sack_rate', 'lower')
    const theirs = teamRank(matchups, opponent, 'def_sack_rate', 'higher')
    const rate = matchups.rows.find((r) => r.id === team)?.values.off_sack_rate?.value ?? null
    rush = {
      head: `${teamAbbr(opponent)}’s top rusher against the ${teamAbbr(team)} line`,
      line: [
        `${rusher.name} (${teamAbbr(opponent)} ${rusher.position ?? ''}): ${one(num(rusher, 'sacks'))} sacks and ${num(rusher, 'qb_hits')} QB hits in ${range}.`,
        rate !== null && ours
          ? `${teamAbbr(team)} allows a sack on ${(rate * 100).toFixed(1)}% of dropbacks (${ordinal(ours.rank)} of ${ours.of}).`
          : null,
        theirs
          ? `${teamAbbr(opponent)}’s defense ranks ${ordinal(theirs.rank)} in sack rate.`
          : null
      ]
        .filter(Boolean)
        .join(' ')
    }
  }
  return { team: teamAbbr(team), players, rush }
}

/** Sleeper's projections for a week, by gsis id, from Fantasy's rows and the id map. */
export function projectionMap(
  rows: readonly PlayerWeekRow[],
  sleeperIds: ReadonlyMap<string, string | null>
): Map<string, number> {
  const bySleeper = new Map(rows.map((r) => [r.playerId, r.projected]))
  const out = new Map<string, number>()
  for (const [gsis, sleeper] of sleeperIds) {
    const p = sleeper ? bySleeper.get(sleeper) : undefined
    if (p !== undefined && p !== null) out.set(gsis, p)
  }
  return out
}

/** A box-score table: its title, column heads, rows. */
export interface BoxTable {
  title: string
  heads: string[]
  rows: { id: string; name: string; mine: boolean; cells: string[]; fp: string }[]
}

export interface BoxSide {
  team: string
  tables: BoxTable[]
  kicker: { id: string; name: string; fg: string; fp: string } | null
  defense: { sacks: string; takeaways: string; tds: string }
}

export interface BoxView {
  top: { id: string; name: string; team: string; position: string; mine: boolean; fp: string }[]
  sides: [BoxSide, BoxSide]
  /** Fantasy points by gsis id: the key players' "scored". */
  scored: Map<string, number>
}

const n0 = (x: number): string => String(Math.round(x))

export function boxView(
  result: StatsResult,
  g: GameForecast,
  ownership: StatsOwnership | null
): BoxView {
  const mine = (id: string): boolean => ownership?.players[id]?.mine === true
  const fp = (r: StatsRow): string => one(num(r, 'fantasy_points'))
  const line = (r: StatsRow, cells: string[]): BoxTable['rows'][number] => ({
    id: r.id,
    name: r.name,
    mine: mine(r.id),
    cells,
    fp: fp(r)
  })
  const side = (team: string): BoxSide => {
    const rows = result.rows.filter((r) => r.team === team)
    const by = (id: string) => (a: StatsRow, b: StatsRow) => num(b, id) - num(a, id)
    const passing = rows.filter((r) => num(r, 'pass_att') > 0).sort(by('pass_att'))
    const rushing = rows.filter((r) => num(r, 'carries') > 0).sort(by('rush_yds'))
    const receiving = rows.filter((r) => num(r, 'targets') > 0).sort(by('rec_yds'))
    const k = rows.filter((r) => r.position === 'K').sort(by('fg_att'))[0]
    const defenders = rows.filter((r) => ['DL', 'LB', 'DB'].includes(r.position ?? ''))
    const sum = (id: string): number => defenders.reduce((s, r) => s + num(r, id), 0)
    return {
      team: teamAbbr(team),
      tables: [
        {
          title: 'Passing',
          heads: ['C/A', 'YDS', 'TD', 'INT'],
          rows: passing.map((r) =>
            line(r, [
              `${n0(num(r, 'pass_cmp'))}/${n0(num(r, 'pass_att'))}`,
              n0(num(r, 'pass_yds')),
              n0(num(r, 'pass_td')),
              n0(num(r, 'pass_int'))
            ])
          )
        },
        {
          title: 'Rushing',
          heads: ['ATT', 'YDS', 'AVG', 'TD'],
          rows: rushing.map((r) =>
            line(r, [
              n0(num(r, 'carries')),
              n0(num(r, 'rush_yds')),
              one(num(r, 'rush_yds') / num(r, 'carries')),
              n0(num(r, 'rush_td'))
            ])
          )
        },
        {
          title: 'Receiving',
          heads: ['REC/TGT', 'YDS', 'TD'],
          rows: receiving.map((r) =>
            line(r, [
              `${n0(num(r, 'receptions'))}/${n0(num(r, 'targets'))}`,
              n0(num(r, 'rec_yds')),
              n0(num(r, 'rec_td'))
            ])
          )
        }
      ].filter((t) => t.rows.length > 0),
      kicker: k
        ? {
            id: k.id,
            name: k.name,
            fg: `${n0(num(k, 'fg_made'))}/${n0(num(k, 'fg_att'))}`,
            fp: fp(k)
          }
        : null,
      defense: {
        sacks: one(sum('sacks')).replace(/\.0$/, ''),
        takeaways: n0(
          num(
            result.rows.find((r) => r.id === team && r.position === null),
            'def_turnovers'
          )
        ),
        tds: n0(sum('def_tds'))
      }
    }
  }
  const scoring: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'K']
  const scored = new Map<string, number>()
  for (const r of result.rows) {
    const v = r.values.fantasy_points?.value
    if (v !== null && v !== undefined && scoring.includes(r.position as PositionGroup))
      scored.set(r.id, v)
  }
  return {
    top: result.rows
      .filter((r) => scored.has(r.id))
      .sort((a, b) => scored.get(b.id)! - scored.get(a.id)!)
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        name: r.name,
        team: teamAbbr(r.team ?? ''),
        position: r.position ?? '',
        mine: mine(r.id),
        fp: fp(r)
      })),
    sides: [side(g.away), side(g.home)],
    scored
  }
}
