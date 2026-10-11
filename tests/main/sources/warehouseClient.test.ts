import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { createWarehouseClient, WarehouseHttpError } from '@main/sources/warehouse/client'

const REL = 'https://rel'
const SL = 'https://sl'

function setup(routes: Record<string, () => Response>): {
  urls: string[]
  client: ReturnType<typeof createWarehouseClient>
} {
  const urls: string[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    const route = routes[url]
    return route ? route() : new Response('', { status: 404 })
  })
  const client = createWarehouseClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    releasesUrl: REL,
    sleeperStatsUrl: SL,
    retryDelayMs: 0
  })
  return { urls, client }
}

describe('createWarehouseClient', () => {
  it('reads <name>.csv.gz first and gunzips it', async () => {
    const { urls, client } = setup({
      [`${REL}/injuries/injuries_2025.csv.gz`]: () =>
        new Response(gzipSync(Buffer.from('a,b\n1,2\n')))
    })
    expect(await client.nflverseCsv('injuries', 'injuries_2025')).toBe('a,b\n1,2\n')
    expect(urls).toEqual([`${REL}/injuries/injuries_2025.csv.gz`])
  })

  it('falls back to <name>.csv when the .gz is missing', async () => {
    const { urls, client } = setup({
      [`${REL}/injuries/injuries_2019.csv`]: () => new Response('a\n1\n')
    })
    expect(await client.nflverseCsv('injuries', 'injuries_2019')).toBe('a\n1\n')
    expect(urls).toEqual([
      `${REL}/injuries/injuries_2019.csv.gz`,
      `${REL}/injuries/injuries_2019.csv`
    ])
  })

  it('returns null when neither file exists', async () => {
    const { client } = setup({})
    expect(await client.nflverseCsv('ftn_charting', 'ftn_charting_2019')).toBeNull()
    expect(await client.text('https://ff/ep_weekly_2030.csv')).toBeNull()
  })

  it('throws WarehouseHttpError on other failures (after one retry on 5xx)', async () => {
    const { urls, client } = setup({
      'https://ff/x.csv': () => new Response('down', { status: 503 })
    })
    await expect(client.text('https://ff/x.csv')).rejects.toBeInstanceOf(WarehouseHttpError)
    expect(urls).toHaveLength(2)
  })

  it('reads Sleeper weekly stats; a week Sleeper does not know is empty', async () => {
    const { urls, client } = setup({
      [`${SL}/2025/5?season_type=regular`]: () => new Response('[{"player_id":"4866"}]')
    })
    expect(await client.sleeperStats(2025, 5, 'regular')).toEqual([{ player_id: '4866' }])
    expect(await client.sleeperStats(2025, 1, 'post')).toEqual([])
    expect(urls).toEqual([`${SL}/2025/5?season_type=regular`, `${SL}/2025/1?season_type=post`])
  })

  it('rejects a Sleeper answer that is not a list, or not JSON', async () => {
    const { client } = setup({
      [`${SL}/2025/1?season_type=regular`]: () => new Response('{"error":"rate limited"}'),
      [`${SL}/2025/2?season_type=regular`]: () => new Response('<html>busy</html>')
    })
    await expect(client.sleeperStats(2025, 1, 'regular')).rejects.toThrow(
      'Sleeper stats: expected a list'
    )
    await expect(client.sleeperStats(2025, 2, 'regular')).rejects.toThrow(
      'Sleeper stats: unreadable response'
    )
  })
})
