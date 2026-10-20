import type {
  Entity,
  LeaderboardBoard,
  MetricFamily,
  MetricInfo,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'
import { familyLabel } from './format'
import { queryScope, type StatsScope } from './scope'

/** A leaderboard tab: positions for players, a unit for teams, and its default columns by group. */
export interface TabDef {
  id: string
  label: string
  entity: Entity
  positions?: PositionGroup[]
  /** Team tabs: which metrics the column picker offers first. */
  sides?: NonNullable<MetricInfo['side']>[]
  groups: [string, string[]][]
  sort: string
  /**
   * The metric whose sample qualifies a row (spec §9.2 "qualified only"): its `minSample`, scaled
   * by the engine to the weeks in scope. Teams always qualify.
   */
  qualifier?: string
}

const OFFENSE: PositionGroup[] = ['QB', 'RB', 'WR', 'TE']
const RECEIVING: [string, string[]][] = [
  ['Usage', ['snap_share', 'route_participation', 'target_share', 'air_yards_share', 'wopr']],
  ['Receiving', ['targets', 'receptions', 'rec_yds', 'rec_td']],
  ['Efficiency', ['yprr', 'tprr', 'rec_adot', 'separation']],
  ['Fantasy', ['fantasy_ppg', 'fpoe']]
]

/** Spec §9.2 players' tabs (the Ledger's position views, every position group). */
export const PLAYER_TABS: TabDef[] = [
  {
    id: 'ALL',
    label: 'All offense',
    entity: 'player',
    positions: OFFENSE,
    groups: [
      ['Usage', ['snap_share', 'touches', 'target_share']],
      ['Production', ['scrimmage_yds', 'total_td']],
      ['Fantasy', ['fantasy_points', 'fantasy_ppg', 'expected_points', 'fpoe']]
    ],
    sort: 'fantasy_points',
    qualifier: 'snap_share'
  },
  {
    id: 'QB',
    label: 'QB',
    entity: 'player',
    positions: ['QB'],
    groups: [
      [
        'Passing',
        ['pass_att', 'pass_cmp_pct', 'pass_yds', 'pass_ypa', 'pass_td', 'pass_int', 'pass_anya']
      ],
      ['Efficiency', ['qb_epa_db', 'qb_success', 'cpoe', 'epa_cpoe_composite', 'qbr']],
      ['Style', ['pass_adot', 'time_to_throw']],
      ['Rushing', ['carries', 'rush_yds', 'rush_td']],
      ['Fantasy', ['fantasy_ppg']]
    ],
    sort: 'pass_yds',
    qualifier: 'qb_epa_db'
  },
  {
    id: 'RB',
    label: 'RB',
    entity: 'player',
    positions: ['RB'],
    groups: [
      ['Usage', ['snap_share', 'carry_share', 'opportunity_share', 'high_value_touches']],
      ['Rushing', ['carries', 'rush_yds', 'rush_ypc', 'rush_td', 'ryoe_att']],
      ['Receiving', ['targets', 'receptions', 'rec_yds']],
      ['Fantasy', ['fantasy_ppg', 'fpoe']]
    ],
    sort: 'rush_yds',
    qualifier: 'carry_share'
  },
  {
    id: 'WR',
    label: 'WR',
    entity: 'player',
    positions: ['WR'],
    groups: RECEIVING,
    sort: 'rec_yds',
    qualifier: 'target_share'
  },
  {
    id: 'TE',
    label: 'TE',
    entity: 'player',
    positions: ['TE'],
    groups: RECEIVING,
    sort: 'rec_yds',
    qualifier: 'target_share'
  },
  {
    id: 'K',
    label: 'K',
    entity: 'player',
    positions: ['K'],
    groups: [
      ['Field goals', ['fg_made', 'fg_att', 'fg_pct', 'fg_pct_40_49', 'fg_pct_50p']],
      ['Model', ['fgoe', 'fgoe_pct']],
      ['Extra points', ['pat_pct']],
      ['Fantasy', ['fantasy_ppg']]
    ],
    sort: 'fg_made',
    qualifier: 'fg_pct'
  },
  {
    id: 'P',
    label: 'P',
    entity: 'player',
    positions: ['P'],
    groups: [
      [
        'Punting',
        ['punts', 'punt_avg', 'punt_net_avg', 'punt_in20_rate', 'punt_tb_rate', 'punter_epa']
      ]
    ],
    sort: 'punt_net_avg',
    qualifier: 'punt_net_avg'
  },
  {
    id: 'DL',
    label: 'DL',
    entity: 'player',
    positions: ['DL'],
    groups: [
      ['Pass rush', ['sacks', 'qb_hits', 'pressures', 'pressure_rate']],
      ['Run defense', ['tackles', 'tfl', 'def_stuffs']],
      ['Playmaking', ['forced_fumbles', 'pass_defended']],
      ['Usage', ['def_snaps', 'def_snap_share']]
    ],
    sort: 'sacks',
    qualifier: 'def_snap_share'
  },
  {
    id: 'LB',
    label: 'LB',
    entity: 'player',
    positions: ['LB'],
    groups: [
      ['Tackling', ['tackles', 'solo_tackles', 'tfl', 'def_stuffs', 'missed_tackle_pct']],
      ['Pass rush', ['sacks', 'pressures']],
      ['Coverage', ['coverage_targets', 'coverage_cmp_pct', 'coverage_ypt', 'coverage_rating']],
      ['Usage', ['def_snap_share']]
    ],
    sort: 'tackles',
    qualifier: 'def_snap_share'
  },
  {
    id: 'DB',
    label: 'DB',
    entity: 'player',
    positions: ['DB'],
    groups: [
      [
        'Coverage',
        ['coverage_targets', 'coverage_cmp_pct', 'coverage_ypt', 'coverage_rating', 'coverage_td']
      ],
      ['Ball', ['def_ints', 'pass_defended']],
      ['Tackling', ['tackles', 'missed_tackle_pct']],
      ['Usage', ['def_snap_share']]
    ],
    sort: 'pass_defended',
    qualifier: 'def_snap_share'
  }
]

/** Spec §9.2 teams' tabs. */
export const TEAM_TABS: TabDef[] = [
  {
    id: 'offense',
    label: 'Offense',
    entity: 'team',
    sides: ['offense', 'special'],
    groups: [
      ['Record', ['wins', 'losses', 'points_for', 'point_diff']],
      [
        'Efficiency',
        [
          'off_epa_play',
          'off_pass_epa',
          'off_rush_epa',
          'off_success_rate',
          'adj_off_epa',
          'points_per_drive'
        ]
      ],
      ['Tendencies', ['proe', 'neutral_pass_rate', 'neutral_pace']]
    ],
    sort: 'off_epa_play'
  },
  {
    id: 'defense',
    label: 'Defense',
    entity: 'team',
    sides: ['defense'],
    groups: [
      ['Record', ['points_against']],
      [
        'Efficiency',
        [
          'def_epa_play',
          'def_pass_epa',
          'def_rush_epa',
          'def_success_rate',
          'adj_def_epa',
          'def_points_per_drive'
        ]
      ],
      ['Pass rush', ['def_sack_rate', 'def_pressure_rate']],
      ['Takeaways', ['def_turnovers']],
      ['Fantasy allowed', ['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te']]
    ],
    sort: 'def_epa_play'
  },
  {
    id: 'forecast',
    label: 'Ratings & odds',
    entity: 'team',
    groups: [
      ['Ratings', ['elo', 'srs', 'adj_net_epa']],
      ['Season', ['wins', 'losses', 'proj_wins', 'playoff_pct', 'division_pct', 'sb_pct']],
      ['Luck', ['pythag_wins', 'luck_wins', 'turnover_luck']],
      ['Schedule', ['sos_elo', 'sos_left_elo']]
    ],
    sort: 'elo'
  }
]

export function tabsOf(entity: Entity): TabDef[] {
  return entity === 'player' ? PLAYER_TABS : TEAM_TABS
}

export function tabOf(entity: Entity, id: string): TabDef {
  const tabs = tabsOf(entity)
  return tabs.find((t) => t.id === id) ?? tabs[0]
}

/** At most 40 metrics a query (spec §7). */
export const MAX_COLUMNS = 40

/** Rows a leaderboard asks for: the engine's cap. Search and the owner filters work on them. */
export const ROW_LIMIT = 1000

/** The default sort of a metric: best first. */
export function bestFirst(info: MetricInfo | undefined): 'asc' | 'desc' {
  return info?.direction === 'lower' ? 'asc' : 'desc'
}

export function defaultBoard(
  entity: Entity,
  tabId: string,
  catalogue: ReadonlyMap<string, MetricInfo>
): LeaderboardBoard {
  const tab = tabOf(entity, tabId)
  return {
    entity,
    tab: tab.id,
    columns: tab.groups.flatMap(([, ids]) => ids).filter((id) => catalogue.has(id)),
    sort: { by: tab.sort, dir: bestFirst(catalogue.get(tab.sort)) },
    perGame: false,
    qualifiedOnly: true,
    team: null,
    owner: 'all'
  }
}

const FAMILIES: MetricFamily[] = ['traditional', 'advanced', 'ngs', 'charting', 'predictive']

/** The games column is the row's own (a count of games per game would read 1). */
const GAMES = new Set(['games', 'games_played'])

/** Whether a metric belongs on a tab: its positions meet the tab's, or it is a team metric. */
export function appliesTo(info: MetricInfo, tab: TabDef): boolean {
  if (info.entity !== tab.entity || info.tier === 'stored' || GAMES.has(info.id)) return false
  if (tab.entity === 'team') return true
  return info.positions === 'all' || info.positions.some((p) => tab.positions?.includes(p))
}

/**
 * What the column picker offers on a tab (spec §9.2, tiers core and extended): the tab's own unit
 * first for teams, then by family and label.
 */
export function pickable(catalogue: readonly MetricInfo[], tab: TabDef): MetricInfo[] {
  const own = (m: MetricInfo): number =>
    tab.sides && m.side && !tab.sides.includes(m.side) ? 1 : 0
  return catalogue
    .filter((m) => appliesTo(m, tab))
    .sort(
      (a, b) =>
        own(a) - own(b) ||
        FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family) ||
        a.label.localeCompare(b.label)
    )
}

