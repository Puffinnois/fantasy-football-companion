import { pruneSyncLog } from '@main/db/repos/syncLog'
import type { SyncResult } from '@shared/types'
import { refreshExperts, type ExpertSyncDeps } from './expertSync'
import { refreshNflverse, type NflverseSyncDeps } from './nflverseSync'
import { snapshotRos } from './snapshotSync'
import { importLeague, refreshSleeper, SOURCE_PLAYERS } from './sleeperSync'
import { nowOf, type RefreshOptions } from './step'

/** Everything the full pipeline needs: Sleeper, nflverse and the expert sources. */
export type AppSyncDeps = NflverseSyncDeps & ExpertSyncDeps

const SYNC_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** Refresh button / on-launch: Sleeper first (it sets the NFL season), then nflverse, then the expert layer (it needs the crosswalk). */
export async function refreshAll(
  deps: AppSyncDeps,
  options: RefreshOptions = {}
): Promise<SyncResult> {
  pruneSyncLog(deps.db, new Date(nowOf(deps).getTime() - SYNC_LOG_RETENTION_MS).toISOString())
  const sleeper = await refreshSleeper(deps, options)
  const playersChanged = sleeper.steps.some((s) => s.source === SOURCE_PLAYERS && s.status === 'ok')
  const nflverse = await refreshNflverse(deps, { ...options, playersChanged })
  const experts = await refreshExperts(deps, options)
  const snapshot = await snapshotRos(deps)
  return { steps: [...sleeper.steps, ...nflverse.steps, ...experts.steps, ...snapshot.steps] }
}

/** Setup → Import: the Sleeper first import followed by the full nflverse pipeline and the expert layer. */
export async function importAll(
  deps: AppSyncDeps,
  leagueId: string,
  myUserId: string | null
): Promise<SyncResult> {
  const sleeper = await importLeague(deps, leagueId, myUserId)
  const nflverse = await refreshNflverse(deps, { playersChanged: true })
  const experts = await refreshExperts(deps)
  const snapshot = await snapshotRos(deps)
  return { steps: [...sleeper.steps, ...nflverse.steps, ...experts.steps, ...snapshot.steps] }
}
