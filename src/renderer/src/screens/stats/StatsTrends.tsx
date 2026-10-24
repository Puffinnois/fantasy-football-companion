import { useId, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Segmented } from '@/components/stats/controls'
import { Loading } from '@/components/stats/parts'
import { SeasonChart, type SeasonSeries } from '@/components/stats/SeasonChart'
import { Swatch } from '@/components/stats/WeekChart'
import { familyLabel, fmtStat, ordinal } from '@/lib/stats/format'
import { POS_BG, RAIL_POSITIONS } from '@/lib/stats/player'
import type { StatsScope } from '@/lib/stats/scope'
import {
  careerSpan,
  gamesBySeason,
  glanceViews,
  MAX_COMPARISONS,
  playerTeamsQuery,
  seasonAge,
  teamMarks,
  teamRuns,
  teamsBySeason,
  trendBand,
  trendCore,
  trendLine,
  trendMetrics,
  trendNotes,
  trendQuery,
  trendRows,
  trendSeasons,
  type GlanceView,
  type TrendEntity,
  type TrendsState
} from '@/lib/stats/trends'
import { usePlayerBio, useStatsQuery, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { STATS_TEAMS, TEAM_NAMES, teamAbbr } from '@shared/stats/nflTeams'
import type { PositionGroup, StatsResult } from '@shared/stats/types'

const FRESH = { keepLast: false }

/** Players or teams a search offers: every one with a row at the position since 2019. */
function searchOptions(
  entity: TrendEntity,
  result: StatsResult | null
): { id: string; label: string }[] {
  if (entity === 'team')
    return STATS_TEAMS.map((t) => ({ id: t, label: `${teamAbbr(t)} · ${TEAM_NAMES[t] ?? t}` }))
  const latest = new Map<string, { name: string; team: string | null; season: number }>()
  for (const r of result?.rows ?? []) {
    const season = Number(r.group.season)
    const was = latest.get(r.id)
    if (!was || season > was.season) latest.set(r.id, { name: r.name, team: r.team, season })
  }
  return [...latest]
    .map(([id, p]) => ({ id, label: `${p.name} · ${p.team ? teamAbbr(p.team) : 'FA'}` }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** A search box over a datalist: picking a name opens it. */
function Search({
  options,
  placeholder,
  onPick,
  autoFocus
}: {
  options: { id: string; label: string }[]
  placeholder: string
  onPick: (id: string) => void
  autoFocus?: boolean
}): React.JSX.Element {
  const [text, setText] = useState('')
  const list = useId()
  return (
    <>
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        list={list}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => {
          const hit = options.find((o) => o.label === e.target.value)
          if (hit) {
            onPick(hit.id)
            setText('')
          } else setText(e.target.value)
        }}
        className="h-7 w-[220px] rounded-[6px] border border-line bg-panel px-2.5 text-[12.5px] text-fg placeholder:text-fg-3"
      />
      <datalist id={list}>
        {options.map((o) => (
          <option key={o.id} value={o.label} />
        ))}
      </datalist>
    </>
  )
}

/**
 * Trends (spec §9.5): a metric by season, 2019 → now, for a player or a team and up to two more,
 * the position's qualified median and middle half each season, a table and the core metrics.
 */
export function StatsTrends({
  data,
  scope,
  state,
  onState,
  fallback
}: {
  data: StatsData
  scope: StatsScope
  state: TrendsState
  onState: (update: (state: TrendsState) => TrendsState) => void
  /** The dashboard's player or team, when no one is picked yet. */
  fallback: { id: string; position: PositionGroup | null } | null
}): React.JSX.Element {
  const { entity, perGame } = state
  const isPlayer = entity === 'player'
  const following = state.id === null && state.follow && fallback !== null
  const id = following ? fallback.id : state.id
  const position = following ? (fallback.position ?? state.position) : state.position
  // The first choice here keeps the player followed (a new metric is his), then stops following.
  const set = (next: Partial<TrendsState>): void =>
    onState((s) => ({
      ...s,
      ...(following ? { id: fallback.id, position } : {}),
      follow: false,
      ...next
    }))
  const groups = useMemo(
    () => trendMetrics(entity, position, data.catalogue),
    [entity, position, data.catalogue]
  )
  const offered = groups.flatMap((g) => g.metrics.map((m) => m.id))
  const core = useMemo(() => trendCore(entity, position, data.byId), [entity, position, data.byId])
  const metric =
    state.metric && offered.includes(state.metric) ? state.metric : (core[0] ?? offered[0])
  const info = data.byId.get(metric)
  const q = useMemo(
    () => trendQuery(entity, position, [metric, ...core], scope, data.status, perGame),
    [entity, position, metric, core, scope, data.status, perGame]
  )
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  const tq = useMemo(
    () => (isPlayer && id ? playerTeamsQuery(id, scope, data.status) : null),
    [isPlayer, id, scope, data.status]
  )
  const { result: teamRows } = useStatsQuery(tq, data.version, FRESH)
  const { bio } = usePlayerBio(isPlayer ? id : null, data.version)
  const options = useMemo(() => searchOptions(entity, result), [entity, result])
  const [adding, setAdding] = useState(false)

  const seasons = trendSeasons(data.status)
  const current = seasons[seasons.length - 1]
  const span = id ? careerSpan(result, id, seasons) : []
  const teams = teamsBySeason(teamRows)
  const ids = id ? [id, ...state.comparisons.filter((c) => c !== id).slice(0, MAX_COMPARISONS)] : []
  const nameOf = (x: string): string =>
    isPlayer
      ? ([...(result?.rows ?? [])].reverse().find((r) => r.id === x)?.name ?? bio?.name ?? x)
      : (TEAM_NAMES[x] ?? x)
  const shortOf = (x: string): string =>
    isPlayer ? nameOf(x).split(' ').slice(1).join(' ') || nameOf(x) : teamAbbr(x)
  const direction = info?.direction ?? 'neutral'
  const lines = ids.map((x) => trendLine(result, x, metric, span, entity, position, direction))
  const main = lines[0] ?? []
  const estimated = main.some((p) => p.estimated && p.season === current)
  const notes = trendNotes(info, span, current, estimated)
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const fmt = (v: number): string => fmtStat(v, f, perGame)
  const ages = new Map(
    isPlayer && bio
      ? span.flatMap((s) => {
          const a = seasonAge(bio.birthDate, s)
          return a === null ? [] : [[s, a] as const]
        })
      : []
  )
  const played = gamesBySeason(teamRows)
  // Players: his weekly rows; teams: the by-season row.
  const games = (season: number): number | null =>
    played.get(season) ??
    result?.rows.find((r) => r.id === id && Number(r.group.season) === season)?.games ??
    null
  const rows = trendRows(
    main,
    info,
    span.map((s) => ({
      season: s,
      team: isPlayer ? (teams.get(s) ?? []).map(teamAbbr).join(' → ') : '',
      games: games(s),
      age: ages.get(s) ?? null
    })),
    perGame
  )
  const glance = id
    ? glanceViews(result, id, core, span, entity, position, data.byId, current, perGame)
    : []
  const series: SeasonSeries[] = ids.map((x, k) => ({ id: x, label: shortOf(x), points: lines[k] }))
  const runs = isPlayer ? teamRuns(span, teams) : ''
  const lastTeam = isPlayer ? (teams.get(span[span.length - 1])?.at(-1) ?? bio?.team ?? null) : id

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
          onChange={(e) => set({ entity: e, id: null, comparisons: [], metric: null })}
        />
        {isPlayer && (
          <Segmented
            label="Position"
            value={position}
            options={RAIL_POSITIONS.map((p) => ({ value: p, label: p }))}
            onChange={(p) => set({ position: p, id: null, comparisons: [], metric: null })}
          />
        )}
        <Search
          options={options}
          placeholder={isPlayer ? `Find a ${position}` : 'Find a team'}
          onPick={(x) => set({ id: x, position, comparisons: [] })}
        />
        <select
          aria-label="Metric"
          title="Metric"
          value={metric}
          onChange={(e) => set({ metric: e.target.value })}
          className="h-7 max-w-[260px] cursor-pointer rounded-[6px] border border-line bg-panel px-1.5 text-[12.5px] font-medium text-fg"
        >
          {groups.map((g) => (
            <optgroup key={g.family} label={familyLabel(g.family)}>
              {g.metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {info?.kind === 'count' && (
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
      {!id ? (
        <div className="py-16 text-center text-[13px] text-fg-3">
          {isPlayer ? `Find a ${position} to see his seasons.` : 'Find a team to see its seasons.'}
        </div>
      ) : error ? (
        <Loading error={error} />
      ) : !result ? (
        <Loading />
      ) : (
        <>
          <div className="flex items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                className={cn(
                  'flex h-[22px] items-center rounded-[5px] px-[7px] font-mono text-[12px] font-bold text-on-pos',
                  (isPlayer && POS_BG[position]) || 'bg-pos-def'
                )}
              >
                {isPlayer ? position : teamAbbr(id)}
              </span>
              <div className="flex min-w-0 flex-col gap-[5px]">
                <h1 className="m-0 truncate text-[24px] leading-none font-bold tracking-[-0.03em]">
                  {nameOf(id)}
                </h1>
                <div className="flex items-center gap-[7px] text-[12.5px] leading-none whitespace-nowrap text-fg-2">
                  {lastTeam && (
                    <span className="font-mono text-[11.5px] font-semibold text-fg">
                      {teamAbbr(lastTeam)}
                    </span>
                  )}
                  {[
                    isPlayer && bio ? ageLine(bio.birthDate, span) : null,
                    !span.length
                      ? null
                      : isPlayer
                        ? `${ordinal(span.length)} season`
                        : `${span[0]}–${span[span.length - 1]}`,
                    runs || null
                  ]
                    .filter(Boolean)
                    .map((t) => (
                      <span key={t} className="flex items-center gap-[7px]">
                        <span className="text-fg-3">·</span>
                        {t}
                      </span>
                    ))}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              {ids.map((x, k) => (
                <span
                  key={x}
                  className="flex h-7 items-center gap-[7px] rounded-[14px] pr-1 pl-2.5 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--line)]"
                >
                  <Swatch slot={k} />
                  {shortOf(x)}
                  {k > 0 ? (
                    <button
                      type="button"
                      aria-label={`Remove ${shortOf(x)}`}
                      onClick={() => set({ comparisons: state.comparisons.filter((c) => c !== x) })}
                      className="flex size-5 cursor-pointer items-center justify-center rounded-full text-fg-3 hover:bg-hover hover:text-fg"
                    >
                      <X className="size-3" />
                    </button>
                  ) : (
                    <span className="w-1.5" />
                  )}
                </span>
              ))}
              {ids.length <= MAX_COMPARISONS &&
                (adding ? (
                  <Search
                    autoFocus
                    options={options.filter((o) => !ids.includes(o.id))}
                    placeholder="Add a comparison"
                    onPick={(x) => {
                      set({ comparisons: [...state.comparisons, x] })
                      setAdding(false)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex h-7 cursor-pointer items-center rounded-[14px] border-[1.5px] border-dashed border-line px-[11px] text-[12px] font-medium text-fg-2 hover:text-fg"
                  >
                    + Add a comparison
                  </button>
                ))}
            </div>
          </div>
          <div className="flex items-start gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {span.length < 2 ? (
                <div className="flex flex-col items-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-line px-6 py-16 text-center">
                  <div className="text-[15px] font-semibold">
                    {span.length === 0
                      ? `No ${info?.label.toLowerCase() ?? metric} for ${isPlayer ? 'him' : 'it'} since ${seasons[0]}.`
                      : `Trends need two seasons; ${isPlayer ? 'he has' : 'it has'} one.`}
                  </div>
                  {span.length === 1 && main[0]?.value !== null && (
                    <div className="max-w-[440px] text-[12.5px] leading-[1.5] text-fg-2">
                      {span[0]}: {fmt(main[0].value!)} {info?.label.toLowerCase()}
                      {main[0].rank !== null
                        ? `, ${ordinal(Math.round(main[0].percentile!))} percentile (${ordinal(main[0].rank)} of ${main[0].of}).`
                        : ', not qualified.'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[10px] bg-panel px-2 pt-3 pb-1 shadow-[0_0_0_1px_var(--line)]">
                  <div className="flex items-baseline justify-between gap-3 px-2">
                    <span className="text-[11.5px] font-medium text-fg-2">
                      {info?.label}
                      {direction === 'lower' ? ' ↓' : ''} · per season
                    </span>
                    {notes.length > 0 && (
                      <span className="text-[11px] font-medium text-warn">{notes.join(' ')}</span>
                    )}
                  </div>
                  <SeasonChart
                    series={series}
                    band={trendBand(result, metric, span, entity, position)}
                    format={fmt}
                    label={`${info?.label ?? metric} by season`}
                    flip={direction === 'lower'}
                    marks={isPlayer ? teamMarks(span, teams) : new Map()}
                    ages={ages}
                    hoverInfo={(season) => {
                      const p = main.find((x) => x.season === season)
                      if (!p || p.value === null) return null
                      const r = rows.find((x) => x.season === season)
                      return {
                        title: `${season}${r?.team ? ` · ${r.team}` : ''}`,
                        lines: [
                          `${fmt(p.value)}${p.estimated ? ' est.' : ''}`,
                          p.rank !== null
                            ? `${ordinal(p.rank)} of ${p.of} · ${ordinal(Math.round(p.percentile!))} percentile`
                            : 'Not qualified',
                          r?.sample ?? ''
                        ].filter(Boolean)
                      }
                    }}
                  />
                </div>
              )}
              <SeasonTable rows={rows} label={info?.label ?? metric} isPlayer={isPlayer} />
            </div>
            <aside className="flex w-[300px] shrink-0 flex-col gap-2">
              <div className="flex items-baseline justify-between px-0.5 pb-1">
                <h2 className="m-0 text-[14px] leading-none font-semibold tracking-[-0.01em]">
                  Career at a glance
                </h2>
                <span className="text-[11.5px] text-fg-3">
                  {span.length ? `${span[0]}–${span[span.length - 1]}` : ''}
                </span>
              </div>
              {glance.map((g) => (
                <GlanceCard
                  key={g.metric}
                  view={g}
                  on={g.metric === metric}
                  onPick={() => set({ metric: g.metric })}
                />
              ))}
              <p className="m-0 px-0.5 pt-1 text-[11px] leading-[1.45] text-fg-3">
                Sparklines are percentile vs {isPlayer ? `${position}s` : 'teams'} each season; the
                dotted line is the median. Click one to chart it.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

/** "age 27" now, from the bio, at the latest season in the span. */
function ageLine(birthDate: string | null, span: readonly number[]): string | null {
  const a = span.length ? seasonAge(birthDate, span[span.length - 1]) : null
  return a === null ? null : `age ${a}`
}

function SeasonTable({
  rows,
  label,
  isPlayer
}: {
  rows: ReturnType<typeof trendRows>
  label: string
  isPlayer: boolean
}): React.JSX.Element {
  const cols = isPlayer
    ? 'grid-cols-[56px_80px_40px_36px_minmax(0,1fr)_minmax(0,1fr)_48px_minmax(0,1.2fr)_minmax(0,1.2fr)]'
    : 'grid-cols-[56px_36px_minmax(0,1fr)_minmax(0,1fr)_48px_minmax(0,1.2fr)_minmax(0,1.2fr)]'
  const head = [
    'Season',
    ...(isPlayer ? ['Team', 'Age'] : []),
    'G',
    label,
    'Δ vs prior',
    'Pct',
    'Rank',
    'Sample'
  ]
  return (
    <div className="overflow-hidden rounded-[10px] bg-panel shadow-[0_0_0_1px_var(--line)]">
      <div
        className={cn(
          'grid h-8 items-center gap-2.5 border-b border-line px-3.5 font-mono text-[11px] tracking-[0.04em] text-fg-3 uppercase',
          cols
        )}
      >
        {head.map((h, i) => (
          <span key={i} className={cn('truncate', i > (isPlayer ? 1 : 0) && 'text-right')}>
            {h}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r.season}
          className={cn(
            'grid h-[34px] items-center gap-2.5 border-b border-line-2 px-3.5 last:border-b-0',
            cols,
            !r.qualified && 'opacity-55'
          )}
        >
          <span className="font-mono text-[12px] font-semibold">{r.season}</span>
          {isPlayer && <span className="truncate font-mono text-[11.5px] text-fg-2">{r.team}</span>}
          {isPlayer && (
            <span className="text-right font-mono text-[12px] text-fg-2">{r.age ?? ''}</span>
          )}
          <span className="text-right font-mono text-[12px] text-fg-2">{r.games ?? ''}</span>
          <span className="text-right font-mono text-[12.5px] font-semibold tabular-nums">
            {r.value}
          </span>
          <span
            className={cn(
              'text-right font-mono text-[12px] font-medium',
              r.deltaTone === 'good'
                ? 'text-good'
                : r.deltaTone === 'bad'
                  ? 'text-bad'
                  : 'text-fg-3'
            )}
          >
            {r.delta}
          </span>
          <span className="flex justify-end">
            <PctChip percentile={r.percentile} qualified={r.qualified} />
          </span>
          <span className="truncate text-right text-[12px] text-fg-2">{r.rank}</span>
          <span className="truncate text-right text-[12px] text-fg-3">{r.sample}</span>
        </div>
      ))}
    </div>
  )
}

/** The handoff's soft percentile chip: ≥75 good, ≤25 bad; "NQ" outlined below the qualifier. */
function PctChip({
  percentile,
  qualified
}: {
  percentile: number | null
  qualified: boolean
}): React.JSX.Element {
  if (percentile === null) {
    return (
      <span className="flex h-[18px] min-w-[30px] items-center justify-center rounded-[4px] px-1 font-mono text-[10.5px] font-semibold text-fg-3 shadow-[inset_0_0_0_1px_var(--line)]">
        {qualified ? '—' : 'NQ'}
      </span>
    )
  }
  const n = Math.round(percentile)
  return (
    <span
      className={cn(
        'flex h-[18px] min-w-[30px] items-center justify-center rounded-[4px] px-1 font-mono text-[10.5px] font-semibold',
        n >= 75 ? 'bg-good-s text-good' : n <= 25 ? 'bg-bad-s text-bad' : 'text-fg-3'
      )}
    >
      {n}
    </span>
  )
}

function GlanceCard({
  view,
  on,
  onPick
}: {
  view: GlanceView
  on: boolean
  onPick: () => void
}): React.JSX.Element {
  const pts = view.spark
  const n = pts.length
  const xy = pts.map((p, i) =>
    p === null ? null : ([n > 1 ? 4 + (104 * i) / (n - 1) : 56, 30 - 0.26 * p] as const)
  )
  let d = ''
  let pen = false
  xy.forEach((p) => {
    if (!p) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`
    pen = true
  })
  const last = [...xy].reverse().find((p) => p !== null) ?? null
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cn(
        'grid cursor-pointer grid-cols-[minmax(0,1fr)_112px] items-center gap-2.5 rounded-[9px] bg-panel px-3 py-2.5 text-left',
        on ? 'shadow-[0_0_0_1.5px_var(--cobalt)]' : 'shadow-[0_0_0_1px_var(--line)] hover:bg-hover'
      )}
    >
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-[12px] text-fg-2">{view.label}</span>
        <span className="flex items-center gap-[7px]">
          <span className="font-mono text-[14px] font-semibold tabular-nums">{view.value}</span>
          <PctChip
            percentile={view.percentile}
            qualified={view.percentile !== null || view.value === '—'}
          />
        </span>
        {view.note && <span className="text-[10.5px] font-medium text-warn">{view.note}</span>}
      </span>
      <svg width={112} height={34} viewBox="0 0 112 34" aria-hidden="true">
        <path d="M0 17H112" stroke="var(--line)" strokeDasharray="2 3" />
        <path d={d} fill="none" stroke="var(--s1)" strokeWidth={1.75} strokeLinejoin="round" />
        {last && <circle cx={last[0]} cy={last[1]} r={3} fill="var(--s1)" />}
      </svg>
    </button>
  )
}
