import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolOutcome } from '@shared/ask'
import { METRIC_ALIASES, phraseKey } from '@shared/stats/aliases'
import { CATALOGUE } from '@shared/stats/catalogue'
import type { StatsQuery } from '@shared/stats/types'
import type { AnswerCheck } from './checks'
import type { ContextBlock } from './resolve'

/**
 * A trace per turn (Ask spec §5.3): what the resolver saw, each tool call and its queries, the
 * answer checks, the tokens and the time, with the hash of the brief used. Threads keep a summary;
 * in Dev mode the whole trace goes to `<userData>/ask/log.jsonl`, the corpus of real questions the
 * evaluation set and the example library grow from.
 */
export interface TraceCall {
  tool: string
  args: unknown
  ok: boolean
  error?: string
  ms: number
  cached: boolean
  /** Each engine query as a hash: the replay re-runs them (Plan AG). */
  queries: string[]
  rows: number
}

export interface Trace {
  at: string
  question: string
  /** The brief's hash, and the tool definitions' (`toolsHash`). */
  brief: string
  tools: string
  profile: 'full' | 'compact'
  model: string | null
  mode: 'native' | 'structured' | null
  resolver: {
    type: string
    tool: string | null
    players: string[]
    ambiguous: number
    teams: string[]
    opponents: string[]
    metrics: string[]
    time: string[]
  }
  calls: TraceCall[]
  checks: { kind: AnswerCheck['kind']; text: string }[]
  tokens: { input: number; output: number } | null
  ms: number
}

export const queryHash = (q: StatsQuery): string =>
  createHash('sha256').update(JSON.stringify(q)).digest('hex').slice(0, 12)

export function traceCall(tool: string, args: unknown, outcome: ToolOutcome): TraceCall {
  if (!outcome.ok)
    return {
      tool,
      args,
      ok: false,
      error: outcome.error,
      ms: outcome.ms,
      cached: false,
      queries: [],
      rows: 0
    }
  const rows = outcome.cards.reduce(
    (n, c) => n + (c.kind === 'stats' ? c.result.rows.length : 0),
    0
  )
  return {
    tool,
    args,
    ok: true,
    ms: outcome.ms,
    cached: outcome.cached,
    queries: outcome.queries.map(queryHash),
    rows
  }
}

export function resolverTrace(b: ContextBlock): Trace['resolver'] {
  return {
    type: b.type,
    tool: b.tool,
    players: b.players.map((p) => p.id),
    ambiguous: b.ambiguous.length,
    teams: b.teams.map((t) => t.code),
    opponents: b.opponents.map((t) => t.code),
    metrics: b.metrics.map((m) => m.id),
    time: b.time.said
  }
}

/** Appends one trace as a line of `log.jsonl` in `dir`. */
export function appendTrace(dir: string, trace: Trace): void {
  mkdirSync(dir, { recursive: true })
  appendFileSync(join(dir, 'log.jsonl'), `${JSON.stringify(trace)}\n`)
}

/** Metric phrases, longest first, for masking. */
const METRIC_PHRASES = CATALOGUE.flatMap((m) => [m.label, ...(METRIC_ALIASES[m.id] ?? [])])
  .map(phraseKey)
  .filter((p) => p.length >= 3)
  .sort((a, b) => b.length - a.length)

/**
 * A question with its specifics masked (report D9, DAIL-SQL): players, teams, metrics, seasons and
 * numbers, so "who leads WRs in YPRR since week 5" finds "who leads TEs in target share since week 3".
 */
export function maskQuestion(b: ContextBlock): string {
  let t = ` ${phraseKey(b.question)} `
  for (const p of b.players) t = t.replace(` ${phraseKey(p.mention)} `, ' {player} ')
  for (const x of b.teams) t = t.replace(` ${phraseKey(x.mention)} `, ' {team} ')
  for (const x of b.opponents) t = t.replace(` ${phraseKey(x.mention)} `, ' {opponent} ')
  for (const phrase of METRIC_PHRASES) {
    if (t.includes(` ${phrase} `)) {
      t = t.replace(` ${phrase} `, ' {metric} ')
      break
    }
  }
  t = t.replace(
    / (wrs?|rbs?|tes?|qbs?|wide receivers?|running backs?|tight ends?|quarterbacks?|receivers?) /g,
    ' {position} '
  )
  t = t.replace(/(?<= )20\d\d(?= )/g, '{season}').replace(/(?<= )\d+(?= )/g, '{n}')
  return t.trim().replace(/\s+/g, ' ')
}
