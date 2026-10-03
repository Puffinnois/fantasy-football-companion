import type { StreamHandle } from '@main/engine/runEngine'
import { applyUpdate, EMPTY_PROGRESS } from '@shared/suggestRun'
import type { SuggestEvent, SuggestSnapshot, SuggestUpdate, TradeSuggestQuery } from '@shared/types'

export interface SuggestRunDeps {
  /** Starts the search; its updates arrive through `onUpdate` until `done`, `error` or `stop()`. */
  start(query: TradeSuggestQuery, onUpdate: (update: SuggestUpdate) => void): StreamHandle
  /** Forwards an event to the renderer. */
  send(event: SuggestEvent): void
}

export interface SuggestRuns {
  /** Starts a run, stopping the active one (`stopped`); returns the new run's id. */
  start(query: TradeSuggestQuery): number
  /** Stops the active run (`stopped`); its cards stay. */
  stop(): void
  /** League data changed under the active run: stops it (`stale`). */
  stale(): void
  /** The active or last run. */
  snapshot(): SuggestSnapshot | null
}

/** Multi-team spec §4.2: main owns one active suggestion run; updates of any other run are dropped. */
export function suggestRuns(deps: SuggestRunDeps): SuggestRuns {
  let lastId = 0
  let snap: SuggestSnapshot | null = null
  let handle: StreamHandle | null = null

  const end = (reason: 'stopped' | 'stale'): void => {
    if (snap === null || snap.status !== 'running') return
    handle?.stop()
    handle = null
    const event: SuggestEvent = { runId: snap.runId, type: 'done', reason, progress: snap.progress }
    snap = applyUpdate(snap, event)
    deps.send(event)
  }

  return {
    start(query: TradeSuggestQuery): number {
      end('stopped')
      const runId = ++lastId
      snap = { runId, query, cards: [], progress: EMPTY_PROGRESS, status: 'running', message: null }
      const onUpdate = (update: SuggestUpdate): void => {
        if (snap === null || snap.runId !== runId || snap.status !== 'running') return
        snap = applyUpdate(snap, update)
        if (snap.status !== 'running') handle = null
        deps.send({ ...update, runId })
      }
      try {
        const started = deps.start(query, onUpdate)
        if (snap.runId === runId && snap.status === 'running') handle = started
      } catch (err) {
        snap = applyUpdate(snap, {
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
        throw err
      }
      return runId
    },
    stop: () => end('stopped'),
    stale: () => end('stale'),
    snapshot: () => snap
  }
}
