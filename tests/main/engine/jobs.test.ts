import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { replaceTrendingAdds } from '@main/db/repos/trending'
import { runJob } from '@main/engine/jobs'
import { tradeOpenSpots } from '@main/trade/openSpot'
import { suggestTrades } from '@main/trade/suggest'
import { waiverAdds } from '@main/waiver/adds'
import { waiverStream } from '@main/waiver/stream'
import { SEED_TS } from '../../fixtures/db'
import { SEASON } from '../../fixtures/season'
import { SMALL_LEAGUE, syntheticBuild, WAIVER_LEAGUE } from '../../fixtures/synthetic'

const dir = mkdtempSync(join(tmpdir(), 'ffc-engine-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('runJob (the engine worker body)', () => {
  it('answers a waiver job from its own connection with the in-process result', () => {
    const path = join(dir, 'waiver.db')
    const { db, build } = syntheticBuild(WAIVER_LEAGUE, path)
    replaceTrendingAdds(db, [{ playerId: 'Z', count: 120 }], SEED_TS)
    db.close()
    const settings = WAIVER_LEAGUE.rules?.settings ?? { waiverType: 'priority' as const }
    expect(
      runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'waiverAdds', season: SEASON } })
    ).toEqual(
      waiverAdds(build, {
        settings,
        trending: new Map([['Z', 120]]),
        trendingFetchedAt: SEED_TS
      })
    )
  })

  it('answers a streaming week and a trade open spot with the in-process results', () => {
    const path = join(dir, 'stream.db')
    const { db, build } = syntheticBuild(WAIVER_LEAGUE, path)
    db.close()
    // No games in the fixture: the worker's opponent labels are empty too.
    expect(
      runJob({
        dbPath: path,
        leagueId: 'L1',
        job: { kind: 'waiverStream', season: SEASON, week: 17 }
      })
    ).toEqual(
      waiverStream(build, 17, {
        settings: WAIVER_LEAGUE.rules?.settings ?? {},
        opponents: new Map()
      })
    )
    const proposal = { rosterId: 2, give: ['C', 'D'], get: ['R2'] }
    expect(
      runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'openSpot', season: SEASON, proposal } })
    ).toEqual(tradeOpenSpots(build, proposal))
  })

  it('still answers trade suggestions', () => {
    const path = join(dir, 'trade.db')
    const { db, build } = syntheticBuild(SMALL_LEAGUE, path)
    db.close()
    const query = { season: SEASON, focus: null, stance: 'fair' as const, partnerRosterId: null }
    expect(runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'tradeSuggest', query } })).toEqual(
      suggestTrades(build, query)
    )
  })

  it('surfaces the engine error without projections', () => {
    const path = join(dir, 'blind.db')
    syntheticBuild({ ...WAIVER_LEAGUE, weeks: [] }, path).db.close()
    expect(() =>
      runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'waiverAdds', season: SEASON } })
    ).toThrow('No projections stored')
  })
})
