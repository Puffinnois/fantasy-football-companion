import { describe, expect, it } from 'vitest'
import type { WhValue } from '@main/db/repos/warehouse'
import { aggregatePbp } from '@main/warehouse/aggregate'
import { PlayIndex } from '@main/warehouse/playIndex'
import { captured } from '../../fixtures/warehouse'
import { dropback, pbpCsv, QB, RB, run, WR } from '../../fixtures/pbp'

/** nflverse `stats_player_week` 2025 for this game: [gsis id, carries, targets]. */
const OFFICIAL: [string, number, number][] = [
  ['00-0033077', 1, 0], // Dak Prescott DAL
  ['00-0034351', 0, 7], // Dallas Goedert PHI
  ['00-0034844', 18, 5], // Saquon Barkley PHI
  ['00-0035243', 4, 1], // Miles Sanders DAL
  ['00-0035676', 0, 1], // A.J. Brown PHI
  ['00-0036265', 3, 0], // AJ Dillon PHI
  ['00-0036358', 0, 13], // CeeDee Lamb DAL
  ['00-0036389', 14, 0], // Jalen Hurts PHI
  ['00-0036876', 0, 1], // Kylen Granson PHI
  ['00-0036912', 0, 3], // DeVonta Smith PHI
  ['00-0036997', 15, 3], // Javonte Williams DAL
  ['00-0037247', 0, 4], // George Pickens DAL
  ['00-0037666', 0, 2], // Jalen Tolbert DAL
  ['00-0037741', 0, 3], // Jahan Dotson PHI
  ['00-0037801', 2, 2], // KaVontae Turpin DAL
  ['00-0038041', 0, 6], // Jake Ferguson DAL
  ['00-0038547', 0, 1], // Luke Schoonmaker DAL
  ['00-0039530', 0, 1], // Brevyn Spann-Ford DAL
  ['00-0039746', 3, 0] // Will Shipley PHI
]

const finite = (v: WhValue): boolean =>
  typeof v === 'number'
    ? Number.isFinite(v)
    : typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(finite)

describe('aggregatePbp (spec §6.1)', () => {
  it('aggregates a hand-built file, leaving out deleted, preseason and keyless rows', () => {
    const out = aggregatePbp(
      pbpCsv([
        run({ rushing_yards: 4 }),
        run({ rushing_yards: 6, week: 2 }),
        run({ play_deleted: 1 }),
        run({ season_type: 'PRE' }),
        run({ week: '' }),
        dropback({ season_type: 'POST', week: 19 })
      ])
    )
    expect(out.skipped).toBe(1)
    expect(
      out.playerWeeks.map((r) => [r.playerKey, r.seasonType, r.week, r.data.rush_carries ?? 0])
    ).toEqual([
      [RB, 'REG', 1, 1],
      [RB, 'REG', 2, 1],
      [QB, 'POST', 19, 0],
      [WR, 'POST', 19, 0]
    ])
    expect(
      out.teamWeeks.map((r) => [r.team, r.week, r.data.off_plays ?? r.data.def_plays])
    ).toEqual([
      ['PHI', 1, 1],
      ['DAL', 1, 1],
      ['PHI', 2, 1],
      ['DAL', 2, 1],
      ['PHI', 19, 1],
      ['DAL', 19, 1]
    ])
    expect(out.playerWeeks.every((r) => r.source === 'pbp' && r.keyType === 'gsis')).toBe(true)
  })

  it('adds every play it reads to the play index', () => {
    const index = new PlayIndex()
    aggregatePbp(captured('pbp_2025_game.csv'), index)
    expect(index.size).toBe(163)
    expect(index.get('2025_01_DAL_PHI', 71)).toMatchObject({ posteam: 'DAL', snap: true })
  })

  it('accepts a header-only file and fails on a missing key column', () => {
    expect(aggregatePbp(pbpCsv([]))).toEqual({ playerWeeks: [], teamWeeks: [], skipped: 0 })
    expect(() => aggregatePbp('play_id,season,week\n1,2025,1\n')).toThrow(
      'pbp: column "game_id" is missing'
    )
  })

  it('matches nflverse carries and targets on a real game', () => {
    const out = aggregatePbp(captured('pbp_2025_game.csv'))
    expect(out.skipped).toBe(0)
    const byKey = new Map(out.playerWeeks.map((r) => [r.playerKey, r.data]))
    const counted = OFFICIAL.map(([id]) => {
      const d = byKey.get(id) ?? {}
      return [id, Number(d.rush_carries ?? 0) + Number(d.pass_kneels ?? 0), d.rec_targets ?? 0]
    })
    expect(counted).toEqual(OFFICIAL)
  })

  it('mirrors the two teams of a real game and stores only sums and counts', () => {
    const out = aggregatePbp(captured('pbp_2025_game.csv'))
    const [phi, dal] = ['PHI', 'DAL'].map((t) => out.teamWeeks.find((r) => r.team === t)?.data)
    expect(out.teamWeeks).toHaveLength(2)
    // PHI won 24–20.
    expect([phi?.off_drive_points, dal?.off_drive_points]).toEqual([24, 20])
    expect(phi?.off_plays).toBe(dal?.def_plays)
    expect(phi?.def_epa_sum).toBe(dal?.off_epa_sum)
    for (const r of [...out.playerWeeks, ...out.teamWeeks]) {
      expect(Object.values(r.data).every(finite)).toBe(true)
    }
  })
})
