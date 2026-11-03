import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { NOT_RUNNING, runBridge, TURNED_OFF } from '@main/analyst/mcp/bridge'
import {
  ENDPOINT_FILE,
  markOff,
  readEndpoint,
  removeEndpoint,
  writeEndpoint
} from '@main/analyst/mcp/endpoint'
import { startMcpHttp, type McpHttp } from '@main/analyst/mcp/http'
import { createMcpServer } from '@main/analyst/mcp/server'
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

const servers: McpHttp[] = []
const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const c of closers.splice(0)) await c()
  for (const s of servers.splice(0)) await s.close()
})

/** The app: its MCP server, and `mcp.json` in `dir`. */
async function app(dir: string, token: string): Promise<McpHttp> {
  const analyst = createAnalyst({ stats, league: () => null })
  const http = await startMcpHttp({
    factory: () => createMcpServer({ analyst, version: '0.38.0', examples: () => [] }),
    token,
    port: 0
  })
  servers.push(http)
  writeEndpoint(dir, { url: http.url, token, pid: process.pid, version: '0.38.0' })
  return http
}

/** Claude desktop: a client on the bridge's stdio. */
async function claude(
  dir: string,
  options: { era?: 'legacy' | 'modern'; start?: string | null; launch?: () => void } = {}
): Promise<{ client: Client; logs: string[]; launches: number }> {
  const toBridge = new PassThrough()
  const fromBridge = new PassThrough()
  const logs: string[] = []
  const state = { client: null as unknown as Client, logs, launches: 0 }
  const done = runBridge({
    userData: dir,
    start: options.start ?? null,
    input: toBridge,
    output: fromBridge,
    log: (l) => logs.push(l),
    launch: () => {
      state.launches++
      options.launch?.()
    },
    waitMs: 3_000,
    pollMs: 50
  })
  const client = new Client(
    { name: 'claude-desktop', version: '1' },
    {
      capabilities: { elicitation: { form: {} } },
      versionNegotiation: options.era === 'modern' ? { mode: { pin: '2026-07-28' } } : undefined
    }
  )
  client.setRequestHandler('elicitation/create', async () => ({
    action: 'accept',
    content: { player: '00-0032000' }
  }))
  closers.push(async () => {
    await client.close()
    toBridge.end()
    await done
  })
  await client.connect(new StdioServerTransport(fromBridge, toBridge))
  state.client = client
  return state
}

const textOf = (r: { content?: unknown }): string =>
  (r.content as { text: string }[]).map((c) => c.text).join('\n')

const tempDir = (): string => mkdtempSync(join(tmpdir(), 'ffc-mcp-'))

describe('the stdio bridge (Ask spec §6.1)', () => {
  it.each(['legacy', 'modern'] as const)('carries a %s-era session to the app', async (era) => {
    const dir = tempDir()
    await app(dir, 'token-a')
    const { client } = await claude(dir, { era })
    expect((await client.listTools()).tools).toHaveLength(11)
    const r = await client.callTool({ name: 'find', arguments: { text: 'Chris Jones' } })
    // The elicitation rides the 2026-07-28 result through the bridge; a 2025 client gets the list.
    if (era === 'modern') expect(textOf(r)).toContain('The user chose Chris Jones (00-0032000).')
    else expect(textOf(r)).toMatch(/00-0032000[\s\S]*00-0032001/)
  })

  it('follows the app to a new port and token after a restart', async () => {
    const dir = tempDir()
    const first = await app(dir, 'token-a')
    const { client } = await claude(dir)
    expect((await client.listTools()).tools).toHaveLength(11)
    await first.close()
    servers.splice(servers.indexOf(first), 1)
    await app(dir, 'token-b')
    const r = await client.callTool({ name: 'describe', arguments: { metric: 'yprr' } })
    expect(textOf(r)).toMatch(/^Yards per route run/)
  })

  it('answers every request with what to do when the app is not running', async () => {
    const dir = tempDir()
    await app(dir, 'token-a')
    const { client } = await claude(dir)
    removeEndpoint(dir)
    await servers.pop()!.close()
    await expect(client.listTools()).rejects.toThrow(NOT_RUNNING)
  })

  it('starts the app through its shortcut, once at a time, and again if it quits', async () => {
    const dir = tempDir()
    // A stale file from a crash: its port no longer answers.
    writeFileSync(
      join(dir, ENDPOINT_FILE),
      JSON.stringify({ url: 'http://127.0.0.1:9/mcp', token: 'old', pid: 1, version: '0.37.0' })
    )
    const s = await claude(dir, {
      start: 'C:\\Users\\me\\AppData\\Roaming\\FantasyCompanion\\start-for-claude.lnk',
      launch: () => void setTimeout(() => void app(dir, 'token-c'), 200)
    })
    expect(s.launches).toBe(1)
    expect((await s.client.listTools()).tools).toHaveLength(11)
    expect(readEndpoint(dir)?.token).toBe('token-c')
    expect(s.logs.filter((l) => l === 'starting FantasyCompanion')).toHaveLength(1)
    // The app quits; the next questions start it again, once for both.
    removeEndpoint(dir)
    await servers.pop()!.close()
    const [tools, described] = await Promise.all([
      s.client.listTools(),
      s.client.callTool({ name: 'describe', arguments: { metric: 'yprr' } })
    ])
    expect(tools.tools).toHaveLength(11)
    expect(textOf(described)).toMatch(/^Yards per route run/)
    expect(s.launches).toBe(2)
  })

  it('says Claude is off at once, and does not start the app (amendment K)', async () => {
    const dir = tempDir()
    markOff(dir)
    let launched = 0
    const started = Date.now()
    const s = await claude(dir, {
      start: 'start-for-claude.lnk',
      launch: () => launched++
    }).catch((err: Error) => ({ error: err }))
    expect('error' in s && s.error.message).toBe(TURNED_OFF)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(launched).toBe(0)
  })

  it('does not start the app when it runs but a call fails', async () => {
    const dir = tempDir()
    const broken = createServer((_req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end('{"error":"internal error"}')
    })
    await new Promise<void>((r) => broken.listen(0, '127.0.0.1', r))
    closers.push(() => new Promise((r) => broken.close(() => r())))
    const port = (broken.address() as { port: number }).port
    writeEndpoint(dir, {
      url: `http://127.0.0.1:${port}/mcp`,
      token: 't',
      pid: 1,
      version: '0.38.0'
    })
    const s = await claude(dir, { start: 'start-for-claude.lnk' }).catch((err: Error) => ({
      error: err
    }))
    expect('error' in s && s.error.message).toMatch(/^FantasyCompanion could not answer: /)
  })
})
