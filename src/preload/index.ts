import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type Api } from '@shared/ipc'
import type { SyncLogEntry } from '@shared/types'

const api: Api = {
  setup: {
    findLeagues: (username) => ipcRenderer.invoke(IPC.setupFindLeagues, username),
    importLeague: (leagueId, userId) => ipcRenderer.invoke(IPC.setupImportLeague, leagueId, userId)
  },
  league: {
    get: () => ipcRenderer.invoke(IPC.leagueGet),
    teams: () => ipcRenderer.invoke(IPC.leagueTeams),
    roster: (rosterId) => ipcRenderer.invoke(IPC.leagueRoster, rosterId),
    pointsContext: () => ipcRenderer.invoke(IPC.leaguePointsContext)
  },
  players: {
    search: (filter) => ipcRenderer.invoke(IPC.playersSearch, filter),
    weeklyStats: (playerId) => ipcRenderer.invoke(IPC.playersWeeklyStats, playerId)
  },
  rules: {
    get: () => ipcRenderer.invoke(IPC.rulesGet),
    update: (rules) => ipcRenderer.invoke(IPC.rulesUpdate, rules),
    reimportFromSleeper: () => ipcRenderer.invoke(IPC.rulesReimport)
  },
  sync: {
    refresh: (force) => ipcRenderer.invoke(IPC.syncRefresh, force ?? false),
    status: () => ipcRenderer.invoke(IPC.syncStatus),
    onProgress: (listener) => {
      const handler = (_event: IpcRendererEvent, entry: SyncLogEntry): void => listener(entry)
      ipcRenderer.on(IPC.syncProgress, handler)
      return () => {
        ipcRenderer.removeListener(IPC.syncProgress, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
