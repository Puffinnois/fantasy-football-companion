import { withTransaction, type Db } from '@main/db/connection'
import { getLastFinishedSync } from '@main/db/repos/syncLog'
import {
  getWhSourceState,
  replaceWhGames,
  replaceWhPlayers,
  replaceWhPlayerWeeks,
  replaceWhTeamWeeks,
  setWhSourceState,
  upsertWhPlayersLatest,
  type WhSourceState
} from '@main/db/repos/warehouse'
import type { WarehouseClient } from '@main/sources/warehouse/client'
import type { AggregatePbp } from '@main/warehouse/job'
import type { NflState, SyncLogEntry, SyncResult } from '@shared/types'
import {
  nowOf,
  runStep,
  SkipStep,
  type RefreshOptions,
  type StepDeps,
  type StepOutcome
} from './step'
import {
  WAREHOUSE_FIRST_SEASON,
  WAREHOUSE_STEPS,
  type StepContext,
  type StepRows,
  type WarehouseStep
} from './warehouseSteps'

const DAY = 24 * 60 * 60 * 1000
/** Spec §4.2: a step is never retried within a day of its last finished attempt, whatever the outcome. */
export const ATTEMPT_INTERVAL_MS = DAY
/** The prior season is re-fetched weekly. */
export const PRIOR_SEASON_FRESHNESS_MS = 7 * DAY

/** `db` is `warehouse.db` (spec §10); its steps log to that file's own `sync_log`. */
export interface WarehouseSyncDeps extends StepDeps {
  warehouse: WarehouseClient
  /** The Sleeper NFL state from the app database; null before the first Sleeper sync. */
  state: NflState | null
  /** The warehouse worker in the app (spec §6.1); `aggregateInProcess` in tests. */
  aggregatePbp: AggregatePbp
}

/** Prefix of every warehouse step in sync_log. */
export const WAREHOUSE_LOG_PREFIX = 'wh:'

export function stepLogName(step: WarehouseStep, season: number): string {
  return step.allSeasons
    ? `${WAREHOUSE_LOG_PREFIX}${step.id}`
    : `${WAREHOUSE_LOG_PREFIX}${step.id}:${season}`
}

function seasonsFor(step: WarehouseStep, current: number): number[] {
  if (step.allSeasons) return [0]
  const seasons: number[] = []
  for (let s = Math.max(step.firstSeason, WAREHOUSE_FIRST_SEASON); s <= current; s++)
    seasons.push(s)
  return seasons
}

interface DueInput {
  season: number
  current: number
  force: boolean
  now: number
  lastAttemptAt: string | null
  states: { source: string; version: number; firstSeason: number; state: WhSourceState | null }[]
}

/** Spec §4.2: the step's sources due for `season`; none within a day of the step's last attempt. */
function dueSources(input: DueInput): string[] {
  const { season, current, now } = input
  const recent = season === 0 || season >= current - 1
  const attemptedRecently =
    input.lastAttemptAt !== null && now - Date.parse(input.lastAttemptAt) < ATTEMPT_INTERVAL_MS
  if (attemptedRecently && !(input.force && recent)) return []
  const due = ({ version, state }: DueInput['states'][number]): boolean => {
    if (!state || state.version < version) return true
    if (season === 0 || season === current) return true
    if (season === current - 1) {
      return now - Date.parse(state.fetchedAt) >= PRIOR_SEASON_FRESHNESS_MS
    }
    return !state.sealed
  }
  return input.states
    .filter((s) => (season === 0 || season >= s.firstSeason) && due(s))
    .map((s) => s.source)
}

/** Writes the rows of each source the step returned (default: the due ones) and records its state. */
function writeStepRows(
  db: Db,
  step: WarehouseStep,
  season: number,
  due: string[],
  rows: StepRows,
  updatedAt: string,
  sealed: boolean
): number {
  const seasonsOf = (list: { season: number }[]): number[] =>
    season === 0 ? [...new Set(list.map((r) => r.season))] : [season]
  let total = 0
  step.sources.forEach(({ source, version }, index) => {
    if (!(rows.sources ?? due).includes(source)) return
    const playerWeeks = rows.playerWeeks.filter((r) => r.source === source)
    const teamWeeks = rows.teamWeeks.filter((r) => r.source === source)
    const players = rows.players.filter((r) => r.source === source)
    let written =
      replaceWhPlayerWeeks(db, source, seasonsOf(playerWeeks), playerWeeks, updatedAt) +
      replaceWhTeamWeeks(db, source, seasonsOf(teamWeeks), teamWeeks, updatedAt)
    written +=
      rows.playersMode === 'latest'
        ? upsertWhPlayersLatest(db, source, players, updatedAt)
        : replaceWhPlayers(db, source, players, updatedAt)
    // Games carry no source; they belong to the step's first source (the schedule).
    if (index === 0 && rows.games.length > 0) {
      written += replaceWhGames(db, seasonsOf(rows.games), rows.games, updatedAt)
    }
    setWhSourceState(db, { source, season, version, rows: written, fetchedAt: updatedAt, sealed })
    total += written
  })
  return total
}

async function runWarehouseStep(
  deps: WarehouseSyncDeps,
  ctx: StepContext,
  step: WarehouseStep,
  season: number,
  due: string[]
): Promise<StepOutcome> {
  const rows = await step.fetch(ctx, season, due)
  if (rows === null) {
    throw new SkipStep(
      season === 0 ? `${step.id} not published yet` : `${step.id} ${season} not published yet`
    )
  }
  const notes = [
    ...(rows.skipped ? [`${rows.skipped} unparseable rows skipped`] : []),
    ...rows.notes
  ]
  if (rows.sources?.length === 0) throw new SkipStep(notes.join('; '))
  const updatedAt = nowOf(deps).toISOString()
  const sealed = season !== 0 && season <= ctx.current - 2
  const written = withTransaction(deps.db, () =>
    writeStepRows(deps.db, step, season, due, rows, updatedAt, sealed)
  )
  return { rows: written, message: notes.length > 0 ? notes.join('; ') : null }
}

/**
 * Stats-warehouse spec §4: every due step, in registry order, oldest season first. Each step commits
 * on its own, so a quit mid-backfill resumes on the next run. Never throws (steps log their errors).
 */
export async function refreshWarehouse(
  deps: WarehouseSyncDeps,
  options: RefreshOptions = {},
  steps: WarehouseStep[] = WAREHOUSE_STEPS
): Promise<SyncResult> {
  const log: SyncLogEntry[] = []
  const state = deps.state
  if (!state) return { steps: log }
  const current = Number(state.season)
  const ctx: StepContext = {
    db: deps.db,
    client: deps.warehouse,
    current,
    stateWeek: state.week,
    stateSeasonType: state.seasonType,
    aggregatePbp: deps.aggregatePbp
  }
  const force = options.force ?? false
  for (const step of steps) {
    for (const season of seasonsFor(step, current)) {
      const name = stepLogName(step, season)
      const due = dueSources({
        season,
        current,
        force,
        now: nowOf(deps).getTime(),
        lastAttemptAt: getLastFinishedSync(deps.db, name)?.startedAt ?? null,
        states: step.sources.map(({ source, version, firstSeason }) => ({
          source,
          version,
          firstSeason: firstSeason ?? step.firstSeason,
          state: getWhSourceState(deps.db, source, season)
        }))
      })
      if (due.length === 0) continue
      log.push(
        await runStep(deps, name, 0, true, () => runWarehouseStep(deps, ctx, step, season, due))
      )
    }
  }
  return { steps: log }
}
