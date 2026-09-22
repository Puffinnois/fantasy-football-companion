import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { mapFcValues, type FantasyCalcClient } from '@main/sources/fantasycalc'
import { mapFpRankings, type FantasyProsClient } from '@main/sources/fantasypros'
import { parseCrosswalk, type NflverseClient } from '@main/sources/nflverse'
import type { SleeperClient } from '@main/sources/sleeper'
import { importAll, refreshAll, type AppSyncDeps } from '@main/sync/refresh'
import * as fc from '../../fixtures/fantasycalc'
import * as fp from '../../fixtures/fantasypros'
import { crosswalkCsv } from '../../fixtures/nflverse'
import * as fx from '../../fixtures/sleeper'

describe('refreshAll / importAll', () => {
  let db: Db
  const sleeper: SleeperClient = {
    getUser: vi.fn(async () => fx.user),
    getUserLeagues: vi.fn(async () => [fx.league]),
    getLeague: vi.fn(async () => fx.league),
    getLeagueUsers: vi.fn(async () => fx.users),
    getLeagueRosters: vi.fn(async () => fx.rosters),
    getAllPlayers: vi.fn(async () => fx.players),
    getNflState: vi.fn(async () => fx.nflState),
    getProjections: vi.fn(async () => []),
    getMatchups: vi.fn(async () => [])
  }
  const nflverse: NflverseClient = {
    getPlayerWeekStats: vi.fn(async () => null),
    getTeamWeekStats: vi.fn(async () => null),
    getSnapCounts: vi.fn(async () => null),
    getGames: vi.fn(async () => ({ records: [], skipped: 0 })),
    getCrosswalk: vi.fn(async () => parseCrosswalk(crosswalkCsv))
  }
  const fantasypros: FantasyProsClient = {
    getRankings: vi.fn(async (q) => mapFpRankings(q.type === 'ros' ? fp.rosAll : fp.weeklyFlx))
  }
  const fantasycalc: FantasyCalcClient = { getValues: vi.fn(async () => mapFcValues(fc.values)) }
  const deps = (): AppSyncDeps => ({ db, sleeper, nflverse, fantasypros, fantasycalc })

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('runs the expert steps after Sleeper and nflverse, then the ROS snapshot, on import and on refresh', async () => {
    const imported = await importAll(deps(), 'L1', 'u1')
    const sources = imported.steps.map((s) => s.source)
    expect(sources.slice(-5)).toEqual([
      'fantasypros:weekly:2026:1',
      'fantasypros:weekly:2026:2',
      'fantasypros:ros:2026',
      'fantasycalc:2026',
      'snapshot:ros:2026'
    ])
    expect(sources.indexOf('nflverse:crosswalk')).toBeLessThan(
      sources.indexOf('fantasypros:ros:2026')
    )
    expect(imported.steps.filter((s) => s.status === 'error')).toEqual([])

    const refreshed = await refreshAll(deps())
    expect(refreshed.steps.map((s) => s.source).slice(-5)).toEqual(sources.slice(-5))
  })
})
