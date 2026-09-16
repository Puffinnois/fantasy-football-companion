import { describe, expect, it } from 'vitest'
import { errorMessage, relativeTime } from '@/lib/format'

describe('relativeTime', () => {
  const now = new Date('2024-01-01T12:00:00Z').getTime()

  it('returns "never" for null or undefined', () => {
    expect(relativeTime(null, now)).toBe('never')
    expect(relativeTime(undefined, now)).toBe('never')
  })

  it('returns "never" for an unparseable date string', () => {
    expect(relativeTime('not-a-date', now)).toBe('never')
  })

  it('returns "just now" for less than a minute ago', () => {
    expect(relativeTime(new Date(now - 10_000).toISOString(), now)).toBe('just now')
  })

  it('returns minutes ago for under an hour', () => {
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 min ago')
  })

  it('returns hours ago for under a day', () => {
    expect(relativeTime(new Date(now - 3 * 60 * 60_000).toISOString(), now)).toBe('3 h ago')
  })

  it('returns days ago for a day or more', () => {
    expect(relativeTime(new Date(now - 2 * 24 * 60 * 60_000).toISOString(), now)).toBe('2 d ago')
  })
})

describe('errorMessage', () => {
  it('strips the Electron IPC error prefix', () => {
    const err = new Error("Error invoking remote method 'league:get': Error: league not found")
    expect(errorMessage(err)).toBe('league not found')
  })

  it('strips the Electron IPC error prefix with a serialised error class name', () => {
    const err = new Error(
      "Error invoking remote method 'setup:importLeague': SleeperHttpError: Sleeper 503 for /league/L1"
    )
    expect(errorMessage(err)).toBe('Sleeper 503 for /league/L1')
  })

  it('passes a plain value through String(err)', () => {
    expect(errorMessage('boom')).toBe('boom')
  })
})
