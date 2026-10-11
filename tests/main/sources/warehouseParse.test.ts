import { describe, expect, it } from 'vitest'
import {
  cellValue,
  headerOf,
  parseGamesCsv,
  parsePlayerCsv,
  parseTeamCsv,
  seasonTypeOf,
  seasonTypeOfWeek,
  type PlayerCsvSpec
} from '@main/sources/warehouse/parse'

const SPEC: PlayerCsvSpec = {
  source: 'nflverse_player',
  ids: [{ column: 'player_id', keyType: 'gsis' }],
  season: 'season',
  week: 'week',
  seasonType: 'season_type',
  team: 'team',
  opponent: 'opponent_team'
}

const PLAYER_CSV = `season,week,season_type,player_id,team,opponent_team,passing_yards,headshot_url,game_id
2025,1,REG,00-0034844,LA,DAL,0,"https://x/img?f_auto,q_auto",2025_01_DAL_PHI
2025,19,POST,00-0034844,LA,GB,12,,2025_19_GB_PHI
2025,0,PRE,00-0034844,LA,GB,1,,x
2018,1,REG,00-0034844,PHI,DAL,0,,x
2025,2,REG,,PHI,KC,0,,x
2025,,REG,00-0034844,PHI,KC,0,,x
2025,3,REG,00-0034844,PHI,NA,NA,,x
`

describe('cellValue', () => {
  it('drops missing values, keeps *_id columns as text, turns numeric text into numbers', () => {
    expect(cellValue('x', '')).toBeNull()
    expect(cellValue('x', 'NA')).toBeNull()
    expect(cellValue('passing_yards', '12')).toBe(12)
    expect(cellValue('cpoe', '-1.5')).toBe(-1.5)
    expect(cellValue('sleeper_id', '4866')).toBe('4866')
    expect(cellValue('ht', '6-4')).toBe('6-4')
    expect(cellValue('roof', ' ')).toBe(' ')
  })
})

describe('season types', () => {
  it('maps nflverse and ESPN spellings; preseason and unknown are null', () => {
    const raw = [
      'REG',
      'Regular',
      'POST',
      'WC',
      'DIV',
      'CON',
      'SB',
      'SBBYE',
      'Playoffs',
      'PRE',
      undefined
    ]
    expect(raw.map((r) => seasonTypeOf(r))).toEqual([
      'REG',
      'REG',
      'POST',
      'POST',
      'POST',
      'POST',
      'POST',
      'POST',
      'POST',
      null,
      null
    ])
  })

  it('splits by the regular-season length: 17 weeks through 2020, 18 since', () => {
    expect(seasonTypeOfWeek(2020, 17)).toBe('REG')
    expect(seasonTypeOfWeek(2020, 18)).toBe('POST')
    expect(seasonTypeOfWeek(2021, 18)).toBe('REG')
    expect(seasonTypeOfWeek(2025, 19)).toBe('POST')
  })
})

describe('headerOf', () => {
  it('reads the first line, without a BOM or CR', () => {
    expect(headerOf('﻿a,"b"\r\n1,2')).toEqual(['a', 'b'])
    expect(headerOf('only,header')).toEqual(['only', 'header'])
  })
})

