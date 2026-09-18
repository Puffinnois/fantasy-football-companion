import { useEffect, useState } from 'react'
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
import { errorMessage, fmtPct, fmtPoints, fmtSigned } from '@/lib/format'
import { cellText, columnGroups, type TableRow as PlayerRow } from '@/lib/playersTableView'
import type { PlayerDetail, PlayerValueRow } from '@shared/types'

interface PlayerDetailPanelProps {
  season: number
  /** The clicked table row (week or value); null closes the panel. */
  player: PlayerRow | null
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

/** Spec §6.2 item 1: PPG · STD value (pos rank) · ROS value (rank). */
function HeaderStrip({ row }: { row: PlayerValueRow }): React.JSX.Element {
  const rank = (n: number | null): string => (n === null ? '—' : `${row.position ?? ''}${n}`)
  return (
    <dl className="grid grid-cols-3 gap-3">
      <Stat label="PPG" value={fmtPoints(row.ppg)} sub={`${row.gamesPlayed} G`} />
      <Stat label="Value · season" value={fmtSigned(row.stdValue)} sub={rank(row.stdRank)} />
      <Stat
        label="Value · ROS"
        value={fmtSigned(row.rosValue)}
        sub={
          row.rosPoints === null
            ? 'no projections'
            : `${rank(row.rosRank)} · ${row.rosPoints.toFixed(1)} pts`
        }
      />
    </dl>
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
      {detail && <HeaderStrip row={detail.row} />}
      {player && !player.statsAvailable && (
        <p className="mt-4 text-sm text-muted-foreground">
          Stats unavailable — this player could not be matched to nflverse data.
        </p>
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
    </SlideOver>
  )
}
