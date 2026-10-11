/** One run at a time: calling while a run is in flight returns that run instead of starting another. */
export function singleFlight<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  let inFlight: Promise<T> | null = null
  return (...args) => {
    if (!inFlight) {
      inFlight = fn(...args).finally(() => {
        inFlight = null
      })
    }
    return inFlight
  }
}

/**
 * Returns `first` unchanged and, once it settles either way, starts `next` without anyone awaiting it
 * (stats-warehouse spec §4.1: the Refresh result does not wait for the warehouse). `next` failures go to
 * `onError`; they never reach `first`'s caller.
 */
export function thenInBackground<T>(
  first: Promise<T>,
  next: () => Promise<unknown>,
  onError: (err: unknown) => void
): Promise<T> {
  const start = (): void => {
    try {
      next().catch(onError)
    } catch (err) {
      onError(err)
    }
  }
  first.then(start, start)
  return first
}
