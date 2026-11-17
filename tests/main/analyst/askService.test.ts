import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AskEvent, ProviderInput } from '@shared/ask'
import { type Db, openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getAskProviderKey } from '@main/db/repos/askProviders'
import { type AskService, createAskService } from '@main/analyst/askService'
import { type KeyStore, NO_KEY_STORE } from '@main/analyst/keys'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult, statsRow } from '../../fixtures/analyst'

const stats: AnalystStats = {
  status: async () => ({
    available: true,
    through: { season: 2026, seasonType: 'REG', week: 7 },
    updatedAt: '2026-10-27T00:00:00Z',
    busy: false
  }),
  catalogue: async () => catalogueInfo(new Map()),
  people: async () => PEOPLE,
  query: async () =>
    statsResult([
      statsRow('00-0039075', 'Puka Nacua', { yprr: { raw: 3.1, sample: 210, rank: 1 } })
    ]),
  games: async () => [],
  outlook: async () => {
    throw new Error('not in this test')
  },
  player: async () => {
    throw new Error('not in this test')
  }
}

const keys = (on = true): KeyStore => ({
  available: () => on,
  encrypt: (k) => new TextEncoder().encode(`enc:${k}`),
  decrypt: (c) => new TextDecoder().decode(c).replace(/^enc:/, '')
})