/** A family's metrics on a tab (its unit's, for teams), core first; extended fill in up to 12. */
function familyMetrics(
  catalogue: readonly MetricInfo[],
  tab: TabDef,
  family: MetricFamily
): string[] {
  const of = pickable(catalogue, tab).filter(
    (m) => m.family === family && (!tab.sides || !m.side || tab.sides.includes(m.side))
  )
  const core = of.filter((m) => m.tier === 'core')
  const fill = of.filter((m) => m.tier !== 'core').slice(0, Math.max(0, 12 - core.length))
  return [...core, ...fill].map((m) => m.id)
}

/** The families a tab has metrics of, for the family filter. */
export function familiesOf(catalogue: readonly MetricInfo[], tab: TabDef): MetricFamily[] {
  return FAMILIES.filter((f) => familyMetrics(catalogue, tab, f).length > 0)
}

/** Spec §9.2 family filter: one family's metrics on the tab. */
export function familyColumns(
  catalogue: readonly MetricInfo[],
  tab: TabDef,
  family: MetricFamily
): string[] {
  return familyMetrics(catalogue, tab, family).slice(0, MAX_COLUMNS)
}

/** The header groups over the columns: the tab's group names, a family for an added column. */
export function columnGroups(
  columns: readonly string[],
  tab: TabDef,
  catalogue: ReadonlyMap<string, MetricInfo>
): { label: string; span: number }[] {
  const named = new Map(tab.groups.flatMap(([label, ids]) => ids.map((id) => [id, label] as const)))
  const out: { label: string; span: number }[] = []
  for (const id of columns) {
    const info = catalogue.get(id)
    const label = named.get(id) ?? (info ? familyLabel(info.family) : '')
    const last = out[out.length - 1]
    if (last && last.label === label) last.span++
    else out.push({ label, span: 1 })
  }
  return out
}

