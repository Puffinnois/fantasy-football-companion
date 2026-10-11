import { describe, expect, it } from 'vitest'
import { parseFfOpportunity } from '@main/sources/warehouse/ffOpportunity'

const CSV = `season,posteam,week,game_id,player_id,full_name,rec_attempt,total_fantasy_points_exp,rec_attempt_team,total_fantasy_points_exp_team
2025,LA,1,2025_01_HOU_LA,00-0036322,Puka Nacua,10,21.5,35,98.2
2025,LA,1,2025_01_HOU_LA,00-0039000,Rookie,0,1.5,35,98.2
2025,LA,19,2025_19_LA_PHI,00-0036322,Puka Nacua,8,15,30,80
2025,LA,2,2025_02_LA_TEN,NA,Unknown,1,1,30,70
`

describe('parseFfOpportunity', () => {
  it('keeps player columns on player-weeks and moves *_team columns to one team-week row (spec §10)', () => {
    const { playerWeeks, teamWeeks, skipped } = parseFfOpportunity(CSV, 2019)
    expect(skipped).toBe(1)
    expect(playerWeeks.map((r) => [r.playerKey, r.week, r.seasonType, r.team, r.data])).toEqual([
      [
        '00-0036322',
        1,
        'REG',
        'LA',
        {
          game_id: '2025_01_HOU_LA',
          full_name: 'Puka Nacua',
          rec_attempt: 10,
          total_fantasy_points_exp: 21.5
        }
      ],
      [
        '00-0039000',
        1,
        'REG',
        'LA',
        { game_id: '2025_01_HOU_LA', full_name: 'Rookie', total_fantasy_points_exp: 1.5 }
      ],
      [
        '00-0036322',
        19,
        'POST',
        'LA',
        {
          game_id: '2025_19_LA_PHI',
          full_name: 'Puka Nacua',
          rec_attempt: 8,
          total_fantasy_points_exp: 15
        }
      ]
    ])
    expect(teamWeeks).toEqual([
      {
        source: 'ff_opportunity',
        season: 2025,
        seasonType: 'REG',
        week: 1,
        team: 'LA',
        opponent: null,
        data: { rec_attempt_team: 35, total_fantasy_points_exp_team: 98.2 }
      },
      {
        source: 'ff_opportunity',
        season: 2025,
        seasonType: 'POST',
        week: 19,
        team: 'LA',
        opponent: null,
        data: { rec_attempt_team: 30, total_fantasy_points_exp_team: 80 }
      },
      {
        source: 'ff_opportunity',
        season: 2025,
        seasonType: 'REG',
        week: 2,
        team: 'LA',
        opponent: null,
        data: { rec_attempt_team: 30, total_fantasy_points_exp_team: 70 }
      }
    ])
  })
})
