import type { PlayerDetail } from '@shared/types'
import type {
  GameForecast,
  MetricInfo,
  PlayerBio,
  PlayerOutlook,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'
import { teamAbbr } from '@shared/stats/nflTeams'
import { fmtStat, heatOf, ordinal, reliabilityOf, type Heat } from './format'
import { qualifies, rankWithinTab, searchKey, tabOf, type TabDef } from './leaderboard'
import {
  queryScope,
  rangeLabel,
  regularWeeks,
  SCORING_LABELS,
  weeksOf,
  type StatsScope
} from './scope'
import {
  roundOf,
  statLine,
  teamGames,
  type SectionView,
  type StatLine,
  type TeamGame
} from './team'

/** Spec §9.4: the rail's positions, defenders included. */
export const RAIL_POSITIONS: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'DL', 'LB', 'DB']

/** nflverse positions by group: a player's group when he has no rows in scope. */
const GROUP_OF: Record<string, PositionGroup> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  HB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  P: 'P',
  DE: 'DL',
  DT: 'DL',
  NT: 'DL',
  DL: 'DL',
  OLB: 'LB',
  ILB: 'LB',
  MLB: 'LB',
  LB: 'LB',
  CB: 'DB',
  S: 'DB',
  FS: 'DB',
  SS: 'DB',
  SAF: 'DB',
  DB: 'DB',
  T: 'OL',
  G: 'OL',
  C: 'OL',
  OT: 'OL',
  OG: 'OL',
  OL: 'OL'
}

export function positionGroup(position: string | null): PositionGroup | null {
  return position ? (GROUP_OF[position] ?? null) : null
}

/** The dashboards by position group (spec §9.4): WR and TE share one, so do the defenders. */
export type PlayerKind = 'QB' | 'RB' | 'REC' | 'K' | 'P' | 'DEF' | 'OTHER'

export function kindOf(position: PositionGroup | null): PlayerKind {
  switch (position) {
    case 'QB':
    case 'RB':
    case 'K':
    case 'P':
      return position
    case 'WR':
    case 'TE':
      return 'REC'
    case 'DL':
    case 'LB':
    case 'DB':
      return 'DEF'
    default:
      return 'OTHER'
  }
}

/** Fantasy points exist for these (spec §9.4 header: fantasy rank under the scoring). */
const FANTASY: PlayerKind[] = ['QB', 'RB', 'REC', 'K']
/** Expected points, the Forecast and its outlook: offense only. */
const OFFENSE: PlayerKind[] = ['QB', 'RB', 'REC']

/** A position the fantasy side scores (spec §13: no IDP), so a player there has a Fantasy file. */
export function inFantasy(position: PositionGroup | null): boolean {
  return FANTASY.includes(kindOf(position))
}

export type PlayerTab =
  | 'overview'
  | 'passing'
  | 'pressure'
  | 'rushing'
  | 'usage'
  | 'receiving'
  | 'vsCoverage'
  | 'kicking'
  | 'punting'
  | 'passRush'
  | 'coverage'
  | 'tackling'
  | 'log'
  | 'splits'
  | 'forecast'
  | 'profile'

const TAB_LABELS: Record<PlayerTab, string> = {
  overview: 'Overview',
  passing: 'Passing',
  pressure: 'Under pressure',
  rushing: 'Rushing',
  usage: 'Usage',
  receiving: 'Receiving',
  vsCoverage: 'vs Coverage',
  kicking: 'Kicking',
  punting: 'Punting',
  passRush: 'Pass rush',
  coverage: 'Coverage',
  tackling: 'Run defense & tackling',
  log: 'Game log',
  splits: 'Splits',
  forecast: 'Forecast',
  profile: 'Profile'
}

/** Spec §9.4's tabs by position group. */
const KIND_TABS: Record<PlayerKind, PlayerTab[]> = {
  QB: ['overview', 'passing', 'pressure', 'rushing', 'log', 'splits', 'forecast', 'profile'],
  RB: ['overview', 'usage', 'rushing', 'receiving', 'log', 'splits', 'forecast', 'profile'],
  REC: ['overview', 'usage', 'receiving', 'vsCoverage', 'log', 'splits', 'forecast', 'profile'],
  K: ['overview', 'kicking', 'log', 'profile'],
  P: ['overview', 'punting', 'log', 'profile'],
  DEF: ['overview', 'passRush', 'coverage', 'tackling', 'log', 'splits', 'profile'],
  OTHER: ['overview', 'log', 'profile']
}

export function playerTabs(position: PositionGroup | null): { id: PlayerTab; label: string }[] {
  return KIND_TABS[kindOf(position)].map((id) => ({ id, label: TAB_LABELS[id] }))
}

/** The tab to show for a player: the one chosen, if his position has it. */
export function tabFor(tab: PlayerTab, position: PositionGroup | null): PlayerTab {
  return KIND_TABS[kindOf(position)].includes(tab) ? tab : 'overview'
}

/** Play-grain and game splits a player's lines and the Splits tab read. */
export type PlayerSplitKey =
  | 'all'
  | 'home'
  | 'away'
  | 'last4'
  | 'quarter'
  | 'down'
  | 'redzone'
  | 'leading'
  | 'close'
  | 'trailing'
  | 'pressured'
  | 'clean'
  | 'blitz'
  | 'noBlitz'
  | 'playAction'
  | 'noPlayAction'
  | 'coverage'
  | 'man'
  | 'zone'

interface SplitDef {
  label: string
  scope?: Partial<StatsQuery['scope']>
  situation?: StatsQuery['situation']
  /** One query, one row per value (quarters, downs, man and zone). */
  groupBy?: 'quarter' | 'down' | 'coverage'
}

export const PLAYER_SPLITS: Record<PlayerSplitKey, SplitDef> = {
  all: { label: 'All plays' },
  home: { label: 'Home', scope: { home: true } },
  away: { label: 'Away', scope: { home: false } },
  last4: { label: 'Last 4 games', scope: { lastNGames: 4 } },
  quarter: { label: 'By quarter', groupBy: 'quarter' },
  down: { label: 'By down', groupBy: 'down' },
  redzone: { label: 'Red zone', situation: { fieldZone: 'redzone' } },
  leading: { label: 'Leading by 9+', situation: { scoreMargin: [9, 99] } },
  close: { label: 'Within 8', situation: { scoreMargin: [-8, 8] } },
  trailing: { label: 'Trailing by 9+', situation: { scoreMargin: [-99, -9] } },
  pressured: { label: 'Pressured', situation: { pressure: true } },
  clean: { label: 'Clean pocket', situation: { pressure: false } },
  blitz: { label: 'Blitzed', situation: { blitz: true } },
  noBlitz: { label: 'Not blitzed', situation: { blitz: false } },
  playAction: { label: 'Play action', situation: { playAction: true } },
  noPlayAction: { label: 'No play action', situation: { playAction: false } },
  coverage: { label: 'By coverage', groupBy: 'coverage' },
  man: { label: 'vs Man', situation: { coverage: 'man' } },
  zone: { label: 'vs Zone', situation: { coverage: 'zone' } }
}

/** The source a split's plays are picked by: participation, or FTN charting. */
const SPLIT_SOURCE: Partial<Record<PlayerSplitKey, 'participation' | 'ftn'>> = {
  pressured: 'participation',
  clean: 'participation',
  coverage: 'participation',
  man: 'participation',
  zone: 'participation',
  blitz: 'ftn',
  noBlitz: 'ftn',
  playAction: 'ftn',
  noPlayAction: 'ftn'
}
/** FTN charting's first season. */
const FTN_FIRST = 2022

export interface PlayerLineDef {
  metric: string
  split?: PlayerSplitKey
  label?: string
}

export interface PlayerSectionDef {
  title: string
  /** A caveat under the title (coverage of the data). */
  note?: string
  lines: PlayerLineDef[]
}

const plain = (...ids: string[]): PlayerLineDef[] => ids.map((metric) => ({ metric }))
const at = (split: PlayerSplitKey, metric: string, label: string): PlayerLineDef => ({
  metric,
  split,
  label
})

const PARTICIPATION = 'Participation data: published after each season.'
const CHARTED = 'FTN charting, from 2022.'

