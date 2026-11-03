import { app, BrowserWindow, dialog, shell } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { companionLeague } from '@main/analyst/league'
import { registerMcpHandlers } from '@main/analyst/mcp/ipc'
import { mcpSelfTest } from '@main/analyst/mcp/selfTest'
import { createMcpService, type McpService } from '@main/analyst/mcp/service'
import { createAnalyst } from '@main/analyst/tools'
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
import { captureMainErrors, createErrorLog } from '@main/dev/errorLog'
import { registerDevHandlers } from '@main/dev/ipc'
import { createDevMode } from '@main/dev/mode'
import { installAutoUpdater } from '@main/updater'
import { IPC } from '@shared/ipc'

let mainWindow: BrowserWindow | null = null

/** Ask spec §6.1: the shortcut the MCP bridge opens starts the app this way. */
const MINIMIZED_FLAG = '--minimized'

// Dev-mode spec §4: the recent-errors buffer runs from launch, whatever the mode.
const errorLog = createErrorLog()
captureMainErrors(errorLog)

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

  mainWindow.on('ready-to-show', () => {
    if (process.argv.includes(MINIMIZED_FLAG)) mainWindow?.minimize()
    else mainWindow?.show()
  })
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

/**
 * `--mcp-self-test=<file>` (Ask spec §10): the packaged app runs its MCP bridge as Node from the asar
 * and calls a tool through it, writes the result as JSON to `<file>`, and exits 0 on success. CI runs
 * it on the Windows build.
 */
const MCP_SELF_TEST_FLAG = '--mcp-self-test='

/** Bundled beside the main entry by `electron.vite.config.ts`. */
const mcpBridgePath = (): string => join(__dirname, 'mcpBridge.js')

async function runMcpSelfTest(out: string): Promise<number> {
  const dir = join(tmpdir(), `ffc-mcp-self-test-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const result = await mcpSelfTest({
    exe: process.execPath,
    bridge: mcpBridgePath(),
    dir,
    version: app.getVersion()
  }).catch((err: unknown) => ({
    ok: false,
    error: err instanceof Error ? err.message : String(err)
  }))
  writeFileSync(out, JSON.stringify(result))
  rmSync(dir, { recursive: true, force: true })
  return result.ok ? 0 : 1
}

// Ask spec §6.1: one process holds the databases. A second launch (the MCP bridge's shortcut, or a
// double-click) hands over to the first and quits; the self-tests run on their own.
const selfTesting = process.argv.some(
  (a) => a.startsWith(SELF_TEST_FLAG) || a.startsWith(MCP_SELF_TEST_FLAG)
)
const primary = selfTesting || app.requestSingleInstanceLock()
if (!primary) app.quit()
app.on('second-instance', (_event, argv) => {
  if (!mainWindow || argv.includes(MINIMIZED_FLAG)) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  if (!primary) return
  const selfTest = process.argv.find((a) => a.startsWith(SELF_TEST_FLAG))
  if (selfTest) {
    app.exit(await runStatsSelfTest(selfTest.slice(SELF_TEST_FLAG.length)))
    return
  }
  const mcpTest = process.argv.find((a) => a.startsWith(MCP_SELF_TEST_FLAG))
  if (mcpTest) {
    app.exit(await runMcpSelfTest(mcpTest.slice(MCP_SELF_TEST_FLAG.length)))
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
  const mcp = startMcp(ctx)
  registerDevHandlers({
    db: ctx.db,
    mode: createDevMode({ db: ctx.db, packaged: app.isPackaged, argv: process.argv }),
    errors: errorLog,
    getWindow: () => mainWindow
  })
  createWindow()

  retireWarehouse()
  if (getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)) {
    startRefresh(ctx).catch((err) => console.error('background refresh failed', err))
  } else {
    // Spec §4.4: the stats section works without a league, so its data syncs on its own.
    startStats(ctx).catch((err) => console.error('stats refresh failed', err))
  }
  // Spec §2: the process must not exit while DuckDB runs a statement (Electron aborts), so the first
  // quit stops the MCP server (Ask spec §6.1: `mcp.json` goes with it), closes the stats worker,
  // which interrupts a running refresh, and then quits again.
  let closed = false
  app.on('will-quit', (event) => {
    if (closed) return
    event.preventDefault()
    void mcp
      .stop()
      .catch((err: unknown) => console.error('could not stop the MCP server', err))
      .then(() => ctx.stats?.close())
      .finally(() => {
        closed = true
        app.quit()
      })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

/** Ask spec §6.1: the analyst tools behind MCP, on when the user turned them on (Stats › Ask). */
function startMcp(ctx: AppContext): McpService {
  const analyst = ctx.stats
    ? createAnalyst({
        stats: ctx.stats,
        league: () => {
          const id = getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)
          return id ? companionLeague(ctx.db, id) : null
        }
      })
    : null
  const mcp = createMcpService({
    db: ctx.db,
    analyst,
    userData: app.getPath('userData'),
    version: app.getVersion(),
    exe: process.execPath,
    bridge: mcpBridgePath(),
    platform: process.platform,
    env: process.env,
    // A dev run's exe is electron.exe, which needs the app's path: no shortcut, so the bridge only
    // finds a running dev app and never starts the default Electron app.
    writeShortcut:
      process.platform === 'win32' && app.isPackaged
        ? (path) => {
            const ok = shell.writeShortcutLink(path, 'create', {
              target: process.execPath,
              args: MINIMIZED_FLAG,
              description: 'Starts FantasyCompanion for Claude'
            })
            if (!ok) throw new Error(`could not write ${path}`)
          }
        : null
  })
  registerMcpHandlers(mcp, () => mainWindow)
  mcp.start().catch((err) => console.error('could not start the MCP server', err))
  return mcp
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
