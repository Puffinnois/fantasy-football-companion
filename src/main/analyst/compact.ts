import type { ToolName } from '@shared/ask'
import { POSITION_GROUPS } from '@shared/stats/types'
import type { CompactTool } from './classify'
import type { ContextBlock } from './resolve'
import type { Schema } from './schema'
import type { Flag } from './slots'

/**
 * The compact profile (Ask spec §3.2, report P2/P3): for a small local model, the app picks the tool
 * and builds a schema with only the slots still open, then maps the model's answer back to the full
 * tool's arguments. The rules, each measured on this laptop:
 *
 *   1. The classifier picks the tool; the model fills `{thought, args}` for it.
 *   2. No slot the resolver fills (seasons, weeks, player, team, ids, opponent, rostered, limit).
 *   3. A slot appears only when the resolver detected words for it, with only those options;
 *      situation flags are one `filters` list.
 *   4. Every optional enum starts with a neutral value (`any`, `none`).
 *   5. Metric enums are the top candidates plus `other` (the loop re-resolves with more); a line's
 *      metrics also offer `default`, the position's usual line.
 *   6. Every array has `maxItems`; `thought` has `maxLength`.
 *   7. Bounded numbers are enums (there are none left to fill here).
 */
export const THOUGHT_MAX = 300

export interface CompactCall {
  tool: CompactTool
  /** What the model fills: `{ thought, args }`, `thought` first. */
  schema: Schema
  /** The tool's one-line description and the argument names, for the prompt. */
  description: string
}

/** The model's answer mapped back: a full tool call, or a request to re-resolve with more metrics. */
export type CompactAnswer =
  { kind: 'call'; name: ToolName; args: Record<string, unknown> } | { kind: 'other' }

const DESCRIPTIONS: Record<CompactTool, string> = {
  leaderboard: 'Rank players or teams by one metric.',
  player_stats: 'One player’s line, game log or splits.',
  team_stats: 'One team’s line, by week or split.',
  compare: 'Two to four players or teams side by side.',
  outlook: 'A player’s forecast signals: ceiling, floor, boom and bust, regression.',
  games: 'Schedule and results with Elo and the betting market.',
  league: 'The imported league: my roster, a team’s roster, who rosters a player, the scoring.',
  describe: 'What a metric means, its sample and stability.'
}

/** A flag as the full tools' arguments say it. */
const FLAG_ARGS: Record<Flag, Record<string, unknown>> = {
  red_zone: { red_zone: true },
  inside_10: { inside_10: true },
  goal_line: { goal_line: true },
  third_down: { third_down: true },
  fourth_down: { down: [4] },
  early_downs: { down: [1, 2] },
  pressure: { pressure: true },
  blitz: { blitz: true },
  play_action: { play_action: true },
  man_coverage: { coverage: 'man' },
  zone_coverage: { coverage: 'zone' },
  neutral: { neutral: true },
  two_minute: { two_minute: true },
  home: { home: true },
  road: { home: false }
}

const metricEnum = (b: ContextBlock): Schema => ({ enum: [...b.metrics.map((m) => m.id), 'other'] })
/** A line's metrics: `default` (the position's usual line) first, then the candidates. */
const metricList = (b: ContextBlock): Schema => ({
  type: 'array',
  items: { enum: ['default', ...b.metrics.map((m) => m.id), 'other'] },
  minItems: 1,
  maxItems: 3
})

/** The compact schema for the question, or null when no model call is needed (declined, ask back). */
export function compactCall(b: ContextBlock): CompactCall | null {
  if (!b.tool) return null
  const args: Record<string, Schema> = {}
  const positions = b.positions.filter((p) => (POSITION_GROUPS as readonly string[]).includes(p))
  const filters = b.slots.flags
  const by = b.slots.groupings
  switch (b.tool) {
    case 'leaderboard':
      args.metric = metricEnum(b)
      if (positions.length > 0) args.position = { enum: ['any', ...positions] }
      break
    case 'player_stats':
    case 'team_stats':
      args.metrics = metricList(b)
      if (by.length > 0) args.by = { enum: ['none', ...by] }
      break
    case 'compare':
      args.metrics = metricList(b)
      break
    case 'describe':
      args.metric = metricEnum(b)
      break
    case 'league':
      args.what = {
        enum:
          b.players.length > 0
            ? ['owner_of', 'my_roster', 'scoring']
            : ['my_roster', 'roster', 'scoring']
      }
      break
    case 'outlook':
    case 'games':
      break
  }
  if (
    filters.length > 0 &&
    (b.tool === 'leaderboard' || b.tool === 'player_stats' || b.tool === 'team_stats')
  ) {
    args.filters = { type: 'array', items: { enum: filters }, maxItems: filters.length }
  }
  return {
    tool: b.tool,
    description: DESCRIPTIONS[b.tool],
    schema: {
      type: 'object',
      properties: {
        thought: { type: 'string', maxLength: THOUGHT_MAX },
        args: {
          type: 'object',
          properties: args,
          required: Object.keys(args),
          additionalProperties: false
        }
      },
      required: ['thought', 'args'],
      additionalProperties: false
    }
  }
}

