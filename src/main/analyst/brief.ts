import { createHash } from 'node:crypto'
import { glossaryText } from '@shared/stats/glossary'
import analyst from './brief/analyst.md?raw'
import compactAnswer from './brief/compact-answer.md?raw'
import compactCall from './brief/compact-call.md?raw'
import type { Now } from './time'

/**
 * The analyst brief (Ask spec §4.4): one text for the full profile (the MCP server's instructions
 * and the agent loop), and two short ones for the compact profile (the call, then the answer).
 * They are versioned files; every trace records the hash of the one it used (§5.3), so an
 * evaluation can tell briefs apart.
 */
export type BriefKind = 'analyst' | 'compact-call' | 'compact-answer'

const TEMPLATES: Record<BriefKind, string> = {
  analyst,
  'compact-call': compactCall,
  'compact-answer': compactAnswer
}

/** The first 12 hex digits of the template's SHA-256. */
export function briefHash(kind: BriefKind): string {
  return createHash('sha256').update(TEMPLATES[kind]).digest('hex').slice(0, 12)
}

export function briefText(
  kind: BriefKind,
  now: Now,
  fill: { tool?: string; description?: string } = {}
): string {
  const values: Record<string, string> = {
    season: String(now.season),
    week: String(now.week),
    seasonType: now.seasonType === 'POST' ? 'postseason' : 'regular season',
    glossary: glossaryText(),
    tool: fill.tool ?? '',
    description: fill.description ?? ''
  }
  return TEMPLATES[kind].replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '').trim()
}
