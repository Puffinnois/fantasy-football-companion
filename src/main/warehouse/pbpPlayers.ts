import type { WhPlayerWeek } from '@main/db/repos/warehouse'
import type { Bag } from './bag'
import { counts, type Play } from './play'
import { PlayerBags } from './weekBags'

/** Red-zone depths (yards to the end zone) the rusher and receiver counts split by. */
const ZONES = [20, 10, 5]
const DEEP = 20

const inside = (p: Play, yards: number): boolean => p.yardline !== null && p.yardline <= yards
const earlyDown = (p: Play): boolean => p.down === 1 || p.down === 2

function passer(b: Bag, p: Play): void {
  const attempt = p.passAttempt && !p.sack && !p.scramble
  b.add('pass_dropbacks')
  b.add('pass_qb_epa_sum', p.qbEpa)
  b.addIf('pass_success_n', p.success)
  b.add('pass_wpa_sum', p.wpa)
  if (p.cpoe !== null) {
    b.add('pass_cpoe_sum', p.cpoe)
    b.add('pass_cpoe_n')
  }
  if (p.scramble) {
    b.add('pass_scrambles')
    b.add('pass_scramble_yds', p.rushingYards)
  }
  if (earlyDown(p)) {
    b.add('pass_early_dropbacks')
    b.add('pass_early_epa_sum', p.qbEpa)
  }
  if (p.down === 3) {
    b.add('pass_3d_dropbacks')
    b.addIf('pass_3d_conv', p.thirdConverted)
  }
  if (!attempt) return
  b.add('pass_air_epa_sum', p.airEpa)
  b.add('pass_yac_epa_sum', p.yacEpa)
  if (p.complete) b.max('pass_long_cmp', p.passingYards)
  b.addIf('pass_att_i20', inside(p, 20))
  b.addIf('pass_att_i10', inside(p, 10))
  b.addIf('pass_ez_att', p.airYards !== null && p.yardline !== null && p.airYards >= p.yardline)
  if (p.airYards !== null && p.airYards >= DEEP) {
    b.add('pass_deep_att')
    b.addIf('pass_deep_cmp', p.complete)
    if (p.complete) b.add('pass_deep_yds', p.passingYards)
    b.addIf('pass_deep_td', p.passTd)
    b.addIf('pass_deep_int', p.interception)
  }
}

function rusher(b: Bag, p: Play): void {
  const yards = p.rushingYards
  b.add('rush_carries')
  b.addIf('rush_designed', !p.scramble)
  b.add('rush_epa_sum', p.epa)
  b.addIf('rush_success_n', p.success)
  b.add('rush_wpa_sum', p.wpa)
  b.addIf('rush_stuffs', yards !== null && yards <= 0)
  for (const n of [10, 15, 20]) b.addIf(`rush_${n}p`, yards !== null && yards >= n)
  b.max('rush_long', yards)
  for (const z of ZONES) {
    if (!inside(p, z)) continue
    b.add(`rush_i${z}`)
    b.addIf(`rush_td_i${z}`, p.rushTd)
  }
  b.addIf('hvt', inside(p, 10))
  b.addIf('rush_gtg', p.goalToGo)
  b.addIf('rush_first_downs', p.firstDownRush)
  for (const where of [p.runLocation, p.runGap]) {
    if (where === null) continue
    b.add(`rush_${where}_n`)
    b.add(`rush_${where}_yds`, yards)
  }
}

function receiver(b: Bag, p: Play): void {
  b.add('rec_targets')
  b.add('hvt')
  b.add('rec_air_yards_sum', p.airYards)
  b.add('rec_epa_sum', p.epa)
  b.addIf('rec_success_n', p.success)
  b.add('rec_wpa_sum', p.wpa)
  for (const z of ZONES) b.addIf(`rec_tgt_i${z}`, inside(p, z))
  b.addIf('rec_ez_tgt', p.airYards !== null && p.yardline !== null && p.airYards >= p.yardline)
  b.addIf('rec_deep_tgt', p.airYards !== null && p.airYards >= DEEP)
  b.addIf('rec_3d_tgt', p.down === 3)
  if (!p.complete) return
  if (p.xyac !== null) {
    b.add('rec_xyac_sum', p.xyac)
    b.add('rec_xyac_n')
  }
  b.add('rec_yac_sum', p.yac)
  b.max('rec_long', p.receivingYards)
  b.addIf('rec_first_downs', p.firstDownPass)
}

