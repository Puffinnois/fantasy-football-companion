import type {
  GameForecast,
  MetricInfo,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsResultColumn,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'
import { DIVISIONS, divisionOf, STATS_TEAMS } from '@shared/stats/nflTeams'
import { cellTitle, fmtStat, heatOf, ordinal, type Heat } from './format'
import { queryScope, regularWeeks, weeksOf, type StatsScope } from './scope'

/** Spec §9.3: the team dashboard's tabs. */
export type TeamTab =
  | 'overview'
  | 'offense'
  | 'defense'
  | 'special'
  | 'situational'
  | 'tendencies'
  | 'players'
  | 'schedule'
  | 'forecast'

export const TEAM_DASH_TABS: { id: TeamTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'special', label: 'Special teams' },
  { id: 'situational', label: 'Situational' },
  { id: 'tendencies', label: 'Tendencies' },
  { id: 'players', label: 'Players' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'forecast', label: 'Forecast' }
]

/** Play-grain splits the dashboard reads (engine `situation`). */
export type SplitKey =
  'all' | 'redzone' | 'twoMinute' | 'leading' | 'close' | 'trailing' | 'q1' | 'q2' | 'q3' | 'q4'

export const SPLITS: Record<SplitKey, { label: string; situation?: StatsQuery['situation'] }> = {
  all: { label: 'All plays' },
  redzone: { label: 'Red zone', situation: { fieldZone: 'redzone' } },
  twoMinute: { label: 'Two-minute', situation: { twoMinute: true } },
  leading: { label: 'Leading by 9+', situation: { scoreMargin: [9, 99] } },
  close: { label: 'Within 8', situation: { scoreMargin: [-8, 8] } },
  trailing: { label: 'Trailing by 9+', situation: { scoreMargin: [-99, -9] } },
  q1: { label: '1st quarter', situation: { quarter: [1] } },
  q2: { label: '2nd quarter', situation: { quarter: [2] } },
  q3: { label: '3rd quarter', situation: { quarter: [3] } },
  q4: { label: '4th quarter', situation: { quarter: [4] } }
}

/** A stat line: a catalogue metric, under a split when it has one, with its own label if needed. */
export interface LineDef {
  metric: string
  split?: SplitKey
  label?: string
}

export interface SectionDef {
  title: string
  lines: LineDef[]
}

const at = (split: SplitKey, metric: string, label: string): LineDef => ({ metric, split, label })
const plain = (...ids: string[]): LineDef[] => ids.map((metric) => ({ metric }))

/** Spec §9.3: what each stat tab shows, grouped as the spec lists it. */
export const TAB_SECTIONS: Record<
  'overview' | 'offense' | 'defense' | 'special' | 'situational' | 'tendencies' | 'forecast',
  SectionDef[]
