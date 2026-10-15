import { useEffect, useState } from 'react'
import {
  EditionFooter,
  InjuryTag,
  Masthead,
  MeChip,
  ModeTabs,
  PosChip,
  ScoreLabel,
  Swatch,
  ToneChip,
  type Tone
} from '@/components/edition'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import {
  DEFAULT_PLAYOFF_TEAMS,
  initials,
  lastWeekTrend,
  ordinalSuffix,
  recordText,
  rosTier,
  rosTierLine,
  signedOne,
  sortTeams,
  standLine,
  STRENGTH_NOTE,
  teamLabel,
  TEAM_SORTS,
  type RosTier,
  type TeamSort
} from '@/lib/leagueView'
import { cn } from '@/lib/utils'
import type { League, PointsContext, RosterPlayer, Team, TeamStrength } from '@shared/types'

const GROUPS: { slot: RosterPlayer['slot']; label: string }[] = [
  { slot: 'starter', label: 'Starters' },
  { slot: 'bench', label: 'Bench' },
  { slot: 'ir', label: 'Injured reserve' },
  { slot: 'taxi', label: 'Taxi' }
]
const GRID = 'grid-cols-[52px_minmax(0,1fr)_66px_72px_72px_70px_56px]'
const ROSTER_GRID = 'grid-cols-[34px_minmax(0,1fr)_50px_50px]'

const TIER_TONE: Record<RosTier, Tone> = {
  good: 'good',
  bad: 'bad',
  mid: 'neutral',
  none: 'neutral'
}
const fmt1 = (n: number): string => n.toFixed(1)
const diffClass = (d: number): string =>
  d > 0 ? 'font-semibold text-good' : d < 0 ? 'font-semibold text-bad' : 'text-fg-2'

function Monogram({
  name,
  isMe,
  big
}: {
  name: string
  isMe: boolean
  big?: boolean
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center font-cond leading-none font-extrabold tracking-[0.04em]',
        big ? 'size-12 rounded-[4px] text-[22px]' : 'size-[30px] rounded-[3px] text-[14px]',
        isMe
          ? 'bg-brand text-on-brand'
          : big
            ? 'bg-ink text-paper'
            : 'bg-panel-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]'
      )}
    >
      {initials(name)}
    </span>
  )
}

function RosterRow({
  p,
  weeksPlayed,
  onOpen
}: {
  p: RosterPlayer
  weeksPlayed: number
  onOpen: () => void
}): React.JSX.Element {
  const trend = lastWeekTrend(p.seasonPoints, p.lastWeekPoints, weeksPlayed)
  const meta = [p.team ?? 'FA', p.byeWeek ? `Bye ${p.byeWeek}` : null].filter(Boolean).join(' · ')
  return (
    <div
      role="button"
      tabIndex={0}
      title="Open player file"
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cn(
        'grid h-[42px] cursor-pointer items-center gap-x-2 border-b border-line hover:bg-hover',
        ROSTER_GRID
      )}
    >
      <PosChip position={p.position} size="sm" />
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13.5px] leading-[1.1] font-semibold">{p.fullName}</span>
          <InjuryTag status={p.injuryStatus} />
        </div>
        <span className="truncate text-[11.5px] leading-[1.1] text-fg-3">{meta}</span>
      </div>
      {p.statsAvailable ? (
        <>
          <span className="text-right font-cond text-[19px] leading-none font-extrabold">
            {p.seasonPoints === null ? '—' : fmt1(p.seasonPoints)}
          </span>
          <span
            className={cn(
              'text-right text-[13px] leading-none',
              trend === 'up' && 'font-semibold text-good',
              trend === 'down' && 'font-semibold text-bad',
              trend === null && 'text-fg-3'
            )}
          >
            {trend === 'up' && <span className="mr-[3px] text-[8px]">▲</span>}
            {trend === 'down' && <span className="mr-[3px] text-[8px]">▼</span>}
            {p.lastWeekPoints === null ? '—' : fmt1(p.lastWeekPoints)}
          </span>
        </>
      ) : (
        <span
          className="col-span-2 text-right text-[11.5px] text-fg-3"
          title="This player could not be matched to nflverse data"
        >
          stats unavailable
        </span>
      )}
    </div>
  )
}

