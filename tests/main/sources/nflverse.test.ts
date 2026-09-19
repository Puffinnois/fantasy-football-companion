import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import {
  createNflverseClient,
  NflverseHttpError,
  parseCrosswalk,
  parseGames,
  parsePlayerWeekStats,
  parseSnapCounts,
  parseTeamWeekStats
} from '@main/sources/nflverse'
import * as fx from '../../fixtures/nflverse'

const real = (name: string): string =>
  readFileSync(new URL(`../../fixtures/nflverse/${name}`, import.meta.url), 'utf8')

describe('parsePlayerWeekStats', () => {
  it('maps dims, keeps numeric columns as stats, drops NA/list/text columns', () => {
    const { records, skipped } = parsePlayerWeekStats(fx.playerStatsCsv)
    expect(skipped).toBe(1) // the row with an empty player_id
    expect(records).toHaveLength(5)
    const barkley = records[0]
    expect(barkley).toMatchObject({
      gsisId: '00-0034844',
      season: 2025,
      week: 1,
      seasonType: 'REG',
      playerName: 'Saquon Barkley',
      position: 'RB',
      team: 'PHI',
      opponent: 'DAL'
    })
    expect(barkley.stats).toMatchObject({
      carries: 18,
      rushing_yards: 60,
      rushing_tds: 1,
      receptions: 4
    })
    expect(barkley.stats).not.toHaveProperty('headshot_url')
    expect(barkley.stats).not.toHaveProperty('player_name')
    const folk = records.find((r) => r.gsisId === '00-0025565')!
    expect(folk.stats).not.toHaveProperty('passing_yards') // NA
    expect(folk.stats).not.toHaveProperty('fg_made_list') // list column, even when single-valued
    expect(folk.stats.fg_made).toBe(1)
    expect(records.find((r) => r.week === 19)?.seasonType).toBe('POST')
  })

  it('parses the captured real file', () => {
    const { records, skipped } = parsePlayerWeekStats(real('stats_player_week.csv'))
    expect(skipped).toBe(0)
    expect(records).toHaveLength(50)
    for (const r of records) {
      expect(r.gsisId).toMatch(/^00-\d{7}$/)
      expect(r.season).toBe(2025)
      expect(r.week).toBeGreaterThan(0)
      expect(Object.keys(r.stats).length).toBeGreaterThan(50)
    }
  })
})

describe('parseTeamWeekStats', () => {
  it('parses inline and real files', () => {
    const { records } = parseTeamWeekStats(fx.teamStatsCsv)
    expect(records).toHaveLength(4)
    expect(records[2]).toMatchObject({ team: 'LA', season: 2025, week: 1, opponent: 'HOU' })
    expect(records[2].stats).toMatchObject({
      def_sacks: 4,
      def_interceptions: 2,
      passing_yards: 180
    })
    const realRows = parseTeamWeekStats(real('stats_team_week.csv')).records
    expect(realRows).toHaveLength(50)
    expect(realRows.every((r) => r.team.length >= 2 && r.team.length <= 3)).toBe(true)
  })
})

describe('parseSnapCounts', () => {
  it('skips rows without a pfr id and keeps fractions as-is', () => {
    const { records, skipped } = parseSnapCounts(fx.snapCountsCsv)
    expect(skipped).toBe(1)
    expect(records[0]).toMatchObject({
      pfrId: 'BarkSa00',
      season: 2025,
      week: 1,
      gameType: 'REG',
      team: 'PHI',
      opponent: 'DAL',
      position: 'RB',
      offenseSnaps: 55,
      offensePct: 0.83,
      stSnaps: 2
    })
    expect(parseSnapCounts(real('snap_counts.csv')).records).toHaveLength(50)
  })
})

describe('parseGames', () => {
  it('parses scores as numbers and future games as null', () => {
    const { records } = parseGames(fx.gamesCsv)
    expect(records).toHaveLength(5)
    expect(records[0]).toEqual({
      gameId: '2025_01_DAL_PHI',
      season: 2025,
      week: 1,
      gameType: 'REG',
      gameday: '2025-09-04',
      gametime: '20:20',
      homeTeam: 'PHI',
      awayTeam: 'DAL',
      homeScore: 24,
      awayScore: 20
    })
    expect(records[3]).toMatchObject({ homeScore: null, awayScore: null })
    expect(records[4].gameType).toBe('WC')
    expect(parseGames(real('games.csv')).records.every((g) => g.season === 2025)).toBe(true)
  })
})

describe('parseCrosswalk', () => {
  it('turns NA into null and keeps the ids we join on', () => {
    const { records } = parseCrosswalk(fx.crosswalkCsv)
    expect(records).toHaveLength(6)
    expect(records[0]).toEqual({
      sleeperId: '4866',
      fantasyprosId: '17240',
      gsisId: '00-0034844',
      pfrId: 'BarkSa00',
      sportradarId: 'sr-1',
      espnId: '3929630',
      name: 'Saquon Barkley',
      position: 'RB'
    })
    expect(records[2].sleeperId).toBeNull()
    expect(records[2].fantasyprosId).toBeNull()
    expect(records[1].fantasyprosId).toBe('19236')
    expect(records[4].gsisId).toBeNull()
    expect(records[5].gsisId).toBeNull() // placeholder id, not a GSIS id
    const realRows = parseCrosswalk(real('db_playerids.csv')).records
    expect(realRows).toHaveLength(50)
    expect(realRows.some((r) => r.sleeperId !== null && r.gsisId !== null)).toBe(true)
  })
})

describe('createNflverseClient', () => {
  function fetchOnce(responses: Response[]): typeof fetch {
    const queue = [...responses]
    return vi.fn(async () => queue.shift() ?? new Response('unexpected call', { status: 500 }))
  }

  it('returns null for an unpublished season (404)', async () => {
    const client = createNflverseClient({
      fetchImpl: fetchOnce([new Response('', { status: 404 })])
    })
    expect(await client.getPlayerWeekStats(2027)).toBeNull()
  })

  it('gunzips .csv.gz bodies and parses them', async () => {
    const body = gzipSync(Buffer.from(fx.teamStatsCsv))
    const client = createNflverseClient({ fetchImpl: fetchOnce([new Response(body)]) })
    const result = await client.getTeamWeekStats(2025)
    expect(result?.records).toHaveLength(4)
  })

  it('retries once on 503, then succeeds', async () => {
    const fetchImpl = fetchOnce([new Response('down', { status: 503 }), new Response(fx.gamesCsv)])
    const client = createNflverseClient({ fetchImpl, retryDelayMs: 0 })
    expect((await client.getGames()).records).toHaveLength(5)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws NflverseHttpError on other failures and on a missing required file', async () => {
    const client = createNflverseClient({
      fetchImpl: fetchOnce([new Response('nope', { status: 403 })])
    })
    await expect(client.getCrosswalk()).rejects.toBeInstanceOf(NflverseHttpError)
    const missing = createNflverseClient({
      fetchImpl: fetchOnce([new Response('', { status: 404 })])
    })
    await expect(missing.getGames()).rejects.toThrow(/404/)
  })

  it('builds the documented URLs', async () => {
    const fetchImpl = fetchOnce([new Response(fx.snapCountsCsv)])
    await createNflverseClient({ fetchImpl }).getSnapCounts(2026)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2026.csv.gz',
      expect.anything()
    )
  })
})
