// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LeagueScreen } from '@/screens/LeagueScreen'
import { api } from '@/lib/api'
import type { League, RosterPlayer } from '@shared/types'
import type { Rules } from '@shared/rules'
import { team } from '../../fixtures/league'
import { teamStrength } from '../../fixtures/lineup'

vi.mock('@/lib/api', () => ({
  api: {
    league: { get: vi.fn(), teams: vi.fn(), roster: vi.fn(), pointsContext: vi.fn() },
    lineup: { strength: vi.fn() },
    rules: { get: vi.fn() }
  }
}))
const getMock = vi.mocked(api.league.get)
const teamsMock = vi.mocked(api.league.teams)
const rosterMock = vi.mocked(api.league.roster)
const ctxMock = vi.mocked(api.league.pointsContext)
const strengthMock = vi.mocked(api.lineup.strength)
const rulesMock = vi.mocked(api.rules.get)

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
const saquon: RosterPlayer = {
  playerId: 'p1',
  slot: 'starter',
  starterIndex: 0,
  fullName: 'Saquon Barkley',
  position: 'RB',
  team: 'PHI',
  status: 'Active',
  injuryStatus: 'Questionable',
  byeWeek: 9,
  seasonPoints: 40,
  lastWeekPoints: 26,
  statsAvailable: true
}

/** Standings rows are the toggle buttons that carry aria-pressed, in DOM order. */
function rows(): string[] {
  return screen
    .getAllByRole('button')
    .filter((b) => b.hasAttribute('aria-pressed'))
    .map((b) => b.textContent ?? '')
}

beforeEach(() => {
  vi.resetAllMocks()
  getMock.mockResolvedValue(league)
  teamsMock.mockResolvedValue(teams)
  rosterMock.mockResolvedValue([])
  ctxMock.mockResolvedValue({ season: 2026, lastWeek: 2 })
  strengthMock.mockResolvedValue(strengths)
  rulesMock.mockResolvedValue(null)
})
afterEach(cleanup)

describe('LeagueScreen', () => {
  it('lists the standings by record with ROS ranks and opens my team', async () => {
    render(<LeagueScreen />)
    expect(await screen.findByText('#1')).toBeTruthy()
    expect(strengthMock).toHaveBeenCalledWith(2026)
    const order = rows()
    expect(order).toHaveLength(3)
    expect(order[0]).toMatch(/^1R.*Rival/)
    expect(order[0]).toContain('#2')
    expect(order[1]).toContain('Cook Book')
    expect(order[2]).toContain('Third')
    expect(order[2]).toContain('—')
    expect(screen.getByRole('tab', { name: 'By record', selected: true })).toBeTruthy()
    expect(screen.getByText('Emoney · 2026 · Through week 2')).toBeTruthy()
    // The selected team panel opens on my team, and the masthead shows my place.
    expect(screen.getByText('Your team · owner1')).toBeTruthy()
    expect(screen.getByText('In a playoff spot, 2nd of 3')).toBeTruthy()
    expect(screen.getByText('Top-1 roster for the rest of the season')).toBeTruthy()
  })

  it('sorts by rest-of-season strength, unranked last, with the basis note', async () => {
    render(<LeagueScreen />)
    await screen.findByText('#1')
    fireEvent.click(screen.getByRole('tab', { name: 'Rest of season' }))
    expect(
      screen.getByText(
        'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'
      )
    ).toBeTruthy()
    let order = rows()
    expect(order[0]).toContain('Cook Book')
    expect(order[1]).toContain('Rival')
    expect(order[2]).toContain('Third')
    fireEvent.click(screen.getByRole('tab', { name: 'By record' }))
    order = rows()
    expect(order[0]).toContain('Rival')
  })

  it('draws the playoff line from the league settings and opens a player file from the roster', async () => {
    rulesMock.mockResolvedValue({ settings: { playoffTeams: 1 } } as unknown as Rules)
    rosterMock.mockResolvedValue([saquon])
    const onOpenPlayer = vi.fn()
    render(<LeagueScreen onOpenPlayer={onOpenPlayer} />)
    expect(await screen.findByText('Top 1 make it')).toBeTruthy()
    expect(screen.getByText('1 game out of the last playoff spot')).toBeTruthy()
    const row = await screen.findByTitle('Open player file')
    expect(row.textContent).toContain('Saquon Barkley')
    expect(row.textContent).toContain('Q') // injury tag
    expect(row.textContent).toContain('▲26.0') // 26 vs a 20-point average
    fireEvent.click(row)
    expect(onOpenPlayer).toHaveBeenCalledWith('p1')
  })

  it('shows dashes and the error line when the strength call fails', async () => {
    strengthMock.mockRejectedValue(new Error('boom'))
    render(<LeagueScreen />)
    expect(await screen.findByText('boom')).toBeTruthy()
    expect(rows().every((r) => r.endsWith('—'))).toBe(true)
  })
})
