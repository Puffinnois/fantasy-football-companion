// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TradeScreen } from '@/screens/TradeScreen'
import { api } from '@/lib/api'
import type { PlayersOptions } from '@shared/types'
import { lineupPlayer } from '../../fixtures/lineup'
import { lar, tradeEvaluation, tradePool, tradeSide } from '../../fixtures/trade'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    trade: { pool: vi.fn(), evaluate: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const poolMock = vi.mocked(api.trade.pool)
const evaluateMock = vi.mocked(api.trade.evaluate)

const options: PlayersOptions = {
  seasons: [2026],
  currentWeek: 3,
  lastScoredWeek: 2,
  tabs: [],
  projectionWeeks: []
}

beforeEach(() => {
  optionsMock.mockReset()
  poolMock.mockReset()
  evaluateMock.mockReset()
  optionsMock.mockResolvedValue(options)
  poolMock.mockResolvedValue(tradePool())
})
afterEach(cleanup)

describe('TradeScreen', () => {
  it('loads the pool, defaults the partner and builds a trade into a verdict', async () => {
    evaluateMock.mockResolvedValue(
      tradeEvaluation({
        me: tradeSide({
          drops: [lar],
          thisWeekSwaps: [
            {
              slot: 'WR',
              in: lineupPlayer({ playerId: '7564', fullName: "Ja'Marr Chase", position: 'WR' }),
              out: lineupPlayer({ playerId: '6794', fullName: 'Justin Jefferson', position: 'WR' }),
              delta: -4
            }
          ]
        })
      })
    )
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('weeks 3–17 · 15 weeks')).toBeTruthy()
    expect(poolMock).toHaveBeenCalledWith(2026)
    expect((screen.getByLabelText('Partner') as HTMLSelectElement).value).toBe('2')
    expect(screen.getByText('Pick a partner, add players to both sides and evaluate.')).toBeTruthy()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Add to I give'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to I get'), { target: { value: '7564' } })
    expect(screen.getByText('Justin Jefferson')).toBeTruthy()
    expect(screen.getByText("Ja'Marr Chase")).toBeTruthy()
    expect(screen.getByText('ROS 128.0 · ECR — · MKT 10 512 · starts 15/15')).toBeTruthy()
    // a chosen player leaves its picker
    expect(
      [...(screen.getByLabelText('Add to I give') as HTMLSelectElement).options].map((o) => o.value)
    ).not.toContain('6794')

    fireEvent.click(screen.getByText('Evaluate'))
    expect(await screen.findByText('-19.00 (-1.27/wk)')).toBeTruthy()
    expect(evaluateMock).toHaveBeenCalledWith(2026, { rosterId: 2, give: ['6794'], get: ['7564'] })
    expect(screen.getByText('+19.00 (+1.27/wk)')).toBeTruthy()
    expect(screen.getByText('gives 10 512 → gets 8 000 (76 %)')).toBeTruthy()
    expect(screen.getByText('drop: Los Angeles Rams')).toBeTruthy()
    expect(screen.getByText('Win-win')).toBeTruthy()
    expect(screen.getByText('Market-fair')).toBeTruthy()
    expect(screen.getByText("Start Ja'Marr Chase over Justin Jefferson (WR, -4.00)")).toBeTruthy()

    // removing a player clears the verdict and disables Evaluate again
    fireEvent.click(screen.getByLabelText('Remove Justin Jefferson'))
    expect(screen.queryByText('-19.00 (-1.27/wk)')).toBeNull()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the pool failure as the notice and an evaluate failure under the builder', async () => {
    poolMock.mockRejectedValue(new Error('No projections stored for this season'))
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('No projections stored for this season')).toBeTruthy()
    expect(screen.queryByLabelText('Partner')).toBeNull()
    cleanup()

    poolMock.mockResolvedValue(tradePool())
    evaluateMock.mockRejectedValue(new Error("Invalid trade: 6794 is not on Cook Book's roster"))
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Partner')
    fireEvent.change(screen.getByLabelText('Add to I give'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to I get'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))
    expect(await screen.findByText("Invalid trade: 6794 is not on Cook Book's roster")).toBeTruthy()
    // the sides survive the error
    expect(screen.getByText('Justin Jefferson')).toBeTruthy()
  })

  it('shows the deadline banner and keeps the builder usable', async () => {
    poolMock.mockResolvedValue(tradePool({ tradeDeadlinePassed: true }))
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText(/trade deadline has passed/)).toBeTruthy()
    expect(screen.getByLabelText('Partner')).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('Add to I give')).toBeTruthy())
  })
})
