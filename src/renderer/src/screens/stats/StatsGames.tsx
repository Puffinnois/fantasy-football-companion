import { MineDot, PosText, StatsSelect } from '@/components/stats/controls'
import { Loading, SectionHead } from '@/components/stats/parts'
import { heatColor } from '@/lib/stats/format'
import {
  beforeGame,
  boxQueries,
  boxView,
  byeTeams,
  defaultWeek,
  faceView,
  forecastView,
  headerView,
  isPlayed,
  keyNote,
  keyPool,
  keySide,
  lastGames,
  matchupQueries,
  mergeResults,
  myPlayersQuery,
  myTeams,
  participants,
  participantsQuery,
  railGames,
  rushersQuery,
  seasonPlayersQuery,
  weekLabel,
  weekOptions,
  type BoxView,
  type FaceView,
  type ForecastView,
  type GamesState,
  type GamesTab,
  type HeaderSide,
  type HeaderView,
  type KeySide,
  type RailGame,
  type TeamCell
} from '@/lib/stats/games'
import { SCORING_LABELS, seasonOptions, type StatsScope } from '@/lib/stats/scope'
import {
  useSeasonGames,
  useStatsQueries,
  useStatsQuery,
  useWeekProjections,
  type StatsData
} from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import type { Scoring } from '@shared/stats/scoring'
import type { PositionGroup } from '@shared/stats/types'

/**
 * Games (stats-analysis spec §9.5, Plan AE; handoff "9. Game" and the "Stats Games" canvas): a
 * week's games in a rail; a game's preview (the forecast, each offense against the other defense
 * phase by phase, the key matchups) and, once it is final, its box score.
 */
