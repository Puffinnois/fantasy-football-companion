import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  mapLeague,
  mapNflState,
  mapPlayers,
  mapProjections,
  mapRosterPlayers,
  mapRules,
  mapTeams
} from '@main/sync/mappers'
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
      { rosterId: 1, playerId: 'LAR', slot: 'starter', starterIndex: 3 },
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

  describe('mapRules', () => {
    it('maps scoring key-for-key, roster slot counts and settings', () => {
      const rules = mapRules(fx.league, 'T')
      expect(rules.source).toBe('sleeper')
      expect(rules.updatedAt).toBe('T')
      expect(rules.scoring).toEqual({
        rec: 1,
        rush_yd: 0.1,
        rec_yd: 0.1,
        rush_td: 6,
        rec_td: 6,
        pass_td: 4,
        pass_yd: 0.04,
        fum_lost: -2
      })
      expect(rules.positionOverrides).toEqual({})
      expect(rules.rosterSlots).toEqual([
        { slot: 'QB', count: 1 },
        { slot: 'RB', count: 2 },
        { slot: 'WR', count: 2 },
        { slot: 'TE', count: 1 },
        { slot: 'FLEX', count: 1 },
        { slot: 'K', count: 1 },
        { slot: 'DEF', count: 1 },
        { slot: 'BN', count: 6 },
        { slot: 'IR', count: 1 }
      ])
      expect(rules.settings).toEqual({
        numTeams: 2,
        waiverType: 'faab',
        faabBudget: 100,
        tradeDeadlineWeek: 13,
        playoffStartWeek: 15,
        playoffTeams: 6
      })
    })

    it('maps the playoff round type when Sleeper sends it', () => {
      const rules = mapRules(
        { ...fx.league, settings: { ...fx.league.settings, playoff_round_type: 1 } },
        'T'
      )
      expect(rules.settings.playoffRoundType).toBe(1)
    })

    it('rounds float noise and keeps unknown keys', () => {
      const rules = mapRules(
        { ...fx.league, scoring_settings: { pass_yd: 0.03999999910593033, def_3_and_out: 1 } },
        'T'
      )
      expect(rules.scoring).toEqual({ pass_yd: 0.04, def_3_and_out: 1 })
    })

    it('maps priority waivers, "no deadline" (99) and missing settings', () => {
      const rules = mapRules(
        { ...fx.league, settings: { num_teams: 10, waiver_type: 0, trade_deadline: 99 } },
        'T'
      )
      expect(rules.settings).toEqual({ numTeams: 10, waiverType: 'priority' })
    })

    it('falls back to total_rosters when num_teams is missing', () => {
      const rules = mapRules({ ...fx.league, settings: {} }, 'T')
      expect(rules.settings.numTeams).toBe(2)
    })
  })
})

describe('mapProjections', () => {
  it('keeps regular-season items of the requested week with a stats object', () => {
    const { records, skipped } = mapProjections(fx.projections, 2026, 1)
    expect(records.map((r) => r.playerId)).toEqual(['4866', '6794', 'LAR'])
    expect(skipped).toBe(2) // null stats; wrong week
    expect(records[0]).toEqual({
      playerId: '4866',
      season: 2026,
      week: 1,
      company: 'rotowire',
      team: 'PHI',
      opponent: 'DAL',
      stats: {
        rush_att: 18.2,
        rush_yd: 84.5,
        rush_td: 0.7,
        rec: 3.1,
        rec_tgt: 4,
        rec_yd: 22.3,
        rec_td: 0.1,
        pts_ppr: 20.1
      }
    })
  })

  it('maps the captured real payload', () => {
    const real = JSON.parse(
      readFileSync(new URL('../../fixtures/sleeper/projections.json', import.meta.url), 'utf8')
    )
    const { records, skipped } = mapProjections(real, 2026, 2)
    expect(skipped).toBe(1) // one ADP-only stub without a point projection
    expect(records).toHaveLength(19)
    expect(records.find((r) => r.playerId === '7042')?.stats).toMatchObject({
      fgm: 1.82,
      fga: 2.14,
      xpm: 2.79
    })
    expect(records.find((r) => r.playerId === 'BUF')?.stats).toMatchObject({
      sack: 2.65,
      pts_allow: 24.5
    })
  })
})

describe('mapPlayers injury detail (ROS realism spec §2)', () => {
  it('carries status, body part and notes', () => {
    const [row] = mapPlayers({
      '1': {
        player_id: '1',
        full_name: 'Jordan Mason',
        position: 'RB',
        fantasy_positions: ['RB'],
        team: 'MIN',
        status: 'Injured Reserve',
        injury_status: 'IR',
        injury_body_part: 'Thumb',
        injury_notes: 'Surgery'
      }
    })
    expect(row).toMatchObject({
      playerId: '1',
      status: 'Injured Reserve',
      injuryStatus: 'IR',
      injuryBodyPart: 'Thumb',
      injuryNotes: 'Surgery'
    })
  })

  it('defaults the new fields to null', () => {
    const [row] = mapPlayers({
      '2': {
        player_id: '2',
        full_name: 'Healthy Guy',
        position: 'WR',
        fantasy_positions: ['WR'],
        team: 'SF'
      }
    })
    expect(row).toMatchObject({ injuryBodyPart: null, injuryNotes: null })
  })
})
