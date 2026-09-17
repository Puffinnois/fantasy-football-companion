import type { LeagueSettings, Position, Rules, RulesSource, StatKey } from '@shared/rules'
import type { Db } from '../connection'

const ALL_POSITIONS = ''

interface RulesRow {
  source: RulesSource
  settings_json: string
  updated_at: string
}

interface ScoringRow {
  stat_key: string
  position: string
  points: number
}

interface SlotRow {
  slot: string
  count: number
}

/** Replaces every rules row for the league. Wrap in `withTransaction`. */
export function saveRules(db: Db, leagueId: string, rules: Rules): void {
  const ts = rules.updatedAt
  db.prepare(
    `INSERT INTO rules (league_id, source, settings_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(league_id) DO UPDATE SET source = excluded.source,
       settings_json = excluded.settings_json, updated_at = excluded.updated_at`
  ).run(leagueId, rules.source, JSON.stringify(rules.settings), ts)

  db.prepare('DELETE FROM scoring_rules WHERE league_id = ?').run(leagueId)
  const insertScore = db.prepare(
    'INSERT INTO scoring_rules (league_id, stat_key, position, points, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  for (const [key, points] of Object.entries(rules.scoring)) {
    insertScore.run(leagueId, key, ALL_POSITIONS, points, ts)
  }
  for (const [position, overrides] of Object.entries(rules.positionOverrides)) {
    for (const [key, points] of Object.entries(overrides ?? {})) {
      insertScore.run(leagueId, key, position, points, ts)
    }
  }

  db.prepare('DELETE FROM roster_slots WHERE league_id = ?').run(leagueId)
  const insertSlot = db.prepare(
    'INSERT INTO roster_slots (league_id, slot, count, ordinal, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  rules.rosterSlots.forEach((s, i) => insertSlot.run(leagueId, s.slot, s.count, i, ts))
}

export function getRules(db: Db, leagueId: string): Rules | null {
  const head = db
    .prepare('SELECT source, settings_json, updated_at FROM rules WHERE league_id = ?')
    .get(leagueId) as RulesRow | undefined
  if (!head) return null

  const scoring: Record<StatKey, number> = {}
  const positionOverrides: Rules['positionOverrides'] = {}
  const scoringRows = db
    .prepare(
      'SELECT stat_key, position, points FROM scoring_rules WHERE league_id = ? ORDER BY stat_key'
    )
    .all(leagueId) as unknown as ScoringRow[]
  for (const row of scoringRows) {
    if (row.position === ALL_POSITIONS) scoring[row.stat_key] = row.points
    else (positionOverrides[row.position as Position] ??= {})[row.stat_key] = row.points
  }

  const rosterSlots = (
    db
      .prepare('SELECT slot, count FROM roster_slots WHERE league_id = ? ORDER BY ordinal')
      .all(leagueId) as unknown as SlotRow[]
  ).map((r) => ({ slot: r.slot, count: r.count }))

  return {
    source: head.source,
    updatedAt: head.updated_at,
    scoring,
    positionOverrides,
    rosterSlots,
    settings: JSON.parse(head.settings_json) as LeagueSettings
  }
}
