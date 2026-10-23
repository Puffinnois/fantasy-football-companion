import { ArrowLeft } from 'lucide-react'
import { injuryShort, posBg, slotKind, slotLabel, type Tone } from '@/lib/edition'
import { cn } from '@/lib/utils'

export type { Tone }

/** Companion Fantasy "Edition" building blocks (design handoff 2026-10-15, README "Shared foundations"). */

/**
 * Position / slot chip (README "Position / slot chip"): positions solid, ALL ink, the FLEX family
 * ink-outlined, BN/TAXI muted, IR red-outlined, anything else a thin outline.
 */
export function PosChip({
  position,
  size = 'md',
  label,
  className
}: {
  position: string | null
  size?: 'sm' | 'md' | 'slot' | 'fill'
  label?: string
  className?: string
}): React.JSX.Element {
  const kind = slotKind(position)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[3px] font-cond leading-none font-extrabold tracking-[0.04em]',
        size === 'sm' && 'h-[22px] w-[34px] text-[13px]',
        size === 'md' && 'h-6 w-[38px] text-[14px]',
        size === 'slot' && 'h-6 w-11 text-[14px]',
        size === 'fill' && 'size-full text-[13px]',
        kind === 'pos' && cn(posBg(position), 'text-on-pos'),
        kind === 'ink' && 'bg-ink text-paper',
        kind === 'flex' && 'border-[1.5px] border-ink text-fg',
        kind === 'bn' && 'bg-panel-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]',
        kind === 'ir' && 'border-[1.5px] border-bad text-bad',
        kind === 'other' && 'border border-line text-fg-2',
        className
      )}
    >
      {label ?? slotLabel(position)}
    </span>
  )
}

/** Solid tone chip (Barlow 800); neutral is a 1px outline, dashed marks a bye. */
export function ToneChip({
  tone,
  children,
  className,
  title
}: {
  tone: Tone
  children: React.ReactNode
  className?: string
  title?: string
}): React.JSX.Element {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center justify-center rounded-[2px] font-cond leading-none font-extrabold',
        tone === 'good' && 'bg-good px-1.5 py-1 text-on-pos',
        tone === 'bad' && 'bg-bad px-1.5 py-1 text-on-pos',
        tone === 'warn' && 'bg-warn px-1.5 py-1 text-on-pos',
        tone === 'neutral' && 'px-1.5 py-[3px] text-fg shadow-[inset_0_0_0_1px_var(--line)]',
        tone === 'dashed' && 'border-[1.5px] border-dashed border-line px-1.5 py-[3px] text-fg-3',
        className
      )}
    >
      {children}
    </span>
  )
}

/** Injury tag: Questionable → warn "Q"; Doubtful / Out / IR → bad. */
export function InjuryTag({
  status,
  className
}: {
  status: string | null
  className?: string
}): React.JSX.Element | null {
  if (!status) return null
  return (
    <span
      title={status}
      className={cn(
        'shrink-0 rounded-[2px] px-1 py-0.5 font-cond text-[11px] leading-none font-extrabold tracking-[0.06em] text-on-pos',
        status === 'Questionable' ? 'bg-warn' : 'bg-bad',
        className
      )}
    >
      {injuryShort(status)}
    </span>
  )
}

export function RookieTag(): React.JSX.Element {
  return (
    <span className="shrink-0 rounded-[2px] border border-ink px-1 py-0.5 font-cond text-[10px] leading-none font-extrabold tracking-[0.1em] text-fg">
      ROOKIE
    </span>
  )
}

/** Amber "YOUR TEAM" / "YOU" chip. */
export function MeChip({
  children = 'YOUR TEAM',
  className
}: {
  children?: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'shrink-0 rounded-[2px] bg-brand px-1.5 py-[3px] font-cond text-[12px] leading-none font-extrabold tracking-[0.12em] text-on-brand',
        className
      )}
    >
      {children}
    </span>
  )
}

/** Owner cell: YOUR TEAM chip, amber "Free agent", or the owner's name. */
export function OwnerTag({
  isMine,
  ownerName,
  isFreeAgent
}: {
  isMine: boolean
  ownerName: string | null
  isFreeAgent: boolean
}): React.JSX.Element {
  if (isMine) return <MeChip />
  if (isFreeAgent)
    return (
      <span className="font-cond text-[13px] leading-none font-extrabold tracking-[0.1em] text-brand-fg uppercase">
        Free agent
      </span>
    )
  return <span className="min-w-0 truncate text-[13px] text-fg-2">{ownerName}</span>
}

/** ← at the start of both navs (N-002): the page before, across both products. Alt+← does the same. */
export function BackButton({
  enabled,
  onBack
}: {
  enabled: boolean
  onBack?: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="Back"
      title="Back (Alt+←)"
      disabled={!enabled}
      onClick={onBack}
      className="-ml-1.5 flex size-7 cursor-pointer items-center justify-center rounded-[6px] text-fg-2 hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <ArrowLeft className="size-4" />
    </button>
  )
}

