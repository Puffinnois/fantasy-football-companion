export interface FcQuery {
  numTeams: number
  numQbs: number
  /** Points per reception; accepted but does not change the values (research §2). */
  ppr: number
}

export interface FcRecord {
  /** Sleeper id; null for players FantasyCalc has not mapped yet (the sync drops them). */
  sleeperId: string | null
  name: string
  position: string
  value: number
  overallRank: number
  positionRank: number
  trend30Day: number
  tier: number | null
}

/** Raw `/values/current` record; only the fields we read. */
export interface FcRawRecord {
  player: { name: string; sleeperId?: string | number | null; position: string }
  value: number
  overallRank: number
  positionRank: number
  trend30Day?: number | null
  maybeTier?: number | null
}

export function mapFcValues(raw: FcRawRecord[]): FcRecord[] {
  return raw.map((r) => {
    const id = r.player.sleeperId
    return {
      sleeperId: id === null || id === undefined || id === '' ? null : String(id),
      name: r.player.name,
      position: r.player.position,
      value: r.value,
      overallRank: r.overallRank,
      positionRank: r.positionRank,
      trend30Day: r.trend30Day ?? 0,
      tier: r.maybeTier ?? null
    }
  })
}

export class FantasyCalcHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string
  ) {
    super(`FantasyCalc ${status} for ${url}: ${body.slice(0, 200)}`)
    this.name = 'FantasyCalcHttpError'
  }
}

export interface FantasyCalcClient {
  /** `null` when the endpoint is gone (404/410). */
  getValues(query: FcQuery): Promise<FcRecord[] | null>
}

export interface FantasyCalcClientOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

export const FANTASYCALC_URL = 'https://api.fantasycalc.com/values/current'

export function createFantasyCalcClient(options: FantasyCalcClientOptions = {}): FantasyCalcClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? FANTASYCALC_URL
  const timeoutMs = options.timeoutMs ?? 30_000
  const retryDelayMs = options.retryDelayMs ?? 1_000

  return {
    async getValues(query) {
      const params = new URLSearchParams({
        isDynasty: 'false',
        numQbs: String(query.numQbs),
        numTeams: String(query.numTeams),
        ppr: String(query.ppr)
      })
      const url = `${baseUrl}?${params}`
      for (let attempt = 0; ; attempt++) {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
        if (res.status === 404 || res.status === 410) return null
        if (res.ok) return mapFcValues((await res.json()) as FcRawRecord[])
        const body = await res.text()
        if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
          continue
        }
        throw new FantasyCalcHttpError(res.status, url, body)
      }
    }
  }
}
