import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ToolResult } from '@shared/ask'
import { compactAnswer, compactCall } from '@main/analyst/compact'
import { resolve } from '@main/analyst/resolve'
import { createAnalyst, type TurnContext } from '@main/analyst/tools'
import { openStatsService } from '@main/stats/service'
import { QUESTION_SET } from './questions'

/**
 * Ask spec §10 (Plan AF1's gate): on the frozen database, every reference call runs and returns rows,
 * and the resolver finds the question's tool, metric and players. Run with
 * `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask`; the file is copied first, never opened in place.
 */
const DB = process.env.FFC_ASK_DB

const COMPACT: Record<string, string[]> = {
  leaderboard: ['leaderboard'],
  player_stats: ['player_stats'],
  team_stats: ['team_stats'],
  compare: ['compare'],
  trend: ['player_stats', 'team_stats'],
  outlook: ['outlook'],
  games: ['games'],
  league: ['league'],
  describe: ['describe']
}

/** A reference's situation arguments as the compact `filters` a perfect model would pick. */
function flagsOf(args: Record<string, unknown>): string[] {
  const f: string[] = []
  for (const k of [
    'red_zone',
    'inside_10',
    'goal_line',
    'third_down',
    'pressure',
    'blitz',
    'play_action',
    'neutral',
    'two_minute'
  ]) {
    if (args[k] === true) f.push(k)
  }
  if (args.coverage) f.push(`${String(args.coverage)}_coverage`)
  if (args.home === true) f.push('home')
  if (args.home === false) f.push('road')
  const down = JSON.stringify(args.down ?? null)
  if (down === '[4]') f.push('fourth_down')
  if (down === '[1,2]') f.push('early_downs')
  return f
}

/** The slots the resolver fills, as the reference and the compact answer give them. */
const SLOTS = [
  'seasons',
  'weeks',
  'last_games',
  'season_type',
  'player',
  'team',
  'ids',
  'opponent',
  'rostered',
  'limit',
  'order',
  'side'
] as const

function slotsOf(args: Record<string, unknown>, season: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of SLOTS) {
    let v = args[k]
    if (k === 'seasons' && v === undefined) v = [season]
    if (k === 'order' && v === undefined) v = 'best'
    if (k === 'ids' && Array.isArray(v)) v = [...v].sort()
    if (v !== undefined) out[k] = JSON.stringify(v)
  }
  return out
}

const rowsOf = (r: ToolResult): number =>
  r.cards.reduce(
    (n, c) =>
      n + (c.kind === 'stats' ? c.result.rows.length : c.kind === 'games' ? c.games.length : 1),
    0
  )

