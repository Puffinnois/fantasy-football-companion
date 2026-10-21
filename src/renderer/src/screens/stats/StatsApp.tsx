import { useEffect, useState } from 'react'
import { StatsNav, type StatsScreen } from '@/components/stats/StatsNav'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import type { BoardDef } from '@/lib/stats/boards'
import { bestFirst, defaultBoard, normalizeBoard } from '@/lib/stats/leaderboard'
import { defaultPlayer, positionTab, railQuery, type PlayerTab } from '@/lib/stats/player'
import { defaultScope, type StatsScope } from '@/lib/stats/scope'
import { defaultTeam, topScorerQuery, type TeamTab } from '@/lib/stats/team'
import { useStatsData, useStatsQuery } from '@/lib/stats/useStats'
import { StatsGlossary } from '@/screens/stats/StatsGlossary'
import { StatsHome } from '@/screens/stats/StatsHome'
import { StatsLeaderboard, type LeaderboardOpen } from '@/screens/stats/StatsLeaderboard'
import { StatsPlayer, type PlayerRef } from '@/screens/stats/StatsPlayer'
import { StatsTeam } from '@/screens/stats/StatsTeam'
import type { LeaderboardBoard, PositionGroup, StatsView } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'

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
}

/**
 * Companion Stats (stats-analysis spec §9, design handoff "Companion Stats"): its own shell and
 * nav, the scope shared by every screen (§9.1), the Stats home and the leaderboards (§9.2), the
 * team and player dashboards (§9.3, §9.4).
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
  onScope: setChosen
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
  const shownTeam = team ?? (!rosters || (topQuery && top.loading) ? null : defaultTeam(top.result))
  // Once on screen, the default is the team: a new season or range does not switch it.
  if (team === null && screen === 'team' && shownTeam !== null) setTeam(shownTeam)
  const openTeam = (code: string): void => {
    setTeam(code)
    setScreen('team')
  }
  const shownPlayer =
    player ??
    (!rosters || (topQuery && top.loading) || leaders.loading
      ? null
      : defaultPlayer(top.result, leaders.result))
  if (player === null && screen === 'player' && shownPlayer !== null) setPlayer(shownPlayer)
  const openPlayer = (id: string, position: PositionGroup | null): void => {
    setPlayer({ id, position })
    setScreen('player')
  }

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
                />
              ) : (
                <div className="py-20 text-center text-[13px] text-fg-3">Loading…</div>
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
                  onOpenLeaderboard={(position) =>
                    openBoard(defaultBoard('player', position, data.byId), shownPlayer.id)
                  }
                />
              ) : (
                <div className="py-20 text-center text-[13px] text-fg-3">Loading…</div>
              ))}
            {screen === 'glossary' && <StatsGlossary catalogue={data.catalogue} />}
            {viewsError && <div className="px-8 pb-4 text-[12px] text-bad">{viewsError}</div>}
          </>
        )}
      </main>
    </div>
  )
}
