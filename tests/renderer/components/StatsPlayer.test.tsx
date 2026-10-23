// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { StatsApp, type StatsFocus } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import type { GameForecast, PlayerOutlook, StatsOwnership, StatsQuery } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'
import { bio, catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

vi.mock('@/lib/api', () => ({
  api: {
    players: { detail: vi.fn() },
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

globalThis.ResizeObserver ??= class {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
} as unknown as typeof ResizeObserver

const OWNERSHIP: StatsOwnership = { players: { p1: { name: 'Cook Book', mine: true } }, teams: {} }

const OPP: Record<number, string> = { 1: 'ARI', 2: 'LA', 3: 'SF' }
const DIMS: Record<string, (string | number)[]> = {
  week: [1, 2, 3],
  opponent: ['ARI', 'LA', 'SF'],
  quarter: [1, 2, 3, 4],
  down: [1, 2, 3],
  coverage: ['man', 'zone'],
  season: [2025, 2026],
  team: ['SEA']
}

/** Players p0–p3 at the asked position (p3 below the qualifier); my top scorer p1 is a RB. */
function answer(q: StatsQuery): ReturnType<typeof result> {
  if (q.entity === 'team') {
    const rows = ['ARI', 'LA', 'SF'].map((t, i) =>
      row(t, t, Object.fromEntries(q.metrics.map((m) => [m, value(20 - i)])), {
        team: t,
        position: null
      })
    )
    return result(q.metrics, rows)
  }
  // My top scorer: my roster's ids, the best one.
  if (q.scope.players && q.limit === 1)
    return result(q.metrics, [
      row('p1', 'Player 1', { fantasy_points: value(200) }, { position: 'RB' })
    ])
  const position = q.scope.positions?.[0] ?? 'WR'
  const ids = q.scope.players ?? ['p0', 'p1', 'p2', 'p3']
  const groups = (q.groupBy ?? [])
    .reduce<Record<string, string | number>[]>(
      (acc, g) => acc.flatMap((a) => DIMS[g].map((v) => ({ ...a, [g]: v }))),
      [{}]
    )
    // A week has one opponent: SEA's schedule.
    .filter(
      (g) => g.week === undefined || g.opponent === undefined || g.opponent === OPP[Number(g.week)]
    )
  const rows = ids.flatMap((id) => {
    const i = Number(id.slice(1))
    const values = Object.fromEntries(
      q.metrics.map((m) => [m, value(100 - i * 10, { qualified: i < 3, sample: 40 })])
    )
    return groups.map((group) => ({
      ...row(id, `Player ${i}`, values, { position, team: 'SEA' }),
      group
    }))
  })
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
    away: 'ARI',
    neutral: false,
    homeScore: 27,
    awayScore: 20,
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
  game({ gameId: 'a', week: 1 }),
  game({ gameId: 'b', week: 2, home: 'LA', away: 'SEA', homeScore: 30, awayScore: 10 }),
  game({
    gameId: 'c',
    week: 7,
    gameday: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    home: 'ARI',
    away: 'SEA',
    homeScore: null,
    awayScore: null
  })
]

const OUTLOOK: PlayerOutlook = {
  player: 'p1',
  season: 2026,
  scoring: 'league',
  position: 'RB',
  team: 'SEA',
  games: 6,
  ceiling: { season: 24.2, last16: 22 },
  floor: { season: 9.1, last16: 8 },
  boomRate: 0.5,
  bustRate: 0,
  trend: [
    { metric: 'carry_share', season: 0.6, last4: 0.7, change: 0.12, z: 2.4, roleChange: 'up' }
  ],
  regression: [{ metric: 'fpoe', value: 20, mean: 1, expectedChange: -14, z: 1.3, signal: 'hot' }],
  schedule: { opponents: ['ARI', 'LA'], easierBy: 1.5 }
}

const IDLE: UpdateState = { status: 'idle' } as UpdateState

function Harness({
  hasLeague,
  focus = null,
  onOpenFantasyPlayer
}: {
  hasLeague: boolean
  focus?: StatsFocus | null
  onOpenFantasyPlayer?: (id: string) => void
}): React.JSX.Element {
  const [scope, setScope] = useState<StatsScope | null>(null)
  return (
    <StatsApp
      focus={focus}
      onOpenFantasyPlayer={onOpenFantasyPlayer}
      hasLeague={hasLeague}
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.30.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
      scope={scope}
      onScope={setScope}
    />
  )
}

const queries = (): StatsQuery[] => stats.query.mock.calls.map((c) => c[0])

async function openPlayers(hasLeague = true): Promise<void> {
  render(<Harness hasLeague={hasLeague} />)
  await waitFor(() => expect(stats.catalogue).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Players' }))
  await screen.findByRole('tablist', { name: 'Player dashboard' })
}

const tab = (name: string): void => {
  fireEvent.click(screen.getByRole('tab', { name, selected: false }))
}

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.games.mockResolvedValue(GAMES)
  stats.outlook.mockResolvedValue(OUTLOOK)
  stats.player.mockImplementation(async ({ player }) =>
    bio(player, player === 'p1' ? { position: 'RB', status: null } : {})
  )
  stats.link.mockResolvedValue(null)
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
})
afterEach(cleanup)

describe('the player dashboard (stats-analysis spec §9.4)', () => {
  it('opens on my top scorer: header, his position’s tabs, the rail at his position', async () => {
    await openPlayers()
    expect(screen.getByRole('heading', { name: 'Player 1' })).toBeTruthy()
    expect(
      screen.getByText(/^#11 · Age \d+ · 6th season · 2021 Round 1, pick 10 \(SEA\)/)
    ).toBeTruthy()
    expect(await screen.findByText('6 G · Weeks 1–6')).toBeTruthy()
    expect(await screen.findByText('RB2 in My league')).toBeTruthy()
    expect(
      within(screen.getByRole('tablist', { name: 'Player dashboard' }))
        .getAllByRole('tab')
        .map((t) => t.textContent)
    ).toEqual([
      'Overview',
      'Usage',
      'Rushing',
      'Receiving',
      'Game log',
      'Splits',
      'Forecast',
      'Profile'
    ])
    const rail = screen.getByRole('complementary', { name: 'Players' })
    expect(within(rail).getByRole('radio', { name: 'RB', checked: true })).toBeTruthy()
    // The qualified three; the one shown is marked.
    await waitFor(() =>
      expect(within(rail).getAllByRole('button', { name: /Player \d/ })).toHaveLength(3)
    )
    expect(within(rail).getByRole('button', { current: true }).textContent).toContain('Player 1')
    // Compare comes with Plan AD.
    expect((screen.getByRole('button', { name: 'Compare' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('waits for my top scorer while the league’s scoring is applied', async () => {
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
    render(<Harness hasLeague />)
    await waitFor(() => expect(stats.catalogue).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
    await waitFor(() => expect(queries().some((q) => q.scope.players && q.limit === 1)).toBe(true))
    // It says why it waits.
    expect(await screen.findByText('the league’s scoring is still being applied')).toBeTruthy()
    scored = true
    act(() => changed())
    expect(await screen.findByRole('heading', { name: 'Player 1' })).toBeTruthy()
  })

  it('opens on the leading WR without a roster', async () => {
    stats.ownership.mockResolvedValue(null)
    await openPlayers(false)
    expect(screen.getByRole('heading', { name: 'Player 0' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'vs Coverage' })).toBeTruthy()
  })

  it('ranks every line among the position, never filtering the player', async () => {
    await openPlayers()
    await screen.findByText('Percentile rankings')
    tab('Rushing')
    await screen.findByText('Efficiency')
    const ranked = queries().filter((q) => q.scope.positions?.[0] === 'RB' && !q.groupBy)
    expect(ranked.length).toBeGreaterThan(2)
    expect(ranked.every((q) => q.scope.players === undefined)).toBe(true)
    // Player 1 is 2nd of the three qualified RBs.
    const line = document.querySelector('[data-metric="all:rush_ypc"]') as HTMLElement
    expect(within(line).getByText('2nd of 3')).toBeTruthy()
  })

  it('moves through the rail: a row, the arrow keys, another position’s leader, the rank-by', async () => {
    await openPlayers()
    const rail = screen.getByRole('complementary', { name: 'Players' })
    fireEvent.click(await within(rail).findByRole('button', { name: /Player 2/ }))
    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
    fireEvent.keyDown(rail, { key: 'ArrowUp' })
    expect(await screen.findByRole('heading', { name: 'Player 1' })).toBeTruthy()
    fireEvent.keyDown(rail, { key: 'j' })
    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
    fireEvent.click(within(rail).getByRole('radio', { name: 'QB' }))
    expect(await screen.findByRole('heading', { name: 'Player 0' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Under pressure' })).toBeTruthy()
    fireEvent.change(within(rail).getByRole('combobox', { name: 'Rank by' }), {
      target: { value: 'qb_epa_db' }
    })
    await waitFor(() =>
      expect(queries().at(-1)).toMatchObject({
        metrics: ['qb_epa_db'],
        scope: { positions: ['QB'] }
      })
    )
  })

  it('scrolls the rail to the player shown once his row is listed', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      // The dashboard opens on him before the rail has loaded.
      await openPlayers()
      await waitFor(() => expect(scroll).toHaveBeenCalled())
      expect(scroll.mock.contexts.at(-1)).toHaveProperty(
        'textContent',
        expect.stringContaining('Player 1')
      )
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('logs his games with the results, and splits them', async () => {
    await openPlayers()
    tab('Game log')
    const log = await screen.findByRole('table')
    expect(within(log).getByText('W 27–20')).toBeTruthy()
    expect(within(log).getByText('@ LAR')).toBeTruthy()
    expect(within(log).getByText('L 10–30')).toBeTruthy()
    // Weeks 4–6: SEA has no game in this schedule.
    expect(within(log).getAllByText('Bye').length).toBe(3)
    tab('Splits')
    expect(await screen.findByText('By situation')).toBeTruthy()
    expect(screen.getByText('1st quarter')).toBeTruthy()
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('By opponent')).toBeTruthy()
    const home = queries().find((q) => q.scope.home === true)!
    expect(home.scope.positions).toEqual(['RB'])
  })

  it('opens the position picked last in the rail, whichever answers first', async () => {
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    stats.query.mockImplementation(async (q) => {
      if (q.scope.positions?.[0] === 'DB') await gate
      return answer(q)
    })
    await openPlayers()
    const rail = screen.getByRole('complementary', { name: 'Players' })
    fireEvent.click(within(rail).getByRole('radio', { name: 'DB' }))
    fireEvent.click(within(rail).getByRole('radio', { name: 'QB' }))
    expect(await screen.findByRole('tab', { name: 'Passing' })).toBeTruthy()
    // DB's late answer does not take over.
    await act(async () => {
      release()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(screen.getByRole('tab', { name: 'Passing' })).toBeTruthy()
  })

  it('lists teammates from the team he played for that season, not his team now', async () => {
    stats.player.mockImplementation(async ({ player }) =>
      bio(player, player === 'p1' ? { position: 'RB', status: null, team: 'BUF' } : {})
    )
    await openPlayers()
    tab('Splits')
    await screen.findByText('By situation')
    const mates = (): StatsQuery[] => queries().filter((q) => q.limit === 30 && q.scope.teams)
    await waitFor(() => expect(mates().length).toBeGreaterThan(0))
    expect(mates().map((q) => q.scope.teams)).toEqual(mates().map(() => ['SEA']))
  })

  it('says he is not in the league’s player list only once the list has answered', async () => {
    const pending: ((link: null) => void)[] = []
    stats.link.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
    await openPlayers()
    tab('Forecast')
    expect(await screen.findByText('Range of outcomes')).toBeTruthy()
    expect(screen.queryByText('Not in your league’s player list.')).toBeNull()
    act(() => pending.forEach((resolve) => resolve(null)))
    expect(await screen.findByText('Not in your league’s player list.')).toBeTruthy()
  })

  it('forecasts: next game, range, role, running hot, weighted rates', async () => {
    await openPlayers()
    tab('Forecast')
    expect(await screen.findByText('@ ARI')).toBeTruthy()
    expect(screen.getByText('ARI’s defense')).toBeTruthy()
    expect(screen.getByText('24.2')).toBeTruthy()
    expect(screen.getByText('Rising')).toBeTruthy()
    expect(screen.getByText('Running hot: expect it to fall by about 14.0.')).toBeTruthy()
    expect(stats.outlook).toHaveBeenCalledWith({ player: 'p1', season: 2026, scoring: 'league' })
    await waitFor(() => expect(queries().some((q) => q.transform === 'shrunk')).toBe(true))
  })

  it('profiles him: bio, combine, career by season', async () => {
    await openPlayers()
    tab('Profile')
    expect(await screen.findByText('Ohio State')).toBeTruthy()
    expect(await screen.findByText('Career by season')).toBeTruthy()
    expect(await screen.findByText('2026 SEA')).toBeTruthy()
    const career = queries().find((q) => q.groupBy?.includes('season'))!
    expect(career.scope).toEqual({ seasons: [2025, 2026], seasonType: 'REG', players: ['p1'] })
  })

  it('tags an injury, opens his team, and lists his position’s leaderboard', async () => {
    stats.player.mockImplementation(async ({ player }) =>
      bio(player, {
        position: 'RB',
        status: {
          season: 2026,
          week: 7,
          reserve: null,
          report: 'Questionable',
          practice: 'Limited',
          injury: 'Ankle'
        }
      })
    )
    await openPlayers()
    expect(screen.getByTitle('Questionable · Ankle (week 7 report)').textContent).toBe('Q')
    fireEvent.click(screen.getByRole('button', { name: 'Player leaderboards →' }))
    expect(
      await screen.findByRole('heading', { name: '2026 running back leaderboard' })
    ).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'RB', selected: true })).toBeTruthy()
    // A player row opens his dashboard.
    fireEvent.click(await screen.findByText('Player 2'))
    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'SEA' }))
    expect(await screen.findByText('Seattle Seahawks', { exact: false })).toBeTruthy()
  })

  it('opens a player from a home board’s row and from the team dashboard', async () => {
    render(<Harness hasLeague />)
    const qb = await screen.findAllByText('Player 0')
    fireEvent.click(qb[0])
    expect(await screen.findByRole('heading', { name: 'Player 0' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Passing' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Teams' }))
    fireEvent.click((await screen.findAllByTitle('Open Player 2’s dashboard'))[0])
    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
  })

  it('opens what Fantasy asks, and his Fantasy file from the owner chip', async () => {
    stats.link.mockResolvedValue({ sleeper: '9999', gsis: 'p2', team: null })
    const open = vi.fn()
    render(
      <Harness
        hasLeague
        focus={{ kind: 'player', id: 'p2', nonce: 1 }}
        onOpenFantasyPlayer={open}
      />
    )
    // His position comes from his bio: a WR.
    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'vs Coverage' })).toBeTruthy()
    const chip = await screen.findByRole('button', { name: /Free agent in your league/ })
    expect(screen.getByText(/Free agent in your league/, { selector: 'button' })).toBe(chip)
    await waitFor(() => expect((chip as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(chip)
    expect(stats.link).toHaveBeenCalledWith({ gsis: 'p2' })
    expect(open).toHaveBeenCalledWith('9999')
    // The Forecast reads his Fantasy file's projections, under the league's scoring.
    vi.mocked(api.players.detail).mockResolvedValue({
      row: { rosPoints: 151.25, rosRank: 9, expert: { ecrPosRank: 7 } },
      weeks: [{ week: 7, played: false, projected: 16.36, opponent: 'ARI' }],
      schedule: []
    } as never)
    tab('Forecast')
    expect(await screen.findByText('16.4 pts · week 7 vs ARI')).toBeTruthy()
    expect(screen.getByText('151.3 pts · WR9')).toBeTruthy()
    expect(api.players.detail).toHaveBeenCalledWith(2026, '9999')
  })

  it('keeps defenders out of Fantasy, and says what the Forecast needs without a league', async () => {
    stats.player.mockImplementation(async ({ player }) => bio(player, { position: 'CB' }))
    render(
      <Harness
        hasLeague
        focus={{ kind: 'player', id: 'p2', nonce: 1 }}
        onOpenFantasyPlayer={vi.fn()}
      />
    )
    expect(await screen.findByRole('tab', { name: 'Run defense & tackling' })).toBeTruthy()
    expect(
      // The chip's own text (a rail row's name carries my player's dot label).
      screen.queryByText(/On your fantasy team|Rostered by|Free agent in your league/, {
        selector: 'button'
      })
    ).toBeNull()
    cleanup()
    stats.ownership.mockResolvedValue(null)
    stats.player.mockImplementation(async ({ player }) => bio(player))
    render(<Harness hasLeague={false} focus={{ kind: 'player', id: 'p2', nonce: 1 }} />)
    await screen.findByRole('heading', { name: 'Player 2' })
    tab('Forecast')
    expect(
      await screen.findByText('Import a league for Sleeper’s projection and FantasyPros’ rank.')
    ).toBeTruthy()
  })

  it('opens a defense’s team, and shows no Fantasy chip without a league', async () => {
    stats.games.mockResolvedValue(GAMES)
    render(<Harness hasLeague={false} focus={{ kind: 'team', team: 'LA', nonce: 1 }} />)
    expect(await screen.findByRole('heading', { name: 'LAR' })).toBeTruthy()
    cleanup()
    stats.ownership.mockResolvedValue(null)
    render(
      <Harness
        hasLeague={false}
        focus={{ kind: 'player', id: 'p1', nonce: 1 }}
        onOpenFantasyPlayer={vi.fn()}
      />
    )
    expect(await screen.findByRole('heading', { name: 'Player 1' })).toBeTruthy()
    expect(
      // The chip's own text (a rail row's name carries my player's dot label).
      screen.queryByText(/On your fantasy team|Rostered by|Free agent in your league/, {
        selector: 'button'
      })
    ).toBeNull()
    expect(stats.link).not.toHaveBeenCalled()
  })
})
