import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import type { StatsQuery, StatsRow } from '@shared/stats/types'
import { startMcpHttp, type McpHttp } from '@main/analyst/mcp/http'
import { createMcpServer, MCP_NAME, RESOURCES } from '@main/analyst/mcp/server'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult } from '../../fixtures/analyst'

const TOKEN = 'test-token-0123456789'

function stats(answer: (q: StatsQuery) => StatsRow[] = () => [], ready = true): AnalystStats {
  return {
    status: async () => ({
      available: true,
      through: ready ? { season: 2026, seasonType: 'REG', week: 7 } : null,
      updatedAt: '2026-10-27T00:00:00Z',
      busy: false
    }),
    catalogue: async () => catalogueInfo(new Map()),
    people: async () => PEOPLE,
    query: async (q) => statsResult(answer(q)),
    games: async () => [],
    outlook: async () => {
      throw new Error('not in this test')
    },
    player: async () => {
      throw new Error('not in this test')
    }
  }
}

let open: McpHttp | null = null
afterEach(async () => {
  await open?.close()
  open = null
})

async function serve(s = stats()): Promise<McpHttp> {
  const analyst = createAnalyst({ stats: s, league: () => null })
  open = await startMcpHttp({
    factory: () => createMcpServer({ analyst, version: '0.38.0', examples: () => [] }),
    token: TOKEN,
    port: 0
  })
  return open
}

type Era = 'legacy' | 'modern'

async function connect(
  http: McpHttp,
  era: Era,
  elicit?: (message: string) => { action: 'accept' | 'decline'; content?: Record<string, string> }
): Promise<Client> {
  const client = new Client(
    { name: 'test', version: '1.0.0' },
    {
      capabilities: elicit ? { elicitation: { form: {} } } : {},
      versionNegotiation: era === 'modern' ? { mode: { pin: '2026-07-28' } } : undefined
    }
  )
  if (elicit)
    client.setRequestHandler('elicitation/create', async (req) =>
      elicit((req.params as { message: string }).message)
    )
  await client.connect(
    new StreamableHTTPClientTransport(new URL(http.url), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } }
    })
  )
  return client
}

const textOf = (r: { content?: unknown }): string =>
  (r.content as { type: string; text: string }[]).map((c) => c.text).join('\n')

describe.each<Era>(['legacy', 'modern'])('the MCP server, %s protocol era', (era) => {
  it('lists the full profile with the brief as instructions', async () => {
    const client = await connect(await serve(), era)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([
      'find',
      'leaderboard',
      'player_stats',
      'team_stats',
      'compare',
      'trend',
      'outlook',
      'games',
      'league',
      'describe',
      'query'
    ])
    const board = tools.find((t) => t.name === 'leaderboard')!
    expect(board.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false })
    expect(board.inputSchema.required).toEqual(['metric'])
    // The metric ids are left out of what Claude reads; the analyst checks them.
    expect(board.inputSchema.properties!.metric).toEqual({
      type: 'string',
      description: 'A metric id, such as yprr or rush_epa; find gives the ids for a stat’s name.'
    })
    expect(JSON.stringify(tools).length).toBeLessThan(20_000)
    expect(board.outputSchema).toBeUndefined()
    expect(client.getServerVersion()?.name).toBe(MCP_NAME)
    expect(client.getInstructions()).toContain('2019–2026')
    await client.close()
  })

  it('answers with the compact text, and an invalid call with an error that teaches', async () => {
    const client = await connect(await serve(), era)
    const good = await client.callTool({ name: 'describe', arguments: { metric: 'yprr' } })
    expect(good.isError).toBeFalsy()
    expect(textOf(good)).toMatch(/^Yards per route run/)
    expect(good.structuredContent).toBeUndefined()
    const label = await client.callTool({
      name: 'leaderboard',
      arguments: { metric: 'yards per route run' }
    })
    expect(label.isError).toBe(true)
    expect(textOf(label)).toMatch(/did you mean yprr \(Yards per route run\)/)
    const bad = await client.callTool({
      name: 'player_stats',
      arguments: { player: 'Bijan' }
    })
    expect(bad.isError).toBe(true)
    expect(textOf(bad)).toBe(
      'arguments.player is not valid ("Bijan"). "Bijan" matched 00-0038542 Bijan Robinson (RB, ATL).'
    )
    await client.close()
  })

  it('serves the analyst prompt and the resources', async () => {
    const client = await connect(await serve(), era)
    const prompt = await client.getPrompt({
      name: 'analyst',
      arguments: { question: 'who leads WRs in YPRR?' }
    })
    expect(textOf({ content: prompt.messages.map((m) => m.content) })).toMatch(
      /Question: who leads WRs in YPRR\?$/
    )
    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri).sort()).toEqual(Object.values(RESOURCES).sort())
    const yaml = await client.readResource({ uri: RESOURCES.semanticModel })
    expect((yaml.contents[0] as { text: string }).text).toMatch(/yprr/)
    await client.close()
  })

  it('still lists the tools while the stats are being built', async () => {
    const client = await connect(await serve(stats(undefined, false)), era)
    expect((await client.listTools()).tools).toHaveLength(11)
    const r = await client.callTool({ name: 'describe', arguments: { metric: 'yprr' } })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/still being built/)
    await client.close()
  })
})