> = {
  overview: [
    {
      title: 'Ratings',
      lines: plain('elo', 'srs', 'adj_off_epa', 'adj_def_epa', 'off_epa_play', 'def_epa_play')
    }
  ],
  offense: [
    {
      title: 'Efficiency',
      lines: plain(
        'off_epa_play',
        'off_success_rate',
        'off_explosive_rate',
        'off_early_down_epa',
        'points_per_drive',
        'adj_off_epa'
      )
    },
    {
      title: 'Passing',
      lines: plain(
        'off_pass_epa',
        'off_pass_success',
        'off_pass_yds_game',
        'off_sack_rate',
        'off_pressure_rate'
      )
    },
    {
      title: 'Rushing',
      lines: plain(
        'off_rush_epa',
        'off_rush_success',
        'off_rush_yds_game',
        'off_line_yards',
        'off_stuff_rate'
      )
    },
    {
      title: 'Red zone and third down',
      lines: [
        at('redzone', 'off_epa_play', 'Red-zone EPA per play'),
        at('redzone', 'off_success_rate', 'Red-zone success rate'),
        ...plain('td_drive_rate', 'off_third_down_pct', 'off_fourth_down_pct')
      ]
    },
    { title: 'Ball security', lines: plain('off_turnovers', 'off_havoc_rate') }
  ],
  defense: [
    {
      title: 'Efficiency allowed',
      lines: plain(
        'def_epa_play',
        'def_success_rate',
        'def_explosive_rate',
        'def_points_per_drive',
        'adj_def_epa',
        'points_against'
      )
    },
    {
      title: 'Pass rush',
      lines: plain('def_pressure_rate', 'def_sack_rate', 'def_blitz_rate', 'def_pass_rushers')
    },
    {
      title: 'Coverage',
      lines: plain(
        'def_pass_epa',
        'def_pass_success',
        'def_man_rate',
        'def_man_epa',
        'def_zone_epa'
      )
    },
    {
      title: 'Run defense',
      lines: plain(
        'def_rush_epa',
        'def_rush_success',
        'def_stuff_rate',
        'def_line_yards',
        'def_rush_yds_game'
      )
    },
    {
      title: 'Havoc and red zone',
      lines: [
        ...plain('def_havoc_rate', 'def_turnovers'),
        at('redzone', 'def_epa_play', 'Red-zone EPA per play allowed'),
        ...plain('def_third_down_pct')
      ]
    },
    {
      title: 'Fantasy points allowed',
      lines: plain('fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te', 'fpa_k')
    }
  ],
  special: [
    { title: 'Kicking', lines: plain('team_fg_pct', 'team_fgoe') },
    { title: 'Punting', lines: plain('team_punt_net_avg') },
    { title: 'Returns', lines: plain('team_kr_avg', 'team_pr_avg', 'team_st_tds') },
    { title: 'Field position', lines: plain('start_field_position') }
  ],
  situational: [
    {
      title: 'Drives',
      lines: plain(
        'points_per_drive',
        'def_points_per_drive',
        'td_drive_rate',
        'three_and_out_rate',
        'start_field_position'
      )
    },
    {
      title: 'Third and fourth down',
      lines: plain(
        'off_third_down_pct',
        'def_third_down_pct',
        'off_fourth_down_pct',
        'def_fourth_down_pct'
      )
    }
  ],
  tendencies: [
    {
      title: 'Play calling',
      lines: plain('proe', 'neutral_proe', 'neutral_pass_rate', 'neutral_pace', 'no_huddle_rate')
    },
    {
      title: 'Offensive looks',
      lines: plain(
        'shotgun_rate',
        'team_play_action_rate',
        'rpo_rate',
        'screen_rate',
        'motion_rate',
        'personnel_11_rate',
        'personnel_12_rate',
        'personnel_21_rate'
      )
    },
    {
      title: 'Defensive looks',
      lines: plain('def_blitz_rate', 'def_pass_rushers', 'def_man_rate', 'def_box')
    }
  ],
  forecast: [
    {
      title: 'Season odds',
      lines: plain(
        'proj_wins',
        'playoff_pct',
        'division_pct',
        'bye_pct',
        'conference_pct',
        'sb_pct'
      )
    },
    {
      title: 'Ratings',
      lines: plain('elo', 'srs', 'adj_net_epa', 'adj_recent_off_epa', 'adj_recent_def_epa')
    },
    {
      title: 'Schedule strength',
      lines: plain('sos_elo', 'sos_left_elo', 'sos_adj', 'sos_left_adj')
    },
    {
      title: 'Luck',
      lines: plain(
        'pythag_wins',
        'luck_wins',
        'elo_luck',
        'turnover_luck',
        'fumble_luck',
        'int_luck'
      )
    }
  ]
}

/** Every team in the league ranks: at most 40 rows a query covers 32 teams. */
const TEAM_ROWS = 40

/** Whole-league standings come with the Overview's ratings query. */
export const STANDING_METRICS = ['wins', 'losses', 'points_for', 'points_against']

/**
 * The queries a set of sections needs: one per split, over every team (a team's rank is among the
 * league's, so the query cannot filter the team), each metric once.
 */
export function sectionQueries(
  sections: readonly SectionDef[],
  scope: StatsScope,
  status: StatsStatus | null,
  extra: readonly string[] = []
): Map<SplitKey, StatsQuery> {
  const bySplit = new Map<SplitKey, string[]>()
  const add = (split: SplitKey, metric: string): void => {
    const ids = bySplit.get(split) ?? []
    if (!ids.includes(metric)) bySplit.set(split, [...ids, metric])
  }
  for (const id of extra) add('all', id)
  for (const s of sections) for (const l of s.lines) add(l.split ?? 'all', l.metric)
  return new Map(
    [...bySplit].map(([split, metrics]) => [split, teamQuery(metrics, split, scope, status)])
  )
}

/** One query over every team, under a split. */
export function teamQuery(
  metrics: string[],
  split: SplitKey,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  const situation = SPLITS[split].situation
  return {
    entity: 'team',
    metrics,
    scope: queryScope(scope, status),
    ...(situation ? { situation } : {}),
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: TEAM_ROWS
  }
}

