import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { StatsDb } from '@main/stats/db'
import { rebuildDerived } from '@main/stats/derived/build'
import { rebuildModels } from '@main/stats/models/build'
import { bootstrapStatsDb } from '@main/stats/schema'
import { openStatsService } from '@main/stats/service'
import { tempDir } from '../../fixtures/stats'
import { seedGame, WR } from '../../fixtures/statsDerived'

describe('openStatsService', () => {
  it('clears temp files a closed app left behind', async () => {
    const dir = tempDir()
    const tmp = join(dir, 'tmp')
    mkdirSync(tmp, { recursive: true })
    writeFileSync(join(tmp, 'stale.parquet'), 'x')
    const service = await openStatsService(
      { path: join(dir, 'stats.duckdb'), tempDir: tmp },
      () => {}
    )
    await service.close()
    expect(existsSync(join(tmp, 'stale.parquet'))).toBe(false)
  })

  it('opens the file, bootstraps it and passes the self-test (stats-analysis spec §3.3)', async () => {
    const dir = tempDir()
    const service = await openStatsService(
      { path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') },
      () => {},
      async () => ({ season: 2026, week: 6, seasonType: 'regular' })
    )
    try {
      const result = await service.selfTest()
      expect(result).toMatchObject({
        rows: 1000,
        parquet: true,
        json: true,
        icu: true,
        query: true
      })
      expect(result.duckdb).toMatch(/^v1\./)
    } finally {
      await service.close()
    }
  })
})

describe('the service reads and the league rules (stats-analysis spec §5, §7)', () => {
  const RULES = { scoring: { rec: 3, rec_yd: 0.1 }, positionOverrides: {} }

  async function builtFile(): Promise<{ dir: string; path: string }> {
    const dir = tempDir()
    const path = join(dir, 'stats.duckdb')
    const db = await StatsDb.open(path, { threads: 1 })
    await bootstrapStatsDb(db, new Date())
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    db.close()
    return { dir, path }
  }

  it('answers reads side by side, each on its own connection, and none once closing', async () => {
    const { dir, path } = await builtFile()
    const service = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
    const q = { entity: 'team' as const, metrics: ['wins'], scope: { seasons: [2025] } }
    const answers = await Promise.all([service.query(q), service.query(q), service.status()])
    expect(answers[0].rows.map((r) => r.id)).toEqual(['BUF', 'KC'])
    expect(answers[1].rows).toHaveLength(2)
    const closing = service.close()
    await expect(service.query(q)).rejects.toThrow('the stats database is closing')
    await closing
  })

  it('refuses rules that are not numbers', async () => {
    const { dir, path } = await builtFile()
    const service = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
    try {
      await expect(
        service.setLeague({ scoring: { rec: Number.NaN }, positionOverrides: {} })
      ).rejects.toThrow('league rules: rec must be a number')
      expect(await service.setLeague(RULES)).toBe(true)
    } finally {
      await service.close()
    }
  })

  it('says the stats are being built until they are', async () => {
    const dir = tempDir()
    const service = await openStatsService(
      { path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') },
      () => {}
    )
    try {
      expect(await service.status()).toEqual({
        available: true,
        through: null,
        updatedAt: null,
        busy: false
      })
      await expect(
        service.query({ entity: 'team', metrics: ['wins'], scope: { seasons: [2025] } })
      ).rejects.toThrow('the stats are still being built')
      expect(await service.setLeague(RULES)).toBe(false)
    } finally {
      await service.close()
    }
  })

  it('answers the model reads once the models are built (spec §8)', async () => {
    const { dir, path } = await builtFile()
    const open = (): ReturnType<typeof openStatsService> =>
      openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
    const elo = { entity: 'team' as const, metrics: ['elo'], scope: { seasons: [2025] } }
    const before = await open()
    try {
      await expect(before.query(elo)).rejects.toThrow('the stats are still being built')
      await expect(before.games({ season: 2025 })).rejects.toThrow('still being built')
      await expect(before.outlook({ player: WR, season: 2025 })).rejects.toThrow(
        'still being built'
      )
      // Metrics without a model answer meanwhile.
      expect((await before.query({ ...elo, metrics: ['wins'] })).rows).toHaveLength(2)
    } finally {
      await before.close()
    }
    const db = await StatsDb.open(path, { threads: 1 })
    await rebuildModels(db, { stability: false, through: 2024, runs: 50 })
    // A prior for win % (stability is measured on two seasons or more; this file has one).
    await db.exec(`CREATE OR REPLACE TABLE metric_stability AS SELECT 'win_pct' AS metric_id,
      0.4::DOUBLE AS year_to_year, 100 AS pairs, 0.5::DOUBLE AS split_half, 3.0::DOUBLE AS prior,
      'medium' AS reliability, 2024 AS through`)
    db.close()
    const after = await open()
    try {
      expect((await after.query(elo)).rows.map((r) => r.id)).toEqual(['BUF', 'KC'])
      expect((await after.games({ season: 2025 })).map((g) => g.gameId)).toEqual(['g1', 'g2'])
      expect((await after.outlook({ player: WR, season: 2025 })).team).toBe('BUF')
      expect(await after.player({ player: WR })).toMatchObject({
        name: 'Wes Wideout',
        seasons: [2025]
      })
      expect((await after.catalogue()).find((m) => m.id === 'win_pct')?.stability).toMatchObject({
        prior: 3,
        reliability: 'medium'
      })
      const shrunk = await after.query({
        entity: 'team',
        metrics: ['win_pct'],
        scope: { seasons: [2025] },
        transform: 'shrunk'
      })
      expect(shrunk.rows.map((r) => r.values.win_pct.value)).toEqual([0.625, 0.375])
    } finally {
      await after.close()
    }
  })

  it('answers queries, and rescores the league when its rules change', async () => {
    const { dir, path } = await builtFile()
    const service = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
    const league = {
      entity: 'player' as const,
      metrics: ['fantasy_points'],
      scope: { seasons: [2025], players: [WR] },
      scoring: 'league' as const
    }
    try {
      expect((await service.status()).through).toEqual({ season: 2025, seasonType: 'REG', week: 1 })
      await expect(service.query(league)).rejects.toThrow(
        'scoring "league" needs an imported league'
      )
      expect(await service.setLeague(RULES)).toBe(true)
      expect(
        await service.setLeague({ positionOverrides: {}, scoring: { rec_yd: 0.1, rec: 3 } })
      ).toBe(false)
      expect((await service.query(league)).rows[0].values.fantasy_points.value).toBe(5)
      expect((await service.catalogue()).find((m) => m.id === 'yprr')).toMatchObject({
        grains: ['week', 'season', 'play'],
        sampleLabel: 'routes',
        stability: null
      })
    } finally {
      await service.close()
    }
    // The rules the fantasy tables were built with are kept with the file.
    const reopened = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
    try {
      expect(await reopened.setLeague(RULES)).toBe(false)
    } finally {
      await reopened.close()
    }
  })
})
