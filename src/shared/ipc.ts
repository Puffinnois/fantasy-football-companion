import type {
  League,
  LeagueSummary,
  RosterPlayer,
  SyncLogEntry,
  SyncResult,
  SyncStatus,
  Team
} from './types'

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
  syncRefresh: 'sync:refresh',
  syncStatus: 'sync:status',
  syncProgress: 'sync:progress'
} as const
