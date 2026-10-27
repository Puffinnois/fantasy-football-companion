import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { projectionMap } from '@/lib/stats/games'
import type { PlayerDetail } from '@shared/types'
import type {
  GameForecast,
  MetricInfo,
  OutlookQuery,
  PlayerBio,
  PlayerLink,
  PlayerOutlook,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsStatus
} from '@shared/stats/types'

/** What every Stats screen reads once: the status, the catalogue, my league's rosters. */
export interface StatsData {
  status: StatsStatus | null
  catalogue: MetricInfo[]
  byId: ReadonlyMap<string, MetricInfo>
  ownership: StatsOwnership | null
  /** The rosters' first answer arrived (the dashboards open on my top scorer only then). */
  ownershipReady: boolean
  /** Bumped when a rebuild finished (spec §5.3): screens query again. */
  version: number
  error: string | null
}

/**
 * Loads the shared Stats data and keeps it current: a finished rebuild re-reads the status and the
 * catalogue (stability changes with the models), a league change (`leagueKey`) the rosters.
 */
export function useStatsData(leagueKey: number): StatsData {
  const [status, setStatus] = useState<StatsStatus | null>(null)
  const [catalogue, setCatalogue] = useState<MetricInfo[]>([])
  const [ownership, setOwnership] = useState<StatsOwnership | null>(null)
  const [ownershipReady, setOwnershipReady] = useState(false)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([api.stats.status(), api.stats.catalogue()])
      .then(([s, c]) => {
        if (!alive) return
        setStatus(s)
        setCatalogue(c)
        setError(null)
      })
      .catch((err) => alive && setError(errorMessage(err)))
    return () => {
      alive = false
    }
  }, [version])

  useEffect(() => {
    let alive = true
    void api.stats
      .ownership()
      .then((o) => alive && setOwnership(o))
      .catch(() => alive && setOwnership(null))
      .finally(() => alive && setOwnershipReady(true))
    return () => {
      alive = false
    }
  }, [leagueKey])

  useEffect(() => api.stats.onChanged(() => setVersion((v) => v + 1)), [])

  // A refresh in progress: poll the status quietly until it is done (spec §5.3).
  useEffect(() => {
    if (!status?.busy) return
    const timer = setInterval(() => {
      void api.stats
        .status()
        .then(setStatus)
        .catch(() => {})
    }, 5000)
    return () => clearInterval(timer)
  }, [status?.busy])

  const byId = useMemo(() => new Map(catalogue.map((m) => [m.id, m])), [catalogue])
  return { status, catalogue, byId, ownership, ownershipReady, version, error }
}

export interface QueryState {
  /** The last answer: it stays on screen while the next one loads. */
  result: StatsResult | null
  loading: boolean
  error: string | null
}

/** `keepLast` (default): the last answer stays on screen while the next one loads. */
export interface QueryOptions {
  keepLast?: boolean
}

/**
 * Runs `query` (null: nothing to run) and again when it, or `version`, changes. An answer for a
 * query that has since changed is dropped. A screen about one team asks for fresh answers only
 * (`keepLast: false`): another team's numbers must not stand in while its own load.
 */
export function useStatsQuery(
  query: StatsQuery | null,
  version: number,
  { keepLast = true }: QueryOptions = {}
): QueryState {
  const key = query ? `${version}|${JSON.stringify(query)}` : null
  const [done, setDone] = useState<{
    key: string
    result: StatsResult | null
    error: string | null
  } | null>(null)
  useEffect(() => {
    if (!key) return
    let cancelled = false
    api.stats
      .query(JSON.parse(key.slice(key.indexOf('|') + 1)) as StatsQuery)
      .then((result) => !cancelled && setDone({ key, result, error: null }))
      .catch((err) => !cancelled && setDone({ key, result: null, error: errorMessage(err) }))
    return () => {
      cancelled = true
    }
  }, [key])
  const current = done !== null && done.key === key
  return {
    result: (keepLast || current ? done?.result : null) ?? null,
    loading: key !== null && !current,
    error: current ? done.error : null
  }
}

/**
 * Runs several queries at once (a dashboard tab), keyed: the answers come back together, or the
 * first error. As `useStatsQuery`, a late answer for queries that have since changed is dropped.
 */
export function useStatsQueries<K extends string>(
  queries: ReadonlyMap<K, StatsQuery> | null,
  version: number,
  { keepLast = true }: QueryOptions = {}
): { results: Map<K, StatsResult> | null; loading: boolean; error: string | null } {
  const key = queries ? `${version}|${JSON.stringify([...queries])}` : null
  const [done, setDone] = useState<{
    key: string
    results: Map<K, StatsResult> | null
    error: string | null
  } | null>(null)
  useEffect(() => {
    if (!key) return
    let cancelled = false
    const entries = JSON.parse(key.slice(key.indexOf('|') + 1)) as [K, StatsQuery][]
    Promise.all(entries.map(async ([k, q]) => [k, await api.stats.query(q)] as const))
      .then((rs) => !cancelled && setDone({ key, results: new Map(rs), error: null }))
      .catch((err) => !cancelled && setDone({ key, results: null, error: errorMessage(err) }))
    return () => {
      cancelled = true
    }
  }, [key])
  const current = done !== null && done.key === key
  return {
    results: (keepLast || current ? done?.results : null) ?? null,
    loading: key !== null && !current,
    error: current ? done.error : null
  }
}

