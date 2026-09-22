import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { suggestFromDb } from '@main/trade/fromDb'
import { suggestTrades } from '@main/trade/suggest'
import { SEASON } from '../../fixtures/season'
import { SMALL_LEAGUE, syntheticBuild } from '../../fixtures/synthetic'

const dir = mkdtempSync(join(tmpdir(), 'ffc-trade-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('suggestFromDb (the worker body)', () => {
  it('rebuilds the league from its own connection and returns the same offers', () => {
    const path = join(dir, 'companion.db')
    const { db, build } = syntheticBuild(SMALL_LEAGUE, path)
    db.close()
    const query = {
      season: SEASON,
      focus: null,
      stance: 'fair' as const,
      partnerRosterId: null
    }
    expect(suggestFromDb(path, 'L1', query)).toEqual(suggestTrades(build, query))
  })

  it('surfaces the engine error when the league has no projections', () => {
    const path = join(dir, 'blind.db')
    syntheticBuild({ ...SMALL_LEAGUE, weeks: [] }, path).db.close()
    expect(() =>
      suggestFromDb(path, 'L1', {
        season: SEASON,
        focus: null,
        stance: 'fair',
        partnerRosterId: null
      })
    ).toThrow('No projections stored')
  })
})
