import type { AskCall } from '@shared/ask'
import { METRICS } from '@shared/stats/catalogue'
import { TOOL_OF } from './classify'
import { type ContextBlock, type NamedPlayer, resolve, type ResolveDeps } from './resolve'
import { padded } from './text'

/**
 * Follow-ups (Ask spec §4.1, thread state; Plan AG1 amendment G): "now 2024", "only in the red
 * zone", "and Gibbs?". The thread keeps its last question and call. A question that names no subject
 * of its own, or opens like a follow-up, is read together with the last question: the new words
 * replace what they name (time, players, situations, a split, the end of the scale, a limit) and the
 * rest carries over. The model then sees both questions and the last call; the compact profile keeps
 * the last tool and offers the metric candidates of both questions.
 */
export interface FollowState {
  question: string
  call: AskCall | null
}

const OPENERS =
  /^ (and|now|what about|how about|only|just|also|add|same|instead|then|but|by|vs|versus|compared to|without|with) /

/** Types a question keeps for itself even right after another: definitions, schedules, the league. */
const OWN_TYPES = new Set(['advice', 'out_of_range', 'definition', 'games', 'league'])

/** Words that make a question a ranking of its own ("most receiving yards", "WOPR leaders"). */
const RANKS =
  / (who|which|best|worst|most|fewest|least|top|leaders?|leads|highest|lowest|rank|ranked) /

/**
 * The new question continues the last one: it opens like a follow-up ("and Gibbs?", "now 2024",
 * "only in the red zone"), or it is a few words with no subject, position or ranking of its own.
 */
export function isFollowUp(block: ContextBlock): boolean {
  if (OWN_TYPES.has(block.type)) return false
  const t = padded(block.question)
  const words = block.question.trim().split(/\s+/).length
  if (words > 8) return false
  if (OPENERS.test(t)) return true
  const noSubject = block.players.length + block.ambiguous.length + block.teams.length === 0
  return words <= 3 && noSubject && block.positions.length === 0 && !RANKS.test(t)
}

const unique = <T>(xs: T[], key: (x: T) => string): T[] => {
  const seen = new Set<string>()
  return xs.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const ADDS = / (add|also|plus|and also|include) /

/** The block for a follow-up: the last question's, with what the new words name replaced. */
export function followUp(question: string, last: FollowState, deps: ResolveDeps): ContextBlock {
  const now = resolve(question, deps)
  const before = resolve(last.question, deps)
  // Metric candidates from both questions: "what about against the run?" alone names no metric.
  const both = resolve(`${last.question} ${question}`, deps)
  const k = deps.k ?? 5
  const adding = before.tool === 'compare' && ADDS.test(padded(question))
  const players: NamedPlayer[] = adding
    ? unique([...before.players, ...now.players], (p) => p.id)
    : now.players.length > 0
      ? now.players
      : before.players
  const tool =
    now.players.length > 0 && !adding && before.tool === 'compare' ? TOOL_OF[now.type] : before.tool
  const pick = <T>(mine: T[], theirs: T[]): T[] => (mine.length > 0 ? mine : theirs)
  return {
    ...before,
    question: `${last.question} → ${question}`,
    tool: now.decline || now.ambiguous.length > 0 ? null : tool,
    players: players.slice(0, 4),
    ambiguous: now.ambiguous,
    teams: pick(now.teams, before.teams),
    opponents: pick(now.opponents, before.opponents),
    positions: pick(now.positions, before.positions),
    time: now.time.said.length > 0 ? now.time : before.time,
    slots: {
      flags: unique([...before.slots.flags, ...now.slots.flags], (f) => f),
      groupings: pick(now.slots.groupings, before.slots.groupings),
      rostered: now.slots.rostered ?? before.slots.rostered,
      limit: now.slots.limit ?? before.slots.limit,
      end: now.slots.end ?? before.slots.end,
      side: now.slots.side ?? before.slots.side
    },
    // The last call's metric stays a choice: "only in the red zone" names red-zone metrics, but the
    // question is still about targets.
    metrics: unique(
      [...lastMetrics(last, before), ...now.metrics, ...both.metrics],
      (m) => m.id
    ).slice(0, k),
    decline: now.decline
  }
}

/** The last call's metrics as candidates, in the order the call named them. */
function lastMetrics(last: FollowState, before: ContextBlock): ContextBlock['metrics'] {
  const args = (last.call?.args ?? {}) as { metric?: unknown; metrics?: unknown }
  const ids = ([] as unknown[]).concat(args.metric ?? [], args.metrics ?? []).map(String)
  return ids
    .flatMap((id) => {
      const m = METRICS.get(id)
      return m ? [{ id: m.id, label: m.label, entity: m.entity, description: m.description }] : []
    })
    .concat(before.metrics.filter((m) => ids.length === 0 && m))
}

/** What the model reads about the last turn (the full profile). */
export function lastTurnText(last: FollowState): string {
  const call = last.call
    ? ` The last call was ${last.call.tool} ${JSON.stringify(last.call.args)}.`
    : ''
  return `This question follows: "${last.question}".${call} Keep what the new question does not change.`
}
