import { useCallback, useEffect, useMemo, useState } from 'react'
import { TopNav, type Screen } from '@/components/TopNav'
import { UpdateDialog } from '@/components/UpdateDialog'
import { SetupScreen } from '@/screens/SetupScreen'
import { LeagueScreen } from '@/screens/LeagueScreen'
import { RulesScreen } from '@/screens/RulesScreen'
import { PlayersScreen } from '@/screens/PlayersScreen'
import { LineupScreen } from '@/screens/LineupScreen'
import { TradeScreen } from '@/screens/TradeScreen'
import { WaiverScreen } from '@/screens/WaiverScreen'
import { StatsApp, type StatsFocus } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import { ProductLinksContext, type ProductLinks } from '@/lib/productLinks'
import { useTheme } from '@/lib/theme'
import { useUpdateState } from '@/lib/useUpdateState'

/** Screens with an Edition masthead lay out their own scroll regions; the rest scroll as a page. */
const FULL_BLEED: Screen[] = ['league', 'players', 'lineup', 'trade', 'waivers', 'rules', 'setup']

export default function App(): React.JSX.Element {
  // Two products, one app (design handoff 2026-10-16): Fantasy, and Stats, which works without a league.
  const [product, setProduct] = useState<'fantasy' | 'stats'>('fantasy')
  const [statsScope, setStatsScope] = useState<StatsScope | null>(null)
  const [screen, setScreen] = useState<Screen>('league')
  const [hasLeague, setHasLeague] = useState<boolean | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const bumpData = useCallback(() => setDataVersion((v) => v + 1), [])
  const update = useUpdateState()
  const [version, setVersion] = useState<string | null>(null)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [theme, toggleTheme] = useTheme()
  // League roster row → Players board with that player's file open; the nonce re-focuses the same id.
  const [focus, setFocus] = useState<{ playerId: string; nonce: number } | null>(null)
  const openPlayer = useCallback((playerId: string) => {
    setFocus((f) => ({ playerId, nonce: (f?.nonce ?? 0) + 1 }))
    setScreen('players')
  }, [])
  // Spec §9.4: a player file's "Full stats ↗" opens Stats on his dashboard (a defense: its team).
  const [statsFocus, setStatsFocus] = useState<StatsFocus | null>(null)
  const links = useMemo<ProductLinks>(
    () => ({
      openStats: (link) => {
        setStatsFocus((f) => {
          const nonce = (f?.nonce ?? 0) + 1
          return link.gsis
            ? { kind: 'player', id: link.gsis, nonce }
            : { kind: 'team', team: link.team ?? '', nonce }
        })
        setProduct('stats')
      }
    }),
    []
  )

  useEffect(() => {
    void api.app
      .version()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])

  useEffect(() => {
    void api.league
      .get()
      .then((league) => {
        setHasLeague(league !== null)
        // Stats-analysis spec §9.1: with no league, the app opens on Stats.
        if (league === null) {
          setScreen('setup')
          setProduct('stats')
        }
      })
      .catch(() => {
        setHasLeague(false)
        setScreen('setup')
        setProduct('stats')
      })
  }, [])

  useEffect(
    () =>
      api.sync.onProgress((entry) => {
        if (
          (entry.source === 'sleeper:league' || entry.source === 'app:points') &&
          entry.status === 'ok'
        )
          bumpData()
      }),
    [bumpData]
  )

  if (hasLeague === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="ed-loading">Loading…</span>
      </div>
    )
  }

  const updateDialog = (
    <UpdateDialog
      state={update}
      currentVersion={version ?? '?'}
      open={updateOpen}
      onOpenChange={setUpdateOpen}
    />
  )

  if (product === 'stats') {
    return (
      <>
        <StatsApp
          hasLeague={hasLeague}
          leagueKey={dataVersion}
          onOpenFantasy={() => {
            if (!hasLeague) setScreen('setup')
            setProduct('fantasy')
          }}
          focus={statsFocus}
          onOpenFantasyPlayer={(playerId) => {
            openPlayer(playerId)
            setProduct('fantasy')
          }}
          update={update}
          version={version}
          onOpenUpdate={() => setUpdateOpen(true)}
          onToggleTheme={toggleTheme}
          scope={statsScope}
          onScope={setStatsScope}
        />
        {updateDialog}
      </>
    )
  }

  return (
    <ProductLinksContext.Provider value={links}>
      <div className="flex h-full flex-col">
        <TopNav
          current={screen}
          onNavigate={setScreen}
          hasLeague={hasLeague}
          update={update}
          version={version}
          onOpenUpdate={() => setUpdateOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          refreshKey={dataVersion}
          onRefreshed={bumpData}
          onOpenStats={() => {
            setStatsFocus(null)
            setProduct('stats')
          }}
        />
        <main
          className={
            FULL_BLEED.includes(screen)
              ? 'flex min-h-0 flex-1 flex-col'
              : 'min-h-0 flex-1 overflow-auto px-8 py-6'
          }
        >
          {screen === 'setup' && (
            <SetupScreen
              onImported={() => {
                setHasLeague(true)
                bumpData()
              }}
              onGoLeague={() => setScreen('league')}
            />
          )}
          {screen === 'league' && <LeagueScreen key={dataVersion} onOpenPlayer={openPlayer} />}
          {screen === 'rules' && <RulesScreen onSaved={bumpData} />}
          {screen === 'players' && <PlayersScreen dataVersion={dataVersion} focus={focus} />}
          {screen === 'lineup' && <LineupScreen dataVersion={dataVersion} />}
          {screen === 'trade' && <TradeScreen dataVersion={dataVersion} />}
          {screen === 'waivers' && <WaiverScreen dataVersion={dataVersion} />}
        </main>
        {updateDialog}
      </div>
    </ProductLinksContext.Provider>
  )
}
