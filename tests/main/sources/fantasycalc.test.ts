import { describe, expect, it, vi } from 'vitest'
import {
  createFantasyCalcClient,
  FantasyCalcHttpError,
  mapFcValues
} from '@main/sources/fantasycalc'
import * as fx from '../../fixtures/fantasycalc'

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

describe('mapFcValues', () => {
  it('reads the Sleeper id, ranks, trend and tier; null id stays null', () => {
    const records = mapFcValues(fx.values)
    expect(records[1]).toEqual({
      sleeperId: '4866',
      name: 'Saquon Barkley',
      position: 'RB',
      value: 9340,
      overallRank: 2,
      positionRank: 1,
      trend30Day: -310,
      tier: 1
    })
    expect(records[2].tier).toBeNull()
    expect(records[3].sleeperId).toBeNull()
    expect(
      mapFcValues([{ ...fx.values[0], player: { ...fx.values[0].player, sleeperId: 9221 } }])[0]
        .sleeperId
    ).toBe('9221')
    expect(mapFcValues([{ ...fx.values[0], trend30Day: null }])[0].trend30Day).toBe(0)
  })
})

describe('createFantasyCalcClient', () => {
  it('builds the query string and maps the array', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: fx.values }])
    const client = createFantasyCalcClient({
      fetchImpl,
      baseUrl: 'https://example.test/values/current'
    })
    const records = await client.getValues({ numTeams: 16, numQbs: 1, ppr: 1 })
    expect(records?.map((r) => r.sleeperId)).toEqual(['6794', '4866', '8259', null])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/values/current?isDynasty=false&numQbs=1&numTeams=16&ppr=1',
      expect.anything()
    )
  })

  it('returns null on 404/410, retries once on 429, throws on other errors', async () => {
    const fetchImpl = fakeFetch([
      { status: 410 },
      { status: 429, body: 'slow' },
      { status: 200, body: [] },
      { status: 500, body: 'a' },
      { status: 500, body: 'b' }
    ])
    const client = createFantasyCalcClient({ fetchImpl, retryDelayMs: 0 })
    const q = { numTeams: 12, numQbs: 2, ppr: 0.5 }
    expect(await client.getValues(q)).toBeNull()
    expect(await client.getValues(q)).toEqual([])
    await expect(client.getValues(q)).rejects.toBeInstanceOf(FantasyCalcHttpError)
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })
})