describe('parsePlayerCsv', () => {
  it('keeps every column, filters early seasons and preseason, counts rows missing a key', () => {
    const { rows, skipped } = parsePlayerCsv(PLAYER_CSV, SPEC, 2019)
    expect(skipped).toBe(2)
    expect(rows.map((r) => [r.seasonType, r.week])).toEqual([
      ['REG', 1],
      ['POST', 19],
      ['REG', 3]
    ])
    expect(rows[0]).toEqual({
      source: 'nflverse_player',
      season: 2025,
      seasonType: 'REG',
      week: 1,
      playerKey: '00-0034844',
      keyType: 'gsis',
      team: 'LA',
      opponent: 'DAL',
      data: {
        season: 2025,
        week: 1,
        season_type: 'REG',
        player_id: '00-0034844',
        team: 'LA',
        opponent_team: 'DAL',
        passing_yards: 0,
        headshot_url: 'https://x/img?f_auto,q_auto',
        game_id: '2025_01_DAL_PHI'
      }
    })
    expect(rows[2].opponent).toBeNull()
    expect(rows[2].data).not.toHaveProperty('passing_yards')
  })

  it('maps team codes, falls back across id columns, and derives week / season type when told to', () => {
    const csv = 'season,team_abb,opp_abb,pfr_id,cfb_id,week\n2025,WSH,LAR,,smith-1,19\n'
    const seasonLevel = parsePlayerCsv(
      csv,
      {
        source: 's',
        ids: [
          { column: 'pfr_id', keyType: 'pfr' },
          { column: 'cfb_id', keyType: 'cfb' }
        ],
        season: 'season',
        week: null,
        seasonType: null,
        team: 'team_abb',
        opponent: 'opp_abb',
        teamCodes: { LAR: 'LA', WSH: 'WAS' }
      },
      2019
    ).rows
    expect(seasonLevel[0]).toMatchObject({
      playerKey: 'smith-1',
      keyType: 'cfb',
      week: 0,
      seasonType: 'REG',
      team: 'WAS',
      opponent: 'LA'
    })
    const byWeek = parsePlayerCsv(
      csv,
      {
        source: 's',
        ids: [{ column: 'cfb_id', keyType: 'cfb' }],
        season: 'season',
        week: 'week',
        seasonType: null
      },
      2019
    ).rows
    expect(byWeek[0]).toMatchObject({ week: 19, seasonType: 'POST', team: null, opponent: null })
  })

  it('accepts a header-only file (published before any game)', () => {
    expect(parsePlayerCsv('season,week,season_type,player_id\n', SPEC, 2019)).toEqual({
      rows: [],
      skipped: 0
    })
  })

  it('fails, naming the column, when a key column is missing', () => {
    expect(() =>
      parsePlayerCsv('season,week,season_type,gsis\n2025,1,REG,x\n', SPEC, 2019)
    ).toThrow('nflverse_player: column "player_id" is missing')
  })
})

describe('parseTeamCsv', () => {
  it('keys rows by team and counts rows without one', () => {
    const csv = `season,week,team,season_type,opponent_team,passing_yards
2025,1,PHI,REG,DAL,220
2025,1,,REG,DAL,1
2017,1,PHI,REG,DAL,1
`
    const { rows, skipped } = parseTeamCsv(
      csv,
      {
        source: 'nflverse_team',
        team: 'team',
        season: 'season',
        week: 'week',
        seasonType: 'season_type',
        opponent: 'opponent_team'
      },
      2019
    )
    expect(skipped).toBe(1)
    expect(rows).toEqual([
      {
        source: 'nflverse_team',
        season: 2025,
        seasonType: 'REG',
        week: 1,
        team: 'PHI',
        opponent: 'DAL',
        data: {
          season: 2025,
          week: 1,
          team: 'PHI',
          season_type: 'REG',
          opponent_team: 'DAL',
          passing_yards: 220
        }
      }
    ])
  })
})

describe('parseGamesCsv', () => {
  it('keeps every schedule column from the first season on', () => {
    const csv = `game_id,season,game_type,week,gameday,gametime,away_team,home_team,spread_line,roof,temp,old_game_id
2025_01_DAL_PHI,2025,REG,1,2025-09-04,20:20,DAL,PHI,8.5,outdoors,NA,2025090400
2018_01_ATL_PHI,2018,REG,1,2018-09-06,20:20,ATL,PHI,1,outdoors,80,2018090600
,2025,REG,1,x,x,A,B,1,x,1,1
`
    const { rows, skipped } = parseGamesCsv(csv, 2019)
    expect(skipped).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ gameId: '2025_01_DAL_PHI', season: 2025, week: 1 })
    expect(rows[0].data).toMatchObject({
      spread_line: 8.5,
      roof: 'outdoors',
      gameday: '2025-09-04',
      gametime: '20:20',
      old_game_id: '2025090400'
    })
    expect(rows[0].data).not.toHaveProperty('temp')
  })
})
