import type { WhTeamWeek } from '@main/db/repos/warehouse'
import type { Bag } from './bag'
import { counts, isScrimmage, type Play } from './play'
import { TeamBags } from './weekBags'

/** Spec §6.3: neutral script = win probability 20–80 % in quarters 1–3. */
const neutral = (p: Play): boolean =>
  p.wp !== null && p.wp >= 0.2 && p.wp <= 0.8 && p.qtr !== null && p.qtr <= 3

/** The metrics of one play, written to the offense's `off_` bag and the defense's `def_` bag. */
function record(b: Bag, p: Play): void {
  if (p.penalty && p.penaltyTeam) {
    const by = p.penaltyTeam === p.posteam ? 'offense' : 'defense'
    b.add(`pen_${by}_n`)
    b.add(`pen_${by}_yds`, p.penaltyYards)
  }
  if (p.twoPoint && !p.noPlay) {
    b.add('two_pt_att')
    b.addIf('two_pt_conv', p.twoPointSuccess)
  }
  if (!counts(p)) return
  if (p.special) b.add('st_epa_sum', p.epa)
  if (p.kickoff) b.addIf('ko_touchbacks', p.touchback)
  b.addIf('punts', p.punt)
  b.addIf('fourth_downs', p.down === 4 && (isScrimmage(p) || p.punt || p.fieldGoal))
  if (!isScrimmage(p)) return
  b.add('plays')
  b.add('epa_sum', p.epa)
  b.addIf('success_n', p.success)
  for (const [kind, is] of [
    ['pass', p.pass],
    ['rush', p.rush]
  ] as const) {
    if (!is) continue
    b.add(`${kind}_plays`)
    b.add(`${kind}_epa_sum`, p.epa)
    b.addIf(`${kind}_success_n`, p.success)
  }
  if (p.down === 1 || p.down === 2) {
    b.add('early_plays')
    b.add('early_epa_sum', p.epa)
  }
  const gained = p.yardsGained ?? 0
  b.addIf('explosive_rush', p.rush && gained >= 10)
  b.addIf('explosive_pass', p.pass && p.complete && gained >= 20)
  if (p.xpass !== null) {
    b.add('xpass_sum', p.xpass)
    b.add('pass_oe_sum', p.passOe)
    b.add('xpass_n')
  }
  if (neutral(p)) {
    b.add('neutral_plays')
    b.addIf('neutral_passes', p.pass)
  }
  b.addIf('no_huddle', p.noHuddle)
  b.addIf('shotgun', p.shotgun)
  if (p.down === 3) {
    b.add('third_att')
    b.addIf('third_conv', p.thirdConverted)
  }
  if (p.down === 4) {
    b.add('fourth_go')
    b.addIf('fourth_conv', p.fourthConverted)
    b.addIf('fourth_failed', p.fourthFailed)
  }
  b.addIf('turnovers', p.interception)
  b.addIf('turnovers', p.fumbleLost)
  b.addIf('havoc', p.tackledForLoss || p.fumbleForced || p.interception || p.passDefended)
}

export interface DriveSummary {
  /** The drive's first snap: its season, week, teams and starting field position. */
  first: Play
  team: string
  opponent: string
  plays: number
  /** Net yards (`ydsnet` of its last row). */
  yards: number | null
  seconds: number | null
  points: number
  threeAndOut: boolean
  scored: boolean
  turnover: boolean
  punt: boolean
  redZone: boolean
  touchdown: boolean
  goalToGo: boolean
}

function firstOf<T>(rows: Play[], pick: (p: Play) => T | null): T | null {
  for (const p of rows) {
    const value = pick(p)
    if (value !== null) return value
  }
  return null
}

