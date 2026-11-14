import { describe, expect, it } from 'vitest'
import type { AskEvent, CallingMode, ToolProfile } from '@shared/ask'
import type { StatsQuery } from '@shared/stats/types'
import { askTurn, jsonOf, type LoopInput, type LoopOutput } from '@main/analyst/loop'
import {
  type ChatReply,
  type ChatRequest,
  type Provider,
  ProviderError
} from '@main/analyst/providers/types'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult, statsRow } from '../../fixtures/analyst'

const PUKA = '00-0039075'

function stats(queries: StatsQuery[] = []): AnalystStats {
  return {
    status: async () => ({
      available: true,
      through: { season: 2026, seasonType: 'REG', week: 7 },
      updatedAt: '2026-10-27T00:00:00Z',
      busy: false
    }),
    catalogue: async () => catalogueInfo(new Map()),
    people: async () => PEOPLE,
    query: async (q) => {
      queries.push(q)
      return statsResult([
        statsRow(PUKA, 'Puka Nacua', { yprr: { raw: 3.1, sample: 210, rank: 1 } }, { team: 'LA' })
      ])
    },
    games: async () => [],
    outlook: async () => {
      throw new Error('not in this test')
    },
    player: async () => {
      throw new Error('not in this test')
    }
  }
}

type Step = Partial<ChatReply> | ((req: ChatRequest) => Partial<ChatReply>) | Error

/** A provider that answers each call with the next step, and keeps the requests. */
function scripted(steps: Step[]): Provider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  let at = 0
  return {
    label: 'Scripted · test',
    model: 'test',
    requests,
    models: async () => [],
    async chat(req, signal, onText) {
      requests.push(structuredClone(req))
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      const step = steps[Math.min(at++, steps.length - 1)]
      if (step instanceof Error) throw step
      const r = typeof step === 'function' ? step(req) : step
      const reply: ChatReply = {
        text: r.text ?? '',
        calls: r.calls ?? [],
        usage: r.usage ?? { input: 100, output: 10 },
        stop: r.stop ?? (r.calls?.length ? 'tool' : 'end'),
        native: r.native
      }
      if (onText && reply.text) onText(reply.text)
      return reply
    }
  }
}

const json = (o: unknown): Partial<ChatReply> => ({ text: JSON.stringify(o) })

async function ask(
  question: string,
  provider: Provider,
  over: Partial<LoopInput> & { profile?: ToolProfile; mode?: CallingMode } = {}
): Promise<{ out: LoopOutput; events: AskEvent[]; queries: StatsQuery[] }> {
  const queries: StatsQuery[] = []
  const events: AskEvent[] = []
  const out = await askTurn({
    question,
    provider,
    analyst: createAnalyst({ stats: stats(queries), league: () => null }),
    profile: 'compact',
    mode: 'structured',
    reasoning: 'off',
    history: [],
    last: null,
    examples: null,
    sampleK: false,
    signal: new AbortController().signal,
    emit: (e) => events.push(e),
    ...over
  })
  return { out, events, queries }
}

const LEADERS = 'Who leads WRs in yards per route run?'

describe('a turn with no model call', () => {
  it('declines advice', async () => {
    const p = scripted([])
    const { out } = await ask('Should I start Bijan Robinson this week?', p)
    expect(out.outcome).toBe('decline')
    expect(p.requests).toHaveLength(0)
  })

  it('asks which namesake', async () => {
    const p = scripted([])
    const { out } = await ask("Chris Jones's sacks this season", p)
    expect(out.outcome).toBe('ask')
    expect(out.text).toContain('Which "Chris Jones" do you mean')
    expect(p.requests).toHaveLength(0)
  })
})

