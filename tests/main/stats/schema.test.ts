import { describe, expect, it } from 'vitest'
import { INTERRUPTED_MESSAGE, bootstrapStatsDb } from '@main/stats/schema'
import { openTestDb } from '../../fixtures/stats'

describe('bootstrapStatsDb', () => {
  it('normalises team codes and season types', async () => {
    const db = await openTestDb()
    const row = await db.get(
      `SELECT nfl_team('OAK') AS oak, nfl_team('LAR') AS lar, nfl_team('WSH') AS wsh, nfl_team('KC') AS kc,
              season_type_of('WC') AS wc, season_type_of('REG') AS reg, season_type_of('PRE') AS pre`
    )
    expect(row).toEqual({
      oak: 'LV',
      lar: 'LA',
      wsh: 'WAS',
      kc: 'KC',
      wc: 'POST',
      reg: 'REG',
      pre: null
    })
  })

  it('marks steps a closed app left running as interrupted', async () => {
    const db = await openTestDb()
    await db.exec(
      "INSERT INTO sync_log (source, started_at, status) VALUES ('stats:pbp:2026', '2026-10-14T20:23:31Z', 'running')"
    )
    expect(await bootstrapStatsDb(db, new Date('2026-10-16T12:00:00Z'))).toBe(1)
    expect(await db.get('SELECT status, finished_at, message FROM sync_log')).toEqual({
      status: 'interrupted',
      finished_at: '2026-10-16T12:00:00.000Z',
      message: INTERRUPTED_MESSAGE
    })
  })
})
