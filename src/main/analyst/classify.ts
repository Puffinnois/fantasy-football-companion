import { padded } from './text'

/**
 * The question type (Ask spec §4.1, report R7), from the resolver's output and a few words. It picks
 * the compact profile's tool, and declines advice and out-of-range questions before a model is
 * called. On the probe's 20 questions the rule picked the right tool every time; the models choosing
 * for themselves were wrong on a third to half of them.
 */
export type QuestionType =
  | 'advice'
  | 'out_of_range'
  | 'definition'
  | 'games'
  | 'league'
  | 'outlook'
  | 'compare'
  | 'player'
  | 'team'
  | 'leaderboard'

export type CompactTool =
  | 'leaderboard'
  | 'player_stats'
  | 'team_stats'
  | 'compare'
  | 'outlook'
  | 'games'
  | 'league'
  | 'describe'

export const TOOL_OF: Record<QuestionType, CompactTool | null> = {
  advice: null,
  out_of_range: null,
  definition: 'describe',
  games: 'games',
  league: 'league',
  outlook: 'outlook',
  compare: 'compare',
  player: 'player_stats',
  team: 'team_stats',
  leaderboard: 'leaderboard'
}

const ADVICE =
  / (should i|start or sit|who do i start|who should i start|who to start|sit or start|drop or|trade for|trade away|should i trade|worth a pick up|pick up or|is it worth starting|bench or) /
const DEFINITION = / (what is|what are|what does|whats|define|definition of|explain|meaning of) /
const GAMES =
  / (schedule|who do they play|who does .* play|play next|playing next|kickoff|final score|box score|game preview|preview of|result of|won the game|elo vs vegas) /
const SCHEDULE_METRIC = / (remaining|easiest|hardest|toughest|strength of|softest) schedule /
const LEAGUE =
  / (who owns|who has .* (rostered|on their team|on his team)|rostered by|my roster|show my team|my lineup|scoring settings|league scoring|how is .* scored|points per reception in my league) /
const OUTLOOK =
  / (outlook|regression|due for|running hot|running cold|bounce back|forecast for|ceiling and floor|buy low|sell high) /
const RANKING =
  / (who|which|rank|ranked|ranking|leaders?|leads|top|best|worst|most|fewest|highest|lowest) /

export function classify(
  question: string,
  r: {
    players: number
    ambiguous: number
    teams: number
    opponents: number
    metricHint: boolean
    outOfRange: boolean
    rostered: 'mine' | 'free' | null
  }
): QuestionType {
  const t = padded(question)
  if (ADVICE.test(t)) return 'advice'
  if (r.outOfRange) return 'out_of_range'
  const named = r.players + r.ambiguous
  if (named === 0 && r.teams === 0 && DEFINITION.test(t)) return 'definition'
  if (LEAGUE.test(t) && !(r.rostered === 'free' && r.metricHint)) return 'league'
  // "Easiest remaining schedule" and "strength of schedule" are rankings of a metric.
  if (GAMES.test(t) && !SCHEDULE_METRIC.test(t)) return 'games'
  if (named === 1 && OUTLOOK.test(t)) return 'outlook'
  if (named >= 2) return 'compare'
  if (named === 1) return 'player'
  if (r.teams >= 2) return 'compare'
  if (r.teams === 1 && !(RANKING.test(t) && / (teams|defenses|offenses) /.test(t))) return 'team'
  return 'leaderboard'
}
