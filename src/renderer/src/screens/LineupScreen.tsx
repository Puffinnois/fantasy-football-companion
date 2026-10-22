import { useEffect, useState } from 'react'
import { ArrowUpDown, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  EditionFooter,
  InjuryTag,
  Masthead,
  MeChip,
  PosChip,
  RoundButton,
  Swatch,
  ToneChip
} from '@/components/edition'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { api } from '@/lib/api'
import { useNoteContext } from '@/lib/dev/noteContext'
import { errorMessage } from '@/lib/format'
import {
  benchFor,
  closeCallTitle,
  isNewStarter,
  matchupTone,
  pointsLeft,
  rowDelta,
  scoreboard,
  shortName,
  shownStarters
} from '@/lib/lineupView'
import { cn } from '@/lib/utils'
import type { DetailTarget, LineupPlayer, LineupWeek, SlotEntry } from '@shared/types'

const GRID = 'grid-cols-[48px_minmax(0,1fr)_72px_150px_56px]'
const BENCH_GRID = 'grid-cols-[34px_minmax(0,1fr)_58px_44px]'
const one = (n: number): string => n.toFixed(1)

/** Bye / Out / Doubtful / Questionable tag next to the name. */
function Flag({ p }: { p: LineupPlayer }): React.JSX.Element | null {
  if (p.flag === 'bye')
    return (
      <span className="shrink-0 rounded-[2px] bg-bad px-1 py-0.5 font-cond text-[11px] leading-none font-extrabold tracking-[0.06em] text-on-pos">
        BYE
      </span>
    )
  if (p.flag === null) return null
  return (
    <InjuryTag
      status={
        p.injuryStatus ??
        (p.flag === 'out' ? 'Out' : p.flag === 'doubtful' ? 'Doubtful' : 'Questionable')
      }
    />
  )
}

function meta(p: LineupPlayer): string {
  return [
    p.team ?? 'FA',
    p.opponent ? `vs ${p.opponent}` : 'Bye',
    p.expert ? `Experts ${(p.position ?? '').toUpperCase()}${p.expert.ecrPosRank}` : null
  ]
    .filter(Boolean)
    .join(' · ')
}

function Matchup({ p, small }: { p: LineupPlayer; small?: boolean }): React.JSX.Element {
  const tone = matchupTone(p)
  return (
    <ToneChip
      tone={tone}
      title={
        p.opponent === null
          ? 'Bye week'
          : p.dvpRank === null
            ? 'Defense not ranked yet'
            : `${p.opponent} ranks ${p.dvpRank} against ${p.position ?? 'the position'} (1 is toughest)`
      }
      className={cn(
        'gap-[5px] rounded-[3px]',
        small ? 'min-w-[52px] text-[14px]' : 'min-w-[60px] text-[15px]'
      )}
    >
      {p.opponent ?? 'BYE'}
      {!small && p.opponent && p.dvpRank !== null && (
        <span
          className={cn(
            'font-mono text-[10.5px] leading-none',
            tone === 'neutral' ? 'font-medium text-fg-3' : 'font-semibold'
          )}
        >
          #{p.dvpRank}
        </span>
      )}
    </ToneChip>
  )
}

/** Floor–ceiling track with the projection dot; `max` is the shared scale (highest ceiling on the roster). */
function Range({ p, max }: { p: LineupPlayer; max: number }): React.JSX.Element {
  const sc = (v: number): number => Math.max(0, Math.min(100, (v / max) * 100))
  const title =
    p.floor !== null && p.ceiling !== null
      ? `Floor ${one(p.floor)} · projected ${one(p.value)} · ceiling ${one(p.ceiling)}`
      : `Projected ${one(p.value)}`
  return (
    <div className="relative h-3.5" title={title}>
      <div className="absolute inset-x-0 top-1.5 h-0.5 rounded-[1px] bg-line" />
      {p.floor !== null && p.ceiling !== null && (
        <div
          className="absolute top-1 h-1.5 rounded-[3px] bg-fg-3 opacity-45"
          style={{
            left: `${sc(p.floor)}%`,
            width: `${Math.max(1, sc(p.ceiling) - sc(p.floor))}%`
          }}
        />
      )}
      <div
        className="absolute top-0.5 size-2.5 rounded-full bg-ink shadow-[0_0_0_2px_var(--paper)]"
        style={{ left: `calc(${sc(p.value)}% - 5px)` }}
      />
    </div>
  )
}

interface LineupScreenProps {
  dataVersion: number
}