describe('the HTTP endpoint (Ask spec §6.1)', () => {
  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'curl', version: '1' }
    }
  }
  const post = (url: string, headers: Record<string, string>): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers
      },
      body: JSON.stringify(initialize)
    })

  it('listens on 127.0.0.1 and wants the bearer token', async () => {
    const http = await serve()
    expect(http.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    expect((await post(http.url, { authorization: `Bearer ${TOKEN}` })).status).toBe(200)
    expect((await post(http.url, {})).status).toBe(401)
    expect((await post(http.url, { authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await post(http.url, { authorization: `Bearer ${TOKEN}x` })).status).toBe(401)
  })

  it('refuses web pages (Origin), other host names (Host) and other paths', async () => {
    const http = await serve()
    const auth = { authorization: `Bearer ${TOKEN}` }
    expect((await post(http.url, { ...auth, origin: 'https://example.com' })).status).toBe(403)
    expect(
      (await post(http.url, { ...auth, origin: `http://localhost:${http.port}` })).status
    ).toBe(200)
    // fetch cannot set Host: a DNS-rebinding page's request names its own host.
    const rebound = await new Promise<number>((resolve, reject) => {
      const req = request(
        http.url,
        { method: 'POST', headers: { ...auth, host: `evil.example:${http.port}` } },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        }
      )
      req.on('error', reject)
      req.end(JSON.stringify(initialize))
    })
    expect(rebound).toBe(403)
    expect((await post(http.url.replace('/mcp', '/other'), auth)).status).toBe(404)
  })

  it('fails to start on a port in use', async () => {
    const http = await serve()
    await expect(
      startMcpHttp({
        factory: () => new McpServer({ name: 'x', version: '1' }),
        token: 't',
        port: http.port
      })
    ).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })
})

describe('namesakes over MCP (Ask spec §4.1)', () => {
  it('asks which player by elicitation on the 2026-07-28 era', async () => {
    const asked: string[] = []
    const client = await connect(await serve(), 'modern', (message) => {
      asked.push(message)
      return { action: 'accept', content: { player: '00-0032001' } }
    })
    const r = await client.callTool({ name: 'find', arguments: { text: 'Chris Jones' } })
    expect(asked).toEqual(['Which Chris Jones?'])
    expect(textOf(r)).toContain('Player: Chris Jones = 00-0032001 (DB, ARI)')
    expect(textOf(r)).not.toContain('00-0032000')
    expect(textOf(r)).toContain('The user chose Chris Jones (00-0032001).')
    await client.close()
  })

  it('lists every namesake when the user declines or the client cannot ask', async () => {
    const declined = await connect(await serve(), 'modern', () => ({ action: 'decline' }))
    const r = await declined.callTool({ name: 'find', arguments: { text: 'Chris Jones' } })
    expect(textOf(r)).toContain('00-0032000')
    expect(textOf(r)).toContain('00-0032001')
    await declined.close()
    const legacy = await connect(open!, 'legacy', () => ({ action: 'accept' }))
    const l = await legacy.callTool({ name: 'find', arguments: { text: 'Chris Jones' } })
    expect(textOf(l)).toContain('00-0032000')
    expect(textOf(l)).toContain('00-0032001')
    await legacy.close()
  })
})
