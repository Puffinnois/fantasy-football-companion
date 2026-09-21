import type {
  League,
  LeagueSummary,
  LineupWeek,
  PlayersOptions,
  PlayerDetail,
  PlayerNews,
  PlayersValue,
  PlayersWeek,
  WeekQuery,
  PointsContext,
  RosterPlayer,
  SyncLogEntry,
  SyncResult,
  SyncStatus,
  Team,
  TeamStrength
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
    /** Every candidate player for the week with both lines; cached in main until data changes. */
    week(query: WeekQuery): Promise<PlayersWeek>
    /** Every candidate's season value (spec §2); cached in main until a sync or a rules change. */
    value(season: number): Promise<PlayersValue>
    /** One player's value row plus its week series; served from the same cache. */
    detail(season: number, playerId: string): Promise<PlayerDetail>
    /** Sleeper's aggregated news for one player, newest first; cached in main for 15 min, `force` refetches. */
    news(playerId: string, force?: boolean): Promise<PlayerNews>
  }
  lineup: {
    /** My optimal vs. current lineup for a week with my opponent (slice 6a spec §4.2); cached in main with the value build. */
    week(query: WeekQuery): Promise<LineupWeek>
    /** Every team's rest-of-season strength on its current roster, ranked. */
    strength(season: number): Promise<TeamStrength[]>
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
  playersWeek: 'players:week',
  playersValue: 'players:value',
  playersDetail: 'players:detail',
  playersNews: 'players:news',
  lineupWeek: 'lineup:week',
  lineupStrength: 'lineup:strength',
  watchlistToggle: 'watchlist:toggle',
  rulesGet: 'rules:get',
  rulesUpdate: 'rules:update',
  rulesReimport: 'rules:reimport',
  syncRefresh: 'sync:refresh',
  syncStatus: 'sync:status',
  syncProgress: 'sync:progress'
} as const
