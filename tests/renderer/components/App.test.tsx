// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '@/App'
import { api } from '@/lib/api'
import type { League } from '@shared/types'

vi.mock('@/lib/api', () => ({
  api: {
    app: { version: vi.fn() },
    league: { get: vi.fn() },
    sync: { onProgress: vi.fn() }
  }
}))
vi.mock('@/lib/useUpdateState', () => ({ useUpdateState: () => ({ status: 'idle' }) }))
// The products' screens are tested on their own; here only which one shows.
vi.mock('@/screens/stats/StatsApp', async () => {
  const { useEffect, useState } = await import('react')
  type Focus =
    | { kind: 'player'; id: string; nonce: number }
    | { kind: 'team'; team: string; nonce: number }
    | {
        kind: 'location'
        location: { screen: string; team: string | null; player: { id: string } | null }
        nonce: number
      }
  // Its page as StatsApp reports it for Back (N-002): from the focus, or the Glossary button.
  const pageOf = (f: Focus | null): string =>
    !f
      ? 'home'
      : f.kind === 'location'
        ? [f.location.screen, f.location.team ?? f.location.player?.id].filter(Boolean).join(' ')
        : f.kind === 'player'
          ? `player ${f.id}`
          : `team ${f.team}`
  const StatsApp = ({
    onOpenFantasy,
    scope,
    onScope,
    focus,
    onOpenFantasyPlayer,
    onLocation,
    canGoBack,
    onBack
  }: {
    onOpenFantasy: () => void
    scope: { season: number } | null
    onScope: (s: unknown) => void
    focus: Focus | null
    onOpenFantasyPlayer: (id: string) => void
    onLocation: (l: unknown) => void
    canGoBack: boolean
    onBack: () => void
  }): React.JSX.Element => {
    const [page, setPage] = useState(() => pageOf(focus))
    const [seen, setSeen] = useState(focus?.nonce ?? 0)
    if (focus && focus.nonce !== seen) {
      setSeen(focus.nonce)
      setPage(pageOf(focus))
    }
    useEffect(() => {
      const [screen, id] = page.split(' ')
      onLocation({
        product: 'stats',
        screen,
        team: screen === 'team' ? id : null,
        player: screen === 'player' ? { id, position: null } : null
      })
    }, [page, onLocation])
    return (
      <>
        <span>Stats on {page}</span>
        <button type="button" disabled={!canGoBack} onClick={onBack}>
          Stats back
        </button>
        <button type="button" onClick={() => setPage('glossary')}>
          Stats glossary
        </button>
        <button type="button" onClick={onOpenFantasy}>
          Stats product
        </button>
        <button type="button" onClick={() => onScope({ season: 2023 })}>
          Season {scope?.season ?? 'default'}
        </button>
        <span>
          Stats focus:{' '}
          {focus && focus.kind !== 'location'
            ? `${focus.kind} ${focus.kind === 'player' ? focus.id : focus.team}`
            : 'none'}
        </span>
        <button type="button" onClick={() => onOpenFantasyPlayer('7564')}>
          Open his file
        </button>
      </>
    )
  }
  return { StatsApp }
})
vi.mock('@/components/TopNav', () => ({
  TopNav: ({
    current,
    onOpenStats,
    canGoBack,
    onBack
  }: {
    current: string
    onOpenStats: () => void
    canGoBack: boolean
    onBack: () => void
  }) => (
    <>
      <button type="button" onClick={onOpenStats}>
        Fantasy nav on {current}
      </button>
      <button type="button" disabled={!canGoBack} onClick={onBack}>
        Fantasy back
      </button>
    </>
  )
}))
vi.mock('@/screens/SetupScreen', () => ({ SetupScreen: () => <div>Setup screen</div> }))
vi.mock('@/screens/LeagueScreen', async () => {
  const { useProductLinks } = await import('@/lib/productLinks')
  return {
    // A player file's "Full stats ↗" as the screens' panels call it.
    LeagueScreen: () => {
      const links = useProductLinks()
      return (
        <>
          <div>League screen</div>
          <button
            type="button"
            onClick={() => links?.openStats({ sleeper: '7564', gsis: '00-0036900', team: null })}
          >
            Full stats of Chase
          </button>
          <button
            type="button"
            onClick={() => links?.openStats({ sleeper: 'LAR', gsis: null, team: 'LA' })}
          >
            Full stats of the Rams
          </button>
        </>
      )
    }
  }
})
vi.mock('@/screens/TradeScreen', () => ({ TradeScreen: () => <div>Trade screen</div> }))
vi.mock('@/screens/PlayersScreen', () => ({
  PlayersScreen: ({
    focus,
    onFile
  }: {
    focus: { playerId: string } | null
    onFile: (id: string | null) => void
  }) => (
    <>
      <div>Players screen on {focus?.playerId ?? 'nobody'}</div>
      <button type="button" onClick={() => onFile('4984')}>
        Open Allen’s file
      </button>
      <button type="button" onClick={() => onFile(null)}>
        Close the file
      </button>
    </>
  )
}))
vi.mock('@/components/UpdateDialog', () => ({ UpdateDialog: () => null }))
// Dev mode is tested on its own; here only App's "Go there" (dev-mode spec §6).
vi.mock('@/components/dev/DevTools', () => {
  const where = (product: string, screen: string, parts: Record<string, unknown>): unknown => ({
    product,
    screen,
    parts: Object.fromEntries(Object.entries(parts).map(([k, data]) => [k, { label: k, data }]))
  })
  return {
    DevTools: ({ children, onGo }: { children: React.ReactNode; onGo: (c: unknown) => void }) => (
      <>
        {children}
        <button type="button" onClick={() => onGo(where('fantasy', 'trade', {}))}>
          Go to Trade
        </button>
        <button
          type="button"
          onClick={() => onGo(where('fantasy', 'lineup', { player: { playerId: '7564' } }))}
        >
          Go to a player file
        </button>
        <button
          type="button"
          onClick={() => onGo(where('stats', 'player', { player: { id: '00-0036900' } }))}
        >
          Go to a Stats player
        </button>
      </>
    )
  }
})