/** The sort a board's query asks the engine for: its column, or the tab's (by name: the first). */
export function engineSort(
  board: LeaderboardBoard,
  catalogue: ReadonlyMap<string, MetricInfo>
): { metric: string; dir: 'asc' | 'desc' } {
  if (board.sort.by !== 'name' && board.columns.includes(board.sort.by))
    return { metric: board.sort.by, dir: board.sort.dir }
  const tab = tabOf(board.entity, board.tab)
  const metric = board.columns.includes(tab.sort) ? tab.sort : board.columns[0]
  return { metric, dir: bestFirst(catalogue.get(metric)) }
}

/**
 * A board the catalogue can answer: a saved view may name metrics it no longer has. Unknown
 * columns are dropped (the tab's defaults if none is left), and a sort on a dropped column falls
 * back to the engine's. Before the catalogue loads, the board is left as it is.
 */
export function normalizeBoard(
  board: LeaderboardBoard,
  catalogue: ReadonlyMap<string, MetricInfo>
): LeaderboardBoard {
  if (catalogue.size === 0) return board
  const kept = board.columns.filter((id) => catalogue.has(id))
  if (kept.length === board.columns.length) return board
  const columns = kept.length > 0 ? kept : defaultBoard(board.entity, board.tab, catalogue).columns
  const next = { ...board, columns }
  if (next.sort.by === 'name' || columns.includes(next.sort.by)) return next
  const { metric, dir } = engineSort(next, catalogue)
  return { ...next, sort: { by: metric, dir } }
}

