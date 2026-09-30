import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { PositionBadge } from '@/components/PositionBadge'
import { api } from '@/lib/api'
import { errorMessage, fmtSigned } from '@/lib/format'
import { deltaTone, fmtMarket, windowLabel } from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import {
  ALL_POSITIONS,
  NO_LINEUP_ADDS,
  NO_STASH,
  STASH_SORTS,
  STREAM_CHIPS,
  WAIVER_MODES,
  filterStream,
  isFree,
  noStreamers,
  optionLabel,
  priorityLine,
  releaseLabel,
  rosRankLabel,
  sortStash,
  startsText,
  streamOptionLabel,
  trendingNote,
  trendingText,
  weekOptionLabel,
  type ReleaseChoice,
  type StashSort,
  type WaiverMode
} from '@/lib/waiverView'
import { streamWeeks } from '@shared/rules'
import type { DetailTarget, StreamRow, TradePlayer, WaiverAdds } from '@shared/types'

const selectClass =
  'h-8 max-w-64 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

const TONE: Record<ReturnType<typeof deltaTone>, string> = {
  green: 'text-emerald-400',
  red: 'text-red-400',
  muted: 'text-muted-foreground'
}

type Choose = (key: string, index: number) => void

function PlayerCell({
  player,
  onOpen
}: {
  player: TradePlayer
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <PositionBadge position={player.position} />
      <button type="button" className="font-medium hover:underline" onClick={() => onOpen(player)}>
        {player.fullName}
      </button>
      <span className="text-muted-foreground">{player.team ?? ''}</span>
      {player.injuryStatus && (
        <span className="text-xs font-semibold text-red-400">{player.injuryStatus}</span>
      )}
    </div>
  )
}

/** Spec §8: the release, as a dropdown of every option when there is a choice. */
function ReleaseCell<T extends ReleaseChoice>({
  player,
  options,
  label,
  index,
  onChange
}: {
  player: TradePlayer
  options: T[]
  label: (o: T) => string
  index: number
  onChange: (index: number) => void
}): React.JSX.Element {
  if (options.length === 1) return <span className="text-sm">{releaseLabel(options[0])}</span>
  return (
    <select
      aria-label={`Release for ${player.fullName}`}
      className={selectClass}
      value={index}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {options.map((o, i) => (
        <option key={i} value={i}>
          {label(o)}
        </option>
      ))}
    </select>
  )
}

