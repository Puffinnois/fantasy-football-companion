import { openDatabase } from '@main/db/connection'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import type { LineupBuild } from '@main/lineup/build'
import { openSpotFromDb, suggestFromDb } from '@main/trade/fromDb'
import { suggestDeals, type SearchProgress } from '@main/trade/suggest'
import { waiverAddsFromDb, waiverStreamFromDb } from '@main/waiver/fromDb'
import type {
  StreamRow,
  SuggestProgress,
  SuggestUpdate,
  TradeOpenSpots,
  TradeProposal,
  TradeSuggestion,
  TradeSuggestQuery,
  WaiverAdds
} from '@shared/types'

/** The searches that run off the main thread (6b spec §6, 6c spec §6). */
export type EngineJob =
  | { kind: 'tradeSuggest'; query: TradeSuggestQuery }
  | { kind: 'waiverAdds'; season: number }
  | { kind: 'waiverStream'; season: number; week: number }
  | { kind: 'openSpot'; season: number; proposal: TradeProposal }

export interface EngineResults {
  tradeSuggest: TradeSuggestion[]
  waiverAdds: WaiverAdds
  waiverStream: StreamRow[]
  openSpot: TradeOpenSpots
}

export interface EngineInput {
  dbPath: string
  leagueId: string
  job: EngineJob
}

/** Errors cross the thread boundary as a message so `TradeError`'s user-facing text survives. */
export interface EngineOutput {
  result?: unknown
  error?: string
}

export function runJob(input: EngineInput): EngineResults[EngineJob['kind']] {
  const { dbPath, leagueId, job } = input
  switch (job.kind) {
    case 'tradeSuggest':
      return suggestFromDb(dbPath, leagueId, job.query)
    case 'waiverAdds':
      return waiverAddsFromDb(dbPath, leagueId, job.season)
    case 'waiverStream':
      return waiverStreamFromDb(dbPath, leagueId, job.season, job.week)
    case 'openSpot':
      return openSpotFromDb(dbPath, leagueId, job.season, job.proposal)
  }
}

/** Multi-team spec §4.1: the suggestion search, streamed. */
export type StreamJob = { kind: 'tradeSuggest'; query: TradeSuggestQuery }

export interface StreamInput {
  dbPath: string
  leagueId: string
  stream: StreamJob
}

/** Spec §4.1: at most one post per this many ms — except the first card, which goes out at once. */
export const BATCH_MS = 250

function buildFromDb(dbPath: string, leagueId: string, season: number): LineupBuild {
  const db = openDatabase(dbPath)
  try {
    return lineupBuildFromDb(db, leagueId, season)
  } finally {
    db.close()
  }
}

/**
 * The streaming worker's body: runs the search on its own connection and posts batched updates —
 * the cards in order with the latest progress, then `done` with the final progress, or `error`.
 */
export function runStreamJob(
  input: StreamInput,
  post: (update: SuggestUpdate) => void,
  now: () => number = () => performance.now()
): void {
  const started = now()
  let latest: SearchProgress = { checked: 0, total: 0, found: 0, size: 2 }
  let pending: TradeSuggestion[] = []
  let lastPost = started
  let firstCard = true
  const stamped = (): SuggestProgress => ({ ...latest, elapsedMs: Math.round(now() - started) })
  const flushCards = (): void => {
    if (pending.length === 0) return
    post({ type: 'cards', cards: pending })
    pending = []
  }
  try {
    const { query } = input.stream
    const search = suggestDeals(buildFromDb(input.dbPath, input.leagueId, query.season), query)
    let step = search.next()
    while (!step.done) {
      const event = step.value
      let urgent = false
      if (event.type === 'card') {
        pending.push(event.card)
        urgent = firstCard
        firstCard = false
      } else {
        latest = event.progress
      }
      if (urgent || now() - lastPost >= BATCH_MS) {
        flushCards()
        post({ type: 'progress', progress: stamped() })
        lastPost = now()
      }
      step = search.next()
    }
    flushCards()
    post({ type: 'done', reason: step.value, progress: stamped() })
  } catch (err) {
    flushCards()
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
