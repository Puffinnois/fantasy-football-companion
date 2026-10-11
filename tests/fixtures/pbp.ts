import { PBP_COLUMNS, playReader, type Play } from '@main/warehouse/play'

/** A play-by-play row: nflverse column → value; unset columns are empty, as nflverse writes them. */
export type PbpRow = Record<string, string | number>

/** Week 1 of 2025, PHI with the ball at home against DAL. */
const BASE: PbpRow = {
  game_id: '2025_01_DAL_PHI',
  season: 2025,
  week: 1,
  season_type: 'REG',
  home_team: 'PHI',
  away_team: 'DAL',
  posteam: 'PHI',
  defteam: 'DAL'
}

const COLUMNS = [...new Set(PBP_COLUMNS)]

function cells(row: PbpRow): string[] {
  const full = { ...BASE, ...row }
  return COLUMNS.map((c) => (full[c] === undefined ? '' : String(full[c])))
}

/** A CSV with every column the aggregation reads. */
export function pbpCsv(rows: PbpRow[]): string {
  const quote = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = rows.map((r) => cells(r).map(quote).join(','))
  return [COLUMNS.join(','), ...lines].join('\n') + '\n'
}

/** One row, read as the aggregation reads it. */
export function play(row: PbpRow): Play {
  const p = playReader(COLUMNS)(cells(row))
  if (p === null || p === 'skip') throw new Error('not a play')
  return p
}

export const QB = '00-0036389'
export const RB = '00-0034844'
export const WR = '00-0035676'
export const LB = '00-0039000'

/** A run by RB from midfield on first down. */
export const run = (over: PbpRow = {}): PbpRow => ({
  play_type: 'run',
  rush: 1,
  rush_attempt: 1,
  rusher_player_id: RB,
  down: 1,
  yardline_100: 50,
  ...over
})

/** A pass from QB to WR from midfield on first down. */
export const dropback = (over: PbpRow = {}): PbpRow => ({
  play_type: 'pass',
  pass: 1,
  qb_dropback: 1,
  pass_attempt: 1,
  passer_id: QB,
  passer_player_id: QB,
  receiver_player_id: WR,
  down: 1,
  yardline_100: 50,
  ...over
})
