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

export type TableMode = 'proj' | 'stats'

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
  statsAvailable: boolean
}

/** Metric of the (starters + 1)-th best player at a position — spec §2.2. */
export interface ReplacementLevel {
  level: number
  starters: number
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
  statsAvailable: boolean
}

export interface ValueContext {
  season: number
  /** ROS starts here (Sleeper's week; 19 for a past season). */
  currentWeek: number
  projectionsStored: boolean
  /** Per lineup position; null when no player has the metric. */
  replacement: Record<string, { std: ReplacementLevel | null; ros: ReplacementLevel | null }>
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
}

export interface PlayersWeek {
  rows: PlayerWeekRow[]
}

export interface WeekSnaps {
  offenseSnaps: number | null
  offensePct: number | null
}

/** One week of raw nflverse stats for a player (or a team defense), with the app's points. */
export interface WeekStats {
  season: number
  week: number
  team: string | null
  opponent: string | null
  points: number | null
  stats: Record<string, number>
  snaps: WeekSnaps | null
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
