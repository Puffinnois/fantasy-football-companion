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
    lineup: { week: vi.fn() },
    league: { get: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const weekMock = vi.mocked(api.lineup.week)
const leagueMock = vi.mocked(api.league.get)

const options: PlayersOptions = {
  seasons: [2026],
  currentWeek: 3,
  lastScoredWeek: 2,
  tabs: [],
  projectionWeeks: []
}

const rb1 = lineupPlayer({ playerId: 'rb1', fullName: 'Saquon Barkley', value: 18.4 })
const rb2 = lineupPlayer({
  playerId: 'rb2',
  fullName: 'Chase Brown',
  value: 11.2,
  flag: 'questionable',
  injuryStatus: 'Questionable',
  dvpRank: 25
})
const rb3 = lineupPlayer({ playerId: 'rb3', fullName: 'Rico Dowdle', value: 10.1 })
const out = lineupPlayer({
  playerId: 'rb4',
  fullName: 'Old Starter',
  value: 4,
  flag: 'out',
  injuryStatus: 'Out',
  dvpRank: 3
})
const withSwap = lineupWeek({
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

beforeEach(() => {
  vi.resetAllMocks()
  optionsMock.mockResolvedValue(options)
  leagueMock.mockResolvedValue(null)
})
afterEach(cleanup)

describe('LineupScreen', () => {
  it('loads the current week with the scoreboard and the optimal state', async () => {
    weekMock.mockResolvedValue(lineupWeek())
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('This is already your best lineup.')).toBeTruthy()
    expect(weekMock).toHaveBeenCalledWith({ season: 2026, week: 3 })
    expect(screen.getByText('34.6')).toBeTruthy() // mine, current
    expect(screen.getByText('28.7')).toBeTruthy() // theirs, current
    expect(screen.getByText('Ahead by 5.9')).toBeTruthy()
    expect(screen.getByText('Rival')).toBeTruthy()
    expect(screen.getByText('Saquon Barkley')).toBeTruthy()
    expect(screen.getByLabelText('Week').textContent).toBe('Week 03')
  })

  it('suggests the swaps, previews them on "Make swaps" and undoes', async () => {
    weekMock.mockResolvedValue(withSwap)
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText("You're leaving 7.2 points on the bench.")).toBeTruthy()
    expect(screen.getByText('Start Chase Brown instead')).toBeTruthy()
    expect(screen.getByText('+7.2')).toBeTruthy()
    expect(screen.getAllByText('OUT').length).toBeGreaterThan(0)
    // Bench = everyone startable not on display: Chase Brown and Rico Dowdle.
    expect(screen.getByText('Bench').parentElement?.textContent).toContain('2')

    fireEvent.click(screen.getByRole('button', { name: /Make 1 swap/ }))
    expect(screen.getByText('Best lineup set: 29.6 projected.')).toBeTruthy()
    expect(screen.getByText('IN')).toBeTruthy()
    expect(screen.getByText('Q')).toBeTruthy() // Chase Brown now starts, questionable
    expect(screen.getByText('Close call: R. Dowdle (10.1)').getAttribute('title')).toMatch(
      /^Close call\n/
    )
    expect(screen.getByText('29.6')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText("You're leaving 7.2 points on the bench.")).toBeTruthy()
  })

  it('shows the not-set and no-team states, and refetches on a week step', async () => {
    weekMock.mockResolvedValueOnce(
      lineupWeek({ me: teamLineup({ current: null, currentTotal: null, swaps: [] }) })
    )
    render(<LineupScreen dataVersion={0} />)
    expect(
      await screen.findByText('Lineup not set on Sleeper yet. Here is the best one.')
    ).toBeTruthy()
    weekMock.mockResolvedValueOnce(
      lineupWeek({ week: 4, me: null, opponent: null, matchupId: null })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(
      await screen.findByText("Your team isn't identified — re-import from Setup")
    ).toBeTruthy()
    expect(weekMock).toHaveBeenLastCalledWith({ season: 2026, week: 4 })
  })

  it('states the final score on a final week', async () => {
    weekMock.mockResolvedValue(
      lineupWeek({
        status: 'final',
        me: teamLineup({ actualTotal: 31.2 }),
        opponent: teamLineup({ rosterId: 2, name: 'Rival', isMe: false, actualTotal: 33 })
      })
    )
    render(<LineupScreen dataVersion={0} />)
    expect(
      await screen.findByText('Final score, 31.2 points. Your best lineup was projected for 34.6.')
    ).toBeTruthy()
    expect(screen.getByText('Lost by 1.8')).toBeTruthy()
  })

  it('renders the error line when the call fails', async () => {
    weekMock.mockRejectedValue(new Error('boom'))
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('boom')).toBeTruthy()
  })
})
