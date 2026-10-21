// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { StatsApp } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import type { GameForecast, StatsOwnership, StatsQuery } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'
import { catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

vi.mock('@/lib/api', () => ({
  api: {
    stats: {
      status: vi.fn(),
      catalogue: vi.fn(),
      query: vi.fn(),
      games: vi.fn(),
      ownership: vi.fn(),
      views: vi.fn(),
      saveView: vi.fn(),
      deleteView: vi.fn(),
      exportCsv: vi.fn(),
      onChanged: vi.fn()
    }
  }
}))
const stats = vi.mocked(api.stats)

globalThis.ResizeObserver ??= class {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
} as unknown as typeof ResizeObserver

const OWNERSHIP: StatsOwnership = {
  players: { p1: { name: 'Cook Book', mine: true } },
  teams: { SEA: { name: 'Rival', mine: false } }
}

const TEAMS = ['SEA', 'ARI', 'LA', 'SF']

/** Teams: SEA leads every metric. Players: four SEA receivers; my top scorer plays for SEA. */
function answer(q: StatsQuery): ReturnType<typeof result> {
  const vals = (i: number): Parameters<typeof row>[2] =>
    Object.fromEntries(q.metrics.map((m) => [m, value(10 - i, { sample: 50 })]))
  if (q.entity === 'team') {
    const weeks = q.groupBy?.includes('week') ? [1, 2, 3] : [null]
    const rows = TEAMS.filter((t) => !q.scope.teams || q.scope.teams.includes(t)).flatMap((t, i) =>
      weeks.map((w) => ({
        ...row(t, t, vals(i), { team: t, position: null }),
        group: w === null ? {} : { week: w }
      }))
    )
    return result(q.metrics, rows)
  }
  // My top scorer: SEA in 2026, LA in 2025.
  if (q.scope.players) {
    const team = q.scope.seasons[0] === 2025 ? 'LA' : 'SEA'
    return result(q.metrics, [row('p1', 'Mine', vals(0), { team })])
  }
  const weeks = q.groupBy?.includes('week') ? [1, 2, 3] : [null]
  const rows = ['p0', 'p1', 'p2'].flatMap((id, i) =>
    weeks.map((w) => ({
      ...row(id, `Player ${i}`, vals(i), { team: 'SEA', position: 'WR' }),
      group: w === null ? {} : { week: w }
    }))
  )
  return result(q.metrics, rows)
}

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: '2026-09-13',
    home: 'SEA',
    away: 'SF',
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1550,
    awayElo: 1500,
    homeWinProb: 0.6,
    eloSpread: 2,
    vegasHomeWinProb: 0.55,
    spread: 1.5,
    total: 44.5,
    roof: 'outdoors',
    temp: 60,
    wind: 5,
    ...over
  }
}

const GAMES = [
  game({ gameId: 'a', week: 1, homeScore: 27, awayScore: 20 }),
  game({ gameId: 'b', week: 2, home: 'LA', away: 'SEA', homeScore: 30, awayScore: 10 }),
  // A week from now: the next game, whatever day the tests run.
  game({
    gameId: 'c',
    week: 7,
    gameday: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    home: 'ARI',
    away: 'SEA',
    homeWinProb: 0.3
  })
]

const IDLE: UpdateState = { status: 'idle' } as UpdateState

function Harness({ hasLeague }: { hasLeague: boolean }): React.JSX.Element {
  const [scope, setScope] = useState<StatsScope | null>(null)
  return (
    <StatsApp
      hasLeague={hasLeague}
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.29.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
      scope={scope}
      onScope={setScope}
    />
  )
}

const queries = (): StatsQuery[] => stats.query.mock.calls.map((c) => c[0])

