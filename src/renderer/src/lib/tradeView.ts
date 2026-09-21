import { fmtPoints, fmtSigned } from '@/lib/format'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { TradeEvaluation, TradePlayer, TradeSideResult } from '@shared/types'

export const DEADLINE_NOTE =
  'The trade deadline has passed — Sleeper no longer accepts trades; evaluation still works.'
export const NO_VERDICT_HINT = 'Pick a partner, add players to both sides and evaluate.'

/** "weeks 3–17 · 15 weeks" */
export function windowLabel(p: { currentWeek: number; lastWeek: number; weeks: number }): string {
  return p.weeks === 1
    ? `week ${p.currentWeek} · 1 week`
    : `weeks ${p.currentWeek}–${p.lastWeek} · ${p.weeks} weeks`
}

/** FantasyCalc values with a thin space per thousand: "10 512". */
export function fmtMarket(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Spec §5.1: "gives 4 200 → gets 3 900 (93 %) · 1 unvalued" */
export function marketLine(s: TradeSideResult): string {
  const ratio =
    s.marketGive === 0
      ? s.marketGet === 0
        ? '—'
        : '∞'
      : `${Math.round((s.marketGet / s.marketGive) * 100)} %`
  const unvalued = s.unvaluedGive + s.unvaluedGet
  const base = `gives ${fmtMarket(s.marketGive)} → gets ${fmtMarket(s.marketGet)} (${ratio})`
  return unvalued > 0 ? `${base} · ${unvalued} unvalued` : base
}

/** "+18.40 (+1.31/wk)" */
export function deltaLine(s: TradeSideResult): string {
  return `${fmtSigned(s.delta)} (${fmtSigned(s.deltaPerWeek)}/wk)`
}

export function deltaTone(delta: number): 'green' | 'red' | 'muted' {
  return delta > 0 ? 'green' : delta < 0 ? 'red' : 'muted'
}

/** "66.00 → 47.00 · this week -4.00 · 2 weeks change" */
export function rangeLine(s: TradeSideResult): string {
  const weeks = s.weeksChanged === 1 ? '1 week changes' : `${s.weeksChanged} weeks change`
  return `${fmtPoints(s.before)} → ${fmtPoints(s.after)} · this week ${fmtSigned(s.thisWeekDelta)} · ${weeks}`
}

export function dropLine(s: TradeSideResult): string | null {
  return s.drops.length === 0 ? null : `drop: ${s.drops.map((p) => p.fullName).join(', ')}`
}

export function startsLabel(p: TradePlayer, weeks: number): string {
  return `starts ${p.starterWeeks}/${weeks}`
}

const ros = (p: TradePlayer): string => (p.rosPoints === null ? '—' : p.rosPoints.toFixed(1))

/** "ROS 118.4 · ECR 1 · MKT 9 340 · starts 15/15" */
export function playerStats(p: TradePlayer, weeks: number): string {
  const ecr = p.expert ? String(p.expert.ecrPosRank) : '—'
  const mkt = p.market ? fmtMarket(p.market.value) : '—'
  return `ROS ${ros(p)} · ECR ${ecr} · MKT ${mkt} · ${startsLabel(p, weeks)}`
}

/** Picker option text: "Justin Jefferson · MIN · ROS 128.0" (IR / TAXI tag when reserved). */
export function playerOption(p: TradePlayer): string {
  const parts = [p.fullName, p.team ?? '—']
  if (p.reserve) parts.push(p.reserve.toUpperCase())
  parts.push(`ROS ${ros(p)}`)
  return parts.join(' · ')
}

/** Lineup positions in order, then anything else under "—"; players keep their pool order. */
export function groupByPosition(players: TradePlayer[]): [string, TradePlayer[]][] {
  const groups = new Map<string, TradePlayer[]>()
  for (const p of players) {
    const key = p.position !== null && LINEUP_POSITIONS.includes(p.position) ? p.position : '—'
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  const order = [...LINEUP_POSITIONS, '—']
  return order.flatMap((pos) => {
    const list = groups.get(pos)
    return list ? [[pos, list] as [string, TradePlayer[]]] : []
  })
}

export function verdictBadges(ev: TradeEvaluation): { label: string; on: boolean }[] {
  return [
    { label: 'Win-win', on: ev.winWin },
    { label: 'Market-fair', on: ev.marketFair }
  ]
}
