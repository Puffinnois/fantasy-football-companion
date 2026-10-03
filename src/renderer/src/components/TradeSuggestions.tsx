import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CONTROLS_CHANGED,
  SELECT_CLASS,
  STANCE_OPTIONS,
  TONE_CLASS,
  acceptanceTags,
  alternativeLine,
  deltaTone,
  focusMarketLine,
  groupByPosition,
  meLine,
  offerLine,
  otherSideLine,
  otherWaysLabel,
  pathLine,
  playerOption,
  queryOf,
  sameQuery,
  stanceHint,
  suggestStatusLine,
  teamCountOptions,
  teamsChip,
  themLine,
  type FocusKind,
  type SuggestControls
} from '@/lib/tradeView'
import type { SuggestRun } from '@/lib/useSuggestRun'
import { cn } from '@/lib/utils'
import { LINEUP_POSITIONS } from '@shared/rules'
import type {
  TradeAlternative,
  TradePool,
  TradeProposal,
  TradeStance,
  TradeSuggestion
} from '@shared/types'

function Tag({ children }: { children: string }): React.JSX.Element {
  return (
    <span className="rounded bg-muted px-1.5 text-xs font-semibold text-muted-foreground">
      {children}
    </span>
  )
}

/** Spec §5.2: one card — my Δ, the team count, 6b's give / get or the path, every other team, the other ways. */
function SuggestionRow({
  suggestion,
  onOpen,
  onOpenProposal
}: {
  suggestion: TradeSuggestion
  onOpen: () => void
  onOpenProposal: (proposal: TradeProposal) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const sides = suggestion.evaluation.sides
  const multi = suggestion.teams > 2
  return (
    <li className="rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {!multi && <span className="font-medium">with {sides[1].name}</span>}
        <span className={cn('font-semibold', TONE_CLASS[deltaTone(sides[0].delta)])}>
          {meLine(suggestion)}
        </span>
        <Tag>{teamsChip(suggestion)}</Tag>
        {!multi && (
          <>
            <span className={TONE_CLASS[deltaTone(sides[1].delta)]}>{themLine(suggestion)}</span>
            {acceptanceTags(suggestion).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </>
        )}
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onOpen}>
          Open in builder
        </Button>
      </div>
      <div className="mt-1 text-muted-foreground">
        {multi ? pathLine(suggestion) : offerLine(suggestion)}
      </div>
      {multi && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {sides.slice(1).map((side, i) => (
            <li key={side.rosterId} className="flex items-center gap-1.5">
              <span className={TONE_CLASS[deltaTone(side.delta)]}>{otherSideLine(side)}</span>
              {acceptanceTags(suggestion, i + 1).map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </li>
          ))}
        </ul>
      )}
      {suggestion.alternatives.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            {`${otherWaysLabel(suggestion.alternatives.length)} ${expanded ? '▾' : '▸'}`}
          </button>
          {expanded && (
            <ul className="mt-1 space-y-1">
              {suggestion.alternatives.map((a) => (
                <li
                  key={alternativeKey(a)}
                  className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                >
                  <span>{alternativeLine(a)}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenProposal(a.proposal)}
                  >
                    Open in builder
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function suggestionKey(s: TradeSuggestion): string {
  return s.evaluation.sides
    .map((side) => `${side.rosterId}:${side.give.map((p) => p.playerId).join('+')}`)
    .join('>')
}

/** An alternative is its proposal; labels can repeat when two players share a name. */
function alternativeKey(a: TradeAlternative): string {
  return a.proposal.moves.map((m) => `${m.playerId}>${m.to}`).join('+')
}

interface TradeSuggestionsProps {
  pool: TradePool
  season: number
  suggest: SuggestRun
  onOpen: (suggestion: TradeSuggestion) => void
  onOpenProposal: (proposal: TradeProposal) => void
}

/** Multi-team spec §5.2: the controls, Find / Stop, the live status line and the streamed list. */
export function TradeSuggestions({
  pool,
  season,
  suggest,
  onOpen,
  onOpenProposal
}: TradeSuggestionsProps): React.JSX.Element {
  const { controls, setControls, run, running, startError } = suggest
  const set = (over: Partial<SuggestControls>): void => setControls({ ...controls, ...over })
  const focusPlayer = pool.me.players.find((p) => p.playerId === controls.focusGive) ?? null
  const changed = run !== null && !sameQuery(run.query, queryOf(controls, season))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Suggestions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Focus</span>
          <select
            aria-label="Focus"
            className={SELECT_CLASS}
            value={controls.focusKind}
            onChange={(e) => set({ focusKind: e.target.value as FocusKind })}
          >
            <option value="none">none</option>
            <option value="give">I give</option>
            <option value="want">I want</option>
          </select>
          {controls.focusKind === 'give' && (
            <select
              aria-label="Focus player"
              className={SELECT_CLASS}
              value={controls.focusGive}
              onChange={(e) => set({ focusGive: e.target.value })}
            >
              <option value="">pick a player</option>
              {groupByPosition(pool.me.players).map(([pos, players]) => (
                <optgroup key={pos} label={pos}>
                  {players.map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {playerOption(p)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {controls.focusKind === 'give' && focusPlayer && (
            <span className="text-xs text-muted-foreground">{focusMarketLine(focusPlayer)}</span>
          )}
          {controls.focusKind === 'want' && (
            <select
              aria-label="Focus position"
              className={SELECT_CLASS}
              value={controls.focusWant}
              onChange={(e) => set({ focusWant: e.target.value })}
            >
              {LINEUP_POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          )}
          <span className="ml-2 text-muted-foreground">Stance</span>
          <select
            aria-label="Stance"
            className={SELECT_CLASS}
            value={controls.stance}
            onChange={(e) => set({ stance: e.target.value as TradeStance })}
          >
            {STANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="ml-2 text-muted-foreground">Up to</span>
          <select
            aria-label="Up to teams"
            className={SELECT_CLASS}
            value={controls.maxTeams}
            onChange={(e) => set({ maxTeams: Number(e.target.value) })}
          >
            {teamCountOptions(pool.teams.length + 1).map((n) => (
              <option key={n} value={n}>
                {n} teams
              </option>
            ))}
          </select>
          <span className="ml-2 text-muted-foreground">Must include</span>
          <select
            aria-label="Must include"
            className={SELECT_CLASS}
            value={controls.mustInclude ?? ''}
            onChange={(e) =>
              set({ mustInclude: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="">any team</option>
            {pool.teams.map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.name}
              </option>
            ))}
          </select>
          {running ? (
            <Button type="button" variant="outline" onClick={() => suggest.stop()}>
              Stop
            </Button>
          ) : (
            <Button type="button" onClick={() => suggest.find()}>
              Find
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{stanceHint(controls.stance)}</p>
        {startError && <p className="text-destructive text-sm">{startError}</p>}
        {run && (
          <p className="text-sm text-muted-foreground" role="status">
            {`${suggestStatusLine(run)}${changed ? ` · ${CONTROLS_CHANGED}` : ''}`}
          </p>
        )}
        {run && run.cards.length > 0 && (
          <ul className="space-y-2">
            {run.cards.map((s) => (
              <SuggestionRow
                key={suggestionKey(s)}
                suggestion={s}
                onOpen={() => onOpen(s)}
                onOpenProposal={onOpenProposal}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
