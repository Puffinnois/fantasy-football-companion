import { useEffect, useState } from 'react'
import { StatsNav, type StatsScreen } from '@/components/stats/StatsNav'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import type { BoardDef } from '@/lib/stats/boards'
import { bestFirst, defaultBoard, normalizeBoard } from '@/lib/stats/leaderboard'
import { defaultScope, type StatsScope } from '@/lib/stats/scope'
import { useStatsData } from '@/lib/stats/useStats'
import { StatsGlossary } from '@/screens/stats/StatsGlossary'
import { StatsHome } from '@/screens/stats/StatsHome'
import { StatsLeaderboard, type LeaderboardOpen } from '@/screens/stats/StatsLeaderboard'
import type { LeaderboardBoard, StatsView } from '@shared/stats/types'
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
 * nav, the scope shared by every screen (§9.1), the Stats home and the leaderboards (§9.2).
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

  useEffect(() => {
    void api.stats
      .views()
      .then(setViews)
      .catch((err) => setViewsError(errorMessage(err)))
  }, [])

  // A league removed or added: "My league" scoring follows.
  const effective: StatsScope =
    scope.scoring === 'league' && !hasLeague ? { ...scope, scoring: 'ppr' } : scope

  const openBoard = (board: LeaderboardBoard, selected: string | null): void => {
    setOpen((o) => ({ board, selected, nonce: (o?.nonce ?? 0) + 1 }))
    setScreen(board.entity === 'player' ? 'players' : 'teams')
  }
  const openFromHome = (b: BoardDef, rowId: string | null, perGame: boolean): void => {
    const entity = b.position ? 'player' : 'team'
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
