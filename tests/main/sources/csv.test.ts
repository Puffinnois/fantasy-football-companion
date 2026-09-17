import { describe, expect, it } from 'vitest'
import { numOrNull, parseCsv, strOrNull } from '@main/sources/csv'

describe('parseCsv', () => {
  it('parses header + rows into objects', () => {
    expect(parseCsv('a,b\n1,2\n3,4\n')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' }
    ])
  })

  it('handles quoted fields with commas, doubled quotes, CRLF and BOM', () => {
    const text =
      '﻿name,url\r\n"Beckham, Odell","https://x/img?f_auto,q_auto"\r\n"He said ""hi""",""\r\n'
    expect(parseCsv(text)).toEqual([
      { name: 'Beckham, Odell', url: 'https://x/img?f_auto,q_auto' },
      { name: 'He said "hi"', url: '' }
    ])
  })

  it('ignores blank lines and a missing trailing newline', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([{ a: '1', b: '2' }])
  })

  it('fills missing trailing columns with empty strings', () => {
    expect(parseCsv('a,b,c\n1,2')).toEqual([{ a: '1', b: '2', c: '' }])
  })

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('numOrNull / strOrNull', () => {
  it('treats "NA", empty and undefined as null', () => {
    expect(numOrNull('NA')).toBeNull()
    expect(numOrNull('')).toBeNull()
    expect(numOrNull(undefined)).toBeNull()
    expect(numOrNull('abc')).toBeNull()
    expect(numOrNull('0.08')).toBe(0.08)
    expect(numOrNull('-2')).toBe(-2)
    expect(strOrNull('NA')).toBeNull()
    expect(strOrNull('')).toBeNull()
    expect(strOrNull('LA')).toBe('LA')
  })
})
