import { randomBytes, randomInt } from 'node:crypto'
import { join } from 'node:path'
import type { McpCopy, McpStatus } from '@shared/ask'
import type { Db } from '@main/db/connection'
import { listAskExamples } from '@main/db/repos/askExamples'
import { getSetting, setSetting } from '@main/db/repos/settings'
import type { Analyst } from '../tools'
import { addToDesktop, type DesktopEntry, desktopConfigPath, desktopState } from './claudeDesktop'
import { markOff, removeEndpoint, writeEndpoint } from './endpoint'
import { type McpHttp, startMcpHttp } from './http'
import { createMcpServer, MCP_NAME } from './server'

/**
 * Claude over MCP in the app (Ask spec §6.1): off by default; when on, the server listens on a port
 * chosen once and kept (so a Claude Code command stays valid), behind a token kept the same way, and
 * `mcp.json` tells the bridge where it is.
 */
export const SETTING_MCP_ENABLED = 'ask_mcp_enabled'
export const SETTING_MCP_PORT = 'ask_mcp_port'
export const SETTING_MCP_TOKEN = 'ask_mcp_token'

/** The shortcut the bridge opens to start the app (Windows). */
export const SHORTCUT_FILE = 'start-for-claude.lnk'

/** Ports tried first: above the usual servers, below Windows' dynamic range (49152+). */
const PORTS: [number, number] = [41000, 49000]

export interface McpServiceDeps {
  db: Db
  /** Null when the stats database could not be opened. */
  analyst: Analyst | null
  userData: string
  version: string
  /** The app's exe and the bundled bridge, as Claude runs them. */
  exe: string
  bridge: string
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  /** Windows: writes the shortcut that starts the app minimised (Electron's `shell.writeShortcutLink`). */
  writeShortcut: ((path: string) => void) | null
  now?: () => Date
  log?: (message: string, err?: unknown) => void
}

export interface McpService {
  status(): McpStatus
  /** Starts the server when it is on (at launch). */
  start(): Promise<void>
  stop(): Promise<void>
  setEnabled(on: boolean): Promise<McpStatus>
  /** A new token: Claude desktop follows through `mcp.json`; a Claude Code command must be copied again. */
  resetToken(): Promise<McpStatus>
  /** The config file that "Add to Claude desktop" edits, or null when Claude desktop is not found. */
  desktopConfig(): string | null
  /** Adds the server to Claude desktop's config; returns the backup's path. */
  addToClaudeDesktop(): string | null
  command(kind: McpCopy): string
}

const NOT_AVAILABLE =
  'The stats database could not be opened on this computer, so Claude has nothing to read.'

/** `C:\Users\me` → `/mnt/c/Users/me`, for a command run in WSL. */
export function wslPath(windows: string): string {
  return windows
    .replace(/^([A-Za-z]):\\/, (_, d: string) => `/mnt/${d.toLowerCase()}/`)
    .replace(/\\/g, '/')
}

/** A word for bash, in single quotes. */
const sh = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

