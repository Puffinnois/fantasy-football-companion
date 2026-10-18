import type { Scoring } from './scoring'

/** Stats-analysis spec §6.1: a badge and a filter, not a tab. */
export type MetricFamily = 'traditional' | 'advanced' | 'ngs' | 'charting' | 'predictive'
/** `core` shown by default, `extended` in its tab and the column picker, `stored` in queries only. */
export type MetricTier = 'core' | 'extended' | 'stored'
export type Grain = 'play' | 'week' | 'season'
export type Entity = 'player' | 'team'

/** Position groups, as nflverse rosters list them (`player_week.position`). */
export const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'DL', 'LB', 'DB', 'OL'] as const
export type PositionGroup = (typeof POSITION_GROUPS)[number]

/**
 * How a value reads: `pct` is a fraction (0.35 = 35 %), `pp` percentage points (CPOE 3.1), `epa`
 * expected points, `rating` an index (passer rating, QBR).
 */
export type MetricUnit =
  'count' | 'number' | 'pct' | 'pp' | 'yards' | 'epa' | 'points' | 'seconds' | 'rating'

/**
 * One catalogue entry (spec §6.1). `value` is SQL over component sums: each `{name}` is the sum of
 * that component over the rows in scope (a column of `player_week` / `team_week`, `fp` / `xfp` /
 * `fpa_*` under the chosen scoring, or a model sum of `team_model_week` / `player_model_week`).
 * `{last:name}` is a model state at the end of the scope (a team's Elo, adjusted EPA, playoff odds;
 * a player's combine profile), and `{p80:fp}` / `{p20:fp}` the 80th / 20th percentile of the weekly
 * fantasy points in scope. `sample` names the component that measures the sample and qualifies a
 * row (`minSample` per 17 games). Descriptions are written for a person and for an LLM (spec §10).
 */
export interface MetricDef {
  id: string
  label: string
  short: string
  description: string
  family: MetricFamily
  entity: Entity
  /** Team metrics: the unit it measures. */
  side?: 'offense' | 'defense' | 'special'
  /** Player metrics: where it applies. */
  positions: PositionGroup[] | 'all'
  value: string
  sample: string
  /** A `count` can be shown per game; a `rate` already is per play or per game. */
  kind: 'count' | 'rate'
  unit: MetricUnit
  decimals: number
  direction: 'higher' | 'lower' | 'neutral'
  /** The sample a row needs to be qualified over 17 games, scaled to the weeks in scope. */
  minSample?: number
  sources: string[]
  firstSeason: number
  /** `prior`: published through the prior season only (participation). */
  lastSeason?: 'prior'
  /** A component counting estimated weeks (routes in the current season): any makes it "est.". */
  estimatedBy?: string
  tier: MetricTier
  /** Depends on the scoring picker (fantasy points). */
  scoring?: boolean
}

/** How much a metric carries over (spec §8.6), measured on 2019 to the prior season. */
export interface MetricStability {
  /** Pearson r between a player's (team's) qualified seasons, one season to the next. */
  yearToYear: number | null
  /** Season pairs behind it. */
  pairs: number
  /** Correlation of odd and even weeks of a qualified season (within-season reliability). */
  splitHalf: number | null
  /**
   * The sample at which half of a rate is signal (Spearman–Brown from the split halves): the
   * `shrunk` transform weighs the league mean as this much sample.
   */
  prior: number | null
  /** From the year-to-year r: high ≥ 0.6, medium ≥ 0.35, low below. */
  reliability: 'high' | 'medium' | 'low' | null
}

/** A catalogue entry as the engine serves it: the formula left out, where it can be computed added. */
export interface MetricInfo extends Omit<MetricDef, 'value' | 'sample'> {
  grains: Grain[]
  /** Null until the models have run, or for a metric without enough seasons. */
  stability: MetricStability | null
}

export type GroupBy =
  | 'season'
  | 'week'
  | 'team'
  | 'opponent'
  | 'down'
  | 'quarter'
  | 'personnel'
  | 'coverage'
  | 'formation'

/**
 * Spec §7.1. `shrunk` pulls a rate toward its league mean by its sample (spec §8.5);
 * `opponentAdjusted` subtracts how far the opponents faced allow more or less than average.
 */
export type Transform =
  'raw' | 'perGame' | 'percentile' | 'zScore' | 'vsLeague' | 'shrunk' | 'opponentAdjusted'

/** Stats-analysis spec §7.1: every leaderboard, card, chart and comparison is one of these. */
export interface StatsQuery {
  entity: Entity
  /** Catalogue ids, at most 40. */
  metrics: string[]
  scope: {
    seasons: number[]
    /** Default `REG`. */
    seasonType?: 'REG' | 'POST' | 'ALL'
    weeks?: [number, number]
    lastNGames?: number
    positions?: PositionGroup[]
    teams?: string[]
    opponents?: string[]
    /** gsis ids */
    players?: string[]
    qualifiedOnly?: boolean
  }
  /** Play-grain filters: only metrics computed from plays accept them. */
  situation?: {
    down?: number[]
    distance?: [number, number]
    quarter?: number[]
    fieldZone?: 'redzone' | 'inside10' | 'inside5' | 'own20'
    scoreMargin?: [number, number]
    winProbability?: [number, number]
    neutral?: boolean
    pressure?: boolean
    blitz?: boolean
    playAction?: boolean
    /** `man` / `zone`, or nflverse coverage types (`COVER_3`, …). */
    coverage?: 'man' | 'zone' | string[]
    formation?: string[]
    /** Personnel codes: "11" = 1 RB, 1 TE. */
    personnel?: string[]
    box?: [number, number]
    airYards?: [number, number]
    withOnField?: string[]
    withoutOnField?: string[]
  }
  groupBy?: GroupBy[]
  transform?: Transform
  /** Default: the first metric, best first. */
  sort?: { metric: string; dir: 'asc' | 'desc' }
  /** Default 100, at most 1000. */
  limit?: number
  /** The scoring of fantasy metrics; `ppr` by default. */
  scoring?: Scoring
}

export interface MetricValue {
  /** After the transform. */
  value: number | null
  raw: number | null
  sample: number | null
  qualified: boolean
  /** 0–100 among the qualified rows of the same position (players) and group; null otherwise. */
  percentile: number | null
  rank: number | null
  estimated: boolean
}

export interface StatsRow {
  /** gsis id or team code */
  id: string
  name: string
  team: string | null
  position: string | null
  /** The `groupBy` values. */
  group: Partial<Record<GroupBy, string | number | null>>
  games: number
  values: Record<string, MetricValue>
}

export interface StatsResultColumn {
  id: string
  label: string
  short: string
  unit: MetricUnit
  decimals: number
  direction: MetricDef['direction']
  /** The seasons in scope this metric has data for. */
  seasons: number[]
}

export interface StatsResult {
  grain: Grain
  columns: StatsResultColumn[]
  rows: StatsRow[]
  /** Rows before `limit`. */
  total: number
  /** Caveats a screen (or an answer) should state: coverage, estimates. */
  notes: string[]
  ms: number
}

/** "Data through week N, updated <time>" (spec §5.3). */
export interface StatsStatus {
  /** The stats worker runs (DuckDB loaded). */
  available: boolean
  /** The latest week with plays. */
  through: { season: number; seasonType: 'REG' | 'POST'; week: number } | null
  /** The last step that wrote rows, ISO time. */
  updatedAt: string | null
  /** A refresh or a rebuild is running. */
  busy: boolean
}
