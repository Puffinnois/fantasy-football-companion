import { cn } from '@/lib/utils'

const POSITION_CLASS: Record<string, string> = {
  QB: 'bg-pos-qb/20 text-pos-qb',
  RB: 'bg-pos-rb/20 text-pos-rb',
  WR: 'bg-pos-wr/20 text-pos-wr',
  TE: 'bg-pos-te/20 text-pos-te',
  K: 'bg-pos-k/20 text-pos-k',
  DEF: 'bg-pos-def/20 text-pos-def'
}

export function PositionBadge({ position }: { position: string | null }): React.JSX.Element {
  const pos = position ?? '—'
  return (
    <span
      className={cn(
        'inline-block w-10 rounded px-1.5 py-0.5 text-center text-xs font-semibold',
        POSITION_CLASS[pos] ?? 'bg-muted text-muted-foreground'
      )}
    >
      {pos}
    </span>
  )
}
