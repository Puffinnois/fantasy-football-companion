import { useEffect, useRef, useState } from 'react'
import { EditionFooter, Masthead, ScoreLabel, Swatch, ToneChip } from '@/components/edition'
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
import { ordinalSuffix } from '@/lib/leagueView'
import { DEADLINE_NOTE, rankMove, rankWithDeal } from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import { useSuggestRun } from '@/lib/useSuggestRun'
import { proposalOf, type DealMove } from '@shared/deal'
import type {
  DetailTarget,
  TradeEvaluation,
  TradeOpenSpots,
  TeamStrength,
  TradePool,
  TradeSuggestion
} from '@shared/types'

type Tab = 'build' | 'find'

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
  const [tab, setTab] = useState<Tab>('build')
  const [league, setLeague] = useState<string | null>(null)
  const [strengths, setStrengths] = useState<TeamStrength[]>([])
  /** Bumped on every deal change: an evaluate answer for an older deal is dropped. */
  const dealSeq = useRef(0)

  useEffect(() => {
    void api.players
      .options()
      .then((o) => setSeason((s) => s ?? o.seasons[0] ?? null))
      .catch((err) => setFailed({ key: 'options', message: errorMessage(err) }))
    void api.league
      .get()
      .then((l) => setLeague(l?.name ?? null))
      .catch(() => undefined)
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

  // The masthead's ROS rank: every team's strength, my side replaced by the verdict's.
  useEffect(() => {
    if (key === null || season === null) return
    let cancelled = false
    void api.lineup
      .strength(season)
      .then((list) => {
        if (!cancelled) setStrengths(list)
      })
      .catch(() => undefined)
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

  const scrollToBuilder = (): void => setTab('build')

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

  const rank = pool ? rankWithDeal(strengths, pool.me.rosterId, verdict) : null
  const move = rank && verdict ? rankMove(rank.now, rank.after) : null
  const found = suggest.run?.cards.length ?? 0
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'build', label: 'Build a deal', count: 0 },
    { key: 'find', label: 'Find deals', count: found }
  ]

  return (
    <>
      <Masthead
        kicker={
          pool
            ? [league, `Weeks ${pool.currentWeek}–${pool.lastWeek}`, `${pool.weeks} weeks to play`]
                .filter(Boolean)
                .join(' · ')
            : 'Trade'
        }
        title="The Trade Desk"
        below={
          <div role="tablist" className="mt-1.5 flex gap-5">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex cursor-pointer items-center gap-[7px] border-b-[3px] pb-[5px] font-cond text-[18px] leading-none font-bold tracking-[0.06em] uppercase',
                  tab === t.key
                    ? 'border-brand text-fg'
                    : 'border-transparent text-fg-3 hover:text-fg'
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className={cn(
                      'rounded-[2px] px-[5px] py-0.5 font-cond text-[12px] leading-none font-extrabold tracking-[0.04em]',
                      tab === t.key ? 'bg-ink text-paper' : 'shadow-[inset_0_0_0_1px_var(--line)]'
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        }
        right={
          rank && (
            <div className="flex items-end gap-3">
              <div className="flex flex-col items-end gap-1.5 pb-1">
                {move && (
                  <ToneChip tone={move.tone} className="text-[12px] tracking-[0.1em] uppercase">
                    {move.text}
                  </ToneChip>
                )}
                <ScoreLabel top="ROS rank" bottom={verdict ? 'after deal' : 'right now'} />
              </div>
              <div className="flex items-start">
                <span className="ed-numeral">{rank.after}</span>
                <span className="font-cond text-[26px] leading-none font-extrabold text-brand-fg uppercase">
                  {ordinalSuffix(rank.after)}
                </span>
              </div>
              <span className="pb-1 font-cond text-[13px] leading-none font-bold tracking-[0.14em] text-fg-3 uppercase">
                of {rank.teams}
              </span>
            </div>
          )
        }
      />
      {pool?.tradeDeadlinePassed && (
        <div className="flex h-10 shrink-0 items-center border-b border-line bg-warn-s px-8 text-[13px] leading-[1.3] font-medium">
          {DEADLINE_NOTE}
        </div>
      )}
      {notice && <div className="flex flex-1 items-center justify-center text-bad">{notice}</div>}
      {!pool && !notice && <div className="ed-loading flex-1">Opening the trade desk…</div>}
      {pool && season !== null && tab === 'build' && (
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
          onSuggestWith={(rosterId) => {
            suggest.find({ mustInclude: rosterId, maxTeams: 2 })
            setTab('find')
          }}
        />
      )}
      {pool && season !== null && tab === 'find' && (
        <TradeSuggestions
          pool={pool}
          season={season}
          suggest={suggest}
          onOpen={openSuggestion}
          onOpenAlternative={openAlternative}
          onOpenPlayer={setSelected}
        />
      )}
      <EditionFooter
        legend={[
          { swatch: <Swatch className="bg-good" />, label: 'Stronger' },
          { swatch: <Swatch className="bg-bad" />, label: 'Weaker' },
          { swatch: <Swatch className="bg-warn" />, label: 'Roster move needed' }
        ]}
      >
        <span className="truncate">
          Strength is each team&apos;s best lineup on Sleeper projections under your scoring, summed
          over the weeks left.
        </span>
      </EditionFooter>
      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </>
  )
}
