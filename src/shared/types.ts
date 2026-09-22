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
  /** Sleeper roster status: 'Active', 'Injured Reserve', 'Physically Unable to Perform', … */
  status: string | null
  /** Sleeper injury detail: body part is ~90 % populated, notes ~11 %. Display only. */
  injuryBodyPart: string | null
  injuryNotes: string | null
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
/** Slice 6a spec §2.3: why a lineup player's week value is 0 or needs a second look. */
export type LineupFlag = 'out' | 'doubtful' | 'questionable' | 'bye' | null

/** What the player detail panel needs to open for a player from any screen. */
export interface DetailTarget {
  playerId: string
  fullName: string
  position: string | null
  team: string | null
  statsAvailable: boolean
}

/** Slice 6a spec §4.3: one player's week as the lineup engine sees it. */
export interface LineupPlayer extends DetailTarget {
  /** NFL opponent that week; null on a bye. */
  opponent: string | null
  /** Defense-vs-position rank of that opponent at the player's position, 1 = allows the fewest. */
  dvpRank: number | null
  /** Spec §2.2 after §2.3: points when played, else the league-scored projection, 0 when unavailable / bye. */
  value: number
  played: boolean
  injuryStatus: string | null
  flag: LineupFlag
  /** FantasyPros weekly consensus for that week; null when the player has no row. */
  expert: { ecrPosRank: number; grade: string | null } | null
  floor: number | null
  ceiling: number | null
}

export interface SlotEntry {
  slot: string
  player: LineupPlayer | null
  /** The best eligible bench alternative within CLOSE_CALL_PTS of `player`; only on the optimal lineup. */
  closeCall: LineupPlayer | null
}

export interface Swap {
  slot: string
  /** null when the current lineup had that slot empty. */
  out: LineupPlayer | null
  in: LineupPlayer
  delta: number
}

export interface TeamLineup {
  rosterId: number
  name: string
  isMe: boolean
  optimal: SlotEntry[]
  optimalTotal: number
  /** The lineup set on Sleeper; null when unknown (no matchups row, no starters, no roster_positions). */
  current: SlotEntry[] | null
  currentTotal: number | null
  /** Sleeper's score for a final week; null otherwise. */
  actualTotal: number | null
  /** Startable players left out of the optimal lineup, best first. */
  bench: LineupPlayer[]
  /** IR / taxi players and, in the current week, Out / Doubtful players. */
  unavailable: LineupPlayer[]
  swaps: Swap[]
}

/** none of the team's players with a game has played / some / all (a past week is always final). */
export type LineupWeekStatus = 'upcoming' | 'inProgress' | 'final'

export interface LineupWeek {
  season: number
  week: number
  currentWeek: number
  status: LineupWeekStatus
  projectionsStored: boolean
  matchupId: number | null
  /** null when no team is flagged is_me. */
  me: TeamLineup | null
  /** null on a bye week or without a matchups row. */
  opponent: TeamLineup | null
}

export interface TeamStrength {
  rosterId: number
  name: string
  isMe: boolean
  /** Optimal total of the current week. */
  thisWeek: number | null
  /** Σ optimal totals over weeks currentWeek..18 on the current roster. */
  rosTotal: number | null
  rosPerWeek: number | null
  /** 1 = strongest; null when rosTotal is null. */
  rank: number | null
}

/** Slice 6b spec §4.1: from my side — I give `give`, I get `get` from roster `rosterId`. */
export interface TradeProposal {
  rosterId: number
  give: string[]
  get: string[]
}

/** A player as the trade table shows him; extends DetailTarget so the detail panel opens from any row. */
export interface TradePlayer extends DetailTarget {
  injuryStatus: string | null
  /** IR / taxi slot on his current roster; follows him through a trade. */
  reserve: 'ir' | 'taxi' | null
  rosPoints: number | null
  rosValue: number | null
  expert: ExpertRos | null
  market: MarketValue | null
  /** Window weeks in which he starts for his current owner (before the trade). */
  starterWeeks: number
}

