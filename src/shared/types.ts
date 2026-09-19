export interface LeagueSummary {
  leagueId: string
  name: string
  season: string
  status: string
  totalRosters: number
}

export interface League extends LeagueSummary {
  syncedAt: string | null
}

export interface Team {
  leagueId: string
  rosterId: number
  ownerId: string | null
  displayName: string
  teamName: string | null
  avatar: string | null
  wins: number
  losses: number
  ties: number
  fpts: number
  fptsAgainst: number
  isMe: boolean
}

export type RosterSlot = 'starter' | 'bench' | 'ir' | 'taxi'

export interface RosterPlayer {
  playerId: string
  slot: RosterSlot
  starterIndex: number | null
  fullName: string
  position: string | null
  team: string | null
  status: string | null
  injuryStatus: string | null
  byeWeek: number | null
  /** Sum of this season's app-computed points; null when no scored week exists. */
  seasonPoints: number | null
  /** Points in `PointsContext.lastWeek`; null when the player has no row for it (bye, DNP). */
  lastWeekPoints: number | null
  /** false = no nflverse identity: the UI shows "stats unavailable". */
  statsAvailable: boolean
}

export type TableMode = 'proj' | 'stats' | 'value'

export interface PositionTab {
  id: string
  label: string
  positions: string[]
}

export interface PlayersOptions {
  seasons: number[]
  currentWeek: number
  lastScoredWeek: number | null
  tabs: PositionTab[]
  projectionWeeks: { season: number; week: number }[]
}

export interface WeekQuery {
  season: number
  week: number
}

export interface GameInfo {
  /** Sleeper team code of the opponent. */
  opponent: string
  home: boolean
  /** ISO UTC kickoff; null when the schedule has no time. */
  kickoff: string | null
  homeScore: number | null
  awayScore: number | null
  final: boolean
}

/** Identity and roster fields shared by the week and value rows; the renderer filters on these. */
export interface PlayerBaseRow {
  playerId: string
  fullName: string
  position: string | null
  team: string | null
  byeWeek: number | null
  injuryStatus: string | null
  rookie: boolean
  watched: boolean
  ownerRosterId: number | null
  ownerName: string | null
  /** The owner is the team flagged `is_me` at import. */
  ownerIsMe: boolean
}

/** One candidate player for a (season, week); the renderer picks the line by mode and filters/sorts locally. */
export interface PlayerWeekRow extends PlayerBaseRow {
  /** null = bye (team known) or no team. */
  game: GameInfo | null
  points: number | null
  projected: number | null
  delta: number | null
  /** Actual stats in Sleeper keys (+ fga, xpa, fgm_0_39); {} when the week has no row. */
  actual: Record<string, number>
  /** Projection line in Sleeper keys (+ fgm_0_39); null when none is stored. */
  projection: Record<string, number> | null
  snapPct: number | null
  targetShare: number | null
  /** FantasyPros start/sit consensus for this week; null when unpublished or unranked. */
  expert: ExpertWeek | null
  statsAvailable: boolean
}

/** Metric of the (starters + 1)-th best player at a position — spec §2.2. */
export interface ReplacementLevel {
  level: number
  starters: number
}

export type Trend = 'rising' | 'flat' | 'falling'

/** A usage metric over the games that have it: season mean, last-3 mean, and their comparison (spec §3.1). */
export interface UsageTrend {
  season: number
  recent: number
  trend: Trend
}

export type UsageMetric = 'snapPct' | 'targetShare' | 'rushShare' | 'airYardsShare' | 'wopr'

/** Spec §3; a field is null when its gate (games, projections, schedule) is not met. */
export interface PlayerSignals {
  usage: Record<UsageMetric, UsageTrend | null>
  /** Actual − expected TDs (opportunities × the position's TD rate). */
  tdDelta: number | null
  /** 'down' = scored well over expectation (regression candidate), 'up' = well under. */
  tdFlag: 'up' | 'down' | null
  /** Yards per opportunity and its distance from the position's mean. */
  ypo: number | null
  ypoDelta: number | null
  /** Points − projection over played weeks that had a projection; pct relative to the projection. */
  vsProjPoints: number | null
  vsProjPct: number | null
  /** 25th / 75th percentile and population stdev of weekly points (3+ games). */
  floor: number | null
  ceiling: number | null
  stdev: number | null
  /** Share of games at or above the position's replacement PPG (3+ games). */
  startRate: number | null
  /** Sleeper team code + defense-vs-position rank (1 = allows the fewest); rank null until that defense has played. */
  nextOpponent: { team: string; rank: number | null } | null
  /** Mean rank of the ranked remaining opponents. */
  rosSos: number | null
  byesRemaining: number
}

/** One remaining week of a player's team; opponent null on a bye. */
export interface ScheduleEntry {
  week: number
  opponent: string | null
  rank: number | null
}

/** The best free agent at my player's position when it out-values them (spec §4). */
export interface Droppable {
  playerId: string
  fullName: string
  /** The free agent's ROS value minus my player's. */
  delta: number
}

