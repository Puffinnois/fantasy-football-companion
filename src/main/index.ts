import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { registerIpcHandlers, syncDeps, type AppContext } from '@main/ipc/handlers'
import { createSleeperClient } from '@main/sources/sleeper'
import { refreshSleeper } from '@main/sync/sleeperSync'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#18181b',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function openAppDatabase(): Db {
  const dbPath = join(app.getPath('userData'), 'companion.db')
  try {
    const db = openDatabase(dbPath)
    migrate(db)
    return db
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('Database error', `Could not open ${dbPath}\n\n${message}`)
    app.quit()
    throw err
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.yhabie.fantasycompanion')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const ctx: AppContext = {
    db: openAppDatabase(),
    sleeper: createSleeperClient(),
    getWindow: () => mainWindow
  }
  registerIpcHandlers(ctx)
  createWindow()

  if (getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)) {
    refreshSleeper(syncDeps(ctx)).catch((err) => console.error('background refresh failed', err))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
