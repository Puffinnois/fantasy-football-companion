import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  listProjections,
  listProjectionWeeks,
  replaceProjections
} from '@main/db/repos/projections'
import { mapProjections } from '@main/sync/mappers'
import * as fx from '../../fixtures/sleeper'

const TS = '2026-09-17T12:00:00.000Z'

describe('projections repo', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replaces a week idempotently and round-trips stats', () => {
    const { records } = mapProjections(fx.projections, 2026, 1)
    expect(replaceProjections(db, 2026, 1, records, TS)).toBe(3)
    expect(replaceProjections(db, 2026, 1, records, TS)).toBe(3)
    expect(listProjections(db, 2026, 1)).toEqual(records)
    expect(listProjections(db, 2026, 2)).toEqual([])
    replaceProjections(
      db,
      2026,
      2,
      records.slice(0, 1).map((r) => ({ ...r, week: 2 })),
      TS
    )
    expect(listProjectionWeeks(db)).toEqual([
      { season: 2026, week: 1 },
      { season: 2026, week: 2 }
    ])
  })
})
