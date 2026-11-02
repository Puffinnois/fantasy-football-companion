import { METRIC_ALIASES, phraseKey } from '@shared/stats/aliases'
import { CATALOGUE } from '@shared/stats/catalogue'
import { DIMENSIONS } from '@shared/stats/dimensions'
import type { Person } from '@shared/stats/types'
import { distance, lowerCase, type Word, words } from './text'

/**
 * Players by the names people use (Ask spec §4.1): the full name, a distinctive first name
 * ("Bijan"), a surname, a common short form ("CMC"), and a misspelt surname or full name one or two
 * letters off. Two players who share a name are told apart by a position or team in the question,
 * then by who has played lately; when that does not settle it, the question goes back to the user.
 */
const SHORT_FORMS: Record<string, string> = {
  cmc: 'christian mccaffrey',
  arsb: 'amon ra st brown',
  'amon ra': 'amon ra st brown',
  'st brown': 'amon ra st brown',
  jsn: 'jaxon smith njigba',
  mhj: 'marvin harrison',
  btj: 'brian thomas',
  ajb: 'a j brown',
  'aj brown': 'a j brown',
  dk: 'dk metcalf',
  jt: 'jonathan taylor',
  obj: 'odell beckham',
  hollywood: 'marquise brown',
  'tank dell': 'tank dell',
  kw3: 'kenneth walker',
  'ken walker': 'kenneth walker',
  'kyren williams': 'kyren williams',
  'tj hockenson': 't j hockenson',
  bijan: 'bijan robinson',
  saquon: 'saquon barkley',
  puka: 'puka nacua',
  ceedee: 'ceedee lamb',
  lamar: 'lamar jackson',
  mahomes: 'patrick mahomes'
}

/** Surnames that are everyday words: in a lower-case question they are not taken for players. */
const COMMON_WORDS = new Set([
  'love',
  'cook',
  'rice',
  'hill',
  'white',
  'brown',
  'green',
  'wood',
  'field',
  'price',
  'mack',
  'james',
  'will',
  'more',
  'moore',
  'young',
  'king',
  'long',
  'best',
  'hunt',
  'mason',
  'baker',
  'gay',
  'early',
  'little',
  'lock',
  'jones',
  'smith',
  'johnson',
  'williams',
  'davis',
  'allen',
  'carter',
  'thomas',
  'jackson',
  'harris',
  'wilson',
  'taylor',
  'walker',
  'lewis',
  'robinson',
  'chase',
  'pitts',
  'ward',
  'reed',
  'bell',
  'cole',
  'mills',
  'lane',
  'golden',
  'sweat',
  'pickens',
  'nix',
  'adams',
  'evans',
  'hall',
  'barnes',
  'ridley',
  'diggs'
])

/**
 * Words of the stats vocabulary (every metric's label, short name, aliases and description, every
 * dimension's synonyms): in a lower-case question they are read as football, not as a surname
 * ("goal line work" is not Zach Line, "carries" is not a near spelling of Carlies).
 */
const FOOTBALL_WORDS: ReadonlySet<string> = new Set(
  [
    ...CATALOGUE.flatMap((m) => [m.label, m.short, m.description, ...(METRIC_ALIASES[m.id] ?? [])]),
    ...DIMENSIONS.flatMap((d) => [d.label, ...d.synonyms])
  ].flatMap((text) => phraseKey(text).split(' '))
)

const everyday = (key: string): boolean => COMMON_WORDS.has(key) || FOOTBALL_WORDS.has(key)

/** Position words in a question: "the QB", "receivers". */
const POSITION_WORDS: [RegExp, string[]][] = [
  [/\b(qbs?|quarterbacks?)\b/, ['QB']],
  [/\b(rbs?|running ?backs?|backs?)\b/, ['RB']],
  [/\b(wrs?|wide ?receivers?|wideouts?)\b/, ['WR']],
  [/\b(tes?|tight ?ends?)\b/, ['TE']],
  [/\b(receivers?|pass catchers?)\b/, ['WR', 'TE', 'RB']],
  [/\b(kickers?)\b/, ['K']],
  [/\b(punters?)\b/, ['P']],
  [/\b(edges?|edge rushers?|pass rushers?|defensive ends?|tackles)\b/, ['DL', 'LB']],
  [/\b(linebackers?|lbs?)\b/, ['LB']],
  [/\b(cornerbacks?|cbs?|corners?|safet(y|ies)|dbs?)\b/, ['DB']]
]

