import type { WhData, WhGame, WhPlayerWeek } from '@main/db/repos/warehouse'
import { kickoffIso } from '@shared/time'
import { numOrNull, parseCsv, strOrNull } from '../csv'
import { headerOf, requireColumns, seasonTypeOf, type Parsed } from './parse'

export const DEPTH_SOURCE = 'depth_charts'

/** First regular-season kickoff of a week (ISO UTC). */
export interface Kickoff {
  week: number
  at: string
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** The earliest regular-season kickoff of each week, from the stored schedule, ascending by week. */
export function firstKickoffs(games: WhGame[]): Kickoff[] {
  const first = new Map<number, string>()
  for (const g of games) {
    if (g.data.game_type !== 'REG') continue
    const at = kickoffIso(text(g.data.gameday), text(g.data.gametime))
    if (at === null) continue
    const prev = first.get(g.week)
    if (prev === undefined || Date.parse(at) < Date.parse(prev)) first.set(g.week, at)
  }
  return [...first].map(([week, at]) => ({ week, at })).sort((a, b) => a.week - b.week)
}

/** From 2025 nflverse publishes timestamped snapshots (a `dt` column) instead of weekly rows. */
export function isSnapshotDepthChart(csv: string): boolean {
  return headerOf(csv).includes('dt')
}

/** Through 2024: one row per player × slot × week; grouped into one row per player-week. */
function parseWeekly(csv: string): Parsed<WhPlayerWeek> {
  requireColumns(csv, DEPTH_SOURCE, ['season', 'week', 'game_type', 'gsis_id', 'club_code'])
  const byKey = new Map<string, { row: WhPlayerWeek; slots: WhData[] }>()
  let skipped = 0
  for (const r of parseCsv(csv)) {
    const seasonType = seasonTypeOf(r.game_type)
    if (seasonType === null) continue
    const season = numOrNull(r.season)
    const week = numOrNull(r.week)
    const gsis = strOrNull(r.gsis_id)
    if (season === null || week === null || gsis === null) {
      skipped++
      continue
    }
    const key = `${seasonType}|${week}|${gsis}`
    let entry = byKey.get(key)
    if (!entry) {
      const slots: WhData[] = []
      const data: WhData = { entries: slots }
      const name = strOrNull(r.full_name)
      if (name !== null) data.full_name = name
      entry = {
        row: {
          source: DEPTH_SOURCE,
          season,
          seasonType,
          week,
          playerKey: gsis,
          keyType: 'gsis',
          team: strOrNull(r.club_code),
          opponent: null,
          data
        },
        slots
      }
      byKey.set(key, entry)
    }
    entry.slots.push({
      formation: r.formation ?? '',
      position: strOrNull(r.depth_position) ?? r.position ?? '',
      rank: numOrNull(r.depth_team) ?? 0
    })
  }
  return { rows: [...byKey.values()].map((e) => e.row), skipped }
}

function snapshotRows(
  rows: Record<string, string>[],
  season: number,
  week: number,
  dt: string
): WhPlayerWeek[] {
  const byPlayer = new Map<string, { row: WhPlayerWeek; slots: WhData[] }>()
  for (const r of rows) {
    const gsis = r.gsis_id
    let entry = byPlayer.get(gsis)
    if (!entry) {
      const slots: WhData[] = []
      const data: WhData = { snapshot: dt, entries: slots }
      const name = strOrNull(r.player_name)
      if (name !== null) data.player_name = name
      const espn = strOrNull(r.espn_id)
      if (espn !== null) data.espn_id = espn
      entry = {
        row: {
          source: DEPTH_SOURCE,
          season,
          seasonType: 'REG',
          week,
          playerKey: gsis,
          keyType: 'gsis',
          team: strOrNull(r.team),
          opponent: null,
          data
        },
        slots
      }
      byPlayer.set(gsis, entry)
    }
    entry.slots.push({
      formation: r.pos_grp ?? '',
      position: r.pos_abb ?? '',
      rank: numOrNull(r.pos_rank) ?? 0
    })
  }
  return [...byPlayer.values()].map((e) => e.row)
}

/**
 * 2025+: week w takes the last snapshot before its first kickoff. A week that kicks off after the
 * latest snapshot is left out, except the current week, which gets the latest snapshot (spec §5).
 */
function parseSnapshots(
  csv: string,
  season: number,
  kickoffs: Kickoff[],
  currentWeek: number | null
): Parsed<WhPlayerWeek> {
  requireColumns(csv, DEPTH_SOURCE, ['dt', 'team', 'gsis_id', 'pos_grp', 'pos_abb', 'pos_rank'])
  const snapshots = new Map<string, Record<string, string>[]>()
  let skipped = 0
  for (const r of parseCsv(csv)) {
    const dt = strOrNull(r.dt)
    if (dt === null || Number.isNaN(Date.parse(dt)) || strOrNull(r.gsis_id) === null) {
      skipped++
      continue
    }
    const list = snapshots.get(dt) ?? []
    list.push(r)
    snapshots.set(dt, list)
  }
  const times = [...snapshots.keys()].sort((a, b) => Date.parse(a) - Date.parse(b))
  if (times.length === 0) return { rows: [], skipped }
  const latest = Date.parse(times[times.length - 1])
  const rows: WhPlayerWeek[] = []
  for (const { week, at } of kickoffs) {
    const kickoff = Date.parse(at)
    if (kickoff > latest && week !== currentWeek) continue
    const before = times.filter((t) => Date.parse(t) < kickoff)
    const dt = before[before.length - 1]
    if (dt === undefined) continue
    rows.push(...snapshotRows(snapshots.get(dt) ?? [], season, week, dt))
  }
  return { rows, skipped }
}

/** `depth_charts_{season}`: weekly rows through 2024, timestamped snapshots from 2025 (by its header). */
export function parseDepthCharts(
  csv: string,
  season: number,
  kickoffs: Kickoff[],
  currentWeek: number | null
): Parsed<WhPlayerWeek> {
  return isSnapshotDepthChart(csv)
    ? parseSnapshots(csv, season, kickoffs, currentWeek)
    : parseWeekly(csv)
}
