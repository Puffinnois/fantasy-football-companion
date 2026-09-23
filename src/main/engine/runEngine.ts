import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { EngineInput, EngineJob, EngineOutput, EngineResults } from './jobs'

/** Bundled beside the main entry by `electron.vite.config.ts`. */
function workerPath(): string {
  return join(__dirname, 'engineWorker.js')
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
    worker.on('error', (err) => settle(() => reject(err)))
    worker.on('exit', (code) =>
      settle(() => reject(new Error(`Background calculation stopped unexpectedly (exit ${code})`)))
    )
  })
}
