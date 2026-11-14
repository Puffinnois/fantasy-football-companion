import { describe, expect, it } from 'vitest'
import { openAiCompatible } from '@main/analyst/providers/openaiCompatible'
import { type ChatRequest, ProviderError } from '@main/analyst/providers/types'

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
