import Anthropic from '@anthropic-ai/sdk'
import type { ModelInfo, Reasoning } from '@shared/ask'
import type { Schema } from '../schema'
import {
  type ChatMessage,
  type ChatReply,
  type ChatRequest,
  DECLINED,
  type Fetch,
  type Provider,
  ProviderError,
  type StopReason,
  type ToolCall
} from './types'

/**
 * Anthropic's Messages API through its official SDK (Plan AG1, amendment B). What the current models
 * need (amendments C and K, from the API reference of 2026-10):
 *
 *   - no forced `tool_choice` (a 400 on Opus 5.5 and Sonnet 5.5): structured mode is
 *     `output_config.format`, a JSON Schema;
 *   - no thinking budget: depth is `output_config.effort`; Opus 5.5 cannot turn thinking off, Sonnet
 *     5.5 does it with `between_tools`, Haiku 5.5 with `disabled`;
 *   - no `temperature` (a 400 on every model since 2026-10-21);
 *   - an append-only history: each assistant turn's content goes back unchanged, and a thinking block
 *     that no longer fits its conversation is dropped rather than failing the request;
 *   - server-side fallbacks on a refusal, where the model has them.
 */
export interface AnthropicOptions {
  model: string
  key: string
  baseUrl?: string
  fetch?: Fetch
}

/** The strong and the fast tier (spec §7), for the Model section's first choices. */
export const ANTHROPIC_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']

interface Family {
  /** How "reasoning: off" is said: lowest effort (thinking cannot be off), `between_tools` or `disabled`. */
  off: 'low-effort' | 'between_tools' | 'disabled'
  fallbacks: boolean
}

/** By model id prefix; another model gets neither thinking settings nor betas. */
const FAMILIES: [string, Family][] = [
  ['claude-fable-5', { off: 'low-effort', fallbacks: true }],
  ['claude-opus-5', { off: 'low-effort', fallbacks: true }],
  ['claude-sonnet-5', { off: 'between_tools', fallbacks: true }],
  ['claude-haiku-5', { off: 'disabled', fallbacks: false }]
]

const BETA_FALLBACK = 'server-side-fallback-2026-07-01'
const BETA_BINDING = 'thinking-binding-controls-2026-08-01'

type Params = Anthropic.Beta.Messages.MessageCreateParamsStreaming

/** The request's thinking, effort and betas for the model and the reasoning setting. */
export function thinkingParams(
  model: string,
  reasoning: Reasoning
): Pick<Params, 'thinking' | 'output_config' | 'betas'> & { fallbacks?: 'default' } {
  const family = FAMILIES.find(([prefix]) => model.startsWith(prefix))?.[1]
  if (!family) return {}
  const adaptive: Params['thinking'] = {
    type: 'adaptive',
    block_binding: { prefix_mismatch_behavior: 'drop_block' }
  }
  const betas = [BETA_BINDING, ...(family.fallbacks ? [BETA_FALLBACK] : [])]
  const fallbacks = family.fallbacks ? { fallbacks: 'default' as const } : {}
  if (reasoning !== 'off')
    return { thinking: adaptive, output_config: { effort: reasoning }, betas, ...fallbacks }
  if (family.off === 'low-effort')
    return { thinking: adaptive, output_config: { effort: 'low' }, betas, ...fallbacks }
  if (family.off === 'between_tools')
    return {
      thinking: { type: 'between_tools' },
      betas: betas.filter((b) => b !== BETA_BINDING),
      ...fallbacks
    }
  return { thinking: { type: 'disabled' }, betas: betas.filter((b) => b !== BETA_BINDING) }
}

/**
 * The schema as Anthropic's structured outputs take it (claude-api reference, 2026-11): no
 * `minLength`/`maxLength`, no `maxItems`, `minItems` only 0 or 1, and every object closed with
 * `additionalProperties: false`. The loop checks each reply against the whole schema, so the
 * constraints left out here still hold. An object with no properties is free-form and cannot be
 * closed (the full profile's structured step, whose `args` depend on the tool): that is refused
 * with a readable error rather than sent to fail.
 */
export function anthropicSchema(schema: Schema): Schema {
  const out: Schema = { ...schema }
  delete out.maxLength
  delete out.maxItems
  if (out.minItems !== undefined && out.minItems > 1) delete out.minItems
  if (out.items) out.items = anthropicSchema(out.items)
  if (out.properties)
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, anthropicSchema(v)])
    )
  if (out.type === 'object') {
    if (Object.keys(out.properties ?? {}).length === 0)
      throw new ProviderError(
        'request',
        'Anthropic’s structured mode cannot take free-form tool arguments: use native tool calls (Anthropic’s default) or the compact profile.'
      )
    out.additionalProperties = false
  }
  return out
}

