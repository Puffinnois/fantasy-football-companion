import { phraseKey } from '@shared/stats/aliases'

/**
 * Words of a question as the resolver reads them (Ask spec §4.1): `key` is the phrase key (lower
 * case, no apostrophes or punctuation), `raw` the word as written, so a team code or a surname in
 * capitals can count where the same word in lower case would not ("NO", "Love").
 */
export interface Word {
  key: string
  raw: string
}

export function words(question: string): Word[] {
  return question
    .replace(/['’]s\b/g, '')
    .split(/[^A-Za-z0-9'’.-]+/)
    .map((raw) => raw.replace(/^[.'’-]+|[.'’-]+$/g, ''))
    .filter((raw) => raw.length > 0)
    .map((raw) => ({ raw, key: phraseKey(raw) }))
    .filter((w) => w.key.length > 0)
}

/** The question as one phrase key, padded with spaces so `has(' red zone ')` matches whole words. */
export function padded(question: string): string {
  return ` ${phraseKey(question)} `
}

/** Whether the phrase occurs as whole words. */
export function has(question: string, phrase: string): boolean {
  return padded(question).includes(` ${phraseKey(phrase)} `)
}

/** The question is written all in lower case (no capitals to lean on). */
export function lowerCase(question: string): boolean {
  return question === question.toLowerCase()
}

/** Damerau–Levenshtein distance up to `max`: higher means "more than max". */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
      rowMin = Math.min(rowMin, d[i][j])
    }
    if (rowMin > max) return max + 1
  }
  return d[a.length][b.length]
}
