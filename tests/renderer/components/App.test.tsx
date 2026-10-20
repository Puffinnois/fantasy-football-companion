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
vi.mock('@/screens/stats/StatsApp', () => ({
  StatsApp: ({ onOpenFantasy }: { onOpenFantasy: () => void }) => (
    <button type="button" onClick={onOpenFantasy}>
      Stats product
    </button>
  )
}))
vi.mock('@/components/TopNav', () => ({
  TopNav: ({ current, onOpenStats }: { current: string; onOpenStats: () => void }) => (
    <button type="button" onClick={onOpenStats}>
      Fantasy nav on {current}
    </button>
  )
}))
vi.mock('@/screens/SetupScreen', () => ({ SetupScreen: () => <div>Setup screen</div> }))
vi.mock('@/screens/LeagueScreen', () => ({ LeagueScreen: () => <div>League screen</div> }))
vi.mock('@/components/UpdateDialog', () => ({ UpdateDialog: () => null }))

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
})
