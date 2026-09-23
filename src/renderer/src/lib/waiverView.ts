import { fmtSigned, relativeTime } from '@/lib/format'
import { fmtMarket } from '@/lib/tradeView'
import type { AddOption, StashRow, TradePlayer, WaiverAdds } from '@shared/types'

export const NO_LINEUP_ADDS = 'No free agent improves your lineup over the rest of the season.'
export const NO_STASH = 'No free agent carries a market, trending or expert signal.'
/** Slice 6c spec §3: the Stash table shows this many rows of the current sort. */
export const STASH_SHOWN = 30

export type StashSort = 'market' | 'trending' | 'rank'
export const STASH_SORTS: { key: StashSort; label: string }[] = [
  { key: 'market', label: 'Market' },
  { key: 'trending', label: 'Trending 24 h' },
  { key: 'rank', label: 'ROS rank' }
]

/** Spec §8: "Drop Kendre Miller", "Open spot", "IR: Caleb Williams". */
export function releaseLabel(o: AddOption): string {
  const name = o.releasePlayer?.fullName ?? ''
  switch (o.release.kind) {
    case 'open':
      return 'Open spot'
    case 'ir':
      return `IR: ${name}`
    case 'drop':
      return `Drop ${name}`
  }
}

/** A dropdown entry: the release and the whole move's window Δ. */
export function optionLabel(o: AddOption): string {
  return `${releaseLabel(o)} · ${fmtSigned(o.delta)}`
}

/** Spec §8: "wk 7, 9" up to three weeks, then "12 of 15 wks"; "—" when he never starts. */
export function startsText(weeks: number[], windowWeeks: number): string {
  if (weeks.length === 0) return '—'
  if (weeks.length <= 3) return `wk ${weeks.join(', ')}`
  return `${weeks.length} of ${windowWeeks} wks`
}

export function priorityLine(a: WaiverAdds): string | null {
  return a.waiverType === 'priority' && a.myWaiverPosition !== null
    ? `Waiver priority ${a.myWaiverPosition} of ${a.teamCount}`
    : null
}

/** FantasyPros ROS positional rank: "RB34". */
export function rosRankLabel(p: TradePlayer): string {
  return p.expert && p.position ? `${p.position}${p.expert.ecrPosRank}` : '—'
}

export function trendingText(count: number | null): string {
  return count === null ? '—' : `+${fmtMarket(count)}`
}

/** Spec §3: making room costs nothing. */
export function isFree(o: AddOption): boolean {
  return o.delta >= 0
}

export function trendingNote(fetchedAt: string | null, now: number = Date.now()): string {
  return fetchedAt === null
    ? 'Trending adds unavailable — refresh to fetch them'
    : `Trending adds fetched ${relativeTime(fetchedAt, now)}`
}

function signal(row: StashRow, by: StashSort): number | null {
  switch (by) {
    case 'market':
      return row.player.market?.value ?? null
    case 'trending':
      return row.trending
    case 'rank':
      return row.player.expert?.ecrRank ?? null
  }
}

/** Spec §3 / §8: market and trending high first, rank low first; players without the signal last. */
export function sortStash(rows: StashRow[], by: StashSort): StashRow[] {
  const dir = by === 'rank' ? 1 : -1
  return [...rows]
    .sort((a, b) => {
      const x = signal(a, by)
      const y = signal(b, by)
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1
      } else if (x !== y) {
        return (x - y) * dir
      }
      return a.player.fullName.localeCompare(b.player.fullName)
    })
    .slice(0, STASH_SHOWN)
}
