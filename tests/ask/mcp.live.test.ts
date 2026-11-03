import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { startMcpHttp } from '@main/analyst/mcp/http'
import { createMcpServer, toCallResult } from '@main/analyst/mcp/server'
import { createAnalyst } from '@main/analyst/tools'
import { openStatsService } from '@main/stats/service'
import { QUESTION_SET } from './questions'

/**
 * Ask spec §10 (Plan AF2's gate): on the frozen database, every reference call made through the MCP
 * server, in both protocol eras, returns what the analyst returns when called directly. Run with
 * `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask`; the file is copied first.
 */
const DB = process.env.FFC_ASK_DB
const TOKEN = 'gate-token'

const textOf = (r: { content?: unknown; isError?: boolean }): string =>
  `${r.isError ? 'error: ' : ''}${(r.content as { text: string }[]).map((c) => c.text).join('\n')}`

describe.skipIf(!DB || !existsSync(DB))('the reference calls through the MCP server', () => {
  it('match the direct calls in both eras', { timeout: 600_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-ask-mcp-'))
    copyFileSync(DB!, join(dir, 'stats.duckdb'))
    if (existsSync(`${DB}.wal`)) copyFileSync(`${DB}.wal`, join(dir, 'stats.duckdb.wal'))
    const service = await openStatsService(
      { path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') },
      () => {},
      async () => {
        throw new Error('offline')
      }
    )
    const analyst = createAnalyst({ stats: service, league: () => null })
    const http = await startMcpHttp({
      factory: () => createMcpServer({ analyst, version: 'gate', examples: () => [] }),
      token: TOKEN,
      port: 0
    })
    const refs = QUESTION_SET.questions.filter((q) => q.reference && !q.needsLeague)
    const summary: Record<string, unknown> = { references: refs.length }
    try {
      for (const era of ['legacy', 'modern'] as const) {
        const client = new Client(
          { name: 'gate', version: '1' },
          { versionNegotiation: era === 'modern' ? { mode: { pin: '2026-07-28' } } : undefined }
        )
        await client.connect(
          new StreamableHTTPClientTransport(new URL(http.url), {
            requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } }
          })
        )
        const tools = (await client.listTools()).tools.length
        let same = 0
        const ms: number[] = []
        const differ: string[] = []
        for (const q of refs) {
          const { tool, args } = q.reference!
          const direct = textOf(toCallResult(await analyst.run(tool, args, await analyst.turn())))
          const started = Date.now()
          const viaMcp = textOf(await client.callTool({ name: tool, arguments: args }))
          ms.push(Date.now() - started)
          if (viaMcp === direct) same++
          else differ.push(q.id)
        }
        ms.sort((a, b) => a - b)
        summary[era] = {
          tools,
          same: `${same}/${refs.length}`,
          differ,
          ms: {
            p50: ms[Math.floor(ms.length / 2)],
            p90: ms[Math.floor(ms.length * 0.9)],
            max: ms.at(-1)
          }
        }
        await client.close()
        expect(tools).toBe(11)
        expect(differ).toEqual([])
      }
    } finally {
      console.log(JSON.stringify(summary))
      if (process.env.FFC_ASK_MCP_REPORT)
        writeFileSync(process.env.FFC_ASK_MCP_REPORT, JSON.stringify(summary, null, 2))
      await http.close()
      await service.close()
    }
  })
})
