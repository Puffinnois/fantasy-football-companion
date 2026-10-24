import { useState } from 'react'
import { Marker, Swatch, type SeriesShape } from '@/components/stats/WeekChart'
import type { BandPoint, TrendPoint } from '@/lib/stats/trends'

const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)']
const SHAPES: SeriesShape[] = ['circle', 'square', 'diamond']

/** Round tick steps: 1, 2, 2.5, 5 × a power of ten. */
function ticks(lo: number, hi: number, n = 4): number[] {
  const raw = (hi - lo || 1) / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step)
    out.push(Number(v.toFixed(6)))
  return out
}

export interface SeasonSeries {
  id: string
  label: string
  points: TrendPoint[]
}

/**
 * Trends' chart (spec §9.5): a metric by season. The position's qualified median dashed over its
 * 25th–75th band, the entity's line (a season he did not qualify hollow) and up to two more;
 * under each season its team when it changed and his age. Lower-is-better metrics run upside down.
 */
export function SeasonChart({
  series,
  band,
  format,
  label,
  flip = false,
  marks,
  ages,
  hoverInfo
}: {
  series: SeasonSeries[]
  band: BandPoint[]
  format: (v: number) => string
  label: string
  flip?: boolean
  /** A team abbreviation under the seasons it changed. */
  marks: ReadonlyMap<number, string>
  ages: ReadonlyMap<number, number>
  /** The hover card's lines for a season of the main series. */
  hoverInfo: (season: number) => { title: string; lines: string[] } | null
}): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const seasons = band.map((b) => b.season)
  const values = [
    ...series.flatMap((s) => s.points.map((p) => p.value)),
    ...band.flatMap((b) => [b.p25, b.p75])
  ].filter((v): v is number => v !== null)
  if (!seasons.length || !values.length) {
    return <div className="py-16 text-center text-[13px] text-fg-3">No seasons to chart.</div>
  }
  const W = 892
  const H = 300
  const [L, R, T, B] = [52, 20, 18, 54]
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12
  lo -= pad
  hi += pad
  const ys = ticks(lo, hi)
  lo = Math.min(lo, ys[0])
  hi = Math.max(hi, ys[ys.length - 1])
  const step = (W - L - R) / seasons.length
  const x = (i: number): number => L + step * (i + 0.5)
  const y = (v: number): number => {
    const t = (v - lo) / (hi - lo || 1)
    return T + (flip ? t : 1 - t) * (H - T - B)
  }
  const line = (vs: (number | null)[]): string => {
    let d = ''
    let pen = false
    vs.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const full = band.every((b) => b.p25 !== null && b.p75 !== null)
  const area = full
    ? `${band.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b.p75!).toFixed(1)}`).join('')}${[
        ...band
      ]
        .map((b, i) => ({ b, i }))
        .reverse()
        .map(({ b, i }) => `L${x(i).toFixed(1)} ${y(b.p25!).toFixed(1)}`)
        .join('')}Z`
    : ''
  const info = hover !== null ? hoverInfo(seasons[hover]) : null
  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center gap-4 text-[11.5px] text-fg-3">
        {series.map((s, k) => (
          <span key={s.id} className="flex items-center gap-1.5 text-fg-2">
            <Swatch slot={k} />
            {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-[1.5px] border-dashed border-fg-3" />
          Median
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-[2px] bg-fg-3/15" />
          25th–75th
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full border-[1.5px] border-fg-3" />
          Not qualified
        </span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={label}
          className="block overflow-visible"
          onMouseLeave={() => setHover(null)}
        >
          {ys.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line-2)" strokeWidth={1} />
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
          {area && <path d={area} fill="var(--fg-3)" fillOpacity={0.12} data-band="" />}
          <path
            d={line(band.map((b) => b.median))}
            fill="none"
            stroke="var(--fg-3)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            data-median=""
          />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--line)" />
          )}
          {series.map((s, k) => (
            <g key={s.id} data-series={s.id}>
              <path
                d={line(s.points.map((p) => p.value))}
                fill="none"
                stroke={COLORS[k]}
                strokeWidth={k === 0 ? 2.5 : 2}
                strokeLinejoin="round"
              />
              {s.points.map((p, i) =>
                p.value === null ? null : k === 0 && !p.qualified ? (
                  <circle
                    key={p.season}
                    cx={x(i)}
                    cy={y(p.value)}
                    r={hover === i ? 6 : 4.5}
                    fill="var(--panel)"
                    stroke={COLORS[k]}
                    strokeWidth={2}
                    data-hollow=""
                  />
                ) : (
                  <Marker
                    key={p.season}
                    shape={SHAPES[k]}
                    cx={x(i)}
                    cy={y(p.value)}
                    r={hover === i && k === 0 ? 6 : 4}
                    fill={COLORS[k]}
                  />
                )
              )}
            </g>
          ))}
          {seasons.map((season, i) => (
            <g key={season}>
              <text
                x={x(i)}
                y={H - B + 18}
                textAnchor="middle"
                className="fill-fg-2 font-mono text-[11px]"
              >
                {season}
              </text>
              {ages.has(season) && (
                <text
                  x={x(i)}
                  y={H - B + 31}
                  textAnchor="middle"
                  className="fill-fg-3 text-[10.5px]"
                >
                  age {ages.get(season)}
                </text>
              )}
              {marks.has(season) && (
                <text
                  x={x(i)}
                  y={H - B + 45}
                  textAnchor="middle"
                  className="fill-fg font-mono text-[9.5px] font-semibold"
                  data-team-mark=""
                >
                  {marks.get(season)}
                </text>
              )}
              <rect
                x={x(i) - step / 2}
                y={T}
                width={step}
                height={H - T}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
        </svg>
        {info && hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 flex w-[210px] flex-col gap-1 rounded-[9px] bg-panel px-3 py-2.5 text-[11.5px] shadow-[0_0_0_1px_var(--line),0_10px_28px_var(--shadow-c)]"
            style={
              x(hover) > W * 0.62
                ? { right: `${(1 - (x(hover) - 18) / W) * 100}%` }
                : { left: `${((x(hover) + 18) / W) * 100}%` }
            }
          >
            <span className="font-semibold text-fg">{info.title}</span>
            {info.lines.map((l) => (
              <span key={l} className="text-fg-2">
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}
