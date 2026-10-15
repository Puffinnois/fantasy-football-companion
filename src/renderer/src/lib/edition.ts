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
