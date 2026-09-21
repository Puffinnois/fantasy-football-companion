import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
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
import { errorMessage, fmtPoints, fmtSigned } from '@/lib/format'
import {
  closeCallTitle,
  flagBadge,
  isNewStarter,
  leftOnBench,
  matchupHeader,
  rowDelta,
  swapLine,
  swapsEmptyText,
  WEEKS
} from '@/lib/lineupView'
import { cn } from '@/lib/utils'
import type { DetailTarget, LineupPlayer, LineupWeek, SlotEntry, TeamLineup } from '@shared/types'

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

const TONE: Record<'red' | 'amber' | 'muted', string> = {
  red: 'bg-red-500/15 text-red-400',
  amber: 'bg-amber-500/15 text-amber-400',
  muted: 'bg-muted text-muted-foreground'
}

function Flag({ player }: { player: LineupPlayer }): React.JSX.Element | null {
  const badge = flagBadge(player.flag)
  if (!badge) return null
  return (
    <span
      className={cn('rounded px-1 text-[10px] font-semibold', TONE[badge.tone])}
      title={player.injuryStatus ?? undefined}
    >
      {badge.text}
    </span>
  )
}

function PlayerCell({
  player,
  onOpen
}: {
  player: LineupPlayer | null
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  if (!player) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <PositionBadge position={player.position} />
      <button type="button" className="hover:underline" onClick={() => onOpen(player)}>
        {player.fullName}
      </button>
      <span className="text-xs text-muted-foreground">
        {player.team ?? 'FA'}
        {player.opponent ? ` vs ${player.opponent}` : ''}
      </span>
      <Flag player={player} />
    </span>
  )
}

function PlayerList({
  title,
  players,
  onOpen
}: {
  title: string
  players: LineupPlayer[]
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {players.map((p) => (
              <li key={p.playerId} className="flex items-center justify-between gap-3">
                <PlayerCell player={p} onOpen={onOpen} />
                <span className="tabular-nums">{fmtPoints(p.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SlotTable({
  team,
  onOpen
}: {
  team: TeamLineup
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const rows = Math.max(team.optimal.length, team.current?.length ?? 0)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Slot</TableHead>
          <TableHead>{team.isMe ? 'Your starter' : 'Their starter'}</TableHead>
          <TableHead className="w-16 text-right">Pts</TableHead>
          <TableHead>Optimal</TableHead>
          <TableHead className="w-16 text-right">Pts</TableHead>
          <TableHead className="w-16 text-right">Δ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }, (_, i) => {
          const optimal: SlotEntry | undefined = team.optimal[i]
          const current: SlotEntry | undefined = team.current?.[i]
          const tinted = optimal ? isNewStarter(optimal, team.current) : false
          const delta = optimal ? rowDelta(optimal, current, team.current) : null
          return (
            <TableRow key={i} className={cn(tinted && 'bg-primary/10')}>
              <TableCell className="text-xs font-semibold text-muted-foreground">
                {optimal?.slot ?? current?.slot}
              </TableCell>
              <TableCell>
                {team.current ? (
                  <PlayerCell player={current?.player ?? null} onOpen={onOpen} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtPoints(current?.player?.value ?? null)}
              </TableCell>
              <TableCell>
                <PlayerCell player={optimal?.player ?? null} onOpen={onOpen} />
                {optimal?.player && optimal.closeCall && (
                  <span
                    className="ml-2 text-xs text-amber-400"
                    title={closeCallTitle(optimal.player, optimal.closeCall)}
                  >
                    ≈ {optimal.closeCall.fullName}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtPoints(optimal?.player?.value ?? null)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  delta !== null && (delta >= 0 ? 'text-emerald-400' : 'text-red-400')
                )}
              >
                {delta === null ? '' : fmtSigned(delta)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function SwapsList({ team }: { team: TeamLineup }): React.JSX.Element {
  if (team.swaps.length === 0) {
    return <p className="text-sm text-muted-foreground">{swapsEmptyText(team)}</p>
  }
  return (
    <ul className="space-y-1 text-sm">
      {team.swaps.map((s) => (
        <li key={`${s.slot}:${s.in.playerId}`}>{swapLine(s)}</li>
      ))}
    </ul>
  )
}

/** Spec §5.1 item 5: the opponent's current-vs-optimal table and swaps, collapsed by default. */
function OpponentCard({
  team,
  onOpen
}: {
  team: TeamLineup
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          {/* A span, not CardTitle: a div may not sit inside a button. */}
          <span className="text-base leading-none font-semibold">Opponent · {team.name}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <SlotTable team={team} onOpen={onOpen} />
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Their swaps
            </div>
            <SwapsList team={team} />
          </div>
        </CardContent>
      )}
    </Card>
  )
}

interface LineupScreenProps {
  dataVersion: number
}

export function LineupScreen({ dataVersion }: LineupScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; data: LineupWeek } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [selected, setSelected] = useState<DetailTarget | null>(null)

  useEffect(() => {
    void api.players
      .options()
      .then((o) => {
        setSeason((s) => s ?? o.seasons[0] ?? null)
        setWeek((w) => w ?? o.currentWeek)
      })
      .catch((err) => setFailed({ key: 'options', message: errorMessage(err) }))
  }, [dataVersion])

  const key = season !== null && week !== null ? `${season}|${week}|${dataVersion}` : null
  useEffect(() => {
    if (season === null || week === null || key === null) return
    let cancelled = false
    void api.lineup
      .week({ season, week })
      .then((data) => {
        if (!cancelled) setLoaded({ key, data })
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, week, key])

  const data = loaded?.key === key ? loaded.data : null
  const error = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const header = data ? matchupHeader(data) : null
  const me = data?.me ?? null
  const benchLeft = me ? leftOnBench(me) : null
  const oppLeft = data?.opponent ? leftOnBench(data.opponent) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Lineup</h1>
          <p className="text-sm text-muted-foreground">
            Optimal lineup on Sleeper projections under your scoring, next to what you set.
          </p>
        </div>
        {/* Not a <label> wrapper: its text content would include every option, so the test's getByLabelText uses the aria-label. */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Week</span>
          <select
            aria-label="Week"
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
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && header && (
        <Card>
          <CardContent className="flex flex-wrap items-baseline gap-x-6 gap-y-2 pt-6 text-sm">
            {header.mine && <span className="text-lg font-semibold">{header.mine}</span>}
            {header.theirs && (
              <>
                <span className="text-muted-foreground">vs</span>
                <span className="text-lg font-semibold">{header.theirs}</span>
              </>
            )}
            {header.result && (
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-bold',
                  header.result === 'W'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : header.result === 'L'
                      ? 'bg-red-500/15 text-red-400'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {header.result}
              </span>
            )}
            {benchLeft !== null && (
              <span className="text-muted-foreground">
                Left on bench: {fmtSigned(benchLeft)}
                {oppLeft !== null ? ` · ${data.opponent?.name}: ${fmtSigned(oppLeft)}` : ''}
              </span>
            )}
            {header.note && <span className="text-muted-foreground">{header.note}</span>}
          </CardContent>
        </Card>
      )}

      {me && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{me.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <SlotTable team={me} onOpen={setSelected} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Swaps</CardTitle>
            </CardHeader>
            <CardContent>
              <SwapsList team={me} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <PlayerList title="Bench" players={me.bench} onOpen={setSelected} />
            <PlayerList title="Unavailable" players={me.unavailable} onOpen={setSelected} />
          </div>
        </>
      )}

      {data?.opponent && <OpponentCard team={data.opponent} onOpen={setSelected} />}

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