/** A stat line as the dashboard writes it. */
export interface StatLine {
  key: string
  metric: string
  label: string
  info: MetricInfo | null
  value: string
  /** "4th of 32" ("highest" for a metric with no better side). */
  rank: string | null
  percentile: number | null
  heat: Heat
  /** The league's average, written like the value. */
  league: string | null
  title: string
  /** Why the line is empty for the season, if it is. */
  missing: string | null
}

export interface SectionView {
  title: string
  lines: StatLine[]
}

/** "Not published for 2026 yet." or "Charted from 2022." for a metric a season lacks. */
export function missingFor(
  column: StatsResultColumn | undefined,
  info: MetricInfo | undefined,
  season: number
): string | null {
  if (!column || column.seasons.length > 0) return null
  if (info && info.firstSeason > season) return `Charted from ${info.firstSeason}.`
  return `Not published for ${season} yet.`
}

/** A team's line from a result over every team: its value, rank among the teams, the league's mean. */
export function statLine(
  result: StatsResult | undefined,
  team: string,
  line: LineDef,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): StatLine {
  const info = byId.get(line.metric) ?? null
  const label = line.label ?? info?.label ?? line.metric
  const key = `${line.split ?? 'all'}:${line.metric}`
  const column = result?.columns.find((c) => c.id === line.metric)
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const v = result?.rows.find((r) => r.id === team)?.values[line.metric]
  const values = (result?.rows ?? [])
    .map((r) => r.values[line.metric]?.value ?? null)
    .filter((x): x is number => x !== null)
  const place = result ? teamRank(result, team, line.metric, info?.direction ?? 'neutral') : null
  let rank: string | null = null
  if (place) {
    const at = `${place.tied ? 'T-' : ''}${ordinal(place.rank)}`
    rank = info?.direction === 'neutral' ? `${at} highest` : `${at} of ${place.of}`
  }
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  return {
    key,
    metric: line.metric,
    label,
    info,
    value: fmtStat(v?.value ?? null, f),
    rank,
    percentile: place?.percentile ?? null,
    heat: place ? heatOf(place.percentile, info?.direction ?? 'neutral') : 'n',
    league: mean === null ? null : fmtStat(mean, f),
    title:
      v && info
        ? cellTitle(
            { ...v, percentile: place?.percentile ?? null, rank: place?.rank ?? null },
            info,
            null
          )
        : '',
    missing: missingFor(column, info ?? undefined, season)
  }
}

/**
 * A team's place among the teams that qualify for a metric: its rank (best first; highest first
 * for a metric with no better side), whether it shares it, and its percentile with ties at their
 * middle, so 30 teams tied at 0 special-teams touchdowns sit near the median, not at the bottom.
 */
export function teamRank(
  result: StatsResult,
  team: string,
  metric: string,
  direction: MetricInfo['direction']
): { rank: number; tied: boolean; of: number; percentile: number } | null {
  const pool = result.rows
    .map((r) => ({ id: r.id, v: r.values[metric] }))
    .filter((x) => x.v?.qualified && x.v.value !== null)
    .map((x) => ({ id: x.id, value: x.v!.value! }))
  const me = pool.find((x) => x.id === team)
  if (!me) return null
  const better = (a: number, b: number): boolean => (direction === 'lower' ? a < b : a > b)
  const above = pool.filter((x) => better(x.value, me.value)).length
  const below = pool.filter((x) => better(me.value, x.value)).length
  const ties = pool.length - 1 - above - below
  return {
    rank: above + 1,
    tied: ties > 0,
    of: pool.length,
    percentile: pool.length > 1 ? (100 * (below + ties / 2)) / (pool.length - 1) : 50
  }
}

/** Every section of a tab, read from the results of `sectionQueries`. */
export function sectionViews(
  sections: readonly SectionDef[],
  results: ReadonlyMap<SplitKey, StatsResult>,
  team: string,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): SectionView[] {
  return sections.map((s) => ({
    title: s.title,
    lines: s.lines.map((l) => statLine(results.get(l.split ?? 'all'), team, l, byId, season))
  }))
}

/** A game from the team's side. */
export interface TeamGame {
  gameId: string
  seasonType: 'REG' | 'POST'
  week: number
  /** The postseason round (WC, DIV, CONF, SB); null in the regular season. */
  round: string | null
  gameday: string | null
  opponent: string
  home: boolean
  neutral: boolean
  played: boolean
  pointsFor: number | null
  pointsAgainst: number | null
  result: 'W' | 'L' | 'T' | null
  /** The team's Elo win probability and expected margin; the market's, when there is one. */
  eloWinProb: number
  eloSpread: number
  vegasWinProb: number | null
  /** The team's expected margin by the betting line (positive: favored). */
  vegasSpread: number | null
  total: number | null
  opponentElo: number
  teamElo: number
  roof: string | null
  temp: number | null
  wind: number | null
}