/** "v0.31.0" beside the wordmark in both navs (N-008); nothing until the version is read. */
export function VersionTag({ version }: { version: string | null }): React.JSX.Element | null {
  if (version === null) return null
  return <span className="font-mono text-[11px] leading-none text-fg-3">v{version}</span>
}

/** The Companion mark: three stacked bars on an amber (Fantasy) or cobalt (Stats) square. */
export function Mark({
  product = 'fantasy',
  size = 22
}: {
  product?: 'fantasy' | 'stats'
  size?: 22 | 14
}): React.JSX.Element {
  const big = size === 22
  const bar = product === 'fantasy' ? 'bg-on-brand' : 'bg-white'
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 flex-col justify-center',
        big
          ? 'size-[22px] gap-[2.5px] rounded-[6px] px-[5px]'
          : 'size-[14px] gap-[1.5px] rounded-[4px] px-[3px]',
        product === 'fantasy' ? 'bg-brand' : 'bg-stats'
      )}
    >
      {[100, 72, 44].map((w) => (
        <span
          key={w}
          className={cn(bar, big ? 'h-[2.5px] rounded-[2px]' : 'h-[1.5px]')}
          style={{ width: `${w}%` }}
        />
      ))}
    </span>
  )
}

/** Masthead: kicker → H1 → tabs or a stepper on the left, a scoreboard block on the right. */
export function Masthead({
  kicker,
  title,
  below,
  right
}: {
  kicker: React.ReactNode
  title: string
  below?: React.ReactNode
  right?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="flex shrink-0 items-end justify-between gap-6 border-b-[3px] border-ink px-8 pt-[22px] pb-[14px]">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="ed-kicker truncate">{kicker}</div>
        <h1 className="ed-h1 m-0">{title}</h1>
        {below}
      </div>
      {right}
    </header>
  )
}

/** Mode tabs under the H1: active = fg + 3px amber underline. */
export function ModeTabs<K extends string>({
  tabs,
  value,
  onChange
}: {
  tabs: { key: K; label: string }[]
  value: K
  onChange: (key: K) => void
}): React.JSX.Element {
  return (
    <div role="tablist" className="mt-1.5 flex gap-5">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === value}
          onClick={() => onChange(t.key)}
          className={cn(
            'cursor-pointer border-b-[3px] pb-[5px] font-cond text-[18px] leading-none font-bold tracking-[0.06em] uppercase',
            t.key === value ? 'border-brand text-fg' : 'border-transparent text-fg-3 hover:text-fg'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** Scoreboard label pair ("Your spot / 4-2"), right-aligned next to a big numeral. */
export function ScoreLabel({
  top,
  bottom
}: {
  top: React.ReactNode
  bottom: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-end gap-[5px] font-cond text-[13px] leading-none font-bold tracking-[0.14em] uppercase">
      <span>{top}</span>
      <span className="text-fg-3">{bottom}</span>
    </div>
  )
}

/** Section head: Barlow 800 18px caps over a 2px ink rule, optional side note. */
export function SectionHead({
  title,
  note
}: {
  title: string
  note?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink pb-[7px]">
      <h2 className="ed-section m-0">{title}</h2>
      {note && <span className="text-[12px] leading-none text-fg-2">{note}</span>}
    </div>
  )
}

/** Screen footer: 44px, 2px ink rule, a sentence on the left and a legend on the right. */
export function EditionFooter({
  children,
  legend
}: {
  children: React.ReactNode
  legend: { swatch: React.ReactNode; label: string }[]
}): React.JSX.Element {
  return (
    <footer className="mx-8 flex h-11 shrink-0 items-center justify-between gap-4 border-t-2 border-ink text-[12.5px] leading-none text-fg-3">
      <div className="flex min-w-0 items-center gap-3.5">{children}</div>
      <div className="flex shrink-0 items-center gap-3.5 font-cond text-[12.5px] font-bold tracking-[0.1em] text-fg-2 uppercase">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            {l.swatch}
            {l.label}
          </span>
        ))}
      </div>
    </footer>
  )
}

export function Swatch({ className }: { className: string }): React.JSX.Element {
  return <span className={cn('size-2.5', className)} />
}

/** Round 28/36px chevron button of the week steppers. */
export function RoundButton({
  onClick,
  disabled,
  title,
  size = 36,
  children
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  size?: 28 | 36
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        'flex cursor-pointer items-center justify-center rounded-full border border-line text-fg hover:border-ink disabled:cursor-default disabled:opacity-35 disabled:hover:border-line',
        size === 36 ? 'size-9' : 'size-7'
      )}
    >
      {children}
    </button>
  )
}
