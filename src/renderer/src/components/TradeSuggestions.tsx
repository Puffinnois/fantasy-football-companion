import { useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { PosChip } from '@/components/edition'
import { fmtSigned } from '@/lib/format'
import {
  CONTROLS_CHANGED,
  STANCE_OPTIONS,
  focusMarketLine,
  groupByPosition,
  otherWaysLabel,
  playerOption,
  queryOf,
  sameQuery,
  stanceHint,
  suggestStatusLine,
  teamCountOptions,
  teamsChip,
  type FocusKind,
  type SuggestControls
} from '@/lib/tradeView'
import type { SuggestRun } from '@/lib/useSuggestRun'
import { cn } from '@/lib/utils'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { DealMove } from '@shared/deal'
import type {
  DetailTarget,
  TradeAlternative,
  TradePlayer,
  TradePool,
  TradeSuggestion
} from '@shared/types'

const FOCUS: { value: FocusKind; label: string }[] = [
  { value: 'none', label: 'Anything' },
  { value: 'give', label: 'I give' },
  { value: 'want', label: 'I want' }
]
const ACCEPT_TIP = {
  lineup: 'Improves their lineup',
  market: 'They get at least 90 % of the market value they give'
}
const GRID =
  'grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_120px_120px_130px_84px] gap-x-4'
const pill =
  'h-[34px] cursor-pointer rounded-full border border-line bg-panel px-3 text-[13px] text-fg outline-none'
const toneText = (n: number): string => (n > 0 ? 'text-good' : n < 0 ? 'text-bad' : 'text-fg-2')

function Label({ children }: { children: string }): React.JSX.Element {
  return (
    <span className="font-cond text-[12px] leading-none font-extrabold tracking-[0.14em] text-fg-3 uppercase">
      {children}
    </span>
  )
}

/** Pill segmented control (README "Fantasy shared patterns"). */
function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  titles
}: {
  label: string
  options: { value: V; label: string }[]
  value: V
  onChange: (v: V) => void
  titles?: Partial<Record<V, string>>
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-full border border-line p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={titles?.[o.value]}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 cursor-pointer rounded-full px-3 font-cond text-[14px] leading-none font-bold tracking-[0.06em] uppercase',
            o.value === value ? 'bg-ink text-paper' : 'text-fg-2 hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function PlayerLine({
  p,
  strong,
  onOpen
}: {
  p: TradePlayer
  strong?: boolean
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <PosChip position={p.position} size="fill" className="h-5 w-[30px] shrink-0" />
      <button
        type="button"
        onClick={() => onOpen(p)}
        className={cn(
          'cursor-pointer truncate text-left text-[13.5px] leading-[1.1] hover:underline',
          strong ? 'font-semibold' : 'font-medium'
        )}
      >
        {p.fullName}
      </button>
      <span className="shrink-0 text-[11.5px] leading-none text-fg-3">{p.team ?? 'FA'}</span>
    </div>
  )
}

function suggestionKey(s: TradeSuggestion): string {
  return s.evaluation.sides
    .map((side) => `${side.rosterId}:${side.give.map((p) => p.playerId).join('+')}`)
    .join('>')
}

/** An alternative is its moves; labels can repeat when two players share a name. */
function alternativeKey(a: TradeAlternative): string {
  return a.moves.map((m) => `${m.playerId}>${m.to}`).join('+')
}

