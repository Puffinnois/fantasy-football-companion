import { FTN_COLUMNS } from '@main/warehouse/ftn'
import { PART_COLUMNS } from '@main/warehouse/participation'
import { PBP_COLUMNS, playReader, type Play } from '@main/warehouse/play'
import { PlayIndex } from '@main/warehouse/playIndex'

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

const quote = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** A CSV of `columns`; a row's unset columns are empty. */
function csv(columns: string[], rows: PbpRow[]): string {
  const line = (r: PbpRow): string =>
    columns.map((c) => quote(r[c] === undefined ? '' : String(r[c]))).join(',')
  return [columns.join(','), ...rows.map(line)].join('\n') + '\n'
}

/** A CSV with every column the aggregation reads. */
export function pbpCsv(rows: PbpRow[]): string {
  return csv(
    COLUMNS,
    rows.map((r) => ({ ...BASE, ...r }))
  )
}

/** An FTN CSV for BASE's game: give each row the `nflverse_play_id` of its play. */
export function ftnCsv(rows: PbpRow[]): string {
  return csv(
    FTN_COLUMNS,
    rows.map((r) => ({ nflverse_game_id: BASE.game_id, ...r }))
  )
}

/** A participation CSV for BASE's game: give each row the `play_id` of its play. */
export function partCsv(rows: PbpRow[]): string {
  return csv(
    PART_COLUMNS,
    rows.map((r) => ({ nflverse_game_id: BASE.game_id, ...r }))
  )
}

/** One row, read as the aggregation reads it. */
export function play(row: PbpRow): Play {
  const p = playReader(COLUMNS)(cells(row))
  if (p === null || p === 'skip') throw new Error('not a play')
  return p
}

/** The play index of `rows`; each row's `play_id` is its position, from 1, unless it sets one. */
export function playIndex(rows: PbpRow[]): PlayIndex {
  const index = new PlayIndex()
  rows.forEach((r, i) => index.add(play({ play_id: i + 1, ...r })))
  return index
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
