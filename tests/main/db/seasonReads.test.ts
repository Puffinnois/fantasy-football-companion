import { describe, expect, it } from 'vitest'
import { listPointsBySeason, replacePoints } from '@main/db/repos/points'
import {
  listProjectionsBySeason,
  replaceProjections,
  type ProjectionRecord
} from '@main/db/repos/projections'
import {
  listPlayerWeeksBySeason,
  listRegularSeasonGames,
  listSnapsBySeason,
  listTeamWeeksBySeason,
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  upsertGames
} from '@main/db/repos/stats'
import { parsePlayerWeekStats, parseSnapCounts, parseTeamWeekStats } from '@main/sources/nflverse'
import type { GameRecord } from '@main/sources/nflverse-types'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as nv from '../../fixtures/nflverse'

describe('season-wide reads', () => {
  it('list stats, snaps and team weeks of one season only', () => {
    const db = seedLeague()
    const reg = parsePlayerWeekStats(nv.playerStatsCsv).records.filter(
      (r) => r.seasonType === 'REG'
    )
    replacePlayerWeekStats(db, 2025, reg, SEED_TS)
    replacePlayerWeekStats(db, 2026, reg.map((r) => ({ ...r, season: 2026 })).slice(0, 1), SEED_TS)
    replaceTeamWeekStats(db, 2025, parseTeamWeekStats(nv.teamStatsCsv).records, SEED_TS)
    replaceSnaps(db, 2025, parseSnapCounts(nv.snapCountsCsv).records, SEED_TS)

    // ORDER BY week, gsis_id
    expect(listPlayerWeeksBySeason(db, 2025).map((r) => [r.gsisId, r.week])).toEqual([
      ['00-0025565', 1],
      ['00-0034844', 1],
      ['00-0036322', 1],
      ['00-0034844', 2]
    ])
    expect(listPlayerWeeksBySeason(db, 2026)).toHaveLength(1)
    expect(listTeamWeeksBySeason(db, 2025).map((t) => t.team)).toEqual(['DAL', 'HOU', 'LA', 'PHI'])
    expect(listTeamWeeksBySeason(db, 2026)).toEqual([])
    expect(listSnapsBySeason(db, 2025)).toEqual([
      { pfrId: 'BarkSa00', week: 1, offensePct: 0.83 },
      { pfrId: 'BarkSa00', week: 2, offensePct: 0.9 }
    ])
  })

  it('lists regular-season games, points and projections of one season', () => {
    const db = seedLeague()
    const game = (gameId: string, season: number, week: number, gameType = 'REG'): GameRecord => ({
      gameId,
      season,
      week,
      gameType,
      gameday: '2026-09-10',
      gametime: '13:00',
      homeTeam: 'PHI',
      awayTeam: 'DAL',
      homeScore: null,
      awayScore: null
    })
    upsertGames(db, [game('a', 2026, 1), game('b', 2026, 19, 'POST'), game('c', 2025, 1)], SEED_TS)
    expect(listRegularSeasonGames(db, 2026).map((g) => g.gameId)).toEqual(['a'])

    replacePoints(
      db,
      'L1',
      [
        { playerId: '4866', season: 2026, week: 2, points: 10 },
        { playerId: '4866', season: 2026, week: 1, points: 20 },
        { playerId: '4866', season: 2025, week: 1, points: 7 }
      ],
      SEED_TS
    )
    expect(listPointsBySeason(db, 'L1', 2026)).toEqual([
      { playerId: '4866', week: 1, points: 20 },
      { playerId: '4866', week: 2, points: 10 }
    ])

    const proj = (week: number): ProjectionRecord => ({
      playerId: '4866',
      season: 2026,
      week,
      company: null,
      team: null,
      opponent: null,
      stats: { rush_yd: 80 }
    })
    replaceProjections(db, 2026, 1, [proj(1)], SEED_TS)
    replaceProjections(db, 2026, 2, [proj(2)], SEED_TS)
    replaceProjections(db, 2025, 1, [{ ...proj(1), season: 2025 }], SEED_TS)
    expect(listProjectionsBySeason(db, 2026).map((p) => p.week)).toEqual([1, 2])
  })
})