/** An OpenAI-compatible server: each request gets the next reply (as one SSE text chunk). */
function server(replies: (string | ((body: Record<string, unknown>) => string))[]): {
  fetch: typeof fetch
  bodies: Record<string, unknown>[]
  auth: (string | null)[]
} {
  const bodies: Record<string, unknown>[] = []
  const auth: (string | null)[] = []
  let at = 0
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url)
    auth.push(new Headers(init?.headers).get('authorization'))
    if (href.endsWith('/models')) return Response.json({ data: [{ id: 'm-1' }, { id: 'm-0' }] })
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    bodies.push(body)
    const signal = init?.signal
    const next = replies[Math.min(at++, replies.length - 1)]
    if (next === 'hang')
      return new Promise<Response>((_, reject) =>
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      )
    const text = typeof next === 'function' ? next(body) : next
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`
    return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch
  return { fetch: f, bodies, auth }
}

const GROQ: ProviderInput = {
  kind: 'openai',
  preset: 'groq',
  label: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'm-1',
  profile: 'compact',
  mode: 'structured',
  reasoning: 'off'
}

const CALL = JSON.stringify({ thought: '', args: { metric: 'yprr', position: 'WR' } })

function service(
  fetch: typeof globalThis.fetch,
  over: { dev?: boolean; keys?: KeyStore } = {}
): { ask: AskService; db: Db; userData: string } {
  const db = openDatabase(':memory:')
  migrate(db)
  const userData = mkdtempSync(join(tmpdir(), 'ffc-ask-service-'))
  const ask = createAskService({
    db,
    analyst: createAnalyst({ stats, league: () => null }),
    keys: over.keys ?? keys(),
    userData,
    devMode: () => over.dev ?? false,
    fetch,
    detect: async () => []
  })
  return { ask, db, userData }
}

describe('providers and keys', () => {
  it('stores a key encrypted and never hands it back', () => {
    const { ask, db } = service(server([]).fetch)
    const p = ask.saveProvider({ ...GROQ, key: ' gsk-secret ' })
    expect(p.hasKey).toBe(true)
    expect(JSON.stringify(ask.providers())).not.toContain('gsk-secret')
    expect(new TextDecoder().decode(getAskProviderKey(db, p.id)!)).toBe('enc:gsk-secret')
    expect(ask.saveProvider({ ...GROQ, id: p.id, key: '' }).hasKey).toBe(false)
  })

  it('refuses a key it cannot encrypt', () => {
    const { ask } = service(server([]).fetch, { keys: keys(false) })
    expect(() => ask.saveProvider({ ...GROQ, key: 'k' })).toThrow(NO_KEY_STORE)
  })

  it('lists models with the key being typed, or the saved one', async () => {
    const s = server([])
    const { ask } = service(s.fetch)
    expect((await ask.models({ ...GROQ, key: ' typed\n' })).map((m) => m.id)).toEqual([
      'm-0',
      'm-1'
    ])
    const p = ask.saveProvider({ ...GROQ, key: 'saved' })
    await ask.models({ ...GROQ, id: p.id })
    expect(s.auth).toEqual(['Bearer typed', 'Bearer saved'])
  })

  it('never sends a saved key to another address', async () => {
    const s = server([])
    const { ask } = service(s.fetch)
    const p = ask.saveProvider({ ...GROQ, key: 'saved' })
    await ask.models({ ...GROQ, id: p.id, baseUrl: 'https://elsewhere.example/v1' })
    await ask.models({ ...GROQ, id: p.id, preset: 'custom', baseUrl: 'https://x.example/v1' })
    await ask.models({ ...GROQ, id: p.id, kind: 'lmstudio', baseUrl: 'http://localhost:1234' })
    expect(s.auth).toEqual([null, null, null])
    // A key typed in the form is still used; the same address (trailing slash aside) keeps it.
    await ask.models({ ...GROQ, id: p.id, baseUrl: 'https://x.example/v1', key: 'typed' })
    await ask.models({ ...GROQ, id: p.id, baseUrl: `${GROQ.baseUrl}/` })
    expect(s.auth.slice(3)).toEqual(['Bearer typed', 'Bearer saved'])
  })

  it('drops the saved key when the address or kind changes', () => {
    const { ask, db } = service(server([]).fetch)
    const p = ask.saveProvider({ ...GROQ, key: 'saved' })
    expect(ask.saveProvider({ ...GROQ, id: p.id, model: 'm-2' }).hasKey).toBe(true)
    const moved = ask.saveProvider({ ...GROQ, id: p.id, baseUrl: 'https://elsewhere.example/v1' })
    expect(moved.hasKey).toBe(false)
    expect(getAskProviderKey(db, p.id)).toBeNull()
    const q = ask.saveProvider({ ...GROQ, key: 'saved' })
    expect(ask.saveProvider({ ...GROQ, id: q.id, kind: 'anthropic', preset: null }).hasKey).toBe(
      false
    )
    // A new key given with the change is kept.
    const r = ask.saveProvider({ ...GROQ, key: 'saved' })
    expect(
      ask.saveProvider({ ...GROQ, id: r.id, baseUrl: 'https://y.example', key: 'new' }).hasKey
    ).toBe(true)
  })
})

describe('asking', () => {
  it('needs a model first', async () => {
    const { ask } = service(server([]).fetch)
    await expect(ask.send(null, 'Who leads WRs in YPRR?', () => {})).rejects.toThrow(
      'Set up a model first'
    )
  })

  it('answers in a new thread and keeps the turn for a follow-up', async () => {
    const s = server([CALL, 'Puka Nacua leads with 3.10.', CALL, 'In 2024, Puka leads.'])
    const { ask } = service(s.fetch)
    ask.saveProvider({ ...GROQ, key: 'k' })
    const events: AskEvent[] = []
    const first = await ask.send(null, 'Who leads WRs in yards per route run this season?', (e) =>
      events.push(e)
    )
    expect(first.outcome).toBe('answer')
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(ask.threads()).toHaveLength(1)
    const second = await ask.send(first.threadId, 'now 2024', () => {})
    expect(second.calls[0]).toMatchObject({ tool: 'leaderboard', args: { seasons: [2024] } })
    expect(JSON.stringify(s.bodies[2].messages)).toContain('This question follows')
    expect(ask.messages(first.threadId).map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant'
    ])
  })

  it('resends the thread to the full profile', async () => {
    const s = server(['First answer.', 'Second answer.'])
    const { ask } = service(s.fetch)
    ask.saveProvider({ ...GROQ, profile: 'full', mode: 'native', key: 'k' })
    const first = await ask.send(null, 'Who leads WRs in yards per route run?', () => {})
    await ask.send(first.threadId, 'Who leads TEs in targets per route run?', () => {})
    const sent = s.bodies[1].messages as { role: string; content: string | null }[]
    expect(sent.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(sent[2].content).toBe('First answer.')
    // The transcript itself, not the question as text.
    expect(sent[1].content).toContain('Question: Who leads WRs')
  })

  it('reads the thread as text to a model that did not write it', async () => {
    const FULL = { ...GROQ, profile: 'full' as const, mode: 'native' as const, key: 'k' }
    const Q = 'Who leads WRs in yards per route run?'
    const asText = [
      { role: 'user', content: Q },
      { role: 'assistant', content: 'First answer.' }
    ]
    // Another provider.
    let s = server(['First answer.', 'Second answer.'])
    let { ask } = service(s.fetch)
    ask.saveProvider(FULL)
    const first = await ask.send(null, Q, () => {})
    ask.activate(ask.saveProvider({ ...FULL, model: 'm-0' }).id)
    await ask.send(first.threadId, 'Who leads TEs in targets per route run?', () => {})
    expect((s.bodies[1].messages as unknown[]).slice(1, 3)).toEqual(asText)
    // The same row edited in place (another model, then another mode).
    for (const change of [{ model: 'm-0' }, { mode: 'structured' as const }]) {
      s = server(['First answer.', 'Second answer.'])
      ;({ ask } = service(s.fetch))
      const p = ask.saveProvider(FULL)
      const t = await ask.send(null, Q, () => {})
      ask.saveProvider({ ...FULL, id: p.id, ...change })
      await ask.send(t.threadId, 'Who leads TEs in targets per route run?', () => {})
      expect((s.bodies[1].messages as unknown[]).slice(1, 3)).toEqual(asText)
    }
  })

  it('resends a turn with no model call as text', async () => {
    const s = server(['Second answer.'])
    const { ask } = service(s.fetch)
    ask.saveProvider({ ...GROQ, profile: 'full', mode: 'native', key: 'k' })
    const Q = 'Should I start Bijan Robinson this week?'
    const declined = await ask.send(null, Q, () => {})
    expect(declined.outcome).toBe('decline')
    await ask.send(declined.threadId, 'Who leads WRs in yards per route run?', () => {})
    expect((s.bodies[0].messages as unknown[]).slice(1, 3)).toEqual([
      { role: 'user', content: Q },
      { role: 'assistant', content: declined.text }
    ])
  })

  it('stops a running turn', async () => {
    const s = server(['hang'])
    const { ask } = service(s.fetch)
    ask.saveProvider({ ...GROQ, key: 'k' })
    const pending = ask.send(null, 'Who leads WRs in yards per route run?', () => {})
    await new Promise((r) => setTimeout(r, 20))
    ask.stop()
    expect((await pending).outcome).toBe('stopped')
  })

  it('writes the trace in Dev mode, with no key in it', async () => {
    const s = server([CALL, 'Puka leads.'])
    const { ask, userData } = service(s.fetch, { dev: true })
    ask.saveProvider({ ...GROQ, key: 'gsk-secret' })
    await ask.send(null, 'Who leads WRs in yards per route run?', () => {})
    const log = join(userData, 'ask', 'log.jsonl')
    expect(existsSync(log)).toBe(true)
    const text = readFileSync(log, 'utf8')
    expect(JSON.parse(text.trim()).calls[0].tool).toBe('leaderboard')
    expect(text).not.toContain('gsk-secret')
  })
})
