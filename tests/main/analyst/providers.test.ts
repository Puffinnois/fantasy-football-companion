import { describe, expect, it } from 'vitest'
import { anthropic, anthropicSchema, thinkingParams } from '@main/analyst/providers/anthropic'
import type { Schema } from '@main/analyst/schema'
import { detectLocalServers, lmStudioModels } from '@main/analyst/providers/detect'
import { ollama, ollamaModels } from '@main/analyst/providers/ollama'
import { openAiCompatible } from '@main/analyst/providers/openaiCompatible'
import { type ChatRequest, type Provider, ProviderError } from '@main/analyst/providers/types'

/** A fake fetch: records each request and answers with `reply(url, body)`. */
function fakeFetch(reply: (url: string, body: Record<string, unknown> | null) => Response): {
  fetch: typeof fetch
  calls: { url: string; body: Record<string, unknown> | null; headers: Headers }[]
} {
  const calls: { url: string; body: Record<string, unknown> | null; headers: Headers }[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const raw = init?.body ?? (input instanceof Request ? await input.text() : null)
    const body =
      typeof raw === 'string' && raw ? (JSON.parse(raw) as Record<string, unknown>) : null
    calls.push({ url, body, headers: new Headers(init?.headers ?? (input as Request).headers) })
    return reply(url, body)
  }) as typeof fetch
  return { fetch: f, calls }
}

/** A streamed body, split into small chunks so parsers see partial lines. */
function stream(text: string, contentType = 'text/event-stream'): Response {
  const bytes = new TextEncoder().encode(text)
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7))
      c.close()
    }
  })
  return new Response(body, { status: 200, headers: { 'content-type': contentType } })
}

const sse = (events: unknown[]): string =>
  events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')

const REQUEST: ChatRequest = {
  system: 'You are the analyst.',
  messages: [{ role: 'user', text: 'Who leads WRs in YPRR?' }],
  tools: [
    {
      name: 'leaderboard',
      description: 'Rank players.',
      schema: { type: 'object', properties: { metric: { type: 'string' } } }
    }
  ],
  maxTokens: 800,
  reasoning: 'off'
}

const signal = (): AbortSignal => new AbortController().signal

/** A schema strict structured output accepts. */
const CLOSED = {
  type: 'object' as const,
  properties: { thought: { type: 'string' as const } },
  required: ['thought'],
  additionalProperties: false
}

