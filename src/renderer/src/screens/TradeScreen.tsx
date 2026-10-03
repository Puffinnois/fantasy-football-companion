import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { TradeBuilder } from '@/components/TradeBuilder'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import {
  EMPTY_DEAL,
  addTeam,
  dealOf,
  proposalFrom,
  pruneDeal,
  type BuilderDeal
} from '@/lib/tradeBuilder'
import {
  DEADLINE_NOTE,
  STANCE_OPTIONS,
  acceptanceTags,
  deltaTone,
  focusMarketLine,
  groupByPosition,
  meLine,
  noOffersHint,
  offerLine,
  playerOption,
  stanceHint,
  themLine,
  windowLabel
} from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import { proposalOf } from '@shared/deal'
import { LINEUP_POSITIONS } from '@shared/rules'
import type {
  DetailTarget,
  TradeEvaluation,
  TradeFocus,
  TradeOpenSpots,
  TradePlayer,
  TradePool,
  TradeStance,
  TradeSuggestion
} from '@shared/types'

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

const TONE: Record<ReturnType<typeof deltaTone>, string> = {
  green: 'text-emerald-400',
  red: 'text-red-400',
  muted: 'text-muted-foreground'
}

type FocusKind = 'none' | 'give' | 'want'

/** Spec 6b §5.2: one offer — who with, both deltas, why they'd take it, the players, the way into the builder. */
function SuggestionRow({
  suggestion,
  onOpen
}: {
  suggestion: TradeSuggestion
  onOpen: () => void
}): React.JSX.Element {
  const [me, them] = suggestion.evaluation.sides
  return (
    <li className="rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">with {them.name}</span>
        <span className={cn('font-semibold', TONE[deltaTone(me.delta)])}>{meLine(suggestion)}</span>
        <span className={TONE[deltaTone(them.delta)]}>{themLine(suggestion)}</span>
        {acceptanceTags(suggestion).map((tag) => (
          <span
            key={tag}
            className="rounded bg-muted px-1.5 text-xs font-semibold text-muted-foreground"
          >
            {tag}
          </span>
        ))}
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onOpen}>
          Open in builder
        </Button>
      </div>
      <div className="mt-1 text-muted-foreground">{offerLine(suggestion)}</div>
    </li>
  )
}

function suggestionKey(s: TradeSuggestion): string {
  const ids = (list: TradePlayer[]): string => list.map((p) => p.playerId).join('+')
  const [me, them] = s.evaluation.sides
  return `${them.rosterId}:${ids(me.give)}:${ids(me.get)}`
}

interface TradeScreenProps {
  dataVersion: number
}

