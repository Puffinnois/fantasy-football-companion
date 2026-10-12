import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { SeasonResult } from './aggregate'
import type { AggregatePbp, WarehouseJob, WarehouseOutput } from './job'

/** Bundled beside the main entry by `electron.vite.config.ts`. */
function workerPath(): string {
  return join(__dirname, 'warehouseWorker.js')
}

export const PBP_UNREADABLE = 'Play-by-play aggregation sent an unreadable answer'
export const PBP_OUT_OF_MEMORY = 'Play-by-play aggregation ran out of memory'

/**
 * Spec §6.1: a season is ~100 MB of CSV (plus FTN and participation) and takes seconds to
 * aggregate, so it runs off the main thread. The files are transferred to the worker, not copied;
 * one worker per season.
 */
export const runPbpWorker: AggregatePbp = (job) =>
  new Promise<SeasonResult>((resolve, reject) => {
    const files = [job.pbp, job.ftn, job.part].filter((b): b is Uint8Array => b !== null)
    const worker = new Worker(workerPath(), {
      workerData: job satisfies WarehouseJob,
      transferList: files.map((b) => b.buffer as ArrayBuffer)
    })
    let answered = false
    const settle = (fn: () => void): void => {
      if (answered) return
      answered = true
      void worker.terminate()
      fn()
    }
    worker.on('message', (out: WarehouseOutput) =>
      settle(() => (out.error === undefined ? resolve(out.result) : reject(new Error(out.error))))
    )
    worker.on('messageerror', () => settle(() => reject(new Error(PBP_UNREADABLE))))
    worker.on('error', (err) =>
      settle(() =>
        reject(
          (err as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? new Error(PBP_OUT_OF_MEMORY)
            : err
        )
      )
    )
    worker.on('exit', (code) =>
      settle(() =>
        reject(new Error(`Play-by-play aggregation stopped unexpectedly (exit ${code})`))
      )
    )
  })
