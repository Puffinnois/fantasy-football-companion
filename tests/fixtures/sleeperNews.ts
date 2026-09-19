import type { SleeperNewsRawItem, SleeperNewsResponse } from '@main/sources/sleeperNews'

// Trimmed from the live payload captured 2026-09-19 (`topic_id` dropped: the mapper never reads it).

/** RotoBaller: no `analysis`. */
export const rotoballerItem = {
  source: 'rotoballer',
  source_key: '221423',
  player_id: '4046',
  published: 1789750087000,
  metadata: {
    title: 'Patrick Mahomes Not On Final Injury Report For Colts Matchup',
    description:
      'Kansas City Chiefs quarterback Patrick Mahomes was once again listed on the injury report this week with a knee issue, but he practiced in full and carries no designation into Sunday.',
    url: 'https://www.rotoballer.com/player-news/patrick-mahomes-not-on-injury-report-for-colts-matchup/1660000'
  }
} satisfies SleeperNewsRawItem

/** FantasyPros: every field present. */
export const fantasyProsItem = {
  source: 'fantasy_pros',
  source_key: '608417',
  player_id: '4046',
  published: 1789591522615,
  metadata: {
    title: 'Patrick Mahomes II (knee) listed as full participant Wednesday',
    description:
      'Patrick Mahomes II (knee) was listed as a full participant in practice on Wednesday.',
    analysis:
      'As expected, Mahomes continues to carry on at full health, logging a full practice session Wednesday.',
    url: 'https://www.fantasypros.com/nfl/news/608417/patrick-mahomes-ii-knee-listed-full-participant-wednesday.php'
  }
} satisfies SleeperNewsRawItem

/** RotoWire: oldest of the three. */
export const rotowireItem = {
  source: 'rotowire',
  source_key: 'nfl637886',
  player_id: '4046',
  published: 1789300000000,
  metadata: {
    title: 'Patrick Mahomes: Throws for 300 yards in win',
    description:
      'Mahomes completed 27 of 36 passes for 312 yards and two touchdowns in the Sunday win.',
    analysis: 'A routine outing that keeps him inside the top five at the position.',
    url: 'https://www.rotowire.com/football/player/patrick-mahomes-12142'
  }
} satisfies SleeperNewsRawItem

/** Oldest first on purpose: the mapper must sort. */
export const rawNews: SleeperNewsRawItem[] = [rotowireItem, fantasyProsItem, rotoballerItem]

export const newsResponse: SleeperNewsResponse = { data: { get_player_news: rawNews } }
