import { describe, expect, it, vi } from 'vitest'
import {
  createFantasyProsClient,
  FantasyProsHttpError,
  mapFpRankings,
  num,
  parsePosRank
} from '@main/sources/fantasypros'
import * as fx from '../../fixtures/fantasypros'

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

describe('num / parsePosRank', () => {
  it('coerces numbers and numeric strings, null otherwise', () => {
    expect(num(3)).toBe(3)
    expect(num('1.4')).toBe(1.4)
    expect(num('')).toBeNull()
    expect(num('n/a')).toBeNull()
    expect(num(null)).toBeNull()
    expect(num(undefined)).toBeNull()
  })

  it('reads the numeric part of a position rank', () => {
    expect(parsePosRank('RB12')).toBe(12)
    expect(parsePosRank('DST3')).toBe(3)
    expect(parsePosRank('RB')).toBeNull()
    expect(parsePosRank(null)).toBeNull()
    expect(parsePosRank(undefined)).toBeNull()
  })
})

describe('mapFpRankings', () => {
  it('coerces the string-typed rank fields and parses pos_rank', () => {
    const page = mapFpRankings(fx.weeklyFlx)
    expect(page).toMatchObject({ count: 3, totalExperts: 153, skipped: 0 })
    expect(page.players[0]).toEqual({
      playerId: '17240',
      name: 'Saquon Barkley',
      team: 'PHI',
      position: 'RB',
      rankEcr: 1,
      posRank: 1,
      rankAve: 1.4,
      rankStd: 0.6,
      rankMin: 1,
      rankMax: 3,
      grade: 'A+',
      projPts: 22.4
    })
    expect(page.players[2]).toMatchObject({ rankMin: null, rankMax: null, rankAve: 8.7 })
  })

  it('keeps DST team codes as FantasyPros spells them, nulls the weekly-only fields on ROS rows, skips unusable rows', () => {
    expect(mapFpRankings(fx.weeklyDst).players[1]).toMatchObject({
      team: 'JAC',
      position: 'DST',
      posRank: 12
    })
    const ros = mapFpRankings(fx.rosAll)
    expect(ros.skipped).toBe(1)
    expect(ros.players).toHaveLength(8)
    expect(ros.players[0]).toMatchObject({ grade: null, projPts: null })
    expect(ros.players.find((p) => p.name === 'Retired Guy')?.team).toBeNull()
    expect(ros.players.find((p) => p.name === 'Jacksonville Jaguars')?.rankStd).toBeNull()
    expect(mapFpRankings({ count: 0, total_experts: 0 })).toEqual({
      count: 0,
      totalExperts: 0,
      players: [],
      skipped: 0
    })
  })
})

describe('createFantasyProsClient', () => {
  it('builds the query string and maps the payload', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: fx.weeklyFlx }])
    const client = createFantasyProsClient({ fetchImpl, baseUrl: 'https://example.test/cr.php' })
    const page = await client.getRankings({
      type: 'weekly',
      year: 2026,
      week: 2,
      position: 'FLX',
      scoring: 'PPR'
    })
    expect(page?.players.map((p) => p.playerId)).toEqual(['17240', '19236', '30001'])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/cr.php?sport=nfl&year=2026&type=weekly&position=FLX&scoring=PPR&week=2',
      expect.anything()
    )
  })

  it('omits week for ROS, returns null on 404/410, retries once on 5xx, throws otherwise', async () => {
    const fetchImpl = fakeFetch([
      { status: 200, body: fx.rosAll },
      { status: 404 },
      { status: 410 },
      { status: 503, body: 'down' },
      { status: 200, body: fx.rosAll },
      { status: 403, body: 'forbidden' }
    ])
    const client = createFantasyProsClient({ fetchImpl, retryDelayMs: 0 })
    const ros = { type: 'ros', year: 2026, position: 'ALL', scoring: 'HALF' } as const
    expect((await client.getRankings(ros))?.totalExperts).toBe(6)
    expect(String(vi.mocked(fetchImpl).mock.calls[0][0])).toContain(
      'type=ros&position=ALL&scoring=HALF'
    )
    expect(String(vi.mocked(fetchImpl).mock.calls[0][0])).not.toContain('week=')
    expect(await client.getRankings(ros)).toBeNull()
    expect(await client.getRankings(ros)).toBeNull()
    expect((await client.getRankings(ros))?.count).toBe(9)
    await expect(client.getRankings(ros)).rejects.toBeInstanceOf(FantasyProsHttpError)
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })
})
