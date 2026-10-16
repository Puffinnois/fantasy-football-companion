import type { StatsDb } from './db'
import type { Downloads } from './download'
import type { RefreshOptions, StatsLogEntry, StatsStepStatus, StatsSyncResult } from './protocol'
import { buildIdentity } from './identity'
import { INTERRUPTED_MESSAGE } from './schema'
import { describe, replaceRows, standardSelect } from './load'
import { loadSleeperSeason, type StatsState } from './sleeper'
import { FILE_SOURCES, STATS_FIRST_SEASON, type FileSource } from './sources'
import { buildViews } from './views'

const DAY = 24 * 60 * 60 * 1000
/** Warehouse spec §4.2, kept: a step is never retried within a day of its last finished attempt. */
export const ATTEMPT_INTERVAL_MS = DAY
/** The prior season is re-fetched weekly. */
export const PRIOR_SEASON_FRESHNESS_MS = 7 * DAY
/** Prefix of every stats step in `sync_log`. */
export const STATS_LOG_PREFIX = 'stats:'

export interface StatsSyncDeps {
  db: StatsDb
  downloads: Downloads
  /** Where the Sleeper lines are staged before DuckDB reads them. */
  tempDir: string
  /** The Sleeper NFL state; fetched by the worker itself, so no league is needed (spec §4.4). */
  nflState: () => Promise<StatsState>
  now?: () => Date
  onStep?: (entry: StatsLogEntry) => void
  /** True once the worker is closing: no step starts after it, and the running one is `interrupted`. */
  cancelled?: () => boolean
}

/** A source of the sync: one of the files, or Sleeper's weekly lines. */
interface Step {
  id: string
  version: number
  firstSeason: number
  lastSeason?: number
  allSeasons: boolean
  run(season: number, ctx: RunContext): Promise<StepRun | null>
}

interface RunContext {
  deps: StatsSyncDeps
  state: StatsState
}

interface StepRun {
  rows: number
  notes: string[]
}

/** Thrown by a step body to log `skipped` instead of `error`. */
class SkipStep extends Error {}

const nowOf = (deps: StatsSyncDeps): Date => (deps.now ?? (() => new Date()))()

function fileStep(source: FileSource): Step {
  return {
    id: source.id,
    version: source.version,
    firstSeason: source.firstSeason,
    lastSeason: source.lastSeason,
    allSeasons: source.allSeasons,
    async run(season, { deps }) {
      const db = deps.db
      return deps.downloads.withFile(source.url(season), async (path) => {
        const from = source.read(path)
        const columns = await describe(db, `SELECT * FROM ${from}`)
        const standard = source.standard(season, columns)
        const select = standardSelect(from, columns, standard, source.exclude, source.where)
        const scope = source.allSeasons ? null : season
        const main = await replaceRows(db, source.table, scope, select)
        let rows = main.rows
        if (source.extra) {
          rows += await source.extra({
            from,
            columns,
            season,
            replace: async (table, sql) => (await replaceRows(db, table, season, sql)).rows
          })
        }
        return { rows, notes: main.widened.map((w) => `widened ${w}`) }
      })
    }
  }
}

const sleeperStep: Step = {
  id: 'sleeper',
  // 2: players with 1–3 digit ids were filed as defenses (review of Plan X).
  version: 2,
  firstSeason: STATS_FIRST_SEASON,
  allSeasons: false,
  async run(season, { deps, state }) {
    const loaded = await loadSleeperSeason(
      season,
      state,
      deps.downloads,
      deps.tempDir,
      async (table, sql) => (await replaceRows(deps.db, table, season, sql)).rows
    )
    if (loaded === null) throw new SkipStep(`${season} has not started`)
    return {
      rows: loaded.rows,
      notes: loaded.skipped > 0 ? [`${loaded.skipped} rows without a player id skipped`] : []
    }
  }
}

/** Spec §4.1–§4.2 in sync order: Sleeper, then the files (identity first, schedule before depth charts). */
export const STATS_STEPS: Step[] = [sleeperStep, ...FILE_SOURCES.map(fileStep)]

export function stepLogName(step: Pick<Step, 'id' | 'allSeasons'>, season: number): string {
  return step.allSeasons
    ? `${STATS_LOG_PREFIX}${step.id}`
    : `${STATS_LOG_PREFIX}${step.id}:${season}`
}

function seasonsFor(step: Step, current: number): number[] {
  if (step.allSeasons) return [0]
  const last = Math.min(step.lastSeason ?? current, current)
  const seasons: number[] = []
  for (let s = Math.max(step.firstSeason, STATS_FIRST_SEASON); s <= last; s++) seasons.push(s)
  return seasons
}

export interface SourceState {
  version: number
  fetchedAt: string
  sealed: boolean
}

export interface DueInput {
  season: number
  current: number
  force: boolean
  now: number
  lastAttemptAt: string | null
  version: number
  state: SourceState | null
}

/**
 * Warehouse spec §4.2: never within a day of the last attempt (unless forced, for the current
 * season and all-seasons files); a new version or no state is due; the current season and
 * all-seasons files daily, the prior season weekly, older seasons until sealed.
 */
