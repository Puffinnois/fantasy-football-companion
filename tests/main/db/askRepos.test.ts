import { describe, expect, it } from 'vitest'
import type { AskMessage, ProviderInput } from '@shared/ask'
import { type Db, openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  activateAskProvider,
  activeAskProvider,
  deleteAskProvider,
  getAskProviderKey,
  listAskProviders,
  saveAskProvider
} from '@main/db/repos/askProviders'
import {
  addAskMessage,
  createAskThread,
  deleteAskThread,
  listAskMessages,
  listAskThreads,
  listAskTurns
} from '@main/db/repos/askThreads'
import { NO_KEY_STORE, safeStorageKeys } from '@main/analyst/keys'

function db(): Db {
  const d = openDatabase(':memory:')
  migrate(d)
  return d
}

const OLLAMA: Omit<ProviderInput, 'key'> = {
  kind: 'ollama',
  preset: null,
  label: 'Ollama',
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:4b',
  profile: 'compact',
  mode: 'structured',
  reasoning: 'off'
}

const message = (threadId: number, at: string): Omit<AskMessage, 'id'> => ({
  threadId,
  role: 'assistant',
  text: 'Puka Nacua leads.',
  calls: [{ tool: 'leaderboard', args: { metric: 'yprr' } }],
  results: [],
  flags: [],
  outcome: 'answer',
  model: 'qwen3:4b',
  tokens: { input: 900, output: 40 },
  ms: 2100,
  createdAt: at
})

describe('ask threads', () => {
  it('keeps messages in order and marks the thread used', () => {
    const d = db()
    const a = createAskThread(d, 'YPRR leaders', '2026-11-03T10:00:00Z')
    const b = createAskThread(d, 'Bijan vs man', '2026-11-03T11:00:00Z')
    addAskMessage(d, message(a.id, '2026-11-03T12:00:00Z'))
    expect(listAskThreads(d).map((t) => t.id)).toEqual([a.id, b.id])
    const [m] = listAskMessages(d, a.id)
    expect(m.calls).toEqual([{ tool: 'leaderboard', args: { metric: 'yprr' } }])
    expect(m.tokens).toEqual({ input: 900, output: 40 })
  })

  it('keeps the provider transcript and state for the loop only', () => {
    const d = db()
    const t = createAskThread(d, 'q', '2026-11-03T10:00:00Z')
    addAskMessage(d, message(t.id, '2026-11-03T10:00:01Z'), {
      providerId: 4,
      transcript: [{ role: 'assistant', content: [{ type: 'thinking', thinking: '' }] }],
      state: { last: { tool: 'leaderboard' } }
    })
    const [{ message: m, turn }] = listAskTurns(d, t.id)
    expect(Object.keys(m)).not.toContain('transcript')
    expect(turn.providerId).toBe(4)
    expect(turn.transcript).toHaveLength(1)
    expect(turn.state).toEqual({ last: { tool: 'leaderboard' } })
  })

  it('deletes a thread with its messages', () => {
    const d = db()
    const t = createAskThread(d, 'q', '2026-11-03T10:00:00Z')
    addAskMessage(d, message(t.id, '2026-11-03T10:00:01Z'))
    deleteAskThread(d, t.id)
    expect(listAskThreads(d)).toEqual([])
    expect(listAskMessages(d, t.id)).toEqual([])
  })
})

describe('ask providers', () => {
  it('makes the first provider active and never returns the key', () => {
    const d = db()
    const p = saveAskProvider(d, OLLAMA, undefined)
    const q = saveAskProvider(
      d,
      { ...OLLAMA, kind: 'openai', preset: 'groq', label: 'Groq', model: 'm' },
      new Uint8Array([1, 2, 3])
    )
    expect(p.active).toBe(true)
    expect(q.active).toBe(false)
    expect(q.hasKey).toBe(true)
    expect(JSON.stringify(listAskProviders(d))).not.toContain('key_cipher')
    expect(getAskProviderKey(d, q.id)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('keeps, replaces or removes a key on save', () => {
    const d = db()
    const p = saveAskProvider(d, OLLAMA, new Uint8Array([9]))
    expect(saveAskProvider(d, { ...OLLAMA, id: p.id, model: 'gemma3:4b' }, undefined).hasKey).toBe(
      true
    )
    expect(saveAskProvider(d, { ...OLLAMA, id: p.id }, null).hasKey).toBe(false)
    expect(getAskProviderKey(d, p.id)).toBeNull()
  })

  it('moves the active mark, and hands it on when the active one is removed', () => {
    const d = db()
    const p = saveAskProvider(d, OLLAMA, undefined)
    const q = saveAskProvider(d, { ...OLLAMA, label: 'Other' }, undefined)
    activateAskProvider(d, q.id)
    expect(activeAskProvider(d)?.id).toBe(q.id)
    deleteAskProvider(d, q.id)
    expect(activeAskProvider(d)?.id).toBe(p.id)
  })
})

describe('the key store', () => {
  const fake = (on: boolean): Parameters<typeof safeStorageKeys>[0] => ({
    isEncryptionAvailable: () => on,
    encryptString: (t: string) => Buffer.from(`enc:${t}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  })

  it('round-trips a key through safeStorage', () => {
    const keys = safeStorageKeys(fake(true))
    const cipher = keys.encrypt('sk-test')
    expect(Buffer.from(cipher).toString()).not.toBe('sk-test')
    expect(keys.decrypt(cipher)).toBe('sk-test')
  })

  it('refuses to store a key without encryption', () => {
    expect(() => safeStorageKeys(fake(false)).encrypt('sk-test')).toThrow(NO_KEY_STORE)
  })
})
