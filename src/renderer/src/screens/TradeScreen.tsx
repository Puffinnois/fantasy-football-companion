import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { PositionBadge } from '@/components/PositionBadge'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { swapLine } from '@/lib/lineupView'
import {
  DEADLINE_NOTE,
  NO_VERDICT_HINT,
  STANCE_OPTIONS,
  acceptanceTags,
  deltaLine,
  deltaTone,
  dropLine,
  focusMarketLine,
  groupByPosition,
  marketLine,
  meLine,
  noOffersHint,
  offerLine,
  playerOption,
  playerStats,
  rangeLine,
  stanceHint,
  themLine,
  verdictBadges,
  windowLabel
} from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import { LINEUP_POSITIONS } from '@shared/rules'
import type {
  DetailTarget,
  TradeEvaluation,
  TradeFocus,
  TradePlayer,
  TradePool,
  TradeSideResult,
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

function PlayerRow({
  player,
  weeks,
  onOpen,
  onRemove
}: {
  player: TradePlayer
  weeks: number
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

/** Spec §5.1: one side of the builder — the chosen rows and a position-grouped picker. */
function SideEditor({
  title,
  roster,
  chosen,
  weeks,
  onChange,
  onOpen
}: {
  title: string
  roster: TradePlayer[]
  chosen: string[]
  weeks: number
  onChange: (ids: string[]) => void
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const rows = chosen.flatMap((id) => {
    const p = roster.find((r) => r.playerId === id)
    return p ? [p] : []
  })
  const available = roster.filter((p) => !chosen.includes(p.playerId))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((p) => (
          <PlayerRow
            key={p.playerId}
            player={p}
            weeks={weeks}
            onOpen={onOpen}
            onRemove={() => onChange(chosen.filter((id) => id !== p.playerId))}
          />
        ))}
        <select
          aria-label={`Add to ${title}`}
          className={selectClass}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...chosen, e.target.value])
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
      </CardContent>
    </Card>
  )
}

function SideVerdict({ side }: { side: TradeSideResult }): React.JSX.Element {
  const drop = dropLine(side)
  return (
    <div className="space-y-1 text-sm">
      <div className="font-semibold">{side.isMe ? `Me · ${side.name}` : `Them · ${side.name}`}</div>
      <div className={cn('text-2xl font-semibold', TONE[deltaTone(side.delta)])}>
        {deltaLine(side)}
      </div>
      <div className="text-muted-foreground">{rangeLine(side)}</div>
      {drop && <div className="text-amber-400">{drop}</div>}
      <div className="text-muted-foreground">{marketLine(side)}</div>
    </div>
  )
}

