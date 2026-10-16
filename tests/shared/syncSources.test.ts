import { describe, expect, it } from 'vitest'
import { SYNC_SOURCE_GROUPS, syncGroupOf } from '@shared/syncSources'

describe('syncSources', () => {
  it('groups sync_log sources for the Setup list', () => {
    expect(SYNC_SOURCE_GROUPS).toHaveLength(7)
    expect(syncGroupOf('sleeper:league')).toBe('league')
    expect(syncGroupOf('sleeper:matchups:2026:5')).toBe('league')
    expect(syncGroupOf('sleeper:projections:2026:6')).toBe('projections')
    expect(syncGroupOf('nflverse:stats:2026')).toBe('stats')
    expect(syncGroupOf('sleeper:stats:2026:5')).toBe('stats')
    expect(syncGroupOf('fantasypros:ros:2026')).toBe('experts')
    expect(syncGroupOf('fantasycalc:2026')).toBe('market')
    expect(syncGroupOf('app:points')).toBe('points')
    expect(syncGroupOf('wh:pbp:2026')).toBeNull()
    expect(syncGroupOf('sleeper:state')).toBeNull()
  })
})
