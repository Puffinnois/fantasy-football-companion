import { padded } from './text'

/**
 * Time in words (Ask spec §4.1): "this season", "last year", "since week 5", "last 4 games",
 * "2022–24", "the playoffs". "Now" is the latest week with plays (`StatsStatus.through`). What it
 * resolved goes back to the model as a line ("'since week 5' = weeks 5–7 of 2026").
 */
export interface Now {
  /** The current season (the latest in the warehouse). */
  season: number
  /** The latest week with plays, and whether it is a postseason week. */
  week: number
  seasonType: 'REG' | 'POST'
}

export interface ResolvedTime {
  seasons?: number[]
  weeks?: [number, number]
  lastNGames?: number
  seasonType?: 'POST' | 'ALL'
  /** Lines for the context block. */
  said: string[]
  /** A season before 2019 or after the current one was asked for. */
  outOfRange?: number
}

const FIRST = 2019
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
}
const n = (s: string): number => NUMBER_WORDS[s] ?? Number(s)
const span = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i)
/** "22" → 2022, "2022" → 2022. */
const year = (s: string): number => (s.length === 2 ? 2000 + Number(s) : Number(s))

export function resolveTime(question: string, now: Now): ResolvedTime {
  const t = padded(question)
  const out: ResolvedTime = { said: [] }
  const latestWeek = now.seasonType === 'REG' ? now.week : 18
  const say = (phrase: string, meaning: string): void => {
    out.said.push(`'${phrase}' = ${meaning}`)
  }
  const num = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)'

  // Seasons. A range reaching before 2019 or past now is kept inside them, and says so; one wholly
  // outside is out of range.
  let m: RegExpMatchArray | null
  const range = (phrase: string, a: number, b: number): void => {
    const from = Math.max(a, FIRST)
    const to = Math.min(b, now.season)
    if (from > to) {
      out.outOfRange = a < FIRST ? a : b
      return
    }
    out.seasons = span(from, to)
    const cut =
      a < FIRST
        ? ' (the data starts in 2019)'
        : b > now.season
          ? ` (the data ends in ${now.season})`
          : ''
    say(phrase, `seasons ${from}–${to}${cut}`)
  }
  if (
    (m = t.match(/ (?:from )?((?:19|20)\d\d) (?:to|through|thru|until) ((?:19|20)\d\d|\d\d) /)) ||
    (m = t.match(/ (20\d\d) (\d\d) /))
  ) {
    const a = year(m[1])
    const b = year(m[2])
    if (b > a) range(m[0].trim(), a, b)
  }
  if (!out.seasons && !out.outOfRange && (m = t.match(/ since ((?:19|20)\d\d) /))) {
    range(m[0].trim(), Number(m[1]), now.season)
  }
  if (!out.seasons && (m = t.match(new RegExp(` (?:last|past) ${num} (?:seasons|years) `)))) {
    range(m[0].trim(), now.season - n(m[1]) + 1, now.season)
  }
  if (!out.seasons && / (career|all time|every season|since 2019) /.test(t)) {
    out.seasons = span(FIRST, now.season)
    say(
      t.match(/ (career|all time|every season|since 2019) /)![1],
      `seasons ${FIRST}–${now.season}`
    )
  }
  if (!out.seasons && / (last|previous|prior) (season|year) /.test(t)) {
    out.seasons = [now.season - 1]
    say(t.match(/ (last|previous|prior) (season|year) /)![0].trim(), `${now.season - 1}`)
  }
  if (!out.seasons) {
    // A number before yards or points is a number ("on pace for 2000 rushing yards").
    const years = [
      ...t.matchAll(
        / (19\d\d|20\d\d)(?= (?!(?:(?:rushing|receiving|passing|scrimmage|total|fantasy|all purpose) )?(?:yards|yds|yard|points|pts)\b))/g
      )
    ].map((x) => Number(x[1]))
    const inRange = years.filter((y) => y >= FIRST && y <= now.season)
    const outside = years.find((y) => y < FIRST || y > now.season)
    if (outside !== undefined) out.outOfRange = outside
    if (inRange.length > 0) {
      out.seasons = [...new Set(inRange)].sort()
      say(out.seasons.join(', '), out.seasons.length === 1 ? `${out.seasons[0]}` : 'those seasons')
    }
  }
  if (!out.seasons && / (this|current) (season|year) | so far /.test(t)) {
    out.seasons = [now.season]
    say(t.match(/ (this|current) (season|year) | so far /)![0].trim(), `${now.season}`)
  }
  // "Playoff odds" and "make the playoffs" are about the regular season's forecast.
  const post = t.match(/ (in the playoffs|playoff games?|postseason|post season|playoff run) /)
  if (post && !/ playoff (odds|chances|probability|picture|race) /.test(t)) {
    out.seasonType = 'POST'
    say(post[1], 'the postseason')
  }

  // Weeks and games, in the current season unless another one was named.
  const inSeason = out.seasons?.length === 1 ? out.seasons[0] : now.season
  const through = inSeason === now.season ? latestWeek : 18
  if ((m = t.match(new RegExp(` (?:last|past) ${num} (?:games|game) `)))) {
    out.lastNGames = n(m[1])
    say(m[0].trim(), `each player's last ${out.lastNGames} games`)
  } else if ((m = t.match(new RegExp(` (?:last|past) ${num} weeks `)))) {
    const k = n(m[1])
    out.weeks = [Math.max(1, through - k + 1), through]
    say(m[0].trim(), `weeks ${out.weeks[0]}–${out.weeks[1]} of ${inSeason}`)
  } else if ((m = t.match(/ (?:since|after|from) week (\d+) /))) {
    const from = Number(m[1])
    out.weeks = [from, Math.max(from, through)]
    say(m[0].trim(), `weeks ${out.weeks[0]}–${out.weeks[1]} of ${inSeason}`)
  } else if ((m = t.match(/ weeks? (\d{1,2}) (?:to|through|thru|and|) ?(\d{1,2}) /))) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (b >= a) {
      out.weeks = [a, b]
      say(m[0].trim(), `weeks ${a}–${b} of ${inSeason}`)
    }
  } else if ((m = t.match(/ week (\d{1,2}) /)) && Number(m[1]) >= 1 && Number(m[1]) <= 22) {
    const w = Number(m[1])
    out.weeks = [w, w]
    say(m[0].trim(), `week ${w} of ${inSeason}`)
  } else if (/ next week /.test(t)) {
    const w = Math.min(22, latestWeek + 1)
    out.weeks = [w, w]
    say('next week', `week ${w} of ${now.season}`)
  } else if (/ (lately|recently|of late) /.test(t)) {
    out.lastNGames = 4
    say(t.match(/ (lately|recently|of late) /)![1], "each player's last 4 games")
  } else if (/ (last|this) week /.test(t)) {
    out.weeks = [latestWeek, latestWeek]
    say(t.match(/ (last|this) week /)![0].trim(), `week ${latestWeek} of ${now.season}`)
  }
  if ((out.weeks || out.lastNGames) && !out.seasons) out.seasons = [now.season]
  return out
}
