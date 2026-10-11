import { parentPort, workerData } from 'node:worker_threads'
import { runWarehouseJob, type WarehouseJob, type WarehouseOutput } from './job'

/** Worker entry, bundled to `out/main/warehouseWorker.js`: one job, one answer. */
let output: WarehouseOutput
try {
  output = { result: runWarehouseJob(workerData as WarehouseJob) }
} catch (err) {
  output = { error: err instanceof Error ? err.message : String(err) }
}
parentPort?.postMessage(output)
