import { useEffect, useState } from 'react'
import { StatsNav, type StatsScreen } from '@/components/stats/StatsNav'
import { api } from '@/lib/api'
import { useNoteContext, useNoteScreen } from '@/lib/dev/noteContext'
import { errorMessage } from '@/lib/format'
import type { NavLocation } from '@/lib/navHistory'
import type { BoardDef } from '@/lib/stats/boards'
import { compareFromPicks, DEFAULT_CHART, type ChartState } from '@/lib/stats/chart'
import { DEFAULT_COMPARE, type CompareState } from '@/lib/stats/compare'
import { DEFAULT_GAMES, type GamesState } from '@/lib/stats/games'
import { bestFirst, defaultBoard, normalizeBoard } from '@/lib/stats/leaderboard'
import { defaultPlayer, positionTab, railQuery, type PlayerTab } from '@/lib/stats/player'
import { defaultScope, type StatsScope } from '@/lib/stats/scope'
import { defaultTeam, topScorerQuery, type TeamTab } from '@/lib/stats/team'
import { DEFAULT_TRENDS, type TrendsState } from '@/lib/stats/trends'
import { useStatsData, useStatsQuery } from '@/lib/stats/useStats'
import { StatsExplore, type ExploreTab } from '@/screens/stats/StatsExplore'
import { StatsGames } from '@/screens/stats/StatsGames'
import { StatsGlossary } from '@/screens/stats/StatsGlossary'
import { StatsHome } from '@/screens/stats/StatsHome'
import { StatsLeaderboard, type LeaderboardOpen } from '@/screens/stats/StatsLeaderboard'
import { StatsPlayer, type PlayerRef } from '@/screens/stats/StatsPlayer'
import { StatsTeam } from '@/screens/stats/StatsTeam'
import type { LeaderboardBoard, PositionGroup, StatsView } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'

/** What Fantasy asks Stats to open (spec §9.4), or a page Back returns to; a new nonce opens it again. */
export type StatsFocus =
  | { kind: 'player'; id: string; nonce: number }
  | { kind: 'team'; team: string; nonce: number }
  | { kind: 'location'; location: StatsLocation; nonce: number }

type StatsLocation = Extract<NavLocation, { product: 'stats' }>

interface StatsAppProps {
  hasLeague: boolean
  /** Bumped when league data changed: the rosters are read again. */
  leagueKey: number
  onOpenFantasy: () => void
  update: UpdateState
  version: string | null
  onOpenUpdate: () => void
  onToggleTheme: () => void
  /** The scope chosen this session (spec §18 J), kept by App across product switches; null: the default. */
  scope: StatsScope | null
  onScope: (scope: StatsScope) => void
  /** A player (or a defense's team) to open, from a Fantasy player file. */
  focus?: StatsFocus | null
  /** Opens a player's file in Fantasy, by his Sleeper id (spec §9.4). */
  onOpenFantasyPlayer?: (playerId: string) => void
  /** Every page shown, for Back (N-002). */
  onLocation?: (location: NavLocation) => void
  canGoBack?: boolean
  onBack?: () => void
}

/**
 * Companion Stats (stats-analysis spec §9, design handoff "Companion Stats"): its own shell and
 * nav, the scope shared by every screen (§9.1), the Stats home and the leaderboards (§9.2), the
 * team and player dashboards (§9.3, §9.4), Explore and Games (§9.5).
 */
