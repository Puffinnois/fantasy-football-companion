import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { Segmented, StatsSelect } from '@/components/stats/controls'
import { Loading } from '@/components/stats/parts'
import { PercentileBar } from '@/components/stats/StatLines'
import { Swatch, WeekChart } from '@/components/stats/WeekChart'
import {
  chartMetric,
  compareGroups,
  comparePool,
  compareQuery,
  compareSeries,
  compareView,
  defaultSlots,
  playerCard,
  poolNote,
  slotOptions,
  teamCard,
  weeklyCompareQuery,
  type CompareEntity,
  type CompareRow,
  type CompareState,
  type Slots
} from '@/lib/stats/compare'
import { fmtStat } from '@/lib/stats/format'
import { RAIL_POSITIONS } from '@/lib/stats/player'
import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
import { chartWeeks } from '@/lib/stats/team'
import { useStatsQuery, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { teamAbbr } from '@shared/stats/nflTeams'
import type { PositionGroup, StatsResult } from '@shared/stats/types'

const FRESH = { keepLast: false }
const GRID = 'grid grid-cols-[200px_repeat(3,minmax(0,1fr))] gap-x-4'

/**
 * Compare (spec §9.5, handoff "7. Compare"): three slots side by side, players at one position or
 * teams, every row ranked among the position's qualified players or the 32, and a weekly chart.
 */
export function StatsCompare({
  data,
  scope,
  state,
  onState,
  onOpenPlayer,
  onOpenTeam
}: {
  data: StatsData
  scope: StatsScope
  state: CompareState
  /** Updates from the state as it is then: a late default never undoes a newer choice. */
  onState: (update: (state: CompareState) => CompareState) => void
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
  onOpenTeam: (team: string) => void
}): React.JSX.Element {
  const { entity, position } = state
  // Team rows are rates and season totals (FG over expected): never per game.
  const perGame = entity === 'player' && state.perGame
  const groups = useMemo(
    () => compareGroups(entity, position, data.byId),
    [entity, position, data.byId]
  )
  const q = useMemo(
    () => compareQuery(entity, position, groups, scope, data.status, perGame),
    [entity, position, groups, scope, data.status, perGame]
  )
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  const pool = useMemo(
    () => comparePool(entity, position, result ?? undefined),
    [entity, position, result]
  )
  const mine = useMemo(
    () =>
      new Set(
        Object.entries(data.ownership?.players ?? {})
          .filter(([, o]) => o.mine)
          .map(([id]) => id)
      ),
    [data.ownership]
  )
  const chosen = useMemo(
    () =>
      state.slots ??
      (result ? defaultSlots(entity, position, result, pool, state.seed, mine) : null),
    [state.slots, result, entity, position, pool, state.seed, mine]
  )
  // Once on screen, the default slots stay: a new range does not swap the players.
  useEffect(() => {
    if (state.slots !== null || chosen === null) return
    onState((s) =>
      s.slots === null && s.entity === entity && s.position === position && s.seed === state.seed
        ? { ...s, slots: chosen }
        : s
    )
  }, [state.slots, state.seed, chosen, entity, position, onState])

  const set = (next: Partial<CompareState>): void => onState((s) => ({ ...s, ...next }))
  const setSlot = (k: number, id: string | null): void => {
    if (!chosen) return
    const next = [...chosen] as Slots
    next[k] = id
    set({ slots: next })
  }
  const view = useMemo(
    () =>
      chosen
        ? compareView(result ?? undefined, chosen, groups, data.byId, pool, perGame, scope.season)
        : null,
    [chosen, result, groups, data.byId, pool, perGame, scope.season]
  )
  const filled = chosen?.filter((id) => id !== null).length ?? 0

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-3.5">
        <Segmented
          label="Players or teams"
          value={entity}
          options={[
            { value: 'player', label: 'Players' },
            { value: 'team', label: 'Teams' }
          ]}
          onChange={(e) => set({ entity: e, slots: null, seed: null })}
        />
        {entity === 'player' && (
          <Segmented
            label="Position"
            value={position}
            options={RAIL_POSITIONS.map((p) => ({ value: p, label: p }))}
            onChange={(p) => set({ position: p, slots: null, seed: null })}
          />
        )}
        {entity === 'player' && (
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
      {error ? (
        <Loading error={error} />
      ) : !chosen || !view || !result ? (
        <Loading />
      ) : (
        <>
          <div className={cn(GRID, 'items-stretch')}>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <h1 className="m-0 text-[28px] leading-none font-bold tracking-[-0.03em]">
                Head to head
              </h1>
              <div className="text-[12.5px] text-fg-2">
                {rangeLabel(scope, data.status)}
                {entity === 'player' && ` · ${perGame ? 'per game' : 'totals'}`}
              </div>
              <div className="text-[12px] leading-[1.4] text-pretty text-fg-3">
                {poolNote(entity, position, pool)} Best value in each row is bold.
              </div>
            </div>
            {chosen.map((id, k) => (
              <SlotCard
                key={k}
                slot={k}
                id={id}
                entity={entity}
                position={position}
                result={result}
                pool={pool}
                leads={filled > 1 ? `Leads ${view.leads[k]} of ${view.counted}` : ''}
                canRemove={filled > 1}
                options={slotOptions(entity, position, result, pool, data.ownership)}
                onPick={(v) => setSlot(k, v)}
                onRemove={() => setSlot(k, null)}
                onOpen={() =>
                  id && (entity === 'team' ? onOpenTeam(id) : onOpenPlayer(id, position))
                }
              />
            ))}
          </div>
          <div className="flex flex-col">
            {view.groups.map((g) => (
              <div key={g.label} className="flex flex-col">
                <div
                  className={cn(
                    GRID,
                    'h-[34px] items-end border-b border-fg-3 pb-[7px] font-mono text-[11px] leading-none tracking-[0.04em] text-fg-3 uppercase'
                  )}
                >
                  <span className="text-fg">{g.label}</span>
                  <span>Value · percentile · rank</span>
                </div>
                {g.rows.map((r) => (
                  <MetricRow key={r.metric} row={r} />
                ))}
              </div>
            ))}
          </div>
          <WeeklyChart
            data={data}
            scope={scope}
            state={state}
            slots={chosen}
            result={result}
            pool={pool}
            onSide={(side) => set({ side })}
          />
        </>
      )}
    </div>
  )
}

function SlotCard({
  slot,
  id,
  entity,
  position,
  result,
  pool,
  leads,
  canRemove,
  options,
  onPick,
  onRemove,
  onOpen
}: {
  slot: number
  id: string | null
  entity: CompareEntity
  position: PositionGroup
  result: StatsResult
  pool: ReadonlySet<string>
  leads: string
  canRemove: boolean
  options: { value: string; label: string }[]
  onPick: (id: string) => void
  onRemove: () => void
  onOpen: () => void
}): React.JSX.Element {
  const what = entity === 'team' ? 'team' : 'player'
  if (!id) {
    return (
      <div className="flex min-w-0 flex-col justify-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-line px-4 py-3.5">
        <div className="flex items-center gap-2 text-[13px] font-medium text-fg-2">
          <Swatch slot={slot} />
          Add a {slot === 2 ? 'third' : slot === 1 ? 'second' : 'first'} {what}…
        </div>
        <StatsSelect
          title={`Add a ${what}`}
          value=""
          options={[{ value: '', label: `Choose a ${what}` }, ...options]}
          onChange={(v) => v && onPick(v)}
          className="w-full"
        />
      </div>
    )
  }
  const picks = options.some((o) => o.value === id)
    ? options
    : [{ value: id, label: id }, ...options]
  const head = (children: React.ReactNode): React.JSX.Element => (
    <div className="flex items-center gap-2 text-[12px] leading-none text-fg-2">
      <Swatch slot={slot} />
      {children}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from comparison"
          title="Remove from comparison"
          className="ml-auto flex size-[22px] cursor-pointer items-center justify-center rounded-[5px] text-fg-3 hover:bg-hover hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
  const swap = (
    <StatsSelect
      title={`Swap ${what}`}
      value={id}
      options={picks}
      onChange={onPick}
      className="w-full bg-paper text-fg-2"
    />
  )
  if (entity === 'team') {
    const c = teamCard(result, id)
    return (
      <div className="flex min-w-0 flex-col gap-2.5 rounded-[10px] bg-panel px-4 pt-3.5 pb-3 shadow-[0_0_0_1px_var(--line)]">
        {head(
          <>
            <span className="font-mono text-[11.5px] text-fg">{c.record}</span>
            {c.place && (
              <>
                <span className="text-fg-3">·</span>
                <span className="truncate">{c.place}</span>
              </>
            )}
          </>
        )}
        <button
          type="button"
          onClick={onOpen}
          title="Open the team dashboard"
          className="flex min-w-0 cursor-pointer items-baseline gap-2.5 text-left hover:text-cobalt"
        >
          <span className="font-cond text-[34px] leading-[0.9] font-extrabold">{teamAbbr(id)}</span>
          <span className="truncate text-[14px] text-fg-2">{c.name}</span>
        </button>
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-fg-2">
            Elo <span className="font-mono font-semibold text-fg">{c.elo ?? '—'}</span>
          </span>
          <span className="font-mono text-[11px] text-fg-3">{leads}</span>
        </div>
        {swap}
      </div>
    )
  }
  const c = playerCard(result, id, pool)
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-[10px] bg-panel px-4 pt-3.5 pb-3 shadow-[0_0_0_1px_var(--line)]">
      {head(
        <>
          <span className="font-mono text-[11.5px] font-semibold text-fg">
            {c.team ? teamAbbr(c.team) : 'FA'}
          </span>
          <span className="text-fg-3">·</span>
          <span>{c.games}</span>
          {!c.qualified && (
            <span
              title={`Below the ${position} leaderboard’s qualifying sample, so no percentiles`}
              className="rounded-[4px] px-[5px] py-[3px] font-mono text-[10.5px] text-fg-3 shadow-[inset_0_0_0_1px_var(--line)]"
            >
              NQ
            </span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onOpen}
        title="Open his dashboard"
        className="flex min-w-0 cursor-pointer flex-col gap-0.5 text-left hover:text-cobalt"
      >
        <span className="truncate text-[15px] leading-[1.1] text-fg-2">{c.first}</span>
        <span className="truncate text-[26px] leading-[1.05] font-bold tracking-[-0.03em]">
          {c.last}
        </span>
      </button>
      <div className="flex justify-end font-mono text-[11px] text-fg-3">{leads}</div>
      {swap}
    </div>
  )
}

function MetricRow({ row }: { row: CompareRow }): React.JSX.Element {
  return (
    <div
      className={cn(GRID, 'h-[38px] items-center border-b border-line-2')}
      data-metric={row.metric}
    >
      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        <span className="truncate text-[12.5px] text-fg-2">{row.label}</span>
        {row.sub && <span className="font-mono text-[10.5px] text-fg-3">{row.sub}</span>}
      </div>
      {row.missing ? (
        <span className="col-span-3 text-[12px] text-fg-3">{row.missing}</span>
      ) : (
        row.cells.map((c, k) =>
          c === null ? (
            <span key={k} />
          ) : (
            <div
              key={k}
              title={c.title || undefined}
              className="grid min-w-0 grid-cols-[62px_minmax(0,1fr)_34px] items-center gap-3"
            >
              <span
                className={cn(
                  'font-mono tabular-nums',
                  c.lead ? 'text-[13.5px] font-bold text-fg' : 'text-[13px] text-fg-2'
                )}
              >
                {c.text}
              </span>
              {c.percentile !== null ? (
                <div className="px-[13px]">
                  <PercentileBar
                    percentile={c.percentile}
                    neutral={row.info?.direction === 'neutral'}
                  />
                </div>
              ) : (
                <span className="h-[2px] rounded-[1px] bg-line-2" />
              )}
              <span className="text-right font-mono text-[11px] text-fg-3">{c.rank ?? ''}</span>
            </div>
          )
        )
      )}
    </div>
  )
}

function WeeklyChart({
  data,
  scope,
  state,
  slots,
  result,
  pool,
  onSide
}: {
  data: StatsData
  scope: StatsScope
  state: CompareState
  slots: Slots
  result: StatsResult
  pool: ReadonlySet<string>
  onSide: (side: 'offense' | 'defense') => void
}): React.JSX.Element {
  const { entity, position } = state
  const metric = chartMetric(entity, position, state.side)
  const info = data.byId.get(metric)
  const q = useMemo(
    () => weeklyCompareQuery(entity, position, metric, scope, data.status),
    [entity, position, metric, scope, data.status]
  )
  const { result: weekly, error } = useStatsQuery(q, data.version, FRESH)
  const weeks = chartWeeks(weekly, scope, data.status)
  const labels = slots.map((id) => {
    if (!id) return ''
    if (entity === 'team') return teamAbbr(id)
    const name = result.rows.find((r) => r.id === id)?.name ?? id
    return name.split(' ').slice(1).join(' ') || name
  })
  const { series, median } = compareSeries(weekly, slots, labels, metric, weeks, pool)
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const flip = info?.direction === 'lower'
  const title = `${info?.label ?? metric} by week`
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">{title}</h2>
          <span className="text-[12px] text-fg-3">
            {flip ? 'Flipped so up is better · gaps are byes' : 'Gaps are byes or games missed'}
          </span>
        </div>
        {entity === 'team' && (
          <Segmented
            label="Offense or defense"
            value={state.side}
            options={[
              { value: 'offense', label: 'Offense' },
              { value: 'defense', label: 'Defense' }
            ]}
            onChange={onSide}
          />
        )}
      </div>
      {error ? (
        <Loading error={error} />
      ) : !weekly ? (
        <Loading />
      ) : (
        <WeekChart
          series={series}
          reference={{
            ...median,
            label: entity === 'team' ? 'League median' : `Median qualified ${position}`
          }}
          format={(v) => fmtStat(v, f)}
          width={1216}
          height={230}
          flip={flip}
          label={title}
        />
      )}
    </section>
  )
}
