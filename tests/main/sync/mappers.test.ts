import { describe, expect, it } from 'vitest'
import { mapLeague, mapNflState, mapPlayers, mapRosterPlayers, mapTeams } from '@main/sync/mappers'
import * as fx from '../../fixtures/sleeper'

describe('mappers', () => {
  it('maps nfl state', () => {
    expect(mapNflState(fx.nflState, 'T')).toEqual({
      season: '2026',
      week: 2,
      displayWeek: 1,
      seasonType: 'regular',
      fetchedAt: 'T'
    })
  })

  it('maps league and keeps the raw JSON', () => {
    const rec = mapLeague(fx.league, 'T')
    expect(rec).toMatchObject({
      leagueId: 'L1',
      name: 'Test League',
      totalRosters: 2,
      syncedAt: 'T'
    })
    expect(JSON.parse(rec.sleeperRaw).scoring_settings.rec).toBe(1)
  })

  it('maps teams with owner names, decimal points and isMe', () => {
    const teams = mapTeams('L1', fx.rosters, fx.users, 'u1')
    expect(teams).toHaveLength(2)
    expect(teams[0]).toMatchObject({
      rosterId: 1,
      displayName: 'Me',
      teamName: 'Cook Book',
      wins: 1,
      fpts: 131.42,
      fptsAgainst: 98.06,
      isMe: true
    })
    expect(teams[1]).toMatchObject({
      rosterId: 2,
      displayName: 'Rival',
      teamName: null,
      avatar: 'abc',
      isMe: false
    })
  })

  it('falls back when the owner is unknown and myUserId is null', () => {
    const teams = mapTeams(
      'L1',
      [{ ...fx.rosters[0], owner_id: null, settings: null }],
      fx.users,
      null
    )
    expect(teams[0]).toMatchObject({ displayName: 'Roster 1', wins: 0, fpts: 0, isMe: false })
  })

  it('maps roster slots: starters keep order and skip empty "0" slots; reserve→ir; taxi→taxi; rest→bench', () => {
    const rows = mapRosterPlayers(fx.rosters)
    expect(rows.filter((r) => r.rosterId === 1)).toEqual([
      { rosterId: 1, playerId: '4866', slot: 'starter', starterIndex: 0 },
      { rosterId: 1, playerId: '6794', slot: 'starter', starterIndex: 1 },
      { rosterId: 1, playerId: 'LAR', slot: 'starter', starterIndex: 2 },
      { rosterId: 1, playerId: '8259', slot: 'ir', starterIndex: null }
    ])
    expect(rows.filter((r) => r.rosterId === 2)).toEqual([
      { rosterId: 2, playerId: '7564', slot: 'starter', starterIndex: 0 },
      { rosterId: 2, playerId: '9509', slot: 'taxi', starterIndex: null }
    ])
  })

  it('maps players: trims gsis ids, blanks become null, DEF names from first/last, espn id stringified', () => {
    const recs = mapPlayers(fx.players)
    expect(recs).toHaveLength(7)
    const byId = Object.fromEntries(recs.map((r) => [r.playerId, r]))
    expect(byId['4866']).toMatchObject({
      fullName: 'Saquon Barkley',
      gsisId: '00-0034844',
      espnId: '3929630',
      sportradarId: 'sr-1'
    })
    expect(byId['LAR']).toMatchObject({
      fullName: 'Los Angeles Rams',
      position: 'DEF',
      gsisId: null
    })
    expect(byId['1234'].gsisId).toBeNull()
    expect(byId['8259'].injuryStatus).toBe('Questionable')
  })
})
