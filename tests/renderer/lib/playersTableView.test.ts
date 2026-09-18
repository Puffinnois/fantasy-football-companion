import { describe, expect, it } from 'vitest'
import {
  cellText,
  cellValue,
  columnGroups,
  DEFAULT_SORT,
  filterRows,
  gameLabel,
  kickoffLabel,
  replacementLabel,
  sortRows,
  subLabel,
  valueHeaderTitle
} from '@/lib/playersTableView'
import type { PlayerValueRow, PlayerWeekRow, ValueContext } from '@shared/types'

const row = (over: Partial<PlayerWeekRow> = {}): PlayerWeekRow => ({
  playerId: '1',
  fullName: 'A',
  position: 'RB',
  team: 'PHI',
  byeWeek: 7,
  injuryStatus: null,
  rookie: false,
  watched: false,
  ownerRosterId: null,
  ownerName: null,
  game: null,
  points: 18.4,
  projected: 18.58,
  delta: -0.18,
  actual: { rush_yd: 60, sack: 2.5 },
  projection: { rush_yd: 84.5 },
  snapPct: 0.83,
  targetShare: null,
  statsAvailable: true,
  ...over
})

const valueRow = (over: Partial<PlayerValueRow> = {}): PlayerValueRow => ({
  playerId: 'v1',
  fullName: 'V',
  position: 'RB',
  team: 'PHI',
  byeWeek: 7,
  injuryStatus: null,
  rookie: false,
  watched: false,
  ownerRosterId: null,
  ownerName: null,
  gamesPlayed: 3,
  ppg: 18.4,
  stdValue: 6.28,
  stdRank: 2,
  rosPoints: 120.5,
  rosValue: -1.5,
  rosRank: 9,
  overallRank: 20,
  signals: null,
  statsAvailable: true,
  ...over
})

describe('columnGroups', () => {
  it('follows the tab and hides Δ / usage outside stats mode', () => {
    const all = columnGroups('ALL', 'stats')
    expect(all.map((g) => g.label)).toEqual(['Fantasy', 'Rushing', 'Receiving', 'Passing', 'Usage'])
    expect(all[0].columns.map((c) => c.key)).toEqual(['points', 'delta'])
    expect(columnGroups('FLEX', 'proj').map((g) => g.label)).toEqual([
      'Fantasy',
      'Rushing',
      'Receiving',
      'Passing'
    ])
    expect(columnGroups('QB', 'stats').map((g) => g.label)).toEqual([
      'Fantasy',
      'Passing',
      'Rushing',
      'Usage'
    ])
    expect(columnGroups('QB', 'stats')[1].columns.map((c) => c.label)).toEqual([
      'CMP',
      'ATT',
      'YD',
      'TD',
      'INT'
    ])
    expect(columnGroups('K', 'stats').map((g) => g.label)).toEqual(['Fantasy', 'Field goals', 'XP'])
    expect(columnGroups('DEF', 'proj').map((g) => g.label)).toEqual([
      'Fantasy',
      'Defense',
      'Allowed'
    ])
  })
})

describe('cells', () => {
  const pts = columnGroups('ALL', 'stats')[0].columns[0]
  const delta = columnGroups('ALL', 'stats')[0].columns[1]
  const rushYd = columnGroups('ALL', 'stats')[1].columns[1]
  const snap = columnGroups('ALL', 'stats')[4].columns[0]

  it('picks the value by kind and mode', () => {
    expect(cellValue(row(), pts, 'stats')).toBe(18.4)
    expect(cellValue(row(), pts, 'proj')).toBe(18.58)
    expect(cellValue(row(), rushYd, 'stats')).toBe(60)
    expect(cellValue(row({ actual: {} }), rushYd, 'stats')).toBeNull()
    expect(cellValue(row(), rushYd, 'proj')).toBe(84.5)
    expect(cellValue(row({ projection: null }), rushYd, 'proj')).toBeNull()
    expect(cellValue(row(), snap, 'stats')).toBe(0.83)
  })

  it('formats: dash, signed delta, one decimal for projections and fractions, percent for usage', () => {
    expect(cellText(null, pts, 'stats')).toBe('—')
    expect(cellText(18.4, pts, 'stats')).toBe('18.4')
    expect(cellText(-0.18, delta, 'stats')).toBe('-0.2')
    expect(cellText(6.2, delta, 'stats')).toBe('+6.2')
    expect(cellText(60, rushYd, 'stats')).toBe('60')
    expect(cellText(2.5, rushYd, 'stats')).toBe('2.5')
    expect(cellText(84.5, rushYd, 'proj')).toBe('84.5')
    expect(cellText(18, rushYd, 'proj')).toBe('18.0')
    expect(cellText(0.83, snap, 'stats')).toBe('83%')
  })
})

