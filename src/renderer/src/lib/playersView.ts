import type { OwnerFilter } from '@shared/types'

export interface WeekColumn {
  /** nflverse column name inside `WeekStats.stats`. */
  key: string
  label: string
  format?: 'pct'
}

const c = (key: string, label: string, format?: 'pct'): WeekColumn => ({ key, label, format })

const QB: WeekColumn[] = [
  c('completions', 'Cmp'),
  c('attempts', 'Att'),
  c('passing_yards', 'Pass Yd'),
  c('passing_tds', 'Pass TD'),
  c('passing_interceptions', 'Int'),
  c('carries', 'Car'),
  c('rushing_yards', 'Rush Yd'),
  c('rushing_tds', 'Rush TD')
]
const RB: WeekColumn[] = [
  c('carries', 'Car'),
  c('rushing_yards', 'Rush Yd'),
  c('rushing_tds', 'Rush TD'),
  c('targets', 'Tgt'),
  c('receptions', 'Rec'),
  c('receiving_yards', 'Rec Yd'),
  c('receiving_tds', 'Rec TD')
]
const WR: WeekColumn[] = [
  c('targets', 'Tgt'),
  c('receptions', 'Rec'),
  c('receiving_yards', 'Rec Yd'),
  c('receiving_tds', 'Rec TD'),
  c('target_share', 'Tgt %', 'pct'),
  c('receiving_air_yards', 'Air Yd'),
  c('carries', 'Car'),
  c('rushing_yards', 'Rush Yd')
]
const K: WeekColumn[] = [
  c('fg_made', 'FGM'),
  c('fg_att', 'FGA'),
  c('fg_long', 'Long'),
  c('pat_made', 'XPM'),
  c('pat_att', 'XPA')
]
const DEF: WeekColumn[] = [
  c('def_sacks', 'Sacks'),
  c('def_interceptions', 'Int'),
  c('def_fumbles_forced', 'FF'),
  c('fumble_recovery_opp', 'FR'),
  c('def_tds', 'TD'),
  c('def_safeties', 'Saf')
]
const IDP: WeekColumn[] = [
  c('def_tackles_solo', 'Solo'),
  c('def_tackle_assists', 'Ast'),
  c('def_sacks', 'Sacks'),
  c('def_interceptions', 'Int'),
  c('def_pass_defended', 'PD'),
  c('def_fumbles_forced', 'FF')
]

const BY_POSITION: Record<string, WeekColumn[]> = { QB, RB, WR, TE: WR, K, DEF }

/** Raw-stat columns for the side panel; IDP set for DL/LB/DB and unknown positions. */
export function weekColumns(position: string | null): WeekColumn[] {
  return BY_POSITION[position ?? ''] ?? IDP
}

export function formatStat(value: number | undefined, format?: 'pct'): string {
  if (value === undefined) return '—'
  if (format === 'pct') return `${Math.round(value * 100)}%`
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** The owner `<select>` value: 'all' | 'fa' | a roster id as a string. */
export function parseOwner(value: string): OwnerFilter {
  return value === 'all' || value === 'fa' ? value : Number(value)
}
