import { describe, expect, it } from 'vitest'
import { parseSleeperStats } from '@main/sources/warehouse/sleeperStats'

describe('parseSleeperStats', () => {
  it('splits players, team defenses and team offenses; keeps numbers only; maps team codes', () => {
    const rows: unknown[] = [
      {
        player_id: '4866',
        team: 'PHI',
        opponent: 'LAR',
        stats: { rush_yd: 60, rec_rz_tgt: 1, pts_ppr: 20.4 },
        player: { position: 'RB' }
      },
      {
        player_id: 'LAR',
        team: 'LAR',
        opponent: 'PHI',
        stats: { def_3_and_out: 2, fan_pts_allow_rb: 18 }
      },
      { player_id: 'TEAM_LAR', team: 'LAR', opponent: 'PHI', stats: { down_3_att: 12, note: 'x' } },
      { player_id: '9999', team: null, opponent: null, stats: null },
      { team: 'PHI', stats: {} },
      'garbage'
    ]
    const out = parseSleeperStats(rows, 2025, 5, 'REG')
    expect(out.skipped).toBe(2)
    expect(out.players).toEqual([
      {
        source: 'sleeper',
        season: 2025,
        seasonType: 'REG',
        week: 5,
        playerKey: '4866',
        keyType: 'sleeper',
        team: 'PHI',
        opponent: 'LA',
        data: { rush_yd: 60, rec_rz_tgt: 1, pts_ppr: 20.4 }
      },
      {
        source: 'sleeper',
        season: 2025,
        seasonType: 'REG',
        week: 5,
        playerKey: '9999',
        keyType: 'sleeper',
        team: null,
        opponent: null,
        data: {}
      }
    ])
    expect(out.defs).toEqual([
      {
        source: 'sleeper_def',
        season: 2025,
        seasonType: 'REG',
        week: 5,
        team: 'LA',
        opponent: 'PHI',
        data: { def_3_and_out: 2, fan_pts_allow_rb: 18 }
      }
    ])
    expect(out.teams).toEqual([
      {
        source: 'sleeper_team',
        season: 2025,
        seasonType: 'REG',
        week: 5,
        team: 'LA',
        opponent: 'PHI',
        data: { down_3_att: 12 }
      }
    ])
  })
})
