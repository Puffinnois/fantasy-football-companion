import { useState } from 'react'
import type { ChartColumn } from '@/lib/playerFileView'

const W = 504
const T = 30
const PH = 124
const AX = 40
const H = T + PH + AX
const B = T + PH
const COND = "'Barlow Condensed', sans-serif"

/** A column with a rounded top (radius r), bottom on the baseline; '' when too short to draw. */
function columnPath(x: number, top: number, w: number, r: number): string {
  const hh = B - top
  if (hh <= 0.5) return ''
  const rr = Math.min(r, hh, w / 2)
  return `M${x} ${B}V${top + rr}Q${x} ${top} ${x + rr} ${top}H${x + w - rr}Q${x + w} ${top} ${x + w} ${top + rr}V${B}Z`
}

const one = (n: number): string => n.toFixed(1)
const signedOne = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`

/**
 * "The season so far" (README "Player file"): projection ghost bars, actual bars green when they
 * beat it, dashed amber upcoming weeks, a dotted season-average line and a hover popover.
 */
export function WeeklyChart({
  columns,
  average
}: {
  columns: ChartColumn[]
  average: number | null
}): React.JSX.Element {
  const [hi, setHi] = useState<number | null>(null)
  const n = columns.length
  if (n === 0) return <div className="py-10 text-center text-fg-3">No games yet</div>

  const mx =
    Math.max(1, average ?? 0, ...columns.map((c) => Math.max(c.points ?? 0, c.projected ?? 0))) *
    1.04
  const band = W / n
  const bw = Math.min(30, band * 0.58)
  const y = (v: number): number => B - (v / mx) * PH
  const firstUp = columns.findIndex((c) => c.kind === 'upcoming')
  const hovered = hi === null ? null : columns[hi]

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block overflow-visible">
        {hi !== null && (
          <rect
            x={hi * band + 3}
            y={2}
            width={band - 6}
            height={H - 4}
            rx={8}
            fill="var(--hover)"
          />
        )}
        {columns.map((c, i) => {
          const cx = i * band + band / 2
          const x = cx - bw / 2
          const up = c.kind === 'upcoming'
          const dnp = c.kind === 'dnp'
          const projTop = c.projected !== null && !dnp ? y(c.projected) : B
          const ptsTop = c.points !== null ? y(c.points) : B
          const label =
            c.kind === 'played'
              ? one(c.points ?? 0)
              : up
                ? c.projected !== null
                  ? one(c.projected)
                  : '—'
                : 'DNP'
          return (
            <g key={c.week}>
              <g
                opacity={hi !== null && hi !== i ? 0.32 : 1}
                style={{ transition: 'opacity .15s ease' }}
              >
                {c.projected !== null && !dnp && (
                  <path
                    d={columnPath(x, projTop, bw, 7)}
                    fill={up ? 'var(--me)' : 'var(--panel-2)'}
                    stroke={up ? 'var(--brand)' : 'var(--line)'}
                    strokeWidth={up ? 1.5 : 1}
                    strokeDasharray={up ? '4 3' : undefined}
                  />
                )}
                {c.kind === 'played' && (
                  <path
                    d={columnPath(x, ptsTop, bw, 7)}
                    fill={c.beat ? 'var(--good)' : 'var(--fg-3)'}
                  />
                )}
                {c.beat && projTop - ptsTop > 5 && (
                  <line
                    x1={x + 5}
                    x2={x + bw - 5}
                    y1={projTop}
                    y2={projTop}
                    stroke="var(--paper)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                )}
                {dnp && (
                  <line
                    x1={x + 6}
                    x2={x + bw - 6}
                    y1={B - 1}
                    y2={B - 1}
                    stroke="var(--fg-3)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}
                <text
                  x={cx}
                  y={Math.min(ptsTop, projTop) - 8}
                  textAnchor="middle"
                  fill={up ? 'var(--brand-fg)' : dnp ? 'var(--fg-3)' : 'var(--fg)'}
                  style={{ font: `800 15px ${COND}` }}
                >
                  {label}
                </text>
              </g>
              <text
                x={cx}
                y={B + 17}
                textAnchor="middle"
                fill={up ? 'var(--brand-fg)' : 'var(--fg-2)'}
                style={{ font: `700 12px ${COND}`, letterSpacing: '.06em' }}
              >
                W{c.week}
              </text>
              <text
                x={cx}
                y={B + 31}
                textAnchor="middle"
                fill="var(--fg-3)"
                style={{ font: "500 10px 'Geist Mono Variable', monospace" }}
              >
                {c.opponent ?? 'BYE'}
              </text>
            </g>
          )
        })}
        <line x1={0} x2={W} y1={B + 0.5} y2={B + 0.5} stroke="var(--line)" strokeWidth={1} />
        {average !== null && average > 0 && (
          <line
            x1={4}
            x2={(firstUp > 0 ? firstUp * band : W) - 4}
            y1={y(average)}
            y2={y(average)}
            stroke="var(--ink)"
            strokeWidth={1.5}
            strokeDasharray="1 5"
            strokeLinecap="round"
            opacity={hi !== null ? 0.3 : 0.75}
          />
        )}
        {firstUp > 0 && (
          <>
            <line
              x1={firstUp * band}
              x2={firstUp * band}
              y1={4}
              y2={B}
              stroke="var(--brand)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={firstUp * band + 7}
              y={12}
              fill="var(--brand-fg)"
              style={{ font: `700 11px ${COND}`, letterSpacing: '.14em' }}
            >
              NEXT UP
            </text>
          </>
        )}
        {columns.map((c, i) => (
          <rect
            key={`hit${c.week}`}
            x={i * band}
            y={0}
            width={band}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHi(i)}
            onMouseLeave={() => setHi((p) => (p === i ? null : p))}
          />
        ))}
      </svg>
      {hovered && hi !== null && (
        <div
          className="pointer-events-none absolute top-[-6px] z-[2] flex -translate-x-1/2 -translate-y-full flex-col gap-[5px] rounded-[10px] bg-panel px-3 pt-[9px] pb-2.5 whitespace-nowrap shadow-[0_0_0_1px_var(--line),0_10px_28px_rgba(0,0,0,.18)]"
          style={{ left: `${(Math.min(Math.max((hi + 0.5) * band, 78), W - 78) / W) * 100}%` }}
        >
          <span className="font-cond text-[12px] leading-none font-bold tracking-[0.1em] text-fg-3 uppercase">
            Week {hovered.week} · {hovered.opponent ? `vs ${hovered.opponent}` : 'Bye'}
          </span>
          <span
            className={
              hovered.kind === 'upcoming'
                ? 'font-cond text-[24px] leading-none font-extrabold text-brand-fg'
                : 'font-cond text-[24px] leading-none font-extrabold'
            }
          >
            {hovered.kind === 'played'
              ? `${(hovered.points ?? 0).toFixed(2)} pts`
              : hovered.kind === 'upcoming'
                ? hovered.projected !== null
                  ? `${one(hovered.projected)} projected`
                  : 'No projection yet'
                : 'Did not play'}
          </span>
          {hovered.kind === 'played' && hovered.projected !== null && (
            <span className="flex gap-2 font-mono text-[11.5px] leading-none font-medium text-fg-2">
              <span>Proj {one(hovered.projected)}</span>
              <span
                className={
                  (hovered.points ?? 0) >= hovered.projected
                    ? 'font-semibold text-good'
                    : 'font-semibold text-bad'
                }
              >
                {signedOne((hovered.points ?? 0) - hovered.projected)}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
