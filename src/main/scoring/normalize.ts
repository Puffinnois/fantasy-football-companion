import {
  POSITIONS,
  roundPoints,
  type LeagueSettings,
  type Position,
  type Rules,
  type StatKey
} from '@shared/rules'

const OPTIONAL_SETTINGS = [
  'faabBudget',
  'tradeDeadlineWeek',
  'playoffStartWeek',
  'playoffTeams',
  'playoffRoundType'
] as const

function cleanPoints(obj: unknown, where: string): Record<StatKey, number> {
  if (!obj || typeof obj !== 'object') throw new Error(`${where}: expected an object`)
  const out: Record<StatKey, number> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${where}.${key}: points must be a number`)
    }
    out[key] = roundPoints(value)
  }
  return out
}

function wholeNumber(value: unknown, where: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new Error(`${where} must be a whole number >= ${min}`)
  }
  return value
}

/** Validates rules coming from the renderer and stamps them as a custom edit. Throws on invalid input. */
export function normalizeRules(input: Rules, updatedAt: string): Rules {
  const scoring = cleanPoints(input.scoring, 'scoring')

  const positionOverrides: Rules['positionOverrides'] = {}
  for (const [position, overrides] of Object.entries(input.positionOverrides ?? {})) {
    if (!(POSITIONS as readonly string[]).includes(position)) {
      throw new Error(`Unknown position "${position}"`)
    }
    const cleaned = cleanPoints(overrides, `overrides.${position}`)
    if (Object.keys(cleaned).length > 0) positionOverrides[position as Position] = cleaned
  }

  if (!Array.isArray(input.rosterSlots)) throw new Error('rosterSlots: expected a list')
  const seen = new Set<string>()
  const rosterSlots = input.rosterSlots.map(({ slot, count }) => {
    const name = typeof slot === 'string' ? slot.trim().toUpperCase() : ''
    if (!name) throw new Error('Roster slot name is required')
    if (seen.has(name)) throw new Error(`Duplicate roster slot ${name}`)
    seen.add(name)
    return { slot: name, count: wholeNumber(count, `Slot ${name} count`, 0) }
  })

  const s: Partial<LeagueSettings> = input.settings ?? {}
  if (s.waiverType !== 'faab' && s.waiverType !== 'priority') {
    throw new Error('Waiver type must be faab or priority')
  }
  const settings: LeagueSettings = {
    numTeams: wholeNumber(s.numTeams, 'Number of teams', 2),
    waiverType: s.waiverType
  }
  for (const key of OPTIONAL_SETTINGS) {
    const value = s[key]
    if (value === undefined) continue
    settings[key] = wholeNumber(value, key, 0)
  }

  return { source: 'custom', updatedAt, scoring, positionOverrides, rosterSlots, settings }
}
