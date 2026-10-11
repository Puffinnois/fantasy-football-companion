import { describe, expect, it } from 'vitest'
import type { WhGame } from '@main/db/repos/warehouse'
import { parseCombine } from '@main/sources/warehouse/combine'
import {
  firstKickoffs,
  isSnapshotDepthChart,
  parseDepthCharts,
  type Kickoff
} from '@main/sources/warehouse/depthCharts'
import { parseRosters } from '@main/sources/warehouse/rosters'

const WEEKLY = `season,club_code,week,game_type,depth_team,last_name,first_name,football_name,formation,gsis_id,jersey_number,position,elias_id,depth_position,full_name
2024,PHI,1,REG,1,Barkley,Saquon,Saquon,Offense,00-0034844,26,RB,BAR123,RB,Saquon Barkley
2024,PHI,1,REG,2,Barkley,Saquon,Saquon,Special Teams,00-0034844,26,RB,BAR123,KR,Saquon Barkley
2024,PHI,19,WC,1,Barkley,Saquon,Saquon,Offense,00-0034844,26,RB,BAR123,RB,Saquon Barkley
2024,PHI,1,REG,1,Nobody,No,No,Offense,,1,QB,X,QB,No Body
`

const SNAPSHOTS = `dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank
2025-09-01T07:00:00Z,PHI,Jalen Hurts,4040715,00-0036389,1,Base Offense,1,Quarterback,QB,1,1
2025-09-01T07:00:00Z,PHI,Saquon Barkley,3929630,00-0034844,1,Base Offense,2,Running Back,RB,1,1
2025-09-01T07:00:00Z,PHI,Saquon Barkley,3929630,00-0034844,3,Special Teams,9,Kick Returner,KR,1,2
2025-09-09T07:00:00Z,PHI,Jalen Hurts,4040715,00-0036389,1,Base Offense,1,Quarterback,QB,1,1
2025-09-09T07:00:00Z,PHI,Tanner McKee,,00-0039170,1,Base Offense,1,Quarterback,QB,1,2
2025-09-16T07:00:00Z,PHI,Jalen Hurts,4040715,00-0036389,1,Base Offense,1,Quarterback,QB,1,1
2025-09-16T07:00:00Z,PHI,No Id,,,1,Base Offense,1,Quarterback,QB,1,3
`

const KICKOFFS: Kickoff[] = [
  { week: 1, at: '2025-09-05T00:20:00.000Z' },
  { week: 2, at: '2025-09-12T00:15:00.000Z' },
  { week: 3, at: '2025-09-19T00:15:00.000Z' }
]

describe('firstKickoffs', () => {
  it('takes the earliest regular-season kickoff of each week, in UTC', () => {
    const games: WhGame[] = [
      {
        gameId: 'a',
        season: 2025,
        week: 1,
        data: { game_type: 'REG', gameday: '2025-09-07', gametime: '13:00' }
      },
      {
        gameId: 'b',
        season: 2025,
        week: 1,
        data: { game_type: 'REG', gameday: '2025-09-04', gametime: '20:20' }
      },
      {
        gameId: 'c',
        season: 2025,
        week: 19,
        data: { game_type: 'WC', gameday: '2026-01-10', gametime: '16:30' }
      },
      { gameId: 'd', season: 2025, week: 2, data: { game_type: 'REG', gameday: '2025-09-11' } }
    ]
    expect(firstKickoffs(games)).toEqual([{ week: 1, at: '2025-09-05T00:20:00.000Z' }])
  })
})

