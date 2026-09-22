import { withTransaction } from '@main/db/connection'
import { replaceRosSnapshot } from '@main/db/repos/rosSnapshots'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import { buildRosSnapshot } from '@main/value/snapshot'
import type { SyncResult } from '@shared/types'
import { nowOf, runStep, SkipStep, type SyncDeps } from './step'

export const sourceRosSnapshot = (season: number): string => `snapshot:ros:${season}`
export const SEASON_OVER_MESSAGE = 'no week ahead to snapshot'

/**
 * Last step of a sync: store this week's rest-of-season snapshot (raw vs corrected points and the
 * consensus rank) so the realism correction can be backtested later. Runs every sync — within a
 * week the last one wins — and only in the regular season.
 */
export async function snapshotRos(deps: SyncDeps): Promise<SyncResult> {
  const state = getNflState(deps.db)
  const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
  if (!state || !leagueId || state.seasonType !== 'regular') return { steps: [] }
  const season = Number(state.season)
  const entry = await runStep(deps, sourceRosSnapshot(season), 0, true, async () => {
    const snap = buildRosSnapshot(deps.db, leagueId, season)
    if (!snap) throw new SkipStep(SEASON_OVER_MESSAGE)
    const rows = withTransaction(deps.db, () =>
      replaceRosSnapshot(deps.db, season, snap.week, snap.records, nowOf(deps).toISOString())
    )
    return { rows, message: `week ${snap.week}` }
  })
  return { steps: [entry] }
}
