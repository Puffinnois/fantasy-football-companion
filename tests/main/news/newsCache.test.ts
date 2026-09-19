import { describe, expect, it } from 'vitest'
import {
  createNewsCache,
  NEWS_TTL_MS,
  type NewsCache,
  type NewsCacheOptions
} from '@main/news/newsCache'
import type { SleeperNewsClient } from '@main/sources/sleeperNews'
import type { PlayerNews } from '@shared/types'

interface Harness {
  cache: NewsCache
  calls: string[]
  advance: (ms: number) => void
  failNext: () => void
  /** Holds the next request until the returned function is called. */
  holdNext: () => (news: PlayerNews) => void
}

function setup(options: NewsCacheOptions = {}): Harness {
  let t = 1_000_000
  let fail = false
  type Resolve = (news: PlayerNews) => void
  let hold: ((resolve: Resolve) => void) | null = null
  const calls: string[] = []
  const client: SleeperNewsClient = {
    getPlayerNews(playerId) {
      calls.push(playerId)
      if (fail) {
        fail = false
        return Promise.reject(new Error('boom'))
      }
      if (hold) {
        const release = hold
        hold = null
        return new Promise<PlayerNews>((resolve) => {
          release(resolve)
        })
      }
      return Promise.resolve({ items: [], fetchedAt: `t${t}` })
    }
  }
  const cache = createNewsCache(client, { ...options, now: () => t })
  return {
    cache,
    calls,
    advance: (ms) => {
      t += ms
    },
    failNext: () => {
      fail = true
    },
    holdNext: () => {
      let resolveNews: Resolve | null = null
      hold = (resolve) => {
        resolveNews = resolve
      }
      return (news) => resolveNews?.(news)
    }
  }
}

describe('createNewsCache', () => {
  it('serves a second request within the TTL from memory', async () => {
    const { cache, calls } = setup()
    const first = await cache.get('4046')
    expect(await cache.get('4046')).toBe(first)
    expect(calls).toEqual(['4046'])
  })

  it('refetches once the TTL has passed', async () => {
    const { cache, calls, advance } = setup()
    await cache.get('4046')
    advance(NEWS_TTL_MS - 1)
    await cache.get('4046')
    advance(2)
    await cache.get('4046')
    expect(calls).toEqual(['4046', '4046'])
  })

  it('never caches a failure', async () => {
    const { cache, calls, failNext } = setup()
    failNext()
    await expect(cache.get('4046')).rejects.toThrow('boom')
    await expect(cache.get('4046')).resolves.toMatchObject({ items: [] })
    expect(calls).toEqual(['4046', '4046'])
  })

  it('force bypasses a fresh entry and replaces it', async () => {
    const { cache, calls, advance } = setup()
    await cache.get('4046')
    advance(1_000)
    const forced = await cache.get('4046', true)
    expect(forced.fetchedAt).toBe('t1001000')
    expect(await cache.get('4046')).toBe(forced)
    expect(calls).toEqual(['4046', '4046'])
  })

  it('coalesces concurrent requests for the same player, force included', async () => {
    const { cache, calls, holdNext } = setup()
    const release = holdNext()
    const a = cache.get('4046')
    const b = cache.get('4046')
    const c = cache.get('4046', true)
    release({ items: [], fetchedAt: 'held' })
    const [ra, rb, rc] = await Promise.all([a, b, c])
    expect(ra).toBe(rb)
    expect(rb).toBe(rc)
    expect(calls).toEqual(['4046'])
  })

  it('keeps players apart and evicts the oldest beyond the limit', async () => {
    const { cache, calls } = setup({ max: 2 })
    await cache.get('1')
    await cache.get('2')
    await cache.get('3')
    await cache.get('2')
    await cache.get('1')
    expect(calls).toEqual(['1', '2', '3', '1'])
  })

  it('clear() forgets everything', async () => {
    const { cache, calls } = setup()
    await cache.get('4046')
    cache.clear()
    await cache.get('4046')
    expect(calls).toEqual(['4046', '4046'])
  })
})