export function StatsApp({
  hasLeague,
  leagueKey,
  onOpenFantasy,
  update,
  version,
  onOpenUpdate,
  onToggleTheme,
  scope: chosen,
  onScope: setChosen,
  focus = null,
  onOpenFantasyPlayer,
  onLocation,
  canGoBack = false,
  onBack
}: StatsAppProps): React.JSX.Element {
  const data = useStatsData(leagueKey)
  const [screen, setScreen] = useState<StatsScreen>('home')
  const scope = chosen ?? defaultScope(data.status, hasLeague)
  const [open, setOpen] = useState<LeaderboardOpen | null>(null)
  const [views, setViews] = useState<StatsView[]>([])
  const [viewsError, setViewsError] = useState<string | null>(null)
  // The team dashboard (spec §9.3): the team chosen this session, else my top scorer's.
  const [team, setTeam] = useState<string | null>(null)
  const [teamTab, setTeamTab] = useState<TeamTab>('overview')
  // The player dashboard (spec §9.4): the player chosen this session, else my top scorer.
  const [player, setPlayer] = useState<PlayerRef | null>(null)
  const [playerTab, setPlayerTab] = useState<PlayerTab>('overview')
  // Explore (spec §9.5): its tab and each tab's state, kept for the session.
  const [exploreTab, setExploreTab] = useState<ExploreTab>('chart')
  const [chart, setChart] = useState<ChartState>(DEFAULT_CHART)
  const [compare, setCompare] = useState<CompareState>(DEFAULT_COMPARE)
  const [trends, setTrends] = useState<TrendsState>(DEFAULT_TRENDS)
  // Games (spec §9.5): the week and game chosen, kept for the session.
  const [games, setGames] = useState<GamesState>(DEFAULT_GAMES)
  // A focus from Fantasy opens its dashboard once.
  const [focused, setFocused] = useState<number | null>(null)
  if (focus && focus.nonce !== focused) {
    setFocused(focus.nonce)
    if (focus.kind === 'location') {
      const to = focus.location
      if (to.team !== null) setTeam(to.team)
      if (to.player !== null) setPlayer(to.player)
      setScreen(to.screen)
    } else if (focus.kind === 'player') {
      setPlayer({ id: focus.id, position: null })
      setScreen('player')
    } else {
      setTeam(focus.team)
      setScreen('team')
    }
  }

  useEffect(() => {
    void api.stats
      .views()
      .then(setViews)
      .catch((err) => setViewsError(errorMessage(err)))
  }, [])

  // A league removed or added: "My league" scoring follows.
  const effective: StatsScope =
    scope.scoring === 'league' && !hasLeague ? { ...scope, scoring: 'ppr' } : scope

  // The query hook keys on the query's text, so a new object each render runs nothing again.
  const needsDefault =
    (team === null && screen === 'team') || (player === null && screen === 'player')
  const topQuery = needsDefault ? topScorerQuery(data.ownership, effective, data.status) : null
  const top = useStatsQuery(topQuery, data.version)
  // Without my roster, the player dashboard opens on the leading WR.
  const leadersQuery =
    player === null && screen === 'player' && data.byId.size > 0
      ? railQuery('WR', positionTab('WR').sort, effective, data.status, data.byId)
      : null
  const leaders = useStatsQuery(leadersQuery, data.version)
  // With a league, wait for its rosters and my top scorer before choosing (no flash of the first).
  const rosters = !hasLeague || data.ownershipReady
  // So does an error (the league's first scoring): the stats change when it is done.
  const topWaiting = topQuery !== null && (top.loading || top.error !== null)
  // While a default waits on an error, it says why.
  const waiting = (
    <div className="py-20 text-center text-[13px] text-fg-3">
      {top.error ?? leaders.error ?? 'Loading…'}
    </div>
  )
  const shownTeam = team ?? (!rosters || topWaiting ? null : defaultTeam(top.result))
  // Once on screen, the default is the team: a new season or range does not switch it.
  if (team === null && screen === 'team' && shownTeam !== null) setTeam(shownTeam)
  const openTeam = (code: string): void => {
    setTeam(code)
    setScreen('team')
  }
  const shownPlayer =
    player ??
    (!rosters || topWaiting || leaders.loading ? null : defaultPlayer(top.result, leaders.result))
  if (player === null && screen === 'player' && shownPlayer !== null) setPlayer(shownPlayer)
  const openPlayer = (id: string, position: PositionGroup | null): void => {
    setPlayer({ id, position })
    setScreen('player')
  }
  // A dashboard's Compare: that player and his position's top two, or that team and the two
  // nearest it in Elo.
  const openCompare = (
    entity: CompareState['entity'],
    id: string,
    position: PositionGroup
  ): void => {
    setCompare((c) => ({ ...c, entity, position, slots: null, seed: id }))
    setExploreTab('compare')
    setScreen('explore')
  }
  // The chart's picks: Compare with them in its slots.
  const compareChart = (c: ChartState): void => {
    setCompare((s) => ({ ...s, ...compareFromPicks(c.entity, c.position, c.picks) }))
    setExploreTab('compare')
  }
  // A stat line's trend icon: that metric over his (its) seasons.
  const openTrends = (
    entity: TrendsState['entity'],
    id: string,
    position: PositionGroup | null,
    metric: string
  ): void => {
    setTrends((t) => ({
      ...t,
      entity,
      id,
      position: position ?? t.position,
      metric,
      comparisons: []
    }))
    setExploreTab('trends')
    setScreen('explore')
  }

  // N-002: the page for Back. A dashboard waiting for its default is a page too, with no team or
  // player yet: Back from it returns to the page before, and its default then fills it in.
  const locationTeam = screen === 'team' ? shownTeam : null
  const locationPlayer = screen === 'player' ? shownPlayer : null
  const locationKey = JSON.stringify([screen, locationTeam, locationPlayer?.id ?? null])
  useEffect(() => {
    onLocation?.({
      product: 'stats',
      screen,
      team: locationTeam,
      player: locationPlayer && { id: locationPlayer.id, position: locationPlayer.position }
    })
    // The key holds the location's parts: a new object each render reports nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey, onLocation])

  // Dev-mode spec §3: Stats' screen, its scope, and the team dashboard's team.
  useNoteScreen(screen)
  useNoteContext('scope', {
    label: `${effective.season}${effective.weeks ? ` wk ${effective.weeks[0]}–${effective.weeks[1]}` : ''} ${effective.seasonType} · ${effective.scoring}`,
    data: { ...effective }
  })
  useNoteContext(
    'team',
    screen === 'team' && shownTeam
      ? { label: shownTeam, data: { team: shownTeam, tab: teamTab } }
      : null
  )

  const openBoard = (board: LeaderboardBoard, selected: string | null): void => {
    setOpen((o) => ({ board, selected, nonce: (o?.nonce ?? 0) + 1 }))
    setScreen(board.entity === 'player' ? 'players' : 'teams')
  }
  const openFromHome = (b: BoardDef, rowId: string | null, perGame: boolean): void => {
    const entity = b.position ? 'player' : 'team'
    if (entity === 'team' && rowId) {
      openTeam(rowId)
      return
    }
    if (b.position && rowId) {
      openPlayer(rowId, b.position)
      return
    }
    const base = defaultBoard(entity, b.tab, data.byId)
    const columns = base.columns.includes(b.metric) ? base.columns : [b.metric, ...base.columns]
    openBoard(
      {
        ...base,
        columns,
        perGame,
        sort: { by: b.metric, dir: bestFirst(data.byId.get(b.metric)) }
      },
      rowId
    )
  }
  const openView = (v: StatsView): void => openBoard(normalizeBoard(v.board, data.byId), null)
  const saveView = async (name: string, board: LeaderboardBoard): Promise<void> => {
    const saved = await api.stats.saveView(name, board)
    setViews((vs) =>
      [...vs.filter((v) => v.id !== saved.id), saved].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
    )
  }
  const deleteView = async (view: StatsView): Promise<void> => {
    await api.stats.deleteView(view.id)
    setViews((vs) => vs.filter((v) => v.id !== view.id))
  }

  const unavailable = data.status !== null && !data.status.available
  return (
    <div className="stats flex h-full flex-col bg-paper text-fg">
      <StatsNav
        current={screen}
        onNavigate={setScreen}
        canGoBack={canGoBack}
        onBack={onBack}
        status={data.status}
        hasLeague={hasLeague}
        onOpenFantasy={onOpenFantasy}
        update={update}
        version={version}
        onOpenUpdate={onOpenUpdate}
        onToggleTheme={onToggleTheme}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto">
        {unavailable || data.error ? (
          <div className="py-20 text-center text-[13px] text-bad">
            {data.error ?? 'The stats database could not be opened on this computer.'}
          </div>
        ) : (
          <>
            {screen === 'home' && (
              <StatsHome
                data={data}
                scope={effective}
                onScope={setChosen}
                hasLeague={hasLeague}
                views={views}
                onOpenBoard={openFromHome}
                onOpenView={openView}
              />
            )}
            {(screen === 'players' || screen === 'teams') && (
              <StatsLeaderboard
                key={screen}
                entity={screen === 'players' ? 'player' : 'team'}
                data={data}
                scope={effective}
                onScope={setChosen}
                hasLeague={hasLeague}
                open={open}
                views={views}
                onSaveView={saveView}
                onDeleteView={deleteView}
                onOpenView={openView}
                onOpenTeam={openTeam}
                onOpenPlayer={openPlayer}
              />
            )}
            {screen === 'team' &&
              (shownTeam ? (
                <StatsTeam
                  data={data}
                  scope={effective}
                  onScope={setChosen}
                  hasLeague={hasLeague}
                  team={shownTeam}
                  onTeam={setTeam}
                  tab={teamTab}
                  onTab={setTeamTab}
                  onOpenLeaderboard={() => setScreen('teams')}
                  onOpenPlayer={openPlayer}
                  onCompare={() => openCompare('team', shownTeam, 'WR')}
                  onTrend={(metric) => openTrends('team', shownTeam, null, metric)}
                />
              ) : (
                waiting
              ))}
            {screen === 'player' &&
              (shownPlayer ? (
                <StatsPlayer
                  data={data}
                  scope={effective}
                  onScope={setChosen}
                  hasLeague={hasLeague}
                  player={shownPlayer}
                  onPlayer={setPlayer}
                  tab={playerTab}
                  onTab={setPlayerTab}
                  onOpenTeam={openTeam}
                  leagueKey={leagueKey}
                  onOpenFantasyPlayer={onOpenFantasyPlayer}
                  onOpenLeaderboard={(position) =>
                    openBoard(defaultBoard('player', position, data.byId), shownPlayer.id)
                  }
                  onCompare={(position) => openCompare('player', shownPlayer.id, position)}
                  onTrend={(position, metric) =>
                    openTrends('player', shownPlayer.id, position, metric)
                  }
                />
              ) : (
                waiting
              ))}
            {screen === 'explore' && (
              <StatsExplore
                data={data}
                scope={effective}
                onScope={setChosen}
                hasLeague={hasLeague}
                tab={exploreTab}
                onTab={setExploreTab}
                chart={chart}
                onChart={setChart}
                onCompareChart={compareChart}
                compare={compare}
                onCompare={setCompare}
                trends={trends}
                onTrends={setTrends}
                trendsFallback={
                  trends.entity === 'team'
                    ? team
                      ? { id: team, position: null }
                      : null
                    : player?.position
                      ? { id: player.id, position: player.position }
                      : null
                }
                onOpenPlayer={openPlayer}
                onOpenTeam={openTeam}
              />
            )}
            {screen === 'games' && (
              <StatsGames
                data={data}
                scope={effective}
                onScope={setChosen}
                hasLeague={hasLeague}
                leagueKey={leagueKey}
                state={games}
                onState={setGames}
                onOpenTeam={openTeam}
                onOpenPlayer={openPlayer}
              />
            )}
            {screen === 'glossary' && <StatsGlossary catalogue={data.catalogue} />}
            {viewsError && <div className="px-8 pb-4 text-[12px] text-bad">{viewsError}</div>}
          </>
        )}
      </main>
    </div>
  )
}
