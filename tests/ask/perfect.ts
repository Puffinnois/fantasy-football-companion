import type { CompactCall } from '@main/analyst/compact'

/**
 * A perfect model for the gates: the compact arguments that give a question's reference call, so the
 * resolver, the compact schema and the mapping back are measured without any model.
 */
/** A reference's situation arguments as the compact `filters` a perfect model would pick. */
export function flagsOf(args: Record<string, unknown>): string[] {
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

export function slotsOf(args: Record<string, unknown>, season: number): Record<string, string> {
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

/** What a perfect model fills in a compact schema for this reference. */
export function perfectArgs(
  call: CompactCall,
  ref: Record<string, unknown>
): Record<string, unknown> {
  const props = (call.schema.properties!.args as { properties: Record<string, unknown> }).properties
  const model: Record<string, unknown> = {}
  if ('metric' in props) model.metric = ref.metric
  if ('metrics' in props) model.metrics = ref.metrics ?? ['default']
  if ('position' in props) model.position = ref.position ?? 'any'
  if ('by' in props) model.by = ref.by ?? 'none'
  if ('filters' in props) model.filters = flagsOf(ref)
  if ('what' in props) model.what = ref.what
  return model
}
