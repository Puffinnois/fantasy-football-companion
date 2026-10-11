import { withTransaction, type Db } from '@main/db/connection'
import { getNflState } from '@main/db/repos/state'
import { getLastFinishedSync, WAREHOUSE_LOG_PREFIX } from '@main/db/repos/syncLog'
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
import type { SyncLogEntry, SyncResult } from '@shared/types'
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

export interface WarehouseSyncDeps extends StepDeps {
  warehouse: WarehouseClient
}

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
  states: { version: number; state: WhSourceState | null }[]
}

/** Spec §4.2. */
function isDue(input: DueInput): boolean {
  const { season, current, now } = input
  const recent = season === 0 || season >= current - 1
  const attemptedRecently =
    input.lastAttemptAt !== null && now - Date.parse(input.lastAttemptAt) < ATTEMPT_INTERVAL_MS
  if (attemptedRecently && !(input.force && recent)) return false
  return input.states.some(({ version, state }) => {
    if (!state || state.version < version) return true
    if (season === 0 || season === current) return true
    if (season === current - 1) {
      return now - Date.parse(state.fetchedAt) >= PRIOR_SEASON_FRESHNESS_MS
    }
    return !state.sealed
  })
}

/** Writes one step's rows per source and records each source's state. Returns the rows written. */
function writeStepRows(
  db: Db,
  step: WarehouseStep,
  season: number,
  rows: StepRows,
  updatedAt: string,
  sealed: boolean
): number {
  const seasonsOf = (list: { season: number }[]): number[] =>
    season === 0 ? [...new Set(list.map((r) => r.season))] : [season]
  let total = 0
  step.sources.forEach(({ source, version }, index) => {
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
  season: number
): Promise<StepOutcome> {
  const rows = await step.fetch(ctx, season)
  if (rows === null) {
    throw new SkipStep(
      season === 0 ? `${step.id} not published yet` : `${step.id} ${season} not published yet`
    )
  }
  const updatedAt = nowOf(deps).toISOString()
  const sealed = season !== 0 && season <= ctx.current - 2
  const written = withTransaction(deps.db, () =>
    writeStepRows(deps.db, step, season, rows, updatedAt, sealed)
  )
  return {
    rows: written,
    message: rows.skipped ? `${rows.skipped} unparseable rows skipped` : null
  }
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
  const state = getNflState(deps.db)
  if (!state) return { steps: log }
  const current = Number(state.season)
  const ctx: StepContext = {
    db: deps.db,
    client: deps.warehouse,
    current,
    stateWeek: state.week,
    stateSeasonType: state.seasonType
  }
  const force = options.force ?? false
  for (const step of steps) {
    for (const season of seasonsFor(step, current)) {
      const name = stepLogName(step, season)
      const due = isDue({
        season,
        current,
        force,
        now: nowOf(deps).getTime(),
        lastAttemptAt: getLastFinishedSync(deps.db, name)?.startedAt ?? null,
        states: step.sources.map(({ source, version }) => ({
          version,
          state: getWhSourceState(deps.db, source, season)
        }))
      })
      if (!due) continue
      log.push(await runStep(deps, name, 0, true, () => runWarehouseStep(deps, ctx, step, season)))
    }
  }
  return { steps: log }
}
