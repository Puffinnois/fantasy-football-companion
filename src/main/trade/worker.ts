import { parentPort, workerData } from 'node:worker_threads'
import { suggestFromDb } from './fromDb'
import type { SuggestWorkerInput, SuggestWorkerOutput } from './runSuggest'

/**
 * Worker entry (bundled to `out/main/tradeWorker.js`). Errors cross the thread boundary as a
 * message rather than an exception so `TradeError`'s user-facing text survives.
 */
const input = workerData as SuggestWorkerInput
let output: SuggestWorkerOutput
try {
  output = { suggestions: suggestFromDb(input.dbPath, input.leagueId, input.query) }
} catch (err) {
  output = { error: err instanceof Error ? err.message : String(err) }
}
parentPort?.postMessage(output)
