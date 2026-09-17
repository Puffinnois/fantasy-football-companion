import { beforeEach, describe, expect, it } from 'vitest'
import { withTransaction, type Db } from '@main/db/connection'
import { replacePlayerIds } from '@main/db/repos/playerIds'
import { countPoints, latestPointsWeek, listWeekPoints, replacePoints } from '@main/db/repos/points'
import { saveRules } from '@main/db/repos/rules'
import { replacePlayerWeekStats, replaceTeamWeekStats, upsertGames } from '@main/db/repos/stats'
import { pointsAllowedIndex, recomputePoints } from '@main/scoring/recompute'
import { parseGames, parsePlayerWeekStats, parseTeamWeekStats } from '@main/sources/nflverse'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as fx from '../../fixtures/nflverse'
import { rules } from '../../fixtures/rules'

const defRules = rules({
  scoring: {
    ...rules().scoring,
    sack: 1,
    int: 2,
    pts_allow_0: 10,
    pts_allow_1_6: 7,
    pts_allow_7_13: 4,
    pts_allow_14_20: 1
  }
})

describe('recomputePoints', () => {
  let db: Db

  beforeEach(() => {
    db = seedLeague(defRules)
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
    const reg = parsePlayerWeekStats(fx.playerStatsCsv).records.filter(
      (r) => r.seasonType === 'REG'
    )
    replacePlayerWeekStats(db, 2025, reg, SEED_TS)
    replaceTeamWeekStats(db, 2025, parseTeamWeekStats(fx.teamStatsCsv).records, SEED_TS)
    upsertGames(db, parseGames(fx.gamesCsv).records, SEED_TS)
  })

  it('scores every resolved player-week and team-DEF week under the league rules', () => {
    const n = withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))
    // Barkley wk1, wk2, Jefferson wk1, LA DEF wk1 (Folk has no player_ids row; 8259 is unresolved)
    expect(n).toBe(4)
    expect(countPoints(db, 'L1')).toBe(4)
    // 60*0.1 + 6 + 4*1 + 24*0.1 = 18.4 ; 88*0.1 + 2 + 1 = 11.8
    expect(listWeekPoints(db, 'L1', '4866', 2025)).toEqual([
      { week: 1, points: 18.4 },
      { week: 2, points: 11.8 }
    ])
    // 4 rec + 6.8 = 10.8
    expect(listWeekPoints(db, 'L1', '6794', 2025)).toEqual([{ week: 1, points: 10.8 }])
    // 4 sacks + 2 int * 2 + 9 points allowed (7-13 tier = 4) = 12
    expect(listWeekPoints(db, 'L1', 'LAR', 2025)).toEqual([{ week: 1, points: 12 }])
    expect(latestPointsWeek(db, 'L1', 2025)).toBe(2)
    expect(latestPointsWeek(db, 'L1', 2024)).toBeNull()
  })

  it('is a full rebuild: rules changes replace old points', () => {
    withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))
    saveRules(db, 'L1', rules({ ...defRules, scoring: { ...defRules.scoring, rec: 0.5 } }))
    withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))
    expect(countPoints(db, 'L1')).toBe(4)
    expect(listWeekPoints(db, 'L1', '4866', 2025)[0].points).toBe(16.4)
  })

  it('returns 0 and clears points when the league has no rules', () => {
    withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))
    db.prepare('DELETE FROM rules WHERE league_id = ?').run('L1')
    expect(withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))).toBe(0)
    expect(countPoints(db, 'L1')).toBe(0)
  })

  it('replacePoints is idempotent per league', () => {
    const rows = [{ playerId: '4866', season: 2025, week: 1, points: 1 }]
    expect(replacePoints(db, 'L1', rows, SEED_TS)).toBe(1)
    expect(replacePoints(db, 'L1', rows, SEED_TS)).toBe(1)
    expect(countPoints(db, 'L1')).toBe(1)
  })

  it('pointsAllowedIndex reads both sides of a played game and skips unplayed ones', () => {
    const idx = pointsAllowedIndex(parseGames(fx.gamesCsv).records)
    expect(idx.get('PHI|2025|1')).toBe(20)
    expect(idx.get('DAL|2025|1')).toBe(24)
    expect(idx.get('LA|2025|1')).toBe(9)
    expect(idx.has('CHI|2025|3')).toBe(false)
  })
})