export function LineupScreen({ dataVersion }: LineupScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const [currentWeek, setCurrentWeek] = useState<number | null>(null)
  const [league, setLeague] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; data: LineupWeek } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const [selected, setSelected] = useState<DetailTarget | null>(null)
  useNoteContext('week', week !== null ? { label: `wk ${week}`, data: { season, week } } : null)

  useEffect(() => {
    void api.players
      .options()
      .then((o) => {
        setSeason((s) => s ?? o.seasons[0] ?? null)
        setWeek((w) => w ?? o.currentWeek)
        setCurrentWeek(o.currentWeek)
      })
      .catch((err) => setFailed({ key: 'options', message: errorMessage(err) }))
    void api.league
      .get()
      .then((l) => setLeague(l?.name ?? null))
      .catch(() => undefined)
  }, [dataVersion])

  const key = season !== null && week !== null ? `${season}|${week}|${dataVersion}` : null
  useEffect(() => {
    if (season === null || week === null || key === null) return
    let cancelled = false
    void api.lineup
      .week({ season, week })
      .then((data) => {
        if (!cancelled) setLoaded({ key, data })
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, week, key])

  const data = loaded?.key === key ? loaded.data : null
  const error = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const me = data?.me ?? null
  const final = data?.status === 'final'
  const isApplied = applied !== null && applied === key && (me?.swaps.length ?? 0) > 0
  const shown = me ? shownStarters(me, isApplied) : []
  const bench = me ? benchFor(me, shown) : []
  const board = data ? scoreboard(data, isApplied) : null
  const swapCount = me?.swaps.length ?? 0
  const pool = me ? [...shown.flatMap((e) => (e.player ? [e.player] : [])), ...bench] : []
  const max = Math.max(1, ...pool.map((p) => Math.max(p.ceiling ?? 0, p.value)))
  const stage = final
    ? 'Final'
    : data?.status === 'inProgress'
      ? 'In progress'
      : week === currentWeek
        ? 'This week'
        : 'Upcoming'

  function go(next: number): void {
    setWeek(Math.max(1, Math.min(18, next)))
    setApplied(null)
  }

  const rows = shown.map((e: SlotEntry, i) => {
    const p = e.player
    const opt = me?.optimal[i]
    const newHere = !isApplied && !final && opt && me ? isNewStarter(opt, me.current) : false
    const delta = newHere && opt && me ? rowDelta(opt, me.current?.[i], me.current) : null
    const isIn = isApplied && me ? isNewStarter(e, me.current) : false
    const close =
      p && opt?.player?.playerId === p.playerId && opt.closeCall && !newHere ? opt.closeCall : null
    return { e, p, opt, newHere, delta, isIn, close, i }
  })

  return (
    <>
      <Masthead
        kicker={[league, week !== null ? `Week ${week}` : null, data ? stage : null]
          .filter(Boolean)
          .join(' · ')}
        title="The Lineup"
        below={
          <div className="mt-1 flex items-center gap-2">
            <RoundButton
              size={28}
              title="Previous week"
              disabled={week === null || week <= 1}
              onClick={() => go((week ?? 1) - 1)}
            >
              <ChevronLeft className="size-[15px]" />
            </RoundButton>
            <span
              aria-label="Week"
              className="min-w-[74px] text-center font-cond text-[18px] leading-none font-bold tracking-[0.06em] uppercase"
            >
              Week {week === null ? '--' : String(week).padStart(2, '0')}
            </span>
            <RoundButton
              size={28}
              title="Next week"
              disabled={week === null || week >= 18}
              onClick={() => go((week ?? 1) + 1)}
            >
              <ChevronRight className="size-[15px]" />
            </RoundButton>
          </div>
        }
        right={
          board && (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 font-cond text-[13px] leading-none font-bold tracking-[0.14em] uppercase">
                <span className="text-fg-3">{final ? 'Final' : 'Projected'}</span>
                <ToneChip tone={board.tone} className="text-[13px] font-bold tracking-[0.14em]">
                  {board.edge}
                </ToneChip>
              </div>
              <div className="flex items-end gap-4">
                <div className="flex flex-col items-end gap-1.5">
                  <span className="ed-numeral">{one(board.mine)}</span>
                  <MeChip>YOU</MeChip>
                </div>
                <span className="pb-[30px] font-cond text-[30px] leading-none font-extrabold text-fg-3">
                  –
                </span>
                <div className="flex flex-col items-start gap-1.5">
                  <span className="ed-numeral text-fg-3">
                    {board.theirs === null ? '—' : one(board.theirs)}
                  </span>
                  <span className="max-w-[170px] truncate font-cond text-[12px] leading-none font-bold tracking-[0.12em] text-fg-2 uppercase">
                    {data?.opponent?.name ?? 'No opponent'}
                  </span>
                </div>
              </div>
            </div>
          )
        }
      />

      {data && me && (
        <div
          className={cn(
            'flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-line px-8',
            !final && !isApplied && swapCount > 0 && me.current !== null && 'bg-me'
          )}
        >
          {final ? (
            <span className="text-[14px] leading-[1.3] font-medium text-fg-2">
              {me.actualTotal !== null
                ? `Final score, ${one(me.actualTotal)} points. Your best lineup was projected for ${one(me.optimalTotal)}.`
                : 'This week is final.'}
            </span>
          ) : me.current === null ? (
            <span className="font-cond text-[22px] leading-none font-extrabold text-fg-2 uppercase">
              Lineup not set on Sleeper yet. Here is the best one.
            </span>
          ) : isApplied ? (
            <>
              <span className="flex items-center gap-[9px] font-cond text-[22px] leading-none font-extrabold uppercase">
                <span className="flex size-5 items-center justify-center rounded-full bg-good text-on-pos">
                  <Check className="size-[13px]" />
                </span>
                Best lineup set: {one(me.optimalTotal)} projected.
              </span>
              <button
                type="button"
                onClick={() => setApplied(null)}
                className="h-[30px] cursor-pointer rounded-full border border-line px-3.5 font-cond text-[13px] leading-none font-bold tracking-[0.08em] text-fg-2 uppercase hover:border-ink hover:text-fg"
              >
                Undo
              </button>
            </>
          ) : swapCount > 0 ? (
            <>
              <span className="font-cond text-[22px] leading-none font-extrabold tracking-[0.01em] uppercase">
                You&apos;re leaving {one(pointsLeft(me))} points on the bench.
              </span>
              <button
                type="button"
                onClick={() => setApplied(key)}
                title="Preview the best lineup here; set it on Sleeper to make it count"
                className="flex h-[34px] cursor-pointer items-center gap-[7px] rounded-full bg-brand px-4 font-cond text-[15px] leading-none font-extrabold tracking-[0.08em] text-on-brand uppercase hover:brightness-105"
              >
                <ArrowUpDown className="size-[15px]" />
                Make {swapCount} swap{swapCount === 1 ? '' : 's'}
              </button>
            </>
          ) : (
            <span className="font-cond text-[22px] leading-none font-extrabold text-fg-2 uppercase">
              This is already your best lineup.
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 pl-8">
        <div className="min-w-0 flex-1 overflow-auto pr-7">
          <div
            className={cn(
              'ed-label sticky top-0 z-[2] grid h-[34px] items-end gap-x-3.5 border-b-2 border-ink bg-paper pb-[7px] text-fg-2',
              GRID
            )}
          >
            <span>Slot</span>
            <span>Starter</span>
            <span
              className="text-center"
              title="Opponent and how they rank against the position. 1 is toughest"
            >
              Matchup
            </span>
            <span title="Floor to ceiling, dot is the projection">Range</span>
            <span className="text-right">Proj</span>
          </div>
          {!data && !error && <div className="ed-loading">Setting the lineup…</div>}
          {error && <div className="py-16 text-center text-bad">{error}</div>}
          {data && !me && (
            <div className="py-16 text-center text-fg-2">
              Your team isn&apos;t identified — re-import from Setup
            </div>
          )}
          {data && me && !data.projectionsStored && (
            <p className="pt-2 text-[12px] text-fg-3">
              No projections stored — values are actuals only.
            </p>
          )}
          {rows.map(({ e, p, opt, newHere, delta, isIn, close, i }) => (
            <div
              key={i}
              className={cn(
                'relative grid min-h-[50px] items-center gap-x-3.5 border-b border-line py-[7px]',
                GRID,
                isIn && 'bg-me'
              )}
            >
              <PosChip position={e.slot} size="slot" />
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-[7px]">
                  {p ? (
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className="cursor-pointer truncate text-[14.5px] leading-[1.1] font-semibold tracking-[-0.01em] hover:underline"
                    >
                      {p.fullName}
                    </button>
                  ) : (
                    <span className="text-[14.5px] leading-[1.1] font-semibold text-fg-3">
                      Empty slot
                    </span>
                  )}
                  {p && <Flag p={p} />}
                  {isIn && (
                    <span className="shrink-0 rounded-[2px] bg-good px-[5px] py-0.5 font-cond text-[11px] leading-none font-extrabold tracking-[0.1em] text-on-pos">
                      IN
                    </span>
                  )}
                </div>
                {p && (
                  <span className="truncate text-[12px] leading-[1.1] text-fg-3">{meta(p)}</span>
                )}
                {newHere && opt?.player && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] leading-[1.1] font-semibold text-brand-fg">
                    <ArrowUpDown className="size-[13px]" />
                    Start {opt.player.fullName} instead
                    {delta !== null && (
                      <span className="rounded-[2px] bg-good px-[5px] py-0.5 font-cond text-[12px] leading-none font-extrabold text-on-pos">
                        {delta > 0 ? '+' : ''}
                        {one(delta)}
                      </span>
                    )}
                  </span>
                )}
                {close && p && (
                  <span
                    className="text-[11.5px] leading-[1.1] text-fg-3 italic"
                    title={closeCallTitle(p, close)}
                  >
                    Close call: {shortName(close.fullName)} ({one(close.value)})
                  </span>
                )}
              </div>
              <div className="flex justify-center">
                {p ? <Matchup p={p} /> : <ToneChip tone="dashed">—</ToneChip>}
              </div>
              <div>{p && <Range p={p} max={max} />}</div>
              <span className="text-right font-cond text-[22px] leading-none font-extrabold">
                {p ? one(p.value) : '—'}
              </span>
            </div>
          ))}
        </div>
        <aside className="w-[400px] shrink-0 overflow-auto border-l border-line pr-8 pb-6 pl-7">
          <div className="sticky top-0 z-[2] flex h-[34px] items-end justify-between border-b-2 border-ink bg-paper pb-[7px] font-cond text-[13px] leading-none font-extrabold tracking-[0.14em] uppercase">
            <span>
              Bench <span className="text-fg-3">{bench.length}</span>
            </span>
            <span className="font-bold tracking-[0.1em] text-fg-2">Proj</span>
          </div>
          {bench.map((p) => (
            <div
              key={p.playerId}
              className={cn(
                'grid h-[46px] items-center gap-x-2.5 border-b border-line',
                BENCH_GRID
              )}
            >
              <PosChip position={p.position} size="sm" />
              <div className="flex min-w-0 flex-col gap-[3px]">
                <div className="flex min-w-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    className="cursor-pointer truncate text-[13.5px] leading-[1.1] font-semibold hover:underline"
                  >
                    {p.fullName}
                  </button>
                  <Flag p={p} />
                </div>
                <span className="truncate text-[11.5px] leading-[1.1] text-fg-3">{meta(p)}</span>
              </div>
              <div className="flex justify-center">
                <Matchup p={p} small />
              </div>
              <span className="text-right font-cond text-[19px] leading-none font-extrabold text-fg-2">
                {one(p.value)}
              </span>
            </div>
          ))}
          {me && me.unavailable.length > 0 && (
            <>
              <div className="flex h-11 items-end border-b-2 border-ink pb-[7px] font-cond text-[13px] leading-none font-extrabold tracking-[0.14em] uppercase">
                Out &amp; IR <span className="ml-1.5 text-fg-3">{me.unavailable.length}</span>
              </div>
              {me.unavailable.map((p) => (
                <div
                  key={p.playerId}
                  className="flex h-[38px] items-center justify-between gap-2.5 border-b border-line text-fg-3"
                >
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    className="min-w-0 cursor-pointer truncate text-left text-[13px] leading-[1.1] font-medium hover:text-fg"
                  >
                    <span className="mr-1.5 font-cond text-[13px] font-extrabold">
                      {(p.position ?? '').toUpperCase()}
                    </span>
                    {p.fullName}
                  </button>
                  {p.flag === 'bye' ? (
                    <Flag p={p} />
                  ) : (
                    <InjuryTag status={p.injuryStatus ?? 'IR'} />
                  )}
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
      <EditionFooter
        legend={[
          { swatch: <Swatch className="bg-good" />, label: 'Easy matchup' },
          { swatch: <Swatch className="bg-bad" />, label: 'Tough' },
          {
            swatch: <span className="h-1.5 w-4 rounded-[3px] bg-fg-3 opacity-45" />,
            label: 'Floor–ceiling'
          }
        ]}
      >
        <span className="truncate">
          Projections update through kickoff. Matchup rank is how the opponent defends the position,
          1 is toughest.
        </span>
      </EditionFooter>

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </>
  )
}
