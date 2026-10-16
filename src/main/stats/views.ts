import type { StatsDb } from './db'

async function existing(db: StatsDb, tables: string[]): Promise<Set<string>> {
  const rows = await db.all<{ table_name: string }>(
    `SELECT table_name FROM duckdb_tables() WHERE schema_name = 'main'
     AND table_name IN (${tables.map(() => '?').join(', ')})`,
    tables
  )
  return new Set(rows.map((r) => r.table_name))
}

/**
 * The counting rules of the warehouse spec §11–§12, as columns of `plays` (stats-analysis spec
 * §4.2). A play `counts` unless a penalty wiped it out or it is a two-point try; a snap counts
 * either way (nflverse's snap counts do).
 */
const COUNTS = "coalesce(p.play_type, '') <> 'no_play' AND coalesce(p.two_point_attempt, 0) = 0"
export const PLAY_FLAGS: Record<string, string> = {
  counts: COUNTS,
  is_snap:
    'coalesce(p.pass, 0) = 1 OR coalesce(p.rush, 0) = 1 OR coalesce(p.qb_kneel, 0) = 1 OR coalesce(p.qb_spike, 0) = 1',
  is_dropback: `(${COUNTS}) AND coalesce(p.qb_dropback, 0) = 1 AND p.passer_id IS NOT NULL`,
  is_carry: `(${COUNTS}) AND (p.play_type = 'run' OR coalesce(p.qb_kneel, 0) = 1) AND p.rusher_player_id IS NOT NULL`,
  is_target: `(${COUNTS}) AND p.receiver_player_id IS NOT NULL AND coalesce(p.pass_attempt, 0) = 1 AND coalesce(p.sack, 0) = 0`
}

/** `plays`: every non-deleted play, with FTN (2022+) and participation columns when published. */
function playsView(have: Set<string>): string | null {
  if (!have.has('src_pbp')) return null
  const parts = ['p.*']
  const joins: string[] = []
  if (have.has('src_ftn')) {
    parts.push('f.* EXCLUDE (game_id, play_id, season, week)')
    joins.push('LEFT JOIN src_ftn f ON f.game_id = p.game_id AND f.play_id = p.play_id')
  }
  if (have.has('src_participation')) {
    parts.push('x.* EXCLUDE (game_id, play_id, season, old_game_id)')
    joins.push('LEFT JOIN src_participation x ON x.game_id = p.game_id AND x.play_id = p.play_id')
  }
  const flags = Object.entries(PLAY_FLAGS).map(([name, expr]) => `(${expr}) AS ${name}`)
  return `CREATE OR REPLACE VIEW plays AS
    SELECT ${[...parts, ...flags].join(',\n           ')}
    FROM src_pbp p ${joins.join(' ')}
    WHERE coalesce(p.play_deleted, 0) = 0`
}

/** Kickoffs in UTC: nflverse lists games in Eastern time. */
const KICKOFFS = `SELECT season, CASE WHEN game_type = 'REG' THEN 'REG' ELSE 'POST' END AS season_type, week,
    min(timezone('America/New_York', strptime(gameday || ' ' || gametime, '%Y-%m-%d %H:%M'))) AS kickoff
  FROM games WHERE gameday IS NOT NULL AND gametime IS NOT NULL GROUP BY ALL`

/**
 * `depth_chart_week`: one row per player × slot × week. Through 2024 nflverse publishes weekly
 * rows; from 2025 timestamped snapshots, where week w takes the last snapshot before its first
 * kickoff, playoff weeks included (coverage audit fix 1). A week kicking off after the latest
 * snapshot is left out, except the next one, which takes the latest.
 */
function depthChartView(have: Set<string>): string | null {
  const weekly = have.has('src_depth_charts')
    ? `SELECT season, season_type, week, gsis_id, NULL::VARCHAR AS espn_id, team, full_name AS player_name,
              formation, coalesce(depth_position, position) AS position, depth_team::INTEGER AS depth,
              NULL::VARCHAR AS snapshot
       FROM src_depth_charts WHERE season_type IS NOT NULL`
    : null
  const snapshots =
    have.has('src_depth_chart_snapshots') && have.has('games')
      ? `SELECT w.season, w.season_type, w.week, d.gsis_id, d.espn_id::VARCHAR AS espn_id, d.team,
                d.player_name, d.pos_grp AS formation, d.pos_abb AS position, d.pos_rank::INTEGER AS depth,
                d.dt AS snapshot
         FROM (SELECT k.season, k.season_type, k.week,
                      (SELECT max(s.taken_at) FROM snaps s WHERE s.season = k.season AND s.taken_at < k.kickoff) AS taken_at
               FROM kick k JOIN latest l USING (season)
               WHERE k.kickoff <= l.taken_at
                  OR k.kickoff = (SELECT min(k2.kickoff) FROM kick k2 WHERE k2.season = k.season AND k2.kickoff > l.taken_at)) w
         JOIN src_depth_chart_snapshots d ON d.season = w.season AND d.dt::TIMESTAMPTZ = w.taken_at`
      : null
  if (weekly === null && snapshots === null) return null
  const ctes = snapshots
    ? `WITH kick AS (${KICKOFFS}),
       snaps AS (SELECT DISTINCT season, dt::TIMESTAMPTZ AS taken_at FROM src_depth_chart_snapshots),
       latest AS (SELECT season, max(taken_at) AS taken_at FROM snaps GROUP BY season)`
    : ''
  const body = [weekly, snapshots].filter((s): s is string => s !== null).join('\nUNION ALL\n')
  return `CREATE OR REPLACE VIEW depth_chart_week AS ${ctes} ${body}`
}

/**
 * (Re)creates the views over the tables that exist; called after every refresh, because a view's
 * `*` is bound when it is created and the tables gain columns.
 */
export async function buildViews(db: StatsDb): Promise<string[]> {
  const have = await existing(db, [
    'src_pbp',
    'src_ftn',
    'src_participation',
    'src_depth_charts',
    'src_depth_chart_snapshots',
    'games'
  ])
  const built: string[] = []
  for (const [name, sql] of [
    ['plays', playsView(have)],
    ['depth_chart_week', depthChartView(have)]
  ] as const) {
    if (sql === null) continue
    await db.exec(sql)
    built.push(name)
  }
  return built
}