/** Spec §9.4: each stat tab's sections, by position group. */
export const PLAYER_SECTIONS: Partial<
  Record<PlayerTab, Partial<Record<PlayerKind, PlayerSectionDef[]>>>
> = {
  passing: {
    QB: [
      {
        title: 'Volume',
        lines: plain('pass_att', 'pass_cmp', 'pass_yds', 'pass_td', 'pass_int', 'sacks_taken')
      },
      {
        title: 'Efficiency',
        lines: plain(
          'qb_epa_db',
          'qb_success',
          'cpoe',
          'epa_cpoe_composite',
          'pass_anya',
          'pass_nya',
          'passer_rating',
          'qbr'
        )
      },
      {
        title: 'Accuracy and decisions',
        lines: plain(
          'pass_cmp_pct',
          'xcmp_pct',
          'bad_throw_pct',
          'int_worthy_rate',
          'pass_td_rate',
          'pass_int_rate'
        )
      },
      {
        title: 'Style',
        lines: plain(
          'pass_adot',
          'air_to_sticks',
          'time_to_throw',
          'aggressiveness',
          'deep_rate',
          'deep_epa',
          'play_action_rate',
          'play_action_epa'
        )
      }
    ]
  },
  pressure: {
    QB: [
      {
        title: 'How often',
        lines: plain('qb_pressured_pct', 'qb_pressure_pfr', 'sack_rate', 'p2s_rate', 'sacks_taken')
      },
      {
        title: 'Pressured and clean',
        note: PARTICIPATION,
        lines: [
          ...plain('pressured_epa', 'clean_epa'),
          at('pressured', 'qb_success', 'Success rate when pressured'),
          at('clean', 'qb_success', 'Success rate from a clean pocket'),
          at('pressured', 'cpoe', 'CPOE when pressured'),
          at('clean', 'cpoe', 'CPOE from a clean pocket')
        ]
      },
      {
        title: 'Against the blitz',
        note: CHARTED,
        lines: [
          ...plain('blitz_epa'),
          at('noBlitz', 'qb_epa_db', 'EPA per dropback, not blitzed'),
          at('blitz', 'qb_success', 'Success rate vs the blitz'),
          at('noBlitz', 'qb_success', 'Success rate, not blitzed'),
          at('blitz', 'cpoe', 'CPOE vs the blitz')
        ]
      },
      { title: 'Pocket', lines: plain('time_to_throw', 'bad_throw_pct') }
    ]
  },
  rushing: {
    QB: [
      { title: 'Production', lines: plain('carries', 'rush_yds', 'rush_td', 'rush_ypc') },
      {
        title: 'Runs',
        lines: plain('designed_runs', 'scrambles', 'scramble_yds', 'rush_epa', 'rush_success')
      },
      { title: 'Near the goal line', lines: plain('rz_carries', 'i10_carries', 'i5_carries') }
    ],
    RB: [
      { title: 'Production', lines: plain('carries', 'rush_yds', 'rush_td', 'rush_ypc') },
      {
        title: 'Efficiency',
        lines: plain(
          'rush_epa',
          'rush_success',
          'ryoe',
          'ryoe_att',
          'rush_pct_over_expected',
          'explosive_run_rate',
          'breakaway_pct',
          'stuff_rate'
        )
      },
      {
        title: 'Contact and fronts',
        lines: plain('ybc_att', 'yac_att', 'broken_tackles_touch', 'box8_rate')
      },
      { title: 'Near the goal line', lines: plain('rz_carries', 'i10_carries', 'i5_carries') }
    ]
  },
  usage: {
    RB: [
      {
        title: 'Shares',
        lines: plain(
          'snap_share',
          'carry_share',
          'opportunity_share',
          'target_share',
          'route_participation',
          'rz_opportunity_share'
        )
      },
      {
        title: 'Volume',
        lines: plain('touches', 'high_value_touches', 'weighted_opportunities', 'routes')
      }
    ],
    REC: [
      {
        title: 'Shares',
        lines: plain(
          'snap_share',
          'route_participation',
          'target_share',
          'air_yards_share',
          'wopr',
          'rz_opportunity_share'
        )
      },
      {
        title: 'Looks',
        lines: plain('routes', 'targets', 'rec_adot', 'ez_targets', 'i10_targets')
      }
    ]
  },
  receiving: {
    RB: [
      {
        title: 'Production',
        lines: plain('targets', 'receptions', 'rec_yds', 'rec_td', 'catch_rate', 'rec_ypr')
      },
      {
        title: 'Efficiency',
        lines: plain('yprr', 'tprr', 'rec_epa', 'yac_rec', 'yacoe', 'broken_tackles_touch')
      },
      { title: 'Hands', note: CHARTED, lines: plain('drops', 'drop_rate', 'catchable_pct') }
    ],
    REC: [
      {
        title: 'Production',
        lines: plain(
          'targets',
          'receptions',
          'rec_yds',
          'rec_td',
          'catch_rate',
          'rec_ypr',
          'rec_ypt'
        )
      },
      {
        title: 'Efficiency',
        lines: plain('yprr', 'tprr', 'fd_per_route', 'racr', 'rec_epa')
      },
      {
        title: 'After the catch',
        lines: plain('yac_rec', 'yacoe', 'broken_tackles_touch')
      },
      {
        title: 'Hands',
        note: CHARTED,
        lines: plain(
          'drops',
          'drop_rate',
          'catchable_pct',
          'contested_targets',
          'contested_catch_rate'
        )
      }
    ]
  },
  vsCoverage: {
    REC: [
      {
        title: 'Man and zone',
        note: PARTICIPATION,
        lines: [
          ...plain('tprr_man', 'tprr_zone', 'yprr_man', 'yprr_zone'),
          at('man', 'rec_epa', 'EPA per target vs man'),
          at('zone', 'rec_epa', 'EPA per target vs zone'),
          at('man', 'catch_rate', 'Catch rate vs man'),
          at('zone', 'catch_rate', 'Catch rate vs zone')
        ]
      },
      { title: 'Getting open', note: 'Next Gen Stats.', lines: plain('separation', 'cushion') },
      {
        title: 'Contested',
        note: CHARTED,
        lines: plain('contested_targets', 'contested_catch_rate', 'catchable_pct')
      }
    ]
  },
  kicking: {
    K: [
      {
        title: 'Field goals',
        lines: plain(
          'fg_made',
          'fg_att',
          'fg_pct',
          'fg_pct_0_39',
          'fg_pct_40_49',
          'fg_pct_50p',
          'fg_made_50p'
        )
      },
      {
        title: 'Against the model',
        lines: plain('fgoe', 'fgoe_pct', 'fg_expected_pct', 'kicker_epa')
      },
      { title: 'Extra points and kickoffs', lines: plain('pat_pct', 'kickoff_tb_pct') }
    ]
  },
  punting: {
    P: [
      {
        title: 'Punting',
        lines: plain(
          'punts',
          'punt_avg',
          'punt_net_avg',
          'punt_in20_rate',
          'punt_tb_rate',
          'punter_epa'
        )
      }
    ]
  },
  passRush: {
    DEF: [
      {
        title: 'Pass rush',
        lines: plain('pressures', 'sacks', 'qb_hits', 'hurries', 'pressure_rate', 'blitz_rate')
      }
    ]
  },
  coverage: {
    DEF: [
      {
        title: 'In coverage',
        note: 'Pro Football Reference charting: the defender a pass was thrown at.',
        lines: plain(
          'coverage_targets',
          'coverage_cmp_pct',
          'coverage_ypt',
          'coverage_rating',
          'coverage_adot',
          'coverage_yac',
          'coverage_td',
          'coverage_int'
        )
      },
      { title: 'On the ball', lines: plain('pass_defended', 'def_ints') }
    ]
  },
  tackling: {
    DEF: [
      {
        title: 'Tackling',
        lines: plain(
          'tackles',
          'solo_tackles',
          'assisted_tackles',
          'missed_tackle_pct',
          'tackle_depth'
        )
      },
      { title: 'Run defense', lines: plain('tfl', 'def_stuffs') },
      {
        title: 'Playmaking',
        lines: plain('forced_fumbles', 'fumble_recoveries', 'def_tds')
      },
      {
        title: 'Snaps',
        lines: plain('def_snaps', 'def_snap_share', 'on_field_def_epa')
      }
    ]
  }
}

