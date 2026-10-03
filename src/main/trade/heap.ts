/** A binary heap; `before(a, b)` means a leaves first. */
export interface Heap<T> {
  push(item: T): void
  pop(): T | undefined
  readonly size: number
}

export function heap<T>(before: (a: T, b: T) => boolean): Heap<T> {
  const items: T[] = []
  const swap = (i: number, j: number): void => {
    const t = items[i]
    items[i] = items[j]
    items[j] = t
  }
  return {
    push(item: T): void {
      items.push(item)
      let i = items.length - 1
      while (i > 0) {
        const parent = (i - 1) >> 1
        if (!before(items[i], items[parent])) break
        swap(i, parent)
        i = parent
      }
    },
    pop(): T | undefined {
      if (items.length === 0) return undefined
      const top = items[0]
      const last = items.pop() as T
      if (items.length > 0) {
        items[0] = last
        let i = 0
        for (;;) {
          const l = 2 * i + 1
          const r = l + 1
          let first = i
          if (l < items.length && before(items[l], items[first])) first = l
          if (r < items.length && before(items[r], items[first])) first = r
          if (first === i) break
          swap(i, first)
          i = first
        }
      }
      return top
    },
    get size(): number {
      return items.length
    }
  }
}
