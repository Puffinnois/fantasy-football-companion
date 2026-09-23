import type { LineupBuild } from '@main/lineup/build'
import { rosterSize } from '@main/trade/evaluate'
import { UNSTARTABLE_SLOTS } from '@main/value/roster'
import type { PlayerSeries } from '@main/value/series'
import type { LeagueSettings } from '@shared/rules'
import type { WaiverRelease } from '@shared/types'

/** Slice 6c spec §2.2: one way to make room, before it is scored. */
export interface ReleaseCandidate {
  release: WaiverRelease
  /** The player leaving the lineup pool; null for an open spot. */
  series: PlayerSeries | null
}

export type IrSettings = Pick<LeagueSettings, 'irSlots' | 'irStatuses'>

function onReserve(s: PlayerSeries): boolean {
  return s.rosterSlot !== null && UNSTARTABLE_SLOTS.has(s.rosterSlot)
}

/**
 * Spec §2.2: an open spot is the only option when there is room (a drop can never beat it);
 * otherwise a drop per active player, plus an IR move for each active player whose injury status
 * the league allows on IR while an IR slot is free.
 */
export function releaseCandidates(
  build: LineupBuild,
  roster: PlayerSeries[],
  ir: IrSettings
): ReleaseCandidate[] {
  const size = rosterSize(build)
  const active = roster.filter((s) => !onReserve(s))
  if (size === null || active.length < size || active.length === 0) {
    return [{ release: { kind: 'open' }, series: null }]
  }
  const irFree = (ir.irSlots ?? 0) > roster.filter((s) => s.rosterSlot === 'ir').length
  const eligible = new Set(ir.irStatuses ?? ['IR'])
  const out: ReleaseCandidate[] = []
  for (const s of active) {
    const id = s.base.playerId
    const status = s.base.injuryStatus
    if (irFree && status !== null && eligible.has(status)) {
      out.push({ release: { kind: 'ir', playerId: id }, series: s })
    }
    out.push({ release: { kind: 'drop', playerId: id }, series: s })
  }
  return out
}

/** The roster after the release: a drop removes the player, an IR move puts him in an unstartable slot. */
export function applyRelease(roster: PlayerSeries[], r: ReleaseCandidate): PlayerSeries[] {
  const leaving = r.series
  if (leaving === null) return roster
  if (r.release.kind === 'ir') {
    return roster.map((s) => (s === leaving ? { ...s, rosterSlot: 'ir' as const } : s))
  }
  return roster.filter((s) => s !== leaving)
}

const KIND_ORDER: Record<WaiverRelease['kind'], number> = { open: 0, ir: 1, drop: 2 }

/** Spec §2.3 step 4: the order among releases that cost the same. */
export function compareReleases(
  build: LineupBuild,
  a: ReleaseCandidate,
  b: ReleaseCandidate
): number {
  const kind = KIND_ORDER[a.release.kind] - KIND_ORDER[b.release.kind]
  if (kind !== 0 || a.series === null || b.series === null) return kind
  const ra = build.rowById.get(a.series.base.playerId)
  const rb = build.rowById.get(b.series.base.playerId)
  const rank = (r: typeof ra): number => r?.expert?.ecrRank ?? Number.MAX_SAFE_INTEGER
  return (
    (ra?.market?.value ?? 0) - (rb?.market?.value ?? 0) ||
    rank(rb) - rank(ra) ||
    (ra?.rosPoints ?? 0) - (rb?.rosPoints ?? 0) ||
    a.series.base.fullName.localeCompare(b.series.base.fullName)
  )
}
