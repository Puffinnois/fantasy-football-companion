import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { TradeSuggestion, TradeSuggestQuery } from '@shared/types'

export interface SuggestWorkerInput {
  dbPath: string
  leagueId: string
  query: TradeSuggestQuery
}

export interface SuggestWorkerOutput {
  suggestions?: TradeSuggestion[]
  error?: string
}

/** Bundled beside the main entry by `electron.vite.config.ts`. */
function workerPath(): string {
  return join(__dirname, 'tradeWorker.js')
}

/**
 * Spec §6: the league-wide scan takes seconds, so it runs off the main thread — the window keeps
 * painting and every other channel keeps answering while it works.
 */
export function runSuggest(input: SuggestWorkerInput): Promise<TradeSuggestion[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath(), { workerData: input })
    let answered = false
    const settle = (fn: () => void): void => {
      if (answered) return
      answered = true
      void worker.terminate()
      fn()
    }
    worker.on('message', (out: SuggestWorkerOutput) =>
      settle(() =>
        out.error === undefined ? resolve(out.suggestions ?? []) : reject(new Error(out.error))
      )
    )
    worker.on('error', (err) => settle(() => reject(err)))
    worker.on('exit', (code) =>
      settle(() => reject(new Error(`Suggestion search stopped unexpectedly (exit ${code})`)))
    )
  })
}
