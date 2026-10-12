import type { Bag } from './bag'
import { forEachJoinedRow, type Cells, type JoinResult } from './join'
import type { IndexedPlay, PlayIndex } from './playIndex'
import { PlayerBags, TeamBags } from './weekBags'

/** FTN's charting flags and counts, by FTN column name. */
const FTN_FLAGS = [
  'is_no_huddle',
  'is_motion',
  'is_play_action',
  'is_screen_pass',
  'is_rpo',
  'is_trick_play',
  'is_qb_out_of_pocket',
  'is_interception_worthy',
  'is_throw_away',
  'is_catchable_ball',
  'is_contested_ball',
  'is_created_reception',
  'is_drop',
  'is_qb_sneak',
  'is_qb_fault_sack'
]

/** Every column the FTN aggregation reads; a missing one fails the step. */
export const FTN_COLUMNS = [
  'nflverse_game_id',
  'nflverse_play_id',
  'n_defense_box',
  'n_blitzers',
  'n_pass_rushers',
  'read_thrown',
  ...FTN_FLAGS
]

/** A box or rusher count; FTN writes 0 where it did not chart one (special teams). */
const charted = (n: number | null): number | null => (n !== null && n > 0 ? n : null)

function passer(b: Bag, c: Cells, p: IndexedPlay): void {
  if (c.flag('is_play_action')) {
    b.add('pass_pa_dropbacks')
    b.add('pass_pa_epa_sum', p.qbEpa)
  }
  if ((c.num('n_blitzers') ?? 0) > 0) {
    b.add('pass_blitz_dropbacks')
    b.add('pass_blitz_epa_sum', p.qbEpa)
  }
  b.addIf('pass_rpo', c.flag('is_rpo'))
  b.addIf('pass_screens', c.flag('is_screen_pass'))
  b.addIf('pass_out_of_pocket', c.flag('is_qb_out_of_pocket'))
  b.addIf('pass_int_worthy', c.flag('is_interception_worthy'))
  b.addIf('pass_throwaways', c.flag('is_throw_away'))
  b.addIf('pass_qb_fault_sacks', c.flag('is_qb_fault_sack'))
  const read = c.text('read_thrown')
  if (read !== '0') b.tally('pass_read', read)
}

function rusher(b: Bag, c: Cells): void {
  const box = charted(c.num('n_defense_box'))
  if (box !== null) {
    b.add('rush_box_sum', box)
    b.add('rush_box_n')
    b.addIf('rush_box_8p', box >= 8)
  }
  b.addIf('rush_rpo', c.flag('is_rpo'))
  b.addIf('rush_qb_sneaks', c.flag('is_qb_sneak'))
}

function receiver(b: Bag, c: Cells, p: IndexedPlay): void {
  b.addIf('rec_catchable', c.flag('is_catchable_ball'))
  b.addIf('rec_contested', c.flag('is_contested_ball'))
  b.addIf('rec_contested_catches', c.flag('is_contested_ball') && p.complete)
  b.addIf('rec_created', c.flag('is_created_reception'))
  b.addIf('rec_drops', c.flag('is_drop'))
  b.addIf('rec_screen_tgt', c.flag('is_screen_pass'))
}

function team(b: Bag, c: Cells, p: IndexedPlay): void {
  b.addIf('motion', c.flag('is_motion'))
  b.addIf('play_action', c.flag('is_play_action'))
  b.addIf('rpo', c.flag('is_rpo'))
  b.addIf('screens', c.flag('is_screen_pass'))
  b.addIf('trick_plays', c.flag('is_trick_play'))
  b.addIf('no_huddle', c.flag('is_no_huddle'))
  const box = charted(c.num('n_defense_box'))
  if (box !== null) {
    b.add('box_sum', box)
    b.add('box_n')
  }
  if (p.passerId === null) return
  b.addIf('blitzes', (c.num('n_blitzers') ?? 0) > 0)
  const rushers = charted(c.num('n_pass_rushers'))
  if (rushers !== null) {
    b.add('rushers_sum', rushers)
    b.add('rushers_n')
  }
}

/** Spec §6.4: FTN charting (2022+), joined to play-by-play, into `ftn` player-weeks and team-weeks. */
export function aggregateFtn(text: string, index: PlayIndex): JoinResult {
  const players = new PlayerBags('ftn')
  const teams = new TeamBags('ftn')
  const counted = forEachJoinedRow(
    text,
    'ftn',
    index,
    { gameColumn: 'nflverse_game_id', playColumn: 'nflverse_play_id', required: FTN_COLUMNS },
    (c, p) => {
      if (!p.scrimmage || !p.posteam || !p.defteam) return
      if (p.passerId) passer(players.bag(p, p.passerId, p.posteam), c, p)
      if (p.rusherId) rusher(players.bag(p, p.rusherId, p.posteam), c)
      if (p.receiverId) receiver(players.bag(p, p.receiverId, p.posteam), c, p)
      for (const b of teams.both(p, p.posteam, p.defteam)) team(b, c, p)
    }
  )
  return { playerWeeks: players.finish(), teamWeeks: teams.finish(), ...counted }
}