describe('labels', () => {
  const NY = 'America/New_York'
  it('kickoffLabel renders weekday + time in the given zone', () => {
    expect(kickoffLabel('2026-09-11T00:15:00.000Z', NY)).toBe('Thu 8:15 PM')
    expect(kickoffLabel('2026-09-20T17:00:00.000Z', NY)).toBe('Sun 1:00 PM')
  })
  it('gameLabel: upcoming, final, bye', () => {
    const upcoming = {
      opponent: 'GB',
      home: true,
      kickoff: '2026-09-20T17:00:00.000Z',
      homeScore: null,
      awayScore: null,
      final: false
    }
    expect(gameLabel(upcoming, NY)).toBe('Sun 1:00 PM vs GB')
    expect(gameLabel({ ...upcoming, home: false, kickoff: null }, NY)).toBe('@ GB')
    expect(
      gameLabel({
        opponent: 'DAL',
        home: true,
        kickoff: null,
        homeScore: 24,
        awayScore: 20,
        final: true
      })
    ).toBe('vs DAL · W 24-20')
    expect(
      gameLabel({
        opponent: 'DAL',
        home: false,
        kickoff: null,
        homeScore: 24,
        awayScore: 20,
        final: true
      })
    ).toBe('@ DAL · L 20-24')
    expect(gameLabel(null)).toBe('BYE')
  })
  it('subLabel: team with bye + game; FA without a team', () => {
    expect(subLabel(row({ game: null }))).toBe('PHI (bye 7) · BYE')
    expect(subLabel(row({ byeWeek: null, game: null }))).toBe('PHI · BYE')
    expect(subLabel(row({ team: null }))).toBe('FA')
  })
})

describe('filterRows / sortRows', () => {
  const rows = [
    row({
      playerId: 'a',
      fullName: 'Saquon Barkley',
      position: 'RB',
      points: 18.4,
      projected: 18.58,
      ownerRosterId: 1,
      ownerName: 'Cook Book'
    }),
    row({
      playerId: 'b',
      fullName: 'Justin Jefferson',
      position: 'WR',
      points: 10.8,
      projected: 18.91,
      actual: { rec_yd: 68 }
    }),
    row({
      playerId: 'c',
      fullName: "Ja'Marr Chase",
      position: 'WR',
      points: null,
      projected: null,
      rookie: true,
      watched: true,
      ownerRosterId: 2,
      ownerName: 'Rival'
    }),
    row({
      playerId: 'd',
      fullName: 'Los Angeles Rams',
      position: 'DEF',
      points: 12,
      projected: 7.2
    }),
    row({
      playerId: 'e',
      fullName: 'Bijan Robinson',
      position: 'RB',
      points: null,
      projected: 22.4,
      team: null
    })
  ]
  const tabs = {
    ALL: { id: 'ALL', label: 'All', positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] },
    WR: { id: 'WR', label: 'WR', positions: ['WR'] },
    FLEX: { id: 'FLEX', label: 'FLEX', positions: ['RB', 'WR', 'TE'] }
  }
  const none = { search: '', freeAgents: false, watchlist: false, rookies: false, owner: null }
  const ids = (list: PlayerWeekRow[]): string[] => list.map((r) => r.playerId)

  it('filters by tab positions, chips, owner and name', () => {
    expect(ids(filterRows(rows, tabs.ALL, none))).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids(filterRows(rows, tabs.WR, none))).toEqual(['b', 'c'])
    expect(ids(filterRows(rows, tabs.FLEX, none))).toEqual(['a', 'b', 'c', 'e'])
    expect(ids(filterRows(rows, tabs.ALL, { ...none, freeAgents: true }))).toEqual(['b', 'd', 'e'])
    expect(ids(filterRows(rows, tabs.ALL, { ...none, watchlist: true }))).toEqual(['c'])
    expect(ids(filterRows(rows, tabs.ALL, { ...none, rookies: true }))).toEqual(['c'])
    expect(ids(filterRows(rows, tabs.ALL, { ...none, owner: 2 }))).toEqual(['c'])
    expect(ids(filterRows(rows, tabs.ALL, { ...none, search: 'jEff' }))).toEqual(['b'])
    expect(ids(filterRows(rows, tabs.ALL, { ...none, search: 'jamarr' }))).toEqual(['c']) // punctuation-insensitive
  })

  it('sorts by points per mode with nulls last, by stat, by name; direction flips', () => {
    expect(ids(sortRows(rows, { key: 'points', dir: 'desc' }, 'stats'))).toEqual([
      'a',
      'd',
      'b',
      'e',
      'c'
    ])
    expect(ids(sortRows(rows, { key: 'points', dir: 'asc' }, 'stats'))).toEqual([
      'b',
      'd',
      'a',
      'e',
      'c'
    ])
    expect(ids(sortRows(rows, { key: 'points', dir: 'desc' }, 'proj'))).toEqual([
      'e',
      'b',
      'a',
      'd',
      'c'
    ])
    expect(ids(sortRows(rows, { key: 'stat:rec_yd', dir: 'desc' }, 'stats')).slice(0, 1)).toEqual([
      'b'
    ])
    expect(ids(sortRows(rows, { key: 'name', dir: 'asc' }, 'stats'))).toEqual([
      'e',
      'c',
      'b',
      'd',
      'a'
    ])
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'b', 'c', 'd', 'e']) // input untouched
  })
})

