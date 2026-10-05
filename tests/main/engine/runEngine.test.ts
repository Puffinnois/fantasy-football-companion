import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEmitter } from 'node:events'
import {
  JOB_OUT_OF_MEMORY,
  runEngine,
  runEngineStream,
  SEARCH_OUT_OF_MEMORY,
  UNREADABLE
} from '@main/engine/runEngine'
import type { SuggestUpdate, TradeSuggestQuery } from '@shared/types'

type FakeWorker = EventEmitter & { terminated: boolean }

const { workers } = vi.hoisted(() => ({ workers: [] as FakeWorker[] }))

/** A worker that never runs: the test emits its events. */
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  class Worker extends EventEmitter {
    terminated = false
    constructor() {
      super()
      workers.push(this)
    }
    terminate(): Promise<number> {
      this.terminated = true
      return Promise.resolve(0)
    }
  }
  return { Worker }
})

const QUERY: TradeSuggestQuery = {
  season: 2026,
  focus: null,
  stance: 'fair',
  maxTeams: 3,
  mustInclude: null
}

const outOfMemory = (): Error =>
  Object.assign(
    new Error('Worker terminated due to reaching memory limit: JS heap out of memory'),
    {
      code: 'ERR_WORKER_OUT_OF_MEMORY'
    }
  )

beforeEach(() => {
  workers.length = 0
})

describe('runEngineStream on a failing worker (follow-ups §4)', () => {
  const start = (): SuggestUpdate[] => {
    const updates: SuggestUpdate[] = []
    runEngineStream('db', 'L', { kind: 'tradeSuggest', query: QUERY }, (u) => updates.push(u))
    return updates
  }

  it('turns an unreadable message into an error and ends the worker', () => {
    const updates = start()
    workers[0].emit('messageerror', new Error('could not deserialize'))
    expect(updates).toEqual([{ type: 'error', message: UNREADABLE }])
    expect(workers[0].terminated).toBe(true)
    workers[0].emit('exit', 1) // nothing more after the end
    expect(updates).toHaveLength(1)
  })

  it('words a worker that ran out of memory', () => {
    const updates = start()
    workers[0].emit('error', outOfMemory())
    expect(updates).toEqual([{ type: 'error', message: SEARCH_OUT_OF_MEMORY }])
    expect(workers[0].terminated).toBe(true)
  })

  it('keeps any other worker error as it is', () => {
    const updates = start()
    workers[0].emit('error', new Error('boom'))
    expect(updates).toEqual([{ type: 'error', message: 'boom' }])
  })
})

describe('runEngine on a failing worker (follow-ups §4)', () => {
  it('rejects on an unreadable message and ends the worker', async () => {
    const result = runEngine('db', 'L', { kind: 'waiverAdds', season: 2026 })
    workers[0].emit('messageerror', new Error('could not deserialize'))
    await expect(result).rejects.toThrow(UNREADABLE)
    expect(workers[0].terminated).toBe(true)
  })

  it('words a worker that ran out of memory', async () => {
    const result = runEngine('db', 'L', { kind: 'waiverAdds', season: 2026 })
    workers[0].emit('error', outOfMemory())
    await expect(result).rejects.toThrow(JOB_OUT_OF_MEMORY)
  })
})
