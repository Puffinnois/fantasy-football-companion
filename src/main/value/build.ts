import type { Db } from '@main/db/connection'
import { round2 } from '@main/db/repos/points'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { PlayerDetail, PlayerValueRow, ValueContext } from '@shared/types'
import { replacementLevels } from './replacement'
import { loadSeries, type PlayerSeries, type SeriesBundle } from './series'

export interface ValueBuild {
  context: ValueContext
  rows: PlayerValueRow[]
  series: Map<string, PlayerSeries>
}

interface Aggregate {
  series: PlayerSeries
  gamesPlayed: number
  ppg: number | null
  rosPoints: number | null
}

interface Valued {
  a: Aggregate
  stdValue: number | null
  rosValue: number | null
}

interface Ranked {
  id: string
  value: number
  raw: number
  name: string
}

function aggregate(bundle: SeriesBundle, series: PlayerSeries): Aggregate {
  const played = series.weeks.filter((w) => w.played)
  const remaining = series.weeks.filter((w) => !w.played && w.week >= bundle.currentWeek)
  return {
    series,
    gamesPlayed: played.length,
    ppg:
      played.length === 0
        ? null
        : round2(played.reduce((sum, w) => sum + (w.points ?? 0), 0) / played.length),
    rosPoints: bundle.projectionsStored
      ? round2(remaining.reduce((sum, w) => sum + (w.projected ?? 0), 0))
      : null
  }
}

/** Position → the metric of every player that has one. */
function metricsByPosition(
  aggregates: Aggregate[],
  metric: (a: Aggregate) => number | null
): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const a of aggregates) {
    const value = metric(a)
    const pos = a.series.base.position
    if (value === null || pos === null) continue
    if (!map.has(pos)) map.set(pos, [])
    map.get(pos)?.push(value)
  }
  return map
}

/** 1-based ranks by value desc, then raw metric desc, then name. */
function ranks(entries: Ranked[]): Map<string, number> {
  const sorted = [...entries].sort(
    (a, b) => b.value - a.value || b.raw - a.raw || a.name.localeCompare(b.name)
  )
  return new Map(sorted.map((e, i) => [e.id, i + 1]))
}

function ranked(v: Valued, value: number | null, raw: number | null): Ranked | null {
  return value === null
    ? null
    : { id: v.a.series.base.playerId, value, raw: raw ?? 0, name: v.a.series.base.fullName }
}

const present = (e: Ranked | null): e is Ranked => e !== null

/** Pure part of the build: rows and context from a loaded bundle (spec §2). */
export function assembleValue(bundle: SeriesBundle): ValueBuild {
  const aggregates = bundle.players.map((p) => aggregate(bundle, p))
  const slots = bundle.rules?.rosterSlots ?? []
  const stdLevels = replacementLevels(
    slots,
    bundle.teamCount,
    metricsByPosition(aggregates, (a) => a.ppg)
  )
  const rosLevels = replacementLevels(
    slots,
    bundle.teamCount,
    metricsByPosition(aggregates, (a) => a.rosPoints)
  )

  const valued: Valued[] = aggregates.map((a) => {
    const pos = a.series.base.position ?? ''
    const std = stdLevels.get(pos) ?? null
    const ros = rosLevels.get(pos) ?? null
    return {
      a,
      stdValue: a.ppg !== null && std ? round2(a.ppg - std.level) : null,
      rosValue: a.rosPoints !== null && ros ? round2(a.rosPoints - ros.level) : null
    }
  })

  const byPosition = new Map<string, Valued[]>()
  for (const v of valued) {
    const pos = v.a.series.base.position ?? ''
    if (!byPosition.has(pos)) byPosition.set(pos, [])
    byPosition.get(pos)?.push(v)
  }
  const stdRanks = new Map<string, number>()
  const rosRanks = new Map<string, number>()
  for (const group of byPosition.values()) {
    const std = group.map((v) => ranked(v, v.stdValue, v.a.ppg)).filter(present)
    const ros = group.map((v) => ranked(v, v.rosValue, v.a.rosPoints)).filter(present)
    for (const [id, rank] of ranks(std)) stdRanks.set(id, rank)
    for (const [id, rank] of ranks(ros)) rosRanks.set(id, rank)
  }
  const overallRanks = ranks(
    valued.map((v) => ranked(v, v.rosValue, v.a.rosPoints)).filter(present)
  )

  const rows: PlayerValueRow[] = valued.map((v) => ({
    ...v.a.series.base,
    gamesPlayed: v.a.gamesPlayed,
    ppg: v.a.ppg,
    stdValue: v.stdValue,
    stdRank: stdRanks.get(v.a.series.base.playerId) ?? null,
    rosPoints: v.a.rosPoints,
    rosValue: v.rosValue,
    rosRank: rosRanks.get(v.a.series.base.playerId) ?? null,
    overallRank: overallRanks.get(v.a.series.base.playerId) ?? null,
    statsAvailable: v.a.series.statsAvailable
  }))

  const replacement: ValueContext['replacement'] = {}
  for (const pos of LINEUP_POSITIONS) {
    replacement[pos] = { std: stdLevels.get(pos) ?? null, ros: rosLevels.get(pos) ?? null }
  }
  return {
    context: {
      season: bundle.season,
      currentWeek: bundle.currentWeek,
      projectionsStored: bundle.projectionsStored,
      replacement
    },
    rows,
    series: new Map(bundle.players.map((p) => [p.base.playerId, p]))
  }
}

export function buildValueSeason(db: Db, leagueId: string, season: number): ValueBuild {
  return assembleValue(loadSeries(db, leagueId, season))
}

/** The detail panel payload for one player of a build; null for an unknown player. */
export function detailFor(build: ValueBuild, playerId: string): PlayerDetail | null {
  const row = build.rows.find((r) => r.playerId === playerId)
  const series = build.series.get(playerId)
  if (!row || !series) return null
  return {
    row,
    weeks: series.weeks.map((w) => ({
      week: w.week,
      opponent: w.opponent,
      played: w.played,
      points: w.points,
      projected: round2(w.projected),
      snapPct: w.snapPct,
      targetShare: w.targetShare,
      rushShare: w.rushShare,
      wopr: w.wopr,
      stats: w.line
    }))
  }
}
