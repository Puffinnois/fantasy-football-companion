import { useEffect, useState } from 'react'
import { ArrowUpDown, Check, ChevronRight, Search } from 'lucide-react'
import { Masthead, SectionHead } from '@/components/edition'
import { api } from '@/lib/api'
import { errorMessage, relativeTime } from '@/lib/format'
import { leagueMonogram, sourceRows } from '@/lib/setupView'
import { cn } from '@/lib/utils'
import type { League, LeagueSummary, SyncLogEntry, SyncResult, SyncStatus } from '@shared/types'

interface SetupScreenProps {
  /** A league was imported: App flips to "has a league" and reloads data. */
  onImported: () => void
  /** "Go to the standings". */
  onGoLeague?: () => void
}

const pillInput =
  'h-[38px] w-80 rounded-full border border-line bg-panel px-3.5 text-[14px] text-fg outline-none focus:border-ink'
const amberPill =
  'h-[38px] cursor-pointer rounded-full bg-brand px-5 font-cond text-[16px] leading-none font-extrabold tracking-[0.08em] text-on-brand uppercase hover:brightness-105'
const outlinePill =
  'h-[38px] cursor-pointer rounded-full border border-line px-[18px] font-cond text-[16px] leading-none font-extrabold tracking-[0.08em] text-fg uppercase hover:border-ink disabled:cursor-not-allowed disabled:text-fg-3 disabled:hover:border-line'