/** Overview (spec §9.4): the handoff's four tiles, then 6–8 core metrics with percentiles. */
export const TILES: Record<PositionGroup, string[]> = {
  QB: ['pass_yds', 'pass_td', 'pass_ypa', 'fantasy_ppg'],
  RB: ['rush_yds', 'rush_ypc', 'touches', 'fantasy_ppg'],
  WR: ['rec_yds', 'target_share', 'rec_ypt', 'fantasy_ppg'],
  TE: ['rec_yds', 'target_share', 'rec_ypt', 'fantasy_ppg'],
  K: ['fg_made', 'fg_pct', 'fg_pct_50p', 'fantasy_ppg'],
  P: ['punt_net_avg', 'punt_avg', 'punt_in20_rate', 'punter_epa'],
  DL: ['sacks', 'pressures', 'qb_hits', 'tackles'],
  LB: ['tackles', 'tfl', 'sacks', 'pass_defended'],
  DB: ['def_ints', 'pass_defended', 'coverage_rating', 'tackles'],
  OL: ['snap_share', 'off_snaps', 'fumbles_lost', 'penalties']
}

const RECEIVER_CORE = [
  'target_share',
  'air_yards_share',
  'wopr',
  'route_participation',
  'yprr',
  'tprr',
  'separation',
  'fpoe'
]

export const CORE_METRICS: Record<PositionGroup, string[]> = {
  QB: [
    'qb_epa_db',
    'cpoe',
    'qb_success',
    'epa_cpoe_composite',
    'pass_anya',
    'qbr',
    'pass_adot',
    'fpoe'
  ],
  RB: [
    'snap_share',
    'carry_share',
    'opportunity_share',
    'high_value_touches',
    'rush_ypc',
    'ryoe_att',
    'target_share',
    'fpoe'
  ],
  WR: RECEIVER_CORE,
  TE: RECEIVER_CORE,
  K: ['fg_pct', 'fgoe', 'fgoe_pct', 'fg_pct_50p', 'pat_pct', 'kicker_epa'],
  P: ['punt_net_avg', 'punt_in20_rate', 'punter_epa', 'punt_avg', 'punt_tb_rate'],
  DL: ['pressures', 'sacks', 'qb_hits', 'tfl', 'def_stuffs', 'missed_tackle_pct', 'def_snap_share'],
  LB: [
    'tackles',
    'tfl',
    'def_stuffs',
    'missed_tackle_pct',
    'pressures',
    'coverage_rating',
    'def_snap_share'
  ],
  DB: [
    'coverage_ypt',
    'coverage_cmp_pct',
    'coverage_rating',
    'pass_defended',
    'def_ints',
    'missed_tackle_pct',
    'def_snap_share'
  ],
  OL: ['snap_share', 'on_field_epa']
}

/** Whether a metric is about this position (spec §6.1 `positions`). */
export function appliesToPosition(info: MetricInfo | undefined, position: PositionGroup): boolean {
  return !!info && (info.positions === 'all' || info.positions.includes(position))
}

/** The sections a tab shows for a position: lines about other positions dropped, empty sections too. */
export function sectionsFor(
  tab: PlayerTab,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): PlayerSectionDef[] {
  const defs = PLAYER_SECTIONS[tab]?.[kindOf(position)] ?? []
  return defs
    .map((s) => ({
      ...s,
      lines: s.lines.filter((l) => appliesToPosition(byId.get(l.metric), position))
    }))
    .filter((s) => s.lines.length > 0)
}

/** Overview: the core metrics as one section, the tiles riding in the same query. */
export function overviewSections(
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): PlayerSectionDef[] {
  const lines = CORE_METRICS[position]
    .filter((id) => appliesToPosition(byId.get(id), position))
    .map((metric) => ({ metric }))
  return lines.length ? [{ title: 'Percentile rankings', lines }] : []
}

/** The leaderboard tab of a position: its qualifier decides who is ranked (spec §18 D). */
export function positionTab(position: PositionGroup): TabDef {
  return tabOf('player', position)
}

/**
 * Every player's row at a position, and in a grouped split one per quarter or down (a season of
 * DBs has about 1,500): the engine's most, so no row the ranks need is cut off.
 */
const POSITION_ROWS = 5000

/** One query over the position (a rank is among the position), under a split. */
export function positionQuery(
  metrics: string[],
  position: PositionGroup,
  split: PlayerSplitKey,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  const s = PLAYER_SPLITS[split]
  return {
    entity: 'player',
    metrics,
    scope: { ...queryScope(scope, status), positions: [position], ...s.scope },
    ...(s.situation ? { situation: s.situation } : {}),
    ...(s.groupBy ? { groupBy: [s.groupBy] } : {}),
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: POSITION_ROWS
  }
}

/**
 * The queries a set of sections needs: one per split, over the position, each metric once. The
 * position's qualifier rides along in the `all` query: it decides who is ranked in every split.
 */
export function playerSectionQueries(
  sections: readonly PlayerSectionDef[],
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null,
  extra: readonly string[] = []
): Map<PlayerSplitKey, StatsQuery> {
  const bySplit = new Map<PlayerSplitKey, string[]>()
  const add = (split: PlayerSplitKey, metric: string): void => {
    const ids = bySplit.get(split) ?? []
    if (!ids.includes(metric)) bySplit.set(split, [...ids, metric])
  }
  for (const id of extra) add('all', id)
  for (const s of sections) for (const l of s.lines) add(l.split ?? 'all', l.metric)
  const qualifier = positionTab(position).qualifier
  if (qualifier) add('all', qualifier)
  return new Map(
    [...bySplit].map(([split, metrics]) => [
      split,
      positionQuery(metrics, position, split, scope, status)
    ])
  )
}

/**
 * Who a player's lines rank among: the position's players its leaderboard qualifies (spec §18 D),
 * read from the `all` query. Each metric still needs its own sample (`statLine`).
 */
export function poolOf(all: StatsResult | undefined, position: PositionGroup): Set<string> {
  const tab = positionTab(position)
  return new Set(
    (all?.rows ?? []).filter((r) => r.position === position && qualifies(r, tab)).map((r) => r.id)
  )
}

/** Every section of a tab, ranked among the pool. */
export function playerSectionViews(
  sections: readonly PlayerSectionDef[],
  results: ReadonlyMap<PlayerSplitKey, StatsResult>,
  player: string,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): (SectionView & { note?: string })[] {
  const pool = poolOf(results.get('all'), position)
  const among = (r: StatsRow): boolean => pool.has(r.id)
  return sections.map((s) => ({
    title: s.title,
    ...(s.note ? { note: s.note } : {}),
    lines: s.lines.map((l) =>
      playerLine(results.get(l.split ?? 'all'), player, l, byId, season, among)
    )
  }))
}

/** A player's line: `statLine` keyed by split, "of 110" among his position's qualified players. */
export function playerLine(
  result: StatsResult | undefined,
  player: string,
  line: PlayerLineDef,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number,
  among: (row: StatsRow) => boolean
): StatLine {
  const l = statLine(
    result,
    player,
    { metric: line.metric, label: line.label },
    byId,
    season,
    among
  )
  const source = line.split ? SPLIT_SOURCE[line.split] : undefined
  let missing = l.missing
  if (l.missing === 'No games in this range.' && line.split && line.split !== 'all') {
    // Nobody in the split: its source has nothing for the season.
    if (source === 'ftn' && season < FTN_FIRST) missing = `Charted from ${FTN_FIRST}.`
    else if (source === 'participation' && !result?.rows.length)
      missing = `Not published for ${season} yet.`
    else missing = 'No plays in this split.'
  }
  // Others have a value and he has a row, but not this one: its source left him out (Next Gen
  // Stats and ESPN QBR publish players over their own minimums).
  if (missing === null && l.value === '—' && result?.rows.some((r) => r.id === player)) {
    const source = l.info?.sources[0]?.replace(/ \(nflverse\)$/, '') ?? 'its source'
    missing = `No ${source} value for him.`
  }
  return { ...l, key: `${line.split ?? 'all'}:${line.metric}`, missing }
}

