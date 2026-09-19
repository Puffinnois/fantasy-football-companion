import type { ScoringFormat } from '@shared/types'

export type FpRankingType = 'weekly' | 'ros'
/** Weekly `ALL` is remapped to FLX server-side (RB/WR/TE); ROS `ALL` really covers every position. */
export type FpPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST' | 'FLX' | 'ALL'

export interface FpQuery {
  type: FpRankingType
  year: number
  /** Weekly only. */
  week?: number
  position: FpPosition
  scoring: ScoringFormat
}

/** One ranked player, numbers coerced (the API sends `rank_*` as strings in some responses). */
export interface FpPlayer {
  /** FantasyPros id (= crosswalk `fantasypros_id`); a team-level id for DST rows. */
  playerId: string
  name: string
  /** FantasyPros team code (`JAC`, not Sleeper's `JAX`); null for free agents. */
  team: string | null
  /** QB RB WR TE K DST. */
  position: string
  rankEcr: number
  /** Numeric part of `pos_rank` ("RB12" → 12). */
  posRank: number
  rankAve: number | null
  rankStd: number | null
  rankMin: number | null
  rankMax: number | null
  /** Weekly only: `start_sit_grade` ("A+"). */
  grade: string | null
  /** Weekly only: `r2p_pts`, FantasyPros' projected points under the requested scoring. */
  projPts: number | null
}

export interface FpRankings {
  /** 0 = not published yet (the current week before FantasyPros opens it). */
  count: number
  totalExperts: number
  players: FpPlayer[]
  /** Rows without a numeric `rank_ecr` or a parsable `pos_rank`. */
  skipped: number
}

/** Raw `consensus-rankings.php` player; only the fields we read. */
export interface FpRawPlayer {
  player_id: number | string
  player_name: string
  player_team_id?: string | null
  player_position_id: string
  rank_ecr: number | string
  rank_min?: number | string | null
  rank_max?: number | string | null
  rank_ave?: number | string | null
  rank_std?: number | string | null
  pos_rank?: string | null
  start_sit_grade?: string | null
  r2p_pts?: number | string | null
}

export interface FpRawResponse {
  count: number
  total_experts: number
  players?: FpRawPlayer[]
}

const POS_RANK = /^[A-Z]+(\d+)$/

/** "RB12" → 12; null for anything else. */
export function parsePosRank(value: string | null | undefined): number | null {
  const m = POS_RANK.exec(value ?? '')
  return m ? Number(m[1]) : null
}

/** Numbers arrive as numbers or numeric strings; anything else is null. */
export function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function mapFpRankings(raw: FpRawResponse): FpRankings {
  const players: FpPlayer[] = []
  let skipped = 0
  for (const p of raw.players ?? []) {
    const rankEcr = num(p.rank_ecr)
    const posRank = parsePosRank(p.pos_rank)
    if (rankEcr === null || posRank === null) {
      skipped++
      continue
    }
    players.push({
      playerId: String(p.player_id),
      name: p.player_name,
      team: p.player_team_id || null,
      position: p.player_position_id,
      rankEcr,
      posRank,
      rankAve: num(p.rank_ave),
      rankStd: num(p.rank_std),
      rankMin: num(p.rank_min),
      rankMax: num(p.rank_max),
      grade: p.start_sit_grade || null,
      projPts: num(p.r2p_pts)
    })
  }
  return { count: raw.count, totalExperts: raw.total_experts, players, skipped }
}

export class FantasyProsHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string
  ) {
    super(`FantasyPros ${status} for ${url}: ${body.slice(0, 200)}`)
    this.name = 'FantasyProsHttpError'
  }
}

export interface FantasyProsClient {
  /** `null` when the endpoint is gone (404/410). */
  getRankings(query: FpQuery): Promise<FpRankings | null>
}

export interface FantasyProsClientOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

/** Legacy partner endpoint: keyless, no CORS concern in the main process (research §1). */
export const FANTASYPROS_URL = 'https://partners.fantasypros.com/api/v1/consensus-rankings.php'

export function createFantasyProsClient(options: FantasyProsClientOptions = {}): FantasyProsClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? FANTASYPROS_URL
  const timeoutMs = options.timeoutMs ?? 30_000
  const retryDelayMs = options.retryDelayMs ?? 1_000

  return {
    async getRankings(query) {
      const params = new URLSearchParams({
        sport: 'nfl',
        year: String(query.year),
        type: query.type,
        position: query.position,
        scoring: query.scoring
      })
      if (query.week !== undefined) params.set('week', String(query.week))
      const url = `${baseUrl}?${params}`
      for (let attempt = 0; ; attempt++) {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
        if (res.status === 404 || res.status === 410) return null
        if (res.ok) return mapFpRankings((await res.json()) as FpRawResponse)
        const body = await res.text()
        if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
          continue
        }
        throw new FantasyProsHttpError(res.status, url, body)
      }
    }
  }
}