export function isDue(input: DueInput): boolean {
  const { season, current, now, state } = input
  const recent = season === 0 || season >= current - 1
  const attempted =
    input.lastAttemptAt !== null && now - Date.parse(input.lastAttemptAt) < ATTEMPT_INTERVAL_MS
  if (attempted && !(input.force && recent)) return false
  if (!state || state.version < input.version) return true
  if (season === 0 || season === current) return true
  if (season === current - 1) return now - Date.parse(state.fetchedAt) >= PRIOR_SEASON_FRESHNESS_MS
  return !state.sealed
}

async function lastAttempt(db: StatsDb, source: string): Promise<string | null> {
  const row = await db.get<{ started_at: string }>(
    `SELECT started_at FROM sync_log WHERE source = ? AND status NOT IN ('running', 'interrupted')
     ORDER BY id DESC LIMIT 1`,
    [source]
  )
  return row?.started_at ?? null
}

async function sourceState(
  db: StatsDb,
  source: string,
  season: number
): Promise<SourceState | null> {
  const row = await db.get<{ version: number; fetched_at: string; sealed: boolean }>(
    'SELECT version, fetched_at, sealed FROM source_state WHERE source = ? AND season = ?',
    [source, season]
  )
  return row ? { version: row.version, fetchedAt: row.fetched_at, sealed: row.sealed } : null
}

function toEntry(row: Record<string, unknown>): StatsLogEntry {
  return {
    id: row.id as number,
    source: row.source as string,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? null,
    status: row.status as StatsStepStatus,
    message: (row.message as string | null) ?? null,
    rowsWritten: row.rows_written as number
  }
}

/** Runs one step under a `sync_log` row; never throws (errors are logged). */
async function runLogged(
  deps: StatsSyncDeps,
  name: string,
  body: () => Promise<{ rows: number; message: string | null }>
): Promise<StatsLogEntry> {
  const db = deps.db
  const started = await db.get<{ id: number }>(
    "INSERT INTO sync_log (source, started_at, status) VALUES (?, ?, 'running') RETURNING id",
    [name, nowOf(deps).toISOString()]
  )
  const id = started?.id ?? 0
  let status: StatsStepStatus = 'ok'
  let message: string | null = null
  let rows = 0
  try {
    const out = await body()
    rows = out.rows
    message = out.message
  } catch (err) {
    if (deps.cancelled?.()) {
      status = 'interrupted'
      message = INTERRUPTED_MESSAGE
    } else {
      status = err instanceof SkipStep ? 'skipped' : 'error'
      message = err instanceof Error ? err.message : String(err)
    }
  }
  const row = await db.get(
    `UPDATE sync_log SET finished_at = ?, status = ?, message = ?, rows_written = ?
     WHERE id = ? RETURNING *`,
    [nowOf(deps).toISOString(), status, message, rows, id]
  )
  const entry = toEntry(row ?? {})
  try {
    deps.onStep?.(entry)
  } catch {
    // progress reporting never affects the sync
  }
  return entry
}

/**
 * Stats-analysis spec §4.4: every due step, in order, oldest season first; each commits on its own,
 * so a quit mid-backfill resumes on the next run (an `interrupted` step is not an attempt). Then, when anything was written, identity and
 * views are rebuilt (`stats:identity`). Never throws.
 */
export async function refreshStats(
  deps: StatsSyncDeps,
  options: RefreshOptions = {},
  steps: Step[] = STATS_STEPS
): Promise<StatsSyncResult> {
  const log: StatsLogEntry[] = []
  let state: StatsState
  try {
    state = await deps.nflState()
  } catch (err) {
    log.push(
      await runLogged(deps, `${STATS_LOG_PREFIX}state`, () => {
        throw err
      })
    )
    return { steps: log }
  }
  const force = options.force ?? false
  let wrote = false
  for (const step of steps) {
    for (const season of seasonsFor(step, state.season)) {
      if (deps.cancelled?.()) return { steps: log }
      const name = stepLogName(step, season)
      const due = isDue({
        season,
        current: state.season,
        force,
        now: nowOf(deps).getTime(),
        lastAttemptAt: await lastAttempt(deps.db, name),
        version: step.version,
        state: await sourceState(deps.db, step.id, season)
      })
      if (!due) continue
      const entry = await runLogged(deps, name, async () => {
        const run = await step.run(season, { deps, state })
        if (run === null) {
          throw new SkipStep(
            season === 0 ? `${step.id} not published yet` : `${step.id} ${season} not published yet`
          )
        }
        await deps.db.exec(`INSERT OR REPLACE INTO source_state VALUES (?, ?, ?, ?, ?, ?)`, [
          step.id,
          season,
          step.version,
          run.rows,
          nowOf(deps).toISOString(),
          season !== 0 && season <= state.season - 2
        ])
        return { rows: run.rows, message: run.notes.length > 0 ? run.notes.join('; ') : null }
      })
      if (entry.status === 'ok') wrote = true
      log.push(entry)
    }
  }
  if (wrote && !deps.cancelled?.()) {
    log.push(
      await runLogged(deps, `${STATS_LOG_PREFIX}identity`, async () => {
        const players = await buildIdentity(deps.db)
        const views = await buildViews(deps.db)
        await deps.db.exec('CHECKPOINT')
        return { rows: players, message: views.length > 0 ? `views: ${views.join(', ')}` : null }
      })
    )
  }
  return { steps: log }
}
