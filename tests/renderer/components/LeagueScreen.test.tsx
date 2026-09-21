// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LeagueScreen } from '@/screens/LeagueScreen'
import { api } from '@/lib/api'
import type { League } from '@shared/types'
import { team } from '../../fixtures/league'
import { teamStrength } from '../../fixtures/lineup'

vi.mock('@/lib/api', () => ({
  api: {
    league: { get: vi.fn(), teams: vi.fn(), roster: vi.fn(), pointsContext: vi.fn() },
    lineup: { strength: vi.fn() }
  }
}))
const getMock = vi.mocked(api.league.get)
const teamsMock = vi.mocked(api.league.teams)
const rosterMock = vi.mocked(api.league.roster)
const ctxMock = vi.mocked(api.league.pointsContext)
const strengthMock = vi.mocked(api.lineup.strength)

const league: League = {
  leagueId: 'L1',
  name: 'Emoney',
  season: '2026',
  status: 'in_season',
  totalRosters: 3,
  syncedAt: null
}
// API order: me first, then by record — the screen must not rely on it.
const teams = [
  team({ rosterId: 1, teamName: 'Cook Book', wins: 1, losses: 1, fpts: 250, isMe: true }),
  team({ rosterId: 2, teamName: 'Rival', wins: 2, losses: 0, fpts: 260 }),
  team({ rosterId: 3, teamName: 'Third', wins: 0, losses: 2, fpts: 200 })
]
const strengths = [
  teamStrength({ rosterId: 1, name: 'Cook Book', isMe: true, rosTotal: 1900.5, rank: 1 }),
  teamStrength({ rosterId: 2, name: 'Rival', rosTotal: 1850, rank: 2 }),
  teamStrength({
    rosterId: 3,
    name: 'Third',
    thisWeek: null,
    rosTotal: null,
    rosPerWeek: null,
    rank: null
  })
]

/** Team cards are the buttons that carry an ROS line ("ROS 12.00 · #1" / "ROS —"), in DOM order — not the "ROS strength" toggle. */
function cards(): string[] {
  return screen
    .getAllByRole('button')
    .filter((b) => /ROS (\d|—)/.test(b.textContent ?? ''))
    .map((b) => b.textContent ?? '')
}

beforeEach(() => {
  vi.resetAllMocks()
  getMock.mockResolvedValue(league)
  teamsMock.mockResolvedValue(teams)
  rosterMock.mockResolvedValue([])
  ctxMock.mockResolvedValue({ season: 2026, lastWeek: 2 })
  strengthMock.mockResolvedValue(strengths)
})
afterEach(cleanup)

describe('LeagueScreen', () => {
  it('shows an ROS line on every card and sorts by record by default', async () => {
    render(<LeagueScreen />)
    expect(await screen.findByText('ROS 1900.50 · #1')).toBeTruthy()
    expect(strengthMock).toHaveBeenCalledWith(2026)
    const order = cards()
    expect(order).toHaveLength(3)
    expect(order[0]).toMatch(/^Rival/)
    expect(order[0]).toContain('ROS 1850.00 · #2')
    expect(order[1]).toMatch(/^Cook Book/)
    expect(order[2]).toMatch(/^Third/)
    expect(order[2]).toContain('ROS —')
    expect(screen.getByRole('button', { name: 'Record', pressed: true })).toBeTruthy()
    expect(
      screen.queryByText(
        'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'
      )
    ).toBeNull()
    // The selected roster panel still opens on my team.
    expect(screen.getAllByText('Cook Book')).toHaveLength(2)
  })

  it('sorts by ROS strength on the toggle, unranked last, with the basis note', async () => {
    render(<LeagueScreen />)
    await screen.findByText('ROS 1900.50 · #1')
    fireEvent.click(screen.getByRole('button', { name: 'ROS strength' }))
    expect(screen.getByRole('button', { name: 'ROS strength', pressed: true })).toBeTruthy()
    expect(
      screen.getByText(
        'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'
      )
    ).toBeTruthy()
    let order = cards()
    expect(order[0]).toMatch(/^Cook Book/)
    expect(order[1]).toMatch(/^Rival/)
    expect(order[2]).toMatch(/^Third/)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    order = cards()
    expect(order[0]).toMatch(/^Rival/)
  })

  it('shows dashes and the error line when the strength call fails', async () => {
    strengthMock.mockRejectedValue(new Error('boom'))
    render(<LeagueScreen />)
    expect(await screen.findByText('boom')).toBeTruthy()
    expect(screen.getAllByText('ROS —')).toHaveLength(3)
  })
})
