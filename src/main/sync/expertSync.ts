import { withTransaction } from '@main/db/connection'
import {
  replaceExpertRanks,
  ROS_WEEK,
  storedScoring,
  type ExpertRankRecord
} from '@main/db/repos/expertRanks'
import { getLeague } from '@main/db/repos/leagues'
import { replaceMarketValues, type MarketValueRecord } from '@main/db/repos/marketValues'
import {
  listCrosswalk,
  listPlayerIdentitySources,
  type PlayerIdentitySource
} from '@main/db/repos/playerIds'
import { getRules } from '@main/db/repos/rules'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import type { FantasyCalcClient } from '@main/sources/fantasycalc'
import type { FantasyProsClient, FpPlayer, FpPosition, FpRankings } from '@main/sources/fantasypros'
import type { CrosswalkRecord } from '@main/sources/nflverse-types'
import { scoringFormat, type RosterSlotCount } from '@shared/rules'
import { toSleeperDefId } from '@shared/teams'
import type { SyncLogEntry, SyncResult } from '@shared/types'
import { normalizeName } from './identity'
import {
  nowOf,
  runStep,
  SkipStep,
  type RefreshOptions,
  type StepOutcome,
  type SyncDeps
} from './step'

export interface ExpertSyncDeps extends SyncDeps {
  fantasypros: FantasyProsClient
  fantasycalc: FantasyCalcClient
}

export const FP_WEEKLY_PREFIX = 'fantasypros:weekly:'
export const sourceFpWeekly = (season: number, week: number): string =>
  `${FP_WEEKLY_PREFIX}${season}:${week}`
export const sourceFpRos = (season: number): string => `fantasypros:ros:${season}`
export const sourceFantasyCalc = (season: number): string => `fantasycalc:${season}`

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Spec §3.2: past weeks never move; the current week refreshes several times a day; ROS and the market ~daily. */
export const FP_PAST_WEEK_FRESHNESS_MS = 30 * DAY
export const FP_CURRENT_WEEK_FRESHNESS_MS = 3 * HOUR
export const FP_ROS_FRESHNESS_MS = 12 * HOUR
export const FANTASYCALC_FRESHNESS_MS = 12 * HOUR
const LAST_WEEK = 18

/**
 * Weekly `position=ALL` is remapped to FLX server-side, so QB, K and DST need their own calls.
 * FLX goes first: its `count: 0` means "not published yet" and saves the other three requests.
 */
export const WEEKLY_POSITIONS: readonly FpPosition[] = ['FLX', 'QB', 'K', 'DST']

export const GONE_MESSAGE = 'rankings endpoint unavailable'
export const NOT_PUBLISHED_MESSAGE = 'not published yet'
export const OFFSEASON_MESSAGE = 'expert rankings only during the regular season'
export const FANTASYCALC_GONE_MESSAGE = 'FantasyCalc endpoint unavailable'

/** FantasyCalc's `numQbs`: 2 when the roster has a SUPER_FLEX slot, else 1 (spec §3.2). */
export function numQbsFor(slots: RosterSlotCount[]): 1 | 2 {
  return slots.some((s) => s.slot === 'SUPER_FLEX' && s.count > 0) ? 2 : 1
}

export interface FpJoinIndex {
  /** FantasyPros id → Sleeper id, from crosswalk rows carrying both. */
  byFpId: Map<string, string>
  /** `${normalizeName(name)}|${position}` → Sleeper id (the identity rule's name fallback). */
  byName: Map<string, string>
}

/** First row wins per key, so duplicates never flip a match between refreshes. */
export function buildFpJoinIndex(
  crosswalk: CrosswalkRecord[],
  players: PlayerIdentitySource[]
): FpJoinIndex {
  const byFpId = new Map<string, string>()
  for (const r of crosswalk) {
    if (r.fantasyprosId && r.sleeperId && !byFpId.has(r.fantasyprosId)) {
      byFpId.set(r.fantasyprosId, r.sleeperId)
    }
  }
  const byName = new Map<string, string>()
  for (const p of players) {
    if (!p.position) continue
    const key = `${normalizeName(p.fullName)}|${p.position}`
    if (!byName.has(key)) byName.set(key, p.playerId)
  }
  return { byFpId, byName }
}

export interface FpJoinResult {
  records: ExpertRankRecord[]
  matched: number
  unmatched: number
}

/** Spec §3.3: DST by team code alias, players by fantasypros_id then name + position; the rest are dropped and counted. */
export function joinFantasyPros(
  players: FpPlayer[],
  experts: number,
  index: FpJoinIndex
): FpJoinResult {
  const records: ExpertRankRecord[] = []
  let unmatched = 0
  for (const p of players) {
    const playerId =
      p.position === 'DST'
        ? p.team
          ? toSleeperDefId(p.team)
          : null
        : (index.byFpId.get(p.playerId) ??
          index.byName.get(`${normalizeName(p.name)}|${p.position}`) ??
          null)
    if (!playerId) {
      unmatched++
      continue
    }
    records.push({
      playerId,
      rankEcr: p.rankEcr,
      posRank: p.posRank,
      rankAve: p.rankAve,
      rankStd: p.rankStd,
      rankMin: p.rankMin,
      rankMax: p.rankMax,
      experts,
      grade: p.grade,
      projPts: p.projPts
    })
  }
  return { records, matched: records.length, unmatched }
}

