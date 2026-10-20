import { describe, expect, it } from 'vitest'
import {
  brier,
  ELO,
  eloShift,
  homeFieldOf,
  moneylineProbability,
  movMultiplier,
  normalCdf,
  ratingsAfter,
  runElo,
  winProbability,
  type EloGame
} from '@main/stats/models/elo'
import { srs } from '@main/stats/models/ratings'

const game = (
  o: Partial<EloGame> & Pick<EloGame, 'game_id' | 'home_team' | 'away_team'>
): EloGame => ({
  season: 2025,
  season_type: 'REG',
  week: 1,
  neutral: false,
  result: null,
  spread_line: null,
  home_moneyline: null,
  away_moneyline: null,
  ...o
})

describe('team Elo (stats-analysis spec §8.1)', () => {
  it('turns a rating gap into a win probability and a spread', () => {
    expect(winProbability(0)).toBe(0.5)
    // 400 Elo points: ten to one.
    expect(winProbability(400)).toBeCloseTo(10 / 11, 10)
    expect(winProbability(-100) + winProbability(100)).toBeCloseTo(1, 12)
    expect(homeFieldOf({ season: 2025, neutral: false })).toBe(48)
    expect(homeFieldOf({ season: 2025, neutral: true })).toBe(0)
    expect(homeFieldOf({ season: 2020, neutral: false })).toBe(0)
  })

  it('moves ratings more for a big upset than for an expected rout', () => {
    // The nfelo multiplier: ln(|MOV| + 1) × 2.2 / (winner's Elo edge × 0.001 + 2.2).
    expect(movMultiplier(7, 0)).toBeCloseTo(Math.log(8), 12)
    expect(movMultiplier(7, 200)).toBeLessThan(movMultiplier(7, -200))
    // An underdog by 100 wins by 14: it gains; a favourite by 100 winning by 14 gains less.
    const upset = eloShift(-100, 14)
    const expected = eloShift(100, 14)
    expect(upset).toBeGreaterThan(expected)
    expect(expected).toBeGreaterThan(0)
    expect(eloShift(100, -3)).toBeLessThan(0)
    // A tie moves nothing (ln 1 = 0).
    expect(eloShift(50, 0)).toBeCloseTo(0, 12)
  })

  it('runs every game in order and regresses a third to the mean between seasons', () => {
    const { rows, ratings } = runElo([
      game({ game_id: 'b', week: 2, home_team: 'KC', away_team: 'BUF', result: 3 }),
      game({ game_id: 'a', week: 1, home_team: 'BUF', away_team: 'KC', result: 10 }),
      game({ game_id: 'c', season: 2026, week: 1, home_team: 'BUF', away_team: 'KC', result: null })
    ])
    expect(rows.map((r) => r.game_id)).toEqual(['a', 'b', 'c'])
    const [a, b, c] = rows
    expect([a.home_elo_pre, a.away_elo_pre]).toEqual([1500, 1500])
    expect(a.home_wp).toBeCloseTo(winProbability(48), 12)
    expect(a.elo_spread).toBeCloseTo(48 / 25, 12)
    const shift = eloShift(48, 10)
    expect(a.home_elo_post).toBeCloseTo(1500 + shift, 9)
    // Week 2 starts from week 1's ratings.
    expect(b.away_elo_pre).toBeCloseTo(1500 + shift, 9)
    // The next season starts a third of the way back to 1500, and an unplayed game changes nothing.
    const buf = ratings.get('BUF')!
    expect(c.played).toBe(false)
    expect(c.home_elo_post).toBeNull()
    expect(c.home_elo_pre).toBeCloseTo(buf, 9)
    expect(buf - ELO.base).toBeCloseTo(((b.away_elo_post as number) - ELO.base) * (2 / 3), 9)
    // Before week 1 a team has its preseason rating; after week 1, week 1's.
    expect(ratingsAfter(rows, 2025, 0).get('BUF')).toBe(1500)
    expect(ratingsAfter(rows, 2025, 1).get('BUF')).toBeCloseTo(a.home_elo_post as number, 9)
  })

  it('prices the market from the moneylines, else from the spread', () => {
    // −150 / +130: 0.6 and 0.4348 implied, 0.58 without the vig.
    expect(moneylineProbability(-150, 130)).toBeCloseTo(0.6 / (0.6 + 100 / 230), 9)
    expect(normalCdf(0)).toBeCloseTo(0.5, 7)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    const { rows } = runElo([
      game({
        game_id: 'm',
        home_team: 'BUF',
        away_team: 'KC',
        home_moneyline: -150,
        away_moneyline: 130
      }),
      game({ game_id: 's', home_team: 'DAL', away_team: 'NYG', spread_line: 3 })
    ])
    expect(rows[0].vegas_home_wp).toBeCloseTo(0.58, 2)
    expect(rows[1].vegas_home_wp).toBeCloseTo(normalCdf(3 / 13.5), 9)
  })

  it('scores probabilities with the Brier score', () => {
    expect(
      brier([
        { p: 0.5, result: 3 },
        { p: 0.5, result: -3 }
      ])
    ).toBe(0.25)
    expect(
      brier([
        { p: 1, result: 7 },
        { p: 0.5, result: 0 }
      ])
    ).toBe(0)
  })
})

describe('the Simple Rating System (spec §8.3)', () => {
  it('adds the average opponent rating to the average margin, centred on 0', () => {
    // A beat B by 10, B beat C by 10, C beat A by 10 at home twice over: a cycle sums to 0 each.
    const cycle = srs([
      { home: 'A', away: 'B', margin: 10 },
      { home: 'B', away: 'C', margin: 10 },
      { home: 'C', away: 'A', margin: 10 }
    ])
    for (const r of cycle.values()) expect(r).toBeCloseTo(0, 4)
    // Week 1: every team has played once, so each pair splits its margin (no oscillation).
    const two = srs([
      { home: 'A', away: 'B', margin: 14 },
      { home: 'C', away: 'D', margin: -6 }
    ])
    expect([...two.values()].map((r) => Number(r.toFixed(4)))).toEqual([7, -7, -3, 3])
    // A beat C by 10; C beat B by 10: A is 10 better than C, C 10 better than B.
    const chain = srs([
      { home: 'A', away: 'C', margin: 10 },
      { home: 'C', away: 'B', margin: 10 }
    ])
    expect(chain.get('A')! - chain.get('C')!).toBeCloseTo(10, 3)
    expect(chain.get('C')).toBeCloseTo(0, 3)
  })
})
