import { Check, Search, X } from 'lucide-react'
import { InjuryTag, MeChip, PosChip, ToneChip } from '@/components/edition'
import { fmtSigned } from '@/lib/format'
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
  fmtMarket,
  groupByPosition,
  marketFairSide,
  marketRatio,
  playerOption,
  playerStats,
  spotFor,
  swapText,
  verdictBadges
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

const pillSelect =
  'h-[26px] cursor-pointer self-start rounded-full border border-line bg-panel px-2 text-[12.5px] font-medium text-fg outline-none'
const toneText = (n: number): string => (n > 0 ? 'text-good' : n < 0 ? 'text-bad' : 'text-fg-2')
const BADGE_TIP: Record<string, string> = {
  'Everyone gains': 'Every team in the deal is stronger over the rest of the season',
  'Market-fair': 'Every team gets at least 90 % of the market value it gives'
}

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
    <div className="grid grid-cols-[34px_minmax(0,1fr)_24px] items-start gap-x-2.5 border-b border-line py-[11px]">
      <PosChip position={player.position} size="sm" />
      <div className="flex min-w-0 flex-col gap-[5px]">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpen(player)}
            className="cursor-pointer truncate text-left text-[14.5px] leading-[1.1] font-semibold tracking-[-0.01em] hover:underline"
          >
            {player.fullName}
          </button>
          <span className="shrink-0 text-[12px] leading-none text-fg-3">{player.team ?? ''}</span>
          <InjuryTag status={player.injuryStatus} />
          {player.reserve && (
            <span className="shrink-0 rounded-[2px] px-1 py-0.5 font-cond text-[11px] leading-none font-extrabold text-fg-2 uppercase shadow-[inset_0_0_0_1px_var(--line)]">
              {player.reserve}
            </span>
          )}
        </div>
        <span className="font-mono text-[11.5px] leading-[1.2] text-fg-3">
          {playerStats(player, weeks)}
        </span>
        {destination}
      </div>
      <button
        type="button"
        aria-label={`Remove ${player.fullName}`}
        title="Remove from the deal"
        onClick={onRemove}
        className="flex size-6 cursor-pointer items-center justify-center rounded-full text-fg-3 hover:bg-hover hover:text-bad"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/** One team's column: what it sends and where to, a picker, what it gets. */