export function createMcpService(deps: McpServiceDeps): McpService {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? ((m, err) => console.error(m, err))
  const shortcut = deps.writeShortcut ? join(deps.userData, SHORTCUT_FILE) : null
  let http: McpHttp | null = null
  let error: string | null = null
  let busy: Promise<void> = Promise.resolve()

  const enabled = (): boolean => getSetting(deps.db, SETTING_MCP_ENABLED) === '1'

  function token(): string {
    const kept = getSetting(deps.db, SETTING_MCP_TOKEN)
    if (kept) return kept
    const made = randomBytes(32).toString('base64url')
    setSetting(deps.db, SETTING_MCP_TOKEN, made)
    return made
  }

  function entry(): DesktopEntry {
    return {
      command: deps.exe,
      args: [deps.bridge, '--user-data', deps.userData, ...(shortcut ? ['--start', shortcut] : [])],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    }
  }

  const desktopConfig = (): string | null => desktopConfigPath(deps.platform, deps.env)

  async function listen(): Promise<void> {
    if (http || !enabled()) return
    if (!deps.analyst) {
      error = NOT_AVAILABLE
      return
    }
    const analyst = deps.analyst
    const key = token()
    const saved = Number(getSetting(deps.db, SETTING_MCP_PORT))
    let port = saved > 0 ? saved : randomInt(...PORTS)
    for (let attempt = 0; !http; attempt++) {
      try {
        http = await startMcpHttp({
          factory: () =>
            createMcpServer({
              analyst,
              version: deps.version,
              examples: () => listAskExamples(deps.db)
            }),
          token: key,
          port,
          onError: (err) => log('MCP request failed', err)
        })
      } catch (err) {
        const code = (err as { code?: string }).code
        // Taken, or reserved by Windows (Hyper-V's excluded ranges answer EACCES): try another.
        if ((code === 'EADDRINUSE' || code === 'EACCES') && attempt < 20) {
          port = randomInt(...PORTS)
          continue
        }
        error = `The server could not start: ${err instanceof Error ? err.message : String(err)}`
        return
      }
    }
    setSetting(deps.db, SETTING_MCP_PORT, String(http.port))
    try {
      writeEndpoint(deps.userData, {
        url: http.url,
        token: key,
        pid: process.pid,
        version: deps.version
      })
    } catch (err) {
      // Without the file the bridge cannot find the server: stop it rather than show it running.
      const open = http
      http = null
      await open.close()
      error = `Claude cannot find the server: ${err instanceof Error ? err.message : String(err)}`
      return
    }
    error = null
    if (shortcut) {
      try {
        deps.writeShortcut!(shortcut)
      } catch (err) {
        log('could not write the shortcut for Claude', err)
      }
    }
  }

  /** Stops the server. Claude on: the file goes, so the bridge may start the app; off: it says so. */
  async function close(): Promise<void> {
    if (enabled()) removeEndpoint(deps.userData)
    else markOff(deps.userData)
    const open = http
    http = null
    await open?.close()
  }

  /** One start or stop at a time. */
  const serial = (fn: () => Promise<void>): Promise<void> => (busy = busy.then(fn, fn))

  function status(): McpStatus {
    const path = desktopConfig()
    return {
      enabled: enabled(),
      windows: deps.platform === 'win32',
      running: http !== null,
      url: http?.url ?? null,
      error: enabled() ? error : null,
      claudeDesktop: { path, state: desktopState(path, entry()) }
    }
  }

  return {
    status,
    // Claude off at launch: the marker replaces whatever a crash left, so the bridge neither starts
    // the app nor sends the token to whatever holds the old port now.
    start: () =>
      serial(async () => {
        if (enabled()) await listen()
        else markOff(deps.userData)
      }),
    stop: () => serial(close),
    async setEnabled(on) {
      setSetting(deps.db, SETTING_MCP_ENABLED, on ? '1' : '0')
      await serial(on ? listen : close)
      return status()
    },
    async resetToken() {
      setSetting(deps.db, SETTING_MCP_TOKEN, randomBytes(32).toString('base64url'))
      await serial(async () => {
        if (!http) return
        await close()
        await listen()
      })
      return status()
    },
    desktopConfig,
    addToClaudeDesktop() {
      const path = desktopConfig()
      if (!path)
        throw new Error('Claude desktop was not found on this computer; copy its config instead')
      return addToDesktop(path, entry(), now())
    },
    command(kind) {
      if (kind === 'claude-desktop')
        return `${JSON.stringify({ mcpServers: { [MCP_NAME]: entry() } }, null, 2)}\n`
      if (kind === 'claude-code-wsl') {
        // WSL's default (NAT) networking cannot reach Windows' 127.0.0.1: Claude Code there runs the
        // bridge through WSL interop, with the variable passed on by WSLENV.
        const e = entry()
        return [
          `claude mcp add ${MCP_NAME} --scope user -e ELECTRON_RUN_AS_NODE=1 -e WSLENV=ELECTRON_RUN_AS_NODE --`,
          sh(wslPath(e.command)),
          ...e.args.map(sh)
        ].join(' ')
      }
      if (!http) throw new Error('Turn Claude on first: the command names the running server')
      return `claude mcp add ${MCP_NAME} --scope user --transport http ${http.url} --header "Authorization: Bearer ${token()}"`
    }
  }
}
