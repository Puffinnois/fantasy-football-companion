import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import type {
  MetricInfo,
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
  return { status, catalogue, byId, ownership, version, error }
}

export interface QueryState {
  /** The last answer: it stays on screen while the next one loads. */
  result: StatsResult | null
  loading: boolean
  error: string | null
}

/**
 * Runs `query` (null: nothing to run) and again when it, or `version`, changes. An answer for a
 * query that has since changed is dropped.
 */
export function useStatsQuery(query: StatsQuery | null, version: number): QueryState {
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
    result: done?.result ?? null,
    loading: key !== null && !current,
    error: current ? done.error : null
  }
}
