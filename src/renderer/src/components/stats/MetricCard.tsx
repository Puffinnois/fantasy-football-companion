import { HoverCard } from 'radix-ui'
import { familyLabel, reliabilityOf } from '@/lib/stats/format'
import { cn } from '@/lib/utils'
import type { MetricInfo } from '@shared/stats/types'

/** Three bars, filled by reliability (spec §8.6): the marker beside every stat. */
export function ReliabilityMarker({ info }: { info: MetricInfo }): React.JSX.Element | null {
  const r = reliabilityOf(info)
  if (!r) return null
  const filled = { high: 3, medium: 2, low: 1 }[r.level]
  return (
    <span
      role="img"
      aria-label={r.text}
      title={r.text}
      className="inline-flex shrink-0 items-end gap-px align-middle"
    >
      {[4, 6, 8].map((h, i) => (
        <span
          key={h}
          className={cn('w-[2px] rounded-[1px]', i < filled ? 'bg-fg-3' : 'bg-line')}
          style={{ height: `${h}px` }}
        />
      ))}
    </span>
  )
}

const QUALIFY_WORDS = (info: MetricInfo): string | null =>
  info.minSample ? `${info.minSample} ${info.sampleLabel} over a full season to qualify` : null

/** The catalogue entry of a metric (spec §9.2 "tooltip from the catalogue"). */
export function MetricCardBody({
  info,
  missing,
  className = 'w-[300px]'
}: {
  info: MetricInfo
  /** Why the column is empty for the season, if it is. */
  missing?: string | null
  className?: string
}): React.JSX.Element {
  const r = reliabilityOf(info)
  const where =
    info.entity === 'team'
      ? info.side === 'defense'
        ? 'Team defense'
        : info.side === 'special'
          ? 'Team special teams'
          : 'Team offense'
      : info.positions === 'all'
        ? 'Every position'
        : info.positions.join(', ')
  return (
    <div className={cn('flex flex-col gap-2 text-[12px] leading-[1.4] text-fg-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-fg">{info.label}</span>
        <span className="shrink-0 rounded-[4px] bg-cobalt-soft px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-cobalt">
          {familyLabel(info.family)}
        </span>
      </div>
      <p className="m-0 text-fg">{info.description}</p>
      {missing && <p className="m-0 text-warn">{missing}</p>}
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
        <dt className="text-fg-3">For</dt>
        <dd className="m-0">{where}</dd>
        <dt className="text-fg-3">Sample</dt>
        <dd className="m-0">{QUALIFY_WORDS(info) ?? info.sampleLabel}</dd>
        <dt className="text-fg-3">Since</dt>
        <dd className="m-0">
          {info.firstSeason}
          {info.lastSeason === 'prior' ? ', through last season' : ''}
        </dd>
        <dt className="text-fg-3">Source</dt>
        <dd className="m-0">{info.sources.join(', ')}</dd>
      </dl>
      {r && (
        <div className="flex items-center gap-2 text-[11.5px]">
          <ReliabilityMarker info={info} />
          <span>{r.text}</span>
        </div>
      )}
    </div>
  )
}

/** Hovering `children` (a column head) shows the metric's card. */
export function MetricHover({
  info,
  missing,
  children
}: {
  info: MetricInfo
  missing?: string | null
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <HoverCard.Root openDelay={350} closeDelay={80}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="bottom"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="stats z-50 rounded-[10px] bg-panel p-3 shadow-[0_0_0_1px_var(--line),0_10px_28px_rgba(0,0,0,0.18)]"
        >
          <MetricCardBody info={info} missing={missing} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}
