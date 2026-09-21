import { describe, expect, it } from 'vitest'
import {
  errorMessage,
  fmtPct,
  fmtPoints,
  fmtSigned,
  fmtSignedPct,
  relativeTime
} from '@/lib/format'

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

describe('fmtPoints / fmtPct', () => {
  it('formats points with two decimals (as Sleeper) and null as a dash', () => {
    expect(fmtPoints(null)).toBe('—')
    expect(fmtPoints(0)).toBe('0.00')
    expect(fmtPoints(18.4)).toBe('18.40')
    expect(fmtPoints(11.75)).toBe('11.75')
    expect(fmtPoints(11.746)).toBe('11.75')
  })

  it('formats 0-1 fractions as whole percentages', () => {
    expect(fmtPct(null)).toBe('—')
    expect(fmtPct(0.83)).toBe('83%')
    expect(fmtPct(1)).toBe('100%')
  })
})

describe('fmtSigned', () => {
  it('signs with two decimals by default, one on request', () => {
    expect(fmtSigned(3.2)).toBe('+3.20')
    expect(fmtSigned(-0.8)).toBe('-0.80')
    expect(fmtSigned(0)).toBe('0.00')
    expect(fmtSigned(1.5, 1)).toBe('+1.5')
    expect(fmtSigned(null)).toBe('—')
  })
})

describe('fmtSignedPct', () => {
  it('signs a fraction as a whole percent', () => {
    expect(fmtSignedPct(0.09)).toBe('+9%')
    expect(fmtSignedPct(-0.126)).toBe('-13%')
    expect(fmtSignedPct(0)).toBe('0%')
    expect(fmtSignedPct(null)).toBe('—')
  })
})
