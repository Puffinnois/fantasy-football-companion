import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperNflState,
  SleeperPlayer,
  SleeperRoster,
  SleeperUser
} from './sleeper-types'

export interface SleeperClient {
  getUser(username: string): Promise<SleeperUser | null>
  getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]>
  getLeague(leagueId: string): Promise<SleeperLeague | null>
  getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]>
  getLeagueRosters(leagueId: string): Promise<SleeperRoster[]>
  getAllPlayers(): Promise<Record<string, SleeperPlayer>>
  getNflState(): Promise<SleeperNflState>
}

export class SleeperHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string
  ) {
    super(`Sleeper ${status} for ${url}: ${body.slice(0, 200)}`)
    this.name = 'SleeperHttpError'
  }
}

export interface SleeperClientOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

export function createSleeperClient(options: SleeperClientOptions = {}): SleeperClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? 'https://api.sleeper.app/v1'
  const timeoutMs = options.timeoutMs ?? 30_000
  const retryDelayMs = options.retryDelayMs ?? 1_000

  async function getJson<T>(path: string): Promise<T | null> {
    const url = `${baseUrl}${path}`
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 404) return null
      if (res.ok) return (await res.json()) as T | null
      const body = await res.text()
      if (attempt === 0 && isRetryable(res.status)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        continue
      }
      throw new SleeperHttpError(res.status, url, body)
    }
  }

  async function getJsonRequired<T>(path: string): Promise<T> {
    const value = await getJson<T>(path)
    if (value === null) throw new SleeperHttpError(404, `${baseUrl}${path}`, 'not found')
    return value
  }

  return {
    getUser: (username) => getJson<SleeperUser>(`/user/${encodeURIComponent(username)}`),
    getUserLeagues: (userId, season) =>
      getJsonRequired<SleeperLeague[]>(`/user/${userId}/leagues/nfl/${season}`),
    getLeague: (leagueId) => getJson<SleeperLeague>(`/league/${leagueId}`),
    getLeagueUsers: (leagueId) => getJsonRequired<SleeperLeagueUser[]>(`/league/${leagueId}/users`),
    getLeagueRosters: (leagueId) => getJsonRequired<SleeperRoster[]>(`/league/${leagueId}/rosters`),
    getAllPlayers: () => getJsonRequired<Record<string, SleeperPlayer>>('/players/nfl'),
    getNflState: () => getJsonRequired<SleeperNflState>('/state/nfl')
  }
}
