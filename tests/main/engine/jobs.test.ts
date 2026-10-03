import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { replaceTrendingAdds } from '@main/db/repos/trending'
import { runJob, runStreamJob } from '@main/engine/jobs'
import { tradeOpenSpots } from '@main/trade/openSpot'
import { collectDeals } from '@main/trade/suggest'
import { waiverAdds } from '@main/waiver/adds'
import { waiverStream } from '@main/waiver/stream'
import { twoTeam } from '@shared/deal'
import type { SuggestUpdate } from '@shared/types'
import { SEED_TS } from '../../fixtures/db'
import { SEASON } from '../../fixtures/season'
import {
  SMALL_LEAGUE,
  TRIANGLE_LEAGUE,
  syntheticBuild,
  WAIVER_LEAGUE
} from '../../fixtures/synthetic'

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
    const proposal = twoTeam(1, 2, ['C', 'D'], ['R2'])
    expect(
      runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'openSpot', season: SEASON, proposal } })
    ).toEqual(tradeOpenSpots(build, proposal))
  })

  it('still answers trade suggestions', () => {
    const path = join(dir, 'trade.db')
    const { db, build } = syntheticBuild(SMALL_LEAGUE, path)
    db.close()
    const query = {
      season: SEASON,
      focus: null,
      stance: 'fair' as const,
      maxTeams: 2,
      mustInclude: null
    }
    expect(runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'tradeSuggest', query } })).toEqual(
      collectDeals(build, query).cards
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

describe('runStreamJob (the streaming worker body)', () => {
  const cardsOf = (posted: SuggestUpdate[]): Extract<SuggestUpdate, { type: 'cards' }>[] =>
    posted.filter((u): u is Extract<SuggestUpdate, { type: 'cards' }> => u.type === 'cards')

  it('posts every card in order, batched, then done with the final progress', () => {
    const path = join(dir, 'stream-trade.db')
    const { db, build } = syntheticBuild(TRIANGLE_LEAGUE, path)
    db.close()
    const query = {
      season: SEASON,
      focus: null,
      stance: 'overpay' as const,
      maxTeams: 3,
      mustInclude: null
    }
    const posted: SuggestUpdate[] = []
    let clock = 0
    runStreamJob(
      { dbPath: path, leagueId: 'L1', stream: { kind: 'tradeSuggest', query } },
      (u) => posted.push(u),
      () => (clock += 100) // every reading of the clock is 100 ms later
    )
    const expected = collectDeals(build, query).cards
    expect(expected.length).toBeGreaterThan(1)
    const batches = cardsOf(posted)
    expect(batches.flatMap((b) => b.cards)).toEqual(expected)
    expect(batches[0].cards).toHaveLength(1) // the first card goes out at once, alone
    expect(posted.some((u) => u.type === 'progress')).toBe(true)
    const done = posted[posted.length - 1]
    expect(done).toMatchObject({ type: 'done', reason: 'complete' })
    if (done.type === 'done') {
      expect(done.progress.found).toBe(expected.length)
      expect(done.progress.checked).toBe(done.progress.total)
      expect(done.progress.elapsedMs).toBeGreaterThan(0)
    }
  })

  it('posts the search error as an error update', () => {
    const path = join(dir, 'stream-bad.db')
    syntheticBuild(TRIANGLE_LEAGUE, path).db.close()
    const posted: SuggestUpdate[] = []
    runStreamJob(
      {
        dbPath: path,
        leagueId: 'L1',
        stream: {
          kind: 'tradeSuggest',
          query: { season: SEASON, focus: null, stance: 'fair', maxTeams: 3, mustInclude: 9 }
        }
      },
      (u) => posted.push(u)
    )
    expect(posted).toEqual([{ type: 'error', message: 'Must include another team in this league' }])
  })
})
