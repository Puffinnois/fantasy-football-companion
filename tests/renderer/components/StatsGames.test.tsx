// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { StatsApp } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import type { GameForecast, StatsOwnership, StatsQuery } from '@shared/stats/types'
import type { PlayersWeek, UpdateState } from '@shared/types'
import { catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

vi.mock('@/lib/api', () => ({
  api: {
    players: { detail: vi.fn(), week: vi.fn() },
    stats: {
      status: vi.fn(),
      catalogue: vi.fn(),
      query: vi.fn(),
      games: vi.fn(),
      outlook: vi.fn(),
      player: vi.fn(),
      link: vi.fn(),
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
const players = vi.mocked(api.players)

/** p1 (mine) plays for BUF. */
const OWNERSHIP: StatsOwnership = { players: { bw1: { name: 'Me', mine: true } }, teams: {} }

const day = (offset: number): string =>
  new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: day(-30),
    kickoff: null,
    home: 'KC',
    away: 'BUF',
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1600,
    awayElo: 1550,
    homeWinProb: 0.62,
    eloSpread: 3.1,
    vegasHomeWinProb: 0.6,
    spread: 2.5,
    total: 48.5,
    roof: 'outdoors',
    temp: null,
    wind: null,
    ...over
  }
}

/** Week 1 and 2 final, week 3 next: MIA at NE, then BUF at KC (mine, so first). */
const GAMES: GameForecast[] = [
  game({ gameId: 'a1', week: 1, home: 'BUF', away: 'MIA', homeScore: 27, awayScore: 20 }),
  game({ gameId: 'b1', week: 1, home: 'KC', away: 'NE', homeScore: 30, awayScore: 10 }),
  game({ gameId: 'a2', week: 2, home: 'NE', away: 'BUF', homeScore: 13, awayScore: 23 }),
  game({ gameId: 'b2', week: 2, home: 'MIA', away: 'KC', homeScore: 20, awayScore: 24 }),
  game({ gameId: 'c3', week: 3, home: 'NE', away: 'MIA', gameday: day(5) }),
  game({ gameId: 'a3', week: 3, home: 'KC', away: 'BUF', gameday: day(6) })
]
const TEAMS = ['BUF', 'KC', 'MIA', 'NE']

/** [id, name, team, position]; bw0, BUF's leading WR, missed its last game. */
const PLAYERS: [string, string, string, string][] = [
  ['bw0', 'Buffalo Starter', 'BUF', 'WR'],
  ['bq', 'Buffalo Passer', 'BUF', 'QB'],
  ['br', 'Buffalo Back', 'BUF', 'RB'],
  ['bw1', 'Buffalo Wideout', 'BUF', 'WR'],
  ['bw2', 'Buffalo Slot', 'BUF', 'WR'],
  ['bt', 'Buffalo End', 'BUF', 'TE'],
  ['be', 'Buffalo Rusher', 'BUF', 'DL'],
  ['kq', 'Kansas Passer', 'KC', 'QB'],
  ['kw', 'Kansas Wideout', 'KC', 'WR'],
  ['kk', 'Kansas Kicker', 'KC', 'K'],
  ['ke', 'Kansas Rusher', 'KC', 'LB']
]

function answer(q: StatsQuery): ReturnType<typeof result> {
  if (q.entity === 'team') {
    const rows = TEAMS.map((t, i) =>
      row(t, t, Object.fromEntries(q.metrics.map((m) => [m, value((i + 1) / 10)])), {
        team: t,
        position: null
      })
    )
    return result(q.metrics, rows)
  }
  const s = q.scope
  const rows = PLAYERS.filter(
    ([id, , team, position]) =>
      (!s.players || s.players.includes(id)) &&
      (!s.teams || s.teams.includes(team)) &&
      (!s.positions || s.positions.includes(position as never))
  ).map(([id, name, team, position], i) =>
    row(id, name, Object.fromEntries(q.metrics.map((m) => [m, value(20 - i)])), {
      team,
      position
    })
  )
  if (q.groupBy?.includes('week')) {
    const [a, b] = s.weeks!
    return result(
      q.metrics,
      rows
        .filter((r) => r.id !== 'bw0')
        .flatMap((r) =>
          Array.from({ length: b - a + 1 }, (_, k) => ({ ...r, group: { week: a + k } }))
        )
    )
  }
  return result(q.metrics, rows)
}

const IDLE: UpdateState = { status: 'idle' } as UpdateState

function Harness({ hasLeague = true }: { hasLeague?: boolean }): React.JSX.Element {
  const [scope, setScope] = useState<StatsScope | null>(null)
  return (
    <StatsApp
      hasLeague={hasLeague}
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.36.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
      scope={scope}
      onScope={setScope}
    />
  )
}

async function openGames(hasLeague = true): Promise<void> {
  render(<Harness hasLeague={hasLeague} />)
  await waitFor(() => expect(stats.catalogue).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Games' }))
}

const railTeams = (): string[] =>
  within(screen.getByRole('list', { name: 'Games' }))
    .getAllByRole('listitem')
    .map((b) => b.textContent ?? '')

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.games.mockResolvedValue(GAMES)
  stats.outlook.mockRejectedValue(new Error('no outlook'))
  stats.player.mockRejectedValue(new Error('no bio'))
  stats.link.mockImplementation(async (id) =>
    'gsis' in id ? { sleeper: `s-${id.gsis}`, gsis: id.gsis, team: null } : null
  )
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
  players.week.mockResolvedValue({
    rows: [{ playerId: 's-bw1', projected: 14.25 }]
  } as PlayersWeek)
})
afterEach(cleanup)

describe('Games (stats-analysis spec §9.5, Plan AE)', () => {
  it('opens on the next week, my game first, with its preview', async () => {
    await openGames()
    await waitFor(() => expect(railTeams()).toHaveLength(2))
    expect(railTeams()[0]).toMatch(/^BUF.*KC/)
    expect((screen.getByRole('combobox', { name: 'Week' }) as HTMLSelectElement).value).toBe('3')
    // Not played: the box score waits.
    expect(screen.getByRole('tab', { name: 'Preview', selected: true })).toBeTruthy()
    expect((screen.getByRole('tab', { name: 'Box score' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    expect(screen.getByText('The forecast')).toBeTruthy()
    expect(screen.getByText('Elo and the market agree: KC by 2.5.')).toBeTruthy()
    // Each offense against the other defense, before the game (weeks 1–2).
    expect(await screen.findByLabelText('BUF offense against KC defense')).toBeTruthy()
    expect(screen.getByLabelText('KC offense against BUF defense')).toBeTruthy()
    expect(screen.getByText('Team stats: weeks 1–2')).toBeTruthy()
    const matchup = stats.query.mock.calls
      .map((c) => c[0])
      .find((q) => q.metrics.includes('fpa_wr'))
    expect(matchup!.scope).toMatchObject({ seasons: [2026], weeks: [1, 2] })
    // The key players, mine marked, with Sleeper's projection.
    const buf = await screen.findByLabelText('BUF key players')
    expect(within(buf).getByText('Buffalo Wideout')).toBeTruthy()
    await waitFor(() => expect(within(buf).getByText('14.3')).toBeTruthy())
    expect(players.week).toHaveBeenCalledWith({ season: 2026, week: 3 })
    expect(within(buf).getByText(/Kansas Rusher \(KC LB\)/)).toBeTruthy()
  })

  it('opens a final game on its box score; its preview is the forecast before kickoff', async () => {
    await openGames()
    await waitFor(() => expect(railTeams()).toHaveLength(2))
    fireEvent.change(screen.getByRole('combobox', { name: 'Week' }), { target: { value: '2' } })
    await waitFor(() => expect(railTeams()[0]).toMatch(/^BUF23NE13/))
    expect(screen.getByRole('tab', { name: 'Box score', selected: true })).toBeTruthy()
    expect(await screen.findByRole('table', { name: 'BUF Passing' })).toBeTruthy()
    // The box score: three narrow queries (the week's players in week 3's preview group by week).
    const box = stats.query.mock.calls
      .map((c) => c[0])
      .filter((q) => !q.groupBy && q.scope.weeks?.[0] === 2 && q.scope.weeks[1] === 2)
    expect(box).toHaveLength(4)
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(await screen.findByText('The forecast before kickoff')).toBeTruthy()
    expect(screen.getByText('BUF won 23–13 · an upset')).toBeTruthy()
    expect(screen.getByText('Team stats: week 1, before the game')).toBeTruthy()
  })

  it('without a league: no projections, a line says why; a team opens its dashboard', async () => {
    await openGames(false)
    await waitFor(() => expect(railTeams()).toHaveLength(2))
    expect(await screen.findByText(/Import a league in Fantasy/)).toBeTruthy()
    expect(players.week).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTitle('Open the Kansas City Chiefs dashboard'))
    await waitFor(() => expect(stats.games).toHaveBeenCalledWith({ season: 2026, team: 'KC' }))
  })

  it('names the key players only once it knows who played: never one out of the last game', async () => {
    let release = (): void => {}
    const held = new Promise<void>((r) => (release = r))
    stats.query.mockImplementation(async (q) => {
      if (q.groupBy?.includes('week')) await held
      return answer(q)
    })
    await openGames()
    // The phases are on screen while the players of the last game load.
    expect(await screen.findByLabelText('BUF offense against KC defense')).toBeTruthy()
    expect(screen.queryByLabelText('BUF key players')).toBeNull()
    expect(screen.queryByText('Buffalo Starter')).toBeNull()
    release()
    const buf = await screen.findByLabelText('BUF key players')
    expect(within(buf).queryByText('Buffalo Starter')).toBeNull()
    expect(within(buf).getByText('Buffalo Wideout')).toBeTruthy()
  })

  it('a final game’s key players wait for its box score', async () => {
    let release = (): void => {}
    const held = new Promise<void>((r) => (release = r))
    stats.query.mockImplementation(async (q) => {
      // The box score of week 2 (not the players of a last game, grouped by week).
      if (!q.groupBy && q.scope.weeks?.[0] === 2 && q.scope.weeks[1] === 2) await held
      return answer(q)
    })
    await openGames()
    await waitFor(() => expect(railTeams()).toHaveLength(2))
    fireEvent.change(screen.getByRole('combobox', { name: 'Week' }), { target: { value: '2' } })
    fireEvent.click(await screen.findByRole('tab', { name: 'Preview' }))
    expect(await screen.findByLabelText('BUF offense against NE defense')).toBeTruthy()
    expect(screen.queryByLabelText('BUF key players')).toBeNull()
    release()
    const buf = await screen.findByLabelText('BUF key players')
    // He played this one: his points scored.
    expect(within(buf).getByText('Buffalo Starter')).toBeTruthy()
    expect(within(buf).getAllByText('scored').length).toBeGreaterThan(0)
  })
})