export function positionsIn(question: string): string[] {
  // A position after "on the", "against" or "allowed to" is the object ("pressure on the quarterback").
  const t = ` ${phraseKey(question)} `.replace(/ (on the|against the|against|allowed to) \w+/g, ' ')
  return [...new Set(POSITION_WORDS.filter(([rx]) => rx.test(t)).flatMap(([, p]) => p))]
}

export interface PlayerMatch {
  /** The words as written. */
  mention: string
  /** One player when it is settled, several when the question must ask which. */
  people: Person[]
  /** How it matched: a full name, a short form, a first name, a surname or a near spelling. */
  how: 'name' | 'short' | 'first' | 'last' | 'fuzzy'
}

export interface FindHints {
  positions?: string[]
  teams?: string[]
  /** Words already taken (team names): never read as a player. */
  exclude?: string[]
}

export interface PlayerIndex {
  find(question: string, hints?: FindHints): PlayerMatch[]
  byId(id: string): Person | undefined
  size: number
}

const push = (map: Map<string, Person[]>, key: string, p: Person): void => {
  if (!key) return
  const list = map.get(key)
  if (list) list.push(p)
  else map.set(key, [p])
}

/** Who people mean among namesakes: played lately, then fantasy points, then games. */
function prominence(a: Person, b: Person): number {
  return (
    Number(b.recentGames > 0) - Number(a.recentGames > 0) ||
    b.recentPoints - a.recentPoints ||
    b.games - a.games
  )
}

/**
 * Narrows namesakes: a position or team the question names, then prominence. One left, or one that
 * clearly leads (played lately when the others did not, or twice the points of the next with at
 * least 20), settles it.
 */
function settle(people: Person[], hints: FindHints): Person[] {
  let pool = [...people].sort(prominence)
  if (hints.positions?.length) {
    const fit = pool.filter((p) => p.position && hints.positions!.includes(p.position))
    if (fit.length > 0) pool = fit
  }
  if (hints.teams?.length) {
    const fit = pool.filter((p) => p.team && hints.teams!.includes(p.team))
    if (fit.length > 0) pool = fit
  }
  if (pool.length <= 1) return pool
  const [first, second] = pool
  if (first.recentGames > 0 && second.recentGames === 0) return [first]
  if (first.recentPoints >= 20 && first.recentPoints >= 2 * second.recentPoints) return [first]
  return pool.slice(0, 3)
}

