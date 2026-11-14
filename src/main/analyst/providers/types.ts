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
export function stripThinking(text: string): string {
  const end = text.lastIndexOf('</think>')
  const after = end >= 0 ? text.slice(end + '</think>'.length) : text
  return after.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()
}
