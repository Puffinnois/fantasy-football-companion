import { suggestFromDb } from '@main/trade/fromDb'
import { waiverAddsFromDb } from '@main/waiver/fromDb'
import type { TradeSuggestion, TradeSuggestQuery, WaiverAdds } from '@shared/types'

/** The searches that run off the main thread (6b spec §6, 6c spec §6). */
export type EngineJob =
  { kind: 'tradeSuggest'; query: TradeSuggestQuery } | { kind: 'waiverAdds'; season: number }

export interface EngineResults {
  tradeSuggest: TradeSuggestion[]
  waiverAdds: WaiverAdds
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
  }
}
