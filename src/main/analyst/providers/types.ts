import type { ModelInfo, Reasoning } from '@shared/ask'
import type { Schema } from '../schema'

/**
 * One interface for every model the loop can call (Ask spec §6.2): Anthropic, an OpenAI-compatible
 * service, or a local server. The loop speaks this neutral conversation; each adapter maps it to its
 * API and back.
 */
export interface ToolSpec {
  name: string
  description: string
  schema: Schema
}

export interface ToolCall {
  id: string
  name: string
  /** Parsed arguments; a string when the model's JSON did not parse. */
  args: unknown
}

export interface ToolReply {
  id: string
  name: string
  text: string
  error: boolean
}

export type ChatMessage =
  | { role: 'user'; text: string }
  | {
      role: 'assistant'
      text: string
      calls: ToolCall[]
      /**
       * The provider's own content for this turn, sent back unchanged by the same provider
       * (Anthropic's thinking blocks must be: preserved thinking). `by` names who wrote it.
       */
      native?: { by: string; content: unknown }
    }
  | { role: 'tool'; results: ToolReply[] }

export interface ChatRequest {
  system: string
  messages: ChatMessage[]
  /** Native tool calling. */
  tools?: ToolSpec[]
  /** Structured mode: the reply is one JSON object following this schema (spec §5.2). */
  json?: { name: string; schema: Schema }
  /** The output cap for this call (spec §5.1). */
  maxTokens: number
  reasoning: Reasoning
}

export type StopReason = 'end' | 'tool' | 'length' | 'refusal'

export interface ChatReply {
  text: string
  calls: ToolCall[]
  usage: { input: number; output: number }
  stop: StopReason
  /** For the next request of the same conversation (see `ChatMessage.native`). */
  native?: { by: string; content: unknown }
}

export interface Provider {
  /** "Anthropic · claude-opus-5-5", for the answer's model chip and traces. */
  readonly label: string
  readonly model: string
  chat(
    request: ChatRequest,
    signal: AbortSignal,
    onText?: (delta: string) => void
  ): Promise<ChatReply>
  /** The models it offers, for the Model section. */
  models(signal: AbortSignal): Promise<ModelInfo[]>
}

/** How a turn ends when the model refuses (Ask spec §17 K): never as an answer, never retried. */
export const DECLINED = 'The model declined to answer this question.'

/** A failure the user can act on: a bad key, a rate limit, a server that is not running. */
export type ProviderErrorKind = 'auth' | 'rate' | 'unreachable' | 'server' | 'request' | 'refusal'

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly retryAfter: number | null = null
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

/** The arguments as JSON, or the raw text when they do not parse (the loop teaches the fix). */
export function parseArgs(raw: string): unknown {
  if (raw.trim() === '') return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

/** An HTTP status as a provider error, with the server's own message when it gave one. */
export function httpError(
  who: string,
  status: number,
  body: string,
  retryAfter: string | null
): ProviderError {
  let detail = body.slice(0, 300)
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    detail = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? detail
  } catch {
    // not JSON: keep the text
  }
  const wait = retryAfter && Number.isFinite(Number(retryAfter)) ? Number(retryAfter) : null
  if (status === 401 || status === 403)
    return new ProviderError('auth', `${who} refused the key (${status}): ${detail}`)
  if (status === 429)
    return new ProviderError(
      'rate',
      `${who} is rate limiting this key${wait ? `; try again in ${wait} s` : ''}: ${detail}`,
      wait
    )
  if (status >= 500)
    return new ProviderError('server', `${who} had an error (${status}): ${detail}`)
  return new ProviderError('request', `${who} rejected the request (${status}): ${detail}`)
}

/** A fetch that failed before any answer: the server is not running, or there is no network. */
export function unreachable(who: string, url: string, err: unknown): ProviderError {
  if (err instanceof Error && err.name === 'AbortError') throw err
  return new ProviderError(
    'unreachable',
    `${who} did not answer at ${url}: ${err instanceof Error ? err.message : String(err)}`
  )
}

/**
 * `lines`, with a body that fails while it is read (the connection dropped) as a provider error. An
 * abort stays an abort: the loop reports it as stopped or timed out.
 */
export async function* replyLines(
  who: string,
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): AsyncGenerator<string> {
  try {
    yield* lines(body)
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) throw err
    throw new ProviderError(
      'unreachable',
      `${who} stopped answering mid-reply: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/** Splits a fetch body into lines as they arrive (SSE and NDJSON). */
export async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    let at = buffer.indexOf('\n')
    while (at >= 0) {
      yield buffer.slice(0, at).replace(/\r$/, '')
      buffer = buffer.slice(at + 1)
      at = buffer.indexOf('\n')
    }
  }
  buffer += decoder.decode()
  if (buffer.length > 0) yield buffer
}

export type Fetch = typeof fetch

/**
 * The answer without the model's reasoning. Some local models reason in the text even with
 * reasoning off (a thinking-only model, such as Ollama's `qwen3:4b` today): everything up to the
 * last `</think>` is reasoning, and so is a `<think>` block.
 */
/**
 * Streamed text without `<think>…</think>` spans, for `onText`: text inside a span is never emitted,
 * and a tag split across chunks is held back until it is whole. Leading blank space is skipped, as
 * `stripThinking` trims it.
 */
export function thinkingFilter(emit: (delta: string) => void): {
  push: (delta: string) => void
  end: () => void
} {
  const OPEN = '<think>'
  const CLOSE = '</think>'
  let pending = ''
  let inside = false
  let started = false
  const out = (text: string): void => {
    const t = started ? text : text.trimStart()
    if (t === '') return
    started = true
    emit(t)
  }
  /** How many characters at the end of `s` could start `tag`. */
  const partial = (s: string, tag: string): number => {
    for (let k = Math.min(tag.length - 1, s.length); k > 0; k--)
      if (s.endsWith(tag.slice(0, k))) return k
    return 0
  }
  return {
    push(delta) {
      pending += delta
      for (;;) {
        const tag = inside ? CLOSE : OPEN
        const at = pending.indexOf(tag)
        if (at >= 0) {
          if (!inside) out(pending.slice(0, at))
          pending = pending.slice(at + tag.length)
          inside = !inside
          continue
        }
        const keep = partial(pending, tag)
        if (!inside) out(pending.slice(0, pending.length - keep))
        pending = pending.slice(pending.length - keep)
        return
      }
    },
    end() {
      if (!inside) out(pending)
      pending = ''
    }
  }
}

export function stripThinking(text: string): string {
  const end = text.lastIndexOf('</think>')
  const after = end >= 0 ? text.slice(end + '</think>'.length) : text
  return after.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()
}
