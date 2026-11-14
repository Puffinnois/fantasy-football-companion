import type {
  AskCall,
  AskEvent,
  AskFlag,
  AskMessage,
  CallingMode,
  Reasoning,
  ToolOutcome,
  ToolProfile,
  ToolResult
} from '@shared/ask'
import type { AskExample } from '@main/db/repos/askExamples'
import { type BriefKind, briefHash, briefText } from './brief'
import { checkAnswer } from './checks'
import { type CompactAnswer, compactAnswer, compactCall } from './compact'
import { examplesText } from './examples'
import { type FollowState, followUp, isFollowUp, lastTurnText } from './followup'
import { type ProviderError, ProviderError as ProviderErrorClass } from './providers/types'
import type { ChatMessage, ChatReply, ChatRequest, Provider, ToolReply } from './providers/types'
import { type ContextBlock, contextText, resolve } from './resolve'
import { check, listedSchema, type Schema } from './schema'
import { type Analyst, toolsHash, type TurnContext } from './tools'
import { maskQuestion, resolverTrace, type Trace, traceCall } from './trace'

/**
 * The agent loop (Ask spec §5.1): one loop for every model, with the planning and the checking in
 * code. A turn:
 *
 *   1. the resolver reads the question (and, for a follow-up, the last one); an ambiguous name is
 *      asked back and advice or an out-of-range season declined, with no model call;
 *   2. the model gets the brief, the context block and the tools of its profile;
 *   3. the calls run (in parallel when a step makes several); a failed call goes back to the model
 *      with the error, which says how to fix it;
 *   4. the model writes the answer, streamed;
 *   5. the answer checks run against the turn's results.
 *
 * Three ways to call the model (§5.2): the full profile with native tool calls, the full profile in
 * structured mode (one JSON object per step), and the compact profile (the classifier's tool, only
 * its open slots, `{thought, args}`).
 */
export interface LoopLimits {
  /** Tool calls per turn. */
  calls: number
  /** Failed calls per turn. */
  failures: number
  /** The output cap of one model call (tokens). */
  callTokens: number
  /** The output cap of the compact profile's answer: two or three sentences, and room to think. */
  answerTokens: number
  /** Input and output tokens per turn. */
  turnTokens: number
  timeoutMs: number
}

export const LIMITS: LoopLimits = {
  calls: 8,
  failures: 3,
  callTokens: 1500,
  answerTokens: 1024,
  turnTokens: 120_000,
  timeoutMs: 90_000
}

export interface LoopInput {
  question: string
  provider: Provider
  analyst: Analyst
  profile: ToolProfile
  mode: CallingMode
  reasoning: Reasoning
  /** The thread's earlier turns, as the full profile resends them. */
  history: ChatMessage[]
  /** The thread's last question and call (follow-ups). */
  last: FollowState | null
  /** The example library (off: null). */
  examples: ((masked: string, tool: string | null) => AskExample[]) | null
  /** Re-sample an invalid first call instead of re-prompting (spec §5.1; off by default). */
  sampleK: boolean
  limits?: Partial<LoopLimits>
  signal: AbortSignal
  emit: (event: AskEvent) => void
}

export interface LoopOutput {
  text: string
  outcome: NonNullable<AskMessage['outcome']>
  calls: AskCall[]
  results: ToolOutcome[]
  flags: AskFlag[]
  tokens: { input: number; output: number }
  ms: number
  /** This turn's messages, for the next turn's history. */
  transcript: ChatMessage[]
  state: FollowState
  trace: Trace
}

/** Thrown inside a turn when it must end: the reason becomes the answer. */
class TurnEnd extends Error {
  constructor(
    readonly outcome: 'error' | 'stopped',
    message: string
  ) {
    super(message)
  }
}

/** The JSON object in a structured reply (some models wrap it in a fence or add words). */
export function jsonOf(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(t) as unknown
  } catch {
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1)) as unknown
      } catch {
        // fall through
      }
    }
    return undefined
  }
}

const STEP_THOUGHT = 300

