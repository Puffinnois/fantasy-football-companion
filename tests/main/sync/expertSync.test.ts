import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, withTransaction, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { listExpertRanks, ROS_WEEK, storedScoring } from '@main/db/repos/expertRanks'
import { listMarketValues } from '@main/db/repos/marketValues'
import {
  listCrosswalk,
  listPlayerIdentitySources,
  replaceCrosswalk
} from '@main/db/repos/playerIds'
import { saveRules } from '@main/db/repos/rules'
import { setNflState } from '@main/db/repos/state'
import type { FantasyCalcClient } from '@main/sources/fantasycalc'
import { mapFcValues } from '@main/sources/fantasycalc'
import type { FantasyProsClient, FpQuery } from '@main/sources/fantasypros'
import { mapFpRankings } from '@main/sources/fantasypros'
import { parseCrosswalk } from '@main/sources/nflverse'
import type { SleeperClient } from '@main/sources/sleeper'
import {
  buildFpJoinIndex,
  FANTASYCALC_GONE_MESSAGE,
  GONE_MESSAGE,
  joinFantasyPros,
  NOT_PUBLISHED_MESSAGE,
  numQbsFor,
  OFFSEASON_MESSAGE,
  refreshExperts,
  sourceFantasyCalc,
  sourceFpRos,
  sourceFpWeekly,
  type ExpertSyncDeps
} from '@main/sync/expertSync'
import type { SyncLogEntry } from '@shared/types'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as fc from '../../fixtures/fantasycalc'
import * as fp from '../../fixtures/fantasypros'
import { crosswalkCsv } from '../../fixtures/nflverse'
import { rules } from '../../fixtures/rules'

const WEEKLY: Record<string, typeof fp.weeklyFlx> = {
  FLX: fp.weeklyFlx,
  QB: fp.weeklyQb,
  K: fp.weeklyK,
  DST: fp.weeklyDst
}

function fakeFantasyPros(overrides: Partial<FantasyProsClient> = {}): FantasyProsClient {
  return {
    getRankings: vi.fn(async (q: FpQuery) =>
      mapFpRankings(q.type === 'ros' ? fp.rosAll : (WEEKLY[q.position] ?? fp.unpublished))
    ),
    ...overrides
  }
}

function fakeFantasyCalc(overrides: Partial<FantasyCalcClient> = {}): FantasyCalcClient {
  return { getValues: vi.fn(async () => mapFcValues(fc.values)), ...overrides }
}

