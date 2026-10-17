import { describe, expect, it } from 'vitest'
import {
  isDue,
  PRIOR_SEASON_FRESHNESS_MS,
  refreshStats,
  STATS_STEPS,
  touchedSeasons,
  type DueInput,
  type SourceState
} from '@main/stats/sync'
import type { StatsLogEntry } from '@main/stats/protocol'
import { INTERRUPTED_MESSAGE } from '@main/stats/schema'
import { openTestDb, tempDir, writeFixture } from '../../fixtures/stats'
import { seedGame } from '../../fixtures/statsDerived'
import { fakeDownloads, runSync, STATE_2026, urlOf } from '../../fixtures/statsSync'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const HOUR = 60 * 60 * 1000
const due = (over: Partial<DueInput>): boolean =>
  isDue({
    season: 2026,
    current: 2026,
    force: false,
    now: NOW,
    lastAttemptAt: null,
    version: 1,
    state: null,
    ...over
  })
const state = (fetchedAt: string, sealed = false, version = 1): SourceState => ({
  version,
  fetchedAt,
  sealed
})

describe('isDue (warehouse spec §4.2, kept)', () => {
  it('runs what was never fetched and what a new version changed', () => {
    expect(due({ season: 2019 })).toBe(true)
    expect(due({ season: 2019, state: state('2026-01-01T00:00:00Z', true), version: 2 })).toBe(true)
  })

  it('never retries within a day unless forced, and forcing only reaches recent seasons', () => {
    const lastAttemptAt = new Date(NOW - 2 * HOUR).toISOString()
    expect(due({ lastAttemptAt })).toBe(false)
    expect(due({ lastAttemptAt, force: true })).toBe(true)
    expect(due({ season: 0, lastAttemptAt, force: true })).toBe(true)
    expect(due({ season: 2020, lastAttemptAt, force: true })).toBe(false)
  })

  it('refreshes the current season daily, the prior weekly, and older ones until sealed', () => {
    const recent = new Date(NOW - 3 * 24 * HOUR).toISOString()
    expect(due({ state: state(recent) })).toBe(true)
    expect(due({ season: 2025, state: state(recent) })).toBe(false)
    expect(
      due({ season: 2025, state: state(new Date(NOW - PRIOR_SEASON_FRESHNESS_MS).toISOString()) })
    ).toBe(true)
    expect(due({ season: 2023, state: state(recent, true) })).toBe(false)
    expect(due({ season: 2023, state: state(recent, false) })).toBe(true)
  })
})

