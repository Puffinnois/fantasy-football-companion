import { describe, expect, it } from 'vitest'
import { headerOf } from '@main/sources/warehouse/parse'
import { aggregatePbp } from '@main/warehouse/aggregate'
import {
  aggregateParticipation,
  defensiveBacks,
  offensePersonnel,
  PART_COLUMNS
} from '@main/warehouse/participation'
import { PlayIndex } from '@main/warehouse/playIndex'
import { captured } from '../../fixtures/warehouse'
import { dropback, LB, partCsv, playIndex, QB, RB, run, WR, type PbpRow } from '../../fixtures/pbp'

/** Participation rows joined to `plays`; row i is play i + 1 unless it sets `play_id`. */
function part(plays: PbpRow[], rows: PbpRow[]): ReturnType<typeof aggregateParticipation> {
  const withIds = rows.map((r, i) => ({ play_id: i + 1, ...r }))
  return aggregateParticipation(partCsv(withIds), playIndex(plays))
}

const dataOf = (out: ReturnType<typeof aggregateParticipation>, id: string): unknown =>
  out.playerWeeks.find((r) => r.playerKey === id)?.data

const ON_FIELD = { offense_players: `${QB};${RB};${WR}`, defense_players: LB }

/** nflverse `snap_counts` for 2025 week 1, DAL at PHI: [gsis id, offense snaps, defense snaps]. */
const OFFICIAL: [string, number, number][] = [
  ['00-0036389', 63, 0], // Jalen Hurts PHI
  ['00-0034844', 50, 0], // Saquon Barkley PHI
  ['00-0035676', 55, 0], // A.J. Brown PHI
  ['00-0036912', 56, 0], // DeVonta Smith PHI
  ['00-0034351', 52, 0], // Dallas Goedert PHI
  ['00-0039841', 3, 61], // Cooper DeJean PHI
  ['00-0036418', 0, 61], // Zack Baun PHI
  ['00-0033077', 61, 0], // Dak Prescott DAL
  ['00-0036358', 56, 0], // CeeDee Lamb DAL
  ['00-0037247', 56, 0], // George Pickens DAL
  ['00-0036997', 47, 0], // Javonte Williams DAL
  ['00-0038041', 47, 0], // Jake Ferguson DAL
  ['00-0037242', 0, 63], // Kaiir Elam DAL
  ['00-0036942', 0, 41] // Osa Odighizuwa DAL
]

describe('personnel groups (spec §12)', () => {
  it('names the offense by backs and tight ends, in both formats', () => {
    expect(offensePersonnel('1 RB, 1 TE, 3 WR')).toBe('11')
    expect(offensePersonnel('6 OL, 1 RB, 2 TE, 1 WR')).toBe('12')
    expect(offensePersonnel('1 C, 2 G, 1 QB, 1 FB, 1 RB, 2 T, 1 TE, 2 WR')).toBe('21')
    expect(offensePersonnel('1 C, 2 G, 1 QB, 2 T, 5 WR')).toBe('00')
    expect(offensePersonnel(null)).toBeNull()
  })

  it('counts the defensive backs, in both formats', () => {
    expect(defensiveBacks('4 DL, 2 LB, 5 DB')).toBe('5')
    expect(defensiveBacks('3 CB, 2 DE, 2 DT, 1 FS, 2 ILB, 1 SS')).toBe('5')
    expect(defensiveBacks('2 CB, 2 DE, 2 DT, 3 LB, 1 S, 1 SS')).toBe('4')
    expect(defensiveBacks(null)).toBeNull()
  })
})

