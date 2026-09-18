export interface BarItem {
  label: string
  /** Bar height; null draws no bar (only the marker, if any). */
  value: number | null
  /** Tick on the same scale; null draws none. */
  marker: number | null
}

export interface BarLayout {
  item: BarItem
  x: number
  width: number
  y: number
  height: number
  markerY: number | null
}

/** Equal bands across `width`, a surface gap between bars, bars growing from the baseline at `height`. */
export function barsLayout(
  items: BarItem[],
  width: number,
  height: number,
  gap = 2
): { bars: BarLayout[]; max: number } {
  const max = Math.max(1, ...items.flatMap((i) => [i.value ?? 0, i.marker ?? 0]))
  const band = items.length > 0 ? width / items.length : 0
  const scale = (v: number): number => height - (v / max) * height
  return {
    max,
    bars: items.map((item, i) => {
      const h = item.value === null ? 0 : (item.value / max) * height
      return {
        item,
        x: i * band + gap / 2,
        width: Math.max(0, band - gap),
        y: height - h,
        height: h,
        markerY: item.marker === null ? null : scale(item.marker)
      }
    })
  }
}

/** Bar with rounded top corners and a square baseline; the radius shrinks so tiny bars stay well-formed. */
export function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  if (height <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  const bottom = y + height
  return `M${x},${bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${bottom} Z`
}

/** Polyline segments over `values` (a null breaks the line), min..max stretched into the padded box; a flat series sits mid-height. */
export function sparklinePoints(
  values: (number | null)[],
  width: number,
  height: number,
  pad = 4
): { x: number; y: number }[][] {
  const present = values.flatMap((v) => (v === null ? [] : [v]))
  if (present.length === 0) return []
  const min = Math.min(...present)
  const span = Math.max(...present) - min
  const step = values.length > 1 ? (width - 2 * pad) / (values.length - 1) : 0
  const inner = height - 2 * pad
  const segments: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    const ratio = span === 0 ? 0.5 : (v - min) / span
    current.push({ x: pad + i * step, y: pad + inner * (1 - ratio) })
  })
  if (current.length > 0) segments.push(current)
  return segments
}
