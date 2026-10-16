import { describe, expect, it } from 'vitest'
import { leagueMonogram, sourceRows } from '@/lib/setupView'
import type { SyncLogEntry, SyncStatus } from '@shared/types'

const NOW = Date.parse('2026-10-16T12:00:00.000Z')
const entry = (over: Partial<SyncLogEntry> & { source: string }): SyncLogEntry => ({
  id: 1,
  startedAt: '2026-10-16T11:57:00.000Z',
  finishedAt: '2026-10-16T11:57:00.000Z',
  status: 'ok',
  message: null,
  rowsWritten: 0,
  ...over
})
const status = (sources: SyncStatus['sources']): SyncStatus => ({
  nflState: null,
  lastSleeperSync: null,
  lastNflverseSync: null,
  lastError: null,
  activeLeagueId: 'L1',
  sources
})

describe('setupView', () => {
  it('shows each group’s last finished entry outside a run', () => {
    const rows = sourceRows(
      status({
        league: entry({ source: 'sleeper:league', rowsWritten: 1234 }),
        market: entry({ source: 'fantasycalc:2026', status: 'error', message: 'timeout' })
      }),
      null,
      NOW
    )
    expect(rows.map((r) => r.state)).toEqual([
      'ok',
      'unknown',
      'unknown',
      'unknown',
      'unknown',
      'error',
      'unknown'
    ])
    expect(rows[0]).toMatchObject({
      label: 'Sleeper league',
      when: '3 min ago',
      rows: '1,234 rows'
    })
    expect(rows[5].message).toBe('timeout')
  })

  it('during a run: reported groups done, the first silent one syncing, the rest queued', () => {
    const rows = sourceRows(
      status({}),
      [
        entry({ source: 'sleeper:league', rowsWritten: 2 }),
        entry({ source: 'sleeper:matchups:2026:6', rowsWritten: 3 }),
        entry({ source: 'sleeper:projections:2026:6', status: 'error', message: 'down' })
      ],
      NOW
    )
    expect(rows.map((r) => r.state)).toEqual([
      'ok',
      'running',
      'error',
      'queued',
      'queued',
      'queued',
      'queued'
    ])
    expect(rows[0].rows).toBe('5 rows')
    expect(rows[2].message).toBe('sleeper:projections:2026:6: down')
  })

  it('builds a league monogram from its words', () => {
    expect(leagueMonogram('Emoney Offline Chat')).toBe('EO')
    expect(leagueMonogram('🔥 The League')).toBe('TL')
    expect(leagueMonogram('')).toBe('?')
  })
})
