import { describe, expect, it } from 'vitest'
import {
  calibration,
  fgFeatures,
  fgProbability,
  fitFieldGoals,
  hosmerLemeshow,
  type FieldGoalAttempt
} from '@main/stats/models/fieldGoal'
import { rng } from '@main/stats/models/linear'

const kick = (o: Partial<FieldGoalAttempt>): FieldGoalAttempt => ({
  game_id: 'g',
  play_id: 1,
  season: 2024,
  distance: 40,
  made: true,
  roof: 'outdoors',
  surface: 'grass',
  temp: 60,
  wind: 5,
  ...o
})

/** Synthetic kicks: the make probability falls with distance and wind. */
function kicks(n: number, seed: number, season = 2024): FieldGoalAttempt[] {
  const random = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const distance = 20 + Math.floor(random() * 40)
    const wind = Math.floor(random() * 20)
    const p = 1 / (1 + Math.exp(-(6 - 0.11 * distance - 0.03 * wind)))
    return kick({ play_id: i, season, distance, wind, made: random() < p })
  })
}

describe('field-goal make probability (stats-analysis spec §8.4)', () => {
  it('reads indoor kicks without wind or cold', () => {
    const dome = fgFeatures(kick({ roof: 'dome', wind: 30, temp: 10 }))
    const calm = fgFeatures(kick({ roof: 'closed', wind: 0, temp: 70 }))
    expect(dome).toEqual(calm)
    // Missing outdoor weather reads as the average.
    expect(fgFeatures(kick({ wind: null, temp: null }))).toEqual(
      fgFeatures(kick({ wind: 8, temp: 58 }))
    )
  })

  it('fits longer and windier kicks as harder, and is calibrated on new kicks', () => {
    const beta = fitFieldGoals(kicks(20_000, 1))
    expect(fgProbability(kick({ distance: 25 }), beta)).toBeGreaterThan(
      fgProbability(kick({ distance: 50 }), beta)
    )
    expect(fgProbability(kick({ wind: 20 }), beta)).toBeLessThan(
      fgProbability(kick({ wind: 0 }), beta)
    )
    const held = calibration(kicks(5_000, 2, 2025), beta)
    expect(held.map((b) => b.from)).toEqual([20, 25, 30, 35, 40, 45, 50, 55])
    const { chi2, critical } = hosmerLemeshow(held)
    expect(critical).toBe(15.507)
    expect(chi2).toBeLessThan(critical)
  })

  it('weighs recent seasons more', () => {
    // 2019 kickers miss everything from 50; 2024 kickers make everything: the fit leans to 2024.
    const old = Array.from({ length: 400 }, (_, i) =>
      kick({ play_id: i, season: 2019, distance: i % 2 ? 50 : 30, made: i % 2 === 0 })
    )
    const recent = Array.from({ length: 400 }, (_, i) =>
      kick({ play_id: i, season: 2024, distance: i % 2 ? 50 : 30, made: true })
    )
    const beta = fitFieldGoals([...old, ...recent])
    expect(fgProbability(kick({ distance: 50 }), beta)).toBeGreaterThan(0.8)
  })
})
