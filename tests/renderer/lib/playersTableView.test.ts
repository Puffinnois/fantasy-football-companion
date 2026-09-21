import { describe, expect, it } from 'vitest'
import {
  cellText,
  cellValue,
  columnGroups,
  DEFAULT_SORT,
  ECR_DELTA_TONE,
  expertText,
  expertTone,
  expertValue,
  filterRows,
  gameLabel,
  GRADE_ORDER,
  kickoffLabel,
  mineCellTitle,
  mineLabel,
  replacementLabel,
  signalText,
  signalTone,
  sortRows,
  sosTone,
  subLabel,
  valueHeaderTitle,
  type Column,
  type ExpertField,
  type SignalField
} from '@/lib/playersTableView'
import type { PlayerValueRow, PlayerWeekRow, ValueContext } from '@shared/types'
import { signalsFixture } from '../../fixtures/signals'

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
  ownerIsMe: false,
  game: null,
  points: 18.4,
  projected: 18.58,
  delta: -0.18,
  actual: { rush_yd: 60, sack: 2.5 },
  projection: { rush_yd: 84.5 },
  snapPct: 0.83,
  targetShare: null,
  expert: null,
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
  ownerIsMe: false,
  gamesPlayed: 3,
  ppg: 18.4,
  stdValue: 6.28,
  stdRank: 2,
  rosPoints: 120.5,
  rosValue: -1.5,
  rosRank: 9,
  overallRank: 20,
  signals: signalsFixture(),
  vsMine: null,
  droppable: null,
  expert: null,
  market: null,
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
      'Experts',
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
      'Experts',
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

  it('formats: dash, two-decimal points and delta, one decimal for projections and fractions, percent for usage', () => {
    expect(cellText(null, pts, 'stats')).toBe('—')
    expect(cellText(18.4, pts, 'stats')).toBe('18.40')
    expect(cellText(-0.18, delta, 'stats')).toBe('-0.18')
    expect(cellText(6.2, delta, 'stats')).toBe('+6.20')
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
  const none = {
    search: '',
    freeAgents: false,
    watchlist: false,
    rookies: false,
    mine: false,
    owner: null
  }
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
  it('has the same four groups on every tab', () => {
    for (const tab of ['ALL', 'QB', 'K', 'FLEX']) {
      const groups = columnGroups(tab, 'value')
      expect(groups.map((g) => g.label)).toEqual(['Season', 'Rest of season', 'Signals', 'Experts'])
      expect(groups.flatMap((g) => g.columns.map((c) => c.key))).toEqual([
        'value:gamesPlayed',
        'value:ppg',
        'value:stdValue',
        'value:stdRank',
        'value:rosPoints',
        'value:rosValue',
        'value:rosRank',
        'signal:rosSos',
        'signal:byesRemaining',
        'signal:floor',
        'signal:ceiling',
        'signal:startRate',
        'signal:usage',
        'signal:tdDelta',
        'signal:vsProjPct',
        'expert:ecrPosRank',
        'expert:ecrDelta',
        'expert:spread',
        'expert:marketValue',
        'expert:marketTrend'
      ])
    }
  })

  const signalColumns = columnGroups('ALL', 'value')
    .flatMap((g) => g.columns)
    .filter((c) => c.kind === 'signal')
  const signalCol = (field: SignalField): Column => {
    const col = signalColumns.find((c) => c.signal === field)
    if (!col) throw new Error(`no column for ${field}`)
    return col
  }

  it('reads signal cells: USAGE follows the position, TD is a badge, nulls render —', () => {
    const rb = valueRow({ position: 'RB' })
    expect(signalColumns.map((c) => signalText(rb, c))).toEqual([
      '18.5',
      '1',
      '6.10',
      '17.40',
      '63%',
      '80% ↑',
      '↓',
      '+9%'
    ])
    expect(signalText(valueRow({ position: 'WR' }), signalCol('usage'))).toBe('24% →')
    expect(signalText(valueRow({ position: 'TE' }), signalCol('usage'))).toBe('24% →')
    expect(signalText(valueRow({ position: 'QB' }), signalCol('usage'))).toBe('—')
    expect(
      signalText(valueRow({ signals: signalsFixture({ tdFlag: null }) }), signalCol('tdDelta'))
    ).toBe('')
    expect(signalText(valueRow({ signals: null }), signalCol('tdDelta'))).toBe('—')
    expect(signalText(valueRow({ signals: null }), signalCol('floor'))).toBe('—')
    expect(signalText(row(), signalCol('floor'))).toBe('—')
    expect(cellValue(rb, signalCol('usage'), 'value')).toBe(0.8)
    expect(cellValue(valueRow({ position: 'QB' }), signalCol('usage'), 'value')).toBeNull()
    expect(cellValue(rb, signalCol('byesRemaining'), 'value')).toBe(1)
    expect(cellValue(row(), signalCol('floor'), 'value')).toBeNull()
  })

  it('sorts by a signal with nulls last', () => {
    const rows = [
      valueRow({ playerId: 'a', fullName: 'A', signals: signalsFixture({ rosSos: 8 }) }),
      valueRow({ playerId: 'b', fullName: 'B', signals: null }),
      valueRow({ playerId: 'c', fullName: 'C', signals: signalsFixture({ rosSos: 25 }) })
    ]
    const ids = (sorted: typeof rows): string[] => sorted.map((r) => r.playerId)
    expect(ids(sortRows(rows, { key: 'signal:rosSos', dir: 'asc' }, 'value'))).toEqual([
      'a',
      'c',
      'b'
    ])
    expect(ids(sortRows(rows, { key: 'signal:rosSos', dir: 'desc' }, 'value'))).toEqual([
      'c',
      'a',
      'b'
    ])
  })

  it('tones SOS by difficulty, TD by regression direction, vs proj by sign', () => {
    expect(sosTone(11)).toBe('hard')
    expect(sosTone(11.5)).toBeNull()
    expect(sosTone(22)).toBe('easy')
    expect(sosTone(null)).toBeNull()
    const sos = signalCol('rosSos')
    expect(signalTone(valueRow({ signals: signalsFixture({ rosSos: 8 }) }), sos)).toBe('neg')
    expect(signalTone(valueRow({ signals: signalsFixture({ rosSos: 25 }) }), sos)).toBe('pos')
    expect(signalTone(valueRow(), sos)).toBeNull()
    expect(signalTone(valueRow(), signalCol('tdDelta'))).toBe('neg')
    expect(
      signalTone(valueRow({ signals: signalsFixture({ tdFlag: 'up' }) }), signalCol('tdDelta'))
    ).toBe('pos')
    expect(signalTone(valueRow(), signalCol('vsProjPct'))).toBe('pos')
    expect(
      signalTone(valueRow({ signals: signalsFixture({ vsProjPct: -0.2 }) }), signalCol('vsProjPct'))
    ).toBe('neg')
    expect(signalTone(valueRow(), signalCol('floor'))).toBeNull()
    expect(signalTone(row(), sos)).toBeNull()
  })

  it('titles signal headers with their description', () => {
    const floor = signalCol('floor')
    expect(valueHeaderTitle(floor, null, [])).toBe(floor.description)
  })

  it('reads and formats value cells; week columns are null on value rows and vice versa', () => {
    const [season, ros] = columnGroups('ALL', 'value')
    const r = valueRow()
    expect(season.columns.map((c) => cellText(cellValue(r, c, 'value'), c, 'value'))).toEqual([
      '3',
      '18.40',
      '+6.28',
      '2'
    ])
    expect(ros.columns.map((c) => cellText(cellValue(r, c, 'value'), c, 'value'))).toEqual([
      '120.50',
      '-1.50',
      '9',
      '18.5',
      '1'
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
    const filters = {
      search: '',
      freeAgents: true,
      watchlist: false,
      rookies: false,
      mine: false,
      owner: null
    }
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
      lastWeek: 18,
      projectionsStored: true,
      teamCount: 16,
      hasMyTeam: false,
      mine: {},
      replacement: {
        RB: { std: { level: 8.36, starters: 44 }, ros: { level: 91.2, starters: 43 } },
        WR: { std: null, ros: { level: 80, starters: 45 } }
      },
      expert: { scoring: 'PPR', ecrUpdatedAt: null, marketUpdatedAt: null }
    }
    expect(replacementLabel(context, ['RB', 'WR'], 'std')).toBe(
      'Replacement PPG · RB 8.36 (44 starters) · WR —'
    )
    expect(replacementLabel(context, ['RB'], 'ros')).toBe(
      'Replacement ROS pts · RB 91.20 (43 starters)'
    )
    expect(replacementLabel(null, ['RB'], 'ros')).toBe('')
  })

  it('titles value headers with a definition, VAL columns with the replacement line too', () => {
    const context: ValueContext = {
      season: 2026,
      currentWeek: 3,
      lastWeek: 18,
      projectionsStored: true,
      teamCount: 16,
      hasMyTeam: false,
      mine: {},
      replacement: { RB: { std: { level: 8, starters: 44 }, ros: null } },
      expert: { scoring: 'PPR', ecrUpdatedAt: null, marketUpdatedAt: null }
    }
    const [season, ros] = columnGroups('ALL', 'value')
    expect(valueHeaderTitle(season.columns[1], context, ['RB'])).toBe(
      'League points per game over games played'
    )
    expect(valueHeaderTitle(season.columns[2], context, ['RB'])).toBe(
      "PPG minus the position's replacement PPG\nReplacement PPG · RB 8.00 (44 starters)"
    )
    expect(valueHeaderTitle(ros.columns[1], null, ['RB'])).toBe(
      "ROS minus the position's replacement ROS points"
    )
    expect(
      valueHeaderTitle(columnGroups('ALL', 'stats')[0].columns[0], context, ['RB'])
    ).toBeUndefined()
  })
})

describe('mine group', () => {
  const [, , , , mineGroup] = columnGroups('ALL', 'value', true)
  const [vsMine, droppable] = mineGroup.columns
  const context: ValueContext = {
    season: 2026,
    currentWeek: 3,
    lastWeek: 18,
    projectionsStored: true,
    teamCount: 16,
    hasMyTeam: true,
    mine: { RB: { playerId: 'm', fullName: 'Saquon Barkley', rosValue: 8 }, K: null },
    replacement: {},
    expert: { scoring: 'PPR', ecrUpdatedAt: null, marketUpdatedAt: null }
  }
  const filters = {
    search: '',
    freeAgents: false,
    watchlist: false,
    rookies: false,
    mine: true,
    owner: null
  }

  it('is the fifth value-mode group, only when a team is mine', () => {
    expect(columnGroups('ALL', 'value').map((g) => g.label)).toEqual([
      'Season',
      'Rest of season',
      'Signals',
      'Experts'
    ])
    expect(columnGroups('K', 'value', true).map((g) => g.label)).toEqual([
      'Season',
      'Rest of season',
      'Signals',
      'Experts',
      'Mine'
    ])
    expect(mineGroup.columns.map((c) => [c.key, c.label, c.kind])).toEqual([
      ['value:vsMine', 'VS MINE', 'value'],
      ['droppable', 'DROP?', 'droppable']
    ])
    expect(columnGroups('ALL', 'stats', true).map((g) => g.label)).not.toContain('Mine')
  })

  it('renders vs mine as a signed number and droppable as a marker that sorts by its delta', () => {
    const fa = valueRow({ vsMine: 1.25 })
    expect(cellText(cellValue(fa, vsMine, 'value'), vsMine, 'value')).toBe('+1.25')
    expect(cellValue(fa, droppable, 'value')).toBeNull()
    expect(cellText(null, droppable, 'value')).toBe('')
    const mine = valueRow({
      ownerRosterId: 1,
      ownerIsMe: true,
      droppable: { playerId: 'f', fullName: 'Free Agent', delta: 2.5 }
    })
    expect(cellValue(mine, droppable, 'value')).toBe(2.5)
    expect(cellText(2.5, droppable, 'value')).toBe('●')
    expect(cellText(cellValue(mine, vsMine, 'value'), vsMine, 'value')).toBe('—')
    expect(cellValue(row(), droppable, 'value')).toBeNull()
  })

  it('sorts by vs mine and by the droppable delta with nulls last', () => {
    const rows = [
      valueRow({ playerId: 'a', fullName: 'A', vsMine: 1 }),
      valueRow({
        playerId: 'b',
        fullName: 'B',
        droppable: { playerId: 'x', fullName: 'X', delta: 3 }
      }),
      valueRow({ playerId: 'c', fullName: 'C', vsMine: 4 })
    ]
    const ids = (sort: { key: string; dir: 'asc' | 'desc' }): string[] =>
      sortRows(rows, sort, 'value').map((r) => r.playerId)
    expect(ids({ key: 'value:vsMine', dir: 'desc' })).toEqual(['c', 'a', 'b'])
    expect(ids({ key: 'value:vsMine', dir: 'asc' })).toEqual(['a', 'c', 'b'])
    expect(ids({ key: 'droppable', dir: 'desc' })).toEqual(['b', 'a', 'c'])
  })

  it('filters to my roster with the My team chip, in week rows too', () => {
    const rows = [
      valueRow({ playerId: 'a', ownerRosterId: 1, ownerIsMe: true }),
      valueRow({ playerId: 'b', ownerRosterId: 2 }),
      valueRow({ playerId: 'c' })
    ]
    expect(filterRows(rows, undefined, filters).map((r) => r.playerId)).toEqual(['a'])
    expect(filterRows(rows, undefined, { ...filters, mine: false }).length).toBe(3)
    const week = [row({ playerId: 'w', ownerRosterId: 1, ownerIsMe: true }), row({ playerId: 'x' })]
    expect(filterRows(week, undefined, filters).map((r) => r.playerId)).toEqual(['w'])
  })

  it('titles the VS MINE header with my baselines and the droppable header with its definition', () => {
    expect(mineLabel(context, ['RB', 'K'])).toBe(
      'My lowest ROS VAL · RB Saquon Barkley +8.00 · K —'
    )
    expect(mineLabel({ ...context, hasMyTeam: false }, ['RB'])).toBe('')
    expect(mineLabel(null, ['RB'])).toBe('')
    expect(valueHeaderTitle(vsMine, context, ['RB'])).toBe(
      `${vsMine.description}\nMy lowest ROS VAL · RB Saquon Barkley +8.00`
    )
    expect(valueHeaderTitle(vsMine, null, ['RB'])).toBe(vsMine.description)
    expect(valueHeaderTitle(droppable, context, ['RB'])).toBe(droppable.description)
  })

  it('titles a droppable cell with the free agent, an empty vs-mine cell with the missing position', () => {
    const mine = valueRow({
      ownerRosterId: 1,
      ownerIsMe: true,
      droppable: { playerId: 'f', fullName: 'Free Agent', delta: 2.5 }
    })
    expect(mineCellTitle(mine, droppable, context)).toBe('Free agent Free Agent: +2.50 ROS VAL')
    expect(mineCellTitle(valueRow(), droppable, context)).toBeUndefined()
    expect(mineCellTitle(valueRow({ position: 'K' }), vsMine, context)).toBe('no K rostered')
    expect(mineCellTitle(valueRow({ position: 'RB' }), vsMine, context)).toBeUndefined() // baseline exists: a ROS value is missing instead
    expect(
      mineCellTitle(valueRow({ position: 'K', ownerRosterId: 2 }), vsMine, context)
    ).toBeUndefined()
    expect(mineCellTitle(valueRow({ position: 'K', vsMine: 1 }), vsMine, context)).toBeUndefined()
    expect(
      mineCellTitle(valueRow({ position: 'K' }), vsMine, { ...context, projectionsStored: false })
    ).toBeUndefined()
    expect(mineCellTitle(valueRow({ position: 'K' }), vsMine, null)).toBeUndefined()
    expect(mineCellTitle(row(), vsMine, context)).toBeUndefined()
  })
})

describe('experts', () => {
  const valueCols = columnGroups('ALL', 'value')
    .flatMap((g) => g.columns)
    .filter((c) => c.kind === 'expert')
  const weekCols = columnGroups('RB', 'proj')
    .flatMap((g) => g.columns)
    .filter((c) => c.kind === 'expert')
  const col = (cols: Column[], field: ExpertField): Column => {
    const c = cols.find((c) => c.expert === field)
    if (!c) throw new Error(`no column for ${field}`)
    return c
  }
  const withExperts = valueRow({
    expert: { ecrRank: 12, ecrPosRank: 4, spread: 2.5, experts: 6, ecrDelta: 5 },
    market: { value: 9340, posRank: 1, tier: 1, trend30d: -310 }
  })

  it('projection mode has ECR and GRADE after Fantasy; stats mode has no Experts group', () => {
    expect(columnGroups('QB', 'proj').map((g) => g.label)).toEqual([
      'Fantasy',
      'Experts',
      'Passing',
      'Rushing'
    ])
    expect(weekCols.map((c) => [c.key, c.label])).toEqual([
      ['expert:weekPosRank', 'ECR'],
      ['expert:weekGrade', 'GRADE']
    ])
    expect(columnGroups('QB', 'stats').map((g) => g.label)).not.toContain('Experts')
    expect(valueCols.map((c) => c.label)).toEqual(['ECR', 'Δ ECR', 'SPREAD', 'MKT', 'TREND'])
    expect(valueCols.every((c) => c.description)).toBe(true)
  })

  it('reads value-row cells through cellValue and formats them; nulls render —', () => {
    expect(valueCols.map((c) => cellValue(withExperts, c, 'value'))).toEqual([
      4, 5, 2.5, 9340, -310
    ])
    expect(valueCols.map((c) => expertText(withExperts, c))).toEqual([
      '4',
      '+5',
      '2.5',
      '9340',
      '-310'
    ])
    expect(valueCols.map((c) => expertText(valueRow(), c))).toEqual(['—', '—', '—', '—', '—'])
    expect(cellValue(row(), col(valueCols, 'ecrPosRank'), 'proj')).toBeNull()
  })

  it('reads week-row cells: ECR as a number, GRADE as a letter sorting by GRADE_ORDER', () => {
    const graded = row({ expert: { ecrPosRank: 7, grade: 'B+', projPts: 14.2, spread: 1.1 } })
    expect(expertValue(graded, 'weekPosRank')).toBe(7)
    expect(expertValue(graded, 'weekGrade')).toBe(GRADE_ORDER.indexOf('B+'))
    expect(expertText(graded, col(weekCols, 'weekGrade'))).toBe('B+')
    expect(expertText(graded, col(weekCols, 'weekPosRank'))).toBe('7')
    expect(expertText(row(), col(weekCols, 'weekGrade'))).toBe('—')
    expect(
      expertValue(
        row({ expert: { ecrPosRank: 7, grade: 'Z', projPts: null, spread: null } }),
        'weekGrade'
      )
    ).toBeNull()
    expect(expertValue(withExperts, 'weekGrade')).toBeNull()
    expect(GRADE_ORDER[0]).toBe('F')
    expect(GRADE_ORDER.at(-1)).toBe('A+')
  })

  it('tones Δ ECR: green above +3, amber below −3, none in between; TREND by sign; the rest none', () => {
    const delta = col(valueCols, 'ecrDelta')
    const tone = (ecrDelta: number | null): ReturnType<typeof expertTone> =>
      expertTone(
        valueRow({ expert: { ecrRank: 1, ecrPosRank: 1, spread: null, experts: 6, ecrDelta } }),
        delta
      )
    expect(ECR_DELTA_TONE).toBe(3)
    expect(tone(4)).toBe('pos')
    expect(tone(3)).toBeNull()
    expect(tone(0)).toBeNull()
    expect(tone(-3)).toBeNull()
    expect(tone(-4)).toBe('warn')
    expect(tone(null)).toBeNull()
    expect(expertTone(withExperts, col(valueCols, 'marketTrend'))).toBe('neg')
    expect(expertTone(withExperts, col(valueCols, 'ecrPosRank'))).toBeNull()
    expect(expertTone(withExperts, col(valueCols, 'marketValue'))).toBeNull()
    expect(expertTone(valueRow(), delta)).toBeNull()
  })

  it('sorts by an expert column with nulls last, in both modes', () => {
    const rows = [
      valueRow({ playerId: 'a', fullName: 'A' }),
      withExperts,
      valueRow({
        playerId: 'c',
        fullName: 'C',
        expert: { ecrRank: 2, ecrPosRank: 1, spread: null, experts: 6, ecrDelta: -2 }
      })
    ]
    expect(
      sortRows(rows, { key: 'expert:ecrDelta', dir: 'desc' }, 'value').map((r) => r.playerId)
    ).toEqual(['v1', 'c', 'a'])
    expect(
      sortRows(rows, { key: 'expert:ecrDelta', dir: 'asc' }, 'value').map((r) => r.playerId)
    ).toEqual(['c', 'v1', 'a'])
    const weeks = [
      row({
        playerId: 'x',
        fullName: 'X',
        expert: { ecrPosRank: 3, grade: 'C', projPts: null, spread: null }
      }),
      row({
        playerId: 'y',
        fullName: 'Y',
        expert: { ecrPosRank: 1, grade: 'A+', projPts: null, spread: null }
      }),
      row({ playerId: 'z', fullName: 'Z' })
    ]
    expect(
      sortRows(weeks, { key: 'expert:weekGrade', dir: 'desc' }, 'proj').map((r) => r.playerId)
    ).toEqual(['y', 'x', 'z'])
  })

  it('titles expert headers with their description', () => {
    expect(valueHeaderTitle(col(valueCols, 'ecrDelta'), null, ['RB'])).toContain('positive')
  })
})
