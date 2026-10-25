import { useMemo } from 'react'
import { ArrowUpDown, Search } from 'lucide-react'
import { CheckToggle, MineDot, Segmented, StatsSelect } from '@/components/stats/controls'
import { Loading, PctChip } from '@/components/stats/parts'
import { Scatter, type DotCard } from '@/components/stats/Scatter'
import { Swatch } from '@/components/stats/WeekChart'
import {
  axisLabel,
  chartAxes,
  chartExtras,
  chartQuery,
  chartRows,
  chartSubtitle,
  chartTitle,
  chartValue,
  chartView,
  corners,
  fewNote,
  MAX_PICKS,
  presetsFor,
  resetChart,
  scaled,
  scales,
  shortName,
  type ChartDot,
  type ChartState
} from '@/lib/stats/chart'
import { familyLabel, heatColor } from '@/lib/stats/format'
import { positionTab, RAIL_POSITIONS } from '@/lib/stats/player'
import { lastWeek, rangeLabel, weeksOf, type StatsScope } from '@/lib/stats/scope'
import { trendMetrics } from '@/lib/stats/trends'
import { useStatsQuery, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { STATS_TEAMS, TEAM_NAMES, teamAbbr } from '@shared/stats/nflTeams'
import type { MetricInfo, PositionGroup } from '@shared/stats/types'

const FRESH = { keepLast: false }
const LABEL = 'font-mono text-[11px] tracking-[0.04em] text-fg-3 uppercase'

/**
 * The chart explorer (spec §9.5, handoff "15. Chart explorer"): any metric against any other for
 * the players at a position or the 32 teams, with presets, size and colour by a third metric,
 * filters, a scatter and its table. A dot opens its dashboard; shift-click picks up to three for
 * Compare.
 */
export function StatsChart({
  data,
  scope,
  onScope,
  state,
  onState,
  onOpenPlayer,
  onOpenTeam,
  onCompare
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  state: ChartState
  /** Updates from the state as it is then. */
  onState: (update: (state: ChartState) => ChartState) => void
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
  onOpenTeam: (team: string) => void
  /** Opens Compare on the picks. */
  onCompare: (state: ChartState) => void
}): React.JSX.Element {
  const { entity, position } = state
  const isPlayer = entity === 'player'
  // Team rows are rates and season totals: never per game.
  const perGame = isPlayer && state.perGame
  const axes = chartAxes(state)
  const extras = chartExtras(state, axes)
  const info = (id: string): MetricInfo | undefined => data.byId.get(id)
  const X = info(axes.x)
  const Y = info(axes.y)
  const q = useMemo(
    () => chartQuery(entity, position, [axes.x, axes.y, ...extras], scope, data.status, perGame),
    // The metrics' text keys the query: a new array each render runs nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, position, axes.x, axes.y, extras.join(), scope, data.status, perGame]
  )
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  const view = useMemo(
    () => (result ? chartView(result, state, data.byId, data.ownership, scope.season) : null),
    [result, state, data.byId, data.ownership, scope.season]
  )
  const groups = useMemo(
    () => trendMetrics(entity, position, data.catalogue),
    [entity, position, data.catalogue]
  )

  const set = (next: Partial<ChartState>): void => onState((s) => ({ ...s, ...next }))
  const reset = (next: Partial<ChartState>): void => onState((s) => resetChart(s, next))
  const presets = presetsFor(entity, position)
  const who = isPlayer ? `${position}s` : 'teams'
  const range = rangeLabel(scope, data.status)
  const fmt = (id: string) => (v: number | null) => chartValue(info(id), v, perGame)
  const open = (d: ChartDot): void => (isPlayer ? onOpenPlayer(d.id, position) : onOpenTeam(d.id))
  const pick = (d: ChartDot): void =>
    onState((s) => {
      const at = s.picks.indexOf(d.id)
      if (at >= 0) return { ...s, picks: s.picks.filter((id) => id !== d.id) }
      return s.picks.length < MAX_PICKS ? { ...s, picks: [...s.picks, d.id] } : s
    })

  const tab = positionTab(position)
  const qualifier = tab.qualifier ? info(tab.qualifier)?.sampleLabel : null
  const footnote = !isPlayer
    ? 'Every team qualifies.'
    : `Qualified: enough ${qualifier ?? 'snaps'} for the weeks in range, and each axis’s own sample.`

  const metricOptions = (only?: (m: MetricInfo) => boolean): React.JSX.Element[] =>
    groups.map((g) => (
      <optgroup key={g.family} label={familyLabel(g.family)}>
        {g.metrics
          .filter((m) => !only || only(m))
          .map((m) => (
            <option key={m.id} value={m.id}>
              {axisLabel(m, m.id)}
            </option>
          ))}
      </optgroup>
    ))
  const select = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    children: React.ReactNode
  ): React.JSX.Element => (
    <select
      aria-label={label}
      title={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full min-w-0 cursor-pointer rounded-[6px] border border-line bg-panel px-1.5 text-[12.5px] text-fg"
    >
      {children}
    </select>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3.5">
        <Segmented
          label="Players or teams"
          value={entity}
          options={[
            { value: 'player', label: 'Players' },
            { value: 'team', label: 'Teams' }
          ]}
          onChange={(e) => reset({ entity: e })}
        />
        {isPlayer && (
          <Segmented
            label="Position"
            value={position}
            options={RAIL_POSITIONS.map((p) => ({ value: p, label: p }))}
            onChange={(p) => reset({ position: p })}
          />
        )}
        {isPlayer && (
          <Segmented
            label="Totals or per game"
            value={perGame ? 'per' : 'total'}
            options={[
              { value: 'total', label: 'Totals' },
              { value: 'per', label: 'Per game' }
            ]}
            onChange={(v) => set({ perGame: v === 'per' })}
          />
        )}
      </div>
      <div className="flex min-w-0 gap-6">
        <aside className="flex w-[280px] shrink-0 flex-col gap-5 border-r border-line pr-5">
          <section className="flex flex-col gap-2">
            <span className={LABEL}>Presets</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const on = p.x === axes.x && p.y === axes.y
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ x: p.x, y: p.y, picks: [] })}
                    className={cn(
                      'h-[26px] cursor-pointer rounded-[13px] px-3 text-[12px] font-medium',
                      on
                        ? 'bg-cobalt-soft text-cobalt shadow-[inset_0_0_0_1px_var(--cobalt)]'
                        : 'text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg'
                    )}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <span className={LABEL}>Axes</span>
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[12px] text-fg-2">
                  <span className="w-3 font-mono text-fg-3">Y</span>
                  {select('Y axis', axes.y, (y) => set({ x: axes.x, y }), metricOptions())}
                </label>
                <label className="flex items-center gap-2 text-[12px] text-fg-2">
                  <span className="w-3 font-mono text-fg-3">X</span>
                  {select('X axis', axes.x, (x) => set({ x, y: axes.y }), metricOptions())}
                </label>
              </div>
              <button
                type="button"
                title="Swap the axes"
                aria-label="Swap the axes"
                onClick={() => set({ x: axes.y, y: axes.x })}
                className="flex h-[68px] w-[30px] cursor-pointer items-center justify-center rounded-[6px] border border-line bg-panel text-fg-2 hover:bg-hover hover:text-fg"
              >
                <ArrowUpDown className="size-3.5" />
              </button>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={LABEL}>Size by</span>
              {select(
                'Size by',
                state.size ?? '',
                (v) => set({ size: v || null }),
                <>
                  <option value="">None</option>
                  {metricOptions((m) => scaled([m]).length > 0)}
                </>
              )}
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={LABEL}>Colour by</span>
              {select(
                'Colour by',
                state.colour ?? '',
                (v) => set({ colour: v || null }),
                <>
                  <option value="">None</option>
                  {metricOptions((m) => scaled([m]).length > 0)}
                </>
              )}
            </label>
            {state.colour && (
              <div className="col-span-2 flex flex-col gap-1">
                <span
                  className="h-1.5 rounded-[3px]"
                  style={{
                    background: `linear-gradient(90deg, ${heatColor(0, false)}, ${heatColor(0.5, false)}, ${heatColor(1, false)})`
                  }}
                />
                <span className="flex justify-between font-mono text-[10.5px] text-fg-3">
                  <span>0</span>
                  <span>50th</span>
                  <span>100</span>
                </span>
              </div>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <span className={LABEL}>Filter</span>
            <StatsSelect
              title="Team"
              value={state.team ?? ''}
              options={[
                { value: '', label: 'All teams' },
                ...STATS_TEAMS.map((t) => ({
                  value: t,
                  label: `${teamAbbr(t)} · ${TEAM_NAMES[t] ?? t}`
                }))
              ]}
              onChange={(t) => set({ team: t || null })}
              className="w-full"
            />
            <div className="flex flex-wrap gap-1.5">
              {isPlayer && (
                <CheckToggle
                  on={state.qualifiedOnly}
                  onChange={(qualifiedOnly) => set({ qualifiedOnly })}
                >
                  Qualified only
                </CheckToggle>
              )}
              {isPlayer && data.ownership && (
                <CheckToggle on={state.mine} onChange={(mine) => set({ mine })}>
                  <MineDot />
                  My players
                </CheckToggle>
              )}
            </div>
            <label className="flex h-7 items-center gap-1.5 rounded-[6px] border border-line bg-panel px-2 text-fg-3">
              <Search className="size-3.5 shrink-0" />
              <input
                type="search"
                aria-label={isPlayer ? 'Find a player' : 'Find a team'}
                placeholder={isPlayer ? 'Find a player' : 'Find a team'}
                value={state.search}
                onChange={(e) => set({ search: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-3"
              />
            </label>
          </section>
          <p className="m-0 text-[11.5px] leading-[1.45] text-pretty text-fg-3">
            {footnote}
            {view?.kind === 'ready' &&
              isPlayer &&
              ` ${view.qualified} ${who} qualify on both axes.`}
          </p>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="m-0 text-[22px] leading-tight font-bold tracking-[-0.02em]">
                {chartTitle(X, axes.x, Y, axes.y)}
              </h1>
              <span className="text-[12.5px] text-fg-2">
                {chartSubtitle(entity, position, scope.season, range, perGame)}
              </span>
            </div>
            <Picks
              entity={entity}
              picks={state.picks}
              names={
                new Map(
                  view?.kind === 'ready' ? view.dots.map((d) => [d.id, shortName(entity, d)]) : []
                )
              }
              onClear={() => set({ picks: [] })}
              onCompare={() => onCompare(state)}
            />
          </div>
          {error ? (
            <Loading error={error} />
          ) : !view ? (
            <Loading />
          ) : view.kind === 'missing' ? (
            <Empty title={view.text}>
              {view.text.includes('not published') && (
                <EmptyButton
                  primary
                  onClick={() => onScope({ ...scope, season: scope.season - 1, weeks: null })}
                >
                  Use {scope.season - 1}
                </EmptyButton>
              )}
            </Empty>
          ) : view.kind === 'few' ? (
            <Empty title="Too few qualifiers to chart">
              <p className="m-0 text-[12.5px] text-fg-2">{fewNote(view.qualified, who, range)}</p>
              <div className="flex gap-2">
                {isWide(scope, data) || (
                  <EmptyButton primary onClick={() => onScope({ ...scope, weeks: null })}>
                    Use weeks 1–{lastWeek(scope.season, data.status)}
                  </EmptyButton>
                )}
                {state.qualifiedOnly && view.all > view.qualified && (
                  <EmptyButton onClick={() => set({ qualifiedOnly: false })}>
                    Show all {view.all} {who}
                  </EmptyButton>
                )}
              </div>
            </Empty>
          ) : (
            <Ready
              entity={entity}
              position={position}
              state={state}
              view={view}
              axes={axes}
              extras={extras}
              info={info}
              fmt={fmt}
              who={who}
              notes={result?.notes ?? []}
              onSort={(by) =>
                set({
                  sort: { by, dir: state.sort.by === by ? (state.sort.dir === 1 ? -1 : 1) : 1 }
                })
              }
              onOpen={open}
              onPick={pick}
            />
          )}
        </section>
      </div>
    </div>
  )
}

/** The range already covers every week played. */
function isWide(scope: StatsScope, data: StatsData): boolean {
  if (scope.seasonType !== 'REG') return true
  const [a, b] = weeksOf(scope, data.status)
  return a === 1 && b === lastWeek(scope.season, data.status)
}

function Picks({
  entity,
  picks,
  names,
  onClear,
  onCompare
}: {
  entity: ChartState['entity']
  picks: string[]
  names: ReadonlyMap<string, string>
  onClear: () => void
  onCompare: () => void
}): React.JSX.Element {
  if (!picks.length) {
    return (
      <span className="text-[12px] text-fg-3">
        Click a dot to open the dashboard · Shift-click up to {MAX_PICKS} to compare
      </span>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {picks.map((id, k) => (
        <span key={id} className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
          <Swatch slot={k} />
          {names.get(id) ?? (entity === 'team' ? teamAbbr(id) : id)}
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="h-7 cursor-pointer rounded-[6px] px-2 text-[12.5px] text-fg-2 hover:bg-hover hover:text-fg"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={onCompare}
        className="h-7 cursor-pointer rounded-[6px] bg-cobalt px-3 text-[12.5px] font-semibold text-on-cobalt hover:opacity-90"
      >
        Compare these →
      </button>
    </div>
  )
}

function Empty({
  title,
  children
}: {
  title: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-line px-6 text-center">
      <span className="text-[15px] font-semibold text-fg">{title}</span>
      {children}
    </div>
  )
}

function EmptyButton({
  primary = false,
  onClick,
  children
}: {
  primary?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 cursor-pointer rounded-[6px] px-3 text-[12.5px] font-semibold',
        primary
          ? 'bg-cobalt text-on-cobalt hover:opacity-90'
          : 'border border-line bg-panel text-fg hover:bg-hover'
      )}
    >
      {children}
    </button>
  )
}

function Ready({
  entity,
  position,
  state,
  view,
  axes,
  extras,
  info,
  fmt,
  who,
  notes,
  onSort,
  onOpen,
  onPick
}: {
  entity: ChartState['entity']
  position: PositionGroup
  state: ChartState
  view: Extract<ReturnType<typeof chartView>, { kind: 'ready' }>
  axes: { x: string; y: string }
  extras: string[]
  info: (id: string) => MetricInfo | undefined
  fmt: (id: string) => (v: number | null) => string
  who: string
  notes: string[]
  onSort: (by: string) => void
  onOpen: (d: ChartDot) => void
  onPick: (d: ChartDot) => void
}): React.JSX.Element {
  const isPlayer = entity === 'player'
  const X = info(axes.x)
  const Y = info(axes.y)
  const s = scales(view.domain, { x: X?.direction === 'lower', y: Y?.direction === 'lower' })
  const metrics = [axes.x, axes.y, ...extras]
  const card = (d: ChartDot): DotCard => ({
    title: d.name,
    sub: isPlayer
      ? `${d.team ? teamAbbr(d.team) : 'FA'} · ${position}`
      : `${teamAbbr(d.id)} · ${d.games} G`,
    lines: metrics.map((m) => ({
      label: info(m)?.label ?? m,
      text: fmt(m)(d.values[m] ?? null),
      chip: <PctChip percentile={d.percentiles[m] ?? null} qualified={d.qualified} />
    })),
    sample: `${d.games} G${d.sample !== null ? ` · ${Math.round(d.sample).toLocaleString('en-US')} ${Y?.sampleLabel ?? ''}` : ''}`
  })
  const rows = chartRows(view.dots, state.sort, axes)
  const cols: { by: string; label: string }[] = [
    { by: 'x', label: X?.label ?? axes.x },
    { by: 'y', label: Y?.label ?? axes.y },
    ...extras.map((m) => ({ by: m, label: info(m)?.label ?? m }))
  ]
  const arrow = (by: string): string =>
    state.sort.by === by ? (state.sort.dir === 1 ? ' ↓' : ' ↑') : ''
  const r = view.r === null ? '—' : `${view.r >= 0 ? '+' : '−'}${Math.abs(view.r).toFixed(2)}`
  const grid = cn(
    'grid items-center gap-3',
    isPlayer
      ? 'grid-cols-[32px_minmax(160px,1.6fr)_48px_repeat(var(--n),minmax(0,1fr))]'
      : 'grid-cols-[32px_minmax(160px,1.6fr)_repeat(var(--n),minmax(0,1fr))]'
  )
  const style = { '--n': cols.length } as React.CSSProperties
  return (
    <>
      <div className="rounded-[10px] bg-panel px-2 pt-3 pb-1 shadow-[0_0_0_1px_var(--line)]">
        <Scatter
          entity={entity}
          dots={view.dots}
          scales={s}
          mean={view.mean}
          corners={corners(X, axes.x, Y, axes.y)}
          xLabel={axisLabel(X, axes.x)}
          yLabel={axisLabel(Y, axes.y)}
          format={{ x: (v) => fmt(axes.x)(v), y: (v) => fmt(axes.y)(v) }}
          size={state.size}
          colour={state.colour}
          card={card}
          onOpen={onOpen}
          onPick={onPick}
          label={`${Y?.label ?? axes.y} against ${X?.label ?? axes.x}`}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-3 font-mono text-[11.5px] text-fg-3">
        <span>
          r <span className="font-semibold text-fg">{r}</span> as plotted · n{' '}
          <span className="font-semibold text-fg">{view.dots.length}</span>{' '}
          {isPlayer && state.qualifiedOnly ? `qualified ${who}` : who} shown
        </span>
        <span>
          Dashed lines: qualified mean, {fmt(axes.x)(view.mean.x)} and {fmt(axes.y)(view.mean.y)}
        </span>
      </div>
      <div className="flex flex-col" style={style} role="table" aria-label="Chart table">
        <div
          role="row"
          className={cn(grid, 'h-[34px] border-b border-fg-3 text-[11.5px] font-medium text-fg-3')}
        >
          <span role="columnheader">#</span>
          <button
            type="button"
            role="columnheader"
            onClick={() => onSort('name')}
            className="cursor-pointer text-left hover:text-fg"
          >
            {isPlayer ? 'Player' : 'Team'}
            {arrow('name')}
          </button>
          {isPlayer && <span role="columnheader">Team</span>}
          {cols.map((c) => (
            <button
              key={c.by}
              type="button"
              role="columnheader"
              onClick={() => onSort(c.by)}
              className={cn(
                'cursor-pointer truncate text-right hover:text-fg',
                state.sort.by === c.by && 'text-fg'
              )}
            >
              {c.label}
              {arrow(c.by)}
            </button>
          ))}
        </div>
        {rows.map((d, i) => (
          <div
            key={d.id}
            role="row"
            className={cn(
              grid,
              'h-[34px] border-b border-line-2 text-[12.5px]',
              d.matched && 'bg-cobalt-soft',
              !d.qualified && 'opacity-55'
            )}
          >
            <span className="font-mono text-[11.5px] text-fg-3">{i + 1}</span>
            <button
              type="button"
              onClick={(e) => (e.shiftKey ? onPick(d) : onOpen(d))}
              className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left font-medium text-fg hover:text-cobalt"
            >
              {d.pick >= 0 && <Swatch slot={d.pick} />}
              <span className="truncate">
                {isPlayer ? d.name : `${teamAbbr(d.id)} · ${TEAM_NAMES[d.id] ?? d.id}`}
              </span>
              {d.mine && <MineDot />}
            </button>
            {isPlayer && (
              <span className="font-mono text-[11.5px] font-semibold text-fg-2">
                {d.team ? teamAbbr(d.team) : 'FA'}
              </span>
            )}
            {cols.map((c) => {
              const m = c.by === 'x' ? axes.x : c.by === 'y' ? axes.y : c.by
              return (
                <span
                  key={c.by}
                  className="flex items-center justify-end gap-2 font-mono tabular-nums"
                >
                  {fmt(m)(d.values[m] ?? null)}
                  {d.estimated.includes(m) && <span className="text-[10.5px] text-fg-3">est.</span>}
                  <PctChip percentile={d.percentiles[m] ?? null} qualified={d.qualified} />
                </span>
              )
            })}
          </div>
        ))}
      </div>
      {notes.length > 0 && (
        <div className="flex flex-col gap-1 text-[11.5px] text-fg-3">
          {notes.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      )}
    </>
  )
}
