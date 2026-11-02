import type { GroupBy, StatsQuery } from './types'

/**
 * The dimensions a question can filter or split by (Ask spec §4.2): every situation filter and
 * `groupBy` value of `StatsQuery`, and the scope filters people name in words (home, opponent,
 * recent games). Each says what it means, the words people use for it, its values, the grain it
 * needs and which seasons have it. The resolver matches the synonyms; the glossary and the brief
 * read the descriptions.
 */
export interface DimensionValue {
  /** The value `StatsQuery` takes. */
  id: string
  label: string
  synonyms: string[]
}

export interface DimensionDef {
  id: string
  label: string
  description: string
  synonyms: string[]
  /** Where it goes in a `StatsQuery`. */
  query:
    | { situation: keyof NonNullable<StatsQuery['situation']> }
    | { groupBy: GroupBy }
    | { scope: keyof StatsQuery['scope'] }
  /** A fixed set of values, when it has one. */
  values?: DimensionValue[]
  /** `play`: only metrics computed from plays accept it. */
  grain: 'play' | 'week' | 'season'
  firstSeason: number
  /** `prior`: published through the prior season only (participation). */
  lastSeason?: 'prior'
  sources: string[]
}

const PBP = ['nflverse play-by-play']
const PART = ['NFL participation (nflverse)']
const FTN = ['FTN charting (nflverse)']
const SCHEDULE = ['nflverse schedules']

const PERSONNEL_VALUES: DimensionValue[] = [
  {
    id: '11',
    label: '11 personnel (1 RB, 1 TE)',
    synonyms: ['three wide', '3 wide', 'three receivers']
  },
  { id: '12', label: '12 personnel (1 RB, 2 TE)', synonyms: ['two tight ends', '2 te sets'] },
  { id: '13', label: '13 personnel (1 RB, 3 TE)', synonyms: ['three tight ends'] },
  { id: '21', label: '21 personnel (2 RB, 1 TE)', synonyms: ['two backs', 'fullback sets'] },
  { id: '22', label: '22 personnel (2 RB, 2 TE)', synonyms: ['heavy personnel'] },
  { id: '10', label: '10 personnel (1 RB, 0 TE)', synonyms: ['four wide', '4 wide'] },
  { id: '00', label: 'Empty (0 RB, 0 TE)', synonyms: ['five wide'] }
]

const COVERAGE_VALUES: DimensionValue[] = [
  { id: 'man', label: 'Man coverage', synonyms: ['man', 'man to man', 'vs man', 'against man'] },
  { id: 'zone', label: 'Zone coverage', synonyms: ['zone', 'vs zone', 'against zone'] }
]

const FORMATION_VALUES: DimensionValue[] = [
  { id: 'SHOTGUN', label: 'Shotgun', synonyms: ['shotgun', 'gun'] },
  { id: 'SINGLEBACK', label: 'Singleback', synonyms: ['singleback', 'single back'] },
  { id: 'EMPTY', label: 'Empty', synonyms: ['empty backfield', 'empty set'] },
  { id: 'I_FORM', label: 'I-formation', synonyms: ['i formation', 'i form'] },
  { id: 'PISTOL', label: 'Pistol', synonyms: ['pistol'] },
  { id: 'UNDER CENTER', label: 'Under center', synonyms: ['under center'] }
]

