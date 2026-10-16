import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openStatsService } from '@main/stats/service'
import { tempDir } from '../../fixtures/stats'

describe('openStatsService', () => {
  it('opens the file, bootstraps it and passes the self-test (stats-analysis spec §3.3)', async () => {
    const dir = tempDir()
    const service = await openStatsService(
      { path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') },
      () => {},
      async () => ({ season: 2026, week: 6, seasonType: 'regular' })
    )
    try {
      const result = await service.selfTest()
      expect(result).toMatchObject({ rows: 1000, parquet: true })
      expect(result.duckdb).toMatch(/^v1\./)
    } finally {
      service.close()
    }
  })
})
