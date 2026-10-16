import { parentPort, workerData } from 'node:worker_threads'
import type { StatsReply, StatsRequest, StatsWorkerInit } from './protocol'
import { openStatsService, type StatsService } from './service'

/**
 * Worker entry, bundled to `out/main/statsWorker.js` (stats-analysis spec §2): the only thread that
 * opens `stats.duckdb`. Requests run one after another, in arrival order.
 */
const port = parentPort
if (!port) throw new Error('statsWorker must run as a worker thread')
const post = (reply: StatsReply): void => port.postMessage(reply)

let queue: Promise<unknown> = Promise.resolve()
let service: StatsService | null = null

async function handle(request: StatsRequest): Promise<unknown> {
  if (!service) throw new Error('the stats database is not open')
  switch (request.kind) {
    case 'refresh':
      return service.refresh(request.options)
    case 'selfTest':
      return service.selfTest()
    case 'close':
      service.close()
      service = null
      return null
  }
}

openStatsService(workerData as StatsWorkerInit).then(
  (opened) => {
    service = opened
    port.on('message', (request: StatsRequest) => {
      queue = queue.then(async () => {
        try {
          post({ kind: 'reply', id: request.id, ok: true, result: await handle(request) })
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          post({ kind: 'reply', id: request.id, ok: false, error })
        }
        if (request.kind === 'close') port.close()
      })
    })
  },
  (err: unknown) => {
    post({ kind: 'fatal', error: err instanceof Error ? err.message : String(err) })
    port.close()
  }
)
