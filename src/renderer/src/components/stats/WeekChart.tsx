import { useState } from 'react'
import type { WeekSeries } from '@/lib/stats/team'

/** Series colours, in a fixed order (handoff --s1, --s2). */
const COLORS = ['var(--s1)', 'var(--s2)']

/** Round tick steps: 1, 2, 2.5, 5 × a power of ten. */
function ticks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1
  const raw = span / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step)
    out.push(Number(v.toFixed(6)))
  return out
}

/**
 * A weekly line chart (handoff Compare "Fantasy points by week"): one line per series, gaps for
 * byes, a zero line when the values cross it, a legend, end labels and a hover crosshair that
 * lists every series' value that week.
 */
export function WeekChart({
  series,
  format,
  domain,
  height = 200,
  label
}: {
  series: WeekSeries[]
  format: (v: number) => string
  /** A fixed y range (odds: [0, 1]); otherwise the values' own, padded. */
  domain?: [number, number]
  height?: number
  /** What the chart shows, for screen readers. */
  label: string
}): React.JSX.Element {
  const [hovered, setHover] = useState<number | null>(null)
  const weeks = series[0]?.points.map((p) => p.week) ?? []
  // The weeks can shrink under a resting mouse (another team's postseason): drop a stale index.
  const hover = hovered !== null && hovered < weeks.length ? hovered : null
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => v !== null)
  if (!weeks.length || !values.length) {
    return (
      <div className="flex items-center justify-center text-[13px] text-fg-3" style={{ height }}>
        No games in this range.
      </div>
    )
  }
  const W = 720
  const H = height
  const [L, R, T, B, PX] = [44, 72, 12, 26, 14]
  let [lo, hi] = domain ?? [Math.min(...values, 0), Math.max(...values, 0)]
  if (!domain) {
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.08
    lo -= pad
    hi += pad
  }
  const ys = ticks(lo, hi)
  lo = Math.min(lo, ys[0])
  hi = Math.max(hi, ys[ys.length - 1])
  const x = (i: number): number =>
    weeks.length === 1 ? (L + W - R) / 2 : L + PX + (i / (weeks.length - 1)) * (W - L - R - PX * 2)
  const y = (v: number): number => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B)

  // End labels: at each series' last value, nudged apart when they would overlap.
  const ends = series
    .map((s, k) => {
      const i = s.points.map((p) => p.value !== null).lastIndexOf(true)
      return i < 0 ? null : { k, i, y: y(s.points[i].value!), label: s.label }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.y - b.y)
  for (let j = 1; j < ends.length; j++)
    if (ends[j].y - ends[j - 1].y < 13) ends[j].y = ends[j - 1].y + 13

  const pick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / (box.width || 1)) * W
    let best = 0
    weeks.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    })
    setHover(best)
  }

  return (
    <figure className="m-0 flex flex-col gap-2">
      {series.length > 1 && (
        <figcaption className="flex gap-4 text-[12px] text-fg-2">
          {series.map((s, k) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="h-[3px] w-3.5 rounded-[2px]" style={{ background: COLORS[k] }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={label}
          className="block overflow-visible"
          onMouseMove={pick}
          onMouseLeave={() => setHover(null)}
        >
          {ys.map((v) => (
            <g key={v}>
              <line
                x1={L}
                x2={W - R}
                y1={y(v)}
                y2={y(v)}
                stroke={v === 0 ? 'var(--fg-3)' : 'var(--line-2)'}
                strokeWidth={1}
              />
              <text
                x={L - 8}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-fg-3 font-mono text-[10.5px]"
              >
                {format(v)}
              </text>
            </g>
          ))}
          {weeks.map((w, i) => (
            <text
              key={w}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-fg-3 font-mono text-[10.5px]"
            >
              {w}
            </text>
          ))}
          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={T}
              y2={H - B}
              stroke="var(--fg-3)"
              strokeDasharray="3 3"
            />
          )}
          {series.map((s, k) => {
            let d = ''
            let pen = false
            s.points.forEach((p, i) => {
              if (p.value === null) {
                pen = false
                return
              }
              d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`
              pen = true
            })
            return (
              <g key={s.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={COLORS[k]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.points.map((p, i) =>
                  p.value === null ? null : (
                    <circle
                      key={p.week}
                      cx={x(i)}
                      cy={y(p.value)}
                      r={hover === i ? 5 : 3.5}
                      fill={COLORS[k]}
                      stroke="var(--panel)"
                      strokeWidth={2}
                    />
                  )
                )}
              </g>
            )
          })}
          {ends.map((e) => {
            const y0 = Math.min(Math.max(e.y, T + 4), H - B)
            return (
              <g key={e.k} data-end={series[e.k].id}>
                <rect
                  x={x(e.i) + 8}
                  y={y0 - 1.5}
                  width={6}
                  height={3}
                  rx={1.5}
                  fill={COLORS[e.k]}
                />
                <text x={x(e.i) + 17} y={y0 + 4} className="fill-fg-2 text-[11px] font-medium">
                  {format(series[e.k].points[e.i].value!)}
                </text>
              </g>
            )
          })}
        </svg>
        {hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 flex-col gap-1 rounded-[8px] bg-panel px-2.5 py-2 text-[11.5px] shadow-[0_0_0_1px_var(--line),0_6px_18px_var(--shadow-c)]"
            style={{ left: `${(x(hover) / W) * 100}%` }}
          >
            <span className="font-semibold">Week {weeks[hover]}</span>
            {series.map((s, k) => (
              <span key={s.id} className="flex items-center gap-1.5 whitespace-nowrap text-fg-2">
                <span className="size-2 rounded-[2px]" style={{ background: COLORS[k] }} />
                {s.label}
                <span className="ml-auto pl-2 font-mono text-fg">
                  {s.points[hover].value === null ? 'No game' : format(s.points[hover].value!)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}
