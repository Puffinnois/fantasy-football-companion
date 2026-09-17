import { describe, expect, it } from 'vitest'
import {
  cellText,
  cellValue,
  columnGroups,
  gameLabel,
  kickoffLabel,
  subLabel
} from '@/lib/playersTableView'
import type { PlayerTableRow } from '@shared/types'

const row = (over: Partial<PlayerTableRow> = {}): PlayerTableRow => ({
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
  stats: { rush_yd: 60, sack: 2.5 },
  snapPct: 0.83,
  targetShare: null,
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
    expect(cellValue(row({ stats: {} }), rushYd, 'stats')).toBeNull()
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
    expect(gameLabel(row({ game: upcoming }), NY)).toBe('Sun 1:00 PM vs GB')
    expect(gameLabel(row({ game: { ...upcoming, home: false, kickoff: null } }), NY)).toBe('@ GB')
    expect(
      gameLabel(
        row({
          game: {
            opponent: 'DAL',
            home: true,
            kickoff: null,
            homeScore: 24,
            awayScore: 20,
            final: true
          }
        })
      )
    ).toBe('vs DAL · W 24-20')
    expect(
      gameLabel(
        row({
          game: {
            opponent: 'DAL',
            home: false,
            kickoff: null,
            homeScore: 24,
            awayScore: 20,
            final: true
          }
        })
      )
    ).toBe('@ DAL · L 20-24')
    expect(gameLabel(row({ game: null }))).toBe('BYE')
  })
  it('subLabel: team with bye + game; FA without a team', () => {
    expect(subLabel(row({ game: null }))).toBe('PHI (bye 7) · BYE')
    expect(subLabel(row({ byeWeek: null, game: null }))).toBe('PHI · BYE')
    expect(subLabel(row({ team: null }))).toBe('FA')
  })
})
