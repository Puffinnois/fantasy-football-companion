import { describe, expect, it } from 'vitest'
import { rng } from '@main/stats/models/linear'
import { DIVISIONS, simulateSeason, type SimGame } from '@main/stats/models/simulate'

/** Every team plays its division twice (96 games); results drawn once from a seed, or unplayed. */
function divisionSchedule(played: boolean, seed = 1): SimGame[] {
  const random = rng(seed)
  const games: SimGame[] = []
  let week = 1
  for (const teams of Object.values(DIVISIONS)) {
    for (const home of teams) {
      for (const away of teams) {
        if (home === away) continue
        games.push({
          week: (week++ % 6) + 1,
          home,
          away,
          homeField: 48,
          result: played ? (random() < 0.5 ? 3 : -3) : null
        })
      }
    }
  }
  return games
}

const ratings = new Map(
  Object.values(DIVISIONS)
    .flat()
    .map((t) => [t, 1500])
)
const sum = (
  odds: ReturnType<typeof simulateSeason>,
  k: 'playoffs' | 'division' | 'bye' | 'conference' | 'superBowl'
): number => odds.reduce((s, o) => s + o[k], 0)

describe('season simulation (stats-analysis spec §8.1)', () => {
  it('fills every playoff place in every run, and repeats exactly with the same seed', () => {
    const games = divisionSchedule(false)
    const odds = simulateSeason({ season: 2025, games, ratings, runs: 400, seed: 3 })
    expect(sum(odds, 'playoffs')).toBeCloseTo(14, 9)
    expect(sum(odds, 'division')).toBeCloseTo(8, 9)
    expect(sum(odds, 'bye')).toBeCloseTo(2, 9)
    expect(sum(odds, 'conference')).toBeCloseTo(2, 9)
    expect(sum(odds, 'superBowl')).toBeCloseTo(1, 9)
    expect(odds.reduce((s, o) => s + o.wins + o.losses + o.ties, 0)).toBeCloseTo(
      2 * games.length,
      9
    )
    expect(simulateSeason({ season: 2025, games, ratings, runs: 400, seed: 3 })).toEqual(odds)
    expect(simulateSeason({ season: 2025, games, ratings, runs: 400, seed: 4 })).not.toEqual(odds)
  })

  it('seeds six teams and two byes per conference in 2019', () => {
    const odds = simulateSeason({
      season: 2019,
      games: divisionSchedule(false),
      ratings,
      runs: 200
    })
    expect(sum(odds, 'playoffs')).toBeCloseTo(12, 9)
    expect(sum(odds, 'bye')).toBeCloseTo(4, 9)
  })

  it('breaks a division tie on head-to-head', () => {
    const games = divisionSchedule(true).filter((g) => !DIVISIONS['AFC East'].includes(g.home))
    const east = (home: string, away: string, result: number): SimGame => ({
      week: 1,
      home,
      away,
      homeField: 48,
      result
    })
    // BUF and MIA finish 4–2; BUF swept MIA.
    games.push(
      east('BUF', 'MIA', 7),
      east('MIA', 'BUF', -7),
      east('BUF', 'NYJ', 7),
      east('NYJ', 'BUF', -7),
      east('BUF', 'NE', -7),
      east('NE', 'BUF', 7),
      east('MIA', 'NE', 7),
      east('NE', 'MIA', -7),
      east('MIA', 'NYJ', 7),
      east('NYJ', 'MIA', -7),
      east('NE', 'NYJ', 7),
      east('NYJ', 'NE', 7)
    )
    const odds = new Map(
      simulateSeason({ season: 2025, games, ratings, runs: 50 }).map((o) => [o.team, o])
    )
    expect([odds.get('BUF')!.division, odds.get('MIA')!.division]).toEqual([1, 0])
    expect([odds.get('BUF')!.wins, odds.get('MIA')!.wins, odds.get('NE')!.wins]).toEqual([4, 4, 3])
  })

  it('wins a game with its Elo probability', () => {
    const games: SimGame[] = [{ week: 1, home: 'KC', away: 'NYJ', homeField: 0, result: null }]
    const strong = new Map(ratings).set('KC', 1700).set('NYJ', 1300)
    const odds = new Map(
      simulateSeason({ season: 2025, games, ratings: strong, runs: 10_000 }).map((o) => [o.team, o])
    )
    // 400 Elo points: ten to one.
    expect(odds.get('KC')!.wins).toBeCloseTo(10 / 11, 1)
    expect(odds.get('KC')!.wins + odds.get('NYJ')!.wins).toBeCloseTo(1, 9)
  })
})
