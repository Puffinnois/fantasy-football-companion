// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TradeScreen } from '@/screens/TradeScreen'
import { api } from '@/lib/api'
import type { PlayersOptions } from '@shared/types'
import { lineupPlayer } from '../../fixtures/lineup'
import {
  bijan,
  lar,
  rivalSide,
  threeTeamEvaluation,
  threeTeamPool,
  tradeEvaluation,
  tradePool,
  tradeSide,
  tradeSuggestion
} from '../../fixtures/trade'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    trade: { pool: vi.fn(), evaluate: vi.fn(), suggest: vi.fn(), openSpot: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const poolMock = vi.mocked(api.trade.pool)
const evaluateMock = vi.mocked(api.trade.evaluate)
const suggestMock = vi.mocked(api.trade.suggest)
const openSpotMock = vi.mocked(api.trade.openSpot)

const options: PlayersOptions = {
  seasons: [2026],
  currentWeek: 3,
  lastScoredWeek: 2,
  tabs: [],
  projectionWeeks: []
}

const JEFFERSON_FOR_CHASE = {
  moves: [
    { playerId: '6794', to: 2 },
    { playerId: '7564', to: 1 }
  ]
}

beforeEach(() => {
  optionsMock.mockReset()
  poolMock.mockReset()
  evaluateMock.mockReset()
  suggestMock.mockReset()
  suggestMock.mockResolvedValue([])
  openSpotMock.mockReset()
  openSpotMock.mockResolvedValue({ sides: [null, null] })
  optionsMock.mockResolvedValue(options)
  poolMock.mockResolvedValue(tradePool())
})
afterEach(cleanup)

describe('TradeScreen', () => {
  it('loads the pool, defaults the partner and builds a trade into a verdict', async () => {
    evaluateMock.mockResolvedValue(
      tradeEvaluation({
        sides: [
          tradeSide({
            drops: [lar],
            thisWeekSwaps: [
              {
                slot: 'WR',
                in: lineupPlayer({ playerId: '7564', fullName: "Ja'Marr Chase", position: 'WR' }),
                out: lineupPlayer({
                  playerId: '6794',
                  fullName: 'Justin Jefferson',
                  position: 'WR'
                }),
                delta: -4
              }
            ]
          }),
          rivalSide()
        ]
      })
    )
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('weeks 3–17 · 15 weeks')).toBeTruthy()
    expect(poolMock).toHaveBeenCalledWith(2026)
    // the first team is the default partner; nobody else is left to add
    expect(screen.getByLabelText('Remove team Rival')).toBeTruthy()
    expect(screen.queryByLabelText('Add team')).toBeNull()
    expect(screen.getByText('Add players to every team in the deal and evaluate.')).toBeTruthy()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Add to I send'), { target: { value: '6794' } })
    expect(screen.getByText('Cook Book gets nobody')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    expect(screen.getByText('Justin Jefferson')).toBeTruthy()
    expect(screen.getByText("Ja'Marr Chase")).toBeTruthy()
    expect(screen.getByText('ROS 128.0 · ECR — · MKT 10 512 · starts 15/15')).toBeTruthy()
    // two teams: no destination picker, the gets line names no source
    expect(screen.queryByLabelText('Destination of Justin Jefferson')).toBeNull()
    expect(screen.getByText("gets: Ja'Marr Chase")).toBeTruthy()
    // a chosen player leaves its picker
    expect(
      [...(screen.getByLabelText('Add to I send') as HTMLSelectElement).options].map((o) => o.value)
    ).not.toContain('6794')

    fireEvent.click(screen.getByText('Evaluate'))
    expect(await screen.findByText('-19.00 (-1.27/wk)')).toBeTruthy()
    expect(evaluateMock).toHaveBeenCalledWith(2026, JEFFERSON_FOR_CHASE)
    expect(screen.getByText('+19.00 (+1.27/wk)')).toBeTruthy()
    expect(screen.getByText('gives 10 512 → gets 8 000 (76 %)')).toBeTruthy()
    expect(screen.getByText('drop: Los Angeles Rams')).toBeTruthy()
    expect(screen.getByText('Everyone gains')).toBeTruthy()
    expect(screen.getByText('Market-fair')).toBeTruthy()
    expect(screen.getByText("Start Ja'Marr Chase over Justin Jefferson (WR, -4.00)")).toBeTruthy()

    // removing a player clears the verdict and disables Evaluate again
    fireEvent.click(screen.getByLabelText('Remove Justin Jefferson'))
    expect(screen.queryByText('-19.00 (-1.27/wk)')).toBeNull()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)
  })

  it('builds a three-team deal with destinations and inline validation', async () => {
    poolMock.mockResolvedValue(threeTeamPool())
    evaluateMock.mockResolvedValue(threeTeamEvaluation())
    openSpotMock.mockResolvedValue({ sides: [null, null, null] })
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add team'), { target: { value: '3' } })
    expect(screen.getByLabelText('Remove team Tank Mode')).toBeTruthy()
    expect(
      (screen.getByLabelText('Destination of Justin Jefferson') as HTMLSelectElement).value
    ).toBe('2')

    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    expect((screen.getByLabelText("Destination of Ja'Marr Chase") as HTMLSelectElement).value).toBe(
      '1'
    )
    expect(screen.getByText('Tank Mode sends nobody')).toBeTruthy()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Add to Tank Mode sends'), { target: { value: '5859' } })
    expect(screen.getByText('Tank Mode gets nobody')).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Destination of Ja'Marr Chase"), {
      target: { value: '3' }
    })
    expect(screen.getByText('gets: Tee Higgins (Tank Mode)')).toBeTruthy()
    expect(screen.getByText('gets: Justin Jefferson (Me)')).toBeTruthy()
    expect(screen.getByText("gets: Ja'Marr Chase (Rival)")).toBeTruthy()

    fireEvent.click(screen.getByText('Evaluate'))
    expect(await screen.findByText('+6.00 (+0.40/wk)')).toBeTruthy()
    expect(evaluateMock).toHaveBeenCalledWith(2026, {
      moves: [
        { playerId: '6794', to: 2 },
        { playerId: '7564', to: 3 },
        { playerId: '5859', to: 1 }
      ]
    })
    expect(screen.getByText('+3.00 (+0.20/wk)')).toBeTruthy()
    expect(screen.getByText('-1.50 (-0.10/wk)')).toBeTruthy()
    expect(screen.getByText('gets Tee Higgins from Tank Mode')).toBeTruthy()
    expect(screen.getByText('gets Justin Jefferson from me')).toBeTruthy()

    // removing Tank Mode drops Higgins; Chase heads back to me — a valid 2-team deal again
    fireEvent.click(screen.getByLabelText('Remove team Tank Mode'))
    expect(screen.queryByText('Tee Higgins')).toBeNull()
    expect(screen.queryByLabelText("Destination of Ja'Marr Chase")).toBeNull()
    expect(screen.queryByText('+6.00 (+0.40/wk)')).toBeNull()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(false)
  })

  it('adds the open-spot line under a side once the worker answers', async () => {
    evaluateMock.mockResolvedValue(tradeEvaluation())
    openSpotMock.mockResolvedValue({
      sides: [
        { rosterId: 1, add: bijan, deltaPerWeek: 0.8 },
        { rosterId: 2, add: null, deltaPerWeek: 0 }
      ]
    })
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))

    expect(await screen.findByText(`Open spot: best add ${bijan.fullName}, +0.80/wk`)).toBeTruthy()
    expect(openSpotMock).toHaveBeenCalledWith(2026, JEFFERSON_FOR_CHASE)
    expect(screen.getByText('Open spot: no free agent improves this lineup')).toBeTruthy()

    // A new trade drops the old line with the old verdict.
    fireEvent.click(screen.getByLabelText('Remove Justin Jefferson'))
    expect(screen.queryByText(`Open spot: best add ${bijan.fullName}, +0.80/wk`)).toBeNull()
  })

  it('shows the pool failure as the notice and an evaluate failure under the builder', async () => {
    poolMock.mockRejectedValue(new Error('No projections stored for this season'))
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('No projections stored for this season')).toBeTruthy()
    expect(screen.queryByLabelText('Add to I send')).toBeNull()
    cleanup()

    poolMock.mockResolvedValue(tradePool())
    evaluateMock.mockRejectedValue(new Error('Justin Jefferson is not on a roster in this league'))
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))
    expect(
      await screen.findByText('Justin Jefferson is not on a roster in this league')
    ).toBeTruthy()
    // the deal survives the error
    expect(screen.getByText('Justin Jefferson')).toBeTruthy()
  })

  it('shows the deadline banner and keeps the builder usable', async () => {
    poolMock.mockResolvedValue(tradePool({ tradeDeadlinePassed: true }))
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText(/trade deadline has passed/)).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('Add to I send')).toBeTruthy())
  })

  it('finds offers and opens one in the builder with the carried numbers', async () => {
    suggestMock.mockResolvedValue([tradeSuggestion()])
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    expect(screen.getByText('I gain and get ≥ 85 % of the market value I give')).toBeTruthy()

    fireEvent.click(screen.getByText('Find'))
    expect(await screen.findByText('with Rival')).toBeTruthy()
    // the default scan is the builder's partner — the league-wide one is an explicit choice
    expect(suggestMock).toHaveBeenCalledWith({
      season: 2026,
      focus: null,
      stance: 'fair',
      partnerRosterId: 2
    })
    expect(screen.getByText('Me +4.00 (+0.27/wk)')).toBeTruthy()
    expect(screen.getByText('Them -4.00')).toBeTruthy()
    expect(screen.getByText('market')).toBeTruthy()
    expect(screen.getByText("give RB Saquon Barkley · get WR Ja'Marr Chase")).toBeTruthy()

    fireEvent.click(screen.getByText('Open in builder'))
    expect(screen.getByLabelText('Remove team Rival')).toBeTruthy()
    expect(screen.getByText('Saquon Barkley')).toBeTruthy()
    expect(screen.getByText("Ja'Marr Chase")).toBeTruthy()
    // the verdict is the suggestion's evaluation — no second trade:evaluate call
    expect(screen.getByText('+4.00 (+0.27/wk)')).toBeTruthy()
    expect(screen.getByText('gives 9 340 → gets 8 000 (86 %)')).toBeTruthy()
    expect(evaluateMock).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalled()
    // the rows are editable as usual: removing one clears the verdict
    fireEvent.click(screen.getByLabelText('Remove Saquon Barkley'))
    expect(screen.queryByText('+4.00 (+0.27/wk)')).toBeNull()
  })

  it('carries the focus and stance, scans every team on request, hints on an empty result', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'give' } })
    fireEvent.change(screen.getByLabelText('Focus player'), { target: { value: '4866' } })
    expect(screen.getByText('MKT 9 340 · 30d -310')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Stance'), { target: { value: 'overpay' } })

    fireEvent.click(screen.getByText('Suggest with this team'))
    expect(await screen.findByText('No offers — widen the focus or pick another team')).toBeTruthy()
    expect(suggestMock).toHaveBeenCalledWith({
      season: 2026,
      focus: { give: '4866' },
      stance: 'overpay',
      partnerRosterId: 2
    })
    expect((screen.getByLabelText('Suggest with') as HTMLSelectElement).value).toBe('2')

    // a position focus, scanning every team
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'want' } })
    fireEvent.change(screen.getByLabelText('Focus position'), { target: { value: 'WR' } })
    fireEvent.change(screen.getByLabelText('Suggest with'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Find'))
    await waitFor(() =>
      expect(suggestMock).toHaveBeenLastCalledWith({
        season: 2026,
        focus: { want: 'WR' },
        stance: 'overpay',
        partnerRosterId: null
      })
    )

    // a failed search shows under the controls
    suggestMock.mockRejectedValue(new Error('No projections stored for this season'))
    fireEvent.click(screen.getByText('Find'))
    expect(await screen.findByText('No projections stored for this season')).toBeTruthy()
  })
})