export function leaderboardQuery(
  board: LeaderboardBoard,
  scope: StatsScope,
  status: StatsStatus | null,
  catalogue: ReadonlyMap<string, MetricInfo>
): StatsQuery {
  const fixed = normalizeBoard(board, catalogue)
  const tab = tabOf(fixed.entity, fixed.tab)
  const columns = fixed.columns
  const extra = tab.qualifier && !columns.includes(tab.qualifier) ? [tab.qualifier] : []
  // Qualification is the tab's (see `qualifies`), so the engine returns every row.
  return {
    entity: board.entity,
    metrics: [...columns, ...extra],
    scope: {
      ...queryScope(scope, status),
      ...(tab.positions ? { positions: tab.positions } : {}),
      ...(board.team ? { teams: [board.team] } : {})
    },
    transform: board.perGame ? 'perGame' : 'raw',
    sort: engineSort(fixed, catalogue),
    scoring: scope.scoring,
    limit: ROW_LIMIT
  }
}

/** A row qualifies when its sample of the tab's qualifier is large enough (teams always do). */
export function qualifies(row: StatsRow, tab: TabDef): boolean {
  return !tab.qualifier || row.values[tab.qualifier]?.qualified === true
}

/**
 * Percentiles and ranks among the rows the tab qualifies, per position, as the engine computes
 * them (`percent_rank`, `rank`). The engine ranks a count among every row with a game, since a
 * count's sample has no minimum; the table shows the qualified rows, so it ranks among those.
 * Rows outside the tab's qualifier, or below a metric's own sample, get none. Teams keep the
 * engine's (every team qualifies).
 */
export function rankWithinTab(result: StatsResult, tab: TabDef): StatsResult {
  if (!tab.qualifier) return result
  const pools = new Map<string, number[]>()
  const key = (position: string | null, metric: string): string => `${position}|${metric}`
  const ranked = (r: StatsRow, metric: string): number | null => {
    const v = r.values[metric]
    return qualifies(r, tab) && v?.qualified && v.value !== null ? v.value : null
  }
  for (const r of result.rows) {
    for (const c of result.columns) {
      const v = ranked(r, c.id)
      if (v === null) continue
      const k = key(r.position, c.id)
      pools.set(k, [...(pools.get(k) ?? []), v])
    }
  }
  const lower = new Map(result.columns.map((c) => [c.id, c.direction === 'lower']))
  return {
    ...result,
    rows: result.rows.map((r) => ({
      ...r,
      values: Object.fromEntries(
        Object.entries(r.values).map(([id, v]) => {
          const x = ranked(r, id)
          const pool = pools.get(key(r.position, id))
          if (x === null || !pool) return [id, { ...v, percentile: null, rank: null }]
          const down = lower.get(id) ?? false
          const worse = pool.filter((y) => (down ? y > x : y < x)).length
          const better = pool.filter((y) => (down ? y < x : y > x)).length
          const percentile = pool.length > 1 ? (100 * worse) / (pool.length - 1) : 0
          return [id, { ...v, percentile, rank: better + 1 }]
        })
      )
    }))
  }
}

