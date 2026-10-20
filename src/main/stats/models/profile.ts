/**
 * Profile models (stats-analysis spec §8.7). Each combine measure is scored 0–10 by its percentile
 * within the position group over every combine since 2000 (ties share the middle); the athletic
 * score is their average, over the measures the player has (four at least, so height and weight
 * alone are not a score). Speed Score = 200 × weight / 40-time⁴ (Bill Barnwell's formula).
 */

/** Combine measures: the column, its `player_profile` name, and whether lower is better. */
export const COMBINE_MEASURES: { name: string; expr: string; lower: boolean }[] = [
  {
    name: 'height',
    expr: "try_cast(split_part(c.ht, '-', 1) AS INTEGER) * 12 + try_cast(split_part(c.ht, '-', 2) AS INTEGER)",
    lower: false
  },
  { name: 'weight', expr: 'c.wt', lower: false },
  { name: 'forty', expr: 'c.forty', lower: true },
  { name: 'bench', expr: 'c.bench', lower: false },
  { name: 'vertical', expr: 'c.vertical', lower: false },
  { name: 'broad_jump', expr: 'c.broad_jump', lower: false },
  { name: 'cone', expr: 'c.cone', lower: true },
  { name: 'shuttle', expr: 'c.shuttle', lower: true }
]

/** A relative athletic score needs this many measures. */
export const RAS_MIN_MEASURES = 4

/** Combine positions by position group (kickers, punters and snappers get no score). */
const GROUP = `CASE
    WHEN c.pos = 'QB' THEN 'QB'
    WHEN c.pos IN ('RB', 'FB') THEN 'RB'
    WHEN c.pos IN ('WR', 'CB/WR') THEN 'WR'
    WHEN c.pos = 'TE' THEN 'TE'
    WHEN c.pos IN ('OT', 'OG', 'C', 'OL', 'G') THEN 'OL'
    WHEN c.pos IN ('DT', 'DE', 'DL', 'EDGE') THEN 'DL'
    WHEN c.pos IN ('OLB', 'ILB', 'LB') THEN 'LB'
    WHEN c.pos IN ('CB', 'S', 'SAF', 'DB') THEN 'DB'
  END`

/**
 * A measure's 0–10 score: its mid-rank percentile within the position group (players tied on a
 * measure share the middle of their ranks, so a common 4.50 40 is not scored as the slowest).
 */
const score = (m: (typeof COMBINE_MEASURES)[number]): string => {
  const among = `PARTITION BY position_group, ${m.name} IS NULL`
  return `CASE WHEN ${m.name} IS NOT NULL AND position_group IS NOT NULL THEN
      10 * (rank() OVER (${among} ORDER BY ${m.name} ${m.lower ? 'DESC' : 'ASC'}) - 1
            + (count(*) OVER (PARTITION BY position_group, ${m.name}) - 1) / 2)
         / nullif(count(*) OVER (${among}) - 1, 0) END AS ${m.name}_score`
}

/**
 * `player_profile`: one row per combine attendee with a gsis id. Percentiles count every combine
 * row since 2000, linked to a player or not.
 */
const PROFILE_SQL = `
  WITH measured AS (
    SELECT c.season AS combine_season, c.player_name, c.school, c.pos AS combine_pos,
           ${GROUP} AS position_group,
           ${COMBINE_MEASURES.map((m) => `(${m.expr})::DOUBLE AS ${m.name}`).join(', ')},
           c.draft_round, c.draft_ovr
    FROM src_combine c
  ),
  scored AS (SELECT *, ${COMBINE_MEASURES.map(score).join(', ')} FROM measured),
  counted AS (
    SELECT *, ${COMBINE_MEASURES.map((m) => `(${m.name}_score IS NOT NULL)::INT`).join(' + ')} AS ras_measures
    FROM scored
  )
  SELECT i.gsis_id, s.* EXCLUDE (player_name, school),
         CASE WHEN s.ras_measures >= ${RAS_MIN_MEASURES} THEN
           (${COMBINE_MEASURES.map((m) => `coalesce(s.${m.name}_score, 0)`).join(' + ')}) / s.ras_measures END AS ras,
         CASE WHEN s.forty > 0 THEN 200 * s.weight / pow(s.forty, 4) END AS speed_score
  FROM counted s
  JOIN combine_ids i ON i.season = s.combine_season AND i.player_name = s.player_name
    AND i.school IS NOT DISTINCT FROM s.school
  WHERE i.gsis_id IS NOT NULL
  QUALIFY row_number() OVER (PARTITION BY i.gsis_id ORDER BY s.combine_season DESC) = 1`

/** Without the combine (not loaded yet), an empty table of the same shape. */
const EMPTY_PROFILE = `SELECT NULL::VARCHAR AS gsis_id, NULL::INTEGER AS combine_season,
    NULL::VARCHAR AS combine_pos, NULL::VARCHAR AS position_group,
    ${COMBINE_MEASURES.map((m) => `NULL::DOUBLE AS ${m.name}`).join(', ')},
    NULL::DOUBLE AS draft_round, NULL::DOUBLE AS draft_ovr,
    ${COMBINE_MEASURES.map((m) => `NULL::DOUBLE AS ${m.name}_score`).join(', ')},
    NULL::INTEGER AS ras_measures, NULL::DOUBLE AS ras, NULL::DOUBLE AS speed_score
  WHERE false`

/** `player_profile`'s select for the tables at hand. */
export const profileSql = (tables: ReadonlySet<string>): string =>
  tables.has('src_combine') && tables.has('combine_ids') ? PROFILE_SQL : EMPTY_PROFILE
