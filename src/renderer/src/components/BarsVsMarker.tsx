import { barPath, barsLayout, type BarItem } from '@/lib/charts'

interface BarsVsMarkerProps {
  items: BarItem[]
  height?: number
  format?: (value: number) => string
}

const BAND = 24
const LABEL_HEIGHT = 14

/** Spec §6.2 item 2: one bar per week (actual points) with the projection as a tick; a native <title> per band is the hover layer. */
export function BarsVsMarker({
  items,
  height = 72,
  format = (v) => v.toFixed(1)
}: BarsVsMarkerProps): React.JSX.Element {
  const width = Math.max(1, items.length) * BAND
  const { bars } = barsLayout(items, width, height)
  const text = (v: number | null): string => (v === null ? '—' : format(v))
  return (
    <svg
      viewBox={`0 0 ${width} ${height + LABEL_HEIGHT}`}
      width={width}
      height={height + LABEL_HEIGHT}
      className="max-w-full"
      role="img"
      aria-label="Points per week, with the projection as a tick"
    >
      <line x1={0} x2={width} y1={height} y2={height} className="stroke-border" strokeWidth={1} />
      {bars.map((b) => (
        <g key={b.item.label}>
          <title>{`Week ${b.item.label}: ${text(b.item.value)} pts · projected ${text(b.item.marker)}`}</title>
          <rect x={b.x} y={0} width={b.width} height={height} fill="transparent" />
          {b.height > 0 && (
            <path d={barPath(b.x, b.y, b.width, b.height)} className="fill-primary/70" />
          )}
          {b.markerY !== null && (
            <line
              x1={b.x}
              x2={b.x + b.width}
              y1={b.markerY}
              y2={b.markerY}
              className="stroke-foreground"
              strokeWidth={2}
            />
          )}
          <text
            x={b.x + b.width / 2}
            y={height + LABEL_HEIGHT - 3}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
          >
            {b.item.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
