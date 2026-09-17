import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, withTransaction, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getLeague } from '@main/db/repos/leagues'
import { countPlayers } from '@main/db/repos/players'
import { listProjections } from '@main/db/repos/projections'
import { getRules, saveRules } from '@main/db/repos/rules'
import { getSetting, SETTING_ACTIVE_LEAGUE, SETTING_MY_USER } from '@main/db/repos/settings'
import { getLastError, getLastSync } from '@main/db/repos/syncLog'
import { listRoster, listTeams } from '@main/db/repos/teams'
import type { SleeperClient } from '@main/sources/sleeper'
import {
  importLeague,
  refreshSleeper,
  reimportRules,
  SOURCE_LEAGUE,
  SOURCE_PLAYERS,
  SOURCE_RULES,
  SOURCE_STATE,
  sourceProjections
} from '@main/sync/sleeperSync'
import { rules } from '../../fixtures/rules'
import * as fx from '../../fixtures/sleeper'

function fakeClient(overrides: Partial<SleeperClient> = {}): SleeperClient {
  return {
    getUser: vi.fn(async () => fx.user),
    getUserLeagues: vi.fn(async () => [fx.league]),
    getLeague: vi.fn(async () => fx.league),
    getLeagueUsers: vi.fn(async () => fx.users),
    getLeagueRosters: vi.fn(async () => fx.rosters),
    getAllPlayers: vi.fn(async () => fx.players),
    getNflState: vi.fn(async () => fx.nflState),
    getProjections: vi.fn(async () => fx.projections),
    ...overrides
  }
}

