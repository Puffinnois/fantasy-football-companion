import { useEffect, useState } from 'react'
import {
  EditionFooter,
  InjuryTag,
  Masthead,
  ModeTabs,
  PosChip,
  ScoreLabel,
  Swatch,
  ToneChip
} from '@/components/edition'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { api } from '@/lib/api'
import { useNoteContext } from '@/lib/dev/noteContext'
import { errorMessage, fmtSigned } from '@/lib/format'
import { ordinalSuffix } from '@/lib/leagueView'
import { fmtMarket } from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import {
  ALL_POSITIONS,
  bestAddLine,
  claimPosition,
  filterStream,
  isFree,
  NO_STASH,
  noStreamers,
  optionLabel,
  releaseLabel,
  rosRankLabel,
  sortStash,
  splitOpponent,
  startsText,
  STASH_SORTS,
  STREAM_CHIPS,
  streamOptionLabel,
  trendingNote,
  trendingText,
  WAIVER_MODES,
  weekCardSub,
  type ReleaseChoice,
  type StashSort,
  type WaiverMode
} from '@/lib/waiverView'
import { streamWeeks } from '@shared/rules'
import type { DetailTarget, StreamRow, TradePlayer, WaiverAdds } from '@shared/types'

type Choose = (key: string, index: number) => void

const one = (n: number): string => fmtSigned(n, 1)
const toneOf = (n: number): 'good' | 'bad' | 'neutral' =>
  n > 0 ? 'good' : n < 0 ? 'bad' : 'neutral'
const HEAD =
  'ed-label sticky top-0 z-[2] grid items-end border-b-2 border-ink bg-paper pb-[7px] text-fg-2'
const LINEUP_GRID = 'grid-cols-[minmax(0,1fr)_92px_70px_112px_184px] gap-x-3.5'
const STREAM_GRID = 'grid-cols-[minmax(0,1fr)_96px_96px_96px_104px_260px] gap-x-4'

/** Chip, name (opens the player file), injury tag, then the meta line. */
function PlayerCell({
  player,
  meta,
  onOpen
}: {
  player: TradePlayer
  meta: string
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PosChip position={player.position} size="sm" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpen(player)}
            className="cursor-pointer truncate text-left text-[14.5px] leading-[1.1] font-semibold tracking-[-0.01em] hover:underline"
          >
            {player.fullName}
          </button>
          <InjuryTag status={player.injuryStatus} />
        </div>
        <span className="truncate text-[12px] leading-[1.1] text-fg-3">{meta}</span>
      </div>
    </div>
  )
}

const metaOf = (p: TradePlayer): string =>
  [p.team ?? 'FA', p.expert && p.position ? `Experts ${p.position}${p.expert.ecrPosRank}` : null]
    .filter(Boolean)
    .join(' · ')

/** The release, as a pill dropdown of every option when there is a choice. */
function ReleaseCell<T extends ReleaseChoice>({
  player,
  options,
  label,
  index,
  onChange,
  small
}: {
  player: TradePlayer
  options: T[]
  label: (o: T) => string
  index: number
  onChange: (index: number) => void
  small?: boolean
}): React.JSX.Element {
  if (options.length === 1)
    return (
      <span
        className={cn('leading-[1.2]', small ? 'text-[12px] text-fg-2' : 'text-[13px] font-medium')}
      >
        {releaseLabel(options[0])}
      </span>
    )
  return (
    <select
      aria-label={`Release for ${player.fullName}`}
      value={index}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        'max-w-full cursor-pointer rounded-full border border-line bg-panel font-medium text-fg outline-none',
        small
          ? 'h-[26px] self-start px-2 text-[12px] text-fg-2'
          : 'h-[30px] w-full px-2.5 text-[12.5px]'
      )}
    >
      {options.map((o, i) => (
        <option key={i} value={i}>
          {label(o)}
        </option>
      ))}
    </select>
  )
}

