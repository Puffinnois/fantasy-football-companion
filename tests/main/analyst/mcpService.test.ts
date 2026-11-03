import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting, setSetting } from '@main/db/repos/settings'
import { CONFIG_FILE } from '@main/analyst/mcp/claudeDesktop'
import { readEndpoint } from '@main/analyst/mcp/endpoint'
import {
  createMcpService,
  type McpService,
  type McpServiceDeps,
  SETTING_MCP_PORT,
  SETTING_MCP_TOKEN,
  SHORTCUT_FILE,
  wslPath
} from '@main/analyst/mcp/service'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult } from '../../fixtures/analyst'

const stats: AnalystStats = {
  status: async () => ({
    available: true,
    through: { season: 2026, seasonType: 'REG', week: 7 },
    updatedAt: '2026-10-27T00:00:00Z',
    busy: false
  }),
  catalogue: async () => catalogueInfo(new Map()),
  people: async () => PEOPLE,
  query: async () => statsResult([]),
  games: async () => [],
  outlook: async () => {
    throw new Error('not in this test')
  },
  player: async () => {
    throw new Error('not in this test')
  }
}

const running: McpService[] = []
afterEach(async () => {
  for (const s of running.splice(0)) await s.stop()
})

function service(over: Partial<McpServiceDeps> = {}): {
  mcp: McpService
  deps: McpServiceDeps
  shortcuts: string[]
} {
  const db = openDatabase(':memory:')
  migrate(db)
  const userData = mkdtempSync(join(tmpdir(), 'ffc-user-'))
  const shortcuts: string[] = []
  const deps: McpServiceDeps = {
    db,
    analyst: createAnalyst({ stats, league: () => null }),
    userData,
    version: '0.38.0',
    exe: 'C:\\Users\\me\\AppData\\Local\\Programs\\FantasyCompanion\\FantasyCompanion.exe',
    bridge:
      'C:\\Users\\me\\AppData\\Local\\Programs\\FantasyCompanion\\resources\\app.asar\\out\\main\\mcpBridge.js',
    platform: 'win32',
    env: {},
    writeShortcut: (path) => shortcuts.push(path),
    now: () => new Date('2026-11-02T14:05:09Z'),
    log: () => {},
    ...over
  }
  const mcp = createMcpService(deps)
  running.push(mcp)
  return { mcp, deps, shortcuts }
}

