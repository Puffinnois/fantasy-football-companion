import type { GameForecast, GamesQuery } from '@shared/stats/types'
import type { StatsDb } from '../db'
import { inspect } from '../derived/build'
import { col } from '../models/load'
import { STATS_FIRST_SEASON } from '../sources'
import { StatsQueryError } from './compile'

const TEAM_CODE = /^[A-Z]{2,3}$/

/** Spec §8.1: a season's games (one team's, or a week range) with Elo and the betting market. */
export async function gameForecasts(db: StatsDb, q: GamesQuery): Promise<GameForecast[]> {
  if (!Number.isInteger(q.season) || q.season < STATS_FIRST_SEASON || q.season > 2100) {
    throw new StatsQueryError(`season must be a year from ${STATS_FIRST_SEASON}`)
  }
  const where = ['e.season = ?']
  const params: (string | number)[] = [q.season]
  if (q.team !== undefined) {
    if (typeof q.team !== 'string' || !TEAM_CODE.test(q.team))
      throw new StatsQueryError('team must be a team code')
    where.push('(e.home_team = ? OR e.away_team = ?)')
    params.push(q.team, q.team)
  }
  if (q.weeks !== undefined) {
    const [a, b] = q.weeks
    if (!Number.isInteger(a) || !Number.isInteger(b) || a > b)
      throw new StatsQueryError('weeks must be [first, last]')
    where.push('e.week BETWEEN ? AND ?')
    params.push(a, b)
  }
  // A column the schedule lacks reads as NULL.
  const g = col(await inspect(db), 'games', 'g')
  const rows = await db.all<Record<string, unknown>>(
    `SELECT e.*, ${g('gameday', 'VARCHAR')}::VARCHAR AS gameday,
            coalesce(${g('location', 'VARCHAR')} = 'Neutral', false) AS neutral,
            g.home_score, g.away_score, ${g('spread_line')} AS spread_line,
            ${g('total_line')} AS total_line, ${g('roof', 'VARCHAR')} AS roof,
            ${g('temp')} AS temp, ${g('wind')} AS wind
     FROM elo_games e JOIN games g ON g.game_id = e.game_id
     WHERE ${where.join(' AND ')} ORDER BY e.week, gameday, e.game_id`,
    params
  )
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  return rows.map((r) => ({
    gameId: String(r.game_id),
    season: Number(r.season),
    seasonType: r.season_type as 'REG' | 'POST',
    week: Number(r.week),
    gameday: (r.gameday as string | null) ?? null,
    home: String(r.home_team),
    away: String(r.away_team),
    neutral: r.neutral === true,
    homeScore: r.played ? num(r.home_score) : null,
    awayScore: r.played ? num(r.away_score) : null,
    homeElo: Number(r.home_elo_pre),
    awayElo: Number(r.away_elo_pre),
    homeWinProb: Number(r.home_wp),
    eloSpread: Number(r.elo_spread),
    vegasHomeWinProb: num(r.vegas_home_wp),
    spread: num(r.spread_line),
    total: num(r.total_line),
    roof: (r.roof as string | null) ?? null,
    temp: num(r.temp),
    wind: num(r.wind)
  }))
}
