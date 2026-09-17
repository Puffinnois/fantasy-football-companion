import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { replacePlayerIds } from '@main/db/repos/playerIds'
import { playerWeeklyStats } from '@main/db/repos/playersQuery'
import { replacePoints } from '@main/db/repos/points'
import {
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  upsertGames
} from '@main/db/repos/stats'
import { listRoster } from '@main/db/repos/teams'
import { parsePlayerWeekStats, parseSnapCounts, parseTeamWeekStats } from '@main/sources/nflverse'
import type { PointsContext } from '@shared/types'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as fx from '../../fixtures/nflverse'

const SEASON = 2026 // the Sleeper fixture league's season
const ctx: PointsContext = { season: SEASON, lastWeek: 2 }
const game = (
  week: number,
  home: string,
  away: string
): Parameters<typeof upsertGames>[1][number] => ({
  gameId: `${SEASON}_${week}_${away}_${home}`,
  season: SEASON,
  week,
  gameType: 'REG',
  gameday: null,
  gametime: null,
  homeTeam: home,
  awayTeam: away,
  homeScore: null,
  awayScore: null
})

describe('points-aware queries', () => {
  let db: Db

  beforeEach(() => {
    db = seedLeague()
    replacePlayerIds(
      db,
      [
        {
          playerId: '4866',
          gsisId: '00-0034844',
          pfrId: 'BarkSa00',
          sportradarId: null,
          espnId: null,
          nflverseTeam: null,
          resolution: 'crosswalk'
        },
        {
          playerId: '6794',
          gsisId: '00-0036322',
          pfrId: null,
          sportradarId: null,
          espnId: null,
          nflverseTeam: null,
          resolution: 'crosswalk'
        },
        {
          playerId: '7564',
          gsisId: '00-0036900',
          pfrId: null,
          sportradarId: null,
          espnId: null,
          nflverseTeam: null,
          resolution: 'sleeper_gsis'
        },
        {
          playerId: '9509',
          gsisId: '00-0039013',
          pfrId: null,
          sportradarId: null,
          espnId: null,
          nflverseTeam: null,
          resolution: 'sleeper_gsis'
        },
        {
          playerId: 'LAR',
          gsisId: null,
          pfrId: null,
          sportradarId: null,
          espnId: null,
          nflverseTeam: 'LA',
          resolution: 'team'
        },
        {
          playerId: '8259',
          gsisId: null,
          pfrId: null,
          sportradarId: null,
          espnId: null,
          nflverseTeam: null,
          resolution: 'unresolved'
        }
      ],
      SEED_TS
    )
    replacePoints(
      db,
      'L1',
      [
        { playerId: '4866', season: SEASON, week: 1, points: 18.4 },
        { playerId: '4866', season: SEASON, week: 2, points: 11.8 },
        { playerId: '6794', season: SEASON, week: 1, points: 10.8 },
        { playerId: 'LAR', season: SEASON, week: 1, points: 12 },
        { playerId: '7564', season: SEASON, week: 1, points: 25 },
        { playerId: '9509', season: SEASON, week: 2, points: 9 },
        { playerId: '4866', season: SEASON - 1, week: 1, points: 99 }
      ],
      SEED_TS
    )
    // PHI plays weeks 1 and 3 only -> bye week 2; MIN plays 1-3 (no bye found in a 3-week sample)
    upsertGames(
      db,
      [
        game(1, 'PHI', 'MIN'),
        game(2, 'MIN', 'LA'),
        game(3, 'PHI', 'LA'),
        game(1, 'LA', 'BUF'),
        game(2, 'BUF', 'ATL'),
        game(3, 'MIN', 'ATL')
      ],
      SEED_TS
    )
  })

  it('listRoster adds season/last-week points, bye and availability', () => {
    const roster = listRoster(db, 'L1', 1, ctx)
    const barkley = roster.find((p) => p.playerId === '4866')
    expect(barkley).toMatchObject({
      seasonPoints: 30.2,
      lastWeekPoints: 11.8,
      byeWeek: 2,
      statsAvailable: true
    })
    expect(roster.find((p) => p.playerId === '6794')).toMatchObject({
      seasonPoints: 10.8,
      lastWeekPoints: null,
      byeWeek: null
    })
    expect(roster.find((p) => p.playerId === '8259')).toMatchObject({
      seasonPoints: null,
      lastWeekPoints: null,
      statsAvailable: false
    })
    expect(roster.find((p) => p.playerId === 'LAR')).toMatchObject({
      seasonPoints: 12,
      statsAvailable: true
    })
  })

  it('listRoster without a context returns no points (Plan A/B callers)', () => {
    expect(
      listRoster(db, 'L1', 1).every((p) => p.seasonPoints === null && p.byeWeek === null)
    ).toBe(true)
  })

  it('playerWeeklyStats merges stats, snaps and points for a player, team rows for a DEF', () => {
    const reg = parsePlayerWeekStats(fx.playerStatsCsv).records.filter(
      (r) => r.seasonType === 'REG'
    )
    replacePlayerWeekStats(
      db,
      SEASON,
      reg.map((r) => ({ ...r, season: SEASON })),
      SEED_TS
    )
    replaceTeamWeekStats(
      db,
      SEASON,
      parseTeamWeekStats(fx.teamStatsCsv).records.map((r) => ({ ...r, season: SEASON })),
      SEED_TS
    )
    replaceSnaps(
      db,
      SEASON,
      parseSnapCounts(fx.snapCountsCsv).records.map((r) => ({ ...r, season: SEASON })),
      SEED_TS
    )

    const weeks = playerWeeklyStats(db, 'L1', '4866', SEASON)
    expect(weeks).toHaveLength(2)
    expect(weeks[0]).toMatchObject({
      season: SEASON,
      week: 1,
      team: 'PHI',
      opponent: 'DAL',
      points: 18.4,
      snaps: { offenseSnaps: 55, offensePct: 0.83 }
    })
    expect(weeks[0].stats.rushing_yards).toBe(60)
    expect(weeks[1]).toMatchObject({
      week: 2,
      points: 11.8,
      snaps: { offenseSnaps: 60, offensePct: 0.9 }
    })

    const def = playerWeeklyStats(db, 'L1', 'LAR', SEASON)
    expect(def).toHaveLength(1)
    expect(def[0]).toMatchObject({ week: 1, team: 'LA', opponent: 'HOU', points: 12, snaps: null })
    expect(def[0].stats.def_sacks).toBe(4)

    expect(playerWeeklyStats(db, 'L1', '8259', SEASON)).toEqual([])
    expect(playerWeeklyStats(db, 'L1', 'nobody', SEASON)).toEqual([])
  })
})
