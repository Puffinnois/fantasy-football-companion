import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { api } from '@/lib/api'
import { errorMessage, fmtPct, fmtPoints } from '@/lib/format'
import { formatStat, parseOwner, weekColumns } from '@/lib/playersView'
import { cn } from '@/lib/utils'
import { NFL_TEAMS } from '@shared/teams'
import type { PlayerFilter, PlayerRow, PointsContext, Team, WeekStats } from '@shared/types'

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'
const POSITION_OPTIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export function PlayersScreen(): React.JSX.Element {
  const [ctx, setCtx] = useState<PointsContext | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('')
  const [team, setTeam] = useState('')
  const [owner, setOwner] = useState('all')
  const [rows, setRows] = useState<PlayerRow[]>([])
  const [selected, setSelected] = useState<PlayerRow | null>(null)
  const [weeks, setWeeks] = useState<WeekStats[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.league
      .pointsContext()
      .then(setCtx)
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .teams()
      .then(setTeams)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    const filter: PlayerFilter = {
      query: query.trim() || undefined,
      position: position || undefined,
      team: team || undefined,
      owner: parseOwner(owner)
    }
    const handle = setTimeout(() => {
      void api.players
        .search(filter)
        .then((list) => {
          setError(null)
          setRows(list)
        })
        .catch((err) => setError(errorMessage(err)))
    }, 150)
    return () => clearTimeout(handle)
  }, [query, position, team, owner])

  useEffect(() => {
    if (!selected) return
    void api.players
      .weeklyStats(selected.playerId)
      .then(setWeeks)
      .catch((err) => setError(errorMessage(err)))
  }, [selected])

  const lastLabel = ctx?.lastWeek ? `Wk ${ctx.lastWeek}` : 'Last'
  const columns = weekColumns(selected?.position ?? null)

  return (
    <div className="space-y-6">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div>
        <h1 className="text-2xl font-semibold">Players</h1>
        <p className="text-sm text-muted-foreground">
          {ctx ? `${ctx.season} season · points under this league's rules` : ''}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-56"
            />
            <select
              className={selectClass}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            >
              <option value="">All positions</option>
              {POSITION_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className={selectClass} value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All NFL teams</option>
              {NFL_TEAMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="all">Any owner</option>
              <option value="fa">Free agents</option>
              {teams.map((t) => (
                <option key={t.rosterId} value={String(t.rosterId)}>
                  {t.teamName ?? t.displayName}
                </option>
              ))}
            </select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Pos</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="w-14">Team</TableHead>
                <TableHead className="w-12 text-right">Bye</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="w-16 text-right">Pts</TableHead>
                <TableHead className="w-16 text-right">{lastLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow
                  key={p.playerId}
                  onClick={() => {
                    setSelected(p)
                    setWeeks([])
                  }}
                  className={cn(
                    'cursor-pointer',
                    selected?.playerId === p.playerId && 'bg-accent/60'
                  )}
                >
                  <TableCell>
                    <PositionBadge position={p.position} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.fullName}
                    {p.injuryStatus && (
                      <span className="ml-2 text-xs text-destructive">{p.injuryStatus}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.team ?? 'FA'}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {p.byeWeek ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.ownerName ?? <span className="italic">Free agent</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {p.statsAvailable ? fmtPoints(p.seasonPoints) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {p.statsAvailable ? fmtPoints(p.lastWeekPoints) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No players match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {selected ? (
                <>
                  <PositionBadge position={selected.position} />
                  <span>{selected.fullName}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {selected.team ?? 'FA'}
                  </span>
                  {selected.ownerName ? (
                    <Badge variant="secondary">{selected.ownerName}</Badge>
                  ) : (
                    <Badge variant="outline">Free agent</Badge>
                  )}
                </>
              ) : (
                'Select a player'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selected && !selected.statsAvailable && (
              <p className="text-sm text-muted-foreground">
                Stats unavailable — this player could not be matched to nflverse data.
              </p>
            )}
            {selected && selected.statsAvailable && weeks.length === 0 && (
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
                    {columns.map((col) => (
                      <TableHead key={col.key} className="text-right">
                        {col.label}
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
                      {columns.map((col) => (
                        <TableCell key={col.key} className="text-right tabular-nums">
                          {formatStat(w.stats[col.key], col.format)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
