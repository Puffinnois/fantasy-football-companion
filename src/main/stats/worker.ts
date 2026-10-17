import { parentPort, workerData } from 'node:worker_threads'
import { READ_REQUESTS, type StatsReply, type StatsRequest, type StatsWorkerInit } from './protocol'
import { openStatsService, type StatsService } from './service'

/**
 * Worker entry, bundled to `out/main/statsWorker.js` (stats-analysis spec §2): the only thread that
 * opens `stats.duckdb`. Writes (refresh, league rules, self-test, close) run one after another, in
 * arrival order; reads (queries, catalogue, status) run at once on the read connection, so a screen
 * never waits behind a refresh.
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
    case 'setLeague':
      return service.setLeague(request.rules)
    case 'selfTest':
      return service.selfTest()
    case 'query':
      return service.query(request.query)
    case 'catalogue':
      return service.catalogue()
    case 'status':
      return service.status()
    case 'close':
      await service.close()
      service = null
      return null
  }
}

async function answer(request: StatsRequest): Promise<void> {
  try {
    post({ kind: 'reply', id: request.id, ok: true, result: await handle(request) })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    post({ kind: 'reply', id: request.id, ok: false, error })
  }
}

openStatsService(workerData as StatsWorkerInit, (entry) => post({ kind: 'step', entry })).then(
  (opened) => {
    service = opened
    port.on('message', (request: StatsRequest) => {
      if (READ_REQUESTS.has(request.kind)) {
        void answer(request)
        return
      }
      // A close must not wait behind a refresh: stop it now, then close in turn.
      if (request.kind === 'close') service?.cancel()
      queue = queue.then(async () => {
        await answer(request)
        if (request.kind === 'close') port.close()
      })
    })
  },
  (err: unknown) => {
    post({ kind: 'fatal', error: err instanceof Error ? err.message : String(err) })
    port.close()
  }
)
