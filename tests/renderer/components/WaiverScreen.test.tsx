// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { WaiverScreen } from '@/screens/WaiverScreen'
import { api } from '@/lib/api'
import type { PlayersOptions } from '@shared/types'
import { addOption, addRow, waiverAdds } from '../../fixtures/waiver'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    waiver: { adds: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const addsMock = vi.mocked(api.waiver.adds)

const options: PlayersOptions = {
  seasons: [2026],
  currentWeek: 3,
  lastScoredWeek: 2,
  tabs: [],
  projectionWeeks: []
}

beforeEach(() => {
  optionsMock.mockReset()
  addsMock.mockReset()
  optionsMock.mockResolvedValue(options)
  addsMock.mockResolvedValue(waiverAdds())
})
afterEach(cleanup)

describe('WaiverScreen', () => {
  it('shows the window, my waiver priority and the lineup adds', async () => {
    render(<WaiverScreen dataVersion={0} />)
    expect(await screen.findByText('weeks 3–17 · 15 weeks')).toBeTruthy()
    expect(addsMock).toHaveBeenCalledWith(2026)
    expect(screen.getByText('Waiver priority 12 of 16')).toBeTruthy()
    expect(screen.getByText('Tyler Allgeier')).toBeTruthy()
    expect(screen.getByText('+0.40/wk')).toBeTruthy()
    expect(screen.getByText('wk 7, 9')).toBeTruthy()
  })

  it('switches a row to another release and shows its numbers', async () => {
    addsMock.mockResolvedValue(
      waiverAdds({
        lineup: [
          addRow({
            options: [
              addOption(),
              addOption({
                release: { kind: 'open' },
                releasePlayer: null,
                delta: -3,
                deltaPerWeek: -0.2,
                startWeeks: [7]
              })
            ]
          })
        ]
      })
    )
    render(<WaiverScreen dataVersion={0} />)
    const select = (await screen.findByLabelText('Release for Tyler Allgeier')) as HTMLSelectElement
    expect(select.value).toBe('0')
    fireEvent.change(select, { target: { value: '1' } })
    expect(screen.getByText('-0.20/wk')).toBeTruthy()
    expect(screen.getByText('wk 7')).toBeTruthy()
  })

  it('sorts the stash by trending on request and tags free releases', async () => {
    render(<WaiverScreen dataVersion={0} />)
    await screen.findByText('Jaylen Wright')
    const names = (): string[] =>
      screen
        .getAllByTestId('stash-row')
        .map((row) => within(row).getAllByRole('button')[0].textContent ?? '')
    expect(names()).toEqual(['Jaylen Wright', 'Tre Harris'])
    fireEvent.click(screen.getByRole('button', { name: 'Trending 24 h' }))
    expect(names()).toEqual(['Tre Harris', 'Jaylen Wright'])
    expect(screen.getAllByText('free')).toHaveLength(2)
    expect(screen.getByText('Trending adds unavailable — refresh to fetch them')).toBeTruthy()
  })

  it('explains empty lists', async () => {
    addsMock.mockResolvedValue(waiverAdds({ lineup: [], stash: [] }))
    render(<WaiverScreen dataVersion={0} />)
    expect(
      await screen.findByText('No free agent improves your lineup over the rest of the season.')
    ).toBeTruthy()
    expect(
      screen.getByText('No free agent carries a market, trending or expert signal.')
    ).toBeTruthy()
  })

  it('shows the engine error', async () => {
    addsMock.mockRejectedValue(new Error('No projections stored for this season'))
    render(<WaiverScreen dataVersion={0} />)
    expect(await screen.findByText('No projections stored for this season')).toBeTruthy()
  })
})
