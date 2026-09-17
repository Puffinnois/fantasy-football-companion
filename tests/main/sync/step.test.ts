import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getLastSync } from '@main/db/repos/syncLog'
import type { SleeperClient } from '@main/sources/sleeper'
import { isFresh, runStep, SkipStep, type SyncDeps } from '@main/sync/step'

describe('runStep', () => {
  let db: Db
  let clock: Date
  let deps: SyncDeps
  const HOUR = 3_600_000

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    clock = new Date('2026-09-17T12:00:00.000Z')
    deps = { db, sleeper: {} as SleeperClient, now: () => clock }
  })

  it('records ok with the returned row count', async () => {
    const entry = await runStep(deps, 'x', HOUR, false, async () => 7)
    expect(entry).toMatchObject({ source: 'x', status: 'ok', rowsWritten: 7, message: null })
    expect(getLastSync(db, 'x', 'ok')?.id).toBe(entry.id)
  })

  it('records ok with a message when the step returns one', async () => {
    const entry = await runStep(deps, 'x', HOUR, false, async () => ({
      rows: 3,
      message: '2 unresolved'
    }))
    expect(entry).toMatchObject({ status: 'ok', rowsWritten: 3, message: '2 unresolved' })
  })

  it('records skipped when the step throws SkipStep', async () => {
    const entry = await runStep(deps, 'x', HOUR, false, async () => {
      throw new SkipStep('2027 not published yet')
    })
    expect(entry).toMatchObject({
      status: 'skipped',
      message: '2027 not published yet',
      rowsWritten: 0
    })
  })

  it('records error for any other throw', async () => {
    const entry = await runStep(deps, 'x', HOUR, false, async () => {
      throw new Error('boom')
    })
    expect(entry).toMatchObject({ status: 'error', message: 'boom' })
  })

  it('skips as fresh inside the window, runs again after it, and force ignores the window', async () => {
    await runStep(deps, 'x', HOUR, false, async () => 1)
    clock = new Date(clock.getTime() + 30 * 60_000)
    expect(isFresh(db, 'x', HOUR, clock)).toBe(true)
    expect(await runStep(deps, 'x', HOUR, false, async () => 1)).toMatchObject({
      status: 'skipped',
      message: 'fresh'
    })
    expect(await runStep(deps, 'x', HOUR, true, async () => 1)).toMatchObject({ status: 'ok' })
    clock = new Date(clock.getTime() + 2 * HOUR)
    expect(await runStep(deps, 'x', HOUR, false, async () => 1)).toMatchObject({ status: 'ok' })
  })

  it('never treats a step as fresh when freshnessMs is 0', async () => {
    await runStep(deps, 'x', 0, false, async () => 1)
    expect(await runStep(deps, 'x', 0, false, async () => 1)).toMatchObject({ status: 'ok' })
  })

  it('calls onStep with the finished entry and survives a throwing listener', async () => {
    const seen: string[] = []
    const entry = await runStep(
      {
        ...deps,
        onStep: (e) => {
          seen.push(e.status)
          throw new Error('ui crashed')
        }
      },
      'x',
      HOUR,
      false,
      async () => 1
    )
    expect(entry.status).toBe('ok')
    expect(seen).toEqual(['ok'])
  })
})
