import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  listAllPlayerWeeks,
  listGames,
  listNflverseIdentities,
  listPlayerWeeks,
  listSnaps,
  listTeamWeeks,
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  teamByeWeeks,
  upsertGames
} from '@main/db/repos/stats'
import {
  parseGames,
  parsePlayerWeekStats,
  parseSnapCounts,
  parseTeamWeekStats
} from '@main/sources/nflverse'
import * as fx from '../../fixtures/nflverse'

const TS = '2026-09-17T12:00:00.000Z'
const reg = parsePlayerWeekStats(fx.playerStatsCsv).records.filter((r) => r.seasonType === 'REG')

describe('stats repos', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replacePlayerWeekStats replaces a season idempotently and round-trips stats', () => {
    expect(replacePlayerWeekStats(db, 2025, reg, TS)).toBe(4)
    expect(replacePlayerWeekStats(db, 2025, reg, TS)).toBe(4)
    expect(listAllPlayerWeeks(db)).toHaveLength(4)
    const weeks = listPlayerWeeks(db, '00-0034844', 2025)
    expect(weeks.map((w) => w.week)).toEqual([1, 2])
    expect(weeks[0]).toMatchObject({ team: 'PHI', opponent: 'DAL', position: 'RB' })
    expect(weeks[0].stats).toMatchObject({ rushing_yards: 60, receptions: 4 })
    expect(listPlayerWeeks(db, '00-0034844', 2024)).toEqual([])
  })

  it('listNflverseIdentities lists distinct gsis/name/position triples', () => {
    replacePlayerWeekStats(db, 2025, reg, TS)
    expect(listNflverseIdentities(db)).toEqual([
      { gsisId: '00-0025565', name: 'Nick Folk', position: 'K' },
      { gsisId: '00-0034844', name: 'Saquon Barkley', position: 'RB' },
      { gsisId: '00-0036322', name: 'Justin Jefferson', position: 'WR' }
    ])
  })

  it('replacePlayerWeekStats only touches the given season', () => {
    replacePlayerWeekStats(db, 2025, reg, TS)
    replacePlayerWeekStats(
      db,
      2024,
      reg.map((r) => ({ ...r, season: 2024 })),
      TS
    )
    replacePlayerWeekStats(db, 2025, [], TS)
    expect(listAllPlayerWeeks(db).map((r) => r.season)).toEqual([2024, 2024, 2024, 2024])
  })

  it('replaceTeamWeekStats and listTeamWeeks', () => {
    const teams = parseTeamWeekStats(fx.teamStatsCsv).records
    expect(replaceTeamWeekStats(db, 2025, teams, TS)).toBe(4)
    const rows = listTeamWeeks(db)
    expect(rows.map((r) => r.team).sort()).toEqual(['DAL', 'HOU', 'LA', 'PHI'])
    expect(rows.find((r) => r.team === 'LA')).toMatchObject({ opponent: 'HOU', week: 1 })
    expect(rows.find((r) => r.team === 'LA')?.stats.def_sacks).toBe(4)
  })

  it('replaceSnaps and listSnaps', () => {
    const snaps = parseSnapCounts(fx.snapCountsCsv).records
    expect(replaceSnaps(db, 2025, snaps, TS)).toBe(2)
    expect(listSnaps(db, 'BarkSa00', 2025)).toEqual([
      {
        week: 1,
        offenseSnaps: 55,
        offensePct: 0.83,
        defenseSnaps: 0,
        defensePct: 0,
        stSnaps: 2,
        stPct: 0.07
      },
      {
        week: 2,
        offenseSnaps: 60,
        offensePct: 0.9,
        defenseSnaps: 0,
        defensePct: 0,
        stSnaps: 0,
        stPct: 0
      }
    ])
  })

  it('upsertGames updates scores on conflict', () => {
    const games = parseGames(fx.gamesCsv).records
    expect(upsertGames(db, games, TS)).toBe(5)
    const played = games.map((g) =>
      g.gameId === '2025_03_DAL_CHI' ? { ...g, homeScore: 31, awayScore: 10 } : g
    )
    upsertGames(db, played, TS)
    expect(listGames(db)).toHaveLength(5)
    expect(listGames(db).find((g) => g.gameId === '2025_03_DAL_CHI')).toMatchObject({
      homeScore: 31,
      awayScore: 10
    })
  })

  it('teamByeWeeks finds the regular-season week a team has no game', () => {
    upsertGames(
      db,
      [
        {
          gameId: 'g1',
          season: 2025,
          week: 1,
          gameType: 'REG',
          gameday: null,
          homeTeam: 'PHI',
          awayTeam: 'DAL',
          homeScore: null,
          awayScore: null
        },
        {
          gameId: 'g2',
          season: 2025,
          week: 2,
          gameType: 'REG',
          gameday: null,
          homeTeam: 'KC',
          awayTeam: 'PHI',
          homeScore: null,
          awayScore: null
        },
        {
          gameId: 'g3',
          season: 2025,
          week: 2,
          gameType: 'REG',
          gameday: null,
          homeTeam: 'DAL',
          awayTeam: 'LA',
          homeScore: null,
          awayScore: null
        },
        {
          gameId: 'g4',
          season: 2025,
          week: 3,
          gameType: 'REG',
          gameday: null,
          homeTeam: 'PHI',
          awayTeam: 'LA',
          homeScore: null,
          awayScore: null
        },
        {
          gameId: 'g5',
          season: 2025,
          week: 3,
          gameType: 'REG',
          gameday: null,
          homeTeam: 'KC',
          awayTeam: 'DAL',
          homeScore: null,
          awayScore: null
        },
        {
          gameId: 'p1',
          season: 2025,
          week: 19,
          gameType: 'WC',
          gameday: null,
          homeTeam: 'KC',
          awayTeam: 'LA',
          homeScore: null,
          awayScore: null
        }
      ],
      TS
    )
    const byes = teamByeWeeks(db, 2025)
    expect(byes.get('KC')).toBe(1)
    expect(byes.get('LA')).toBe(1)
    expect(byes.has('PHI')).toBe(false)
    expect(byes.has('DAL')).toBe(false)
    expect(teamByeWeeks(db, 2024).size).toBe(0)
  })
})
