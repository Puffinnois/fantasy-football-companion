// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LineupScreen } from '@/screens/LineupScreen'
import { api } from '@/lib/api'
import type { PlayersOptions } from '@shared/types'
import { lineupPlayer, lineupWeek, slotEntry, teamLineup } from '../../fixtures/lineup'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    lineup: { week: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const weekMock = vi.mocked(api.lineup.week)

const options: PlayersOptions = {
  seasons: [2026],
  currentWeek: 3,
  lastScoredWeek: 2,
  tabs: [],
  projectionWeeks: []
}

beforeEach(() => {
  optionsMock.mockReset()
  weekMock.mockReset()
  optionsMock.mockResolvedValue(options)
})
afterEach(cleanup)

describe('LineupScreen', () => {
  it('loads the current week, shows the matchup header, the slot table and the optimal state', async () => {
    weekMock.mockResolvedValue(lineupWeek())
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('You 34.6 optimal · 34.6 current')).toBeTruthy()
    expect(weekMock).toHaveBeenCalledWith({ season: 2026, week: 3 })
    expect(screen.getByText('Rival 28.7 current')).toBeTruthy()
    expect(screen.getAllByText('Saquon Barkley')).toHaveLength(2) // current and optimal columns
    expect(screen.getByText('Your lineup is optimal')).toBeTruthy()
    expect((screen.getByLabelText('Week') as HTMLSelectElement).value).toBe('3')
  })

  it('lists swaps, tints new starters, flags players and shows a close call', async () => {
    const rb1 = lineupPlayer({ playerId: 'rb1', fullName: 'Saquon Barkley', value: 18.4 })
    const rb2 = lineupPlayer({
      playerId: 'rb2',
      fullName: 'Chase Brown',
      value: 11.2,
      flag: 'questionable',
      injuryStatus: 'Questionable'
    })
    const rb3 = lineupPlayer({ playerId: 'rb3', fullName: 'Rico Dowdle', value: 10.1 })
    const out = lineupPlayer({
      playerId: 'rb4',
      fullName: 'Old Starter',
      value: 4,
      flag: 'out',
      injuryStatus: 'Out'
    })
    weekMock.mockResolvedValue(
      lineupWeek({
        me: teamLineup({
          optimal: [slotEntry('RB', rb1), slotEntry('RB', rb2, rb3)],
          optimalTotal: 29.6,
          current: [slotEntry('RB', rb1), slotEntry('RB', out)],
          currentTotal: 22.4,
          bench: [rb3],
          unavailable: [out],
          swaps: [{ slot: 'RB', out, in: rb2, delta: 7.2 }]
        })
      })
    )
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('Start Chase Brown over Old Starter (RB, +7.2)')).toBeTruthy()
    expect(screen.getByText('Q')).toBeTruthy()
    expect(screen.getAllByText('O').length).toBeGreaterThan(0)
    expect(screen.getByText('≈ Rico Dowdle').getAttribute('title')).toMatch(/^Close call\n/)
    expect(screen.getByText('Rico Dowdle')).toBeTruthy() // bench list
    expect(screen.getByText('+7.2')).toBeTruthy() // row delta
  })

  it('shows the not-set and no-team states, and refetches on a week change', async () => {
    weekMock.mockResolvedValueOnce(
      lineupWeek({ me: teamLineup({ current: null, currentTotal: null, swaps: [] }) })
    )
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('Lineup not set on Sleeper yet')).toBeTruthy()
    weekMock.mockResolvedValueOnce(
      lineupWeek({ week: 5, me: null, opponent: null, matchupId: null })
    )
    fireEvent.change(screen.getByLabelText('Week'), { target: { value: '5' } })
    expect(
      await screen.findByText("Your team isn't identified — re-import from Setup")
    ).toBeTruthy()
    expect(weekMock).toHaveBeenLastCalledWith({ season: 2026, week: 5 })
  })

  it('renders the error line when the call fails', async () => {
    weekMock.mockRejectedValue(new Error('boom'))
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('boom')).toBeTruthy()
  })
})
