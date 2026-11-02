import type { StatsCard, ToolResult } from '@shared/ask'
import type { MetricInfo } from '@shared/stats/types'
import { fmt } from './format'

/**
 * Answers that can be checked (Ask spec §4.3, report D6): code reads the answer against the results
 * of its turn. No second model pass — a model reviewing itself does not improve answers and can make
 * them worse; checks against the data are reliable.
 *
 *   number — a number that no result (nor the question or the context) contains;
 *   sample — a rate from a row that is not qualified, given without its sample;
 *   base   — a split's value given without the overall line;
 *   causal — "because", "due to" … (soft: underlined, not blocked).
 */
export interface AnswerCheck {
  kind: 'number' | 'sample' | 'base' | 'causal'
  /** The words it is about, and where they are in the answer. */
  text: string
  at: [number, number]
  message: string
  severity: 'flag' | 'soft'
}

const NUMBER = /[-−+]?\d[\d,]*(?:\.\d+)?%?/g

interface Num {
  value: number
  decimals: number
  pct: boolean
}

function parse(token: string): Num {
  const pct = token.endsWith('%')
  const clean = token.replace(/[,%+]/g, '').replace('−', '-')
  const decimals = clean.includes('.') ? clean.split('.')[1].length : 0
  return { value: Number(clean), decimals, pct }
}

/** `a` (as written) is a rounding of `b`. */
const rounds = (a: Num, b: number): boolean =>
  Math.abs(a.value - b) <= 0.5 * 10 ** -a.decimals + 1e-9

/** Every number the answer may use: in the results' text, their rows, the question and the context. */
function allowed(
  results: ToolResult[],
  extra: string[],
  catalogue: ReadonlyMap<string, MetricInfo>
): number[] {
  const values: number[] = []
  const texts = [...results.map((r) => r.text), ...extra]
  for (const t of texts) {
    for (const m of t.matchAll(NUMBER)) {
      const n = parse(m[0])
      values.push(n.value)
    }
  }
  for (const r of results) {
    for (const card of r.cards) {
      if (card.kind !== 'stats') continue
      const rows = [...card.result.rows, ...(card.base ? [card.base] : [])]
      for (const row of rows) {
        values.push(row.games)
        for (const [id, v] of Object.entries(row.values)) {
          // A fraction is written as a percentage.
          const scale = catalogue.get(id)?.unit === 'pct' ? 100 : 1
          for (const x of [v.value, v.raw]) if (x !== null) values.push(x * scale)
          for (const x of [v.sample, v.percentile, v.rank]) if (x !== null) values.push(x)
        }
      }
      for (const split of Object.values(card.splits ?? {})) {
        for (const [id, s] of Object.entries(split)) {
          const scale = catalogue.get(id)?.unit === 'pct' ? 100 : 1
          if (s.diff !== null) values.push(s.diff * scale, Math.abs(s.diff) * scale)
        }
      }
    }
  }
  return values
}

const CAUSAL =
  /\b(because( of)?|due to|caused by|causes?|thanks to|as a result of|led to|leads to|which is why|the reason)\b/gi

export function checkAnswer(
  answer: string,
  results: ToolResult[],
  catalogue: ReadonlyMap<string, MetricInfo>,
  extra: { question: string; context?: string }
): AnswerCheck[] {
  const checks: AnswerCheck[] = []
  const ok = allowed(results, [extra.question, extra.context ?? ''], catalogue)
  for (const m of answer.matchAll(NUMBER)) {
    const n = parse(m[0])
    if (!Number.isFinite(n.value)) continue
    // Small whole numbers are prose ("the top 3", "2 of them").
    if (n.decimals === 0 && !n.pct && Math.abs(n.value) <= 10) continue
    if (ok.some((b) => rounds(n, b))) continue
    checks.push({
      kind: 'number',
      text: m[0],
      at: [m.index!, m.index! + m[0].length],
      message: 'not from the data',
      severity: 'flag'
    })
  }

  const cards = results.flatMap((r) => r.cards.filter((c): c is StatsCard => c.kind === 'stats'))
  for (const card of cards) {
    // Sample: an unqualified rate quoted without its sample.
    for (const row of card.result.rows) {
      for (const [id, v] of Object.entries(row.values)) {
        const info = catalogue.get(id)
        if (!info || info.kind !== 'rate' || v.qualified || v.value === null || v.sample === null)
          continue
        const shown = fmt(v.value, info.unit, info.decimals).replace(/^\+/, '')
        const at = answer.indexOf(shown)
        if (at < 0) continue
        if (answer.includes(String(Math.round(v.sample)))) continue
        checks.push({
          kind: 'sample',
          text: shown,
          at: [at, at + shown.length],
          message: `${info.label} for ${row.name} is on ${Math.round(v.sample)} ${info.sampleLabel}, below the qualified sample: say so`,
          severity: 'flag'
        })
      }
    }
    // Base: a split value quoted without the overall line.
    if (card.base) {
      const splitShown: [string, number][] = []
      const baseShown: string[] = []
      for (const [id, v] of Object.entries(card.base.values)) {
        const info = catalogue.get(id)
        if (!info || v.value === null) continue
        baseShown.push(fmt(v.value, info.unit, info.decimals).replace(/^\+/, ''))
        for (const row of card.result.rows) {
          const sv = row.values[id]
          if (!sv || sv.value === null) continue
          const s = fmt(sv.value, info.unit, info.decimals).replace(/^\+/, '')
          const at = answer.indexOf(s)
          if (at >= 0) splitShown.push([s, at])
        }
      }
      if (splitShown.length > 0 && !baseShown.some((b) => answer.includes(b))) {
        const [text, at] = splitShown[0]
        checks.push({
          kind: 'base',
          text,
          at: [at, at + text.length],
          message: 'a split without the overall line: give the base first',
          severity: 'flag'
        })
      }
    }
  }

  for (const m of answer.matchAll(CAUSAL)) {
    checks.push({
      kind: 'causal',
      text: m[0],
      at: [m.index!, m.index! + m[0].length],
      message: 'a cause the data does not show',
      severity: 'soft'
    })
  }
  return checks.sort((a, b) => a.at[0] - b.at[0])
}
