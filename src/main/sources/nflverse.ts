import { gunzipSync } from 'node:zlib'
import { numOrNull, parseCsv, strOrNull } from './csv'
import type {
  CrosswalkRecord,
  GameRecord,
  PlayerWeekStatsRecord,
  SnapCountRecord,
  TeamWeekStatsRecord
} from './nflverse-types'

export interface ParseResult<T> {
  records: T[]
  /** Rows missing a key field (id, season or week); logged by the sync, never fatal. */
  skipped: number
}

const PLAYER_DIMS = new Set([
  'player_id',
  'player_name',
  'player_display_name',
  'position',
  'position_group',
  'headshot_url',
  'season',
  'week',
  'season_type',
  'game_id',
  'team',
  'opponent_team'
])
const TEAM_DIMS = new Set(['season', 'week', 'team', 'season_type', 'game_id', 'opponent_team'])
/** Text columns that would parse as a number when they hold a single value ("45"). */
const LIST_COLUMNS = new Set(['fg_made_list', 'fg_missed_list', 'fg_blocked_list'])

function numericColumns(row: Record<string, string>, dims: Set<string>): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const [col, raw] of Object.entries(row)) {
    if (dims.has(col) || LIST_COLUMNS.has(col)) continue
    const n = numOrNull(raw)
    if (n !== null) stats[col] = n
  }
  return stats
}

export function parsePlayerWeekStats(text: string): ParseResult<PlayerWeekStatsRecord> {
  const records: PlayerWeekStatsRecord[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const gsisId = strOrNull(row.player_id)
    const season = numOrNull(row.season)
    const week = numOrNull(row.week)
    if (!gsisId || season === null || week === null) {
      skipped++
      continue
    }
    records.push({
      gsisId,
      season,
      week,
      seasonType: row.season_type ?? '',
      playerName: strOrNull(row.player_display_name),
      position: strOrNull(row.position),
      team: strOrNull(row.team),
      opponent: strOrNull(row.opponent_team),
      stats: numericColumns(row, PLAYER_DIMS)
    })
  }
  return { records, skipped }
}

export function parseTeamWeekStats(text: string): ParseResult<TeamWeekStatsRecord> {
  const records: TeamWeekStatsRecord[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const team = strOrNull(row.team)
    const season = numOrNull(row.season)
    const week = numOrNull(row.week)
    if (!team || season === null || week === null) {
      skipped++
      continue
    }
    records.push({
      team,
      season,
      week,
      seasonType: row.season_type ?? '',
      opponent: strOrNull(row.opponent_team),
      stats: numericColumns(row, TEAM_DIMS)
    })
  }
  return { records, skipped }
}

export function parseSnapCounts(text: string): ParseResult<SnapCountRecord> {
  const records: SnapCountRecord[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const pfrId = strOrNull(row.pfr_player_id)
    const season = numOrNull(row.season)
    const week = numOrNull(row.week)
    if (!pfrId || season === null || week === null) {
      skipped++
      continue
    }
    records.push({
      pfrId,
      season,
      week,
      gameType: row.game_type ?? '',
      player: strOrNull(row.player),
      position: strOrNull(row.position),
      team: strOrNull(row.team),
      opponent: strOrNull(row.opponent),
      offenseSnaps: numOrNull(row.offense_snaps),
      offensePct: numOrNull(row.offense_pct),
      defenseSnaps: numOrNull(row.defense_snaps),
      defensePct: numOrNull(row.defense_pct),
      stSnaps: numOrNull(row.st_snaps),
      stPct: numOrNull(row.st_pct)
    })
  }
  return { records, skipped }
}

