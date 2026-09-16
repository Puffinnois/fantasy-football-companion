import { useCallback, useEffect, useState } from 'react'
import { Sidebar, type Screen } from '@/components/Sidebar'
import { SetupScreen } from '@/screens/SetupScreen'
import { api } from '@/lib/api'

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('league')
  const [hasLeague, setHasLeague] = useState<boolean | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const bumpData = useCallback(() => setDataVersion((v) => v + 1), [])

  useEffect(() => {
    void api.league.get().then((league) => {
      setHasLeague(league !== null)
      if (league === null) setScreen('setup')
    })
  }, [])

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
          {screen === 'league' && (
            <p key={dataVersion} className="text-sm text-muted-foreground">
              League screen arrives in the next task.
            </p>
          )}
        </main>
      </div>
      <footer className="flex h-9 shrink-0 items-center border-t bg-sidebar px-4 text-xs text-muted-foreground">
        status bar
      </footer>
    </div>
  )
}
