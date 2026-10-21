import type { PlayerBio, PlayerBioQuery, PlayerStatus } from '@shared/stats/types'
import type { StatsDb } from '../db'
import { inspect } from '../derived/build'
import { col } from '../models/load'
import { StatsQueryError } from './compile'

const GSIS = /^00-[0-9]{7}$/

/** nflverse roster codes of the reserve lists (`status_description_abbr` when `status` is RES). */
const RESERVE: Record<string, NonNullable<PlayerStatus['reserve']>> = {
  R01: 'IR',
  R48: 'IR',
  R04: 'PUP',
  R05: 'NFI',
  R40: 'Suspended'
}

const REPORT: Record<string, PlayerStatus['report']> = {
  Out: 'Out',
  Doubtful: 'Doubtful',
  Questionable: 'Questionable'
}

const PRACTICE: Record<string, PlayerStatus['practice']> = {
  'Did Not Participate In Practice': 'DNP',
  'Limited Participation in Practice': 'Limited',
  'Full Participation in Practice': 'Full'
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Spec §9.4 header and Profile: a player's identity (`players`), his team and number on his latest
 * roster, the seasons he played, and his status now: a reserve list on the latest roster week, or
 * the latest week's injury report (both only in the latest season, so a past injury is not shown).
 */
export async function playerBio(db: StatsDb, q: PlayerBioQuery): Promise<PlayerBio> {
  if (typeof q.player !== 'string' || !GSIS.test(q.player))
    throw new StatsQueryError('player must be a gsis id')
  const have = await inspect(db)
  if (!have.tables.has('players')) throw new StatsQueryError('the players table is not built yet')
  const p = await db.get<Record<string, unknown>>('SELECT * FROM players WHERE gsis_id = ?', [
    q.player
  ])
  if (!p) throw new StatsQueryError(`no player ${q.player}`)

  const r = col(have, 'src_rosters', 'r')
  const roster = have.tables.has('src_rosters')
    ? await db.get<Record<string, unknown>>(
        `WITH latest AS (
           SELECT season, max(week) AS week FROM src_rosters
           WHERE season = (SELECT max(season) FROM src_rosters) GROUP BY season)
         SELECT r.season, r.week, ${r('team', 'VARCHAR')} AS team, ${r('jersey_number')} AS jersey,
                ${r('status', 'VARCHAR')} AS status,
                ${r('status_description_abbr', 'VARCHAR')} AS code,
                r.season = l.season AND r.week = l.week AS now
         FROM src_rosters r, latest l WHERE r.gsis_id = ?
         ORDER BY r.season DESC, r.week DESC LIMIT 1`,
        [q.player]
      )
    : null
  const i = col(have, 'src_injuries', 'i')
  const report = have.tables.has('src_injuries')
    ? await db.get<Record<string, unknown>>(
        `WITH latest AS (
           SELECT season, max(week) AS week FROM src_injuries
           WHERE season = (SELECT max(season) FROM src_injuries) GROUP BY season)
         SELECT i.season, i.week, ${i('report_status', 'VARCHAR')} AS report,
                ${i('practice_status', 'VARCHAR')} AS practice,
                coalesce(${i('report_primary_injury', 'VARCHAR')},
                         ${i('practice_primary_injury', 'VARCHAR')}) AS injury
         FROM src_injuries i JOIN latest l ON i.season = l.season AND i.week = l.week
         WHERE i.gsis_id = ? ORDER BY report IS NULL LIMIT 1`,
        [q.player]
      )
    : null
  const seasons = have.tables.has('player_season')
    ? await db.all<{ season: number }>(
        'SELECT DISTINCT season FROM player_season WHERE gsis_id = ? AND games > 0 ORDER BY season',
        [q.player]
      )
    : []

  const reserve =
    roster?.now === true && roster.status === 'RES'
      ? (RESERVE[String(roster.code)] ?? 'Reserve')
      : null
  const reportStatus = REPORT[String(report?.report)] ?? null
  const practice = PRACTICE[String(report?.practice)] ?? null
  const status: PlayerStatus | null =
    reserve || reportStatus || practice === 'DNP' || practice === 'Limited'
      ? {
          season: Number(reserve ? roster!.season : report!.season),
          week: Number(reserve ? roster!.week : report!.week),
          reserve,
          report: reportStatus,
          practice,
          injury: text(report?.injury)
        }
      : null
  const year = num(p.draft_year)
  const round = num(p.draft_round)
  const pick = num(p.draft_pick)
  return {
    id: q.player,
    name: text(p.name) ?? q.player,
    firstName: text(p.first_name),
    lastName: text(p.last_name),
    position: text(p.position),
    team: text(roster?.team) ?? text(p.team),
    jersey: num(roster?.jersey),
    birthDate: text(p.birth_date)?.slice(0, 10) ?? null,
    height: num(p.height),
    weight: num(p.weight),
    college: text(p.college),
    draft:
      year !== null && round !== null && pick !== null
        ? { year, round, pick, team: text(p.draft_team) }
        : null,
    rookieSeason: num(p.rookie_season),
    seasons: seasons.map((s) => Number(s.season)),
    sleeperId: text(p.sleeper_id),
    status
  }
}
