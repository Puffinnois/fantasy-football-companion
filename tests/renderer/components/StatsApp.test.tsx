// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { StatsApp } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import type { StatsOwnership, StatsQuery, StatsView } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'
import { catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

vi.mock('@/lib/api', () => ({
  api: {
    stats: {
      status: vi.fn(),
      catalogue: vi.fn(),
      query: vi.fn(),
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

// Radix popovers measure their content.
globalThis.ResizeObserver ??= class {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
} as unknown as typeof ResizeObserver

const OWNERSHIP: StatsOwnership = {
  players: { p1: { name: 'Cook Book', mine: true }, p2: { name: 'Rival', mine: false } },
  teams: {}
}

/** Three players per query: p0 leads, p1 is mine, p3 is below the tab's qualifying sample. */
function answer(q: StatsQuery): ReturnType<typeof result> {
  const position = q.scope.positions?.[0] ?? null
  const rows = ['p0', 'p1', 'p2', 'p3'].map((id, i) =>
    row(
      id,
      `Player ${i}`,
      Object.fromEntries(
        q.metrics.map((m) => [
          m,
          value(100 - i * 10, { percentile: 90 - i * 30, qualified: i < 3 })
        ])
      ),
      { position, team: position ? 'SEA' : null }
    )
  )
  return result(q.metrics, rows)
}

const IDLE: UpdateState = { status: 'idle' } as UpdateState

/** App keeps the scope across product switches; here a harness does. */
function Harness({ hasLeague }: { hasLeague: boolean }): React.JSX.Element {
  const [scope, setScope] = useState<StatsScope | null>(null)
  return (
    <StatsApp
      hasLeague={hasLeague}
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.28.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
      scope={scope}
      onScope={setScope}
    />
  )
}

function renderApp(hasLeague = true): void {
  render(<Harness hasLeague={hasLeague} />)
}

const lastQuery = (): StatsQuery => stats.query.mock.calls.at(-1)![0]

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
})
afterEach(cleanup)

describe('Companion Stats', () => {
  it('opens on the eight boards with the freshness line and my players marked', async () => {
    renderApp()
    expect(screen.getByRole('heading', { name: 'Leaderboards' })).toBeTruthy()
    expect(await screen.findByText(/^Data through 2026 week 6 · updated/)).toBeTruthy()
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
    expect(screen.getByText('Target share')).toBeTruthy()
    expect((await screen.findAllByTitle('On your fantasy team')).length).toBeGreaterThan(0)
    expect(screen.getByText(/3\+ games and position minimums to qualify/)).toBeTruthy()
    // League scoring by default.
    expect(lastQuery().scoring).toBe('league')
  })

  it('opens a board in full: its position, sorted by its metric, best first', async () => {
    renderApp()
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
    fireEvent.click(screen.getAllByRole('button', { name: 'All →' })[0])
    expect(
      await screen.findByRole('heading', { name: '2026 quarterback leaderboard' })
    ).toBeTruthy()
    await waitFor(() => expect(lastQuery().scope.positions).toEqual(['QB']))
    expect(lastQuery().sort).toEqual({ metric: 'pass_yds', dir: 'desc' })
    expect(screen.getByRole('tab', { name: 'QB', selected: true })).toBeTruthy()
  })

  it('sorts by a column, hides rows below the sample until asked, and filters my team', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'WR' }))
    await screen.findByText('Player 2')
    expect(screen.queryByText('Player 3')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Qualified only' }))
    expect(screen.getByText('Player 3')).toBeTruthy()
    expect(screen.getByTitle('Below the qualifying sample')).toBeTruthy()

    fireEvent.click(screen.getByText('YPRR'))
    await waitFor(() => expect(lastQuery().sort).toEqual({ metric: 'yprr', dir: 'desc' }))
    expect(lastQuery().metrics).toContain('target_share')

    fireEvent.change(screen.getByRole('combobox', { name: 'Fantasy rosters' }), {
      target: { value: 'mine' }
    })
    const table = screen.getByRole('table')
    expect(within(table).getByText('Player 1')).toBeTruthy()
    expect(within(table).queryByText('Player 0')).toBeNull()
  })

  it('saves a view, opens it from the home, and exports the table as CSV', async () => {
    const saved: StatsView = {
      id: 7,
      name: 'Slot guys',
      board: {
        entity: 'player',
        tab: 'WR',
        columns: ['yprr'],
        sort: { by: 'yprr', dir: 'desc' },
        perGame: false,
        qualifiedOnly: true,
        team: null,
        owner: 'all'
      },
      updatedAt: 't'
    }
    stats.saveView.mockResolvedValue(saved)
    stats.exportCsv.mockResolvedValue('/home/me/Downloads/stats.csv')
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
    await screen.findByText('Player 2')

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    await waitFor(() => expect(stats.exportCsv).toHaveBeenCalled())
    const [file, csv] = stats.exportCsv.mock.calls[0]
    expect(file).toBe('stats-2026-all-offense-weeks-1-6.csv')
    expect(csv.split('\r\n')[0]).toMatch(
      /^Rank,Player,Team,Position,gsis_id,Games,Snap share \(%\),/
    )
    expect(await screen.findByText('Saved 3 rows to /home/me/Downloads/stats.csv')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Views' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'View name' }), {
      target: { value: 'Slot guys' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stats.saveView).toHaveBeenCalled())
    expect(stats.saveView.mock.calls[0][0]).toBe('Slot guys')
    expect(stats.saveView.mock.calls[0][1]).toMatchObject({ entity: 'player', tab: 'ALL' })

    fireEvent.click(screen.getByRole('button', { name: 'Leaderboards' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Slot guys' }))
    expect(
      await screen.findByRole('heading', { name: '2026 wide receiver leaderboard' })
    ).toBeTruthy()
    await waitFor(() => expect(lastQuery().metrics).toEqual(['yprr', 'target_share']))
  })

  it('works without a league: no league scoring, no roster marks or filters', async () => {
    stats.ownership.mockResolvedValue(null)
    renderApp(false)
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
    expect(lastQuery().scoring).toBe('ppr')
    const scoring = screen.getByRole('combobox', { name: 'Fantasy scoring' })
    expect(within(scoring).queryByText('My league')).toBeNull()
    expect(screen.queryByRole('button', { name: 'My players' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
    await screen.findByText('Player 2')
    expect(screen.queryByRole('combobox', { name: 'Fantasy rosters' })).toBeNull()
  })

  it('queries again when a rebuild finished (spec §5.3)', async () => {
    renderApp()
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
    expect(stats.catalogue).toHaveBeenCalledTimes(1)
    const changed = stats.onChanged.mock.calls[0][0]
    act(() => changed())
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(16))
    expect(stats.catalogue).toHaveBeenCalledTimes(2)
  })

  it('says so when the stats database is off', async () => {
    stats.status.mockResolvedValue({
      available: false,
      through: null,
      updatedAt: null,
      busy: false
    })
    renderApp()
    expect(
      await screen.findByText('The stats database could not be opened on this computer.')
    ).toBeTruthy()
    expect(screen.getByText('Stats unavailable')).toBeTruthy()
  })
})
