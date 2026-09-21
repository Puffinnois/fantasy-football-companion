import type { ScoringFormat } from './types'

/**
 * Sleeper's scoring vocabulary (`pass_yd`, `rec`, `fgm_40_49`, `pts_allow_7_13`, …).
 * A plain string: unknown keys coming from Sleeper are kept as-is. See `statKeys.ts`
 * for the catalogue of keys this app knows about.
 */
export type StatKey = string

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'] as const
export type Position = (typeof POSITIONS)[number]

/** Positions with a dedicated lineup slot; the only ones the app scores and values. */
export const LINEUP_POSITIONS: readonly string[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/** Positions a Sleeper flex slot accepts. Slots not listed here (BN, IR, TAXI, IDP_FLEX, …) are not lineup slots. */
export const FLEX_ELIGIBILITY: Record<string, readonly string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR']
}

export function asPosition(value: string | null): Position | null {
  return (POSITIONS as readonly string[]).includes(value ?? '') ? (value as Position) : null
}

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
  /** Sleeper `playoff_round_type`: 0 one week per round, 1 two-week final, 2 two weeks per round. */
  playoffRoundType?: number
}

/** Last week the app models (NFL regular season + fantasy playoffs). */
export const LAST_NFL_WEEK = 18

/**
 * Slice 6b spec §2.1: the league's last fantasy week from its playoff settings — the end of the
 * window team strength and trade deltas are summed over. 18 without playoff settings.
 */
export function lastFantasyWeek(settings: LeagueSettings | null | undefined): number {
  if (!settings || settings.playoffStartWeek === undefined || settings.playoffStartWeek < 1) {
    return LAST_NFL_WEEK
  }
  const teams = settings.playoffTeams ?? 0
  const rounds = teams > 1 ? Math.ceil(Math.log2(teams)) : 1
  const type = settings.playoffRoundType ?? 0
  const weeks = type === 1 ? rounds + 1 : type === 2 ? rounds * 2 : rounds
  return Math.min(LAST_NFL_WEEK, settings.playoffStartWeek + weeks - 1)
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

/** Slice 5 spec §3.2: the base `rec` points decide the FantasyPros bucket — ≥ 1 PPR, between 0 and 1 HALF, else STD. */
export function scoringFormat(rules: Rules | null): ScoringFormat {
  const rec = rules?.scoring.rec ?? 0
  return rec >= 1 ? 'PPR' : rec > 0 ? 'HALF' : 'STD'
}