describe('parseDepthCharts', () => {
  it('groups the weekly format (through 2024) into one row per player-week with its slots', () => {
    expect(isSnapshotDepthChart(WEEKLY)).toBe(false)
    const { rows, skipped } = parseDepthCharts(WEEKLY, 2024, [], null)
    expect(skipped).toBe(1)
    expect(rows).toEqual([
      {
        source: 'depth_charts',
        season: 2024,
        seasonType: 'REG',
        week: 1,
        playerKey: '00-0034844',
        keyType: 'gsis',
        team: 'PHI',
        opponent: null,
        data: {
          full_name: 'Saquon Barkley',
          entries: [
            { formation: 'Offense', position: 'RB', rank: 1 },
            { formation: 'Special Teams', position: 'KR', rank: 2 }
          ]
        }
      },
      {
        source: 'depth_charts',
        season: 2024,
        seasonType: 'POST',
        week: 19,
        playerKey: '00-0034844',
        keyType: 'gsis',
        team: 'PHI',
        opponent: null,
        data: {
          full_name: 'Saquon Barkley',
          entries: [{ formation: 'Offense', position: 'RB', rank: 1 }]
        }
      }
    ])
  })

  it('maps each week to the last snapshot before its first kickoff (snapshot format, 2025+)', () => {
    expect(isSnapshotDepthChart(SNAPSHOTS)).toBe(true)
    const { rows, skipped } = parseDepthCharts(SNAPSHOTS, 2025, KICKOFFS, null)
    expect(skipped).toBe(1)
    // week 3 kicks off after the latest snapshot and is not the current week
    expect(rows.map((r) => [r.week, r.playerKey])).toEqual([
      [1, '00-0036389'],
      [1, '00-0034844'],
      [2, '00-0036389'],
      [2, '00-0039170']
    ])
    expect(rows.every((r) => r.seasonType === 'REG' && r.team === 'PHI')).toBe(true)
    expect(rows[1].data).toEqual({
      snapshot: '2025-09-01T07:00:00Z',
      player_name: 'Saquon Barkley',
      espn_id: '3929630',
      entries: [
        { formation: 'Base Offense', position: 'RB', rank: 1 },
        { formation: 'Special Teams', position: 'KR', rank: 2 }
      ]
    })
    expect(rows[3].data).not.toHaveProperty('espn_id')
  })

  it('gives the current week the latest snapshot even before its kickoff', () => {
    const { rows } = parseDepthCharts(SNAPSHOTS, 2025, KICKOFFS, 3)
    const week3 = rows.filter((r) => r.week === 3)
    expect(week3.map((r) => r.playerKey)).toEqual(['00-0036389'])
    expect(week3[0].data.snapshot).toBe('2025-09-16T07:00:00Z')
  })
})

describe('parseRosters', () => {
  it('keeps every roster week and the latest bio per player', () => {
    const csv = `season,team,full_name,birth_date,height,weight,college,gsis_id,sleeper_id,week,game_type,entry_year,draft_club,draft_number,status
2025,PHI,Saquon Barkley,1997-02-09,72,233,Penn State,00-0034844,4866,1,REG,2018,NYG,2,ACT
2025,PHI,Saquon Barkley,1997-02-09,72,235,Penn State,00-0034844,4866,2,REG,2018,NYG,2,INA
2025,PHI,Nobody,,,,,,,1,REG,,,,ACT
`
    const { weeks, bios } = parseRosters(csv, 2019)
    expect(weeks.skipped).toBe(1)
    // weekly rows keep only what changes week to week (spec §10)
    expect(weeks.rows.map((r) => [r.week, r.data])).toEqual([
      [1, { status: 'ACT' }],
      [2, { status: 'INA' }]
    ])
    expect(bios).toEqual([
      {
        source: 'rosters',
        playerKey: '00-0034844',
        keyType: 'gsis',
        data: {
          as_of: 202502,
          full_name: 'Saquon Barkley',
          birth_date: '1997-02-09',
          height: 72,
          weight: 235,
          college: 'Penn State',
          sleeper_id: '4866',
          entry_year: 2018,
          draft_club: 'NYG',
          draft_number: 2
        }
      }
    ])
  })
})

describe('parseCombine', () => {
  it('keys by PFR id, else CFB id, and counts rows with neither', () => {
    const csv = `season,draft_year,draft_team,draft_round,draft_ovr,pfr_id,cfb_id,player_name,pos,school,ht,wt,forty,bench,vertical,broad_jump,cone,shuttle
2018,2018,New York Giants,1,2,BarkSa00,saquon-barkley-1,Saquon Barkley,RB,Penn State,6-0,233,4.4,29,41,125,6.86,4.24
2024,,,,,,undrafted-guy-1,Undrafted Guy,WR,Somewhere,6-1,190,4.5,,,,,
2024,,,,,,,No Ids,WR,Nowhere,6-1,190,4.6,,,,,
`
    const { rows, skipped } = parseCombine(csv)
    expect(skipped).toBe(1)
    expect(rows.map((r) => [r.playerKey, r.keyType])).toEqual([
      ['BarkSa00', 'pfr'],
      ['undrafted-guy-1', 'cfb']
    ])
    expect(rows[0].data).toMatchObject({ forty: 4.4, ht: '6-0', wt: 233, draft_ovr: 2 })
  })
})
