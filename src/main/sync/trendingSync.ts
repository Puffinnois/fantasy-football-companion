import { withTransaction } from '@main/db/connection'
import { replaceTrendingAdds, type TrendingRecord } from '@main/db/repos/trending'
import type { SleeperTrendingPlayer } from '@main/sources/sleeper-types'
import type { SyncResult } from '@shared/types'
import { nowOf, runStep, type SyncDeps } from './step'

export const SOURCE_TRENDING = 'sleeper:trending:add'

/** Keeps well-formed rows only, so one bad row can't sink the step. */
export function mapTrending(items: SleeperTrendingPlayer[]): TrendingRecord[] {
  return items.flatMap((it) =>
    typeof it.player_id === 'string' && it.player_id !== '' && Number.isFinite(it.count)
      ? [{ playerId: it.player_id, count: Math.round(it.count) }]
      : []
  )
}

/**
 * Slice 6c spec §5.1: the Stash list's trending signal. Runs every sync, before the ROS snapshot
 * that records it; a failure is logged and leaves the previous fetch in place.
 */
export async function refreshTrending(deps: SyncDeps): Promise<SyncResult> {
  const entry = await runStep(deps, SOURCE_TRENDING, 0, true, async () => {
    const records = mapTrending(await deps.sleeper.getTrendingAdds())
    return withTransaction(deps.db, () =>
      replaceTrendingAdds(deps.db, records, nowOf(deps).toISOString())
    )
  })
  return { steps: [entry] }
}
