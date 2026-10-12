import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { openWarehouseDatabase } from '@main/db/warehouseDb'
import { getLastSync, startSync } from '@main/db/repos/syncLog'
import {
  getWhSourceState,
  listWhGames,
  listWhPlayers,
  listWhPlayerWeeks,
  replaceWhPlayerWeeks,
  type WhPlayerWeek
} from '@main/db/repos/warehouse'
import { stepRows, type StepRows, type WarehouseStep } from '@main/sync/warehouseSteps'
import { refreshWarehouse, type WarehouseSyncDeps } from '@main/sync/warehouseSync'
import { aggregateInProcess } from '@main/warehouse/job'
import type { NflState, SyncResult } from '@shared/types'
import { capturedFiles, capturedSleeper, fakeWarehouse } from '../../fixtures/warehouse'

const HOUR = 3_600_000
const DAY = 24 * HOUR

function rowFor(source: string, season: number): WhPlayerWeek {
  return {
    source,
    season,
    seasonType: 'REG',
    week: 1,
    playerKey: '00-0034844',
    keyType: 'gsis',
    team: 'PHI',
    opponent: null,
    data: { season }
  }
}

interface FakeStepOptions {
  version?: number
  firstSeason?: number
  allSeasons?: boolean
  sources?: string[]
  /** Per-source first seasons and versions, over `firstSeason` / `version`. */
  sourceFirstSeason?: Record<string, number>
  sourceVersion?: Record<string, number>
  fetch?: (season: number, due: string[]) => Promise<StepRows | null>
}

function fakeStep(
  id: string,
  options: FakeStepOptions = {}
): WarehouseStep & { calls: number[]; due: string[][] } {
  const calls: number[] = []
  const due: string[][] = []
  const sources = options.sources ?? [id]
  return {
    id,
    calls,
    due,
    sources: sources.map((source) => ({
      source,
      version: options.sourceVersion?.[source] ?? options.version ?? 1,
      firstSeason: options.sourceFirstSeason?.[source]
    })),
    firstSeason: options.firstSeason ?? 2024,
    allSeasons: options.allSeasons ?? false,
    async fetch(_ctx, season, dueSources = sources) {
      calls.push(season)
      due.push(dueSources)
      if (options.fetch) return options.fetch(season, dueSources)
      return stepRows({ playerWeeks: sources.map((s) => rowFor(s, season === 0 ? 2025 : season)) })
    }
  }
}

const ran = (result: SyncResult): string[] => result.steps.map((s) => `${s.source}=${s.status}`)

