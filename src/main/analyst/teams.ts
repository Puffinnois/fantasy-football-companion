import { phraseKey } from '@shared/stats/aliases'
import { TEAM_NAMES } from '@shared/stats/nflTeams'
import { type Word, words } from './text'

/**
 * Teams by the names people use (Ask spec §4.1): the full name, the nickname, the city where it is
 * one team's, and common slang (none that is also an everyday or betting word: no "vegas", "pack"). Codes count only in capitals ("NO", "NE"), so "no" and "ne" in a
 * sentence are not teams.
 */
const SLANG: Record<string, string[]> = {
  ARI: ['cards', 'zona'],
  ATL: ['dirty birds'],
  CIN: ['cincy'],
  DAL: ['americas team'],
  GB: ['green bay', 'cheeseheads'],
  JAX: ['jags'],
  KC: ['kansas city', 'kc'],
  LA: ['la rams', 'lar'],
  LAC: ['bolts', 'la chargers'],
  LV: ['las vegas'],
  MIA: ['fins'],
  NE: ['pats', 'new england'],
  NO: ['new orleans', 'nola'],
  NYG: ['g men', 'gmen', 'big blue'],
  NYJ: ['gang green'],
  PHI: ['philly'],
  SF: ['niners', '9ers', 'san francisco', 'sf'],
  TB: ['bucs', 'tampa', 'tampa bay'],
  WAS: ['commies']
}

/** Cities two teams share are left out: "Los Angeles" and "New York" need the nickname. */
const SHARED_CITIES = new Set(['los angeles', 'new york'])

const ALIASES: Map<string, string> = (() => {
  const map = new Map<string, string>()
  for (const [code, name] of Object.entries(TEAM_NAMES)) {
    const parts = name.split(' ')
    const nickname = parts[parts.length - 1]
    const city = parts.slice(0, -1).join(' ')
    map.set(phraseKey(name), code)
    map.set(phraseKey(nickname), code)
    if (!SHARED_CITIES.has(phraseKey(city))) map.set(phraseKey(city), code)
  }
  for (const [code, slang] of Object.entries(SLANG)) {
    for (const s of slang) map.set(phraseKey(s), code)
  }
  // Two-word nicknames.
  map.set('49ers', 'SF')
  return map
})()

const CODES = new Set(Object.keys(TEAM_NAMES))
const OPPONENT_WORDS = new Set(['vs', 'versus', 'against', 'facing', 'v'])

export interface TeamMention {
  code: string
  /** The words as written. */
  mention: string
  /** `opponent` after "vs", "against", "facing". */
  role: 'subject' | 'opponent'
}

/**
 * Teams named in the question, longest phrase first, each once. A team after "vs", "against" or
 * "facing" is an opponent ("RB yards against the Ravens"), except in "Bills vs Chiefs", where both
 * teams are the subject of a comparison.
 */
export function findTeams(question: string): TeamMention[] {
  const ws: Word[] = words(question)
  const found: (TeamMention & { start: number; end: number; marker: string | null })[] = []
  const used = new Set<number>()
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= ws.length; i++) {
      if ([...Array(n).keys()].some((k) => used.has(i + k))) continue
      const slice = ws.slice(i, i + n)
      const key = slice.map((w) => w.key).join(' ')
      let code = ALIASES.get(key)
      if (!code && n === 1 && CODES.has(slice[0].raw)) code = slice[0].raw
      if (!code || found.some((t) => t.code === code)) continue
      // "against the Ravens": the word before "the" says it.
      const at = ws[i - 1]?.key === 'the' ? i - 2 : i - 1
      const marker = ws[at] && OPPONENT_WORDS.has(ws[at].key) ? ws[at].key : null
      found.push({
        code,
        mention: slice.map((w) => w.raw).join(' '),
        role: marker ? 'opponent' : 'subject',
        start: i,
        end: i + n - 1,
        marker: marker ? String(at) : null
      })
      for (let k = 0; k < n; k++) used.add(i + k)
    }
  }
  // "Bills vs Chiefs": a team right before "vs" makes the one after it a second subject.
  for (const t of found) {
    if (t.role !== 'opponent' || t.marker === null) continue
    const at = Number(t.marker)
    if (!['vs', 'versus', 'v'].includes(ws[at].key)) continue
    if (found.some((o) => o !== t && o.end === at - 1)) t.role = 'subject'
  }
  return found
    .sort((a, b) => a.start - b.start)
    .map(({ code, mention, role }) => ({ code, mention, role }))
}