function wire(by: string, messages: ChatMessage[]): Anthropic.Beta.Messages.BetaMessageParam[] {
  const out: Anthropic.Beta.Messages.BetaMessageParam[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant') {
      if (m.native?.by === by) {
        out.push({
          role: 'assistant',
          content: m.native.content as Anthropic.Beta.Messages.BetaContentBlockParam[]
        })
        continue
      }
      const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = []
      if (m.text) content.push({ type: 'text', text: m.text })
      for (const c of m.calls)
        content.push({
          type: 'tool_use',
          id: c.id,
          name: c.name,
          input: typeof c.args === 'object' && c.args !== null ? c.args : {}
        })
      out.push({ role: 'assistant', content })
    } else
      // All of a step's results in one user message (parallel calls stay parallel).
      out.push({
        role: 'user',
        content: m.results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.text,
          ...(r.error ? { is_error: true } : {})
        }))
      })
  }
  return out
}

const STOPS: Partial<Record<string, StopReason>> = {
  end_turn: 'end',
  tool_use: 'tool',
  max_tokens: 'length',
  refusal: 'refusal',
  stop_sequence: 'end'
}

function sdkError(err: unknown): ProviderError {
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  )
    return new ProviderError('auth', `Anthropic refused the key: ${err.message}`)
  if (err instanceof Anthropic.RateLimitError) {
    const wait = Number(err.headers?.get('retry-after'))
    return new ProviderError(
      'rate',
      `Anthropic is rate limiting this key: ${err.message}`,
      Number.isFinite(wait) ? wait : null
    )
  }
  if (err instanceof Anthropic.APIConnectionError)
    return new ProviderError('unreachable', `Anthropic did not answer: ${err.message}`)
  if (err instanceof Anthropic.InternalServerError)
    return new ProviderError('server', `Anthropic had an error: ${err.message}`)
  if (err instanceof Anthropic.APIError)
    return new ProviderError('request', `Anthropic rejected the request: ${err.message}`)
  throw err
}

export function anthropic(o: AnthropicOptions): Provider {
  const client = new Anthropic({
    apiKey: o.key,
    ...(o.baseUrl ? { baseURL: o.baseUrl } : {}),
    ...(o.fetch ? { fetch: o.fetch } : {}),
    maxRetries: 2
  })
  const by = `anthropic:${o.model}`

  async function chat(
    req: ChatRequest,
    signal: AbortSignal,
    onText?: (delta: string) => void
  ): Promise<ChatReply> {
    const think = thinkingParams(o.model, req.reasoning)
    const params: Params = {
      model: o.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: wire(by, req.messages),
      stream: true,
      ...think,
      ...(req.tools && req.tools.length > 0
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.schema as Anthropic.Beta.Messages.BetaTool.InputSchema
            }))
          }
        : {})
    }
    if (req.json)
      params.output_config = {
        ...params.output_config,
        format: {
          type: 'json_schema',
          schema: anthropicSchema(req.json.schema) as Record<string, unknown>
        }
      }
    let message: Anthropic.Beta.Messages.BetaMessage
    try {
      const stream = client.beta.messages.stream(params, { signal })
      if (onText) stream.on('text', (delta) => onText(delta))
      message = await stream.finalMessage()
    } catch (err) {
      if (signal.aborted) throw err
      throw sdkError(err)
    }
    const stop = STOPS[message.stop_reason ?? 'end_turn'] ?? 'end'
    if (stop === 'refusal') throw new ProviderError('refusal', DECLINED)
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    const calls: ToolCall[] = message.content.flatMap((b) =>
      b.type === 'tool_use' ? [{ id: b.id, name: b.name, args: b.input }] : []
    )
    return {
      text,
      calls,
      usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
      stop,
      native: { by, content: message.content }
    }
  }

  async function models(signal: AbortSignal): Promise<ModelInfo[]> {
    try {
      const list: ModelInfo[] = []
      for await (const m of client.models.list({}, { signal }))
        list.push({ id: m.id, tools: true, thinking: true, context: m.max_input_tokens ?? null })
      return list
    } catch (err) {
      if (signal.aborted) throw err
      throw sdkError(err)
    }
  }

  return { label: `Anthropic · ${o.model}`, model: o.model, chat, models }
}
