import { copyFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compactAnswer, compactCall } from '@main/analyst/compact'
import { followUp, isFollowUp } from '@main/analyst/followup'
import { resolve } from '@main/analyst/resolve'
import { createAnalyst } from '@main/analyst/tools'
import { openStatsService } from '@main/stats/service'
import { perfectArgs, slotsOf } from './perfect'
import { QUESTION_SET } from './questions'

/**
 * Plan AG1 (amendment G) on the frozen database: each follow-up of the question set, read with the
 * turn before it, gives its reference call when a perfect model fills the compact schema. Run with
 * `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask`.
 */
const DB = process.env.FFC_ASK_DB

describe.skipIf(!DB || !existsSync(DB))('follow-ups on the frozen database', () => {
  it('give their reference calls', { timeout: 300_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-ask-follow-'))
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
    const problems: Record<string, unknown>[] = []
    const items = QUESTION_SET.questions.filter((q) => q.previous && q.reference)
    try {
      const turn = await analyst.turn()
      const deps = { people: turn.people, now: turn.now }
      for (const q of items) {
        const fresh = resolve(q.question, deps)
        if (!isFollowUp(fresh)) {
          problems.push({ id: q.id, problem: 'not seen as a follow-up', type: fresh.type })
          continue
        }
        const b = followUp(
          q.question,
          { question: q.previous!.question, call: q.previous!.reference },
          deps
        )
        const call = compactCall(b)
        const ref = q.reference!
        if (!call || call.tool !== ref.tool) {
          problems.push({ id: q.id, problem: 'tool', got: call?.tool ?? null })
          continue
        }
        const want = ([] as unknown[]).concat(ref.args.metric ?? [], ref.args.metrics ?? [])
        const offered = b.metrics.map((m) => m.id)
        const missing = want.filter((m) => !offered.includes(String(m)))
        if (missing.length > 0)
          problems.push({ id: q.id, problem: 'metric not offered', missing, offered })
        const answer = compactAnswer(b, call, perfectArgs(call, ref.args))
        if (answer.kind !== 'call') continue
        const season = QUESTION_SET.frozen.season
        const a = slotsOf(ref.args, season)
        const g = slotsOf(answer.args, season)
        const wrong = [...new Set([...Object.keys(a), ...Object.keys(g)])].filter(
          (k) => a[k] !== g[k]
        )
        if (wrong.length > 0)
          problems.push({
            id: q.id,
            problem: 'slots',
            wrong: Object.fromEntries(wrong.map((k) => [k, { want: a[k], got: g[k] }]))
          })
      }
      // Fresh questions must not be taken for follow-ups.
      const fresh = QUESTION_SET.questions.filter((q) => !q.previous)
      const taken = fresh.filter((q) => isFollowUp(resolve(q.question, deps))).map((q) => q.id)
      console.log(JSON.stringify({ followups: items.length, problems, freshTaken: taken }, null, 1))
      expect(problems).toEqual([])
      expect(taken).toEqual([])
    } finally {
      await service.close()
    }
  })
})
