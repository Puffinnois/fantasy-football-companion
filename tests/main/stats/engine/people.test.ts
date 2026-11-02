import { describe, expect, it } from 'vitest'
import { people } from '@main/stats/engine/people'
import { openTestDb } from '../../../fixtures/stats'
import { seedTable, type Row } from '../../../fixtures/statsDerived'

const QB = '00-0034796'
const CB = '00-0037000'
const OLD = '00-0020000'

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  await seedTable(db, 'games', [{ season: 2026 }, { season: 2025 }])
  await seedTable(db, 'players', [
    { gsis_id: QB, name: 'Lamar Jackson', first_name: 'Lamar', last_name: 'Jackson' },
    { gsis_id: CB, name: 'Lamar Jackson', first_name: 'Lamar', last_name: 'Jackson' },
    { gsis_id: OLD, name: 'Old Timer', first_name: 'Old', last_name: 'Timer' }
  ])
  const season = (
    gsis_id: string,
    season: number,
    games: number,
    position: string,
    team: string
  ): Row => ({
    gsis_id,
    season,
    season_type: 'REG',
    games,
    position,
    team
  })
  await seedTable(db, 'player_season', [
    season(QB, 2025, 17, 'QB', 'BAL'),
    season(QB, 2026, 7, 'QB', 'BAL'),
    season(CB, 2025, 3, 'DB', 'CHI'),
    season(CB, 2026, 0, 'DB', 'CHI'),
    season(OLD, 2019, 16, 'WR', 'NYJ'),
    { ...season(QB, 2025, 1, 'QB', 'BAL'), season_type: 'POST' }
  ])
  await seedTable(db, 'fantasy_week', [
    { gsis_id: QB, season: 2026, season_type: 'REG', week: 1, scoring: 'ppr', points: 25.45 },
    { gsis_id: QB, season: 2025, season_type: 'REG', week: 1, scoring: 'ppr', points: 20 },
    { gsis_id: QB, season: 2025, season_type: 'REG', week: 1, scoring: 'std', points: 99 },
    { gsis_id: OLD, season: 2019, season_type: 'REG', week: 1, scoring: 'ppr', points: 30 }
  ])
  return db
}

describe('people (Ask spec §4.1)', () => {
  it('lists everyone with a regular-season game, with what tells two namesakes apart', async () => {
    const db = await seeded()
    const all = await people(db)
    expect(all).toEqual([
      {
        id: OLD,
        name: 'Old Timer',
        firstName: 'Old',
        lastName: 'Timer',
        position: 'WR',
        team: 'NYJ',
        firstSeason: 2019,
        lastSeason: 2019,
        games: 16,
        recentGames: 0,
        recentPoints: 0
      },
      {
        id: QB,
        name: 'Lamar Jackson',
        firstName: 'Lamar',
        lastName: 'Jackson',
        position: 'QB',
        team: 'BAL',
        firstSeason: 2025,
        lastSeason: 2026,
        games: 24,
        recentGames: 24,
        recentPoints: 45.5
      },
      {
        id: CB,
        name: 'Lamar Jackson',
        firstName: 'Lamar',
        lastName: 'Jackson',
        position: 'DB',
        team: 'CHI',
        firstSeason: 2025,
        lastSeason: 2025,
        games: 3,
        recentGames: 3,
        recentPoints: 0
      }
    ])
  })
})
