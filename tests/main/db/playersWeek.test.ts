import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { replacePlayerIds } from '@main/db/repos/playerIds'
import { playersOptions, playersWeek, tabsForSlots } from '@main/db/repos/playersWeek'
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
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as nv from '../../fixtures/nflverse'
import * as fx from '../../fixtures/sleeper'

const S = 2026
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

describe('playersWeek', () => {
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

  it('rows carry both lines, points, delta, usage, owner, game and bye', () => {
    const { rows } = playersWeek(db, 'L1', S, 1)
    expect(rows.map((r) => r.playerId).sort()).toEqual([
      '4866',
      '6794',
      '7564',
      '8259',
      '9509',
      'LAR'
    ]) // 1234 is inactive with no team
    const barkley = rows.find((r) => r.playerId === '4866')!
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
    expect(barkley.actual).toMatchObject({
      rush_att: 18,
      rush_yd: 60,
      rush_td: 1,
      rec: 4,
      rec_tgt: 5,
      rec_yd: 24
    })
    expect(barkley.projection).toMatchObject({ rush_att: 18.2, rec_tgt: 4 })
    expect(barkley.projected).toBeCloseTo(84.5 * 0.1 + 0.7 * 6 + 3.1 * 1 + 22.3 * 0.1 + 0.1 * 6, 2) // rules() fixture: PPR, 0.1/yd, 6/td
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
    const def = rows.find((r) => r.playerId === 'LAR')!
    expect(def).toMatchObject({ position: 'DEF', points: 12, statsAvailable: true })
    expect(def.actual).toMatchObject({ sack: 4, int: 2, pts_allow: 9, yds_allow: 250 + 60 - 30 })
    expect(def.projection).toMatchObject({ sack: 2.4, pts_allow: 20.5 })
    expect(def.game?.opponent).toBe('HOU')
    expect(rows.find((r) => r.playerId === '8259')).toMatchObject({
      statsAvailable: false,
      points: null,
      projected: null,
      delta: null,
      actual: {},
      projection: null
    })
    expect(rows.find((r) => r.playerId === '6794')?.targetShare).toBeNull() // fixture has no target_share column
    toggleWatch(db, '7564', SEED_TS)
    expect(playersWeek(db, 'L1', S, 1).rows.find((r) => r.playerId === '7564')?.watched).toBe(true)
  })

  it('a future week has no stats but keeps the upcoming game or bye', () => {
    const bye = playersWeek(db, 'L1', S, 2).rows.find((r) => r.playerId === '4866')
    expect(bye).toMatchObject({ points: null, actual: {}, game: null, byeWeek: 2 })
    const { rows } = playersWeek(db, 'L1', S, 3)
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

  it('FB players show as RB', () => {
    db.prepare("UPDATE players SET position = 'FB' WHERE player_id = '8259'").run()
    expect(playersWeek(db, 'L1', S, 1).rows.find((r) => r.playerId === '8259')?.position).toBe('RB')
  })
})
