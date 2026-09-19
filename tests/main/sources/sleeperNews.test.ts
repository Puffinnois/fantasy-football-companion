import { describe, expect, it, vi } from 'vitest'
import {
  createSleeperNewsClient,
  mapPlayerNews,
  NEWS_LIMIT,
  newsQuery,
  SLEEPER_GRAPHQL_URL,
  SLEEPER_NEWS_USER_AGENT,
  SleeperNewsError
} from '@main/sources/sleeperNews'
import {
  fantasyProsItem,
  newsResponse,
  rawNews,
  rotoballerItem,
  rotowireItem
} from '../../fixtures/sleeperNews'

interface Call {
  url: string
  init: RequestInit
}

function fakeFetch(status: number, body: unknown): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const FETCHED = '2026-09-19T12:00:00.000Z'

describe('mapPlayerNews', () => {
  it('maps the fields, converts milliseconds to ISO and sorts newest first', () => {
    const { items, fetchedAt } = mapPlayerNews(rawNews, FETCHED)
    expect(fetchedAt).toBe(FETCHED)
    expect(items.map((i) => i.id)).toEqual([
      'rotoballer:221423',
      'fantasy_pros:608417',
      'rotowire:nfl637886'
    ])
    expect(items[1]).toEqual({
      id: 'fantasy_pros:608417',
      source: 'fantasy_pros',
      publishedAt: '2026-09-16T20:45:22.615Z',
      title: 'Patrick Mahomes II (knee) listed as full participant Wednesday',
      description:
        'Patrick Mahomes II (knee) was listed as a full participant in practice on Wednesday.',
      analysis:
        'As expected, Mahomes continues to carry on at full health, logging a full practice session Wednesday.',
      url: 'https://www.fantasypros.com/nfl/news/608417/patrick-mahomes-ii-knee-listed-full-participant-wednesday.php'
    })
    expect(items[0].analysis).toBeNull()
    expect(items[2].publishedAt).toBe('2026-09-13T11:46:40.000Z')
  })

  it('accepts a string timestamp and drops items without a title or a timestamp', () => {
    const { items } = mapPlayerNews(
      [
        { ...fantasyProsItem, published: '1789591522615' },
        { ...fantasyProsItem, published: null },
        { ...fantasyProsItem, published: 0 },
        { ...fantasyProsItem, metadata: { ...fantasyProsItem.metadata, title: '' } },
        { source: 'rotowire' }
      ],
      FETCHED
    )
    expect(items).toHaveLength(1)
    expect(items[0].publishedAt).toBe('2026-09-16T20:45:22.615Z')
  })

  it('keeps only http(s) urls and turns blank strings into null', () => {
    const { items } = mapPlayerNews(
      [
        {
          ...fantasyProsItem,
          metadata: {
            ...fantasyProsItem.metadata,
            url: 'javascript:alert(1)',
            description: '   ',
            analysis: null
          }
        },
        { ...rotowireItem, metadata: { ...rotowireItem.metadata, url: undefined } }
      ],
      FETCHED
    )
    expect(items[0]).toMatchObject({ url: null, description: null, analysis: null })
    expect(items[1].url).toBeNull()
  })

  it('keeps one item per id and falls back to the timestamp without a source_key', () => {
    const { items } = mapPlayerNews(
      [rotoballerItem, rotoballerItem, { ...rotowireItem, source_key: null }],
      FETCHED
    )
    expect(items.map((i) => i.id)).toEqual([
      'rotoballer:221423',
      'rotowire:2026-09-13T11:46:40.000Z'
    ])
  })

  it('labels an item without a source as unknown', () => {
    const { items } = mapPlayerNews([{ ...rotowireItem, source: null }], FETCHED)
    expect(items[0].source).toBe('unknown')
    expect(items[0].id).toBe('unknown:nfl637886')
  })
})

describe('newsQuery', () => {
  it('builds the query Sleeper accepts, quoting the id', () => {
    expect(newsQuery('4046', 25)).toBe(
      '{get_player_news(sport:"nfl",player_id:"4046",limit:25){source source_key player_id published metadata}}'
    )
  })
})

describe('createSleeperNewsClient', () => {
  it('POSTs the query with the JSON and User-Agent headers, a timeout, and maps the payload', async () => {
    const { fetchImpl, calls } = fakeFetch(200, newsResponse)
    const client = createSleeperNewsClient({ fetchImpl, now: () => new Date(FETCHED) })
    const news = await client.getPlayerNews('4046')
    expect(news.items).toHaveLength(3)
    expect(news.items[0].id).toBe('rotoballer:221423')
    expect(news.fetchedAt).toBe(FETCHED)
    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]
    expect(url).toBe(SLEEPER_GRAPHQL_URL)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      'user-agent': SLEEPER_NEWS_USER_AGENT
    })
    expect(JSON.parse(String(init.body))).toEqual({ query: newsQuery('4046', NEWS_LIMIT) })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('passes a custom limit through', async () => {
    const { fetchImpl, calls } = fakeFetch(200, newsResponse)
    await createSleeperNewsClient({ fetchImpl }).getPlayerNews('4046', 5)
    expect(JSON.parse(String(calls[0].init.body)).query).toContain('limit:5')
  })

  it('rejects on an HTTP error with the status', async () => {
    const { fetchImpl } = fakeFetch(403, 'forbidden')
    await expect(
      createSleeperNewsClient({ fetchImpl }).getPlayerNews('4046')
    ).rejects.toMatchObject({
      name: 'SleeperNewsError',
      status: 403
    })
  })

  it('rejects when the payload has no news array', async () => {
    for (const body of [
      { errors: [{ message: 'nope' }] },
      { data: null },
      { data: { get_player_news: null } },
      [],
      null
    ]) {
      const { fetchImpl } = fakeFetch(200, body)
      await expect(
        createSleeperNewsClient({ fetchImpl }).getPlayerNews('4046')
      ).rejects.toBeInstanceOf(SleeperNewsError)
    }
  })

  it('rejects on a non-JSON body', async () => {
    const { fetchImpl } = fakeFetch(200, '<html>')
    await expect(createSleeperNewsClient({ fetchImpl }).getPlayerNews('4046')).rejects.toThrow()
  })
})