export function playerIndex(all: Person[]): PlayerIndex {
  const full = new Map<string, Person[]>()
  const last = new Map<string, Person[]>()
  const first = new Map<string, Person[]>()
  const ids = new Map<string, Person>()
  for (const p of all) {
    ids.set(p.id, p)
    // Suffixes are dropped, so "Marvin Harrison Jr." is "marvin harrison".
    const name = phraseKey(p.name).replace(/ (jr|sr|ii|iii|iv|v)$/, '')
    push(full, name, p)
    const lastName = phraseKey(p.lastName ?? '').replace(/ (jr|sr|ii|iii|iv|v)$/, '')
    push(last, lastName, p)
    push(first, phraseKey(p.firstName ?? ''), p)
  }
  // A first name names one player when one recent player has it ("bijan", "puka").
  const distinctFirst = new Map<string, Person>()
  for (const [key, people] of first) {
    const recent = people.filter((p) => p.recentGames > 0)
    if (recent.length === 1 && key.length >= 4) distinctFirst.set(key, recent[0])
  }

  // Recent players' full names, for a misspelt full name.
  const recentNames = [...full].filter(
    ([key, people]) => key.includes(' ') && people.some((p) => p.recentGames > 0)
  )

  function find(question: string, hints: FindHints = {}): PlayerMatch[] {
    const ws: Word[] = words(question)
    const lower = lowerCase(question)
    const used = new Set<number>()
    for (const phrase of hints.exclude ?? []) {
      const keys = words(phrase).map((w) => w.key)
      for (let i = 0; i + keys.length <= ws.length; i++) {
        if (keys.every((k, j) => ws[i + j].key === k)) keys.forEach((_, j) => used.add(i + j))
      }
    }
    const found: PlayerMatch[] = []
    const take = (i: number, n: number, people: Person[], how: PlayerMatch['how']): void => {
      const settled = settle(people, hints)
      if (settled.length === 0) return
      if (found.some((m) => m.people.length === 1 && m.people[0].id === settled[0].id)) return
      found.push({
        mention: ws
          .slice(i, i + n)
          .map((w) => w.raw)
          .join(' '),
        people: settled,
        how
      })
      for (let k = 0; k < n; k++) used.add(i + k)
    }
    const free = (i: number, n: number): boolean =>
      ![...Array(n).keys()].some((k) => used.has(i + k))
    // Full names and short forms, longest first.
    for (let n = 5; n >= 1; n--) {
      for (let i = 0; i + n <= ws.length; i++) {
        if (!free(i, n)) continue
        const key = ws
          .slice(i, i + n)
          .map((w) => w.key)
          .join(' ')
        const short = SHORT_FORMS[key]
        if (n >= 2 && full.has(key)) take(i, n, full.get(key)!, 'name')
        else if (short && full.has(short)) take(i, n, full.get(short)!, 'short')
      }
    }
    // A full name one or two letters off ("Christian McCaffery").
    for (let n = 3; n >= 2; n--) {
      for (let i = 0; i + n <= ws.length; i++) {
        if (!free(i, n)) continue
        const slice = ws.slice(i, i + n)
        if (!lower && !slice.every((w) => /^[A-Z]/.test(w.raw))) continue
        const key = slice.map((w) => w.key).join(' ')
        if (key.length < 9) continue
        const near = recentNames.filter(([name]) => distance(key, name, 2) <= 2)
        if (near.length > 0)
          take(
            i,
            n,
            near.flatMap(([, people]) => people),
            'fuzzy'
          )
      }
    }
    // A first name or a surname alone.
    for (let i = 0; i < ws.length; i++) {
      if (!free(i, 1)) continue
      const w = ws[i]
      if (w.key.length < 3) continue
      const capital = /^[A-Z]/.test(w.raw)
      if (distinctFirst.has(w.key) && (capital || lower)) {
        take(i, 1, [distinctFirst.get(w.key)!], 'first')
        continue
      }
      const byLast = last.get(w.key)
      if (byLast && (capital || (lower && !everyday(w.key)))) {
        // In mixed case, a capital at the start of the sentence is not a name by itself.
        if (!lower && i === 0 && !/^[A-Z][a-z]+[A-Z]/.test(w.raw) && byLast.length > 3) continue
        take(i, 1, byLast, 'last')
      }
    }
    // A surname one or two letters off ("McCaffery"), recent players only.
    for (let i = 0; i < ws.length; i++) {
      if (!free(i, 1)) continue
      const w = ws[i]
      if (w.key.length < 6 || !(/^[A-Z]/.test(w.raw) || lower)) continue
      if (lower && everyday(w.key)) continue
      const max = w.key.length >= 8 ? 2 : 1
      const near: Person[] = []
      for (const [key, people] of last) {
        if (key.length < 5 || COMMON_WORDS.has(key) || key === w.key) continue
        if (distance(w.key, key, max) <= max) near.push(...people.filter((p) => p.recentGames > 0))
      }
      if (near.length > 0) take(i, 1, near, 'fuzzy')
    }
    return found
  }

  return { find, byId: (id) => ids.get(id), size: all.length }
}
