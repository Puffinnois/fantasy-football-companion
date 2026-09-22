import type { Db } from '@main/db/connection'
import { listExpertRanks, ROS_WEEK } from '@main/db/repos/expertRanks'
import { listMarketValues } from '@main/db/repos/marketValues'
import type { RosSnapshotRecord } from '@main/db/repos/rosSnapshots'
import { assembleValue } from './build'
import { futureTotal } from './realism'
import { loadSeries } from './series'

export interface RosSnapshot {
  /** The current week when taken; the ROS totals cover the weeks after it. */
  week: number
  records: RosSnapshotRecord[]
}

/**
 * What a later backtest of the realism correction needs (value-and-signals.md, "Rest-of-season
 * realism"): per player, the raw and corrected rest-of-season points and the consensus rank with
 * its spread. Players with nothing projected ahead and no rank are left out. Null when no week
 * is ahead (the season is over).
 */
export function buildRosSnapshot(db: Db, leagueId: string, season: number): RosSnapshot | null {
  const bundle = loadSeries(db, leagueId, season)
  const ranks = listExpertRanks(db, season, ROS_WEEK)
  const build = assembleValue(bundle, { ranks, market: listMarketValues(db, season) })
  const week = bundle.currentWeek
  if (week >= build.context.lastWeek) return null
  const byId = new Map(ranks.map((r) => [r.playerId, r]))
  const adjustments = new Map(build.rows.map((r) => [r.playerId, r.rosAdjust]))
  const records: RosSnapshotRecord[] = []
  for (const raw of bundle.players) {
    const id = raw.base.playerId
    const rank = byId.get(id) ?? null
    const rawRos = futureTotal(raw, week)
    if (rawRos === 0 && rank === null) continue
    const corrected = build.series.get(id)
    const adj = adjustments.get(id) ?? null
    records.push({
      playerId: id,
      position: raw.base.position,
      scoring: rank?.scoring ?? null,
      rawRos,
      correctedRos: corrected ? futureTotal(corrected, week) : rawRos,
      factor: adj?.factor ?? null,
      capped: adj?.capped ?? false,
      shelved: adj?.shelved ?? false,
      posRank: rank?.posRank ?? null,
      rankEcr: rank?.rankEcr ?? null,
      rankStd: rank?.rankStd ?? null,
      rankMin: rank?.rankMin ?? null,
      rankMax: rank?.rankMax ?? null,
      experts: rank?.experts ?? null
    })
  }
  return { week, records }
}