async function openTeams(hasLeague = true): Promise<void> {
  render(<Harness hasLeague={hasLeague} />)
  await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
  fireEvent.click(screen.getByRole('button', { name: 'Teams' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.games.mockImplementation(async (q) =>
    GAMES.filter((g) => !q.team || g.home === q.team || g.away === q.team)
  )
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
})
afterEach(cleanup)

describe('the team dashboard (spec §9.3)', () => {
  it('opens Teams on my top scorer’s team: header, record, results, nine tabs', async () => {
    await openTeams()
    expect(await screen.findByRole('heading', { name: 'SEA' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Teams' }).getAttribute('aria-current')).toBe('page')
    // The top scorer was asked among my players.
    expect(queries().some((q) => q.scope.players?.join() === 'p1')).toBe(true)
    expect(
      await screen.findByText(/^Seattle Seahawks · \d\w+ in the NFC West · Weeks 1–6$/)
    ).toBeTruthy()
    expect(screen.getByText('Defense rostered by Rival')).toBeTruthy()
    expect(await screen.findByText('1–1')).toBeTruthy()
    expect(screen.getByText('−6.5')).toBeTruthy()
    const strip = screen.getByLabelText('Results')
    expect(within(strip).getByText('W 27–20')).toBeTruthy()
    expect(within(strip).getByText('@LA')).toBeTruthy()
    expect(within(strip).getAllByText('BYE')).toHaveLength(4)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Overview',
      'Offense',
      'Defense',
      'Special teams',
      'Situational',
      'Tendencies',
      'Players',
      'Schedule',
      'Forecast'
    ])
  })

  it('shows who gets the ball, the ratings, the next game and the EPA trend', async () => {
    await openTeams()
    expect(await screen.findByText('Who gets the targets')).toBeTruthy()
    const roster = queries().find((q) => q.metrics.includes('targets'))!
    expect(roster.scope).toMatchObject({ teams: ['SEA'], positions: ['QB', 'RB', 'WR', 'TE'] })
    expect(screen.getAllByText('Player 0').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('On your fantasy team').length).toBeGreaterThan(0)
    // Ratings over every team: SEA leads.
    const ratings = queries().find((q) => q.metrics.includes('elo'))!
    expect(ratings.scope.teams).toBeUndefined()
    expect(await screen.findByText('Elo rating')).toBeTruthy()
    expect(screen.getAllByText('1st of 4').length).toBeGreaterThan(0)
    const next = screen.getByRole('region', { name: 'Next game' })
    expect(within(next).getByText('Next: @ ARI')).toBeTruthy()
    expect(within(next).getByText('70%')).toBeTruthy()
    const chart = await screen.findByRole('img', { name: 'SEA EPA per play by week' })
    // Hovering lists every series that week.
    fireEvent.mouseMove(chart, { clientX: 0 })
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Week 1')).toBeTruthy()
    expect(within(tip).getByText('Offense')).toBeTruthy()
    expect(within(tip).getByText('Defense (allowed)')).toBeTruthy()
  })

  it('keeps the team on screen when the season changes', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), {
      target: { value: '2025' }
    })
    await waitFor(() => expect(stats.games).toHaveBeenLastCalledWith({ season: 2025, team: 'SEA' }))
    expect(screen.getByRole('heading', { name: 'SEA' })).toBeTruthy()
  })

  it('never shows the last team’s or tab’s answers while the next ones load', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    expect((await screen.findAllByText('Player 0')).length).toBeGreaterThan(0)
    expect(await screen.findByText('1–1')).toBeTruthy()
    // From here on, nothing answers.
    stats.query.mockImplementation(() => new Promise(() => {}))
    stats.games.mockImplementation(() => new Promise(() => {}))
    fireEvent.click(screen.getByRole('button', { name: 'Next team' }))
    expect(await screen.findByRole('heading', { name: 'SF' })).toBeTruthy()
    expect(screen.queryByText('Player 0')).toBeNull()
    expect(screen.queryByText('1–1')).toBeNull()
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)

    stats.query.mockImplementation(async (q) => answer(q))
    fireEvent.click(screen.getByRole('tab', { name: 'Offense' }))
    expect(await screen.findByText('Red-zone EPA per play')).toBeTruthy()
    stats.query.mockImplementation(() => new Promise(() => {}))
    fireEvent.click(screen.getByRole('tab', { name: 'Defense' }))
    expect(screen.queryByText('Red-zone EPA per play')).toBeNull()
    expect(screen.queryByText('EPA per play allowed')).toBeNull()
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)
  })

  it('says so when the team has no games in range', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Season type' }), {
      target: { value: 'POST' }
    })
    expect(await screen.findByText('SEA did not play in the 2026 postseason.')).toBeTruthy()
  })

  it('shows a failed table’s error instead of nothing', async () => {
    stats.query.mockImplementation(async (q) => {
      if (q.metrics.includes('fg_made')) throw new Error('Specialists failed')
      if (q.groupBy?.includes('personnel')) throw new Error('Personnel failed')
      if (q.metrics.includes('sos_elo') && q.metrics.length === 4)
        throw new Error('Strength failed')
      return answer(q)
    })
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    expect(
      within(await screen.findByRole('list', { name: 'Results' })).getAllByRole('listitem').length
    ).toBe(6)
    fireEvent.click(screen.getByRole('tab', { name: 'Special teams' }))
    expect(await screen.findByText('Specialists failed')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Tendencies' }))
    expect(await screen.findByText('Personnel failed')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }))
    expect(await screen.findByText('Strength failed')).toBeTruthy()
  })

  it('moves between teams with the arrows and the select', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.click(screen.getByRole('button', { name: 'Previous team' }))
    expect(await screen.findByRole('heading', { name: 'PIT' })).toBeTruthy()
    await waitFor(() => expect(stats.games).toHaveBeenLastCalledWith({ season: 2026, team: 'PIT' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Team' }), { target: { value: 'LA' } })
    expect(await screen.findByRole('heading', { name: 'LA' })).toBeTruthy()
    expect(screen.getByText(/Los Angeles Rams/)).toBeTruthy()
  })

  it('reads each stat tab over every team, red zone and two-minute splits included', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.click(screen.getByRole('tab', { name: 'Offense' }))
    expect(await screen.findByText('Red-zone EPA per play')).toBeTruthy()
    expect(queries().some((q) => q.situation?.fieldZone === 'redzone')).toBe(true)

    stats.query.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: 'Situational' }))
    expect(await screen.findByText('Two-minute')).toBeTruthy()
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(11))
    expect(queries().filter((q) => q.situation?.twoMinute)).toHaveLength(1)
    expect(queries().every((q) => q.entity === 'team' && !q.scope.teams)).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: 'Defense' }))
    expect(await screen.findByText('Fantasy points allowed')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Special teams' }))
    expect(await screen.findByText('Kickers')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Tendencies' }))
    expect(await screen.findByText('Personnel groupings')).toBeTruthy()
  })

  it('grids usage by week, and lists the schedule and the forecast', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.click(screen.getByRole('tab', { name: 'Players' }))
    expect(await screen.findByText('Snap share by week')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Targets' }))
    expect(screen.getByText('Target share by week')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }))
    expect(await screen.findByText('2026 schedule')).toBeTruthy()
    expect(screen.getByText('@ LA')).toBeTruthy()
    expect(await screen.findByText('Schedule strength')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Forecast' }))
    expect(await screen.findByText('Season odds')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'SEA playoff and division odds by week' })).toBeTruthy()
    const weekly = queries().find((q) => q.metrics.includes('playoff_pct') && q.groupBy)!
    expect(weekly).toMatchObject({ scope: { teams: ['SEA'] }, groupBy: ['week'] })
  })

  it('opens from the team leaderboard and from the home’s team board', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.click(screen.getByRole('button', { name: 'Team leaderboards →' }))
    expect(
      await screen.findByRole('heading', { name: '2026 team offense leaderboard' })
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Teams' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(within(screen.getByRole('table')).getByText('SF'))
    expect(await screen.findByRole('heading', { name: 'SF' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Leaderboards' }))
    const board = (await screen.findByText('Takeaways')).closest('section')!
    fireEvent.click(await within(board).findByText('ARI'))
    expect(await screen.findByRole('heading', { name: 'ARI' })).toBeTruthy()
  })

  it('waits for my top scorer while the league’s scoring is applied, then opens his team', async () => {
    let changed = (): void => {}
    stats.onChanged.mockImplementation((fn) => {
      changed = fn
      return () => {}
    })
    let scored = false
    stats.query.mockImplementation(async (q) => {
      if (!scored && q.scoring === 'league') {
        throw new Error('the league’s scoring is still being applied')
      }
      return answer(q)
    })
    await openTeams()
    await waitFor(() => expect(queries().some((q) => q.scope.players?.join() === 'p1')).toBe(true))
    // It says why it waits.
    expect(await screen.findByText('the league’s scoring is still being applied')).toBeTruthy()
    scored = true
    act(() => changed())
    expect(await screen.findByRole('heading', { name: 'SEA' })).toBeTruthy()
  })

  it('opens on the first team without a league', async () => {
    stats.ownership.mockResolvedValue(null)
    await openTeams(false)
    expect(await screen.findByRole('heading', { name: 'ARI' })).toBeTruthy()
    expect(queries().some((q) => q.scope.players)).toBe(false)
  })
})
