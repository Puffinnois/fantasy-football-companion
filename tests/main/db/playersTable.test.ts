import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { replacePlayerIds } from '@main/db/repos/playerIds'
import { playersOptions, playersTable, tabsForSlots } from '@main/db/repos/playersTable'
import { replacePoints } from '@main/db/repos/points'
import { replaceProjections } from '@main/db/repos/projections'
import { setNflState } from '@main/db/repos/state'
import {
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  upsertGames
} from '@main/db/repos/stats'
import { toggleWatch } from '@main/db/repos/watchlist'
import { parsePlayerWeekStats, parseSnapCounts, parseTeamWeekStats } from '@main/sources/nflverse'
import { mapProjections } from '@main/sync/mappers'
import type { PlayersQuery } from '@shared/types'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as nv from '../../fixtures/nflverse'
import * as fx from '../../fixtures/sleeper'

const S = 2026
const base: PlayersQuery = {
  season: S,
  week: 1,
  mode: 'stats',
  tab: 'ALL',
  sort: { key: 'points', dir: 'desc' }
}
const ids = (
  playerId: string,
  gsisId: string | null,
  pfrId: string | null = null,
  nflverseTeam: string | null = null
) =>
  ({
    playerId,
    gsisId,
    pfrId,
    sportradarId: null,
    espnId: null,
    nflverseTeam,
    resolution: gsisId ? 'crosswalk' : nflverseTeam ? 'team' : 'unresolved'
  }) as const

