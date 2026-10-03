import { describe, expect, it } from 'vitest'
import { suggestRuns } from '@main/trade/suggestRun'
import type { SuggestEvent, SuggestUpdate, TradeSuggestQuery } from '@shared/types'
import { tradeSuggestion } from '../../fixtures/trade'

const QUERY: TradeSuggestQuery = {
  season: 2026,
  focus: null,
  stance: 'fair',
  maxTeams: 3,
  mustInclude: null
}
const PROGRESS = { checked: 3, total: 10, found: 1, size: 3, elapsedMs: 900 }

/** A run manager over a stubbed stream: each start is recorded with its update callback. */
function setup(): {
  runs: ReturnType<typeof suggestRuns>
  streams: { query: TradeSuggestQuery; push: (u: SuggestUpdate) => void; stopped: boolean }[]
  sent: SuggestEvent[]
} {
  const streams: {
    query: TradeSuggestQuery
    push: (u: SuggestUpdate) => void
    stopped: boolean
  }[] = []
  const sent: SuggestEvent[] = []
  const runs = suggestRuns({
    start: (query, onUpdate) => {
      const stream = { query, push: onUpdate, stopped: false }
      streams.push(stream)
      return {
        stop: (): void => {
          stream.stopped = true
        }
      }
    },
    send: (event) => sent.push(event)
  })
  return { runs, streams, sent }
}

describe('suggestRuns (spec §4.2)', () => {
  it('has nothing to show before the first run', () => {
    expect(setup().runs.snapshot()).toBeNull()
  })

  it('starts a run, forwards its updates with the run id and keeps the snapshot', () => {
    const { runs, streams, sent } = setup()
    const runId = runs.start(QUERY)
    expect(runId).toBe(1)
    expect(runs.snapshot()).toMatchObject({ runId: 1, query: QUERY, cards: [], status: 'running' })
    const card = tradeSuggestion()
    streams[0].push({ type: 'cards', cards: [card] })
    streams[0].push({ type: 'progress', progress: PROGRESS })
    expect(sent).toEqual([
      { runId: 1, type: 'cards', cards: [card] },
      { runId: 1, type: 'progress', progress: PROGRESS }
    ])
    expect(runs.snapshot()).toMatchObject({ cards: [card], progress: PROGRESS })
    streams[0].push({ type: 'done', reason: 'complete', progress: PROGRESS })
    expect(runs.snapshot()?.status).toBe('complete')
    // a finished run has nothing to stop
    runs.stop()
    expect(streams[0].stopped).toBe(false)
    expect(sent).toHaveLength(3)
  })

  it('stops the active run, keeps its cards and drops anything it sends afterwards', () => {
    const { runs, streams, sent } = setup()
    runs.start(QUERY)
    const card = tradeSuggestion()
    streams[0].push({ type: 'cards', cards: [card] })
    runs.stop()
    expect(streams[0].stopped).toBe(true)
    expect(sent[sent.length - 1]).toEqual({
      runId: 1,
      type: 'done',
      reason: 'stopped',
      progress: { checked: 0, total: 0, found: 0, size: 2, elapsedMs: 0 }
    })
    streams[0].push({ type: 'cards', cards: [card] })
    expect(runs.snapshot()).toMatchObject({ status: 'stopped', cards: [card] })
    expect(sent).toHaveLength(2)
  })

  it('supersedes the active run on a new start', () => {
    const { runs, streams, sent } = setup()
    runs.start(QUERY)
    const second = runs.start({ ...QUERY, maxTeams: 2 })
    expect(second).toBe(2)
    expect(streams[0].stopped).toBe(true)
    expect(sent).toEqual([expect.objectContaining({ runId: 1, type: 'done', reason: 'stopped' })])
    streams[0].push({ type: 'cards', cards: [tradeSuggestion()] }) // the old run, late
    expect(runs.snapshot()).toMatchObject({ runId: 2, cards: [], status: 'running' })
    expect(sent).toHaveLength(1)
  })

  it('marks a running search stale when league data changes, and only then', () => {
    const { runs, streams, sent } = setup()
    runs.stale() // nothing running: no-op
    expect(sent).toEqual([])
    runs.start(QUERY)
    runs.stale()
    expect(streams[0].stopped).toBe(true)
    expect(runs.snapshot()?.status).toBe('stale')
    expect(sent[sent.length - 1]).toMatchObject({ runId: 1, type: 'done', reason: 'stale' })
  })

  it('records a worker error, and a start that fails', () => {
    const { runs, streams } = setup()
    runs.start(QUERY)
    streams[0].push({ type: 'error', message: 'Background calculation stopped unexpectedly' })
    expect(runs.snapshot()).toMatchObject({
      status: 'error',
      message: 'Background calculation stopped unexpectedly'
    })
    const failing = suggestRuns({
      start: () => {
        throw new Error('no worker')
      },
      send: () => undefined
    })
    expect(() => failing.start(QUERY)).toThrow('no worker')
    expect(failing.snapshot()).toMatchObject({ status: 'error', message: 'no worker' })
  })
})
