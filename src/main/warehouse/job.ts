import { decodeText } from '@main/sources/http'
import { aggregatePbp, type PbpResult } from './aggregate'

/** What the warehouse worker is given: one season's play-by-play file as downloaded (spec §6.1). */
export interface WarehouseJob {
  pbp: Uint8Array
}

export type WarehouseOutput = { result: PbpResult; error?: undefined } | { error: string }

/** Turns a downloaded play-by-play file into its aggregates; the sync takes it as a dependency. */
export type AggregatePbp = (bytes: Uint8Array) => Promise<PbpResult>

/** The worker's job: gunzip, decode, aggregate. */
export function runWarehouseJob(job: WarehouseJob): PbpResult {
  return aggregatePbp(decodeText(job.pbp))
}

/** The same job on the calling thread, for tests and scripts. */
export const aggregateInProcess: AggregatePbp = async (bytes) => runWarehouseJob({ pbp: bytes })