describe('playersTable', () => {
  let db: Db

  beforeEach(() => {
    db = seedLeague()
    setNflState(db, {
      season: '2026',
      week: 2,
      displayWeek: 2,
      seasonType: 'regular',
      fetchedAt: SEED_TS
    })
    replacePlayerIds(
      db,
      [
        ids('4866', '00-0034844', 'BarkSa00'),
        ids('6794', '00-0036322'),
        ids('LAR', null, null, 'LA'),
        ids('8259', null)
      ],
      SEED_TS
    )
    const withSeason = <T extends { season: number }>(r: T): T => ({ ...r, season: S })
    replacePlayerWeekStats(
      db,
      S,
      parsePlayerWeekStats(nv.playerStatsCsv)
        .records.filter((r) => r.seasonType === 'REG')
        .map(withSeason),
      SEED_TS
    )
    replaceTeamWeekStats(
      db,
      S,
      parseTeamWeekStats(nv.teamStatsCsv).records.map(withSeason),
      SEED_TS
    )
    replaceSnaps(db, S, parseSnapCounts(nv.snapCountsCsv).records.map(withSeason), SEED_TS)
    upsertGames(
      db,
      [
        {
          gameId: 'g1',
          season: S,
          week: 1,
          gameType: 'REG',
          gameday: '2026-09-10',
          gametime: '20:15',
          homeTeam: 'PHI',
          awayTeam: 'DAL',
          homeScore: 24,
          awayScore: 20
        },
        {
          gameId: 'g2',
          season: S,
          week: 1,
          gameType: 'REG',
          gameday: '2026-09-13',
          gametime: '13:00',
          homeTeam: 'LA',
          awayTeam: 'HOU',
          homeScore: 14,
          awayScore: 9
        },
        {
          gameId: 'g3',
          season: S,
          week: 2,
          gameType: 'REG',
          gameday: '2026-09-20',
          gametime: '16:25',
          homeTeam: 'KC',
          awayTeam: 'MIN',
          homeScore: null,
          awayScore: null
        },
        {
          gameId: 'g4',
          season: S,
          week: 2,
          gameType: 'REG',
          gameday: '2026-09-20',
          gametime: '13:00',
          homeTeam: 'LA',
          awayTeam: 'DAL',
          homeScore: null,
          awayScore: null
        },
        {
          gameId: 'g5',
          season: S,
          week: 3,
          gameType: 'REG',
          gameday: '2026-09-27',
          gametime: '16:25',
          homeTeam: 'PHI',
          awayTeam: 'DAL',
          homeScore: null,
          awayScore: null
        }
      ],
      SEED_TS
    ) // PHI plays weeks 1 and 3 -> bye 2
    replacePoints(
      db,
      'L1',
      [
        { playerId: '4866', season: S, week: 1, points: 18.4 },
        { playerId: '6794', season: S, week: 1, points: 10.8 },
        { playerId: 'LAR', season: S, week: 1, points: 12 }
      ],
      SEED_TS
    )
    replaceProjections(db, S, 1, mapProjections(fx.projections, 2026, 1).records, SEED_TS)
  })

  it('tabsForSlots: ALL, singles, then the league flex slots in order', () => {
    expect(
      tabsForSlots([
        { slot: 'QB', count: 1 },
        { slot: 'FLEX', count: 2 },
        { slot: 'SUPER_FLEX', count: 1 },
        { slot: 'FLEX', count: 1 }
      ]).map((t) => t.id)
    ).toEqual(['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FLEX', 'SUPER_FLEX'])
    expect(tabsForSlots([{ slot: 'REC_FLEX', count: 1 }]).at(-1)).toEqual({
      id: 'REC_FLEX',
      label: 'REC FLEX',
      positions: ['WR', 'TE']
    })
  })

  it('playersOptions', () => {
    const o = playersOptions(db, 'L1')
    expect(o).toMatchObject({
      seasons: [2026, 2025],
      currentWeek: 2,
      lastScoredWeek: 1,
      projectionWeeks: [{ season: 2026, week: 1 }]
    })
    expect(o.tabs.map((t) => t.id)).toContain('FLEX') // the rules() fixture has a FLEX slot
  })

  it('stats mode: rows carry stats in Sleeper keys, points, delta, usage, owner, game and bye', () => {
    const { rows, total } = playersTable(db, 'L1', base)
    expect(total).toBe(6) // 4866 6794 8259 7564 9509 LAR (1234 is inactive with no team)
    expect(rows.map((r) => r.playerId)).toEqual(['4866', 'LAR', '6794', '9509', '7564', '8259']) // points desc, nulls last by name
    const barkley = rows[0]
    expect(barkley).toMatchObject({
      fullName: 'Saquon Barkley',
      position: 'RB',
      team: 'PHI',
      ownerName: 'Cook Book',
      rookie: false,
      watched: false,
      points: 18.4,
      statsAvailable: true,
      byeWeek: 2
    })
    expect(barkley.stats).toMatchObject({
      rush_att: 18,
      rush_yd: 60,
      rush_td: 1,
      rec: 4,
      rec_tgt: 5,
      rec_yd: 24
    })
    expect(barkley.projected).toBeCloseTo(
      18.2 * 0 + 84.5 * 0.1 + 0.7 * 6 + 3.1 * 1 + 22.3 * 0.1 + 0.1 * 6,
      2
    ) // rules() fixture: PPR, 0.1/yd, 6/td
    expect(barkley.delta).toBeCloseTo(18.4 - barkley.projected!, 2)
    expect(barkley.snapPct).toBe(0.83)
    expect(barkley.game).toEqual({
      opponent: 'DAL',
      home: true,
      kickoff: '2026-09-11T00:15:00.000Z',
      homeScore: 24,
      awayScore: 20,
      final: true
    })
    const def = rows[1]
    expect(def).toMatchObject({
      playerId: 'LAR',
      position: 'DEF',
      points: 12,
      statsAvailable: true
    })
    expect(def.stats).toMatchObject({ sack: 4, int: 2, pts_allow: 9, yds_allow: 250 + 60 - 30 })
    expect(def.game?.opponent).toBe('HOU')
    expect(rows.find((r) => r.playerId === '8259')).toMatchObject({
      statsAvailable: false,
      points: null,
      projected: null,
      delta: null,
      stats: {}
    })
    expect(rows.find((r) => r.playerId === '6794')?.targetShare).toBeNull() // fixture has no target_share column
  })

  it('projection mode: points are the scored projection, stats are the projection line, usage absent', () => {
    const { rows } = playersTable(db, 'L1', { ...base, mode: 'proj' })
    // Jefferson projects 18.91 under the fixture rules, Barkley 18.58
    expect(rows.slice(0, 2).map((r) => r.playerId)).toEqual(['6794', '4866'])
    expect(rows[1].stats).toMatchObject({ rush_att: 18.2, rec_tgt: 4 })
    expect(rows.find((r) => r.playerId === 'LAR')?.stats).toMatchObject({
      sack: 2.4,
      pts_allow: 20.5
    })
    expect(rows.find((r) => r.playerId === '7564')?.projected).toBeNull()
  })

  it('a future week has no stats but keeps the upcoming game or bye', () => {
    const bye = playersTable(db, 'L1', { ...base, week: 2 }).rows.find((r) => r.playerId === '4866')
    expect(bye).toMatchObject({ points: null, stats: {}, game: null, byeWeek: 2 })
    const { rows } = playersTable(db, 'L1', { ...base, week: 3 })
    expect(rows.find((r) => r.playerId === '4866')?.game).toEqual({
      opponent: 'DAL',
      home: true,
      final: false,
      kickoff: '2026-09-27T20:25:00.000Z',
      homeScore: null,
      awayScore: null
    })
    expect(rows.find((r) => r.playerId === '7564')?.game).toBeNull() // CIN is not in the fixture schedule at all
  })

  it('tabs, filters and search', () => {
    const idsOf = (q: Partial<PlayersQuery>): string[] =>
      playersTable(db, 'L1', { ...base, ...q }).rows.map((r) => r.playerId)
    expect(idsOf({ tab: 'WR' })).toEqual(['6794', '7564'])
    expect(idsOf({ tab: 'FLEX' })).toEqual(['4866', '6794', '9509', '7564', '8259'])
    expect(idsOf({ tab: 'DEF' })).toEqual(['LAR'])
    expect(idsOf({ freeAgents: true })).toEqual([])
    db.prepare("DELETE FROM roster_players WHERE player_id = '9509'").run()
    expect(idsOf({ freeAgents: true })).toEqual(['9509'])
    db.prepare("UPDATE players SET years_exp = 0 WHERE player_id = '9509'").run()
    expect(idsOf({ rookies: true })).toEqual(['9509'])
    toggleWatch(db, '7564', SEED_TS)
    expect(idsOf({ watchlist: true })).toEqual(['7564'])
    expect(playersTable(db, 'L1', { ...base, watchlist: true }).rows[0].watched).toBe(true)
    expect(idsOf({ owner: 2 })).toEqual(['7564'])
    expect(idsOf({ search: 'jeff' })).toEqual(['6794'])
    expect(idsOf({ sort: { key: 'stat:rec_yd', dir: 'asc' } }).slice(0, 2)).toEqual([
      '4866',
      '6794'
    ]) // 24 then 68; nulls last
    expect(idsOf({ sort: { key: 'name', dir: 'asc' } })[0]).toBe('9509') // Bijan
  })

  it('FB players show as RB and fall under the RB tab', () => {
    db.prepare("UPDATE players SET position = 'FB' WHERE player_id = '8259'").run()
    const { rows } = playersTable(db, 'L1', { ...base, tab: 'RB' })
    expect(rows.map((r) => [r.playerId, r.position])).toContainEqual(['8259', 'RB'])
  })
})
