import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type Api } from '@shared/ipc'
import type { SyncLogEntry, UpdateState } from '@shared/types'

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
    options: () => ipcRenderer.invoke(IPC.playersOptions),
    week: (query) => ipcRenderer.invoke(IPC.playersWeek, query),
    value: (season) => ipcRenderer.invoke(IPC.playersValue, season),
    detail: (season, playerId) => ipcRenderer.invoke(IPC.playersDetail, season, playerId),
    news: (playerId, force) => ipcRenderer.invoke(IPC.playersNews, playerId, force ?? false)
  },
  lineup: {
    week: (query) => ipcRenderer.invoke(IPC.lineupWeek, query),
    strength: (season) => ipcRenderer.invoke(IPC.lineupStrength, season)
  },
  watchlist: {
    toggle: (playerId) => ipcRenderer.invoke(IPC.watchlistToggle, playerId)
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
  },
  update: {
    state: () => ipcRenderer.invoke(IPC.updateState),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    onChange: (listener) => {
      const handler = (_event: IpcRendererEvent, state: UpdateState): void => listener(state)
      ipcRenderer.on(IPC.updateChanged, handler)
      return () => {
        ipcRenderer.removeListener(IPC.updateChanged, handler)
      }
    }
  },
  app: {
    version: () => ipcRenderer.invoke(IPC.appVersion)
  }
}

contextBridge.exposeInMainWorld('api', api)
