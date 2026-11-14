import type { ModelInfo } from '@shared/ask'
import { strictCompatible } from '../schema'
import {
  type ChatMessage,
  type ChatReply,
  type ChatRequest,
  type Fetch,
  httpError,
  parseArgs,
  type Provider,
  ProviderError,
  replyLines,
  type StopReason,
  stripThinking,
  thinkingFilter,
  type ToolCall,
  unreachable
} from './types'

/**
 * Any OpenAI-compatible chat API (Ask spec §6.2): OpenAI, Gemini, Groq, OpenRouter, Mistral, a
 * custom base URL, and LM Studio on this PC. Plain `fetch` with server-sent events: text deltas,
 * tool calls assembled across chunks, `response_format: json_schema` for structured mode.
 */
export interface OpenAiOptions {
  /** "Groq", "LM Studio": for messages and the model chip. */
  name: string
  baseUrl: string
  model: string
  key: string | null
  /** The model reasons and takes `reasoning_effort` (known from the server, or the user's setting). */
  reasoning: boolean
  fetch?: Fetch
}

type WireMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: {
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }[]
    }
  | { role: 'tool'; tool_call_id: string; content: string }

function wire(system: string, messages: ChatMessage[]): WireMessage[] {
  const out: WireMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant')
      out.push({
        role: 'assistant',
        content: m.text === '' ? null : m.text,
        ...(m.calls.length > 0
          ? {
              tool_calls: m.calls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: {
                  name: c.name,
                  arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args)
                }
              }))
            }
          : {})
      })
    else for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.id, content: r.text })
  }
  return out
}

interface Chunk {
  choices?: {
    delta?: {
      content?: string | null
      tool_calls?: {
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }[]
    }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
  error?: { message?: string }
}

const STOPS: Record<string, StopReason> = {
  stop: 'end',
  tool_calls: 'tool',
  function_call: 'tool',
  length: 'length',
  content_filter: 'refusal'
}

const trimSlash = (url: string): string => url.replace(/\/+$/, '')

export function openAiCompatible(o: OpenAiOptions): Provider {
  const doFetch = o.fetch ?? fetch
  const base = trimSlash(o.baseUrl)
  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(o.key ? { Authorization: `Bearer ${o.key}` } : {})
  })

  async function chat(
    req: ChatRequest,
    signal: AbortSignal,
    onText?: (delta: string) => void
  ): Promise<ChatReply> {
    const body: Record<string, unknown> = {
      model: o.model,
      messages: wire(req.system, req.messages),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: req.maxTokens
    }
    if (req.tools && req.tools.length > 0)
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.schema }
      }))
    if (req.json)
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: req.json.name,
          schema: req.json.schema,
          ...(strictCompatible(req.json.schema) ? { strict: true } : {})
        }
      }
    if (o.reasoning && req.reasoning !== 'off') body.reasoning_effort = req.reasoning
    const url = `${base}/chat/completions`
    let res: Response
    try {
      res = await doFetch(url, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal
      })
    } catch (err) {
      throw unreachable(o.name, url, err)
    }
    if (!res.ok || !res.body)
      throw httpError(o.name, res.status, await res.text(), res.headers.get('retry-after'))

    let text = ''
    let stop: StopReason = 'end'
    const usage = { input: 0, output: 0 }
    // Reasoning in the text (`<think>`) is not streamed into the answer.
    const live = onText ? thinkingFilter(onText) : null
    const calls = new Map<number, { id: string; name: string; args: string }>()
    for await (const line of replyLines(o.name, res.body, signal)) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') break
      let chunk: Chunk
      try {
        chunk = JSON.parse(data) as Chunk
      } catch {
        continue
      }
      if (chunk.error)
        throw new ProviderError('server', `${o.name}: ${chunk.error.message ?? data}`)
      for (const choice of chunk.choices ?? []) {
        const d = choice.delta
        if (d?.content) {
          text += d.content
          live?.push(d.content)
        }
        for (const t of d?.tool_calls ?? []) {
          const c = calls.get(t.index) ?? { id: '', name: '', args: '' }
          if (t.id) c.id = t.id
          if (t.function?.name) c.name += t.function.name
          if (t.function?.arguments) c.args += t.function.arguments
          calls.set(t.index, c)
        }
        if (choice.finish_reason) stop = STOPS[choice.finish_reason] ?? 'end'
      }
      if (chunk.usage) {
        usage.input = chunk.usage.prompt_tokens ?? usage.input
        usage.output = chunk.usage.completion_tokens ?? usage.output
      }
    }
    live?.end()
    const toolCalls: ToolCall[] = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, c]) => ({ id: c.id || `call_${i}`, name: c.name, args: parseArgs(c.args) }))
    if (toolCalls.length > 0 && stop === 'end') stop = 'tool'
    return { text: stripThinking(text), calls: toolCalls, usage, stop }
  }

  async function models(signal: AbortSignal): Promise<ModelInfo[]> {
    const url = `${base}/models`
    let res: Response
    try {
      res = await doFetch(url, { headers: headers(), signal })
    } catch (err) {
      throw unreachable(o.name, url, err)
    }
    if (!res.ok)
      throw httpError(o.name, res.status, await res.text(), res.headers.get('retry-after'))
    const j = (await res.json()) as { data?: { id: string; context_length?: number }[] }
    return (j.data ?? [])
      .map((m) => ({ id: m.id, tools: true, thinking: false, context: m.context_length ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  return { label: `${o.name} · ${o.model}`, model: o.model, chat, models }
}