/** "WR12": a player's place by fantasy points at his position (spec §9.4 header). */
export function fantasyRankQuery(
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery | null {
  if (!FANTASY.includes(kindOf(position))) return null
  return {
    entity: 'player',
    metrics: ['fantasy_points'],
    scope: { ...queryScope(scope, status), positions: [position] },
    sort: { metric: 'fantasy_points', dir: 'desc' },
    scoring: scope.scoring,
    limit: POSITION_ROWS
  }
}

export function fantasyRank(
  result: StatsResult | null,
  player: string,
  position: PositionGroup,
  scope: StatsScope
): string | null {
  const rows = (result?.rows ?? []).filter((r) => (r.values.fantasy_points?.value ?? null) !== null)
  const i = rows.findIndex((r) => r.id === player)
  if (i < 0) return null
  const mine = rows[i].values.fantasy_points.value!
  const rank = rows.filter((r) => r.values.fantasy_points.value! > mine).length + 1
  return `${position}${rank} in ${SCORING_LABELS[scope.scoring]}`
}

/** The header (handoff "6. Player profile", spec §9.4). */
export interface PlayerHeader {
  first: string
  last: string
  /** "#1 · Age 26 · 6th season · 2021 Round 1, pick 5 (CIN) · LSU" in parts. */
  facts: string[]
  /** "6 G · Weeks 1–6". */
  games: string
  status: { tag: string; tone: 'bad' | 'warn'; title: string } | null
}

/** Sleeper's picture of a player (the renderer's CSP allows sleepercdn.com). */
export function headshotUrl(sleeperId: string): string {
  return `https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(sleeperId)}.jpg`
}

/** "Sep 25, 1999 · age 27". */
export function bornOf(birthDate: string | null, today = new Date()): string | null {
  if (!birthDate) return null
  const day = new Date(`${birthDate}T12:00:00`)
  if (Number.isNaN(day.getTime())) return birthDate
  const date = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const age = ageOn(birthDate, today)
  return age === null ? date : `${date} · age ${age}`
}

/** Whole years between a birth date and a day. */
export function ageOn(birthDate: string | null, day: Date): number | null {
  if (!birthDate) return null
  const [y, m, d] = birthDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const had = day.getMonth() + 1 > m || (day.getMonth() + 1 === m && day.getDate() >= d)
  return day.getFullYear() - y - (had ? 0 : 1)
}

/** "6′1″, 205 lb" from inches and pounds. */
export function sizeOf(height: number | null, weight: number | null): string | null {
  const h = height ? `${Math.floor(height / 12)}′${height % 12}″` : null
  const w = weight ? `${weight} lb` : null
  return [h, w].filter(Boolean).join(', ') || null
}

export function draftOf(bio: Pick<PlayerBio, 'draft'>): string {
  const d = bio.draft
  if (!d) return 'Undrafted'
  return `${d.year} Round ${d.round}, pick ${d.pick}${d.team ? ` (${teamAbbr(d.team)})` : ''}`
}

/** A status chip (handoff tone rules): Questionable warns; Doubtful, Out and the reserve lists are bad. */
export function statusChip(status: PlayerBio['status']): PlayerHeader['status'] {
  if (!status) return null
  const injury = status.injury ? ` · ${status.injury}` : ''
  const when = `week ${status.week} report`
  if (status.reserve) {
    const tag = { IR: 'IR', PUP: 'PUP', NFI: 'NFI', Suspended: 'SUS', Reserve: 'RES' }[
      status.reserve
    ]
    const words = {
      IR: 'Injured reserve',
      PUP: 'Physically unable to perform',
      NFI: 'Non-football injury list',
      Suspended: 'Suspended',
      Reserve: 'On a reserve list'
    }[status.reserve]
    return { tag, tone: 'bad', title: `${words} (week ${status.week} roster)` }
  }
  if (status.report) {
    const tag = { Out: 'OUT', Doubtful: 'D', Questionable: 'Q' }[status.report]
    return {
      tag,
      tone: status.report === 'Questionable' ? 'warn' : 'bad',
      title: `${status.report}${injury} (${when})`
    }
  }
  if (status.practice === 'DNP' || status.practice === 'Limited') {
    const words = status.practice === 'DNP' ? 'Did not practice' : 'Limited in practice'
    return { tag: status.practice, tone: 'warn', title: `${words}${injury} (${when})` }
  }
  return null
}

/** `row`: his row in scope; null when he has none, undefined while it loads. */
export function playerHeader(
  bio: PlayerBio,
  row: StatsRow | null | undefined,
  scope: StatsScope,
  status: StatsStatus | null,
  today = new Date()
): PlayerHeader {
  const [first, ...rest] = bio.name.split(' ')
  // His age that season (on September 1); this season's, today.
  const age = ageOn(
    bio.birthDate,
    scope.season < today.getFullYear() ? new Date(scope.season, 8, 1) : today
  )
  const year = bio.rookieSeason ? scope.season - bio.rookieSeason + 1 : null
  const facts = [
    bio.jersey !== null ? `#${bio.jersey}` : null,
    age !== null ? `Age ${age}` : null,
    year === null || year < 1 ? null : year === 1 ? 'Rookie' : `${ordinal(year)} season`,
    draftOf(bio),
    bio.college,
    sizeOf(bio.height, bio.weight)
  ].filter((x): x is string => !!x)
  const range = rangeLabel(scope, status)
  // The name as he goes by (nflverse's first_name is the legal one: John for Matthew Stafford).
  return {
    first: rest.length ? first : '',
    last: rest.length ? rest.join(' ') : first,
    facts,
    games: row === undefined ? range : `${row?.games ?? 0} G · ${range}`,
    status:
      scope.season === (status?.through?.season ?? scope.season) ? statusChip(bio.status) : null
  }
}

/** A tile (handoff): the value, and its percentile among the position as a chip. */
export interface TileView {
  metric: string
  label: string
  value: string
  chip: string
  heat: 'good' | 'bad' | 'mid'
  title: string
}

export function tileViews(
  all: StatsResult | undefined,
  player: string,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): TileView[] {
  const pool = poolOf(all, position)
  return TILES[position].map((metric) => {
    const l = statLine(all, player, { metric }, byId, season, (r) => pool.has(r.id))
    const p = l.percentile
    const neutral = l.info?.direction === 'neutral'
    return {
      metric,
      label: l.label,
      value: l.value,
      chip: p === null || neutral ? '' : `${ordinal(p)} pct`,
      heat: p === null || neutral ? 'mid' : p >= 75 ? 'good' : p <= 25 ? 'bad' : 'mid',
      title: l.title
    }
  })
}

/** Spec §9.2: a rail of the position's players, ranked by a metric. */
export function railQuery(
  position: PositionGroup,
  metric: string,
  scope: StatsScope,
  status: StatsStatus | null,
  byId: ReadonlyMap<string, MetricInfo>
): StatsQuery {
  const qualifier = positionTab(position).qualifier
  const metrics = qualifier && qualifier !== metric ? [metric, qualifier] : [metric]
  return {
    entity: 'player',
    metrics,
    scope: { ...queryScope(scope, status), positions: [position] },
    transform: 'raw',
    sort: { metric, dir: byId.get(metric)?.direction === 'lower' ? 'asc' : 'desc' },
    scoring: scope.scoring,
    limit: POSITION_ROWS
  }
}

/** The rail's rank-by choices: the position's leaderboard columns. */
export function railMetrics(
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): { value: string; label: string }[] {
  const ids = positionTab(position).groups.flatMap(([, ids]) => ids)
  return ids.filter((id) => byId.has(id)).map((id) => ({ value: id, label: byId.get(id)!.label }))
}

export interface RailRow {
  id: string
  name: string
  team: string | null
  position: string | null
  /** Among the qualified, before the search narrows the list. */
  rank: number | null
  value: string
  heat: Heat
  title: string
  owner: { name: string; mine: boolean } | null
  qualified: boolean
}

/**
 * The rail (handoff profile list): the qualified players, best first, with the value as a shaded
 * chip; the player shown stays listed even below the qualifier. A search narrows the list.
 */
export function railRows(
  result: StatsResult,
  position: PositionGroup,
  metric: string,
  byId: ReadonlyMap<string, MetricInfo>,
  ownership: StatsOwnership | null,
  search: string,
  keep: string | null
): RailRow[] {
  const tab = positionTab(position)
  const ranked = rankWithinTab(result, tab)
  const info = byId.get(metric)
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const needle = searchKey(search.trim())
  let rank = 0
  return ranked.rows
    .filter((r) => r.position === position)
    .map((r): RailRow => {
      const v = r.values[metric]
      const q = qualifies(r, tab)
      if (q) rank++
      const pct = v?.percentile ?? null
      return {
        id: r.id,
        name: r.name,
        team: r.team,
        position: r.position,
        rank: q ? rank : null,
        value: fmtStat(v?.value ?? null, f),
        heat: heatOf(pct, info?.direction ?? 'neutral'),
        title: pct === null ? '' : `${ordinal(pct)} percentile among qualified ${position}s`,
        owner: ownership?.players[r.id] ?? null,
        qualified: q
      }
    })
    .filter(
      (r) => (r.qualified || r.id === keep) && (!needle || searchKey(r.name).includes(needle))
    )
}

/** The player the dashboard first opens on: my top fantasy scorer, else the rail's first WR. */
export function defaultPlayer(
  topScorer: StatsResult | null,
  leaders: StatsResult | null
): { id: string; position: PositionGroup } | null {
  for (const r of [...(topScorer?.rows ?? []), ...(leaders?.rows ?? [])]) {
    const position = positionGroup(r.position)
    if (position && RAIL_POSITIONS.includes(position)) return { id: r.id, position }
  }
  return null
}

/** The player's own rows: by week (the log, the charts) or by season (career), in one query. */
export function playerQuery(
  player: string,
  metrics: string[],
  scope: StatsScope,
  status: StatsStatus | null,
  groupBy?: StatsQuery['groupBy']
): StatsQuery {
  return {
    entity: 'player',
    metrics,
    scope: { ...queryScope(scope, status), players: [player] },
    ...(groupBy ? { groupBy } : {}),
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: 100
  }
}

/** Overview (spec §9.4): weekly fantasy points against expected points. */
export function pointsSeries(kind: PlayerKind): string[] {
  return OFFENSE.includes(kind)
    ? ['fantasy_points', 'expected_points']
    : FANTASY.includes(kind)
      ? ['fantasy_points']
      : []
}

/** A season or career line: the position's counting stats. */
export const LINE_METRICS: Record<PlayerKind, string[]> = {
  QB: [
    'pass_cmp',
    'pass_att',
    'pass_yds',
    'pass_td',
    'pass_int',
    'rush_yds',
    'rush_td',
    'fantasy_points'
  ],
  RB: ['carries', 'rush_yds', 'rush_td', 'receptions', 'rec_yds', 'rec_td', 'fantasy_points'],
  REC: ['targets', 'receptions', 'rec_yds', 'rec_td', 'rec_ypr', 'fantasy_points'],
  K: ['fg_made', 'fg_att', 'fg_pct', 'fg_made_50p', 'pat_pct', 'fantasy_points'],
  P: ['punts', 'punt_avg', 'punt_net_avg', 'punt_in20_rate'],
  DEF: ['tackles', 'tfl', 'sacks', 'qb_hits', 'pass_defended', 'def_ints', 'forced_fumbles'],
  OTHER: ['off_snaps', 'snap_share']
}

export interface LineRow {
  key: string
  label: string
  games: string
  cells: string[]
}

/** The columns of a line, short labels from the catalogue. */
export function lineHead(kind: PlayerKind, byId: ReadonlyMap<string, MetricInfo>): string[] {
  return LINE_METRICS[kind].map((id) => byId.get(id)?.short ?? id)
}

const valueOf = (
  row: StatsRow | undefined,
  id: string,
  byId: ReadonlyMap<string, MetricInfo>
): string => {
  const m = byId.get(id)
  return fmtStat(row?.values[id]?.value ?? null, {
    unit: m?.unit ?? 'number',
    decimals: m?.decimals ?? 1,
    kind: m?.kind
  })
}

/** A row of a line table: the scope's season, the career, or one season of it. */
export function lineRow(
  key: string,
  label: string,
  row: StatsRow | undefined,
  kind: PlayerKind,
  byId: ReadonlyMap<string, MetricInfo>
): LineRow {
  return {
    key,
    label,
    games: row ? String(row.games) : '—',
    cells: LINE_METRICS[kind].map((id) => valueOf(row, id, byId))
  }
}

/** Profile (spec §9.4): career by season, newest first. */
export function careerRows(
  result: StatsResult | null,
  kind: PlayerKind,
  byId: ReadonlyMap<string, MetricInfo>
): LineRow[] {
  return (result?.rows ?? [])
    .map((r) => ({ r, season: Number(r.group.season) }))
    .filter((x) => Number.isFinite(x.season))
    .sort((a, b) => b.season - a.season)
    .map(({ r, season }) =>
      lineRow(String(season), `${season}${r.team ? ` ${teamAbbr(r.team)}` : ''}`, r, kind, byId)
    )
}

export function careerQuery(
  bio: PlayerBio,
  kind: PlayerKind,
  scope: StatsScope,
  bySeason: boolean
): StatsQuery | null {
  if (bio.seasons.length === 0) return null
  const metrics = LINE_METRICS[kind]
  return {
    entity: 'player',
    metrics,
    scope: { seasons: bio.seasons, seasonType: 'REG', players: [bio.id] },
    ...(bySeason ? { groupBy: ['season' as const] } : {}),
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: 100
  }
}

/** The game log's columns by position group (handoff `LOG`, spec §9.4). */
export const LOG_COLUMNS: Record<PlayerKind, { label: string; metrics: string[] }[]> = {
  QB: [
    { label: 'C/A', metrics: ['pass_cmp', 'pass_att'] },
    { label: 'YDS', metrics: ['pass_yds'] },
    { label: 'TD', metrics: ['pass_td'] },
    { label: 'INT', metrics: ['pass_int'] },
    { label: 'SK', metrics: ['sacks_taken'] },
    { label: 'EPA/DB', metrics: ['qb_epa_db'] },
    { label: 'RUSH', metrics: ['carries', 'rush_yds'] }
  ],
  RB: [
    { label: 'SNAP', metrics: ['snap_share'] },
    { label: 'ATT', metrics: ['carries'] },
    { label: 'YDS', metrics: ['rush_yds'] },
    { label: 'Y/C', metrics: ['rush_ypc'] },
    { label: 'REC', metrics: ['receptions', 'targets'] },
    { label: 'REC YD', metrics: ['rec_yds'] },
    { label: 'TD', metrics: ['total_td'] }
  ],
  REC: [
    { label: 'SNAP', metrics: ['snap_share'] },
    { label: 'ROUTE', metrics: ['route_participation'] },
    { label: 'TGT', metrics: ['targets'] },
    { label: 'REC', metrics: ['receptions'] },
    { label: 'YDS', metrics: ['rec_yds'] },
    { label: 'TD', metrics: ['rec_td'] },
    { label: 'aDOT', metrics: ['rec_adot'] }
  ],
  K: [
    { label: 'FG', metrics: ['fg_made', 'fg_att'] },
    { label: '50+', metrics: ['fg_made_50p'] },
    { label: 'XP %', metrics: ['pat_pct'] },
    { label: 'FGOE', metrics: ['fgoe'] }
  ],
  P: [
    { label: 'PUNTS', metrics: ['punts'] },
    { label: 'AVG', metrics: ['punt_avg'] },
    { label: 'NET', metrics: ['punt_net_avg'] },
    { label: 'IN 20', metrics: ['punt_in20_rate'] },
    { label: 'EPA', metrics: ['punter_epa'] }
  ],
  DEF: [
    { label: 'SNAP', metrics: ['def_snap_share'] },
    { label: 'TKL', metrics: ['tackles'] },
    { label: 'TFL', metrics: ['tfl'] },
    { label: 'SCK', metrics: ['sacks'] },
    { label: 'QBH', metrics: ['qb_hits'] },
    { label: 'PRS', metrics: ['pressures'] },
    { label: 'PD', metrics: ['pass_defended'] },
    { label: 'INT', metrics: ['def_ints'] }
  ],
  OTHER: [
    { label: 'SNAPS', metrics: ['off_snaps'] },
    { label: 'SNAP', metrics: ['snap_share'] }
  ]
}

/** The log's metrics: its columns', then fantasy and expected points where they exist. */
export function logMetrics(kind: PlayerKind): string[] {
  const ids = LOG_COLUMNS[kind].flatMap((c) => c.metrics)
  return [...new Set([...ids, ...pointsSeries(kind)])]
}

export function gameLogQuery(
  player: string,
  kind: PlayerKind,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return playerQuery(player, logMetrics(kind), scope, status, ['week', 'opponent'])
}

export interface LogRow {
  key: string
  /** "W3", or a postseason round. */
  week: string
  /** "DET", "@ DET"; empty on a bye. */
  opponent: string
  /** "W 27–20"; null for a bye, a game not played, or one he missed. */
  score: string | null
  result: 'W' | 'L' | 'T' | null
  /** "Bye", "Did not play"; null when he played. */
  note: string | null
  cells: string[]
  points: string | null
  expected: string | null
}

/**
 * The game log (handoff "Game log", spec §9.4): one row per week of the range. A week he has no
 * row in is a bye when the team he played for nearest that week had no game, else "Did not play".
 * Results come from the season's games, from the side of the team he played for that week.
 */
export function gameLog(
  result: StatsResult | null,
  games: readonly GameForecast[] | null,
  kind: PlayerKind,
  byId: ReadonlyMap<string, MetricInfo>,
  scope: StatsScope,
  status: StatsStatus | null,
  /** His team now, for the current season: a player with no row yet (PUP) missed its games. */
  teamNow: string | null = null
): LogRow[] {
  const rows = (result?.rows ?? [])
    .map((r) => ({ r, week: Number(r.group.week) }))
    .filter((x) => Number.isFinite(x.week))
    .sort((a, b) => a.week - b.week)
  const byWeek = new Map(rows.map((x) => [x.week, x.r] as const))
  const sides = new Map<string, TeamGame[]>()
  const sideOf = (team: string): TeamGame[] => {
    if (!sides.has(team)) sides.set(team, teamGames(games ?? [], team))
    return sides.get(team)!
  }
  const label = (week: number): string =>
    week > regularWeeks(scope.season) ? roundOf(scope.season, week) : `W${week}`
  const cell = (r: StatsRow, c: { metrics: string[] }): string => {
    if (c.metrics.length === 2) {
      const [a, b] = c.metrics.map((id) => valueOf(r, id, byId))
      return c.metrics[1] === 'rush_yds' ? `${a}-${b}` : `${a}/${b}`
    }
    return valueOf(r, c.metrics[0], byId)
  }
  // The team he played for nearest a week (before it, else after): a week a source left without
  // his team, and the weeks he has no row.
  const teamNear = (week: number): string | null => {
    const known = rows.filter((x) => x.r.team !== null)
    const near = known.filter((x) => x.week <= week).at(-1) ?? known.find((x) => x.week > week)
    return near?.r.team ?? teamNow
  }
  const played = (r: StatsRow, week: number): LogRow => {
    const team = r.team ?? teamNear(week) ?? ''
    const g = sideOf(team).find((x) => x.week === week)
    const opp = String(r.group.opponent ?? g?.opponent ?? '')
    const away = g ? !g.home && !g.neutral : false
    return {
      key: `w${week}`,
      week: label(week),
      opponent: `${away ? '@ ' : ''}${teamAbbr(opp)}`,
      score: g?.played ? `${g.result} ${g.pointsFor}–${g.pointsAgainst}` : null,
      result: g?.result ?? null,
      note: null,
      cells: LOG_COLUMNS[kind].map((c) => cell(r, c)),
      points: FANTASY.includes(kind) ? valueOf(r, 'fantasy_points', byId) : null,
      expected: OFFENSE.includes(kind) ? valueOf(r, 'expected_points', byId) : null
    }
  }
  if (scope.seasonType === 'POST') return rows.map((x) => played(x.r, x.week))
  const [a, b] = weeksOf(scope, status)
  const out: LogRow[] = []
  for (let w = a; w <= b; w++) {
    const r = byWeek.get(w)
    if (r) {
      out.push(played(r, w))
      continue
    }
    const team = teamNear(w)
    const g = team ? sideOf(team).find((x) => x.week === w && x.seasonType === 'REG') : undefined
    out.push({
      key: `w${w}`,
      week: `W${w}`,
      opponent: g ? `${!g.home && !g.neutral ? '@ ' : ''}${teamAbbr(g.opponent)}` : '',
      score: null,
      result: null,
      note: g ? (g.played ? 'Did not play' : 'Not played yet') : 'Bye',
      cells: LOG_COLUMNS[kind].map(() => ''),
      points: null,
      expected: null
    })
  }
  if (scope.seasonType === 'ALL')
    out.push(...rows.filter((x) => x.week > b).map((x) => played(x.r, x.week)))
  return out
}

interface SplitGroup {
  title: string
  splits: PlayerSplitKey[]
  note?: string
}

const BASE_GROUPS: SplitGroup[] = [
  { title: 'Games', splits: ['all', 'home', 'away', 'last4'] },
  { title: 'Quarter', splits: ['quarter'] },
  { title: 'Score', splits: ['leading', 'close', 'trailing'] },
  { title: 'Down and field', splits: ['down', 'redzone'] }
]

/** Spec §9.4 Splits: the rows of the splits table, by position group. */
export const SPLIT_GROUPS: Record<PlayerKind, SplitGroup[]> = {
  QB: [
    ...BASE_GROUPS,
    { title: 'Pressure', splits: ['pressured', 'clean'], note: PARTICIPATION },
    {
      title: 'Blitz and play action',
      splits: ['blitz', 'noBlitz', 'playAction', 'noPlayAction'],
      note: CHARTED
    }
  ],
  RB: BASE_GROUPS,
  REC: [...BASE_GROUPS, { title: 'Coverage', splits: ['coverage'], note: PARTICIPATION }],
  K: [],
  P: [],
  DEF: BASE_GROUPS,
  OTHER: []
}

/**
 * The splits table's columns, by position group: metrics the plays give in every season (per-route
 * rates need participation, published after the season).
 */
export const SPLIT_METRICS: Record<PlayerKind, string[]> = {
  QB: ['qb_epa_db', 'qb_success', 'cpoe', 'pass_cmp_pct', 'pass_ypa', 'pass_td', 'pass_int'],
  RB: ['rush_yds', 'rush_ypc', 'rush_td', 'rush_epa', 'rush_success', 'targets', 'rec_yds'],
  REC: ['receptions', 'rec_yds', 'rec_td', 'catch_rate', 'rec_ypt', 'rec_epa', 'rec_adot'],
  K: [],
  P: [],
  DEF: ['tackles', 'solo_tackles', 'sacks', 'qb_hits', 'pass_defended', 'def_ints', 'def_stuffs'],
  OTHER: []
}

/**
 * The rate whose sample is a split row's plays (a count's sample is its games): dropbacks, carries,
 * targets. Defenders count games.
 */
const PLAYS_OF: Partial<Record<PlayerKind, { metric: string; label: string }>> = {
  QB: { metric: 'qb_epa_db', label: 'Dropbacks' },
  RB: { metric: 'rush_ypc', label: 'Carries' },
  REC: { metric: 'catch_rate', label: 'Targets' }
}

/** One query per split of the table, over the position; the qualifier rides in `all`. */
export function splitTableQueries(
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): Map<PlayerSplitKey, StatsQuery> {
  const kind = kindOf(position)
  const metrics = SPLIT_METRICS[kind]
  if (!metrics.length) return new Map()
  const qualifier = positionTab(position).qualifier
  return new Map(
    SPLIT_GROUPS[kind]
      .flatMap((g) => g.splits)
      .map((k) => [
        k,
        positionQuery(
          k === 'all' && qualifier && !metrics.includes(qualifier)
            ? [...metrics, qualifier]
            : metrics,
          position,
          k,
          scope,
          status
        )
      ])
  )
}

export interface SplitCell {
  value: string
  rank: string | null
  heat: Heat
  title: string
}

export interface PlayerSplitRow {
  key: string
  label: string
  /** The player's sample in the split: dropbacks, carries, targets, tackles. */
  plays: string
  cells: SplitCell[]
}

const QUARTERS = ['1st quarter', '2nd quarter', '3rd quarter', '4th quarter']
const DOWNS = ['1st down', '2nd down', '3rd down']

/**
 * The splits table (spec §9.4): one row per split (a grouped split gives a row per value), each
 * cell ranked among the position's qualified players in the same split.
 */
export function splitTable(
  results: ReadonlyMap<PlayerSplitKey, StatsResult>,
  player: string,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): { title: string; note?: string; rows: PlayerSplitRow[] }[] {
  const kind = kindOf(position)
  const metrics = SPLIT_METRICS[kind]
  const pool = poolOf(results.get('all'), position)
  const row = (key: string, label: string, r: StatsResult | undefined): PlayerSplitRow => {
    const mine = r?.rows.find((x) => x.id === player)
    const by = PLAYS_OF[kind]
    const plays = by ? mine?.values[by.metric]?.sample : mine?.games
    return {
      key,
      label,
      plays: plays == null ? '—' : fmtStat(plays, { unit: 'count', decimals: 0 }),
      cells: metrics.map((metric) => {
        const l = statLine(r, player, { metric }, byId, season, (x) => pool.has(x.id))
        return {
          value: l.value,
          rank: l.rank ? l.rank.replace(/ (of \d+|highest)$/, '') : null,
          heat: l.heat,
          title: l.title
        }
      })
    }
  }
  const sub = (
    r: StatsResult | undefined,
    dim: 'quarter' | 'down' | 'coverage',
    value: string | number
  ): StatsResult | undefined => r && { ...r, rows: r.rows.filter((x) => x.group[dim] === value) }
  return SPLIT_GROUPS[kind].map((g) => ({
    title: g.title,
    ...(g.note ? { note: g.note } : {}),
    rows: g.splits.flatMap((k): PlayerSplitRow[] => {
      const r = results.get(k)
      if (k === 'quarter')
        return QUARTERS.map((label, i) => row(`q${i + 1}`, label, sub(r, 'quarter', i + 1)))
      if (k === 'down')
        return DOWNS.map((label, i) => row(`d${i + 1}`, label, sub(r, 'down', i + 1)))
      if (k === 'coverage')
        return [
          row('man', 'vs Man', sub(r, 'coverage', 'man')),
          row('zone', 'vs Zone', sub(r, 'coverage', 'zone'))
        ]
      return [row(k, PLAYER_SPLITS[k].label, r)]
    })
  }))
}

/** The splits table's head: plays, then each metric's short label. */
export function splitHead(
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): string[] {
  const kind = kindOf(position)
  return [
    PLAYS_OF[kind]?.label ?? 'Games',
    ...SPLIT_METRICS[kind].map((id) => byId.get(id)?.short ?? id)
  ]
}

/** By opponent (spec §9.4): the player's own rows, one per opponent. */
export function opponentQuery(
  player: string,
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery | null {
  const metrics = SPLIT_METRICS[kindOf(position)]
  if (!metrics.length) return null
  return playerQuery(player, metrics, scope, status, ['opponent'])
}

export function opponentRows(
  result: StatsResult | null,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): LineRow[] {
  const metrics = SPLIT_METRICS[kindOf(position)]
  return (result?.rows ?? [])
    .filter((r) => r.group.opponent != null)
    .sort((a, b) => String(a.group.opponent).localeCompare(String(b.group.opponent)))
    .map((r) => ({
      key: String(r.group.opponent),
      label: teamAbbr(String(r.group.opponent)),
      games: String(r.games),
      cells: metrics.map((id) => valueOf(r, id, byId))
    }))
}

/** With and without a teammate on the field (participation, through the prior season). */
export function teammateQueries(
  player: string,
  teammate: string,
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): Map<'with' | 'without', StatsQuery> | null {
  const metrics = SPLIT_METRICS[kindOf(position)]
  if (!metrics.length) return null
  const base = playerQuery(player, metrics, scope, status)
  return new Map([
    ['with', { ...base, situation: { withOnField: [teammate] } }],
    ['without', { ...base, situation: { withoutOnField: [teammate] } }]
  ])
}

/** Teammates to split by: his team's players in scope with the most snaps, offense or defense. */
export function teammatesQuery(
  team: string,
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  const defense = kindOf(position) === 'DEF'
  const metric = defense ? 'def_snaps' : 'off_snaps'
  return {
    entity: 'player',
    metrics: [metric],
    scope: {
      ...queryScope(scope, status),
      teams: [team],
      positions: defense ? ['DL', 'LB', 'DB'] : ['QB', 'RB', 'WR', 'TE', 'OL']
    },
    sort: { metric, dir: 'desc' },
    limit: 30
  }
}

export function teammateOptions(
  result: StatsResult | null,
  player: string
): { value: string; label: string }[] {
  // Receivers and backs first: a lineman or a quarterback on the field for every snap leaves
  // "without him" empty. Most snaps first within each.
  const order = (p: string | null): number => (p === 'QB' ? 1 : p === 'OL' ? 2 : 0)
  return (result?.rows ?? [])
    .filter((r) => r.id !== player && (Object.values(r.values)[0]?.value ?? 0) > 0)
    .slice(0, 20)
    .sort((a, b) => order(a.position) - order(b.position))
    .map((r) => ({ value: r.id, label: `${r.name} (${r.position ?? '—'})` }))
}

/** Forecast (spec §9.4): the next opponent's defense against the position. */
const ALLOWED: Partial<Record<PositionGroup, string>> = {
  QB: 'fpa_qb',
  RB: 'fpa_rb',
  WR: 'fpa_wr',
  TE: 'fpa_te',
  K: 'fpa_k'
}

export function opponentDefenseQuery(
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery | null {
  const fpa = ALLOWED[position]
  if (!fpa) return null
  return {
    entity: 'team',
    metrics: [fpa, 'adj_def_epa', position === 'RB' ? 'def_rush_epa' : 'def_pass_epa'],
    scope: queryScope(scope, status),
    transform: 'raw',
    sort: { metric: fpa, dir: 'desc' },
    scoring: scope.scoring,
    limit: 40
  }
}

const MATCHUP_LABELS: Record<string, string> = {
  adj_def_epa: 'Adjusted EPA allowed',
  def_pass_epa: 'EPA/dropback allowed',
  def_rush_epa: 'EPA/carry allowed'
}

export interface MatchupView {
  opponent: string
  where: string
  when: string
  lines: StatLine[]
}

/** The next game and how its defense fares against the position, ranked among the 32. */
export function nextMatchup(
  games: readonly GameForecast[] | null,
  team: string | null,
  defense: StatsResult | null,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number,
  today = new Date()
): MatchupView | null {
  if (!games || !team) return null
  const ahead = (g: TeamGame): boolean =>
    g.gameday === null || new Date(`${g.gameday}T23:59:59`) >= today
  const g = teamGames(games, team).find((x) => !x.played && ahead(x))
  if (!g) return null
  const date = g.gameday
    ? new Date(`${g.gameday}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    : null
  const week = g.round ?? `Week ${g.week}`
  // The handoff's matchup tone: from the player's side, a stingy defense is bad news.
  const lines = (defense?.columns ?? []).map((c) => {
    const l = statLine(
      defense!,
      g.opponent,
      { metric: c.id, label: MATCHUP_LABELS[c.id] },
      byId,
      season
    )
    const p = l.percentile === null ? null : 100 - l.percentile
    return {
      ...l,
      label: c.id === ALLOWED[position] ? `Fantasy points to ${position}s` : l.label,
      percentile: p,
      heat: heatOf(p, l.info?.direction ?? 'neutral')
    }
  })
  return {
    opponent: g.opponent,
    where: g.neutral ? 'Neutral site' : g.home ? 'Home' : 'Away',
    when: date ? `${week} · ${date}` : week,
    lines
  }
}

/** Forecast: the outlook (spec §8.5) as the tab writes it. */
export interface OutlookView {
  range: { label: string; season: string; last16: string }[]
  rates: { label: string; value: string }[]
  trend: {
    metric: string
    label: string
    season: string
    last4: string
    change: string
    flag: 'up' | 'down' | null
  }[]
  signals: {
    metric: string
    label: string
    value: string
    mean: string
    text: string
    signal: 'hot' | 'cold' | null
  }[]
  schedule: string | null
}

export function outlookView(o: PlayerOutlook, byId: ReadonlyMap<string, MetricInfo>): OutlookView {
  const pts = (x: number | null): string => fmtStat(x, { unit: 'points', decimals: 1 })
  const pct = (x: number | null): string => fmtStat(x, { unit: 'pct', decimals: 0 })
  const f = (id: string, x: number | null, signed = false): string => {
    const m = byId.get(id)
    const text = fmtStat(x, { unit: m?.unit ?? 'number', decimals: m?.decimals ?? 1 })
    return signed && x !== null && x > 0 && !text.startsWith('+') ? `+${text}` : text
  }
  const label = (id: string): string => byId.get(id)?.label ?? id
  return {
    range: [
      {
        label: 'Ceiling (80th percentile week)',
        season: pts(o.ceiling.season),
        last16: pts(o.ceiling.last16)
      },
      {
        label: 'Floor (20th percentile week)',
        season: pts(o.floor.season),
        last16: pts(o.floor.last16)
      }
    ],
    rates: [
      { label: 'Boom weeks', value: pct(o.boomRate) },
      { label: 'Bust weeks', value: pct(o.bustRate) }
    ],
    // A share he never has (a receiver's carries) says nothing.
    trend: o.trend
      .filter((t) => t.season !== null && !(t.season === 0 && !t.last4))
      .map((t) => ({
        metric: t.metric,
        label: label(t.metric),
        season: f(t.metric, t.season),
        last4: f(t.metric, t.last4),
        change: t.change === null ? '—' : f(t.metric, t.change, true),
        flag: t.roleChange
      })),
    signals: o.regression
      .filter((s) => s.value !== null)
      .map((s) => ({
        metric: s.metric,
        label: label(s.metric),
        value: f(s.metric, s.value, true),
        mean: f(s.metric, s.mean),
        signal: s.signal,
        text:
          s.signal === null || s.expectedChange === null
            ? 'In line with what the position sustains.'
            : `Running ${s.signal}: expect it to ${s.signal === 'hot' ? 'fall' : 'rise'} by about ${f(s.metric, Math.abs(s.expectedChange))}.`
      })),
    schedule:
      o.schedule.easierBy === null
        ? null
        : `${o.schedule.opponents.length} games left. Their defenses allowed ${pts(Math.abs(o.schedule.easierBy))} ${o.schedule.easierBy >= 0 ? 'more' : 'fewer'} fantasy points per game to the position than average.`
  }
}

/**
 * Forecast: the stability-weighted profile, each core rate raw and shrunk (spec §8.5, §8.6). Over
 * the position: shrinkage pulls toward the position's mean.
 */
export function shrunkQuery(
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null,
  byId: ReadonlyMap<string, MetricInfo>
): StatsQuery | null {
  const rates = CORE_METRICS[position].filter((id) => byId.get(id)?.kind === 'rate')
  if (!rates.length) return null
  return {
    entity: 'player',
    metrics: rates,
    scope: { ...queryScope(scope, status), positions: [position] },
    transform: 'shrunk',
    sort: { metric: rates[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: POSITION_ROWS
  }
}

export interface ShrunkRow {
  metric: string
  label: string
  raw: string
  shrunk: string
  reliability: string | null
  info: MetricInfo | null
}

export function shrunkRows(
  result: StatsResult | null,
  player: string,
  byId: ReadonlyMap<string, MetricInfo>
): ShrunkRow[] {
  const r = result?.rows.find((x) => x.id === player)
  return (result?.columns ?? []).map((c) => {
    const info = byId.get(c.id) ?? null
    const f = { unit: c.unit, decimals: c.decimals }
    return {
      metric: c.id,
      label: c.label,
      raw: fmtStat(r?.values[c.id]?.raw ?? null, f),
      shrunk: fmtStat(r?.values[c.id]?.value ?? null, f),
      reliability: info ? (reliabilityOf(info)?.level ?? null) : null,
      info
    }
  })
}

/** Profile (spec §9.4, §8.7): combine measures with their 0–10 score within the position. */
export const COMBINE: { id: string; label: string }[] = [
  { id: 'height', label: 'Height' },
  { id: 'weight', label: 'Weight' },
  { id: 'forty', label: '40-yard dash' },
  { id: 'bench', label: 'Bench press' },
  { id: 'vertical', label: 'Vertical jump' },
  { id: 'broad_jump', label: 'Broad jump' },
  { id: 'cone', label: '3-cone drill' },
  { id: 'shuttle', label: 'Short shuttle' }
]

export function profileQuery(bio: PlayerBio): StatsQuery | null {
  if (bio.seasons.length === 0) return null
  return {
    entity: 'player',
    metrics: [
      'ras',
      'ras_measures',
      'speed_score',
      ...COMBINE.flatMap((m) => [m.id, `${m.id}_score`])
    ],
    scope: { seasons: bio.seasons, seasonType: 'ALL', players: [bio.id] },
    transform: 'raw',
    limit: 1
  }
}

export interface CombineRow {
  id: string
  label: string
  value: string
  /** 0–100: the score's place within the position group's combines since 2000. */
  percentile: number | null
}

const COMBINE_TEXT: Record<string, (v: number) => string> = {
  height: (v) => `${Math.floor(v / 12)}′${Math.round(v % 12)}″`,
  weight: (v) => `${Math.round(v)} lb`,
  forty: (v) => `${v.toFixed(2)} s`,
  bench: (v) => `${Math.round(v)} reps`,
  vertical: (v) => `${v.toFixed(1)}″`,
  broad_jump: (v) => `${Math.floor(v / 12)}′${Math.round(v % 12)}″`,
  cone: (v) => `${v.toFixed(2)} s`,
  shuttle: (v) => `${v.toFixed(2)} s`
}

export function combineView(result: StatsResult | null): {
  rows: CombineRow[]
  ras: string | null
  measures: number | null
  speedScore: string | null
} {
  const r = result?.rows[0]
  const v = (id: string): number | null => r?.values[id]?.value ?? null
  return {
    rows: COMBINE.map((m) => {
      const x = v(m.id)
      const score = v(`${m.id}_score`)
      return {
        id: m.id,
        label: m.label,
        value: x === null ? '—' : COMBINE_TEXT[m.id](x),
        percentile: score === null ? null : Math.max(0, Math.min(100, score * 10))
      }
    }),
    ras: v('ras') === null ? null : v('ras')!.toFixed(1),
    measures: v('ras_measures'),
    speedScore: v('speed_score') === null ? null : Math.round(v('speed_score')!).toString()
  }
}

/** Forecast (spec §9.4), with a league: Sleeper's projection, the rest of season, the experts. */
export interface ProjectionView {
  next: { week: number; opponent: string | null; points: string } | null
  ros: string
  rosRank: string | null
  experts: string | null
}

export function projectionView(detail: PlayerDetail, position: PositionGroup): ProjectionView {
  const next = detail.weeks.find((w) => !w.played && w.projected !== null) ?? null
  const pts = (x: number | null): string => fmtStat(x, { unit: 'points', decimals: 1 })
  return {
    next: next ? { week: next.week, opponent: next.opponent, points: pts(next.projected) } : null,
    ros: pts(detail.row.rosPoints),
    rosRank: detail.row.rosRank === null ? null : `${position}${detail.row.rosRank}`,
    experts: detail.row.expert ? `${position}${detail.row.expert.ecrPosRank}` : null
  }
}
