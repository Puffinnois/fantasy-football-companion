import type { ScoringFormat } from '@shared/types'
import type { Db } from '../connection'

export interface RosSnapshotRecord {
  playerId: string
  position: string | null
  scoring: ScoringFormat | null
  /** Sleeper projected points for the weeks after the snapshot week, before the correction. */
  rawRos: number
  correctedRos: number
  factor: number | null
  capped: boolean
  shelved: boolean
  posRank: number | null
  rankEcr: number | null
  rankStd: number | null
  rankMin: number | null
  rankMax: number | null
  experts: number | null
}

export interface RosSnapshotRow extends RosSnapshotRecord {
  takenAt: string
}

interface Row {
  player_id: string
  position: string | null
  scoring: ScoringFormat | null
  raw_ros: number
  corrected_ros: number
  factor: number | null
  capped: number
  shelved: number
  pos_rank: number | null
  rank_ecr: number | null
  rank_std: number | null
  rank_min: number | null
  rank_max: number | null
  experts: number | null
  taken_at: string
}

/** Replaces the week's snapshot: the last sync while a week is current wins. */
export function replaceRosSnapshot(
  db: Db,
  season: number,
  week: number,
  records: RosSnapshotRecord[],
  takenAt: string
): number {
  db.prepare('DELETE FROM ros_snapshots WHERE season = ? AND week = ?').run(season, week)
  const insert = db.prepare(
    `INSERT INTO ros_snapshots (season, week, player_id, position, scoring, raw_ros, corrected_ros, factor,
       capped, shelved, pos_rank, rank_ecr, rank_std, rank_min, rank_max, experts, taken_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const r of records) {
    insert.run(
      season,
      week,
      r.playerId,
      r.position,
      r.scoring,
      r.rawRos,
      r.correctedRos,
      r.factor,
      r.capped ? 1 : 0,
      r.shelved ? 1 : 0,
      r.posRank,
      r.rankEcr,
      r.rankStd,
      r.rankMin,
      r.rankMax,
      r.experts,
      takenAt
    )
  }
  return records.length
}

export function listRosSnapshot(db: Db, season: number, week: number): RosSnapshotRow[] {
  const rows = db
    .prepare('SELECT * FROM ros_snapshots WHERE season = ? AND week = ? ORDER BY player_id')
    .all(season, week) as unknown as Row[]
  return rows.map((r) => ({
    playerId: r.player_id,
    position: r.position,
    scoring: r.scoring,
    rawRos: r.raw_ros,
    correctedRos: r.corrected_ros,
    factor: r.factor,
    capped: r.capped === 1,
    shelved: r.shelved === 1,
    posRank: r.pos_rank,
    rankEcr: r.rank_ecr,
    rankStd: r.rank_std,
    rankMin: r.rank_min,
    rankMax: r.rank_max,
    experts: r.experts,
    takenAt: r.taken_at
  }))
}
