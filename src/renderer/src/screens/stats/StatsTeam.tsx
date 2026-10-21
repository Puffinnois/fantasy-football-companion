import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MineDot, Segmented, StatsSelect } from '@/components/stats/controls'
import {
  HeatCell,
  Loading,
  MiniTable,
  NavButton,
  PlayerName,
  SectionHead
} from '@/components/stats/parts'
import { ScopeBar } from '@/components/stats/ScopeBar'
import { StatSection, StatSections } from '@/components/stats/StatLines'
import { WeekChart } from '@/components/stats/WeekChart'
import { fmtStat } from '@/lib/stats/format'
import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
import {
  chartWeeks,
  gamesInScope,
  nextGame,
  nextGameView,
  noGamesNote,
  personnelQuery,
  personnelRows,
  resultCards,
  rosterQuery,
  rosterView,
  scheduleRows,
  sectionQueries,
  sectionViews,
  specialistsQuery,
  splitQueries,
  splitRows,
  standing,
  STANDING_METRICS,
  TAB_SECTIONS,
  TEAM_DASH_TABS,
  teamGames,
  teamRecord,
  usageGrid,
  usageQuery,
  USAGE_METRICS,
  weeklyQuery,
  weekSeries,
  type SectionDef,
  type SplitKey,
  type ShareRow,
  type TeamGame,
  type TeamTab
} from '@/lib/stats/team'
import { useStatsQueries, useStatsQuery, useTeamGames, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { STATS_TEAMS, TEAM_NAMES } from '@shared/stats/nflTeams'
import type { MetricInfo, StatsResult } from '@shared/stats/types'

/** The dashboard is about one team: never another team's (or tab's) answers while its own load. */
const FRESH = { keepLast: false }

interface TabProps {
  data: StatsData
  scope: StatsScope
  team: string
  games: TeamGame[] | null
}

/**
 * Spec §9.3 team dashboard: the handoff's team page ("8. Team") as its header and Overview, and
 * the spec's stat tabs in the same language.
 */
export function StatsTeam({
  data,
  scope,
  onScope,
  hasLeague,
  team,
  onTeam,
  tab,
  onTab,
  onOpenLeaderboard
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  team: string
  onTeam: (team: string) => void
  tab: TeamTab
  onTab: (tab: TeamTab) => void
  /** The team leaderboard (spec §9.2). */
  onOpenLeaderboard: () => void
}): React.JSX.Element {
  const { games: raw, error: gamesError } = useTeamGames(scope.season, team, data.version)
  const games = useMemo(() => (raw ? teamGames(raw, team) : null), [raw, team])
  // The standing needs every team's record: the Overview's ratings query carries it.
  const overview = useMemo(
    () => sectionQueries(TAB_SECTIONS.overview, scope, data.status, STANDING_METRICS),
    [scope, data.status]
  )
  const { results: ratings } = useStatsQueries(overview, data.version, FRESH)
  const props: TabProps = { data, scope, team, games }

  return (
    <div className="flex flex-col gap-5 px-8 pt-[22px] pb-8">
      <Header
        data={data}
        scope={scope}
        onScope={onScope}
        hasLeague={hasLeague}
        team={team}
        onTeam={onTeam}
        games={games}
        place={scope.seasonType === 'REG' ? standing(ratings?.get('all'), team) : null}
      />
      <div className="flex items-end justify-between gap-4 border-b border-line">
        <div role="tablist" aria-label="Team dashboard" className="flex gap-[22px]">
          {TEAM_DASH_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => onTab(t.id)}
              className={cn(
                'h-8 cursor-pointer text-[13.5px] leading-none',
                t.id === tab
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
          onClick={onOpenLeaderboard}
          className="mb-2 cursor-pointer text-[12.5px] font-medium text-fg-2 hover:text-cobalt"
        >
          Team leaderboards →
        </button>
      </div>
      {gamesError && <div className="text-[12.5px] text-bad">{gamesError}</div>}
      {games && !gamesInScope(games, scope, data.status).some((g) => g.played) && (
        <div className="rounded-[8px] bg-panel-2 px-4 py-3 text-[13px] text-fg-2">
          {noGamesNote(team, scope, data.status)}
        </div>
      )}
      {tab === 'overview' && <Overview {...props} ratings={ratings} />}
      {(tab === 'offense' || tab === 'defense' || tab === 'special' || tab === 'tendencies') && (
        <LinesTab key={tab} {...props} sections={TAB_SECTIONS[tab]} tab={tab} />
      )}
      {tab === 'situational' && <Situational {...props} />}
      {tab === 'players' && <Players {...props} />}
      {tab === 'schedule' && <Schedule {...props} />}
      {tab === 'forecast' && <Forecast {...props} />}
    </div>
  )
}

function Header({
  data,
  scope,
  onScope,
  hasLeague,
  team,
  onTeam,
  games,
  place
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  team: string
  onTeam: (team: string) => void
  games: TeamGame[] | null
  place: string | null
}): React.JSX.Element {
  const inScope = games ? gamesInScope(games, scope, data.status) : []
  // Until the team's games arrive, no tile shows another team's record.
  const rec = games ? teamRecord(inScope) : null
  const cards = games ? resultCards(games, scope, data.status) : []
  const i = STATS_TEAMS.indexOf(team)
  const step = (d: number): void =>
    onTeam(STATS_TEAMS[(i + d + STATS_TEAMS.length) % STATS_TEAMS.length])
  const owner = data.ownership?.teams[team]
  const tiles: [string, string, string?][] = [
    ['Record', rec?.record ?? '—'],
    ['Points / game', rec?.pointsPerGame ?? '—'],
    ['Allowed / game', rec?.allowedPerGame ?? '—'],
    ['Margin', rec?.margin ?? '—', rec?.tone]
  ]
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <NavButton title="Previous team" onClick={() => step(-1)}>
              <ChevronLeft className="size-3.5" />
            </NavButton>
            <StatsSelect
              title="Team"
              value={team}
              options={STATS_TEAMS.map((t) => ({ value: t, label: t }))}
              onChange={onTeam}
              className="h-[26px] font-mono"
            />
            <NavButton title="Next team" onClick={() => step(1)}>
              <ChevronRight className="size-3.5" />
            </NavButton>
            <span className="ml-2 truncate text-[12.5px] text-fg-3">
              {TEAM_NAMES[team] ?? team}
              {place ? ` · ${place}` : ''} · {rangeLabel(scope, data.status)}
            </span>
            {owner && (
              <span className="flex items-center gap-1.5 text-[12px] text-fg-2">
                {owner.mine ? <MineDot title="Your fantasy defense" /> : null}
                {owner.mine ? 'Your defense' : `Defense rostered by ${owner.name}`}
              </span>
            )}
          </div>
          <div className="flex items-end gap-[22px]">
            <h1 className="m-0 font-sans text-[52px] leading-[0.85] font-bold tracking-[-0.04em]">
              {team}
            </h1>
            <div className="flex gap-px overflow-hidden rounded-[8px] bg-line shadow-[0_0_0_1px_var(--line)]">
              {tiles.map(([label, value, tone]) => (
                <div key={label} className="flex flex-col gap-[5px] bg-panel px-3.5 py-2">
                  <span className="text-[11px] leading-none font-medium text-fg-3">{label}</span>
                  <span
                    className={cn(
                      'font-cond text-[24px] leading-[0.9] font-extrabold tabular-nums',
                      tone === 'good' && 'text-good',
                      tone === 'bad' && 'text-bad'
                    )}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
      </div>
      {cards.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Results">
          {cards.map((c) => (
            <div
              key={c.key}
              role="listitem"
              className="flex w-[58px] shrink-0 flex-col items-center gap-1 rounded-[7px] bg-panel pt-[7px] pb-1.5 shadow-[0_0_0_1px_var(--line)]"
            >
              <span className="font-mono text-[10.5px] leading-none text-fg-3">{c.week}</span>
              <span
                className={cn(
                  'font-mono text-[12.5px] leading-none font-semibold',
                  c.opponent === 'BYE' && 'text-fg-3'
                )}
              >
                {c.opponent}
              </span>
              {c.score ? (
                <span
                  className={cn(
                    'rounded-[4px] px-[5px] py-0.5 font-mono text-[10.5px] leading-none font-semibold whitespace-nowrap',
                    c.result === 'W' && 'bg-good-s text-good',
                    c.result === 'L' && 'bg-bad-s text-bad',
                    c.result === 'T' && 'bg-panel-2'
                  )}
                >
                  {c.score}
                </span>
              ) : (
                <span className="font-mono text-[10.5px] leading-none text-fg-3">—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </header>
  )
}

function ShareBar({ row }: { row: ShareRow }): React.JSX.Element {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-line-2">
        <span
          className="block h-full rounded-[3px] bg-cobalt"
          style={{ width: `${Math.max(2, Math.min(100, row.bar * 100))}%` }}
        />
      </span>
      <span className="w-8 text-right font-semibold">{Math.round(row.share * 100)}%</span>
    </span>
  )
}

/** Handoff "8. Team" tables, then the spec's Overview: ratings, the next game, the EPA trend. */
function Overview({
  data,
  scope,
  team,
  games,
  ratings
}: TabProps & { ratings: Map<SplitKey, StatsResult> | null }): React.JSX.Element {
  const q = useMemo(() => rosterQuery(team, scope, data.status), [team, scope, data.status])
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  const weekly = useMemo(
    () => weeklyQuery(team, ['off_epa_play', 'def_epa_play'], scope, data.status),
    [team, scope, data.status]
  )
  const { result: wk } = useStatsQuery(weekly, data.version, FRESH)
  const v = result ? rosterView(result, data.ownership) : null
  const sections = ratings
    ? sectionViews(TAB_SECTIONS.overview, ratings, team, data.byId, scope.season)
    : null
  const weeks = chartWeeks(wk, scope, data.status)
  const series = weekSeries(wk, ['off_epa_play', 'def_epa_play'], weeks, data.byId)
  const next = games ? nextGame(games) : null
  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-9">
      <div className="flex flex-col gap-7">
        {!v ? (
          <Loading error={error} />
        ) : (
          <>
            <section className="flex flex-col gap-2.5">
              <SectionHead title="Who gets the targets" note={`${v.teamTargets} team targets`} />
              <MiniTable
                columns="minmax(0,1fr) 40px 150px 36px 44px 28px 44px"
                head={['Player', 'TGT', 'Share', 'REC', 'YDS', 'TD', 'FP/G']}
                rows={v.targets.map((r) => ({
                  key: r.id,
                  cells: [
                    <PlayerName key="n" name={r.name} position={r.position} mine={r.mine} />,
                    r.cells[0],
                    <ShareBar key="s" row={r} />,
                    <span key="r" className="text-fg-2">
                      {r.cells[1]}
                    </span>,
                    r.cells[2],
                    <span key="t" className="text-fg-2">
                      {r.cells[3]}
                    </span>,
                    <span key="f" className="font-cond text-[15px] font-bold">
                      {r.cells[4]}
                    </span>
                  ]
                }))}
              />
            </section>
            <section className="flex flex-col gap-2.5">
              <SectionHead title="Who gets the carries" note={`${v.teamCarries} team carries`} />
              <MiniTable
                columns="minmax(0,1fr) 36px 120px 44px 34px 26px"
                head={['Player', 'ATT', 'Share', 'YDS', 'Y/C', 'TD']}
                rows={v.carries.map((r) => ({
                  key: r.id,
                  cells: [
                    <PlayerName key="n" name={r.name} position={r.position} mine={r.mine} />,
                    r.cells[0],
                    <ShareBar key="s" row={r} />,
                    r.cells[1],
                    <span key="y" className="text-fg-2">
                      {r.cells[2]}
                    </span>,
                    <span key="t" className="text-fg-2">
                      {r.cells[3]}
                    </span>
                  ]
                }))}
              />
            </section>
            {v.passers.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <SectionHead title="Passing" />
                <MiniTable
                  columns="minmax(0,1fr) 64px 48px 28px 28px 36px"
                  head={['Quarterback', 'C/A', 'YDS', 'TD', 'INT', 'Y/A']}
                  rows={v.passers.map((r) => ({
                    key: r.id,
                    cells: [
                      <PlayerName key="n" name={r.name} position={null} mine={r.mine} />,
                      ...r.cells
                    ]
                  }))}
                />
              </section>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-7">
        {next && <NextGame game={next} team={team} />}
        {sections && <StatSection section={sections[0]} />}
        <section className="flex flex-col gap-2.5">
          <SectionHead title="EPA per play by week" note="Offense, and allowed by the defense" />
          <WeekChart
            series={series.map((s) =>
              s.id === 'def_epa_play'
                ? { ...s, label: 'Defense (allowed)' }
                : { ...s, label: 'Offense' }
            )}
            format={(x) => fmtStat(x, { unit: 'epa', decimals: 2 })}
            label={`${team} EPA per play by week`}
          />
        </section>
      </div>
    </div>
  )
}

/** Spec §9.1 / §9.3: the next game, Elo beside the market. */
function NextGame({ game, team }: { game: TeamGame; team: string }): React.JSX.Element {
  const v = nextGameView(game, team)
  const cell = (label: string, value: string, sub?: string): React.JSX.Element => (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] leading-none font-medium text-fg-3">{label}</span>
      <span className="font-cond text-[26px] leading-[0.9] font-extrabold tabular-nums">
        {value}
      </span>
      {sub && <span className="font-mono text-[11px] leading-none text-fg-2">{sub}</span>}
    </div>
  )
  return (
    <section
      aria-label="Next game"
      className="flex flex-col gap-3 rounded-[10px] bg-panel p-4 shadow-[0_0_0_1px_var(--line)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">
          Next: {v.where === 'Away' ? '@' : 'vs'} {v.opponent}
        </h2>
        <span className="text-[12px] leading-none text-fg-3">
          {v.when} · {v.where}
          {v.weather ? ` · ${v.weather}` : ''}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {cell('Elo win probability', v.elo.winProb, v.elo.spread)}
        {v.vegas
          ? cell('Market', v.vegas.winProb, `${v.vegas.spread} · total ${v.vegas.total}`)
          : cell('Market', '—', 'No line yet')}
      </div>
      {v.gap && <span className="text-[12px] text-fg-3">{v.gap}.</span>}
    </section>
  )
}

/** Offense, Defense, Special teams, Tendencies: the tab's stat lines, and the tab's own table. */
function LinesTab({
  data,
  scope,
  team,
  sections,
  tab
}: TabProps & { sections: SectionDef[]; tab: TeamTab }): React.JSX.Element {
  const queries = useMemo(
    () => sectionQueries(sections, scope, data.status),
    [sections, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  return (
    <div className="flex flex-col gap-8">
      {results ? (
        <StatSections sections={sectionViews(sections, results, team, data.byId, scope.season)} />
      ) : (
        <Loading error={error} />
      )}
      {tab === 'special' && <Specialists data={data} scope={scope} team={team} />}
      {tab === 'tendencies' && <Personnel data={data} scope={scope} team={team} />}
    </div>
  )
}

function Specialists({ data, scope, team }: Omit<TabProps, 'games'>): React.JSX.Element | null {
  const q = useMemo(() => specialistsQuery(team, scope, data.status), [team, scope, data.status])
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  if (error) return <Loading error={error} />
  if (!result) return null
  const f = (id: string, v: number | null | undefined): string => {
    const m = data.byId.get(id)
    return fmtStat(v ?? null, { unit: m?.unit ?? 'number', decimals: m?.decimals ?? 1 })
  }
  const kickers = result.rows.filter((r) => (r.values.fg_att?.value ?? 0) > 0)
  const punters = result.rows.filter((r) => (r.values.punts?.value ?? 0) > 0)
  const cells = (r: (typeof result.rows)[number], ids: string[]): string[] =>
    ids.map((id) => f(id, r.values[id]?.value))
  return (
    <div className="grid grid-cols-2 items-start gap-9">
      <section className="flex flex-col gap-2.5">
        <SectionHead title="Kickers" />
        <MiniTable
          columns="minmax(0,1fr) 56px 56px 56px 56px 56px"
          head={['Kicker', 'FG', 'FG %', '50+ %', 'FGOE', 'XP %']}
          rows={kickers.map((r) => ({
            key: r.id,
            cells: [
              <PlayerName key="n" name={r.name} position="K" mine={false} />,
              `${f('fg_made', r.values.fg_made?.value)}/${f('fg_att', r.values.fg_att?.value)}`,
              ...cells(r, ['fg_pct', 'fg_pct_50p', 'fgoe', 'pat_pct'])
            ]
          }))}
        />
      </section>
      <section className="flex flex-col gap-2.5">
        <SectionHead title="Punters" />
        <MiniTable
          columns="minmax(0,1fr) 56px 64px 64px"
          head={['Punter', 'Punts', 'Net avg', 'Inside 20']}
          rows={punters.map((r) => ({
            key: r.id,
            cells: [
              <PlayerName key="n" name={r.name} position="P" mine={false} />,
              ...cells(r, ['punts', 'punt_net_avg', 'punt_in20_rate'])
            ]
          }))}
        />
      </section>
    </div>
  )
}

function Personnel({ data, scope, team }: Omit<TabProps, 'games'>): React.JSX.Element | null {
  const q = useMemo(() => personnelQuery(team, scope, data.status), [team, scope, data.status])
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  if (error) return <Loading error={error} />
  if (!result) return null
  const rows = personnelRows(result)
  return (
    <section className="flex max-w-[640px] flex-col gap-2.5">
      <SectionHead title="Personnel groupings" note="Offense · RB and TE on the field" />
      {rows.length === 0 ? (
        <p className="m-0 text-[12.5px] text-fg-3">
          Personnel comes from participation data, published after the season.
        </p>
      ) : (
        <MiniTable
          columns="minmax(0,1fr) 56px 150px 64px 64px"
          head={['Personnel', 'Plays', 'Share', 'EPA/play', 'Success']}
          rows={rows.map((r) => ({
            key: r.personnel,
            cells: [
              <span key="p" className="font-mono font-semibold">
                {r.personnel}
              </span>,
              fmtStat(r.plays, { unit: 'count', decimals: 0 }),
              <ShareBar
                key="s"
                row={{
                  id: r.personnel,
                  name: r.personnel,
                  position: null,
                  mine: false,
                  share: r.share,
                  bar: r.share / (rows[0].share || 1),
                  cells: []
                }}
              />,
              r.epa,
              r.success
            ]
          }))}
        />
      )}
    </section>
  )
}

/** Spec §9.3 Situational: drives and downs, then a table of splits. */
function Situational({ data, scope, team }: TabProps): React.JSX.Element {
  const sections = TAB_SECTIONS.situational
  const lineQueries = useMemo(
    () => sectionQueries(sections, scope, data.status),
    [sections, scope, data.status]
  )
  const { results: lines, error } = useStatsQueries(lineQueries, data.version, FRESH)
  const sq = useMemo(() => splitQueries(scope, data.status), [scope, data.status])
  const { results: splits, error: splitError } = useStatsQueries(sq, data.version, FRESH)
  const heads = ['EPA/play', 'Success', 'EPA/play allowed', 'Success allowed']
  return (
    <div className="flex flex-col gap-8">
      {lines ? (
        <StatSections sections={sectionViews(sections, lines, team, data.byId, scope.season)} />
      ) : (
        <Loading error={error} />
      )}
      <section className="flex flex-col gap-2.5">
        <SectionHead
          title="By situation"
          note="Rank among the 32 teams in the same situation · two-minute: the last two minutes of each half"
        />
        {splits ? (
          <MiniTable
            columns="minmax(0,1fr) 64px 104px 92px 64px 104px 104px"
            head={[
              'Situation',
              'Off. plays',
              ...heads.slice(0, 2),
              'Def. plays',
              ...heads.slice(2)
            ]}
            rows={splitRows(splits, team, data.byId, scope.season).map((r) => {
              const cell = (k: number): React.JSX.Element => {
                const c = r.cells[k]
                return <HeatCell key={k} {...c} />
              }
              return {
                key: r.key,
                cells: [
                  <span key="l" className="font-sans text-[13px] font-medium">
                    {r.label}
                  </span>,
                  <span key="o" className="text-fg-2">
                    {r.offPlays}
                  </span>,
                  cell(0),
                  cell(1),
                  <span key="d" className="text-fg-2">
                    {r.defPlays}
                  </span>,
                  cell(2),
                  cell(3)
                ]
              }
            })}
          />
        ) : (
          <Loading error={splitError} />
        )}
      </section>
    </div>
  )
}

/** Spec §9.3 Players: usage shares across the roster, week by week. */
function Players({ data, scope, team }: TabProps): React.JSX.Element {
  const [metric, setMetric] = useState(USAGE_METRICS[0].id)
  const queries = useMemo(
    () =>
      new Map([
        ['season', usageQuery(team, scope, data.status, false)],
        ['weekly', usageQuery(team, scope, data.status, true)]
      ]),
    [team, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  if (!results) return <Loading error={error} />
  const weekly = results.get('weekly')!
  const weeks = chartWeeks(weekly, scope, data.status)
  const rows = usageGrid(results.get('season')!, weekly, metric, weeks, data.ownership)
  const info: MetricInfo | undefined = data.byId.get(metric)
  const pct = (v: number | null): string =>
    v === null ? '' : fmtStat(v, { unit: 'pct', decimals: 0 })
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <SectionHead
          title={`${info?.label ?? metric} by week`}
          note={rows.some((r) => r.estimated) ? 'est.: routes estimated this season' : undefined}
        />
        <Segmented
          label="Usage"
          value={metric}
          options={USAGE_METRICS.map((m) => ({ value: m.id, label: m.label }))}
          onChange={setMetric}
        />
      </div>
      <div className="overflow-x-auto rounded-[8px] border border-line bg-panel">
        <table className="w-full border-collapse font-mono text-[12px] tabular-nums">
          <thead>
            <tr className="h-8 border-b border-line text-[11px] text-fg-3">
              <th className="sticky left-0 bg-panel px-3 text-left font-sans font-medium">
                Player
              </th>
              <th className="px-2 text-right font-medium">Range</th>
              {weeks.map((w) => (
                <th key={w} className="min-w-[44px] px-1 text-center font-medium">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="h-[34px] border-b border-line-2">
                <td className="sticky left-0 bg-panel px-3">
                  <PlayerName name={r.name} position={r.position} mine={r.mine} />
                </td>
                <td className="px-2 text-right font-semibold">
                  {pct(r.season)}
                  {r.estimated && <span className="ml-1 text-[10px] text-fg-3">est.</span>}
                </td>
                {r.cells.map((c, i) => (
                  <td key={weeks[i]} className="p-0.5 text-center">
                    <span
                      className="block rounded-[4px] py-1"
                      style={
                        c === null
                          ? undefined
                          : {
                              background: `color-mix(in oklch, var(--cobalt) ${Math.round(Math.min(1, c) * 38)}%, transparent)`
                            }
                      }
                    >
                      {c === null ? <span className="text-fg-3">·</span> : pct(c)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-10 text-center text-[13px] text-fg-3">No player has a share.</div>
        )}
      </div>
    </section>
  )
}

/** Spec §9.3 Schedule: every game with its result, line, Elo probability and weather. */
function Schedule({ data, scope, team, games }: TabProps): React.JSX.Element {
  const sections: SectionDef[] = useMemo(
    () => [TAB_SECTIONS.forecast.find((s) => s.title === 'Schedule strength')!],
    []
  )
  const queries = useMemo(
    () => sectionQueries(sections, scope, data.status),
    [sections, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  if (!games) return <Loading />
  const rows = scheduleRows(games, team)
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-9">
      <section className="flex flex-col gap-2.5">
        <SectionHead
          title={`${scope.season} schedule`}
          note="Win probability for this team · opponent Elo before the game"
        />
        <MiniTable
          columns="40px 52px minmax(0,1fr) 82px 52px 52px 76px 64px minmax(0,1fr)"
          head={[
            'Wk',
            'Date',
            'Opponent',
            'Result',
            'Elo',
            'Market',
            'Line',
            'Opp. Elo',
            'Weather'
          ]}
          rows={rows.map((r) => ({
            key: r.key,
            cells: [
              <span key="w" className="text-fg-3">
                {r.week}
              </span>,
              <span key="d" className="text-fg-2">
                {r.date}
              </span>,
              <span key="o" className="font-semibold">
                {r.opponent}
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
                <span key="s" className="text-fg-3">
                  —
                </span>
              ),
              r.elo,
              r.vegas,
              <span key="l" className="text-fg-2">
                {r.line}
              </span>,
              <span
                key="e"
                className={cn(
                  r.strength === 'hard' && 'text-bad',
                  r.strength === 'easy' && 'text-good'
                )}
              >
                {r.opponentElo}
              </span>,
              <span key="x" className="truncate text-fg-2">
                {r.weather}
              </span>
            ]
          }))}
        />
      </section>
      {results ? (
        <StatSection section={sectionViews(sections, results, team, data.byId, scope.season)[0]} />
      ) : (
        <Loading error={error} />
      )}
    </div>
  )
}

/** The Forecast's two charts: the odds, and adjusted EPA, week by week. */
const FORECAST_WEEKLY = ['playoff_pct', 'division_pct', 'adj_off_epa', 'adj_def_epa']

/** Spec §9.3 Forecast: the next game, the season's odds and how they moved, ratings and luck. */
function Forecast({ data, scope, team, games }: TabProps): React.JSX.Element {
  const sections = TAB_SECTIONS.forecast
  const queries = useMemo(
    () => sectionQueries(sections, scope, data.status),
    [sections, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  const weekly = useMemo(
    () => weeklyQuery(team, FORECAST_WEEKLY, scope, data.status),
    [team, scope, data.status]
  )
  const { result: wk } = useStatsQuery(weekly, data.version, FRESH)
  const weeks = chartWeeks(wk, scope, data.status)
  const series = weekSeries(wk, FORECAST_WEEKLY, weeks, data.byId)
  const next = games ? nextGame(games) : null
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-9">
        <section className="flex flex-col gap-2.5">
          <SectionHead
            title="Playoff and division odds by week"
            note="Season simulation, as of each week"
          />
          <WeekChart
            series={series.slice(0, 2).map((s, k) => ({
              ...s,
              label: k === 0 ? 'Playoffs' : 'Division'
            }))}
            domain={[0, 1]}
            format={(x) => fmtStat(x, { unit: 'pct', decimals: 0 })}
            label={`${team} playoff and division odds by week`}
          />
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHead
            title="Adjusted EPA per play by week"
            note="Opponent-adjusted, as of each week"
          />
          <WeekChart
            series={series.slice(2).map((s, k) => ({
              ...s,
              label: k === 0 ? 'Offense' : 'Defense (allowed)'
            }))}
            format={(x) => fmtStat(x, { unit: 'epa', decimals: 2 })}
            label={`${team} adjusted EPA per play by week`}
          />
        </section>
      </div>
      {next && (
        <div className="max-w-[560px]">
          <NextGame game={next} team={team} />
        </div>
      )}
      {results ? (
        <StatSections sections={sectionViews(sections, results, team, data.byId, scope.season)} />
      ) : (
        <Loading error={error} />
      )}
    </div>
  )
}
