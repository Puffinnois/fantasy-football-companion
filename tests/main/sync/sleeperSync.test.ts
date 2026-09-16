import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getLeague } from '@main/db/repos/leagues'
import { countPlayers } from '@main/db/repos/players'
import { getSetting, SETTING_ACTIVE_LEAGUE, SETTING_MY_USER } from '@main/db/repos/settings'
import { getLastError } from '@main/db/repos/syncLog'
import { listRoster, listTeams } from '@main/db/repos/teams'
import type { SleeperClient } from '@main/sources/sleeper'
import {
  importLeague,
  refreshSleeper,
  SOURCE_LEAGUE,
  SOURCE_PLAYERS,
  SOURCE_STATE
} from '@main/sync/sleeperSync'
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
    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok'])
    expect(steps).toEqual([`${SOURCE_STATE}:ok`, `${SOURCE_LEAGUE}:ok`, `${SOURCE_PLAYERS}:ok`])
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
    expect(fresh.steps.map((s) => s.status)).toEqual(['skipped', 'skipped', 'skipped'])
    expect(sleeper.getLeague).toHaveBeenCalledTimes(1)

    clock = new Date('2026-09-15T12:11:00.000Z')
    const stale = await refreshSleeper({ db, sleeper, now })
    expect(stale.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'skipped'])
    expect(sleeper.getLeague).toHaveBeenCalledTimes(2)
    expect(sleeper.getAllPlayers).toHaveBeenCalledTimes(1)

    const forced = await refreshSleeper({ db, sleeper, now }, { force: true })
    expect(forced.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok'])
    expect(sleeper.getAllPlayers).toHaveBeenCalledTimes(2)
  })

  it('a failing league step is logged and does not block the players step', async () => {
    const sleeper = fakeClient({
      getLeagueRosters: vi.fn(async () => {
        throw new Error('Sleeper 503')
      })
    })
    const result = await importLeague({ db, sleeper, now }, 'L1', 'u1')
    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'error', 'ok'])
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
    expect(result.steps.map((s) => s.source)).toEqual([SOURCE_STATE, SOURCE_PLAYERS])
    expect(sleeper.getLeague).not.toHaveBeenCalled()
  })

  it('a throwing onStep callback does not abort the remaining sources', async () => {
    const onStep = vi.fn(() => {
      throw new Error('renderer window closed')
    })
    const result = await importLeague({ db, sleeper: fakeClient(), now, onStep }, 'L1', 'u1')
    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok'])
    expect(onStep).toHaveBeenCalledTimes(3)
  })
})
