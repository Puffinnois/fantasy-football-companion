import { ipcMain, type BrowserWindow } from 'electron'
import type { Db } from '@main/db/connection'
import { getLeague } from '@main/db/repos/leagues'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import { getLastError, getLastSync } from '@main/db/repos/syncLog'
import { listRoster, listTeams } from '@main/db/repos/teams'
import type { SleeperClient } from '@main/sources/sleeper'
import { mapLeagueSummary } from '@main/sync/mappers'
import { importLeague, refreshSleeper, SOURCE_LEAGUE, type SyncDeps } from '@main/sync/sleeperSync'
import { IPC, type FindLeaguesResult } from '@shared/ipc'
import type { League, RosterPlayer, SyncResult, SyncStatus, Team } from '@shared/types'

export interface AppContext {
  db: Db
  sleeper: SleeperClient
  getWindow: () => BrowserWindow | null
}

export function syncDeps(ctx: AppContext): SyncDeps {
  return {
    db: ctx.db,
    sleeper: ctx.sleeper,
    onStep: (entry) => ctx.getWindow()?.webContents.send(IPC.syncProgress, entry)
  }
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
      importLeague(syncDeps(ctx), leagueId, userId)
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
    return id ? listRoster(ctx.db, id, rosterId) : []
  })

  ipcMain.handle(IPC.syncRefresh, (_event, force: boolean): Promise<SyncResult> =>
    refreshSleeper(syncDeps(ctx), { force })
  )

  ipcMain.handle(IPC.syncStatus, (): SyncStatus => ({
    nflState: getNflState(ctx.db),
    lastSleeperSync: getLastSync(ctx.db, SOURCE_LEAGUE, 'ok'),
    lastError: getLastError(ctx.db),
    activeLeagueId: activeLeagueId()
  }))
}
