import type { StatsDb } from '@main/stats/db'
import type { Downloads } from '@main/stats/download'
import type { StatsState } from '@main/stats/sleeper'
import { FILE_SOURCES } from '@main/stats/sources'
import type { StatsSyncResult } from '@main/stats/protocol'
import type { ScoringRules } from '@shared/stats/scoring'
import { refreshStats, STATS_STEPS, type StatsSyncDeps } from '@main/stats/sync'
import { tempDir } from './stats'

export const STATE_2026: StatsState = { season: 2026, week: 6, seasonType: 'regular' }

/** The URL a file source fetches for `season` (0 for an all-seasons file). */
export function urlOf(id: string, season = 0): string {
  const source = FILE_SOURCES.find((s) => s.id === id)
  if (!source) throw new Error(`no source ${id}`)
  return source.url(season)
}

/** Serves local files by URL (never deleted) and JSON bodies; anything else is a 404. */
export function fakeDownloads(
  files: Record<string, string>,
  json: Record<string, unknown> = {}
): Downloads & { fetched: string[] } {
  const fetched: string[] = []
  return {
    fetched,
    async withFile(url, read) {
      fetched.push(url)
      const path = files[url]
      return path === undefined ? null : read(path)
    },
    async json(url) {
      fetched.push(url)
      return json[url] ?? null
    }
  }
}

export interface RunOptions {
  files?: Record<string, string>
  json?: Record<string, unknown>
  /** Only these step ids run (default: every step). */
  only?: string[]
  state?: StatsState
  now?: Date
  force?: boolean
  /** The league's scoring rules, for `fantasy_week`. */
  league?: ScoringRules | null
}

/** One stats refresh against fake downloads. */
export async function runSync(db: StatsDb, options: RunOptions = {}): Promise<StatsSyncResult> {
  const deps: StatsSyncDeps = {
    db,
    downloads: fakeDownloads(options.files ?? {}, options.json ?? {}),
    tempDir: tempDir(),
    nflState: async () => options.state ?? STATE_2026,
    now: () => options.now ?? new Date('2026-10-16T12:00:00Z'),
    league: () => options.league ?? null
  }
  const steps = options.only ? STATS_STEPS.filter((s) => options.only?.includes(s.id)) : STATS_STEPS
  return refreshStats(deps, { force: options.force }, steps)
}
