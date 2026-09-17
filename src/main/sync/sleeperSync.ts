import { withTransaction } from '@main/db/connection'
import { upsertLeague } from '@main/db/repos/leagues'
import { upsertPlayers } from '@main/db/repos/players'
import { getRules, saveRules } from '@main/db/repos/rules'
import {
  getSetting,
  SETTING_ACTIVE_LEAGUE,
  SETTING_MY_USER,
  setSetting
} from '@main/db/repos/settings'
import { replaceProjections } from '@main/db/repos/projections'
import { getNflState, setNflState } from '@main/db/repos/state'
import { finishSync, startSync } from '@main/db/repos/syncLog'
import { replaceRosterPlayers, replaceTeams } from '@main/db/repos/teams'
import type { Rules } from '@shared/rules'
import type { SyncLogEntry, SyncResult } from '@shared/types'
import {
  mapLeague,
  mapNflState,
  mapPlayers,
  mapProjections,
  mapRosterPlayers,
  mapRules,
  mapTeams
} from './mappers'
import { nowOf, runStep as runSyncStep, SkipStep, type RefreshOptions, type SyncDeps } from './step'

export type { RefreshOptions, SyncDeps } from './step'

export const SOURCE_STATE = 'sleeper:state'
export const SOURCE_LEAGUE = 'sleeper:league'
export const SOURCE_PLAYERS = 'sleeper:players'
export const SOURCE_RULES = 'sleeper:rules'

const MINUTE = 60 * 1000
export const FRESHNESS_MS: Record<string, number> = {
  [SOURCE_STATE]: 10 * MINUTE,
  [SOURCE_LEAGUE]: 10 * MINUTE,
  [SOURCE_PLAYERS]: 24 * 60 * MINUTE
}

export const SOURCE_PROJECTIONS_PREFIX = 'sleeper:projections:'
export const sourceProjections = (season: number, week: number): string =>
  `${SOURCE_PROJECTIONS_PREFIX}${season}:${week}`
export const PROJECTIONS_FRESHNESS_MS = 6 * 60 * MINUTE

function runStep(
  deps: SyncDeps,
  source: string,
  force: boolean,
  fn: () => Promise<number>
): Promise<SyncLogEntry> {
  return runSyncStep(deps, source, FRESHNESS_MS[source] ?? 0, force, fn)
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
      // custom rules belong to the user; only Sleeper-sourced rules follow the commissioner
      if (getRules(deps.db, leagueId)?.source !== 'custom') {
        saveRules(deps.db, leagueId, mapRules(league, ts))
      }
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

/** Unofficial endpoint: only the NFL display week of the current regular season; gone → skipped. */
function syncProjections(deps: SyncDeps, force: boolean): Promise<SyncLogEntry> {
  const state = getNflState(deps.db)
  const season = state ? Number(state.season) : 0
  const week = state?.displayWeek ?? 0
  return runSyncStep(
    deps,
    sourceProjections(season, week),
    PROJECTIONS_FRESHNESS_MS,
    force,
    async () => {
      if (!state) throw new SkipStep('no NFL state yet')
      if (state.seasonType !== 'regular')
        throw new SkipStep('projections only during the regular season')
      const items = await deps.sleeper.getProjections(state.season, week)
      if (!Array.isArray(items)) throw new SkipStep('projections endpoint unavailable')
      const { records, skipped } = mapProjections(items, season, week)
      const ts = nowOf(deps).toISOString()
      const rows = withTransaction(deps.db, () =>
        replaceProjections(deps.db, season, week, records, ts)
      )
      return { rows, message: skipped ? `${skipped} items skipped` : null }
    }
  )
}

export async function importLeague(
  deps: SyncDeps,
  leagueId: string,
  myUserId: string | null
): Promise<SyncResult> {
  const steps: SyncLogEntry[] = []
  steps.push(await syncState(deps, true))
  const leagueEntry = await syncLeague(deps, leagueId, myUserId, true)
  steps.push(leagueEntry)
  if (leagueEntry.status === 'ok') {
    setSetting(deps.db, SETTING_ACTIVE_LEAGUE, leagueId)
    if (myUserId) setSetting(deps.db, SETTING_MY_USER, myUserId)
  }
  steps.push(await syncPlayers(deps, false))
  steps.push(await syncProjections(deps, false))
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
  steps.push(await syncProjections(deps, force))
  return { steps }
}

/** Explicit "Re-import from Sleeper": overwrites whatever rules exist, including custom ones. */
export async function reimportRules(deps: SyncDeps, leagueId: string): Promise<Rules> {
  const id = startSync(deps.db, SOURCE_RULES, nowOf(deps).toISOString())
  try {
    const league = await deps.sleeper.getLeague(leagueId)
    if (!league) throw new Error(`League ${leagueId} not found on Sleeper`)
    const rules = mapRules(league, nowOf(deps).toISOString())
    withTransaction(deps.db, () => saveRules(deps.db, leagueId, rules))
    finishSync(
      deps.db,
      id,
      'ok',
      nowOf(deps).toISOString(),
      null,
      Object.keys(rules.scoring).length
    )
    return rules
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    finishSync(deps.db, id, 'error', nowOf(deps).toISOString(), message, 0)
    throw err
  }
}
