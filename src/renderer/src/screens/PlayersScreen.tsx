import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Info, Search, Star } from 'lucide-react'
import {
  EditionFooter,
  InjuryTag,
  Masthead,
  ModeTabs,
  OwnerTag,
  PosChip,
  RookieTag,
  RoundButton,
  ScoreLabel,
  Swatch,
  ToneChip
} from '@/components/edition'
import { posBg } from '@/lib/edition'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { ValueHelp } from '@/components/ValueHelp'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import {
  boardCell,
  columnGroups,
  DEFAULT_HIDDEN,
  DEFAULT_SORT,
  filterRows,
  hiddenKey,
  isWeekRow,
  kickoffLabel,
  lockedGroup,
  PAGE_SIZE,
  rosAdjustLine,
  rosAdjustMark,
  sortRows,
  type Column,
  type TableRow as PlayerRow,
  type TableSort,
  valueHeaderTitle
} from '@/lib/playersTableView'
import { cn } from '@/lib/utils'
import type {
  GameInfo,
  PlayersOptions,
  PlayerValueRow,
  PlayerWeekRow,
  TableMode,
  Team,
  ValueContext
} from '@shared/types'

const MODES: { key: TableMode; label: string }[] = [
  { key: 'proj', label: 'Projection' },
  { key: 'stats', label: 'Stats' },
  { key: 'value', label: 'Value' }
]
const CHIPS = [
  { key: 'freeAgents', label: 'Free agents' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'rookies', label: 'Rookies' },
  { key: 'mine', label: 'My team' }
] as const
type ChipKey = (typeof CHIPS)[number]['key']
const NO_CHIPS: Record<ChipKey, boolean> = {
  freeAgents: false,
  watchlist: false,
  rookies: false,
  mine: false
}
const pill =
  'h-[34px] rounded-full border border-line bg-panel px-3 text-[13.5px] text-fg outline-none'
const TONE_TEXT = {
  good: 'font-semibold text-good',
  bad: 'font-semibold text-bad',
  warn: 'font-semibold text-warn',
  dim: 'text-fg-3'
} as const

/** "vs GB · W 24-20" (toned by result) or "Sun 1:00 PM vs GB"; BYE in warn. */
function GameNote({ game }: { game: GameInfo | null }): React.JSX.Element {
  if (!game) return <span className="text-warn">BYE</span>
  const vs = `${game.home ? 'vs' : '@'} ${game.opponent}`
  if (game.final && game.homeScore !== null && game.awayScore !== null) {
    const us = game.home ? game.homeScore : game.awayScore
    const them = game.home ? game.awayScore : game.homeScore
    const res = us > them ? 'W' : us < them ? 'L' : 'T'
    return (
      <span className={res === 'W' ? 'text-good' : res === 'L' ? 'text-bad' : 'text-fg-2'}>
        {vs} · {res} {us}-{them}
      </span>
    )
  }
  return (
    <span className="text-fg-2">{game.kickoff ? `${kickoffLabel(game.kickoff)} ${vs}` : vs}</span>
  )
}

interface PlayersScreenProps {
  /** Bumped by App when a sync or a rules save changed the data; the screen refetches but keeps its state. */
  dataVersion: number
  /** Open this player's file once the rows are in (League roster click); the nonce re-focuses the same id. */
  focus?: { playerId: string; nonce: number } | null
  /** The open file's player each time it changes, for Back (N-002); null once it closes. */
  onFile?: (playerId: string | null) => void
}