/** A season's games for one team (spec §8.1), again after a rebuild. */
export function useTeamGames(
  season: number,
  team: string,
  version: number
): { games: GameForecast[] | null; error: string | null } {
  const key = `${version}|${season}|${team}`
  const [done, setDone] = useState<{
    key: string
    games: GameForecast[] | null
    error: string | null
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    api.stats
      .games({ season, team })
      .then((games) => !cancelled && setDone({ key, games, error: null }))
      .catch((err) => !cancelled && setDone({ key, games: null, error: errorMessage(err) }))
    return () => {
      cancelled = true
    }
  }, [key, season, team])
  const current = done !== null && done.key === key
  return { games: current ? done.games : null, error: current ? done.error : null }
}

/** A read keyed by text (`version|request`): again when the key changes, a stale answer dropped. */
function useKeyed<T>(
  key: string | null,
  run: (request: string) => Promise<T>
): { data: T | null; loading: boolean; error: string | null } {
  const [done, setDone] = useState<{ key: string; data: T | null; error: string | null } | null>(
    null
  )
  useEffect(() => {
    if (key === null) return
    let cancelled = false
    run(key.slice(key.indexOf('|') + 1))
      .then((data) => !cancelled && setDone({ key, data, error: null }))
      .catch((err) => !cancelled && setDone({ key, data: null, error: errorMessage(err) }))
    return () => {
      cancelled = true
    }
  }, [key, run])
  const current = done !== null && done.key === key
  return {
    data: current ? done.data : null,
    loading: key !== null && !current,
    error: current ? done.error : null
  }
}

const readBio = (request: string): Promise<PlayerBio> => api.stats.player(JSON.parse(request))
const readOutlook = (request: string): Promise<PlayerOutlook> =>
  api.stats.outlook(JSON.parse(request))
const readGames = (request: string): Promise<GameForecast[]> => api.stats.games(JSON.parse(request))
const readLink = (request: string): Promise<PlayerLink | null> =>
  api.stats.link(JSON.parse(request))
const readDetail = (request: string): Promise<PlayerDetail> => {
  const { season, id } = JSON.parse(request) as { season: number; id: string }
  return api.players.detail(season, id)
}

const readProjections = async (request: string): Promise<Map<string, number>> => {
  const { ids, season, week } = JSON.parse(request) as {
    ids: string[]
    season: number
    week: number
  }
  const [fantasy, links] = await Promise.all([
    api.players.week({ season, week }),
    Promise.all(
      ids.map(async (gsis) => [gsis, (await api.stats.link({ gsis }))?.sleeper ?? null] as const)
    )
  ])
  return projectionMap(fantasy.rows, new Map(links))
}

/**
 * Sleeper's projections of a week for some players (Games, Plan AE), by gsis id, from Fantasy's
 * file: with a league only (null without one, or while they are read).
 */
export function useWeekProjections(
  ids: readonly string[] | null,
  season: number,
  week: number,
  leagueKey: number
): ReadonlyMap<string, number> | null {
  const { data } = useKeyed(
    ids && ids.length
      ? `${leagueKey}|${JSON.stringify({ ids: [...ids].sort(), season, week })}`
      : null,
    readProjections
  )
  return data
}

/** Spec §9.4: a player's identity and status now, again after a rebuild. */
export function usePlayerBio(
  player: string | null,
  version: number
): { bio: PlayerBio | null; error: string | null } {
  const { data, error } = useKeyed(
    player ? `${version}|${JSON.stringify({ player })}` : null,
    readBio
  )
  return { bio: data, error }
}

/** Spec §8.5: a player's outlook (the Forecast tab). */
export function usePlayerOutlook(
  query: OutlookQuery | null,
  version: number
): { outlook: PlayerOutlook | null; error: string | null } {
  const { data, error } = useKeyed(
    query ? `${version}|${JSON.stringify(query)}` : null,
    readOutlook
  )
  return { outlook: data, error }
}

/** Every game of a season (a player's log reads his team's side of each). */
export function useSeasonGames(
  season: number | null,
  version: number
): { games: GameForecast[] | null; error: string | null } {
  const { data, error } = useKeyed(
    season === null ? null : `${version}|${JSON.stringify({ season })}`,
    readGames
  )
  return { games: data, error }
}

/**
 * The same player in Fantasy (spec §9.4): his Sleeper id from the league's id map, read again when
 * the league changes (`leagueKey`); null without a league or when the map has no such player,
 * undefined while it is read.
 */
export function usePlayerLink(
  gsis: string | null,
  leagueKey: number | null
): PlayerLink | null | undefined {
  const { data, loading } = useKeyed(
    gsis && leagueKey !== null ? `${leagueKey}|${JSON.stringify({ gsis })}` : null,
    readLink
  )
  return loading ? undefined : data
}

/** Fantasy's file on a player (projections, rest of season, experts): with a league only. */
export function useFantasyDetail(
  season: number | null,
  sleeperId: string | null,
  leagueKey: number
): { detail: PlayerDetail | null; error: string | null } {
  const { data, error } = useKeyed(
    season !== null && sleeperId
      ? `${leagueKey}|${JSON.stringify({ season, id: sleeperId })}`
      : null,
    readDetail
  )
  return { detail: data, error }
}
