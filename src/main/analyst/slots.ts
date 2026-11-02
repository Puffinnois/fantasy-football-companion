import { padded } from './text'

/**
 * Slots the question's words name (Ask spec §4.1, §3.2 rule 3): situation filters, a grouping,
 * who is rostered, how many rows, and which end of a ranking. The compact profile shows a slot only
 * when it is detected here.
 */
export type Flag =
  | 'red_zone'
  | 'inside_10'
  | 'goal_line'
  | 'third_down'
  | 'fourth_down'
  | 'early_downs'
  | 'pressure'
  | 'blitz'
  | 'play_action'
  | 'man_coverage'
  | 'zone_coverage'
  | 'neutral'
  | 'two_minute'
  | 'home'
  | 'road'

export type Grouping =
  'week' | 'season' | 'opponent' | 'down' | 'quarter' | 'personnel' | 'coverage' | 'formation'

export interface Slots {
  flags: Flag[]
  groupings: Grouping[]
  rostered: 'mine' | 'free' | null
  limit: number | null
  /**
   * Which end of the scale the question asks for: `worst` ("worst", "bottom"), or the `low` or
   * `high` values ("lowest", "fewest"; "most", "highest"). Which of those is best depends on the
   * metric's direction: the compact profile turns it into an order (compact.ts).
   */
  end: 'worst' | 'low' | 'high' | null
  /** A team's unit, when the question names one ("Bills defense"). */
  side: 'offense' | 'defense' | null
}

const FLAGS: [RegExp, Flag][] = [
  [/ (red zone|redzone|inside the 20) /, 'red_zone'],
  [/ (inside the 10|inside the ten) /, 'inside_10'],
  [/ (goal line|inside the 5|inside the five) /, 'goal_line'],
  [/ (third down|3rd down|on third|third downs) /, 'third_down'],
  [/ (fourth down|4th down|fourth downs) /, 'fourth_down'],
  [/ (early down|early downs|first and second down) /, 'early_downs'],
  [/ (under pressure|pressured|when pressured|facing pressure) /, 'pressure'],
  [/ (blitz|blitzed|blitzes|the blitz) /, 'blitz'],
  [/ (play action|playaction) /, 'play_action'],
  [/ (man coverage|vs man|against man|man to man) /, 'man_coverage'],
  [/ (zone coverage|vs zone|against zone) /, 'zone_coverage'],
  [/ (neutral|neutral situations|neutral game script) /, 'neutral'],
  [/ (two minute|2 minute|end of half) /, 'two_minute'],
  [/ (at home|home games) /, 'home'],
  [/ (on the road|road games|away games|away from home) /, 'road']
]

const GROUPINGS: [RegExp, Grouping][] = [
  [/ (game log|gamelog|by week|week by week|weekly|each week|every game|game by game) /, 'week'],
  [/ (by season|each season|per season|year by year|season by season|each year) /, 'season'],
  [/ (by opponent|each opponent|against each team) /, 'opponent'],
  [/ (by down|each down|down by down) /, 'down'],
  [/ (by quarter|each quarter) /, 'quarter'],
  [/ (by personnel|split by personnel) /, 'personnel'],
  [/ (man vs zone|man versus zone|man and zone|by coverage|split by coverage) /, 'coverage'],
  [/ (by formation) /, 'formation']
]

/** A metric whose name carries the situation ("red-zone carries", "man coverage rate"): no filter. */
const NAMED_IN_METRIC: [RegExp, Flag][] = [
  [
    / red zone (carries|targets|touchdowns?|td|share|opportunit|efficiency|offense|defense)/,
    'red_zone'
  ],
  [/ (man coverage rate|play the most man|play man|in man coverage)/, 'man_coverage'],
  [/ (blitz rate|blitz the most|blitz most|blitz frequency|how often they blitz)/, 'blitz'],
  [/ (play action rate|play action usage)/, 'play_action'],
  [/ (third down conversion|third down defense|third down offense)/, 'third_down'],
  [
    / (pressure rate|pressures|pressure on the|generates pressure|pressure generated|pressure allowed|epa (under|when) pressure)/,
    'pressure'
  ],
  [/ (neutral pass rate|neutral pace|neutral proe|neutral situation proe)/, 'neutral']
]

function endOf(t: string): Slots['end'] {
  if (/ (worst|bottom) /.test(t)) return 'worst'
  // "At least 200 routes" is a threshold.
  const u = t.replace(/ at least /g, ' ')
  if (/ (lowest|least|fewest|smallest) /.test(u)) return 'low'
  if (/ (most|highest|largest|biggest) /.test(u)) return 'high'
  return null
}

export function detectSlots(question: string): Slots {
  const t = padded(question)
  const named = new Set(NAMED_IN_METRIC.filter(([rx]) => rx.test(t)).map(([, f]) => f))
  const flags = FLAGS.filter(([rx, f]) => rx.test(t) && !named.has(f)).map(([, f]) => f)
  const groupings = GROUPINGS.filter(([rx]) => rx.test(t)).map(([, g]) => g)
  // "man vs zone" is a split, not a filter.
  const split = groupings.includes('coverage')
  const rostered =
    / (free agents?|on waivers|waiver wire|available|unrostered|unowned|not rostered) /.test(t)
      ? 'free'
      : / (my team|my roster|my players|on my team|i have|mine) /.test(t)
        ? 'mine'
        : null
  // "The first 6 weeks" is time, not a row count.
  const top = t.match(/ (?:top|best|first|worst|bottom) (\d{1,2}) (?!weeks|games)/)
  return {
    flags: split ? flags.filter((f) => f !== 'man_coverage' && f !== 'zone_coverage') : flags,
    groupings,
    rostered,
    limit: top ? Number(top[1]) : null,
    end: endOf(t),
    side: / (defense|defenses|defensive|defence) /.test(t)
      ? 'defense'
      : / (offense|offenses|offensive|offence) /.test(t)
        ? 'offense'
        : null
  }
}
