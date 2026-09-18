import { ipcMain, type BrowserWindow } from 'electron'
import { withTransaction, type Db } from '@main/db/connection'
import { getLeague } from '@main/db/repos/leagues'
import { playerWeeklyStats } from '@main/db/repos/playersQuery'
import { playersOptions, playersWeek } from '@main/db/repos/playersWeek'
import { latestPointsWeek, NO_POINTS_CONTEXT } from '@main/db/repos/points'
import { getRules, saveRules } from '@main/db/repos/rules'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import { getLastError, getLastSync, getLastSyncLike } from '@main/db/repos/syncLog'
import { listRoster, listTeams } from '@main/db/repos/teams'
import { toggleWatch } from '@main/db/repos/watchlist'
import { normalizeRules } from '@main/scoring/normalize'
import { recomputePoints } from '@main/scoring/recompute'
import type { NflverseClient } from '@main/sources/nflverse'
import type { SleeperClient } from '@main/sources/sleeper'
import { mapLeagueSummary } from '@main/sync/mappers'
import { STATS_SOURCE_PREFIX, type NflverseSyncDeps } from '@main/sync/nflverseSync'
import { importAll, refreshAll } from '@main/sync/refresh'
import { reimportRules, SOURCE_LEAGUE } from '@main/sync/sleeperSync'
import type { RefreshOptions } from '@main/sync/step'
import { IPC, type FindLeaguesResult } from '@shared/ipc'
import type { Rules } from '@shared/rules'
import type {
  League,
  PlayersOptions,
  PlayersWeek,
  PointsContext,
  RosterPlayer,
  SyncResult,
  SyncStatus,
  Team,
  WeekQuery,
  WeekStats
} from '@shared/types'

export interface AppContext {
  db: Db
  sleeper: SleeperClient
  nflverse: NflverseClient
  getWindow: () => BrowserWindow | null
}

/**
 * Cache of assembled player weeks: building one costs ~100–170 ms of SQL + JSON parsing, and the
 * Players screen filters, sorts and switches modes locally, so a week is built once per data change.
 */
const WEEK_CACHE_MAX = 8
const weekCache = new Map<string, PlayersWeek>()

export function invalidateWeekCache(): void {
  weekCache.clear()
}

function cachedWeek(ctx: AppContext, leagueId: string, query: WeekQuery): PlayersWeek {
  const key = `${leagueId}|${query.season}|${query.week}`
  const hit = weekCache.get(key)
  if (hit) return hit
  const built = playersWeek(ctx.db, leagueId, query.season, query.week)
  if (weekCache.size >= WEEK_CACHE_MAX) {
    const oldest = weekCache.keys().next().value
    if (oldest !== undefined) weekCache.delete(oldest)
  }
  weekCache.set(key, built)
  return built
}

export function syncDeps(ctx: AppContext): NflverseSyncDeps {
  return {
    db: ctx.db,
    sleeper: ctx.sleeper,
    nflverse: ctx.nflverse,
    onStep: (entry) => {
      if (entry.status === 'ok') invalidateWeekCache()
      ctx.getWindow()?.webContents.send(IPC.syncProgress, entry)
    }
  }
}

let inFlight: Promise<SyncResult> | null = null

/** One refresh at a time: the on-launch refresh and the Refresh button share the same promise. */
export function startRefresh(ctx: AppContext, options: RefreshOptions = {}): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = refreshAll(syncDeps(ctx), options).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

function pointsContext(ctx: AppContext, leagueId: string): PointsContext {
  const league = getLeague(ctx.db, leagueId)
  if (!league) return NO_POINTS_CONTEXT
  const season = Number(league.season)
  return { season, lastWeek: latestPointsWeek(ctx.db, leagueId, season) }
}

export function registerIpcHandlers(ctx: AppContext): void {
  const activeLeagueId = (): string | null => getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)

  ipcMain.handle(
    IPC.setupFindLeagues,
    async (_event, username: string): Promise<FindLeaguesResult> => {
      const user = await ctx.sleeper.getUser(username.trim())
      if (!user) throw new Error(`No Sleeper user named "${username.trim()}"`)
      const state = await ctx.sleeper.getNflState()
      const leagues = await ctx.sleeper.getUserLeagues(
        user.user_id,
        state.league_season || state.season
      )
      return { userId: user.user_id, leagues: leagues.map(mapLeagueSummary) }
    }
  )

  ipcMain.handle(
    IPC.setupImportLeague,
    (_event, leagueId: string, userId: string | null): Promise<SyncResult> =>
      importAll(syncDeps(ctx), leagueId, userId)
  )

  ipcMain.handle(IPC.leagueGet, (): League | null => {
    const id = activeLeagueId()
    return id ? getLeague(ctx.db, id) : null
  })

  ipcMain.handle(IPC.leagueTeams, (): Team[] => {
    const id = activeLeagueId()
    return id ? listTeams(ctx.db, id) : []
  })

  ipcMain.handle(IPC.leagueRoster, (_event, rosterId: number): RosterPlayer[] => {
    const id = activeLeagueId()
    return id ? listRoster(ctx.db, id, rosterId, pointsContext(ctx, id)) : []
  })

  ipcMain.handle(IPC.leaguePointsContext, (): PointsContext => {
    const id = activeLeagueId()
    return id ? pointsContext(ctx, id) : NO_POINTS_CONTEXT
  })

  ipcMain.handle(IPC.rulesGet, (): Rules | null => {
    const id = activeLeagueId()
    return id ? getRules(ctx.db, id) : null
  })

  ipcMain.handle(IPC.rulesUpdate, (_event, input: Rules): Rules => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const rules = normalizeRules(input, new Date().toISOString())
    withTransaction(ctx.db, () => {
      saveRules(ctx.db, id, rules)
      recomputePoints(ctx.db, id, rules.updatedAt) // spec §7: rules change → rebuild player_week_points
    })
    invalidateWeekCache()
    return rules
  })

  ipcMain.handle(IPC.rulesReimport, async (): Promise<Rules> => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const rules = await reimportRules(syncDeps(ctx), id)
    withTransaction(ctx.db, () => recomputePoints(ctx.db, id, rules.updatedAt))
    invalidateWeekCache()
    return rules
  })

  ipcMain.handle(IPC.playersOptions, (): PlayersOptions => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    return playersOptions(ctx.db, id)
  })

  ipcMain.handle(IPC.playersWeek, (_event, query: WeekQuery): PlayersWeek => {
    const id = activeLeagueId()
    return id ? cachedWeek(ctx, id, query) : { rows: [] }
  })

  ipcMain.handle(IPC.watchlistToggle, (_event, playerId: string): boolean => {
    const watched = toggleWatch(ctx.db, playerId, new Date().toISOString())
    invalidateWeekCache()
    return watched
  })

  ipcMain.handle(IPC.playersWeeklyStats, (_event, playerId: string): WeekStats[] => {
    const id = activeLeagueId()
    return id ? playerWeeklyStats(ctx.db, id, playerId, pointsContext(ctx, id).season) : []
  })

  ipcMain.handle(IPC.syncRefresh, (_event, force: boolean): Promise<SyncResult> =>
    startRefresh(ctx, { force })
  )

  ipcMain.handle(IPC.syncStatus, (): SyncStatus => ({
    nflState: getNflState(ctx.db),
    lastSleeperSync: getLastSync(ctx.db, SOURCE_LEAGUE, 'ok'),
    lastNflverseSync: getLastSyncLike(ctx.db, STATS_SOURCE_PREFIX, 'ok'),
    lastError: getLastError(ctx.db),
    activeLeagueId: activeLeagueId()
  }))
}