export function StatsGames({
  data,
  scope,
  onScope,
  hasLeague,
  leagueKey,
  state,
  onState,
  onOpenTeam,
  onOpenPlayer
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  leagueKey: number
  state: GamesState
  onState: (update: (state: GamesState) => GamesState) => void
  onOpenTeam: (team: string) => void
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
}): React.JSX.Element {
  const season = scope.season
  const { games, error } = useSeasonGames(season, data.version)
  const mineQuery = useStatsQuery(myPlayersQuery(data.ownership, season), data.version)
  const mine = myTeams(data.ownership, mineQuery.result)
  const weeks = games ? weekOptions(games) : []
  const week =
    state.week !== null && weeks.some((w) => w.value === state.week)
      ? state.week
      : games
        ? defaultWeek(games)
        : null
  const rail = games && week !== null ? railGames(games, week, mine) : []
  const picked = rail.find((r) => r.id === state.game) ?? rail[0] ?? null
  const game = games?.find((g) => g.gameId === picked?.id) ?? null
  const played = game !== null && isPlayed(game)
  const tab: GamesTab = !played ? 'preview' : (state.tab ?? 'box')
  const before = game ? beforeGame(game) : null

  // The preview's queries: each team before the game, its players, the pass rushers. Answers
  // are this game's only: another game's numbers must not stand in while its own load.
  const fresh = { keepLast: false }
  const matchups = useStatsQueries(
    before ? matchupQueries(before, scope.scoring) : null,
    data.version,
    fresh
  )
  const matchup = matchups.results ? mergeResults([...matchups.results.values()]) : null
  const seasonPlayers = useStatsQuery(
    before ? seasonPlayersQuery(before, scope.scoring) : null,
    data.version,
    fresh
  )
  const last = games && game && !played ? lastGames(games, game) : {}
  const lastPlayers = useStatsQuery(
    game && !played ? participantsQuery(game, last) : null,
    data.version,
    fresh
  )
  const rushers = useStatsQuery(
    before && game ? rushersQuery(before, [game.away, game.home]) : null,
    data.version,
    fresh
  )
  const boxes = useStatsQueries(
    game && played ? boxQueries(game, scope.scoring) : null,
    data.version,
    fresh
  )
  const box = boxes.results ? mergeResults([...boxes.results.values()]) : null
  const boxed = box && game ? boxView(box, game, data.ownership) : null
  const pools = participants(lastPlayers.result, last)
  const sideOf = (
    team: string,
    opponent: string,
    projected: ReadonlyMap<string, number> | null
  ): KeySide =>
    keySide(team, opponent, {
      played: keyPool(team, played ? box : null, pools),
      season: seasonPlayers.result,
      matchups: matchup,
      rushers: rushers.result,
      ownership: data.ownership,
      scored: boxed?.scored ?? null,
      projected,
      range: before?.label ?? ''
    })
  // Sleeper's projections for the key players of a game not played yet, with a league.
  // The key players wait for who plays (the last game's players, or a final game's box score)
  // and for the pass rushers: chosen from the season's rows alone, the injured would lead.
  const pooled =
    seasonPlayers.result !== null &&
    !rushers.loading &&
    (played ? box !== null : !lastPlayers.loading)
  const keyIds =
    game && hasLeague && !played && game.seasonType === 'REG' && pooled
      ? [sideOf(game.away, game.home, null), sideOf(game.home, game.away, null)].flatMap((s) =>
          s.players.map((p) => p.id)
        )
      : null
  const projected = useWeekProjections(keyIds, season, game?.week ?? 0, leagueKey)
  // Week 1: the key players come from last season's teams.
  const offseason = game && before ? keyNote(game, last, before) : null
  const keys =
    game && pooled
      ? [sideOf(game.away, game.home, projected), sideOf(game.home, game.away, projected)]
      : null

  const set = (update: Partial<GamesState>): void => onState((s) => ({ ...s, ...update }))
  const byes = games && week !== null ? byeTeams(games, week) : []
  const scorings = (['league', 'ppr', 'half', 'std'] as Scoring[])
    .filter((s) => s !== 'league' || hasLeague)
    .map((s) => ({ value: s, label: SCORING_LABELS[s] }))

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex min-h-0 w-[240px] shrink-0 flex-col border-r border-line">
        <div className="flex shrink-0 flex-col gap-[9px] border-b border-line px-3.5 pt-3 pb-2.5">
          <div className="flex items-center gap-2">
            <StatsSelect
              title="Season"
              value={season}
              options={seasonOptions(data.status).map((s) => ({ value: s, label: String(s) }))}
              onChange={(s) => {
                onScope({ ...scope, season: s, weeks: null })
                set({ week: null, game: null, tab: null })
              }}
            />
            {week !== null && (
              <StatsSelect
                title="Week"
                value={week}
                options={weeks}
                onChange={(w) => set({ week: w, game: null, tab: null })}
                className="min-w-0 flex-1"
              />
            )}
          </div>
          <span className="font-mono text-[11px] leading-none text-fg-3">
            {rail.length} GAMES{byes.length ? ` · ${byes.length} BYES` : ''}
          </span>
        </div>
        <div
          role="list"
          aria-label="Games"
          className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]"
        >
          {rail.map((r) => (
            <RailItem
              key={r.id}
              game={r}
              on={r.id === picked?.id}
              onClick={() => set({ game: r.id, tab: null })}
            />
          ))}
          {byes.length > 0 && (
            <div className="px-4 py-3 font-mono text-[11px] leading-normal text-fg-3">
              BYES · {byes.join(' · ')}
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-auto [scrollbar-width:thin]">
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-line px-8">
          <div
            role="tablist"
            aria-label="Game"
            className="flex gap-0.5 rounded-[7px] bg-panel-2 p-0.5"
          >
            {(
              [
                ['preview', 'Preview'],
                ['box', 'Box score']
              ] as [GamesTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                disabled={id === 'box' && !played}
                title={
                  id === 'box' && !played ? 'The box score comes once the game is final' : undefined
                }
                onClick={() => set({ tab: id })}
                className={cn(
                  'h-[26px] cursor-pointer rounded-[5px] px-3.5 text-[12.5px] disabled:cursor-default disabled:opacity-50',
                  tab === id
                    ? 'bg-panel font-semibold text-fg shadow-[0_0_0_1px_var(--line)]'
                    : 'font-medium text-fg-2 hover:text-fg disabled:hover:text-fg-2'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3.5">
            {game && (
              <span className="text-[12px] text-fg-3">
                {tab === 'box'
                  ? `${weekLabel(season, game.seasonType, game.week)} · ${season}`
                  : before
                    ? `Team stats: ${before.label}${played ? ', before the game' : ''}`
                    : 'No games before this one'}
              </span>
            )}
            <StatsSelect
              title="Fantasy scoring"
              value={scope.scoring}
              options={scorings}
              onChange={(s) => onScope({ ...scope, scoring: s })}
            />
          </div>
        </div>
        {error || !games ? (
          <Loading error={error} />
        ) : !game ? (
          <div className="py-20 text-center text-[13px] text-fg-3">No games in {season} yet.</div>
        ) : (
          <div className="flex flex-col gap-[26px] px-8 pt-[22px] pb-8">
            <Header view={headerView(games, game)} onOpenTeam={onOpenTeam} />
            {tab === 'preview' ? (
              <>
                <Forecast view={forecastView(game)} played={played} />
                {!before && (
                  <div className="text-[13px] text-fg-3">
                    The stats start with the {season} season: no games before this one to compare
                    the teams by.
                  </div>
                )}
                {before && (
                  <section className="flex flex-col gap-3">
                    <SectionHead
                      title="Phase by phase"
                      note="Each offense against the other defense · rank among 32 · the bar leans to the side with the edge"
                    />
                    {matchups.error ? (
                      <Loading error={matchups.error} />
                    ) : !matchup ? (
                      <Loading />
                    ) : (
                      <div className="grid grid-cols-2 items-start gap-9">
                        {[
                          faceView(matchup, game.away, game.home, data.byId, before.season),
                          faceView(matchup, game.home, game.away, data.byId, before.season)
                        ].map((f, i) => (
                          <Face key={f.off} view={f} offense={i === 0 ? 1 : 2} />
                        ))}
                      </div>
                    )}
                  </section>
                )}
                {before && (
                  <section className="flex flex-col gap-3">
                    <SectionHead
                      title="Key matchups"
                      note="Matchup rank: the defense's rank against the position in fantasy points allowed, 1st = toughest"
                    />
                    {seasonPlayers.error || rushers.error ? (
                      <Loading error={seasonPlayers.error ?? rushers.error} />
                    ) : !keys ? (
                      <Loading />
                    ) : (
                      <div className="grid grid-cols-2 items-start gap-9">
                        {keys.map((k, i) => (
                          <Keys
                            key={k.team}
                            side={k}
                            series={i === 0 ? 1 : 2}
                            lastHead={
                              played ? 'FP' : hasLeague && game.seasonType === 'REG' ? 'PROJ' : ''
                            }
                            onOpenPlayer={onOpenPlayer}
                          />
                        ))}
                      </div>
                    )}
                    {offseason && <span className="text-[12px] text-warn">{offseason}</span>}
                    {!hasLeague && !played && (
                      <span className="text-[12px] text-fg-3">
                        Import a league in Fantasy to see Sleeper&apos;s projection for each player
                        this week and to mark your players.
                      </span>
                    )}
                  </section>
                )}
              </>
            ) : boxes.error ? (
              <Loading error={boxes.error} />
            ) : !boxed ? (
              <Loading />
            ) : (
              <Box view={boxed} onOpenPlayer={onOpenPlayer} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RailItem({
  game: g,
  on,
  onClick
}: {
  game: RailGame
  on: boolean
  onClick: () => void
}): React.JSX.Element {
  const line = (team: string, right: string, won: boolean, lost: boolean): React.JSX.Element => (
    <span
      className={cn(
        'flex justify-between gap-2 font-mono text-[12.5px] leading-none tabular-nums',
        won && 'font-semibold',
        lost && 'text-fg-3'
      )}
    >
      <span>{team}</span>
      <span className={cn(!g.played && 'text-fg-3')}>{right}</span>
    </span>
  )
  return (
    <button
      type="button"
      role="listitem"
      aria-current={on ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'relative flex w-full cursor-pointer flex-col gap-[5px] border-b border-line-2 py-[9px] pr-3.5 pl-4 text-left',
        on ? 'bg-sel' : 'hover:bg-hover'
      )}
    >
      {line(g.away, g.played ? g.awayScore : g.when, g.awayWon, g.played && !g.awayWon)}
      {line(g.home, g.played ? g.homeScore : (g.line ?? ''), g.homeWon, g.played && !g.homeWon)}
      {g.mine && (
        <span className="absolute top-1/2 left-1.5 flex -translate-y-1/2">
          <MineDot title="Your fantasy players in this game" />
        </span>
      )}
    </button>
  )
}

const SHAPE = { 1: 'rounded-full bg-s1', 2: 'rounded-[2px] bg-s2' } as const

function Header({
  view,
  onOpenTeam
}: {
  view: HeaderView
  onOpenTeam: (team: string) => void
}): React.JSX.Element {
  const side = (s: HeaderSide, home: boolean): React.JSX.Element => (
    <button
      type="button"
      title={`Open the ${s.name} dashboard`}
      onClick={() => onOpenTeam(s.team)}
      className={cn(
        'flex cursor-pointer items-center gap-[22px]',
        home ? 'flex-row-reverse justify-end text-left' : 'justify-end text-right'
      )}
    >
      <span className={cn('flex flex-col gap-[7px]', home ? 'items-start' : 'items-end')}>
        <span className={cn('flex items-center gap-2', home && 'flex-row-reverse')}>
          <span className={cn('size-2.5', SHAPE[home ? 2 : 1])} />
          <span className="text-[34px] leading-[0.9] font-bold tracking-[-0.04em]">{s.abbr}</span>
        </span>
        <span className="text-[12.5px] leading-none text-fg-2">{s.name}</span>
        <span className="font-mono text-[11px] leading-none text-fg-3">{s.meta}</span>
        <span className="flex gap-[3px]">
          {s.form.map((f, i) => (
            <span
              key={i}
              title={f.title}
              className={cn(
                'flex size-[17px] items-center justify-center rounded-[4px] font-mono text-[10px] font-semibold',
                f.result === 'W'
                  ? 'bg-good-s text-good'
                  : f.result === 'L'
                    ? 'bg-bad-s text-bad'
                    : 'bg-panel-2 text-fg-2'
              )}
            >
              {f.result}
            </span>
          ))}
        </span>
      </span>
      <span className={cn('flex flex-col gap-1.5', home ? 'items-start' : 'items-end')}>
        <span
          className={cn(
            'font-cond text-[72px] leading-[0.8] font-extrabold tabular-nums',
            s.dim && 'text-fg-3'
          )}
        >
          {s.big}
        </span>
        <span className="font-mono text-[10.5px] leading-none text-fg-3 uppercase">
          {view.bigLabel}
        </span>
      </span>
    </button>
  )
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-7 border-b border-line pb-5">
      {side(view.away, false)}
      <div className="flex min-w-[170px] flex-col items-center gap-2">
        <span className="rounded-[5px] bg-panel-2 px-[9px] py-[5px] font-mono text-[11px] leading-none font-semibold text-fg-2">
          {view.status}
        </span>
        {view.sub && <span className="text-[12px] leading-none text-fg-3">{view.sub}</span>}
      </div>
      {side(view.home, true)}
    </header>
  )
}

function Forecast({ view, played }: { view: ForecastView; played: boolean }): React.JSX.Element {
  const card =
    'flex min-w-0 flex-col gap-3 rounded-[10px] bg-panel px-4 py-3.5 shadow-[0_0_0_1px_var(--line)]'
  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={played ? 'The forecast before kickoff' : 'The forecast'}
        note="Elo from our model · the market from the betting line, without the vig"
      />
      <div className="grid grid-cols-[1.35fr_1fr_0.85fr] gap-3.5">
        <div className={card}>
          <span className="text-[12.5px] leading-none font-semibold">Win probability</span>
          {view.probs.map((p) => (
            <div
              key={p.label}
              className="grid grid-cols-[52px_34px_minmax(0,1fr)_34px] items-center gap-2"
            >
              <span className="text-[12px] leading-none text-fg-2">{p.label}</span>
              <span className="text-right font-mono text-[12px] leading-none font-semibold">
                {p.away}
              </span>
              <div
                title={`${p.label}: ${p.away} – ${p.home}`}
                className="flex h-2.5 overflow-hidden rounded-[5px]"
              >
                <span className="bg-s1" style={{ width: `${(p.awayShare * 100).toFixed(1)}%` }} />
                <span className="flex-1 bg-s2" />
              </div>
              <span className="font-mono text-[12px] leading-none font-semibold">{p.home}</span>
            </div>
          ))}
          <span className="text-[12px] leading-[1.45] text-fg-2">{view.agree}</span>
          {view.result && (
            <span
              className={cn(
                'self-start rounded-[5px] px-2 py-1 font-mono text-[11.5px] leading-none font-semibold',
                view.result.upset ? 'bg-bad-s text-bad' : 'bg-panel-2 text-fg-2'
              )}
            >
              {view.result.text}
            </span>
          )}
        </div>
        <div className={card}>
          <span className="text-[12.5px] leading-none font-semibold">The line</span>
          <div className="grid grid-cols-3 gap-2.5">
            {view.tiles.map((t) => (
              <div key={t.key} className="flex min-w-0 flex-col gap-1.5">
                <span className="font-mono text-[10.5px] leading-none tracking-[0.04em] text-fg-3 uppercase">
                  {t.key}
                </span>
                <span className="font-cond text-[26px] leading-[0.9] font-extrabold whitespace-nowrap tabular-nums">
                  {t.value}
                </span>
                <span className="text-[11.5px] leading-[1.3] text-fg-3">{t.sub}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={cn(card, 'gap-2.5')}>
          <span className="text-[12.5px] leading-none font-semibold">Conditions</span>
          <span className="font-cond text-[26px] leading-[0.9] font-extrabold">
            {view.conditions.big}
          </span>
          <span className="text-[12px] leading-[1.4] text-fg-2">{view.conditions.line}</span>
          {view.conditions.note && (
            <span className="text-[11.5px] leading-[1.4] text-fg-3">{view.conditions.note}</span>
          )}
        </div>
      </div>
    </section>
  )
}

/** A rank chip shaded by the percentile (the handoff's heat scale). */
function RankChip({ cell }: { cell: TeamCell }): React.JSX.Element {
  const strong = Math.abs(cell.percentile - 50) > 20
  return (
    <span
      className="flex h-[18px] items-center justify-center rounded-[9px] font-mono text-[10.5px] leading-none font-semibold"
      style={{
        background: heatColor(cell.percentile / 100, false),
        color: strong ? '#fff' : 'var(--fg)'
      }}
    >
      {cell.rank}
    </span>
  )
}

function Face({ view, offense }: { view: FaceView; offense: 1 | 2 }): React.JSX.Element {
  const defense = offense === 1 ? 2 : 1
  const columns = 'grid grid-cols-[minmax(0,1fr)_54px_38px_104px_38px_54px] items-center gap-[7px]'
  return (
    <div
      className="flex min-w-0 flex-col"
      aria-label={`${view.off} offense against ${view.def} defense`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b-2 border-fg pb-2">
        <span className="flex items-center gap-[7px] text-[16px] leading-none font-bold tracking-[-0.02em]">
          <span className={cn('size-[9px]', SHAPE[offense])} />
          {view.off} offense
        </span>
        <span className="font-mono text-[11px] leading-none text-fg-3">VS</span>
        <span className="flex items-center justify-end gap-[7px] text-[16px] leading-none font-bold tracking-[-0.02em]">
          {view.def} defense
          <span className={cn('size-[9px]', SHAPE[defense])} />
        </span>
      </div>
      {view.summary && (
        <div className="pt-[9px] pb-1 text-[12px] leading-[1.4] text-fg-2">{view.summary}</div>
      )}
      {view.groups.map((g) => (
        <div key={g.label} className="flex flex-col">
          <div className="flex h-[26px] items-end border-b border-line pb-[5px] font-mono text-[10.5px] leading-none tracking-[0.04em] text-fg-3 uppercase">
            {g.label}
          </div>
          {g.rows.map((r) =>
            r.missing || !r.off || !r.def ? (
              <div
                key={r.label}
                className="flex h-[34px] items-center justify-between gap-2.5 border-b border-line-2"
              >
                <span className="text-[12.5px] text-fg-2">{r.label}</span>
                <span className="text-[11.5px] text-fg-3">{r.missing ?? 'No value'}</span>
              </div>
            ) : (
              <div
                key={r.label}
                data-phase={r.label}
                title={`${view.off}: ${r.off.title}\n${view.def}: ${r.def.title}`}
                className={cn(columns, 'h-[34px] border-b border-line-2')}
              >
                <span className="truncate text-[12.5px] text-fg-2">{r.label}</span>
                <span
                  className={cn(
                    'text-right font-mono text-[12.5px] tabular-nums',
                    r.edge! > 0 && 'font-bold'
                  )}
                >
                  {r.off.value}
                </span>
                <RankChip cell={r.off} />
                <div className="relative h-[18px]">
                  <span className="absolute inset-x-0 top-2 h-0.5 rounded-[1px] bg-line-2" />
                  <span className="absolute top-0.5 bottom-0.5 left-1/2 w-px bg-fg-3" />
                  <span
                    className={cn(
                      'absolute top-[5px] h-2 rounded-[2px]',
                      r.edge! > 0 ? SHAPE_BG[offense] : SHAPE_BG[defense]
                    )}
                    style={{
                      left: `${r.edge! > 0 ? 50 - Math.abs(r.edge!) / 2 : 50}%`,
                      width: `${Math.abs(r.edge!) / 2}%`
                    }}
                  />
                </div>
                <RankChip cell={r.def} />
                <span
                  className={cn('font-mono text-[12.5px] tabular-nums', r.edge! < 0 && 'font-bold')}
                >
                  {r.def.value}
                </span>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  )
}

const SHAPE_BG = { 1: 'bg-s1', 2: 'bg-s2' } as const

const TONE = {
  good: 'bg-good-s text-good',
  bad: 'bg-bad-s text-bad',
  neutral: 'text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]'
} as const

function Keys({
  side,
  series,
  lastHead,
  onOpenPlayer
}: {
  side: KeySide
  series: 1 | 2
  lastHead: string
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
}): React.JSX.Element {
  const columns = 'grid grid-cols-[30px_minmax(0,1fr)_74px_64px] items-center gap-2.5'
  return (
    <div className="flex min-w-0 flex-col" aria-label={`${side.team} key players`}>
      <div
        className={cn(
          columns,
          'h-[26px] items-end border-b-2 border-fg pb-1.5 font-mono text-[10.5px] leading-none text-fg-3'
        )}
      >
        <span />
        <span className="flex items-center gap-[7px] font-sans text-[16px] font-bold tracking-[-0.02em] text-fg">
          <span className={cn('size-[9px]', SHAPE[series])} />
          {side.team}
        </span>
        <span className="text-center">MATCHUP</span>
        <span className="text-right">{lastHead}</span>
      </div>
      {side.players.map((p) => (
        <button
          key={p.id}
          type="button"
          title={`Open ${p.name}’s dashboard`}
          onClick={() => onOpenPlayer(p.id, p.position)}
          className={cn(
            columns,
            'h-[46px] cursor-pointer border-b border-line-2 text-left hover:bg-hover'
          )}
        >
          <PosText position={p.position} />
          <span className="flex min-w-0 flex-col gap-[5px]">
            <span className="flex items-center gap-1.5 text-[13px] leading-none font-medium">
              <span className="truncate">{p.name}</span>
              {p.mine && <MineDot />}
            </span>
            <span className="font-mono text-[11px] leading-none text-fg-3">{p.meta}</span>
          </span>
          {p.matchup ? (
            <span
              title={p.matchup.title}
              className={cn(
                'flex h-[22px] items-center justify-self-center rounded-[5px] px-2 font-mono text-[11px] leading-none font-semibold',
                TONE[p.matchup.tone]
              )}
            >
              {p.matchup.opponent} {p.matchup.rank}
            </span>
          ) : (
            <span />
          )}
          <span className="flex flex-col items-end gap-1">
            <span className="font-cond text-[17px] leading-none font-bold tabular-nums">
              {p.last?.value ?? (lastHead ? '—' : '')}
            </span>
            {p.last && (
              <span className="font-mono text-[10px] leading-none text-fg-3">{p.last.label}</span>
            )}
          </span>
        </button>
      ))}
      {side.rush && (
        <div className="mt-3 flex flex-col gap-1.5 rounded-[8px] px-[13px] py-[11px] shadow-[inset_0_0_0_1px_var(--line)]">
          <span className="text-[12px] leading-none font-semibold">
            Pass rush <span className="font-normal text-fg-3">· {side.rush.head}</span>
          </span>
          <span className="text-[12px] leading-[1.45] text-fg-2">{side.rush.line}</span>
        </div>
      )}
    </div>
  )
}

function Box({
  view,
  onOpenPlayer
}: {
  view: BoxView
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
}): React.JSX.Element {
  const COLS: Record<string, string> = {
    Passing: 'minmax(0,1fr) 56px 40px 26px 26px 40px',
    Rushing: 'minmax(0,1fr) 34px 40px 36px 26px 40px',
    Receiving: 'minmax(0,1fr) 56px 40px 26px 40px'
  }
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <SectionHead title="Top fantasy performances" />
        <div className="grid grid-cols-5 gap-2.5">
          {view.top.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpenPlayer(t.id, t.position as PositionGroup)}
              className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-[8px] bg-panel px-3 py-2.5 text-left shadow-[0_0_0_1px_var(--line)] hover:bg-hover"
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px] leading-none text-fg-3">
                <PosText position={t.position} />
                {t.team}
                {t.mine && <MineDot />}
              </span>
              <span className="truncate text-[13px] leading-[1.1] font-medium">{t.name}</span>
              <span className="font-cond text-[28px] leading-[0.85] font-extrabold tabular-nums">
                {t.fp}
                <span className="ml-1 font-mono text-[11px] font-medium text-fg-3">FP</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-2 items-start gap-9">
        {view.sides.map((s) => (
          <div
            key={s.team}
            aria-label={`${s.team} box score`}
            className="flex min-w-0 flex-col gap-[18px] font-mono text-[12.5px] tabular-nums"
          >
            <div className="flex items-baseline gap-2 border-b-2 border-fg pb-2">
              <span className="font-sans text-[18px] leading-none font-bold tracking-[-0.02em]">
                {s.team}
              </span>
              <span className="font-sans text-[12px] leading-none text-fg-3">box score</span>
            </div>
            {s.tables.map((t) => (
              <div
                key={t.title}
                role="table"
                aria-label={`${s.team} ${t.title}`}
                className="flex flex-col"
              >
                <div
                  role="row"
                  className="grid h-6 items-end gap-x-2.5 border-b border-fg-3 pb-1.5 text-[11px] text-fg-3"
                  style={{ gridTemplateColumns: COLS[t.title] }}
                >
                  <span role="columnheader" className="font-sans font-semibold text-fg">
                    {t.title}
                  </span>
                  {[...t.heads, 'FP'].map((h) => (
                    <span key={h} role="columnheader" className="text-right">
                      {h}
                    </span>
                  ))}
                </div>
                {t.rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="row"
                    onClick={() => onOpenPlayer(r.id, null)}
                    className="grid h-8 cursor-pointer items-center gap-x-2.5 border-b border-line-2 text-left hover:bg-hover"
                    style={{ gridTemplateColumns: COLS[t.title] }}
                  >
                    <span
                      role="cell"
                      className="flex min-w-0 items-center gap-1.5 font-sans text-[12.5px] font-medium"
                    >
                      <span className="truncate">{r.name}</span>
                      {r.mine && <MineDot />}
                    </span>
                    {r.cells.map((c, i) => (
                      <span key={i} role="cell" className="text-right">
                        {c}
                      </span>
                    ))}
                    <span role="cell" className="text-right font-cond text-[15px] font-bold">
                      {r.fp}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-[7px] rounded-[8px] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
                <span className="font-sans text-[12px] leading-none font-semibold">
                  Kicking
                  {s.kicker && <span className="font-normal text-fg-3"> · {s.kicker.name}</span>}
                </span>
                {s.kicker ? (
                  <span className="flex gap-3 text-fg-2">
                    <span>FG {s.kicker.fg}</span>
                    <span className="ml-auto font-cond text-[15px] font-bold text-fg">
                      {s.kicker.fp}
                    </span>
                  </span>
                ) : (
                  <span className="text-fg-3">No field goal tries</span>
                )}
              </div>
              <div className="flex flex-col gap-[7px] rounded-[8px] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
                <span className="font-sans text-[12px] leading-none font-semibold">Defense</span>
                <span className="flex gap-3 text-fg-2">
                  <span>SACK {s.defense.sacks}</span>
                  <span>TAKE {s.defense.takeaways}</span>
                  <span>TD {s.defense.tds}</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
