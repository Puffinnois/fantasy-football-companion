/** Non-component helpers of the Edition building blocks (components/edition.tsx). */

export type Tone = 'good' | 'bad' | 'warn' | 'neutral' | 'dashed'

const POS_BG: Record<string, string> = {
  QB: 'bg-pos-qb',
  RB: 'bg-pos-rb',
  WR: 'bg-pos-wr',
  TE: 'bg-pos-te',
  K: 'bg-pos-k',
  DEF: 'bg-pos-def',
  DST: 'bg-pos-def'
}

export function posBg(position: string | null): string | null {
  return POS_BG[(position ?? '').toUpperCase()] ?? null
}

const INJURY_SHORT: Record<string, string> = {
  Questionable: 'Q',
  Doubtful: 'D',
  Out: 'OUT',
  IR: 'IR',
  PUP: 'PUP',
  Suspended: 'SUS',
  Sus: 'SUS'
}

export function injuryShort(status: string): string {
  return INJURY_SHORT[status] ?? status.slice(0, 3).toUpperCase()
}

export type SlotKind = 'pos' | 'ink' | 'flex' | 'bn' | 'ir' | 'other'

const SLOT_KIND: Record<string, SlotKind> = {
  ALL: 'ink',
  FLEX: 'flex',
  SUPER_FLEX: 'flex',
  REC_FLEX: 'flex',
  WRRB_FLEX: 'flex',
  IDP_FLEX: 'flex',
  BN: 'bn',
  TAXI: 'bn',
  IR: 'ir'
}
const SLOT_SHORT: Record<string, string> = {
  SUPER_FLEX: 'SFLX',
  REC_FLEX: 'RFLX',
  WRRB_FLEX: 'W/R',
  IDP_FLEX: 'IDP',
  ALL: 'ALL'
}

export function slotKind(slot: string | null): SlotKind {
  const raw = (slot ?? '').toUpperCase()
  if (posBg(raw)) return 'pos'
  return SLOT_KIND[raw] ?? 'other'
}

/** Chip text: SUPER_FLEX → SFLX, REC_FLEX → RFLX, WRRB_FLEX → W/R, IDP_FLEX → IDP; '—' when empty. */
export function slotLabel(slot: string | null): string {
  const raw = (slot ?? '').toUpperCase()
  return SLOT_SHORT[raw] ?? (raw || '—')
}