/** One team's side of each of its games (the games read lists both teams of a game). */
export function teamGames(games: readonly GameForecast[], team: string): TeamGame[] {
  return games
    .filter((g) => g.home === team || g.away === team)
    .map((g): TeamGame => {
      const home = g.home === team
      const pf = home ? g.homeScore : g.awayScore
      const pa = home ? g.awayScore : g.homeScore
      const played = pf !== null && pa !== null
      const flip = (x: number | null): number | null => (x === null ? null : home ? x : -x)
      return {
        gameId: g.gameId,
        seasonType: g.seasonType,
        week: g.week,
        round: g.seasonType === 'POST' ? roundOf(g.season, g.week) : null,
        gameday: g.gameday,
        opponent: home ? g.away : g.home,
        home,
        neutral: g.neutral,
        played,
        pointsFor: pf,
        pointsAgainst: pa,
        result: !played ? null : pf > pa ? 'W' : pf < pa ? 'L' : 'T',
        eloWinProb: home ? g.homeWinProb : 1 - g.homeWinProb,
        eloSpread: home ? g.eloSpread : -g.eloSpread,
        vegasWinProb:
          g.vegasHomeWinProb === null ? null : home ? g.vegasHomeWinProb : 1 - g.vegasHomeWinProb,
        vegasSpread: flip(g.spread),
        total: g.total,
        opponentElo: home ? g.awayElo : g.homeElo,
        teamElo: home ? g.homeElo : g.awayElo,
        roof: g.roof,
        temp: g.temp,
        wind: g.wind
      }
    })
    .sort((a, b) => a.week - b.week)
}

/** The games a scope covers: its season type and, in the regular season, its weeks. */
export function gamesInScope(
  games: readonly TeamGame[],
  scope: StatsScope,
  status: StatsStatus | null
): TeamGame[] {
  if (scope.seasonType === 'POST') return games.filter((g) => g.seasonType === 'POST')
  if (scope.seasonType === 'ALL') return [...games]
  const [a, b] = weeksOf(scope, status)
  return games.filter((g) => g.seasonType === 'REG' && g.week >= a && g.week <= b)
}

/** The header's four tiles (handoff "8. Team"): record, points per game, allowed, margin. */
export interface TeamRecord {
  record: string
  pointsPerGame: string
  allowedPerGame: string
  margin: string
  /** The margin's tone. */
  tone: 'good' | 'bad' | 'even'
  played: number
}

export function teamRecord(games: readonly TeamGame[]): TeamRecord {
  const played = games.filter((g) => g.played)
  const n = played.length
  const count = (r: TeamGame['result']): number => played.filter((g) => g.result === r).length
  const [w, l, t] = [count('W'), count('L'), count('T')]
  const pf = played.reduce((s, g) => s + (g.pointsFor ?? 0), 0)
  const pa = played.reduce((s, g) => s + (g.pointsAgainst ?? 0), 0)
  const one = { unit: 'number' as const, decimals: 1 }
  const per = (x: number): string => (n ? fmtStat(x / n, one) : '—')
  const diff = n ? (pf - pa) / n : 0
  return {
    record: t ? `${w}–${l}–${t}` : `${w}–${l}`,
    pointsPerGame: per(pf),
    allowedPerGame: per(pa),
    margin: !n ? '—' : diff > 0 ? `+${fmtStat(diff, one)}` : fmtStat(diff, one),
    tone: !n || diff === 0 ? 'even' : diff > 0 ? 'good' : 'bad',
    played: n
  }
}

/** The results strip: one card per week of the range, byes included, the postseason after. */
export interface ResultCard {
  key: string
  week: string
  opponent: string
  /** "W 31–24"; null for a bye or a game not played yet. */
  score: string | null
  result: TeamGame['result']
}

