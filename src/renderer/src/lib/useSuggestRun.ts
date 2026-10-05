import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import {
  DEFAULT_CONTROLS,
  controlsOf,
  pruneControls,
  queryOf,
  type SuggestControls
} from '@/lib/tradeView'
import { applyUpdate, EMPTY_PROGRESS } from '@shared/suggestRun'
import type { SuggestSnapshot, TradePool } from '@shared/types'

/** The run id shown while a start waits for main's answer. */
const PENDING = -1

export interface SuggestRun {
  controls: SuggestControls
  setControls: (controls: SuggestControls) => void
  /** The run shown: the active or last one, or a start waiting for its id. */
  run: SuggestSnapshot | null
  running: boolean
  startError: string | null
  /** Starts a run on the controls, `override` applied to them first. */
  find: (override?: Partial<SuggestControls>) => void
  stop: () => void
  /** After a pool reload: forget a focus player or team that is gone; cap "Up to" at the league size. */
  prune: (pool: TradePool) => void
}

/**
 * Multi-team spec §4.2 / §5.2: the screen's view of main's one suggestion run. On mount it
 * re-attaches (snapshot, then events); unmounting unsubscribes and leaves the run going.
 */
export function useSuggestRun(season: number | null): SuggestRun {
  const [controls, setControls] = useState<SuggestControls>(DEFAULT_CONTROLS)
  const [run, setRun] = useState<SuggestSnapshot | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  /** The run whose events apply: null until the snapshot answers, PENDING while a start is in flight. */
  const following = useRef<number | null>(null)
  /** Counts starts, so only the latest start's answer is taken. */
  const starts = useRef(0)
  /** The pool `prune` last saw: a snapshot that answers after it is pruned against it too. */
  const lastPool = useRef<TradePool | null>(null)

  useEffect(() => {
    let live = true
    // Subscribe first: main answers the snapshot before it sends any later event, on one channel.
    const unsubscribe = api.trade.onSuggestEvent((event) => {
      if (event.runId !== following.current) return
      setRun((r) => (r !== null && r.runId === event.runId ? applyUpdate(r, event) : r))
    })
    void api.trade
      .suggestSnapshot()
      .then((snap) => {
        if (!live || snap === null || starts.current > 0) return
        following.current = snap.runId
        setRun(snap)
        const restored = controlsOf(snap.query)
        setControls(
          lastPool.current === null ? restored : pruneControls(restored, lastPool.current)
        )
      })
      .catch(() => undefined)
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  const find = (override: Partial<SuggestControls> = {}): void => {
    if (season === null) return
    const next = { ...controls, ...override }
    const query = queryOf(next, season)
    const token = ++starts.current
    following.current = PENDING
    setControls(next)
    setStartError(null)
    setRun({
      runId: PENDING,
      query,
      cards: [],
      progress: EMPTY_PROGRESS,
      status: 'running',
      message: null
    })
    void api.trade
      .suggestStart(query)
      .then((runId) => {
        if (token !== starts.current) return
        following.current = runId
        setRun((r) => (r !== null && r.runId === PENDING ? { ...r, runId } : r))
      })
      .catch((err) => {
        if (token !== starts.current) return
        setStartError(errorMessage(err))
        // Follow-ups §6: a refused start leaves main's run as it was — show and follow it again.
        following.current = null
        setRun(null)
        void api.trade
          .suggestSnapshot()
          .then((snap) => {
            if (token !== starts.current || snap === null) return
            following.current = snap.runId
            setRun(snap)
          })
          .catch(() => undefined)
      })
  }

  const stop = (): void => {
    // The run's `done: stopped` event updates the list.
    void api.trade.suggestStop().catch(() => undefined)
  }

  const prune = useCallback((pool: TradePool): void => {
    lastPool.current = pool
    setControls((c) => pruneControls(c, pool))
  }, [])

  return {
    controls,
    setControls,
    run,
    running: run?.status === 'running',
    startError,
    find,
    stop,
    prune
  }
}