/**
 * Spec §3.2: weekly 1..current week (four calls each), ROS, FantasyCalc — one step each, after
 * nflverse so the crosswalk carries `fantasypros_id`. Never throws; every outcome is a `sync_log` row.
 */
export async function refreshExperts(
  deps: ExpertSyncDeps,
  options: RefreshOptions = {}
): Promise<SyncResult> {
  const force = options.force ?? false
  const steps: SyncLogEntry[] = []
  const state = getNflState(deps.db)
  const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
  if (!state || !leagueId) return { steps }
  const season = Number(state.season)
  if (state.seasonType !== 'regular') {
    steps.push(
      await runStep(deps, sourceFpRos(season), 0, true, async () => {
        throw new SkipStep(OFFSEASON_MESSAGE)
      })
    )
    return { steps }
  }

  const rules = getRules(deps.db, leagueId)
  const scoring = scoringFormat(rules)
  const currentWeek = Math.min(Math.max(state.week, state.displayWeek, 1), LAST_WEEK)
  const ts = (): string => nowOf(deps).toISOString()
  let index: FpJoinIndex | null = null
  const joinIndex = (): FpJoinIndex => {
    index ??= buildFpJoinIndex(listCrosswalk(deps.db), listPlayerIdentitySources(deps.db))
    return index
  }
  /** A rules change that moves the scoring bucket makes the stored rows stale whatever their age. */
  const scoringChanged = (week: number): boolean => {
    const stored = storedScoring(deps.db, season, week)
    return stored !== null && stored !== scoring
  }
  const store = (week: number, pages: FpRankings[]): StepOutcome => {
    const records: ExpertRankRecord[] = []
    let matched = 0
    let unmatched = 0
    for (const page of pages) {
      const joined = joinFantasyPros(page.players, page.totalExperts, joinIndex())
      records.push(...joined.records)
      matched += joined.matched
      unmatched += joined.unmatched
    }
    const rows = withTransaction(deps.db, () =>
      replaceExpertRanks(deps.db, season, week, scoring, records, ts())
    )
    return { rows, message: `${matched} matched, ${unmatched} unmatched` }
  }

  let gone = false
  let stop = false
  for (let week = 1; week <= currentWeek && !stop; week++) {
    const freshness = week < currentWeek ? FP_PAST_WEEK_FRESHNESS_MS : FP_CURRENT_WEEK_FRESHNESS_MS
    const entry = await runStep(
      deps,
      sourceFpWeekly(season, week),
      freshness,
      force || scoringChanged(week),
      async () => {
        const pages: FpRankings[] = []
        for (const position of WEEKLY_POSITIONS) {
          const page = await deps.fantasypros.getRankings({
            type: 'weekly',
            year: season,
            week,
            position,
            scoring
          })
          if (!page) throw new SkipStep(GONE_MESSAGE)
          if (page.count === 0 && position === 'FLX') throw new SkipStep(NOT_PUBLISHED_MESSAGE)
          pages.push(page)
        }
        return store(week, pages)
      }
    )
    steps.push(entry)
    gone = entry.status === 'skipped' && entry.message === GONE_MESSAGE
    stop = gone || entry.status === 'error'
  }

  steps.push(
    await runStep(
      deps,
      sourceFpRos(season),
      FP_ROS_FRESHNESS_MS,
      force || scoringChanged(ROS_WEEK),
      async () => {
        if (gone) throw new SkipStep(GONE_MESSAGE)
        const page = await deps.fantasypros.getRankings({
          type: 'ros',
          year: season,
          position: 'ALL',
          scoring
        })
        if (!page) throw new SkipStep(GONE_MESSAGE)
        if (page.count === 0) throw new SkipStep(NOT_PUBLISHED_MESSAGE)
        return store(ROS_WEEK, [page])
      }
    )
  )

  steps.push(
    await runStep(deps, sourceFantasyCalc(season), FANTASYCALC_FRESHNESS_MS, force, async () => {
      const values = await deps.fantasycalc.getValues({
        numTeams: getLeague(deps.db, leagueId)?.totalRosters ?? 12,
        numQbs: numQbsFor(rules?.rosterSlots ?? []),
        ppr: rules?.scoring.rec ?? 0
      })
      if (!values) throw new SkipStep(FANTASYCALC_GONE_MESSAGE)
      const records: MarketValueRecord[] = []
      for (const v of values) {
        if (!v.sleeperId) continue
        records.push({
          playerId: v.sleeperId,
          value: v.value,
          overallRank: v.overallRank,
          posRank: v.positionRank,
          tier: v.tier,
          trend30d: v.trend30Day
        })
      }
      const rows = withTransaction(deps.db, () =>
        replaceMarketValues(deps.db, season, records, ts())
      )
      const dropped = values.length - records.length
      return { rows, message: dropped ? `${dropped} without a Sleeper id` : null }
    })
  )
  return { steps }
}