function SuggestionRow({
  suggestion,
  weeks,
  onOpen,
  onOpenAlternative,
  onOpenPlayer
}: {
  suggestion: TradeSuggestion
  weeks: number
  onOpen: () => void
  onOpenAlternative: (moves: DealMove[]) => void
  onOpenPlayer: (p: DetailTarget) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const sides = suggestion.evaluation.sides
  const mine = sides[0]
  const multi = sides.length > 2
  const tags = (i: number): ('lineup' | 'market')[] => {
    const a = suggestion.acceptance[i] ?? null
    return a === null ? [] : a === 'both' ? ['lineup', 'market'] : [a]
  }
  return (
    <div className="border-b border-line" data-testid="suggestion">
      <div className={cn('grid min-h-[60px] items-center py-2.5', GRID)}>
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <span className="max-w-full truncate text-[14px] leading-[1.15] font-semibold">
            {sides
              .slice(1)
              .map((x) => x.name)
              .join(' + ')}
          </span>
          <span className="rounded-[2px] px-[5px] py-0.5 font-cond text-[11px] leading-none font-extrabold tracking-[0.1em] text-fg-2 uppercase shadow-[inset_0_0_0_1px_var(--line)]">
            {teamsChip(suggestion)}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-[5px]">
          {mine.give.map((p) => (
            <PlayerLine key={p.playerId} p={p} onOpen={onOpenPlayer} />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-[5px]">
          {mine.get.map((p) => (
            <PlayerLine key={p.playerId} p={p} strong onOpen={onOpenPlayer} />
          ))}
          {mine.drops.length > 0 && (
            <span className="text-[12px] leading-[1.2] font-medium text-warn">
              You drop {mine.drops.map((p) => p.fullName).join(', ')}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              'font-cond text-[24px] leading-[0.9] font-extrabold',
              toneText(mine.delta)
            )}
          >
            {fmtSigned(mine.deltaPerWeek)}
          </span>
          <span className="text-[11.5px] leading-none text-fg-3">
            {fmtSigned(mine.delta, 1)} over {weeks} wks
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {sides.slice(1).map((x) => (
            <div key={x.rosterId} className="flex items-baseline gap-1.5">
              {multi && <span className="text-[11.5px] leading-none text-fg-3">{x.name}</span>}
              <span
                className={cn(
                  'font-cond text-[19px] leading-none font-extrabold',
                  toneText(x.delta)
                )}
              >
                {fmtSigned(x.deltaPerWeek)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {sides.slice(1).flatMap((x, j) =>
            tags(j + 1).map((t) => (
              <span
                key={`${x.rosterId}:${t}`}
                title={ACCEPT_TIP[t]}
                className="rounded-[2px] bg-good-s px-1.5 py-[3px] font-cond text-[12px] leading-none font-extrabold tracking-[0.1em] text-good uppercase"
              >
                {t}
              </span>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="flex h-[30px] cursor-pointer items-center gap-1 justify-self-end rounded-full border border-line px-3 font-cond text-[14px] leading-none font-bold tracking-[0.08em] text-fg uppercase hover:border-ink"
        >
          Open
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      {suggestion.alternatives.length > 0 && (
        <div className="pb-2.5">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
            className="cursor-pointer font-cond text-[12.5px] leading-none font-bold tracking-[0.1em] text-fg-3 uppercase hover:text-fg"
          >
            {`${otherWaysLabel(suggestion.alternatives.length)} ${expanded ? '▾' : '▸'}`}
          </button>
          {expanded && (
            <div className="mt-2 flex flex-col gap-0.5 border-l-2 border-line pl-3">
              {suggestion.alternatives.map((a) => (
                <div
                  key={alternativeKey(a)}
                  className="flex h-[30px] items-center gap-3 text-[12.5px] leading-none text-fg-2"
                >
                  <span className="text-fg">{a.label}</span>
                  <span className="text-fg-3">worst side {fmtSigned(a.worstDeltaPerWeek)}/wk</span>
                  <button
                    type="button"
                    onClick={() => onOpenAlternative(a.moves)}
                    className="h-6 cursor-pointer rounded-full border border-line px-2.5 font-cond text-[12.5px] leading-none font-bold tracking-[0.08em] text-fg-2 uppercase hover:border-ink hover:text-fg"
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface TradeSuggestionsProps {
  pool: TradePool
  season: number
  suggest: SuggestRun
  onOpen: (suggestion: TradeSuggestion) => void
  onOpenAlternative: (moves: DealMove[]) => void
  onOpenPlayer: (p: DetailTarget) => void
}

/** The Find deals tab: controls, Find / Stop, the live status row and the streamed table. */
export function TradeSuggestions({
  pool,
  season,
  suggest,
  onOpen,
  onOpenAlternative,
  onOpenPlayer
}: TradeSuggestionsProps): React.JSX.Element {
  const { controls, setControls, run, running, startError } = suggest
  const set = (over: Partial<SuggestControls>): void => setControls({ ...controls, ...over })
  const focusPlayer = pool.me.players.find((p) => p.playerId === controls.focusGive) ?? null
  const changed = run !== null && !sameQuery(run.query, queryOf(controls, season))
  const status = run
    ? suggestStatusLine(run)
    : startError
      ? `Search failed: ${startError}`
      : 'Pick a focus and stance, then find deals.'
  const p = run?.progress
  const pct = p && p.total ? Math.min(100, (p.checked / p.total) * 100) : running ? 4 : 100
  const stance = STANCE_OPTIONS.find((s) => s.value === controls.stance)
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-end gap-x-[26px] gap-y-3.5 px-8 pt-3.5 pb-3">
        <div className="flex flex-col gap-[7px]">
          <Label>Focus</Label>
          <div className="flex items-center gap-2">
            <Segmented
              label="Focus"
              options={FOCUS}
              value={controls.focusKind}
              onChange={(v) => set({ focusKind: v })}
            />
            {controls.focusKind === 'give' && (
              <select
                aria-label="Focus player"
                value={controls.focusGive}
                onChange={(e) => set({ focusGive: e.target.value })}
                className={cn(pill, 'w-[250px]')}
              >
                <option value="">Pick one of your players</option>
                {groupByPosition(pool.me.players).map(([pos, players]) => (
                  <optgroup key={pos} label={pos}>
                    {players.map((pl) => (
                      <option key={pl.playerId} value={pl.playerId}>
                        {playerOption(pl)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
            {controls.focusKind === 'give' && focusPlayer && (
              <span className="font-mono text-[11.5px] text-fg-3">
                {focusMarketLine(focusPlayer)}
              </span>
            )}
            {controls.focusKind === 'want' && (
              <div role="radiogroup" aria-label="Focus position" className="flex gap-[3px]">
                {LINEUP_POSITIONS.map((pos) => {
                  const on = controls.focusWant === pos
                  return (
                    <button
                      key={pos}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={pos}
                      onClick={() => set({ focusWant: pos })}
                      className={cn(
                        'flex h-8 cursor-pointer items-center rounded-[4px] font-cond text-[14px] leading-none font-bold tracking-[0.06em]',
                        on ? 'bg-ink px-[3px]' : 'gap-1.5 px-[9px] text-fg-2 hover:bg-hover'
                      )}
                    >
                      {on ? (
                        <PosChip position={pos} size="fill" className="h-6 w-9" />
                      ) : (
                        <>
                          <PosChip position={pos} label="" size="fill" className="size-2" />
                          {pos}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label>Stance</Label>
          <Segmented
            label="Stance"
            options={STANCE_OPTIONS}
            value={controls.stance}
            onChange={(v) => set({ stance: v })}
            titles={{
              premium: stanceHint('premium'),
              fair: stanceHint('fair'),
              overpay: stanceHint('overpay')
            }}
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label>Deal size</Label>
          <select
            aria-label="Up to teams"
            value={controls.maxTeams}
            onChange={(e) => set({ maxTeams: Number(e.target.value) })}
            className={pill}
          >
            {teamCountOptions(pool.teams.length + 1).map((n) => (
              <option key={n} value={n}>
                Up to {n} teams
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label>Must include</Label>
          <select
            aria-label="Must include"
            value={controls.mustInclude ?? ''}
            onChange={(e) =>
              set({ mustInclude: e.target.value === '' ? null : Number(e.target.value) })
            }
            className={cn(pill, 'w-[190px]')}
          >
            <option value="">Any team</option>
            {pool.teams.map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          {running ? (
            <button
              type="button"
              onClick={() => suggest.stop()}
              className="h-[38px] cursor-pointer rounded-full border-[1.5px] border-ink px-5 font-cond text-[16px] leading-none font-extrabold tracking-[0.08em] text-fg uppercase"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => suggest.find()}
              className="flex h-[38px] cursor-pointer items-center gap-[7px] rounded-full bg-brand px-5 font-cond text-[16px] leading-none font-extrabold tracking-[0.08em] text-on-brand uppercase hover:brightness-105"
            >
              <Search className="size-4" />
              Find deals
            </button>
          )}
        </div>
      </div>
      <div className="flex h-[30px] shrink-0 items-center gap-3 px-8 text-[12.5px] leading-[1.2] text-fg-2">
        {run && (
          <div className="h-1 w-[120px] shrink-0 overflow-hidden rounded-[2px] bg-line">
            <div
              className={cn(
                'h-full transition-[width] duration-300',
                running ? 'bg-brand' : 'bg-fg-3'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <span role="status">{status}</span>
        {run && startError && <span className="font-medium text-bad">{startError}</span>}
        {changed && <span className="font-semibold text-brand-fg">{CONTROLS_CHANGED}</span>}
        <span className="ml-auto text-fg-3">
          {stance ? `${stance.label}: ${stanceHint(controls.stance)}` : ''}
        </span>
      </div>
      <div className="mx-8 min-h-0 flex-1 overflow-auto">
        <div
          className={cn(
            'ed-label sticky top-0 z-[2] grid h-[34px] items-end border-b-2 border-ink bg-paper pb-[7px] text-fg-2',
            GRID
          )}
        >
          <span>Trade with</span>
          <span>You give</span>
          <span>You get</span>
          <span className="text-right">For you / wk</span>
          <span className="text-right">For them / wk</span>
          <span title="Why the other team would accept">Why they&apos;d say yes</span>
          <span />
        </div>
        {run && run.cards.length === 0 && !running && (
          <div className="ed-loading py-14">{status}</div>
        )}
        {(run?.cards ?? []).map((s) => (
          <SuggestionRow
            key={suggestionKey(s)}
            suggestion={s}
            weeks={pool.weeks}
            onOpen={() => onOpen(s)}
            onOpenAlternative={onOpenAlternative}
            onOpenPlayer={onOpenPlayer}
          />
        ))}
      </div>
    </>
  )
}
