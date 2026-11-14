import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AskCall, CallingMode, ToolProfile } from '@shared/ask'
import type { Person } from '@shared/stats/types'
import { askTurn } from '@main/analyst/loop'
import { ollama, ollamaModel } from '@main/analyst/providers/ollama'
import { OLLAMA_BASE_URL } from '@shared/askPresets'
import {
  type RecordedCall,
  recordedOutcome,
  recording,
  type Recording
} from '@main/analyst/providers/replay'
import { createAnalyst } from '@main/analyst/tools'
import { openStatsService } from '@main/stats/service'

/**
 * Plan AG1's gate (Task 11): the probe's 20 questions through the real loop, on the frozen database,
 * with a local model. Run with
 *
 *   FFC_ASK_DB=<copy of stats.duckdb> FFC_ASK_LIVE=ollama:qwen3:4b[,ollama:gemma3:4b] \
 *     [FFC_ASK_PROFILE=compact|full] [FFC_ASK_MODE=structured|native] [FFC_ASK_RECORD=1] npm run test:ask
 *
 * A question is right when the loop's first successful call is the probe's reference (tool, subject,
 * metric, position, split and situation). With FFC_ASK_RECORD=1 the replies are written to
 * `tests/ask/replays/` for `npm test` to replay.
 */
const DB = process.env.FFC_ASK_DB
const LIVE = (process.env.FFC_ASK_LIVE ?? '').split(',').filter(Boolean)
const PROFILE = (process.env.FFC_ASK_PROFILE ?? 'compact') as ToolProfile
const MODE = process.env.FFC_ASK_MODE as CallingMode | undefined

interface ProbeQuestion {
  id: string
  q: string
  ref: Record<string, unknown> & { tool: string }
}

const PROBE = JSON.parse(
  readFileSync(join(__dirname, '../../docs/research/ask-probes/data/p2_questions.json'), 'utf8')
) as ProbeQuestion[]

const list = (v: unknown): unknown[] => ([] as unknown[]).concat(v ?? [])

/** Why the call is not the reference, or null when it is. */
export function probeMiss(ref: ProbeQuestion['ref'], call: AskCall | undefined): string | null {
  if (!call) return 'no call'
  const a = (call.args ?? {}) as Record<string, unknown>
  if (call.tool !== ref.tool) return `tool ${call.tool}`
  const metrics = [...list(a.metric), ...list(a.metrics)].map(String)
  const want = [...list(ref.metric), ...list(ref.metrics_any)].map(String)
  const pressure =
    ref.pressure_or_metric === true && (a.pressure === true || metrics.includes('pressured_epa'))
  if (want.length > 0 && !metrics.some((m) => want.includes(m)) && !pressure) {
    // A line's usual metrics (`default`) answer "how does he do" questions.
    if (!(ref.tool === 'player_stats' && metrics.length === 0 && ref.by))
      return `metric ${metrics.join(',') || 'default'}`
  }
  if (ref.pressure_or_metric === true && !pressure) return 'no pressure'
  for (const k of ['player', 'team', 'position', 'by', 'coverage', 'red_zone'] as const)
    if (ref[k] !== undefined && JSON.stringify(a[k]) !== JSON.stringify(ref[k]))
      return `${k} ${JSON.stringify(a[k])}`
  if (ref.ids && JSON.stringify(list(a.ids).sort()) !== JSON.stringify(list(ref.ids).sort()))
    return 'ids'
  if (ref.seasons && JSON.stringify(a.seasons) !== JSON.stringify(ref.seasons))
    return `seasons ${JSON.stringify(a.seasons)}`
  return null
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? 0 : s[Math.floor((s.length - 1) / 2)]
}

describe.skipIf(!DB || !existsSync(DB) || LIVE.length === 0)('the loop with a live model', () => {
  it('answers the probe questions', { timeout: 3_600_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-ask-live-'))
    copyFileSync(DB!, join(dir, 'stats.duckdb'))
    if (existsSync(`${DB}.wal`)) copyFileSync(`${DB}.wal`, join(dir, 'stats.duckdb.wal'))
    const service = await openStatsService(
      { path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') },
      () => {},
      async () => {
        throw new Error('offline')
      }
    )
    const analyst = createAnalyst({ stats: service, league: () => null })
    const summary: Record<string, unknown>[] = []
    try {
      for (const spec of LIVE) {
        const [kind, ...rest] = spec.split(':')
        const id = rest.join(':')
        if (kind !== 'ollama') throw new Error(`FFC_ASK_LIVE: unknown provider ${kind}`)
        const info = await ollamaModel(OLLAMA_BASE_URL, id, AbortSignal.timeout(10_000))
        const mode: CallingMode =
          MODE ?? (info?.tools && PROFILE === 'full' ? 'native' : 'structured')
        const base = ollama({
          baseUrl: OLLAMA_BASE_URL,
          model: id,
          info,
          context: PROFILE === 'full' ? 32768 : 8192
        })
        const misses: Record<string, string> = {}
        const ms: number[] = []
        const callMs: number[] = []
        const recordings: Recording[] = []
        const people = new Map<string, Person>()
        const turn = await analyst.turn()
        let right = 0
        // One warm-up call loads the model, so the first question's time is not the load.
        await base.chat(
          {
            system: 'Reply OK.',
            messages: [{ role: 'user', text: 'OK?' }],
            maxTokens: 5,
            reasoning: 'off'
          },
          AbortSignal.timeout(300_000)
        )
        for (const q of PROBE) {
          const calls: RecordedCall[] = []
          const out = await askTurn({
            question: q.q,
            provider: recording(base, calls),
            analyst,
            profile: PROFILE,
            mode,
            reasoning: 'off',
            history: [],
            last: null,
            examples: null,
            sampleK: false,
            signal: new AbortController().signal,
            emit: () => {}
          })
          ms.push(out.ms)
          if (calls[0]?.ms !== undefined) callMs.push(calls[0].ms)
          const first = out.calls.find((_, i) => out.results[i]?.ok)
          const miss =
            out.outcome === 'answer' ? probeMiss(q.ref, first) : `${out.outcome}: ${out.text}`
          if (miss) misses[q.id] = miss
          else right++
          recordings.push({
            model: id,
            question: q.q,
            calls,
            expect: { outcome: out.outcome, calls: out.calls },
            outcomes: out.results.map(recordedOutcome)
          })
          for (const pid of out.trace.resolver.players) {
            const person = turn.people.byId(pid)
            if (person) people.set(pid, person)
          }
        }
        summary.push({
          model: id,
          profile: PROFILE,
          mode,
          right: `${right}/${PROBE.length}`,
          medianMs: median(ms),
          slowestMs: Math.max(...ms),
          medianCallMs: median(callMs),
          misses
        })
        if (process.env.FFC_ASK_RECORD) {
          const out = join(__dirname, 'replays')
          mkdirSync(out, { recursive: true })
          const name = `${id.replace(/[^a-z0-9.]+/gi, '-')}-${PROFILE}-${mode}.json`
          writeFileSync(
            join(out, name),
            `${JSON.stringify({ model: id, profile: PROFILE, mode, through: turn.now, people: [...people.values()], recordings }, null, 1)}\n`
          )
        }
      }
      writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 1))
      process.stdout.write(`${JSON.stringify(summary, null, 1)}\n`)
      for (const s of summary) expect(s.right).toBeDefined()
    } finally {
      await service.close()
    }
  })
})
