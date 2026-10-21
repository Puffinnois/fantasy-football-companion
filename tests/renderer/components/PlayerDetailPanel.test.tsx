// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { api } from '@/lib/api'
import { ProductLinksContext } from '@/lib/productLinks'
import type { PlayerLink } from '@shared/stats/types'
import type { DetailTarget } from '@shared/types'

vi.mock('@/lib/api', () => ({
  api: {
    players: { detail: vi.fn(), news: vi.fn() },
    stats: { link: vi.fn() },
    watchlist: { toggle: vi.fn() }
  }
}))

const CHASE: DetailTarget = {
  playerId: '7564',
  fullName: "Ja'Marr Chase",
  position: 'WR',
  team: 'CIN',
  statsAvailable: true
}

function renderPanel(openStats: ((link: PlayerLink) => void) | null, player = CHASE): void {
  const panel = <PlayerDetailPanel season={2026} player={player} onClose={() => {}} />
  render(
    openStats ? (
      <ProductLinksContext.Provider value={{ openStats }}>{panel}</ProductLinksContext.Provider>
    ) : (
      panel
    )
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  // The file itself never loads here: only its top bar matters.
  vi.mocked(api.players.detail).mockReturnValue(new Promise(() => {}))
  vi.mocked(api.players.news).mockReturnValue(new Promise(() => {}))
})
afterEach(cleanup)

describe('the player file’s link to Companion Stats (spec §9.4)', () => {
  it('opens the player’s dashboard by his gsis id', async () => {
    const link = { sleeper: '7564', gsis: '00-0036900', team: null }
    vi.mocked(api.stats.link).mockResolvedValue(link)
    const openStats = vi.fn()
    renderPanel(openStats)
    const pill = screen.getByRole('button', { name: /Full stats ↗/ }) as HTMLButtonElement
    await waitFor(() => expect(pill.disabled).toBe(false))
    expect(api.stats.link).toHaveBeenCalledWith({ sleeper: '7564' })
    fireEvent.click(pill)
    expect(openStats).toHaveBeenCalledWith(link)
  })

  it('opens a defense’s team, and stays off for a player Stats does not know', async () => {
    vi.mocked(api.stats.link).mockResolvedValue({ sleeper: 'LAR', gsis: null, team: 'LA' })
    const openStats = vi.fn()
    renderPanel(openStats, {
      ...CHASE,
      playerId: 'LAR',
      fullName: 'Los Angeles Rams',
      position: 'DEF'
    })
    const pill = screen.getByRole('button', { name: /Full stats ↗/ }) as HTMLButtonElement
    await waitFor(() => expect(pill.disabled).toBe(false))
    fireEvent.click(pill)
    expect(openStats).toHaveBeenCalledWith({ sleeper: 'LAR', gsis: null, team: 'LA' })
    cleanup()
    vi.mocked(api.stats.link).mockResolvedValue(null)
    renderPanel(vi.fn())
    await waitFor(() => expect(api.stats.link).toHaveBeenCalledTimes(2))
    expect(
      (screen.getByRole('button', { name: /Full stats ↗/ }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('has no link outside the app', () => {
    renderPanel(null)
    expect(screen.queryByRole('button', { name: /Full stats ↗/ })).toBeNull()
    expect(api.stats.link).not.toHaveBeenCalled()
  })
})
