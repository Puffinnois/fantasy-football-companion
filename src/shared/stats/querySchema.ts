import { SCORINGS } from './scoring'
import { POSITION_GROUPS, type GroupBy, type StatsQuery, type Transform } from './types'

/**
 * The JSON Schema of `StatsQuery` (stats-analysis spec §7.1, §10): the tool definition the
 * natural-language feature will hand an LLM, with the catalogue's ids as the metric enum. Every
 * `properties` object is typed `Record<keyof …, Schema>`, so the compiler fails when the type gains
 * or loses a field the schema does not.
 */
const GROUP_BY: Record<GroupBy, true> = {
  season: true,
  week: true,
  team: true,
  opponent: true,
  down: true,
  quarter: true,
  personnel: true,
  coverage: true,
  formation: true
}
const TRANSFORMS: Record<Transform, true> = {
  raw: true,
  perGame: true,
  percentile: true,
  zScore: true,
  vsLeague: true,
  shrunk: true,
  opponentAdjusted: true
}

type Schema = Record<string, unknown>

const range = (description: string): Schema => ({
  type: 'array',
  items: { type: 'number' },
  minItems: 2,
  maxItems: 2,
  description
})
const list = (items: Schema, description: string): Schema => ({
  type: 'array',
  items,
  minItems: 1,
  description
})
const team = { type: 'string', pattern: '^[A-Z]{2,3}$' }
const gsis = { type: 'string', pattern: '^00-[0-9]{7}$' }

export function statsQuerySchema(metricIds: string[]): Schema {
  const scope: Record<keyof StatsQuery['scope'], Schema> = {
    seasons: list({ type: 'integer', minimum: 2019 }, 'Seasons, 2019 to the current one.'),
    seasonType: { enum: ['REG', 'POST', 'ALL'], description: 'Default REG.' },
    weeks: range('First and last week, inclusive.'),
    lastNGames: { type: 'integer', minimum: 1, description: 'Each row’s last N games in scope.' },
    positions: list({ enum: [...POSITION_GROUPS] }, 'Position groups (players).'),
    teams: list(team, 'Team codes (nflverse: LA, LV, WAS, …).'),
    opponents: list(team, 'Opponent team codes.'),
    home: {
      type: 'boolean',
      description: 'Home games (true) or road games (false), as the schedule lists the home team.'
    },
    players: list(gsis, 'gsis player ids.'),
    qualifiedOnly: { type: 'boolean', description: 'Only rows over the metric’s minimum sample.' }
  }
  const situation: Record<keyof NonNullable<StatsQuery['situation']>, Schema> = {
    down: list({ type: 'integer', minimum: 1, maximum: 4 }, 'Downs.'),
    distance: range('Yards to go.'),
    quarter: list({ type: 'integer', minimum: 1, maximum: 5 }, 'Quarters; 5 is overtime.'),
    fieldZone: { enum: ['redzone', 'inside10', 'inside5', 'own20'] },
    scoreMargin: range('Offense score minus defense score.'),
    winProbability: range('Offense win probability, 0–1.'),
    neutral: {
      type: 'boolean',
      description: 'Win probability 20–80 %, not the last two minutes of a half.'
    },
    twoMinute: {
      type: 'boolean',
      description: 'The last two minutes of either half (2nd and 4th quarters).'
    },
    pressure: {
      type: 'boolean',
      description: 'QB pressured (participation, through the prior season).'
    },
    blitz: { type: 'boolean', description: 'Defense blitzed (FTN, 2022+).' },
    playAction: { type: 'boolean', description: 'Play-action (FTN, 2022+).' },
    coverage: {
      anyOf: [
        { enum: ['man', 'zone'] },
        list({ type: 'string' }, 'Coverage types: COVER_1, COVER_3, …')
      ]
    },
    formation: list({ type: 'string' }, 'Offensive formations: SHOTGUN, SINGLEBACK, EMPTY, …'),
    personnel: list(
      { type: 'string', pattern: '^[0-9]{2}$' },
      'Personnel codes: "11" = 1 RB, 1 TE.'
    ),
    box: range('Defenders in the box.'),
    airYards: range('Air yards of the pass.'),
    withOnField: list(gsis, 'Only plays with all these players on the field.'),
    withoutOnField: list(gsis, 'Only plays without any of these players on the field.')
  }
  const query: Record<keyof StatsQuery, Schema> = {
    entity: { enum: ['player', 'team'] },
    metrics: { ...list({ enum: metricIds }, 'Catalogue metric ids.'), maxItems: 40 },
    scope: {
      type: 'object',
      properties: scope,
      required: ['seasons'],
      additionalProperties: false
    },
    situation: {
      type: 'object',
      properties: situation,
      additionalProperties: false,
      description: 'Play-level filters; only metrics computed from plays accept them.'
    },
    groupBy: list({ enum: Object.keys(GROUP_BY) }, 'Split rows by these.'),
    transform: {
      enum: Object.keys(TRANSFORMS),
      description:
        'raw values; perGame (counts per game); percentile; zScore or vsLeague (against the qualified rows); shrunk (rates pulled toward the league mean by their sample); opponentAdjusted (minus how much more than average the opponents faced allow).'
    },
    sort: {
      type: 'object',
      properties: { metric: { enum: metricIds }, dir: { enum: ['asc', 'desc'] } },
      required: ['metric', 'dir'],
      additionalProperties: false
    },
    limit: { type: 'integer', minimum: 1, maximum: 1000 },
    scoring: {
      enum: [...SCORINGS],
      description: 'Fantasy scoring; league needs an imported league.'
    }
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'StatsQuery',
    type: 'object',
    properties: query,
    required: ['entity', 'metrics', 'scope'],
    additionalProperties: false
  }
}
