import { useCallback, useEffect, useMemo, useState } from 'react'
import { Info, Search, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { PositionBadge } from '@/components/PositionBadge'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { ValueHelp } from '@/components/ValueHelp'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import {
  cellText,
  cellValue,
  columnGroups,
  DEFAULT_SORT,
  filterRows,
  signalText,
  signalTone,
  sortRows,
  subLabel,
  TABLE_LIMIT,
  type Column,
  type TableRow as PlayerRow,
  type TableSort,
  valueHeaderTitle
} from '@/lib/playersTableView'
import { cn } from '@/lib/utils'
import type {
  PlayersOptions,
  PlayerValueRow,
  PlayerWeekRow,
  TableMode,
  Team,
  ValueContext
} from '@shared/types'

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1)

function Chip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3 text-sm transition-colors',
        active
          ? 'border-primary/60 bg-primary/15 text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent/40'
      )}
    >
      {children}
    </button>
  )
}

interface PlayersScreenProps {
  /** Bumped by App when a sync or a rules save changed the data; the screen refetches but keeps its state. */
  dataVersion: number
}

export function PlayersScreen({ dataVersion }: PlayersScreenProps): React.JSX.Element {
  const [options, setOptions] = useState<PlayersOptions | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [tab, setTab] = useState('ALL')
  const [mode, setMode] = useState<TableMode | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [freeAgents, setFreeAgents] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [rookies, setRookies] = useState(false)
  const [owner, setOwner] = useState('')
  const [sort, setSort] = useState<TableSort>({ key: 'points', dir: 'desc' })
  const [rows, setRows] = useState<PlayerWeekRow[]>([])
  const [valueRows, setValueRows] = useState<PlayerValueRow[]>([])
  const [valueContext, setValueContext] = useState<ValueContext | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [selected, setSelected] = useState<PlayerRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const effectiveMode: TableMode = mode ?? 'stats'

  useEffect(() => {
    void api.players
      .options()
      .then((o) => {
        setOptions(o)
        setSeason((s) => s ?? o.seasons[0])
        setWeek((w) => w ?? o.currentWeek)
        // first load: Projection when the current week has not been scored yet
        setMode((m) =>
          m === null
            ? o.lastScoredWeek !== null && o.lastScoredWeek >= o.currentWeek
              ? 'stats'
              : 'proj'
            : m
        )
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

  const closePanel = useCallback(() => setSelected(null), [])

  async function toggleWatch(row: PlayerRow): Promise<void> {
    try {
      const watched = await api.watchlist.toggle(row.playerId)
      const patch = <T extends PlayerRow>(list: T[]): T[] =>
        list.map((r) => (r.playerId === row.playerId ? { ...r, watched } : r))
      setRows(patch)
      setValueRows(patch)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  /** Crossing into or out of Value mode resets the sort; Projection and Stats share `points`. */
  function switchMode(next: TableMode): void {
    if ((next === 'value') !== (effectiveMode === 'value')) setSort(DEFAULT_SORT[next])
    setMode(next)
  }

  function sortBy(col: Column): void {
    setSort((s) =>
      s.key === col.key
        ? { key: col.key, dir: s.dir === 'desc' ? 'asc' : 'desc' }
        : { key: col.key, dir: 'desc' }
    )
  }

  const visible = useMemo(() => {
    const currentTab = options?.tabs.find((t) => t.id === tab)
    const source: PlayerRow[] = effectiveMode === 'value' ? valueRows : rows
    const filtered = filterRows(source, currentTab, {
      search,
      freeAgents,
      watchlist,
      rookies,
      mine: false,
      owner: owner ? Number(owner) : null
    })
    return sortRows(filtered, sort, effectiveMode)
  }, [
    rows,
    valueRows,
    options,
    tab,
    search,
    freeAgents,
    watchlist,
    rookies,
    owner,
    sort,
    effectiveMode
  ])
  const shown = visible.slice(0, TABLE_LIMIT)
  const groups = columnGroups(tab, effectiveMode)
  const columns = groups.flatMap((g) => g.columns)
  const weekPlayed =
    options?.lastScoredWeek !== null && week !== null && (options?.lastScoredWeek ?? 0) >= week
  const projectionsStored =
    options?.projectionWeeks.some((p) => p.season === season && p.week === week) ?? false
  const empty =
    shown.length === 0
      ? effectiveMode === 'value'
        ? 'No players match.'
        : effectiveMode === 'stats' && !weekPlayed
          ? `Week ${week} hasn't been played yet — switch to Projection.`
          : effectiveMode === 'proj' && !projectionsStored
            ? `No projections stored for week ${week} (they are fetched from the current week on).`
            : 'No players match.'
      : null

  return (
    <div className="space-y-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full border p-1">
          {(options?.tabs ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'h-7 rounded-full px-3 text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-primary/20 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input
            placeholder="Find player"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-52 pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {(['proj', 'stats', 'value'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                'h-7 rounded px-3 text-sm',
                effectiveMode === m
                  ? 'bg-primary/20 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'proj' ? 'Projection' : m === 'stats' ? 'Stats' : 'Value'}
            </button>
          ))}
        </div>
        {effectiveMode === 'value' && (
          <button
            type="button"
            aria-label="How value is calculated"
            title="How value is calculated"
            onClick={() => setHelpOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Info className="size-4" />
          </button>
        )}
        <select
          className={selectClass}
          value={season ?? ''}
          onChange={(e) => setSeason(Number(e.target.value))}
        >
          {(options?.seasons ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {effectiveMode !== 'value' && (
          <select
            className={selectClass}
            value={week ?? ''}
            onChange={(e) => setWeek(Number(e.target.value))}
          >
            {WEEKS.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        )}
        <Chip active={freeAgents} onClick={() => setFreeAgents((v) => !v)}>
          Free agents
        </Chip>
        <Chip active={watchlist} onClick={() => setWatchlist((v) => !v)}>
          Watchlist
        </Chip>
        <Chip active={rookies} onClick={() => setRookies((v) => !v)}>
          Rookies
        </Chip>
        <select
          className={cn(selectClass, 'ml-auto')}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">Any owner</option>
          {teams.map((t) => (
            <option key={t.rosterId} value={String(t.rosterId)}>
              {t.teamName ?? t.displayName}
            </option>
          ))}
        </select>
      </div>

      {effectiveMode === 'value' && valueContext && !valueContext.projectionsStored && (
        <p className="text-xs text-muted-foreground">
          No projections stored for {season} — rest-of-season columns are empty.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead colSpan={3} />
            {groups.map((g) => (
              <TableHead
                key={g.label}
                colSpan={g.columns.length}
                className="border-l text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {g.label}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Player</TableHead>
            <TableHead className="w-32">Owner</TableHead>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => sortBy(col)}
                title={valueHeaderTitle(
                  col,
                  valueContext,
                  options?.tabs.find((t) => t.id === tab)?.positions ?? []
                )}
                className={cn(
                  'w-14 cursor-pointer select-none text-right',
                  sort.key === col.key && 'text-foreground'
                )}
              >
                {col.label}
                {sort.key === col.key ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((p) => (
            <TableRow
              key={p.playerId}
              onClick={() => setSelected(p)}
              className={cn('cursor-pointer', selected?.playerId === p.playerId && 'bg-accent/60')}
            >
              <TableCell className="pr-0">
                <button
                  type="button"
                  aria-label={p.watched ? 'Remove from watchlist' : 'Add to watchlist'}
                  onClick={(e) => {
                    e.stopPropagation()
                    void toggleWatch(p)
                  }}
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    p.watched && 'text-yellow-400'
                  )}
                >
                  <Star className="size-4" fill={p.watched ? 'currentColor' : 'none'} />
                </button>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <PositionBadge position={p.position} />
                  <span className="font-medium">{p.fullName}</span>
                  {p.rookie && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      R
                    </Badge>
                  )}
                  {p.injuryStatus && (
                    <span className="text-xs text-destructive">{p.injuryStatus}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{subLabel(p)}</div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {p.ownerName ?? <span className="italic">Free agent</span>}
              </TableCell>
              {columns.map((col) => {
                const value =
                  p.statsAvailable || effectiveMode !== 'stats'
                    ? cellValue(p, col, effectiveMode)
                    : null
                const signed = col.kind === 'delta' || col.format === 'signed'
                const tone =
                  col.kind === 'signal'
                    ? signalTone(p, col)
                    : signed && value !== null
                      ? value >= 0
                        ? 'pos'
                        : 'neg'
                      : null
                return (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'text-right tabular-nums',
                      (col.kind === 'points' || col.field === 'rosValue') && 'font-medium',
                      tone === 'pos' && 'text-pos-rb',
                      tone === 'neg' && 'text-destructive'
                    )}
                  >
                    {col.kind === 'signal'
                      ? signalText(p, col)
                      : cellText(value, col, effectiveMode)}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
          {empty && (
            <TableRow>
              <TableCell
                colSpan={3 + columns.length}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {visible.length > shown.length && (
        <p className="text-xs text-muted-foreground">
          Showing {shown.length} of {visible.length} — refine the filters to see the rest.
        </p>
      )}

      <PlayerDetailPanel
        season={season ?? options?.seasons[0] ?? 0}
        player={selected}
        onClose={closePanel}
      />
      <ValueHelp open={helpOpen} onClose={() => setHelpOpen(false)} context={valueContext} />
    </div>
  )
}
