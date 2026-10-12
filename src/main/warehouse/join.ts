import type { WhPlayerWeek, WhTeamWeek } from '@main/db/repos/warehouse'
import { forEachCsvRow, numOrNull } from '@main/sources/csv'
import { requireColumns } from '@main/sources/warehouse/parse'
import type { IndexedPlay, PlayIndex } from './playIndex'

/** What one joined file (FTN or participation) aggregates to (spec §6.1). */
export interface JoinResult {
  playerWeeks: WhPlayerWeek[]
  teamWeeks: WhTeamWeek[]
  /** Rows without a game or play id. */
  skipped: number
  /** Rows whose play is not in the index (deleted, preseason or not in play-by-play). */
  unmatched: number
}

/** One row of a joined file. Cells are trimmed (FTN writes " CHK"); empty and NA are null. */
export interface Cells {
  text(column: string): string | null
  num(column: string): number | null
  /** TRUE / 1. */
  flag(column: string): boolean
}

/**
 * Reads `text` one row at a time and hands every row that finds its play to `onRow`. `gameColumn`
 * and `playColumn` are the join key (spec §6.1); a missing key column fails the step.
 */
export function forEachJoinedRow(
  text: string,
  source: string,
  index: PlayIndex,
  keys: { gameColumn: string; playColumn: string; required: string[] },
  onRow: (cells: Cells, play: IndexedPlay) => void
): { skipped: number; unmatched: number } {
  requireColumns(text, source, [keys.gameColumn, keys.playColumn, ...keys.required])
  let skipped = 0
  let unmatched = 0
  let at: Map<string, number> | null = null
  let fields: string[] = []
  const raw = (column: string): string => {
    const i = at?.get(column)
    return i === undefined ? '' : (fields[i] ?? '').trim()
  }
  const cells: Cells = {
    text: (column) => {
      const v = raw(column)
      return v === '' || v === 'NA' ? null : v
    },
    num: (column) => numOrNull(raw(column)),
    flag: (column) => {
      const v = raw(column)
      return v === 'TRUE' || v === '1'
    }
  }
  forEachCsvRow(text, (row, header) => {
    at ??= new Map(header.map((column, i) => [column, i]))
    fields = row
    const gameId = cells.text(keys.gameColumn)
    const playId = cells.num(keys.playColumn)
    if (gameId === null || playId === null) {
      skipped++
      return
    }
    const play = index.get(gameId, playId)
    if (play) onRow(cells, play)
    else unmatched++
  })
  return { skipped, unmatched }
}
