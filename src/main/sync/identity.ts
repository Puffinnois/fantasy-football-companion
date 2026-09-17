import type { PlayerIdentitySource, PlayerIdRecord, Resolution } from '@main/db/repos/playerIds'
import type { CrosswalkRecord } from '@main/sources/nflverse-types'
import { toNflverseTeam } from '@shared/teams'

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/** Lowercase, letters/digits only, generational suffix dropped: "Odell Beckham Jr." -> "odell beckham". */
export function normalizeName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop()
  return words.join(' ')
}

export interface CrosswalkIndex {
  bySleeper: Map<string, CrosswalkRecord>
  byGsis: Map<string, CrosswalkRecord>
  bySportradar: Map<string, CrosswalkRecord>
  /** key = `${normalizeName(name)}|${position}` */
  byName: Map<string, CrosswalkRecord>
}

function nameKey(name: string, position: string): string {
  return `${normalizeName(name)}|${position}`
}

/** First row wins per key, so duplicate crosswalk rows never flip a resolution between runs. */
export function indexCrosswalk(rows: CrosswalkRecord[]): CrosswalkIndex {
  const index: CrosswalkIndex = {
    bySleeper: new Map(),
    byGsis: new Map(),
    bySportradar: new Map(),
    byName: new Map()
  }
  const put = (
    map: Map<string, CrosswalkRecord>,
    key: string | null,
    row: CrosswalkRecord
  ): void => {
    if (key && !map.has(key)) map.set(key, row)
  }
  for (const row of rows) {
    put(index.bySleeper, row.sleeperId, row)
    put(index.byGsis, row.gsisId, row)
    put(index.bySportradar, row.sportradarId, row)
    if (row.name && row.position) put(index.byName, nameKey(row.name, row.position), row)
  }
  return index
}

/**
 * Spec §6 order, first hit wins: crosswalk by sleeper_id → Sleeper's own gsis_id (trimmed) →
 * crosswalk by sportradar_id → normalized name + position. Team defenses map to a team code.
 * Whatever crosswalk row was matched also supplies pfr/espn ids for snap counts etc.
 */
export function resolvePlayer(p: PlayerIdentitySource, index: CrosswalkIndex): PlayerIdRecord {
  const base = {
    playerId: p.playerId,
    gsisId: null,
    pfrId: null,
    sportradarId: p.sportradarId,
    espnId: p.espnId,
    nflverseTeam: null
  }
  if (p.position === 'DEF') {
    return { ...base, nflverseTeam: toNflverseTeam(p.playerId), resolution: 'team' }
  }
  const sleeperGsis = p.gsisId?.trim() || null
  let row = index.bySleeper.get(p.playerId)
  let resolution: Resolution = 'unresolved'
  let gsisId: string | null = null
  if (row?.gsisId) {
    resolution = 'crosswalk'
    gsisId = row.gsisId
  } else if (sleeperGsis) {
    resolution = 'sleeper_gsis'
    gsisId = sleeperGsis
    row ??= index.byGsis.get(sleeperGsis)
  } else {
    const bySr = p.sportradarId ? index.bySportradar.get(p.sportradarId) : undefined
    const byName = p.position ? index.byName.get(nameKey(p.fullName, p.position)) : undefined
    if (bySr?.gsisId) {
      resolution = 'sportradar'
      gsisId = bySr.gsisId
      row = bySr
    } else if (byName?.gsisId) {
      resolution = 'name'
      gsisId = byName.gsisId
      row = byName
    } else {
      row = undefined
    }
  }
  return {
    ...base,
    gsisId,
    pfrId: row?.pfrId ?? null,
    sportradarId: row?.sportradarId ?? p.sportradarId,
    espnId: row?.espnId ?? p.espnId,
    resolution
  }
}

export function resolvePlayers(
  players: PlayerIdentitySource[],
  crosswalk: CrosswalkRecord[]
): PlayerIdRecord[] {
  const index = indexCrosswalk(crosswalk)
  return players.map((p) => resolvePlayer(p, index))
}
