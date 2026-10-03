import { parentPort, workerData } from 'node:worker_threads'
import { runJob, runStreamJob, type EngineInput, type EngineOutput, type StreamInput } from './jobs'

/** Worker entry, bundled to `out/main/engineWorker.js`: a one-shot job answers once; a stream posts until done. */
const input = workerData as EngineInput | StreamInput
if ('stream' in input) {
  runStreamJob(input, (update) => parentPort?.postMessage(update))
} else {
  let output: EngineOutput
  try {
    output = { result: runJob(input) }
  } catch (err) {
    output = { error: err instanceof Error ? err.message : String(err) }
  }
  parentPort?.postMessage(output)
}