describe('value mode', () => {
  it('has the same two groups on every tab', () => {
    for (const tab of ['ALL', 'QB', 'K', 'FLEX']) {
      const groups = columnGroups(tab, 'value')
      expect(groups.map((g) => g.label)).toEqual(['Season', 'Rest of season'])
      expect(groups.flatMap((g) => g.columns.map((c) => c.key))).toEqual([
        'value:gamesPlayed',
        'value:ppg',
        'value:stdValue',
        'value:stdRank',
        'value:rosPoints',
        'value:rosValue',
        'value:rosRank'
      ])
    }
  })

  it('reads and formats value cells; week columns are null on value rows and vice versa', () => {
    const [season, ros] = columnGroups('ALL', 'value')
    const r = valueRow()
    expect(season.columns.map((c) => cellText(cellValue(r, c, 'value'), c, 'value'))).toEqual([
      '3',
      '18.4',
      '+6.3',
      '2'
    ])
    expect(ros.columns.map((c) => cellText(cellValue(r, c, 'value'), c, 'value'))).toEqual([
      '120.5',
      '-1.5',
      '9'
    ])
    const ppg = season.columns[1]
    expect(cellText(cellValue(valueRow({ ppg: null }), ppg, 'value'), ppg, 'value')).toBe('—')
    expect(cellValue(r, columnGroups('ALL', 'stats')[0].columns[0], 'stats')).toBeNull()
    expect(cellValue(row(), ppg, 'value')).toBeNull()
  })

  it('filters and sorts value rows with nulls last', () => {
    const rows = [
      valueRow({ playerId: 'a', fullName: 'A', rosValue: 2 }),
      valueRow({ playerId: 'b', fullName: 'B', rosValue: null }),
      valueRow({ playerId: 'c', fullName: 'C', rosValue: 5, ownerRosterId: 1 })
    ]
    const filters = { search: '', freeAgents: true, watchlist: false, rookies: false, owner: null }
    expect(filterRows(rows, undefined, filters).map((r) => r.playerId)).toEqual(['a', 'b'])
    expect(sortRows(rows, DEFAULT_SORT.value, 'value').map((r) => r.playerId)).toEqual([
      'c',
      'a',
      'b'
    ])
    expect(
      sortRows(rows, { key: 'value:rosValue', dir: 'asc' }, 'value').map((r) => r.playerId)
    ).toEqual(['a', 'c', 'b'])
    expect(DEFAULT_SORT.stats).toEqual({ key: 'points', dir: 'desc' })
  })

  it('labels a value row without a game', () => {
    expect(subLabel(valueRow())).toBe('PHI (bye 7)')
    expect(subLabel(valueRow({ team: null }))).toBe('FA')
  })

  it('describes replacement levels for the tab positions', () => {
    const context: ValueContext = {
      season: 2026,
      currentWeek: 3,
      projectionsStored: true,
      teamCount: 16,
      replacement: {
        RB: { std: { level: 8.36, starters: 44 }, ros: { level: 91.2, starters: 43 } },
        WR: { std: null, ros: { level: 80, starters: 45 } }
      }
    }
    expect(replacementLabel(context, ['RB', 'WR'], 'std')).toBe(
      'Replacement PPG · RB 8.4 (44 starters) · WR —'
    )
    expect(replacementLabel(context, ['RB'], 'ros')).toBe(
      'Replacement ROS pts · RB 91.2 (43 starters)'
    )
    expect(replacementLabel(null, ['RB'], 'ros')).toBe('')
  })

  it('titles value headers with a definition, VAL columns with the replacement line too', () => {
    const context: ValueContext = {
      season: 2026,
      currentWeek: 3,
      projectionsStored: true,
      teamCount: 16,
      replacement: { RB: { std: { level: 8, starters: 44 }, ros: null } }
    }
    const [season, ros] = columnGroups('ALL', 'value')
    expect(valueHeaderTitle(season.columns[1], context, ['RB'])).toBe(
      'League points per game over games played'
    )
    expect(valueHeaderTitle(season.columns[2], context, ['RB'])).toBe(
      "PPG minus the position's replacement PPG\nReplacement PPG · RB 8.0 (44 starters)"
    )
    expect(valueHeaderTitle(ros.columns[1], null, ['RB'])).toBe(
      "ROS minus the position's replacement ROS points"
    )
    expect(
      valueHeaderTitle(columnGroups('ALL', 'stats')[0].columns[0], context, ['RB'])
    ).toBeUndefined()
  })
})
