import type {
  League,
  LeagueSummary,
  PlayersOptions,
  PlayersQuery,
  PlayersTable,
  PointsContext,
  RosterPlayer,
  SyncLogEntry,
  SyncResult,
  SyncStatus,
  Team,
  WeekStats
} from './types'
import type { Rules } from './rules'

export interface FindLeaguesResult {
  userId: string
  leagues: LeagueSummary[]
}

export interface Api {
  setup: {
    findLeagues(username: string): Promise<FindLeaguesResult>
    importLeague(leagueId: string, userId: string | null): Promise<SyncResult>
  }
  league: {
    get(): Promise<League | null>
    teams(): Promise<Team[]>
    roster(rosterId: number): Promise<RosterPlayer[]>
    /** Season shown and the latest scored week; the League/Players screens label their columns with it. */
    pointsContext(): Promise<PointsContext>
  }
  players: {
    options(): Promise<PlayersOptions>
    /** One row per candidate player for (season, week); sorted server-side; at most 250 rows (`total` says how many matched). */
    table(query: PlayersQuery): Promise<PlayersTable>
    weeklyStats(playerId: string): Promise<WeekStats[]>
  }
  watchlist: {
    /** Returns the new state. */
    toggle(playerId: string): Promise<boolean>
  }
  rules: {
    get(): Promise<Rules | null>
    /** Saves as custom rules (source = 'custom'); rejects with a readable message on invalid input. */
    update(rules: Rules): Promise<Rules>
    /** Overwrites the stored rules (custom or not) with the league's current Sleeper settings. */
    reimportFromSleeper(): Promise<Rules>
  }
  sync: {
    refresh(force?: boolean): Promise<SyncResult>
    status(): Promise<SyncStatus>
    onProgress(listener: (entry: SyncLogEntry) => void): () => void
  }
}

export const IPC = {
  setupFindLeagues: 'setup:findLeagues',
  setupImportLeague: 'setup:importLeague',
  leagueGet: 'league:get',
  leagueTeams: 'league:teams',
  leagueRoster: 'league:roster',
  leaguePointsContext: 'league:pointsContext',
  playersOptions: 'players:options',
  playersTable: 'players:table',
  playersWeeklyStats: 'players:weeklyStats',
  watchlistToggle: 'watchlist:toggle',
  rulesGet: 'rules:get',
  rulesUpdate: 'rules:update',
  rulesReimport: 'rules:reimport',
  syncRefresh: 'sync:refresh',
  syncStatus: 'sync:status',
  syncProgress: 'sync:progress'
} as const
