import { useEffect, useRef, useState } from 'react'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { TradeBuilder } from '@/components/TradeBuilder'
import { TradeSuggestions } from '@/components/TradeSuggestions'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import {
  EMPTY_DEAL,
  addTeam,
  dealFromMoves,
  dealOf,
  proposalFrom,
  pruneDeal,
  type BuilderDeal
} from '@/lib/tradeBuilder'
import { DEADLINE_NOTE, windowLabel } from '@/lib/tradeView'
import { useSuggestRun } from '@/lib/useSuggestRun'
import { proposalOf, type DealMove } from '@shared/deal'
import type {
  DetailTarget,
  TradeEvaluation,
  TradeOpenSpots,
  TradePool,
  TradeSuggestion
} from '@shared/types'

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
  const suggest = useSuggestRun(season)
  const { prune } = suggest
  const builderRef = useRef<HTMLDivElement>(null)
  /** Bumped on every deal change: an evaluate answer for an older deal is dropped. */
  const dealSeq = useRef(0)

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
        dealSeq.current++
        setDeal((d) => {
          const kept = pruneDeal(d, pool)
          const first = pool.teams[0]
          return kept.teams.length > 0 || !first ? kept : addTeam(kept, first.rosterId)
        })
        setVerdict(null)
        setEvaluating(false)
        setEvalError(null)
        prune(pool)
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, key, prune])

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

  const changeDeal = (d: BuilderDeal): void => {
    dealSeq.current++
    setDeal(d)
    setVerdict(null)
    setEvalError(null)
    setEvaluating(false)
  }

  async function evaluate(d: BuilderDeal = deal): Promise<void> {
    if (season === null || !pool) return
    const seq = dealSeq.current
    setEvaluating(true)
    setEvalError(null)
    try {
      const ev = await api.trade.evaluate(season, proposalFrom(d, pool.me.rosterId))
      if (seq === dealSeq.current) setVerdict(ev)
    } catch (err) {
      if (seq === dealSeq.current) setEvalError(errorMessage(err))
    } finally {
      if (seq === dealSeq.current) setEvaluating(false)
    }
  }

  const scrollToBuilder = (): void =>
    builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  /** Spec 6b §5.2: the builder shows the suggestion's own evaluation — no second trade:evaluate call. */
  const openSuggestion = (s: TradeSuggestion): void => {
    if (pool && suggest.run?.status === 'stale') {
      // The carried verdict predates the data change: evaluate what the builder shows, fresh.
      const d = pruneDeal(dealOf(s.evaluation), pool)
      changeDeal(d)
      void evaluate(d)
      scrollToBuilder()
      return
    }
    changeDeal(dealOf(s.evaluation))
    setVerdict(s.evaluation)
    scrollToBuilder()
  }

  /** Multi-team spec §5.2: an alternative carries only its moves, so it is evaluated on opening. */
  const openAlternative = (moves: DealMove[]): void => {
    if (!pool) return
    const built = dealFromMoves(moves, pool.me.rosterId)
    // Follow-ups §1: on a stale list, drop a player who has left the team the search had him on.
    const d = suggest.run?.status === 'stale' ? pruneDeal(built, pool) : built
    changeDeal(d)
    void evaluate(d)
    scrollToBuilder()
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

      {pool && season !== null && (
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
              finding={suggest.running}
              onSuggestWith={(rosterId) => suggest.find({ mustInclude: rosterId })}
            />
          </div>
          <TradeSuggestions
            pool={pool}
            season={season}
            suggest={suggest}
            onOpen={openSuggestion}
            onOpenAlternative={openAlternative}
          />
        </>
      )}

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