function RestOfSeason({
  adds,
  choice,
  onChoose,
  sort,
  onSort,
  onOpen
}: {
  adds: WaiverAdds
  choice: Record<string, number>
  onChoose: Choose
  sort: StashSort
  onSort: (s: StashSort) => void
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const stash = sortStash(adds.stash, sort)
  return (
    <>
      <div className="flex h-[52px] shrink-0 items-center border-b border-line bg-me px-8">
        <span className="font-cond text-[22px] leading-none font-extrabold tracking-[0.01em] uppercase">
          {bestAddLine(adds)}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 pl-8">
        <div className="min-w-0 flex-1 overflow-auto pr-7">
          <div className={cn(HEAD, LINEUP_GRID, 'h-10')}>
            <span className="flex items-baseline gap-2">
              <span className="text-[15px] font-extrabold tracking-[0.12em] text-fg">
                Improves your lineup
              </span>
              <span className="text-fg-3">{adds.lineup.length}</span>
            </span>
            <span
              className="text-right"
              title="Points per week your best lineup gains over the rest of the season"
            >
              Gain / wk
            </span>
            <span className="text-right" title="Change to this week's best lineup">
              This wk
            </span>
            <span>Starts</span>
            <span>Make room</span>
          </div>
          {adds.lineup.length === 0 && (
            <div className="ed-loading py-12">No free agent improves your lineup.</div>
          )}
          {adds.lineup.map((row) => {
            const key = `lineup|${row.player.playerId}`
            const index = choice[key] ?? 0
            const o = row.options[index] ?? row.options[0]
            const per = toneOf(o.deltaPerWeek)
            return (
              <div
                key={key}
                className={cn(
                  'grid min-h-[54px] items-center border-b border-line py-[7px]',
                  LINEUP_GRID
                )}
              >
                <PlayerCell player={row.player} meta={metaOf(row.player)} onOpen={onOpen} />
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={cn(
                      'font-cond text-[22px] leading-[0.9] font-extrabold',
                      per === 'good' ? 'text-good' : per === 'bad' ? 'text-bad' : 'text-fg-2'
                    )}
                  >
                    {fmtSigned(o.deltaPerWeek)}
                  </span>
                  <span className="font-mono text-[11.5px] leading-none text-fg-3">
                    {one(o.delta)} ROS
                  </span>
                </div>
                <div className="flex justify-end">
                  <ToneChip
                    tone={toneOf(o.thisWeekDelta)}
                    className={cn('text-[14px]', o.thisWeekDelta === 0 && 'text-fg-3')}
                  >
                    {one(o.thisWeekDelta)}
                  </ToneChip>
                </div>
                <span className="text-[12.5px] leading-[1.25] text-fg-2">
                  {startsText(o.startWeeks, adds.weeks)}
                </span>
                <div className="min-w-0">
                  <ReleaseCell
                    player={row.player}
                    options={row.options}
                    label={optionLabel}
                    index={index}
                    onChange={(i) => onChoose(key, i)}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <aside className="w-[400px] shrink-0 overflow-auto border-l border-line pr-8 pb-6 pl-7">
          <div className="sticky top-0 z-[2] bg-paper">
            <div className="flex h-10 items-end justify-between border-b-2 border-ink pb-[7px]">
              <span className="flex items-baseline gap-2 font-cond text-[15px] leading-none font-extrabold tracking-[0.12em] uppercase">
                Stash <span className="font-bold text-fg-3">{stash.length}</span>
              </span>
              <span className="ed-label text-fg-2">Cost</span>
            </div>
            <div className="ed-label flex h-[34px] items-center gap-3.5 border-b border-line">
              <span className="tracking-[0.14em] text-fg-3">Sort</span>
              {STASH_SORTS.map((so) => (
                <button
                  key={so.key}
                  type="button"
                  aria-pressed={sort === so.key}
                  onClick={() => onSort(so.key)}
                  className={cn(
                    'cursor-pointer border-b-2 pb-[3px] uppercase',
                    sort === so.key
                      ? 'border-brand text-fg'
                      : 'border-transparent text-fg-3 hover:text-fg'
                  )}
                >
                  {so.label}
                </button>
              ))}
            </div>
          </div>
          {stash.length === 0 && (
            <p className="py-6 text-[13px] leading-[1.4] text-fg-3">{NO_STASH}</p>
          )}
          {stash.map((row) => {
            const key = `stash|${row.player.playerId}`
            const index = choice[key] ?? 0
            const o = row.options[index] ?? row.options[0]
            return (
              <div
                key={key}
                data-testid="stash-row"
                className="grid grid-cols-[34px_minmax(0,1fr)_52px] items-start gap-x-2.5 border-b border-line py-2.5"
              >
                <PosChip position={row.player.position} size="sm" />
                <div className="flex min-w-0 flex-col gap-[5px]">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpen(row.player)}
                      className="cursor-pointer truncate text-left text-[13.5px] leading-[1.1] font-semibold hover:underline"
                    >
                      {row.player.fullName}
                    </button>
                    <span className="shrink-0 text-[11.5px] leading-none text-fg-3">
                      {row.player.team ?? 'FA'}
                    </span>
                    <InjuryTag status={row.player.injuryStatus} />
                  </div>
                  <div className="flex items-center gap-2.5 font-mono text-[11.5px] leading-none text-fg-3">
                    <span title="FantasyCalc trade-market value">
                      MKT{' '}
                      <span className="text-fg">
                        {row.player.market ? fmtMarket(row.player.market.value) : '—'}
                      </span>
                    </span>
                    {row.trending !== null && (
                      <span title="Sleeper adds in the last 24 h" className="text-good">
                        {trendingText(row.trending)} adds
                      </span>
                    )}
                    <span title="Experts rest-of-season rank">
                      ROS <span className="text-fg">{rosRankLabel(row.player)}</span>
                    </span>
                  </div>
                  <ReleaseCell
                    player={row.player}
                    options={row.options}
                    label={optionLabel}
                    index={index}
                    onChange={(i) => onChoose(key, i)}
                    small
                  />
                </div>
                <div className="flex justify-end">
                  {isFree(o) ? (
                    <ToneChip tone="good" className="text-[13px] tracking-[0.08em]">
                      FREE
                    </ToneChip>
                  ) : (
                    <span className="font-cond text-[17px] leading-none font-extrabold text-bad">
                      {one(o.delta)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <p className="mt-3 text-[11.5px] leading-[1.4] text-fg-3">
            {trendingNote(adds.trendingFetchedAt)}
          </p>
        </aside>
      </div>
    </>
  )
}

function Streaming({
  weeks,
  week,
  currentWeek,
  onWeek,
  chip,
  onChip,
  result,
  note,
  error,
  choice,
  onChoose,
  onOpen
}: {
  weeks: number[]
  week: number
  currentWeek: number
  onWeek: (week: number) => void
  chip: string
  onChip: (chip: string) => void
  /** The latest answer — an earlier week's while a new one computes. */
  result: { week: number; rows: StreamRow[] } | null
  /** "Running the numbers…" / "Refreshing…"; null when the result is current. */
  note: string | null
  error: string | null
  choice: Record<string, number>
  onChoose: Choose
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const rows = result ? filterStream(result.rows, chip) : []
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-4 px-8 py-3">
        <div role="tablist" aria-label="Streaming week" className="flex gap-1.5">
          {weeks.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={w === week}
              onClick={() => onWeek(w)}
              className={cn(
                'flex h-[46px] w-[104px] cursor-pointer flex-col items-start justify-center gap-1 rounded-[4px] px-3',
                w === week ? 'bg-ink text-paper' : 'border border-line text-fg hover:border-ink'
              )}
            >
              <span className="font-cond text-[18px] leading-none font-extrabold tracking-[0.04em] uppercase">
                Week {w}
              </span>
              <span
                className={cn(
                  'font-mono text-[10.5px] leading-none font-semibold tracking-[0.04em] uppercase',
                  w === week ? 'opacity-70' : 'text-fg-3'
                )}
              >
                {weekCardSub(w, currentWeek)}
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {STREAM_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={chip === c}
              onClick={() => onChip(c)}
              className={cn(
                'flex h-[34px] cursor-pointer items-center gap-[7px] rounded-[4px] px-3 font-cond text-[15px] leading-none tracking-[0.08em] uppercase',
                chip === c
                  ? 'bg-ink font-extrabold text-paper'
                  : 'font-bold text-fg-2 hover:bg-hover hover:text-fg'
              )}
            >
              <PosChip
                position={c === ALL_POSITIONS ? 'ALL' : c}
                label=""
                size="fill"
                className="size-2 shrink-0"
              />
              {c}
            </button>
          ))}
        </div>
      </div>
      <p className="shrink-0 px-8 pb-2.5 text-[13px] leading-[1.3] text-fg-2">
        Week {week}: one-week pickups ranked by net gain, after what the drop costs you the rest of
        the way.
      </p>
      <div className="mx-8 min-h-0 flex-1 overflow-auto">
        <div className={cn(HEAD, STREAM_GRID, 'h-[34px]')}>
          <span>Streamer</span>
          <span className="text-center">Opponent</span>
          <span className="text-right" title="How much this week's best lineup improves">
            Week gain
          </span>
          <span className="text-right" title="What the release costs you over the other weeks">
            Rest cost
          </span>
          <span className="text-right">Net</span>
          <span>Make room</span>
        </div>
        {error && <div className="py-14 text-center text-bad">{error}</div>}
        {note && <div className="ed-loading py-14">{note}</div>}
        {result && !note && rows.length === 0 && (
          <div className="ed-loading py-14">{noStreamers(result.week, chip)}</div>
        )}
        {!note &&
          rows.map((row) => {
            const key = `stream|${row.player.playerId}`
            const index = choice[key] ?? 0
            const o = row.options[index] ?? row.options[0]
            const opp = splitOpponent(row.opponent)
            return (
              <div
                key={key}
                data-testid="stream-row"
                className={cn(
                  'grid min-h-[50px] items-center border-b border-line py-1.5',
                  STREAM_GRID
                )}
              >
                <PlayerCell player={row.player} meta={metaOf(row.player)} onOpen={onOpen} />
                <div className="flex justify-center">
                  <span
                    title={row.opponent ?? undefined}
                    className="flex min-w-16 items-baseline justify-center gap-1 rounded-[3px] px-1.5 py-1 shadow-[inset_0_0_0_1px_var(--line)]"
                  >
                    <span className="font-mono text-[10.5px] leading-none font-medium text-fg-3">
                      {opp.where}
                    </span>
                    <span className="font-cond text-[15px] leading-none font-extrabold">
                      {opp.team}
                    </span>
                  </span>
                </div>
                <span className="text-right font-cond text-[18px] leading-none font-extrabold">
                  {one(o.weekGain)}
                </span>
                <span
                  className={cn(
                    'text-right font-cond text-[18px] leading-none font-extrabold',
                    o.restCost > 0 ? 'text-bad' : 'text-fg-3'
                  )}
                >
                  {o.restCost > 0 ? one(-o.restCost) : '0.0'}
                </span>
                <div className="flex justify-end">
                  <ToneChip tone={toneOf(o.net)} className="px-1.5 py-1 text-[18px]">
                    {fmtSigned(o.net)}
                  </ToneChip>
                </div>
                <div className="min-w-0">
                  <ReleaseCell
                    player={row.player}
                    options={row.options}
                    label={streamOptionLabel}
                    index={index}
                    onChange={(i) => onChoose(key, i)}
                  />
                </div>
              </div>
            )
          })}
      </div>
    </>
  )
}

interface WaiverScreenProps {
  dataVersion: number
}

/** Slice 6c spec §8 in the Edition design: rest of season (lineup adds, stash) and streaming. */
export function WaiverScreen({ dataVersion }: WaiverScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [league, setLeague] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; adds: WaiverAdds } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [choice, setChoice] = useState<Record<string, number>>({})
  const [sort, setSort] = useState<StashSort>('market')
  const [selected, setSelected] = useState<DetailTarget | null>(null)
  const [mode, setMode] = useState<WaiverMode>('ros')
  // Spec §8: streaming loads on the first switch, then on each week change (and after a sync).
  const [streamOn, setStreamOn] = useState(false)
  const [pickedWeek, setPickedWeek] = useState<number | null>(null)
  const [chip, setChip] = useState(ALL_POSITIONS)
  const [streamed, setStreamed] = useState<{
    key: string
    week: number
    rows: StreamRow[]
  } | null>(null)
  const [streamFailed, setStreamFailed] = useState<{ key: string; message: string } | null>(null)
  const [streamChoice, setStreamChoice] = useState<Record<string, number>>({})
  useNoteContext('mode', {
    label: mode === 'ros' ? 'rest of season' : `streaming wk ${pickedWeek ?? 'next'}`,
    data: { season, mode, week: pickedWeek, position: chip }
  })

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
    void api.waiver
      .adds(season)
      .then((adds) => {
        if (cancelled) return
        setLoaded({ key, adds })
        setChoice({})
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, key])

  // Spec §8: keep the previous lists on screen while a refresh computes.
  const adds = loaded?.adds ?? null
  const notice = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const claim = adds ? claimPosition(adds) : null
  const choose: Choose = (k, i) => setChoice((c) => ({ ...c, [k]: i }))

  // Spec §4: the picker's weeks; a week a sync moved past falls back to the current one.
  const weeks = adds ? streamWeeks(adds.currentWeek, adds.lastWeek) : []
  const week = pickedWeek !== null && weeks.includes(pickedWeek) ? pickedWeek : (weeks[0] ?? null)
  const streamKey =
    streamOn && season !== null && week !== null ? `${season}|${dataVersion}|${week}` : null
  useEffect(() => {
    if (season === null || week === null || streamKey === null) return
    let cancelled = false
    void api.waiver
      .stream(season, week)
      .then((rows) => {
        if (cancelled) return
        setStreamed({ key: streamKey, week, rows })
        setStreamChoice({})
      })
      .catch((err) => {
        if (!cancelled) setStreamFailed({ key: streamKey, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, week, streamKey])

  const streamError =
    streamFailed !== null && streamFailed.key === streamKey ? streamFailed.message : null
  const streamNote =
    streamError !== null
      ? null
      : streamed === null
        ? 'Running the numbers…'
        : streamed.key !== streamKey
          ? 'Refreshing…'
          : null
  const chooseStream: Choose = (k, i) => setStreamChoice((c) => ({ ...c, [k]: i }))
  const switchMode = (m: WaiverMode): void => {
    setMode(m)
    if (m === 'stream') setStreamOn(true)
  }

  return (
    <>
      <Masthead
        kicker={
          [
            league,
            adds ? `Week ${adds.currentWeek}` : null,
            adds ? `${adds.weeks} weeks left` : null
          ]
            .filter(Boolean)
            .join(' · ') || 'Waivers'
        }
        title="The Waiver Wire"
        below={<ModeTabs tabs={WAIVER_MODES} value={mode} onChange={switchMode} />}
        right={
          adds &&
          claim !== null && (
            <div className="flex items-end gap-3">
              <div className="pb-1">
                <ScoreLabel top="Your claim" bottom="priority" />
              </div>
              <div className="flex items-start">
                <span className="ed-numeral">{claim}</span>
                <span className="font-cond text-[26px] leading-none font-extrabold text-brand-fg uppercase">
                  {ordinalSuffix(claim)}
                </span>
              </div>
              <span className="pb-1 font-cond text-[13px] leading-none font-bold tracking-[0.14em] text-fg-3 uppercase">
                of {adds.teamCount}
              </span>
            </div>
          )
        }
      />
      {notice && <div className="flex flex-1 items-center justify-center text-bad">{notice}</div>}
      {!adds && !notice && <div className="ed-loading flex-1">Working the wire…</div>}
      {mode === 'ros' && adds && (
        <RestOfSeason
          adds={adds}
          choice={choice}
          onChoose={choose}
          sort={sort}
          onSort={setSort}
          onOpen={setSelected}
        />
      )}
      {mode === 'stream' && adds && week !== null && (
        <Streaming
          weeks={weeks}
          week={week}
          currentWeek={adds.currentWeek}
          onWeek={setPickedWeek}
          chip={chip}
          onChip={setChip}
          result={streamed}
          note={streamNote}
          error={streamError}
          choice={streamChoice}
          onChoose={chooseStream}
          onOpen={setSelected}
        />
      )}
      <EditionFooter
        legend={[
          { swatch: <Swatch className="bg-good" />, label: 'Gain' },
          { swatch: <Swatch className="bg-bad" />, label: 'Cost' },
          { swatch: <Swatch className="bg-warn" />, label: 'Questionable' }
        ]}
      >
        <span className="truncate">
          Gains are your best lineup with the pickup minus without it, on Sleeper projections under
          your scoring.
        </span>
      </EditionFooter>
      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </>
  )
}
