import { describe, expect, it, vi } from 'vitest'
import { singleFlight, thenInBackground } from '@main/sync/background'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('singleFlight', () => {
  it('returns the running call instead of starting another, then runs again once it settles', async () => {
    const first = deferred<number>()
    const fn = vi.fn((): Promise<number> => first.promise)
    const run = singleFlight(fn)
    const a = run()
    const b = run()
    expect(b).toBe(a)
    expect(fn).toHaveBeenCalledTimes(1)
    first.resolve(1)
    expect(await a).toBe(1)
    fn.mockImplementation(async () => 2)
    expect(await run()).toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('clears the flight after a rejection', async () => {
    const fn = vi
      .fn((): Promise<number> => Promise.resolve(3))
      .mockImplementationOnce(() => Promise.reject(new Error('boom')))
    const run = singleFlight(fn)
    await expect(run()).rejects.toThrow('boom')
    expect(await run()).toBe(3)
  })
})

describe('thenInBackground', () => {
  it('settles with the first promise without waiting for the next run', async () => {
    const next = deferred<void>()
    const start = vi.fn((): Promise<void> => next.promise)
    expect(await thenInBackground(Promise.resolve('core'), start, () => {})).toBe('core')
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('starts the next run after a failure too; the caller still sees the failure', async () => {
    const start = vi.fn(async (): Promise<void> => {})
    await expect(
      thenInBackground(Promise.reject(new Error('core failed')), start, () => {})
    ).rejects.toThrow('core failed')
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('reports a failing or throwing next run to onError only', async () => {
    const onError = vi.fn()
    await thenInBackground(
      Promise.resolve(1),
      () => Promise.reject(new Error('wh failed')),
      onError
    )
    await thenInBackground(
      Promise.resolve(2),
      () => {
        throw new Error('wh threw')
      },
      onError
    )
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2))
    expect(onError.mock.calls.map(([e]) => (e as Error).message).sort()).toEqual([
      'wh failed',
      'wh threw'
    ])
  })
})
