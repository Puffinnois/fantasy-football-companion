import { METRICS } from '@shared/stats/catalogue'
import { TEAM_NAMES } from '@shared/stats/nflTeams'
import type { Person } from '@shared/stats/types'
import { classify, type CompactTool, TOOL_OF, type QuestionType } from './classify'
import { fits, lexicalRetriever, metricCandidates, type Retriever } from './metrics'
import { type PlayerIndex, positionsIn } from './players'
import { detectSlots, type Slots } from './slots'
import { findTeams } from './teams'
import { type Now, resolveTime, type ResolvedTime } from './time'

/**
 * The resolver (Ask spec §4.1): deterministic code that reads the question before any model does and
 * attaches a context block — players, teams, metric candidates, time, the slots its words name and
 * the question type. A strong model may ignore it; a small one copies ids from it, and the compact
 * profile builds its schema from it (§3.2).
 */
export interface NamedPlayer {
  id: string
  name: string
  position: string | null
  team: string | null
  mention: string
}

export interface NamedTeam {
  code: string
  name: string
  mention: string
}

export interface MetricHint {
  id: string
  label: string
  entity: 'player' | 'team'
  description: string
}

export interface ContextBlock {
  question: string
  now: Now
  type: QuestionType
  /** The compact profile's tool; null when the question is declined or must be asked back. */
  tool: CompactTool | null
  players: NamedPlayer[]
  /** Names that match several players: the question goes back to the user. */
  ambiguous: { mention: string; options: NamedPlayer[] }[]
  teams: NamedTeam[]
  opponents: NamedTeam[]
  /** Position words in the question. */
  positions: string[]
  time: ResolvedTime
  slots: Slots
  metrics: MetricHint[]
  /** Why the question is declined before any model is called. */
  decline: string | null
}

export interface ResolveDeps {
  people: PlayerIndex
  now: Now
  retriever?: Retriever
  /** Metric candidates to keep (Ask spec §3.2: 5 for the compact profile, 10 on a retry). */
  k?: number
}

const DEFAULT_RETRIEVER = lexicalRetriever()

const named = (p: Person, mention: string): NamedPlayer => ({
  id: p.id,
  name: p.name,
  position: p.position,
  team: p.team,
  mention
})

const team = (code: string, mention: string): NamedTeam => ({
  code,
  name: TEAM_NAMES[code] ?? code,
  mention
})

const DECLINE: Partial<Record<QuestionType, string>> = {
  advice:
    'This is a fantasy decision (start, sit, trade, add or drop). Ask does not give advice yet; it can show the stats behind the choice.',
  out_of_range: 'The data starts in 2019 and ends with the current season.'
}

export function resolve(question: string, deps: ResolveDeps): ContextBlock {
  const positions = positionsIn(question)
  // A full name can hold a team word ("Malik Washington"): full names first, then the teams
  // outside them.
  const fullNames = deps.people
    .find(question, { positions })
    .filter((m) => m.how !== 'first' && m.how !== 'last' && m.mention.includes(' '))
    .map((m) => ` ${m.mention.toLowerCase()} `)
  const teamsFound = findTeams(question).filter(
    (t) => !fullNames.some((n) => n.includes(` ${t.mention.toLowerCase()} `))
  )
  const subjectTeams = teamsFound.filter((t) => t.role === 'subject').map((t) => t.code)
  const matches = deps.people.find(question, {
    positions,
    teams: subjectTeams,
    exclude: teamsFound.map((t) => t.mention)
  })
  const players = matches
    .filter((m) => m.people.length === 1)
    .map((m) => named(m.people[0], m.mention))
  const ambiguous = matches
    .filter((m) => m.people.length > 1)
    .map((m) => ({ mention: m.mention, options: m.people.map((p) => named(p, m.mention)) }))
  // A team word inside a matched player's name is not a team ("Chase Brown" is not the Browns).
  const mentioned = matches.map((m) => m.mention.toLowerCase())
  const teams = teamsFound.filter(
    (t) => !mentioned.some((m) => m.includes(t.mention.toLowerCase()))
  )
  const time = resolveTime(question, deps.now)
  const slots = detectSlots(question)
  const playerPositions = [
    ...new Set(players.map((p) => p.position).filter((p): p is string => !!p))
  ]
  const fit = fits(question, {
    positions: positions.length > 0 ? positions : playerPositions,
    players: players.length + ambiguous.length,
    teams: teams.filter((t) => t.role === 'subject').length
  })
  const candidates = metricCandidates(
    deps.retriever ?? DEFAULT_RETRIEVER,
    question,
    fit,
    METRICS,
    deps.k ?? 5
  )
  const type = classify(question, {
    players: players.length,
    ambiguous: ambiguous.length,
    teams: teams.filter((t) => t.role === 'subject').length,
    opponents: teams.filter((t) => t.role === 'opponent').length,
    metricHint: candidates.length > 0 && candidates[0].score >= 5,
    outOfRange: time.outOfRange !== undefined,
    rostered: slots.rostered
  })
  const decline = DECLINE[type] ?? null
  return {
    question,
    now: deps.now,
    type,
    tool: decline || ambiguous.length > 0 ? null : TOOL_OF[type],
    players,
    ambiguous,
    teams: teams.filter((t) => t.role === 'subject').map((t) => team(t.code, t.mention)),
    opponents: teams.filter((t) => t.role === 'opponent').map((t) => team(t.code, t.mention)),
    positions,
    time,
    slots,
    metrics: candidates.map((c) => {
      const m = METRICS.get(c.id)!
      return { id: m.id, label: m.label, entity: m.entity, description: m.description }
    }),
    decline
  }
}

/** The context block as the model reads it. */
export function contextText(b: ContextBlock): string {
  const lines = ['Context (resolved by the app):']
  lines.push(
    `- Now: the ${b.now.season} ${b.now.seasonType === 'POST' ? 'postseason' : 'regular season'}, played through week ${b.now.week}.`
  )
  for (const p of b.players) {
    lines.push(`- Player: ${p.name} = ${p.id} (${[p.position, p.team].filter(Boolean).join(', ')})`)
  }
  for (const a of b.ambiguous) {
    const options = a.options.map(
      (p) => `${p.name} ${p.id} (${[p.position, p.team].filter(Boolean).join(', ')})`
    )
    lines.push(`- "${a.mention}" matches several players: ${options.join('; ')}`)
  }
  for (const t of b.teams) lines.push(`- Team: ${t.name} = ${t.code}`)
  for (const t of b.opponents) lines.push(`- Opponent: ${t.name} = ${t.code}`)
  for (const s of b.time.said) lines.push(`- Time: ${s}`)
  if (b.positions.length > 0) lines.push(`- Positions named: ${b.positions.join(', ')}`)
  if (b.slots.flags.length > 0) lines.push(`- Situations named: ${b.slots.flags.join(', ')}`)
  if (b.slots.groupings.length > 0) lines.push(`- Split by: ${b.slots.groupings.join(', ')}`)
  if (b.slots.rostered) {
    lines.push(`- Rostered: ${b.slots.rostered === 'free' ? 'free agents only' : 'my team only'}`)
  }
  if (b.metrics.length > 0) {
    lines.push('- Metric candidates:')
    for (const m of b.metrics) {
      lines.push(`  - ${m.id}: ${m.label} (${m.entity}) — ${m.description.slice(0, 110)}`)
    }
  }
  return lines.join('\n')
}