export function resultCards(
  games: readonly TeamGame[],
  scope: StatsScope,
  status: StatsStatus | null
): ResultCard[] {
  const card = (g: TeamGame): ResultCard => ({
    key: g.gameId,
    week: g.round ?? `W${g.week}`,
    opponent: `${g.home || g.neutral ? '' : '@'}${g.opponent}`,
    score: g.played ? `${g.result} ${g.pointsFor}–${g.pointsAgainst}` : null,
    result: g.result
  })
  const inScope = gamesInScope(games, scope, status)
  if (scope.seasonType === 'POST') return inScope.map(card)
  const [a, b] = weeksOf(scope, status)
  const regular = new Map(
    inScope.filter((g) => g.seasonType === 'REG').map((g) => [g.week, g] as const)
  )
  const cards: ResultCard[] = []
  for (let w = a; w <= b; w++) {
    const g = regular.get(w)
    cards.push(
      g ? card(g) : { key: `bye${w}`, week: `W${w}`, opponent: 'BYE', score: null, result: null }
    )
  }
  if (scope.seasonType === 'ALL')
    cards.push(...inScope.filter((g) => g.seasonType === 'POST').map(card))
  return cards
}

/** nflverse numbers the postseason on from the regular season's last week. */
/** A postseason game's round: nflverse numbers it on from the season's last regular week. */
export function roundOf(season: number, week: number): string {
  const n = week - regularWeeks(season)
  return ['WC', 'DIV', 'CONF', 'SB'][n - 1] ?? `W${week}`
}

/** The team's next game, from every game of the season (not only the scope's). */
export function nextGame(games: readonly TeamGame[]): TeamGame | null {
  return games.find((g) => !g.played) ?? null
}

/** "Detroit is 61 % to win by Elo, 62 % by the market." in parts the card lays out. */
export interface NextGameView {
  opponent: string
  where: string
  when: string
  elo: { winProb: string; spread: string }
  vegas: { winProb: string; spread: string; total: string } | null
  /** Elo against the market, in points of win probability ("Elo is 3 points higher"). */
  gap: string | null
  weather: string | null
}

const pct0 = (x: number): string => `${Math.round(x * 100)}%`
const spreadText = (team: string, margin: number): string =>
  Math.abs(margin) < 0.25
    ? 'Pick’em'
    : `${team} ${margin > 0 ? '−' : '+'}${Math.abs(margin).toFixed(1)}`

