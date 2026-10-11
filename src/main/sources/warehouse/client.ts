import { fetchText } from '../http'
import { NFLVERSE_RELEASES_URL } from '../nflverse'

/** Sleeper's un-versioned weekly stats; unlike /v1 it gives each row its team and opponent. */
export const SLEEPER_STATS_URL = 'https://api.sleeper.com/stats/nfl'

export type SleeperSeasonType = 'regular' | 'post'

/** The warehouse's downloads (stats-warehouse spec §5). Every method returns null / [] when unpublished. */
export interface WarehouseClient {
  /** An nflverse release file: `<tag>/<name>.csv.gz`, else `<tag>/<name>.csv` (older seasons); null when neither exists. */
  nflverseCsv(tag: string, name: string): Promise<string | null>
  /** Any other file (ffverse); null on 404. */
  text(url: string): Promise<string | null>
  /** One week of Sleeper's stats rows; [] when Sleeper has none. */
  sleeperStats(season: number, week: number, seasonType: SleeperSeasonType): Promise<unknown[]>
}

export class WarehouseHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`HTTP ${status} for ${url}`)
    this.name = 'WarehouseHttpError'
  }
}

export interface WarehouseClientOptions {
  fetchImpl?: typeof fetch
  releasesUrl?: string
  sleeperStatsUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

export function createWarehouseClient(options: WarehouseClientOptions = {}): WarehouseClient {
  const releasesUrl = options.releasesUrl ?? NFLVERSE_RELEASES_URL
  const sleeperStatsUrl = options.sleeperStatsUrl ?? SLEEPER_STATS_URL
  const http = {
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? 30_000,
    retryDelayMs: options.retryDelayMs ?? 1_000
  }
  const get = (url: string): Promise<string | null> =>
    fetchText(url, http, (status, u) => new WarehouseHttpError(status, u))

  return {
    async nflverseCsv(tag, name) {
      const base = `${releasesUrl}/${tag}/${name}`
      return (await get(`${base}.csv.gz`)) ?? (await get(`${base}.csv`))
    },
    text: get,
    async sleeperStats(season, week, seasonType) {
      const url = `${sleeperStatsUrl}/${season}/${week}?season_type=${seasonType}`
      const body = await get(url)
      if (body === null) return []
      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        throw new Error(`Sleeper stats: unreadable response from ${url}`)
      }
      if (!Array.isArray(parsed)) throw new Error(`Sleeper stats: expected a list from ${url}`)
      return parsed
    }
  }
}
