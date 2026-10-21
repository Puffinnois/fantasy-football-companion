import { useState } from 'react'
import { MineDot, PosText } from '@/components/stats/controls'
import type { Heat } from '@/lib/stats/format'
import { headshotUrl } from '@/lib/stats/player'
import { cn } from '@/lib/utils'

/** The dashboards' small pieces (handoff "Stats"): loading lines, section heads, mono tables. */

export function Loading({ error }: { error?: string | null }): React.JSX.Element {
  return error ? (
    <div className="py-12 text-center text-[13px] text-bad">{error}</div>
  ) : (
    <div className="py-12 text-center text-[13px] text-fg-3">Loading…</div>
  )
}

export function SectionHead({ title, note }: { title: string; note?: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">{title}</h2>
      {note && <span className="text-[12px] leading-none text-fg-3">{note}</span>}
    </div>
  )
}

/** A cell's background by its percentile step (the Ledger's seven). */
const HEAT_BG: Record<Heat, string> = {
  h3: 'bg-h3',
  h2: 'bg-h2',
  h1: 'bg-h1',
  n: '',
  l1: 'bg-l1',
  l2: 'bg-l2',
  l3: 'bg-l3'
}

/** A value shaded by its percentile, its rank beside it, the detail on hover (the splits tables). */
export function HeatCell({
  value,
  rank,
  heat,
  title
}: {
  value: string
  rank: string | null
  heat: Heat
  title: string
}): React.JSX.Element {
  return (
    <span
      title={title || undefined}
      className={cn('-my-1 block rounded-[4px] px-1.5 py-1', HEAT_BG[heat])}
    >
      {value}
      {rank && <span className="ml-1.5 text-[10.5px] text-fg-3">{rank}</span>}
    </span>
  )
}

/** A small mono table in the handoff's style: a header under a rule, 38px rows. */
export function MiniTable({
  columns,
  head,
  rows,
  left = [],
  className
}: {
  columns: string
  head: React.ReactNode[]
  rows: { key: string; cells: React.ReactNode[] }[]
  /** Columns read left to right (text); the first always is, numbers align right. */
  left?: number[]
  className?: string
}): React.JSX.Element {
  const align = (i: number): string => (i === 0 || left.includes(i) ? 'text-left' : 'text-right')
  return (
    <div
      className={cn('flex flex-col font-mono text-[12.5px] tabular-nums', className)}
      role="table"
    >
      <div
        role="row"
        className="grid h-7 items-end gap-x-3 border-b border-fg-3 pb-[7px] text-[11px] text-fg-3"
        style={{ gridTemplateColumns: columns }}
      >
        {head.map((h, i) => (
          <span key={i} role="columnheader" className={cn(align(i), i === 0 && 'font-sans')}>
            {h}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r.key}
          role="row"
          className="grid h-[38px] items-center gap-x-3 border-b border-line-2"
          style={{ gridTemplateColumns: columns }}
        >
          {r.cells.map((c, i) => (
            <span key={i} role="cell" className={cn('min-w-0', align(i))}>
              {c}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/** A player's name in a table: position, name, my-player dot; a button when it opens his dashboard. */
export function PlayerName({
  name,
  position,
  mine,
  onOpen
}: {
  name: string
  position: string | null
  mine: boolean
  onOpen?: () => void
}): React.JSX.Element {
  const label = (
    <>
      {position && (
        <span className="w-[22px] shrink-0">
          <PosText position={position} />
        </span>
      )}
      <span className="truncate">{name}</span>
      {mine && <MineDot />}
    </>
  )
  const style =
    'flex min-w-0 items-center gap-[7px] font-sans text-[13px] font-medium whitespace-nowrap'
  return onOpen ? (
    <button
      type="button"
      title={`Open ${name}’s dashboard`}
      onClick={onOpen}
      className={cn(style, 'cursor-pointer text-left hover:text-cobalt')}
    >
      {label}
    </button>
  ) : (
    <span className={style}>{label}</span>
  )
}

export function NavButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex size-[26px] cursor-pointer items-center justify-center rounded-[6px] border border-line bg-panel text-fg-2 hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  )
}

/**
 * Spec §9.4 header photo: the player's Sleeper headshot, his initials when there is none or it
 * does not load (offline).
 */
export function Headshot({
  name,
  sleeperId,
  size = 64
}: {
  name: string
  sleeperId: string | null
  size?: number
}): React.JSX.Element {
  const [failed, setFailed] = useState<string | null>(null)
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const box = 'shrink-0 overflow-hidden rounded-full bg-panel-2 shadow-[0_0_0_1px_var(--line)]'
  if (!sleeperId || failed === sleeperId) {
    return (
      <div
        role="img"
        aria-label={name}
        className={cn(box, 'flex items-center justify-center font-semibold text-fg-3')}
        style={{ width: size, height: size, fontSize: size * 0.34 }}
      >
        {initials}
      </div>
    )
  }
  return (
    <img
      src={headshotUrl(sleeperId)}
      alt={name}
      onError={() => setFailed(sleeperId)}
      className={cn(box, 'object-cover')}
      style={{ width: size, height: size }}
    />
  )
}
