import type { Db } from '../connection'

export interface PlayerRecord {
  playerId: string
  fullName: string
  firstName: string | null
  lastName: string | null
  position: string | null
  fantasyPositions: string[] | null
  team: string | null
  status: string | null
  injuryStatus: string | null
  injuryBodyPart: string | null
  injuryNotes: string | null
  age: number | null
  yearsExp: number | null
  depthChartOrder: number | null
  searchRank: number | null
  gsisId: string | null
  sportradarId: string | null
  espnId: string | null
}

export function upsertPlayers(db: Db, players: PlayerRecord[], updatedAt: string): number {
  const stmt = db.prepare(
    `INSERT INTO players (player_id, full_name, first_name, last_name, position, fantasy_positions, team, status,
       injury_status, injury_body_part, injury_notes, age, years_exp, depth_chart_order, search_rank, gsis_id,
       sportradar_id, espn_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET full_name = excluded.full_name, first_name = excluded.first_name,
       last_name = excluded.last_name, position = excluded.position, fantasy_positions = excluded.fantasy_positions,
       team = excluded.team, status = excluded.status, injury_status = excluded.injury_status,
       injury_body_part = excluded.injury_body_part, injury_notes = excluded.injury_notes, age = excluded.age,
       years_exp = excluded.years_exp, depth_chart_order = excluded.depth_chart_order, search_rank = excluded.search_rank,
       gsis_id = excluded.gsis_id, sportradar_id = excluded.sportradar_id, espn_id = excluded.espn_id,
       updated_at = excluded.updated_at`
  )
  let written = 0
  for (const p of players) {
    stmt.run(
      p.playerId,
      p.fullName,
      p.firstName,
      p.lastName,
      p.position,
      p.fantasyPositions ? JSON.stringify(p.fantasyPositions) : null,
      p.team,
      p.status,
      p.injuryStatus,
      p.injuryBodyPart,
      p.injuryNotes,
      p.age,
      p.yearsExp,
      p.depthChartOrder,
      p.searchRank,
      p.gsisId,
      p.sportradarId,
      p.espnId,
      updatedAt
    )
    written++
  }
  return written
}

export function countPlayers(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM players').get() as { n: number }).n
}
