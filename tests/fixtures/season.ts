import type { Db } from '@main/db/connection'
import { replacePlayerIds, type PlayerIdRecord } from '@main/db/repos/playerIds'
import { replacePoints } from '@main/db/repos/points'
import { replaceProjections, type ProjectionRecord } from '@main/db/repos/projections'
import { setNflState } from '@main/db/repos/state'
import {
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  upsertGames
} from '@main/db/repos/stats'
import { parsePlayerWeekStats, parseSnapCounts, parseTeamWeekStats } from '@main/sources/nflverse'
import type { GameRecord } from '@main/sources/nflverse-types'
import { SEED_TS } from './db'
import * as nv from './nflverse'

export const SEASON = 2026

const ids = (
  playerId: string,
  gsisId: string | null,
  pfrId: string | null = null,
  nflverseTeam: string | null = null
): PlayerIdRecord => ({
  playerId,
  gsisId,
  pfrId,
  sportradarId: null,
  espnId: null,
  nflverseTeam,
  resolution: gsisId ? 'crosswalk' : nflverseTeam ? 'team' : 'unresolved'
})

const game = (
  gameId: string,
  week: number,
  homeTeam: string,
  awayTeam: string,
  homeScore: number | null = null,
  awayScore: number | null = null
): GameRecord => ({
  gameId,
  season: SEASON,
  week,
  gameType: 'REG',
  gameday: `2026-09-${10 + week}`,
  gametime: '13:00',
  homeTeam,
  awayTeam,
  homeScore,
  awayScore
})

const pts = (
  playerId: string,
  week: number,
  points: number
): { playerId: string; season: number; week: number; points: number } => ({
  playerId,
  season: SEASON,
  week,
  points
})

const proj = (
  playerId: string,
  week: number,
  stats: Record<string, number>,
  opponent: string
): ProjectionRecord => ({
  playerId,
  season: SEASON,
  week,
  company: 'rotowire',
  team: null,
  opponent,
  stats
})

/**
 * Season 2026 on league L1 as of week 3 with Thursday played: Barkley (4866, PHI) has points for
 * weeks 1–3, Jefferson (6794, MIN — bye week 2) for week 1, Chase (7564) weeks 1–2, Bijan (9509)
 * week 1, LAR week 1; Cook (8259) is unmatched to nflverse. Projections stored for weeks 3 and 4.
 * nflverse stat rows come from the CSV fixtures (Barkley weeks 1–2, Jefferson week 1) mapped to 2026.
 */
export function seedSeason(db: Db): void {
  setNflState(db, {
    season: '2026',
    week: 3,
    displayWeek: 3,
    seasonType: 'regular',
    fetchedAt: SEED_TS
  })
  replacePlayerIds(
    db,
    [
      ids('4866', '00-0034844', 'BarkSa00'),
      ids('6794', '00-0036322'),
      ids('7564', '00-0036900'),
      ids('9509', '00-0039000'),
      ids('LAR', null, null, 'LA'),
      ids('8259', null)
    ],
    SEED_TS
  )
  const withSeason = <T extends { season: number }>(r: T): T => ({ ...r, season: SEASON })
  replacePlayerWeekStats(
    db,
    SEASON,
    parsePlayerWeekStats(nv.playerStatsCsv)
      .records.filter((r) => r.seasonType === 'REG')
      .map(withSeason),
    SEED_TS
  )
  replaceTeamWeekStats(
    db,
    SEASON,
    parseTeamWeekStats(nv.teamStatsCsv).records.map(withSeason),
    SEED_TS
  )
  replaceSnaps(db, SEASON, parseSnapCounts(nv.snapCountsCsv).records.map(withSeason), SEED_TS)
  upsertGames(
    db,
    [
      game('g1', 1, 'PHI', 'DAL', 24, 20),
      game('g2', 1, 'MIN', 'CHI', 20, 10),
      game('g3', 1, 'LA', 'HOU', 14, 9),
      game('g4', 2, 'KC', 'PHI', 17, 21),
      game('g5', 2, 'DAL', 'LA', 27, 13),
      game('g6', 3, 'PHI', 'NYG'),
      game('g7', 3, 'DET', 'MIN'),
      game('g8', 3, 'SF', 'LA'),
      game('g9', 4, 'PHI', 'WAS'),
      game('g10', 4, 'MIN', 'GB'),
      game('g11', 4, 'LA', 'ARI')
    ],
    SEED_TS
  )
  replacePoints(
    db,
    'L1',
    [
      pts('4866', 1, 20),
      pts('4866', 2, 10),
      pts('4866', 3, 30),
      pts('6794', 1, 25),
      pts('7564', 1, 5),
      pts('7564', 2, 15),
      pts('9509', 1, 12),
      pts('LAR', 1, 8)
    ],
    SEED_TS
  )
  replaceProjections(
    db,
    SEASON,
    3,
    [
      proj('4866', 3, { rush_yd: 100 }, 'NYG'),
      proj('6794', 3, { rec: 5, rec_yd: 80 }, 'DET'),
      proj('7564', 3, { rec: 4, rec_yd: 50 }, 'CLE')
    ],
    SEED_TS
  )
  replaceProjections(
    db,
    SEASON,
    4,
    [
      proj('4866', 4, { rush_yd: 80 }, 'WAS'),
      proj('6794', 4, { rec: 6, rec_yd: 90 }, 'GB'),
      proj('9509', 4, { rush_yd: 70 }, 'NO')
    ],
    SEED_TS
  )
}
