import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@main/db/connection'
import { countPlayerIds, getPlayerIds, listCrosswalk } from '@main/db/repos/playerIds'
import { countPoints } from '@main/db/repos/points'
import { setNflState } from '@main/db/repos/state'
import { listAllPlayerWeeks, listGames, listSnaps, listTeamWeeks } from '@main/db/repos/stats'
import { getLastSync } from '@main/db/repos/syncLog'
import type { NflverseClient, ParseResult } from '@main/sources/nflverse'
import {
  parseCrosswalk,
  parseGames,
  parsePlayerWeekStats,
  parseSnapCounts,
  parseTeamWeekStats
} from '@main/sources/nflverse'
import type { SleeperClient } from '@main/sources/sleeper'
import {
  refreshNflverse,
  SOURCE_CROSSWALK,
  SOURCE_GAMES,
  SOURCE_IDENTITY,
  SOURCE_POINTS,
  sourceSnaps,
  sourceStats,
  type NflverseSyncDeps
} from '@main/sync/nflverseSync'
import { seedLeague } from '../../fixtures/db'
import * as fx from '../../fixtures/nflverse'

/** Re-labels fixture rows (all season 2025) with the requested season so both seasons load. */
function forSeason<T extends { season: number }>(
  result: ParseResult<T>,
  season: number
): ParseResult<T> {
  return { records: result.records.map((r) => ({ ...r, season })), skipped: result.skipped }
}

function fakeNflverse(overrides: Partial<NflverseClient> = {}): NflverseClient {
  return {
    getPlayerWeekStats: vi.fn(async (season) =>
      forSeason(parsePlayerWeekStats(fx.playerStatsCsv), season)
    ),
    getTeamWeekStats: vi.fn(async (season) =>
      forSeason(parseTeamWeekStats(fx.teamStatsCsv), season)
    ),
    getSnapCounts: vi.fn(async (season) => forSeason(parseSnapCounts(fx.snapCountsCsv), season)),
    getGames: vi.fn(async () => {
      const g = parseGames(fx.gamesCsv)
      return {
        records: [
          ...g.records,
          ...forSeason(g, 2026).records.map((r) => ({ ...r, gameId: `2026${r.gameId.slice(4)}` }))
        ],
        skipped: 0
      }
    }),
    getCrosswalk: vi.fn(async () => parseCrosswalk(fx.crosswalkCsv)),
    ...overrides
  }
}