/** Spec §5.1: the verdict card — both sides, the badges, this week's swaps on my side. */
function VerdictCard({ ev }: { ev: TradeEvaluation }): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Verdict</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-2">
          <SideVerdict side={ev.me} />
          <SideVerdict side={ev.them} />
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
          {ev.me.thisWeekSwaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your lineup this week does not change.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {ev.me.thisWeekSwaps.map((s) => (
                <li key={`${s.slot}:${s.in.playerId}`}>{swapLine(s)}</li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Spec §5.2: one offer — who with, both deltas, why they'd take it, the players, the way into the builder. */
function SuggestionRow({
  suggestion,
  onOpen
}: {
  suggestion: TradeSuggestion
  onOpen: () => void
}): React.JSX.Element {
  const { me, them } = suggestion.evaluation
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
  return `${s.evaluation.them.rosterId}:${ids(s.evaluation.me.give)}:${ids(s.evaluation.me.get)}`
}

interface TradeScreenProps {
  dataVersion: number
}

export function TradeScreen({ dataVersion }: TradeScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; pool: TradePool } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [partner, setPartner] = useState<number | null>(null)
  const [give, setGive] = useState<string[]>([])
  const [get, setGet] = useState<string[]>([])
  const [verdict, setVerdict] = useState<TradeEvaluation | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DetailTarget | null>(null)
  // Spec §5.2: the suggestions section
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
        // Keep a partner / players that still exist after a sync; default the partner to the first team.
        setPartner((p) =>
          pool.teams.some((t) => t.rosterId === p) ? p : (pool.teams[0]?.rosterId ?? null)
        )
        setGive((ids) => ids.filter((id) => pool.me.players.some((p) => p.playerId === id)))
        setGet((ids) =>
          ids.filter((id) => pool.teams.some((t) => t.players.some((p) => p.playerId === id)))
        )
        setVerdict(null)
        setFocusGive((id) => (pool.me.players.some((p) => p.playerId === id) ? id : ''))
        // Default to one partner: a league-wide scan costs seconds (spec §6).
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

  const pool = loaded?.key === key ? loaded.pool : null
  const notice = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const partnerTeam = pool?.teams.find((t) => t.rosterId === partner) ?? null
  const focusPlayer = pool?.me.players.find((p) => p.playerId === focusGive) ?? null

  const choosePartner = (rosterId: number): void => {
    setPartner(rosterId)
    setGet([])
    setVerdict(null)
    setEvalError(null)
  }
  const changeGive = (ids: string[]): void => {
    setGive(ids)
    setVerdict(null)
    setEvalError(null)
  }
  const changeGet = (ids: string[]): void => {
    setGet(ids)
    setVerdict(null)
    setEvalError(null)
  }

  async function evaluate(): Promise<void> {
    if (season === null || partner === null) return
    setEvaluating(true)
    setEvalError(null)
    try {
      setVerdict(await api.trade.evaluate(season, { rosterId: partner, give, get }))
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
      setSuggestions(await api.trade.suggest({ season, focus, stance, partnerRosterId }))
    } catch (err) {
      setFindError(errorMessage(err))
    } finally {
      setFinding(false)
    }
  }

  /** Spec §5.2: the builder shows the suggestion's own evaluation — no second trade:evaluate call. */
  const openInBuilder = (s: TradeSuggestion): void => {
    setPartner(s.evaluation.them.rosterId)
    setGive(s.evaluation.me.give.map((p) => p.playerId))
    setGet(s.evaluation.me.get.map((p) => p.playerId))
    setVerdict(s.evaluation)
    setEvalError(null)
    builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const canEvaluate = partner !== null && give.length > 0 && get.length > 0 && !evaluating

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trade</h1>
          <p className="text-sm text-muted-foreground">
            Both teams&apos; rest-of-season strength before and after, on Sleeper projections under
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
          <div ref={builderRef} className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Partner</span>
              <select
                aria-label="Partner"
                className={selectClass}
                value={partner ?? ''}
                onChange={(e) => choosePartner(Number(e.target.value))}
              >
                {pool.teams.map((t) => (
                  <option key={t.rosterId} value={t.rosterId}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={partner === null || finding}
                onClick={() => {
                  setSuggestWith(partner)
                  void find(partner)
                }}
              >
                Suggest with this team
              </Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SideEditor
                title="I give"
                roster={pool.me.players}
                chosen={give}
                weeks={pool.weeks}
                onChange={changeGive}
                onOpen={setSelected}
              />
              <SideEditor
                title="I get"
                roster={partnerTeam?.players ?? []}
                chosen={get}
                weeks={pool.weeks}
                onChange={changeGet}
                onOpen={setSelected}
              />
            </div>

            <div className="flex items-center gap-4">
              <Button type="button" disabled={!canEvaluate} onClick={() => void evaluate()}>
                Evaluate
              </Button>
              {evaluating && <span className="text-sm text-muted-foreground">Evaluating…</span>}
              {evalError && <span className="text-destructive text-sm">{evalError}</span>}
              {!verdict && !evaluating && !evalError && (
                <span className="text-sm text-muted-foreground">{NO_VERDICT_HINT}</span>
              )}
            </div>

            {verdict && <VerdictCard ev={verdict} />}
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
