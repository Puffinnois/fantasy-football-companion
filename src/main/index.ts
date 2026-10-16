import { app, BrowserWindow, dialog, shell } from 'electron'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { openWarehouseDatabase } from '@main/db/warehouseDb'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { registerIpcHandlers, startRefresh, type AppContext } from '@main/ipc/handlers'
import { createNewsCache } from '@main/news/newsCache'
import { createFantasyCalcClient } from '@main/sources/fantasycalc'
import { createFantasyProsClient } from '@main/sources/fantasypros'
import { createNflverseClient } from '@main/sources/nflverse'
import { createSleeperClient } from '@main/sources/sleeper'
import { createWarehouseClient } from '@main/sources/warehouse/client'
import { createSleeperNewsClient } from '@main/sources/sleeperNews'
import { startStatsWorker } from '@main/stats/client'
import { installAutoUpdater } from '@main/updater'
import { IPC } from '@shared/ipc'

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

function appDatabasePath(): string {
  return join(app.getPath('userData'), 'companion.db')
}

function openAppDatabase(): Db {
  const dbPath = appDatabasePath()
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

/** Stats-warehouse spec §10: a failure here only disables the warehouse, never the app. */
function openWarehouse(): Db | null {
  const path = join(app.getPath('userData'), 'warehouse.db')
  try {
    return openWarehouseDatabase(path)
  } catch (err) {
    console.error(`could not open ${path}; the stats warehouse is off`, err)
    return null
  }
}

/**
 * `--stats-self-test=<file>` (stats-analysis spec §3.3): the packaged app opens a throwaway stats
 * database in the worker, writes, reads and round-trips Parquet, writes the result as JSON to
 * `<file>`, and exits 0 on success. CI runs it on the Windows build.
 */
const SELF_TEST_FLAG = '--stats-self-test='

async function runStatsSelfTest(out: string): Promise<number> {
  const dir = join(tmpdir(), `ffc-stats-self-test-${process.pid}`)
  let result: object
  let code = 1
  try {
    const client = startStatsWorker({ path: join(dir, 'stats.duckdb'), tempDir: dir })
    const test = await client.selfTest()
    await client.close()
    code = test.parquet && test.rows === 1000 ? 0 : 1
    result = { ok: code === 0, ...test }
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  writeFileSync(out, JSON.stringify(result))
  rmSync(dir, { recursive: true, force: true })
  return code
}

app.whenReady().then(async () => {
  const selfTest = process.argv.find((a) => a.startsWith(SELF_TEST_FLAG))
  if (selfTest) {
    app.exit(await runStatsSelfTest(selfTest.slice(SELF_TEST_FLAG.length)))
    return
  }
  electronApp.setAppUserModelId('com.yhabie.fantasycompanion')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const ctx: AppContext = {
    db: openAppDatabase(),
    dbPath: appDatabasePath(),
    sleeper: createSleeperClient(),
    nflverse: createNflverseClient(),
    fantasypros: createFantasyProsClient(),
    fantasycalc: createFantasyCalcClient(),
    warehouse: createWarehouseClient(),
    warehouseDb: openWarehouse(),
    news: createNewsCache(createSleeperNewsClient()),
    getWindow: () => mainWindow,
    update: installAutoUpdater({
      enabled: app.isPackaged && process.platform === 'win32',
      updater: autoUpdater,
      onChange: (state) => mainWindow?.webContents.send(IPC.updateChanged, state)
    })
  }
  registerIpcHandlers(ctx)
  createWindow()

  if (getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)) {
    startRefresh(ctx).catch((err) => console.error('background refresh failed', err))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