/** Leaves out the arguments nobody filled. */
const filled = (args: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined))

/** The model's `args` and the resolver's slots, as the full tool's arguments. */
export function compactAnswer(
  b: ContextBlock,
  call: CompactCall,
  given: Record<string, unknown>
): CompactAnswer {
  const a = { ...given }
  const metrics = ([] as unknown[]).concat(a.metric ?? [], a.metrics ?? [])
  if (metrics.includes('other')) return { kind: 'other' }
  // `default` alone leaves the line to the tool; beside named metrics it is dropped.
  if (Array.isArray(a.metrics)) {
    const named = (a.metrics as string[]).filter((m) => m !== 'default')
    if (named.length > 0) a.metrics = named
    else delete a.metrics
  }
  const out: Record<string, unknown> = {}
  const t = b.time
  const time = {
    ...(t.seasons ? { seasons: t.seasons } : {}),
    ...(t.weeks ? { weeks: t.weeks } : {}),
    ...(t.lastNGames ? { last_games: t.lastNGames } : {}),
    ...(t.seasonType ? { season_type: t.seasonType } : {})
  }
  const flags = ((a.filters as Flag[] | undefined) ?? []).reduce<Record<string, unknown>>(
    (acc, f) => ({ ...acc, ...FLAG_ARGS[f] }),
    {}
  )
  const opponent = b.opponents[0] ? { opponent: b.opponents[0].code } : {}
  switch (call.tool) {
    case 'leaderboard':
      Object.assign(out, { metric: a.metric }, time, flags, opponent)
      if (a.position && a.position !== 'any') out.position = a.position
      if (b.teams[0]) out.team = b.teams[0].code
      if (b.slots.rostered) out.rostered = b.slots.rostered
      if (b.slots.limit) out.limit = b.slots.limit
      if (b.slots.ascending) out.order = 'worst'
      return { kind: 'call', name: 'leaderboard', args: filled(out) }
    case 'player_stats':
      Object.assign(out, { player: b.players[0].id, metrics: a.metrics }, time, flags, opponent)
      if (a.by && a.by !== 'none') out.by = a.by
      return { kind: 'call', name: 'player_stats', args: filled(out) }
    case 'team_stats':
      Object.assign(out, { team: b.teams[0].code, metrics: a.metrics }, time, flags, opponent)
      if (a.by && a.by !== 'none') out.by = a.by
      return { kind: 'call', name: 'team_stats', args: filled(out) }
    case 'compare': {
      const ids = b.players.length >= 2 ? b.players.map((p) => p.id) : b.teams.map((x) => x.code)
      return {
        kind: 'call',
        name: 'compare',
        args: filled({ ids: ids.slice(0, 4), metrics: a.metrics, ...time })
      }
    }
    case 'outlook':
      return {
        kind: 'call',
        name: 'outlook',
        args: {
          player: b.players[0].id,
          ...(t.seasons?.length === 1 ? { season: t.seasons[0] } : {})
        }
      }
    case 'games': {
      const week = t.weeks && t.weeks[0] === t.weeks[1] ? { week: t.weeks[0] } : {}
      const season = t.seasons?.length === 1 ? { season: t.seasons[0] } : {}
      const team = b.teams[0] ?? b.opponents[0]
      return {
        kind: 'call',
        name: 'games',
        args: { ...season, ...week, ...(team ? { team: team.code } : {}) }
      }
    }
    case 'league':
      return {
        kind: 'call',
        name: 'league',
        args: { what: a.what, ...(b.players[0] ? { player: b.players[0].id } : {}) }
      }
    case 'describe':
      return { kind: 'call', name: 'describe', args: { metric: a.metric } }
  }
}
