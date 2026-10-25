// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { StatsApp } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import type { StatsOwnership, StatsQuery } from '@shared/stats/types'
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

const OWNERSHIP: StatsOwnership = { players: { p1: { name: 'Me', mine: true } }, teams: {} }

/** Elo, wins and losses: KC first in Elo, BUF and MIA close together. */
const TEAMS: Record<string, [number, number, number]> = {
  BUF: [1650, 5, 1],
  MIA: [1630, 3, 3],
  NE: [1500, 2, 4],
  KC: [1700, 6, 0]
}
/** Seasons each player has rows in (p2 a rookie), and p1's teams by season. */
const SEASONS: Record<string, number[]> = {
  p0: [2025, 2026],
  p1: [2025, 2026],
  p2: [2026],
  p3: [2025, 2026]
}
const P1_TEAMS: Record<number, string> = { 2025: 'NYJ', 2026: 'BUF' }

function answer(q: StatsQuery): ReturnType<typeof result> {
  const by = q.groupBy ?? []
  if (q.entity === 'team') {
    const teams = q.scope.teams ?? Object.keys(TEAMS)
    const rows = teams.flatMap((t) => {
      const [elo, w, l] = TEAMS[t] ?? [1500, 3, 3]
      const values = Object.fromEntries(
        q.metrics.map((m) => [
          m,
          value(m === 'elo' ? elo : m === 'wins' ? w : m === 'losses' ? l : elo / 10000)
        ])
      )
      const groups = by.includes('week') ? [1, 2, 3].map((week) => ({ week })) : [{}]
      return groups.map((group) => ({ ...row(t, t, values, { team: t, position: null }), group }))
    })
    return result(q.metrics, rows)
  }
  // My top scorer: p1, a RB on Buffalo.
  if (q.scope.players && q.limit === 1)
    return result(q.metrics, [
      row('p1', 'Player One', { fantasy_points: value(200) }, { position: 'RB', team: 'BUF' })
    ])
  const position = q.scope.positions?.[0] ?? 'RB'
  const ids = q.scope.players ?? ['p0', 'p1', 'p2', 'p3']
  const rows = ids.flatMap((id) => {
    const i = Number(id.slice(1))
    const values = Object.fromEntries(
      q.metrics.map((m) => [m, value(100 - i * 10, { qualified: i < 3, sample: 40 })])
    )
    const name = ['Player Zero', 'Player One', 'Player Two', 'Player Three'][i]
    const base = row(id, name, values, { position, team: 'BUF' })
    if (by.includes('season')) {
      return SEASONS[id].map((season) => ({
        ...base,
        team: id === 'p1' ? P1_TEAMS[season] : 'BUF',
        group: {
          season,
          ...(by.includes('team') ? { team: id === 'p1' ? P1_TEAMS[season] : 'BUF' } : {})
        }
      }))
    }
    if (by.includes('week')) return [1, 2, 3].map((week) => ({ ...base, group: { week } }))
    if (by.length) return []
    return [base]
  })
  return result(q.metrics, rows)
}

const IDLE: UpdateState = { status: 'idle' } as UpdateState

function Harness(): React.JSX.Element {
  const [scope, setScope] = useState<StatsScope | null>(null)
  return (
    <StatsApp
      hasLeague
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.34.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
      scope={scope}
      onScope={setScope}
    />
  )
}

async function open(item: string): Promise<void> {
  render(<Harness />)
  await waitFor(() => expect(stats.catalogue).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: item }))
}

const swaps = async (what = 'player'): Promise<string[]> => {
  await waitFor(() =>
    expect(screen.getAllByRole('combobox', { name: `Swap ${what}` }).length).toBeGreaterThan(0)
  )
  return screen
    .getAllByRole('combobox', { name: `Swap ${what}` })
    .map((s) => (s as HTMLSelectElement).value)
}

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.games.mockResolvedValue([])
  stats.outlook.mockRejectedValue(new Error('no outlook'))
  stats.player.mockImplementation(async ({ player }) =>
    bio(player, { position: 'RB', status: null, birthDate: '2000-03-01' })
  )
  stats.link.mockResolvedValue(null)
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
})
afterEach(cleanup)

