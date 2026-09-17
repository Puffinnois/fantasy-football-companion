import type { SyncResult } from '@shared/types'
import { refreshNflverse, type NflverseSyncDeps } from './nflverseSync'
import { importLeague, refreshSleeper, SOURCE_PLAYERS } from './sleeperSync'
import type { RefreshOptions } from './step'

/** Refresh button / on-launch: Sleeper first (it sets the NFL season), then nflverse. */
export async function refreshAll(
  deps: NflverseSyncDeps,
  options: RefreshOptions = {}
): Promise<SyncResult> {
  const sleeper = await refreshSleeper(deps, options)
  const playersChanged = sleeper.steps.some((s) => s.source === SOURCE_PLAYERS && s.status === 'ok')
  const nflverse = await refreshNflverse(deps, { ...options, playersChanged })
  return { steps: [...sleeper.steps, ...nflverse.steps] }
}

/** Setup → Import: the Sleeper first import followed by the full nflverse pipeline. */
export async function importAll(
  deps: NflverseSyncDeps,
  leagueId: string,
  myUserId: string | null
): Promise<SyncResult> {
  const sleeper = await importLeague(deps, leagueId, myUserId)
  const nflverse = await refreshNflverse(deps, { playersChanged: true })
  return { steps: [...sleeper.steps, ...nflverse.steps] }
}