function TeamColumn({
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
  const isMe = rosterId === me
  const team = isMe ? pool.me : pool.teams.find((t) => t.rosterId === rosterId)
  const roster = team?.players ?? []
  const name = isMe ? pool.me.name : teamLabel(pool, rosterId)
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
        className={cn(pillSelect, 'mt-0.5')}
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
    <div className="flex min-w-[250px] flex-[1_1_0] flex-col">
      <div className="flex shrink-0 items-end justify-between gap-2.5 border-b-2 border-ink pb-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-[7px]">
            <span className="ed-section">{isMe ? 'You send' : 'They send'}</span>
            {isMe && <MeChip className="px-[5px] py-0.5 text-[11px]">YOU</MeChip>}
          </div>
          <span className="truncate text-[12.5px] leading-[1.1] font-medium text-fg-3">{name}</span>
        </div>
        {!isMe && (
          <button
            type="button"
            aria-label={`Remove team ${name}`}
            title="Take this team out of the deal"
            onClick={() => onChange(removeTeam(deal, rosterId))}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-fg-3 hover:border-ink hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
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
      {rows.length === 0 && (
        <div className="pt-4 pb-1 text-[13px] leading-[1.35] text-fg-3">
          Nobody in the deal yet.
        </div>
      )}
      <select
        aria-label={isMe ? 'Add to You send' : `Add to ${name} sends`}
        value=""
        onChange={(e) => {
          if (e.target.value) onChange(addPick(deal, e.target.value, rosterId))
        }}
        className="mt-3 h-[34px] cursor-pointer rounded-full border-[1.5px] border-dashed border-line bg-transparent px-3.5 font-cond text-[14px] leading-none font-bold tracking-[0.06em] text-fg-2 uppercase outline-none hover:border-ink"
      >
        <option value="">{isMe ? '+ Add one of your players' : `+ Add from ${name}`}</option>
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
      <div className="mt-3.5 flex gap-1.5 text-[12.5px] leading-[1.4] text-fg-2">
        <span className="shrink-0 font-cond text-[12.5px] leading-[1.4] font-extrabold tracking-[0.1em] text-fg-3 uppercase">
          Gets
        </span>
        <span>{getsLine(deal, rosterId, pool)}</span>
      </div>
    </div>
  )
}

function MarketBars({ side }: { side: TradeSideResult }): React.JSX.Element {
  const mx = Math.max(side.marketGive, side.marketGet, 1)
  const bar = (label: string, v: number, color: string): React.JSX.Element => (
    <div className="grid h-4 grid-cols-[40px_minmax(0,1fr)_52px] items-center gap-2.5">
      <span className="font-cond text-[12px] leading-none font-bold tracking-[0.1em] text-fg-3 uppercase">
        {label}
      </span>
      <div className="relative h-2 rounded-[2px] bg-panel-2">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-[2px]', color)}
          style={{ width: `${Math.max(1.5, (v / mx) * 100)}%` }}
        />
      </div>
      <span className="text-right font-mono text-[12px] leading-none font-medium text-fg-2">
        {fmtMarket(v)}
      </span>
    </div>
  )
  return (
    <div className="flex flex-col gap-[5px]">
      {bar('Gives', side.marketGive, 'bg-fg-3')}
      {bar('Gets', side.marketGet, marketFairSide(side) ? 'bg-good' : 'bg-bad')}
    </div>
  )
}

function SideVerdict({
  side,
  spot,
  gets
}: {
  side: TradeSideResult
  spot: OpenSpot | null
  /** "Gets X from Y", only with 3+ teams. */
  gets: string | null
}): React.JSX.Element {
  const unvalued = side.unvaluedGive + side.unvaluedGet
  return (
    <div
      role="group"
      aria-label={side.isMe ? 'Verdict for me' : `Verdict for ${side.name}`}
      className="flex flex-col gap-2 border-b border-line pt-4 pb-[18px]"
    >
      <div className="flex min-w-0 items-center gap-[7px]">
        <span className="truncate font-cond text-[17px] leading-none font-extrabold tracking-[0.06em] uppercase">
          {side.name}
        </span>
        {side.isMe && <MeChip className="px-[5px] py-0.5 text-[11px]">YOU</MeChip>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'font-cond text-[48px] leading-[0.82] font-extrabold',
              toneText(side.delta)
            )}
          >
            {fmtSigned(side.deltaPerWeek)}
          </span>
          <span className="font-cond text-[14px] leading-none font-bold tracking-[0.1em] text-fg-3 uppercase">
            / week
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-cond text-[18px] leading-none font-extrabold">
            {fmtSigned(side.delta, 1)}
          </span>
          <span className="text-[11.5px] leading-none text-fg-3">season total</span>
        </div>
      </div>
      <div className="flex flex-col gap-[3px] text-[12.5px] leading-[1.35] text-fg-2">
        <span className="font-mono text-[12px]">
          ROS {side.before.toFixed(1)} → {side.after.toFixed(1)}
        </span>
        <span>
          This week {fmtSigned(side.thisWeekDelta, 1)} ·{' '}
          {side.weeksChanged === 1 ? '1 week changes' : `${side.weeksChanged} weeks change`}
        </span>
        {gets && <span>{gets}</span>}
        {side.drops.length > 0 && (
          <span className="font-medium text-warn">
            Has to drop {side.drops.map((p) => p.fullName).join(', ')}
          </span>
        )}
        {spot && (
          <span className="text-brand-fg">
            {spot.add
              ? `Open spot after the deal: best add ${spot.add.fullName}, ${fmtSigned(spot.deltaPerWeek)}/wk`
              : 'Open spot after the deal: no free agent helps'}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-col gap-1.5">
        <div className="flex justify-between font-cond text-[12.5px] leading-none font-extrabold tracking-[0.12em] uppercase">
          <span className="text-fg-2">Market value</span>
          <span>{marketRatio(side)}</span>
        </div>
        <MarketBars side={side} />
        {unvalued > 0 && (
          <span className="text-[11.5px] leading-none text-fg-3">
            {unvalued} player{unvalued === 1 ? '' : 's'} without a market value
          </span>
        )}
      </div>
    </div>
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
  /** "Find deals with {team}", offered for a 2-team deal. */
  onSuggestWith: (rosterId: number) => void
}

/** The Build tab: toolbar, one column per team, and the verdict aside. */
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
  const canEval = problem === null && !evaluating
  const teamCount = deal.teams.length + 1
  const sides = verdict ? sidesInOrder(verdict, deal, me) : []
  const multi = verdict !== null && verdict.sides.length > 2
  const source = (rosterId: number): string => {
    const s = verdict?.sides.find((x) => x.rosterId === rosterId)
    return !s ? `team ${rosterId}` : s.isMe ? 'me' : s.name
  }
  const mine = verdict?.sides.find((s) => s.isMe) ?? null
  return (
    <div className="flex min-h-0 flex-1 pl-8">
      <div className="flex min-w-0 flex-1 flex-col pr-7">
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line">
          {addable.length > 0 && (
            <select
              aria-label="Add team"
              value=""
              onChange={(e) => {
                if (e.target.value) onDealChange(addTeam(deal, Number(e.target.value)))
              }}
              className="h-8 cursor-pointer rounded-full border border-line bg-panel px-3 font-cond text-[14px] leading-none font-bold tracking-[0.06em] text-fg uppercase outline-none"
            >
              <option value="">+ Add a team</option>
              {addable.map((t) => (
                <option key={t.rosterId} value={t.rosterId}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {deal.teams.length === 1 && (
            <button
              type="button"
              disabled={finding}
              onClick={() => onSuggestWith(deal.teams[0])}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3.5 font-cond text-[14px] leading-none font-bold tracking-[0.06em] text-fg-2 uppercase hover:border-ink hover:text-fg disabled:cursor-default disabled:opacity-50"
            >
              <Search className="size-3.5" />
              Find deals with {teamLabel(pool, deal.teams[0])}
            </button>
          )}
          <span className="ml-auto text-[12.5px] leading-none text-fg-3">
            {deal.picks.length > 0
              ? `${deal.picks.length} player${deal.picks.length === 1 ? '' : 's'} moving · ${teamCount} teams`
              : `${teamCount} teams in the deal`}
          </span>
          {deal.picks.length > 0 && (
            <button
              type="button"
              onClick={() => onDealChange({ teams: deal.teams, picks: [] })}
              className="h-7 cursor-pointer rounded-full px-2.5 font-cond text-[13px] leading-none font-bold tracking-[0.08em] text-fg-2 uppercase hover:text-fg"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 gap-[22px] overflow-auto pt-4 pb-6">
          {[me, ...deal.teams].map((rosterId) => (
            <TeamColumn
              key={rosterId}
              pool={pool}
              deal={deal}
              rosterId={rosterId}
              onChange={onDealChange}
              onOpen={onOpenPlayer}
            />
          ))}
        </div>
      </div>
      <aside className="w-[400px] shrink-0 overflow-auto border-l border-line pr-8 pb-6 pl-7">
        <div className="sticky top-0 z-[2] flex h-[52px] items-end justify-between border-b-2 border-ink bg-paper pb-[9px]">
          <span className="ed-section">The verdict</span>
          <span className="ed-label text-fg-3">
            Weeks {pool.currentWeek}–{pool.lastWeek}
          </span>
        </div>
        {!verdict && (
          <div className="flex flex-col items-start gap-3 py-7">
            <span className="font-cond text-[30px] leading-[0.95] font-extrabold uppercase">
              {deal.picks.length === 0
                ? 'Build a deal.'
                : problem
                  ? 'Not a trade yet.'
                  : 'Ready when you are.'}
            </span>
            <span className="text-[13.5px] leading-[1.45] text-pretty text-fg-2">
              {hint ??
                "Every team's rest-of-season strength, before and after, on Sleeper projections under your scoring."}
            </span>
            <button
              type="button"
              disabled={!canEval}
              onClick={onEvaluate}
              className={cn(
                'mt-1.5 h-[38px] rounded-full px-5 font-cond text-[16px] leading-none font-extrabold tracking-[0.08em] uppercase',
                canEval
                  ? 'cursor-pointer bg-brand text-on-brand hover:brightness-105'
                  : 'cursor-not-allowed border border-line text-fg-3'
              )}
            >
              {evaluating ? 'Evaluating…' : 'Evaluate the deal'}
            </button>
            {evalError && <span className="text-bad">{evalError}</span>}
          </div>
        )}
        {verdict && (
          <>
            {sides.map((side) => (
              <SideVerdict
                key={side.rosterId}
                side={side}
                spot={spotFor(spots, side.rosterId)}
                gets={
                  multi
                    ? `Gets ${side.get.map((p) => `${p.fullName} from ${source(p.from)}`).join(' · ')}`
                    : null
                }
              />
            ))}
            <div className="flex flex-wrap gap-1.5 py-3.5">
              {verdictBadges(verdict).map((b) => (
                <span
                  key={b.label}
                  title={BADGE_TIP[b.label]}
                  className={cn(
                    'flex h-6 items-center rounded-[3px] font-cond text-[13px] leading-none font-extrabold tracking-[0.08em] uppercase',
                    b.on
                      ? 'gap-[5px] bg-good pr-[9px] pl-[7px] text-on-pos'
                      : 'border border-dashed border-line px-[9px] text-fg-3 line-through'
                  )}
                >
                  {b.on && <Check className="size-3" />}
                  {b.label}
                </span>
              ))}
            </div>
            <div className="flex h-[30px] items-end border-b-2 border-ink pb-[7px] font-cond text-[14px] leading-none font-extrabold tracking-[0.12em] uppercase">
              Your lineup this week
            </div>
            {(mine?.thisWeekSwaps ?? []).length === 0 ? (
              <div className="py-3 text-[13px] leading-[1.35] text-fg-3">Doesn&apos;t change.</div>
            ) : (
              (mine?.thisWeekSwaps ?? []).map((w) => (
                <div
                  key={`${w.slot}:${w.in.playerId}`}
                  className="grid min-h-10 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line py-1.5"
                >
                  <PosChip position={w.slot} size="fill" className="h-[22px] w-10" />
                  <span className="text-[13px] leading-[1.3] font-medium">{swapText(w)}</span>
                  <ToneChip
                    tone={w.delta > 0 ? 'good' : w.delta < 0 ? 'bad' : 'neutral'}
                    className="text-[13px]"
                  >
                    {fmtSigned(w.delta, 1)}
                  </ToneChip>
                </div>
              ))
            )}
          </>
        )}
      </aside>
    </div>
  )
}
