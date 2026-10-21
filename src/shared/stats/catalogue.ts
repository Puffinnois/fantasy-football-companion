import type { MetricDef, PositionGroup } from './types'

/**
 * The metric catalogue (stats-analysis spec §6): every metric the engine computes, its formula over
 * component sums (and the models' states, spec §8), and the words a screen (or an LLM, spec §10)
 * needs to read it.
 */

type Opts = Partial<Omit<MetricDef, 'id' | 'label' | 'short' | 'description'>> &
  Pick<MetricDef, 'value' | 'sample'>

const QB: PositionGroup[] = ['QB']
const SKILL: PositionGroup[] = ['QB', 'RB', 'WR', 'TE']
const RB: PositionGroup[] = ['RB']
const RECEIVERS: PositionGroup[] = ['RB', 'WR', 'TE']
const PASS_CATCHERS: PositionGroup[] = ['WR', 'TE']
const DEFENDERS: PositionGroup[] = ['DL', 'LB', 'DB']
const COVERAGE: PositionGroup[] = ['LB', 'DB']
const FRONT: PositionGroup[] = ['DL', 'LB']
const K: PositionGroup[] = ['K']
const P: PositionGroup[] = ['P']

/** `{a} / {b}`, NULL when the denominator is 0 (DuckDB divides by 0 to Infinity). */
const ratio = (a: string, b: string): string => `{${a}} / nullif({${b}}, 0)`

/** The NFL passer rating over four components (attempts, completions, yards, TDs, INTs). */
function rating(att: string, cmp: string, yds: string, td: string, int: string): string {
  const per = (c: string): string => `{${c}} / nullif({${att}}, 0)`
  const clamp = (x: string): string => `greatest(0, least(2.375, ${x}))`
  return `100 / 6 * (${clamp(`(${per(cmp)} - 0.3) * 5`)} + ${clamp(`(${per(yds)} - 3) * 0.25`)} + ${clamp(`${per(td)} * 20`)} + ${clamp(`2.375 - ${per(int)} * 25`)})`
}

function metric(id: string, label: string, short: string, description: string, o: Opts): MetricDef {
  return {
    id,
    label,
    short,
    description,
    family: 'traditional',
    entity: 'player',
    positions: 'all',
    kind: 'rate',
    unit: 'number',
    decimals: 1,
    direction: 'higher',
    sources: PBP,
    firstSeason: 2019,
    tier: 'extended',
    ...o
  }
}

/** A counting stat: summed, can be shown per game; its sample is games. */
const count = (c: string, o: Partial<Opts> = {}): Opts => ({
  value: `{${c}}`,
  sample: 'games',
  kind: 'count',
  unit: 'count',
  decimals: 0,
  ...o
})

const PBP = ['nflverse play-by-play']
const BOX = ['nflverse player stats']
const NGS = ['NFL Next Gen Stats (nflverse)']
const PFR = ['Pro Football Reference advanced stats (nflverse)']
const FTN = ['FTN charting (nflverse)']
const PART = ['NFL participation (nflverse)']
const SNAPS = ['nflverse snap counts']
const FFO = ['ffverse ffopportunity']
const SLEEPER = ['Sleeper weekly stats']
const LINES = ['nflverse schedules (betting lines)']

const ROUTES_NOTE =
  'Routes are dropbacks the player was on the field for (blocking snaps count). In the current season, before participation is published, they are estimated as team dropbacks × his offensive snap share.'