/** The full profile's structured step: the next tool and its arguments, or `answer`. */
function stepSchema(tools: string[]): Schema {
  return {
    type: 'object',
    properties: {
      thought: { type: 'string', maxLength: STEP_THOUGHT },
      tool: { enum: [...tools, 'answer'] },
      args: { type: 'object' }
    },
    required: ['thought', 'tool', 'args'],
    additionalProperties: false
  }
}

const ambiguousText = (b: ContextBlock): string =>
  b.ambiguous
    .map((a) => {
      const options = a.options.map(
        (p) => `${p.name} (${[p.position, p.team].filter(Boolean).join(', ')})`
      )
      return `Which "${a.mention}" do you mean: ${options.join(' or ')}?`
    })
    .join(' ')

export async function askTurn(input: LoopInput): Promise<LoopOutput> {
  const started = Date.now()
  const limits = { ...LIMITS, ...input.limits }
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(limits.timeoutMs)])
  const { provider, analyst, emit } = input
  const turn: TurnContext = await analyst.turn()
  const deps = { people: turn.people, now: turn.now }
  const fresh = resolve(input.question, deps)
  const follow = input.last !== null && isFollowUp(fresh)
  let block = follow ? followUp(input.question, input.last!, deps) : fresh

  const calls: AskCall[] = []
  const results: ToolOutcome[] = []
  const traced: Trace['calls'] = []
  const tokens = { input: 0, output: 0 }
  const transcript: ChatMessage[] = []
  let failures = 0
  let briefKind: BriefKind = input.profile === 'compact' ? 'compact-call' : 'analyst'

  const finish = (
    text: string,
    outcome: LoopOutput['outcome'],
    flags: AskFlag[] = []
  ): LoopOutput => {
    const last = calls.length > 0 ? calls[calls.length - 1] : (input.last?.call ?? null)
    return {
      text,
      outcome,
      calls,
      results,
      flags,
      tokens,
      ms: Date.now() - started,
      transcript,
      state: { question: follow ? input.last!.question : input.question, call: last },
      trace: {
        at: new Date(started).toISOString(),
        question: input.question,
        brief: briefHash(briefKind),
        tools: toolsHash(turn.seasons),
        profile: input.profile,
        model: provider.label,
        mode: input.mode,
        resolver: resolverTrace(block),
        calls: traced,
        checks: flags.map((f) => ({ kind: f.kind, text: f.text })),
        tokens,
        ms: Date.now() - started
      }
    }
  }

  // 1. No model call for a decline or a name to ask about.
  if (block.decline) return finish(block.decline, 'decline')
  if (block.ambiguous.length > 0) return finish(ambiguousText(block), 'ask')

  /** One model call, with the turn's token budget and the stop reasons. */
  async function model(
    req: Omit<ChatRequest, 'maxTokens' | 'reasoning'>,
    stream: boolean,
    maxTokens = limits.callTokens
  ): Promise<ChatReply> {
    if (signal.aborted) throw new TurnEnd('stopped', 'Stopped.')
    if (tokens.input + tokens.output > limits.turnTokens)
      throw new TurnEnd('error', 'This question used up its token budget before an answer.')
    let reply: ChatReply
    try {
      reply = await provider.chat(
        { ...req, maxTokens, reasoning: input.reasoning },
        signal,
        stream ? (delta) => emit({ type: 'text', delta }) : undefined
      )
    } catch (err) {
      if (signal.aborted)
        throw new TurnEnd(
          'stopped',
          input.signal.aborted ? 'Stopped.' : 'The model took too long; the turn was stopped.'
        )
      if (err instanceof ProviderErrorClass)
        throw new TurnEnd('error', (err as ProviderError).message)
      throw err
    }
    tokens.input += reply.usage.input
    tokens.output += reply.usage.output
    return reply
  }

  /** Runs one tool call and records it. */
  async function run(tool: string, args: unknown): Promise<ToolOutcome> {
    const call = { tool, args }
    calls.push(call)
    emit({ type: 'call', call })
    const outcome = await analyst.run(tool, args, turn)
    results.push(outcome)
    traced.push(traceCall(tool, args, outcome))
    emit({ type: 'result', outcome })
    if (!outcome.ok) failures++
    return outcome
  }

  /** The result's title and first rows, when the model's answer did not come. */
  const fallbackAnswer = (outcome: ToolResult): string => {
    const rows = outcome.text.split('\n').slice(0, 6).join('\n')
    return `${rows}\n\n(The model did not finish its answer; these are the result's first lines.)`
  }

  const okResults = (): ToolResult[] => results.filter((r): r is ToolResult => r.ok)

  const checked = (text: string): LoopOutput => {
    const flags = checkAnswer(text, okResults(), turn.catalogue, {
      question: input.question,
      context: contextText(block)
    })
    return finish(text, 'answer', flags)
  }

  try {
    if (input.profile === 'compact') return checked(await compactTurn())
    if (input.mode === 'native') return checked(await nativeTurn())
    return checked(await structuredTurn())
  } catch (err) {
    if (err instanceof TurnEnd) return finish(err.message, err.outcome)
    throw err
  }

  // -------------------------------------------------------------------------------------------
  // The compact profile

  async function compactTurn(): Promise<string> {
    let cc = compactCall(block)!
    let widened = false
    let feedback: string | null = null
    let sampled = false
    let outcome: ToolOutcome | null = null
    while (outcome === null || !outcome.ok) {
      if (failures >= limits.failures)
        throw new TurnEnd('error', `The model could not make a valid call: ${feedbackOf(outcome)}`)
      const props = (cc.schema.properties!.args as Schema).properties ?? {}
      let args: Record<string, unknown> = {}
      if (Object.keys(props).length > 0) {
        const given = await compactArgs(cc, feedback)
        if (typeof given === 'string') {
          // An invalid reply: re-sample once when asked to, otherwise say what was wrong.
          if (input.sampleK && !sampled) {
            sampled = true
            continue
          }
          failures++
          feedback = given
          continue
        }
        args = given
      }
      const answer: CompactAnswer = compactAnswer(block, cc, args)
      if (answer.kind === 'other') {
        if (widened)
          throw new TurnEnd(
            'error',
            'None of the stats the app found fits the question; try naming the stat another way.'
          )
        // Ask spec §3.2 rule 5: re-resolve with the top 10 and ask once more.
        widened = true
        const wide = { ...deps, k: 10 }
        block = follow ? followUp(input.question, input.last!, wide) : resolve(input.question, wide)
        cc = compactCall(block) ?? cc
        continue
      }
      outcome = await run(answer.name, answer.args)
      if (!outcome.ok) feedback = `The call failed: ${outcome.error}. Fix the arguments.`
    }
    briefKind = 'compact-answer'
    const reply = await model(
      {
        system: briefText('compact-answer', turn.now),
        messages: [
          {
            role: 'user',
            text: `Question: ${input.question}\n\nResult of ${outcome.tool}:\n${outcome.text}`
          }
        ]
      },
      true,
      limits.answerTokens
    )
    // An answer cut off (or all reasoning): the result's first lines say it instead.
    if (reply.stop === 'length' || reply.text.trim() === '') return fallbackAnswer(outcome)
    return reply.text.trim()
  }

  function feedbackOf(outcome: ToolOutcome | null): string {
    return outcome && !outcome.ok ? outcome.error : 'its replies did not fit the arguments'
  }

  /** The model's compact arguments, or what was wrong with its reply. */
  async function compactArgs(
    cc: NonNullable<ReturnType<typeof compactCall>>,
    feedback: string | null
  ): Promise<Record<string, unknown> | string> {
    const examples = input.examples
      ? examplesText(input.examples(maskQuestion(block), cc.tool))
      : ''
    const user = [
      contextText(block),
      follow ? lastTurnText(input.last!) : '',
      examples,
      `Question: ${input.question}`,
      feedback ?? ''
    ]
      .filter(Boolean)
      .join('\n\n')
    const argsSchema = cc.schema.properties!.args as Schema
    const system = briefText('compact-call', turn.now, {
      tool: cc.tool,
      description: cc.description
    })
    if (input.mode === 'native') {
      const reply = await model(
        {
          system,
          messages: [{ role: 'user', text: user }],
          tools: [{ name: cc.tool, description: cc.description, schema: argsSchema }]
        },
        false
      )
      const call = reply.calls[0]
      if (!call) return `Call ${cc.tool} with its arguments.`
      const problem = check(argsSchema, call.args)
      return problem ? `${problem}.` : (call.args as Record<string, unknown>)
    }
    const reply = await model(
      {
        system,
        messages: [{ role: 'user', text: user }],
        json: { name: cc.tool, schema: cc.schema }
      },
      false
    )
    const parsed = jsonOf(reply.text)
    const problem = check(cc.schema, parsed, 'reply')
    if (problem) return `Your reply did not fit: ${problem}. Reply with one JSON object.`
    return (parsed as { args: Record<string, unknown> }).args
  }

  // -------------------------------------------------------------------------------------------
  // The full profile

  function firstMessage(): ChatMessage {
    const parts = [
      contextText(block),
      follow ? lastTurnText(input.last!) : '',
      `Question: ${input.question}`
    ]
    return { role: 'user', text: parts.filter(Boolean).join('\n\n') }
  }

  async function nativeTurn(): Promise<string> {
    const tools = analyst.definitions(turn).map((d) => ({
      name: d.name,
      description: d.description,
      schema: listedSchema(d.schema) as Schema
    }))
    const system = briefText('analyst', turn.now)
    transcript.push(firstMessage())
    let stopping = false
    for (;;) {
      const reply = await model(
        { system, messages: [...input.history, ...transcript], tools },
        true
      )
      transcript.push({
        role: 'assistant',
        text: reply.text,
        calls: reply.calls,
        native: reply.native
      })
      if (reply.calls.length === 0 || stopping) return reply.text.trim()
      const replies: ToolReply[] = await Promise.all(
        reply.calls.map(async (c): Promise<ToolReply> => {
          if (calls.length >= limits.calls)
            return {
              id: c.id,
              name: c.name,
              text: 'The call limit is reached; answer from the results so far.',
              error: true
            }
          const outcome = await run(c.name, c.args)
          return outcome.ok
            ? { id: c.id, name: c.name, text: outcome.text, error: false }
            : { id: c.id, name: c.name, text: outcome.error, error: true }
        })
      )
      transcript.push({ role: 'tool', results: replies })
      if (failures >= limits.failures || calls.length >= limits.calls) {
        // One last call to answer from what there is.
        stopping = true
        transcript.push({
          role: 'user',
          text: 'Answer now from the results you have, or say what is missing. Do not call more tools.'
        })
      }
    }
  }

  async function structuredTurn(): Promise<string> {
    const defs = analyst.definitions(turn)
    const schema = stepSchema(defs.map((d) => d.name))
    const toolText = defs
      .map(
        (d) =>
          `- ${d.name}: ${d.description}\n  arguments: ${JSON.stringify(listedSchema(d.schema))}`
      )
      .join('\n')
    const system = `${briefText('analyst', turn.now)}\n\nTools:\n${toolText}\n\nReply with one JSON object: {"thought": "...", "tool": "<a tool, or answer when the results are enough>", "args": {...}}.`
    transcript.push(firstMessage())
    while (calls.length < limits.calls && failures < limits.failures) {
      const reply = await model(
        { system, messages: [...input.history, ...transcript], json: { name: 'step', schema } },
        false
      )
      transcript.push({ role: 'assistant', text: reply.text, calls: [] })
      const step = jsonOf(reply.text)
      const problem = check(schema, step, 'reply')
      if (problem) {
        failures++
        transcript.push({
          role: 'user',
          text: `Your reply did not fit: ${problem}. Reply with one JSON object.`
        })
        continue
      }
      const { tool, args } = step as { tool: string; args: unknown }
      if (tool === 'answer') break
      const outcome = await run(tool, args)
      transcript.push({
        role: 'user',
        text: outcome.ok
          ? `Result of ${tool}:\n${outcome.text}`
          : `The call failed: ${outcome.error}. Fix the arguments, or answer.`
      })
    }
    if (okResults().length === 0 && failures >= limits.failures)
      throw new TurnEnd('error', 'The model could not make a valid call.')
    transcript.push({
      role: 'user',
      text: 'Now write the answer for the question, from the results.'
    })
    const reply = await model(
      { system: briefText('analyst', turn.now), messages: [...input.history, ...transcript] },
      true
    )
    transcript.push({ role: 'assistant', text: reply.text, calls: [] })
    return reply.text.trim()
  }
}
