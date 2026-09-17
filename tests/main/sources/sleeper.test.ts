import { describe, expect, it, vi } from 'vitest'
import { createSleeperClient, SleeperHttpError } from '@main/sources/sleeper'
import * as fx from '../../fixtures/sleeper'

function fakeFetch(responses: Array<{ status: number; body?: unknown }>): typeof fetch {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.shift()
    if (!next) throw new Error('no more fake responses')
    const body = next.body === undefined ? null : JSON.stringify(next.body)
    return new Response(body, {
      status: next.status,
      headers: { 'content-type': 'application/json' }
    })
  }) as unknown as typeof fetch
}

describe('createSleeperClient', () => {
  it('parses JSON and builds the URL from the base', async () => {
    const fetchImpl = fakeFetch([
      {
        status: 200,
        body: {
          season: '2026',
          week: 2,
          display_week: 1,
          season_type: 'regular',
          league_season: '2026'
        }
      }
    ])
    const client = createSleeperClient({ fetchImpl, baseUrl: 'https://example.test/v1' })
    const state = await client.getNflState()
    expect(state.week).toBe(2)
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/v1/state/nfl', expect.anything())
  })

  it('returns null on 404 and on a JSON null body', async () => {
    const client = createSleeperClient({
      fetchImpl: fakeFetch([{ status: 404 }, { status: 200, body: null }])
    })
    expect(await client.getUser('nobody')).toBeNull()
    expect(await client.getLeague('123')).toBeNull()
  })

  it('retries once on 429 then succeeds', async () => {
    const fetchImpl = fakeFetch([
      { status: 429, body: 'slow down' },
      { status: 200, body: [] }
    ])
    const client = createSleeperClient({ fetchImpl, retryDelayMs: 0 })
    expect(await client.getLeagueUsers('123')).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('retries once on 501 then succeeds', async () => {
    const fetchImpl = fakeFetch([
      { status: 501, body: 'not implemented' },
      { status: 200, body: [] }
    ])
    const client = createSleeperClient({ fetchImpl, retryDelayMs: 0 })
    expect(await client.getLeagueUsers('123')).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws SleeperHttpError after a second failure', async () => {
    const fetchImpl = fakeFetch([
      { status: 500, body: 'boom' },
      { status: 500, body: 'boom' }
    ])
    const client = createSleeperClient({ fetchImpl, retryDelayMs: 0 })
    await expect(client.getLeagueRosters('123')).rejects.toBeInstanceOf(SleeperHttpError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry 4xx client errors', async () => {
    const fetchImpl = fakeFetch([{ status: 400, body: 'bad' }])
    const client = createSleeperClient({ fetchImpl, retryDelayMs: 0 })
    await expect(client.getLeagueRosters('123')).rejects.toMatchObject({ status: 400 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('treats a missing required resource as an error', async () => {
    const client = createSleeperClient({ fetchImpl: fakeFetch([{ status: 404 }]) })
    await expect(client.getNflState()).rejects.toMatchObject({ status: 404 })
  })

  it('URL-encodes usernames', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: null }])
    const client = createSleeperClient({ fetchImpl, baseUrl: 'https://example.test/v1' })
    await client.getUser('a b')
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/v1/user/a%20b', expect.anything())
  })

  it('getProjections hits the un-versioned host with every scored position', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: fx.projections }])
    const items = await createSleeperClient({ fetchImpl }).getProjections('2026', 1)
    expect(items).toHaveLength(5)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.sleeper.app/projections/nfl/2026/1?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF',
      expect.anything()
    )
  })

  it('getProjections returns null when the endpoint is gone (404/410) and throws otherwise', async () => {
    const gone = createSleeperClient({ fetchImpl: fakeFetch([{ status: 404 }, { status: 410 }]) })
    expect(await gone.getProjections('2026', 1)).toBeNull()
    expect(await gone.getProjections('2026', 1)).toBeNull()
    const denied = createSleeperClient({ fetchImpl: fakeFetch([{ status: 403, body: 'nope' }]) })
    await expect(denied.getProjections('2026', 1)).rejects.toThrow(/403/)
  })
})
