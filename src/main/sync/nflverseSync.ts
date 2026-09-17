import { withTransaction } from '@main/db/connection'
import {
  countPlayerIds,
  countUnresolvedRostered,
  listCrosswalk,
  listPlayerIdentitySources,
  replaceCrosswalk,
  replacePlayerIds
} from '@main/db/repos/playerIds'
import { countPoints } from '@main/db/repos/points'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import {
  listNflverseIdentities,
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  upsertGames
} from '@main/db/repos/stats'
import { recomputePoints } from '@main/scoring/recompute'
import type { NflverseClient } from '@main/sources/nflverse'
import type { SyncLogEntry, SyncResult } from '@shared/types'
import { resolvePlayers } from './identity'
import { nowOf, runStep, SkipStep, type RefreshOptions, type SyncDeps } from './step'

export const SOURCE_CROSSWALK = 'nflverse:crosswalk'
export const SOURCE_GAMES = 'nflverse:games'
export const SOURCE_IDENTITY = 'app:identity'
export const SOURCE_POINTS = 'app:points'
export const STATS_SOURCE_PREFIX = 'nflverse:stats:'
export const sourceStats = (season: number): string => `${STATS_SOURCE_PREFIX}${season}`
export const sourceSnaps = (season: number): string => `nflverse:snaps:${season}`

const HOUR = 60 * 60 * 1000
export const CROSSWALK_FRESHNESS_MS = 24 * HOUR
export const NFLVERSE_FRESHNESS_MS = 6 * HOUR
/** A finished season's files never change; re-fetch weekly just in case of upstream corrections. */
export const PAST_SEASON_FRESHNESS_MS = 7 * 24 * HOUR

export interface NflverseSyncDeps extends SyncDeps {
  nflverse: NflverseClient
}

export interface NflverseRefreshOptions extends RefreshOptions {
  /** The Sleeper players DB was re-fetched this run: re-resolve identities even if the crosswalk is fresh. */
  playersChanged?: boolean
}

const ok = (entry: SyncLogEntry): boolean => entry.status === 'ok'

/**
 * Spec §9 order, with identity after the downloads so it can fall back on nflverse names:
 * crosswalk → stats (both seasons) → snaps → games → identity → points. Each step logs to
 * `sync_log` and is independent; `app:identity` / `app:points` run only when an input changed.
 */
export async function refreshNflverse(
  deps: NflverseSyncDeps,
  options: NflverseRefreshOptions = {}
): Promise<SyncResult> {
  const force = options.force ?? false
  const steps: SyncLogEntry[] = []
  const state = getNflState(deps.db)
  if (!state) return { steps }
  const current = Number(state.season)
  const seasons = [current - 1, current]
  const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
  const ts = (): string => nowOf(deps).toISOString()

  const crosswalk = await runStep(
    deps,
    SOURCE_CROSSWALK,
    CROSSWALK_FRESHNESS_MS,
    force,
    async () => {
      const result = await deps.nflverse.getCrosswalk()
      return withTransaction(deps.db, () => replaceCrosswalk(deps.db, result.records, ts()))
    }
  )
  steps.push(crosswalk)

  let statsChanged = false
  for (const season of seasons) {
    const freshness = season === current ? NFLVERSE_FRESHNESS_MS : PAST_SEASON_FRESHNESS_MS
    const stats = await runStep(deps, sourceStats(season), freshness, force, async () => {
      const [players, teams] = await Promise.all([
        deps.nflverse.getPlayerWeekStats(season),
        deps.nflverse.getTeamWeekStats(season)
      ])
      if (!players || !teams) throw new SkipStep(`${season} stats not published yet`)
      const regPlayers = players.records.filter((r) => r.seasonType === 'REG')
      const regTeams = teams.records.filter((r) => r.seasonType === 'REG')
      const rows = withTransaction(
        deps.db,
        () =>
          replacePlayerWeekStats(deps.db, season, regPlayers, ts()) +
          replaceTeamWeekStats(deps.db, season, regTeams, ts())
      )
      const skipped = players.skipped + teams.skipped
      return { rows, message: skipped ? `${skipped} unparseable rows skipped` : null }
    })
    steps.push(stats)
    statsChanged ||= ok(stats)

    steps.push(
      await runStep(deps, sourceSnaps(season), freshness, force, async () => {
        const snaps = await deps.nflverse.getSnapCounts(season)
        if (!snaps) throw new SkipStep(`${season} snap counts not published yet`)
        const reg = snaps.records.filter((r) => r.gameType === 'REG')
        return withTransaction(deps.db, () => replaceSnaps(deps.db, season, reg, ts()))
      })
    )
  }

  const games = await runStep(deps, SOURCE_GAMES, NFLVERSE_FRESHNESS_MS, force, async () => {
    const result = await deps.nflverse.getGames()
    const wanted = result.records.filter((g) => g.gameType === 'REG' && seasons.includes(g.season))
    return withTransaction(deps.db, () => upsertGames(deps.db, wanted, ts()))
  })
  steps.push(games)

  let identityChanged = false
  if (
    force ||
    ok(crosswalk) ||
    statsChanged ||
    options.playersChanged ||
    countPlayerIds(deps.db) === 0
  ) {
    const identity = await runStep(deps, SOURCE_IDENTITY, 0, true, async () => {
      const records = resolvePlayers(
        listPlayerIdentitySources(deps.db),
        listCrosswalk(deps.db),
        listNflverseIdentities(deps.db)
      )
      const rows = withTransaction(deps.db, () => replacePlayerIds(deps.db, records, ts()))
      const unresolved = leagueId ? countUnresolvedRostered(deps.db, leagueId) : 0
      return { rows, message: unresolved ? `${unresolved} rostered players unresolved` : null }
    })
    steps.push(identity)
    identityChanged = ok(identity)
  }

  if (
    leagueId &&
    (force || identityChanged || statsChanged || ok(games) || countPoints(deps.db, leagueId) === 0)
  ) {
    steps.push(
      await runStep(deps, SOURCE_POINTS, 0, true, async () =>
        withTransaction(deps.db, () => recomputePoints(deps.db, leagueId, ts()))
      )
    )
  }
  return { steps }
}
