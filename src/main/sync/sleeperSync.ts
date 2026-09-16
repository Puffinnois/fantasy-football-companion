import { withTransaction, type Db } from '@main/db/connection'
import { upsertLeague } from '@main/db/repos/leagues'
import { upsertPlayers } from '@main/db/repos/players'
import {
  getSetting,
  SETTING_ACTIVE_LEAGUE,
  SETTING_MY_USER,
  setSetting
} from '@main/db/repos/settings'
import { setNflState } from '@main/db/repos/state'
import { finishSync, getLastSync, startSync } from '@main/db/repos/syncLog'
import { replaceRosterPlayers, replaceTeams } from '@main/db/repos/teams'
import type { SleeperClient } from '@main/sources/sleeper'
import type { SyncLogEntry, SyncResult } from '@shared/types'
import { mapLeague, mapNflState, mapPlayers, mapRosterPlayers, mapTeams } from './mappers'

export const SOURCE_STATE = 'sleeper:state'
export const SOURCE_LEAGUE = 'sleeper:league'
export const SOURCE_PLAYERS = 'sleeper:players'

const MINUTE = 60 * 1000
export const FRESHNESS_MS: Record<string, number> = {
  [SOURCE_STATE]: 10 * MINUTE,
  [SOURCE_LEAGUE]: 10 * MINUTE,
  [SOURCE_PLAYERS]: 24 * 60 * MINUTE
}

export interface SyncDeps {
  db: Db
  sleeper: SleeperClient
  now?: () => Date
  onStep?: (entry: SyncLogEntry) => void
}

export interface RefreshOptions {
  force?: boolean
}

function nowOf(deps: SyncDeps): Date {
  return (deps.now ?? (() => new Date()))()
}

export function isFresh(db: Db, source: string, freshnessMs: number, now: Date): boolean {
  const last = getLastSync(db, source, 'ok')
  if (!last?.finishedAt) return false
  return now.getTime() - new Date(last.finishedAt).getTime() < freshnessMs
}

async function runStep(
  deps: SyncDeps,
  source: string,
  force: boolean,
  fn: () => Promise<number>
): Promise<SyncLogEntry> {
  const id = startSync(deps.db, source, nowOf(deps).toISOString())
  let entry: SyncLogEntry
  if (!force && isFresh(deps.db, source, FRESHNESS_MS[source], nowOf(deps))) {
    entry = finishSync(deps.db, id, 'skipped', nowOf(deps).toISOString(), 'fresh', 0)
  } else {
    try {
      const rows = await fn()
      entry = finishSync(deps.db, id, 'ok', nowOf(deps).toISOString(), null, rows)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      entry = finishSync(deps.db, id, 'error', nowOf(deps).toISOString(), message, 0)
    }
  }
  try {
    deps.onStep?.(entry)
  } catch {
    // progress reporting must never affect the sync itself
  }
  return entry
}

function syncState(deps: SyncDeps, force: boolean): Promise<SyncLogEntry> {
  return runStep(deps, SOURCE_STATE, force, async () => {
    const state = await deps.sleeper.getNflState()
    const ts = nowOf(deps).toISOString()
    withTransaction(deps.db, () => setNflState(deps.db, mapNflState(state, ts)))
    return 1
  })
}

function syncLeague(
  deps: SyncDeps,
  leagueId: string,
  myUserId: string | null,
  force: boolean
): Promise<SyncLogEntry> {
  return runStep(deps, SOURCE_LEAGUE, force, async () => {
    const [league, users, rosters] = await Promise.all([
      deps.sleeper.getLeague(leagueId),
      deps.sleeper.getLeagueUsers(leagueId),
      deps.sleeper.getLeagueRosters(leagueId)
    ])
    if (!league) throw new Error(`League ${leagueId} not found on Sleeper`)
    const ts = nowOf(deps).toISOString()
    const teams = mapTeams(leagueId, rosters, users, myUserId)
    const rosterPlayers = mapRosterPlayers(rosters)
    withTransaction(deps.db, () => {
      upsertLeague(deps.db, mapLeague(league, ts), ts)
      replaceTeams(deps.db, leagueId, teams, ts)
      replaceRosterPlayers(deps.db, leagueId, rosterPlayers, ts)
    })
    return teams.length + rosterPlayers.length
  })
}

function syncPlayers(deps: SyncDeps, force: boolean): Promise<SyncLogEntry> {
  return runStep(deps, SOURCE_PLAYERS, force, async () => {
    const all = await deps.sleeper.getAllPlayers()
    const records = mapPlayers(all)
    const ts = nowOf(deps).toISOString()
    return withTransaction(deps.db, () => upsertPlayers(deps.db, records, ts))
  })
}

export async function importLeague(
  deps: SyncDeps,
  leagueId: string,
  myUserId: string | null
): Promise<SyncResult> {
  setSetting(deps.db, SETTING_ACTIVE_LEAGUE, leagueId)
  if (myUserId) setSetting(deps.db, SETTING_MY_USER, myUserId)
  const steps: SyncLogEntry[] = []
  steps.push(await syncState(deps, true))
  steps.push(await syncLeague(deps, leagueId, myUserId, true))
  steps.push(await syncPlayers(deps, false))
  return { steps }
}

export async function refreshSleeper(
  deps: SyncDeps,
  options: RefreshOptions = {}
): Promise<SyncResult> {
  const force = options.force ?? false
  const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
  const myUserId = getSetting(deps.db, SETTING_MY_USER)
  const steps: SyncLogEntry[] = []
  steps.push(await syncState(deps, force))
  if (leagueId) steps.push(await syncLeague(deps, leagueId, myUserId, force))
  steps.push(await syncPlayers(deps, force))
  return { steps }
}
