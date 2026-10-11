import type { WhPlayer } from '@main/db/repos/warehouse'
import { parseCsv, strOrNull } from '../csv'
import { requireColumns, rowData, type Parsed } from './parse'

export const COMBINE_SOURCE = 'combine'

/** `combine.csv`, every year: keyed by PFR id, else the college-football id; rows with neither are counted. */
export function parseCombine(csv: string): Parsed<WhPlayer> {
  requireColumns(csv, COMBINE_SOURCE, ['pfr_id', 'cfb_id'])
  const rows: WhPlayer[] = []
  let skipped = 0
  for (const row of parseCsv(csv)) {
    const pfr = strOrNull(row.pfr_id)
    const key = pfr ?? strOrNull(row.cfb_id)
    if (key === null) {
      skipped++
      continue
    }
    rows.push({
      source: COMBINE_SOURCE,
      playerKey: key,
      keyType: pfr !== null ? 'pfr' : 'cfb',
      data: rowData(row)
    })
  }
  return { rows, skipped }
}
