import { useCallback, useEffect, useState } from 'react'
import { Sidebar, type Screen } from '@/components/Sidebar'
import { StatusBar } from '@/components/StatusBar'
import { SetupScreen } from '@/screens/SetupScreen'
import { LeagueScreen } from '@/screens/LeagueScreen'
import { api } from '@/lib/api'

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('league')
  const [hasLeague, setHasLeague] = useState<boolean | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const bumpData = useCallback(() => setDataVersion((v) => v + 1), [])

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
        if (entry.source === 'sleeper:league' && entry.status === 'ok') bumpData()
      }),
    [bumpData]
  )

  if (hasLeague === null) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar current={screen} onNavigate={setScreen} hasLeague={hasLeague} />
        <main className="min-w-0 flex-1 overflow-auto p-6">
          {screen === 'setup' && (
            <SetupScreen
              onImported={() => {
                setHasLeague(true)
                setScreen('league')
                bumpData()
              }}
            />
          )}
          {screen === 'league' && <LeagueScreen key={dataVersion} />}
        </main>
      </div>
      <StatusBar refreshKey={dataVersion} onRefreshed={bumpData} />
    </div>
  )
}