describe('refreshExperts', () => {
  let db: Db
  let clock: Date
  const HOUR = 3_600_000
  const state = (over: Partial<Parameters<typeof setNflState>[1]> = {}): void =>
    setNflState(db, {
      season: '2026',
      week: 2,
      displayWeek: 1,
      seasonType: 'regular',
      fetchedAt: SEED_TS,
      ...over
    })

  function deps(
    fantasypros = fakeFantasyPros(),
    fantasycalc = fakeFantasyCalc(),
    onStep?: (e: SyncLogEntry) => void
  ): ExpertSyncDeps {
    return { db, sleeper: {} as SleeperClient, fantasypros, fantasycalc, now: () => clock, onStep }
  }

  beforeEach(() => {
    db = seedLeague()
    state()
    withTransaction(db, () => replaceCrosswalk(db, parseCrosswalk(crosswalkCsv).records, SEED_TS))
    clock = new Date('2026-09-18T12:00:00.000Z')
  })

  it('runs weekly 1..current (FLX, QB, K, DST), ROS and FantasyCalc; joins by id, name and DST alias', async () => {
    const fantasypros = fakeFantasyPros()
    const fantasycalc = fakeFantasyCalc()
    const seen: string[] = []
    const { steps } = await refreshExperts(
      deps(fantasypros, fantasycalc, (e) => seen.push(e.status))
    )

    expect(steps.map((s) => [s.source, s.status, s.rowsWritten, s.message])).toEqual([
      [sourceFpWeekly(2026, 1), 'ok', 6, '6 matched, 1 unmatched'],
      [sourceFpWeekly(2026, 2), 'ok', 6, '6 matched, 1 unmatched'],
      [sourceFpRos(2026), 'ok', 6, '6 matched, 2 unmatched'],
      [sourceFantasyCalc(2026), 'ok', 3, '1 without a Sleeper id']
    ])
    expect(seen).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(9)
    expect(fantasypros.getRankings).toHaveBeenNthCalledWith(1, {
      type: 'weekly',
      year: 2026,
      week: 1,
      position: 'FLX',
      scoring: 'PPR'
    })
    expect(fantasypros.getRankings).toHaveBeenLastCalledWith({
      type: 'ros',
      year: 2026,
      position: 'ALL',
      scoring: 'PPR'
    })
    // league L1 has 2 rosters, no SUPER_FLEX, rec = 1
    expect(fantasycalc.getValues).toHaveBeenCalledWith({ numTeams: 2, numQbs: 1, ppr: 1 })

    const week1 = listExpertRanks(db, 2026, 1)
    expect(week1.map((r) => r.playerId)).toEqual(['4866', '6794', 'LAR', '1234', '8259', 'JAX'])
    expect(week1[0]).toEqual({
      playerId: '4866',
      scoring: 'PPR',
      rankEcr: 1,
      posRank: 1,
      rankAve: 1.4,
      rankStd: 0.6,
      rankMin: 1,
      rankMax: 3,
      experts: 153,
      grade: 'A+',
      projPts: 22.4,
      updatedAt: clock.toISOString()
    })
    expect(week1.find((r) => r.playerId === '1234')?.experts).toBe(120) // per page
    expect(listExpertRanks(db, 2026, ROS_WEEK).map((r) => r.playerId)).toEqual([
      '4866',
      '6794',
      '8259',
      '1234',
      'LAR',
      'JAX'
    ])
    expect(listExpertRanks(db, 2026, ROS_WEEK)[0]).toMatchObject({ grade: null, projPts: null })
    expect(listMarketValues(db, 2026).map((r) => [r.playerId, r.value, r.tier])).toEqual([
      ['6794', 10512, 1],
      ['4866', 9340, 1],
      ['8259', 6100, null]
    ])
  })

  it('freshness: past weeks 30 d, current week 3 h, ROS and FantasyCalc 12 h', async () => {
    const fantasypros = fakeFantasyPros()
    await refreshExperts(deps(fantasypros))
    clock = new Date(clock.getTime() + 4 * HOUR)
    const later = await refreshExperts(deps(fantasypros))
    expect(later.steps.map((s) => [s.source, s.status])).toEqual([
      [sourceFpWeekly(2026, 1), 'skipped'],
      [sourceFpWeekly(2026, 2), 'ok'],
      [sourceFpRos(2026), 'skipped'],
      [sourceFantasyCalc(2026), 'skipped']
    ])
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(9 + 4)
    clock = new Date(clock.getTime() + 9 * HOUR)
    const evenLater = await refreshExperts(deps(fantasypros))
    expect(evenLater.steps.map((s) => s.status)).toEqual(['skipped', 'ok', 'ok', 'ok'])
    expect(
      (await refreshExperts(deps(fantasypros), { force: true })).steps.map((s) => s.status)
    ).toEqual(['ok', 'ok', 'ok', 'ok'])
  })

  it('a rules change to another scoring bucket re-fetches FantasyPros inside freshness, not FantasyCalc', async () => {
    const fantasypros = fakeFantasyPros()
    await refreshExperts(deps(fantasypros))
    saveRules(db, 'L1', rules({ scoring: { ...rules().scoring, rec: 0.5 } }))
    const again = await refreshExperts(deps(fantasypros))
    expect(again.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok', 'skipped'])
    expect(fantasypros.getRankings).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoring: 'HALF' })
    )
    expect(storedScoring(db, 2026, ROS_WEEK)).toBe('HALF')
    expect(storedScoring(db, 2026, 1)).toBe('HALF')
    // same bucket again → plain freshness applies
    expect((await refreshExperts(deps(fantasypros))).steps.map((s) => s.status)).toEqual([
      'skipped',
      'skipped',
      'skipped',
      'skipped'
    ])
  })

  it('an unpublished current week costs one request and is skipped; past weeks stay', async () => {
    const fantasypros = fakeFantasyPros({
      getRankings: vi.fn(async (q: FpQuery) => {
        if (q.type === 'weekly' && q.week === 2) return mapFpRankings(fp.unpublished)
        return mapFpRankings(q.type === 'ros' ? fp.rosAll : (WEEKLY[q.position] ?? fp.unpublished))
      })
    })
    const { steps } = await refreshExperts(deps(fantasypros))
    expect(steps[1]).toMatchObject({
      source: sourceFpWeekly(2026, 2),
      status: 'skipped',
      message: NOT_PUBLISHED_MESSAGE
    })
    expect(steps.map((s) => s.status)).toEqual(['ok', 'skipped', 'ok', 'ok'])
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(4 + 1 + 1)
    expect(listExpertRanks(db, 2026, 2)).toEqual([])
  })

  it('a gone endpoint stops the weekly loop after one request and skips ROS without one; FantasyCalc still runs', async () => {
    const fantasypros = fakeFantasyPros({ getRankings: vi.fn(async () => null) })
    const { steps } = await refreshExperts(deps(fantasypros))
    expect(steps.map((s) => [s.source, s.status, s.message])).toEqual([
      [sourceFpWeekly(2026, 1), 'skipped', GONE_MESSAGE],
      [sourceFpRos(2026), 'skipped', GONE_MESSAGE],
      [sourceFantasyCalc(2026), 'ok', '1 without a Sleeper id']
    ])
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(1)
  })

  it('a failing endpoint logs an error, stops the weekly loop, but ROS and FantasyCalc still try once', async () => {
    const fantasypros = fakeFantasyPros({
      getRankings: vi.fn(async () => {
        throw new Error('FantasyPros 403 for …: forbidden')
      })
    })
    const fantasycalc = fakeFantasyCalc({ getValues: vi.fn(async () => null) })
    const { steps } = await refreshExperts(deps(fantasypros, fantasycalc))
    expect(steps.map((s) => [s.source, s.status])).toEqual([
      [sourceFpWeekly(2026, 1), 'error'],
      [sourceFpRos(2026), 'error'],
      [sourceFantasyCalc(2026), 'skipped']
    ])
    expect(steps[0].message).toContain('403')
    expect(steps[2].message).toBe(FANTASYCALC_GONE_MESSAGE)
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(2)
  })

  it('off-season: one skipped step and no requests', async () => {
    state({ seasonType: 'pre', week: 0, displayWeek: 0 })
    const fantasypros = fakeFantasyPros()
    const fantasycalc = fakeFantasyCalc()
    const { steps } = await refreshExperts(deps(fantasypros, fantasycalc))
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      source: sourceFpRos(2026),
      status: 'skipped',
      message: OFFSEASON_MESSAGE
    })
    expect(fantasypros.getRankings).not.toHaveBeenCalled()
    expect(fantasycalc.getValues).not.toHaveBeenCalled()
  })

  it('does nothing without an active league or without an NFL state', async () => {
    const empty = openDatabase(':memory:')
    migrate(empty)
    const fantasypros = fakeFantasyPros()
    expect(await refreshExperts({ ...deps(fantasypros), db: empty })).toEqual({ steps: [] })
    expect(fantasypros.getRankings).not.toHaveBeenCalled()
  })

  it('clamps the weekly loop to 18 and uses the later of week / display_week', async () => {
    state({ week: 17, displayWeek: 18 })
    const fantasypros = fakeFantasyPros()
    const { steps } = await refreshExperts(deps(fantasypros))
    expect(steps.filter((s) => s.source.startsWith('fantasypros:weekly:'))).toHaveLength(18)
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(18 * 4 + 1)
  })

  describe('pure helpers', () => {
    it('numQbsFor: 2 with a SUPER_FLEX slot, else 1', () => {
      expect(numQbsFor(rules().rosterSlots)).toBe(1)
      expect(numQbsFor([...rules().rosterSlots, { slot: 'SUPER_FLEX', count: 1 }])).toBe(2)
      expect(numQbsFor([{ slot: 'SUPER_FLEX', count: 0 }])).toBe(1)
    })

    it('buildFpJoinIndex: first crosswalk row wins per FP id; names are normalized with position', () => {
      const index = buildFpJoinIndex(
        [
          ...listCrosswalk(db),
          { ...listCrosswalk(db)[0], fantasyprosId: '17240', sleeperId: 'dup' }
        ],
        listPlayerIdentitySources(db)
      )
      expect(index.byFpId.get('17240')).toBe('4866')
      expect(index.byFpId.get('19236')).toBe('6794')
      expect(index.byFpId.has('30001')).toBe(false)
      expect(index.byName.get('james cook|RB')).toBe('8259')
      expect(index.byName.get('jamarr chase|WR')).toBe('7564')
      expect(index.byName.get('retired guy|QB')).toBe('1234')
    })

    it('joinFantasyPros: id, then name + position, DST by team alias; the rest counted', () => {
      const index = buildFpJoinIndex(listCrosswalk(db), listPlayerIdentitySources(db))
      const { records, matched, unmatched } = joinFantasyPros(
        mapFpRankings(fp.rosAll).players,
        6,
        index
      )
      expect(matched).toBe(6)
      expect(unmatched).toBe(2)
      expect(records.map((r) => r.playerId)).toEqual(['4866', '6794', '8259', '1234', 'LAR', 'JAX'])
      expect(records[0]).toEqual({
        playerId: '4866',
        rankEcr: 1,
        posRank: 1,
        rankAve: 1.2,
        rankStd: 0.5,
        rankMin: 1,
        rankMax: 2,
        experts: 6,
        grade: null,
        projPts: null
      })
      // a DST row without a team cannot be joined
      const noTeam = joinFantasyPros(
        [{ ...mapFpRankings(fp.weeklyDst).players[0], team: null }],
        1,
        index
      )
      expect(noTeam).toMatchObject({ matched: 0, unmatched: 1 })
    })
  })
})