export const DIMENSIONS: DimensionDef[] = [
  {
    id: 'down',
    label: 'Down',
    description: 'The down of the play, 1 to 4.',
    synonyms: ['first down', 'second down', 'third down', 'fourth down', '3rd down', 'on third'],
    query: { situation: 'down' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'distance',
    label: 'Distance',
    description: 'Yards to go for a first down.',
    synonyms: ['yards to go', 'third and long', 'third and short', 'short yardage'],
    query: { situation: 'distance' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'quarter',
    label: 'Quarter',
    description: 'The quarter of the play; 5 is overtime.',
    synonyms: ['first quarter', 'fourth quarter', 'second half', 'overtime'],
    query: { situation: 'quarter' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'field_zone',
    label: 'Field zone',
    description:
      'Where the ball is: the red zone (inside the opponent’s 20), inside the 10, inside the 5 (goal line), or backed up inside the own 20.',
    synonyms: ['field position of the play'],
    query: { situation: 'fieldZone' },
    values: [
      { id: 'redzone', label: 'Red zone', synonyms: ['red zone', 'redzone', 'inside the 20'] },
      { id: 'inside10', label: 'Inside the 10', synonyms: ['inside the 10', 'inside the ten'] },
      {
        id: 'inside5',
        label: 'Inside the 5',
        synonyms: ['goal line', 'inside the 5', 'inside the five']
      },
      { id: 'own20', label: 'Backed up', synonyms: ['backed up', 'own 20', 'own territory'] }
    ],
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'score_margin',
    label: 'Score margin',
    description: 'The offense’s score minus the defense’s when the play starts.',
    synonyms: ['when leading', 'when trailing', 'tied games', 'blowouts'],
    query: { situation: 'scoreMargin' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'win_probability',
    label: 'Win probability',
    description: 'The offense’s win probability when the play starts (nflverse’s model), 0 to 1.',
    synonyms: ['garbage time', 'close games', 'win probability'],
    query: { situation: 'winProbability' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'neutral',
    label: 'Neutral situations',
    description:
      'Plays with a win probability of 20–80 % outside the last two minutes of a half: where play-calling reflects tendency, not the score.',
    synonyms: ['neutral', 'neutral situations', 'neutral game script'],
    query: { situation: 'neutral' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'two_minute',
    label: 'Two-minute drill',
    description: 'The last two minutes of either half (2nd and 4th quarters).',
    synonyms: ['two minute drill', 'two minute', 'end of half', 'hurry up situations'],
    query: { situation: 'twoMinute' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'pressure',
    label: 'Pressure',
    description:
      'The quarterback was pressured (hurried, hit or sacked) on the dropback, from participation data.',
    synonyms: ['under pressure', 'pressured', 'when pressured', 'facing pressure'],
    query: { situation: 'pressure' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'blitz',
    label: 'Blitz',
    description: 'The defense sent a blitz (more than the usual four rushers), from FTN charting.',
    synonyms: ['blitz', 'blitzed', 'against the blitz', 'vs the blitz'],
    query: { situation: 'blitz' },
    grain: 'play',
    firstSeason: 2022,
    sources: FTN
  },
  {
    id: 'play_action',
    label: 'Play-action',
    description: 'The pass had a play-action fake, from FTN charting.',
    synonyms: ['play action', 'play-action', 'off play action'],
    query: { situation: 'playAction' },
    grain: 'play',
    firstSeason: 2022,
    sources: FTN
  },
  {
    id: 'coverage',
    label: 'Coverage',
    description:
      'The defense’s coverage on the play: man or zone, or a shell (Cover 1, Cover 3 …), from participation data.',
    synonyms: ['coverage', 'man or zone'],
    query: { situation: 'coverage' },
    values: COVERAGE_VALUES,
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'formation',
    label: 'Formation',
    description: 'The offense’s formation (shotgun, singleback, empty …), from participation data.',
    synonyms: ['formation', 'offensive formation'],
    query: { situation: 'formation' },
    values: FORMATION_VALUES,
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'personnel',
    label: 'Personnel',
    description:
      'The offense’s personnel grouping: the first digit is running backs, the second tight ends ("11" = 1 RB, 1 TE, 3 WR), from participation data.',
    synonyms: ['personnel', 'personnel grouping'],
    query: { situation: 'personnel' },
    values: PERSONNEL_VALUES,
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'box',
    label: 'Defenders in the box',
    description: 'How many defenders were in the box at the snap, from participation data.',
    synonyms: ['stacked box', 'light box', 'defenders in the box', 'eight in the box'],
    query: { situation: 'box' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'air_yards',
    label: 'Depth of target',
    description: 'How far past the line of scrimmage the pass travelled in the air.',
    synonyms: ['deep passes', 'short passes', 'behind the line', 'intermediate'],
    query: { situation: 'airYards' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'with_on_field',
    label: 'With a player on the field',
    description: 'Only plays with all these players on the field, from participation data.',
    synonyms: ['with him on the field', 'when he plays', 'with'],
    query: { situation: 'withOnField' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'without_on_field',
    label: 'Without a player on the field',
    description:
      'Only plays without any of these players on the field (plays participation covers), from participation data.',
    synonyms: ['without him', 'when he sits', 'without', 'when he is out'],
    query: { situation: 'withoutOnField' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'home',
    label: 'Home or road',
    description: 'Home games or road games, as the schedule lists the home team.',
    synonyms: ['at home', 'on the road', 'home games', 'road games', 'away games'],
    query: { scope: 'home' },
    grain: 'week',
    firstSeason: 2019,
    sources: SCHEDULE
  },
  {
    id: 'opponent',
    label: 'Opponent',
    description: 'Games against these teams.',
    synonyms: ['against', 'versus', 'vs'],
    query: { scope: 'opponents' },
    grain: 'week',
    firstSeason: 2019,
    sources: SCHEDULE
  },
  {
    id: 'recent_games',
    label: 'Recent games',
    description: 'Each row’s last N games in the scope.',
    synonyms: ['last few games', 'recently', 'lately', 'last n games'],
    query: { scope: 'lastNGames' },
    grain: 'week',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_season',
    label: 'By season',
    description: 'One row per season.',
    synonyms: ['by season', 'each season', 'per season', 'year by year'],
    query: { groupBy: 'season' },
    grain: 'season',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_week',
    label: 'By week (game log)',
    description: 'One row per week: a game log.',
    synonyms: ['game log', 'by week', 'week by week', 'weekly', 'each week', 'every game'],
    query: { groupBy: 'week' },
    grain: 'week',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_team',
    label: 'By team',
    description: 'One row per team the player played for.',
    synonyms: ['by team', 'with each team'],
    query: { groupBy: 'team' },
    grain: 'week',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_opponent',
    label: 'By opponent',
    description: 'One row per opponent.',
    synonyms: ['by opponent', 'against each team', 'each opponent'],
    query: { groupBy: 'opponent' },
    grain: 'week',
    firstSeason: 2019,
    sources: SCHEDULE
  },
  {
    id: 'by_down',
    label: 'By down',
    description: 'One row per down.',
    synonyms: ['by down', 'each down', 'down by down'],
    query: { groupBy: 'down' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_quarter',
    label: 'By quarter',
    description: 'One row per quarter.',
    synonyms: ['by quarter', 'each quarter'],
    query: { groupBy: 'quarter' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_personnel',
    label: 'By personnel',
    description: 'One row per personnel grouping.',
    synonyms: ['by personnel', 'split by personnel'],
    query: { groupBy: 'personnel' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'by_coverage',
    label: 'By coverage',
    description: 'One row for man and one for zone.',
    synonyms: ['man vs zone', 'man versus zone', 'by coverage', 'split by coverage'],
    query: { groupBy: 'coverage' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'by_formation',
    label: 'By formation',
    description: 'One row per formation.',
    synonyms: ['by formation', 'split by formation'],
    query: { groupBy: 'formation' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  }
]

export const DIMENSION_BY_ID: ReadonlyMap<string, DimensionDef> = new Map(
  DIMENSIONS.map((d) => [d.id, d])
)
