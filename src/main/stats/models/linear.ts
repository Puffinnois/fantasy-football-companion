/** Small dense linear algebra for the models (spec §8: they run on thousands of rows, not millions). */

/**
 * Solves `A x = b` for a symmetric positive-definite `A` (normal equations) by Gaussian elimination
 * with partial pivoting. `A` is n × n, row-major; neither input is changed.
 */
export function solve(a: Float64Array, b: Float64Array, n: number): Float64Array {
  const m = Float64Array.from(a)
  const x = Float64Array.from(b)
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r * n + col]) > Math.abs(m[pivot * n + col])) pivot = r
    }
    if (Math.abs(m[pivot * n + col]) < 1e-12) throw new Error('singular system')
    if (pivot !== col) {
      for (let c = 0; c < n; c++) {
        const t = m[col * n + c]
        m[col * n + c] = m[pivot * n + c]
        m[pivot * n + c] = t
      }
      const t = x[col]
      x[col] = x[pivot]
      x[pivot] = t
    }
    const d = m[col * n + col]
    for (let r = col + 1; r < n; r++) {
      const f = m[r * n + col] / d
      if (f === 0) continue
      for (let c = col; c < n; c++) m[r * n + c] -= f * m[col * n + c]
      x[r] -= f * x[col]
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r]
    for (let c = r + 1; c < n; c++) s -= m[r * n + c] * x[c]
    x[r] = s / m[r * n + r]
  }
  return x
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z))

/**
 * Logistic regression by iteratively reweighted least squares, with a small ridge on every
 * coefficient but the first (the intercept) so that a rare feature cannot diverge. `weights` count
 * each row that many times (default 1).
 */
export function logisticFit(
  x: number[][],
  y: number[],
  {
    ridge = 1e-3,
    iterations = 50,
    weights
  }: { ridge?: number; iterations?: number; weights?: number[] } = {}
): number[] {
  const p = x[0]?.length ?? 0
  let beta = new Float64Array(p)
  for (let it = 0; it < iterations; it++) {
    const h = new Float64Array(p * p)
    const g = new Float64Array(p)
    for (let i = 0; i < x.length; i++) {
      const row = x[i]
      let z = 0
      for (let j = 0; j < p; j++) z += row[j] * beta[j]
      const mu = sigmoid(z)
      const wi = weights?.[i] ?? 1
      const w = wi * Math.max(mu * (1 - mu), 1e-9)
      const r = wi * (y[i] - mu)
      for (let j = 0; j < p; j++) {
        g[j] += row[j] * r
        for (let k = j; k < p; k++) h[j * p + k] += w * row[j] * row[k]
      }
    }
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < j; k++) h[j * p + k] = h[k * p + j]
      if (j > 0) {
        h[j * p + j] += ridge
        g[j] -= ridge * beta[j]
      }
    }
    const step = solve(h, g, p)
    const next = beta.map((b, j) => b + step[j])
    const moved = Math.max(...step.map(Math.abs))
    beta = next
    if (moved < 1e-8) break
  }
  return [...beta]
}

/** `sigmoid(x · beta)`. */
export function logisticPredict(row: number[], beta: number[]): number {
  let z = 0
  for (let j = 0; j < beta.length; j++) z += row[j] * beta[j]
  return sigmoid(z)
}

/** Pearson correlation; NaN under three pairs or without spread. */
export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 3) return NaN
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : NaN
}

/** Mulberry32: a small seeded generator, so a simulation repeats exactly. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