describe('refreshStats', () => {
  it('logs every due step, skips unpublished files, and records state with sealing', async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'c.parquet',
      "SELECT 2010 AS season, 'X' AS player_name"
    )
    const { steps } = await runSync(db, {
      files: { [urlOf('combine')]: file },
      only: ['combine', 'injuries']
    })
    expect(steps.map((s) => [s.source, s.status])).toEqual([
      ['stats:combine', 'ok'],
      ...[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((s) => [
        `stats:injuries:${s}`,
        'skipped'
      ]),
      ['stats:identity', 'ok']
    ])
    expect(steps[1].message).toBe('injuries 2019 not published yet')
    expect(await db.all('SELECT source, season, rows_written, sealed FROM source_state')).toEqual([
      { source: 'combine', season: 0, rows_written: 1, sealed: false }
    ])
  })

  it('does not run a step again within the day, and seals seasons two back', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const files: Record<string, string> = {}
    for (const season of [2024, 2026]) {
      files[urlOf('injuries', season)] = await writeFixture(
        db,
        dir,
        `i${season}.parquet`,
        `SELECT ${season} AS season, 1 AS week, 'REG' AS game_type, 'g' AS gsis_id, 'KC' AS team`
      )
    }
    await runSync(db, { files, only: ['injuries'] })
    const again = await runSync(db, { files, only: ['injuries'] })
    expect(again.steps).toEqual([])
    expect(await db.all('SELECT season, sealed FROM source_state ORDER BY season')).toEqual([
      { season: 2024, sealed: true },
      { season: 2026, sealed: false }
    ])
  })

  it('logs a failed step as an error and carries on', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const bad = `${dir}/bad.parquet`
    const { writeFileSync } = await import('node:fs')
    writeFileSync(bad, 'not parquet')
    const good = await writeFixture(
      db,
      dir,
      'c.parquet',
      "SELECT 2010 AS season, 'X' AS player_name"
    )
    const { steps } = await runSync(db, {
      files: { [urlOf('players')]: bad, [urlOf('combine')]: good },
      only: ['players', 'combine']
    })
    expect(steps.map((s) => [s.source, s.status])).toEqual([
      ['stats:players', 'error'],
      ['stats:combine', 'ok'],
      ['stats:identity', 'ok']
    ])
  })

  it('stops between steps once cancelled and logs the step it was in as interrupted', async () => {
    const db = await openTestDb()
    let cancelled = false
    const { steps } = await refreshStats(
      {
        db,
        downloads: {
          async withFile() {
            cancelled = true
            throw new Error('INTERRUPT Error: Interrupted!')
          },
          json: async () => null
        },
        tempDir: tempDir(),
        nflState: async () => STATE_2026,
        cancelled: () => cancelled
      },
      {},
      STATS_STEPS.filter((s) => s.id === 'combine' || s.id === 'players')
    )
    expect(steps.map((s) => [s.source, s.status, s.message])).toEqual([
      ['stats:players', 'interrupted', INTERRUPTED_MESSAGE]
    ])
  })

  it('retries an interrupted step on the next run, not a day later', async () => {
    const db = await openTestDb()
    await db.exec(
      "INSERT INTO sync_log (source, started_at, finished_at, status) VALUES ('stats:combine', '2026-10-16T11:00:00Z', '2026-10-16T11:01:00Z', 'interrupted')"
    )
    const file = await writeFixture(
      db,
      tempDir(),
      'c.parquet',
      "SELECT 2010 AS season, 'X' AS player_name"
    )
    const { steps } = await runSync(db, { files: { [urlOf('combine')]: file }, only: ['combine'] })
    expect(steps[0]).toMatchObject({ source: 'stats:combine', status: 'ok' })
  })

  it('logs the NFL state failure and stops', async () => {
    const db = await openTestDb()
    const { steps } = await refreshStats({
      db,
      downloads: fakeDownloads({}),
      tempDir: tempDir(),
      nflState: () => Promise.reject(new Error('Sleeper is down'))
    })
    expect(steps.map((s) => [s.source, s.status, s.message])).toEqual([
      ['stats:state', 'error', 'Sleeper is down']
    ])
  })

  it('reports each finished step', async () => {
    const db = await openTestDb()
    const seen: string[] = []
    await refreshStats(
      {
        db,
        downloads: fakeDownloads({}),
        tempDir: tempDir(),
        nflState: async () => STATE_2026,
        onStep: (e) => seen.push(`${e.source} ${e.status}`)
      },
      {},
      STATS_STEPS.filter((s) => s.id === 'combine')
    )
    expect(seen).toEqual(['stats:combine skipped'])
  })
})

describe('the derived rebuild (stats-analysis spec §5.2)', () => {
  const entry = (source: string, rowsWritten: number, status = 'ok'): StatsLogEntry => ({
    id: 1,
    source,
    startedAt: '',
    finishedAt: '',
    status: status as StatsLogEntry['status'],
    message: null,
    rowsWritten
  })

  it('rebuilds the seasons whose rows changed, and the current one for an all-seasons file', () => {
    expect(
      touchedSeasons(
        [
          entry('stats:pbp:2025', 10),
          entry('stats:sleeper:2026', 5),
          entry('stats:pbp:2024', 0),
          entry('stats:ftn:2023', 0, 'error'),
          entry('stats:qbr_week', 3),
          entry('stats:identity', 9)
        ],
        2026
      )
    ).toEqual([2025, 2026])
  })

  it('builds every season once play-by-play exists, then only after a refresh that loaded rows', async () => {
    const db = await openTestDb()
    await seedGame(db)
    const first = await runSync(db, { only: [] })
    expect(first.steps.map((s) => [s.source, s.status, s.message])).toEqual([
      ['stats:derived', 'ok', 'all seasons']
    ])
    expect(await db.get('SELECT count(*) AS n FROM player_week')).toEqual({ n: 7 })
    expect((await runSync(db, { only: [] })).steps).toEqual([])
  })

  it('scores the league’s rules when it has them', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await runSync(db, { only: [], league: { scoring: { rec: 3 }, positionOverrides: {} } })
    expect(
      await db.get(
        "SELECT points FROM fantasy_week WHERE scoring = 'league' AND player_id = '9001'"
      )
    ).toEqual({ points: 3 })
  })
})
