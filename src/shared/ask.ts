import type {
  GameForecast,
  MetricInfo,
  PlayerOutlook,
  StatsQuery,
  StatsResult
} from './stats/types'

/**
 * Ask (Ask spec §3.3, §8): what an analyst tool returns. The model reads `text`, compact and
 * rounded; the screen renders `cards` from the engine's rows, never from the model's prose; "Show
 * query" lists `queries`. The same shape is the MCP tools' `outputSchema` (Plan AF2).
 */
export type ToolName =
  | 'find'
  | 'leaderboard'
  | 'player_stats'
  | 'team_stats'
  | 'compare'
  | 'trend'
  | 'outlook'
  | 'games'
  | 'league'
  | 'describe'
  | 'query'

export type ChartKind = 'table' | 'bar' | 'line' | 'scatter'

/** A split row's comparison with its base row (Ask spec §3.3, report D5). */
export interface SplitStat {
  /** The split's value minus the base's (raw values). */
  diff: number | null
  /** A 95 % interval for that difference; null for counts or without a stability estimate. */
  interval: [number, number] | null
  /** The difference is inside its interval's noise band. */
  withinNoise: boolean | null
}

export interface StatsCard {
  kind: 'stats'
  title: string
  result: StatsResult
  /** For a split: the row of the whole scope, and each split row's comparison by metric. */
  base: StatsResult['rows'][number] | null
  splits: Record<string, Record<string, SplitStat>> | null
  chart: ChartKind
}

export type ResultCard =
  | StatsCard
  | { kind: 'games'; title: string; games: GameForecast[] }
  | { kind: 'outlook'; title: string; outlook: PlayerOutlook }
  | { kind: 'describe'; title: string; metric: MetricInfo; aliases: string[] }
  | { kind: 'list'; title: string; columns: string[]; rows: (string | number | null)[][] }

export interface ToolResult {
  ok: true
  tool: ToolName
  title: string
  /** What the model reads (Ask spec §3.3: at most 15 rows × 6 columns unless `detail: full`). */
  text: string
  cards: ResultCard[]
  notes: string[]
  queries: StatsQuery[]
  ms: number
  /** Every query came from the cache. */
  cached: boolean
}

/** An invalid call: why, and how to fix it (Ask spec §3.3, "errors teach"). Never a stack trace. */
export interface ToolError {
  ok: false
  tool: string
  error: string
  ms: number
}

export type ToolOutcome = ToolResult | ToolError

/**
 * Stats › Ask, Claude over MCP (Ask spec §6.1): the server's state and where Claude desktop's config
 * stands. The token never reaches the renderer; the copy buttons put the commands on the clipboard
 * from main.
 */
export interface McpStatus {
  enabled: boolean
  /** Windows shows the Claude desktop and WSL parts. */
  windows: boolean
  /** The server listens on `url`. */
  running: boolean
  url: string | null
  /** Why it is not running although it is on. */
  error: string | null
  claudeDesktop: {
    path: string | null
    state: 'added' | 'outdated' | 'absent' | 'unreadable' | 'not-found'
  }
}

/** What a copy button puts on the clipboard. */
export type McpCopy = 'claude-code' | 'claude-code-wsl' | 'claude-desktop'
