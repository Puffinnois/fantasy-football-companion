// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { WaiverScreen } from '@/screens/WaiverScreen'
import { api } from '@/lib/api'
import type { PlayersOptions } from '@shared/types'
import {
  addOption,
  addRow,
  allgeier,
  streamOption,
  streamRow,
  waiverAdds,
  wright
} from '../../fixtures/waiver'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    waiver: { adds: vi.fn(), stream: vi.fn() },
    league: { get: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const addsMock = vi.mocked(api.waiver.adds)
const streamMock = vi.mocked(api.waiver.stream)
const leagueMock = vi.mocked(api.league.get)

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
  leagueMock.mockResolvedValue(null)
  addsMock.mockResolvedValue(waiverAdds())
  streamMock.mockReset()
  streamMock.mockResolvedValue([
    streamRow(),
    streamRow({
      player: wright,
      opponent: 'vs NO',
      options: [
        streamOption({ weekGain: 5, restCost: 3, net: 2 }),
        streamOption({
          release: { kind: 'drop', playerId: allgeier.playerId },
          releasePlayer: allgeier,
          weekGain: 4,
          restCost: 3.5,
          net: 0.5
        })
      ]
    })
  ])
})
afterEach(cleanup)

describe('WaiverScreen', () => {
  it('shows the window, my waiver claim, the best add and the lineup adds', async () => {
    render(<WaiverScreen dataVersion={0} />)
    expect(await screen.findByText('Week 3 · 15 weeks left')).toBeTruthy()
    expect(addsMock).toHaveBeenCalledWith(2026)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('of 16')).toBeTruthy()
    expect(screen.getByText('Tyler Allgeier is the best add: +0.40 points a week.')).toBeTruthy()
    expect(screen.getByText('Tyler Allgeier')).toBeTruthy()
    expect(screen.getByText('+0.40')).toBeTruthy()
    expect(screen.getByText('Starts wk 7, 9')).toBeTruthy()
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
    expect(screen.getByText('-0.20')).toBeTruthy()
    expect(screen.getByText('Starts wk 7')).toBeTruthy()
  })

  it('sorts the stash by trending on request and tags free releases', async () => {
    render(<WaiverScreen dataVersion={0} />)
    await screen.findByText('Jaylen Wright')
    const names = (): string[] =>
      screen
        .getAllByTestId('stash-row')
        .map((row) => within(row).getAllByRole('button')[0].textContent ?? '')
    expect(names()).toEqual(['Jaylen Wright', 'Tre Harris'])
    fireEvent.click(screen.getByRole('button', { name: 'Trending' }))
    expect(names()).toEqual(['Tre Harris', 'Jaylen Wright'])
    expect(screen.getAllByText('FREE')).toHaveLength(2)
    expect(screen.getByText('Trending adds unavailable. Refresh to fetch them.')).toBeTruthy()
  })

  it('explains empty lists', async () => {
    addsMock.mockResolvedValue(waiverAdds({ lineup: [], stash: [] }))
    render(<WaiverScreen dataVersion={0} />)
    expect(
      await screen.findByText('No free agent improves your lineup over the rest of the season.')
    ).toBeTruthy()
    expect(screen.getByText('No free agent improves your lineup.')).toBeTruthy()
    expect(
      screen.getByText('No free agent carries a market, trending or expert signal.')
    ).toBeTruthy()
  })

  it('shows the engine error', async () => {
    addsMock.mockRejectedValue(new Error('No projections stored for this season'))
    render(<WaiverScreen dataVersion={0} />)
    expect(await screen.findByText('No projections stored for this season')).toBeTruthy()
  })

  it('streams the current week on the first switch and refetches only on a week change', async () => {
    render(<WaiverScreen dataVersion={0} />)
    await screen.findByText('Tyler Allgeier')
    expect(streamMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('tab', { name: 'Streaming' }))
    expect(await screen.findByTitle('@ CAR')).toBeTruthy()
    expect(streamMock).toHaveBeenCalledWith(2026, 3)
    expect(screen.queryByText('Tyler Allgeier')).toBeNull()
    const weeks = within(screen.getByRole('tablist', { name: 'Streaming week' }))
      .getAllByRole('tab')
      .map((t) => t.textContent)
    expect(weeks).toEqual(['Week 3This week', 'Week 4In 1', 'Week 5In 2', 'Week 6In 3'])

    fireEvent.click(screen.getByRole('tab', { name: /Week 5/ }))
    await waitFor(() => expect(streamMock).toHaveBeenCalledWith(2026, 5))

    fireEvent.click(screen.getByRole('tab', { name: 'Rest of season' }))
    expect(screen.getByText('Tyler Allgeier')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Streaming' }))
    expect(streamMock).toHaveBeenCalledTimes(2)
  })

  it('filters streamers by position and switches a release', async () => {
    render(<WaiverScreen dataVersion={0} />)
    await screen.findByText('Tyler Allgeier')
    fireEvent.click(screen.getByRole('tab', { name: 'Streaming' }))
    await screen.findByTitle('@ CAR')
    const names = (): string[] =>
      screen
        .getAllByTestId('stream-row')
        .map((row) => within(row).getAllByRole('button')[0].textContent ?? '')
    expect(names()).toEqual(['Tre Harris', 'Jaylen Wright'])

    fireEvent.click(screen.getByRole('button', { name: 'RB' }))
    expect(names()).toEqual(['Jaylen Wright'])
    expect(screen.getByText('+2.00')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Release for Jaylen Wright'), {
      target: { value: '1' }
    })
    expect(screen.getByText('-3.5')).toBeTruthy()
    expect(screen.getByText('+0.50')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'TE' }))
    expect(screen.getByText('No TE streamer beats your lineup in week 3.')).toBeTruthy()
  })

  it('explains an empty streaming week and shows a streaming error', async () => {
    streamMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Streaming covers weeks 3–6'))
    render(<WaiverScreen dataVersion={0} />)
    await screen.findByText('Tyler Allgeier')
    fireEvent.click(screen.getByRole('tab', { name: 'Streaming' }))
    expect(await screen.findByText('No streamer beats your lineup in week 3.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Week 4/ }))
    expect(await screen.findByText('Streaming covers weeks 3–6')).toBeTruthy()
  })
})
