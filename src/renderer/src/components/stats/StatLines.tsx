import { MetricHover, ReliabilityMarker } from '@/components/stats/MetricCard'
import type { SectionView, StatLine } from '@/lib/stats/team'
import { cn } from '@/lib/utils'

/**
 * The handoff's heat scale (Stats Profile): green above the median, red below, stronger toward the
 * ends; a metric with no better side stays grey.
 */
function heatColor(p: number, neutral: boolean): string {
  if (neutral) return 'var(--fg-3)'
  const t = Math.min(1, Math.abs(p - 0.5) / 0.5)
  return p >= 0.5
    ? `oklch(${(0.66 - 0.06 * t).toFixed(3)} ${(0.02 + 0.13 * t).toFixed(3)} 150)`
    : `oklch(${(0.66 - 0.04 * t).toFixed(3)} ${(0.02 + 0.17 * t).toFixed(3)} 25)`
}

/** Handoff "Percentile rankings": a track, a fill to the percentile, the number in a pill. */
export function PercentileBar({
  percentile,
  neutral = false
}: {
  /** 0–100. */
  percentile: number
  neutral?: boolean
}): React.JSX.Element {
  const n = Math.round(percentile)
  const color = heatColor(n / 100, neutral)
  const strong = !neutral && Math.abs(n - 50) > 18
  return (
    <div className="relative h-[22px]" role="img" aria-label={`${n}th percentile`}>
      <div className="absolute inset-x-0 top-[10px] h-[2px] rounded-[1px] bg-line" />
      <div
        className="absolute left-0 top-[9px] h-1 rounded-[2px]"
        style={{ width: `${n}%`, background: color }}
      />
      <div
        className="absolute top-0 h-[22px] w-[26px] rounded-[11px] text-center font-mono text-[11px] leading-[22px] font-semibold shadow-[0_0_0_2px_var(--panel)]"
        style={{
          left: `calc(${n}% - 13px)`,
          // A neutral pill is quiet: panel fill, ink text (white on grey would be too faint).
          background: neutral ? 'var(--panel-2)' : color,
          boxShadow: neutral ? '0 0 0 1px var(--line), 0 0 0 3px var(--panel)' : undefined,
          color: strong ? '#fff' : 'var(--fg)'
        }}
      >
        {n}
      </div>
    </div>
  )
}

function Line({ line }: { line: StatLine }): React.JSX.Element {
  const label = (
    <span
      tabIndex={0}
      className={cn(
        'flex min-w-0 cursor-default items-center gap-1.5 text-[12.5px] text-fg-2 outline-none',
        line.missing && 'text-fg-3'
      )}
    >
      <span className="truncate">{line.label}</span>
      {line.info && <ReliabilityMarker info={line.info} />}
    </span>
  )
  const neutral = line.info?.direction === 'neutral'
  return (
    <div
      className="grid h-[34px] grid-cols-[minmax(150px,1fr)_76px_minmax(110px,150px)_88px] items-center gap-3.5 border-t border-line-2"
      data-metric={line.key}
    >
      {line.info ? (
        <MetricHover info={line.info} missing={line.missing}>
          {label}
        </MetricHover>
      ) : (
        label
      )}
      <span
        title={line.title || undefined}
        className={cn(
          'text-right font-mono text-[12.5px] font-medium tabular-nums',
          line.value === '—' && 'text-fg-3'
        )}
      >
        {line.value}
      </span>
      {line.percentile !== null ? (
        <>
          <div className="px-[13px]">
            <PercentileBar percentile={line.percentile} neutral={neutral} />
          </div>
          <span className="flex flex-col items-end gap-1 text-right leading-none whitespace-nowrap">
            <span className="text-[11.5px] text-fg-2">{line.rank ?? ''}</span>
            {line.league !== null && (
              <span className="font-mono text-[10.5px] text-fg-3">Lg {line.league}</span>
            )}
          </span>
        </>
      ) : (
        <span className="col-span-2 px-[13px] text-[11.5px] text-fg-3">
          {line.missing ?? (line.value !== '—' ? 'Below the qualifying sample' : '')}
        </span>
      )}
    </div>
  )
}

/** A titled list of stat lines (spec §9.3): value, percentile among the teams, rank, league mean. */
export function StatSection({ section }: { section: SectionView }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">
        {section.title}
      </h2>
      <div className="flex flex-col border-b border-line-2">
        {section.lines.map((l) => (
          <Line key={l.key} line={l} />
        ))}
      </div>
    </section>
  )
}

/** Sections in two columns. */
export function StatSections({ sections }: { sections: SectionView[] }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(520px,1fr))] items-start gap-x-10 gap-y-7">
      {sections.map((s) => (
        <StatSection key={s.title} section={s} />
      ))}
    </div>
  )
}