/** One `fixed_drive`'s rows → its summary; null for a drive without a snap (a lone kickoff). */
export function summarizeDrive(rows: Play[]): DriveSummary | null {
  const first = rows.find((p) => isScrimmage(p) || (counts(p) && (p.punt || p.fieldGoal)))
  if (!first?.posteam || !first.defteam) return null
  const team = first.posteam
  const mine = rows.filter((p) => p.posteam === team)
  const result = firstOf(mine, (p) => p.driveResult)
  const scores = mine.flatMap((p) => (p.score === null ? [] : [p.score]))
  const after = mine.flatMap((p) => (p.scorePost === null ? [] : [p.scorePost]))
  return {
    first,
    team,
    opponent: first.defteam,
    plays: mine.filter(isScrimmage).length,
    yards: firstOf([...mine].reverse(), (p) => p.ydsnet),
    seconds: firstOf(mine, (p) => p.driveSeconds),
    points: scores.length > 0 && after.length > 0 ? Math.max(...after) - Math.min(...scores) : 0,
    threeAndOut: result === 'Punt' && firstOf(mine, (p) => p.driveFirstDowns) === 0,
    scored: mine.some((p) => p.driveScored),
    turnover: result === 'Turnover' || result === 'Opp touchdown',
    punt: result === 'Punt',
    redZone: mine.some((p) => isScrimmage(p) && p.yardline !== null && p.yardline <= 20),
    touchdown: result === 'Touchdown',
    goalToGo: mine.some((p) => counts(p) && p.goalToGo)
  }
}

function recordDrive(b: Bag, d: DriveSummary): void {
  b.add('drives')
  b.add('drive_plays', d.plays)
  b.add('drive_yds', d.yards)
  b.add('drive_seconds', d.seconds)
  b.add('drive_points', d.points)
  b.add('drive_start_sum', d.first.yardline)
  b.addIf('three_and_outs', d.threeAndOut)
  b.addIf('drive_scores', d.scored)
  b.addIf('drive_turnovers', d.turnover)
  b.addIf('drive_punts', d.punt)
  b.addIf('rz_trips', d.redZone)
  b.addIf('rz_tds', d.redZone && d.touchdown)
  b.addIf('gtg_drives', d.goalToGo)
  b.addIf('gtg_tds', d.goalToGo && d.touchdown)
}

/** Spec §6.3: `pbp` team-weeks; every metric as `off_*` (the team had the ball) and `def_*`. */
export class TeamWeeks {
  private readonly bags = new TeamBags('pbp')
  private readonly drives = new Map<string, Play[]>()
  /** The previous snap, for the seconds between neutral snaps (pace). */
  private last: Play | null = null

  /** The offense's `off_` bag and the defense's `def_` bag for a play between `team` and `opponent`. */
  private both(p: Play, team: string, opponent: string): Bag[] {
    return this.bags.both(p, team, opponent)
  }

  add(p: Play): void {
    if (p.drive !== null && p.posteam) {
      const key = `${p.gameId}|${p.drive}`
      const rows = this.drives.get(key)
      if (rows) rows.push(p)
      else this.drives.set(key, [p])
    }
    if (!p.posteam || !p.defteam) return
    const bags = this.both(p, p.posteam, p.defteam)
    for (const b of bags) record(b, p)
    if (!isScrimmage(p)) return
    const prev = this.last
    this.last = p
    if (
      prev &&
      prev.gameId === p.gameId &&
      prev.drive === p.drive &&
      prev.posteam === p.posteam &&
      neutral(prev) &&
      neutral(p) &&
      prev.clock !== null &&
      p.clock !== null &&
      prev.clock >= p.clock
    ) {
      for (const b of bags) {
        b.add('pace_sum', prev.clock - p.clock)
        b.add('pace_n')
      }
    }
  }

  finish(): WhTeamWeek[] {
    for (const rows of this.drives.values()) {
      const d = summarizeDrive(rows)
      if (d) for (const b of this.both(d.first, d.team, d.opponent)) recordDrive(b, d)
    }
    return this.bags.finish()
  }
}