describe('the OpenAI-compatible adapter', () => {
  it('assembles a tool call streamed across chunks', async () => {
    const f = fakeFetch(() =>
      stream(
        sse([
          {
            choices: [
              { delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'leader' } }] } }
            ]
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { name: 'board', arguments: '{"met' } }]
                }
              }
            ]
          },
          {
            choices: [
              {
                delta: { tool_calls: [{ index: 0, function: { arguments: 'ric":"yprr"}' } }] },
                finish_reason: 'tool_calls'
              }
            ]
          },
          { choices: [], usage: { prompt_tokens: 1200, completion_tokens: 18 } }
        ]) + 'data: [DONE]\n\n'
      )
    )
    const p = openAiCompatible({
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1/',
      model: 'm',
      key: 'gsk',
      reasoning: false,
      fetch: f.fetch
    })
    const reply = await p.chat(REQUEST, signal())
    expect(reply.calls).toEqual([{ id: 'c1', name: 'leaderboard', args: { metric: 'yprr' } }])
    expect(reply.stop).toBe('tool')
    expect(reply.usage).toEqual({ input: 1200, output: 18 })
    expect(f.calls[0].url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(f.calls[0].headers.get('authorization')).toBe('Bearer gsk')
    expect(f.calls[0].body?.messages).toEqual([
      { role: 'system', content: 'You are the analyst.' },
      { role: 'user', content: 'Who leads WRs in YPRR?' }
    ])
    expect(f.calls[0].body).not.toHaveProperty('reasoning_effort')
  })

  it('streams text and asks for a JSON schema in structured mode', async () => {
    const f = fakeFetch(() =>
      stream(
        sse([
          { choices: [{ delta: { content: '{"thought":"' } }] },
          { choices: [{ delta: { content: 'x"}' }, finish_reason: 'stop' }] }
        ])
      )
    )
    const deltas: string[] = []
    const p = openAiCompatible({
      name: 'LM Studio',
      baseUrl: 'http://localhost:1234/v1',
      model: 'm',
      key: null,
      reasoning: true,
      fetch: f.fetch
    })
    const reply = await p.chat(
      { ...REQUEST, tools: undefined, json: { name: 'call', schema: CLOSED }, reasoning: 'low' },
      signal(),
      (d) => deltas.push(d)
    )
    expect(reply.text).toBe('{"thought":"x"}')
    expect(deltas.join('')).toBe(reply.text)
    expect(f.calls[0].body?.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'call', schema: CLOSED, strict: true }
    })
    expect(f.calls[0].body?.reasoning_effort).toBe('low')
    expect(f.calls[0].headers.get('authorization')).toBeNull()
  })

  it('streams no thinking, even with its tags split across chunks', async () => {
    const parts = [
      '<thi',
      'nk>I should rank',
      ' by yprr</th',
      'ink>\n\nPuka <b>le',
      'ads</b>',
      ' <',
      '.'
    ]
    const f = fakeFetch(() =>
      stream(
        sse([
          ...parts.map((content) => ({ choices: [{ delta: { content } }] })),
          { choices: [{ delta: {}, finish_reason: 'stop' }] }
        ])
      )
    )
    const deltas: string[] = []
    const p = openAiCompatible({
      name: 'LM Studio',
      baseUrl: 'http://localhost:1234/v1',
      model: 'm',
      key: null,
      reasoning: false,
      fetch: f.fetch
    })
    const reply = await p.chat({ ...REQUEST, tools: undefined }, signal(), (d) => deltas.push(d))
    expect(reply.text).toBe('Puka <b>leads</b> <.')
    expect(deltas.join('')).toBe(reply.text)
    expect(deltas.join('')).not.toContain('rank')
  })

  it('sends tool results back in the conversation', async () => {
    const f = fakeFetch(() =>
      stream(sse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]))
    )
    const p = openAiCompatible({
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'm',
      key: 'k',
      reasoning: false,
      fetch: f.fetch
    })
    await p.chat(
      {
        ...REQUEST,
        messages: [
          ...REQUEST.messages,
          {
            role: 'assistant',
            text: '',
            calls: [{ id: 'c1', name: 'leaderboard', args: { metric: 'yprr' } }]
          },
          {
            role: 'tool',
            results: [{ id: 'c1', name: 'leaderboard', text: '1. Puka Nacua 3.10', error: false }]
          }
        ]
      },
      signal()
    )
    expect((f.calls[0].body?.messages as unknown[]).slice(2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'leaderboard', arguments: '{"metric":"yprr"}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'c1', content: '1. Puka Nacua 3.10' }
    ])
  })

  it('turns a 401 and a 429 into readable errors', async () => {
    const make = (status: number): ReturnType<typeof openAiCompatible> =>
      openAiCompatible({
        name: 'Groq',
        baseUrl: 'https://x',
        model: 'm',
        key: 'k',
        reasoning: false,
        fetch: fakeFetch(
          () =>
            new Response(JSON.stringify({ error: { message: 'nope' } }), {
              status,
              headers: { 'retry-after': '20' }
            })
        ).fetch
      })
    await expect(make(401).chat(REQUEST, signal())).rejects.toMatchObject({ kind: 'auth' })
    await expect(make(429).chat(REQUEST, signal())).rejects.toMatchObject({
      kind: 'rate',
      retryAfter: 20
    })
  })

  it('says when the server is not running', async () => {
    const f = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const p = openAiCompatible({
      name: 'LM Studio',
      baseUrl: 'http://localhost:1234/v1',
      model: 'm',
      key: null,
      reasoning: false,
      fetch: f
    })
    const err = await p.chat(REQUEST, signal()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect((err as ProviderError).kind).toBe('unreachable')
  })
})

