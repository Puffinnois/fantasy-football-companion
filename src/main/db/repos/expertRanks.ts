import type { ScoringFormat } from '@shared/types'
import type { Db } from '../connection'

/** `week` of the rest-of-season rows (spec §3.4). */
export const ROS_WEEK = 0

export interface ExpertRankRecord {
  /** Sleeper id (team code for DEF). */
  playerId: string
  rankEcr: number
  posRank: number
  rankAve: number | null
  rankStd: number | null
  rankMin: number | null
  rankMax: number | null
  experts: number
  grade: string | null
  projPts: number | null
}

export interface ExpertRankRow extends ExpertRankRecord {
  scoring: ScoringFormat
  updatedAt: string
}

interface Row {
  player_id: string
  scoring: ScoringFormat
  rank_ecr: number
  pos_rank: number
  rank_ave: number | null
  rank_std: number | null
  rank_min: number | null
  rank_max: number | null
  experts: number
  grade: string | null
  proj_pts: number | null
  updated_at: string
}

/** Full replace of one (season, week). Wrap in `withTransaction`. */
export function replaceExpertRanks(
  db: Db,
  season: number,
  week: number,
  scoring: ScoringFormat,
  records: ExpertRankRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM expert_ranks WHERE season = ? AND week = ?').run(season, week)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO expert_ranks (season, week, player_id, scoring, rank_ecr, pos_rank, rank_ave, rank_std,
       rank_min, rank_max, experts, grade, proj_pts, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      season,
      week,
      r.playerId,
      scoring,
      r.rankEcr,
      r.posRank,
      r.rankAve,
      r.rankStd,
      r.rankMin,
      r.rankMax,
      r.experts,
      r.grade,
      r.projPts,
      updatedAt
    )
    written++
  }
  return written
}

export function listExpertRanks(db: Db, season: number, week: number): ExpertRankRow[] {
  const rows = db
    .prepare(
      `SELECT player_id, scoring, rank_ecr, pos_rank, rank_ave, rank_std, rank_min, rank_max, experts, grade, proj_pts, updated_at
       FROM expert_ranks WHERE season = ? AND week = ? ORDER BY rank_ecr, player_id`
    )
    .all(season, week) as unknown as Row[]
  return rows.map((r) => ({
    playerId: r.player_id,
    scoring: r.scoring,
    rankEcr: r.rank_ecr,
    posRank: r.pos_rank,
    rankAve: r.rank_ave,
    rankStd: r.rank_std,
    rankMin: r.rank_min,
    rankMax: r.rank_max,
    experts: r.experts,
    grade: r.grade,
    projPts: r.proj_pts,
    updatedAt: r.updated_at
  }))
}

/** Scoring format the stored (season, week) rows were fetched under; null when none are stored. */
export function storedScoring(db: Db, season: number, week: number): ScoringFormat | null {
  const row = db
    .prepare('SELECT scoring FROM expert_ranks WHERE season = ? AND week = ? LIMIT 1')
    .get(season, week) as { scoring: ScoringFormat } | undefined
  return row?.scoring ?? null
}