function LineupCard({
  adds,
  choice,
  onChoose,
  onOpen
}: {
  adds: WaiverAdds
  choice: Record<string, number>
  onChoose: Choose
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Improves my lineup</CardTitle>
      </CardHeader>
      <CardContent>
        {adds.lineup.length === 0 ? (
          <p className="text-sm text-muted-foreground">{NO_LINEUP_ADDS}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Δ/week</TableHead>
                <TableHead className="text-right">Window</TableHead>
                <TableHead className="text-right">This week</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Make room</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adds.lineup.map((row) => {
                const key = `lineup|${row.player.playerId}`
                const index = choice[key] ?? 0
                const o = row.options[index] ?? row.options[0]
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <PlayerCell player={row.player} onOpen={onOpen} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        TONE[deltaTone(o.deltaPerWeek)]
                      )}
                    >
                      {`${fmtSigned(o.deltaPerWeek)}/wk`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtSigned(o.delta)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtSigned(o.thisWeekDelta)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {startsText(o.startWeeks, adds.weeks)}
                    </TableCell>
                    <TableCell>
                      <ReleaseCell
                        player={row.player}
                        options={row.options}
                        label={optionLabel}
                        index={index}
                        onChange={(i) => onChoose(key, i)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function StashCard({
  adds,
  sort,
  onSort,
  choice,
  onChoose,
  onOpen
}: {
  adds: WaiverAdds
  sort: StashSort
  onSort: (by: StashSort) => void
  choice: Record<string, number>
  onChoose: Choose
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const rows = sortStash(adds.stash, sort)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stash</CardTitle>
        <p className="text-xs text-muted-foreground">{trendingNote(adds.trendingFetchedAt)}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{NO_STASH}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                {STASH_SORTS.map(({ key, label }) => (
                  <TableHead key={key} className="text-right">
                    <button
                      type="button"
                      aria-pressed={sort === key}
                      className={cn(
                        'hover:underline',
                        sort === key && 'font-semibold text-foreground'
                      )}
                      onClick={() => onSort(key)}
                    >
                      {label}
                    </button>
                  </TableHead>
                ))}
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Make room</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const key = `stash|${row.player.playerId}`
                const index = choice[key] ?? 0
                const o = row.options[index] ?? row.options[0]
                return (
                  <TableRow key={key} data-testid="stash-row">
                    <TableCell>
                      <PlayerCell player={row.player} onOpen={onOpen} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.player.market ? fmtMarket(row.player.market.value) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {trendingText(row.trending)}
                    </TableCell>
                    <TableCell className="text-right">{rosRankLabel(row.player)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {isFree(o) ? (
                        <span className="rounded bg-emerald-500/15 px-1 text-xs font-semibold text-emerald-400">
                          free
                        </span>
                      ) : (
                        fmtSigned(o.delta)
                      )}
                    </TableCell>
                    <TableCell>
                      <ReleaseCell
                        player={row.player}
                        options={row.options}
                        label={optionLabel}
                        index={index}
                        onChange={(i) => onChoose(key, i)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function StreamCard({
  weeks,
  week,
  currentWeek,
  onWeek,
  chip,
  onChip,
  result,
  note,
  error,
  choice,
  onChoose,
  onOpen
}: {
  weeks: number[]
  week: number
  currentWeek: number
  onWeek: (week: number) => void
  chip: string
  onChip: (chip: string) => void
  /** The latest answer — an earlier week's while a new one computes. */
  result: { week: number; rows: StreamRow[] } | null
  /** "Calculating…" / "Refreshing…"; null when the result is current. */
  note: string | null
  error: string | null
  choice: Record<string, number>
  onChoose: Choose
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const rows = result ? filterStream(result.rows, chip) : []
  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">Streaming</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Streaming week"
            className={selectClass}
            value={week}
            onChange={(e) => onWeek(Number(e.target.value))}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekOptionLabel(w, currentWeek)}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1 rounded-full border p-1">
            {STREAM_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={chip === c}
                onClick={() => onChip(c)}
                className={cn(
                  'h-7 rounded-full px-3 text-sm font-medium transition-colors',
                  chip === c
                    ? 'bg-primary/20 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-muted-foreground">{error}</p>}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {result &&
          (rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{noStreamers(result.week, chip)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Opponent</TableHead>
                  <TableHead className="text-right">Week gain</TableHead>
                  <TableHead className="text-right">Rest cost</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Make room</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const key = `stream|${row.player.playerId}`
                  const index = choice[key] ?? 0
                  const o = row.options[index] ?? row.options[0]
                  return (
                    <TableRow key={key} data-testid="stream-row">
                      <TableCell>
                        <PlayerCell player={row.player} onOpen={onOpen} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.opponent ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtSigned(o.weekGain)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtSigned(-o.restCost)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-semibold tabular-nums',
                          TONE[deltaTone(o.net)]
                        )}
                      >
                        {fmtSigned(o.net)}
                      </TableCell>
                      <TableCell>
                        <ReleaseCell
                          player={row.player}
                          options={row.options}
                          label={streamOptionLabel}
                          index={index}
                          onChange={(i) => onChoose(key, i)}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ))}
      </CardContent>
    </Card>
  )
}

interface WaiverScreenProps {
  dataVersion: number
}

/** Slice 6c spec §8: the Waivers screen — rest of season (lineup adds, stash) and streaming. */
export function WaiverScreen({ dataVersion }: WaiverScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; adds: WaiverAdds } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [choice, setChoice] = useState<Record<string, number>>({})
  const [sort, setSort] = useState<StashSort>('market')
  const [selected, setSelected] = useState<DetailTarget | null>(null)
  const [mode, setMode] = useState<WaiverMode>('ros')
  // Spec §8: streaming loads on the first switch, then on each week change (and after a sync).
  const [streamOn, setStreamOn] = useState(false)
  const [pickedWeek, setPickedWeek] = useState<number | null>(null)
  const [chip, setChip] = useState(ALL_POSITIONS)
  const [streamed, setStreamed] = useState<{
    key: string
    week: number
    rows: StreamRow[]
  } | null>(null)
  const [streamFailed, setStreamFailed] = useState<{ key: string; message: string } | null>(null)
  const [streamChoice, setStreamChoice] = useState<Record<string, number>>({})

  useEffect(() => {
    void api.players
      .options()
      .then((o) => setSeason((s) => s ?? o.seasons[0] ?? null))
      .catch((err) => setFailed({ key: 'options', message: errorMessage(err) }))
  }, [dataVersion])

  const key = season !== null ? `${season}|${dataVersion}` : null
  useEffect(() => {
    if (season === null || key === null) return
    let cancelled = false
    void api.waiver
      .adds(season)
      .then((adds) => {
        if (cancelled) return
        setLoaded({ key, adds })
        setChoice({})
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, key])

  // Spec §8: keep the previous lists on screen while a refresh computes.
  const adds = loaded?.adds ?? null
  const notice = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const refreshing = loaded !== null && loaded.key !== key && notice === null
  const priority = adds ? priorityLine(adds) : null
  const choose: Choose = (k, i) => setChoice((c) => ({ ...c, [k]: i }))

  // Spec §4: the picker's weeks; a week a sync moved past falls back to the current one.
  const weeks = adds ? streamWeeks(adds.currentWeek, adds.lastWeek) : []
  const week = pickedWeek !== null && weeks.includes(pickedWeek) ? pickedWeek : (weeks[0] ?? null)
  const streamKey =
    streamOn && season !== null && week !== null ? `${season}|${dataVersion}|${week}` : null
  useEffect(() => {
    if (season === null || week === null || streamKey === null) return
    let cancelled = false
    void api.waiver
      .stream(season, week)
      .then((rows) => {
        if (cancelled) return
        setStreamed({ key: streamKey, week, rows })
        setStreamChoice({})
      })
      .catch((err) => {
        if (!cancelled) setStreamFailed({ key: streamKey, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, week, streamKey])

  const streamError =
    streamFailed !== null && streamFailed.key === streamKey ? streamFailed.message : null
  const streamNote =
    streamError !== null
      ? null
      : streamed === null
        ? 'Calculating…'
        : streamed.key !== streamKey
          ? 'Refreshing…'
          : null
  const chooseStream: Choose = (k, i) => setStreamChoice((c) => ({ ...c, [k]: i }))
  const switchMode = (m: WaiverMode): void => {
    setMode(m)
    if (m === 'stream') setStreamOn(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Waivers</h1>
          <p className="text-sm text-muted-foreground">
            Free agents worth a roster spot — for the rest of the season or for one week — and what
            to release for them.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground">
          <div className="flex rounded-md border p-0.5">
            {WAIVER_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={mode === m.key}
                onClick={() => switchMode(m.key)}
                className={cn(
                  'h-7 rounded px-3 text-sm',
                  mode === m.key
                    ? 'bg-primary/20 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {priority && <span>{priority}</span>}
          {adds && <span>{windowLabel(adds)}</span>}
        </div>
      </div>

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {!adds && !notice && <p className="text-sm text-muted-foreground">Calculating…</p>}

      {mode === 'ros' && refreshing && <p className="text-xs text-muted-foreground">Refreshing…</p>}
      {mode === 'ros' && adds && (
        <>
          <LineupCard adds={adds} choice={choice} onChoose={choose} onOpen={setSelected} />
          <StashCard
            adds={adds}
            sort={sort}
            onSort={setSort}
            choice={choice}
            onChoose={choose}
            onOpen={setSelected}
          />
        </>
      )}

      {mode === 'stream' && adds && week !== null && (
        <StreamCard
          weeks={weeks}
          week={week}
          currentWeek={adds.currentWeek}
          onWeek={setPickedWeek}
          chip={chip}
          onChip={setChip}
          result={streamed}
          note={streamNote}
          error={streamError}
          choice={streamChoice}
          onChoose={chooseStream}
          onOpen={setSelected}
        />
      )}

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
