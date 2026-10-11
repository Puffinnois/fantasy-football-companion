import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEmitter } from 'node:events'
import { PBP_OUT_OF_MEMORY, PBP_UNREADABLE, runPbpWorker } from '@main/warehouse/runWorker'

type FakeWorker = EventEmitter & {
  terminated: boolean
  options: { workerData: unknown; transferList: unknown[] }
}

const { workers } = vi.hoisted(() => ({ workers: [] as FakeWorker[] }))

/** A worker that never runs: the test emits its events. */
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  class Worker extends EventEmitter {
    terminated = false
    constructor(
      _path: string,
      public options: unknown
    ) {
      super()
      workers.push(this as unknown as FakeWorker)
    }
    terminate(): Promise<number> {
      this.terminated = true
      return Promise.resolve(0)
    }
  }
  return { Worker }
})

beforeEach(() => {
  workers.length = 0
})

const RESULT = { playerWeeks: [], teamWeeks: [], skipped: 2 }

describe('runPbpWorker (spec §6.1)', () => {
  it('transfers the bytes and resolves with the answer', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const done = runPbpWorker(bytes)
    expect(workers[0].options).toEqual({ workerData: { pbp: bytes }, transferList: [bytes.buffer] })
    workers[0].emit('message', { result: RESULT })
    await expect(done).resolves.toEqual(RESULT)
    expect(workers[0].terminated).toBe(true)
  })

  it('rejects with the worker’s error, wording memory and unreadable answers', async () => {
    const answers = [
      ['message', { error: 'pbp: column "game_id" is missing' }],
      ['messageerror', new Error('could not deserialize')],
      ['error', Object.assign(new Error('heap'), { code: 'ERR_WORKER_OUT_OF_MEMORY' })],
      ['exit', 1]
    ] as const
    const messages: string[] = []
    for (const [event, payload] of answers) {
      const done = runPbpWorker(new Uint8Array([1]))
      workers[workers.length - 1].emit(event, payload)
      messages.push(
        await done.then(
          () => 'resolved',
          (err: Error) => err.message
        )
      )
    }
    expect(messages).toEqual([
      'pbp: column "game_id" is missing',
      PBP_UNREADABLE,
      PBP_OUT_OF_MEMORY,
      'Play-by-play aggregation stopped unexpectedly (exit 1)'
    ])
  })
})
