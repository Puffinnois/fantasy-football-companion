import type { PositionGroup, StatsOwnership, StatsQuery, StatsResult } from '@shared/stats/types'
import type { StatsStatus } from '@shared/stats/types'
import { fmtStat, type ValueFormat } from './format'
import { queryScope, type StatsScope } from './scope'

/** One card of the Stats home (handoff 4d "Leaderboards"): a metric's top six at a position. */
export interface BoardDef {
  key: string
  /** The chip: a position group, or DEF for team defenses. */
  label: string
  position: PositionGroup | null
  metric: string
  title: string
  /** The leaderboard tab "All →" opens. */
  tab: string
}

/** The handoff's eight boards, on the catalogue's metrics. */
export const BOARDS: BoardDef[] = [
  {
    key: 'qb-yds',
    label: 'QB',
    position: 'QB',
    metric: 'pass_yds',
    title: 'Passing yards',
    tab: 'QB'
  },
  {
    key: 'qb-ypa',
    label: 'QB',
    position: 'QB',
    metric: 'pass_ypa',
    title: 'Yards per attempt',
    tab: 'QB'
  },
  {
    key: 'rb-yds',
    label: 'RB',
    position: 'RB',
    metric: 'rush_yds',
    title: 'Rushing yards',
    tab: 'RB'
  },
  { key: 'rb-tch', label: 'RB', position: 'RB', metric: 'touches', title: 'Touches', tab: 'RB' },
  {
    key: 'wr-yds',
    label: 'WR',
    position: 'WR',
    metric: 'rec_yds',
    title: 'Receiving yards',
    tab: 'WR'
  },
  {
    key: 'wr-tgt',
    label: 'WR',
    position: 'WR',
    metric: 'target_share',
    title: 'Target share',
    tab: 'WR'
  },
  {
    key: 'te-yds',
    label: 'TE',
    position: 'TE',
    metric: 'rec_yds',
    title: 'Receiving yards',
    tab: 'TE'
  },
  {
    key: 'def-to',
    label: 'DEF',
    position: null,
    metric: 'def_turnovers',
    title: 'Takeaways',
    tab: 'defense'
  }
]

/** Rows on a card. */
export const BOARD_ROWS = 6

/**
 * A board's query: every qualified row (my best player may rank outside the top six), sorted by
 * the engine. Counts per game when asked.
 */
export function boardQuery(
  board: BoardDef,
  scope: StatsScope,
  status: StatsStatus | null,
  perGame: boolean
): StatsQuery {
  return {
    entity: board.position ? 'player' : 'team',
    metrics: [board.metric],
    scope: {
      ...queryScope(scope, status),
      ...(board.position ? { positions: [board.position] } : {}),
      qualifiedOnly: true
    },
    transform: perGame ? 'perGame' : 'raw',
    scoring: scope.scoring,
    limit: 1000
  }
}

export interface BoardRow {
  id: string
  rank: number
  name: string
  team: string | null
  value: string
  /** The value over the leader's, for the bar. */
  fraction: number
  lead: boolean
  mine: boolean
}

export interface BoardView {
  rows: BoardRow[]
  /** My best-ranked row when it falls outside the top six (handoff: under a dashed divider). */
  extra: BoardRow | null
  /** "per game" / "total" for counts, nothing for rates. */
  sub: string
  qualified: number
}

/**
 * The card's rows from its result: rows that played `minGames` (handoff: half the games in range)
 * ranked in the engine's order. `mine` marks rows on my fantasy team when `highlight`.
 */
export function boardView(
  result: StatsResult,
  format: ValueFormat,
  perGame: boolean,
  minGames: number,
  ownership: StatsOwnership | null,
  highlight: boolean
): BoardView {
  const metric = result.columns[0]?.id
  const ranked = result.rows.filter(
    (r) => metric && r.values[metric]?.value !== null && r.games >= minGames
  )
  const isMine = (id: string): boolean =>
    highlight && !!(ownership?.players[id]?.mine || ownership?.teams[id]?.mine)
  const leader = ranked[0] ? (ranked[0].values[metric!].value ?? 0) : 0
  const row = (i: number): BoardRow => {
    const r = ranked[i]
    const v = r.values[metric!]
    return {
      id: r.id,
      rank: i + 1,
      name: r.name,
      team: r.team,
      value: fmtStat(v.value, format, perGame),
      fraction: leader ? Math.max(0, Math.min(1, (v.value ?? 0) / leader)) : 0,
      lead: i === 0,
      mine: isMine(r.id)
    }
  }
  const top = ranked.slice(0, BOARD_ROWS).map((_, i) => row(i))
  const mineAt = ranked.findIndex((r) => isMine(r.id))
  return {
    rows: top,
    extra: mineAt >= BOARD_ROWS ? row(mineAt) : null,
    sub: format.kind === 'count' ? (perGame ? 'per game' : 'total') : '',
    qualified: ranked.length
  }
}
