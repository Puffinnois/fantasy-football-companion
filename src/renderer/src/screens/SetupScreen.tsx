import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import type { LeagueSummary, SyncLogEntry } from '@shared/types'

interface SetupScreenProps {
  onImported: () => void
}

function errorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
    : String(err)
}

export function SetupScreen({ onImported }: SetupScreenProps): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [leagueIdInput, setLeagueIdInput] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [leagues, setLeagues] = useState<LeagueSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncLogEntry[]>([])

  useEffect(() => api.sync.onProgress((entry) => setProgress((p) => [...p, entry])), [])

  async function findLeagues(): Promise<void> {
    setBusy(true)
    setError(null)
    setLeagues([])
    try {
      const result = await api.setup.findLeagues(username)
      setUserId(result.userId)
      setLeagues(result.leagues)
      if (result.leagues.length === 0)
        setError('No leagues found for this user in the current season.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function importLeague(leagueId: string, ownerUserId: string | null): Promise<void> {
    setBusy(true)
    setError(null)
    setProgress([])
    try {
      const result = await api.setup.importLeague(leagueId, ownerUserId)
      const failed = result.steps.find((s) => s.status === 'error')
      if (failed) setError(`${failed.source}: ${failed.message}`)
      else onImported()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Connect your Sleeper league</h1>
        <p className="text-sm text-muted-foreground">
          Enter your Sleeper username to list your leagues for this season.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void findLeagues()
        }}
      >
        <Input
          placeholder="Sleeper username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
          autoFocus
        />
        <Button type="submit" disabled={busy || username.trim() === ''}>
          Find leagues
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {leagues.map((l) => (
          <Card key={l.leagueId}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{l.name}</CardTitle>
                <CardDescription>
                  {l.season} · {l.totalRosters} teams · {l.status.replace(/_/g, ' ')}
                </CardDescription>
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void importLeague(l.leagueId, userId)}
              >
                Import
              </Button>
            </CardHeader>
          </Card>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">…or paste a league ID</summary>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void importLeague(leagueIdInput.trim(), null)
          }}
        >
          <Input
            placeholder="League ID (18 digits)"
            value={leagueIdInput}
            onChange={(e) => setLeagueIdInput(e.target.value)}
            disabled={busy}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || !/^\d{10,}$/.test(leagueIdInput.trim())}
          >
            Import by ID
          </Button>
        </form>
        <p className="mt-1 text-xs text-muted-foreground">
          Without a username the app cannot tell which team is yours.
        </p>
      </details>

      {progress.length > 0 && (
        <Card>
          <CardContent className="space-y-1 pt-4 text-sm">
            {progress.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span className="text-muted-foreground">{p.source}</span>
                <span className={p.status === 'error' ? 'text-destructive' : ''}>
                  {p.status}
                  {p.rowsWritten ? ` · ${p.rowsWritten} rows` : ''}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
