import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { StatsDb } from '@main/stats/db'
import { rebuildDerived } from '@main/stats/derived/build'
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
    service.close()
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
      service.close()
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
      service.close()
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
      expect(service.catalogue().find((m) => m.id === 'yprr')).toMatchObject({
        grains: ['week', 'season', 'play']
      })
    } finally {
      service.close()
    }
    // The rules are kept with the file.
    const reopened = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
    try {
      expect(await reopened.setLeague(RULES)).toBe(false)
    } finally {
      reopened.close()
    }
  })
})
