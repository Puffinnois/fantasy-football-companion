import { useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Mark } from '@/components/edition'
import { StatsSelect } from '@/components/stats/controls'
import { ReliabilityMarker } from '@/components/stats/MetricCard'
import { Headshot, HeatCell, Loading, MiniTable, SectionHead } from '@/components/stats/parts'
import { PlayerRail } from '@/components/stats/PlayerRail'
import { ScopeBar } from '@/components/stats/ScopeBar'
import { PercentileBar, StatSection, StatSections } from '@/components/stats/StatLines'
import { WeekChart } from '@/components/stats/WeekChart'
import { api } from '@/lib/api'
import { fmtStat } from '@/lib/stats/format'
import { qualifies } from '@/lib/stats/leaderboard'
import {
  bornOf,
  careerQuery,
  careerRows,
  combineView,
  fantasyRank,
  fantasyRankQuery,
  gameLog,
  gameLogQuery,
  inFantasy,
  kindOf,
  lineHead,
  lineRow,
  LINE_METRICS,
  LOG_COLUMNS,
  nextMatchup,
  opponentDefenseQuery,
  opponentQuery,
  opponentRows,
  outlookView,
  overviewSections,
  playerHeader,
  playerQuery,
  playerSectionQueries,
  playerSectionViews,
  playerTabs,
  pointsSeries,
  positionGroup,
  positionTab,
  profileQuery,
  projectionView,
  railQuery,
  railRows,
  sectionsFor,
  shrunkQuery,
  shrunkRows,
  sizeOf,
  splitHead,
  splitTable,
  splitTableQueries,
  tabFor,
  teammateOptions,
  teammateQueries,
  teammatesQuery,
  tileViews,
  TILES,
  type PlayerKind,
  type PlayerTab
} from '@/lib/stats/player'
import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
import { chartWeeks, weekSeries } from '@/lib/stats/team'
import {
  useFantasyDetail,
  usePlayerBio,
  usePlayerLink,
  usePlayerOutlook,
  useSeasonGames,
  useStatsQueries,
  useStatsQuery,
  type StatsData
} from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import type { PlayerBio, PositionGroup, StatsRow } from '@shared/stats/types'

/** The dashboard is about one player: never another player's (or tab's) answers while his own load. */
const FRESH = { keepLast: false }

const POS_BG: Record<string, string> = {
  QB: 'bg-pos-qb',
  RB: 'bg-pos-rb',
  WR: 'bg-pos-wr',
  TE: 'bg-pos-te',
  K: 'bg-pos-k'
}

interface TabProps {
  data: StatsData
  scope: StatsScope
  player: string
  position: PositionGroup
  bio: PlayerBio | null
  /** The league's key with a league (Fantasy's projections), null without one. */
  league: number | null
}

/** The player shown: his gsis id and the position group his dashboard follows. */
export interface PlayerRef {
  id: string
  position: PositionGroup | null
}

/**
 * Spec §9.4 player dashboard: the handoff's player profile ("6. Player profile": the ranked rail,
 * the header, tiles, percentile rankings) as its frame, and the spec's tabs by position group.
 */
