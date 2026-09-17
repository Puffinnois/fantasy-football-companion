/**
 * Sleeper's scoring vocabulary (`pass_yd`, `rec`, `fgm_40_49`, `pts_allow_7_13`, …).
 * A plain string: unknown keys coming from Sleeper are kept as-is. See `statKeys.ts`
 * for the catalogue of keys this app knows about.
 */
export type StatKey = string

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'] as const
export type Position = (typeof POSITIONS)[number]

/** Roster slot names as Sleeper spells them in `roster_positions`. Custom names are allowed. */
export const KNOWN_SLOTS = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'SUPER_FLEX',
  'REC_FLEX',
  'WRRB_FLEX',
  'K',
  'DEF',
  'DL',
  'LB',
  'DB',
  'IDP_FLEX',
  'BN',
  'IR',
  'TAXI'
] as const
export type Slot = string

export interface RosterSlotCount {
  slot: Slot
  count: number
}

export type WaiverType = 'faab' | 'priority'

export interface LeagueSettings {
  numTeams: number
  waiverType: WaiverType
  faabBudget?: number
  tradeDeadlineWeek?: number
  playoffStartWeek?: number
  playoffTeams?: number
}

export type RulesSource = 'sleeper' | 'custom'

export interface Rules {
  source: RulesSource
  updatedAt: string
  /** Points per unit of each stat, e.g. `{ rec: 1, rec_yd: 0.1, rush_td: 6, fum_lost: -2 }`. */
  scoring: Record<StatKey, number>
  /** Per-position replacements for entries in `scoring`, e.g. TE premium `{ TE: { rec: 1.5 } }`. */
  positionOverrides: Partial<Record<Position, Record<StatKey, number>>>
  /** Ordered as Sleeper lists them; `count` is the number of slots of that kind. */
  rosterSlots: RosterSlotCount[]
  settings: LeagueSettings
}

/** Sleeper values carry float noise (0.03999999910593033); 4 decimals keep 0.025-style settings intact. */
export function roundPoints(value: number): number {
  return Math.round(value * 10000) / 10000
}