describe('sleeper sync', () => {
  let db: Db
  let clock: Date
  const now = (): Date => clock

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    clock = new Date('2026-09-15T12:00:00.000Z')
  })

  it('importLeague writes league, teams, rosters, players and settings', async () => {
    const steps: string[] = []
    const result = await importLeague(
      { db, sleeper: fakeClient(), now, onStep: (e) => steps.push(`${e.source}:${e.status}`) },
      'L1',
      'u1'
    )
    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(steps).toEqual([
      `${SOURCE_STATE}:ok`,
      `${SOURCE_LEAGUE}:ok`,
      `${SOURCE_PLAYERS}:ok`,
      `${sourceProjections(2026, 1)}:ok`
    ])
    expect(getLeague(db, 'L1')?.name).toBe('Test League')
    expect(listTeams(db, 'L1').map((t) => [t.rosterId, t.isMe])).toEqual([
      [1, true],
      [2, false]
    ])
    expect(listRoster(db, 'L1', 1)).toHaveLength(4)
    expect(listRoster(db, 'L1', 1)[0]).toMatchObject({
      playerId: '4866',
      fullName: 'Saquon Barkley'
    })
    expect(countPlayers(db)).toBe(7)
    expect(getSetting(db, SETTING_ACTIVE_LEAGUE)).toBe('L1')
    expect(getSetting(db, SETTING_MY_USER)).toBe('u1')
  })

  it('refresh skips fresh sources and re-fetches stale ones', async () => {
    const sleeper = fakeClient()
    await importLeague({ db, sleeper, now }, 'L1', 'u1')

    const fresh = await refreshSleeper({ db, sleeper, now })
    expect(fresh.steps.map((s) => s.status)).toEqual(['skipped', 'skipped', 'skipped', 'skipped'])
    expect(sleeper.getLeague).toHaveBeenCalledTimes(1)

    clock = new Date('2026-09-15T12:11:00.000Z')
    const stale = await refreshSleeper({ db, sleeper, now })
    expect(stale.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'skipped', 'skipped'])
    expect(sleeper.getLeague).toHaveBeenCalledTimes(2)
    expect(sleeper.getAllPlayers).toHaveBeenCalledTimes(1)

    const forced = await refreshSleeper({ db, sleeper, now }, { force: true })
    expect(forced.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(sleeper.getAllPlayers).toHaveBeenCalledTimes(2)
  })

  it('a failing league step is logged and does not block the players step', async () => {
    const sleeper = fakeClient({
      getLeagueRosters: vi.fn(async () => {
        throw new Error('Sleeper 503')
      })
    })
    const result = await importLeague({ db, sleeper, now }, 'L1', 'u1')
    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'error', 'ok', 'ok'])
    expect(result.steps[1].message).toContain('503')
    expect(getLastError(db)).toMatchObject({ source: SOURCE_LEAGUE })
    expect(getLeague(db, 'L1')).toBeNull()
    expect(countPlayers(db)).toBe(7)
  })

  it('a league that does not exist is an error with a clear message', async () => {
    await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')

    const sleeper = fakeClient({ getLeague: vi.fn(async () => null) })
    const result = await importLeague({ db, sleeper, now }, 'nope', null)
    expect(result.steps[1]).toMatchObject({ status: 'error' })
    expect(result.steps[1].message).toMatch(/not found/i)
    expect(getSetting(db, SETTING_ACTIVE_LEAGUE)).toBe('L1')
  })

  it('refresh without a configured league only syncs state and players', async () => {
    const sleeper = fakeClient()
    const result = await refreshSleeper({ db, sleeper, now })
    expect(result.steps.map((s) => s.source)).toEqual([
      SOURCE_STATE,
      SOURCE_PLAYERS,
      sourceProjections(2026, 1)
    ])
    expect(sleeper.getLeague).not.toHaveBeenCalled()
  })

  it('a throwing onStep callback does not abort the remaining sources', async () => {
    const onStep = vi.fn(() => {
      throw new Error('renderer window closed')
    })
    const result = await importLeague({ db, sleeper: fakeClient(), now, onStep }, 'L1', 'u1')
    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(onStep).toHaveBeenCalledTimes(4)
  })

  it('projections: stored for the display week, skipped when the endpoint is gone or off-season', async () => {
    const sleeper = fakeClient()
    await importLeague({ db, sleeper, now }, 'L1', 'u1')
    expect(getLastSync(db, sourceProjections(2026, 1))).toMatchObject({
      status: 'ok',
      rowsWritten: 3,
      message: '2 items skipped'
    })
    expect(listProjections(db, 2026, 1).map((p) => p.playerId)).toEqual(['4866', '6794', 'LAR'])

    const gone = fakeClient({ getProjections: vi.fn(async () => null) })
    const r1 = await refreshSleeper({ db, sleeper: gone, now }, { force: true })
    expect(r1.steps.at(-1)).toMatchObject({
      status: 'skipped',
      message: 'projections endpoint unavailable'
    })

    const preseason = fakeClient({
      getNflState: vi.fn(async () => ({ ...fx.nflState, season_type: 'pre' }))
    })
    const r2 = await refreshSleeper({ db, sleeper: preseason, now }, { force: true })
    expect(r2.steps.at(-1)).toMatchObject({
      status: 'skipped',
      message: 'projections only during the regular season'
    })
    expect(preseason.getProjections).not.toHaveBeenCalled()
  })

  describe('rules', () => {
    const halfPpr = (): SleeperClient =>
      fakeClient({
        getLeague: vi.fn(async () => ({
          ...fx.league,
          scoring_settings: { ...fx.league.scoring_settings, rec: 0.5 }
        }))
      })

    it('importLeague writes Sleeper-sourced rules', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      const r = getRules(db, 'L1')
      expect(r?.source).toBe('sleeper')
      expect(r?.scoring.rec).toBe(1)
      expect(r?.rosterSlots).toContainEqual({ slot: 'BN', count: 6 })
      expect(r?.settings.numTeams).toBe(2)
    })

    it('refresh updates rules that are still Sleeper-sourced', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      await refreshSleeper({ db, sleeper: halfPpr(), now }, { force: true })
      expect(getRules(db, 'L1')?.scoring.rec).toBe(0.5)
    })

    it('refresh never overwrites custom rules', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      withTransaction(db, () =>
        saveRules(db, 'L1', rules({ source: 'custom', scoring: { rec: 2 } }))
      )
      await refreshSleeper({ db, sleeper: halfPpr(), now }, { force: true })
      expect(getRules(db, 'L1')).toMatchObject({ source: 'custom', scoring: { rec: 2 } })
    })

    it('reimportRules overwrites custom rules and logs the step', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      withTransaction(db, () =>
        saveRules(db, 'L1', rules({ source: 'custom', scoring: { rec: 2 } }))
      )
      const result = await reimportRules({ db, sleeper: halfPpr(), now }, 'L1')
      expect(result.source).toBe('sleeper')
      expect(result.scoring.rec).toBe(0.5)
      expect(getRules(db, 'L1')).toEqual(result)
      expect(getLastSync(db, SOURCE_RULES)?.status).toBe('ok')
    })

    it('reimportRules throws and logs an error when the league is gone', async () => {
      await importLeague({ db, sleeper: fakeClient(), now }, 'L1', 'u1')
      const client = fakeClient({ getLeague: vi.fn(async () => null) })
      await expect(reimportRules({ db, sleeper: client, now }, 'L1')).rejects.toThrow(
        'League L1 not found on Sleeper'
      )
      expect(getLastSync(db, SOURCE_RULES)?.status).toBe('error')
      expect(getRules(db, 'L1')?.scoring.rec).toBe(1)
    })
  })
})