describe('the compact profile', () => {
  it('fills the classifier tool, runs it and answers from the result', async () => {
    const p = scripted([
      json({ thought: 'yprr for WRs', args: { metric: 'yprr', position: 'WR' } }),
      { text: 'Puka Nacua leads with 3.10 yards per route run.' }
    ])
    const { out, events, queries } = await ask(LEADERS, p)
    expect(out.outcome).toBe('answer')
    // No time in the question: the tool's default, the current season.
    expect(out.calls).toEqual([{ tool: 'leaderboard', args: { metric: 'yprr', position: 'WR' } }])
    expect(queries).toHaveLength(1)
    expect(p.requests[0].json?.name).toBe('leaderboard')
    expect(p.requests[0].messages[0]).toMatchObject({ role: 'user' })
    expect(p.requests[1].system).toContain('Answer the question in two or three sentences')
    expect(events.map((e) => e.type)).toEqual(['call', 'result', 'text'])
    expect(out.trace.profile).toBe('compact')
    expect(out.trace.calls[0].ok).toBe(true)
    expect(out.state).toEqual({ question: LEADERS, call: out.calls[0] })
  })

  it('flags a number that is not in the data', async () => {
    const p = scripted([
      json({ thought: '', args: { metric: 'yprr', position: 'WR' } }),
      { text: 'Puka Nacua leads with 4.25 yards per route run.' }
    ])
    const { out } = await ask(LEADERS, p)
    expect(out.flags.map((f) => f.kind)).toContain('number')
  })

  it('re-resolves with more metrics once on "other"', async () => {
    const p = scripted([
      json({ thought: 'none fits', args: { metric: 'other', position: 'WR' } }),
      (req) => {
        const metric = req.json!.schema.properties!.args.properties!.metric
        expect(metric.enum!.length).toBeGreaterThan(6)
        return json({ thought: '', args: { metric: 'yprr', position: 'WR' } })
      },
      { text: 'Puka leads.' }
    ])
    const { out } = await ask(LEADERS, p)
    expect(out.outcome).toBe('answer')
    expect(p.requests).toHaveLength(3)
  })

  it('tells the model what was wrong, and gives up after three failures', async () => {
    const p = scripted([{ text: 'not json' }])
    const { out } = await ask(LEADERS, p)
    expect(out.outcome).toBe('error')
    expect(p.requests).toHaveLength(3)
    const last = p.requests[2].messages[0]
    expect(last.role === 'user' && last.text).toContain('Your reply did not fit')
  })

  it('re-samples an invalid first reply with sample-k on', async () => {
    const p = scripted([
      { text: 'oops' },
      json({ thought: '', args: { metric: 'yprr', position: 'WR' } }),
      { text: 'Puka leads.' }
    ])
    const { out } = await ask(LEADERS, p, { sampleK: true })
    expect(out.outcome).toBe('answer')
    expect(p.requests[1].messages).toEqual(p.requests[0].messages)
  })

  it('answers from the result when the model runs out of room', async () => {
    const p = scripted([
      json({ thought: '', args: { metric: 'yprr', position: 'WR' } }),
      { text: 'Okay, the user is asking', stop: 'length' }
    ])
    const { out } = await ask(LEADERS, p)
    expect(out.text).toContain('Puka Nacua')
    expect(out.text).toContain('did not finish its answer')
  })

  it('carries a follow-up from the last call', async () => {
    const p = scripted([
      json({ thought: '', args: { metric: 'yprr', position: 'WR' } }),
      { text: 'In 2024, Puka leads.' }
    ])
    const { out } = await ask('now 2024', p, {
      last: {
        question: 'Who leads WRs in yards per route run this season?',
        call: { tool: 'leaderboard', args: { metric: 'yprr', position: 'WR', seasons: [2026] } }
      }
    })
    expect(out.calls[0]).toEqual({
      tool: 'leaderboard',
      args: { metric: 'yprr', position: 'WR', seasons: [2024] }
    })
    expect(out.state.question).toBe('Who leads WRs in yards per route run this season?')
  })
})

