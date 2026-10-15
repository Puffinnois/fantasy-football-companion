import { useEffect, useState } from 'react'
import { Star, X } from 'lucide-react'
import {
  InjuryTag,
  MeChip,
  PosChip,
  RookieTag,
  SectionHead,
  ToneChip,
  type Tone
} from '@/components/edition'
import { NewsSection } from '@/components/NewsSection'
import { WeeklyChart } from '@/components/WeeklyChart'
import { api } from '@/lib/api'
import { errorMessage, fmtPct, fmtPoints } from '@/lib/format'
import { cellText, columnGroups, rosAdjustLine } from '@/lib/playersTableView'
import {
  beatLine,
  chartColumns,
  rankTone,
  readRows,
  splitName,
  type ReadTone
} from '@/lib/playerFileView'
import { cn } from '@/lib/utils'
import type { DetailTarget, PlayerDetail } from '@shared/types'

interface PlayerDetailPanelProps {
  season: number
  /** The clicked player (any row that carries id, name, position, team and statsAvailable); null closes the panel. */
  player: DetailTarget | null
  onClose: () => void
  /** Called after the Watch pill toggled the watchlist, so a table can update its star. */
  onWatchChange?: (playerId: string, watched: boolean) => void
}

const TONE: Record<Exclude<ReadTone, null> | 'none', Tone> = {
  good: 'good',
  bad: 'bad',
  none: 'neutral'
}

