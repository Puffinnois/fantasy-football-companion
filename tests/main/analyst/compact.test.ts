import { describe, expect, it } from 'vitest'
import { compactAnswer, compactCall, THOUGHT_MAX } from '@main/analyst/compact'
import { playerIndex } from '@main/analyst/players'
import { resolve } from '@main/analyst/resolve'
import { NOW, PEOPLE } from '../../fixtures/analyst'

const block = (q: string): ReturnType<typeof resolve> =>
  resolve(q, { people: playerIndex(PEOPLE), now: NOW })

describe('the compact profile (Ask spec §3.2)', () => {
  it('shows only the open slots the question names, with neutral defaults and bounds', () => {
    const b = block('Who leads WRs in yards per route run since week 5?')
    const call = compactCall(b)!
    expect(call.tool).toBe('leaderboard')
    expect(call.schema).toEqual({
      type: 'object',
      properties: {
        thought: { type: 'string', maxLength: THOUGHT_MAX },
        args: {
          type: 'object',
          properties: {
            metric: { enum: [...b.metrics.map((m) => m.id), 'other'] },
            position: { enum: ['any', 'WR'] }
          },
          required: ['metric', 'position'],
          additionalProperties: false
        }
      },
      required: ['thought', 'args'],
      additionalProperties: false
    })
    // Time came from the resolver: it is not a slot.
    expect(compactAnswer(b, call, { metric: 'yprr', position: 'WR' })).toEqual({
      kind: 'call',
      name: 'leaderboard',
      args: { metric: 'yprr', seasons: [2026], weeks: [5, 7], position: 'WR' }
    })
    expect(compactAnswer(b, call, { metric: 'yprr', position: 'any' })).toMatchObject({
      args: { metric: 'yprr', seasons: [2026], weeks: [5, 7] }
    })
  })

  it('gives a split and the detected filters as bounded lists, and maps them back', () => {
    const b = block('Josh Allen EPA per dropback under pressure by down in 2025')
    const call = compactCall(b)!
    expect(call.tool).toBe('player_stats')
    const args = (call.schema.properties!.args as { properties: Record<string, unknown> })
      .properties
    expect(args.metrics).toMatchObject({ type: 'array', minItems: 1, maxItems: 3 })
    expect(args.by).toEqual({ enum: ['none', 'down'] })
    expect(args.filters).toEqual({ type: 'array', items: { enum: ['pressure'] }, maxItems: 1 })
    expect(
      compactAnswer(b, call, { metrics: ['qb_epa_db'], by: 'down', filters: ['pressure'] })
    ).toEqual({
      kind: 'call',
      name: 'player_stats',
      args: {
        player: '00-0034857',
        metrics: ['qb_epa_db'],
        seasons: [2025],
        pressure: true,
        by: 'down'
      }
    })
  })

  it('fills ids, opponents, rostered and the row count from the resolver', () => {
    const c = block('Puka or JSN: yards per route run this season')
    expect(compactAnswer(c, compactCall(c)!, { metrics: ['yprr'] })).toEqual({
      kind: 'call',
      name: 'compare',
      args: { ids: ['00-0039075', '00-0038543'], metrics: ['yprr'], seasons: [2026] }
    })
    const l = block('worst 5 free agent RBs by yards after contact against the Ravens')
    expect(compactAnswer(l, compactCall(l)!, { metric: 'yac_att', position: 'RB' })).toMatchObject({
      args: {
        metric: 'yac_att',
        position: 'RB',
        opponent: 'BAL',
        rostered: 'free',
        limit: 5,
        order: 'worst'
      }
    })
  })

  it('needs no model slots for an outlook or a team’s games, and none at all when declined', () => {
    const o = block('Is Jordan Love due for regression?')
    const call = compactCall(o)!
    expect((call.schema.properties!.args as { properties: object }).properties).toEqual({})
    expect(compactAnswer(o, call, {})).toEqual({
      kind: 'call',
      name: 'outlook',
      args: { player: '00-0031000' }
    })
    const g = block('Who do the Niners play next week?')
    expect(compactAnswer(g, compactCall(g)!, {})).toEqual({
      kind: 'call',
      name: 'games',
      args: { season: 2026, week: 8, team: 'SF' }
    })
    expect(compactCall(block('Should I start Bijan or Gibbs this week?'))).toBeNull()
    expect(compactCall(block('Chris Jones sacks'))).toBeNull()
  })

  it('offers the position’s usual line first, and leaves the metrics to the tool for it', () => {
    const b = block('Show me Bijan Robinson’s game log this season')
    const call = compactCall(b)!
    const metrics = (
      call.schema.properties!.args as { properties: Record<string, { items: { enum: string[] } }> }
    ).properties.metrics
    expect(metrics.items.enum[0]).toBe('default')
    expect(compactAnswer(b, call, { metrics: ['default'], by: 'week' })).toEqual({
      kind: 'call',
      name: 'player_stats',
      args: { player: '00-0038542', seasons: [2026], by: 'week' }
    })
    expect(compactAnswer(b, call, { metrics: ['default', 'rush_yds'], by: 'none' })).toMatchObject({
      args: { metrics: ['rush_yds'] }
    })
  })

  it('answers `other` by asking for more candidates', () => {
    const b = block('How many yards per carry does Bijan average?')
    expect(compactAnswer(b, compactCall(b)!, { metrics: ['other'] })).toEqual({ kind: 'other' })
  })
})