export interface TradeSideResult {
  rosterId: number
  name: string
  isMe: boolean
  give: TradePlayer[]
  get: TradePlayer[]
  /** Auto-picked to respect the roster size; empty when none needed. */
  drops: TradePlayer[]
  /** Σ optimal totals over the window, before and after the trade. */
  before: number
  after: number
  delta: number
  deltaPerWeek: number
  thisWeekDelta: number
  /** Σ FantasyCalc value of each list; a player without one counts 0. */
  marketGive: number
  marketGet: number
  unvaluedGive: number
  unvaluedGet: number
  /** Window weeks whose optimal total moves. */
  weeksChanged: number
  thisWeekSwaps: Swap[]
}

export interface TradeEvaluation {
  season: number
  currentWeek: number
  lastWeek: number
  /** Window length, currentWeek..lastWeek. */
  weeks: number
  tradeDeadlinePassed: boolean
  me: TradeSideResult
  them: TradeSideResult
  /** Both deltas > 0. */
  winWin: boolean
  /** Each side receives ≥ 90 % of the market value it gives. */
  marketFair: boolean
}

export interface TradePoolTeam {
  rosterId: number
  name: string
  players: TradePlayer[]
}

/** Slice 6b spec §4.1: everything the builder's pickers need in one call. */
export interface TradePool {
  season: number
  currentWeek: number
  lastWeek: number
  weeks: number
  tradeDeadlinePassed: boolean
  me: TradePoolTeam
  /** Every other team, alphabetical. */
  teams: TradePoolTeam[]
}

/** Slice 6b spec §3.1: how eager I am — moves the thresholds on my side only. */
export type TradeStance = 'premium' | 'fair' | 'overpay'

/** A player I'd give (`give`: player id), a position I want (`want`), or no focus. */
export type TradeFocus = { give: string } | { want: string } | null

export interface TradeSuggestQuery {
  season: number
  focus: TradeFocus
  stance: TradeStance
  /** Restrict the scan to one team; null = every other team. */
  partnerRosterId: number | null
}

export interface TradeSuggestion {
  /** Exactly what `trade:evaluate` returns for this proposal — the card and the builder agree. */
  evaluation: TradeEvaluation
  /** Why they'd take it: their lineup improves, the market is fair for them, or both. */
  acceptance: 'lineup' | 'market' | 'both'
}

/** Rest-of-season realism spec §3.3: what the correction did to one player. */
export interface RosAdjustment {
  /** IR / PUP / Injured Reserve: every week after the current one is 0. */
  shelved: boolean
  /** The scale applied to each remaining week; null when there was no scale to apply. */
  factor: number | null
  /** Rank within position by raw projection, and by consensus. */
  projPosRank: number | null
  expertPosRank: number | null
}

export interface PlayerValueRow extends PlayerBaseRow {
  gamesPlayed: number
  ppg: number | null
  stdValue: number | null
  stdRank: number | null
  rosPoints: number | null
  rosValue: number | null
  /** What the rest-of-season correction did to this player; null outside the corrected pool. */
  rosAdjust: RosAdjustment | null
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
  /** Last fantasy week of the league (slice 6b spec §2.1); team strength and trade deltas sum currentWeek..lastWeek. */
  lastWeek: number
  projectionsStored: boolean
  /** Rest-of-season realism spec §4: false when no expert ranks were available to match against. */
  rosAdjusted: boolean
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

/** One item of Sleeper's aggregated player news (slice 5 spec §5.1). */
export interface NewsItem {
  /** `${source}:${source_key}` — unique per outlet article. */
  id: string
  /** `fantasy_pros` | `rotowire` | `rotoballer` | any outlet Sleeper adds later. */
  source: string
  /** ISO timestamp (Sleeper sends milliseconds). */
  publishedAt: string
  title: string
  /** Factual one-liner. */
  description: string | null
  /** Analyst paragraph (the fantasy take); absent on some outlets. */
  analysis: string | null
  /** Source article; only `http(s)` links are kept. */
  url: string | null
}

export interface PlayerNews {
  /** Newest first. */
  items: NewsItem[]
  fetchedAt: string
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

/** Auto-update progress as owned by the main process; the renderer only renders it. */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; notes: string | null }
  | { status: 'downloading'; version: string; notes: string | null; percent: number }
  | { status: 'ready'; version: string; notes: string | null }
  | { status: 'error'; message: string }
