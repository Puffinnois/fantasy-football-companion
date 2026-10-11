import type { WhData } from '@main/db/repos/warehouse'

/** Sums are stored to 4 decimals: EPA and win probability carry no more than that. */
const round = (n: number): number => Math.round(n * 1e4) / 1e4

/**
 * Sums and counts for one player-week or team-week (spec §6.1: never rates). `data()` drops zeros
 * and missing values, as every warehouse row does (spec §10).
 */
export class Bag {
  private readonly sums = new Map<string, number>()
  private readonly maxes = new Map<string, number>()
  private readonly tallies = new Map<string, Map<string, number>>()

  /** Adds `n` (1 by default); a null `n` (the column was empty) adds nothing. */
  add(key: string, n: number | null = 1): void {
    if (n === null) return
    this.sums.set(key, (this.sums.get(key) ?? 0) + n)
  }

  /** Adds 1 when `condition` holds. */
  addIf(key: string, condition: boolean): void {
    if (condition) this.add(key)
  }

  /** Keeps the largest `n` seen (longest gains). */
  max(key: string, n: number | null): void {
    if (n === null) return
    const seen = this.maxes.get(key)
    if (seen === undefined || n > seen) this.maxes.set(key, n)
  }

  /** Counts `entry` in the `key` map (penalty types, …); a null entry counts nothing. */
  tally(key: string, entry: string | null): void {
    if (entry === null) return
    const map = this.tallies.get(key) ?? new Map<string, number>()
    map.set(entry, (map.get(entry) ?? 0) + 1)
    this.tallies.set(key, map)
  }

  /** The non-zero values, each key prefixed with `prefix`. */
  data(prefix = ''): WhData {
    const out: WhData = {}
    for (const [key, n] of [...this.sums, ...this.maxes]) {
      const value = round(n)
      if (value !== 0) out[prefix + key] = value
    }
    for (const [key, map] of this.tallies) out[prefix + key] = Object.fromEntries(map)
    return out
  }
}
