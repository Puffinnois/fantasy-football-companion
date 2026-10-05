import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { SuggestUpdate } from '@shared/types'
import type {
  EngineInput,
  EngineJob,
  EngineOutput,
  EngineResults,
  StreamInput,
  StreamJob
} from './jobs'

/** Bundled beside the main entry by `electron.vite.config.ts`. */
function workerPath(): string {
  return join(__dirname, 'engineWorker.js')
}

/** Follow-ups §4: a worker update that failed to deserialize. */
export const UNREADABLE = 'Background calculation sent an unreadable update'
/** The suggestion search hit the worker's heap limit; it is the only search sized by the user. */
export const SEARCH_OUT_OF_MEMORY = 'The search ran out of memory — try fewer teams or one partner'
export const JOB_OUT_OF_MEMORY = 'Background calculation ran out of memory'

function outOfMemory(err: Error): boolean {
  return (err as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY'
}

/**
 * The trade and waiver searches take seconds, so they run off the main thread: the window keeps
 * painting and every other channel keeps answering. One worker per job, terminated when it answers.
 */
export function runEngine<J extends EngineJob>(
  dbPath: string,
  leagueId: string,
  job: J
): Promise<EngineResults[J['kind']]> {
  return new Promise((resolve, reject) => {
    const workerData: EngineInput = { dbPath, leagueId, job }
    const worker = new Worker(workerPath(), { workerData })
    let answered = false
    const settle = (fn: () => void): void => {
      if (answered) return
      answered = true
      void worker.terminate()
      fn()
    }
    worker.on('message', (out: EngineOutput) =>
      settle(() =>
        out.error === undefined
          ? resolve(out.result as EngineResults[J['kind']])
          : reject(new Error(out.error))
      )
    )
    worker.on('messageerror', () => settle(() => reject(new Error(UNREADABLE))))
    worker.on('error', (err) =>
      settle(() => reject(outOfMemory(err) ? new Error(JOB_OUT_OF_MEMORY) : err))
    )
    worker.on('exit', (code) =>
      settle(() => reject(new Error(`Background calculation stopped unexpectedly (exit ${code})`)))
    )
  })
}

/** Multi-team spec §4.1: a running stream; `stop()` terminates its worker. */
export interface StreamHandle {
  stop(): void
}

/**
 * The suggestion search streams: its worker posts updates until `done` or `error`. A worker error,
 * an unreadable message or an unexpected exit becomes an `error` update; after `stop()` nothing
 * more is delivered.
 */
export function runEngineStream(
  dbPath: string,
  leagueId: string,
  job: StreamJob,
  onUpdate: (update: SuggestUpdate) => void
): StreamHandle {
  const workerData: StreamInput = { dbPath, leagueId, stream: job }
  const worker = new Worker(workerPath(), { workerData })
  let over = false
  const end = (): void => {
    if (over) return
    over = true
    void worker.terminate()
  }
  worker.on('message', (update: SuggestUpdate) => {
    if (over) return
    onUpdate(update)
    if (update.type === 'done' || update.type === 'error') end()
  })
  const fail = (message: string): void => {
    if (over) return
    onUpdate({ type: 'error', message })
    end()
  }
  worker.on('messageerror', () => fail(UNREADABLE))
  worker.on('error', (err) => fail(outOfMemory(err) ? SEARCH_OUT_OF_MEMORY : err.message))
  worker.on('exit', (code) => {
    if (over) return
    over = true
    onUpdate({
      type: 'error',
      message: `Background calculation stopped unexpectedly (exit ${code})`
    })
  })
  return { stop: end }
}