interface LeagueScreenProps {
  /** Roster row click: open the player file on the Players board. */
  onOpenPlayer?: (playerId: string) => void
}

export function LeagueScreen({ onOpenPlayer }: LeagueScreenProps): React.JSX.Element {
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [strengths, setStrengths] = useState<TeamStrength[]>([])
  const [sort, setSort] = useState<TeamSort>('record')
  const [selected, setSelected] = useState<number | null>(null)
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ctx, setCtx] = useState<PointsContext | null>(null)
  const [playoffTeams, setPlayoffTeams] = useState(DEFAULT_PLAYOFF_TEAMS)

  useEffect(() => {
    void api.league
      .pointsContext()
      .then(setCtx)
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .get()
      .then(setLeague)
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .teams()
      .then((list) => {
        setTeams(list)
        setSelected(
          (current) => current ?? list.find((t) => t.isMe)?.rosterId ?? list[0]?.rosterId ?? null
        )
      })
      .catch((err) => setError(errorMessage(err)))
    void api.rules
      .get()
      .then((r) => {
        const n = r?.settings.playoffTeams
        if (n && n > 0) setPlayoffTeams(n)
      })
      .catch(() => undefined)
  }, [])

  // Strength is keyed on the season the value build runs on (a number; `League.season` is a string).
  const season = ctx?.season ?? null
  useEffect(() => {
    if (season === null) return
    let cancelled = false
    void api.lineup
      .strength(season)
      .then((list) => {
        if (!cancelled) setStrengths(list)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [season])

  useEffect(() => {
    if (selected === null) return
    let cancelled = false
    void api.league
      .roster(selected)
      .then((r) => {
        if (!cancelled) setRoster(r)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const list = teams ?? []
  const n = list.length
  const standings = sortTeams(list, [], 'record')
  const place = new Map(standings.map((t, i) => [t.rosterId, i + 1]))
  const ordered = sortTeams(list, strengths, sort)
  const strengthById = new Map(strengths.map((s) => [s.rosterId, s]))
  const rankOf = (t: Team): number | null => strengthById.get(t.rosterId)?.rank ?? null
  const isRos = sort === 'strength'
  const me = list.find((t) => t.isMe) ?? null
  const mePlace = me ? (place.get(me.rosterId) ?? null) : null
  const lastWeek = ctx?.lastWeek ?? null
  const kicker = [league?.name, league?.season, lastWeek ? `Through week ${lastWeek}` : null]
    .filter(Boolean)
    .join(' · ')

  const sel = list.find((t) => t.rosterId === selected) ?? null
  const selPlace = sel ? (place.get(sel.rosterId) ?? n) : n
  const selTier = sel ? rosTier(rankOf(sel), n) : 'none'
  const selDiff = sel ? sel.fpts - sel.fptsAgainst : 0
  const groups = GROUPS.map((g) => {
    const players = roster.filter((p) => p.slot === g.slot)
    if (g.slot === 'starter')
      players.sort((a, b) => (a.starterIndex ?? 99) - (b.starterIndex ?? 99))
    else players.sort((a, b) => (b.seasonPoints ?? 0) - (a.seasonPoints ?? 0))
    return { ...g, players }
  }).filter((g) => g.players.length > 0)

  return (
    <>
      <Masthead
        kicker={kicker || 'League'}
        title="The Standings"
        below={
          <ModeTabs
            tabs={TEAM_SORTS.map((s) => ({ key: s.key, label: s.label }))}
            value={sort}
            onChange={setSort}
          />
        }
        right={
          me &&
          mePlace !== null && (
            <div className="flex items-center gap-2.5">
              <ScoreLabel top="Your spot" bottom={recordText(me)} />
              <div className="ed-numeral flex items-start">
                {mePlace}
                <span className="mt-0.5 ml-0.5 font-cond text-[26px] leading-none font-extrabold tracking-[0.02em] text-brand-fg uppercase">
                  {ordinalSuffix(mePlace)}
                </span>
              </div>
            </div>
          )
        }
      />
      <div className="flex min-h-0 flex-1 pl-8">
        <div className="min-w-0 flex-1 overflow-auto pr-7">
          <div
            className={cn(
              'ed-label sticky top-0 z-[2] grid h-[34px] items-end gap-x-2.5 border-b-2 border-ink bg-paper pb-[7px] text-fg-2',
              GRID
            )}
          >
            <span className="pl-1">{isRos ? 'ROS' : '#'}</span>
            <span>Team</span>
            <span className="text-right">W–L</span>
            <span className="text-right" title="Points for">
              PF
            </span>
            <span className="text-right" title="Points against">
              PA
            </span>
            <span className="text-right" title="Points for minus points against">
              +/−
            </span>
            <span
              className="text-right"
              title={`Rest-of-season roster strength rank. ${STRENGTH_NOTE}`}
            >
              ROS
            </span>
          </div>
          {error && <p className="py-3 text-bad">{error}</p>}
          {teams === null && !error && <div className="ed-loading">Loading the table…</div>}
          {isRos && teams !== null && (
            <p className="pt-2 pb-1 text-[12px] text-fg-3">{STRENGTH_NOTE}</p>
          )}
          {ordered.map((t, i) => {
            const pl = place.get(t.rosterId) ?? 0
            const rank = rankOf(t)
            const isSel = t.rosterId === selected
            const diff = t.fpts - t.fptsAgainst
            const name = teamLabel(t)
            return (
              <div key={t.rosterId}>
                <button
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => setSelected(t.rosterId)}
                  className={cn(
                    'relative isolate grid h-[46px] w-full cursor-pointer items-center gap-x-2.5 border-b border-line text-left hover:bg-hover',
                    GRID,
                    isSel ? 'bg-panel-2' : t.isMe && 'bg-me'
                  )}
                >
                  <span
                    className={cn(
                      'pl-1 font-cond text-[26px] leading-none font-extrabold',
                      isSel ? 'text-brand-fg' : pl <= playoffTeams ? 'text-fg' : 'text-fg-3'
                    )}
                  >
                    {isRos ? (rank ?? '—') : pl}
                  </span>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Monogram name={name} isMe={t.isMe} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-[7px]">
                        <span className="truncate text-[14.5px] leading-[1.1] font-semibold tracking-[-0.01em]">
                          {name}
                        </span>
                        {t.isMe && <MeChip className="px-1.5 text-[11px]">YOU</MeChip>}
                      </div>
                      <span className="truncate text-[12px] leading-[1.1] text-fg-3">
                        {t.displayName}
                      </span>
                    </div>
                  </div>
                  <span className="text-right font-cond text-[20px] leading-none font-extrabold">
                    {recordText(t)}
                  </span>
                  <span className="text-right text-[13.5px] leading-none">{fmt1(t.fpts)}</span>
                  <span className="text-right text-[13.5px] leading-none text-fg-2">
                    {fmt1(t.fptsAgainst)}
                  </span>
                  <span className={cn('text-right text-[13.5px] leading-none', diffClass(diff))}>
                    {signedOne(diff)}
                  </span>
                  <span className="flex justify-end">
                    <ToneChip
                      tone={TIER_TONE[rosTier(rank, n)]}
                      className="min-w-9 text-[15px]"
                      title={strengthById.get(t.rosterId)?.rosTotal?.toFixed(1)}
                    >
                      {rank === null ? '—' : `#${rank}`}
                    </ToneChip>
                  </span>
                </button>
                {!isRos && i === playoffTeams - 1 && i < ordered.length - 1 && (
                  <div className="flex h-7 items-center gap-2.5 shadow-[inset_0_2px_0_var(--ink)]">
                    <span className="pl-1 font-cond text-[12.5px] leading-none font-extrabold tracking-[0.14em] uppercase">
                      Playoff line
                    </span>
                    <span className="text-[12px] leading-none text-fg-3">
                      Top {playoffTeams} make it
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <aside className="w-[452px] shrink-0 overflow-auto border-l border-line pt-0 pr-8 pb-6 pl-7">
          {sel && (
            <div className="flex flex-col gap-4 pt-5">
              <div className="flex items-center gap-3.5">
                <Monogram name={teamLabel(sel)} isMe={sel.isMe} big />
                <div className="flex min-w-0 flex-col gap-[7px]">
                  <span className="truncate font-mono text-[11.5px] leading-none font-semibold tracking-[0.05em] text-brand-fg uppercase">
                    {sel.isMe ? `Your team · ${sel.displayName}` : `Managed by ${sel.displayName}`}
                  </span>
                  <span className="font-cond text-[34px] leading-[0.9] font-extrabold text-balance uppercase">
                    {teamLabel(sel)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[14.5px] leading-[1.35] font-medium">
                <span
                  className={cn('size-2 shrink-0', selPlace <= playoffTeams ? 'bg-good' : 'bg-bad')}
                />
                <span>{standLine(standings, selPlace, playoffTeams)}</span>
              </div>
              <div className="grid grid-cols-4 border-t-2 border-b border-ink border-b-line">
                {[
                  { label: 'Record', value: recordText(sel), cls: '' },
                  { label: 'Pts for', value: fmt1(sel.fpts), cls: '' },
                  { label: 'Against', value: fmt1(sel.fptsAgainst), cls: 'text-fg-2' },
                  {
                    label: '+/−',
                    value: signedOne(selDiff),
                    cls: selDiff > 0 ? 'text-good' : selDiff < 0 ? 'text-bad' : ''
                  }
                ].map((c, i) => (
                  <div
                    key={c.label}
                    className={cn(
                      'flex flex-col gap-1.5 pt-2.5 pb-3',
                      i > 0 && 'border-l border-line pl-3'
                    )}
                  >
                    <span className="font-cond text-[12px] leading-none font-bold tracking-[0.12em] text-fg-3 uppercase">
                      {c.label}
                    </span>
                    <span
                      className={cn('font-cond text-[32px] leading-[0.85] font-extrabold', c.cls)}
                    >
                      {c.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2.5 text-[13px] text-fg-2">
                <ToneChip tone={TIER_TONE[selTier]} className="text-[13px] tracking-[0.08em]">
                  ROS {rankOf(sel) === null ? '—' : `#${rankOf(sel)}`}
                </ToneChip>
                <span>{rosTierLine(selTier, n)}</span>
              </div>
              {groups.map((g) => (
                <div key={g.slot} className="flex flex-col">
                  <div
                    className={cn(
                      'grid h-[30px] items-end gap-x-2 border-b-2 border-ink pb-1.5 font-cond text-[12px] leading-none font-bold tracking-[0.12em] text-fg-3 uppercase',
                      ROSTER_GRID
                    )}
                  >
                    <span className="col-span-2 font-extrabold tracking-[0.14em] text-fg">
                      {g.label} <span className="text-fg-3">{g.players.length}</span>
                    </span>
                    <span className="text-right">Season</span>
                    <span className="text-right">{lastWeek ? `Wk ${lastWeek}` : 'Last'}</span>
                  </div>
                  {g.players.map((p) => (
                    <RosterRow
                      key={p.playerId}
                      p={p}
                      weeksPlayed={lastWeek ?? 1}
                      onOpen={() => onOpenPlayer?.(p.playerId)}
                    />
                  ))}
                </div>
              ))}
              {groups.length === 0 && <p className="text-fg-3">No players on this roster.</p>}
            </div>
          )}
        </aside>
      </div>
      <EditionFooter
        legend={[
          { swatch: <Swatch className="bg-good" />, label: 'Top-third roster' },
          { swatch: <Swatch className="bg-bad" />, label: 'Bottom-third roster' },
          { swatch: <span className="text-[9px]">▲▼</span>, label: 'Last week vs. average' }
        ]}
      >
        <span>
          <span className="font-semibold text-fg">{n || '—'}</span> teams · top {playoffTeams} make
          the playoffs · last points: {lastWeek ? `week ${lastWeek}` : '—'}
        </span>
      </EditionFooter>
    </>
  )
}