export function parseGames(text: string): ParseResult<GameRecord> {
  const records: GameRecord[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const gameId = strOrNull(row.game_id)
    const season = numOrNull(row.season)
    const week = numOrNull(row.week)
    const homeTeam = strOrNull(row.home_team)
    const awayTeam = strOrNull(row.away_team)
    if (!gameId || season === null || week === null || !homeTeam || !awayTeam) {
      skipped++
      continue
    }
    records.push({
      gameId,
      season,
      week,
      gameType: row.game_type ?? '',
      gameday: strOrNull(row.gameday),
      homeTeam,
      awayTeam,
      homeScore: numOrNull(row.home_score),
      awayScore: numOrNull(row.away_score)
    })
  }
  return { records, skipped }
}

export function parseCrosswalk(text: string): ParseResult<CrosswalkRecord> {
  const records = parseCsv(text).map((row) => ({
    sleeperId: strOrNull(row.sleeper_id),
    gsisId: strOrNull(row.gsis_id)?.trim() ?? null,
    pfrId: strOrNull(row.pfr_id),
    sportradarId: strOrNull(row.sportradar_id),
    espnId: strOrNull(row.espn_id),
    name: strOrNull(row.name),
    position: strOrNull(row.position)
  }))
  return { records, skipped: 0 }
}

export interface NflverseClient {
  /** `null` when the season's file is not published yet (HTTP 404). */
  getPlayerWeekStats(season: number): Promise<ParseResult<PlayerWeekStatsRecord> | null>
  getTeamWeekStats(season: number): Promise<ParseResult<TeamWeekStatsRecord> | null>
  getSnapCounts(season: number): Promise<ParseResult<SnapCountRecord> | null>
  getGames(): Promise<ParseResult<GameRecord>>
  getCrosswalk(): Promise<ParseResult<CrosswalkRecord>>
}

export class NflverseHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`nflverse ${status} for ${url}`)
    this.name = 'NflverseHttpError'
  }
}

export interface NflverseClientOptions {
  fetchImpl?: typeof fetch
  releasesUrl?: string
  crosswalkUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

export const NFLVERSE_RELEASES_URL = 'https://github.com/nflverse/nflverse-data/releases/download'
export const CROSSWALK_URL =
  'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv'

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

export function createNflverseClient(options: NflverseClientOptions = {}): NflverseClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const releasesUrl = options.releasesUrl ?? NFLVERSE_RELEASES_URL
  const crosswalkUrl = options.crosswalkUrl ?? CROSSWALK_URL
  const timeoutMs = options.timeoutMs ?? 30_000
  const retryDelayMs = options.retryDelayMs ?? 1_000

  /** Follows GitHub's redirect (fetch default), gunzips `.gz` bodies (detected by magic bytes). */
  async function getText(url: string): Promise<string | null> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 404) return null
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer())
        const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
        return new TextDecoder().decode(gzipped ? gunzipSync(bytes) : bytes)
      }
      if (attempt === 0 && isRetryable(res.status)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        continue
      }
      throw new NflverseHttpError(res.status, url)
    }
  }

  const release = (tag: string, file: string): string => `${releasesUrl}/${tag}/${file}`

  async function optional<T>(
    url: string,
    parse: (text: string) => ParseResult<T>
  ): Promise<ParseResult<T> | null> {
    const text = await getText(url)
    return text === null ? null : parse(text)
  }

  async function required<T>(
    url: string,
    parse: (text: string) => ParseResult<T>
  ): Promise<ParseResult<T>> {
    const result = await optional(url, parse)
    if (!result) throw new NflverseHttpError(404, url)
    return result
  }

  return {
    getPlayerWeekStats: (season) =>
      optional(release('stats_player', `stats_player_week_${season}.csv.gz`), parsePlayerWeekStats),
    getTeamWeekStats: (season) =>
      optional(release('stats_team', `stats_team_week_${season}.csv.gz`), parseTeamWeekStats),
    getSnapCounts: (season) =>
      optional(release('snap_counts', `snap_counts_${season}.csv.gz`), parseSnapCounts),
    getGames: () => required(release('schedules', 'games.csv'), parseGames),
    getCrosswalk: () => required(crosswalkUrl, parseCrosswalk)
  }
}
