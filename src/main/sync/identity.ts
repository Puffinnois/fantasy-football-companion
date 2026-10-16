import type { PlayerIdentitySource, PlayerIdRecord, Resolution } from '@main/db/repos/playerIds'
import type { NflverseIdentity } from '@main/db/repos/stats'
import { validGsis } from '@main/sources/nflverse'
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

/** Common first-name nicknames and the name they shorten; both sides of a match are canonicalised. */
const NICKNAMES: Record<string, string> = {
  matt: 'matthew',
  mike: 'michael',
  chris: 'christopher',
  nick: 'nicholas',
  josh: 'joshua',
  will: 'william',
  bill: 'william',
  rob: 'robert',
  bob: 'robert',
  tom: 'thomas',
  dan: 'daniel',
  danny: 'daniel',
  jim: 'james',
  jimmy: 'james',
  joe: 'joseph',
  tony: 'anthony',
  alex: 'alexander',
  sam: 'samuel',
  ben: 'benjamin',
  jon: 'jonathan',
  zach: 'zachary',
  zack: 'zachary',
  jake: 'jacob',
  nate: 'nathan',
  greg: 'gregory',
  jeff: 'jeffrey',
  steve: 'steven',
  andy: 'andrew',
  pat: 'patrick',
  ken: 'kenneth',
  tim: 'timothy',
  dave: 'david',
  ed: 'edward',
  rick: 'richard',
  dick: 'richard'
}

/** `normalizeName` with a nickname first name spelled out: "Matt Hibner" -> "matthew hibner". */
export function canonicalName(name: string): string {
  const words = normalizeName(name).split(' ')
  if (words.length > 1) words[0] = NICKNAMES[words[0]] ?? words[0]
  return words.join(' ')
}

/**
 * Sources disagree on line and defensive positions (Sleeper OL / DL / DB, nflverse G / DT / CB), so
 * they compare by group.
 */
const POSITION_GROUPS: Record<string, string> = {
  ...Object.fromEntries(['OL', 'G', 'OG', 'T', 'OT', 'C'].map((p) => [p, 'OL'])),
  ...Object.fromEntries(['DL', 'DE', 'DT', 'NT'].map((p) => [p, 'DL'])),
  ...Object.fromEntries(['LB', 'ILB', 'OLB', 'MLB'].map((p) => [p, 'LB'])),
  ...Object.fromEntries(['DB', 'CB', 'S', 'FS', 'SS', 'SAF'].map((p) => [p, 'DB']))
}

export function positionGroup(position: string): string {
  return POSITION_GROUPS[position] ?? position
}

/** The name-match key of the identity rule (coverage audit fix 4: nicknames and line positions). */
export function nameKey(name: string, position: string): string {
  return `${canonicalName(name)}|${positionGroup(position)}`
}

export interface CrosswalkIndex {
  bySleeper: Map<string, CrosswalkRecord>
  byGsis: Map<string, CrosswalkRecord>
  bySportradar: Map<string, CrosswalkRecord>
  /** key = `nameKey(name, position)` */
  byName: Map<string, CrosswalkRecord>
  /** Same key, but from the nflverse stats file itself (rookies the crosswalk has not caught up with). */
  byNflverseName: Map<string, string>
}

/** First row wins per key, so duplicate crosswalk rows never flip a resolution between runs. */
export function indexCrosswalk(
  rows: CrosswalkRecord[],
  nflverse: NflverseIdentity[] = []
): CrosswalkIndex {
  const index: CrosswalkIndex = {
    bySleeper: new Map(),
    byGsis: new Map(),
    bySportradar: new Map(),
    byName: new Map(),
    byNflverseName: new Map()
  }
  for (const n of nflverse) {
    const key = n.position ? nameKey(n.name, n.position) : null
    if (key && !index.byNflverseName.has(key)) index.byNflverseName.set(key, n.gsisId)
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
 * crosswalk by sportradar_id → normalized name + position in the crosswalk → the same in the
 * nflverse stats file (plan C addition for rookies). Team defenses map to a team code.
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
  const sleeperGsis = validGsis(p.gsisId)
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
    const key = p.position ? nameKey(p.fullName, p.position) : null
    const byName = key ? index.byName.get(key) : undefined
    const byNflverse = key ? index.byNflverseName.get(key) : undefined
    if (bySr?.gsisId) {
      resolution = 'sportradar'
      gsisId = bySr.gsisId
      row = bySr
    } else if (byName?.gsisId) {
      resolution = 'name'
      gsisId = byName.gsisId
      row = byName
    } else if (byNflverse) {
      resolution = 'name'
      gsisId = byNflverse
      row = row?.pfrId ? row : index.byGsis.get(byNflverse)
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
  crosswalk: CrosswalkRecord[],
  nflverse: NflverseIdentity[]
): PlayerIdRecord[] {
  const index = indexCrosswalk(crosswalk, nflverse)
  return players.map((p) => resolvePlayer(p, index))
}
