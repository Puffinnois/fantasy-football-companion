import { describe, expect, it } from 'vitest'
import { headerOf } from '@main/sources/warehouse/parse'
import { PBP_COLUMNS, playReader } from '@main/warehouse/play'
import { captured } from '../../fixtures/warehouse'
import { pbpCsv, play, QB } from '../../fixtures/pbp'

describe('playReader', () => {
  it('reads only columns the real file has', () => {
    const header = new Set(headerOf(captured('pbp_2025_game.csv')))
    expect(PBP_COLUMNS.filter((c) => !header.has(c))).toEqual([])
  })

  it('reads numbers, flags, ids and the drive clock', () => {
    const p = play({
      play_type: 'run',
      qb_scramble: 1,
      passer_id: QB,
      passer_player_id: '',
      yardline_100: 15,
      epa: -0.25,
      drive_time_of_possession: '3:33',
      solo_tackle_1_player_id: 'a',
      assist_tackle_2_player_id: 'b'
    })
    expect(p).toMatchObject({
      season: 2025,
      seasonType: 'REG',
      week: 1,
      posteam: 'PHI',
      playType: 'run',
      noPlay: false,
      scramble: true,
      passerId: QB,
      passPlayerId: null,
      yardline: 15,
      epa: -0.25,
      cpoe: null,
      driveSeconds: 213,
      tacklerIds: ['a', 'b']
    })
  })

  it('marks penalty-wiped snaps, two-point tries and onside kicks', () => {
    expect(play({ play_type: 'no_play' }).noPlay).toBe(true)
    expect(play({ two_point_attempt: 1, two_point_conv_result: 'success' })).toMatchObject({
      twoPoint: true,
      twoPointSuccess: true
    })
    const kick = { play_type: 'kickoff', kickoff_attempt: 1 }
    expect(play({ ...kick, desc: 'B.Aubrey kicks onside 12 yards' }).onside).toBe(true)
    expect(play({ ...kick, desc: 'B.Aubrey kicks 65 yards' }).onside).toBe(false)
    expect(play({ desc: 'onside formation' }).onside).toBe(false)
  })

  it('leaves out deleted and preseason plays and skips rows without a key', () => {
    const header = headerOf(pbpCsv([]))
    const read = playReader(header)
    const fields = (row: Record<string, string>): string[] => header.map((c) => row[c] ?? '')
    const base = { game_id: 'g', season: '2025', week: '1', season_type: 'REG' }
    expect(read(fields({ ...base, play_deleted: '1' }))).toBeNull()
    expect(read(fields({ ...base, season_type: 'PRE' }))).toBeNull()
    expect(read(fields({ ...base, week: '' }))).toBe('skip')
    expect(read(fields({ ...base, game_id: '' }))).toBe('skip')
    expect(read(fields(base))).toMatchObject({ gameId: 'g', week: 1 })
  })
})
