import { sparklinePoints } from '@/lib/charts'

interface SparklineProps {
  values: (number | null)[]
  width?: number
  height?: number
}

/** 2px line over the games in order, last point marked with a surface ring; nulls leave a gap. Decorative — the numbers sit beside it. */
export function Sparkline({ values, width = 96, height = 28 }: SparklineProps): React.JSX.Element {
  const segments = sparklinePoints(values, width, height)
  const lastSegment = segments[segments.length - 1]
  const last = lastSegment ? lastSegment[lastSegment.length - 1] : undefined
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {last && (
        <circle
          cx={last.x}
          cy={last.y}
          r={4}
          className="fill-foreground stroke-background"
          strokeWidth={2}
        />
      )}
    </svg>
  )
}