describe('refreshNflverse', () => {
  let db: Db
  let clock: Date
  const HOUR = 3_600_000

  function deps(nflverse = fakeNflverse()): NflverseSyncDeps {
    return { db, sleeper: {} as SleeperClient, nflverse, now: () => clock }
  }

  beforeEach(() => {
    db = seedLeague()
    clock = new Date('2026-09-17T12:00:00.000Z')
    setNflState(db, {
      season: '2026',
      week: 3,
      displayWeek: 3,
      seasonType: 'regular',
      fetchedAt: clock.toISOString()
    })
  })

  it('does nothing without an NFL state row', async () => {
    db.exec('DELETE FROM nfl_state')
    expect((await refreshNflverse(deps())).steps).toEqual([])
  })

  it('runs crosswalk, identity, both seasons, games and points in order and writes everything', async () => {
    const result = await refreshNflverse(deps())
    expect(result.steps.map((s) => [s.source, s.status])).toEqual([
      [SOURCE_CROSSWALK, 'ok'],
      [sourceStats(2025), 'ok'],
      [sourceSnaps(2025), 'ok'],
      [sourceStats(2026), 'ok'],
      [sourceSnaps(2026), 'ok'],
      [SOURCE_GAMES, 'ok'],
      [SOURCE_IDENTITY, 'ok'],
      [SOURCE_POINTS, 'ok']
    ])
    expect(listCrosswalk(db)).toHaveLength(6)
    expect(countPlayerIds(db)).toBe(7) // every fixture player
    expect(getPlayerIds(db, '4866')?.resolution).toBe('crosswalk')
    expect(getPlayerIds(db, 'LAR')?.nflverseTeam).toBe('LA')
    // 4 REG rows per season (the POST row is dropped)
    expect(listAllPlayerWeeks(db)).toHaveLength(8)
    expect(listTeamWeeks(db)).toHaveLength(8)
    expect(listSnaps(db, 'BarkSa00', 2026)).toHaveLength(2)
    // 4 REG games per season (the WC game is dropped)
    expect(listGames(db)).toHaveLength(8)
    expect(countPoints(db, 'L1')).toBeGreaterThan(0)
    const identity = result.steps.find((s) => s.source === SOURCE_IDENTITY)
    // rostered: 4866 6794 8259 7564 9509 LAR; 8259/7564/9509 resolve via Sleeper gsis → only 0 unresolved
    expect(identity?.message).toBeNull()
  })

  it('reports unresolved rostered players in the identity message', async () => {
    // no Sleeper gsis, no sportradar id, and a name the crosswalk cannot match
    db.prepare(
      "UPDATE players SET gsis_id = NULL, full_name = 'Unknown Person' WHERE player_id IN ('8259', '7564')"
    ).run()
    const result = await refreshNflverse(deps())
    expect(result.steps.find((s) => s.source === SOURCE_IDENTITY)?.message).toBe(
      '2 rostered players unresolved'
    )
  })

  it('marks an unpublished season as skipped, not error, and still recomputes', async () => {
    const nflverse = fakeNflverse({
      getPlayerWeekStats: vi.fn(async (season) =>
        season === 2026 ? null : forSeason(parsePlayerWeekStats(fx.playerStatsCsv), season)
      )
    })
    const result = await refreshNflverse(deps(nflverse))
    const stats2026 = result.steps.find((s) => s.source === sourceStats(2026))
    expect(stats2026).toMatchObject({ status: 'skipped', message: '2026 stats not published yet' })
    expect(result.steps.find((s) => s.source === sourceStats(2025))?.status).toBe('ok')
    expect(result.steps.find((s) => s.source === SOURCE_POINTS)?.status).toBe('ok')
  })

  it('a failing source does not block the others', async () => {
    const nflverse = fakeNflverse({
      getGames: vi.fn(async () => {
        throw new Error('github down')
      })
    })
    const result = await refreshNflverse(deps(nflverse))
    expect(result.steps.find((s) => s.source === SOURCE_GAMES)).toMatchObject({
      status: 'error',
      message: 'github down'
    })
    expect(result.steps.filter((s) => s.status === 'ok')).toHaveLength(7)
    expect(getLastSync(db, SOURCE_GAMES, 'error')).not.toBeNull()
  })

  it('skips fresh sources on the next refresh and then runs no identity/points steps', async () => {
    await refreshNflverse(deps())
    clock = new Date(clock.getTime() + HOUR)
    const again = await refreshNflverse(deps())
    expect(again.steps.map((s) => s.status)).toEqual([
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'skipped'
    ])
    expect(again.steps.map((s) => s.source)).not.toContain(SOURCE_IDENTITY)
    expect(again.steps.map((s) => s.source)).not.toContain(SOURCE_POINTS)
  })

  it('uses a 7-day window for the previous season and 6 h for the current one; new stats re-resolve identities', async () => {
    await refreshNflverse(deps())
    clock = new Date(clock.getTime() + 7 * HOUR)
    const again = await refreshNflverse(deps())
    expect(again.steps.find((s) => s.source === sourceStats(2025))?.status).toBe('skipped')
    expect(again.steps.find((s) => s.source === sourceStats(2026))?.status).toBe('ok')
    expect(again.steps.find((s) => s.source === SOURCE_IDENTITY)?.status).toBe('ok')
    expect(again.steps.find((s) => s.source === SOURCE_POINTS)?.status).toBe('ok')
  })

  it('re-resolves identities when the Sleeper players DB changed, even with a fresh crosswalk', async () => {
    await refreshNflverse(deps())
    clock = new Date(clock.getTime() + HOUR)
    const again = await refreshNflverse(deps(), { playersChanged: true })
    expect(again.steps.find((s) => s.source === SOURCE_CROSSWALK)?.status).toBe('skipped')
    expect(again.steps.find((s) => s.source === SOURCE_IDENTITY)?.status).toBe('ok')
    expect(again.steps.find((s) => s.source === SOURCE_POINTS)?.status).toBe('ok')
  })

  it('force re-runs everything', async () => {
    await refreshNflverse(deps())
    const again = await refreshNflverse(deps(), { force: true })
    expect(again.steps.every((s) => s.status === 'ok')).toBe(true)
    expect(again.steps).toHaveLength(8)
  })

  it('skips points when no league is active', async () => {
    db.prepare("DELETE FROM app_settings WHERE key = 'active_league_id'").run()
    const result = await refreshNflverse(deps())
    expect(result.steps.map((s) => s.source)).not.toContain(SOURCE_POINTS)
  })
})
