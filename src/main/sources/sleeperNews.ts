import type { NewsItem, PlayerNews } from '@shared/types'

/** Raw `get_player_news` item — only the fields we read; every one may be missing on drift. */
export interface SleeperNewsRawItem {
  source?: string | null
  source_key?: string | number | null
  player_id?: string | null
  /** Milliseconds since the epoch (research §13). */
  published?: number | string | null
  metadata?: {
    title?: string | null
    description?: string | null
    analysis?: string | null
    url?: string | null
  } | null
}

export interface SleeperNewsResponse {
  data?: { get_player_news?: unknown } | null
  errors?: unknown
}

export const SLEEPER_GRAPHQL_URL = 'https://sleeper.com/graphql'
/** Sleeper 403s requests without a User-Agent; the REST client relies on Node's default, the POST names the app. */
export const SLEEPER_NEWS_USER_AGENT = 'FantasyCompanion'
/** Spec §5.2: 25 items cover a season for any one player. */
export const NEWS_LIMIT = 25
export const NEWS_TIMEOUT_MS = 8_000

/** The GraphQL document; the id goes through `JSON.stringify` so it is always a quoted string literal. */
export function newsQuery(playerId: string, limit: number): string {
  return `{get_player_news(sport:"nfl",player_id:${JSON.stringify(playerId)},limit:${limit}){source source_key player_id published metadata}}`
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function httpUrl(value: unknown): string | null {
  const s = text(value)
  return s !== null && /^https?:\/\//i.test(s) ? s : null
}

function publishedIso(value: unknown): string | null {
  const ms = typeof value === 'string' ? Number(value) : value
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  return new Date(ms).toISOString()
}

/**
 * Pure: drops items without a title or a timestamp, keeps one item per id, http(s) links only,
 * newest first.
 */
export function mapPlayerNews(raw: SleeperNewsRawItem[], fetchedAt: string): PlayerNews {
  const seen = new Set<string>()
  const items: NewsItem[] = []
  for (const r of raw) {
    const title = text(r.metadata?.title)
    const publishedAt = publishedIso(r.published)
    if (title === null || publishedAt === null) continue
    const source = text(r.source) ?? 'unknown'
    const key =
      r.source_key === null || r.source_key === undefined ? publishedAt : String(r.source_key)
    const id = `${source}:${key}`
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      id,
      source,
      publishedAt,
      title,
      description: text(r.metadata?.description),
      analysis: text(r.metadata?.analysis),
      url: httpUrl(r.metadata?.url)
    })
  }
  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  return { items, fetchedAt }
}

export class SleeperNewsError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null
  ) {
    super(message)
    this.name = 'SleeperNewsError'
  }
}

export interface SleeperNewsClient {
  /** Rejects on any HTTP error, a non-JSON body, or a payload without `data.get_player_news[]`. */
  getPlayerNews(playerId: string, limit?: number): Promise<PlayerNews>
}

export interface SleeperNewsClientOptions {
  fetchImpl?: typeof fetch
  url?: string
  timeoutMs?: number
  now?: () => Date
}

export function createSleeperNewsClient(options: SleeperNewsClientOptions = {}): SleeperNewsClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = options.url ?? SLEEPER_GRAPHQL_URL
  const timeoutMs = options.timeoutMs ?? NEWS_TIMEOUT_MS
  const now = options.now ?? ((): Date => new Date())

  return {
    async getPlayerNews(playerId, limit = NEWS_LIMIT) {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': SLEEPER_NEWS_USER_AGENT },
        body: JSON.stringify({ query: newsQuery(playerId, limit) }),
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (!res.ok) {
        const body = await res.text()
        throw new SleeperNewsError(`Sleeper news ${res.status}: ${body.slice(0, 200)}`, res.status)
      }
      const payload = (await res.json()) as SleeperNewsResponse | null
      const items = payload?.data?.get_player_news
      if (!Array.isArray(items))
        throw new SleeperNewsError('Sleeper news: unexpected payload shape')
      return mapPlayerNews(items as SleeperNewsRawItem[], now().toISOString())
    }
  }
}