/** My startable player with the lowest ROS value at a position — the `vsMine` baseline. */
export interface MyBaseline {
  playerId: string
  fullName: string
  rosValue: number
}

/** FantasyPros scoring bucket, derived from the league's base `rec` points (slice 5 spec §3.2). */
export type ScoringFormat = 'PPR' | 'HALF' | 'STD'

/** Experts' rest-of-season consensus (FantasyPros ECR); null when they have no ROS row for the player. */
export interface ExpertRos {
  /** Overall consensus rank across positions. */
  ecrRank: number
  /** Consensus rank within the player's position. */
  ecrPosRank: number
  /** Standard deviation of the experts' ranks — how much they disagree; null when FantasyPros omits it. */
  spread: number | null
  experts: number
  /** ecrPosRank − rosRank: positive = we rank the player higher than the experts. Null when either rank is missing. */
  ecrDelta: number | null
}

/** FantasyCalc trade-market consensus; null outside its top list (~130 players). */
export interface MarketValue {
  value: number
  posRank: number
  tier: number | null
  trend30d: number
}

/** This week's start/sit consensus; null when the week isn't published or the player is unranked. */
export interface ExpertWeek {
  ecrPosRank: number
  /** FantasyPros start/sit grade ("A+" … "F"). */
  grade: string | null
  /** FantasyPros' own projected points under the synced scoring format. */
  projPts: number | null
  spread: number | null
}

/** Provenance of the expert blocks: which scoring bucket was synced and how old the stored rows are. */
export interface ExpertContext {
  scoring: ScoringFormat
  /** `updated_at` of the stored ROS rankings; null when none are stored for the season. */
  ecrUpdatedAt: string | null
  /** `updated_at` of the stored market values; null when none are stored for the season. */
  marketUpdatedAt: string | null
}

/** One player's season value (spec §2); ranks are 1-based within position, overall by ROS value. */
export interface PlayerValueRow extends PlayerBaseRow {
  gamesPlayed: number
  ppg: number | null
  stdValue: number | null
  stdRank: number | null
  rosPoints: number | null
  rosValue: number | null
  rosRank: number | null
  overallRank: number | null
  /** null for players unmatched to nflverse. */
  signals: PlayerSignals | null
  /** Free agents only: ROS value minus my lowest-valued startable player's at the position. */
  vsMine: number | null
  /** My startable players only: the best free agent at the position when strictly better. */
  droppable: Droppable | null
  /** FantasyPros rest-of-season consensus; null when the experts have no row for the player. */
  expert: ExpertRos | null
  /** FantasyCalc trade-market value; null outside its list. */
  market: MarketValue | null
  statsAvailable: boolean
}

export interface ValueContext {
  season: number
  /** ROS starts here (Sleeper's week; 19 for a past season). */
  currentWeek: number
  projectionsStored: boolean
  teamCount: number
  /** A `teams` row is flagged `is_me`; when false `vsMine`, `droppable` and every `mine` entry are null. */
  hasMyTeam: boolean
  /** Per lineup position; null when I roster nobody startable with a ROS value there. */
  mine: Record<string, MyBaseline | null>
  /** Per lineup position; null when no player has the metric. */
  replacement: Record<string, { std: ReplacementLevel | null; ros: ReplacementLevel | null }>
  expert: ExpertContext
}

export interface PlayersValue {
  context: ValueContext
  rows: PlayerValueRow[]
}

export interface DetailWeek {
  week: number
  opponent: string | null
  played: boolean
  points: number | null
  projected: number | null
  snapPct: number | null
  targetShare: number | null
  rushShare: number | null
  wopr: number | null
  /** Actual line in Sleeper keys (+ fga, xpa, fgm_0_39); {} when not played. */
  stats: Record<string, number>
}

export interface PlayerDetail {
  row: PlayerValueRow
  /** Every week with a game, a projection or a points row, ascending. */
  weeks: DetailWeek[]
  /** Remaining weeks (≥ current week, not yet played) of the player's team, byes included. */
  schedule: ScheduleEntry[]
}

export interface PlayersWeek {
  rows: PlayerWeekRow[]
}

/** Which season the UI shows points for and which week is "last week" (null = no points yet). */
export interface PointsContext {
  season: number
  lastWeek: number | null
}

export interface NflState {
  season: string
  week: number
  displayWeek: number
  seasonType: string
  fetchedAt: string
}

export type SyncStatusKind = 'ok' | 'error' | 'skipped'

export interface SyncLogEntry {
  id: number
  source: string
  startedAt: string
  finishedAt: string | null
  status: SyncStatusKind | 'running'
  message: string | null
  rowsWritten: number
}

export interface SyncResult {
  steps: SyncLogEntry[]
}

export interface SyncStatus {
  nflState: NflState | null
  lastSleeperSync: SyncLogEntry | null
  lastNflverseSync: SyncLogEntry | null
  lastError: SyncLogEntry | null
  activeLeagueId: string | null
}
