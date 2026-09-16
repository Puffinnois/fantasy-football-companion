import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting, setSetting } from '@main/db/repos/settings'
import { getNflState, setNflState } from '@main/db/repos/state'
import { finishSync, getLastError, getLastSync, startSync } from '@main/db/repos/syncLog'
import { getLeague, upsertLeague } from '@main/db/repos/leagues'
import { listRoster, listTeams, replaceRosterPlayers, replaceTeams } from '@main/db/repos/teams'
import { countPlayers, upsertPlayers, type PlayerRecord } from '@main/db/repos/players'
import type { Team } from '@shared/types'

const T = '2026-09-15T12:00:00.000Z'

function team(rosterId: number, extra: Partial<Team> = {}): Team {
  return {
    leagueId: 'L1',
    rosterId,
    ownerId: `u${rosterId}`,
    displayName: `Owner ${rosterId}`,
    teamName: null,
    avatar: null,
    wins: 0,
    losses: 0,
    ties: 0,
    fpts: 0,
    fptsAgainst: 0,
    isMe: false,
    ...extra
  }
}

function player(playerId: string, extra: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    playerId,
    fullName: `Player ${playerId}`,
    firstName: null,
    lastName: null,
    position: 'RB',
    fantasyPositions: ['RB'],
    team: 'BUF',
    status: 'Active',
    injuryStatus: null,
    age: null,
    yearsExp: null,
    depthChartOrder: null,
    searchRank: null,
    gsisId: null,
    sportradarId: null,
    espnId: null,
    ...extra
  }
}

describe('repos', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    upsertLeague(
      db,
      {
        leagueId: 'L1',
        name: 'L',
        season: '2026',
        status: 'in_season',
        totalRosters: 2,
        syncedAt: T,
        sleeperRaw: '{}'
      },
      T
    )
  })

  it('settings round-trip and overwrite', () => {
    expect(getSetting(db, 'k')).toBeNull()
    setSetting(db, 'k', 'a')
    setSetting(db, 'k', 'b')
    expect(getSetting(db, 'k')).toBe('b')
  })

  it('nfl state is a singleton upsert', () => {
    expect(getNflState(db)).toBeNull()
    setNflState(db, {
      season: '2026',
      week: 2,
      displayWeek: 1,
      seasonType: 'regular',
      fetchedAt: T
    })
    setNflState(db, {
      season: '2026',
      week: 3,
      displayWeek: 2,
      seasonType: 'regular',
      fetchedAt: T
    })
    expect(getNflState(db)).toMatchObject({ week: 3, displayWeek: 2 })
  })

  it('sync log start/finish/last/error', () => {
    const a = startSync(db, 'sleeper:league', T)
    finishSync(db, a, 'ok', T, null, 5)
    const b = startSync(db, 'sleeper:players', T)
    finishSync(db, b, 'error', T, 'boom', 0)
    expect(getLastSync(db, 'sleeper:league')).toMatchObject({ id: a, status: 'ok', rowsWritten: 5 })
    expect(getLastSync(db, 'sleeper:players', 'ok')).toBeNull()
    expect(getLastError(db)).toMatchObject({ id: b, message: 'boom' })
  })

  it('league upsert updates in place', () => {
    upsertLeague(
      db,
      {
        leagueId: 'L1',
        name: 'Renamed',
        season: '2026',
        status: 'in_season',
        totalRosters: 2,
        syncedAt: T,
        sleeperRaw: '{}'
      },
      T
    )
    expect(getLeague(db, 'L1')).toMatchObject({ name: 'Renamed', totalRosters: 2 })
    expect(getLeague(db, 'nope')).toBeNull()
  })

  it('teams are replaced and listed with mine first', () => {
    replaceTeams(db, 'L1', [team(1, { wins: 3 }), team(2, { wins: 1, isMe: true })], T)
    replaceTeams(db, 'L1', [team(1, { wins: 3 }), team(2, { wins: 1, isMe: true })], T)
    const teams = listTeams(db, 'L1')
    expect(teams.map((t) => t.rosterId)).toEqual([2, 1])
    expect(teams[0].isMe).toBe(true)
  })

  it('roster lists players joined with names, ordered by slot then starter index', () => {
    replaceTeams(db, 'L1', [team(1)], T)
    upsertPlayers(
      db,
      [player('a', { fullName: 'Aaron', position: 'QB' }), player('b', { fullName: 'Bob' })],
      T
    )
    replaceRosterPlayers(
      db,
      'L1',
      [
        { rosterId: 1, playerId: 'b', slot: 'bench', starterIndex: null },
        { rosterId: 1, playerId: 'zzz', slot: 'starter', starterIndex: 1 },
        { rosterId: 1, playerId: 'a', slot: 'starter', starterIndex: 0 }
      ],
      T
    )
    const roster = listRoster(db, 'L1', 1)
    expect(roster.map((r) => r.playerId)).toEqual(['a', 'zzz', 'b'])
    expect(roster[0]).toMatchObject({ fullName: 'Aaron', position: 'QB', slot: 'starter' })
    expect(roster[1].fullName).toBe('zzz')
  })

  it('replacing teams cascades roster players', () => {
    replaceTeams(db, 'L1', [team(1)], T)
    replaceRosterPlayers(
      db,
      'L1',
      [{ rosterId: 1, playerId: 'a', slot: 'bench', starterIndex: null }],
      T
    )
    replaceTeams(db, 'L1', [team(1)], T)
    expect(listRoster(db, 'L1', 1)).toEqual([])
  })

  it('player upsert is idempotent and stores fantasy positions as JSON', () => {
    expect(
      upsertPlayers(db, [player('a'), player('b', { fantasyPositions: ['WR', 'RB'] })], T)
    ).toBe(2)
    upsertPlayers(db, [player('a', { team: 'KC' })], T)
    expect(countPlayers(db)).toBe(2)
    const row = db
      .prepare('SELECT team, fantasy_positions FROM players WHERE player_id = ?')
      .get('b') as { team: string; fantasy_positions: string }
    expect(JSON.parse(row.fantasy_positions)).toEqual(['WR', 'RB'])
    expect(
      (db.prepare('SELECT team FROM players WHERE player_id = ?').get('a') as { team: string }).team
    ).toBe('KC')
  })
})