export function PlayersScreen({
  dataVersion,
  focus = null,
  onFile
}: PlayersScreenProps): React.JSX.Element {
  const [options, setOptions] = useState<PlayersOptions | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [tab, setTab] = useState('ALL')
  const [mode, setMode] = useState<TableMode | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [chips, setChips] = useState(NO_CHIPS)
  const [owner, setOwner] = useState('')
  const [sort, setSort] = useState<TableSort>({ key: 'points', dir: 'desc' })
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [hidden, setHidden] = useState(DEFAULT_HIDDEN)
  const [rows, setRows] = useState<PlayerWeekRow[] | null>(null)
  const [valueRows, setValueRows] = useState<PlayerValueRow[] | null>(null)
  const [valueContext, setValueContext] = useState<ValueContext | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [selected, setSelected] = useState<PlayerRow | null>(null)
  const [focusHandled, setFocusHandled] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const effectiveMode: TableMode = mode ?? 'stats'
  const isValue = effectiveMode === 'value'

  useEffect(() => {
    void api.players
      .options()
      .then((o) => {
        setOptions(o)
        setSeason((s) => s ?? o.seasons[0])
        // first load: Projection when the current week has not been scored yet
        setMode((m) =>
          m === null
            ? o.lastScoredWeek !== null && o.lastScoredWeek >= o.currentWeek
              ? 'stats'
              : 'proj'
            : m
        )
        setWeek((w) => w ?? o.currentWeek)
      })
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .teams()
      .then(setTeams)
      .catch((err) => setError(errorMessage(err)))
  }, [dataVersion])

  useEffect(() => {
    if (season === null || week === null) return
    void api.players
      .week({ season, week })
      .then((w) => {
        setError(null)
        setRows(w.rows)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [season, week, dataVersion])

  useEffect(() => {
    if (season === null || effectiveMode !== 'value') return
    void api.players
      .value(season)
      .then((v) => {
        setError(null)
        setValueRows(v.rows)
        setValueContext(v.context)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [season, effectiveMode, dataVersion])

  // A new focus opens that player's file once the week rows are in (state adjusted during render).
  if (focus && focus.nonce !== focusHandled && rows !== null) {
    setFocusHandled(focus.nonce)
    const hit = rows.find((r) => r.playerId === focus.playerId)
    if (hit) setSelected(hit)
  }

  // Not on mount: the screen opens with no file, and a focus fills one in.
  const fileId = selected?.playerId ?? null
  const reportedFile = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const was = reportedFile.current
    reportedFile.current = fileId
    if (was !== undefined && was !== fileId) onFile?.(fileId)
  }, [fileId, onFile])

  const closePanel = useCallback(() => setSelected(null), [])
  const patchWatched = useCallback((playerId: string, watched: boolean) => {
    const patch = <T extends PlayerRow>(list: T[] | null): T[] | null =>
      list && list.map((r) => (r.playerId === playerId ? { ...r, watched } : r))
    setRows(patch)
    setValueRows(patch)
  }, [])

  async function toggleWatch(row: PlayerRow): Promise<void> {
    try {
      patchWatched(row.playerId, await api.watchlist.toggle(row.playerId))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  /** Crossing into or out of Value mode resets the sort; Stats can't sit past the last scored week. */
  function switchMode(next: TableMode): void {
    if ((next === 'value') !== isValue) setSort(DEFAULT_SORT[next])
    const last = options?.lastScoredWeek ?? null
    if (next === 'stats' && last !== null && week !== null && week > last) setWeek(last)
    setMode(next)
    setLimit(PAGE_SIZE)
  }

  function sortBy(key: string, ascFirst = false): void {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: ascFirst ? 'asc' : 'desc' }
    )
    setLimit(PAGE_SIZE)
  }

  const currentTab = options?.tabs.find((t) => t.id === tab)
  const filters = {
    search,
    ...chips,
    owner: owner ? Number(owner) : null
  }
  const source: PlayerRow[] | null = isValue ? valueRows : rows
  const visible = useMemo(
    () => sortRows(filterRows(source ?? [], currentTab, filters), sort, effectiveMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, currentTab, search, chips, owner, sort, effectiveMode]
  )
  const shown = visible.slice(0, limit)
  const allGroups = columnGroups(tab, effectiveMode, valueContext?.hasMyTeam ?? false)
  const locked = lockedGroup(effectiveMode)
  const groups = allGroups.filter(
    (g) => g.label === locked || !hidden[hiddenKey(effectiveMode, tab, g.label)]
  )
  const columns = groups.flatMap((g) => g.columns)
  const firstOfGroup = new Map(groups.map((g) => [g.columns[0].key, g.label]))
  const toggles = allGroups.filter((g) => g.label !== locked)
  const sortCol = columns.find((c) => c.key === sort.key)
  const hasMyTeam = teams.some((t) => t.isMe)
  const seasonNow = season ?? options?.seasons[0] ?? null
  const cw = options?.currentWeek ?? null
  const last = options?.lastScoredWeek ?? null
  const maxWeek = effectiveMode === 'stats' ? (last ?? 1) : 18
  const loading = !error && (options === null || source === null)

  const weekState =
    effectiveMode === 'stats'
      ? 'Final'
      : week === cw
        ? 'This week'
        : week !== null && cw !== null && week < cw
          ? 'Past week'
          : 'Upcoming'
  const kicker = options
    ? `${seasonNow} season · ${teams.length} teams · ` +
      (isValue
        ? 'Rest-of-season value'
        : effectiveMode === 'stats'
          ? `Week ${week} box scores`
          : `Week ${week} projections`)
    : 'Loading…'

  const projectionsStored =
    options?.projectionWeeks.some((p) => p.season === season && p.week === week) ?? false
  const clearFilters = (): void => {
    setChips(NO_CHIPS)
    setOwner('')
    setSearch('')
    setLimit(PAGE_SIZE)
  }
  let empty: { message: string; action?: { label: string; run: () => void } } | null = null
  if (!loading && shown.length === 0) {
    if (effectiveMode === 'stats' && (last === null || (week !== null && week > last)))
      empty = {
        message: `Week ${week} hasn't been played yet.`,
        action: { label: 'Show projections', run: () => switchMode('proj') }
      }
    else if (effectiveMode === 'proj' && !projectionsStored)
      empty = {
        message: `No projections stored for week ${week}.`,
        action: undefined
      }
    else if ((source ?? []).length > 0)
      empty = {
        message: 'No players match these filters.',
        action: { label: 'Clear filters', run: clearFilters }
      }
    else empty = { message: 'No players for this season yet.' }
  }

  const sortLabel = sort.key === 'name' ? 'name' : (sortCol?.label ?? '')
  const thBase =
    'sticky top-6 z-[2] h-8 border-b-2 border-ink bg-paper px-2 pr-2.5 text-right align-middle font-cond text-[13px] leading-none font-bold tracking-[0.1em] whitespace-nowrap uppercase cursor-pointer select-none'

  return (
    <>
      <Masthead
        kicker={kicker}
        title="The Player Board"
        below={<ModeTabs tabs={MODES} value={effectiveMode} onChange={switchMode} />}
        right={
          isValue ? (
            <div className="flex items-center gap-2.5">
              <ScoreLabel top="Rest of" bottom="season" />
              <div className="font-cond text-[56px] leading-[0.8] font-extrabold uppercase">
                {valueContext
                  ? `Wks ${valueContext.currentWeek}–${valueContext.lastWeek}`
                  : 'Wks —'}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <RoundButton
                title="Previous week"
                disabled={week === null || week <= 1}
                onClick={() => {
                  setWeek((w) => Math.max(1, (w ?? 1) - 1))
                  setLimit(PAGE_SIZE)
                }}
              >
                <ChevronLeft className="size-[18px]" />
              </RoundButton>
              <div className="flex items-center gap-2.5 px-1.5">
                <ScoreLabel top="Week" bottom={weekState} />
                <div className="ed-numeral" aria-label="Week">
                  {week === null ? '--' : String(week).padStart(2, '0')}
                </div>
              </div>
              <RoundButton
                title="Next week"
                disabled={week === null || week >= maxWeek}
                onClick={() => {
                  setWeek((w) => Math.min(maxWeek, (w ?? 1) + 1))
                  setLimit(PAGE_SIZE)
                }}
              >
                <ChevronRight className="size-[18px]" />
              </RoundButton>
            </div>
          )
        }
      />

      <div className="flex shrink-0 items-center justify-between gap-4 px-8 pt-3 pb-2.5">
        <div role="tablist" className="flex gap-1">
          {(options?.tabs ?? []).map((t) => {
            const on = t.id === tab
            const color = posBg(t.id) ?? 'bg-ink'
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTab(t.id)
                  setLimit(PAGE_SIZE)
                }}
                className={cn(
                  'flex h-[34px] cursor-pointer items-center gap-[7px] rounded-[4px] px-3 font-cond text-[15px] leading-none tracking-[0.08em] uppercase',
                  on
                    ? cn(
                        color,
                        color === 'bg-ink' ? 'text-paper' : 'text-on-pos',
                        'px-[13px] font-extrabold'
                      )
                    : 'font-bold text-fg-2 hover:bg-hover hover:text-fg'
                )}
              >
                {!on && <span className={cn('size-2', color)} />}
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          {(options?.seasons.length ?? 0) > 1 && (
            <select
              aria-label="Season"
              className={cn(pill, 'w-[92px] cursor-pointer')}
              value={season ?? ''}
              onChange={(e) => {
                setSeason(Number(e.target.value))
                setLimit(PAGE_SIZE)
              }}
            >
              {(options?.seasons ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <label className={cn(pill, 'flex w-[210px] items-center gap-2 text-fg-3')}>
            <Search className="size-[15px] shrink-0" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setLimit(PAGE_SIZE)
              }}
              placeholder="Find a player"
              className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
            />
          </label>
          <select
            aria-label="Owner"
            className={cn(pill, 'w-[170px] cursor-pointer')}
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value)
              setChips((c) => ({ ...c, freeAgents: false, mine: false }))
              setLimit(PAGE_SIZE)
            }}
          >
            <option value="">All teams</option>
            {[...teams]
              .sort((a, b) =>
                (a.teamName ?? a.displayName).localeCompare(b.teamName ?? b.displayName)
              )
              .map((t) => (
                <option key={t.rosterId} value={String(t.rosterId)}>
                  {(t.teamName ?? t.displayName) + (t.isMe ? ' (you)' : '')}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 px-8 pb-3">
        <div className="flex items-center gap-1.5">
          {CHIPS.filter((c) => c.key !== 'mine' || hasMyTeam).map((c) => {
            const on = chips[c.key]
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setChips((prev) => {
                    const next = { ...prev, [c.key]: !on }
                    if (!on && c.key === 'freeAgents') next.mine = false
                    if (!on && c.key === 'mine') next.freeAgents = false
                    return next
                  })
                  if (!on && (c.key === 'freeAgents' || c.key === 'mine')) setOwner('')
                  setLimit(PAGE_SIZE)
                }}
                className={cn(
                  'flex h-7 cursor-pointer items-center rounded-full font-cond text-[13px] leading-none font-bold tracking-[0.08em] uppercase',
                  on
                    ? 'gap-[5px] bg-brand pr-3 pl-[9px] text-on-brand'
                    : 'border border-line px-3 text-fg-2 hover:border-ink hover:text-fg'
                )}
              >
                {on && <Check className="size-[13px]" />}
                {c.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3 font-cond text-[13px] leading-none font-bold tracking-[0.08em] uppercase">
          {isValue && (
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="flex cursor-pointer items-center gap-1 text-fg-3 uppercase hover:text-fg"
            >
              <Info className="size-3.5" />
              How value works
            </button>
          )}
          {toggles.length > 0 && <span className="tracking-[0.14em] text-fg-3">Columns</span>}
          {toggles.map((g) => {
            const key = hiddenKey(effectiveMode, tab, g.label)
            const on = !hidden[key]
            return (
              <button
                key={g.label}
                type="button"
                aria-pressed={on}
                title={on ? 'Hide these columns' : 'Show these columns'}
                onClick={() => setHidden((h) => ({ ...h, [key]: on }))}
                className={cn(
                  'flex cursor-pointer items-center gap-[5px] uppercase',
                  on ? 'text-fg' : 'text-fg-3 hover:text-fg'
                )}
              >
                <span
                  className={cn(
                    'size-[11px] rounded-[2px]',
                    on ? 'bg-ink' : 'border-[1.5px] border-current'
                  )}
                />
                {g.label === 'Rest of season' ? 'ROS' : g.label}
              </button>
            )
          })}
        </div>
      </div>

      {isValue && valueContext && !valueContext.projectionsStored && (
        <p className="shrink-0 px-8 pb-2 text-[12px] text-fg-3">
          No projections stored for {season} — rest-of-season columns are empty.
        </p>
      )}
      {isValue && valueContext?.projectionsStored && !valueContext.rosAdjusted && (
        <p className="shrink-0 px-8 pb-2 text-[12px] text-fg-3">
          Rest-of-season values not adjusted — no expert ranks synced yet.
        </p>
      )}
      {error && <p className="shrink-0 px-8 pb-2 text-bad">{error}</p>}

      <div className="mx-8 min-h-0 flex-1 overflow-auto border-t border-line">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-[4] h-6 bg-paper" />
              {columns.map((col) => {
                const group = firstOfGroup.get(col.key)
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'sticky top-0 h-6 bg-paper p-0 shadow-[inset_0_-1px_0_var(--ink)]',
                      group ? 'z-[3]' : 'z-[2]'
                    )}
                  >
                    {group && (
                      <span className="relative block h-6">
                        <span className="absolute bottom-[5px] left-2 font-cond text-[12px] leading-none font-extrabold tracking-[0.14em] whitespace-nowrap text-fg uppercase">
                          {group}
                        </span>
                      </span>
                    )}
                  </th>
                )
              })}
              <th className="sticky top-0 z-[2] w-full bg-paper" />
            </tr>
            <tr>
              <th className="sticky top-6 left-0 z-[4] h-8 border-b-2 border-ink bg-paper p-0 align-middle">
                <div className="flex w-[404px] items-center justify-between pr-3 pl-20">
                  <button
                    type="button"
                    onClick={() => sortBy('name', true)}
                    className={cn(
                      'flex cursor-pointer items-center gap-1 font-cond text-[13px] leading-none font-bold tracking-[0.1em] uppercase',
                      sort.key === 'name' ? 'text-brand-fg' : 'text-fg-2 hover:text-fg'
                    )}
                  >
                    Player
                    {sort.key === 'name' && (
                      <span className="text-[9px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                  <span className="w-[104px] text-left font-cond text-[13px] leading-none font-bold tracking-[0.1em] text-fg-2 uppercase">
                    Owner
                  </span>
                </div>
              </th>
              {columns.map((col: Column) => {
                const on = sort.key === col.key
                return (
                  <th
                    key={col.key}
                    onClick={() =>
                      sortBy(
                        col.key,
                        col.field === 'stdRank' ||
                          col.field === 'rosRank' ||
                          col.expert === 'ecrPosRank' ||
                          col.expert === 'weekPosRank' ||
                          col.expert === 'spread' ||
                          col.signal === 'byesRemaining'
                      )
                    }
                    title={valueHeaderTitle(col, valueContext, currentTab?.positions ?? [])}
                    className={cn(thBase, on ? 'text-brand-fg' : 'text-fg-2 hover:text-fg')}
                  >
                    {on && (
                      <span className="mr-[3px] text-[9px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                    {col.label}
                  </th>
                )
              })}
              <th className="sticky top-6 z-[2] w-full border-b-2 border-ink bg-paper" />
            </tr>
          </thead>
          {!loading && !empty && (
            <tbody>
              {shown.map((p) => {
                const mine = p.ownerIsMe
                const cellBg = cn(
                  'border-b border-line bg-paper group-hover:bg-hover',
                  mine && 'bg-[linear-gradient(var(--me),var(--me))]'
                )
                const meta = [p.team ?? 'FA', p.byeWeek ? `Bye ${p.byeWeek}` : null]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <tr
                    key={p.playerId}
                    title="Open player file"
                    onClick={() => setSelected(p)}
                    className="group cursor-pointer"
                  >
                    <td className={cn(cellBg, 'sticky left-0 z-[1] p-0 align-middle')}>
                      <div className="grid h-11 w-[404px] grid-cols-[24px_38px_minmax(0,1fr)_104px] items-center gap-x-2.5 pr-3 pl-2">
                        <button
                          type="button"
                          aria-label={p.watched ? 'Remove from watchlist' : 'Add to watchlist'}
                          title={p.watched ? 'Remove from watchlist' : 'Add to watchlist'}
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleWatch(p)
                          }}
                          className={cn(
                            'flex size-6 cursor-pointer items-center justify-center',
                            p.watched ? 'text-brand' : 'text-fg-3 hover:text-fg'
                          )}
                        >
                          <Star
                            className="size-[15px]"
                            fill={p.watched ? 'currentColor' : 'none'}
                          />
                        </button>
                        <PosChip position={p.position} />
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[14.5px] leading-[1.1] font-semibold tracking-[-0.01em]">
                              {p.fullName}
                            </span>
                            <InjuryTag status={p.injuryStatus} />
                            {p.rookie && <RookieTag />}
                          </div>
                          <div className="truncate text-[12px] leading-[1.1] text-fg-3">
                            {meta}
                            {isWeekRow(p) && p.team && (
                              <>
                                {' · '}
                                <GameNote game={p.game} />
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex min-w-0">
                          <OwnerTag
                            isMine={mine}
                            ownerName={p.ownerName}
                            isFreeAgent={p.ownerRosterId === null}
                          />
                        </div>
                      </div>
                    </td>
                    {columns.map((col) => {
                      const c = boardCell(p, col, effectiveMode)
                      const mark =
                        col.field === 'rosPoints' && 'rosAdjust' in p ? rosAdjustMark(p) : null
                      return (
                        <td
                          key={col.key}
                          title={c.title}
                          className={cn(
                            cellBg,
                            'px-[5px] text-right align-middle whitespace-nowrap'
                          )}
                        >
                          {c.primary ? (
                            <span className="inline-block px-[5px] py-[3px] font-cond text-[22px] leading-none font-extrabold">
                              {c.text}
                              {mark && (
                                <span
                                  className="ml-1 font-sans text-[11px] font-normal text-fg-3"
                                  title={rosAdjustLine(p as PlayerValueRow) ?? undefined}
                                >
                                  {mark}
                                </span>
                              )}
                            </span>
                          ) : c.chip && c.tone !== 'dim' && c.text ? (
                            <ToneChip
                              tone={
                                c.tone === 'good' || c.tone === 'bad' || c.tone === 'warn'
                                  ? c.tone
                                  : 'neutral'
                              }
                              className="min-w-8 text-[15px]"
                              title={c.title}
                            >
                              {c.text}
                            </ToneChip>
                          ) : (
                            <span
                              className={cn(
                                'inline-block px-[5px] py-[3px] text-[13.5px] leading-none',
                                c.tone ? TONE_TEXT[c.tone] : 'text-fg'
                              )}
                            >
                              {c.text}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td className={cellBg} />
                  </tr>
                )
              })}
            </tbody>
          )}
        </table>
        {loading && <div className="ed-loading sticky left-0">Loading the board…</div>}
        {empty && (
          <div className="sticky left-0 flex flex-col items-center gap-3.5 py-16">
            <div className="font-cond text-[24px] leading-[1.1] font-extrabold tracking-[0.02em] text-fg-2 uppercase">
              {empty.message}
            </div>
            {empty.action && (
              <button
                type="button"
                onClick={empty.action.run}
                className="h-[34px] cursor-pointer rounded-full bg-ink px-4 font-cond text-[14px] leading-none font-bold tracking-[0.08em] text-paper uppercase"
              >
                {empty.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      <EditionFooter
        legend={[
          { swatch: <Swatch className="bg-good" />, label: 'Good for you' },
          { swatch: <Swatch className="bg-bad" />, label: 'Concern' },
          { swatch: <Swatch className="bg-warn" />, label: 'Questionable' }
        ]}
      >
        <span>
          <span className="font-semibold text-fg">{shown.length}</span> of {visible.length} players
          · by {sortLabel}, {sort.dir === 'asc' ? 'low → high' : 'high → low'}
        </span>
        {visible.length > shown.length && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE_SIZE)}
            className="h-[26px] cursor-pointer rounded-full border border-ink px-3 font-cond text-[12.5px] leading-none font-bold tracking-[0.1em] text-fg uppercase hover:bg-ink hover:text-paper"
          >
            Show {Math.min(PAGE_SIZE, visible.length - shown.length)} more
          </button>
        )}
      </EditionFooter>

      <PlayerDetailPanel
        season={seasonNow ?? 0}
        player={selected}
        onClose={closePanel}
        onWatchChange={patchWatched}
      />
      <ValueHelp open={helpOpen} onClose={() => setHelpOpen(false)} context={valueContext} />
    </>
  )
}
