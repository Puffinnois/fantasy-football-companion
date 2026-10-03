import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PositionBadge } from '@/components/PositionBadge'
import { swapLine } from '@/lib/lineupView'
import {
  addPick,
  addTeam,
  builderProblem,
  destinationOf,
  getsLine,
  removePick,
  removeTeam,
  setDestination,
  sidesInOrder,
  teamLabel,
  type BuilderDeal,
  type BuilderPick
} from '@/lib/tradeBuilder'
import {
  NO_VERDICT_HINT,
  deltaLine,
  deltaTone,
  dropLine,
  groupByPosition,
  marketLine,
  openSpotLine,
  playerOption,
  playerStats,
  rangeLine,
  SELECT_CLASS,
  spotFor,
  TONE_CLASS,
  verdictBadges,
  verdictGetsLine
} from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import type {
  DetailTarget,
  OpenSpot,
  TradeEvaluation,
  TradeOpenSpots,
  TradePlayer,
  TradePool,
  TradeSideResult
} from '@shared/types'

function PlayerRow({
  player,
  weeks,
  destination,
  onOpen,
  onRemove
}: {
  player: TradePlayer
  weeks: number
  /** The "→ team" select, only with 3+ teams. */
  destination: React.ReactNode
  onOpen: (p: DetailTarget) => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-sm">
      <PositionBadge position={player.position} />
      <button type="button" className="font-medium hover:underline" onClick={() => onOpen(player)}>
        {player.fullName}
      </button>
      <span className="text-muted-foreground">{player.team ?? ''}</span>
      {player.reserve && (
        <span className="rounded bg-muted px-1 text-xs font-semibold uppercase text-muted-foreground">
          {player.reserve}
        </span>
      )}
      <span className="ml-auto text-xs text-muted-foreground">{playerStats(player, weeks)}</span>
      {destination}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${player.fullName}`}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  )
}

/** Multi-team spec §5.1: one team's card — what it sends and where to, a picker, what it gets. */
function TeamCard({
  pool,
  deal,
  rosterId,
  onChange,
  onOpen
}: {
  pool: TradePool
  deal: BuilderDeal
  rosterId: number
  onChange: (deal: BuilderDeal) => void
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const me = pool.me.rosterId
  const team = rosterId === me ? pool.me : pool.teams.find((t) => t.rosterId === rosterId)
  const roster = team?.players ?? []
  const title = rosterId === me ? 'I send' : `${teamLabel(pool, rosterId)} sends`
  const picks = deal.picks.filter((p) => p.from === rosterId)
  const rows = picks.flatMap((pick) => {
    const player = roster.find((p) => p.playerId === pick.playerId)
    return player ? [{ pick, player }] : []
  })
  const available = roster.filter((p) => !picks.some((x) => x.playerId === p.playerId))
  const others = [me, ...deal.teams].filter((t) => t !== rosterId)
  const destination = (pick: BuilderPick, player: TradePlayer): React.ReactNode =>
    deal.teams.length < 2 ? null : (
      <select
        aria-label={`Destination of ${player.fullName}`}
        className={SELECT_CLASS}
        value={destinationOf(deal, pick, me) ?? ''}
        onChange={(e) => onChange(setDestination(deal, pick.playerId, Number(e.target.value)))}
      >
        {others.map((t) => (
          <option key={t} value={t}>
            → {teamLabel(pool, t)}
          </option>
        ))}
      </select>
    )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(({ pick, player }) => (
          <PlayerRow
            key={player.playerId}
            player={player}
            weeks={pool.weeks}
            destination={destination(pick, player)}
            onOpen={onOpen}
            onRemove={() => onChange(removePick(deal, player.playerId))}
          />
        ))}
        <select
          aria-label={`Add to ${title}`}
          className={SELECT_CLASS}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(addPick(deal, e.target.value, rosterId))
          }}
        >
          <option value="">+ add player</option>
          {groupByPosition(available).map(([pos, players]) => (
            <optgroup key={pos} label={pos}>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {playerOption(p)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{getsLine(deal, rosterId, pool)}</p>
      </CardContent>
    </Card>
  )
}

function SideVerdict({
  side,
  spot,
  gets
}: {
  side: TradeSideResult
  spot: OpenSpot | null
  /** "gets X from Y", only with 3+ teams. */
  gets: string | null
}): React.JSX.Element {
  const drop = dropLine(side)
  return (
    <div
      role="group"
      aria-label={side.isMe ? 'Verdict for me' : `Verdict for ${side.name}`}
      className="space-y-1 text-sm"
    >
      <div className="font-semibold">{side.isMe ? `Me · ${side.name}` : side.name}</div>
      <div className={cn('text-2xl font-semibold', TONE_CLASS[deltaTone(side.delta)])}>
        {deltaLine(side)}
      </div>
      <div className="text-muted-foreground">{rangeLine(side)}</div>
      {gets && <div className="text-muted-foreground">{gets}</div>}
      {drop && <div className="text-amber-400">{drop}</div>}
      {spot && <div className="text-sky-400">{openSpotLine(spot)}</div>}
      <div className="text-muted-foreground">{marketLine(side)}</div>
    </div>
  )
}

/** Multi-team spec §5.1: one column per team, the badges, this week's swaps on my side. */
function VerdictCard({
  ev,
  sides,
  spots
}: {
  ev: TradeEvaluation
  sides: TradeSideResult[]
  spots: TradeOpenSpots | null
}): React.JSX.Element {
  const multi = ev.sides.length > 2
  const swaps = ev.sides[0].thisWeekSwaps
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Verdict</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sides.map((side) => (
            <SideVerdict
              key={side.rosterId}
              side={side}
              spot={spotFor(spots, side.rosterId)}
              gets={multi ? verdictGetsLine(side, ev) : null}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {verdictBadges(ev).map((b) => (
            <span
              key={b.label}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-bold',
                b.on ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground'
              )}
            >
              {b.label}
            </span>
          ))}
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">This week</div>
          {swaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your lineup this week does not change.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {swaps.map((s) => (
                <li key={`${s.slot}:${s.in.playerId}`}>{swapLine(s)}</li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export interface TradeBuilderProps {
  pool: TradePool
  deal: BuilderDeal
  onDealChange: (deal: BuilderDeal) => void
  verdict: TradeEvaluation | null
  spots: TradeOpenSpots | null
  evaluating: boolean
  evalError: string | null
  onEvaluate: () => void
  onOpenPlayer: (p: DetailTarget) => void
  /** A search is running: the shortcut below waits. */
  finding: boolean
  /** 6b's shortcut into the suggestions, offered for a 2-team deal. */
  onSuggestWith: (rosterId: number) => void
}

/** Multi-team spec §5.1: the teams row, one card per team, Evaluate behind the inline rule, the verdict. */
export function TradeBuilder({
  pool,
  deal,
  onDealChange,
  verdict,
  spots,
  evaluating,
  evalError,
  onEvaluate,
  onOpenPlayer,
  finding,
  onSuggestWith
}: TradeBuilderProps): React.JSX.Element {
  const me = pool.me.rosterId
  const addable = pool.teams.filter((t) => !deal.teams.includes(t.rosterId))
  const problem = builderProblem(deal, pool)
  const hint = deal.picks.length === 0 ? NO_VERDICT_HINT : problem
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Teams in deal</span>
        <span className="rounded-md border px-2 py-1">Me · {pool.me.name}</span>
        {deal.teams.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-0.5">
            {teamLabel(pool, t)}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove team ${teamLabel(pool, t)}`}
              onClick={() => onDealChange(removeTeam(deal, t))}
            >
              <X />
            </Button>
          </span>
        ))}
        {addable.length > 0 && (
          <select
            aria-label="Add team"
            className={SELECT_CLASS}
            value=""
            onChange={(e) => {
              if (e.target.value) onDealChange(addTeam(deal, Number(e.target.value)))
            }}
          >
            <option value="">+ add team</option>
            {addable.map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {deal.teams.length === 1 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={finding}
            onClick={() => onSuggestWith(deal.teams[0])}
          >
            Suggest with this team
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {[me, ...deal.teams].map((rosterId) => (
          <TeamCard
            key={rosterId}
            pool={pool}
            deal={deal}
            rosterId={rosterId}
            onChange={onDealChange}
            onOpen={onOpenPlayer}
          />
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Button type="button" disabled={problem !== null || evaluating} onClick={onEvaluate}>
          Evaluate
        </Button>
        {evaluating && <span className="text-sm text-muted-foreground">Evaluating…</span>}
        {evalError && <span className="text-destructive text-sm">{evalError}</span>}
        {!verdict && !evaluating && !evalError && hint && (
          <span className="text-sm text-muted-foreground">{hint}</span>
        )}
      </div>

      {verdict && (
        <VerdictCard ev={verdict} sides={sidesInOrder(verdict, deal, me)} spots={spots} />
      )}
    </div>
  )
}
