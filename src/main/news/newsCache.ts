import type { SleeperNewsClient } from '@main/sources/sleeperNews'
import type { PlayerNews } from '@shared/types'

/** Spec §5.2: one POST per player per 15 minutes. */
export const NEWS_TTL_MS = 15 * 60_000
export const NEWS_CACHE_MAX = 64

export interface NewsCache {
  /**
   * Cached per player for `ttlMs`; `force` refetches a fresh entry; a failure is never cached;
   * concurrent calls for one player share the in-flight request.
   */
  get(playerId: string, force?: boolean): Promise<PlayerNews>
  clear(): void
}

export interface NewsCacheOptions {
  ttlMs?: number
  max?: number
  now?: () => number
}

interface Entry {
  promise: Promise<PlayerNews>
  /** Epoch ms after which the entry is stale; `null` while the request is in flight. */
  expiresAt: number | null
}

export function createNewsCache(
  client: SleeperNewsClient,
  options: NewsCacheOptions = {}
): NewsCache {
  const ttlMs = options.ttlMs ?? NEWS_TTL_MS
  const max = options.max ?? NEWS_CACHE_MAX
  const now = options.now ?? Date.now
  const entries = new Map<string, Entry>()

  function start(playerId: string): Entry {
    const entry: Entry = {
      expiresAt: null,
      promise: client.getPlayerNews(playerId).then(
        (news) => {
          entry.expiresAt = now() + ttlMs
          return news
        },
        (err: unknown) => {
          if (entries.get(playerId) === entry) entries.delete(playerId)
          throw err
        }
      )
    }
    return entry
  }

  return {
    get(playerId, force = false) {
      const hit = entries.get(playerId)
      if (hit) {
        const inFlight = hit.expiresAt === null
        const fresh = hit.expiresAt !== null && hit.expiresAt > now()
        if (inFlight || (fresh && !force)) return hit.promise
        entries.delete(playerId)
      }
      if (entries.size >= max) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      const entry = start(playerId)
      entries.set(playerId, entry)
      return entry.promise
    },
    clear() {
      entries.clear()
    }
  }
}
