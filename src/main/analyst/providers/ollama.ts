import type { ModelInfo } from '@shared/ask'
import {
  type ChatMessage,
  type ChatReply,
  type ChatRequest,
  type Fetch,
  httpError,
  lines,
  type Provider,
  ProviderError,
  type StopReason,
  stripThinking,
  unreachable
} from './types'

/**
 * Ollama through its own `/api/chat` (Plan AG1, amendment D), not its OpenAI endpoint: only the
 * native API sets the context size (`num_ctx`; Ollama's default would cut the brief), takes a JSON
 * Schema as `format` and turns reasoning on or off with `think`. This is what the probes measured.
 */
export interface OllamaOptions {
  baseUrl: string
  model: string
  /** From `/api/show`; null when unknown (then no `think` and no `tools` are sent). */
  info: ModelInfo | null
  /** The context to load the model with (tokens). */
  context: number
  fetch?: Fetch
}

/** How long Ollama keeps the model loaded after a call: follow-ups should not reload it. */
const KEEP_ALIVE = '10m'

type WireMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant'
      content: string
      tool_calls?: { function: { name: string; arguments: unknown } }[]
    }
  | { role: 'tool'; content: string; tool_name: string }

function wire(system: string, messages: ChatMessage[]): WireMessage[] {
  const out: WireMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant')
      out.push({
        role: 'assistant',
        content: m.text,
        ...(m.calls.length > 0
          ? { tool_calls: m.calls.map((c) => ({ function: { name: c.name, arguments: c.args } })) }
          : {})
      })
    else for (const r of m.results) out.push({ role: 'tool', content: r.text, tool_name: r.name })
  }
  return out
}

interface Line {
  message?: {
    content?: string
    tool_calls?: { function: { name: string; arguments: unknown } }[]
  }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

export function ollama(o: OllamaOptions): Provider {
  const doFetch = o.fetch ?? fetch
  const base = o.baseUrl.replace(/\/+$/, '')

  async function chat(
    req: ChatRequest,
    signal: AbortSignal,
    onText?: (delta: string) => void
  ): Promise<ChatReply> {
    const body: Record<string, unknown> = {
      model: o.model,
      messages: wire(req.system, req.messages),
      stream: true,
      keep_alive: KEEP_ALIVE,
      options: { num_ctx: o.context, num_predict: req.maxTokens }
    }
    if (req.tools && req.tools.length > 0)
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.schema }
      }))
    if (req.json) body.format = req.json.schema
    // A model without the capability rejects `think`, even `false`.
    if (o.info?.thinking) body.think = req.reasoning !== 'off'
    // A thinking model asked not to think may reason in the text anyway (a thinking-only model):
    // the text is held back until it is whole, then given without the reasoning.
    const hold = o.info?.thinking === true && req.reasoning === 'off' && !req.json
    const url = `${base}/api/chat`
    let res: Response
    try {
      res = await doFetch(url, { method: 'POST', body: JSON.stringify(body), signal })
    } catch (err) {
      throw unreachable('Ollama', url, err)
    }
    if (!res.ok || !res.body) throw httpError('Ollama', res.status, await res.text(), null)

    let text = ''
    let stop: StopReason = 'end'
    const usage = { input: 0, output: 0 }
    const calls: ChatReply['calls'] = []
    for await (const raw of lines(res.body)) {
      if (raw.trim() === '') continue
      let line: Line
      try {
        line = JSON.parse(raw) as Line
      } catch {
        continue
      }
      if (line.error) throw new ProviderError('server', `Ollama: ${line.error}`)
      const content = line.message?.content
      if (content) {
        text += content
        if (!hold) onText?.(content)
      }
      for (const c of line.message?.tool_calls ?? [])
        calls.push({
          id: `call_${calls.length}`,
          name: c.function.name,
          args: c.function.arguments
        })
      if (line.done) {
        usage.input = line.prompt_eval_count ?? 0
        usage.output = line.eval_count ?? 0
        if (line.done_reason === 'length') stop = 'length'
      }
    }
    if (calls.length > 0 && stop === 'end') stop = 'tool'
    const answer = stripThinking(text)
    if (hold && answer) onText?.(answer)
    return { text: answer, calls, usage, stop }
  }

  return {
    label: `Ollama · ${o.model}`,
    model: o.model,
    chat,
    models: (signal) => ollamaModels(base, signal, doFetch)
  }
}

interface ShowReply {
  capabilities?: string[]
  model_info?: Record<string, unknown>
}

/** One model's capabilities from `/api/show`; null for a model that does not chat (embeddings). */
export async function ollamaModel(
  base: string,
  id: string,
  signal: AbortSignal,
  doFetch: Fetch = fetch
): Promise<ModelInfo | null> {
  const res = await doFetch(`${base}/api/show`, {
    method: 'POST',
    body: JSON.stringify({ model: id }),
    signal
  })
  if (!res.ok) return { id, tools: false, thinking: false, context: null }
  const j = (await res.json()) as ShowReply
  const caps = j.capabilities ?? []
  if (!caps.includes('completion')) return null
  const context = Object.entries(j.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))
  return {
    id,
    tools: caps.includes('tools'),
    thinking: caps.includes('thinking'),
    context: typeof context?.[1] === 'number' ? context[1] : null
  }
}

/** The chat models Ollama has, with their capabilities. */
export async function ollamaModels(
  base: string,
  signal: AbortSignal,
  doFetch: Fetch = fetch
): Promise<ModelInfo[]> {
  const url = `${base}/api/tags`
  let res: Response
  try {
    res = await doFetch(url, { signal })
  } catch (err) {
    throw unreachable('Ollama', url, err)
  }
  if (!res.ok) throw httpError('Ollama', res.status, await res.text(), null)
  const j = (await res.json()) as { models?: { name: string }[] }
  const all = await Promise.all(
    (j.models ?? []).map((m) => ollamaModel(base, m.name, signal, doFetch))
  )
  return all.filter((m): m is ModelInfo => m !== null).sort((a, b) => a.id.localeCompare(b.id))
}
