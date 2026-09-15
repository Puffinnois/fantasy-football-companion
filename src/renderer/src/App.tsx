import { useState } from 'react'
import { Sidebar, type Screen } from '@/components/Sidebar'

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('setup')
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar current={screen} onNavigate={setScreen} hasLeague={false} />
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <h1 className="text-2xl font-semibold capitalize">{screen}</h1>
          <p className="text-sm text-muted-foreground">Coming up.</p>
        </main>
      </div>
      <footer className="flex h-9 shrink-0 items-center border-t bg-sidebar px-4 text-xs text-muted-foreground">
        status bar
      </footer>
    </div>
  )
}
