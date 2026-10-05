// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TradeScreen } from '@/screens/TradeScreen'
import { api } from '@/lib/api'
import type { PlayersOptions, SuggestEvent, SuggestSnapshot, TradeEvaluation } from '@shared/types'
import { lineupPlayer } from '../../fixtures/lineup'
import {
  bijan,
  lar,
  rivalSide,
  threeTeamEvaluation,
  threeTeamPool,
  threeTeamSuggestion,
  tradeEvaluation,
  tradePool,
  tradeSide,
  tradeSuggestion
} from '../../fixtures/trade'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    trade: {
      pool: vi.fn(),
      evaluate: vi.fn(),
      openSpot: vi.fn(),
      suggestStart: vi.fn(),
      suggestStop: vi.fn(),
      suggestSnapshot: vi.fn(),
      onSuggestEvent: vi.fn()
    }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const poolMock = vi.mocked(api.trade.pool)
const evaluateMock = vi.mocked(api.trade.evaluate)
const openSpotMock = vi.mocked(api.trade.openSpot)
const startMock = vi.mocked(api.trade.suggestStart)
const stopMock = vi.mocked(api.trade.suggestStop)
const snapshotMock = vi.mocked(api.trade.suggestSnapshot)
const onEventMock = vi.mocked(api.trade.onSuggestEvent)
let emit: (event: SuggestEvent) => void = () => undefined
const unsubscribe = vi.fn()

