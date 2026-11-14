import type { AskExample } from '@main/db/repos/askExamples'

/**
 * The example library (Ask spec §5.3, report D9; Plan AG1 amendment H): verified question → call
 * pairs, retrieved by the masked question ("who leads {position} in {metric} since week {n}"), the
 * top 3 shown to the compact prompt. Off by default; Plan AG2 measures whether it helps. An
 * evaluation run passes its own questions in `exclude`, so the set never grades its own answers.
 */
const words = (masked: string): Set<string> =>
  new Set(
    masked
      .toLowerCase()
      .split(/[^a-z{}]+/)
      .filter((w) => w.length > 1)
  )

/** Jaccard similarity of the masked questions' words. */
export function similarity(a: string, b: string): number {
  const x = words(a)
  const y = words(b)
  if (x.size === 0 || y.size === 0) return 0
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / (x.size + y.size - both)
}

/** Below this, an example says nothing about the question. */
const MIN_SIMILARITY = 0.3

export function similarExamples(
  masked: string,
  tool: string | null,
  library: AskExample[],
  opts: { k?: number; exclude?: ReadonlySet<string> } = {}
): AskExample[] {
  const exclude = opts.exclude ?? new Set<string>()
  return library
    .filter((e) => !exclude.has(e.question.trim().toLowerCase()) && (!tool || e.tool === tool))
    .map((e) => ({ e, score: similarity(masked, e.masked) }))
    .filter((x) => x.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score || b.e.verifiedAt.localeCompare(a.e.verifiedAt))
    .slice(0, opts.k ?? 3)
    .map((x) => x.e)
}

/** The examples as the compact prompt shows them. */
export function examplesText(examples: AskExample[]): string {
  if (examples.length === 0) return ''
  const lines = examples.map((e) => `- "${e.masked}" → ${e.tool} ${JSON.stringify(e.args)}`)
  return `Questions like this one were answered with:\n${lines.join('\n')}`
}
