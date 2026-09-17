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

export type OwnerFilter = 'all' | 'fa' | number

export interface PlayerFilter {
  /** Case-insensitive substring of the full name. */
  query?: string
  position?: string
  /** Sleeper NFL team code. */
  team?: string
  /** 'fa' = free agents only; a number = that roster id. */
  owner?: OwnerFilter
}

export interface PlayerRow {
  playerId: string
  fullName: string
  position: string | null
  team: string | null
  status: string | null
  injuryStatus: string | null
  ownerRosterId: number | null
  ownerName: string | null
  byeWeek: number | null
  seasonPoints: number | null
  lastWeekPoints: number | null
  statsAvailable: boolean
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