const PROGRESS = { checked: 412, total: 18900, found: 0, size: 3, elapsedMs: 37_000 }
/** Main sends an event; React re-renders inside act. */
const send = (event: SuggestEvent): void => {
  act(() => emit(event))
}
/** Lets pending promise callbacks (the start's run id, the snapshot) land. */
const flush = async (): Promise<void> => {
  await act(async () => undefined)
}

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
  openSpotMock.mockReset()
  openSpotMock.mockResolvedValue({ sides: [null, null] })
  optionsMock.mockResolvedValue(options)
  poolMock.mockResolvedValue(tradePool())
  startMock.mockReset()
  startMock.mockResolvedValue(7)
  stopMock.mockReset()
  stopMock.mockResolvedValue(undefined)
  snapshotMock.mockReset()
  snapshotMock.mockResolvedValue(null)
  unsubscribe.mockReset()
  onEventMock.mockReset()
  onEventMock.mockImplementation((listener) => {
    emit = listener
    return unsubscribe
  })
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

  it('streams cards in live and opens one in the builder with its numbers', async () => {
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    expect(screen.getByText('I gain and get ≥ 85 % of the market value I give')).toBeTruthy()

    fireEvent.click(screen.getByText('Find'))
    // a two-team league caps "Up to" at 2
    expect(startMock).toHaveBeenCalledWith({
      season: 2026,
      focus: null,
      stance: 'fair',
      maxTeams: 2,
      mustInclude: null
    })
    expect(
      screen.getByText('Searching 2-team deals · 0 of 0 ideas checked · 0 found · 0:00')
    ).toBeTruthy()
    expect(screen.getByText('Stop')).toBeTruthy()
    await flush()
    send({ runId: 7, type: 'progress', progress: PROGRESS })
    expect(
      screen.getByText('Searching 3-team deals · 412 of 18 900 ideas checked · 0 found · 0:37')
    ).toBeTruthy()
    send({ runId: 7, type: 'cards', cards: [tradeSuggestion()] })
    expect(screen.getByText('with Rival')).toBeTruthy()
    expect(screen.getByText('Me +4.00 (+0.27/wk)')).toBeTruthy()
    expect(screen.getByText('2-team')).toBeTruthy()
    expect(screen.getByText('Them -4.00')).toBeTruthy()
    expect(screen.getByText('market')).toBeTruthy()
    expect(screen.getByText("give RB Saquon Barkley · get WR Ja'Marr Chase")).toBeTruthy()
    send({ runId: 7, type: 'done', reason: 'full', progress: { ...PROGRESS, found: 1 } })
    expect(screen.getByText('Done: best 1 found — nothing left could rank higher')).toBeTruthy()
    expect(screen.getByText('Find')).toBeTruthy()

    fireEvent.click(screen.getByText('Open in builder'))
    expect(screen.getByLabelText('Remove team Rival')).toBeTruthy()
    expect(screen.getByText('Saquon Barkley')).toBeTruthy()
    expect(screen.getByText("Ja'Marr Chase")).toBeTruthy()
    // the verdict is the suggestion's evaluation — no second trade:evaluate call
    expect(screen.getByText('+4.00 (+0.27/wk)')).toBeTruthy()
    expect(screen.getByText('gives 9 340 → gets 8 000 (86 %)')).toBeTruthy()
    expect(evaluateMock).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Remove Saquon Barkley'))
    expect(screen.queryByText('+4.00 (+0.27/wk)')).toBeNull()
  })

  it('shows a 3-team card with its path, every other team and the other ways', async () => {
    poolMock.mockResolvedValue(threeTeamPool())
    evaluateMock.mockResolvedValue(threeTeamEvaluation())
    openSpotMock.mockResolvedValue({ sides: [null, null, null] })
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    expect(startMock).toHaveBeenCalledWith({
      season: 2026,
      focus: null,
      stance: 'fair',
      maxTeams: 3,
      mustInclude: null
    })
    await flush()
    send({ runId: 7, type: 'cards', cards: [threeTeamSuggestion()] })
    expect(screen.getByText('3-team')).toBeTruthy()
    expect(
      screen.getByText(
        "I send WR Justin Jefferson → Rival · Rival sends WR Ja'Marr Chase → Tank Mode · Tank Mode sends WR Tee Higgins → me"
      )
    ).toBeTruthy()
    expect(screen.getByText('Rival +0.20/wk')).toBeTruthy()
    expect(screen.getByText('Tank Mode -0.10/wk')).toBeTruthy()
    expect(screen.queryByText('with Rival')).toBeNull()

    fireEvent.click(screen.getByText('+1 other way ▸'))
    expect(screen.getByText('via Rival: Bijan Robinson · worst side -0.30/wk')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Open in builder')[1])
    // an alternative carries no evaluation: it is evaluated on opening
    await waitFor(() =>
      expect(evaluateMock).toHaveBeenCalledWith(2026, {
        moves: [
          { playerId: '6794', to: 2 },
          { playerId: '9509', to: 3 },
          { playerId: '5859', to: 1 }
        ]
      })
    )
    expect(screen.getByLabelText('Remove team Tank Mode')).toBeTruthy()
    expect(screen.getByText('Bijan Robinson')).toBeTruthy()
  })

  it('stops a run, ignores old runs and reports how each run ended', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    await flush()
    fireEvent.click(screen.getByText('Stop'))
    expect(stopMock).toHaveBeenCalled()
    send({ runId: 7, type: 'done', reason: 'stopped', progress: PROGRESS })
    expect(screen.getByText('Stopped: 0 found so far')).toBeTruthy()

    startMock.mockResolvedValue(8)
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 7, type: 'cards', cards: [tradeSuggestion()] }) // the old run: ignored
    expect(screen.queryByText('with Rival')).toBeNull()
    send({ runId: 8, type: 'done', reason: 'stale', progress: PROGRESS })
    expect(screen.getByText('League data changed — run again')).toBeTruthy()

    startMock.mockResolvedValue(9)
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({
      runId: 9,
      type: 'error',
      message: 'Background calculation stopped unexpectedly (exit 1)'
    })
    expect(
      screen.getByText('Search failed: Background calculation stopped unexpectedly (exit 1)')
    ).toBeTruthy()

    startMock.mockResolvedValue(10)
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 10, type: 'done', reason: 'complete', progress: PROGRESS })
    expect(screen.getByText('No offers at this stance — try overpay')).toBeTruthy()
  })

  it('re-attaches to the running search and leaves it running on unmount', async () => {
    snapshotMock.mockResolvedValue({
      runId: 3,
      query: {
        season: 2026,
        focus: { give: '4866' },
        stance: 'overpay',
        maxTeams: 2,
        mustInclude: 2
      },
      cards: [tradeSuggestion()],
      progress: PROGRESS,
      status: 'running',
      message: null
    })
    const { unmount } = render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('with Rival')).toBeTruthy()
    expect((screen.getByLabelText('Focus') as HTMLSelectElement).value).toBe('give')
    expect((screen.getByLabelText('Focus player') as HTMLSelectElement).value).toBe('4866')
    expect((screen.getByLabelText('Stance') as HTMLSelectElement).value).toBe('overpay')
    expect((screen.getByLabelText('Must include') as HTMLSelectElement).value).toBe('2')
    expect(screen.getByText('Stop')).toBeTruthy()
    send({ runId: 3, type: 'done', reason: 'complete', progress: { ...PROGRESS, found: 1 } })
    expect(screen.getByText('Done: 1 found, every idea checked')).toBeTruthy()
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
    expect(stopMock).not.toHaveBeenCalled()
  })

  it('prunes controls restored from a snapshot that answers after the pool', async () => {
    let answer: (snap: SuggestSnapshot | null) => void = () => undefined
    snapshotMock.mockReturnValue(
      new Promise<SuggestSnapshot | null>((resolve) => {
        answer = resolve
      })
    )
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send') // the pool is in, and pruned what it could
    await act(async () =>
      answer({
        runId: 3,
        query: {
          season: 2026,
          focus: { give: 'gone' },
          stance: 'overpay',
          maxTeams: 4,
          mustInclude: 9
        },
        cards: [],
        progress: PROGRESS,
        status: 'stopped',
        message: null
      })
    )
    expect((screen.getByLabelText('Stance') as HTMLSelectElement).value).toBe('overpay')
    fireEvent.click(screen.getByText('Find'))
    expect(startMock).toHaveBeenLastCalledWith({
      season: 2026,
      focus: null,
      stance: 'overpay',
      maxTeams: 2,
      mustInclude: null
    })
  })

  it('notes changed controls and starts nothing until Find', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    await flush()
    fireEvent.change(screen.getByLabelText('Stance'), { target: { value: 'premium' } })
    expect(
      screen.getByText(
        'Searching 2-team deals · 0 of 0 ideas checked · 0 found · 0:00 · Controls changed — Find to rerun'
      )
    ).toBeTruthy()
    expect(startMock).toHaveBeenCalledTimes(1)
  })

  it('suggests with the builder’s team by making it the must-include team', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'give' } })
    fireEvent.change(screen.getByLabelText('Focus player'), { target: { value: '4866' } })
    expect(screen.getByText('MKT 9 340 · 30d -310')).toBeTruthy()
    fireEvent.click(screen.getByText('Suggest with this team'))
    expect(startMock).toHaveBeenCalledWith({
      season: 2026,
      focus: { give: '4866' },
      stance: 'fair',
      maxTeams: 2,
      mustInclude: 2
    })
    expect((screen.getByLabelText('Must include') as HTMLSelectElement).value).toBe('2')
  })

  it('shows a failed start under the controls', async () => {
    startMock.mockRejectedValue(new Error('No league imported'))
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    expect(await screen.findByText('No league imported')).toBeTruthy()
    expect(screen.getByText('Find')).toBeTruthy()
  })

  it('marks a finished list stale when league data changes, keeping its cards', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 7, type: 'cards', cards: [tradeSuggestion()] })
    send({ runId: 7, type: 'done', reason: 'complete', progress: { ...PROGRESS, found: 1 } })
    expect(screen.getByText('Done: 1 found, every idea checked')).toBeTruthy()
    send({ runId: 7, type: 'done', reason: 'stale', progress: { ...PROGRESS, found: 1 } })
    expect(screen.getByText('League data changed — run again')).toBeTruthy()
    expect(screen.getByText('with Rival')).toBeTruthy()
    expect(screen.getByText('Find')).toBeTruthy()
  })

  it('evaluates a stale card fresh on opening, without its carried verdict', async () => {
    let answer: (ev: TradeEvaluation) => void = () => undefined
    evaluateMock.mockReturnValue(
      new Promise<TradeEvaluation>((resolve) => {
        answer = resolve
      })
    )
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 7, type: 'cards', cards: [tradeSuggestion()] })
    send({ runId: 7, type: 'done', reason: 'complete', progress: { ...PROGRESS, found: 1 } })
    send({ runId: 7, type: 'done', reason: 'stale', progress: { ...PROGRESS, found: 1 } })

    fireEvent.click(screen.getByText('Open in builder'))
    expect(evaluateMock).toHaveBeenCalledWith(2026, {
      moves: [
        { playerId: '4866', to: 2 },
        { playerId: '7564', to: 1 }
      ]
    })
    expect(screen.getByText('Evaluating…')).toBeTruthy()
    expect(screen.getByText('Saquon Barkley')).toBeTruthy()
    expect(screen.queryByText('+4.00 (+0.27/wk)')).toBeNull()
    await act(async () => answer(tradeSuggestion().evaluation))
    expect(screen.getByText('+4.00 (+0.27/wk)')).toBeTruthy()
  })

  it('drops a stale card’s player who left the roster before evaluating it', async () => {
    evaluateMock.mockRejectedValue(new Error('Rival gets nobody'))
    const { rerender } = render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 7, type: 'cards', cards: [tradeSuggestion()] })
    send({ runId: 7, type: 'done', reason: 'complete', progress: { ...PROGRESS, found: 1 } })

    // a sync moves Barkley off my roster; the same event tells the screen the list is stale
    const before = tradePool()
    poolMock.mockResolvedValue(
      tradePool({
        me: { ...before.me, players: before.me.players.filter((p) => p.playerId !== '4866') }
      })
    )
    rerender(<TradeScreen dataVersion={1} />)
    await screen.findByLabelText('Add to I send')
    send({ runId: 7, type: 'done', reason: 'stale', progress: { ...PROGRESS, found: 1 } })

    fireEvent.click(screen.getByText('Open in builder'))
    expect(evaluateMock).toHaveBeenCalledWith(2026, { moves: [{ playerId: '7564', to: 1 }] })
    expect(screen.queryByText('Saquon Barkley')).toBeNull()
    expect(await screen.findByText('Rival gets nobody')).toBeTruthy()
  })

  it('drops a stale alternative’s player who left the team it came from', async () => {
    poolMock.mockResolvedValue(threeTeamPool())
    evaluateMock.mockRejectedValue(new Error('Tank Mode gets nobody'))
    openSpotMock.mockResolvedValue({ sides: [null, null, null] })
    const { rerender } = render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 7, type: 'cards', cards: [threeTeamSuggestion()] })
    send({ runId: 7, type: 'done', reason: 'complete', progress: { ...PROGRESS, found: 1 } })

    // a sync moves Bijan from Rival to Tank Mode; the same event marks the list stale
    const before = threeTeamPool()
    poolMock.mockResolvedValue(
      tradePool({
        teams: [
          {
            ...before.teams[0],
            players: before.teams[0].players.filter((p) => p.playerId !== '9509')
          },
          { ...before.teams[1], players: [...before.teams[1].players, bijan] }
        ]
      })
    )
    rerender(<TradeScreen dataVersion={1} />)
    await screen.findByLabelText('Add to I send')
    send({ runId: 7, type: 'done', reason: 'stale', progress: { ...PROGRESS, found: 1 } })

    fireEvent.click(screen.getByText('+1 other way ▸'))
    fireEvent.click(screen.getAllByText('Open in builder')[1])
    // not re-homed onto Tank Mode (from = to): Bijan leaves the deal
    expect(evaluateMock).toHaveBeenLastCalledWith(2026, {
      moves: [
        { playerId: '6794', to: 2 },
        { playerId: '5859', to: 1 }
      ]
    })
    expect(await screen.findByText('Tank Mode gets nobody')).toBeTruthy()
  })

  it('drops an evaluate answer that lands after the deal changed', async () => {
    let answer: (ev: TradeEvaluation) => void = () => undefined
    evaluateMock.mockReturnValue(
      new Promise<TradeEvaluation>((resolve) => {
        answer = resolve
      })
    )
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to I send'), { target: { value: '4866' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))
    // a still-valid deal after the edit, so the button is only held back by a pending answer
    fireEvent.click(screen.getByLabelText('Remove Saquon Barkley'))
    await act(async () => answer(tradeEvaluation()))
    expect(screen.queryByText('Verdict')).toBeNull()
    expect(screen.queryByText('Evaluating…')).toBeNull()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(false)
  })

  it('clears evaluating when the pool reloads under an unanswered evaluate', async () => {
    evaluateMock.mockReturnValue(new Promise<TradeEvaluation>(() => undefined))
    const { rerender } = render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))
    expect(screen.getByText('Evaluating…')).toBeTruthy()
    rerender(<TradeScreen dataVersion={1} />)
    const evaluate = await screen.findByText('Evaluate')
    await waitFor(() => expect(poolMock).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Evaluating…')).toBeNull()
    expect((evaluate as HTMLButtonElement).disabled).toBe(false)
  })

  it('puts each open-spot line under its own side when the answer comes back reordered', async () => {
    evaluateMock.mockResolvedValue(tradeEvaluation())
    openSpotMock.mockResolvedValue({
      sides: [
        { rosterId: 2, add: null, deltaPerWeek: 0 },
        { rosterId: 1, add: bijan, deltaPerWeek: 0.8 }
      ]
    })
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))
    const mine = await screen.findByRole('group', { name: 'Verdict for me' })
    expect(
      await within(mine).findByText(`Open spot: best add ${bijan.fullName}, +0.80/wk`)
    ).toBeTruthy()
    expect(
      within(screen.getByRole('group', { name: 'Verdict for Rival' })).getByText(
        'Open spot: no free agent improves this lineup'
      )
    ).toBeTruthy()
  })

  it('orders the verdict columns as the builder’s cards', async () => {
    poolMock.mockResolvedValue(threeTeamPool())
    const [me, rival, tank] = threeTeamEvaluation().sides
    evaluateMock.mockResolvedValue({ ...threeTeamEvaluation(), sides: [me, tank, rival] })
    openSpotMock.mockResolvedValue({ sides: [null, null, null] })
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add team'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.change(screen.getByLabelText('Add to Tank Mode sends'), { target: { value: '5859' } })
    fireEvent.change(screen.getByLabelText("Destination of Ja'Marr Chase"), {
      target: { value: '3' }
    })
    fireEvent.click(screen.getByText('Evaluate'))
    await screen.findByText('+6.00 (+0.40/wk)')
    expect(
      screen
        .getAllByRole('group', { name: /^Verdict for/ })
        .map((g) => g.getAttribute('aria-label'))
    ).toEqual(['Verdict for me', 'Verdict for Rival', 'Verdict for Tank Mode'])
  })

  it('keeps the shown list when a start is refused during a refresh', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 7, type: 'cards', cards: [tradeSuggestion()] })
    send({ runId: 7, type: 'done', reason: 'complete', progress: { ...PROGRESS, found: 1 } })

    startMock.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'trade:suggestStart': Error: League data is refreshing — Find again when it finishes"
      )
    )
    // main still holds run 7 — by now marked stale by the refresh (a two-team league caps "Up to" at 2)
    snapshotMock.mockResolvedValue({
      runId: 7,
      query: { season: 2026, focus: null, stance: 'fair', maxTeams: 2, mustInclude: null },
      cards: [tradeSuggestion()],
      progress: { ...PROGRESS, found: 1 },
      status: 'stale',
      message: null
    })
    fireEvent.click(screen.getByText('Find'))
    expect(
      await screen.findByText('League data is refreshing — Find again when it finishes')
    ).toBeTruthy()
    expect(await screen.findByText('with Rival')).toBeTruthy()
    expect(screen.getByText('League data changed — run again')).toBeTruthy()
  })
})