describe('the full profile, native tools', () => {
  it('runs the calls, sends the results back and answers', async () => {
    const p = scripted([
      {
        calls: [{ id: 'c1', name: 'leaderboard', args: { metric: 'yprr', position: 'WR' } }],
        native: { by: 'x', content: ['kept'] }
      },
      { text: 'Puka Nacua leads with 3.10.' }
    ])
    const { out } = await ask(LEADERS, p, { profile: 'full', mode: 'native' })
    expect(out.outcome).toBe('answer')
    const metric = p.requests[0].tools!.find((t) => t.name === 'leaderboard')!.schema.properties!
      .metric
    expect(metric).toMatchObject({ type: 'string' })
    expect(metric.enum).toBeUndefined()
    expect(p.requests[1].messages.slice(1)).toMatchObject([
      { role: 'assistant', native: { by: 'x', content: ['kept'] } },
      { role: 'tool', results: [{ id: 'c1', name: 'leaderboard', error: false }] }
    ])
    // The transcript is what the next turn resends.
    expect(out.transcript.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  })

  it('sends a failed call back with its error, then stops calling at the limit', async () => {
    const p = scripted([{ calls: [{ id: 'c', name: 'leaderboard', args: { metric: 'nope' } }] }])
    const { out } = await ask(LEADERS, p, { profile: 'full', mode: 'native' })
    expect(out.calls).toHaveLength(3)
    const tool = p.requests[1].messages.find((m) => m.role === 'tool')
    expect(tool?.role === 'tool' && tool.results[0]).toMatchObject({ error: true })
    const last = p.requests[p.requests.length - 1].messages.at(-1)
    expect(last).toMatchObject({ role: 'user', text: expect.stringContaining('Answer now') })
  })

  it('leaves no unanswered call when the model calls on the last step', async () => {
    const call = {
      calls: [{ id: 'c1', name: 'leaderboard', args: { metric: 'yprr', position: 'WR' } }],
      native: { by: 'x', content: ['tool_use'] }
    }
    const p = scripted([call, { ...call, calls: [{ ...call.calls[0], id: 'c2' }] }])
    const { out } = await ask(LEADERS, p, {
      profile: 'full',
      mode: 'native',
      limits: { calls: 1 }
    })
    expect(out.outcome).toBe('answer')
    expect(out.text).toContain('Puka Nacua')
    expect(out.text).toContain('did not finish its answer')
    // Every assistant message with calls is followed by their results.
    out.transcript.forEach((m, i) => {
      if (m.role === 'assistant' && m.calls.length > 0)
        expect(out.transcript[i + 1]).toMatchObject({ role: 'tool' })
    })
    expect(out.transcript.at(-1)).toMatchObject({ role: 'assistant', calls: [] })
    expect(out.transcript.at(-1)).not.toHaveProperty('native')
  })

  it('answers from the result when the answer is cut off or empty', async () => {
    const call = {
      calls: [{ id: 'c1', name: 'leaderboard', args: { metric: 'yprr', position: 'WR' } }]
    }
    for (const last of [{ text: 'Okay, so the user', stop: 'length' as const }, { text: ' ' }]) {
      const { out } = await ask(LEADERS, scripted([call, last]), {
        profile: 'full',
        mode: 'native'
      })
      expect(out.outcome).toBe('answer')
      expect(out.text).toContain('Puka Nacua')
      expect(out.text).toContain('did not finish its answer')
    }
  })

  it('ends the turn when the model declines, with no retry', async () => {
    for (const over of [
      { profile: 'full', mode: 'native' },
      { profile: 'full', mode: 'structured' },
      { profile: 'compact', mode: 'structured' },
      { profile: 'compact', mode: 'native' }
    ] as const) {
      const p = scripted([{ text: 'I cannot help with that.', stop: 'refusal' }])
      const { out } = await ask(LEADERS, p, over)
      expect(out.outcome).toBe('error')
      expect(out.text).toBe('The model declined to answer this question.')
      expect(p.requests).toHaveLength(1)
    }
  })

  it('ends on a provider error with its message', async () => {
    const p = scripted([
      new ProviderError('refusal', 'The model declined to answer this question.')
    ])
    const { out } = await ask(LEADERS, p, { profile: 'full', mode: 'native' })
    expect(out.outcome).toBe('error')
    expect(out.text).toBe('The model declined to answer this question.')
  })

  it('stops when the user stops it', async () => {
    const stop = new AbortController()
    stop.abort()
    const { out } = await ask(LEADERS, scripted([{ text: 'x' }]), {
      profile: 'full',
      mode: 'native',
      signal: stop.signal
    })
    expect(out.outcome).toBe('stopped')
  })
})

describe('the full profile, structured mode', () => {
  it('takes steps until "answer", then writes the answer', async () => {
    const p = scripted([
      json({ thought: 'rank', tool: 'leaderboard', args: { metric: 'yprr', position: 'WR' } }),
      json({ thought: 'enough', tool: 'answer', args: {} }),
      { text: 'Puka Nacua leads.' }
    ])
    const { out } = await ask(LEADERS, p, { profile: 'full', mode: 'structured' })
    expect(out.outcome).toBe('answer')
    expect(out.calls.map((c) => c.tool)).toEqual(['leaderboard'])
    expect(p.requests[0].json?.name).toBe('step')
    expect(p.requests[2].json).toBeUndefined()
  })

  it('answers from the result when the answer is cut off', async () => {
    const p = scripted([
      json({ thought: 'rank', tool: 'leaderboard', args: { metric: 'yprr', position: 'WR' } }),
      json({ thought: 'enough', tool: 'answer', args: {} }),
      { text: 'Okay, so the user', stop: 'length' }
    ])
    const { out } = await ask(LEADERS, p, { profile: 'full', mode: 'structured' })
    expect(out.outcome).toBe('answer')
    expect(out.text).toContain('Puka Nacua')
    expect(out.text).toContain('did not finish its answer')
  })
})

describe('jsonOf', () => {
  it('reads a fenced or wrapped object', () => {
    expect(jsonOf('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(jsonOf('Here: {"a":1} done')).toEqual({ a: 1 })
    expect(jsonOf('nothing')).toBeUndefined()
  })
})
