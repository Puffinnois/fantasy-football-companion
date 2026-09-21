import { useEffect, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { BarsVsMarker } from '@/components/BarsVsMarker'
import { NewsSection } from '@/components/NewsSection'
import { PositionBadge } from '@/components/PositionBadge'
import { Section } from '@/components/Section'
import { SlideOver } from '@/components/SlideOver'
import { Sparkline } from '@/components/Sparkline'
import { api } from '@/lib/api'
import { barItems, signalLines, usageRows } from '@/lib/detailView'
import { errorMessage, fmtPct, fmtPoints, fmtSigned } from '@/lib/format'
import { cellText, columnGroups, sosTone, TREND_ARROW } from '@/lib/playersTableView'
import { cn } from '@/lib/utils'
import type {
  DetailTarget,
  PlayerDetail,
  PlayerValueRow,
  ScheduleEntry,
  UsageTrend
} from '@shared/types'

interface PlayerDetailPanelProps {
  season: number
  /** The clicked player (any row that carries id, name, position, team and statsAvailable); null closes the panel. */
  player: DetailTarget | null
  onClose: () => void
}

function Stat({
  label,
  value,
  sub
}: {
  label: string
  value: string
  sub: string
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{sub}</dd>
    </div>
  )
}

/** Spec §6.2 item 1: PPG · STD value (pos rank) · ROS value (rank) · next opponent (rank) · byes remaining. */
function HeaderStrip({
  row,
  schedule
}: {
  row: PlayerValueRow
  schedule: ScheduleEntry[]
}): React.JSX.Element {
  const rank = (n: number | null): string => (n === null ? '—' : `${row.position ?? ''}${n}`)
  const signals = row.signals
  const next = signals?.nextOpponent ?? null
  const nextValue = !signals ? '—' : next ? next.team : schedule.length > 0 ? 'BYE' : '—'
  const nextSub = !signals
    ? ''
    : next
      ? next.rank === null
        ? 'DvP unranked'
        : `DvP rank ${next.rank}`
      : schedule.length > 0
        ? `week ${schedule[0].week}`
        : 'season over'
  return (
    <dl className="grid grid-cols-5 gap-3">
      <Stat label="PPG" value={fmtPoints(row.ppg)} sub={`${row.gamesPlayed} G`} />
      <Stat label="Season VAL" value={fmtSigned(row.stdValue)} sub={rank(row.stdRank)} />
      <Stat
        label="ROS VAL"
        value={fmtSigned(row.rosValue)}
        sub={
          row.rosPoints === null
            ? 'no projections'
            : `${rank(row.rosRank)} · ${fmtPoints(row.rosPoints)} pts`
        }
      />
      <Stat label="Next" value={nextValue} sub={nextSub} />
      <Stat label="Byes" value={signals ? String(signals.byesRemaining) : '—'} sub="remaining" />
    </dl>
  )
}

/** Spec §6.2 item 3: a sparkline over the played games plus season / last-3 numbers and the trend. */
function UsageLine({
  label,
  values,
  trend
}: {
  label: string
  values: (number | null)[]
  trend: UsageTrend | null
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <Sparkline values={values} />
      <span className="tabular-nums">
        {trend
          ? `${fmtPct(trend.season)} season · ${fmtPct(trend.recent)} last 3 ${TREND_ARROW[trend.trend]} ${trend.trend}`
          : '— (needs 2 games)'}
      </span>
    </div>
  )
}

function ScheduleChips({ schedule }: { schedule: ScheduleEntry[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {schedule.map((e) => {
        const tone = sosTone(e.rank)
        return (
          <span
            key={e.week}
            className={cn(
              'rounded border px-1.5 py-0.5 text-xs tabular-nums',
              e.opponent === null && 'text-muted-foreground',
              tone === 'hard' && 'border-destructive/50 text-destructive',
              tone === 'easy' && 'border-pos-rb/50 text-pos-rb'
            )}
            title={
              e.rank === null ? 'defense not ranked yet' : `defense vs position rank ${e.rank}`
            }
          >
            Wk {e.week} {e.opponent ?? 'BYE'}
            {e.rank !== null && ` · ${e.rank}`}
          </span>
        )
      })}
    </div>
  )
}

export function PlayerDetailPanel({
  season,
  player,
  onClose
}: PlayerDetailPanelProps): React.JSX.Element {
  // Keyed by season + player so a stale result never shows for the next selection.
  const [loaded, setLoaded] = useState<{ key: string; detail: PlayerDetail } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const playerId = player?.playerId ?? null
  const key = playerId === null ? null : `${season}|${playerId}`

  useEffect(() => {
    if (playerId === null || key === null) return
    let cancelled = false
    void api.players
      .detail(season, playerId)
      .then((d) => {
        if (!cancelled) setLoaded({ key, detail: d })
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, playerId, key])
  const detail = loaded?.key === key ? loaded.detail : null
  const error = failed?.key === key ? failed.message : null

  const played = detail?.weeks.filter((w) => w.played) ?? []
  const statColumns = columnGroups(player?.position ?? 'ALL', 'stats')
    .slice(1)
    .flatMap((g) => g.columns)
    .filter((c) => c.kind === 'stat')
  const showSnaps = player?.position !== 'DEF'
  const signals = detail?.row.signals ?? null
  const bars = detail ? barItems(detail.weeks) : []
  const usage = usageRows(player?.position ?? null)

  return (
    <SlideOver
      open={player !== null}
      onClose={onClose}
      title={
        player && (
          <span className="flex items-center gap-2">
            <PositionBadge position={player.position} />
            {player.fullName}
            <span className="font-normal text-muted-foreground">{player.team ?? 'FA'}</span>
          </span>
        )
      }
    >
      {error && <p className="text-destructive text-sm">{error}</p>}
      {detail && <HeaderStrip row={detail.row} schedule={detail.schedule} />}
      {player && !player.statsAvailable && (
        <p className="mt-4 text-sm text-muted-foreground">
          Stats unavailable — this player could not be matched to nflverse data.
        </p>
      )}
      {detail && signals && (
        <>
          <Section title="Points vs projection" note="bars = points · tick = projection">
            {bars.length > 0 ? (
              <BarsVsMarker items={bars} />
            ) : (
              <p className="text-sm text-muted-foreground">No games or projections yet.</p>
            )}
            {detail.row.rosPoints === null && (
              <p className="mt-1 text-xs text-muted-foreground">No projections stored</p>
            )}
          </Section>
          {usage.length > 0 && (
            <Section title="Usage">
              <div className="space-y-2">
                {usage.map((u) => (
                  <UsageLine
                    key={u.metric}
                    label={u.label}
                    values={played.map((w) => w[u.metric])}
                    trend={signals.usage[u.metric]}
                  />
                ))}
              </div>
            </Section>
          )}
          <Section title="Signals">
            <ul className="space-y-1 text-sm">
              {signalLines(signals, detail.row.gamesPlayed).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Section>
          <Section title="Upcoming schedule">
            {detail.schedule.length > 0 ? (
              <ScheduleChips schedule={detail.schedule} />
            ) : (
              <p className="text-sm text-muted-foreground">No remaining weeks.</p>
            )}
          </Section>
        </>
      )}
      {detail && player?.statsAvailable && played.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No games yet this season.</p>
      )}
      {played.length > 0 && (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Wk</TableHead>
              <TableHead className="w-14">Opp</TableHead>
              <TableHead className="w-14 text-right">Pts</TableHead>
              {showSnaps && <TableHead className="w-14 text-right">Snap%</TableHead>}
              {statColumns.map((c) => (
                <TableHead key={c.key} className="text-right">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {played.map((w) => (
              <TableRow key={w.week}>
                <TableCell className="tabular-nums">{w.week}</TableCell>
                <TableCell className="text-muted-foreground">{w.opponent ?? '—'}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {fmtPoints(w.points)}
                </TableCell>
                {showSnaps && (
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {fmtPct(w.snapPct)}
                  </TableCell>
                )}
                {statColumns.map((c) => (
                  <TableCell key={c.key} className="text-right tabular-nums">
                    {cellText(w.stats[c.statKey ?? ''] ?? null, c, 'stats')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {player && <NewsSection playerId={player.playerId} position={player.position} />}
    </SlideOver>
  )
}