const PASSING: MetricDef[] = [
  metric(
    'pass_att',
    'Pass attempts',
    'Att',
    'Passes thrown; sacks and spikes are not attempts here.',
    count('pass_att', { positions: QB, tier: 'core' })
  ),
  metric(
    'pass_cmp',
    'Completions',
    'Cmp',
    'Completed passes.',
    count('pass_cmp', { positions: QB })
  ),
  metric('pass_cmp_pct', 'Completion %', 'Cmp%', 'Completions per attempt.', {
    value: ratio('pass_cmp', 'pass_att'),
    sample: 'pass_att',
    unit: 'pct',
    positions: QB,
    minSample: 200
  }),
  metric(
    'pass_yds',
    'Passing yards',
    'Pass Yds',
    'Yards gained on completions; sack yardage not subtracted.',
    count('pass_yds', { positions: QB, tier: 'core' })
  ),
  metric(
    'pass_td',
    'Passing TDs',
    'Pass TD',
    'Touchdown passes.',
    count('pass_td', { positions: QB, tier: 'core' })
  ),
  metric(
    'pass_int',
    'Interceptions',
    'INT',
    'Passes intercepted.',
    count('pass_int', { positions: QB, direction: 'lower', tier: 'core' })
  ),
  metric('pass_ypa', 'Yards per attempt', 'Y/A', 'Passing yards per attempt.', {
    value: ratio('pass_yds', 'pass_att'),
    sample: 'pass_att',
    unit: 'yards',
    positions: QB,
    minSample: 200
  }),
  metric(
    'pass_nya',
    'Net yards per attempt',
    'NY/A',
    'Passing yards minus sack yards, per attempt or sack.',
    {
      value: '({pass_yds} - {sack_yds_lost}) / nullif({pass_att} + {sacks_taken}, 0)',
      sample: 'pass_att',
      unit: 'yards',
      decimals: 2,
      positions: QB,
      minSample: 200
    }
  ),
  metric(
    'pass_anya',
    'Adjusted net yards per attempt',
    'ANY/A',
    'Net yards per attempt with 20 yards added per touchdown and 45 taken off per interception. One of the most predictive box-score passing stats.',
    {
      value:
        '({pass_yds} - {sack_yds_lost} + 20 * {pass_td} - 45 * {pass_int}) / nullif({pass_att} + {sacks_taken}, 0)',
      sample: 'pass_att',
      unit: 'yards',
      decimals: 2,
      positions: QB,
      minSample: 200,
      tier: 'core'
    }
  ),
  metric(
    'passer_rating',
    'Passer rating',
    'Rate',
    'The NFL passer rating (0–158.3) from completion %, yards, touchdowns and interceptions per attempt.',
    {
      value: rating('pass_att', 'pass_cmp', 'pass_yds', 'pass_td', 'pass_int'),
      sample: 'pass_att',
      unit: 'rating',
      positions: QB,
      minSample: 200
    }
  ),
  metric(
    'pass_td_rate',
    'Touchdown rate',
    'TD%',
    'Touchdown passes per attempt. Swings a lot from year to year.',
    {
      value: ratio('pass_td', 'pass_att'),
      sample: 'pass_att',
      unit: 'pct',
      positions: QB,
      minSample: 200
    }
  ),
  metric('pass_int_rate', 'Interception rate', 'INT%', 'Interceptions per attempt.', {
    value: ratio('pass_int', 'pass_att'),
    sample: 'pass_att',
    unit: 'pct',
    direction: 'lower',
    positions: QB,
    minSample: 200
  }),
  metric(
    'sacks_taken',
    'Sacks taken',
    'Sk',
    'Times sacked.',
    count('sacks_taken', { positions: QB, direction: 'lower' })
  ),
  metric(
    'sack_rate',
    'Sack rate',
    'Sk%',
    'Sacks per dropback: partly the quarterback, partly the line.',
    {
      value: ratio('sacks_taken', 'dropbacks'),
      sample: 'dropbacks',
      unit: 'pct',
      direction: 'lower',
      positions: QB,
      minSample: 200
    }
  ),
  metric(
    'qb_epa_db',
    'EPA per dropback',
    'EPA/db',
    'Expected points added per dropback, scrambles and sacks included: how much each pass play changed the expected score. The best single measure of passing efficiency.',
    {
      value: ratio('db_epa', 'dropbacks'),
      sample: 'dropbacks',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      positions: QB,
      minSample: 200,
      tier: 'core'
    }
  ),
  metric('qb_success', 'Success rate', 'Succ%', 'Share of dropbacks with positive EPA.', {
    value: ratio('db_success', 'dropbacks'),
    sample: 'dropbacks',
    unit: 'pct',
    family: 'advanced',
    positions: QB,
    minSample: 200,
    tier: 'core'
  }),
  metric(
    'cpoe',
    'Completion % over expected',
    'CPOE',
    'Completion rate above what the throws’ difficulty predicts (nflfastR’s completion model), in percentage points: accuracy beyond the easy throws.',
    {
      value: ratio('cpoe_sum', 'cpoe_n'),
      sample: 'cpoe_n',
      unit: 'pp',
      family: 'advanced',
      positions: QB,
      minSample: 200,
      tier: 'core'
    }
  ),
  metric(
    'xcmp_pct',
    'Expected completion %',
    'xCmp%',
    'The completion rate nflfastR’s model expects from these throws: lower means harder throws.',
    {
      value: ratio('xcmp_sum', 'cpoe_n'),
      sample: 'cpoe_n',
      unit: 'pct',
      family: 'advanced',
      direction: 'neutral',
      positions: QB,
      minSample: 200
    }
  ),
  metric(
    'qbr',
    'ESPN QBR',
    'QBR',
    'ESPN’s Total QBR (0–100): EPA per play adjusted for opponent and context. Whole seasons are ESPN’s season figure; week ranges are play-weighted game QBRs.',
    {
      value: ratio('qbr_sum', 'qbr_plays'),
      sample: 'qbr_plays',
      unit: 'rating',
      family: 'advanced',
      positions: QB,
      minSample: 200,
      sources: ['ESPN QBR (nflverse)'],
      tier: 'core'
    }
  ),
  metric(
    'time_to_throw',
    'Time to throw',
    'TTT',
    'Average seconds from snap to throw (Next Gen Stats). Neither good nor bad on its own.',
    {
      value: ratio('ngs_ttt_sum', 'ngs_pass_att'),
      sample: 'ngs_pass_att',
      unit: 'seconds',
      decimals: 2,
      family: 'ngs',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      sources: NGS,
      tier: 'core'
    }
  ),
  metric(
    'aggressiveness',
    'Aggressiveness',
    'Aggr%',
    'Share of throws into tight windows, a defender within a yard (Next Gen Stats).',
    {
      value: `${ratio('ngs_aggr_sum', 'ngs_pass_att')} / 100`,
      sample: 'ngs_pass_att',
      unit: 'pct',
      family: 'ngs',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      sources: NGS
    }
  ),
  metric(
    'pass_adot',
    'Average depth of target',
    'aDOT',
    'Air yards per attempt: how far downfield the passes travel.',
    {
      value: ratio('pass_air_yds', 'pass_att'),
      sample: 'pass_att',
      unit: 'yards',
      family: 'advanced',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      tier: 'core'
    }
  ),
  metric(
    'air_to_sticks',
    'Air yards to the sticks',
    'AYTS',
    'Average air yards beyond the first-down marker; negative means short of it.',
    {
      value: ratio('pass_air_to_sticks', 'pass_air_n'),
      sample: 'pass_air_n',
      unit: 'yards',
      family: 'advanced',
      direction: 'neutral',
      positions: QB,
      minSample: 200
    }
  ),
  metric('deep_rate', 'Deep attempt rate', 'Deep%', 'Share of attempts thrown 20+ air yards.', {
    value: ratio('deep_att', 'pass_att'),
    sample: 'pass_att',
    unit: 'pct',
    family: 'advanced',
    direction: 'neutral',
    positions: QB,
    minSample: 200
  }),
  metric('deep_epa', 'EPA per deep attempt', 'Deep EPA', 'EPA per attempt of 20+ air yards.', {
    value: ratio('deep_epa', 'deep_att'),
    sample: 'deep_att',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    positions: QB,
    minSample: 40
  }),
  metric(
    'bad_throw_pct',
    'Bad-throw %',
    'Bad%',
    'Share of attempts Pro Football Reference charts as poorly thrown.',
    {
      value: ratio('pfr_bad_throws', 'pass_att__pfr_bad_throws'),
      sample: 'pass_att',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: QB,
      minSample: 200,
      sources: PFR
    }
  ),
  metric(
    'int_worthy_rate',
    'Interception-worthy rate',
    'IWP%',
    'Share of attempts FTN charts as interception-worthy, caught or not: steadier than interceptions.',
    {
      value: ratio('int_worthy', 'ftn_att'),
      sample: 'ftn_att',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: QB,
      minSample: 200,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'qb_pressured_pct',
    'Pressured %',
    'Prss%',
    'Share of dropbacks under pressure (participation, through the prior season).',
    {
      value: ratio('db_pressured', 'db_pressure_known'),
      sample: 'db_pressure_known',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      positions: QB,
      minSample: 200,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'qb_pressure_pfr',
    'Pressure rate (PFR)',
    'PFR Prss%',
    'Times pressured per dropback as Pro Football Reference charts it; published for the current season too.',
    {
      value: ratio('pfr_times_pressured', 'dropbacks__pfr_times_pressured'),
      sample: 'dropbacks',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: QB,
      minSample: 200,
      sources: PFR
    }
  ),
  metric(
    'p2s_rate',
    'Pressure-to-sack rate',
    'P2S%',
    'Share of pressured dropbacks that end in a sack: largely on the quarterback, and fairly stable.',
    {
      value: ratio('db_pressured_sacks', 'db_pressured'),
      sample: 'db_pressured',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      positions: QB,
      minSample: 60,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric('pressured_epa', 'EPA when pressured', 'Prss EPA', 'EPA per dropback under pressure.', {
    value: ratio('db_pressured_epa', 'db_pressured'),
    sample: 'db_pressured',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    positions: QB,
    minSample: 60,
    sources: PART,
    lastSeason: 'prior'
  }),
  metric(
    'clean_epa',
    'EPA from a clean pocket',
    'Clean EPA',
    'EPA per dropback without pressure.',
    {
      value: '{db_clean_epa} / nullif({db_pressure_known} - {db_pressured}, 0)',
      sample: 'db_pressure_known',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      positions: QB,
      minSample: 200,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'play_action_rate',
    'Play-action rate',
    'PA%',
    'Share of dropbacks with a play-action fake (FTN, 2022+).',
    {
      value: ratio('db_play_action', 'db_ftn'),
      sample: 'db_ftn',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'play_action_epa',
    'Play-action EPA',
    'PA EPA',
    'EPA per play-action dropback (FTN, 2022+).',
    {
      value: ratio('db_pa_epa', 'db_play_action'),
      sample: 'db_play_action',
      unit: 'epa',
      decimals: 3,
      family: 'charting',
      positions: QB,
      minSample: 50,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'blitz_epa',
    'EPA vs the blitz',
    'Blitz EPA',
    'EPA per dropback against a blitz (FTN blitzers, 2022+).',
    {
      value: ratio('db_blitz_epa', 'db_blitzed'),
      sample: 'db_blitzed',
      unit: 'epa',
      decimals: 3,
      family: 'charting',
      positions: QB,
      minSample: 50,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'scrambles',
    'Scrambles',
    'Scr',
    'Dropbacks that turned into runs.',
    count('scrambles', { positions: QB })
  ),
  metric(
    'scramble_yds',
    'Scramble yards',
    'Scr Yds',
    'Rushing yards on scrambles.',
    count('scramble_yds', { positions: QB })
  ),
  metric(
    'designed_runs',
    'Designed runs',
    'Des Runs',
    'Carries that were called runs (scrambles and kneels excluded).',
    count('designed_runs', { positions: SKILL })
  ),
  metric(
    'pass_fd',
    'Passing first downs',
    'Pass 1D',
    'Completions that gained a first down.',
    count('pass_fd', { positions: QB, tier: 'stored' })
  ),
  metric(
    'pass_wpa',
    'Passing WPA',
    'Pass WPA',
    'Win probability added on pass plays, summed.',
    count('pass_wpa', {
      positions: QB,
      unit: 'pct',
      decimals: 2,
      family: 'advanced',
      tier: 'stored'
    })
  ),
  metric('throwaway_rate', 'Throwaway rate', 'TA%', 'Share of attempts thrown away (FTN, 2022+).', {
    value: ratio('throwaways', 'ftn_att'),
    sample: 'ftn_att',
    unit: 'pct',
    family: 'charting',
    direction: 'neutral',
    positions: QB,
    minSample: 200,
    sources: FTN,
    firstSeason: 2022,
    tier: 'stored'
  }),
  metric(
    'out_of_pocket_rate',
    'Out-of-pocket rate',
    'OOP%',
    'Share of dropbacks where the quarterback left the pocket (FTN, 2022+).',
    {
      value: ratio('db_out_of_pocket', 'db_ftn'),
      sample: 'db_ftn',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      sources: FTN,
      firstSeason: 2022,
      tier: 'stored'
    }
  )
]

const RUSHING: MetricDef[] = [
  metric(
    'carries',
    'Carries',
    'Car',
    'Rushing attempts, scrambles and kneels included (as nflverse counts them).',
    count('carries', { positions: SKILL, tier: 'core' })
  ),
  metric(
    'rush_yds',
    'Rushing yards',
    'Rush Yds',
    'Yards gained on carries.',
    count('rush_yds', { positions: SKILL, tier: 'core' })
  ),
  metric(
    'rush_td',
    'Rushing TDs',
    'Rush TD',
    'Rushing touchdowns.',
    count('rush_td', { positions: SKILL, tier: 'core' })
  ),
  metric('rush_ypc', 'Yards per carry', 'YPC', 'Rushing yards per carry.', {
    value: ratio('rush_yds', 'carries'),
    sample: 'carries',
    unit: 'yards',
    positions: SKILL,
    minSample: 100,
    tier: 'core'
  }),
  metric(
    'rush_fd',
    'Rushing first downs',
    'Rush 1D',
    'Carries that gained a first down.',
    count('rush_fd', { positions: SKILL, tier: 'stored' })
  ),
  metric('rush_epa', 'EPA per carry', 'Rush EPA', 'Expected points added per carry.', {
    value: ratio('rush_epa', 'carries'),
    sample: 'carries',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    positions: SKILL,
    minSample: 100
  }),
  metric(
    'rush_success',
    'Rushing success rate',
    'Rush Succ%',
    'Share of carries with positive EPA.',
    {
      value: ratio('rush_success', 'carries'),
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      positions: SKILL,
      minSample: 100
    }
  ),
  metric(
    'explosive_run_rate',
    'Explosive-run rate',
    '10+%',
    'Share of carries gaining 10+ yards.',
    {
      value: ratio('rush_10p', 'carries'),
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      positions: SKILL,
      minSample: 100
    }
  ),
  metric(
    'breakaway_pct',
    'Breakaway %',
    'Brkwy%',
    'Share of rushing yards gained on runs of 15+ yards: how much a back depends on big runs.',
    {
      value: ratio('rush_15p_yds', 'rush_yds'),
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      direction: 'neutral',
      positions: SKILL,
      minSample: 100
    }
  ),
  metric('stuff_rate', 'Stuff rate', 'Stuff%', 'Share of carries stopped at or behind the line.', {
    value: ratio('rush_stuffed', 'carries'),
    sample: 'carries',
    unit: 'pct',
    family: 'advanced',
    direction: 'lower',
    positions: SKILL,
    minSample: 100
  }),
  metric(
    'rz_carries',
    'Red-zone carries',
    'RZ Car',
    'Carries inside the opponent’s 20.',
    count('rz_carries', { positions: SKILL })
  ),
  metric(
    'i10_carries',
    'Carries inside the 10',
    'i10 Car',
    'Carries inside the opponent’s 10: the most valuable touches in fantasy.',
    count('i10_carries', { positions: SKILL })
  ),
  metric(
    'i5_carries',
    'Carries inside the 5',
    'i5 Car',
    'Carries inside the opponent’s 5.',
    count('i5_carries', { positions: SKILL })
  ),
  metric(
    'ryoe',
    'Rush yards over expected',
    'RYOE',
    'Rushing yards above what Next Gen Stats expects from the blockers’ and defenders’ positions at the handoff: credits the runner, not the line.',
    count('ngs_ryoe', { family: 'ngs', positions: RB, sources: NGS, tier: 'core' })
  ),
  metric(
    'ryoe_att',
    'RYOE per attempt',
    'RYOE/att',
    'Rush yards over expected per carry (Next Gen Stats).',
    {
      value: ratio('ngs_ryoe', 'ngs_rush_att'),
      sample: 'ngs_rush_att',
      unit: 'yards',
      decimals: 2,
      family: 'ngs',
      positions: RB,
      minSample: 100,
      sources: NGS,
      tier: 'core'
    }
  ),
  metric(
    'rush_pct_over_expected',
    'Rush % over expected',
    'ROE%',
    'Share of carries that beat their expected yards (Next Gen Stats).',
    {
      value: ratio('ngs_roe_sum', 'ngs_rush_att'),
      sample: 'ngs_rush_att',
      unit: 'pct',
      family: 'ngs',
      positions: RB,
      minSample: 100,
      sources: NGS
    }
  ),
  metric(
    'box8_rate',
    '8+ defenders in the box',
    '8+ Box%',
    'Share of carries against eight or more defenders in the box (Next Gen Stats).',
    {
      value: `${ratio('ngs_box8_sum', 'ngs_rush_att')} / 100`,
      sample: 'ngs_rush_att',
      unit: 'pct',
      family: 'ngs',
      direction: 'neutral',
      positions: RB,
      minSample: 100,
      sources: NGS
    }
  ),
  metric(
    'ybc_att',
    'Yards before contact per carry',
    'YBC/att',
    'Yards gained before first contact (Pro Football Reference): mostly the blocking.',
    {
      value: ratio('pfr_ybc', 'pfr_carries'),
      sample: 'pfr_carries',
      unit: 'yards',
      decimals: 2,
      family: 'charting',
      positions: RB,
      minSample: 100,
      sources: PFR
    }
  ),
  metric(
    'yac_att',
    'Yards after contact per carry',
    'YACon/att',
    'Yards gained after first contact (Pro Football Reference): mostly the runner.',
    {
      value: ratio('pfr_yac', 'pfr_carries'),
      sample: 'pfr_carries',
      unit: 'yards',
      decimals: 2,
      family: 'charting',
      positions: RB,
      minSample: 100,
      sources: PFR
    }
  ),
  metric(
    'broken_tackles_touch',
    'Broken tackles per touch',
    'BTkl/Tch',
    'Broken tackles, rushing and receiving, per carry or catch (Pro Football Reference).',
    {
      value:
        '(coalesce({pfr_rush_btkl}, 0) + coalesce({pfr_rec_btkl}, 0)) / nullif(coalesce({carries__pfr_rush_btkl}, 0) + coalesce({receptions__pfr_rec_btkl}, 0), 0)',
      sample: 'carries',
      unit: 'number',
      decimals: 3,
      family: 'charting',
      positions: RECEIVERS,
      minSample: 100,
      sources: PFR
    }
  ),
  metric(
    'box8_rate_part',
    '8+ box rate (charted)',
    '8+ Box% (ch)',
    'Share of carries against eight or more in the box, from participation (through the prior season) or FTN box counts (2022+).',
    {
      value: ratio('box8_carries', 'box_known'),
      sample: 'box_known',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      positions: RB,
      minSample: 100,
      sources: [...PART, ...FTN],
      tier: 'stored'
    }
  )
]

const RECEIVING: MetricDef[] = [
  metric(
    'targets',
    'Targets',
    'Tgt',
    'Passes thrown to the player.',
    count('targets', { positions: RECEIVERS, tier: 'core' })
  ),
  metric(
    'receptions',
    'Receptions',
    'Rec',
    'Passes caught.',
    count('receptions', { positions: RECEIVERS, tier: 'core' })
  ),
  metric(
    'rec_yds',
    'Receiving yards',
    'Rec Yds',
    'Yards gained on catches.',
    count('rec_yds', { positions: RECEIVERS, tier: 'core' })
  ),
  metric(
    'rec_td',
    'Receiving TDs',
    'Rec TD',
    'Touchdown catches.',
    count('rec_td', { positions: RECEIVERS, tier: 'core' })
  ),
  metric(
    'catch_rate',
    'Catch rate',
    'Ctch%',
    'Receptions per target; depends heavily on target depth.',
    {
      value: ratio('receptions', 'targets'),
      sample: 'targets',
      unit: 'pct',
      positions: RECEIVERS,
      minSample: 50
    }
  ),
  metric('rec_ypr', 'Yards per reception', 'Y/R', 'Receiving yards per catch.', {
    value: ratio('rec_yds', 'receptions'),
    sample: 'receptions',
    unit: 'yards',
    positions: RECEIVERS,
    minSample: 30
  }),
  metric('rec_ypt', 'Yards per target', 'Y/T', 'Receiving yards per target.', {
    value: ratio('rec_yds', 'targets'),
    sample: 'targets',
    unit: 'yards',
    positions: RECEIVERS,
    minSample: 50
  }),
  metric(
    'target_share',
    'Target share',
    'Tgt%',
    'Share of the team’s targets in the games he played. Volume and share stats are the most stable from year to year.',
    {
      value: ratio('targets', 'tm_targets'),
      sample: 'targets',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30,
      tier: 'core'
    }
  ),
  metric(
    'air_yards_share',
    'Air-yards share',
    'AY%',
    'Share of the team’s air yards in the games he played.',
    {
      value: ratio('rec_air_yds', 'tm_air_yds'),
      sample: 'targets',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30,
      tier: 'core'
    }
  ),
  metric(
    'wopr',
    'WOPR',
    'WOPR',
    'Weighted opportunity rating: 1.5 × target share + 0.7 × air-yards share. Predicts receiving fantasy output.',
    {
      value:
        '1.5 * {targets} / nullif({tm_targets}, 0) + 0.7 * {rec_air_yds} / nullif({tm_air_yds}, 0)',
      sample: 'targets',
      unit: 'number',
      decimals: 2,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30,
      tier: 'core'
    }
  ),
  metric('rec_adot', 'Average depth of target', 'aDOT', 'Air yards per target.', {
    value: ratio('rec_air_yds', 'targets'),
    sample: 'targets',
    unit: 'yards',
    family: 'advanced',
    direction: 'neutral',
    positions: RECEIVERS,
    minSample: 30,
    tier: 'core'
  }),
  metric(
    'racr',
    'RACR',
    'RACR',
    'Receiver air conversion ratio: receiving yards per air yard targeted.',
    {
      value: ratio('rec_yds', 'rec_air_yds'),
      sample: 'targets',
      unit: 'number',
      decimals: 2,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30
    }
  ),
  metric(
    'routes',
    'Routes',
    'Rts',
    `Routes run. ${ROUTES_NOTE}`,
    count('routes', {
      family: 'advanced',
      positions: RECEIVERS,
      sources: [...PART, ...SNAPS],
      estimatedBy: 'routes_est'
    })
  ),
  metric(
    'route_participation',
    'Route participation',
    'Rte%',
    `Share of the team’s dropbacks he ran a route on. ${ROUTES_NOTE}`,
    {
      value: ratio('routes', 'tm_dropbacks__routes'),
      sample: 'routes',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 150,
      sources: [...PART, ...SNAPS],
      estimatedBy: 'routes_est',
      tier: 'core'
    }
  ),
  metric(
    'yprr',
    'Yards per route run',
    'YPRR',
    `Receiving yards per route: efficiency that does not punish a player for targets he did not get. ${ROUTES_NOTE}`,
    {
      value: ratio('rec_yds__routes', 'routes'),
      sample: 'routes',
      unit: 'yards',
      decimals: 2,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 150,
      sources: [...PBP, ...PART, ...SNAPS],
      estimatedBy: 'routes_est',
      tier: 'core'
    }
  ),
  metric(
    'tprr',
    'Targets per route run',
    'TPRR',
    `Targets per route: how often he earns the ball when he is out there. ${ROUTES_NOTE}`,
    {
      value: ratio('targets__routes', 'routes'),
      sample: 'routes',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 150,
      sources: [...PBP, ...PART, ...SNAPS],
      estimatedBy: 'routes_est',
      tier: 'core'
    }
  ),
  metric(
    'fd_per_route',
    'First downs per route',
    '1D/RR',
    `Receiving first downs per route. ${ROUTES_NOTE}`,
    {
      value: ratio('rec_fd__routes', 'routes'),
      sample: 'routes',
      unit: 'number',
      decimals: 3,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 150,
      sources: [...PBP, ...PART, ...SNAPS],
      estimatedBy: 'routes_est'
    }
  ),
  metric('yac_rec', 'YAC per reception', 'YAC/R', 'Yards after the catch per catch.', {
    value: ratio('rec_yac', 'receptions'),
    sample: 'receptions',
    unit: 'yards',
    positions: RECEIVERS,
    minSample: 30
  }),
  metric(
    'yacoe',
    'YAC over expected',
    'YACOE',
    'Yards after the catch above nflfastR’s expected YAC, per catch.',
    {
      value: '({rec_xyac_yac} - {rec_xyac}) / nullif({rec_xyac_n}, 0)',
      sample: 'rec_xyac_n',
      unit: 'yards',
      decimals: 2,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30
    }
  ),
  metric(
    'ngs_yacoe',
    'YAC over expected (NGS)',
    'NGS YACOE',
    'Yards after the catch above Next Gen Stats’ expectation, per catch.',
    {
      value: ratio('ngs_yacoe_sum', 'ngs_receptions'),
      sample: 'ngs_receptions',
      unit: 'yards',
      decimals: 2,
      family: 'ngs',
      positions: RECEIVERS,
      minSample: 30,
      sources: NGS,
      tier: 'stored'
    }
  ),
  metric(
    'separation',
    'Separation',
    'Sep',
    'Average yards between the receiver and the nearest defender when the ball arrives (Next Gen Stats).',
    {
      value: ratio('ngs_sep_sum', 'ngs_targets'),
      sample: 'ngs_targets',
      unit: 'yards',
      decimals: 2,
      family: 'ngs',
      positions: PASS_CATCHERS,
      minSample: 30,
      sources: NGS,
      tier: 'core'
    }
  ),
  metric(
    'cushion',
    'Cushion',
    'Cush',
    'Average yards between the receiver and the nearest defender at the snap (Next Gen Stats).',
    {
      value: ratio('ngs_cushion_sum', 'ngs_targets'),
      sample: 'ngs_targets',
      unit: 'yards',
      decimals: 2,
      family: 'ngs',
      direction: 'neutral',
      positions: PASS_CATCHERS,
      minSample: 30,
      sources: NGS
    }
  ),
  metric(
    'drops',
    'Drops',
    'Drp',
    'Catchable passes dropped (FTN, 2022+).',
    count('drops', {
      family: 'charting',
      direction: 'lower',
      positions: RECEIVERS,
      sources: FTN,
      firstSeason: 2022
    })
  ),
  metric('drop_rate', 'Drop rate', 'Drp%', 'Drops per catch or drop (FTN, 2022+).', {
    value: '{drops} / nullif({receptions} + {drops}, 0)',
    sample: 'targets',
    unit: 'pct',
    family: 'charting',
    direction: 'lower',
    positions: RECEIVERS,
    minSample: 30,
    sources: FTN,
    firstSeason: 2022
  }),
  metric(
    'catchable_pct',
    'Catchable-target %',
    'Catchable%',
    'Share of targets FTN charts as catchable: target quality, mostly the quarterback’s doing.',
    {
      value: ratio('tgt_catchable', 'tgt_ftn'),
      sample: 'tgt_ftn',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      positions: RECEIVERS,
      minSample: 30,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'contested_targets',
    'Contested targets',
    'Cont Tgt',
    'Targets with a defender in position to make a play (FTN, 2022+).',
    count('tgt_contested', {
      family: 'charting',
      direction: 'neutral',
      positions: RECEIVERS,
      sources: FTN,
      firstSeason: 2022
    })
  ),
  metric(
    'contested_catch_rate',
    'Contested catch rate',
    'Cont%',
    'Catches per contested target (FTN, 2022+).',
    {
      value: ratio('contested_catches', 'tgt_contested'),
      sample: 'tgt_contested',
      unit: 'pct',
      family: 'charting',
      positions: RECEIVERS,
      minSample: 10,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'ez_targets',
    'End-zone targets',
    'EZ Tgt',
    'Targets thrown into the end zone.',
    count('ez_targets', { positions: RECEIVERS })
  ),
  metric(
    'i10_targets',
    'Targets inside the 10',
    'i10 Tgt',
    'Targets inside the opponent’s 10.',
    count('i10_targets', { positions: RECEIVERS })
  ),
  metric(
    'rz_targets',
    'Red-zone targets',
    'RZ Tgt',
    'Targets inside the opponent’s 20.',
    count('rz_targets', { positions: RECEIVERS, tier: 'stored' })
  ),
  metric(
    'deep_targets',
    'Deep targets',
    'Deep Tgt',
    'Targets of 20+ air yards.',
    count('deep_targets', { positions: RECEIVERS, tier: 'stored' })
  ),
  metric('rec_epa', 'EPA per target', 'Rec EPA', 'Expected points added per target.', {
    value: ratio('rec_epa', 'targets'),
    sample: 'targets',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    positions: RECEIVERS,
    minSample: 30
  }),
  metric(
    'rec_success',
    'Receiving success rate',
    'Rec Succ%',
    'Share of targets with positive EPA.',
    {
      value: ratio('rec_success', 'targets'),
      sample: 'targets',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30,
      tier: 'stored'
    }
  ),
  metric(
    'tprr_man',
    'TPRR vs man',
    'TPRR Man',
    'Targets per route against man coverage (participation, through the prior season).',
    {
      value: ratio('tgt_man', 'routes_man'),
      sample: 'routes_man',
      unit: 'pct',
      family: 'advanced',
      positions: PASS_CATCHERS,
      minSample: 50,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'tprr_zone',
    'TPRR vs zone',
    'TPRR Zone',
    'Targets per route against zone coverage (participation, through the prior season).',
    {
      value: ratio('tgt_zone', 'routes_zone'),
      sample: 'routes_zone',
      unit: 'pct',
      family: 'advanced',
      positions: PASS_CATCHERS,
      minSample: 100,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'yprr_man',
    'YPRR vs man',
    'YPRR Man',
    'Yards per route against man coverage (participation, through the prior season).',
    {
      value: ratio('rec_yds_man', 'routes_man'),
      sample: 'routes_man',
      unit: 'yards',
      decimals: 2,
      family: 'advanced',
      positions: PASS_CATCHERS,
      minSample: 50,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'yprr_zone',
    'YPRR vs zone',
    'YPRR Zone',
    'Yards per route against zone coverage (participation, through the prior season).',
    {
      value: ratio('rec_yds_zone', 'routes_zone'),
      sample: 'routes_zone',
      unit: 'yards',
      decimals: 2,
      family: 'advanced',
      positions: PASS_CATCHERS,
      minSample: 100,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'created_receptions',
    'Created receptions',
    'Created',
    'Catches FTN charts as made by the receiver beyond a routine catch (2022+).',
    count('created_receptions', {
      family: 'charting',
      positions: RECEIVERS,
      sources: FTN,
      firstSeason: 2022,
      tier: 'stored'
    })
  )
]

const USAGE: MetricDef[] = [
  metric('games', 'Games', 'G', 'Games with a snap or a stat.', count('games', { tier: 'core' })),
  metric(
    'off_snaps',
    'Offensive snaps',
    'Off Snp',
    'Offensive snaps played.',
    count('off_snaps', { positions: [...SKILL, 'OL'], sources: SNAPS })
  ),
  metric(
    'snap_share',
    'Snap share',
    'Snp%',
    'Share of the team’s offensive snaps in the games he played.',
    {
      value: ratio('off_snaps', 'tm_off_snaps'),
      sample: 'off_snaps',
      unit: 'pct',
      family: 'advanced',
      positions: [...SKILL, 'OL'],
      minSample: 200,
      sources: SNAPS,
      tier: 'core'
    }
  ),
  metric(
    'def_snaps',
    'Defensive snaps',
    'Def Snp',
    'Defensive snaps played.',
    count('def_snaps', { positions: DEFENDERS, sources: SNAPS, tier: 'core' })
  ),
  metric(
    'def_snap_share',
    'Defensive snap share',
    'Def Snp%',
    'Share of the team’s defensive snaps in the games he played.',
    {
      value: ratio('def_snaps', 'tm_def_snaps'),
      sample: 'def_snaps',
      unit: 'pct',
      family: 'advanced',
      positions: DEFENDERS,
      minSample: 200,
      sources: SNAPS,
      tier: 'core'
    }
  ),
  metric(
    'st_snaps',
    'Special-teams snaps',
    'ST Snp',
    'Special-teams snaps played.',
    count('st_snaps', { sources: SNAPS })
  ),
  metric(
    'carry_share',
    'Carry share',
    'Car%',
    'Share of the team’s carries in the games he played.',
    {
      value: ratio('carries', 'tm_carries'),
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      positions: SKILL,
      minSample: 50,
      tier: 'core'
    }
  ),
  metric(
    'opportunity_share',
    'Opportunity share',
    'Opp%',
    'Share of the team’s carries and targets combined, in the games he played.',
    {
      value: '({carries} + {targets}) / nullif({tm_carries} + {tm_targets}, 0)',
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      positions: RB,
      minSample: 50,
      tier: 'core'
    }
  ),
  metric(
    'rz_opportunity_share',
    'Red-zone opportunity share',
    'RZ Opp%',
    'Share of the team’s red-zone carries and targets.',
    {
      value: '({rz_carries} + {rz_targets}) / nullif({tm_rz_carries} + {tm_rz_targets}, 0)',
      sample: 'games',
      unit: 'pct',
      family: 'advanced',
      positions: SKILL,
      minSample: 8
    }
  ),
  metric(
    'high_value_touches',
    'High-value touches',
    'HVT',
    'Receptions plus carries inside the 10: the touches worth the most fantasy points.',
    count('receptions', {
      value: '{receptions} + {i10_carries}',
      family: 'advanced',
      positions: RB,
      tier: 'core'
    })
  ),
  metric(
    'touches',
    'Touches',
    'Tch',
    'Carries plus receptions.',
    count('carries', { value: '{carries} + {receptions}', positions: SKILL })
  ),
  metric(
    'scrimmage_yds',
    'Scrimmage yards',
    'Scrim Yds',
    'Rushing plus receiving yards.',
    count('rush_yds', { value: '{rush_yds} + {rec_yds}', positions: SKILL })
  ),
  metric(
    'total_td',
    'Scrimmage TDs',
    'TD',
    'Rushing plus receiving touchdowns.',
    count('rush_td', { value: '{rush_td} + {rec_td}', positions: SKILL })
  ),
  metric(
    'weighted_opportunities',
    'Weighted opportunities',
    'WO',
    'Carries plus 1.5 × targets: a target is worth more fantasy points than a carry.',
    count('carries', {
      value: '{carries} + 1.5 * {targets}',
      unit: 'number',
      decimals: 1,
      family: 'advanced',
      positions: RECEIVERS
    })
  ),
  metric(
    'on_field_epa',
    'Team EPA with him on the field',
    'On EPA',
    'The offense’s EPA per play on his snaps (participation, through the prior season).',
    {
      value: ratio('on_off_epa', 'on_off_plays'),
      sample: 'on_off_plays',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      positions: [...SKILL, 'OL'],
      minSample: 300,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'on_field_def_epa',
    'EPA allowed with him on the field',
    'On Def EPA',
    'The defense’s EPA per play allowed on his snaps (participation, through the prior season).',
    {
      value: ratio('on_def_epa', 'on_def_plays'),
      sample: 'on_def_plays',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      direction: 'lower',
      positions: DEFENDERS,
      minSample: 300,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'fumbles',
    'Fumbles',
    'Fum',
    'Fumbles, lost or not.',
    count('fumbles', { direction: 'lower', sources: BOX })
  ),
  metric(
    'fumbles_lost',
    'Fumbles lost',
    'FL',
    'Fumbles the other team recovered.',
    count('fumbles_lost', { direction: 'lower', sources: BOX })
  ),
  metric(
    'penalties',
    'Penalties',
    'Pen',
    'Accepted penalties.',
    count('penalties', { direction: 'lower', sources: BOX, tier: 'stored' })
  ),
  metric(
    'penalty_yds',
    'Penalty yards',
    'Pen Yds',
    'Yards of accepted penalties.',
    count('penalty_yds', { direction: 'lower', sources: BOX, tier: 'stored' })
  ),
  metric('kr_avg', 'Kick return average', 'KR Avg', 'Yards per kickoff return.', {
    value: ratio('kr_yds', 'kr'),
    sample: 'kr',
    unit: 'yards',
    minSample: 15,
    sources: BOX
  }),
  metric('pr_avg', 'Punt return average', 'PR Avg', 'Yards per punt return.', {
    value: ratio('pr_yds', 'pr'),
    sample: 'pr',
    unit: 'yards',
    minSample: 15,
    sources: BOX
  }),
  metric(
    'st_tds',
    'Special-teams TDs',
    'ST TD',
    'Return and other special-teams touchdowns.',
    count('st_tds', { sources: BOX, tier: 'stored' })
  )
]

const FANTASY_POSITIONS: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'K']
const FANTASY: MetricDef[] = [
  metric(
    'fantasy_points',
    'Fantasy points',
    'FP',
    'Fantasy points under the chosen scoring, from Sleeper’s weekly stat lines.',
    count('fp', {
      unit: 'points',
      decimals: 1,
      positions: FANTASY_POSITIONS,
      sources: SLEEPER,
      scoring: true,
      tier: 'core'
    })
  ),
  metric(
    'fantasy_ppg',
    'Fantasy points per game',
    'FP/G',
    'Fantasy points per game played, under the chosen scoring.',
    {
      value: ratio('fp', 'games'),
      sample: 'games',
      unit: 'points',
      positions: FANTASY_POSITIONS,
      minSample: 6,
      sources: SLEEPER,
      scoring: true,
      tier: 'core'
    }
  ),
  metric(
    'expected_points',
    'Expected fantasy points',
    'xFP',
    'The fantasy points his opportunities were worth on average (ffopportunity’s expected stats, scored with the chosen rules): volume and role, not results.',
    count('xfp', {
      unit: 'points',
      decimals: 1,
      family: 'predictive',
      positions: SKILL,
      sources: FFO,
      scoring: true,
      tier: 'core'
    })
  ),
  metric('expected_ppg', 'Expected points per game', 'xFP/G', 'Expected fantasy points per game.', {
    value: ratio('xfp', 'games__xfp'),
    sample: 'games',
    unit: 'points',
    family: 'predictive',
    positions: SKILL,
    minSample: 6,
    sources: FFO,
    scoring: true
  }),
  metric(
    'fpoe',
    'Fantasy points over expected',
    'FPOE',
    'Fantasy points minus expected points: efficiency, which regresses toward zero more than volume does.',
    count('fp', {
      value: '{fp__xfp} - {xfp}',
      unit: 'points',
      decimals: 1,
      family: 'predictive',
      positions: SKILL,
      sources: [...SLEEPER, ...FFO],
      scoring: true,
      tier: 'core'
    })
  ),
  metric(
    'xtd',
    'Expected touchdowns',
    'xTD',
    'Touchdowns his opportunities were worth on average (ffopportunity).',
    count('x_td', {
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      positions: SKILL,
      sources: FFO,
      tier: 'core'
    })
  ),
  metric(
    'td_over_expected',
    'TDs over expected',
    'TD−xTD',
    'Touchdowns minus expected touchdowns: far above or below zero tends to even out.',
    count('ff_td', {
      value: '{ff_td} - {x_td}',
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      positions: SKILL,
      sources: FFO,
      tier: 'core'
    })
  ),
  metric(
    'expected_receptions',
    'Expected receptions',
    'xRec',
    'Receptions his targets were worth on average (ffopportunity).',
    count('x_rec', {
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      positions: RECEIVERS,
      sources: FFO
    })
  ),
  metric(
    'expected_rec_yds',
    'Expected receiving yards',
    'xRecYds',
    'Receiving yards his targets were worth on average (ffopportunity).',
    count('x_rec_yds', {
      unit: 'number',
      family: 'predictive',
      positions: RECEIVERS,
      sources: FFO,
      tier: 'stored'
    })
  ),
  metric(
    'expected_rush_yds',
    'Expected rushing yards',
    'xRushYds',
    'Rushing yards his carries were worth on average (ffopportunity).',
    count('x_rush_yds', {
      unit: 'number',
      family: 'predictive',
      positions: SKILL,
      sources: FFO,
      tier: 'stored'
    })
  )
]

const DEFENSE: MetricDef[] = [
  metric(
    'tackles',
    'Tackles',
    'Tkl',
    'Solo plus assisted tackles.',
    count('tackles_solo', {
      value: '{tackles_solo} + {tackles_with_assist} + {tackles_assist}',
      positions: DEFENDERS,
      tier: 'core'
    })
  ),
  metric(
    'solo_tackles',
    'Solo tackles',
    'Solo',
    'Tackles made alone.',
    count('tackles_solo', { positions: DEFENDERS })
  ),
  metric(
    'assisted_tackles',
    'Assisted tackles',
    'Ast',
    'Tackles shared with a teammate.',
    count('tackles_assist', {
      value: '{tackles_with_assist} + {tackles_assist}',
      positions: DEFENDERS
    })
  ),
  metric(
    'tfl',
    'Tackles for loss',
    'TFL',
    'Tackles behind the line of scrimmage (official count).',
    count('tfl', { positions: DEFENDERS, sources: BOX, tier: 'core' })
  ),
  metric(
    'def_stuffs',
    'Run stuffs',
    'Stuffs',
    'Tackles on runs stopped at or behind the line.',
    count('def_stuffs', { family: 'advanced', positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'sacks',
    'Sacks',
    'Sk',
    'Sacks, a half-sack counted as one half.',
    count('sacks', { decimals: 1, positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'qb_hits',
    'QB hits',
    'QBH',
    'Hits on the quarterback.',
    count('qb_hits', { positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'pressures',
    'Pressures',
    'Prss',
    'Hurries, hits and sacks (Pro Football Reference).',
    count('pfr_pressures', { family: 'charting', positions: DEFENDERS, sources: PFR, tier: 'core' })
  ),
  metric(
    'hurries',
    'Hurries',
    'Hur',
    'Throws he hurried (Pro Football Reference).',
    count('pfr_hurries', { family: 'charting', positions: DEFENDERS, sources: PFR })
  ),
  metric(
    'pressure_rate',
    'Pressure rate',
    'Prss%',
    'Pressures per pass snap. Pass snaps are the opponent’s dropbacks he was on the field for (participation, through the prior season), not true pass rushes.',
    {
      value: ratio('pfr_pressures', 'def_pass_snaps__pfr_pressures'),
      sample: 'def_pass_snaps',
      unit: 'pct',
      family: 'advanced',
      positions: FRONT,
      minSample: 150,
      sources: [...PFR, ...PART],
      lastSeason: 'prior'
    }
  ),
  metric(
    'blitz_rate',
    'Blitz rate',
    'Blitz%',
    'Blitzes per pass snap (Pro Football Reference blitzes; pass snaps from participation, through the prior season).',
    {
      value: ratio('pfr_blitzes', 'def_pass_snaps__pfr_blitzes'),
      sample: 'def_pass_snaps',
      unit: 'pct',
      family: 'advanced',
      direction: 'neutral',
      positions: COVERAGE,
      minSample: 150,
      sources: [...PFR, ...PART],
      lastSeason: 'prior'
    }
  ),
  metric(
    'missed_tackle_pct',
    'Missed-tackle %',
    'MTkl%',
    'Missed tackles per tackle attempt (Pro Football Reference).',
    {
      value: '{pfr_missed_tackles} / nullif({pfr_missed_tackles} + {pfr_tackles}, 0)',
      sample: 'pfr_tackles',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: DEFENDERS,
      minSample: 30,
      sources: PFR
    }
  ),
  metric(
    'tackle_depth',
    'Average depth of tackle',
    'Tkl Dpth',
    'Yards the ball carrier had gained when he made the tackle: lower is closer to the line.',
    {
      value: ratio('tackle_depth_sum', 'tackle_depth_n'),
      sample: 'tackle_depth_n',
      unit: 'yards',
      family: 'advanced',
      direction: 'lower',
      positions: DEFENDERS,
      minSample: 30
    }
  ),
  metric(
    'coverage_targets',
    'Targets in coverage',
    'Cov Tgt',
    'Passes thrown at the receiver he covered (Pro Football Reference).',
    count('cov_targets', {
      family: 'charting',
      direction: 'neutral',
      positions: COVERAGE,
      sources: PFR,
      tier: 'core'
    })
  ),
  metric(
    'coverage_cmp_pct',
    'Completion % allowed',
    'Cmp% All',
    'Completions per target in his coverage.',
    {
      value: ratio('cov_cmp', 'cov_targets'),
      sample: 'cov_targets',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      minSample: 30,
      sources: PFR,
      tier: 'core'
    }
  ),
  metric(
    'coverage_ypt',
    'Yards per target allowed',
    'Y/T All',
    'Receiving yards allowed per target in his coverage.',
    {
      value: ratio('cov_yds', 'cov_targets'),
      sample: 'cov_targets',
      unit: 'yards',
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      minSample: 30,
      sources: PFR,
      tier: 'core'
    }
  ),
  metric(
    'coverage_rating',
    'Passer rating allowed',
    'Rate All',
    'The passer rating of throws into his coverage.',
    {
      value: rating('cov_targets', 'cov_cmp', 'cov_yds', 'cov_td', 'cov_int'),
      sample: 'cov_targets',
      unit: 'rating',
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      minSample: 30,
      sources: PFR,
      tier: 'core'
    }
  ),
  metric(
    'coverage_adot',
    'aDOT allowed',
    'aDOT All',
    'Average depth of the targets into his coverage.',
    {
      value: ratio('cov_adot_sum', 'cov_targets'),
      sample: 'cov_targets',
      unit: 'yards',
      family: 'charting',
      direction: 'neutral',
      positions: COVERAGE,
      minSample: 30,
      sources: PFR
    }
  ),
  metric(
    'coverage_yac',
    'YAC allowed per catch',
    'YAC All',
    'Yards after the catch allowed per completion in his coverage.',
    {
      value: ratio('cov_yac', 'cov_cmp'),
      sample: 'cov_cmp',
      unit: 'yards',
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      minSample: 20,
      sources: PFR
    }
  ),
  metric(
    'coverage_td',
    'TDs allowed',
    'TD All',
    'Touchdown catches allowed in his coverage.',
    count('cov_td', {
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      sources: PFR,
      tier: 'core'
    })
  ),
  metric(
    'coverage_int',
    'Interceptions in coverage',
    'INT Cov',
    'Interceptions on throws into his coverage.',
    count('cov_int', { family: 'charting', positions: COVERAGE, sources: PFR })
  ),
  metric(
    'def_ints',
    'Interceptions',
    'INT',
    'Passes intercepted.',
    count('def_ints', { positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'pass_defended',
    'Passes defended',
    'PD',
    'Passes broken up or intercepted.',
    count('pass_defended', { positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'forced_fumbles',
    'Forced fumbles',
    'FF',
    'Fumbles forced.',
    count('forced_fumbles', { positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'fumble_recoveries',
    'Fumble recoveries',
    'FR',
    'Fumbles recovered.',
    count('fumble_recoveries', { positions: DEFENDERS })
  ),
  metric(
    'def_tds',
    'Defensive TDs',
    'Def TD',
    'Touchdowns scored on defense.',
    count('def_tds', { positions: DEFENDERS, sources: BOX })
  ),
  metric(
    'def_pass_snaps',
    'Pass snaps',
    'Pass Snp',
    'Opponent dropbacks he was on the field for (participation, through the prior season).',
    count('def_pass_snaps', {
      positions: DEFENDERS,
      sources: PART,
      lastSeason: 'prior',
      tier: 'stored'
    })
  )
]

const KICKING: MetricDef[] = [
  metric(
    'fg_made',
    'Field goals made',
    'FGM',
    'Field goals made.',
    count('fg_made', { positions: K, sources: BOX, tier: 'core' })
  ),
  metric(
    'fg_att',
    'Field goal attempts',
    'FGA',
    'Field goals attempted.',
    count('fg_att', { positions: K, sources: BOX })
  ),
  metric(
    'fg_pct',
    'Field goal %',
    'FG%',
    'Field goals made per attempt; depends on the distances tried.',
    {
      value: ratio('fg_made', 'fg_att'),
      sample: 'fg_att',
      unit: 'pct',
      positions: K,
      minSample: 20,
      sources: BOX,
      tier: 'core'
    }
  ),
  metric('fg_pct_0_39', 'FG % under 40', 'FG% <40', 'Field goal % from under 40 yards.', {
    value:
      '({fg_made_0_19} + {fg_made_20_29} + {fg_made_30_39}) / nullif({fg_made_0_19} + {fg_made_20_29} + {fg_made_30_39} + {fg_missed_0_19} + {fg_missed_20_29} + {fg_missed_30_39}, 0)',
    sample: 'fg_att',
    unit: 'pct',
    positions: K,
    minSample: 20,
    sources: BOX
  }),
  metric('fg_pct_40_49', 'FG % 40–49', 'FG% 40s', 'Field goal % from 40–49 yards.', {
    value: '{fg_made_40_49} / nullif({fg_made_40_49} + {fg_missed_40_49}, 0)',
    sample: 'fg_att',
    unit: 'pct',
    positions: K,
    minSample: 20,
    sources: BOX,
    tier: 'core'
  }),
  metric('fg_pct_50p', 'FG % 50+', 'FG% 50+', 'Field goal % from 50 yards or more.', {
    value:
      '({fg_made_50_59} + {fg_made_60p}) / nullif({fg_made_50_59} + {fg_made_60p} + {fg_missed_50_59} + {fg_missed_60p}, 0)',
    sample: 'fg_att',
    unit: 'pct',
    positions: K,
    minSample: 20,
    sources: BOX,
    tier: 'core'
  }),
  metric(
    'fg_made_50p',
    'FGs made 50+',
    'FGM 50+',
    'Field goals made from 50 yards or more.',
    count('fg_made_50_59', { value: '{fg_made_50_59} + {fg_made_60p}', positions: K, sources: BOX })
  ),
  metric('pat_pct', 'Extra point %', 'XP%', 'Extra points made per attempt.', {
    value: ratio('pat_made', 'pat_att'),
    sample: 'pat_att',
    unit: 'pct',
    positions: K,
    minSample: 20,
    sources: BOX
  }),
  metric(
    'kicker_epa',
    'Field goal EPA',
    'FG EPA',
    'Expected points added on field goal attempts, summed.',
    count('fg_epa', { unit: 'epa', decimals: 1, family: 'advanced', positions: K })
  ),
  metric(
    'kickoff_tb_pct',
    'Kickoff touchback %',
    'KO TB%',
    'Share of kickoffs that became touchbacks.',
    {
      value: ratio('kickoff_touchbacks', 'kickoffs'),
      sample: 'kickoffs',
      unit: 'pct',
      direction: 'neutral',
      positions: K,
      minSample: 30
    }
  ),
  metric('punts', 'Punts', 'Punts', 'Punts.', count('punts', { positions: P, sources: BOX })),
  metric('punt_avg', 'Gross punting average', 'Gross', 'Yards per punt.', {
    value: ratio('punt_yds', 'punts'),
    sample: 'punts',
    unit: 'yards',
    positions: P,
    minSample: 30,
    sources: BOX
  }),
  metric(
    'punt_net_avg',
    'Net punting average',
    'Net',
    'Yards per punt after returns and touchbacks.',
    {
      value: ratio('punt_net_yds', 'punts'),
      sample: 'punts',
      unit: 'yards',
      positions: P,
      minSample: 30,
      sources: BOX,
      tier: 'core'
    }
  ),
  metric('punt_in20_rate', 'Inside-20 rate', 'In20%', 'Share of punts downed inside the 20.', {
    value: ratio('punt_in20', 'punts'),
    sample: 'punts',
    unit: 'pct',
    positions: P,
    minSample: 30,
    sources: BOX,
    tier: 'core'
  }),
  metric('punt_tb_rate', 'Punt touchback rate', 'TB%', 'Share of punts that became touchbacks.', {
    value: ratio('punt_tb', 'punts'),
    sample: 'punts',
    unit: 'pct',
    direction: 'lower',
    positions: P,
    minSample: 30,
    sources: BOX
  }),
  metric(
    'punter_epa',
    'EPA per punt',
    'Punt EPA',
    'Expected points added per punt, for the punting team.',
    {
      value: ratio('punt_epa', 'punts_pbp'),
      sample: 'punts_pbp',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      positions: P,
      minSample: 30,
      tier: 'core'
    }
  )
]

/** One team metric for each unit: `{x_…}` becomes `off_…` and `def_…`; defense reads the other way. */
function teamPair(
  id: string,
  label: string,
  short: string,
  description: string,
  o: Opts & { defense?: MetricDef['direction'] }
): MetricDef[] {
  const { defense, ...rest } = o
  const side = (prefix: 'off' | 'def'): Opts => ({
    ...rest,
    value: rest.value.replaceAll('{x_', `{${prefix}_`),
    sample: rest.sample.replace(/^x_/, `${prefix}_`)
  })
  const flip = (d: MetricDef['direction']): MetricDef['direction'] =>
    d === 'higher' ? 'lower' : d === 'lower' ? 'higher' : 'neutral'
  return [
    metric(`off_${id}`, label, short, description, {
      ...side('off'),
      entity: 'team',
      side: 'offense'
    }),
    metric(
      `def_${id}`,
      `${label} allowed`,
      `${short} All`,
      `Allowed by the defense: ${description.charAt(0).toLowerCase()}${description.slice(1)}`,
      {
        ...side('def'),
        entity: 'team',
        side: 'defense',
        direction: defense ?? flip(rest.direction ?? 'higher')
      }
    )
  ]
}

const team = (id: string, label: string, short: string, description: string, o: Opts): MetricDef =>
  metric(id, label, short, description, { entity: 'team', side: 'offense', ...o })

const TEAM: MetricDef[] = [
  team('games_played', 'Games', 'G', 'Games played.', count('games', { tier: 'core' })),
  team('wins', 'Wins', 'W', 'Wins.', count('wins', { tier: 'core' })),
  team('losses', 'Losses', 'L', 'Losses.', count('losses', { direction: 'lower', tier: 'core' })),
  team('win_pct', 'Win %', 'Win%', 'Wins per game, a tie counted as half.', {
    value: '({wins} + 0.5 * {ties}) / nullif({games}, 0)',
    sample: 'games',
    unit: 'pct',
    tier: 'core'
  }),
  team(
    'points_for',
    'Points scored',
    'PF',
    'Points scored.',
    count('points_for', { tier: 'core' })
  ),
  team(
    'points_against',
    'Points allowed',
    'PA',
    'Points allowed.',
    count('points_against', { side: 'defense', direction: 'lower', tier: 'core' })
  ),
  team(
    'point_diff',
    'Point differential',
    'Diff',
    'Points scored minus points allowed.',
    count('points_for', { value: '{points_for} - {points_against}', tier: 'core' })
  ),
  ...teamPair(
    'epa_play',
    'EPA per play',
    'EPA/play',
    'Expected points added per pass or run play: the best single measure of efficiency.',
    {
      value: ratio('x_epa', 'x_plays'),
      sample: 'x_plays',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      tier: 'core'
    }
  ),
  ...teamPair('success_rate', 'Success rate', 'Succ%', 'Share of plays with positive EPA.', {
    value: ratio('x_success', 'x_plays'),
    sample: 'x_plays',
    unit: 'pct',
    family: 'advanced',
    tier: 'core'
  }),
  ...teamPair(
    'pass_epa',
    'EPA per dropback',
    'Pass EPA',
    'EPA per dropback, sacks and scrambles included.',
    {
      value: ratio('x_dropback_epa', 'x_dropbacks'),
      sample: 'x_dropbacks',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      tier: 'core'
    }
  ),
  ...teamPair('rush_epa', 'EPA per carry', 'Rush EPA', 'EPA per carry.', {
    value: ratio('x_rush_epa', 'x_carries'),
    sample: 'x_carries',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    tier: 'core'
  }),
  ...teamPair(
    'pass_success',
    'Dropback success rate',
    'Pass Succ%',
    'Share of dropbacks with positive EPA.',
    {
      value: ratio('x_dropback_success', 'x_dropbacks'),
      sample: 'x_dropbacks',
      unit: 'pct',
      family: 'advanced'
    }
  ),
  ...teamPair(
    'rush_success',
    'Rushing success rate',
    'Rush Succ%',
    'Share of carries with positive EPA.',
    {
      value: ratio('x_rush_success', 'x_carries'),
      sample: 'x_carries',
      unit: 'pct',
      family: 'advanced'
    }
  ),
  ...teamPair(
    'early_down_epa',
    'Early-down EPA',
    'Early EPA',
    'EPA per play on first and second down, the most predictive situation.',
    {
      value: ratio('x_early_epa', 'x_early_plays'),
      sample: 'x_early_plays',
      unit: 'epa',
      decimals: 3,
      family: 'advanced'
    }
  ),
  ...teamPair(
    'third_down_pct',
    'Third-down conversion %',
    '3D%',
    'Share of third-down plays that gained a first down.',
    { value: ratio('x_third_conv', 'x_third_att'), sample: 'x_third_att', unit: 'pct' }
  ),
  ...teamPair(
    'fourth_down_pct',
    'Fourth-down conversion %',
    '4D%',
    'Share of fourth-down attempts that gained a first down.',
    { value: ratio('x_fourth_conv', 'x_fourth_att'), sample: 'x_fourth_att', unit: 'pct' }
  ),
  ...teamPair(
    'explosive_rate',
    'Explosive-play rate',
    'Expl%',
    'Share of plays gaining 20+ yards passing or 10+ rushing.',
    { value: ratio('x_explosive', 'x_plays'), sample: 'x_plays', unit: 'pct', family: 'advanced' }
  ),
  ...teamPair(
    'havoc_rate',
    'Havoc rate',
    'Havoc%',
    'Share of plays with a tackle for loss, sack, forced fumble, interception or pass defended.',
    {
      value: ratio('x_havoc', 'x_plays'),
      sample: 'x_plays',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      defense: 'higher'
    }
  ),
  ...teamPair(
    'line_yards',
    'Line yards per carry',
    'Line Yds',
    'Rushing yards credited to the line on designed runs: 120 % of losses, 100 % of 0–4 yards, 50 % of 5–10, nothing beyond (the public Football Outsiders formula).',
    {
      value: ratio('x_line_yds', 'x_designed_runs'),
      sample: 'x_designed_runs',
      unit: 'yards',
      decimals: 2,
      family: 'advanced'
    }
  ),
  ...teamPair(
    'stuff_rate',
    'Stuff rate',
    'Stuff%',
    'Share of carries stopped at or behind the line.',
    {
      value: ratio('x_rush_stuffed', 'x_carries'),
      sample: 'x_carries',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      defense: 'higher'
    }
  ),
  ...teamPair('sack_rate', 'Sack rate', 'Sk%', 'Sacks per dropback.', {
    value: ratio('x_sacks', 'x_dropbacks'),
    sample: 'x_dropbacks',
    unit: 'pct',
    direction: 'lower',
    defense: 'higher'
  }),
  ...teamPair(
    'pressure_rate',
    'Pressure rate',
    'Prss%',
    'Share of dropbacks under pressure (participation, through the prior season).',
    {
      value: ratio('x_pressured', 'x_pressure_known'),
      sample: 'x_pressure_known',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      defense: 'higher',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  ...teamPair('turnovers', 'Turnovers', 'TO', 'Interceptions thrown and fumbles lost.', {
    ...count('x_turnovers', { direction: 'lower' }),
    defense: 'higher'
  }),
  ...teamPair('pass_yds_game', 'Passing yards per game', 'Pass Y/G', 'Passing yards per game.', {
    value: ratio('x_pass_yds', 'games'),
    sample: 'games',
    unit: 'yards'
  }),
  ...teamPair('rush_yds_game', 'Rushing yards per game', 'Rush Y/G', 'Rushing yards per game.', {
    value: ratio('x_rush_yds', 'games'),
    sample: 'games',
    unit: 'yards'
  }),
  team(
    'turnover_margin',
    'Turnover margin',
    'TO +/-',
    'Takeaways minus giveaways.',
    count('def_turnovers', { value: '{def_turnovers} - {off_turnovers}' })
  ),
  team('points_per_drive', 'Points per drive', 'Pts/Dr', 'Points scored per offensive drive.', {
    value: ratio('drive_points', 'drives'),
    sample: 'drives',
    unit: 'points',
    decimals: 2,
    family: 'advanced',
    tier: 'core'
  }),
  team(
    'def_points_per_drive',
    'Points per drive allowed',
    'Pts/Dr All',
    'Points the opponents scored per drive.',
    {
      value: ratio('def_drive_points', 'def_drives'),
      sample: 'def_drives',
      unit: 'points',
      decimals: 2,
      family: 'advanced',
      side: 'defense',
      direction: 'lower',
      tier: 'core'
    }
  ),
  team(
    'td_drive_rate',
    'Touchdown drive rate',
    'TD Dr%',
    'Share of drives ending in a touchdown.',
    { value: ratio('td_drives', 'drives'), sample: 'drives', unit: 'pct', family: 'advanced' }
  ),
  team(
    'three_and_out_rate',
    'Three-and-out rate',
    '3&Out%',
    'Share of drives ending in a punt after three plays or fewer.',
    { value: ratio('three_and_outs', 'drives'), sample: 'drives', unit: 'pct', direction: 'lower' }
  ),
  team(
    'start_field_position',
    'Average starting field position',
    'Start',
    'Average yards from the opponent’s end zone where drives start: lower is better.',
    {
      value: ratio('drive_start_sum', 'drives'),
      sample: 'drives',
      unit: 'yards',
      direction: 'lower'
    }
  ),
  team(
    'proe',
    'Pass rate over expected',
    'PROE',
    'Dropback rate above what nflfastR’s model expects from down, distance, score and time, in percentage points: how pass-happy a team is.',
    {
      value: ratio('off_pass_oe_sum', 'off_pass_oe_n'),
      sample: 'off_pass_oe_n',
      unit: 'pp',
      family: 'advanced',
      direction: 'neutral',
      tier: 'core'
    }
  ),
  team(
    'neutral_proe',
    'Neutral PROE',
    'Neut PROE',
    'Pass rate over expected on early downs in neutral game states (win probability 20–80 %).',
    {
      value: ratio('off_neutral_pass_oe', 'off_neutral_xpass_n'),
      sample: 'off_neutral_xpass_n',
      unit: 'pp',
      family: 'advanced',
      direction: 'neutral'
    }
  ),
  team(
    'neutral_pass_rate',
    'Neutral pass rate',
    'Neut Pass%',
    'Dropback rate on early downs in neutral game states.',
    {
      value: ratio('off_neutral_dropbacks', 'off_neutral_plays'),
      sample: 'off_neutral_plays',
      unit: 'pct',
      family: 'advanced',
      direction: 'neutral',
      tier: 'core'
    }
  ),
  team(
    'neutral_pace',
    'Neutral pace',
    'Pace',
    'Seconds between plays in neutral game states: lower is faster.',
    {
      value: ratio('pace_secs', 'pace_plays'),
      sample: 'pace_plays',
      unit: 'seconds',
      family: 'advanced',
      direction: 'neutral',
      tier: 'core'
    }
  ),
  team('no_huddle_rate', 'No-huddle rate', 'NoHud%', 'Share of plays run without a huddle.', {
    value: ratio('off_no_huddle', 'off_plays'),
    sample: 'off_plays',
    unit: 'pct',
    direction: 'neutral',
    tier: 'core'
  }),
  team('shotgun_rate', 'Shotgun rate', 'Gun%', 'Share of plays from the shotgun.', {
    value: ratio('off_shotgun', 'off_plays'),
    sample: 'off_plays',
    unit: 'pct',
    direction: 'neutral',
    tier: 'core'
  }),
  team(
    'team_play_action_rate',
    'Play-action rate',
    'PA%',
    'Share of dropbacks with a play-action fake (FTN, 2022+).',
    {
      value: ratio('off_play_action', 'off_ftn_dropbacks'),
      sample: 'off_ftn_dropbacks',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team(
    'team_play_action_epa',
    'Play-action EPA',
    'PA EPA',
    'EPA per play-action dropback (FTN, 2022+).',
    {
      value: ratio('off_play_action_epa', 'off_play_action'),
      sample: 'off_play_action',
      unit: 'epa',
      decimals: 3,
      family: 'charting',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team('rpo_rate', 'RPO rate', 'RPO%', 'Share of plays that were run-pass options (FTN, 2022+).', {
    value: ratio('off_rpo', 'off_ftn_plays'),
    sample: 'off_ftn_plays',
    unit: 'pct',
    family: 'charting',
    direction: 'neutral',
    sources: FTN,
    firstSeason: 2022
  }),
  team(
    'screen_rate',
    'Screen rate',
    'Scrn%',
    'Share of dropbacks that were screens (FTN, 2022+).',
    {
      value: ratio('off_screens', 'off_ftn_dropbacks'),
      sample: 'off_ftn_dropbacks',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team('motion_rate', 'Motion rate', 'Mot%', 'Share of plays with pre-snap motion (FTN, 2022+).', {
    value: ratio('off_motion', 'off_ftn_plays'),
    sample: 'off_ftn_plays',
    unit: 'pct',
    family: 'charting',
    direction: 'neutral',
    sources: FTN,
    firstSeason: 2022
  }),
  team(
    'personnel_11_rate',
    '11 personnel rate',
    '11%',
    'Share of plays with one back and one tight end (participation, through the prior season).',
    {
      value: ratio('off_personnel_11', 'off_personnel_known'),
      sample: 'off_personnel_known',
      unit: 'pct',
      direction: 'neutral',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'personnel_12_rate',
    '12 personnel rate',
    '12%',
    'Share of plays with one back and two tight ends (participation, through the prior season).',
    {
      value: ratio('off_personnel_12', 'off_personnel_known'),
      sample: 'off_personnel_known',
      unit: 'pct',
      direction: 'neutral',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'personnel_21_rate',
    '21 personnel rate',
    '21%',
    'Share of plays with two backs and one tight end (participation, through the prior season).',
    {
      value: ratio('off_personnel_21', 'off_personnel_known'),
      sample: 'off_personnel_known',
      unit: 'pct',
      direction: 'neutral',
      sources: PART,
      lastSeason: 'prior',
      tier: 'stored'
    }
  ),
  team(
    'def_blitz_rate',
    'Blitz rate',
    'Blitz%',
    'Share of opponent dropbacks with a blitz (FTN, 2022+).',
    {
      value: ratio('def_blitzed', 'def_ftn_dropbacks'),
      sample: 'def_ftn_dropbacks',
      unit: 'pct',
      family: 'charting',
      side: 'defense',
      direction: 'neutral',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team(
    'def_pass_rushers',
    'Pass rushers per dropback',
    'Rushers',
    'Average number of pass rushers (FTN, 2022+).',
    {
      value: ratio('def_pass_rushers_sum', 'def_pass_rushers_n'),
      sample: 'def_pass_rushers_n',
      unit: 'number',
      decimals: 2,
      family: 'charting',
      side: 'defense',
      direction: 'neutral',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team(
    'def_man_rate',
    'Man coverage rate',
    'Man%',
    'Share of opponent dropbacks in man coverage (participation, through the prior season).',
    {
      value: ratio('def_man', 'def_coverage_known'),
      sample: 'def_coverage_known',
      unit: 'pct',
      family: 'advanced',
      side: 'defense',
      direction: 'neutral',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'def_man_epa',
    'EPA allowed in man',
    'Man EPA',
    'EPA per dropback allowed in man coverage (participation, through the prior season).',
    {
      value: ratio('def_man_epa', 'def_man'),
      sample: 'def_man',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      side: 'defense',
      direction: 'lower',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'def_zone_epa',
    'EPA allowed in zone',
    'Zone EPA',
    'EPA per dropback allowed in zone coverage (participation, through the prior season).',
    {
      value: ratio('def_zone_epa', 'def_zone'),
      sample: 'def_zone',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      side: 'defense',
      direction: 'lower',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'def_box',
    'Defenders in the box',
    'Box',
    'Average defenders in the box on opponent runs (participation, else FTN).',
    {
      value: ratio('def_box_sum', 'def_box_known'),
      sample: 'def_box_known',
      unit: 'number',
      decimals: 2,
      family: 'charting',
      side: 'defense',
      direction: 'neutral',
      sources: [...PART, ...FTN]
    }
  ),
  team('team_fg_pct', 'Field goal %', 'FG%', 'Field goals made per attempt.', {
    value: ratio('fg_made', 'fg_att'),
    sample: 'fg_att',
    unit: 'pct',
    side: 'special',
    sources: BOX
  }),
  team('team_punt_net_avg', 'Net punting average', 'Net', 'Net yards per punt.', {
    value: ratio('punt_net_yds', 'punts'),
    sample: 'punts',
    unit: 'yards',
    side: 'special',
    sources: BOX
  }),
  team('team_kr_avg', 'Kick return average', 'KR Avg', 'Yards per kickoff return.', {
    value: ratio('kr_yds', 'kr'),
    sample: 'kr',
    unit: 'yards',
    side: 'special',
    sources: BOX
  }),
  team('team_pr_avg', 'Punt return average', 'PR Avg', 'Yards per punt return.', {
    value: ratio('pr_yds', 'pr'),
    sample: 'pr',
    unit: 'yards',
    side: 'special',
    sources: BOX
  }),
  team(
    'team_st_tds',
    'Special-teams TDs',
    'ST TD',
    'Return and other special-teams touchdowns.',
    count('st_tds', { side: 'special', sources: BOX })
  ),
  team(
    'implied_points',
    'Implied points per game',
    'Implied',
    'Points the betting line implies per game: (total + expected margin) / 2.',
    {
      value: ratio('implied_points', 'games'),
      sample: 'games',
      unit: 'points',
      family: 'predictive',
      sources: LINES,
      tier: 'core'
    }
  ),
  team(
    'spread',
    'Average expected margin',
    'Margin',
    'Average expected margin from the betting line; positive means favoured.',
    {
      value: ratio('line_margin', 'games'),
      sample: 'games',
      unit: 'points',
      family: 'predictive',
      sources: LINES,
      tier: 'core'
    }
  ),
  team('total_line', 'Average total', 'Total', 'Average over/under of its games.', {
    value: ratio('total_line', 'games'),
    sample: 'games',
    unit: 'points',
    family: 'predictive',
    direction: 'neutral',
    sources: LINES
  }),
  ...(['qb', 'rb', 'wr', 'te', 'k'] as const).map((p) =>
    team(
      `fpa_${p}`,
      `Fantasy points allowed to ${p.toUpperCase()}s`,
      `FPA ${p.toUpperCase()}`,
      `Fantasy points per game the defense allowed to ${p.toUpperCase()}s under the chosen scoring: high means a good matchup for them.`,
      {
        value: ratio(`fpa_${p}`, 'games'),
        sample: 'games',
        unit: 'points',
        side: 'defense',
        direction: 'lower',
        sources: SLEEPER,
        scoring: true,
        tier: 'core'
      }
    )
  )
]

const MODEL = ['FantasyCompanion models (nflverse data)']
const COMBINE_SRC = ['NFL Scouting Combine (nflverse)']

/** A team model state at the end of the scope (spec §8): one value, not a sum. */
const state = (name: string, o: Partial<Opts> = {}): Opts => ({
  value: `{last:${name}}`,
  sample: 'games',
  family: 'predictive',
  sources: MODEL,
  ...o
})

/**
 * QB EPA + CPOE composite (spec §6.2, moved from Plan Y): the average of the two in standard
 * deviations of qualified QB seasons (200+ dropbacks, 2019–2025: EPA/dropback 0.058 ± 0.131, CPOE
 * 0.53 ± 3.28), so 0 is an average starter and +1 a top-six one.
 */
const COMPOSITE = `((${ratio('db_epa', 'dropbacks')} - 0.058) / 0.131 + (${ratio('cpoe_sum', 'cpoe_n')} - 0.53) / 3.28) / 2`

/** Wins a team's points imply (Pythagorean expectation, exponent 2.37). */
const PYTHAG =
  'pow({points_for}, 2.37) / nullif(pow({points_for}, 2.37) + pow({points_against}, 2.37), 0)'
const FUMBLES_RECOVERED = '({off_fumbles} - {off_fumbles_lost} + {def_fumbles_lost})'
const FUMBLE_LUCK = `${FUMBLES_RECOVERED} - 0.5 * ({off_fumbles} + {def_fumbles})`
const INT_LUCK = '({def_ftn_ints} - {def_xints}) - ({off_ftn_ints} - {off_xints})'

/** Plan Z (spec §8): ratings, forecasts, luck, FG over expected, outlook and profile metrics. */
const MODELS: MetricDef[] = [
  team(
    'elo',
    'Elo rating',
    'Elo',
    'Team strength from game results (nfelo-style Elo: 1500 is average; 25 points ≈ one point of spread).',
    state('elo', { unit: 'number', decimals: 0, tier: 'core' })
  ),
  team(
    'srs',
    'Simple Rating System',
    'SRS',
    'Average margin adjusted for the opponents faced: points better than an average team on a neutral field.',
    state('srs', { unit: 'points', tier: 'core' })
  ),
  team(
    'adj_off_epa',
    'Adjusted EPA/play',
    'Adj EPA',
    'Offensive EPA per play adjusted for the defenses faced and home field (a ridge regression; garbage time left out). Our own adjustment, not DVOA.',
    state('adj_off_epa', { unit: 'epa', decimals: 3, tier: 'core' })
  ),
  team(
    'adj_def_epa',
    'Adjusted EPA/play allowed',
    'Adj EPA All',
    'EPA per play allowed, adjusted for the offenses faced and home field: lower is better.',
    state('adj_def_epa', {
      unit: 'epa',
      decimals: 3,
      side: 'defense',
      direction: 'lower',
      tier: 'core'
    })
  ),
  team(
    'adj_net_epa',
    'Adjusted EPA margin',
    'Adj Net',
    'Adjusted EPA per play on offense minus allowed on defense: the overall efficiency margin.',
    state('adj_off_epa', {
      value: '{last:adj_off_epa} - {last:adj_def_epa}',
      unit: 'epa',
      decimals: 3,
      tier: 'core'
    })
  ),
  team(
    'adj_off_pass_epa',
    'Adjusted EPA/dropback',
    'Adj Pass',
    'Adjusted EPA per dropback on offense.',
    state('adj_off_pass_epa', { unit: 'epa', decimals: 3 })
  ),
  team(
    'adj_off_rush_epa',
    'Adjusted EPA/rush',
    'Adj Rush',
    'Adjusted EPA per designed run on offense.',
    state('adj_off_rush_epa', { unit: 'epa', decimals: 3 })
  ),
  team(
    'adj_def_pass_epa',
    'Adjusted EPA/dropback allowed',
    'Adj Pass All',
    'Adjusted EPA per dropback allowed.',
    state('adj_def_pass_epa', { unit: 'epa', decimals: 3, side: 'defense', direction: 'lower' })
  ),
  team(
    'adj_def_rush_epa',
    'Adjusted EPA/rush allowed',
    'Adj Rush All',
    'Adjusted EPA per designed run allowed.',
    state('adj_def_rush_epa', { unit: 'epa', decimals: 3, side: 'defense', direction: 'lower' })
  ),
  team(
    'adj_recent_off_epa',
    'Recent adjusted EPA/play',
    'Rec EPA',
    'Adjusted EPA per play with recent games weighted more (a game counts half every 4 weeks back).',
    state('adj_recent_off_epa', { unit: 'epa', decimals: 3 })
  ),
  team(
    'adj_recent_def_epa',
    'Recent adjusted EPA/play allowed',
    'Rec EPA All',
    'Adjusted EPA per play allowed, recent games weighted more.',
    state('adj_recent_def_epa', { unit: 'epa', decimals: 3, side: 'defense', direction: 'lower' })
  ),
  ...(['pass', 'rush'] as const).flatMap((k) => [
    team(
      `adj_recent_off_${k}_epa`,
      `Recent adjusted EPA/${k === 'pass' ? 'dropback' : 'rush'}`,
      `Rec ${k === 'pass' ? 'Pass' : 'Rush'}`,
      `Adjusted EPA per ${k === 'pass' ? 'dropback' : 'designed run'}, recent games weighted more.`,
      state(`adj_recent_off_${k}_epa`, { unit: 'epa', decimals: 3, tier: 'stored' })
    ),
    team(
      `adj_recent_def_${k}_epa`,
      `Recent adjusted EPA/${k === 'pass' ? 'dropback' : 'rush'} allowed`,
      `Rec ${k === 'pass' ? 'Pass' : 'Rush'} All`,
      `Adjusted EPA per ${k === 'pass' ? 'dropback' : 'designed run'} allowed, recent games weighted more.`,
      state(`adj_recent_def_${k}_epa`, {
        unit: 'epa',
        decimals: 3,
        side: 'defense',
        direction: 'lower',
        tier: 'stored'
      })
    )
  ]),
  team(
    'pythag_win_pct',
    'Pythagorean win %',
    'Pyth%',
    'The win % a team’s points scored and allowed imply (exponent 2.37): a steadier guide to strength than the record.',
    { value: PYTHAG, sample: 'games', unit: 'pct', family: 'predictive', tier: 'core' }
  ),
  team('pythag_wins', 'Pythagorean wins', 'Pyth W', 'Games × Pythagorean win %.', {
    value: `{games} * ${PYTHAG}`,
    sample: 'games',
    kind: 'count',
    unit: 'number',
    decimals: 1,
    family: 'predictive',
    tier: 'core'
  }),
  team(
    'luck_wins',
    'Wins over Pythagorean',
    'Luck',
    'Wins (a tie half) minus Pythagorean wins: far above zero usually means close games went its way, which rarely lasts.',
    {
      value: `{wins} + 0.5 * {ties} - {games} * ${PYTHAG}`,
      sample: 'games',
      kind: 'count',
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      direction: 'neutral',
      tier: 'core'
    }
  ),
  team(
    'elo_xwins',
    'Elo expected wins',
    'Elo xW',
    'The sum of the pre-game Elo win probabilities of its games.',
    {
      value: '{elo_wp}',
      sample: 'elo_games',
      kind: 'count',
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      sources: MODEL
    }
  ),
  team(
    'elo_luck',
    'Wins over Elo expectation',
    'Elo Luck',
    'Wins minus the Elo expected wins of its games.',
    {
      value: '{wins} + 0.5 * {ties} - {elo_wp}',
      sample: 'elo_games',
      kind: 'count',
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      direction: 'neutral',
      sources: MODEL
    }
  ),
  team(
    'vegas_xwins',
    'Vegas expected wins',
    'Vegas xW',
    'The sum of the win probabilities the betting market gave its games (no-vig moneyline).',
    {
      value: '{vegas_wp}',
      sample: 'vegas_games',
      kind: 'count',
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      sources: LINES
    }
  ),
  team(
    'sos_elo',
    'Schedule strength played (Elo)',
    'SOS',
    'The average current Elo of the opponents faced so far: above 1500 means a hard schedule.',
    state('sos_elo', { unit: 'number', decimals: 0, direction: 'neutral', tier: 'core' })
  ),
  team(
    'sos_adj',
    'Schedule strength played (adjusted EPA)',
    'SOS EPA',
    'The average adjusted EPA margin of the opponents faced so far.',
    state('sos_adj', { unit: 'epa', decimals: 3, direction: 'neutral' })
  ),
  team(
    'sos_left_elo',
    'Remaining schedule strength (Elo)',
    'SOS Left',
    'The average current Elo of the regular-season opponents still to play.',
    state('sos_left_elo', { unit: 'number', decimals: 0, direction: 'neutral', tier: 'core' })
  ),
  team(
    'sos_left_adj',
    'Remaining schedule strength (adjusted EPA)',
    'SOS Left EPA',
    'The average adjusted EPA margin of the regular-season opponents still to play.',
    state('sos_left_adj', { unit: 'epa', decimals: 3, direction: 'neutral' })
  ),
  team(
    'games_left',
    'Games left',
    'Left',
    'Regular-season games still to play.',
    state('games_left', { unit: 'count', decimals: 0, direction: 'neutral', tier: 'stored' })
  ),
  team(
    'proj_wins',
    'Projected wins',
    'Proj W',
    'Average wins over 10,000 simulations of the rest of the regular season from the current Elo ratings.',
    state('proj_wins', { unit: 'number', decimals: 1, tier: 'core' })
  ),
  team(
    'proj_losses',
    'Projected losses',
    'Proj L',
    'Average losses over the simulations.',
    state('proj_losses', { unit: 'number', decimals: 1, direction: 'lower' })
  ),
  team(
    'playoff_pct',
    'Playoff odds',
    'Playoff%',
    'Share of the simulated seasons in which it makes the playoffs (NFL tiebreakers, approximated).',
    state('playoff_pct', { unit: 'pct', tier: 'core' })
  ),
  team(
    'division_pct',
    'Division odds',
    'Div%',
    'Share of the simulated seasons in which it wins its division.',
    state('division_pct', { unit: 'pct', tier: 'core' })
  ),
  team(
    'bye_pct',
    'First-round bye odds',
    'Bye%',
    'Share of the simulated seasons in which it is the top seed (the top two in 2019).',
    state('bye_pct', { unit: 'pct' })
  ),
  team(
    'conference_pct',
    'Conference title odds',
    'Conf%',
    'Share of the simulated seasons in which it reaches the Super Bowl.',
    state('conference_pct', { unit: 'pct' })
  ),
  team(
    'sb_pct',
    'Super Bowl odds',
    'SB%',
    'Share of the simulated seasons in which it wins the Super Bowl.',
    state('sb_pct', { unit: 'pct', tier: 'core' })
  ),
  team(
    'fumble_recovery_pct',
    'Fumble recovery %',
    'FR%',
    'Share of all fumbles in its games (its own and the opponents’) it recovered: about 50 % in the long run, so far from it is luck.',
    {
      value: `${FUMBLES_RECOVERED} / nullif({off_fumbles} + {def_fumbles}, 0)`,
      sample: 'games',
      unit: 'pct',
      family: 'predictive',
      direction: 'neutral',
      sources: [...PBP, ...MODEL]
    }
  ),
  team(
    'fumble_luck',
    'Fumble luck',
    'Fum Luck',
    'Fumbles recovered minus half of all fumbles in its games.',
    {
      value: FUMBLE_LUCK,
      sample: 'games',
      kind: 'count',
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      direction: 'neutral',
      sources: [...PBP, ...MODEL]
    }
  ),
  team(
    'int_luck',
    'Interception luck',
    'INT Luck',
    'Interceptions made minus expected (from the interception-worthy throws it faced), minus the same for its own passes. FTN charting, from 2022.',
    {
      value: INT_LUCK,
      sample: 'games',
      kind: 'count',
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      direction: 'neutral',
      sources: [...FTN, ...MODEL],
      firstSeason: 2022
    }
  ),
  team(
    'turnover_luck',
    'Turnover luck',
    'TO Luck',
    'Fumble luck plus interception luck: turnovers gained beyond what the plays deserved. Tends to vanish the next season.',
    {
      value: `${FUMBLE_LUCK} + ${INT_LUCK}`,
      sample: 'games',
      kind: 'count',
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      direction: 'neutral',
      sources: [...PBP, ...FTN, ...MODEL],
      firstSeason: 2022,
      tier: 'core'
    }
  ),
  team(
    'team_fgoe',
    'FG over expected',
    'FGOE',
    'Field goals made minus the FG model’s expected makes for the kicks tried.',
    {
      value: '{fg_model_made} - {fg_xmade}',
      sample: 'fg_model_att',
      kind: 'count',
      unit: 'number',
      decimals: 1,
      side: 'special',
      family: 'predictive',
      sources: [...PBP, ...MODEL]
    }
  ),
  metric(
    'fgoe',
    'FG over expected',
    'FGOE',
    'Field goals made minus expected makes, from a model of distance, roof, cold, wind and surface: kicking skill beyond the kicks tried.',
    {
      value: '{fg_model_made} - {fg_xmade}',
      sample: 'fg_model_att',
      kind: 'count',
      unit: 'number',
      decimals: 1,
      positions: K,
      minSample: 20,
      family: 'predictive',
      sources: [...PBP, ...MODEL],
      tier: 'core'
    }
  ),
  metric('fgoe_pct', 'FG % over expected', 'FGOE%', 'FG over expected per attempt.', {
    value: '({fg_model_made} - {fg_xmade}) / nullif({fg_model_att}, 0)',
    sample: 'fg_model_att',
    unit: 'pct',
    positions: K,
    minSample: 20,
    family: 'predictive',
    sources: [...PBP, ...MODEL],
    tier: 'core'
  }),
  metric(
    'fg_expected_pct',
    'Expected FG %',
    'xFG%',
    'The FG % the model expects for the kicks tried: lower means harder kicks.',
    {
      value: '{fg_xmade} / nullif({fg_model_att}, 0)',
      sample: 'fg_model_att',
      unit: 'pct',
      positions: K,
      minSample: 20,
      family: 'predictive',
      direction: 'neutral',
      sources: [...PBP, ...MODEL]
    }
  ),
  metric(
    'epa_cpoe_composite',
    'EPA + CPOE composite',
    'EPA+CPOE',
    'EPA per dropback and CPOE averaged in standard deviations of qualified QB seasons (2019–2025): 0 is an average starter, +1 a top-six passer.',
    {
      value: COMPOSITE,
      sample: 'dropbacks',
      unit: 'number',
      decimals: 2,
      family: 'advanced',
      positions: QB,
      minSample: 200,
      sources: [...PBP, ...MODEL],
      tier: 'core'
    }
  ),
  metric(
    'fp_ceiling',
    'Ceiling',
    'Ceil',
    'The 80th percentile of the weekly fantasy points in scope, under the chosen scoring: a good week.',
    {
      value: '{p80:fp}',
      sample: 'games',
      unit: 'points',
      family: 'predictive',
      positions: SKILL,
      sources: SLEEPER,
      scoring: true,
      tier: 'core'
    }
  ),
  metric(
    'fp_floor',
    'Floor',
    'Floor',
    'The 20th percentile of the weekly fantasy points in scope: a bad week.',
    {
      value: '{p20:fp}',
      sample: 'games',
      unit: 'points',
      family: 'predictive',
      positions: SKILL,
      sources: SLEEPER,
      scoring: true,
      tier: 'core'
    }
  ),
  metric(
    'boom_rate',
    'Boom rate',
    'Boom%',
    'Share of games with a top-12 weekly finish at the position (top 24 for RB and WR), under the chosen scoring.',
    {
      value: '{boom} / nullif({games}, 0)',
      sample: 'games',
      unit: 'pct',
      family: 'predictive',
      positions: SKILL,
      sources: SLEEPER,
      scoring: true,
      tier: 'core'
    }
  ),
  metric(
    'bust_rate',
    'Bust rate',
    'Bust%',
    'Share of games finishing outside the top 36 at the position (48 for RB and WR).',
    {
      value: '{bust} / nullif({games}, 0)',
      sample: 'games',
      unit: 'pct',
      family: 'predictive',
      positions: SKILL,
      direction: 'lower',
      sources: SLEEPER,
      scoring: true,
      tier: 'core'
    }
  ),
  metric(
    'ras',
    'Athletic score (RAS-style)',
    'RAS',
    'Combine measures scored 0–10 by percentile within the position since 2000, averaged over those he did (four at least). Our version of Kent Lee Platte’s Relative Athletic Score, so values differ from his.',
    {
      value: '{last:ras}',
      sample: 'games',
      unit: 'number',
      decimals: 2,
      family: 'advanced',
      sources: COMBINE_SRC,
      tier: 'core'
    }
  ),
  metric(
    'ras_measures',
    'Combine measures',
    'Measures',
    'How many of the eight combine measures the athletic score uses: fewer than eight is a partial score.',
    {
      value: '{last:ras_measures}',
      sample: 'games',
      unit: 'count',
      decimals: 0,
      direction: 'neutral',
      sources: COMBINE_SRC,
      tier: 'stored'
    }
  ),
  metric(
    'speed_score',
    'Speed Score',
    'Speed',
    'Speed for the size: 200 × weight / 40-yard time⁴ (Bill Barnwell); about 100 is average for a back.',
    {
      value: '{last:speed_score}',
      sample: 'games',
      unit: 'number',
      decimals: 1,
      family: 'advanced',
      sources: COMBINE_SRC,
      tier: 'core'
    }
  ),
  ...(
    [
      ['height', 'Height', 'Ht', 'inches', 'number', 0, 'neutral'],
      ['weight', 'Weight', 'Wt', 'pounds', 'number', 0, 'neutral'],
      ['forty', '40-yard dash', '40', 'seconds', 'seconds', 2, 'lower'],
      ['bench', 'Bench press', 'Bench', 'repetitions of 225 pounds', 'count', 0, 'higher'],
      ['vertical', 'Vertical jump', 'Vert', 'inches', 'number', 1, 'higher'],
      ['broad_jump', 'Broad jump', 'Broad', 'inches', 'number', 0, 'higher'],
      ['cone', '3-cone drill', '3-Cone', 'seconds', 'seconds', 2, 'lower'],
      ['shuttle', 'Short shuttle', 'Shuttle', 'seconds', 'seconds', 2, 'lower']
    ] as const
  ).flatMap(([name, label, short, what, unit, decimals, direction]) => [
    metric(name, label, short, `The ${label.toLowerCase()} at the combine, in ${what}.`, {
      value: `{last:${name}}`,
      sample: 'games',
      unit,
      decimals,
      direction,
      sources: COMBINE_SRC
    }),
    metric(
      `${name}_score`,
      `${label} score`,
      `${short} Sc`,
      `The ${label.toLowerCase()} as a 0–10 percentile within the position over every combine since 2000.`,
      {
        value: `{last:${name}_score}`,
        sample: 'games',
        unit: 'number',
        decimals: 1,
        family: 'advanced',
        sources: COMBINE_SRC,
        tier: 'stored'
      }
    )
  ])
]

export const CATALOGUE: MetricDef[] = [
  ...PASSING,
  ...RUSHING,
  ...RECEIVING,
  ...USAGE,
  ...FANTASY,
  ...DEFENSE,
  ...KICKING,
  ...TEAM,
  ...MODELS
]

export const METRICS: ReadonlyMap<string, MetricDef> = new Map(CATALOGUE.map((m) => [m.id, m]))

/** `{name}`, `{last:name}`, `{p80:name}` and `{p20:name}` in a formula (types.ts `MetricDef`). */
export const TOKEN = /\{(?:(last|p80|p20):)?([a-z0-9_]+)\}/g

/** The tokens a formula reads (`name`, `last:name`, `p80:name`), and its sample. */
export function componentsOf(def: Pick<MetricDef, 'value' | 'sample'>): string[] {
  const names = [...def.value.matchAll(TOKEN)].map((m) => (m[1] ? `${m[1]}:${m[2]}` : m[2]))
  return [...new Set([...names, def.sample])]
}