describe('the Ollama adapter', () => {
  const ndjson = (lines: unknown[]): Response =>
    stream(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'application/x-ndjson')

  it('sets the context size, the schema and think, and reads a tool call', async () => {
    const f = fakeFetch(() =>
      ndjson([
        {
          message: {
            content: '',
            tool_calls: [{ function: { name: 'leaderboard', arguments: { metric: 'yprr' } } }]
          },
          done: false
        },
        {
          message: { content: '' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 950,
          eval_count: 30
        }
      ])
    )
    const p = ollama({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:4b',
      info: { id: 'qwen3:4b', tools: true, thinking: true, context: 40960 },
      context: 8192,
      fetch: f.fetch
    })
    const reply = await p.chat(REQUEST, signal())
    expect(reply.calls).toEqual([{ id: 'call_0', name: 'leaderboard', args: { metric: 'yprr' } }])
    expect(reply.stop).toBe('tool')
    expect(reply.usage).toEqual({ input: 950, output: 30 })
    expect(f.calls[0].url).toBe('http://localhost:11434/api/chat')
    expect(f.calls[0].body).toMatchObject({
      think: false,
      keep_alive: '10m',
      options: { num_ctx: 8192, num_predict: 800 }
    })
  })

  it('leaves think out for a model without it, and passes the schema as format', async () => {
    const f = fakeFetch(() =>
      ndjson([{ message: { content: '{"a":1}' }, done: true, done_reason: 'stop' }])
    )
    const p = ollama({
      baseUrl: 'http://localhost:11434',
      model: 'gemma3:4b',
      info: { id: 'gemma3:4b', tools: false, thinking: false, context: null },
      context: 8192,
      fetch: f.fetch
    })
    const reply = await p.chat(
      { ...REQUEST, tools: undefined, json: { name: 'call', schema: { type: 'object' } } },
      signal()
    )
    expect(reply.text).toBe('{"a":1}')
    expect(f.calls[0].body).not.toHaveProperty('think')
    expect(f.calls[0].body?.format).toEqual({ type: 'object' })
  })

  it('lists chat models with their capabilities, embeddings left out', async () => {
    const f = fakeFetch((url, body) => {
      if (url.endsWith('/api/tags'))
        return Response.json({ models: [{ name: 'qwen3:4b' }, { name: 'bge-m3:latest' }] })
      const caps = body?.model === 'qwen3:4b' ? ['completion', 'tools', 'thinking'] : ['embedding']
      return Response.json({ capabilities: caps, model_info: { 'qwen3.context_length': 40960 } })
    })
    expect(await ollamaModels('http://localhost:11434', signal(), f.fetch)).toEqual([
      { id: 'qwen3:4b', tools: true, thinking: true, context: 40960 }
    ])
  })
})

describe('a reply cut off mid-stream', () => {
  /** A body that sends one line, then fails with `err` (after `before`, e.g. an abort). */
  const broken = (line: string, err: Error, before = (): void => {}): Response =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(line))
          before()
          c.error(err)
        }
      }),
      { status: 200 }
    )
  const adapters = (body: () => Response): Provider[] => [
    openAiCompatible({
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'm',
      key: 'k',
      reasoning: false,
      fetch: fakeFetch(body).fetch
    }),
    ollama({
      baseUrl: 'http://localhost:11434',
      model: 'm',
      info: null,
      context: 8192,
      fetch: fakeFetch(body).fetch
    })
  ]
  const OPENAI_LINE = sse([{ choices: [{ delta: { content: 'Puka' } }] }])
  const OLLAMA_LINE = `${JSON.stringify({ message: { content: 'Puka' } })}\n`

  it('is a provider error when the connection drops', async () => {
    const [openai] = adapters(() => broken(OPENAI_LINE, new TypeError('terminated')))
    const [, local] = adapters(() => broken(OLLAMA_LINE, new TypeError('terminated')))
    for (const p of [openai, local])
      await expect(p.chat(REQUEST, signal())).rejects.toMatchObject({
        name: 'ProviderError',
        kind: 'unreachable'
      })
  })

  it('stays an abort when the turn is stopped', async () => {
    for (const line of [OPENAI_LINE, OLLAMA_LINE]) {
      const stop = new AbortController()
      const abort = new DOMException('aborted', 'AbortError')
      const p = adapters(() => broken(line, abort, () => stop.abort()))[
        line === OPENAI_LINE ? 0 : 1
      ]
      const err = await p.chat(REQUEST, stop.signal).catch((e: unknown) => e)
      expect(err).not.toBeInstanceOf(ProviderError)
      expect(err).toMatchObject({ name: 'AbortError' })
    }
  })
})

