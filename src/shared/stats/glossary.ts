import { DIMENSION_BY_ID } from './dimensions'

/**
 * The glossary (Ask spec §4.2): the terms an answer leans on, in one place. The analyst brief and
 * the `describe` tool read it; dev note N-007 (stat explanations in the app) can too. Dimension
 * terms take their text from `dimensions.ts`, so a definition is written once.
 */
export interface GlossaryEntry {
  term: string
  text: string
}

const fromDimension = (id: string, term: string): GlossaryEntry => {
  const d = DIMENSION_BY_ID.get(id)
  if (!d) throw new Error(`glossary: unknown dimension ${id}`)
  return { term, text: d.description }
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'EPA',
    text: 'Expected points added: how much a play changed the offense’s expected points, from nflverse’s model. Per play, per dropback or per carry.'
  },
  {
    term: 'Success rate',
    text: 'The share of plays with positive EPA.'
  },
  {
    term: 'CPOE',
    text: 'Completion percentage over expected: completions above what nflverse’s model expects for each throw’s depth, location and situation, in percentage points.'
  },
  {
    term: 'Route',
    text: 'A dropback the player was on the field for (blocking snaps count). In the current season, before participation is published, routes are estimated as team dropbacks × his offensive snap share.'
  },
  {
    term: 'est.',
    text: 'A value built on estimated routes (current season): treat it as approximate.'
  },
  {
    term: 'Qualified',
    text: 'A row with at least the metric’s minimum sample, scaled to the weeks in scope (150 routes over 17 games is about 45 over 5). Ranks and percentiles are among qualified rows of the same position.'
  },
  {
    term: 'Shrunk',
    text: 'A rate pulled toward the league mean by its sample: the smaller the sample, the closer to the mean. The pull is the sample at which half the rate is signal, measured from odd and even weeks.'
  },
  {
    term: 'Stability',
    text: 'How much a metric carries over: the correlation of a player’s qualified seasons one year to the next (high ≥ 0.6, medium ≥ 0.35, low below).'
  },
  fromDimension('pressure', 'Pressure'),
  fromDimension('neutral', 'Neutral situations'),
  fromDimension('field_zone', 'Red zone'),
  fromDimension('personnel', 'Personnel'),
  fromDimension('coverage', 'Coverage'),
  {
    term: 'Scoring',
    text: 'Fantasy metrics use PPR unless asked otherwise; half-PPR, standard and the imported league’s own scoring are available.'
  },
  {
    term: 'Seasons',
    text: '2019 to the current season, regular season unless the postseason is asked for. Participation (pressure, coverage, personnel, routes) is published through the prior season; FTN charting (blitz, play-action) starts in 2022; Next Gen Stats cover players over its weekly minimum.'
  }
]

/** The glossary as plain text, one term per line, for the analyst brief. */
export function glossaryText(): string {
  return GLOSSARY.map((g) => `- ${g.term}: ${g.text}`).join('\n')
}
