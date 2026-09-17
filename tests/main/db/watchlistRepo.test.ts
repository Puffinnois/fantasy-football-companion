import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { listWatched, toggleWatch } from '@main/db/repos/watchlist'

describe('watchlist repo', () => {
  it('toggles and lists', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(toggleWatch(db, '4866', 'now')).toBe(true)
    expect(toggleWatch(db, '6794', 'now')).toBe(true)
    expect(listWatched(db).sort()).toEqual(['4866', '6794'])
    expect(toggleWatch(db, '4866', 'now')).toBe(false)
    expect(listWatched(db)).toEqual(['6794'])
  })
})
