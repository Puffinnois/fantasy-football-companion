import { useCallback, useEffect, useState } from 'react'
import { TopNav, type Screen } from '@/components/TopNav'
import { UpdateDialog } from '@/components/UpdateDialog'
import { SetupScreen } from '@/screens/SetupScreen'
import { LeagueScreen } from '@/screens/LeagueScreen'
import { RulesScreen } from '@/screens/RulesScreen'
import { PlayersScreen } from '@/screens/PlayersScreen'
import { LineupScreen } from '@/screens/LineupScreen'
import { TradeScreen } from '@/screens/TradeScreen'
import { WaiverScreen } from '@/screens/WaiverScreen'
import { api } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { useUpdateState } from '@/lib/useUpdateState'

/** Screens with an Edition masthead lay out their own scroll regions; the rest scroll as a page. */
const FULL_BLEED: Screen[] = ['league', 'players', 'lineup', 'waivers', 'setup']

export default function App(): React.JSX.Element {
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
        if (league === null) setScreen('setup')
      })
      .catch(() => {
        setHasLeague(false)
        setScreen('setup')
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

  return (
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
      <UpdateDialog
        state={update}
        currentVersion={version ?? '?'}
        open={updateOpen}
        onOpenChange={setUpdateOpen}
      />
    </div>
  )
}