function returner(b: Bag, p: Play, prefix: 'kr' | 'pr', id: string, fairCatch: boolean): void {
  if (fairCatch) {
    b.add(`${prefix}_fair_catches`)
    return
  }
  if (p.touchback) return
  b.add(`${prefix}_returns`)
  b.add(`${prefix}_yds`, p.returnYards)
  b.max(`${prefix}_long`, p.returnYards)
  b.addIf(`${prefix}_td`, p.returnTd && p.tdPlayerId === id)
}

/** Spec §6.2: `pbp` player-weeks, keyed by gsis id. */
export class PlayerWeeks {
  private readonly bags = new PlayerBags('pbp')

  /** The bag of `id` in this play's week; `team` is the side the player was on. */
  private bag(p: Play, id: string, team: string | null): Bag {
    return this.bags.bag(p, id, team)
  }

  add(p: Play): void {
    // Penalties count on wiped-out snaps too: that is where most of them are.
    if (p.penalty && p.penaltyPlayerId) {
      const b = this.bag(p, p.penaltyPlayerId, p.penaltyTeam)
      b.add('pen_n')
      b.add('pen_yds', p.penaltyYards)
      b.tally('pen_types', p.penaltyType)
    }
    if (!counts(p)) return
    if (p.dropback && p.passerId) passer(this.bag(p, p.passerId, p.posteam), p)
    if (p.playType === 'run' && p.rusherId) rusher(this.bag(p, p.rusherId, p.posteam), p)
    if (p.receiverId && p.passAttempt && !p.sack) {
      receiver(this.bag(p, p.receiverId, p.posteam), p)
    }
    if (p.kneel && p.rusherId) this.bag(p, p.rusherId, p.posteam).add('pass_kneels')
    if (p.spike && p.passPlayerId) this.bag(p, p.passPlayerId, p.posteam).add('pass_spikes')
    if ((p.fieldGoal || p.extraPoint) && p.kickerId) {
      this.bag(p, p.kickerId, p.posteam).add('k_epa_sum', p.epa)
    }
    if (p.kickoff && p.kickerId) {
      // On kickoffs nflverse's posteam is the receiving team, so the kicker is on defteam.
      const b = this.bag(p, p.kickerId, p.defteam)
      b.add('k_kickoffs')
      b.addIf('k_ko_touchbacks', p.touchback)
      b.addIf('k_onside_att', p.onside)
      b.addIf('k_onside_rec', p.onside && p.ownKickoffRecovery)
    }
    if (p.kickoff && p.kickReturnerId) {
      const b = this.bag(p, p.kickReturnerId, p.returnTeam ?? p.posteam)
      returner(b, p, 'kr', p.kickReturnerId, p.kickoffFairCatch)
    }
    if (p.punt && p.punterId) {
      const b = this.bag(p, p.punterId, p.posteam)
      b.add('p_punts')
      b.add('p_epa_sum', p.epa)
      b.addIf('p_inside_20', p.puntInside20)
      b.addIf('p_touchbacks', p.touchback)
      b.addIf('p_fair_catches', p.puntFairCatch)
      b.addIf('p_blocked', p.puntBlocked)
    }
    if (p.punt && p.puntReturnerId) {
      const b = this.bag(p, p.puntReturnerId, p.returnTeam ?? p.defteam)
      returner(b, p, 'pr', p.puntReturnerId, p.puntFairCatch)
    }
    const run = p.playType === 'run'
    if (run || p.complete) {
      for (const id of new Set(p.tacklerIds)) {
        const b = this.bag(p, id, p.defteam)
        b.addIf('def_stuffs', run && p.yardsGained !== null && p.yardsGained <= 0)
        if (p.yardsGained !== null) {
          b.add('def_tackle_depth_sum', p.yardsGained)
          b.add('def_tackle_depth_n')
        }
      }
    }
  }

  finish(): WhPlayerWeek[] {
    return this.bags.finish()
  }
}
