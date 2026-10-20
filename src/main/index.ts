import { app, BrowserWindow, dialog, shell } from 'electron'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { registerIpcHandlers, startRefresh, startStats, type AppContext } from '@main/ipc/handlers'
import { createNewsCache } from '@main/news/newsCache'
import { createFantasyCalcClient } from '@main/sources/fantasycalc'
import { createFantasyProsClient } from '@main/sources/fantasypros'
import { createNflverseClient } from '@main/sources/nflverse'
import { createSleeperClient } from '@main/sources/sleeper'
import { createSleeperNewsClient } from '@main/sources/sleeperNews'
import { startStatsWorker, type StatsClient } from '@main/stats/client'
import { STATS_DERIVED_STEP, STATS_MODELS_STEP } from '@main/stats/sync'
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

/** The stats-warehouse files of v0.20–v0.24, replaced by `stats.duckdb` (stats-analysis spec §4). */
const RETIRED_FILES = ['warehouse.db', 'warehouse.db-wal', 'warehouse.db-shm']

function retireWarehouse(): void {
  for (const name of RETIRED_FILES) {
    const path = join(app.getPath('userData'), name)
    try {
      if (existsSync(path)) rmSync(path, { force: true })
    } catch (err) {
      // Locked by another instance (Windows): retried on the next launch.
      console.error(`could not delete ${path}`, err)
    }
  }
}

/** Stats-analysis spec §2: a failure here only disables the stats section, never the app. */
function openStats(): StatsClient | null {
  try {
    return startStatsWorker(
      {
        path: join(app.getPath('userData'), 'stats.duckdb'),
        tempDir: join(app.getPath('userData'), 'stats-tmp')
      },
      (entry) => {
        // Spec §5.3: screens query again once the derived tables (and the models) are rebuilt.
        const rebuilt = entry.source === STATS_DERIVED_STEP || entry.source === STATS_MODELS_STEP
        if (rebuilt && entry.status === 'ok') {
          mainWindow?.webContents.send(IPC.statsChanged)
        }
      }
    )
  } catch (err) {
    console.error('could not start the stats worker; the stats section is off', err)
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
    const client = startStatsWorker({ path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') })
    const test = await client.selfTest()
    await client.close()
    code = test.parquet && test.json && test.icu && test.query && test.rows === 1000 ? 0 : 1
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
    stats: openStats(),
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

  retireWarehouse()
  if (getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)) {
    startRefresh(ctx).catch((err) => console.error('background refresh failed', err))
  } else {
    // Spec §4.4: the stats section works without a league, so its data syncs on its own.
    startStats(ctx).catch((err) => console.error('stats refresh failed', err))
  }
  // Spec §2: the process must not exit while DuckDB runs a statement (Electron aborts), so the first
  // quit closes the stats worker, which interrupts a running refresh, and then quits again.
  let statsClosed = false
  app.on('will-quit', (event) => {
    if (statsClosed || !ctx.stats) return
    event.preventDefault()
    void ctx.stats.close().finally(() => {
      statsClosed = true
      app.quit()
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