export function StatsPlayer({
  data,
  scope,
  onScope,
  hasLeague,
  player,
  onPlayer,
  tab,
  onTab,
  onOpenTeam,
  onOpenLeaderboard,
  leagueKey = 0,
  onOpenFantasyPlayer
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  player: PlayerRef
  onPlayer: (player: PlayerRef) => void
  tab: PlayerTab
  onTab: (tab: PlayerTab) => void
  onOpenTeam: (team: string) => void
  /** The player leaderboard at his position (spec §9.2). */
  onOpenLeaderboard: (position: PositionGroup) => void
  /** Bumped when league data changed: the link to Fantasy is read again. */
  leagueKey?: number
  /** His file in Companion Fantasy (spec §9.4), with a league. */
  onOpenFantasyPlayer?: (playerId: string) => void
}): React.JSX.Element {
  const { bio, error: bioError } = usePlayerBio(player.id, data.version)
  const position: PositionGroup | null =
    player.position ?? positionGroup(bio?.id === player.id ? bio.position : null)
  // The rail follows the player shown; a position picked in it shows until its leader opens.
  const [picking, setPicking] = useState<PositionGroup | null>(null)
  if (picking !== null && picking === position) setPicking(null)
  const railPosition: PositionGroup = picking ?? position ?? 'WR'
  const [rankBy, setRankBy] = useState<Partial<Record<PositionGroup, string>>>({})
  const metric = rankBy[railPosition] ?? positionTab(railPosition).sort
  const rq = useMemo(
    () => railQuery(railPosition, metric, scope, data.status, data.byId),
    [railPosition, metric, scope, data.status, data.byId]
  )
  const rail = useStatsQuery(rq, data.version)
  const railFor = (search: string): ReturnType<typeof railRows> =>
    rail.result
      ? railRows(rail.result, railPosition, metric, data.byId, data.ownership, search, player.id)
      : []
  // A position picked in the rail opens its first player (the rail's own query, asked here).
  const pick = (p: PositionGroup): void => {
    if (p === position) {
      setPicking(null)
      return
    }
    setPicking(p)
    const m = rankBy[p] ?? positionTab(p).sort
    void api.stats
      .query(railQuery(p, m, scope, data.status, data.byId))
      .then((r) => {
        const top = railRows(r, p, m, data.byId, null, '', null)[0]
        if (top) onPlayer({ id: top.id, position: p })
      })
      .catch(() => {})
  }

  // His row in scope (the rail's query): undefined until it is known.
  const row =
    rail.result && position === railPosition && !rail.loading
      ? (rail.result.rows.find((r) => r.id === player.id) ?? null)
      : undefined
  const fq = useMemo(
    () => (position ? fantasyRankQuery(position, scope, data.status) : null),
    [position, scope, data.status]
  )
  const { result: fr } = useStatsQuery(fq, data.version, FRESH)
  const shown: PlayerTab = position ? tabFor(tab, position) : 'overview'

  return (
    <div className="flex min-h-0 flex-1">
      <PlayerRail
        position={railPosition}
        onPosition={pick}
        metric={metric}
        onMetric={(m) => setRankBy((r) => ({ ...r, [railPosition]: m }))}
        rows={railFor}
        loading={rail.loading}
        error={rail.error}
        range={rangeLabel(scope, data.status)}
        byId={data.byId}
        selected={player.id}
        onSelect={(id) => onPlayer({ id, position: railPosition })}
      />
      <div className="min-w-0 flex-1 overflow-auto [scrollbar-width:thin]">
        {bioError ? (
          <Loading error={bioError} />
        ) : !bio || bio.id !== player.id || !position ? (
          <Loading />
        ) : (
          <div className="flex flex-col gap-5 px-8 pt-[22px] pb-8">
            <Header
              data={data}
              scope={scope}
              onScope={onScope}
              hasLeague={hasLeague}
              bio={bio}
              position={position}
              row={row}
              qualified={row ? qualifies(row, positionTab(position)) : true}
              rank={position ? fantasyRank(fr, player.id, position, scope) : null}
              onOpenTeam={onOpenTeam}
              leagueKey={leagueKey}
              onOpenFantasyPlayer={onOpenFantasyPlayer}
            />
            <div className="flex items-end justify-between gap-4 border-b border-line">
              <div role="tablist" aria-label="Player dashboard" className="flex gap-[22px]">
                {playerTabs(position).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={t.id === shown}
                    onClick={() => onTab(t.id)}
                    className={cn(
                      'h-8 cursor-pointer text-[13.5px] leading-none whitespace-nowrap',
                      t.id === shown
                        ? 'font-semibold text-fg shadow-[inset_0_-2px_0_var(--fg)]'
                        : 'font-medium text-fg-3 hover:text-fg'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onOpenLeaderboard(position)}
                className="mb-2 cursor-pointer text-[12.5px] font-medium whitespace-nowrap text-fg-2 hover:text-cobalt"
              >
                Player leaderboards →
              </button>
            </div>
            {row === null && (
              <div className="rounded-[8px] bg-panel-2 px-4 py-3 text-[13px] text-fg-2">
                {bio.name} played no games in {rangeLabel(scope, data.status)}.
              </div>
            )}
            <TabBody
              key={`${player.id}:${shown}`}
              tab={shown}
              data={data}
              scope={scope}
              player={player.id}
              position={position}
              bio={bio}
              league={hasLeague ? leagueKey : null}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function TabBody(props: TabProps & { tab: PlayerTab }): React.JSX.Element {
  const { tab, ...rest } = props
  switch (tab) {
    case 'overview':
      return <Overview {...rest} />
    case 'log':
      return <GameLog {...rest} />
    case 'splits':
      return <Splits {...rest} />
    case 'forecast':
      return <Forecast {...rest} />
    case 'profile':
      return <Profile {...rest} />
    default:
      return <LinesTab {...rest} tab={tab} />
  }
}

function Header({
  data,
  scope,
  onScope,
  hasLeague,
  bio,
  position,
  row,
  qualified,
  rank,
  onOpenTeam,
  leagueKey,
  onOpenFantasyPlayer
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  bio: PlayerBio
  position: PositionGroup
  row: StatsRow | null | undefined
  qualified: boolean
  rank: string | null
  onOpenTeam: (team: string) => void
  leagueKey: number
  onOpenFantasyPlayer?: (playerId: string) => void
}): React.JSX.Element {
  const h = playerHeader(bio, row, scope, data.status)
  const team = row?.team ?? bio.team
  const fantasy =
    hasLeague && onOpenFantasyPlayer && inFantasy(position) ? onOpenFantasyPlayer : null
  const link = usePlayerLink(fantasy ? bio.id : null, leagueKey)
  const owner = data.ownership?.players[bio.id] ?? null
  return (
    <header className="flex items-end justify-between gap-6">
      <div className="flex min-w-0 items-end gap-4">
        <Headshot name={bio.name} sleeperId={bio.sleeperId} size={72} />
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] leading-none font-medium text-fg-2">
            <span
              className={cn(
                'rounded-[4px] px-[7px] py-1 font-mono text-[11.5px] font-semibold text-on-pos',
                POS_BG[position] ?? 'bg-pos-def'
              )}
            >
              {position}
            </span>
            {team && (
              <button
                type="button"
                title="Open the team’s dashboard"
                onClick={() => onOpenTeam(team)}
                className="cursor-pointer underline decoration-line underline-offset-[3px] hover:text-cobalt"
              >
                {team}
              </button>
            )}
            <span className="text-fg-3">·</span>
            <span>{h.games}</span>
            {row && !qualified && (
              <span
                title={`Below the ${position} leaderboard’s qualifying sample`}
                className="rounded-[4px] px-1.5 py-[3px] font-mono text-[11px] text-fg-3 shadow-[inset_0_0_0_1px_var(--line)]"
              >
                Not qualified
              </span>
            )}
            {h.status && (
              <span
                title={h.status.title}
                className={cn(
                  'rounded-[4px] px-1.5 py-[3px] font-mono text-[11px] font-semibold',
                  h.status.tone === 'bad' ? 'bg-bad-s text-bad' : 'bg-warn-s text-warn'
                )}
              >
                {h.status.tag}
              </span>
            )}
            {rank && (
              <span className="rounded-[4px] bg-panel-2 px-1.5 py-[3px] font-mono text-[11px] text-fg-2">
                {rank}
              </span>
            )}
          </div>
          <h1 className="m-0 flex flex-col gap-0.5">
            <span className="text-[20px] leading-none font-normal tracking-[-0.01em] text-fg-2">
              {h.first}
            </span>{' '}
            <span className="text-[40px] leading-none font-bold tracking-[-0.035em]">{h.last}</span>
          </h1>
          <span className="text-[12px] leading-[1.35] text-fg-3">{h.facts.join(' · ')}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-3">
        <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="Compare comes in a later update"
            className="flex h-8 cursor-default items-center rounded-[8px] bg-cobalt px-3.5 text-[12.5px] font-medium text-on-cobalt opacity-40"
          >
            Compare
          </button>
          {fantasy && (
            <button
              type="button"
              disabled={!link}
              onClick={() => link && fantasy(link.sleeper)}
              title={link ? 'Open in Companion Fantasy' : 'Not in your league’s player list'}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-3 text-[12.5px] font-medium text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-50"
            >
              <Mark size={14} />
              {owner?.mine
                ? 'On your fantasy team'
                : owner
                  ? `Rostered by ${owner.name}`
                  : 'Free agent in your league'}
              <ArrowUpRight className="size-[13px]" />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

/** The handoff's tiles, the percentile rankings, fantasy points by week, the season and the career. */
function Overview({ data, scope, player, position, bio }: TabProps): React.JSX.Element {
  const kind = kindOf(position)
  const sections = useMemo(() => overviewSections(position, data.byId), [position, data.byId])
  const queries = useMemo(
    () => playerSectionQueries(sections, position, scope, data.status, TILES[position]),
    [sections, position, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  const points = pointsSeries(kind)
  const wq = useMemo(
    () => (points.length ? playerQuery(player, points, scope, data.status, ['week']) : null),
    [player, points, scope, data.status]
  )
  const { result: weekly } = useStatsQuery(wq, data.version, FRESH)
  const lq = useMemo(() => {
    const m = new Map([['season', playerQuery(player, LINE_METRICS[kind], scope, data.status)]])
    const career = bio ? careerQuery(bio, kind, scope, false) : null
    if (career) m.set('career', career)
    return m
  }, [player, kind, scope, data.status, bio])
  const { results: lines } = useStatsQueries(lq, data.version, FRESH)
  if (!results) return <Loading error={error} />
  const all = results.get('all')
  const tiles = tileViews(all, player, position, data.byId, scope.season)
  const views = playerSectionViews(sections, results, player, position, data.byId, scope.season)
  const pool = all
    ? all.rows.filter((r) => r.position === position && qualifies(r, positionTab(position))).length
    : 0
  const weeks = chartWeeks(weekly, scope, data.status)
  const series = weekSeries(weekly, points, weeks, data.byId).map((s) => ({
    ...s,
    label: s.id === 'expected_points' ? 'Expected' : 'Fantasy points'
  }))
  return (
    <div className="flex flex-col gap-7">
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-[10px] bg-line shadow-[0_0_0_1px_var(--line)]">
        {tiles.map((t) => (
          <div
            key={t.metric}
            className="flex flex-col gap-2 bg-panel px-4 py-3.5"
            title={t.title || undefined}
          >
            <span className="text-[12px] leading-[1.2] font-medium text-fg-3">{t.label}</span>
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-cond text-[40px] leading-[0.85] font-extrabold tabular-nums">
                {t.value}
              </span>
              {t.chip && (
                <span
                  className={cn(
                    'rounded-[4px] px-1.5 py-[3px] font-mono text-[11px] leading-none',
                    t.heat === 'good' && 'bg-good-s font-semibold text-good',
                    t.heat === 'bad' && 'bg-bad-s font-semibold text-bad',
                    t.heat === 'mid' && 'font-medium text-fg-3'
                  )}
                >
                  {t.chip}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-8">
        {views[0] ? (
          <StatSection section={{ ...views[0], note: `vs ${pool} qualified ${position}s` }} />
        ) : (
          <span />
        )}
        <div className="flex flex-col gap-7">
          {points.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <SectionHead
                title="Fantasy points by week"
                note={points.length > 1 ? 'Against expected points, same scoring' : undefined}
              />
              <WeekChart
                series={series}
                format={(x) => fmtStat(x, { unit: 'points', decimals: 1 })}
                label={`${bio?.name ?? 'Player'} fantasy points by week`}
              />
            </section>
          )}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="Season and career" note="Career: regular seasons since 2019" />
            <LineTable
              kind={kind}
              data={data}
              rows={[
                lineRow(
                  'season',
                  String(scope.season),
                  lines?.get('season')?.rows[0],
                  kind,
                  data.byId
                ),
                lineRow('career', 'Career', lines?.get('career')?.rows[0], kind, data.byId)
              ]}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

function LineTable({
  kind,
  data,
  rows,
  first = 'Season'
}: {
  kind: PlayerKind
  data: StatsData
  rows: ReturnType<typeof lineRow>[]
  first?: string
}): React.JSX.Element {
  const head = lineHead(kind, data.byId)
  return (
    <MiniTable
      columns={`minmax(0,1fr) 32px ${head.map(() => 'minmax(40px,auto)').join(' ')}`}
      head={[first, 'G', ...head]}
      rows={rows.map((r) => ({
        key: r.key,
        cells: [
          <span key="l" className="font-sans text-[13px] font-medium">
            {r.label}
          </span>,
          <span key="g" className="text-fg-2">
            {r.games}
          </span>,
          ...r.cells
        ]
      }))}
    />
  )
}

/** A stat tab: its sections, ranked among the position's qualified players. */
function LinesTab({
  data,
  scope,
  player,
  position,
  tab
}: TabProps & { tab: PlayerTab }): React.JSX.Element {
  const sections = useMemo(() => sectionsFor(tab, position, data.byId), [tab, position, data.byId])
  const queries = useMemo(
    () => playerSectionQueries(sections, position, scope, data.status),
    [sections, position, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  if (!results) return <Loading error={error} />
  return (
    <StatSections
      sections={playerSectionViews(sections, results, player, position, data.byId, scope.season)}
    />
  )
}

/** Handoff "Game log": a row per week, the result from his team's side, fantasy and expected points. */
function GameLog({ data, scope, player, position }: TabProps): React.JSX.Element {
  const kind = kindOf(position)
  const q = useMemo(
    () => gameLogQuery(player, kind, scope, data.status),
    [player, kind, scope, data.status]
  )
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  const { games } = useSeasonGames(scope.season, data.version)
  if (!result) return <Loading error={error} />
  const rows = gameLog(result, games, kind, data.byId, scope, data.status)
  const cols = LOG_COLUMNS[kind]
  const fp = rows.some((r) => r.points !== null)
  const xfp = rows.some((r) => r.expected !== null)
  const head = [
    'Wk',
    'Opp',
    'Result',
    ...cols.map((c) => c.label),
    ...(fp ? ['FP'] : []),
    ...(xfp ? ['xFP'] : [])
  ]
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHead
        title="Game log"
        note={`${rangeLabel(scope, data.status)}${xfp ? ' · xFP: expected fantasy points' : ''}`}
      />
      <MiniTable
        columns={`36px 64px 84px ${cols.map(() => 'minmax(44px,1fr)').join(' ')}${fp ? ' 52px' : ''}${xfp ? ' 52px' : ''}`}
        head={head}
        left={[1, 2]}
        rows={rows.map((r) => ({
          key: r.key,
          cells: [
            <span key="w" className="text-fg-3">
              {r.week}
            </span>,
            <span key="o" className="font-semibold whitespace-nowrap">
              {r.opponent || '—'}
            </span>,
            r.score ? (
              <span
                key="s"
                className={cn(
                  'rounded-[4px] px-[5px] py-0.5 text-[11px] font-semibold whitespace-nowrap',
                  r.result === 'W' && 'bg-good-s text-good',
                  r.result === 'L' && 'bg-bad-s text-bad',
                  r.result === 'T' && 'bg-panel-2'
                )}
              >
                {r.score}
              </span>
            ) : (
              <span key="s" className="text-[11.5px] whitespace-nowrap text-fg-3">
                {r.note ?? '—'}
              </span>
            ),
            ...r.cells.map((c, i) => (
              <span key={`c${i}`} className={cn(r.note && 'text-fg-3')}>
                {c}
              </span>
            )),
            ...(fp
              ? [
                  <span key="fp" className="font-cond text-[16px] font-bold">
                    {r.points ?? ''}
                  </span>
                ]
              : []),
            ...(xfp
              ? [
                  <span key="xfp" className="text-fg-2">
                    {r.expected ?? ''}
                  </span>
                ]
              : [])
          ]
        }))}
      />
    </section>
  )
}

/** Spec §9.4 Splits: games, quarters, score, downs and the position's play splits; opponents; a teammate. */
function Splits({ data, scope, player, position, bio }: TabProps): React.JSX.Element {
  const queries = useMemo(
    () => splitTableQueries(position, scope, data.status),
    [position, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  const oq = useMemo(
    () => opponentQuery(player, position, scope, data.status),
    [player, position, scope, data.status]
  )
  const { result: opp } = useStatsQuery(oq, data.version, FRESH)
  if (!results) return <Loading error={error} />
  const head = splitHead(position, data.byId)
  const columns = `minmax(130px,1fr) 72px ${head
    .slice(1)
    .map(() => 'minmax(84px,1fr)')
    .join(' ')}`
  const groups = splitTable(results, player, position, data.byId, scope.season)
  const oppRows = opponentRows(opp, position, data.byId)
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2.5">
        <SectionHead
          title="By situation"
          note={`Rank among qualified ${position}s in the same split`}
        />
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="m-0 text-[12.5px] leading-none font-semibold text-fg-2">
                  {g.title}
                </h3>
                {g.note && <span className="text-[11.5px] leading-none text-fg-3">{g.note}</span>}
              </div>
              <MiniTable
                columns={columns}
                head={['Split', ...head]}
                rows={g.rows.map((r) => ({
                  key: r.key,
                  cells: [
                    <span key="l" className="font-sans text-[13px] font-medium">
                      {r.label}
                    </span>,
                    <span key="p" className="text-fg-2">
                      {r.plays}
                    </span>,
                    ...r.cells.map((c, i) => <HeatCell key={i} {...c} />)
                  ]
                }))}
              />
            </div>
          ))}
        </div>
      </section>
      {oppRows.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionHead title="By opponent" />
          <MiniTable
            columns={`minmax(130px,1fr) 72px ${head
              .slice(1)
              .map(() => 'minmax(84px,1fr)')
              .join(' ')}`}
            head={['Opponent', 'G', ...head.slice(1)]}
            rows={oppRows.map((r) => ({
              key: r.key,
              cells: [
                <span key="l" className="font-semibold">
                  {r.label}
                </span>,
                <span key="g" className="text-fg-2">
                  {r.games}
                </span>,
                ...r.cells
              ]
            }))}
          />
        </section>
      )}
      {bio?.team && (
        <Teammate
          data={data}
          scope={scope}
          player={player}
          position={position}
          team={bio.team}
          head={head}
        />
      )}
    </div>
  )
}

/** With and without a teammate on the field (participation, through the prior season). */
function Teammate({
  data,
  scope,
  player,
  position,
  team,
  head
}: Omit<TabProps, 'bio' | 'league'> & { team: string; head: string[] }): React.JSX.Element | null {
  const mq = useMemo(
    () => teammatesQuery(team, position, scope, data.status),
    [team, position, scope, data.status]
  )
  const { result: mates } = useStatsQuery(mq, data.version, FRESH)
  const options = teammateOptions(mates, player)
  const [picked, setPicked] = useState<string | null>(null)
  const mate = options.some((o) => o.value === picked) ? picked : (options[0]?.value ?? null)
  // The query hook keys on the queries' text: a new map each render runs nothing again.
  const tq = mate ? teammateQueries(player, mate, position, scope, data.status) : null
  const { results, error } = useStatsQueries(tq, data.version, FRESH)
  if (!options.length) return null
  const label = options.find((o) => o.value === mate)?.label ?? ''
  const metrics = (results?.get('with')?.columns ?? []).map((c) => c.id)
  const rowOf = (key: 'with' | 'without'): string[] => {
    const r = results?.get(key)?.rows[0]
    return metrics.map((id) => {
      const m = data.byId.get(id)
      return fmtStat(r?.values[id]?.value ?? null, {
        unit: m?.unit ?? 'number',
        decimals: m?.decimals ?? 1,
        kind: m?.kind
      })
    })
  }
  const empty = results && !results.get('with')?.rows.length && !results.get('without')?.rows.length
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-4">
        <SectionHead
          title="With and without a teammate"
          note="On the field together or not · participation data, published after each season"
        />
        <StatsSelect
          title="Teammate"
          value={mate ?? ''}
          options={options}
          onChange={setPicked}
          className="w-[220px]"
        />
      </div>
      {error ? (
        <Loading error={error} />
      ) : empty ? (
        <p className="m-0 text-[12.5px] text-fg-3">
          Not published for {scope.season} yet: participation comes out after the season.
        </p>
      ) : (
        <MiniTable
          columns={`minmax(130px,1fr) ${head
            .slice(1)
            .map(() => 'minmax(84px,1fr)')
            .join(' ')}`}
          head={['On the field', ...head.slice(1)]}
          rows={(['with', 'without'] as const).map((k) => ({
            key: k,
            cells: [
              <span key="l" className="font-sans text-[13px] font-medium">
                {k === 'with' ? 'With' : 'Without'} {label.replace(/ \(.*\)$/, '')}
              </span>,
              ...rowOf(k)
            ]
          }))}
        />
      )}
    </section>
  )
}

/** Spec §9.4 Forecast: the next matchup, the range of outcomes, trend, regression, schedule, profile. */
function Forecast({ data, scope, player, position, bio, league }: TabProps): React.JSX.Element {
  const oq = useMemo(
    () => ({ player, season: scope.season, scoring: scope.scoring }),
    [player, scope.season, scope.scoring]
  )
  const { outlook, error } = usePlayerOutlook(oq, data.version)
  const { games } = useSeasonGames(scope.season, data.version)
  const dq = useMemo(
    () => opponentDefenseQuery(position, scope, data.status),
    [position, scope, data.status]
  )
  const { result: defense } = useStatsQuery(dq, data.version, FRESH)
  const sq = useMemo(
    () => shrunkQuery(position, scope, data.status, data.byId),
    [position, scope, data.status, data.byId]
  )
  const { result: shrunk } = useStatsQuery(sq, data.version, FRESH)
  if (!outlook) return <Loading error={error} />
  const v = outlookView(outlook, data.byId)
  const next = nextMatchup(
    games,
    bio?.team ?? outlook.team,
    defense,
    position,
    data.byId,
    scope.season
  )
  const rates = shrunkRows(shrunk, player, data.byId)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-9">
      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Next game" note="Short term" />
          {next ? (
            <div className="flex flex-col gap-3 rounded-[10px] bg-panel p-4 shadow-[0_0_0_1px_var(--line)]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] leading-none font-semibold">
                  {next.where === 'Away' ? '@' : 'vs'} {next.opponent}
                </span>
                <span className="text-[12px] leading-none text-fg-3">
                  {next.when} · {next.where}
                </span>
              </div>
              <StatSection
                section={{
                  title: `${next.opponent}’s defense`,
                  note: 'Among the 32: 1st allows the least',
                  lines: next.lines
                }}
              />
            </div>
          ) : (
            <p className="m-0 text-[12.5px] text-fg-3">
              No game left in the {scope.season} season.
            </p>
          )}
        </section>
        <Projections
          data={data}
          scope={scope}
          player={player}
          position={position}
          league={league}
        />
        <section className="flex flex-col gap-2.5">
          <SectionHead
            title="Range of outcomes"
            note={`${scope.season} weeks, and his last 16 games`}
          />
          <MiniTable
            columns="minmax(0,1fr) 80px 80px"
            head={['Weekly fantasy points', String(scope.season), 'Last 16']}
            rows={v.range.map((r) => ({
              key: r.label,
              cells: [
                <span key="l" className="font-sans text-[13px]">
                  {r.label}
                </span>,
                r.season,
                r.last16
              ]
            }))}
          />
          <div className="flex gap-6 text-[12.5px] text-fg-2">
            {v.rates.map((r) => (
              <span key={r.label}>
                {r.label}: <span className="font-mono font-semibold text-fg">{r.value}</span>
              </span>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Schedule from here" note="Long term" />
          <p className="m-0 text-[12.5px] text-fg-2">{v.schedule ?? 'No games left to rate.'}</p>
        </section>
      </div>
      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Role" note="Last 4 games against the games before" />
          {v.trend.length ? (
            <MiniTable
              columns="minmax(0,1fr) 72px 72px 72px 64px"
              head={['Share', 'Season', 'Last 4', 'Change', '']}
              rows={v.trend.map((t) => ({
                key: t.metric,
                cells: [
                  <span key="l" className="font-sans text-[13px]">
                    {t.label}
                  </span>,
                  t.season,
                  t.last4,
                  t.change,
                  t.flag ? (
                    <span
                      key="f"
                      className={cn(
                        'text-[11px] font-semibold',
                        t.flag === 'up' ? 'text-good' : 'text-bad'
                      )}
                    >
                      {t.flag === 'up' ? 'Rising' : 'Falling'}
                    </span>
                  ) : (
                    ''
                  )
                ]
              }))}
            />
          ) : (
            <p className="m-0 text-[12.5px] text-fg-3">Not enough games yet.</p>
          )}
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Running hot or cold" note="Against what the position sustains" />
          {v.signals.map((s) => (
            <div key={s.metric} className="flex flex-col gap-1 border-t border-line-2 pt-2">
              <span className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="text-fg-2">{s.label}</span>
                <span className="font-mono">
                  {s.value} <span className="text-fg-3">· mean {s.mean}</span>
                </span>
              </span>
              <span
                className={cn(
                  'text-[12px]',
                  s.signal === 'hot' ? 'text-bad' : s.signal === 'cold' ? 'text-good' : 'text-fg-3'
                )}
              >
                {s.text}
              </span>
            </div>
          ))}
        </section>
        {rates.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <SectionHead
              title="Stability-weighted rates"
              note={`Pulled toward the ${position} mean by sample`}
            />
            <MiniTable
              columns="minmax(0,1fr) 72px 72px"
              head={['Rate', 'Raw', 'Weighted']}
              rows={rates.map((r) => ({
                key: r.metric,
                cells: [
                  <span key="l" className="flex items-center gap-1.5 font-sans text-[13px]">
                    {r.label}
                    {r.info && <ReliabilityMarker info={r.info} />}
                  </span>,
                  <span key="r" className="text-fg-2">
                    {r.raw}
                  </span>,
                  <span key="s" className="font-semibold">
                    {r.shrunk}
                  </span>
                ]
              }))}
            />
          </section>
        )}
      </div>
    </div>
  )
}

/**
 * Spec §9.4 Forecast, with a league: Sleeper's projection of the next game, the rest of the season
 * and its rank, FantasyPros' rank, from the Fantasy side (its scoring: the league's).
 */
function Projections({
  data,
  scope,
  player,
  position,
  league
}: Omit<TabProps, 'bio'>): React.JSX.Element {
  const current = scope.season === data.status?.through?.season
  const link = usePlayerLink(league !== null && current ? player : null, league)
  const { detail, error } = useFantasyDetail(
    link ? scope.season : null,
    link?.sleeper ?? null,
    league ?? 0
  )
  const v = detail ? projectionView(detail, position) : null
  const note =
    league === null
      ? 'Import a league for Sleeper’s projection and FantasyPros’ rank.'
      : !current
        ? `Projections are for the ${data.status?.through?.season ?? 'current'} season.`
        : link === null
          ? 'Not in your league’s player list.'
          : error
  const rows: [string, string][] = v
    ? [
        [
          'Next game (Sleeper)',
          v.next
            ? `${v.next.points} pts · week ${v.next.week}${v.next.opponent ? ` vs ${v.next.opponent}` : ''}`
            : '—'
        ],
        ['Rest of season', `${v.ros} pts${v.rosRank ? ` · ${v.rosRank}` : ''}`],
        ['FantasyPros rank', v.experts ?? '—']
      ]
    : []
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHead
        title="Projections"
        note={league === null ? undefined : 'Your league’s scoring'}
      />
      {note ? (
        <p className="m-0 text-[12.5px] text-fg-3">{note}</p>
      ) : (
        <div className="flex flex-col border-b border-line-2">
          {rows.map(([k, val]) => (
            <div
              key={k}
              className="flex h-[34px] items-center justify-between gap-3 border-t border-line-2 text-[12.5px]"
            >
              <span className="text-fg-2">{k}</span>
              <span className="font-mono font-medium">{val}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Spec §9.4 Profile: bio, combine with position percentiles, athletic score, career by season. */
function Profile({ data, scope, position, bio }: TabProps): React.JSX.Element {
  const kind = kindOf(position)
  const pq = useMemo(() => (bio ? profileQuery(bio) : null), [bio])
  const { result: profile } = useStatsQuery(pq, data.version, FRESH)
  const cq = useMemo(() => {
    const seasons = bio ? careerQuery(bio, kind, scope, true) : null
    const total = bio ? careerQuery(bio, kind, scope, false) : null
    return seasons && total
      ? new Map([
          ['seasons', seasons],
          ['career', total]
        ])
      : null
  }, [bio, kind, scope])
  const { results: career, error } = useStatsQueries(cq, data.version, FRESH)
  if (!bio) return <Loading />
  const c = combineView(profile)
  const facts: [string, string | null][] = [
    ['Born', bornOf(bio.birthDate)],
    ['Size', sizeOf(bio.height, bio.weight)],
    ['College', bio.college],
    [
      'Draft',
      bio.draft
        ? `${bio.draft.year} · round ${bio.draft.round}, pick ${bio.draft.pick}${bio.draft.team ? ` · ${bio.draft.team}` : ''}`
        : 'Undrafted'
    ],
    ['Rookie season', bio.rookieSeason ? String(bio.rookieSeason) : null],
    ['Team now', bio.team ? `${bio.team}${bio.jersey !== null ? ` · #${bio.jersey}` : ''}` : null]
  ]
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-9">
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Bio" />
          <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[12.5px]">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fg-3">{k}</dt>
                <dd className="m-0 text-fg">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHead
            title="Combine"
            note={`Percentile among ${position}s at every combine since 2000`}
          />
          {c.rows.every((r) => r.value === '—') ? (
            <p className="m-0 text-[12.5px] text-fg-3">No combine measurements for {bio.name}.</p>
          ) : (
            <>
              <div className="flex gap-6 text-[12.5px] text-fg-2">
                <span title="Each measure scored 0–10 by its percentile within the position, averaged (at least four measures); not Kent Lee Platte's RAS">
                  Athletic score (RAS-style){' '}
                  <span className="font-mono font-semibold text-fg">{c.ras ?? '—'}</span>
                  {c.measures !== null && (
                    <span className="text-fg-3"> · {c.measures} measures</span>
                  )}
                </span>
                <span title="200 × weight ÷ 40-time⁴">
                  Speed Score{' '}
                  <span className="font-mono font-semibold text-fg">{c.speedScore ?? '—'}</span>
                </span>
              </div>
              <div className="flex flex-col border-b border-line-2">
                {c.rows.map((r) => (
                  <div
                    key={r.id}
                    className="grid h-[34px] grid-cols-[130px_76px_minmax(110px,1fr)] items-center gap-3.5 border-t border-line-2 text-[12.5px]"
                  >
                    <span className="text-fg-2">{r.label}</span>
                    <span className={cn('text-right font-mono', r.value === '—' && 'text-fg-3')}>
                      {r.value}
                    </span>
                    {r.percentile !== null ? (
                      <div className="px-[13px]">
                        <PercentileBar percentile={r.percentile} />
                      </div>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      <section className="flex flex-col gap-2.5">
        <SectionHead title="Career by season" note="Regular seasons since 2019" />
        {career ? (
          <LineTable
            kind={kind}
            data={data}
            first="Season"
            rows={[
              ...careerRows(career.get('seasons') ?? null, kind, data.byId),
              lineRow('career', 'Career', career.get('career')?.rows[0], kind, data.byId)
            ]}
          />
        ) : (
          <Loading error={error} />
        )}
      </section>
    </div>
  )
}
