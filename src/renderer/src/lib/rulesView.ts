import { KNOWN_SLOTS, type Position, type RosterSlotCount, type StatKey } from '@shared/rules'
import {
  STAT_CATEGORIES,
  STAT_KEY_INFO,
  STAT_KEYS,
  type StatCategory,
  type StatKeyInfo
} from '@shared/statKeys'

export const OVERRIDE_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE']
const OVERRIDABLE: ReadonlySet<StatCategory> = new Set([
  'passing',
  'rushing',
  'receiving',
  'misc',
  'bonus'
])

export function isOverridable(category: StatCategory): boolean {
  return OVERRIDABLE.has(category)
}

export interface ScoringRow {
  key: StatKey
  label: string
  category: StatCategory
  points: number
  supported: boolean
}

export interface ScoringGroup {
  category: StatCategory
  label: string
  rows: ScoringRow[]
}

export function scoringGroups(scoring: Record<StatKey, number>): ScoringGroup[] {
  const known: ScoringRow[] = STAT_KEYS.filter((k) => scoring[k.key] !== undefined).map((k) => ({
    key: k.key,
    label: k.label,
    category: k.category,
    points: scoring[k.key],
    supported: k.supported
  }))
  const unknown: ScoringRow[] = Object.keys(scoring)
    .filter((key) => !STAT_KEY_INFO.has(key))
    .sort()
    .map((key) => ({ key, label: key, category: 'other', points: scoring[key], supported: false }))
  const rows = [...known, ...unknown]
  return STAT_CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    rows: rows.filter((r) => r.category === c.id)
  })).filter((g) => g.rows.length > 0)
}

/** Keys that carry points but cannot be computed from nflverse data. */
export function unsupportedKeys(scoring: Record<StatKey, number>): StatKey[] {
  return Object.entries(scoring)
    .filter(([key, points]) => points !== 0 && !(STAT_KEY_INFO.get(key)?.supported ?? false))
    .map(([key]) => key)
    .sort()
}

export function addableKeys(scoring: Record<StatKey, number>): StatKeyInfo[] {
  return STAT_KEYS.filter((k) => scoring[k.key] === undefined)
}

export function addableSlots(slots: RosterSlotCount[]): string[] {
  const present = new Set(slots.map((s) => s.slot))
  return KNOWN_SLOTS.filter((s) => !present.has(s))
}