describe('local server detection', () => {
  it('reads LM Studio capabilities', async () => {
    const f = fakeFetch(() =>
      Response.json({
        data: [
          {
            id: 'qwen/qwen3.5-9b',
            type: 'llm',
            capabilities: ['tool_use'],
            max_context_length: 32768
          },
          { id: 'text-embedding-nomic', type: 'embeddings' }
        ]
      })
    )
    expect(await lmStudioModels('http://localhost:1234', signal(), f.fetch)).toEqual([
      { id: 'qwen/qwen3.5-9b', tools: true, thinking: false, context: 32768 }
    ])
  })

  it('skips servers that are not running', async () => {
    const f = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await detectLocalServers(f)).toEqual([])
  })
})

describe('the Anthropic adapter', () => {
  const events = (blocks: unknown[], stop: string): unknown[] => [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [],
        stop_reason: null,
        usage: { input_tokens: 2100, output_tokens: 1 }
      }
    },
    ...blocks,
    { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 42 } },
    { type: 'message_stop' }
  ]
  const anthropicSse = (evs: unknown[]): string =>
    evs
      .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join('')

  const TOOL_USE = [
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '', signature: '' }
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'signature_delta', signature: 'sig-1' }
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'leaderboard', input: {} }
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"metric":' }
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '"yprr"}' }
    },
    { type: 'content_block_stop', index: 1 }
  ]

  it('reads a tool call and keeps the turn for the next request', async () => {
    const f = fakeFetch(() => stream(anthropicSse(events(TOOL_USE, 'tool_use'))))
    const p = anthropic({ model: 'claude-opus-5-5', key: 'sk-ant', fetch: f.fetch })
    const reply = await p.chat(REQUEST, signal())
    expect(reply.calls).toEqual([{ id: 'toolu_1', name: 'leaderboard', args: { metric: 'yprr' } }])
    expect(reply.stop).toBe('tool')
    expect(reply.usage).toEqual({ input: 2100, output: 42 })
    expect(reply.native?.by).toBe('anthropic:claude-opus-5-5')
    const body = f.calls[0].body!
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('tool_choice')
    expect(body.thinking).toEqual({
      type: 'adaptive',
      block_binding: { prefix_mismatch_behavior: 'drop_block' }
    })
    expect(body.output_config).toEqual({ effort: 'low' })
    expect(body.fallbacks).toBe('default')
    expect(f.calls[0].headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')

    // The next request sends the assistant turn back unchanged (the thinking block with it).
    const g = fakeFetch(() =>
      stream(
        anthropicSse(
          events(
            [
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Puka leads.' }
              },
              { type: 'content_block_stop', index: 0 }
            ],
            'end_turn'
          )
        )
      )
    )
    const q = anthropic({ model: 'claude-opus-5-5', key: 'sk-ant', fetch: g.fetch })
    const answer = await q.chat(
      {
        ...REQUEST,
        messages: [
          ...REQUEST.messages,
          { role: 'assistant', text: reply.text, calls: reply.calls, native: reply.native },
          {
            role: 'tool',
            results: [{ id: 'toolu_1', name: 'leaderboard', text: 'rows', error: false }]
          }
        ]
      },
      signal()
    )
    expect(answer.text).toBe('Puka leads.')
    const sent = g.calls[0].body!.messages as {
      role: string
      content: { type: string; signature?: string }[]
    }[]
    expect(sent[1].content[0]).toMatchObject({ type: 'thinking', signature: 'sig-1' })
    expect(sent[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'rows' }]
    })
  })

  it('asks for structured output with output_config.format, never a forced tool', async () => {
    const f = fakeFetch(() =>
      stream(
        anthropicSse(
          events(
            [
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{}' } },
              { type: 'content_block_stop', index: 0 }
            ],
            'end_turn'
          )
        )
      )
    )
    const schema = {
      type: 'object' as const,
      properties: {
        thought: { type: 'string' as const, maxLength: 300 },
        args: {
          type: 'object' as const,
          properties: {
            metrics: {
              type: 'array' as const,
              items: { enum: ['a', 'b'] },
              minItems: 1,
              maxItems: 3
            }
          }
        }
      },
      required: ['thought', 'args'],
      additionalProperties: false
    }
    await anthropic({ model: 'claude-sonnet-5-5', key: 'k', fetch: f.fetch }).chat(
      { ...REQUEST, tools: undefined, json: { name: 'call', schema } },
      signal()
    )
    const body = f.calls[0].body!
    // Only what Anthropic's structured outputs take: the loop checks the rest itself.
    expect(body.output_config).toEqual({
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            thought: { type: 'string' },
            args: {
              type: 'object',
              properties: { metrics: { type: 'array', items: { enum: ['a', 'b'] }, minItems: 1 } },
              additionalProperties: false
            }
          },
          required: ['thought', 'args'],
          additionalProperties: false
        }
      }
    })
    expect(body.thinking).toEqual({ type: 'between_tools' })
    expect(body).not.toHaveProperty('tools')
  })

  it('refuses free-form arguments in structured mode, with no request', async () => {
    const f = fakeFetch(() => stream(anthropicSse(events([], 'end_turn'))))
    await expect(
      anthropic({ model: 'claude-opus-5-5', key: 'k', fetch: f.fetch }).chat(
        {
          ...REQUEST,
          tools: undefined,
          json: {
            name: 'step',
            schema: { ...CLOSED, properties: { ...CLOSED.properties, args: { type: 'object' } } }
          }
        },
        signal()
      )
    ).rejects.toMatchObject({ kind: 'request', message: expect.stringContaining('native') })
    expect(f.calls).toHaveLength(0)
  })

  it('keeps minItems 0 or 1 and drops larger ones', () => {
    const arr = (minItems: number): Schema => ({
      type: 'array',
      items: { type: 'string' },
      minItems
    })
    expect(anthropicSchema(arr(0))).toEqual(arr(0))
    expect(anthropicSchema(arr(1))).toEqual(arr(1))
    expect(anthropicSchema(arr(2))).toEqual({ type: 'array', items: { type: 'string' } })
  })

  it('ends the turn on a refusal', async () => {
    const f = fakeFetch(() => stream(anthropicSse(events([], 'refusal'))))
    await expect(
      anthropic({ model: 'claude-opus-5-5', key: 'k', fetch: f.fetch }).chat(REQUEST, signal())
    ).rejects.toMatchObject({ kind: 'refusal' })
  })

  it('maps reasoning to each family', () => {
    expect(thinkingParams('claude-opus-5-5', 'high')).toMatchObject({
      output_config: { effort: 'high' }
    })
    expect(thinkingParams('claude-haiku-5-5', 'off')).toEqual({
      thinking: { type: 'disabled' },
      betas: []
    })
    expect(thinkingParams('claude-3-haiku', 'off')).toEqual({})
  })
})
