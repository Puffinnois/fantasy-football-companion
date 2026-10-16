import {
  canonicalIrStatuses,
  KNOWN_SLOTS,
  type LeagueSettings,
  type Position,
  type RosterSlotCount,
  type StatKey
} from '@shared/rules'
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

/** Keys that carry points but are unknown to this app (scored as 0). */
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

/** Slice 6c spec §5.4: the statuses allowed on IR, `IR` always included. */
export function irStatusesOf(settings: LeagueSettings): string[] {
  return canonicalIrStatuses(settings.irStatuses)
}

/** Adds or removes one status, in canonical order; `IR` can't be removed. */
export function toggleIrStatus(current: string[] | undefined, status: string): string[] {
  const set = new Set(canonicalIrStatuses(current))
  if (status !== 'IR') {
    if (set.has(status)) set.delete(status)
    else set.add(status)
  }
  return canonicalIrStatuses([...set])
}

// ---------- Edition Rulebook (design handoff "Rules") ----------

export const SLOT_NAME: Record<string, string> = {
  QB: 'Quarterback',
  RB: 'Running back',
  WR: 'Wide receiver',
  TE: 'Tight end',
  FLEX: 'Flex · RB / WR / TE',
  SUPER_FLEX: 'Superflex · QB / RB / WR / TE',
  REC_FLEX: 'Receiver flex · WR / TE',
  WRRB_FLEX: 'Flex · WR / RB',
  K: 'Kicker',
  DEF: 'Team defense',
  DL: 'Defensive line',
  LB: 'Linebacker',
  DB: 'Defensive back',
  IDP_FLEX: 'IDP flex',
  BN: 'Bench',
  IR: 'Injured reserve',
  TAXI: 'Taxi squad'
}

/** Slots that hold players without scoring. */
export const RESERVE_SLOTS: ReadonlySet<string> = new Set(['BN', 'IR', 'TAXI'])

export const IR_TIP: Record<string, string> = {
  IR: 'Injured reserve (always allowed)',
  PUP: 'Physically unable to perform',
  Out: 'Ruled out',
  Doubtful: 'Doubtful',
  Sus: 'Suspended',
  NA: 'Not active',
  DNR: 'Did not report',
  COV: 'COVID list'
}

export const PLAYOFF_FORMATS: { value: number; label: string }[] = [
  { value: 0, label: 'One-week rounds' },
  { value: 1, label: 'Two-week final' },
  { value: 2, label: 'Two-week rounds' }
]

/** One starter chip per starting spot, in KNOWN_SLOTS order. */
export function lineupShape(slots: RosterSlotCount[]): string[] {
  const order: readonly string[] = KNOWN_SLOTS
  return slots
    .filter((s) => !RESERVE_SLOTS.has(s.slot))
    .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot))
    .flatMap((s) => Array.from({ length: s.count }, () => s.slot))
}

/** "9 starters · Bench 6 · IR 1 · 15-man roster" (IR and taxi stay outside the roster size). */
export function rosterSummary(slots: RosterSlotCount[]): string {
  const count = (slot: string): number => slots.find((s) => s.slot === slot)?.count ?? 0
  const size = slots
    .filter((s) => s.slot !== 'IR' && s.slot !== 'TAXI')
    .reduce((a, s) => a + s.count, 0)
  return [
    `${lineupShape(slots).length} starters`,
    `Bench ${count('BN')}`,
    `IR ${count('IR')}`,
    count('TAXI') ? `Taxi ${count('TAXI')}` : null,
    `${size}-man roster`
  ]
    .filter(Boolean)
    .join(' · ')
}

export interface SeasonWeek {
  week: number
  kind: 'past' | 'now' | 'next' | 'playoff'
  /** Round name under the first week of a playoff round. */
  round: string | null
  deadline: boolean
}

/**
 * The 18-week strip of the League tab: playoff rounds = ceil(log2(playoff teams)) from the start
 * week, two weeks each for format 2 and for the final with format 1.
 */
export function seasonStrip(
  settings: LeagueSettings,
  currentWeek: number,
  last = 18
): SeasonWeek[] {
  const start = settings.playoffStartWeek ?? 15
  const teams = settings.playoffTeams ?? 0
  const type = settings.playoffRoundType ?? 0
  const rounds = teams > 1 ? Math.ceil(Math.log2(teams)) : 0
  const names = Array.from({ length: rounds }, (_, i) =>
    i === rounds - 1 ? 'Final' : i === rounds - 2 ? 'Semis' : `Round ${i + 1}`
  )
  const roundOf = new Map<number, { name: string; first: boolean }>()
  let w = start
  names.forEach((name, i) => {
    const len = type === 2 || (type === 1 && i === rounds - 1) ? 2 : 1
    for (let k = 0; k < len; k++) roundOf.set(w++, { name, first: k === 0 })
  })
  return Array.from({ length: last }, (_, i) => {
    const week = i + 1
    const po = roundOf.get(week)
    return {
      week,
      kind: po ? 'playoff' : week < currentWeek ? 'past' : week === currentWeek ? 'now' : 'next',
      round: po?.first ? po.name : null,
      deadline: settings.tradeDeadlineWeek === week
    }
  })
}

export interface CategoryTab {
  category: StatCategory
  label: string
  count: number
  overrides: number
  /** Some stat of the category differs from the saved rules. */
  changed: boolean
}

/** Scoring rail: categories with stats, their override counts and unsaved marks. */
export function categoryTabs(
  draft: {
    scoring: Record<StatKey, number>
    positionOverrides: Partial<Record<Position, Record<StatKey, number>>>
  },
  saved: {
    scoring: Record<StatKey, number>
    positionOverrides: Partial<Record<Position, Record<StatKey, number>>>
  }
): CategoryTab[] {
  return scoringGroups(draft.scoring).map((g) => {
    const keys = g.rows.map((r) => r.key)
    const overrides = keys.reduce(
      (n, k) =>
        n + OVERRIDE_POSITIONS.filter((p) => draft.positionOverrides[p]?.[k] !== undefined).length,
      0
    )
    const changed = keys.some(
      (k) =>
        draft.scoring[k] !== saved.scoring[k] ||
        OVERRIDE_POSITIONS.some(
          (p) => draft.positionOverrides[p]?.[k] !== saved.positionOverrides[p]?.[k]
        )
    )
    return {
      category: g.category,
      label: g.category === 'other' ? 'Unknown to the app' : g.label,
      count: g.rows.length,
      overrides,
      changed
    }
  })
}
