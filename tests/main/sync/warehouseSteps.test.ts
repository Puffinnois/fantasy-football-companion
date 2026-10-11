import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { replaceWhGames, type WhKeyType } from '@main/db/repos/warehouse'
import type { WarehouseClient } from '@main/sources/warehouse/client'
import { parseGamesCsv } from '@main/sources/warehouse/parse'
import { SkipStep } from '@main/sync/step'
import {
  sleeperWeeks,
  WAREHOUSE_FIRST_SEASON,
  WAREHOUSE_STEPS,
  type StepContext,
  type WarehouseStep
} from '@main/sync/warehouseSteps'
import {
  capturedFiles,
  capturedNflverse,
  capturedSleeper,
  fakeWarehouse
} from '../../fixtures/warehouse'

const KEY: Record<WhKeyType, RegExp> = {
  gsis: /^00-\d{7}$/,
  pfr: /^\S+\d{2}$/,
  espn: /^\d+$/,
  sleeper: /^\d+$/,
  cfb: /\S/
}

function step(id: string): WarehouseStep {
  const found = WAREHOUSE_STEPS.find((s) => s.id === id)
  if (!found) throw new Error(`no step ${id}`)
  return found
}

describe('warehouse steps', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  const ctx = (client: WarehouseClient, over: Partial<StepContext> = {}): StepContext => ({
    db,
    client,
    current: 2026,
    stateWeek: 3,
    stateSeasonType: 'regular',
    ...over
  })

  it('has unique ids and sources; the schedule loads before depth charts', () => {
    const ids = WAREHOUSE_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sources = WAREHOUSE_STEPS.flatMap((s) => s.sources.map((x) => x.source))
    expect(new Set(sources).size).toBe(sources.length)
    expect(ids.indexOf('schedules')).toBeLessThan(ids.indexOf('depth_charts'))
  })

  it.each([
    ['nflverse_player', 2025],
    ['nflverse_team', 2025],
    ['snaps', 2025],
    ['schedules', 0],
    ['ff_opportunity', 2025],
    ['ngs_pass', 0],
    ['ngs_rush', 0],
    ['ngs_rec', 0],
    ['pfr_pass', 2025],
    ['pfr_rush', 2025],
    ['pfr_rec', 2025],
    ['pfr_def', 2025],
    ['qbr', 0],
    ['injuries', 2025],
    ['depth_charts', 2024],
    ['rosters', 2025],
    ['combine', 0],
    ['sleeper', 2025]
  ])('%s reads its captured file', async (id, season) => {
    const s = step(id)
    const out = await s.fetch(ctx(fakeWarehouse(capturedFiles(), capturedSleeper())), season)
    expect(out).not.toBeNull()
    if (!out) return
    const sources = new Set(s.sources.map((x) => x.source))
    const keyed = [...out.playerWeeks, ...out.players]
    const all = [...keyed, ...out.teamWeeks]
    expect(all.length + out.games.length).toBeGreaterThan(0)
    for (const r of all) expect(sources.has(r.source)).toBe(true)
    for (const r of keyed) expect(r.playerKey).toMatch(KEY[r.keyType])
    for (const r of [...out.playerWeeks, ...out.teamWeeks, ...out.games]) {
      expect(r.season).toBeGreaterThanOrEqual(WAREHOUSE_FIRST_SEASON)
    }
  })

  it('returns null for a file that is not published', async () => {
    expect(await step('nflverse_player').fetch(ctx(fakeWarehouse()), 2025)).toBeNull()
    expect(await step('qbr').fetch(ctx(fakeWarehouse()), 0)).toBeNull()
  })

  it('maps QBR team codes and reads the season file as week 0', async () => {
    const files = {
      'espn_data/qbr_week_level':
        'season,season_type,game_week,team_abb,player_id,opp_abb,qbr_total\n2025,Regular,3,WSH,4480,LAR,71.2\n2025,Playoffs,1,LAR,4480,WSH,60\n',
      'espn_data/qbr_season_level':
        'season,season_type,game_week,team_abb,player_id,qbr_total\n2025,Regular,Season Total,WSH,4480,65\n'
    }
    const out = await step('qbr').fetch(ctx(fakeWarehouse(files)), 0)
    expect(
      out?.playerWeeks.map((r) => [r.seasonType, r.week, r.team, r.opponent, r.keyType])
    ).toEqual([
      ['REG', 3, 'WAS', 'LA', 'espn'],
      ['POST', 1, 'LA', 'WAS', 'espn'],
      ['REG', 0, 'WAS', null, 'espn']
    ])
  })

  describe('sleeperWeeks', () => {
    const at = (stateSeasonType: string, stateWeek = 3): Parameters<typeof sleeperWeeks>[1] => ({
      current: 2026,
      stateWeek,
      stateSeasonType
    })

    it('asks for every week of a past season: 17 + 4 through 2020, 18 + 4 since', () => {
      expect(sleeperWeeks(2020, at('regular'))).toHaveLength(21)
      const weeks = sleeperWeeks(2025, at('regular'))
      expect(weeks).toHaveLength(22)
      expect(weeks[17]).toEqual({ seasonType: 'regular', week: 18 })
      expect(weeks[21]).toEqual({ seasonType: 'post', week: 4 })
    })

    it('asks for the current season through the state week, all of it once in the postseason', () => {
      expect(sleeperWeeks(2026, at('regular', 3))).toEqual([
        { seasonType: 'regular', week: 1 },
        { seasonType: 'regular', week: 2 },
        { seasonType: 'regular', week: 3 }
      ])
      expect(sleeperWeeks(2026, at('regular', 25))).toHaveLength(18)
      expect(sleeperWeeks(2026, at('post', 2))).toHaveLength(22)
    })

    it('asks for nothing in the preseason or offseason', () => {
      expect(sleeperWeeks(2026, at('pre', 1))).toEqual([])
      expect(sleeperWeeks(2026, at('off', 0))).toEqual([])
    })
  })

  it('splits Sleeper rows into players, defenses and team offenses', async () => {
    const client = fakeWarehouse({}, capturedSleeper())
    const out = await step('sleeper').fetch(ctx(client), 2025)
    expect(client.calls.filter((c) => c.startsWith('sleeper:2025/'))).toHaveLength(22)
    expect(out?.playerWeeks.length).toBeGreaterThan(0)
    expect(out?.teamWeeks.filter((r) => r.source === 'sleeper_def').length).toBeGreaterThan(0)
    expect(out?.teamWeeks.filter((r) => r.source === 'sleeper_team').length).toBeGreaterThan(0)
    expect(out?.playerWeeks.every((r) => r.week === 5 && r.seasonType === 'REG')).toBe(true)
  })

  it('skips a current season that has not started', async () => {
    await expect(
      step('sleeper').fetch(ctx(fakeWarehouse(), { stateSeasonType: 'pre', stateWeek: 1 }), 2026)
    ).rejects.toBeInstanceOf(SkipStep)
  })

  it('waits for the schedule before mapping snapshot depth charts', async () => {
    // Two snapshots: one before the season, one after the captured weeks (1–4), so weeks 1–4 all
    // take the September one.
    const files = {
      'depth_charts/depth_charts_2025': `dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank
2025-09-01T07:00:00Z,DAL,Dak Prescott,2577417,00-0033077,1,Base Offense,1,Quarterback,QB,1,1
2026-01-31T07:00:00Z,DAL,Joe Milton,,00-0039850,1,Base Offense,1,Quarterback,QB,1,1
`
    }
    const s = step('depth_charts')
    await expect(s.fetch(ctx(fakeWarehouse(files)), 2025)).rejects.toBeInstanceOf(SkipStep)
    replaceWhGames(db, [2025], parseGamesCsv(capturedNflverse('games.csv'), 2019).rows, 'x')
    const out = await s.fetch(ctx(fakeWarehouse(files)), 2025)
    expect(out?.playerWeeks.map((r) => r.week)).toEqual([1, 2, 3, 4])
    expect(
      out?.playerWeeks.every(
        (r) => r.playerKey === '00-0033077' && r.data.snapshot === '2025-09-01T07:00:00Z'
      )
    ).toBe(true)
  })
})