describe.skipIf(!DB || !existsSync(DB))(
  'the reference calls and the resolver on the frozen database',
  () => {
    it('pass the gates', { timeout: 600_000 }, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ffc-ask-'))
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
      const report: Record<string, unknown>[] = []
      let ran = 0
      let runnable = 0
      let tools = 0
      let toolsAsked = 0
      let metricHits = 0
      let metricsAsked = 0
      let playerHits = 0
      let playersAsked = 0
      let handled = 0
      let mustHandle = 0
      let slotsRight = 0
      let slotsAsked = 0
      const ms: number[] = []
      try {
        for (const q of QUESTION_SET.questions) {
          const turn: TurnContext = await analyst.turn()
          const entry: Record<string, unknown> = { id: q.id }
          if (q.reference && !q.needsLeague) {
            runnable++
            const out = await analyst.run(q.reference.tool, q.reference.args, turn)
            const ok = out.ok && rowsOf(out) > 0
            if (ok) ran++
            ms.push(out.ms)
            Object.assign(entry, { ran: ok, ms: out.ms, error: out.ok ? undefined : out.error })
          }
          if (q.previous) {
            report.push(entry)
            continue
          }
          const b = resolve(q.question, { people: turn.people, now: turn.now })
          if (q.expect === 'ask' || q.expect === 'decline') {
            // The resolver catches what it can: namesakes, advice and seasons out of range.
            const caught = q.expect === 'ask' ? b.ambiguous.length > 0 : b.decline !== null
            if (
              q.category === 'ambiguous' ||
              q.category === 'advice' ||
              /\b(19\d\d|2030)\b/.test(q.question)
            ) {
              mustHandle++
              if (caught) handled++
            }
            entry.caught = caught
          } else if (q.reference) {
            const accept = COMPACT[q.reference.tool] ?? []
            toolsAsked++
            if (b.tool && accept.includes(b.tool)) tools++
            const gold = ([] as unknown[]).concat(
              q.reference.args.metric ?? [],
              q.reference.args.metrics ?? []
            )
            // A vague or leading question names no metric: the model chooses (Plan AG grades it).
            if (gold.length > 0 && q.category !== 'vague' && q.category !== 'leading') {
              metricsAsked++
              if (gold.some((m) => b.metrics.some((c) => c.id === m))) metricHits++
            }
            const players = ([] as unknown[])
              .concat(
                q.reference.args.player ?? [],
                q.reference.args.ids ?? [],
                q.reference.args.id ?? []
              )
              .filter((x): x is string => typeof x === 'string' && x.startsWith('00-'))
            if (players.length > 0) {
              playersAsked++
              if (players.every((p) => b.players.some((x) => x.id === p))) playerHits++
            }
            // Slots: a perfect model's choices (metric, position, split, filters) from the reference,
            // the rest filled by the resolver; time, players, team, opponent, order, side and limit
            // must come out as the reference has them.
            const call = compactCall(b)
            const ref = q.reference.args
            if (
              call &&
              accept.includes(b.tool!) &&
              q.reference.tool !== 'trend' &&
              q.category !== 'vague' &&
              q.category !== 'leading'
            ) {
              const props = (
                call.schema.properties!.args as { properties: Record<string, unknown> }
              ).properties
              const model: Record<string, unknown> = {}
              if ('metric' in props) model.metric = ref.metric
              if ('metrics' in props) model.metrics = ref.metrics ?? ['default']
              if ('position' in props) model.position = ref.position ?? 'any'
              if ('by' in props) model.by = ref.by ?? 'none'
              if ('filters' in props) model.filters = flagsOf(ref)
              if ('what' in props) model.what = ref.what
              const answer = compactAnswer(b, call, model)
              if (answer.kind === 'call') {
                slotsAsked++
                const want = slotsOf(ref, QUESTION_SET.frozen.season)
                const got = slotsOf(answer.args, QUESTION_SET.frozen.season)
                const keys = [...new Set([...Object.keys(want), ...Object.keys(got)])]
                const wrong = keys.filter((k) => want[k] !== got[k])
                if (wrong.length === 0) slotsRight++
                else
                  entry.slots = Object.fromEntries(
                    wrong.map((k) => [k, { want: want[k], got: got[k] }])
                  )
              }
            }
            Object.assign(entry, {
              tool: b.tool,
              metrics: b.metrics.map((m) => m.id),
              players: b.players.map((p) => p.id)
            })
          }
          report.push(entry)
        }
      } finally {
        await service.close()
      }
      ms.sort((a, b) => a - b)
      const summary = {
        references: `${ran}/${runnable}`,
        tool: `${tools}/${toolsAsked}`,
        metricRecall5: `${metricHits}/${metricsAsked}`,
        players: `${playerHits}/${playersAsked}`,
        askOrDecline: `${handled}/${mustHandle}`,
        slots: `${slotsRight}/${slotsAsked}`,
        toolMs: {
          p50: ms[Math.floor(ms.length / 2)],
          p90: ms[Math.floor(ms.length * 0.9)],
          max: ms[ms.length - 1]
        }
      }
      if (process.env.FFC_ASK_REPORT)
        writeFileSync(process.env.FFC_ASK_REPORT, JSON.stringify({ summary, report }, null, 1))
      console.log(JSON.stringify(summary))
      expect(ran).toBe(runnable)
      expect(tools / toolsAsked).toBeGreaterThanOrEqual(0.9)
      expect(metricHits / metricsAsked).toBeGreaterThanOrEqual(0.95)
      expect(playerHits / playersAsked).toBeGreaterThanOrEqual(0.95)
      expect(handled).toBe(mustHandle)
      expect(slotsRight / slotsAsked).toBeGreaterThanOrEqual(0.95)
    })
  }
)