describe('the MCP service (Ask spec §6.1)', () => {
  it('is off by default and starts nothing', async () => {
    const { mcp, deps } = service()
    await mcp.start()
    expect(mcp.status()).toMatchObject({ enabled: false, running: false, url: null, error: null })
    expect(readEndpoint(deps.userData)).toBeNull()
  })

  it('turned on: listens on a port it keeps, writes mcp.json and the shortcut', async () => {
    const { mcp, deps, shortcuts } = service()
    const on = await mcp.setEnabled(true)
    expect(on).toMatchObject({ enabled: true, running: true, error: null, windows: true })
    const port = Number(getSetting(deps.db, SETTING_MCP_PORT))
    expect(port).toBeGreaterThanOrEqual(41000)
    expect(port).toBeLessThan(49000)
    expect(on.url).toBe(`http://127.0.0.1:${port}/mcp`)
    const token = getSetting(deps.db, SETTING_MCP_TOKEN)!
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(readEndpoint(deps.userData)).toEqual({
      url: on.url,
      token,
      pid: process.pid,
      version: '0.38.0'
    })
    expect(shortcuts).toEqual([join(deps.userData, SHORTCUT_FILE)])
    // A restart of the app keeps the port and the token.
    await mcp.stop()
    expect(readEndpoint(deps.userData)).toBeNull()
    await mcp.start()
    expect(mcp.status().url).toBe(on.url)
    expect(readEndpoint(deps.userData)?.token).toBe(token)
    const off = await mcp.setEnabled(false)
    expect(off).toMatchObject({ enabled: false, running: false })
    expect(readEndpoint(deps.userData)).toBeNull()
  })

  it('moves to another port when its own is taken', async () => {
    const taken = createServer()
    await new Promise<void>((r) => taken.listen(0, '127.0.0.1', r))
    const port = (taken.address() as { port: number }).port
    const { mcp, deps } = service()
    setSetting(deps.db, SETTING_MCP_PORT, String(port))
    const s = await mcp.setEnabled(true)
    taken.close()
    expect(s.running).toBe(true)
    expect(s.url).not.toContain(`:${port}/`)
    expect(getSetting(deps.db, SETTING_MCP_PORT)).not.toBe(String(port))
  })

  it('says why it cannot run without the stats database', async () => {
    const { mcp } = service({ analyst: null })
    const s = await mcp.setEnabled(true)
    expect(s).toMatchObject({ enabled: true, running: false })
    expect(s.error).toMatch(/stats database could not be opened/)
  })

  it('resets the token and writes it for the bridge', async () => {
    const { mcp, deps } = service()
    await mcp.setEnabled(true)
    const before = readEndpoint(deps.userData)!.token
    const s = await mcp.resetToken()
    expect(s.running).toBe(true)
    expect(readEndpoint(deps.userData)!.token).not.toBe(before)
    expect(readEndpoint(deps.userData)!.token).toBe(getSetting(deps.db, SETTING_MCP_TOKEN))
  })

  it('copies the commands for Claude Code (HTTP, or the bridge from WSL) and Claude desktop', async () => {
    const { mcp, deps } = service()
    expect(() => mcp.command('claude-code')).toThrow(/Turn Claude on first/)
    const s = await mcp.setEnabled(true)
    const token = getSetting(deps.db, SETTING_MCP_TOKEN)
    expect(mcp.command('claude-code')).toBe(
      `claude mcp add fantasy-companion --scope user --transport http ${s.url} --header "Authorization: Bearer ${token}"`
    )
    const lnk = join(deps.userData, SHORTCUT_FILE)
    expect(mcp.command('claude-code-wsl')).toBe(
      "claude mcp add fantasy-companion --scope user -e ELECTRON_RUN_AS_NODE=1 -e WSLENV=ELECTRON_RUN_AS_NODE -- '/mnt/c/Users/me/AppData/Local/Programs/FantasyCompanion/FantasyCompanion.exe' " +
        `'${deps.bridge}' '--user-data' '${deps.userData}' '--start' '${lnk}'`
    )
    expect(JSON.parse(mcp.command('claude-desktop'))).toEqual({
      mcpServers: {
        'fantasy-companion': {
          command: deps.exe,
          args: [deps.bridge, '--user-data', deps.userData, '--start', lnk],
          env: { ELECTRON_RUN_AS_NODE: '1' }
        }
      }
    })
    expect(wslPath("D:\\O'Brien\\x.exe")).toBe("/mnt/d/O'Brien/x.exe")
  })

  it('adds itself to Claude desktop’s config, which the status then reads', async () => {
    const local = mkdtempSync(join(tmpdir(), 'ffc-local-'))
    const dir = join(local, 'Claude-Data', 'claude_pzs8sxrjxfjjc')
    mkdirSync(dir, { recursive: true })
    const { mcp } = service({ env: { LOCALAPPDATA: local } })
    expect(mcp.status().claudeDesktop).toEqual({ path: join(dir, CONFIG_FILE), state: 'absent' })
    expect(mcp.addToClaudeDesktop()).toBeNull()
    expect(mcp.status().claudeDesktop.state).toBe('added')
    const saved = JSON.parse(readFileSync(join(dir, CONFIG_FILE), 'utf8'))
    expect(saved.mcpServers['fantasy-companion'].env).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
    const nowhere = service({ env: {} })
    expect(nowhere.mcp.status().claudeDesktop).toEqual({ path: null, state: 'not-found' })
    expect(() => nowhere.mcp.addToClaudeDesktop()).toThrow(/Claude desktop was not found/)
  })
})