const LEAGUE: League = {
  leagueId: 'L1',
  name: 'Emoney',
  season: '2026',
  status: 'in_season',
  totalRosters: 12,
  syncedAt: null
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.app.version).mockResolvedValue('0.28.0')
  vi.mocked(api.sync.onProgress).mockReturnValue(() => {})
})
afterEach(cleanup)

describe('App: two products (stats-analysis spec §9.1)', () => {
  it('opens on Stats without a league, and Fantasy then opens on Setup', async () => {
    vi.mocked(api.league.get).mockResolvedValue(null)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Stats product' }))
    expect(screen.getByText('Setup screen')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fantasy nav on setup' })).toBeTruthy()
  })

  it('opens on Fantasy with a league, and Stats ↗ switches product', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    expect(await screen.findByText('League screen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fantasy nav on league' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Stats product' }))
    // Back to the last Fantasy screen.
    expect(screen.getByText('League screen')).toBeTruthy()
  })

  it('keeps the Stats scope for the session (spec §18 J, review fix)', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Fantasy nav on league' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Season default' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stats product' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Fantasy nav on league' }))
    expect(await screen.findByRole('button', { name: 'Season 2023' })).toBeTruthy()
  })

  it('opens each product on the other’s player (spec §9.4)', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Full stats of Chase' }))
    expect(await screen.findByText('Stats focus: player 00-0036900')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open his file' }))
    expect(await screen.findByText('Players screen on 7564')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fantasy nav on players' }))
    // Stats ↗ from the nav opens Stats without a focus.
    expect(await screen.findByText('Stats focus: none')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stats product' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Fantasy nav on players' }))
    expect(screen.queryByText('League screen')).toBeNull()
  })

  it('opens a defense’s team dashboard', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Full stats of the Rams' }))
    expect(await screen.findByText('Stats focus: team LA')).toBeTruthy()
  })

  it('goes where a dev note was written (dev-mode spec §6)', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    expect(await screen.findByText('League screen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Trade' }))
    expect(screen.getByText('Trade screen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go to a player file' }))
    expect(screen.getByText('Players screen on 7564')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go to a Stats player' }))
    expect(screen.getByText('Stats focus: player 00-0036900')).toBeTruthy()
  })
})

describe('App: Back (N-002)', () => {
  const back = (name: 'Fantasy back' | 'Stats back'): void => {
    const button = screen.getByRole('button', { name })
    expect(button).toHaveProperty('disabled', false)
    fireEvent.click(button)
  }

  it('goes back through Fantasy screens, reopening a player file', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    expect(await screen.findByText('League screen')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fantasy back' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Go to a player file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to Trade' }))
    expect(screen.getByText('Trade screen')).toBeTruthy()
    back('Fantasy back')
    expect(await screen.findByText('Players screen on 7564')).toBeTruthy()
    back('Fantasy back')
    expect(await screen.findByText('League screen')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fantasy back' })).toHaveProperty('disabled', true)
  })

  it('goes back across the products: a Stats page, then the Fantasy screen before it', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Full stats of Chase' }))
    expect(await screen.findByText('Stats on player 00-0036900')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stats glossary' }))
    expect(await screen.findByText('Stats on glossary')).toBeTruthy()
    back('Stats back')
    expect(await screen.findByText('Stats on player 00-0036900')).toBeTruthy()
    back('Stats back')
    expect(await screen.findByText('League screen')).toBeTruthy()
    // And forward again by the links, then back into Stats from Fantasy.
    fireEvent.click(screen.getByRole('button', { name: 'Full stats of the Rams' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open his file' }))
    expect(await screen.findByText('Players screen on 7564')).toBeTruthy()
    back('Fantasy back')
    expect(await screen.findByText('Stats on team LA')).toBeTruthy()
  })

  it('reopens the file last open on Players, or none once it was closed', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Go to a player file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Allen’s file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to Trade' }))
    back('Fantasy back')
    expect(await screen.findByText('Players screen on 4984')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close the file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to Trade' }))
    back('Fantasy back')
    expect(await screen.findByText('Players screen on nobody')).toBeTruthy()
    back('Fantasy back')
    expect(await screen.findByText('Players screen on 4984')).toBeTruthy()
    back('Fantasy back')
    expect(await screen.findByText('Players screen on 7564')).toBeTruthy()
  })

  it('goes back with Alt+←, but not while typing', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    expect(await screen.findByText('League screen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Trade' }))
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: 'ArrowLeft', altKey: true })
    expect(screen.getByText('Trade screen')).toBeTruthy()
    input.remove()
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
    expect(await screen.findByText('League screen')).toBeTruthy()
  })
})
