import { METRIC_ALIASES, phraseKey } from '@shared/stats/aliases'
import { CATALOGUE } from '@shared/stats/catalogue'
import type { MetricDef } from '@shared/stats/types'
import { padded } from './text'

/**
 * Metric candidates for a question (Ask spec §4.1, report P1): lexical matching over each metric's
 * label, short name, id, aliases and description (BM25), with a bonus for an alias or label said
 * whole, then reordered so metrics that fit the question's entity and positions come first.
 * Embeddings can be added as a second `Retriever` (Plan AG); this one needs no model.
 */
export interface MetricCandidate {
  id: string
  score: number
}

export interface Retriever {
  rank(question: string, limit: number): MetricCandidate[]
}

const STOP = new Set(
  'a an the of in on at by for to and or is are was were be who which what how most best top highest lowest leaders leader ranked rank among this that year season his her their my me every per does do did get gets with from than more show give tell list players player team teams so far since last week weeks game games'.split(
    ' '
  )
)

const tokens = (text: string): string[] =>
  phraseKey(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOP.has(t))

/** Whole phrases worth a bonus when the question says them: aliases, labels, short names. */
interface Phrase {
  key: string
  id: string
  bonus: number
}

const SHOWN = CATALOGUE.filter((m) => m.tier !== 'stored')

function documentOf(m: MetricDef): string[] {
  const aliases = METRIC_ALIASES[m.id] ?? []
  return tokens(
    [
      m.label,
      m.label,
      m.short,
      m.short,
      m.id.replace(/_/g, ' '),
      ...aliases,
      ...aliases,
      m.description
    ].join(' ')
  )
}

export function lexicalRetriever(metrics: MetricDef[] = SHOWN): Retriever {
  const docs = metrics.map(documentOf)
  const n = docs.length
  const avg = docs.reduce((s, d) => s + d.length, 0) / n
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const phrases: Phrase[] = metrics.flatMap((m) => [
    ...(METRIC_ALIASES[m.id] ?? []).map((a) => ({ key: phraseKey(a), id: m.id, bonus: 6 })),
    { key: phraseKey(m.label), id: m.id, bonus: 5 },
    ...(m.short.length >= 3 ? [{ key: phraseKey(m.short), id: m.id, bonus: 3 }] : [])
  ])
  const index = new Map(metrics.map((m, i) => [m.id, i]))
  return {
    rank(question, limit) {
      const q = tokens(question)
      const scores = docs.map((d) => {
        let s = 0
        for (const t of q) {
          let f = 0
          for (const x of d) if (x === t) f++
          if (f === 0) continue
          const idf = Math.log(1 + (n - df.get(t)! + 0.5) / (df.get(t)! + 0.5))
          s += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.length) / avg))
        }
        return s
      })
      const text = padded(question)
      // The longest phrase said whole wins its bonus once per metric.
      const best = new Map<string, number>()
      for (const p of phrases) {
        if (p.key.length > 0 && text.includes(` ${p.key} `)) {
          best.set(p.id, Math.max(best.get(p.id) ?? 0, p.bonus + p.key.split(' ').length))
        }
      }
      for (const [id, bonus] of best) scores[index.get(id)!] += bonus
      return metrics
        .map((m, i) => ({ id: m.id, score: Math.round(scores[i] * 100) / 100 }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
    }
  }
}

/** Questions about teams as a whole: "which defenses", "teams with", "offenses". */
const TEAM_QUESTION = /\b(teams|defenses|offenses|offensive lines|units)\b/

/**
 * Metrics that fit what the question is about first: team metrics for a team question (or a team
 * subject and no player), player metrics at the named positions otherwise. A position after "on
 * the", "against" or "allowed to" is an object ("pressure on the quarterback"), not the subject.
 */
export function fits(
  question: string,
  ctx: { positions: string[]; players: number; teams: number }
): (m: MetricDef) => boolean {
  // "His team's targets" is about a player: the possessive is dropped before "teams" is looked for.
  const t = padded(question.replace(/['’]s\b/g, '')).replace(
    / (on the|against the|against|allowed to) \w+/g,
    ' '
  )
  const team =
    TEAM_QUESTION.test(t) || (ctx.teams > 0 && ctx.players === 0 && ctx.positions.length === 0)
  return (m) => {
    if (team) return m.entity === 'team'
    if (ctx.players > 0 || ctx.positions.length > 0) {
      if (m.entity !== 'player') return false
      if (ctx.positions.length === 0 || m.positions === 'all') return true
      return m.positions.some((p) => ctx.positions.includes(p))
    }
    return true
  }
}

/** The candidates: matches that fit first, then the rest, `limit` in all. */
export function metricCandidates(
  retriever: Retriever,
  question: string,
  fit: (m: MetricDef) => boolean,
  byId: ReadonlyMap<string, MetricDef>,
  limit: number
): MetricCandidate[] {
  const ranked = retriever.rank(question, 60)
  const ok = ranked.filter((c) => fit(byId.get(c.id)!))
  const rest = ranked.filter((c) => !fit(byId.get(c.id)!))
  return [...ok, ...rest].slice(0, limit)
}