function Pill({
  on,
  onClick,
  title,
  children
}: {
  on?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full pr-3 pl-2.5 font-cond text-[13px] leading-none font-bold tracking-[0.08em] uppercase',
        on
          ? 'bg-brand text-on-brand'
          : 'border border-line text-fg-2 hover:border-ink hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}

function GameLog({
  detail,
  position
}: {
  detail: PlayerDetail
  position: string | null
}): React.JSX.Element | null {
  const played = detail.weeks.filter((w) => w.played)
  if (played.length === 0) return null
  const columns = columnGroups(position ?? 'ALL', 'stats')
    .slice(1)
    .flatMap((g) => g.columns)
    .filter((c) => c.kind === 'stat')
  const showSnaps = position !== 'DEF'
  const head =
    'px-1.5 pb-1.5 text-right font-cond text-[12px] font-bold tracking-[0.1em] text-fg-2 uppercase'
  return (
    <section className="flex flex-col gap-2">
      <SectionHead title="Game log" />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line">
              <th className={cn(head, 'pl-0 text-left')}>Wk</th>
              <th className={cn(head, 'text-left')}>Opp</th>
              <th className={head}>Pts</th>
              {showSnaps && <th className={head}>Snap</th>}
              {columns.map((c) => (
                <th key={c.key} className={head}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {played.map((w) => (
              <tr key={w.week} className="h-8 border-b border-line">
                <td className="font-cond text-[14px] font-bold">{w.week}</td>
                <td className="px-1.5 font-mono text-[11px] text-fg-3">{w.opponent ?? '—'}</td>
                <td className="px-1.5 text-right font-cond text-[16px] font-extrabold">
                  {fmtPoints(w.points)}
                </td>
                {showSnaps && <td className="px-1.5 text-right text-fg-2">{fmtPct(w.snapPct)}</td>}
                {columns.map((c) => {
                  const v = w.stats[c.statKey ?? ''] ?? null
                  return (
                    <td key={c.key} className={cn('px-1.5 text-right', !v && 'text-fg-3')}>
                      {cellText(v, c, 'stats')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** The player file (README "Player file"): a 560px drawer over the screen; Esc, × or the scrim close it. */
export function PlayerDetailPanel({
  season,
  player,
  onClose,
  onWatchChange
}: PlayerDetailPanelProps): React.JSX.Element | null {
  // Keyed by season + player so a stale result never shows for the next selection.
  const [loaded, setLoaded] = useState<{ key: string; detail: PlayerDetail } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [watch, setWatch] = useState<{ playerId: string; on: boolean } | null>(null)
  const playerId = player?.playerId ?? null
  const key = playerId === null ? null : `${season}|${playerId}`

  useEffect(() => {
    if (playerId === null || key === null) return
    let cancelled = false
    void api.players
      .detail(season, playerId)
      .then((d) => {
        if (!cancelled) setLoaded({ key, detail: d })
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, playerId, key])

  useEffect(() => {
    if (player === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, onClose])

  if (player === null) return null
  const detail = loaded?.key === key ? loaded.detail : null
  const error = failed?.key === key ? failed.message : null
  const row = detail?.row ?? null
  const watched = watch?.playerId === player.playerId ? watch.on : (row?.watched ?? false)

  async function toggleWatch(): Promise<void> {
    if (player === null) return
    try {
      const on = await api.watchlist.toggle(player.playerId)
      setWatch({ playerId: player.playerId, on })
      onWatchChange?.(player.playerId, on)
    } catch {
      // the pill simply keeps its state
    }
  }

  const pos = (player.position ?? '').toUpperCase()
  const { first, last } = splitName(player.fullName)
  const columns = detail ? chartColumns(detail.weeks, detail.schedule) : []
  const signals = row?.signals ?? null
  const rank = (n: number | null): string => (n === null ? '—' : `${pos}${n}`)
  const tiles = row
    ? [
        {
          label: 'Points / game',
          value: fmtPoints(row.ppg),
          sub: `${row.gamesPlayed} game${row.gamesPlayed === 1 ? '' : 's'}`
        },
        {
          label: 'Rest of season',
          value: row.rosPoints === null ? '—' : row.rosPoints.toFixed(1),
          sub:
            row.rosValue === null
              ? 'No projections'
              : `${row.rosValue > 0 ? '+' : ''}${row.rosValue.toFixed(1)} vs replacement`
        },
        {
          label: 'ROS rank',
          value: rank(row.rosRank),
          sub: row.expert ? `Experts: ${pos}${row.expert.ecrPosRank}` : ''
        },
        {
          label: 'Start rate',
          value: fmtPct(signals?.startRate ?? null),
          sub:
            signals?.floor != null && signals.ceiling != null
              ? `${signals.floor.toFixed(1)}–${signals.ceiling.toFixed(1)} pt range`
              : 'Needs 3 games'
        }
      ]
    : []
  const adjust = row ? rosAdjustLine(row) : null
  const injuryNote =
    [row?.injuryBodyPart, row?.injuryNotes].filter(Boolean).join(' · ') ||
    'No further detail reported.'

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className="flex-1 cursor-default bg-scrim"
        onClick={onClose}
      />
      <aside
        aria-label="Player file"
        className="flex h-full w-[560px] max-w-full flex-col border-l border-line bg-paper shadow-[-24px_0_64px_var(--shadow-c)]"
      >
        <div className="flex h-[54px] shrink-0 items-center justify-between gap-3 border-b border-line pr-5 pl-7">
          <span className="font-cond text-[14px] leading-none font-extrabold tracking-[0.14em] text-fg-3 uppercase">
            Player file
          </span>
          <div className="flex items-center gap-2">
            <Pill
              on={watched}
              onClick={() => void toggleWatch()}
              title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              <Star className="size-3.5" fill={watched ? 'currentColor' : 'none'} />
              {watched ? 'Watching' : 'Watch'}
            </Pill>
            <button
              type="button"
              title="Close (Esc)"
              aria-label="Close panel"
              onClick={onClose}
              className="flex size-[30px] cursor-pointer items-center justify-center rounded-full text-fg-2 hover:bg-hover hover:text-fg"
            >
              <X className="size-[18px]" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-[26px] px-7 pt-[22px] pb-8">
            <header className="flex flex-col gap-3">
              <div className="flex items-center gap-[9px] text-[12.5px] leading-none font-medium text-fg-2">
                <PosChip position={player.position} />
                <span>
                  {[player.team ?? 'Free agent', row?.byeWeek ? `Bye week ${row.byeWeek}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {row?.rookie && <RookieTag />}
                <span className="ml-auto flex">
                  {row &&
                    (row.ownerIsMe ? (
                      <MeChip className="px-[7px] py-1" />
                    ) : row.ownerRosterId === null ? (
                      <span className="font-cond text-[13px] leading-none font-extrabold tracking-[0.1em] text-brand-fg uppercase">
                        Free agent
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-fg-2">
                        Rostered by <span className="font-semibold text-fg">{row.ownerName}</span>
                      </span>
                    ))}
                </span>
              </div>
              <h1 className="m-0 flex flex-col gap-1">
                {first && (
                  <span className="text-[22px] leading-none font-medium tracking-[-0.01em] text-fg-2">
                    {first}
                  </span>
                )}
                <span className="font-cond text-[64px] leading-[0.84] font-extrabold tracking-[-0.005em] uppercase">
                  {last}
                </span>
              </h1>
              {row?.injuryStatus && (
                <div
                  className={cn(
                    'flex items-start gap-2.5 rounded-[3px] px-3 py-2.5',
                    row.injuryStatus === 'Questionable' ? 'bg-warn-s' : 'bg-bad-s'
                  )}
                >
                  <InjuryTag status={row.injuryStatus} className="px-[5px] py-[3px] text-[12px]" />
                  <span className="text-[13px] leading-[1.4] text-pretty">
                    <span className="font-semibold">{row.injuryStatus}.</span> {injuryNote}
                  </span>
                </div>
              )}
            </header>

            {!detail && !error && <div className="ed-loading">Pulling the file…</div>}
            {error && <p className="py-10 text-center text-bad">{error}</p>}
            {!player.statsAvailable && (
              <p className="text-fg-3">
                Stats unavailable — this player could not be matched to nflverse data.
              </p>
            )}

            {detail && row && (
              <>
                <div>
                  <div className="grid grid-cols-4 border-t-[3px] border-b border-ink border-b-line">
                    {tiles.map((t) => (
                      <div
                        key={t.label}
                        className="flex min-w-0 flex-col gap-1.5 pt-[11px] pr-2.5 pb-3 shadow-[inset_-1px_0_0_var(--line)] [&:not(:first-child)]:pl-2.5"
                      >
                        <span className="font-cond text-[12px] leading-none font-bold tracking-[0.12em] text-fg-3 uppercase">
                          {t.label}
                        </span>
                        <span className="font-cond text-[34px] leading-[0.85] font-extrabold">
                          {t.value}
                        </span>
                        <span
                          className="truncate text-[11.5px] leading-[1.2] text-fg-3"
                          title={t.sub}
                        >
                          {t.sub}
                        </span>
                      </div>
                    ))}
                  </div>
                  {adjust && <p className="mt-2 text-[12px] text-fg-3">{adjust}</p>}
                </div>

                <section className="flex flex-col gap-3.5">
                  <SectionHead title="The season so far" note={beatLine(columns)} />
                  <WeeklyChart columns={columns} average={row.gamesPlayed > 0 ? row.ppg : null} />
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 font-cond text-[12px] leading-none font-bold tracking-[0.1em] text-fg-2 uppercase">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[3px] bg-good" />
                      Beat
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[3px] bg-fg-3" />
                      Missed
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[3px] border border-line bg-panel-2" />
                      Projected
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[3px] border-[1.5px] border-dashed border-brand bg-me" />
                      Upcoming
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3.5 border-t-2 border-dotted border-ink" />
                      {row.gamesPlayed > 0 && row.ppg !== null
                        ? `Season avg ${row.ppg.toFixed(1)}`
                        : 'Season avg'}
                    </span>
                    <span className="ml-auto font-sans text-[11.5px] font-normal tracking-normal text-fg-3 normal-case">
                      Hover a week for detail
                    </span>
                  </div>
                </section>

                <section className="flex flex-col">
                  <SectionHead title="The read" />
                  {readRows(row).map((s) => (
                    <div
                      key={s.label}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line py-2.5"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-[13.5px] leading-[1.2] font-semibold">{s.label}</span>
                        <span className="text-[12px] leading-[1.3] text-fg-3">{s.note}</span>
                      </div>
                      <ToneChip
                        tone={TONE[s.tone ?? 'none']}
                        className="min-w-11 px-2 py-[5px] text-[17px]"
                      >
                        {s.value}
                      </ToneChip>
                    </div>
                  ))}
                </section>

                {detail.schedule.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <SectionHead
                      title="Up next"
                      note={`Opponent rank vs ${pos || 'the position'}s · 1 is toughest`}
                    />
                    <div className="grid grid-cols-7 gap-1.5">
                      {detail.schedule.slice(0, 7).map((e) => {
                        const tone = e.opponent === null ? 'bye' : (rankTone(e.rank) ?? 'none')
                        return (
                          <div key={e.week} className="flex min-w-0 flex-col items-center gap-1.5">
                            <span className="font-cond text-[12px] leading-none font-bold tracking-[0.06em] text-fg-3">
                              W{e.week}
                            </span>
                            <div
                              title={
                                e.rank === null
                                  ? 'Defense not ranked yet'
                                  : `Defense vs ${pos} rank ${e.rank}`
                              }
                              className={cn(
                                'flex w-full flex-col items-center gap-1 rounded-[3px] pt-2 pb-[7px]',
                                tone === 'good' && 'bg-good text-on-pos',
                                tone === 'bad' && 'bg-bad text-on-pos',
                                tone === 'none' && 'shadow-[inset_0_0_0_1px_var(--line)]',
                                tone === 'bye' &&
                                  'border-[1.5px] border-dashed border-line text-fg-3'
                              )}
                            >
                              <span className="font-cond text-[17px] leading-none font-extrabold">
                                {e.opponent ?? 'BYE'}
                              </span>
                              <span
                                className={cn(
                                  'font-mono text-[11px] leading-none',
                                  tone === 'none' ? 'font-medium text-fg-3' : 'font-semibold'
                                )}
                              >
                                {e.opponent === null ? 'Bye' : e.rank === null ? '—' : `#${e.rank}`}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                <GameLog detail={detail} position={player.position} />
              </>
            )}

            <NewsSection playerId={player.playerId} position={player.position} />
          </div>
        </div>
      </aside>
    </div>
  )
}