export function TradeScreen({ dataVersion }: TradeScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; pool: TradePool } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [deal, setDeal] = useState<BuilderDeal>(EMPTY_DEAL)
  const [verdict, setVerdict] = useState<TradeEvaluation | null>(null)
  const [openSpots, setOpenSpots] = useState<{
    ev: TradeEvaluation
    spots: TradeOpenSpots
  } | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DetailTarget | null>(null)
  // Spec 6b §5.2: the suggestions section
  const [focusKind, setFocusKind] = useState<FocusKind>('none')
  const [focusGive, setFocusGive] = useState('')
  const [focusWant, setFocusWant] = useState('RB')
  const [stance, setStance] = useState<TradeStance>('fair')
  const [suggestWith, setSuggestWith] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<TradeSuggestion[] | null>(null)
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState<string | null>(null)
  const builderRef = useRef<HTMLDivElement>(null)

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
    void api.trade
      .pool(season)
      .then((pool) => {
        if (cancelled) return
        setLoaded({ key, pool })
        // Multi-team spec §5.1: keep the teams and players that still exist after a sync; a deal
        // with no other team starts with the first one, as 6b's partner did.
        setDeal((d) => {
          const kept = pruneDeal(d, pool)
          const first = pool.teams[0]
          return kept.teams.length > 0 || !first ? kept : addTeam(kept, first.rosterId)
        })
        setVerdict(null)
        setFocusGive((id) => (pool.me.players.some((p) => p.playerId === id) ? id : ''))
        // Default to one partner: a league-wide scan costs seconds (spec 6b §6).
        setSuggestWith((t) =>
          pool.teams.some((x) => x.rosterId === t) ? t : (pool.teams[0]?.rosterId ?? null)
        )
        setSuggestions(null)
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, key])

  // Slice 6c spec §7: the open-spot line follows the verdict; the verdict never waits for it.
  useEffect(() => {
    if (!verdict) return
    let cancelled = false
    void api.trade
      .openSpot(verdict.season, proposalOf(verdict))
      .then((spots) => {
        if (!cancelled) setOpenSpots({ ev: verdict, spots })
      })
      // An info line: when it fails the verdict simply shows none.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [verdict])
  const spots = openSpots !== null && openSpots.ev === verdict ? openSpots.spots : null

  const pool = loaded?.key === key ? loaded.pool : null
  const notice = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const focusPlayer = pool?.me.players.find((p) => p.playerId === focusGive) ?? null

  const changeDeal = (d: BuilderDeal): void => {
    setDeal(d)
    setVerdict(null)
    setEvalError(null)
  }

  async function evaluate(): Promise<void> {
    if (season === null || !pool) return
    setEvaluating(true)
    setEvalError(null)
    try {
      setVerdict(await api.trade.evaluate(season, proposalFrom(deal, pool.me.rosterId)))
    } catch (err) {
      setEvalError(errorMessage(err))
    } finally {
      setEvaluating(false)
    }
  }

  const focus: TradeFocus =
    focusKind === 'give' && focusGive !== ''
      ? { give: focusGive }
      : focusKind === 'want'
        ? { want: focusWant }
        : null

  async function find(partnerRosterId: number | null): Promise<void> {
    if (season === null) return
    setFinding(true)
    setFindError(null)
    try {
      setSuggestions(
        await api.trade.suggest({
          season,
          focus,
          stance,
          maxTeams: 2,
          mustInclude: partnerRosterId
        })
      )
    } catch (err) {
      setFindError(errorMessage(err))
    } finally {
      setFinding(false)
    }
  }

  /** Spec 6b §5.2: the builder shows the suggestion's own evaluation — no second trade:evaluate call. */
  const openInBuilder = (s: TradeSuggestion): void => {
    setDeal(dealOf(s.evaluation))
    setVerdict(s.evaluation)
    setEvalError(null)
    builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trade</h1>
          <p className="text-sm text-muted-foreground">
            Every team&apos;s rest-of-season strength before and after, on Sleeper projections under
            your scoring.
          </p>
        </div>
        {pool && <span className="text-sm text-muted-foreground">{windowLabel(pool)}</span>}
      </div>

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {!pool && !notice && <p className="text-sm text-muted-foreground">Loading…</p>}

      {pool && (
        <>
          {pool.tradeDeadlinePassed && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              {DEADLINE_NOTE}
            </p>
          )}
          <div ref={builderRef}>
            <TradeBuilder
              pool={pool}
              deal={deal}
              onDealChange={changeDeal}
              verdict={verdict}
              spots={spots}
              evaluating={evaluating}
              evalError={evalError}
              onEvaluate={() => void evaluate()}
              onOpenPlayer={setSelected}
              finding={finding}
              onSuggestWith={(rosterId) => {
                setSuggestWith(rosterId)
                void find(rosterId)
              }}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suggestions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Focus</span>
                <select
                  aria-label="Focus"
                  className={selectClass}
                  value={focusKind}
                  onChange={(e) => setFocusKind(e.target.value as FocusKind)}
                >
                  <option value="none">none</option>
                  <option value="give">I give</option>
                  <option value="want">I want</option>
                </select>
                {focusKind === 'give' && (
                  <select
                    aria-label="Focus player"
                    className={selectClass}
                    value={focusGive}
                    onChange={(e) => setFocusGive(e.target.value)}
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
                {focusKind === 'give' && focusPlayer && (
                  <span className="text-xs text-muted-foreground">
                    {focusMarketLine(focusPlayer)}
                  </span>
                )}
                {focusKind === 'want' && (
                  <select
                    aria-label="Focus position"
                    className={selectClass}
                    value={focusWant}
                    onChange={(e) => setFocusWant(e.target.value)}
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
                  className={selectClass}
                  value={stance}
                  onChange={(e) => setStance(e.target.value as TradeStance)}
                >
                  {STANCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="ml-2 text-muted-foreground">with</span>
                <select
                  aria-label="Suggest with"
                  className={selectClass}
                  value={suggestWith ?? ''}
                  onChange={(e) =>
                    setSuggestWith(e.target.value === '' ? null : Number(e.target.value))
                  }
                >
                  {pool.teams.map((t) => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.name}
                    </option>
                  ))}
                  <option value="">every team (slower)</option>
                </select>
                <Button type="button" disabled={finding} onClick={() => void find(suggestWith)}>
                  Find
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{stanceHint(stance)}</p>
              {finding && <p className="text-sm text-muted-foreground">Searching offers…</p>}
              {findError && <p className="text-destructive text-sm">{findError}</p>}
              {suggestions &&
                !finding &&
                (suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{noOffersHint(stance)}</p>
                ) : (
                  <ul className="space-y-2">
                    {suggestions.map((s) => (
                      <SuggestionRow
                        key={suggestionKey(s)}
                        suggestion={s}
                        onOpen={() => openInBuilder(s)}
                      />
                    ))}
                  </ul>
                ))}
            </CardContent>
          </Card>
        </>
      )}

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
