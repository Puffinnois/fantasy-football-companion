import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { OwnerMark, PosText, StatsSelect } from '@/components/stats/controls'
import type { Heat } from '@/lib/stats/format'
import { RAIL_POSITIONS, railMetrics, type RailRow } from '@/lib/stats/player'
import { cn } from '@/lib/utils'
import { teamAbbr } from '@shared/stats/nflTeams'
import type { MetricInfo, PositionGroup } from '@shared/stats/types'

/** Rows the rail shows at first, and each "Show more" adds. */
const PAGE = 25

const CHIP: Record<Heat, string> = {
  h3: 'bg-good-s text-good font-semibold',
  h2: 'bg-good-s text-good font-semibold',
  h1: 'bg-panel-2 text-fg',
  n: 'bg-panel-2 text-fg',
  l1: 'bg-panel-2 text-fg',
  l2: 'bg-bad-s text-bad font-semibold',
  l3: 'bg-bad-s text-bad font-semibold'
}

/**
 * The handoff's profile list (332px rail): a position, a search, a rank-by metric, the qualified
 * players best first with the value in a shaded chip. ↑ / ↓ (or J / K) move the selection.
 */
export function PlayerRail({
  position,
  onPosition,
  metric,
  onMetric,
  rows,
  loading,
  error,
  range,
  byId,
  selected,
  onSelect
}: {
  position: PositionGroup
  onPosition: (position: PositionGroup) => void
  metric: string
  onMetric: (metric: string) => void
  /** Before the search: the rail filters them itself. */
  rows: (search: string) => RailRow[]
  loading: boolean
  error: string | null
  range: string
  byId: ReadonlyMap<string, MetricInfo>
  selected: string | null
  onSelect: (id: string) => void
}): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const shownRows = rows(search)
  // The selected player is listed, however far down he ranks.
  const shown = Math.max(limit, shownRows.findIndex((r) => r.id === selected) + 1)
  // Scrolled to once his row is listed (the rail may load after him).
  const listed = shownRows.some((r) => r.id === selected)
  const selectedRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (listed) selectedRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selected, listed])

  const move = (d: number): void => {
    if (!shownRows.length) return
    const i = shownRows.findIndex((r) => r.id === selected)
    const next = shownRows[Math.max(0, Math.min(shownRows.length - 1, i + d))]
    if (next) onSelect(next.id)
  }
  const onKey = (e: React.KeyboardEvent): void => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'SELECT') return
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault()
      move(-1)
    }
  }
  const info = byId.get(metric)
  return (
    <aside
      aria-label="Players"
      tabIndex={0}
      onKeyDown={onKey}
      className="flex min-h-0 w-[332px] shrink-0 flex-col border-r border-line outline-none"
    >
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-line px-3.5 pt-3.5 pb-3">
        <div
          role="radiogroup"
          aria-label="Position"
          className="flex gap-0.5 rounded-[7px] bg-panel-2 p-0.5"
        >
          {RAIL_POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === position}
              onClick={() => {
                setSearch('')
                setLimit(PAGE)
                onPosition(p)
              }}
              className={cn(
                'h-6 flex-1 cursor-pointer rounded-[5px] font-mono text-[11.5px] leading-none',
                p === position
                  ? 'bg-panel font-semibold text-fg shadow-[0_0_0_1px_var(--line)]'
                  : 'font-medium text-fg-2 hover:text-fg'
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] border border-line bg-panel px-2 text-fg-3">
            <Search className="size-[13px] shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Player"
              aria-label="Search players"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none"
            />
          </label>
          <StatsSelect
            title="Rank by"
            value={metric}
            options={railMetrics(position, byId)}
            onChange={onMetric}
            className="w-[150px]"
          />
        </div>
      </div>
      <div className="flex shrink-0 justify-between border-b border-line-2 px-3.5 py-2 font-mono text-[11px] leading-none text-fg-3">
        <span>
          {shownRows.length} PLAYERS · {range.toUpperCase()}
        </span>
        <span>{info?.short ?? ''}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
        {error && <div className="px-3.5 py-6 text-[12.5px] text-bad">{error}</div>}
        {loading && !shownRows.length && (
          <div className="py-10 text-center text-[13px] text-fg-3">Loading…</div>
        )}
        {shownRows.slice(0, shown).map((r) => {
          const on = r.id === selected
          return (
            <button
              key={r.id}
              ref={on ? selectedRef : undefined}
              type="button"
              aria-current={on ? 'true' : undefined}
              onClick={() => onSelect(r.id)}
              className={cn(
                'grid h-10 w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-line-2 pr-3.5 pl-3 text-left',
                on ? 'bg-sel' : 'hover:bg-hover'
              )}
            >
              <span className="text-right font-mono text-[11.5px] text-fg-3">{r.rank ?? 'NQ'}</span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="truncate text-[13px] leading-[1.1] font-medium">{r.name}</span>
                <span className="flex items-center gap-[5px] font-mono text-[11px] leading-none text-fg-3">
                  <PosText position={r.position} />
                  {r.team && teamAbbr(r.team)}
                  <OwnerMark owner={r.owner} />
                </span>
              </span>
              <span
                title={r.title || undefined}
                className={cn(
                  'min-w-11 rounded-[5px] px-[7px] py-1 text-right font-mono text-[12px] leading-none',
                  CHIP[r.heat]
                )}
              >
                {r.value}
              </span>
            </button>
          )
        })}
        {shownRows.length > shown && (
          <div className="px-3.5 py-3">
            <button
              type="button"
              onClick={() => setLimit(shown + PAGE)}
              className="h-7 w-full cursor-pointer rounded-[6px] border border-line bg-panel text-[12px] font-medium hover:bg-hover"
            >
              Show {Math.min(PAGE, shownRows.length - shown)} more
            </button>
          </div>
        )}
        {!loading && !error && shownRows.length === 0 && (
          <div className="px-3.5 py-10 text-center text-[12.5px] text-fg-3">
            {search ? 'No player by that name.' : 'No qualified player in this range.'}
          </div>
        )}
      </div>
    </aside>
  )
}
