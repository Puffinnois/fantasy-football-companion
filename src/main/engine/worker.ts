import { parentPort, workerData } from 'node:worker_threads'
import { runJob, type EngineInput, type EngineOutput } from './jobs'

/** Worker entry, bundled to `out/main/engineWorker.js`. */
const input = workerData as EngineInput
let output: EngineOutput
try {
  output = { result: runJob(input) }
} catch (err) {
  output = { error: err instanceof Error ? err.message : String(err) }
}
parentPort?.postMessage(output)
