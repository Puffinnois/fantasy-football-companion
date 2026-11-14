import { join } from 'node:path'
import type {
  AskEvent,
  AskMessage,
  AskOptions,
  AskThread,
  LocalServer,
  ModelInfo,
  ProviderInput,
  ProviderSettings
} from '@shared/ask'
import type { Db } from '@main/db/connection'
import { listAskExamples } from '@main/db/repos/askExamples'
import {
  activateAskProvider,
  activeAskProvider,
  deleteAskProvider,
  getAskProvider,
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
import { getSetting, setSetting } from '@main/db/repos/settings'
import { similarExamples } from './examples'
import type { FollowState } from './followup'
import { type KeyStore, NO_KEY_STORE } from './keys'
import { askTurn } from './loop'
import { detectLocalServers } from './providers/detect'
import { createProvider, endpointOf } from './providers/index'
import type { ChatMessage, Fetch, Provider } from './providers/types'
import type { Analyst } from './tools'
import { appendTrace } from './trace'

/**
 * Ask in the app (Ask spec §5, §6.2; Plan AG1): the providers and their keys, the threads, and one
 * turn at a time through the loop, with Stop. Keys are decrypted only to build a request's provider
 * and never leave main.
 */
export const SETTING_ASK_EXAMPLES = 'ask_examples'
export const SETTING_ASK_SAMPLE_K = 'ask_sample_k'

export interface AskServiceDeps {
  db: Db
  /** Null when the stats database could not be opened. */
  analyst: Analyst | null
  keys: KeyStore
  userData: string
  devMode: () => boolean
  fetch?: Fetch
  detect?: () => Promise<LocalServer[]>
  now?: () => Date
}

export interface TestResult {
  ok: boolean
  message: string
  ms: number
}

export interface AskService {
  providers(): ProviderSettings[]
  saveProvider(input: ProviderInput & { id?: number }): ProviderSettings
  removeProvider(id: number): void
  activate(id: number): void
  /** The models a provider offers; `input` may be unsaved (its key, or the saved one's). */
  models(input: ProviderInput & { id?: number }): Promise<ModelInfo[]>
  detect(): Promise<LocalServer[]>
  /** One short call to the provider: is the key right, is the server up, how long it takes. */
  test(id: number): Promise<TestResult>
  /** Asks in a thread (a new one when `threadId` is null); resolves to the answer. */
  send(threadId: number | null, question: string, emit: (e: AskEvent) => void): Promise<AskMessage>
  /** Stops the turn that is running. */
  stop(): void
  threads(): AskThread[]
  messages(threadId: number): AskMessage[]
  deleteThread(id: number): void
  options(): AskOptions
  setOptions(o: AskOptions): AskOptions
}

const NOT_AVAILABLE =
  'The stats database could not be opened on this computer, so there is nothing to ask about.'

/**
 * What writes a turn's transcript: the provider's kind, model and calling mode. Only the same three
 * can be sent that transcript back; a row's id is reused after a removal and kept across an edit.
 */
const writerOf = (s: ProviderSettings): string => `${s.kind} ${s.model} ${s.mode}`

/** A thread's title: the question's start. */
const titleOf = (q: string): string => (q.length <= 60 ? q : `${q.slice(0, 57).trimEnd()}…`)

export function createAskService(deps: AskServiceDeps): AskService {
  const now = deps.now ?? (() => new Date())
  const doFetch = deps.fetch ?? fetch
  let running: AbortController | null = null

  function keyOf(id: number): string | null {
    const cipher = getAskProviderKey(deps.db, id)
    return cipher ? deps.keys.decrypt(cipher) : null
  }

  /** The saved key of provider `id`, only for the endpoint it was saved for (never another host). */
  function savedKeyFor(id: number | undefined, s: ProviderInput): string | null {
    const saved = id !== undefined ? getAskProvider(deps.db, id) : null
    return saved && endpointOf(saved) === endpointOf(s) ? keyOf(saved.id) : null
  }

  async function providerOf(s: ProviderSettings): Promise<Provider> {
    return createProvider(s, keyOf(s.id), doFetch)
  }

  /** The thread's earlier turns as this provider resends them, and its last question and call. */
  function threadState(
    threadId: number,
    writer: string
  ): { history: ChatMessage[]; last: FollowState | null } {
    const history: ChatMessage[] = []
    let last: FollowState | null = null
    let question: string | null = null
    for (const { message, turn } of listAskTurns(deps.db, threadId)) {
      if (message.role === 'user') {
        question = message.text
        continue
      }
      // A turn with no model call has an empty transcript: it goes as text.
      if (turn.transcript?.length && turn.writer === writer)
        history.push(...(turn.transcript as ChatMessage[]))
      else if (question !== null)
        history.push(
          { role: 'user', text: question },
          { role: 'assistant', text: message.text, calls: [] }
        )
      if (turn.state) last = turn.state as FollowState
      question = null
    }
    return { history, last }
  }

  function options(): AskOptions {
    return {
      examples: getSetting(deps.db, SETTING_ASK_EXAMPLES) === '1',
      sampleK: getSetting(deps.db, SETTING_ASK_SAMPLE_K) === '1'
    }
  }

  return {
    providers: () => listAskProviders(deps.db),

    saveProvider(input) {
      const { key, ...settings } = input
      let cipher: Uint8Array | null | undefined
      const saved = settings.id !== undefined ? getAskProvider(deps.db, settings.id) : null
      // A key saved for one endpoint is not kept for another (kind or address changed).
      if (key === '' || (key === undefined && saved && endpointOf(saved) !== endpointOf(settings)))
        cipher = null
      else if (key !== undefined) {
        if (!deps.keys.available()) throw new Error(NO_KEY_STORE)
        cipher = deps.keys.encrypt(key.trim())
      }
      return saveAskProvider(deps.db, settings, cipher)
    },

    removeProvider: (id) => deleteAskProvider(deps.db, id),
    activate: (id) => activateAskProvider(deps.db, id),

    async models(input) {
      const key = input.key ?? savedKeyFor(input.id, input)
      const p = await createProvider(input, key || null, doFetch)
      return p.models(AbortSignal.timeout(15_000))
    },

    detect: () => (deps.detect ?? (() => detectLocalServers(doFetch)))(),

    async test(id) {
      const s = getAskProvider(deps.db, id)
      if (!s) throw new Error(`there is no provider ${id}`)
      const started = Date.now()
      try {
        const p = await providerOf(s)
        const reply = await p.chat(
          {
            system: 'Reply with the single word OK.',
            messages: [{ role: 'user', text: 'Are you there?' }],
            maxTokens: 256,
            reasoning: 'off'
          },
          AbortSignal.timeout(60_000)
        )
        return {
          ok: true,
          message: `${p.label} answered "${reply.text.slice(0, 40)}" (${reply.usage.input} tokens in, ${reply.usage.output} out)`,
          ms: Date.now() - started
        }
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          ms: Date.now() - started
        }
      }
    },

    async send(threadId, question, emit) {
      if (!deps.analyst) throw new Error(NOT_AVAILABLE)
      if (running) throw new Error('A question is still being answered; stop it first.')
      const settings = activeAskProvider(deps.db)
      if (!settings) throw new Error('Set up a model first (Stats › Ask › Model).')
      const q = question.trim()
      if (!q) throw new Error('Ask a question first.')
      const thread = threadId ?? createAskThread(deps.db, titleOf(q), now().toISOString()).id
      const writer = writerOf(settings)
      const { history, last } = threadState(thread, writer)
      addAskMessage(deps.db, {
        threadId: thread,
        role: 'user',
        text: q,
        calls: [],
        results: [],
        flags: [],
        outcome: null,
        model: null,
        tokens: null,
        ms: null,
        createdAt: now().toISOString()
      })
      const controller = new AbortController()
      running = controller
      try {
        const opts = options()
        const library = opts.examples ? listAskExamples(deps.db) : []
        const out = await askTurn({
          question: q,
          provider: await providerOf(settings),
          analyst: deps.analyst,
          profile: settings.profile,
          mode: settings.mode,
          reasoning: settings.reasoning,
          history: settings.profile === 'full' ? history : [],
          last,
          examples: opts.examples ? (masked, tool) => similarExamples(masked, tool, library) : null,
          sampleK: opts.sampleK,
          signal: controller.signal,
          emit
        })
        if (deps.devMode()) appendTrace(join(deps.userData, 'ask'), out.trace)
        const message = addAskMessage(
          deps.db,
          {
            threadId: thread,
            role: 'assistant',
            text: out.text,
            calls: out.calls,
            results: out.results,
            flags: out.flags,
            outcome: out.outcome,
            model: out.trace.model,
            tokens: out.tokens,
            ms: out.ms,
            createdAt: now().toISOString()
          },
          { writer, transcript: out.transcript, state: out.state }
        )
        emit({ type: 'done', message })
        return message
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        emit({ type: 'error', error })
        throw err
      } finally {
        running = null
      }
    },

    stop: () => running?.abort(),
    threads: () => listAskThreads(deps.db),
    messages: (threadId) => listAskMessages(deps.db, threadId),
    deleteThread: (id) => deleteAskThread(deps.db, id),
    options,
    setOptions(o) {
      setSetting(deps.db, SETTING_ASK_EXAMPLES, o.examples ? '1' : '0')
      setSetting(deps.db, SETTING_ASK_SAMPLE_K, o.sampleK ? '1' : '0')
      return options()
    }
  }
}
