import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { type AnalystStats, createAnalyst } from '../tools'
import { writeEndpoint } from './endpoint'
import { startMcpHttp } from './http'
import { createMcpServer } from './server'

/**
 * The packaged gate for Claude over MCP (Ask spec §10): the app's exe runs the bundled bridge in
 * Node mode from inside the asar, and a client on its stdio lists the tools and calls one through it,
 * in both protocol eras. The analyst reads no database here (DuckDB has its own self-test).
 */
export interface McpSelfTest {
  ok: boolean
  legacy?: { tools: number; find: string }
  modern?: { tools: number; find: string }
  error?: string
}

const STATS: AnalystStats = {
  status: async () => ({
    available: true,
    through: { season: 2026, seasonType: 'REG', week: 1 },
    updatedAt: '2026-09-10T00:00:00Z',
    busy: false
  }),
  catalogue: async () => [],
  people: async () => [],
  query: async () => {
    throw new Error('no database in the self-test')
  },
  games: async () => [],
  outlook: async () => {
    throw new Error('no database in the self-test')
  },
  player: async () => {
    throw new Error('no database in the self-test')
  }
}

export async function mcpSelfTest(options: {
  exe: string
  bridge: string
  dir: string
  version: string
}): Promise<McpSelfTest> {
  const token = randomBytes(16).toString('hex')
  const analyst = createAnalyst({ stats: STATS, league: () => null })
  const http = await startMcpHttp({
    factory: () => createMcpServer({ analyst, version: options.version, examples: () => [] }),
    token,
    port: 0
  })
  writeEndpoint(options.dir, { url: http.url, token, pid: process.pid, version: options.version })
  const result: McpSelfTest = { ok: false }
  try {
    for (const era of ['legacy', 'modern'] as const) {
      const client = new Client(
        { name: 'self-test', version: options.version },
        { versionNegotiation: era === 'modern' ? { mode: { pin: '2026-07-28' } } : undefined }
      )
      await client.connect(
        new StdioClientTransport({
          command: options.exe,
          args: [options.bridge, '--user-data', options.dir],
          env: { ...(process.env as Record<string, string>), ELECTRON_RUN_AS_NODE: '1' }
        })
      )
      const { tools } = await client.listTools()
      const found = await client.callTool({
        name: 'find',
        arguments: { text: 'yards per route run', kind: 'metric' }
      })
      const text = (found.content as { type: string; text?: string }[])
        .map((c) => c.text ?? '')
        .join('\n')
      result[era] = { tools: tools.length, find: text.split('\n')[1] ?? '' }
      await client.close()
    }
    result.ok =
      result.legacy?.tools === 11 &&
      result.modern?.tools === 11 &&
      [result.legacy.find, result.modern.find].every((l) => l.startsWith('Metric: yprr'))
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
  } finally {
    await http.close()
  }
  return result
}
