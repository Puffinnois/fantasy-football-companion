import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Star } from 'lucide-react'
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
import { SlideOver } from '@/components/SlideOver'
import { api } from '@/lib/api'
import { errorMessage, fmtPct, fmtPoints } from '@/lib/format'
import {
  cellText,
  cellValue,
  columnGroups,
  filterRows,
  sortRows,
  subLabel,
  TABLE_LIMIT,
  type Column,
  type TableSort
} from '@/lib/playersTableView'
import { cn } from '@/lib/utils'
import type { PlayersOptions, PlayerWeekRow, TableMode, Team, WeekStats } from '@shared/types'

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
  const [selected, setSelected] = useState<PlayerWeekRow | null>(null)
  const [weeks, setWeeks] = useState<WeekStats[]>([])
  const [error, setError] = useState<string | null>(null)

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
    if (!selected) return
    void api.players
      .weeklyStats(selected.playerId)
      .then(setWeeks)
      .catch((err) => setError(errorMessage(err)))
  }, [selected])

  const closePanel = useCallback(() => setSelected(null), [])

  async function toggleWatch(row: PlayerWeekRow): Promise<void> {
    try {
      const watched = await api.watchlist.toggle(row.playerId)
      setRows((list) => list.map((r) => (r.playerId === row.playerId ? { ...r, watched } : r)))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  function sortBy(col: Column): void {
    setSort((s) =>
      s.key === col.key
        ? { key: col.key, dir: s.dir === 'desc' ? 'asc' : 'desc' }
        : { key: col.key, dir: 'desc' }
    )
  }

  const effectiveMode: TableMode = mode ?? 'stats'
  const visible = useMemo(() => {
    const currentTab = options?.tabs.find((t) => t.id === tab)
    const filtered = filterRows(rows, currentTab, {
      search,
      freeAgents,
      watchlist,
      rookies,
      owner: owner ? Number(owner) : null
    })
    return sortRows(filtered, sort, effectiveMode)
  }, [rows, options, tab, search, freeAgents, watchlist, rookies, owner, sort, effectiveMode])
  const shown = visible.slice(0, TABLE_LIMIT)
  const groups = columnGroups(tab, effectiveMode)
  const columns = groups.flatMap((g) => g.columns)
  const weekPlayed =
    options?.lastScoredWeek !== null && week !== null && (options?.lastScoredWeek ?? 0) >= week
  const projectionsStored =
    options?.projectionWeeks.some((p) => p.season === season && p.week === week) ?? false
  const empty =
    shown.length === 0
      ? effectiveMode === 'stats' && !weekPlayed
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
          {(['proj', 'stats'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'h-7 rounded px-3 text-sm',
                effectiveMode === m
                  ? 'bg-primary/20 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'proj' ? 'Projection' : 'Stats'}
            </button>
          ))}
        </div>
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
              onClick={() => {
                setSelected(p)
                setWeeks([])
              }}
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
                  p.statsAvailable || effectiveMode === 'proj'
                    ? cellValue(p, col, effectiveMode)
                    : null
                return (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'text-right tabular-nums',
                      col.kind === 'points' && 'font-medium',
                      col.kind === 'delta' &&
                        value !== null &&
                        (value >= 0 ? 'text-pos-rb' : 'text-destructive')
                    )}
                  >
                    {cellText(value, col, effectiveMode)}
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

      <SlideOver
        open={selected !== null}
        onClose={closePanel}
        title={
          selected && (
            <span className="flex items-center gap-2">
              <PositionBadge position={selected.position} />
              {selected.fullName}
              <span className="font-normal text-muted-foreground">{selected.team ?? 'FA'}</span>
            </span>
          )
        }
      >
        {selected && !selected.statsAvailable && (
          <p className="text-sm text-muted-foreground">
            Stats unavailable — this player could not be matched to nflverse data.
          </p>
        )}
        {selected?.statsAvailable && weeks.length === 0 && (
          <p className="text-sm text-muted-foreground">No games yet this season.</p>
        )}
        {weeks.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Wk</TableHead>
                <TableHead className="w-14">Opp</TableHead>
                <TableHead className="w-14 text-right">Pts</TableHead>
                {selected?.position !== 'DEF' && (
                  <TableHead className="w-14 text-right">Snap%</TableHead>
                )}
                {columnGroups(selected?.position ?? 'ALL', 'stats')
                  .slice(1)
                  .flatMap((g) => g.columns)
                  .filter((c) => c.kind === 'stat')
                  .map((c) => (
                    <TableHead key={c.key} className="text-right">
                      {c.label}
                    </TableHead>
                  ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((w) => (
                <TableRow key={w.week}>
                  <TableCell className="tabular-nums">{w.week}</TableCell>
                  <TableCell className="text-muted-foreground">{w.opponent ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {fmtPoints(w.points)}
                  </TableCell>
                  {selected?.position !== 'DEF' && (
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {fmtPct(w.snaps?.offensePct ?? null)}
                    </TableCell>
                  )}
                  {columnGroups(selected?.position ?? 'ALL', 'stats')
                    .slice(1)
                    .flatMap((g) => g.columns)
                    .filter((c) => c.kind === 'stat')
                    .map((c) => (
                      <TableCell key={c.key} className="text-right tabular-nums">
                        {cellText(w.stats[weekStatKey(c.statKey ?? '')] ?? null, c, 'stats')}
                      </TableCell>
                    ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SlideOver>
    </div>
  )
}

/** The slide-over reads raw nflverse rows; map the Sleeper column keys back to nflverse names. */
const WEEK_STAT_KEYS: Record<string, string> = {
  rush_att: 'carries',
  rush_yd: 'rushing_yards',
  rush_td: 'rushing_tds',
  rec: 'receptions',
  rec_tgt: 'targets',
  rec_yd: 'receiving_yards',
  rec_td: 'receiving_tds',
  pass_cmp: 'completions',
  pass_att: 'attempts',
  pass_yd: 'passing_yards',
  pass_td: 'passing_tds',
  pass_int: 'passing_interceptions',
  fgm: 'fg_made',
  fga: 'fg_att',
  fgm_40_49: 'fg_made_40_49',
  xpm: 'pat_made',
  xpa: 'pat_att',
  sack: 'def_sacks',
  int: 'def_interceptions',
  ff: 'def_fumbles_forced',
  fum_rec: 'fumble_recovery_opp',
  def_td: 'def_tds',
  safe: 'def_safeties'
}

function weekStatKey(sleeperKey: string): string {
  return WEEK_STAT_KEYS[sleeperKey] ?? sleeperKey
}
