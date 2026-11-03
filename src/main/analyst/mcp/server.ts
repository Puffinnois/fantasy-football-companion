import {
  type CallToolResult,
  CLIENT_CAPABILITIES_META_KEY,
  type ClientCapabilities,
  fromJsonSchema,
  inputRequired,
  type InputRequiredResult,
  inputResponse,
  type JsonSchemaType,
  type jsonSchemaValidator,
  McpServer,
  type ServerContext
} from '@modelcontextprotocol/server'
import type { ToolName, ToolOutcome } from '@shared/ask'
import { glossaryText } from '@shared/stats/glossary'
import { semanticModelYaml } from '@shared/stats/semanticModel'
import type { Person } from '@shared/stats/types'
import type { AskExample } from '@main/db/repos/askExamples'
import { briefText } from '../brief'
import type { Now } from '../time'
import { type Analyst, toolDefinitions, type TurnContext } from '../tools'

/**
 * The MCP server (Ask spec §6.1): the analyst tools of the full profile, the analyst brief as the
 * server's instructions and as an `analyst` prompt, and the glossary, the semantic model and the
 * verified examples as resources. Read only. A fresh server answers each HTTP request (both protocol
 * eras are served stateless), so nothing is kept between calls.
 */
export const MCP_NAME = 'fantasy-companion'

export const RESOURCES = {
  glossary: 'ffc://glossary',
  semanticModel: 'ffc://semantic-model.yaml',
  examples: 'ffc://examples'
} as const

export interface McpServerDeps {
  analyst: Analyst
  version: string
  /** Verified question → tool-call pairs (`ask_examples`). */
  examples: () => AskExample[]
}

const TITLES: Record<ToolName, string> = {
  find: 'Find ids',
  leaderboard: 'Leaderboard',
  player_stats: 'Player stats',
  team_stats: 'Team stats',
  compare: 'Compare',
  trend: 'Trend',
  outlook: 'Player outlook',
  games: 'Games',
  league: 'My league',
  describe: 'Describe a metric',
  query: 'Stats query'
}

/**
 * The analyst checks every call itself and answers with an error that teaches (Ask spec §3.3), so
 * the SDK's own validation lets every value through.
 */
const LET_THROUGH: jsonSchemaValidator = {
  getValidator: () => (input) => ({ valid: true, data: input as never, errorMessage: undefined })
}

/** While the warehouse is still being built, tools are still listed (with the seasons up to now). */
function fallbackSeasons(): number[] {
  const year = new Date().getFullYear()
  return Array.from({ length: year - 2019 + 1 }, (_, i) => 2019 + i)
}

/** An enum longer than this is a list of metric ids. */
const LONG_ENUM = 40
const METRIC_HINT = 'A metric id, such as yprr or rush_epa; find gives the ids for a stat’s name.'

/**
 * The schema Claude reads: the full profile's, without the lists of metric ids. Those are about 300
 * ids, seven times over: 34 of the 51 KB the tools take, some 9,000 tokens in every conversation.
 * `find` gives the ids, and the analyst still checks each call against the full schema and names
 * the nearest ids when one is wrong.
 */
export function listedSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(listedSchema)
  if (!schema || typeof schema !== 'object') return schema
  const node = schema as Record<string, unknown>
  if (Array.isArray(node.enum) && node.enum.length > LONG_ENUM) {
    const description = [node.description, METRIC_HINT].filter(Boolean).join(' ')
    return { type: 'string', description }
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, listedSchema(v)]))
}

const text = (t: string, isError = false): CallToolResult => ({
  content: [{ type: 'text', text: t }],
  ...(isError ? { isError: true } : {})
})

/**
 * The model reads the compact text (Ask spec §3.3). No `structuredContent`: Claude Code hands it to
 * the model in place of the text (measured 2026-11-02), and the cards hold whole engine results.
 */
export function toCallResult(outcome: ToolOutcome): CallToolResult {
  return outcome.ok ? text(outcome.text) : text(outcome.error, true)
}

/** The client can answer a form elicitation on this request (2026-07-28 requests carry it). */
function canElicit(ctx: ServerContext): boolean {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined
  const caps = envelope?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined
  const elicitation = caps?.elicitation as Record<string, unknown> | undefined
  if (!elicitation) return false
  return Object.keys(elicitation).length === 0 || elicitation.form !== undefined
}

const describePerson = (p: Person): string =>
  `${p.name} (${[p.position, p.team].filter(Boolean).join(', ')}), last played ${p.lastSeason}`

