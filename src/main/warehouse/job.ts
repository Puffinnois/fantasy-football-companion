import { decodeText } from '@main/sources/http'
import { aggregateSeason, type SeasonResult } from './aggregate'

/**
 * What the warehouse worker is given: one season's files as downloaded (spec §6.1). FTN and
 * participation are null when they are not due or not published.
 */
export interface WarehouseJob {
  pbp: Uint8Array
  ftn: Uint8Array | null
  part: Uint8Array | null
}

export type WarehouseOutput = { result: SeasonResult; error?: undefined } | { error: string }

/** Turns a season's downloaded files into their aggregates; the sync takes it as a dependency. */
export type AggregatePbp = (job: WarehouseJob) => Promise<SeasonResult>

const decoded = (bytes: Uint8Array | null): string | null =>
  bytes === null ? null : decodeText(bytes)

/** The worker's job: gunzip, decode, aggregate. */
export function runWarehouseJob(job: WarehouseJob): SeasonResult {
  return aggregateSeason({
    pbp: decodeText(job.pbp),
    ftn: decoded(job.ftn),
    part: decoded(job.part)
  })
}

/** The same job on the calling thread, for tests and scripts. */
export const aggregateInProcess: AggregatePbp = async (job) => runWarehouseJob(job)