export function SetupScreen({ onImported, onGoLeague }: SetupScreenProps): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [idText, setIdText] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null)
  const [busy, setBusy] = useState<'find' | 'sync' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [league, setLeague] = useState<League | null>(null)
  const [runEvents, setRunEvents] = useState<SyncLogEntry[] | null>(null)
  const [imported, setImported] = useState<string | null>(null)

  function loadStatus(): void {
    void Promise.all([api.sync.status(), api.league.get()])
      .then(([s, l]) => {
        setStatus(s)
        setLeague(l)
      })
      .catch(() => undefined)
  }
  useEffect(loadStatus, [])
  useEffect(
    () => api.sync.onProgress((entry) => setRunEvents((r) => (r === null ? r : [...r, entry]))),
    []
  )

  async function findLeagues(): Promise<void> {
    const u = username.trim()
    if (!u || busy) return
    setBusy('find')
    setError(null)
    setLeagues(null)
    try {
      const result = await api.setup.findLeagues(u)
      setUserId(result.userId)
      setLeagues(result.leagues)
      if (result.leagues.length === 0)
        setError('No leagues found for this user in the current season.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  /** Runs an import or a refresh with the source list following its progress. */
  async function run(fn: () => Promise<SyncResult>, importedName: string | null): Promise<void> {
    setBusy('sync')
    setError(null)
    setImported(null)
    setRunEvents([])
    try {
      const result = await fn()
      const failed = result.steps.find((s) => s.status === 'error')
      if (failed) setError(`${failed.source}: ${failed.message}`)
      const leagueFailed = result.steps.some(
        (s) => s.source === 'sleeper:league' && s.status === 'error'
      )
      if (importedName !== null && !leagueFailed) {
        setImported(importedName)
        onImported()
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
      setRunEvents(null)
      loadStatus()
    }
  }

  const activeId = status?.activeLeagueId ?? league?.leagueId ?? null
  const sources = sourceRows(status, runEvents)
  const done = sources.filter((s) => s.state === 'ok' || s.state === 'error').length
  const nfl = status?.nflState ?? null
  const idOk = /^\d{10,}$/.test(idText.trim())

  return (
    <>
      <Masthead
        kicker="Setup · Sleeper"
        title="Connect your league"
        below={
          <p className="mt-1 max-w-[560px] text-[14px] leading-[1.4] text-pretty text-fg-2">
            Companion reads your Sleeper league, then scores every player under its rules. Nothing
            is posted back to Sleeper.
          </p>
        }
        right={
          league && (
            <div className="flex max-w-[420px] flex-col items-end gap-2">
              <span className="flex items-center gap-[7px] font-cond text-[13px] leading-none font-bold tracking-[0.14em] text-fg-2 uppercase">
                <span className="size-[7px] rounded-full bg-good" />
                Connected
              </span>
              <span className="max-w-full truncate text-right font-cond text-[40px] leading-[0.9] font-extrabold uppercase">
                {league.name}
              </span>
              <span className="font-mono text-[12px] leading-none font-medium tracking-[0.04em] text-fg-3 uppercase">
                {[
                  league.season,
                  league.totalRosters ? `${league.totalRosters} teams` : null,
                  status?.lastSleeperSync
                    ? `synced ${relativeTime(status.lastSleeperSync.finishedAt)}`
                    : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          )
        }
      />
      {imported && (
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-line bg-good-s px-8">
          <span className="flex items-center gap-[9px] font-cond text-[22px] leading-none font-extrabold uppercase">
            <span className="flex size-5 items-center justify-center rounded-full bg-good text-on-pos">
              <Check className="size-[13px]" />
            </span>
            {imported} is ready.
          </span>
          <button
            type="button"
            onClick={onGoLeague}
            className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full bg-brand px-4 font-cond text-[15px] leading-none font-extrabold tracking-[0.08em] text-on-brand uppercase hover:brightness-105"
          >
            Go to the standings
            <ChevronRight className="size-[15px]" />
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 pl-8">
        <div className="min-w-0 flex-1 overflow-auto pt-5 pr-7 pb-6">
          <SectionHead title="Find your leagues" note="This season only" />
          <form
            className="flex items-center gap-2 pt-4 pb-3.5"
            onSubmit={(e) => {
              e.preventDefault()
              void findLeagues()
            }}
          >
            <label className={cn(pillInput, 'flex items-center gap-2 text-fg-3')}>
              <Search className="size-[15px] shrink-0" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={busy !== null}
                placeholder="Sleeper username"
                autoComplete="off"
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
              />
            </label>
            {username.trim() && busy === null ? (
              <button type="submit" className={amberPill}>
                Find leagues
              </button>
            ) : (
              <button type="submit" disabled className={outlinePill}>
                {busy === 'find' ? 'Looking…' : 'Find leagues'}
              </button>
            )}
          </form>
          {error && (
            <div className="mb-3 rounded-[3px] bg-bad-s px-3 py-[9px] text-[13px] leading-[1.35] font-medium text-bad">
              {error}
            </div>
          )}
          {(leagues === null || leagues.length === 0) && (
            <p className="pt-1.5 pb-1 text-[13.5px] leading-[1.45] text-fg-3">
              Enter your Sleeper username to list your leagues for this season. Your username is the
              one shown on your Sleeper profile, not your email.
            </p>
          )}
          {(leagues ?? []).map((l) => {
            const connected = l.leagueId === activeId
            return (
              <div
                key={l.leagueId}
                className="grid h-[68px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3.5 border-b border-line"
              >
                <span
                  className={cn(
                    'flex size-10 items-center justify-center rounded-[4px] font-cond text-[17px] leading-none font-extrabold tracking-[0.04em]',
                    connected ? 'bg-brand text-on-brand' : 'border border-line bg-panel-2 text-fg-2'
                  )}
                >
                  {leagueMonogram(l.name)}
                </span>
                <div className="flex min-w-0 flex-col gap-[5px]">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15.5px] leading-[1.1] font-semibold tracking-[-0.01em]">
                      {l.name}
                    </span>
                    {connected && (
                      <span className="shrink-0 rounded-[2px] bg-good px-[5px] py-0.5 font-cond text-[11px] leading-none font-extrabold tracking-[0.1em] text-on-pos">
                        CONNECTED
                      </span>
                    )}
                  </div>
                  <span className="text-[12.5px] leading-none text-fg-3">
                    {l.season} · {l.totalRosters} teams · {l.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(() => api.setup.importLeague(l.leagueId, userId), l.name)}
                  className={cn(
                    'h-8 cursor-pointer rounded-full font-cond text-[14px] leading-none tracking-[0.08em] uppercase disabled:cursor-default disabled:opacity-60',
                    connected
                      ? 'border border-line px-3.5 font-bold text-fg hover:border-ink'
                      : 'bg-brand px-4 font-extrabold text-on-brand hover:brightness-105'
                  )}
                >
                  {busy === 'sync' ? 'Importing…' : connected ? 'Re-import' : 'Import'}
                </button>
              </div>
            )
          })}
          <div className="mt-[30px]">
            <SectionHead title="Or paste a league ID" note="From the league's Sleeper URL" />
          </div>
          <form
            className="flex items-center gap-2 pt-4 pb-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (idOk && busy === null)
                void run(() => api.setup.importLeague(idText.trim(), null), 'Your league')
            }}
          >
            <input
              value={idText}
              onChange={(e) => setIdText(e.target.value)}
              disabled={busy !== null}
              placeholder="League ID, 18 digits"
              inputMode="numeric"
              className={cn(pillInput, 'font-mono font-medium')}
            />
            <button type="submit" disabled={busy !== null || !idOk} className={outlinePill}>
              Import by ID
            </button>
          </form>
          <p className="text-[12.5px] leading-[1.4] text-fg-3">
            Without a username the app can&apos;t tell which team is yours.
          </p>
        </div>
        <aside className="w-[400px] shrink-0 overflow-auto border-l border-line pt-5 pr-8 pb-6 pl-7">
          <div className="flex items-end justify-between gap-3 border-b-2 border-ink pb-2">
            <span className="ed-section">Data sources</span>
            {runEvents === null ? (
              <button
                type="button"
                disabled={busy !== null || !activeId}
                onClick={() => void run(() => api.sync.refresh(true), null)}
                className="flex h-[26px] cursor-pointer items-center gap-[5px] rounded-full border border-line px-[11px] font-cond text-[13px] leading-none font-bold tracking-[0.08em] text-fg uppercase hover:border-ink disabled:cursor-default disabled:text-fg-3"
              >
                <ArrowUpDown className="size-3" />
                Refresh now
              </button>
            ) : (
              <span className="font-cond text-[13px] leading-none font-bold tracking-[0.1em] text-brand-fg uppercase">
                Syncing {done} of {sources.length}
              </span>
            )}
          </div>
          {sources.map((s) => (
            <div
              key={s.key}
              className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line py-2"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[14px] leading-[1.1] font-semibold">{s.label}</span>
                <span className="text-[12px] leading-[1.2] text-fg-3">{s.what}</span>
              </div>
              <div className="flex flex-col items-end gap-1 font-cond text-[12px] leading-none font-extrabold tracking-[0.08em] uppercase">
                {s.state === 'ok' && (
                  <span className="flex items-center gap-1 rounded-[2px] bg-good-s px-1.5 py-[3px] text-good">
                    <Check className="size-[11px]" />
                    {s.when}
                  </span>
                )}
                {s.state === 'running' && (
                  <span className="rounded-[2px] bg-brand px-1.5 py-[3px] text-on-brand">
                    Syncing…
                  </span>
                )}
                {s.state === 'queued' && (
                  <span className="rounded-[2px] border border-dashed border-line px-1.5 py-0.5 text-fg-3">
                    Queued
                  </span>
                )}
                {s.state === 'error' && (
                  <span
                    title={s.message}
                    className="rounded-[2px] bg-bad px-1.5 py-[3px] text-on-pos"
                  >
                    Failed
                  </span>
                )}
                {s.state === 'unknown' && (
                  <span className="font-bold text-fg-3">On next refresh</span>
                )}
                {s.rows && (
                  <span className="font-mono text-[11px] font-normal tracking-normal text-fg-3 normal-case">
                    {s.rows}
                  </span>
                )}
              </div>
            </div>
          ))}
        </aside>
      </div>
      <footer className="mx-8 flex h-11 shrink-0 items-center justify-between gap-4 border-t-2 border-ink text-[12.5px] leading-none text-fg-3">
        <span>
          {nfl
            ? `NFL ${nfl.season} · week ${nfl.displayWeek || nfl.week} · ${nfl.seasonType.replace(/_/g, ' ')} season · checked ${relativeTime(nfl.fetchedAt)}`
            : 'Checking the NFL calendar…'}
        </span>
        <span>Data refreshes on its own every few hours while the app is open.</span>
      </footer>
    </>
  )
}
