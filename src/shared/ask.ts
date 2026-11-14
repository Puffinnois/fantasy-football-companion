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

// ---------------------------------------------------------------------------------------------
// The in-app loop (Ask spec §5, §6.2; Plan AG1)

/** Who answers: an Anthropic key, an OpenAI-compatible service, or a local server. */
export type ProviderKind = 'anthropic' | 'openai' | 'ollama' | 'lmstudio'

/** OpenAI-compatible presets (spec §6.2, §14 point 4); `custom` is any other base URL. */
export type ProviderPreset = 'openai' | 'gemini' | 'groq' | 'openrouter' | 'mistral' | 'custom'

/** Native tool calls, or one constrained JSON object per step (spec §5.2). */
export type CallingMode = 'native' | 'structured'

/** Every tool, or the classifier's tool with only the open slots (spec §3.2). */
export type ToolProfile = 'full' | 'compact'

/** One control for every provider (amendment C): Anthropic effort, OpenAI `reasoning_effort`, Ollama `think`. */
export type Reasoning = 'off' | 'low' | 'high'

/** A provider as the renderer sees it: never the key, only whether one is stored. */
export interface ProviderSettings {
  id: number
  kind: ProviderKind
  preset: ProviderPreset | null
  label: string
  baseUrl: string
  model: string
  profile: ToolProfile
  mode: CallingMode
  reasoning: Reasoning
  hasKey: boolean
  /** The provider Ask uses. */
  active: boolean
}

/** What a new or changed provider sets; `key` only when it changes (`''` removes it). */
export type ProviderInput = Omit<ProviderSettings, 'id' | 'hasKey' | 'active'> & {
  key?: string
}

/** A model a server offers, with what it can do (spec §5.2: the calling mode defaults from it). */
export interface ModelInfo {
  id: string
  tools: boolean
  thinking: boolean
  /** Its context window in tokens, when the server says. */
  context: number | null
}

/** A local server found running (spec §6.2). */
export interface LocalServer {
  kind: 'ollama' | 'lmstudio'
  baseUrl: string
  models: ModelInfo[]
}

/** A tool call as the thread keeps it. */
export interface AskCall {
  tool: string
  args: unknown
}

/** What the loop streams to the screen for one turn. */
export type AskEvent =
  | { type: 'status'; text: string }
  | { type: 'call'; call: AskCall }
  | { type: 'result'; outcome: ToolOutcome }
  | { type: 'text'; delta: string }
  | { type: 'done'; message: AskMessage }
  | { type: 'error'; error: string }

/** An answer check (spec §4.3) as the screen shows it. */
export interface AskFlag {
  kind: 'number' | 'sample' | 'base' | 'causal'
  text: string
  at: [number, number]
  message: string
  severity: 'flag' | 'soft'
}

export interface AskThread {
  id: number
  title: string
  createdAt: string
  updatedAt: string
}

export interface AskMessage {
  id: number
  threadId: number
  role: 'user' | 'assistant'
  text: string
  calls: AskCall[]
  results: ToolOutcome[]
  flags: AskFlag[]
  /** How the turn ended: answered, asked back, declined, stopped, or failed. */
  outcome: 'answer' | 'ask' | 'decline' | 'stopped' | 'error' | null
  model: string | null
  tokens: { input: number; output: number } | null
  ms: number | null
  createdAt: string
}

/** Ask's settings (amendment H): the example library and sample-k, both off by default. */
export interface AskOptions {
  examples: boolean
  sampleK: boolean
}
