import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { errorMessage, fmtPoints } from '@/lib/format'
import {
  rosLine,
  sortTeams,
  STRENGTH_NOTE,
  teamLabel,
  TEAM_SORTS,
  type TeamSort
} from '@/lib/leagueView'
import { cn } from '@/lib/utils'
import type { League, PointsContext, RosterPlayer, Team, TeamStrength } from '@shared/types'

const SLOT_ORDER = ['starter', 'bench', 'ir', 'taxi'] as const
const SLOT_LABEL: Record<RosterPlayer['slot'], string> = {
  starter: 'Starters',
  bench: 'Bench',
  ir: 'IR',
  taxi: 'Taxi'
}

export function LeagueScreen(): React.JSX.Element {
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [strengths, setStrengths] = useState<TeamStrength[]>([])
  const [sort, setSort] = useState<TeamSort>('record')
  const [selected, setSelected] = useState<number | null>(null)
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ctx, setCtx] = useState<PointsContext | null>(null)

  useEffect(() => {
    void api.league
      .pointsContext()
      .then(setCtx)
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .get()
      .then((l) => {
        setError(null)
        setLeague(l)
      })
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .teams()
      .then((list) => {
        setError(null)
        setTeams(list)
        setSelected((current) => current ?? list[0]?.rosterId ?? null)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  // Strength is keyed on the season the value build runs on (a number; `League.season` is a string).
  const season = ctx?.season ?? null
  useEffect(() => {
    if (season === null) return
    let cancelled = false
    void api.lineup
      .strength(season)
      .then((list) => {
        if (!cancelled) setStrengths(list)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [season])

  useEffect(() => {
    if (selected === null) return
    void api.league
      .roster(selected)
      .then((r) => {
        setError(null)
        setRoster(r)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [selected])

  const selectedTeam = teams.find((t) => t.rosterId === selected) ?? null
  const groups = SLOT_ORDER.map((slot) => ({
    slot,
    players: roster.filter((p) => p.slot === slot)
  })).filter((g) => g.players.length > 0)
  const strengthById = new Map(strengths.map((s) => [s.rosterId, s]))
  const ordered = sortTeams(teams, strengths, sort)

  return (
    <div className="space-y-6">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{league?.name ?? 'League'}</h1>
          <p className="text-sm text-muted-foreground">
            {league ? `${league.season} · ${league.totalRosters} teams` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex rounded-md border p-0.5">
            {TEAM_SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={sort === s.key}
                onClick={() => setSort(s.key)}
                className={cn(
                  'h-7 rounded px-3 text-sm',
                  sort === s.key
                    ? 'bg-primary/20 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          {sort === 'strength' && <p className="text-xs text-muted-foreground">{STRENGTH_NOTE}</p>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {ordered.map((t) => (
            <button
              key={t.rosterId}
              type="button"
              onClick={() => setSelected(t.rosterId)}
              className={cn(
                'rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/40',
                selected === t.rosterId && 'border-primary/60 bg-accent/60'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate font-medium">{teamLabel(t)}</div>
                {t.isMe && <Badge variant="secondary">You</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{t.displayName}</div>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="font-semibold tabular-nums">
                  {t.wins}-{t.losses}
                  {t.ties ? `-${t.ties}` : ''}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  PF {fmtPoints(t.fpts)} · PA {fmtPoints(t.fptsAgainst)}
                </span>
              </div>
              <div
                className="mt-1 text-xs text-muted-foreground tabular-nums"
                title={STRENGTH_NOTE}
              >
                {rosLine(strengthById.get(t.rosterId))}
              </div>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedTeam ? teamLabel(selectedTeam) : 'Select a team'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.map((g) => (
              <div key={g.slot}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {SLOT_LABEL[g.slot]}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Pos</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="w-14">Team</TableHead>
                      <TableHead className="w-12 text-right">Bye</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-16 text-right">Pts</TableHead>
                      <TableHead className="w-16 text-right">
                        {ctx?.lastWeek ? `Wk ${ctx.lastWeek}` : 'Last'}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.players.map((p) => (
                      <TableRow key={p.playerId}>
                        <TableCell>
                          <PositionBadge position={p.position} />
                        </TableCell>
                        <TableCell className="font-medium">{p.fullName}</TableCell>
                        <TableCell className="text-muted-foreground">{p.team ?? 'FA'}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {p.byeWeek ?? '—'}
                        </TableCell>
                        <TableCell className={cn('text-xs', p.injuryStatus && 'text-destructive')}>
                          {p.injuryStatus ?? ''}
                        </TableCell>
                        {p.statsAvailable ? (
                          <>
                            <TableCell className="text-right font-medium tabular-nums">
                              {fmtPoints(p.seasonPoints)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {fmtPoints(p.lastWeekPoints)}
                            </TableCell>
                          </>
                        ) : (
                          <TableCell
                            colSpan={2}
                            className="text-right text-xs text-muted-foreground"
                            title="This player could not be matched to nflverse data"
                          >
                            stats unavailable
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
            {selectedTeam && groups.length === 0 && (
              <p className="text-sm text-muted-foreground">No players on this roster.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