/** "Brown" finds "A.J. Brown" and "Amon-Ra St. Brown". */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
}

/**
 * The owner of a row in my league, if anyone rosters it. A fantasy team rosters a defense, so a
 * team is marked on the Defense tab only.
 */
export function ownerOf(
  row: Pick<StatsRow, 'id'>,
  board: Pick<LeaderboardBoard, 'entity' | 'tab'>,
  ownership: StatsOwnership | null
): { name: string; mine: boolean } | null {
  if (!ownership) return null
  if (board.entity === 'player') return ownership.players[row.id] ?? null
  return board.tab === 'defense' ? (ownership.teams[row.id] ?? null) : null
}

/**
 * The rows a leaderboard shows: the engine's, qualified ones only when asked, filtered by the
 * search and (with a league) my team or the free agents, sorted by name when asked.
 */
export function leaderRows(
  result: StatsResult,
  board: LeaderboardBoard,
  ownership: StatsOwnership | null,
  search: string
): StatsRow[] {
  const needle = searchKey(search.trim())
  const tab = tabOf(board.entity, board.tab)
  const rows = result.rows.filter((r) => {
    if (board.qualifiedOnly && !qualifies(r, tab)) return false
    if (needle && !searchKey(r.name).includes(needle)) return false
    if (!ownership || board.owner === 'all') return true
    const owner = ownerOf(r, board, ownership)
    return board.owner === 'mine' ? owner?.mine === true : owner === null
  })
  if (board.sort.by !== 'name') return rows
  const dir = board.sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => a.name.localeCompare(b.name) * dir)
}

const csvCell = (v: string | number | null): string => {
  if (v === null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/**
 * Spec §9.2 CSV export of the table as shown: numbers unformatted (percentages in percent), the
 * rank, identity and games first.
 */
export function leaderboardCsv(
  rows: readonly StatsRow[],
  board: LeaderboardBoard,
  catalogue: ReadonlyMap<string, MetricInfo>
): string {
  const infos = board.columns.map((id) => catalogue.get(id))
  const player = board.entity === 'player'
  const head = [
    'Rank',
    player ? 'Player' : 'Team',
    ...(player ? ['Team', 'Position', 'gsis_id'] : []),
    'Games',
    ...infos.map((m, i) => {
      if (!m) return board.columns[i]
      const per = board.perGame && m.kind === 'count' ? ' per game' : ''
      return `${m.label}${per}${m.unit === 'pct' ? ' (%)' : ''}`
    })
  ]
  const lines = rows.map((r, i) => [
    i + 1,
    r.name,
    ...(player ? [r.team, r.position, r.id] : []),
    r.games,
    ...board.columns.map((id, j) => {
      const v = r.values[id]?.value ?? null
      if (v === null) return null
      const m = infos[j]
      const shown = m?.unit === 'pct' ? v * 100 : v
      return Number(shown.toFixed((m?.decimals ?? 2) + 2))
    })
  ])
  return [head, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** "stats-2026-wr-weeks-1-6.csv". */
export function csvFileName(board: LeaderboardBoard, scope: StatsScope, range: string): string {
  const slug = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  const tab = tabOf(board.entity, board.tab)
  return `stats-${scope.season}-${slug(board.entity === 'team' ? `teams ${tab.label}` : tab.label)}-${slug(range)}.csv`
}