export function nextGameView(g: TeamGame, team: string): NextGameView {
  const date = g.gameday
    ? new Date(`${g.gameday}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    : null
  const week = g.round ?? `Week ${g.week}`
  const gap = g.vegasWinProb === null ? null : Math.round((g.eloWinProb - g.vegasWinProb) * 100)
  return {
    opponent: g.opponent,
    where: g.neutral ? 'Neutral site' : g.home ? 'Home' : 'Away',
    when: date ? `${week} · ${date}` : week,
    elo: { winProb: pct0(g.eloWinProb), spread: spreadText(team, g.eloSpread) },
    vegas:
      g.vegasWinProb === null || g.vegasSpread === null
        ? null
        : {
            winProb: pct0(g.vegasWinProb),
            spread: spreadText(team, g.vegasSpread),
            total: g.total === null ? '—' : g.total.toFixed(1)
          },
    gap:
      gap === null
        ? null
        : gap === 0
          ? 'Elo agrees with the market'
          : `Elo is ${Math.abs(gap)} point${Math.abs(gap) === 1 ? '' : 's'} ${gap > 0 ? 'higher' : 'lower'} than the market`,
    weather: weatherOf(g)
  }
}

export function weatherOf(g: Pick<TeamGame, 'roof' | 'temp' | 'wind'>): string | null {
  if (g.roof === 'dome' || g.roof === 'closed') return 'Indoors'
  const parts = [
    g.temp !== null ? `${Math.round(g.temp)}°F` : null,
    g.wind !== null ? `wind ${Math.round(g.wind)} mph` : null
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** "2nd in the NFC North", from every team's wins and losses in scope (ties broken by margin). */
export function standing(result: StatsResult | undefined, team: string): string | null {
  const division = divisionOf(team)
  if (!result || !division) return null
  const rows = DIVISIONS[division]
    .map((code) => result.rows.find((r) => r.id === code))
    .filter((r): r is StatsRow => r !== undefined)
  if (!rows.some((r) => r.id === team)) return null
  const v = (r: StatsRow, id: string): number => r.values[id]?.value ?? 0
  const pct = (r: StatsRow): number => {
    const g = v(r, 'wins') + v(r, 'losses')
    return g ? v(r, 'wins') / g : 0
  }
  const margin = (r: StatsRow): number => v(r, 'points_for') - v(r, 'points_against')
  const order = [...rows].sort((a, b) => pct(b) - pct(a) || margin(b) - margin(a))
  return `${ordinal(order.findIndex((r) => r.id === team) + 1)} in the ${division}`
}

/** The team the dashboard first opens on: my top fantasy scorer's, else the first. */
export function defaultTeam(topScorer: StatsResult | null): string {
  const team = topScorer?.rows.find((r) => r.team && STATS_TEAMS.includes(r.team))?.team
  return team ?? STATS_TEAMS[0]
}

/** My players' fantasy points: the best one's team opens first. Null without my roster. */
export function topScorerQuery(
  ownership: StatsOwnership | null,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery | null {
  const mine = Object.entries(ownership?.players ?? {})
    .filter(([, o]) => o.mine)
    .map(([id]) => id)
  if (!mine.length) return null
  return {
    entity: 'player',
    metrics: ['fantasy_points'],
    scope: { ...queryScope(scope, status), players: mine },
    sort: { metric: 'fantasy_points', dir: 'desc' },
    scoring: scope.scoring,
    limit: 1
  }
}

const SKILL = ['QB', 'RB', 'WR', 'TE'] as const

/** Handoff "8. Team": who gets the targets, the carries, who throws. One query of the team's players. */
export const ROSTER_METRICS = [
  'targets',
  'receptions',
  'rec_yds',
  'rec_td',
  'fantasy_ppg',
  'carries',
  'rush_yds',
  'rush_ypc',
  'rush_td',
  'pass_cmp',
  'pass_att',
  'pass_yds',
  'pass_td',
  'pass_int',
  'pass_ypa'
]

export function rosterQuery(
  team: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'player',
    metrics: ROSTER_METRICS,
    scope: { ...queryScope(scope, status), teams: [team], positions: [...SKILL] },
    sort: { metric: 'targets', dir: 'desc' },
    scoring: scope.scoring,
    limit: 100
  }
}

export interface ShareRow {
  id: string
  name: string
  position: string | null
  mine: boolean
  /** The share of the team's total, 0–1, and the bar's length against the team's leader (0–1). */
  share: number
  bar: number
  cells: string[]
}

const num = (r: StatsRow, id: string): number => r.values[id]?.value ?? 0
const n0 = (x: number): string => fmtStat(x, { unit: 'count', decimals: 0 })
const n1 = (x: number | null): string => fmtStat(x, { unit: 'number', decimals: 1 })

/** The top rows by a count, each with its share of the team's total (handoff: player ÷ team). */
function shareRows(
  rows: StatsRow[],
  count: string,
  limit: number,
  ownership: StatsOwnership | null,
  cells: (r: StatsRow) => string[]
): ShareRow[] {
  const total = rows.reduce((s, r) => s + num(r, count), 0)
  const top = rows
    .filter((r) => num(r, count) > 0)
    .sort((a, b) => num(b, count) - num(a, count))
    .slice(0, limit)
  const lead = top.length ? num(top[0], count) : 0
  return top.map((r) => ({
    id: r.id,
    name: r.name,
    position: r.position,
    mine: ownership?.players[r.id]?.mine === true,
    share: total > 0 ? num(r, count) / total : 0,
    bar: lead > 0 ? num(r, count) / lead : 0,
    cells: cells(r)
  }))
}

export interface RosterView {
  targets: ShareRow[]
  teamTargets: number
  carries: ShareRow[]
  teamCarries: number
  passers: { id: string; name: string; mine: boolean; cells: string[] }[]
}

/** The three tables of the handoff's team page, from `rosterQuery`'s answer. */
export function rosterView(result: StatsResult, ownership: StatsOwnership | null): RosterView {
  const rows = result.rows
  const total = (id: string): number => rows.reduce((s, r) => s + num(r, id), 0)
  return {
    targets: shareRows(rows, 'targets', 8, ownership, (r) => [
      n0(num(r, 'targets')),
      n0(num(r, 'receptions')),
      n0(num(r, 'rec_yds')),
      n0(num(r, 'rec_td')),
      n1(r.values.fantasy_ppg?.value ?? null)
    ]),
    teamTargets: total('targets'),
    carries: shareRows(rows, 'carries', 5, ownership, (r) => [
      n0(num(r, 'carries')),
      n0(num(r, 'rush_yds')),
      n1(r.values.rush_ypc?.value ?? null),
      n0(num(r, 'rush_td'))
    ]),
    teamCarries: total('carries'),
    passers: rows
      .filter((r) => num(r, 'pass_att') > 0)
      .sort((a, b) => num(b, 'pass_att') - num(a, 'pass_att'))
      .slice(0, 2)
      .map((r) => ({
        id: r.id,
        name: r.name,
        mine: ownership?.players[r.id]?.mine === true,
        cells: [
          `${n0(num(r, 'pass_cmp'))}/${n0(num(r, 'pass_att'))}`,
          n0(num(r, 'pass_yds')),
          n0(num(r, 'pass_td')),
          n0(num(r, 'pass_int')),
          n1(r.values.pass_ypa?.value ?? null)
        ]
      }))
  }
}

/** A weekly series for a chart: one value per week of the range, null for a bye or no data. */
export interface WeekSeries {
  id: string
  label: string
  points: { week: number; value: number | null }[]
}

/** The team's own weekly rows (a `groupBy: ['week']` query filtered to the team). */
export function weeklyQuery(
  team: string,
  metrics: string[],
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'team',
    metrics,
    scope: { ...queryScope(scope, status), teams: [team] },
    groupBy: ['week'],
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: 40
  }
}

/** The weeks a chart spans: the scope's regular-season weeks, or the weeks the rows have. */
export function chartWeeks(
  result: StatsResult | null,
  scope: StatsScope,
  status: StatsStatus | null
): number[] {
  if (scope.seasonType === 'REG') {
    const [a, b] = weeksOf(scope, status)
    return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  }
  const weeks = (result?.rows ?? []).map((r) => Number(r.group.week)).filter(Number.isFinite)
  return [...new Set(weeks)].sort((a, b) => a - b)
}

export function weekSeries(
  result: StatsResult | null,
  metrics: string[],
  weeks: number[],
  byId: ReadonlyMap<string, MetricInfo>
): WeekSeries[] {
  const byWeek = new Map((result?.rows ?? []).map((r) => [Number(r.group.week), r] as const))
  return metrics.map((id) => ({
    id,
    label: byId.get(id)?.label ?? id,
    points: weeks.map((week) => ({ week, value: byWeek.get(week)?.values[id]?.value ?? null }))
  }))
}

/** Spec §9.3 Players: usage shares across the roster, by week. */
export const USAGE_METRICS: { id: string; label: string }[] = [
  { id: 'snap_share', label: 'Snaps' },
  { id: 'route_participation', label: 'Routes' },
  { id: 'target_share', label: 'Targets' },
  { id: 'carry_share', label: 'Carries' },
  { id: 'air_yards_share', label: 'Air yards' }
]

export function usageQuery(
  team: string,
  scope: StatsScope,
  status: StatsStatus | null,
  byWeek: boolean
): StatsQuery {
  return {
    entity: 'player',
    metrics: USAGE_METRICS.map((m) => m.id),
    scope: { ...queryScope(scope, status), teams: [team], positions: [...SKILL] },
    ...(byWeek ? { groupBy: ['week' as const] } : {}),
    sort: { metric: 'snap_share', dir: 'desc' },
    limit: 1000
  }
}

export interface UsageRow {
  id: string
  name: string
  position: string | null
  mine: boolean
  season: number | null
  estimated: boolean
  cells: (number | null)[]
}

/**
 * The usage grid: every skill player with a share of `metric` in range, highest first; a cell per
 * week (null: no game for him that week).
 */
export function usageGrid(
  season: StatsResult,
  weekly: StatsResult,
  metric: string,
  weeks: number[],
  ownership: StatsOwnership | null
): UsageRow[] {
  const cells = new Map<string, Map<number, number | null>>()
  for (const r of weekly.rows) {
    const m = cells.get(r.id) ?? new Map<number, number | null>()
    m.set(Number(r.group.week), r.values[metric]?.value ?? null)
    cells.set(r.id, m)
  }
  return season.rows
    .filter((r) => (r.values[metric]?.value ?? 0) > 0)
    .sort((a, b) => (b.values[metric]?.value ?? 0) - (a.values[metric]?.value ?? 0))
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      mine: ownership?.players[r.id]?.mine === true,
      season: r.values[metric]?.value ?? null,
      estimated: r.values[metric]?.estimated === true,
      cells: weeks.map((w) => cells.get(r.id)?.get(w) ?? null)
    }))
}

/** Spec §9.3 Situational: the splits table's rows and metrics. */
export const SPLIT_ROWS: SplitKey[] = [
  'all',
  'redzone',
  'twoMinute',
  'leading',
  'close',
  'trailing',
  'q1',
  'q2',
  'q3',
  'q4'
]
export const SPLIT_METRICS = [
  'off_epa_play',
  'off_success_rate',
  'def_epa_play',
  'def_success_rate'
]

export function splitQueries(
  scope: StatsScope,
  status: StatsStatus | null
): Map<SplitKey, StatsQuery> {
  return new Map(SPLIT_ROWS.map((k) => [k, teamQuery(SPLIT_METRICS, k, scope, status)]))
}

export interface SplitCell {
  value: string
  rank: string | null
  heat: Heat
  title: string
}

export interface SplitRow {
  key: SplitKey
  label: string
  offPlays: string
  defPlays: string
  cells: SplitCell[]
}

export function splitRows(
  results: ReadonlyMap<SplitKey, StatsResult>,
  team: string,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): SplitRow[] {
  return SPLIT_ROWS.map((key) => {
    const r = results.get(key)
    const row = r?.rows.find((x) => x.id === team)
    const plays = (id: string): string => {
      const s = row?.values[id]?.sample
      return s == null ? '—' : n0(s)
    }
    return {
      key,
      label: SPLITS[key].label,
      offPlays: plays('off_epa_play'),
      defPlays: plays('def_epa_play'),
      cells: SPLIT_METRICS.map((metric) => {
        const l = statLine(r, team, { metric }, byId, season)
        return {
          value: l.value,
          rank: l.rank ? l.rank.replace(/ of \d+$/, '') : null,
          heat: l.heat,
          title: l.title
        }
      })
    }
  })
}

/** Personnel groupings (participation, through the prior season): the team's mix and results. */
export function personnelQuery(
  team: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'team',
    metrics: ['off_epa_play', 'off_success_rate'],
    scope: { ...queryScope(scope, status), teams: [team] },
    groupBy: ['personnel'],
    sort: { metric: 'off_epa_play', dir: 'desc' },
    limit: 40
  }
}

export interface PersonnelRow {
  personnel: string
  plays: number
  share: number
  epa: string
  success: string
}

export function personnelRows(result: StatsResult): PersonnelRow[] {
  const rows = result.rows
    .map((r) => ({ r, plays: r.values.off_epa_play?.sample ?? 0 }))
    .filter(({ r, plays }) => r.group.personnel != null && plays > 0)
  const total = rows.reduce((s, x) => s + x.plays, 0)
  return rows
    .sort((a, b) => b.plays - a.plays)
    .map(({ r, plays }) => ({
      personnel: String(r.group.personnel),
      plays,
      share: total ? plays / total : 0,
      epa: fmtStat(r.values.off_epa_play?.value ?? null, { unit: 'epa', decimals: 2 }),
      success: fmtStat(r.values.off_success_rate?.value ?? null, { unit: 'pct', decimals: 1 })
    }))
}

/** Spec §9.3 Special teams: the team's kickers and punters. */
export function specialistsQuery(
  team: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'player',
    metrics: [
      'fg_made',
      'fg_att',
      'fg_pct',
      'fg_pct_50p',
      'fgoe',
      'pat_pct',
      'punts',
      'punt_net_avg',
      'punt_in20_rate'
    ],
    scope: { ...queryScope(scope, status), teams: [team], positions: ['K', 'P'] },
    sort: { metric: 'fg_att', dir: 'desc' },
    scoring: scope.scoring,
    limit: 20
  }
}

/** Spec §9.3 Schedule: a game as the table lists it. */
export interface ScheduleRow {
  key: string
  week: string
  date: string
  opponent: string
  result: TeamGame['result']
  score: string
  /** The team's Elo win probability, and the market's. */
  elo: string
  vegas: string
  line: string
  /** The opponent's Elo before the game, and how it compares with the league (1500). */
  opponentElo: string
  strength: 'hard' | 'easy' | 'even'
  weather: string
}

export function scheduleRows(games: readonly TeamGame[], team: string): ScheduleRow[] {
  return games.map((g) => ({
    key: g.gameId,
    week: g.round ?? String(g.week),
    date: g.gameday
      ? new Date(`${g.gameday}T12:00:00`).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        })
      : '',
    opponent: `${g.neutral ? 'vs ' : g.home ? '' : '@ '}${g.opponent}`,
    result: g.result,
    score: g.played ? `${g.result} ${g.pointsFor}–${g.pointsAgainst}` : '',
    elo: pct0(g.eloWinProb),
    vegas: g.vegasWinProb === null ? '—' : pct0(g.vegasWinProb),
    line: g.vegasSpread === null ? '—' : spreadText(team, g.vegasSpread),
    opponentElo: String(Math.round(g.opponentElo)),
    strength: g.opponentElo >= 1550 ? 'hard' : g.opponentElo <= 1450 ? 'easy' : 'even',
    weather: weatherOf(g) ?? '—'
  }))
}