describe('aggregateParticipation (spec §6.5)', () => {
  it('snaps for everyone on the field, penalty-wiped snaps and two-point tries included', () => {
    const out = part(
      [
        run(),
        run({ play_type: 'no_play' }),
        dropback({ two_point_attempt: 1 }),
        { play_type: 'kickoff', kickoff_attempt: 1 },
        { play_type: 'no_play', penalty: 1, penalty_type: 'False Start' }
      ],
      Array.from({ length: 5 }, () => ({ ...ON_FIELD, offense_personnel: '1 RB, 1 TE, 3 WR' }))
    )
    expect(dataOf(out, RB)).toEqual({ off_snaps: 3, off_personnel: { '11': 3 } })
    expect(dataOf(out, LB)).toEqual({ def_snaps: 3 })
    expect(out.playerWeeks.map((r) => [r.playerKey, r.team, r.opponent])).toEqual([
      [QB, 'PHI', 'DAL'],
      [RB, 'PHI', 'DAL'],
      [WR, 'PHI', 'DAL'],
      [LB, 'DAL', 'PHI']
    ])
  })

  it('dropbacks on the field, split by man and zone (the route proxy)', () => {
    const out = part(
      [dropback(), dropback(), dropback({ sack: 1, receiver_player_id: '' }), run()],
      [
        { ...ON_FIELD, defense_man_zone_type: 'MAN_COVERAGE' },
        { ...ON_FIELD, defense_man_zone_type: 'ZONE_COVERAGE' },
        ON_FIELD,
        ON_FIELD
      ]
    )
    expect(dataOf(out, RB)).toEqual({
      off_snaps: 4,
      off_dropbacks: 3,
      off_dropbacks_man: 1,
      off_dropbacks_zone: 1
    })
  })

  it('the target: routes, and targets and yards against man and zone', () => {
    const out = part(
      [
        dropback({ complete_pass: 1, receiving_yards: 15 }),
        dropback(),
        dropback({ complete_pass: 1, receiving_yards: 8 })
      ],
      [
        { ...ON_FIELD, route: 'SLANT', defense_man_zone_type: 'MAN_COVERAGE' },
        { ...ON_FIELD, route: 'GO', defense_man_zone_type: 'ZONE_COVERAGE' },
        { ...ON_FIELD, route: 'SLANT', defense_man_zone_type: 'ZONE_COVERAGE' }
      ]
    )
    expect(dataOf(out, WR)).toMatchObject({
      rec_routes: { SLANT: 2, GO: 1 },
      rec_tgt_man: 1,
      rec_yds_man: 15,
      rec_tgt_zone: 2,
      rec_yds_zone: 8
    })
  })

  it('the passer: time to throw and pressured dropbacks', () => {
    const out = part(
      [
        dropback({ qb_epa: -1 }),
        dropback({ qb_epa: 0.5 }),
        dropback({ sack: 1, receiver_player_id: '', qb_epa: -2 })
      ],
      [
        { ...ON_FIELD, time_to_throw: 2.5, was_pressure: 'TRUE' },
        { ...ON_FIELD, time_to_throw: 3.1, was_pressure: 'FALSE' },
        { ...ON_FIELD, was_pressure: 'TRUE' }
      ]
    )
    expect(dataOf(out, QB)).toMatchObject({
      pass_ttt_sum: 5.6,
      pass_ttt_n: 2,
      pass_pressured: 2,
      pass_pressured_epa_sum: -3
    })
  })

  it('team: personnel, defensive backs, formation, box, rushers, coverage and pressure', () => {
    const out = part(
      [dropback(), run()],
      [
        {
          ...ON_FIELD,
          offense_personnel: '1 RB, 1 TE, 3 WR',
          defense_personnel: '4 DL, 2 LB, 5 DB',
          offense_formation: 'SHOTGUN',
          defenders_in_box: 6,
          number_of_pass_rushers: 4,
          defense_man_zone_type: 'ZONE_COVERAGE',
          defense_coverage_type: 'COVER_3',
          was_pressure: 'TRUE'
        },
        {
          ...ON_FIELD,
          offense_personnel: '2 RB, 1 TE, 2 WR',
          defense_personnel: '4 DL, 3 LB, 4 DB',
          offense_formation: 'I_FORM',
          defenders_in_box: 8,
          number_of_pass_rushers: 0
        }
      ]
    )
    const phi = {
      personnel: { '11': 1, '21': 1 },
      dbs: { '5': 1, '4': 1 },
      formation: { SHOTGUN: 1, I_FORM: 1 },
      box_sum: 14,
      box_n: 2,
      rushers_sum: 4,
      rushers_n: 1,
      zone: 1,
      coverage: { COVER_3: 1 },
      pressures: 1
    }
    const prefixed = (prefix: string): Record<string, unknown> =>
      Object.fromEntries(Object.entries(phi).map(([k, v]) => [prefix + k, v]))
    expect(out.teamWeeks.map((r) => [r.team, r.data])).toEqual([
      ['PHI', prefixed('off_')],
      ['DAL', prefixed('def_')]
    ])
  })

  it('counts misses and keyless rows, and fails on a missing column', () => {
    const out = part(
      [run()],
      [ON_FIELD, { ...ON_FIELD, play_id: 99 }, { ...ON_FIELD, play_id: '' }]
    )
    expect(out).toMatchObject({ skipped: 1, unmatched: 1 })
    const header = PART_COLUMNS.filter((c) => c !== 'offense_players').join(',')
    expect(() => aggregateParticipation(`${header}\n`, playIndex([]))).toThrow(
      'part: column "offense_players" is missing'
    )
  })

  it('reads only columns the real file has', () => {
    const header = new Set(headerOf(captured('part_2025_game.csv')))
    expect(PART_COLUMNS.filter((c) => !header.has(c))).toEqual([])
  })

  it('is within one snap of nflverse’s snap counts on a real game', () => {
    const index = new PlayIndex()
    aggregatePbp(captured('pbp_2025_game.csv'), index)
    const out = aggregateParticipation(captured('part_2025_game.csv'), index)
    expect(out).toMatchObject({ skipped: 0, unmatched: 0 })
    const byKey = new Map(out.playerWeeks.map((r) => [r.playerKey, r.data]))
    const off = OFFICIAL.map(([id, o, d]) => {
      const data = byKey.get(id) ?? {}
      return [
        id,
        Math.abs(Number(data.off_snaps ?? 0) - o),
        Math.abs(Number(data.def_snaps ?? 0) - d)
      ]
    })
    // PHI's offense (and DAL's defense) is one short: "Defensive Too Many Men on Field" at the snap
    // has no pass or run flag, so it is not a snap here (spec §12).
    expect(off.every(([, o, d]) => Number(o) <= 1 && Number(d) <= 1)).toBe(true)
    expect(off.filter(([, o, d]) => o === 0 && d === 0).length).toBeGreaterThanOrEqual(7)
  })
})