describe('refreshWarehouse', () => {
  let db: Db
  let clock: Date

  beforeEach(() => {
    db = openWarehouseDatabase(':memory:')
    clock = new Date('2026-10-09T12:00:00.000Z')
  })

  const STATE: NflState = {
    season: '2026',
    week: 6,
    displayWeek: 6,
    seasonType: 'regular',
    fetchedAt: '2026-10-09T12:00:00.000Z'
  }
  const deps = (warehouse = fakeWarehouse()): WarehouseSyncDeps => ({
    db,
    warehouse,
    state: STATE,
    aggregatePbp: aggregateInProcess,
    now: () => clock
  })
  const run = (steps: WarehouseStep[], force = false): Promise<SyncResult> =>
    refreshWarehouse(deps(), { force }, steps)
  const later = (ms: number): void => {
    clock = new Date(clock.getTime() + ms)
  }

  it('does nothing without an NFL state', async () => {
    const a = fakeStep('a')
    expect(await refreshWarehouse({ ...deps(), state: null }, {}, [a])).toEqual({ steps: [] })
    expect(a.calls).toEqual([])
  })

  it('backfills oldest season first and seals seasons two or more back', async () => {
    const a = fakeStep('a')
    expect(ran(await run([a]))).toEqual(['wh:a:2024=ok', 'wh:a:2025=ok', 'wh:a:2026=ok'])
    expect(getWhSourceState(db, 'a', 2024)).toMatchObject({ version: 1, rows: 1, sealed: true })
    expect(getWhSourceState(db, 'a', 2025)?.sealed).toBe(false)
    expect(getWhSourceState(db, 'a', 2026)?.sealed).toBe(false)
    expect(listWhPlayerWeeks(db, 'a', 2025)).toEqual([rowFor('a', 2025)])
  })

  it('never goes before 2019 or before a step’s first season', async () => {
    const early = fakeStep('early', { firstSeason: 2010 })
    const late = fakeStep('late', { firstSeason: 2025 })
    await run([early, late])
    expect(early.calls).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
    expect(late.calls).toEqual([2025, 2026])
  })

  it('runs nothing within 24 h of the last attempt, then the current season only', async () => {
    const a = fakeStep('a')
    await run([a])
    later(HOUR)
    expect(ran(await run([a]))).toEqual([])
    later(DAY)
    expect(ran(await run([a]))).toEqual(['wh:a:2026=ok'])
  })

  it('a forced refresh re-runs the current season only (the Refresh button always forces)', async () => {
    const a = fakeStep('a')
    await run([a])
    later(60_000)
    expect(ran(await run([a], true))).toEqual(['wh:a:2026=ok'])
    later(60_000)
    expect(ran(await run([a], true))).toEqual(['wh:a:2026=ok'])
  })

  it('refreshes the prior season weekly and never a sealed one', async () => {
    const a = fakeStep('a')
    await run([a])
    later(8 * DAY)
    expect(ran(await run([a], true))).toEqual(['wh:a:2025=ok', 'wh:a:2026=ok'])
  })

  it('a version bump re-fetches sealed seasons once', async () => {
    await run([fakeStep('a')])
    later(DAY)
    const v2 = fakeStep('a', { version: 2 })
    expect(ran(await run([v2]))).toEqual(['wh:a:2024=ok', 'wh:a:2025=ok', 'wh:a:2026=ok'])
    expect(getWhSourceState(db, 'a', 2024)).toMatchObject({ version: 2, sealed: true })
    later(DAY)
    expect(ran(await run([v2]))).toEqual(['wh:a:2026=ok'])
  })

  it('skips an unpublished file and retries it after 24 h', async () => {
    const missing = fakeStep('m', { firstSeason: 2026, fetch: async () => null })
    expect(ran(await run([missing]))).toEqual(['wh:m:2026=skipped'])
    expect(getLastSync(db, 'wh:m:2026')?.message).toBe('m 2026 not published yet')
    later(HOUR)
    expect(ran(await run([missing]))).toEqual([])
    later(DAY)
    expect(ran(await run([missing]))).toEqual(['wh:m:2026=skipped'])
  })

  it('a failing step is logged and the others continue', async () => {
    const bad = fakeStep('bad', {
      firstSeason: 2026,
      fetch: async () => {
        throw new Error('boom')
      }
    })
    const good = fakeStep('good', { firstSeason: 2026 })
    expect(ran(await run([bad, good]))).toEqual(['wh:bad:2026=error', 'wh:good:2026=ok'])
    expect(getLastSync(db, 'wh:bad:2026')?.message).toBe('boom')
  })

  it('a partial backfill resumes where it stopped', async () => {
    let fail = true
    const a = fakeStep('a', {
      fetch: async (season) => {
        if (season === 2025 && fail) throw new Error('network')
        return stepRows({ playerWeeks: [rowFor('a', season)] })
      }
    })
    expect(ran(await run([a]))).toEqual(['wh:a:2024=ok', 'wh:a:2025=error', 'wh:a:2026=ok'])
    fail = false
    later(DAY)
    expect(ran(await run([a]))).toEqual(['wh:a:2025=ok', 'wh:a:2026=ok'])
  })

  it('a step left running by a quit app does not block the retry', async () => {
    startSync(db, 'wh:a:2026', new Date(clock.getTime() - HOUR).toISOString())
    expect(ran(await run([fakeStep('a', { firstSeason: 2026 })]))).toEqual(['wh:a:2026=ok'])
  })

  it('an all-seasons file replaces only the seasons it holds and refreshes daily', async () => {
    replaceWhPlayerWeeks(db, 'ngs', [2020], [rowFor('ngs', 2020)], 'x')
    const ngs = fakeStep('ngs', {
      allSeasons: true,
      fetch: async () => stepRows({ playerWeeks: [rowFor('ngs', 2024), rowFor('ngs', 2025)] })
    })
    expect(ran(await run([ngs]))).toEqual(['wh:ngs=ok'])
    expect(listWhPlayerWeeks(db, 'ngs', 2020)).toHaveLength(1)
    expect(listWhPlayerWeeks(db, 'ngs', 2025)).toHaveLength(1)
    expect(getWhSourceState(db, 'ngs', 0)).toMatchObject({ rows: 2, sealed: false })
    later(DAY)
    expect(ran(await run([ngs]))).toEqual(['wh:ngs=ok'])
  })

  it('tracks each source of a multi-source step, and writes games and profiles', async () => {
    const multi = fakeStep('multi', { firstSeason: 2026, sources: ['x', 'y'] })
    const schedule = fakeStep('schedules', {
      allSeasons: true,
      fetch: async () => stepRows({ games: [{ gameId: 'g', season: 2025, week: 1, data: {} }] })
    })
    const roster = fakeStep('rosters', {
      firstSeason: 2026,
      fetch: async () =>
        stepRows({
          players: [
            { source: 'rosters', playerKey: 'p', keyType: 'gsis', data: { as_of: 202606 } }
          ],
          playersMode: 'latest'
        })
    })
    await run([multi, schedule, roster])
    expect(getWhSourceState(db, 'x', 2026)?.rows).toBe(1)
    expect(getWhSourceState(db, 'y', 2026)?.rows).toBe(1)
    expect(listWhGames(db, 2025)).toHaveLength(1)
    expect(getWhSourceState(db, 'schedules', 0)?.rows).toBe(1)
    expect(listWhPlayers(db, 'rosters')).toHaveLength(1)
  })

  it('never makes a source due before its own first season', async () => {
    const multi = fakeStep('multi', { sources: ['x', 'late'], sourceFirstSeason: { late: 2025 } })
    await run([multi])
    expect(multi.due).toEqual([['x'], ['x', 'late'], ['x', 'late']])
    expect(getWhSourceState(db, 'late', 2024)).toBeNull()
    later(DAY)
    expect(ran(await run([multi]))).toEqual(['wh:multi:2026=ok'])
  })

  it('writes only the sources a step returns; the others keep their rows and state', async () => {
    const write = (sources: string[]) => async (season: number) =>
      stepRows({ playerWeeks: sources.map((s) => rowFor(s, season)), sources })
    await run([
      fakeStep('multi', { sources: ['x', 'y'], firstSeason: 2024, fetch: write(['x', 'y']) })
    ])
    const before = getWhSourceState(db, 'x', 2024)
    later(DAY)
    const bumped = fakeStep('multi', {
      sources: ['x', 'y'],
      sourceVersion: { y: 2 },
      fetch: async (season, due) => write(due)(season)
    })
    expect(ran(await run([bumped]))).toEqual([
      'wh:multi:2024=ok',
      'wh:multi:2025=ok',
      'wh:multi:2026=ok'
    ])
    expect(bumped.due.slice(0, 2)).toEqual([['y'], ['y']])
    expect(getWhSourceState(db, 'x', 2024)).toEqual(before)
    expect(getWhSourceState(db, 'y', 2024)).toMatchObject({ version: 2, sealed: true })
  })

  it('a source not published yet is noted and retried; nothing to write is a skip', async () => {
    const pending = fakeStep('multi', {
      sources: ['x', 'y'],
      firstSeason: 2025,
      fetch: async (season, due) =>
        stepRows({
          playerWeeks: due.includes('x') ? [rowFor('x', season)] : [],
          sources: due.filter((s) => s === 'x'),
          notes: due.includes('y') ? [`y ${season} not published yet`] : []
        })
    })
    expect(ran(await run([pending]))).toEqual(['wh:multi:2025=ok', 'wh:multi:2026=ok'])
    expect(getLastSync(db, 'wh:multi:2025')?.message).toBe('y 2025 not published yet')
    expect(getWhSourceState(db, 'y', 2025)).toBeNull()
    later(DAY)
    expect(ran(await run([pending]))).toEqual(['wh:multi:2025=skipped', 'wh:multi:2026=ok'])
    expect(getLastSync(db, 'wh:multi:2025')?.message).toBe('y 2025 not published yet')
  })

  it('runs every registered step against the captured files without an error', async () => {
    const warehouse = fakeWarehouse(capturedFiles(), capturedSleeper())
    const result = await refreshWarehouse(deps(warehouse))
    expect(result.steps.filter((s) => s.status === 'error')).toEqual([])
    const filled = (
      db
        .prepare('SELECT DISTINCT source FROM wh_source_state WHERE rows > 0 ORDER BY source')
        .all() as { source: string }[]
    ).map((r) => r.source)
    expect(filled).toEqual([
      'combine',
      'depth_charts',
      'ff_opportunity',
      'ftn',
      'injuries',
      'nflverse_player',
      'nflverse_team',
      'ngs_pass',
      'ngs_rec',
      'ngs_rush',
      'part',
      'pbp',
      'pfr_def',
      'pfr_pass',
      'pfr_rec',
      'pfr_rush',
      'qbr',
      'rosters',
      'schedules',
      'sleeper',
      'sleeper_def',
      'sleeper_team',
      'snaps'
    ])
    expect(warehouse.calls.filter((c) => c.startsWith('sleeper:2026/'))).toEqual([
      'sleeper:2026/1/regular',
      'sleeper:2026/2/regular',
      'sleeper:2026/3/regular',
      'sleeper:2026/4/regular',
      'sleeper:2026/5/regular',
      'sleeper:2026/6/regular'
    ])
  })
})