/** Explore › Compare. */
async function openCompare(): Promise<void> {
  await open('Explore')
  fireEvent.click(await screen.findByRole('tab', { name: 'Compare' }))
}

describe('Explore: Compare and Trends (stats-analysis spec §9.5)', () => {
  it('sits between Teams and Games: Chart first, then Compare and Trends', async () => {
    await open('Explore')
    const nav = screen.getByRole('navigation')
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(expect.arrayContaining(['Teams', 'Explore', 'Games']))
    const tabs = within(screen.getByRole('tablist', { name: 'Explore' })).getAllByRole('tab')
    expect(tabs.map((t) => [t.textContent, (t as HTMLButtonElement).disabled])).toEqual([
      ['Chart', false],
      ['Compare', false],
      ['Trends', false]
    ])
    expect(screen.getByRole('tab', { name: 'Chart', selected: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Compare' }))
    expect(await screen.findByRole('heading', { name: 'Head to head' })).toBeTruthy()
  })

  it('compares the position’s top three, leads rows, removes and adds a player', async () => {
    await openCompare()
    fireEvent.click(await screen.findByRole('radio', { name: 'WR' }))
    expect(await swaps()).toEqual(['p0', 'p1', 'p2'])
    // p0 has the best value in every row with a better side.
    expect((await screen.findAllByText(/^Leads \d+ of \d+$/))[0].textContent).toMatch(
      /^Leads [1-9]/
    )
    const query = stats.query.mock.calls
      .map((c) => c[0])
      .find((q) => q.scope.positions?.[0] === 'WR' && !q.groupBy && q.limit === 5000)
    // The whole position (a rank is among it), counts per game.
    expect(query).toMatchObject({ transform: 'perGame' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from comparison' })[2])
    expect(await screen.findByText('Add a third player…')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Add a player' }), {
      target: { value: 'p3' }
    })
    expect(await swaps()).toEqual(['p0', 'p1', 'p3'])
    // The weekly chart with the median of the position's qualified players.
    expect(await screen.findByRole('img', { name: 'Fantasy points by week' })).toBeTruthy()
    expect(screen.getByText('Median qualified WR')).toBeTruthy()
  })

  it('compares teams: the top three by Elo, their record, division place and Elo', async () => {
    await openCompare()
    fireEvent.click(await screen.findByRole('radio', { name: 'Teams' }))
    expect(await swaps('team')).toEqual(['KC', 'BUF', 'MIA'])
    expect(screen.getByText('1,650')).toBeTruthy()
    expect(screen.getByText('5–1')).toBeTruthy()
    expect(screen.getByText('2nd in the AFC East')).toBeTruthy()
    // A team's FG over expected is its total, not per game.
    expect(document.querySelector('[data-metric="team_fgoe"]')!.textContent).not.toContain(
      'per game'
    )
    // The defense chart runs upside down: lower EPA allowed is better.
    fireEvent.click(screen.getByRole('radio', { name: 'Defense' }))
    expect(await screen.findByText('Flipped so up is better · gaps are byes')).toBeTruthy()
  })

  it('a player dashboard’s Compare seeds him with his position’s top two', async () => {
    await open('Players')
    await screen.findByRole('tablist', { name: 'Player dashboard' })
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))
    expect(await swaps()).toEqual(['p1', 'p0', 'p2'])
    expect(screen.getByRole('radio', { name: 'RB', checked: true })).toBeTruthy()
  })

  it('a team dashboard’s Compare seeds the team and the two nearest it in Elo', async () => {
    await open('Teams')
    fireEvent.click(await screen.findByRole('button', { name: 'Compare' }))
    expect(await swaps('team')).toEqual(['BUF', 'MIA', 'KC'])
  })

  it('a stat line’s trend icon opens Trends on that metric, his teams under the seasons', async () => {
    await open('Players')
    await screen.findByRole('tablist', { name: 'Player dashboard' })
    const icons = await screen.findAllByRole('button', { name: / by season$/ })
    const metric = icons[0].closest('[data-metric]')!.getAttribute('data-metric')!.slice(4)
    fireEvent.click(icons[0])
    expect(await screen.findByRole('tab', { name: 'Trends', selected: true })).toBeTruthy()
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Metric' }) as HTMLSelectElement).value).toBe(
        metric
      )
    )
    expect(await screen.findByRole('heading', { name: 'Player One' })).toBeTruthy()
    expect(screen.getByText('NYJ 2025, BUF since 2026')).toBeTruthy()
    // The table, newest first; the first season has no change before it.
    const seasons = screen.getAllByText(/^202[56]$/, { selector: 'span' }).map((s) => s.textContent)
    expect(seasons.slice(-2)).toEqual(['2026', '2025'])
    expect(screen.getByRole('heading', { name: 'Career at a glance' })).toBeTruthy()
  })

  it('says a one-season player’s trends need two seasons', async () => {
    await open('Explore')
    fireEvent.click(await screen.findByRole('tab', { name: 'Trends' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'WR' }))
    const search = await screen.findByRole('combobox', { name: 'Find a WR' })
    await waitFor(() =>
      expect(document.querySelectorAll('datalist option').length).toBeGreaterThan(0)
    )
    fireEvent.change(search, { target: { value: 'Player Two · BUF' } })
    expect(await screen.findByText('Trends need two seasons; he has one.')).toBeTruthy()
  })

  it('follows the dashboard’s player until a choice here, then keeps it', async () => {
    await open('Players')
    await screen.findByRole('tablist', { name: 'Player dashboard' })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Trends' }))
    // Player One (RB) from the dashboard; a new metric keeps him.
    expect(await screen.findByRole('heading', { name: 'Player One' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Metric' }), {
      target: { value: 'rush_ypc' }
    })
    expect(await screen.findByRole('heading', { name: 'Player One' })).toBeTruthy()
    // Another position leaves him: a search picks the next one.
    fireEvent.click(screen.getByRole('radio', { name: 'WR' }))
    expect(await screen.findByText('Find a WR to see his seasons.')).toBeTruthy()
  })
})

/** A WR chart query (the whole position), or the 32 teams'; no grouping. Other TEs: `answer`. */
const isChart = (q: StatsQuery): boolean =>
  !q.groupBy &&
  ((q.entity === 'player' && q.limit === 5000 && q.scope.positions?.[0] === 'WR') ||
    (q.entity === 'team' && q.limit === 40))

/** Twelve WRs (w0 … w11), targets and YPRR rising together; p1 is mine. Twelve teams. */
function chartAnswer(q: StatsQuery): ReturnType<typeof result> {
  if (q.entity === 'team') {
    const teams = [
      'ARI',
      'ATL',
      'BAL',
      'BUF',
      'CAR',
      'CHI',
      'CIN',
      'CLE',
      'DAL',
      'DEN',
      'DET',
      'GB'
    ]
    return result(
      q.metrics,
      teams.map((t, i) =>
        row(t, t, Object.fromEntries(q.metrics.map((m) => [m, value(i / 100)])), {
          team: t,
          position: null
        })
      )
    )
  }
  const ids = ['p1', ...Array.from({ length: 11 }, (_, i) => `w${i}`)]
  return result(
    q.metrics,
    ids.map((id, i) =>
      row(
        id,
        id === 'p1' ? 'Player One' : `Receiver ${String.fromCharCode(65 + i)}`,
        Object.fromEntries(q.metrics.map((m) => [m, value(i + 1, { sample: 50 })])),
        { position: 'WR', team: 'BUF' }
      )
    )
  )
}

describe('Explore: the chart explorer (stats-analysis spec §9.5)', () => {
  beforeEach(() => {
    stats.query.mockImplementation(async (q) => (isChart(q) ? chartAnswer(q) : answer(q)))
  })

  it('opens on a WR’s volume against his efficiency, my player ringed and labelled', async () => {
    await open('Explore')
    expect(
      await screen.findByRole('heading', { name: 'Yards per route run vs targets' })
    ).toBeTruthy()
    await waitFor(() => expect(document.querySelectorAll('[data-dot]')).toHaveLength(12))
    const query = stats.query.mock.calls.map((c) => c[0]).find(isChart)!
    expect(query).toMatchObject({ transform: 'perGame', scope: { positions: ['WR'] } })
    expect(screen.getByRole('button', { name: 'Volume vs efficiency', pressed: true })).toBeTruthy()
    // Mine paints last, its label among the first.
    expect(document.querySelectorAll('[data-dot]')[11].getAttribute('data-dot')).toBe('p1')
    expect(screen.getByText('P. One', { selector: 'text' })).toBeTruthy()
    expect(screen.getByText('+1.00')).toBeTruthy()
    // An axis by hand leaves the preset.
    fireEvent.change(screen.getByRole('combobox', { name: 'Y axis' }), {
      target: { value: 'air_yards_share' }
    })
    expect(await screen.findByRole('heading', { name: 'Air-yards share vs targets' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Targets vs air yards', pressed: true })).toBeTruthy()
  })

  it('opens a dot’s dashboard; shift-clicks two and compares them', async () => {
    await open('Explore')
    await waitFor(() => expect(document.querySelectorAll('[data-dot]')).toHaveLength(12))
    const dot = (id: string): Element => document.querySelector(`[data-dot="${id}"]`)!
    fireEvent.click(dot('w4'), { shiftKey: true })
    fireEvent.click(dot('w2'), { shiftKey: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Compare these →' }))
    expect(await screen.findByRole('tab', { name: 'Compare', selected: true })).toBeTruthy()
    expect(await swaps()).toEqual(['w4', 'w2'])
    expect(screen.getByText('Add a third player…')).toBeTruthy()
    // Back on Chart, the picks are kept; a plain click opens the dashboard.
    fireEvent.click(screen.getByRole('tab', { name: 'Chart' }))
    await waitFor(() => expect(document.querySelectorAll('[data-dot]')).toHaveLength(12))
    fireEvent.click(dot('w4'))
    expect(await screen.findByRole('tablist', { name: 'Player dashboard' })).toBeTruthy()
  })

  it('charts the teams, every one labelled', async () => {
    await open('Explore')
    fireEvent.click(await screen.findByRole('radio', { name: 'Teams' }))
    expect(
      await screen.findByRole('heading', { name: 'EPA per play allowed vs EPA per play' })
    ).toBeTruthy()
    await waitFor(() => expect(document.querySelectorAll('[data-dot]')).toHaveLength(12))
    expect(screen.getByText('Good offense, good defense')).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Per game' })).toBeNull()
  })

  it('says when too few qualify, and offers everyone', async () => {
    await open('Explore')
    fireEvent.click(await screen.findByRole('radio', { name: 'TE' }))
    // A TE's chart query reaches the fixture's four players, three of them qualified.
    expect(await screen.findByText('Too few qualifiers to chart')).toBeTruthy()
    expect(screen.getByText(/^3 TEs qualify on both axes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show all 4 TEs' }))
    expect(await screen.findByText('Too few qualifiers to chart')).toBeTruthy()
  })

  it('says when an axis is not published for the season, and offers the one before', async () => {
    stats.query.mockImplementation(async (q) => {
      const r = isChart(q) ? chartAnswer(q) : answer(q)
      return {
        ...r,
        columns: r.columns.map((c) => (c.id === 'off_pressure_rate' ? { ...c, seasons: [] } : c))
      }
    })
    await open('Explore')
    fireEvent.click(await screen.findByRole('radio', { name: 'Teams' }))
    await screen.findByRole('heading', { name: 'EPA per play allowed vs EPA per play' })
    fireEvent.change(screen.getByRole('combobox', { name: 'X axis' }), {
      target: { value: 'off_pressure_rate' }
    })
    expect(await screen.findByText('Pressure rate is not published for 2026 yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use 2025' }))
    await waitFor(() =>
      expect(
        stats.query.mock.calls.some((c) => isChart(c[0]) && c[0].scope.seasons[0] === 2025)
      ).toBe(true)
    )
  })
})