/**
 * `find`, with namesakes asked back (Ask spec §4.1): when a name matches several players and the
 * client supports it, the user picks one in an elicitation form; otherwise the matches are listed
 * and the brief tells the model to ask.
 */
async function find(
  analyst: Analyst,
  turn: TurnContext,
  args: unknown,
  ctx: ServerContext
): Promise<CallToolResult | InputRequiredResult> {
  const a = (args ?? {}) as { text?: unknown; kind?: unknown }
  const outcome = await analyst.run('find', args, turn)
  if (!outcome.ok || typeof a.text !== 'string' || (a.kind && a.kind !== 'player'))
    return toCallResult(outcome)
  const namesakes = turn.people.find(a.text).filter((m) => m.people.length > 1)
  if (namesakes.length !== 1 || !canElicit(ctx)) return toCallResult(outcome)
  const [match] = namesakes
  const answer = inputResponse(ctx.mcpReq.inputResponses, 'player')
  if (answer.kind === 'missing')
    return inputRequired({
      inputRequests: {
        player: inputRequired.elicit({
          message: `Which ${match.mention}?`,
          requestedSchema: {
            type: 'object',
            properties: {
              player: {
                type: 'string',
                title: 'Player',
                oneOf: match.people.map((p) => ({ const: p.id, title: describePerson(p) }))
              }
            },
            required: ['player']
          }
        })
      }
    })
  const chosen =
    answer.kind === 'elicit' && answer.action === 'accept'
      ? match.people.find((p) => p.id === answer.content?.player)
      : undefined
  if (!chosen) return toCallResult(outcome)
  const lines = outcome.text
    .split('\n')
    .filter((l) => !l.startsWith('Player: ') || l.includes(` = ${chosen.id} `))
  return text([...lines, `The user chose ${chosen.name} (${chosen.id}).`].join('\n'))
}

/** A server for one request: the tools, the brief, the prompt and the resources. */
export async function createMcpServer(deps: McpServerDeps): Promise<McpServer> {
  let turn: TurnContext | null = null
  let unavailable: string | null = null
  try {
    turn = await deps.analyst.turn()
  } catch (err) {
    unavailable = err instanceof Error ? err.message : String(err)
  }
  const now: Now = turn?.now ?? { season: new Date().getFullYear(), week: 0, seasonType: 'REG' }
  const brief = briefText('analyst', now)
  const server = new McpServer(
    { name: MCP_NAME, title: 'FantasyCompanion', version: deps.version },
    { instructions: brief }
  )

  for (const def of toolDefinitions(turn?.seasons ?? fallbackSeasons())) {
    server.registerTool(
      def.name,
      {
        title: TITLES[def.name],
        description: def.description,
        inputSchema: fromJsonSchema(listedSchema(def.schema) as JsonSchemaType, LET_THROUGH),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      },
      async (args: unknown, ctx: ServerContext) => {
        if (!turn) return text(unavailable ?? 'the stats are not available', true)
        if (def.name === 'find') return find(deps.analyst, turn, args, ctx)
        return toCallResult(await deps.analyst.run(def.name, args, turn))
      }
    )
  }

  server.registerPrompt(
    'analyst',
    {
      title: 'Ask the stats analyst',
      description: 'The analyst brief, with an optional question.',
      argsSchema: fromJsonSchema(
        {
          type: 'object',
          properties: { question: { type: 'string', description: 'Your question.' } }
        },
        LET_THROUGH
      )
    },
    (args: unknown) => {
      const question = (args as { question?: unknown } | undefined)?.question
      const ask = typeof question === 'string' && question.trim() ? `\n\nQuestion: ${question}` : ''
      return {
        messages: [{ role: 'user' as const, content: { type: 'text' as const, text: brief + ask } }]
      }
    }
  )

  server.registerResource(
    'glossary',
    RESOURCES.glossary,
    { title: 'Glossary', description: 'The terms answers lean on.', mimeType: 'text/markdown' },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: glossaryText() }] })
  )
  server.registerResource(
    'semantic-model',
    RESOURCES.semanticModel,
    {
      title: 'Semantic model',
      description: 'Every metric and dimension: label, aliases, sample, seasons, stability.',
      mimeType: 'application/yaml'
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/yaml', text: semanticModelYaml() }]
    })
  )
  server.registerResource(
    'examples',
    RESOURCES.examples,
    {
      title: 'Verified examples',
      description: 'Questions and the tool calls that answered them, checked against the data.',
      mimeType: 'application/json'
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            deps.examples().map((e) => ({ question: e.question, tool: e.tool, args: e.args })),
            null,
            2
          )
        }
      ]
    })
  )
  return server
}
