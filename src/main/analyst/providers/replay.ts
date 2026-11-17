import type { ModelInfo, ToolOutcome } from '@shared/ask'
import type { Analyst } from '../tools'
import type { ChatReply, ChatRequest, Provider } from './types'

/**
 * Recorded model replies (Ask spec §10, Plan AG1 amendment E): a live run records each call's request
 * shape and reply; `npm test` replays them through the real loop, so a change to the loop, the
 * compact schema or an adapter that alters an answer fails without any model running.
 */
export interface RecordedCall {
  /** What identifies the request: the brief's first line, the tool names or the schema's name. */
  shape: { system: string; tools: string[]; json: string | null; turns: number }
  reply: ChatReply
  /** How long the live call took. */
  ms?: number
}

export interface Recording {
  model: string
  question: string
  calls: RecordedCall[]
  /** What the turn did, for the replay to compare. */
  expect?: { outcome: string; calls: { tool: string; args: unknown }[] }
  /** Each call's outcome on the live database (cards left out), returned again by the replay. */
  outcomes?: ToolOutcome[]
}

/** An outcome without its cards (whole engine results), as a recording keeps it. */
export const recordedOutcome = (o: ToolOutcome): ToolOutcome => (o.ok ? { ...o, cards: [] } : o)

/**
 * The analyst of a replay: the real one for the turn and the tool definitions, and the recorded
 * outcomes for the calls, so a replay needs no database.
 */
export function replayAnalyst(analyst: Analyst, outcomes: ToolOutcome[]): Analyst {
  let at = 0
  return {
    turn: () => analyst.turn(),
    definitions: (turn) => analyst.definitions(turn),
    async run(name) {
      const next = outcomes[at++]
      if (!next || next.tool !== name)
        return {
          ok: false,
          tool: name,
          error: `replay: the recording has no ${name} call here`,
          ms: 0
        }
      return next
    }
  }
}

const shapeOf = (r: ChatRequest): RecordedCall['shape'] => ({
  system: r.system.split('\n')[0].slice(0, 120),
  tools: (r.tools ?? []).map((t) => t.name),
  json: r.json?.name ?? null,
  turns: r.messages.length
})

/** Wraps a provider and keeps every call (the native content left out: it holds signatures). */
export function recording(provider: Provider, into: RecordedCall[]): Provider {
  return {
    label: provider.label,
    model: provider.model,
    models: (signal) => provider.models(signal),
    async chat(req, signal, onText) {
      const started = Date.now()
      const reply = await provider.chat(req, signal, onText)
      const kept: ChatReply = { ...reply }
      delete kept.native
      into.push({ shape: shapeOf(req), reply: kept, ms: Date.now() - started })
      return reply
    }
  }
}

/** A provider that answers from a recording, and fails when the loop asks something else. */
export function replaying(rec: Recording): Provider & { left(): number } {
  let at = 0
  return {
    label: `replay · ${rec.model}`,
    model: rec.model,
    models: async (): Promise<ModelInfo[]> => [],
    left: () => rec.calls.length - at,
    async chat(req, _signal, onText) {
      const next = rec.calls[at++]
      if (!next) throw new Error(`replay of "${rec.question}": the loop made an extra model call`)
      const shape = shapeOf(req)
      if (JSON.stringify(shape) !== JSON.stringify(next.shape))
        throw new Error(
          `replay of "${rec.question}": call ${at} differs: ${JSON.stringify(shape)} vs ${JSON.stringify(next.shape)}`
        )
      if (onText && next.reply.text) onText(next.reply.text)
      return next.reply
    }
  }
}
