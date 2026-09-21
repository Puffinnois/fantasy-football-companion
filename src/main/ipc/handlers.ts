import { app, ipcMain, type BrowserWindow } from 'electron'
import { withTransaction, type Db } from '@main/db/connection'
import { listExpertRanks } from '@main/db/repos/expertRanks'
import { getLeague, leagueRosterPositions } from '@main/db/repos/leagues'
import { listMatchups } from '@main/db/repos/matchups'
import { playersOptions, playersWeek } from '@main/db/repos/playersWeek'
import { latestPointsWeek, NO_POINTS_CONTEXT } from '@main/db/repos/points'
import { getRules, saveRules } from '@main/db/repos/rules'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import { getLastError, getLastSync, getLastSyncLike } from '@main/db/repos/syncLog'
import { listRoster, listStarterIndexes, listTeams } from '@main/db/repos/teams'
import { listWatched, toggleWatch } from '@main/db/repos/watchlist'
import { buildLineups, lineupWeek, teamStrengths, type LineupBuild } from '@main/lineup/build'
import type { NewsCache } from '@main/news/newsCache'
import { normalizeRules } from '@main/scoring/normalize'
import { recomputePoints } from '@main/scoring/recompute'
import type { FantasyCalcClient } from '@main/sources/fantasycalc'
import type { FantasyProsClient } from '@main/sources/fantasypros'
import type { NflverseClient } from '@main/sources/nflverse'
import type { SleeperClient } from '@main/sources/sleeper'
import { mapLeagueSummary } from '@main/sync/mappers'
import { STATS_SOURCE_PREFIX } from '@main/sync/nflverseSync'
import { importAll, refreshAll, type AppSyncDeps } from '@main/sync/refresh'
import { reimportRules, SOURCE_LEAGUE } from '@main/sync/sleeperSync'
import { buildValueSeason, detailFor, type ValueBuild } from '@main/value/build'
import type { RefreshOptions } from '@main/sync/step'
import type { UpdateController } from '@main/updater'
import { IPC, type FindLeaguesResult } from '@shared/ipc'
import type { Rules } from '@shared/rules'
import type {
  League,
  LineupWeek,
  PlayerDetail,
  PlayerNews,
  PlayersOptions,
  PlayersValue,
  PlayersWeek,
  PointsContext,
  RosterPlayer,
  SyncResult,
  SyncStatus,
  Team,
  TeamStrength,
  UpdateState,
  WeekQuery
} from '@shared/types'

export interface AppContext {
  db: Db
  sleeper: SleeperClient
  nflverse: NflverseClient
  fantasypros: FantasyProsClient
  fantasycalc: FantasyCalcClient
  news: NewsCache
  getWindow: () => BrowserWindow | null
  update: UpdateController
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

/**
 * Cache of season value builds (one per league + season). Cleared with the week cache on sync and
 * rules changes, but not on watchlist toggles: `watched` is decorated at serve time instead.
 */
const VALUE_CACHE_MAX = 2
const valueCache = new Map<string, ValueBuild>()
/** Lineups derive from the value build and the same DB rows; same key, same invalidation. */
const lineupCache = new Map<string, LineupBuild>()

export function invalidateCaches(): void {
  invalidateWeekCache()
  valueCache.clear()
  lineupCache.clear()
}

function cachedValue(ctx: AppContext, leagueId: string, season: number): ValueBuild {
  const key = `${leagueId}|${season}`
  const hit = valueCache.get(key)
  if (hit) return hit
  const built = buildValueSeason(ctx.db, leagueId, season)
  if (valueCache.size >= VALUE_CACHE_MAX) {
    const oldest = valueCache.keys().next().value
    if (oldest !== undefined) valueCache.delete(oldest)
  }
  valueCache.set(key, built)
  return built
}

function cachedLineup(ctx: AppContext, leagueId: string, season: number): LineupBuild {
  const key = `${leagueId}|${season}`
  const hit = lineupCache.get(key)
  if (hit) return hit
  const built = buildLineups({
    value: cachedValue(ctx, leagueId, season),
    teams: listTeams(ctx.db, leagueId),
    rosterSlots: getRules(ctx.db, leagueId)?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(ctx.db, leagueId),
    matchups: listMatchups(ctx.db, leagueId, season),
    starterIndexes: listStarterIndexes(ctx.db, leagueId)
  })
  if (lineupCache.size >= VALUE_CACHE_MAX) {
    const oldest = lineupCache.keys().next().value
    if (oldest !== undefined) lineupCache.delete(oldest)
  }
  lineupCache.set(key, built)
  return built
}

export function syncDeps(ctx: AppContext): AppSyncDeps {
  return {
    db: ctx.db,
    sleeper: ctx.sleeper,
    nflverse: ctx.nflverse,
    fantasypros: ctx.fantasypros,
    fantasycalc: ctx.fantasycalc,
    onStep: (entry) => {
      if (entry.status === 'ok') invalidateCaches()
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
    invalidateCaches()
    return rules
  })

  ipcMain.handle(IPC.rulesReimport, async (): Promise<Rules> => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const rules = await reimportRules(syncDeps(ctx), id)
    withTransaction(ctx.db, () => recomputePoints(ctx.db, id, rules.updatedAt))
    invalidateCaches()
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

  ipcMain.handle(IPC.playersValue, (_event, season: number): PlayersValue => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const build = cachedValue(ctx, id, season)
    const watched = new Set(listWatched(ctx.db))
    return {
      context: build.context,
      rows: build.rows.map((r) => ({ ...r, watched: watched.has(r.playerId) }))
    }
  })

  ipcMain.handle(IPC.playersDetail, (_event, season: number, playerId: string): PlayerDetail => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const detail = detailFor(cachedValue(ctx, id, season), playerId)
    if (!detail) throw new Error(`Unknown player ${playerId}`)
    const watched = listWatched(ctx.db).includes(playerId)
    return { ...detail, row: { ...detail.row, watched } }
  })

  ipcMain.handle(IPC.playersNews, (_event, playerId: string, force: boolean): Promise<PlayerNews> =>
    ctx.news.get(playerId, force)
  )

  ipcMain.handle(IPC.lineupWeek, (_event, query: WeekQuery): LineupWeek => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const experts = new Map(
      listExpertRanks(ctx.db, query.season, query.week).map((r) => [r.playerId, r])
    )
    return lineupWeek(cachedLineup(ctx, id, query.season), query.week, experts)
  })

  ipcMain.handle(IPC.lineupStrength, (_event, season: number): TeamStrength[] => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    return teamStrengths(cachedLineup(ctx, id, season))
  })

  ipcMain.handle(IPC.watchlistToggle, (_event, playerId: string): boolean => {
    const watched = toggleWatch(ctx.db, playerId, new Date().toISOString())
    invalidateWeekCache()
    return watched
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

  ipcMain.handle(IPC.updateState, (): UpdateState => ctx.update.state())
  ipcMain.handle(IPC.updateInstall, (): void => ctx.update.install())
  ipcMain.handle(IPC.appVersion, (): string => app.getVersion())
}
