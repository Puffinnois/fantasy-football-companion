# Plan AF2 — Ask: Claude over MCP (server, bridge, Stats › Ask)

**Status:** not started. Written 2026-11-02 from the prototype branch `proto/af2` (worktree `../ffc-af2-proto`, kept until AF2 is merged). Each task's code is that branch's commit for the task, and each commit was checked on its own: typecheck, lint and the suite (counts in each task). Spec amendments A–K below approved by the user 2026-11-02.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude desktop and Claude Code answer stats questions from the app's data, with the user's own Claude plan (spec §6.1, the AF2 row of §11).

- **An MCP server in the app:** AF1's analyst tools (the full profile), the analyst brief as instructions and as a prompt, and the glossary, semantic model and verified examples as resources. It runs over Streamable HTTP on `127.0.0.1`, behind a bearer token, and serves both protocol eras.
- **A stdio bridge for Claude desktop:** the app's own exe run as Node. When the app is closed, the bridge starts it, from outside Claude's MSIX container.
- **Stats › Ask:** on or off (off by default), Add to Claude desktop, and copy buttons for the Claude Code commands (Windows, WSL).
- **One app instance**, a packaged self-test in CI, and the AF2 gate: the reference calls give the same text through MCP.
- Ship `v0.38.0`.

**Architecture:**

- **Main process**, new `src/main/analyst/mcp/`:
  - `server.ts`: a server per request, built from the analyst;
  - `http.ts`: the loopback HTTP host;
  - `endpoint.ts`: `mcp.json`, where the bridge finds the server;
  - `bridge.ts` + `bridgeMain.ts`: the stdio bridge, bundled as `out/main/mcpBridge.js`;
  - `claudeDesktop.ts`: finds and edits Claude desktop's config;
  - `service.ts` + `ipc.ts`: on / off, the port and token, the commands, IPC `ask:mcp*`;
  - `selfTest.ts`: the packaged check.
- **`src/main/index.ts`:** the single-instance lock, `--minimized` (the bridge's shortcut), the analyst and the MCP service at launch (stopped on quit), and `--mcp-self-test=<file>`.
- **Shared:** `src/shared/ask.ts` gains `McpStatus` and `McpCopy`; `src/shared/ipc.ts` gains `ask.mcp.*`; the preload follows.
- **Renderer:** a Stats › Ask tab (`StatsAsk.tsx`). Plan AH turns it into Ask itself.
- **`companion.db`:** no migration; three `app_settings` keys.
- **CI:** Package check and Release run the MCP self-test on the Windows build; Package check keeps the unpacked app for 3 days, for the check by hand (Task 12).

**Tech Stack:** Electron 39, TypeScript strict, Vitest. **New dependency: the MCP TypeScript SDK v2**, pinned exactly:

- `@modelcontextprotocol/server` 2.4.0;
- `@modelcontextprotocol/node` 2.1.2: the Node HTTP adapter and the Host / Origin guards;
- `@modelcontextprotocol/client` 2.4.0: the bridge's HTTP side and the tests.

They bring hono and `@hono/node-server`, jose, eventsource, eventsource-parser and pkce-challenge; zod 4 and cross-spawn were already in the tree.

**Spec:** `docs/superpowers/specs/2026-11-01-ask-analyst-design.md` (approved 2026-11-02): §6.1, §10 (the AF2 test and gates), the AF2 row of §11, §14 point 2. Amended by this plan: Task 9 writes the amendments into the spec as §16. AF1's reference: `docs/reference/analyst.md`.

## Decisions (user, 2026-11-02)

- **AF is split:** AF2 (`v0.38.0`) is the MCP server, the stdio bridge and the MCP part of Settings › Ask. AG (`v0.39.0`) is the in-app loop and the providers; AH (`v0.40.0`) is the Ask screen.
- **MCP comes first:** it is the user's own path, through their Claude subscription.
- **When the app is closed, the bridge starts it minimised and waits up to 30 s** (spec §14, point 2). This plan keeps that, but changes how the app is started (amendment G).

## Planning findings (this PC, 2026-11-02)

- **Claude desktop is the Store (MSIX) app** (`Claude_pzs8sxrjxfjjc`).
  - Its config is `%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\claude_desktop_config.json`: 4.8 KB with `coworkUserFilesPath` and `preferences`, and no `mcpServers` yet.
  - `%APPDATA%\Claude\` does not exist. The package's own `LocalCache\Roaming\Claude` holds only a `.user-data-left.claude_pzs8sxrjxfjjc` marker. Its MCP log is empty.
- **Processes that Claude desktop starts run inside its MSIX container.**
  - A PowerShell started from a Claude desktop session wrote `%LOCALAPPDATA%\ffc-probe-direct.txt`. The file landed in `Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\`, not in the real folder. That folder already held `fantasy-football-companion-updater` (2026-09-17), `GitHub CLI` and `deno`.
  - Three ways to start a process from inside: `explorer.exe <file>` and WMI `Win32_Process.Create` wrote to the real folder; `Start-Process` stayed inside.
  - Reads from inside see the real files (the app's `Preferences` and `companion.db`).
- **Claude Code 2.1.293**, pointed at a probe server over HTTP:
  - It sent `server/discover` for `2026-07-28`, with client capabilities `elicitation: {form, url}` and `roots`, then `subscriptions/listen`, `tools/list` and `tools/call`.
  - Given a result with both `content` (`CONTENT-ALPHA-7`) and `structuredContent` (`{"marker":"STRUCT-BRAVO-9"}`), the model repeated `{"marker":"STRUCT-BRAVO-9"}`. **It reads the structured content in place of the text.**
- **The MCP SDK.**
  - v2 (2.4.0; the line started in April 2026) is the stable one; `@modelcontextprotocol/sdk` 1.32 is the old single package.
  - v2 serves the 2026-07-28 revision and a stateless fallback for 2025 clients from one factory (`createMcpHandler`). Elicitation becomes a multi-round-trip `input_required` result, and plain JSON Schemas go through `fromJsonSchema`.
- **WSL is in NAT mode** (`.wslconfig` has only `localhostForwarding=true`), so Windows' 127.0.0.1 cannot be reached from WSL.
  - The installed v0.37.0 exe, started from WSL with `ELECTRON_RUN_AS_NODE=1 WSLENV=ELECTRON_RUN_AS_NODE`, ran as Node 22.22.1 (Electron 39.8.10). It listed `app.asar/out/main` and echoed its stdin.
  - So the RunAsNode fuse is on, and the asar can be read in Node mode.
- **The tool list.**
  - The full profile's definitions take 51.4 KB of JSON. 34 KB of it is the metric-id enums: about 300 ids, seven times.
  - Without those lists, the tools take 17.7 KB. The brief (the instructions) is 4.0 KB.
- **The prototype** (this plan's code):
  - The suite goes from 1,277 to 1,310 passed on a clean checkout.
  - `npx electron . --mcp-self-test=…` in WSL (the dev Electron runs itself as Node on `out/main/mcpBridge.js`) gave `{"ok":true,"legacy":{"tools":11,…},"modern":{"tools":11,…}}`.
  - Claude Code (Haiku), pointed at the prototype's server, answered "what does yards per route run measure" from `describe`. So Anthropic's API accepts the listed schemas.
- **Not measured while planning:**
  - The gate on the frozen warehouse: the running app had `stats.duckdb` locked. Task 10 measures it.
  - The packaged Windows bridge (Task 11).
  - Claude desktop itself (Task 12).

## Spec amendments (taken in this plan)

Task 9 writes these into the spec as §16. Approved by the user 2026-11-02.

- **A. Both protocol eras, stateless (§6.1):** SDK v2 serves 2026-07-28 (what Claude Code negotiates) and a stateless fallback for 2025 clients. A fresh server answers each request, so the split counter counts within one call.
- **B. Text results only (§6.1):** no `structuredContent` and no `outputSchema`. Claude Code reads the structured content in place of the text, and the cards hold whole engine results.
- **C. No metric-id lists in the schemas Claude reads (§3.2):** 51.4 KB → 17.7 KB. `find` gives the ids; the analyst still checks the full schema and names the nearest ids.
- **D. "Which one?" in `find` (§4.1):** namesakes are asked about by a form elicitation on 2026-07-28 requests. Otherwise they are listed, and the brief tells the model to ask. The brief's first rule now says to call `find` when there is no context block.
- **E. A kept port (§6.1):** the port (41000–48999) is picked once and kept in `app_settings`, and so is the token, so a copied Claude Code command keeps working. "Make a new key" resets the token.
- **F. Claude desktop's config (§6.1):** the Store app's `Claude-Data` folder first, then `%APPDATA%\Claude`, then an older Store app's package folder. Every other key is kept, and a timestamped backup is written first.
- **G. The app starts outside Claude's container (§6.1, §14 point 2):** the bridge opens `start-for-claude.lnk` with `explorer.exe`; it never starts the app as its own child.
- **H. One instance (§6.1):** a second launch hands over to the running app.
- **I. Claude Code in WSL (§6.1):** it runs the bridge through WSL interop, because NAT networking cannot reach Windows' 127.0.0.1. Claude Code on Windows uses HTTP.
- **J. "Settings › Ask" is the Stats › Ask tab (§6.1, §8):** the app has no Settings screen.
- **K. Not in AF2:** traces of MCP calls, removing the entry from Claude desktop, and `open_in_app` (AH).

## Global Constraints

- **Branch** `feat/analyst-af2` off `main`.
- **Commits.** One Conventional Commit per "Check and commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan:
  - `.gitignore`, `.claude/`, `.design-sync/`, `docs/design/FantasyCompanion UI/`;
  - `docs/research/nfl_predictive_metrics.md:Zone.Identifier`;
  - `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts`;
  - `tsconfig.node.tsbuildinfo`, `tsconfig.web.tsbuildinfo`.

  Stage files by name; never run `git add -A` or `git add .`.

- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`** (it rewrites the Sleeper fixtures).
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.**
  - Every new file is given whole.
  - Every change to an existing file is a diff that `git apply` takes as written: save it to a file and run `git apply <file>`, or make the same edit by hand.
  - Each task's code is the prototype's commit for that task. Each commit was checked on a clean copy of `main` plus the commits before it: typecheck, lint and the suite were green.
- **Test counts** are those of a clean checkout (`main`: 1,277 passed, 6 skipped). In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3. One existing test is flaky under the full suite and unrelated to this plan: `tests/renderer/components/DevTools.test.tsx` › "snip shows the frozen capture…". Re-run the suite when it is the only failure.
- **The SDK is pinned** to the versions above. MCP moves fast: an upgrade is a change of its own, after which the self-test and the gate run again.
- **Scope.**
  - The analyst's behaviour does not change, except the brief's first rule (amendment D).
  - No metric, no engine change, no migration.
  - The renderer gains one tab.
- **No network in the unit tests.** They start their own servers on `127.0.0.1`, port 0, and write only to temporary folders.
- **Claude desktop's config** is edited only through the app's button, in Task 12, with the user, after its backup. Never by hand in this plan.
- **Gates.**
  - **Task 10:** on the frozen warehouse, the AF1 gate still passes, and every reference call through MCP gives the same text as the direct call, in both eras.
  - **Task 11:** the Windows suite, the stats self-test and the MCP self-test pass on the Package check workflow.
  - **Task 12:** on this PC, with the user: Claude desktop and Claude Code in WSL answer through the bridge, and nothing of the app's lands in Claude's package.
  - If a gate fails, stop and report to the user.
- **Release** `v0.38.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push**: `check/plan-af2` in Task 11, then `main` and the tag.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **Another program or a web page reads the stats through the server.**
   - Task 2: the token is compared in constant time; the server listens on loopback only, at `/mcp` only; a web page's Origin and a rebinding page's Host are refused.
2. **Claude desktop's own settings are lost.**
   - Task 4: every other key is kept; a backup is written first; a config that is not valid JSON is never overwritten; the write is atomic.
3. **The app's databases are split by Claude's container.**
   - Task 3: the bridge only opens the shortcut (`launch` is injected).
   - Task 12: after a bridge start, `Packages\Claude_…\LocalCache` gains nothing of the app's.
4. **Two app processes on one warehouse.**
   - Task 6: the single-instance lock. Task 12: a double-click while the app runs.
5. **Claude reads too much, or the wrong thing.**
   - Task 2: no `structuredContent`; the listed schemas have no metric-id lists and stay under 20 KB.
6. **A stale endpoint, or a start at the wrong time.**
   - Task 3: a restart on a new port with a new token; the app quitting mid-session; a crash's stale `mcp.json`; one start for concurrent calls; no start when the app runs but a call fails.
7. **It works in the tests and fails once packaged.**
   - Task 6: the self-test in the dev Electron. Task 11: the packaged Windows build. Task 12: Claude desktop itself.
8. **A key leaks.**
   - Task 5: the token stays in main and `mcp.json`; the copy buttons copy from main; "make a new key" replaces it.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/analyst-af2
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/analyst-af2`.

---

### Task 1: The MCP SDK

The server, its Node adapter and the client the bridge needs, pinned exactly. No native code: nothing to rebuild for Electron.

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
npm install --save-exact --ignore-scripts @modelcontextprotocol/server@2.4.0 @modelcontextprotocol/node@2.1.2 @modelcontextprotocol/client@2.4.0
git diff package.json
```

Expected: `package-lock.json` changes, and `git diff package.json` shows exactly this (`--ignore-scripts` skips `electron-builder install-app-deps`; the packages have no install scripts):

```diff
diff --git a/package.json b/package.json
index 37a8214..a452a5f 100644
--- a/package.json
+++ b/package.json
@@ -31,6 +31,9 @@
   "dependencies": {
     "@duckdb/node-api": "1.5.6-r.1",
     "@electron-toolkit/utils": "^4.0.0",
+    "@modelcontextprotocol/client": "2.4.0",
+    "@modelcontextprotocol/node": "2.1.2",
+    "@modelcontextprotocol/server": "2.4.0",
     "dompurify": "^3.4.15",
     "electron-updater": "^6.8.9"
   },
```

- [ ] **Step 2: Check and commit**

```bash
npm run typecheck && npx vitest run
git add package.json package-lock.json
git commit -m "build: add the MCP SDK"
```

Expected: typecheck clean; the suite unchanged at 1,277 passed, 6 skipped (a clean checkout).

---

### Task 2: The MCP server (spec §6.1; amendments A–D)

`createMcpServer()` builds a server for one request:

- **The tools:** the analyst's eleven, under the full profile's descriptions. The schemas Claude reads leave out the metric-id lists; the analyst still checks each call against the full schema.
- **Instructions:** the analyst brief, filled with the warehouse's week.
- **A prompt:** `analyst`, which takes an optional question.
- **Three resources:** the glossary, the semantic model (YAML) and the verified examples (JSON).

More rules:

- **Results:** the compact text, and `isError` with the teaching message for a bad call. No structured content.
- **While the warehouse is being built,** the tools are still listed, and a call says why it cannot answer.
- **`find` and namesakes:** when a name matches several players and the request can take a form elicitation (2026-07-28), the user picks one. Otherwise the matches are listed.

`startMcpHttp()` serves it on `127.0.0.1` at `/mcp`. It checks the Host and Origin guards, then the bearer token, and serves both protocol eras. The brief's first rule now covers MCP, where there is no context block.

**Files:**

- Create: `src/main/analyst/mcp/server.ts`, `src/main/analyst/mcp/http.ts`, `tests/main/analyst/mcp.test.ts`
- Modify: `src/main/analyst/brief/analyst.md`

- [ ] **Step 1: Write the tests**

The SDK's own client connects over real HTTP, once per protocol era: the legacy `initialize` handshake, then the 2026-07-28 revision pinned.

Create `tests/main/analyst/mcp.test.ts`:

```ts
import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import type { StatsQuery, StatsRow } from '@shared/stats/types'
import { startMcpHttp, type McpHttp } from '@main/analyst/mcp/http'
import { createMcpServer, MCP_NAME, RESOURCES } from '@main/analyst/mcp/server'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult } from '../../fixtures/analyst'

const TOKEN = 'test-token-0123456789'

function stats(answer: (q: StatsQuery) => StatsRow[] = () => [], ready = true): AnalystStats {
  return {
    status: async () => ({
      available: true,
      through: ready ? { season: 2026, seasonType: 'REG', week: 7 } : null,
      updatedAt: '2026-10-27T00:00:00Z',
      busy: false
    }),
    catalogue: async () => catalogueInfo(new Map()),
    people: async () => PEOPLE,
    query: async (q) => statsResult(answer(q)),
    games: async () => [],
    outlook: async () => {
      throw new Error('not in this test')
    },
    player: async () => {
      throw new Error('not in this test')
    }
  }
}

let open: McpHttp | null = null
afterEach(async () => {
  await open?.close()
  open = null
})

async function serve(s = stats()): Promise<McpHttp> {
  const analyst = createAnalyst({ stats: s, league: () => null })
  open = await startMcpHttp({
    factory: () => createMcpServer({ analyst, version: '0.38.0', examples: () => [] }),
    token: TOKEN,
    port: 0
  })
  return open
}

type Era = 'legacy' | 'modern'

async function connect(
  http: McpHttp,
  era: Era,
  elicit?: (message: string) => { action: 'accept' | 'decline'; content?: Record<string, string> }
): Promise<Client> {
  const client = new Client(
    { name: 'test', version: '1.0.0' },
    {
      capabilities: elicit ? { elicitation: { form: {} } } : {},
      versionNegotiation: era === 'modern' ? { mode: { pin: '2026-07-28' } } : undefined
    }
  )
  if (elicit)
    client.setRequestHandler('elicitation/create', async (req) =>
      elicit((req.params as { message: string }).message)
    )
  await client.connect(
    new StreamableHTTPClientTransport(new URL(http.url), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } }
    })
  )
  return client
}

const textOf = (r: { content?: unknown }): string =>
  (r.content as { type: string; text: string }[]).map((c) => c.text).join('\n')

describe.each<Era>(['legacy', 'modern'])('the MCP server, %s protocol era', (era) => {
  it('lists the full profile with the brief as instructions', async () => {
    const client = await connect(await serve(), era)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([
      'find',
      'leaderboard',
      'player_stats',
      'team_stats',
      'compare',
      'trend',
      'outlook',
      'games',
      'league',
      'describe',
      'query'
    ])
    const board = tools.find((t) => t.name === 'leaderboard')!
    expect(board.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false })
    expect(board.inputSchema.required).toEqual(['metric'])
    // The metric ids are left out of what Claude reads; the analyst checks them.
    expect(board.inputSchema.properties!.metric).toEqual({
      type: 'string',
      description: 'A metric id, such as yprr or rush_epa; find gives the ids for a stat’s name.'
    })
    expect(JSON.stringify(tools).length).toBeLessThan(20_000)
    expect(board.outputSchema).toBeUndefined()
    expect(client.getServerVersion()?.name).toBe(MCP_NAME)
    expect(client.getInstructions()).toContain('2019–2026')
    await client.close()
  })

  it('answers with the compact text, and an invalid call with an error that teaches', async () => {
    const client = await connect(await serve(), era)
    const good = await client.callTool({ name: 'describe', arguments: { metric: 'yprr' } })
    expect(good.isError).toBeFalsy()
    expect(textOf(good)).toMatch(/^Yards per route run/)
    expect(good.structuredContent).toBeUndefined()
    const label = await client.callTool({
      name: 'leaderboard',
      arguments: { metric: 'yards per route run' }
    })
    expect(label.isError).toBe(true)
    expect(textOf(label)).toMatch(/did you mean yprr \(Yards per route run\)/)
    const bad = await client.callTool({
      name: 'player_stats',
      arguments: { player: 'Bijan' }
    })
    expect(bad.isError).toBe(true)
    expect(textOf(bad)).toBe(
      'arguments.player is not valid ("Bijan"). "Bijan" matched 00-0038542 Bijan Robinson (RB, ATL).'
    )
    await client.close()
  })

  it('serves the analyst prompt and the resources', async () => {
    const client = await connect(await serve(), era)
    const prompt = await client.getPrompt({
      name: 'analyst',
      arguments: { question: 'who leads WRs in YPRR?' }
    })
    expect(textOf({ content: prompt.messages.map((m) => m.content) })).toMatch(
      /Question: who leads WRs in YPRR\?$/
    )
    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri).sort()).toEqual(Object.values(RESOURCES).sort())
    const yaml = await client.readResource({ uri: RESOURCES.semanticModel })
    expect((yaml.contents[0] as { text: string }).text).toMatch(/yprr/)
    await client.close()
  })

  it('still lists the tools while the stats are being built', async () => {
    const client = await connect(await serve(stats(undefined, false)), era)
    expect((await client.listTools()).tools).toHaveLength(11)
    const r = await client.callTool({ name: 'describe', arguments: { metric: 'yprr' } })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toMatch(/still being built/)
    await client.close()
  })
})

describe('the HTTP endpoint (Ask spec §6.1)', () => {
  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'curl', version: '1' }
    }
  }
  const post = (url: string, headers: Record<string, string>): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers
      },
      body: JSON.stringify(initialize)
    })

  it('listens on 127.0.0.1 and wants the bearer token', async () => {
    const http = await serve()
    expect(http.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    expect((await post(http.url, { authorization: `Bearer ${TOKEN}` })).status).toBe(200)
    expect((await post(http.url, {})).status).toBe(401)
    expect((await post(http.url, { authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await post(http.url, { authorization: `Bearer ${TOKEN}x` })).status).toBe(401)
  })

  it('refuses web pages (Origin), other host names (Host) and other paths', async () => {
    const http = await serve()
    const auth = { authorization: `Bearer ${TOKEN}` }
    expect((await post(http.url, { ...auth, origin: 'https://example.com' })).status).toBe(403)
    expect(
      (await post(http.url, { ...auth, origin: `http://localhost:${http.port}` })).status
    ).toBe(200)
    // fetch cannot set Host: a DNS-rebinding page's request names its own host.
    const rebound = await new Promise<number>((resolve, reject) => {
      const req = request(
        http.url,
        { method: 'POST', headers: { ...auth, host: `evil.example:${http.port}` } },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        }
      )
      req.on('error', reject)
      req.end(JSON.stringify(initialize))
    })
    expect(rebound).toBe(403)
    expect((await post(http.url.replace('/mcp', '/other'), auth)).status).toBe(404)
  })

  it('fails to start on a port in use', async () => {
    const http = await serve()
    await expect(
      startMcpHttp({
        factory: () => new McpServer({ name: 'x', version: '1' }),
        token: 't',
        port: http.port
      })
    ).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })
})

describe('namesakes over MCP (Ask spec §4.1)', () => {
  it('asks which player by elicitation on the 2026-07-28 era', async () => {
    const asked: string[] = []
    const client = await connect(await serve(), 'modern', (message) => {
      asked.push(message)
      return { action: 'accept', content: { player: '00-0032001' } }
    })
    const r = await client.callTool({ name: 'find', arguments: { text: 'Chris Jones' } })
    expect(asked).toEqual(['Which Chris Jones?'])
    expect(textOf(r)).toContain('Player: Chris Jones = 00-0032001 (DB, ARI)')
    expect(textOf(r)).not.toContain('00-0032000')
    expect(textOf(r)).toContain('The user chose Chris Jones (00-0032001).')
    await client.close()
  })

  it('lists every namesake when the user declines or the client cannot ask', async () => {
    const declined = await connect(await serve(), 'modern', () => ({ action: 'decline' }))
    const r = await declined.callTool({ name: 'find', arguments: { text: 'Chris Jones' } })
    expect(textOf(r)).toContain('00-0032000')
    expect(textOf(r)).toContain('00-0032001')
    await declined.close()
    const legacy = await connect(open!, 'legacy', () => ({ action: 'accept' }))
    const l = await legacy.callTool({ name: 'find', arguments: { text: 'Chris Jones' } })
    expect(textOf(l)).toContain('00-0032000')
    expect(textOf(l)).toContain('00-0032001')
    await legacy.close()
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/mcp.test.ts
```

Expected: FAIL — `@main/analyst/mcp/http` and `@main/analyst/mcp/server` do not exist.

- [ ] **Step 3: Implement**

Modify `src/main/analyst/brief/analyst.md`:

```diff
diff --git a/src/main/analyst/brief/analyst.md b/src/main/analyst/brief/analyst.md
index a2cb01d..2c737c0 100644
--- a/src/main/analyst/brief/analyst.md
+++ b/src/main/analyst/brief/analyst.md
@@ -4,7 +4,7 @@ Data: NFL seasons 2019–{{season}}. The current season is {{season}}, played th

 How to work:

-- Read the context block first: copy player ids, team codes and metric ids from it. When a name matches several players, ask which one before calling a tool.
+- Get ids first: copy player ids, team codes and metric ids from the context block when there is one; otherwise call find with the names and the stat in the question. When a name matches several players, ask which one before calling a tool.
 - Prefer the task tools (leaderboard, player_stats, team_stats, compare, trend, outlook, games, league, describe). Use query only for what they cannot express.
 - When a call fails, read the error: it says what to change.

```

Create `src/main/analyst/mcp/http.ts`:

```ts
import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler
} from '@modelcontextprotocol/node'
import { createMcpHandler, type McpServerFactory } from '@modelcontextprotocol/server'

/**
 * The MCP server over Streamable HTTP (Ask spec §6.1): on 127.0.0.1 only, at `/mcp`, behind a bearer
 * token, with the Host and Origin headers checked so a web page cannot reach it (DNS rebinding,
 * cross-site requests). Both protocol eras are served: 2026-07-28 requests and the stateless
 * fallback for 2025 clients.
 */
export const MCP_PATH = '/mcp'

export interface McpHttp {
  port: number
  url: string
  close(): Promise<void>
}

export interface McpHttpOptions {
  factory: McpServerFactory
  token: string
  /** 0 picks a free port. */
  port: number
  onError?: (err: Error) => void
}

function json(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** Constant-time comparison of the `Authorization` header with the token. */
function authorized(req: IncomingMessage, token: string): boolean {
  const given = Buffer.from(req.headers.authorization ?? '')
  const wanted = Buffer.from(`Bearer ${token}`)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

/** Listens on `127.0.0.1:port`; rejects with the socket error (EADDRINUSE, EACCES) when it cannot. */
export async function startMcpHttp(options: McpHttpOptions): Promise<McpHttp> {
  const handler = createMcpHandler(options.factory, { onerror: options.onError })
  const serve = toNodeHandler(handler, { onerror: options.onError })
  const checkHost = localhostHostValidation()
  const checkOrigin = localhostOriginValidation()

  const server = createServer((req, res) => {
    // The guards answer 403 themselves.
    if (!checkHost(req, res) || !checkOrigin(req, res)) return
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (path !== MCP_PATH) return json(res, 404, { error: 'not found' })
    if (!authorized(req, options.token)) return json(res, 401, { error: 'unauthorized' })
    serve(req, res).catch((err: unknown) => {
      options.onError?.(err instanceof Error ? err : new Error(String(err)))
      if (!res.headersSent) json(res, 500, { error: 'internal error' })
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const port = (server.address() as AddressInfo).port
  return {
    port,
    url: `http://127.0.0.1:${port}${MCP_PATH}`,
    async close() {
      await handler.close()
      // `subscriptions/listen` streams stay open until the client leaves: end them.
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}
```

Create `src/main/analyst/mcp/server.ts`:

```ts
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
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/mcp.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/mcp/server.ts src/main/analyst/mcp/http.ts src/main/analyst/brief/analyst.md tests/main/analyst/mcp.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/mcp/server.ts src/main/analyst/mcp/http.ts src/main/analyst/brief/analyst.md tests/main/analyst/mcp.test.ts
git commit -m "feat(analyst): MCP server over Streamable HTTP"
```

Expected: typecheck and lint clean; the suite at 1,290 passed, 6 skipped (a clean checkout).

---

### Task 3: The endpoint file and the stdio bridge (spec §6.1; amendment G)

The app writes `mcp.json` (URL, token, pid, version) in `userData` when its server listens, and removes it when the server stops.

The bridge is `out/main/mcpBridge.js`, run by Claude desktop as the app's exe with `ELECTRON_RUN_AS_NODE=1`. It forwards each JSON-RPC message as it is: stdio in, the SDK's HTTP client transport out. After a failed send:

- **The app runs and has moved** (a new port, a new key): retry once on the new endpoint.
- **The app runs and has not moved:** say that the app could not answer.
- **The app is down:** open the shortcut and wait up to 30 s for the server. Concurrent calls share one start, and a later question starts the app again if it quit.
- **No shortcut:** answer every request with what to do.

The shortcut is opened with `explorer.exe`, so the app starts from the user's shell, outside Claude's MSIX container. The tests inject `launch`.

**Files:**

- Create: `src/main/analyst/mcp/endpoint.ts`, `src/main/analyst/mcp/bridge.ts`, `src/main/analyst/mcp/bridgeMain.ts`, `tests/main/analyst/bridge.test.ts`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Write the tests**

Claude desktop is an SDK client on a pair of in-memory streams; the app is the real server on a free port, with `mcp.json` in a temporary folder.

Create `tests/main/analyst/bridge.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { NOT_RUNNING, runBridge } from '@main/analyst/mcp/bridge'
import {
  ENDPOINT_FILE,
  readEndpoint,
  removeEndpoint,
  writeEndpoint
} from '@main/analyst/mcp/endpoint'
import { startMcpHttp, type McpHttp } from '@main/analyst/mcp/http'
import { createMcpServer } from '@main/analyst/mcp/server'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult } from '../../fixtures/analyst'

const stats: AnalystStats = {
  status: async () => ({
    available: true,
    through: { season: 2026, seasonType: 'REG', week: 7 },
    updatedAt: '2026-10-27T00:00:00Z',
    busy: false
  }),
  catalogue: async () => catalogueInfo(new Map()),
  people: async () => PEOPLE,
  query: async () => statsResult([]),
  games: async () => [],
  outlook: async () => {
    throw new Error('not in this test')
  },
  player: async () => {
    throw new Error('not in this test')
  }
}

const servers: McpHttp[] = []
const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const c of closers.splice(0)) await c()
  for (const s of servers.splice(0)) await s.close()
})

/** The app: its MCP server, and `mcp.json` in `dir`. */
async function app(dir: string, token: string): Promise<McpHttp> {
  const analyst = createAnalyst({ stats, league: () => null })
  const http = await startMcpHttp({
    factory: () => createMcpServer({ analyst, version: '0.38.0', examples: () => [] }),
    token,
    port: 0
  })
  servers.push(http)
  writeEndpoint(dir, { url: http.url, token, pid: process.pid, version: '0.38.0' })
  return http
}

/** Claude desktop: a client on the bridge's stdio. */
async function claude(
  dir: string,
  options: { era?: 'legacy' | 'modern'; start?: string | null; launch?: () => void } = {}
): Promise<{ client: Client; logs: string[]; launches: number }> {
  const toBridge = new PassThrough()
  const fromBridge = new PassThrough()
  const logs: string[] = []
  const state = { client: null as unknown as Client, logs, launches: 0 }
  const done = runBridge({
    userData: dir,
    start: options.start ?? null,
    input: toBridge,
    output: fromBridge,
    log: (l) => logs.push(l),
    launch: () => {
      state.launches++
      options.launch?.()
    },
    waitMs: 3_000,
    pollMs: 50
  })
  const client = new Client(
    { name: 'claude-desktop', version: '1' },
    {
      capabilities: { elicitation: { form: {} } },
      versionNegotiation: options.era === 'modern' ? { mode: { pin: '2026-07-28' } } : undefined
    }
  )
  client.setRequestHandler('elicitation/create', async () => ({
    action: 'accept',
    content: { player: '00-0032000' }
  }))
  closers.push(async () => {
    await client.close()
    toBridge.end()
    await done
  })
  await client.connect(new StdioServerTransport(fromBridge, toBridge))
  state.client = client
  return state
}

const textOf = (r: { content?: unknown }): string =>
  (r.content as { text: string }[]).map((c) => c.text).join('\n')

const tempDir = (): string => mkdtempSync(join(tmpdir(), 'ffc-mcp-'))

describe('the stdio bridge (Ask spec §6.1)', () => {
  it.each(['legacy', 'modern'] as const)('carries a %s-era session to the app', async (era) => {
    const dir = tempDir()
    await app(dir, 'token-a')
    const { client } = await claude(dir, { era })
    expect((await client.listTools()).tools).toHaveLength(11)
    const r = await client.callTool({ name: 'find', arguments: { text: 'Chris Jones' } })
    // The elicitation rides the 2026-07-28 result through the bridge; a 2025 client gets the list.
    if (era === 'modern') expect(textOf(r)).toContain('The user chose Chris Jones (00-0032000).')
    else expect(textOf(r)).toMatch(/00-0032000[\s\S]*00-0032001/)
  })

  it('follows the app to a new port and token after a restart', async () => {
    const dir = tempDir()
    const first = await app(dir, 'token-a')
    const { client } = await claude(dir)
    expect((await client.listTools()).tools).toHaveLength(11)
    await first.close()
    servers.splice(servers.indexOf(first), 1)
    await app(dir, 'token-b')
    const r = await client.callTool({ name: 'describe', arguments: { metric: 'yprr' } })
    expect(textOf(r)).toMatch(/^Yards per route run/)
  })

  it('answers every request with what to do when the app is not running', async () => {
    const dir = tempDir()
    await app(dir, 'token-a')
    const { client } = await claude(dir)
    removeEndpoint(dir)
    await servers.pop()!.close()
    await expect(client.listTools()).rejects.toThrow(NOT_RUNNING)
  })

  it('starts the app through its shortcut, once at a time, and again if it quits', async () => {
    const dir = tempDir()
    // A stale file from a crash: its port no longer answers.
    writeFileSync(
      join(dir, ENDPOINT_FILE),
      JSON.stringify({ url: 'http://127.0.0.1:9/mcp', token: 'old', pid: 1, version: '0.37.0' })
    )
    const s = await claude(dir, {
      start: 'C:\\Users\\me\\AppData\\Roaming\\FantasyCompanion\\start-for-claude.lnk',
      launch: () => void setTimeout(() => void app(dir, 'token-c'), 200)
    })
    expect(s.launches).toBe(1)
    expect((await s.client.listTools()).tools).toHaveLength(11)
    expect(readEndpoint(dir)?.token).toBe('token-c')
    expect(s.logs.filter((l) => l === 'starting FantasyCompanion')).toHaveLength(1)
    // The app quits; the next questions start it again, once for both.
    removeEndpoint(dir)
    await servers.pop()!.close()
    const [tools, described] = await Promise.all([
      s.client.listTools(),
      s.client.callTool({ name: 'describe', arguments: { metric: 'yprr' } })
    ])
    expect(tools.tools).toHaveLength(11)
    expect(textOf(described)).toMatch(/^Yards per route run/)
    expect(s.launches).toBe(2)
  })

  it('does not start the app when it runs but a call fails', async () => {
    const dir = tempDir()
    const broken = createServer((_req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end('{"error":"internal error"}')
    })
    await new Promise<void>((r) => broken.listen(0, '127.0.0.1', r))
    closers.push(() => new Promise((r) => broken.close(() => r())))
    const port = (broken.address() as { port: number }).port
    writeEndpoint(dir, {
      url: `http://127.0.0.1:${port}/mcp`,
      token: 't',
      pid: 1,
      version: '0.38.0'
    })
    const s = await claude(dir, { start: 'start-for-claude.lnk' }).catch((err: Error) => ({
      error: err
    }))
    expect('error' in s && s.error.message).toMatch(/^FantasyCompanion could not answer: /)
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/bridge.test.ts
```

Expected: FAIL — `@main/analyst/mcp/bridge` and `@main/analyst/mcp/endpoint` do not exist.

- [ ] **Step 3: Implement**

Modify `electron.vite.config.ts`:

```diff
diff --git a/electron.vite.config.ts b/electron.vite.config.ts
index c9d7de0..a2fe1ce 100644
--- a/electron.vite.config.ts
+++ b/electron.vite.config.ts
@@ -12,11 +12,13 @@ export default defineConfig({
       rollupOptions: {
         external: ['node:sqlite'],
         // The trade and waiver searches (6b / 6c spec §6) and the stats database (stats-analysis
-        // spec §2) run in worker threads, bundled beside the main entry.
+        // spec §2) run in worker threads, bundled beside the main entry; so is the MCP bridge that
+        // Claude desktop runs (Ask spec §6.1).
         input: {
           index: resolve('src/main/index.ts'),
           engineWorker: resolve('src/main/engine/worker.ts'),
-          statsWorker: resolve('src/main/stats/worker.ts')
+          statsWorker: resolve('src/main/stats/worker.ts'),
+          mcpBridge: resolve('src/main/analyst/mcp/bridgeMain.ts')
         }
       }
     }
```

Create `src/main/analyst/mcp/bridge.ts`:

```ts
import { connect } from 'node:net'
import type { Readable, Writable } from 'node:stream'
import { type JSONRPCMessage, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { type McpEndpoint, readEndpoint } from './endpoint'

/**
 * The stdio bridge (Ask spec §6.1): Claude desktop speaks MCP over stdio, the app's server over
 * HTTP, so this forwards each message as it is, both ways. It runs as the app's own exe in Node mode
 * (`ELECTRON_RUN_AS_NODE`), reads the endpoint from `mcp.json`, and when the app is not running,
 * starts it through its shortcut (one start at a time) and waits for the server.
 */
export const NOT_RUNNING =
  'FantasyCompanion is not running, or Claude is turned off in Stats › Ask. Open the app, turn it on, and try again.'

export interface BridgeOptions {
  /** The app's `userData` folder, where `mcp.json` is. */
  userData: string
  /** A shortcut that starts the app minimised, or null when the bridge must not start it. */
  start: string | null
  input: Readable
  output: Writable
  log: (line: string) => void
  /** Opens the shortcut (Windows: `explorer.exe`, so the app starts outside the caller's package). */
  launch: (shortcut: string) => void
  /** How long to wait for the app's server after starting it. */
  waitMs?: number
  pollMs?: number
}

const isRequest = (
  m: JSONRPCMessage
): m is JSONRPCMessage & { id: string | number; method: string } =>
  'method' in m && 'id' in m && m.id !== undefined

/** The server answers on its port. */
function listening(url: string): Promise<boolean> {
  const { hostname, port } = new URL(url)
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: Number(port) })
    socket.setTimeout(1_000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Where the app stands after a failed send. */
type Revival = 'retry' | 'up' | 'down'

export async function runBridge(options: BridgeOptions): Promise<void> {
  const waitMs = options.waitMs ?? 30_000
  const pollMs = options.pollMs ?? 500
  const stdio = new StdioServerTransport(options.input, options.output)
  type Http = { transport: StreamableHTTPClientTransport; endpoint: McpEndpoint }
  let http: Promise<Http> | null = null
  let starting: Promise<boolean> | null = null

  /** The HTTP side, opened on the first message and kept until the app moves or goes. */
  function open(): Promise<Http> {
    if (http) return http
    const opening = (async () => {
      const endpoint = readEndpoint(options.userData)
      if (!endpoint) throw new Error(NOT_RUNNING)
      const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
        requestInit: { headers: { Authorization: `Bearer ${endpoint.token}` } }
      })
      transport.onmessage = (m) => void reply(m)
      transport.onerror = (err) => options.log(`http: ${err.message}`)
      await transport.start()
      return { transport, endpoint }
    })()
    http = opening
    opening.catch(() => {
      if (http === opening) http = null
    })
    return opening
  }

  /** Forgets the HTTP side a failed send used (not a newer one another send opened since). */
  function drop(used: Promise<Http> | null): void {
    if (!used || http !== used) return
    http = null
    void used.then(({ transport }) => transport.close()).catch(() => {})
  }

  /** To Claude; after it has gone (stdin closed), there is no one to tell. */
  const reply = (m: JSONRPCMessage): Promise<void> => stdio.send(m).catch(() => {})

  /** Opens the shortcut and waits for the server; concurrent failures share one start. */
  function startApp(shortcut: string): Promise<boolean> {
    starting ??= (async () => {
      options.log('starting FantasyCompanion')
      options.launch(shortcut)
      for (let waited = 0; waited < waitMs; waited += pollMs) {
        await sleep(pollMs)
        const e = readEndpoint(options.userData)
        if (e && (await listening(e.url))) return true
      }
      return false
    })().finally(() => (starting = null))
    return starting
  }

  /**
   * After a failed send. The app runs: a retry helps only if it moved since (a restart on another
   * port, a new key). The app is gone: start it, then retry.
   */
  async function revive(used: McpEndpoint | null, mayStart: boolean): Promise<Revival> {
    const now = readEndpoint(options.userData)
    if (now && (await listening(now.url)))
      return now.url !== used?.url || now.token !== used.token ? 'retry' : 'up'
    if (mayStart && options.start && (await startApp(options.start))) return 'retry'
    return 'down'
  }

  async function deliver(message: JSONRPCMessage): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      let side: Promise<Http> | null = null
      let used: McpEndpoint | null = null
      try {
        side = open()
        const { transport, endpoint } = await side
        used = endpoint
        await transport.send(message)
        return
      } catch (err) {
        const state = await revive(used, attempt === 0)
        if (state === 'retry' && attempt === 0) {
          drop(side)
          continue
        }
        const text = err instanceof Error ? err.message : String(err)
        options.log(
          `could not forward ${'method' in message ? message.method : 'a reply'}: ${text}`
        )
        if (isRequest(message))
          await reply({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: state === 'up' ? `FantasyCompanion could not answer: ${text}` : NOT_RUNNING
            }
          })
        return
      }
    }
  }

  await new Promise<void>((resolve) => {
    stdio.onmessage = (m) => void deliver(m)
    stdio.onerror = (err) => options.log(`stdio: ${err.message}`)
    stdio.onclose = () => {
      drop(http)
      resolve()
    }
    void stdio.start()
  })
}
```

Create `src/main/analyst/mcp/bridgeMain.ts`:

```ts
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { runBridge } from './bridge'

/**
 * `mcpBridge.js`, bundled beside the main entry: `FantasyCompanion.exe mcpBridge.js --user-data <dir>
 * [--start <shortcut>]` with `ELECTRON_RUN_AS_NODE=1` (Ask spec §6.1). Logs go to stderr, which
 * Claude desktop keeps in its MCP log; stdout carries the protocol only.
 */
const { values } = parseArgs({
  options: { 'user-data': { type: 'string' }, start: { type: 'string' } },
  strict: false
})

const log = (line: string): void => void process.stderr.write(`[fantasy-companion] ${line}\n`)

const userData = values['user-data']
if (typeof userData !== 'string') {
  log('usage: mcpBridge.js --user-data <dir> [--start <shortcut>]')
  process.exit(2)
}

runBridge({
  userData,
  start: typeof values.start === 'string' ? values.start : null,
  input: process.stdin,
  output: process.stdout,
  log,
  // A process started by a packaged (MSIX) Claude desktop runs in its container, and so would a
  // child it started: its new files under AppData would land in Claude's package. Explorer opens
  // the shortcut from the user's shell instead, outside any container (measured 2026-11-02).
  launch: (shortcut) => {
    if (!existsSync(shortcut)) return log(`no shortcut at ${shortcut}; open the app by hand`)
    const explorer = join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe')
    spawn(explorer, [shortcut], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  }
}).then(
  () => process.exit(0),
  (err: unknown) => {
    log(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
)
```

Create `src/main/analyst/mcp/endpoint.ts`:

```ts
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where the running app's MCP server is (Ask spec §6.1): `mcp.json` in `userData`, written when the
 * server listens and removed when it stops. The stdio bridge reads it, so Claude desktop's config
 * holds no port or token.
 */
export const ENDPOINT_FILE = 'mcp.json'

export interface McpEndpoint {
  url: string
  token: string
  pid: number
  version: string
}

export function writeEndpoint(dir: string, endpoint: McpEndpoint): void {
  const path = join(dir, ENDPOINT_FILE)
  // Written whole, then renamed: the bridge never reads half a file.
  writeFileSync(`${path}.tmp`, JSON.stringify(endpoint), { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}

/** The endpoint, or null when there is none (the app is not running, or Ask › Claude is off). */
export function readEndpoint(dir: string): McpEndpoint | null {
  try {
    const e = JSON.parse(readFileSync(join(dir, ENDPOINT_FILE), 'utf8')) as Partial<McpEndpoint>
    if (typeof e.url !== 'string' || typeof e.token !== 'string') return null
    return {
      url: e.url,
      token: e.token,
      pid: typeof e.pid === 'number' ? e.pid : 0,
      version: typeof e.version === 'string' ? e.version : ''
    }
  } catch {
    return null
  }
}

export function removeEndpoint(dir: string): void {
  rmSync(join(dir, ENDPOINT_FILE), { force: true })
}
```

- [ ] **Step 4: Run them and see them pass, and build the bridge**

```bash
npx vitest run tests/main/analyst/bridge.test.ts
npx electron-vite build && grep -o 'require("[^"]*")' out/main/mcpBridge.js | sort -u
```

Expected: PASS, 6 tests. The bundle has `out/main/mcpBridge.js` (about 6 KB). It requires only Node built-ins, `@modelcontextprotocol/client`, `@modelcontextprotocol/server/stdio` and one shared chunk (`./chunks/endpoint-*.js`); it must not require `electron`.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/mcp/endpoint.ts src/main/analyst/mcp/bridge.ts src/main/analyst/mcp/bridgeMain.ts electron.vite.config.ts tests/main/analyst/bridge.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/mcp/endpoint.ts src/main/analyst/mcp/bridge.ts src/main/analyst/mcp/bridgeMain.ts electron.vite.config.ts tests/main/analyst/bridge.test.ts
git commit -m "feat(analyst): stdio bridge for Claude desktop"
```

Expected: typecheck and lint clean; the suite at 1,296 passed, 6 skipped (a clean checkout).

---

### Task 4: Claude desktop's config (spec §6.1; amendment F)

`desktopConfigPath()` finds the folder Claude desktop keeps its config in. On this PC that is the Store app's `Claude-Data` folder. `desktopState()` says whether our entry is there and current. `addToDesktop()` adds or updates `mcpServers["fantasy-companion"]` and nothing else:

- it first copies the file to `claude_desktop_config.json.<stamp>.bak`;
- it writes through a temporary file and a rename;
- it refuses a file that is not valid JSON.

**Files:**

- Create: `src/main/analyst/mcp/claudeDesktop.ts`, `tests/main/analyst/claudeDesktop.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/analyst/claudeDesktop.test.ts`:

```ts
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addToDesktop,
  CONFIG_FILE,
  desktopConfigPath,
  desktopState,
  type DesktopEntry
} from '@main/analyst/mcp/claudeDesktop'

const ENTRY: DesktopEntry = {
  command: 'C:\\Programs\\FantasyCompanion\\FantasyCompanion.exe',
  args: ['C:\\Programs\\FantasyCompanion\\resources\\app.asar\\out\\main\\mcpBridge.js'],
  env: { ELECTRON_RUN_AS_NODE: '1' }
}

function profile(): { local: string; roaming: string } {
  const root = mkdtempSync(join(tmpdir(), 'ffc-claude-'))
  const local = join(root, 'Local')
  const roaming = join(root, 'Roaming')
  mkdirSync(local)
  mkdirSync(roaming)
  return { local, roaming }
}

describe('finding Claude desktop’s config', () => {
  it('prefers the Store app’s data folder, then the classic install', () => {
    const p = profile()
    const env = { LOCALAPPDATA: p.local, APPDATA: p.roaming }
    expect(desktopConfigPath('win32', env)).toBeNull()
    mkdirSync(join(p.roaming, 'Claude'))
    expect(desktopConfigPath('win32', env)).toBe(join(p.roaming, 'Claude', CONFIG_FILE))
    mkdirSync(join(p.local, 'Claude-Data', 'claude_pzs8sxrjxfjjc'), { recursive: true })
    expect(desktopConfigPath('win32', env)).toBe(
      join(p.local, 'Claude-Data', 'claude_pzs8sxrjxfjjc', CONFIG_FILE)
    )
  })

  it('reads an older Store app inside its package, unless its data has moved out', () => {
    const p = profile()
    const env = { LOCALAPPDATA: p.local, APPDATA: p.roaming }
    const inside = join(
      p.local,
      'Packages',
      'Claude_pzs8sxrjxfjjc',
      'LocalCache',
      'Roaming',
      'Claude'
    )
    mkdirSync(inside, { recursive: true })
    expect(desktopConfigPath('win32', env)).toBe(join(inside, CONFIG_FILE))
    writeFileSync(join(inside, '.user-data-left.claude_pzs8sxrjxfjjc'), '')
    expect(desktopConfigPath('win32', env)).toBeNull()
  })
})

describe('adding the server to Claude desktop', () => {
  it('keeps Claude’s own settings and servers, and backs the file up first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-claude-'))
    const path = join(dir, CONFIG_FILE)
    const before = {
      preferences: { sidebarMode: 'epitaxy' },
      mcpServers: { other: { command: 'npx', args: ['x'] } }
    }
    writeFileSync(path, JSON.stringify(before))
    expect(desktopState(path, ENTRY)).toBe('absent')
    const backup = addToDesktop(path, ENTRY, new Date('2026-11-02T14:05:09Z'))
    expect(backup).toBe(`${path}.20261102-140509.bak`)
    expect(JSON.parse(readFileSync(backup!, 'utf8'))).toEqual(before)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      preferences: { sidebarMode: 'epitaxy' },
      mcpServers: { other: { command: 'npx', args: ['x'] }, 'fantasy-companion': ENTRY }
    })
    expect(desktopState(path, ENTRY)).toBe('added')
    expect(desktopState(path, { ...ENTRY, args: ['elsewhere.js'] })).toBe('outdated')
    expect(readdirSync(dir).sort()).toEqual([CONFIG_FILE, `${CONFIG_FILE}.20261102-140509.bak`])
  })

  it('creates the file when Claude has none, and never overwrites one it cannot read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-claude-'))
    const path = join(dir, CONFIG_FILE)
    expect(addToDesktop(path, ENTRY, new Date())).toBeNull()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      mcpServers: { 'fantasy-companion': ENTRY }
    })
    writeFileSync(path, '{ "preferences": ')
    expect(desktopState(path, ENTRY)).toBe('unreadable')
    expect(() => addToDesktop(path, ENTRY, new Date())).toThrow(/not valid JSON/)
    expect(readFileSync(path, 'utf8')).toBe('{ "preferences": ')
    expect(existsSync(join(dir, `.${CONFIG_FILE}.tmp`))).toBe(false)
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/claudeDesktop.test.ts
```

Expected: FAIL — `@main/analyst/mcp/claudeDesktop` does not exist.

- [ ] **Step 3: Implement**

Create `src/main/analyst/mcp/claudeDesktop.ts`:

```ts
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { MCP_NAME } from './server'

/**
 * Claude desktop's MCP config (Ask spec §6.1, "Add to Claude desktop"). The file also holds Claude's
 * own preferences, so only `mcpServers["fantasy-companion"]` is written, after a backup.
 */
export const CONFIG_FILE = 'claude_desktop_config.json'

export interface DesktopEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

export type DesktopState = 'added' | 'outdated' | 'absent' | 'unreadable' | 'not-found'

/**
 * Where Claude desktop keeps its config, most likely first (Windows):
 * - the Store (MSIX) app keeps its data outside its package, in `%LOCALAPPDATA%\Claude-Data\claude_<id>\`
 *   (measured on this PC, 2026-11-02);
 * - the classic installer, `%APPDATA%\Claude\`;
 * - an older Store app, inside its package (`LocalCache\Roaming\Claude`), unless it has moved out
 *   (a `.user-data-left.*` marker stays behind).
 * The first folder that exists wins; the file itself may not exist yet.
 */
export function desktopConfigPath(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string = homedir()
): string | null {
  const dirs = (parent: string, prefix: string): string[] => {
    try {
      return readdirSync(parent)
        .filter((d) => d.toLowerCase().startsWith(prefix))
        .map((d) => join(parent, d))
    } catch {
      return []
    }
  }
  const candidates: string[] = []
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA
    const roaming = env.APPDATA
    if (local) candidates.push(...dirs(join(local, 'Claude-Data'), 'claude_'))
    if (roaming) candidates.push(join(roaming, 'Claude'))
    if (local)
      for (const pkg of dirs(join(local, 'Packages'), 'claude_')) {
        const dir = join(pkg, 'LocalCache', 'Roaming', 'Claude')
        const moved = dirs(dir, '.user-data-left').length > 0
        if (!moved) candidates.push(dir)
      }
  } else if (platform === 'darwin') {
    candidates.push(join(home, 'Library', 'Application Support', 'Claude'))
  }
  const found = candidates.find((d) => existsSync(d))
  return found ? join(found, CONFIG_FILE) : null
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function readConfig(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function desktopState(path: string | null, entry: DesktopEntry): DesktopState {
  if (!path) return 'not-found'
  const config = readConfig(path)
  if (!config) return 'unreadable'
  const servers = config.mcpServers as Record<string, unknown> | undefined
  const ours = servers?.[MCP_NAME]
  if (!ours) return 'absent'
  return same(ours, entry) ? 'added' : 'outdated'
}

/** Adds (or updates) the entry; the file as it was is kept beside it. Returns the backup's path. */
export function addToDesktop(path: string, entry: DesktopEntry, now: Date): string | null {
  const config = readConfig(path)
  if (!config)
    throw new Error(
      `Claude desktop's config is not valid JSON (${path}); fix it or add the server by hand`
    )
  let backup: string | null = null
  if (existsSync(path)) {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
    backup = `${path}.${stamp}.bak`
    copyFileSync(path, backup)
  }
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>
  const next = { ...config, mcpServers: { ...servers, [MCP_NAME]: entry } }
  const tmp = join(dirname(path), `.${CONFIG_FILE}.tmp`)
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`)
  renameSync(tmp, path)
  return backup
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/claudeDesktop.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/mcp/claudeDesktop.ts tests/main/analyst/claudeDesktop.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/mcp/claudeDesktop.ts tests/main/analyst/claudeDesktop.test.ts
git commit -m "feat(analyst): add the server to Claude desktop"
```

Expected: typecheck and lint clean; the suite at 1,300 passed, 6 skipped (a clean checkout).

---

### Task 5: The MCP service, its settings and IPC (spec §6.1; amendments E, I)

`createMcpService()` owns the server's life in main:

- **Off by default** (`ask_mcp_enabled`).
- **When on:** it listens on the kept port (`ask_mcp_port`, picked once in 41000–48999, moved when taken or reserved) with the kept token (`ask_mcp_token`, 32 random bytes). It then writes `mcp.json` and, on Windows, the shortcut.
- **The status** for the screen: never the token.
- **The commands the copy buttons put on the clipboard:**
  - Claude Code over HTTP (on Windows);
  - Claude Code in WSL, through the bridge by interop;
  - Claude desktop's entry as JSON, to paste by hand.
- **"Add to Claude desktop"** and **"make a new key"**.

`registerMcpHandlers()` exposes it as `ask:mcp*`; adding to Claude desktop asks first, in a dialog that names the file.

**Files:**

- Create: `src/main/analyst/mcp/service.ts`, `src/main/analyst/mcp/ipc.ts`, `tests/main/analyst/mcpService.test.ts`
- Modify: `src/shared/ask.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/analyst/mcpService.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting, setSetting } from '@main/db/repos/settings'
import { CONFIG_FILE } from '@main/analyst/mcp/claudeDesktop'
import { readEndpoint } from '@main/analyst/mcp/endpoint'
import {
  createMcpService,
  type McpService,
  type McpServiceDeps,
  SETTING_MCP_PORT,
  SETTING_MCP_TOKEN,
  SHORTCUT_FILE,
  wslPath
} from '@main/analyst/mcp/service'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult } from '../../fixtures/analyst'

const stats: AnalystStats = {
  status: async () => ({
    available: true,
    through: { season: 2026, seasonType: 'REG', week: 7 },
    updatedAt: '2026-10-27T00:00:00Z',
    busy: false
  }),
  catalogue: async () => catalogueInfo(new Map()),
  people: async () => PEOPLE,
  query: async () => statsResult([]),
  games: async () => [],
  outlook: async () => {
    throw new Error('not in this test')
  },
  player: async () => {
    throw new Error('not in this test')
  }
}

const running: McpService[] = []
afterEach(async () => {
  for (const s of running.splice(0)) await s.stop()
})

function service(over: Partial<McpServiceDeps> = {}): {
  mcp: McpService
  deps: McpServiceDeps
  shortcuts: string[]
} {
  const db = openDatabase(':memory:')
  migrate(db)
  const userData = mkdtempSync(join(tmpdir(), 'ffc-user-'))
  const shortcuts: string[] = []
  const deps: McpServiceDeps = {
    db,
    analyst: createAnalyst({ stats, league: () => null }),
    userData,
    version: '0.38.0',
    exe: 'C:\\Users\\me\\AppData\\Local\\Programs\\FantasyCompanion\\FantasyCompanion.exe',
    bridge:
      'C:\\Users\\me\\AppData\\Local\\Programs\\FantasyCompanion\\resources\\app.asar\\out\\main\\mcpBridge.js',
    platform: 'win32',
    env: {},
    writeShortcut: (path) => shortcuts.push(path),
    now: () => new Date('2026-11-02T14:05:09Z'),
    log: () => {},
    ...over
  }
  const mcp = createMcpService(deps)
  running.push(mcp)
  return { mcp, deps, shortcuts }
}

describe('the MCP service (Ask spec §6.1)', () => {
  it('is off by default and starts nothing', async () => {
    const { mcp, deps } = service()
    await mcp.start()
    expect(mcp.status()).toMatchObject({ enabled: false, running: false, url: null, error: null })
    expect(readEndpoint(deps.userData)).toBeNull()
  })

  it('turned on: listens on a port it keeps, writes mcp.json and the shortcut', async () => {
    const { mcp, deps, shortcuts } = service()
    const on = await mcp.setEnabled(true)
    expect(on).toMatchObject({ enabled: true, running: true, error: null, windows: true })
    const port = Number(getSetting(deps.db, SETTING_MCP_PORT))
    expect(port).toBeGreaterThanOrEqual(41000)
    expect(port).toBeLessThan(49000)
    expect(on.url).toBe(`http://127.0.0.1:${port}/mcp`)
    const token = getSetting(deps.db, SETTING_MCP_TOKEN)!
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(readEndpoint(deps.userData)).toEqual({
      url: on.url,
      token,
      pid: process.pid,
      version: '0.38.0'
    })
    expect(shortcuts).toEqual([join(deps.userData, SHORTCUT_FILE)])
    // A restart of the app keeps the port and the token.
    await mcp.stop()
    expect(readEndpoint(deps.userData)).toBeNull()
    await mcp.start()
    expect(mcp.status().url).toBe(on.url)
    expect(readEndpoint(deps.userData)?.token).toBe(token)
    const off = await mcp.setEnabled(false)
    expect(off).toMatchObject({ enabled: false, running: false })
    expect(readEndpoint(deps.userData)).toBeNull()
  })

  it('moves to another port when its own is taken', async () => {
    const taken = createServer()
    await new Promise<void>((r) => taken.listen(0, '127.0.0.1', r))
    const port = (taken.address() as { port: number }).port
    const { mcp, deps } = service()
    setSetting(deps.db, SETTING_MCP_PORT, String(port))
    const s = await mcp.setEnabled(true)
    taken.close()
    expect(s.running).toBe(true)
    expect(s.url).not.toContain(`:${port}/`)
    expect(getSetting(deps.db, SETTING_MCP_PORT)).not.toBe(String(port))
  })

  it('says why it cannot run without the stats database', async () => {
    const { mcp } = service({ analyst: null })
    const s = await mcp.setEnabled(true)
    expect(s).toMatchObject({ enabled: true, running: false })
    expect(s.error).toMatch(/stats database could not be opened/)
  })

  it('resets the token and writes it for the bridge', async () => {
    const { mcp, deps } = service()
    await mcp.setEnabled(true)
    const before = readEndpoint(deps.userData)!.token
    const s = await mcp.resetToken()
    expect(s.running).toBe(true)
    expect(readEndpoint(deps.userData)!.token).not.toBe(before)
    expect(readEndpoint(deps.userData)!.token).toBe(getSetting(deps.db, SETTING_MCP_TOKEN))
  })

  it('copies the commands for Claude Code (HTTP, or the bridge from WSL) and Claude desktop', async () => {
    const { mcp, deps } = service()
    expect(() => mcp.command('claude-code')).toThrow(/Turn Claude on first/)
    const s = await mcp.setEnabled(true)
    const token = getSetting(deps.db, SETTING_MCP_TOKEN)
    expect(mcp.command('claude-code')).toBe(
      `claude mcp add fantasy-companion --scope user --transport http ${s.url} --header "Authorization: Bearer ${token}"`
    )
    const lnk = join(deps.userData, SHORTCUT_FILE)
    expect(mcp.command('claude-code-wsl')).toBe(
      "claude mcp add fantasy-companion --scope user -e ELECTRON_RUN_AS_NODE=1 -e WSLENV=ELECTRON_RUN_AS_NODE -- '/mnt/c/Users/me/AppData/Local/Programs/FantasyCompanion/FantasyCompanion.exe' " +
        `'${deps.bridge}' '--user-data' '${deps.userData}' '--start' '${lnk}'`
    )
    expect(JSON.parse(mcp.command('claude-desktop'))).toEqual({
      mcpServers: {
        'fantasy-companion': {
          command: deps.exe,
          args: [deps.bridge, '--user-data', deps.userData, '--start', lnk],
          env: { ELECTRON_RUN_AS_NODE: '1' }
        }
      }
    })
    expect(wslPath("D:\\O'Brien\\x.exe")).toBe("/mnt/d/O'Brien/x.exe")
  })

  it('adds itself to Claude desktop’s config, which the status then reads', async () => {
    const local = mkdtempSync(join(tmpdir(), 'ffc-local-'))
    const dir = join(local, 'Claude-Data', 'claude_pzs8sxrjxfjjc')
    mkdirSync(dir, { recursive: true })
    const { mcp } = service({ env: { LOCALAPPDATA: local } })
    expect(mcp.status().claudeDesktop).toEqual({ path: join(dir, CONFIG_FILE), state: 'absent' })
    expect(mcp.addToClaudeDesktop()).toBeNull()
    expect(mcp.status().claudeDesktop.state).toBe('added')
    const saved = JSON.parse(readFileSync(join(dir, CONFIG_FILE), 'utf8'))
    expect(saved.mcpServers['fantasy-companion'].env).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
    const nowhere = service({ env: {} })
    expect(nowhere.mcp.status().claudeDesktop).toEqual({ path: null, state: 'not-found' })
    expect(() => nowhere.mcp.addToClaudeDesktop()).toThrow(/Claude desktop was not found/)
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/mcpService.test.ts
```

Expected: FAIL — `@main/analyst/mcp/service` does not exist.

- [ ] **Step 3: Implement**

Create `src/main/analyst/mcp/ipc.ts`:

```ts
import { type BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import type { McpCopy, McpStatus } from '@shared/ask'
import { IPC } from '@shared/ipc'
import type { McpService } from './service'

/** Stats › Ask, Claude over MCP (Ask spec §6.1). */
export function registerMcpHandlers(mcp: McpService, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.askMcpStatus, (): McpStatus => mcp.status())
  ipcMain.handle(IPC.askMcpSetEnabled, (_event, on: boolean) => mcp.setEnabled(on === true))
  ipcMain.handle(IPC.askMcpResetToken, () => mcp.resetToken())
  ipcMain.handle(IPC.askMcpAddToClaudeDesktop, async (): Promise<McpStatus> => {
    const path = mcp.desktopConfig()
    if (!path)
      throw new Error('Claude desktop was not found on this computer; copy its config instead')
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['Add', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Add to Claude desktop',
      message: 'Add FantasyCompanion to Claude desktop?',
      detail: `This edits ${path}; the file as it is now is kept beside it as a backup.\n\nQuit Claude desktop first, or quit and reopen it afterwards: it reads the file when it starts.`
    }
    const window = getWindow()
    const { response } = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options)
    if (response === 0) mcp.addToClaudeDesktop()
    return mcp.status()
  })
  ipcMain.handle(IPC.askMcpCopy, (_event, kind: McpCopy): void => {
    clipboard.writeText(mcp.command(kind))
  })
}
```

Create `src/main/analyst/mcp/service.ts`:

```ts
import { randomBytes, randomInt } from 'node:crypto'
import { join } from 'node:path'
import type { McpCopy, McpStatus } from '@shared/ask'
import type { Db } from '@main/db/connection'
import { listAskExamples } from '@main/db/repos/askExamples'
import { getSetting, setSetting } from '@main/db/repos/settings'
import type { Analyst } from '../tools'
import { addToDesktop, type DesktopEntry, desktopConfigPath, desktopState } from './claudeDesktop'
import { removeEndpoint, writeEndpoint } from './endpoint'
import { type McpHttp, startMcpHttp } from './http'
import { createMcpServer, MCP_NAME } from './server'

/**
 * Claude over MCP in the app (Ask spec §6.1): off by default; when on, the server listens on a port
 * chosen once and kept (so a Claude Code command stays valid), behind a token kept the same way, and
 * `mcp.json` tells the bridge where it is.
 */
export const SETTING_MCP_ENABLED = 'ask_mcp_enabled'
export const SETTING_MCP_PORT = 'ask_mcp_port'
export const SETTING_MCP_TOKEN = 'ask_mcp_token'

/** The shortcut the bridge opens to start the app (Windows). */
export const SHORTCUT_FILE = 'start-for-claude.lnk'

/** Ports tried first: above the usual servers, below Windows' dynamic range (49152+). */
const PORTS: [number, number] = [41000, 49000]

export interface McpServiceDeps {
  db: Db
  /** Null when the stats database could not be opened. */
  analyst: Analyst | null
  userData: string
  version: string
  /** The app's exe and the bundled bridge, as Claude runs them. */
  exe: string
  bridge: string
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  /** Windows: writes the shortcut that starts the app minimised (Electron's `shell.writeShortcutLink`). */
  writeShortcut: ((path: string) => void) | null
  now?: () => Date
  log?: (message: string, err?: unknown) => void
}

export interface McpService {
  status(): McpStatus
  /** Starts the server when it is on (at launch). */
  start(): Promise<void>
  stop(): Promise<void>
  setEnabled(on: boolean): Promise<McpStatus>
  /** A new token: Claude desktop follows through `mcp.json`; a Claude Code command must be copied again. */
  resetToken(): Promise<McpStatus>
  /** The config file that "Add to Claude desktop" edits, or null when Claude desktop is not found. */
  desktopConfig(): string | null
  /** Adds the server to Claude desktop's config; returns the backup's path. */
  addToClaudeDesktop(): string | null
  command(kind: McpCopy): string
}

const NOT_AVAILABLE =
  'The stats database could not be opened on this computer, so Claude has nothing to read.'

/** `C:\Users\me` → `/mnt/c/Users/me`, for a command run in WSL. */
export function wslPath(windows: string): string {
  return windows
    .replace(/^([A-Za-z]):\\/, (_, d: string) => `/mnt/${d.toLowerCase()}/`)
    .replace(/\\/g, '/')
}

/** A word for bash, in single quotes. */
const sh = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

export function createMcpService(deps: McpServiceDeps): McpService {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? ((m, err) => console.error(m, err))
  const shortcut = deps.writeShortcut ? join(deps.userData, SHORTCUT_FILE) : null
  let http: McpHttp | null = null
  let error: string | null = null
  let busy: Promise<void> = Promise.resolve()

  const enabled = (): boolean => getSetting(deps.db, SETTING_MCP_ENABLED) === '1'

  function token(): string {
    const kept = getSetting(deps.db, SETTING_MCP_TOKEN)
    if (kept) return kept
    const made = randomBytes(32).toString('base64url')
    setSetting(deps.db, SETTING_MCP_TOKEN, made)
    return made
  }

  function entry(): DesktopEntry {
    return {
      command: deps.exe,
      args: [deps.bridge, '--user-data', deps.userData, ...(shortcut ? ['--start', shortcut] : [])],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    }
  }

  const desktopConfig = (): string | null => desktopConfigPath(deps.platform, deps.env)

  async function listen(): Promise<void> {
    if (http || !enabled()) return
    if (!deps.analyst) {
      error = NOT_AVAILABLE
      return
    }
    const analyst = deps.analyst
    const key = token()
    const saved = Number(getSetting(deps.db, SETTING_MCP_PORT))
    let port = saved > 0 ? saved : randomInt(...PORTS)
    for (let attempt = 0; !http; attempt++) {
      try {
        http = await startMcpHttp({
          factory: () =>
            createMcpServer({
              analyst,
              version: deps.version,
              examples: () => listAskExamples(deps.db)
            }),
          token: key,
          port,
          onError: (err) => log('MCP request failed', err)
        })
      } catch (err) {
        const code = (err as { code?: string }).code
        // Taken, or reserved by Windows (Hyper-V's excluded ranges answer EACCES): try another.
        if ((code === 'EADDRINUSE' || code === 'EACCES') && attempt < 20) {
          port = randomInt(...PORTS)
          continue
        }
        error = `The server could not start: ${err instanceof Error ? err.message : String(err)}`
        return
      }
    }
    error = null
    setSetting(deps.db, SETTING_MCP_PORT, String(http.port))
    writeEndpoint(deps.userData, {
      url: http.url,
      token: key,
      pid: process.pid,
      version: deps.version
    })
    if (shortcut) {
      try {
        deps.writeShortcut!(shortcut)
      } catch (err) {
        log('could not write the shortcut for Claude', err)
      }
    }
  }

  async function close(): Promise<void> {
    removeEndpoint(deps.userData)
    const open = http
    http = null
    await open?.close()
  }

  /** One start or stop at a time. */
  const serial = (fn: () => Promise<void>): Promise<void> => (busy = busy.then(fn, fn))

  function status(): McpStatus {
    const path = desktopConfig()
    return {
      enabled: enabled(),
      windows: deps.platform === 'win32',
      running: http !== null,
      url: http?.url ?? null,
      error: enabled() ? error : null,
      claudeDesktop: { path, state: desktopState(path, entry()) }
    }
  }

  return {
    status,
    start: () => serial(listen),
    stop: () => serial(close),
    async setEnabled(on) {
      setSetting(deps.db, SETTING_MCP_ENABLED, on ? '1' : '0')
      await serial(on ? listen : close)
      return status()
    },
    async resetToken() {
      setSetting(deps.db, SETTING_MCP_TOKEN, randomBytes(32).toString('base64url'))
      await serial(async () => {
        if (!http) return
        await close()
        await listen()
      })
      return status()
    },
    desktopConfig,
    addToClaudeDesktop() {
      const path = desktopConfig()
      if (!path)
        throw new Error('Claude desktop was not found on this computer; copy its config instead')
      return addToDesktop(path, entry(), now())
    },
    command(kind) {
      if (kind === 'claude-desktop')
        return `${JSON.stringify({ mcpServers: { [MCP_NAME]: entry() } }, null, 2)}\n`
      if (kind === 'claude-code-wsl') {
        // WSL's default (NAT) networking cannot reach Windows' 127.0.0.1: Claude Code there runs the
        // bridge through WSL interop, with the variable passed on by WSLENV.
        const e = entry()
        return [
          `claude mcp add ${MCP_NAME} --scope user -e ELECTRON_RUN_AS_NODE=1 -e WSLENV=ELECTRON_RUN_AS_NODE --`,
          sh(wslPath(e.command)),
          ...e.args.map(sh)
        ].join(' ')
      }
      if (!http) throw new Error('Turn Claude on first: the command names the running server')
      return `claude mcp add ${MCP_NAME} --scope user --transport http ${http.url} --header "Authorization: Bearer ${token()}"`
    }
  }
}
```

Modify `src/preload/index.ts`:

```diff
diff --git a/src/preload/index.ts b/src/preload/index.ts
index be40efc..d191b8d 100644
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -121,6 +121,15 @@ const api: Api = {
     saveView: (name, board) => ipcRenderer.invoke(IPC.statsSaveView, name, board),
     deleteView: (id) => ipcRenderer.invoke(IPC.statsDeleteView, id),
     exportCsv: (fileName, csv) => ipcRenderer.invoke(IPC.statsExportCsv, fileName, csv)
+  },
+  ask: {
+    mcp: {
+      status: () => ipcRenderer.invoke(IPC.askMcpStatus),
+      setEnabled: (on) => ipcRenderer.invoke(IPC.askMcpSetEnabled, on),
+      resetToken: () => ipcRenderer.invoke(IPC.askMcpResetToken),
+      addToClaudeDesktop: () => ipcRenderer.invoke(IPC.askMcpAddToClaudeDesktop),
+      copy: (kind) => ipcRenderer.invoke(IPC.askMcpCopy, kind)
+    }
   }
 }

```

Modify `src/shared/ask.ts`:

```diff
diff --git a/src/shared/ask.ts b/src/shared/ask.ts
index e367fd1..5aab9bf 100644
--- a/src/shared/ask.ts
+++ b/src/shared/ask.ts
@@ -76,3 +76,26 @@ export interface ToolError {
 }

 export type ToolOutcome = ToolResult | ToolError
+
+/**
+ * Stats › Ask, Claude over MCP (Ask spec §6.1): the server's state and where Claude desktop's config
+ * stands. The token never reaches the renderer; the copy buttons put the commands on the clipboard
+ * from main.
+ */
+export interface McpStatus {
+  enabled: boolean
+  /** Windows shows the Claude desktop and WSL parts. */
+  windows: boolean
+  /** The server listens on `url`. */
+  running: boolean
+  url: string | null
+  /** Why it is not running although it is on. */
+  error: string | null
+  claudeDesktop: {
+    path: string | null
+    state: 'added' | 'outdated' | 'absent' | 'unreadable' | 'not-found'
+  }
+}
+
+/** What a copy button puts on the clipboard. */
+export type McpCopy = 'claude-code' | 'claude-code-wsl' | 'claude-desktop'
```

Modify `src/shared/ipc.ts`:

```diff
diff --git a/src/shared/ipc.ts b/src/shared/ipc.ts
index 7c52699..0d9d547 100644
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -44,6 +44,7 @@ import type {
   StatsView
 } from './stats/types'
 import type { DevNote, NewNote, NoteError, NoteStatus } from './devNotes'
+import type { McpCopy, McpStatus } from './ask'

 export interface FindLeaguesResult {
   userId: string
@@ -187,6 +188,19 @@ export interface Api {
     /** Asks where to save a table as CSV and writes it; resolves to the path, null if cancelled. */
     exportCsv(fileName: string, csv: string): Promise<string | null>
   }
+  /** Ask spec §6.1: Claude over MCP (Stats › Ask). */
+  ask: {
+    mcp: {
+      status(): Promise<McpStatus>
+      setEnabled(on: boolean): Promise<McpStatus>
+      /** A new token; a Claude Code command copied before stops working. */
+      resetToken(): Promise<McpStatus>
+      /** Asks first, then edits Claude desktop's config (with a backup); resolves to the new status. */
+      addToClaudeDesktop(): Promise<McpStatus>
+      /** Puts a command or config on the clipboard (the token stays in main). */
+      copy(kind: McpCopy): Promise<void>
+    }
+  }
 }

 export const IPC = {
@@ -250,5 +264,10 @@ export const IPC = {
   statsViews: 'stats:views',
   statsSaveView: 'stats:saveView',
   statsDeleteView: 'stats:deleteView',
-  statsExportCsv: 'stats:exportCsv'
+  statsExportCsv: 'stats:exportCsv',
+  askMcpStatus: 'ask:mcpStatus',
+  askMcpSetEnabled: 'ask:mcpSetEnabled',
+  askMcpResetToken: 'ask:mcpResetToken',
+  askMcpAddToClaudeDesktop: 'ask:mcpAddToClaudeDesktop',
+  askMcpCopy: 'ask:mcpCopy'
 } as const
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/mcpService.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/mcp/service.ts src/main/analyst/mcp/ipc.ts src/shared/ask.ts src/shared/ipc.ts src/preload/index.ts tests/main/analyst/mcpService.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/mcp/service.ts src/main/analyst/mcp/ipc.ts src/shared/ask.ts src/shared/ipc.ts src/preload/index.ts tests/main/analyst/mcpService.test.ts
git commit -m "feat(analyst): MCP service, settings and IPC"
```

Expected: typecheck and lint clean; the suite at 1,307 passed, 6 skipped (a clean checkout).

---

### Task 6: One instance, MCP at launch, the packaged self-test (spec §6.1, §10; amendment H)

`src/main/index.ts`:

- **Takes Electron's single-instance lock.** A second launch hands over to the running app (its window comes forward, unless the second launch was the bridge's `--minimized` shortcut) and quits. The self-tests run on their own.
- **Starts minimised** when launched with `--minimized`.
- **Builds the analyst** over the stats worker and the active league, then starts the MCP service when it is on.
- **On quit**, stops the server (removing `mcp.json`) before closing the stats worker.

`--mcp-self-test=<file>` runs `mcpSelfTest()`, which checks the packaged build:

- the analyst runs on a stub warehouse (DuckDB has its own self-test);
- the server listens on a free port;
- the exe runs `mcpBridge.js` from the asar in Node mode;
- an SDK client on its stdio lists the tools and calls `find`, once per era.

Both release workflows run it, and Package check keeps the unpacked app for Task 12.

**Files:**

- Create: `src/main/analyst/mcp/selfTest.ts`
- Modify: `src/main/index.ts`, `.github/workflows/package-check.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: Implement**

Modify `.github/workflows/package-check.yml`:

```diff
diff --git a/.github/workflows/package-check.yml b/.github/workflows/package-check.yml
index 982eb36..6949903 100644
--- a/.github/workflows/package-check.yml
+++ b/.github/workflows/package-check.yml
@@ -33,3 +33,23 @@ jobs:
           ./dist/win-unpacked/FantasyCompanion.exe --stats-self-test="$RUNNER_TEMP/stats-self-test.json"
           cat "$RUNNER_TEMP/stats-self-test.json"
           grep -q '"ok":true' "$RUNNER_TEMP/stats-self-test.json"
+
+      # Ask spec §10: Claude desktop runs the app's exe as Node (ELECTRON_RUN_AS_NODE) on the bundled
+      # MCP bridge inside the asar; a client on its stdio must list the tools and call one, in both
+      # protocol eras.
+      - name: Check the MCP bridge in the packaged app
+        shell: bash
+        timeout-minutes: 5
+        run: |
+          ./dist/win-unpacked/FantasyCompanion.exe --mcp-self-test="$RUNNER_TEMP/mcp-self-test.json"
+          cat "$RUNNER_TEMP/mcp-self-test.json"
+          grep -q '"ok":true' "$RUNNER_TEMP/mcp-self-test.json"
+
+      # Ask spec §10: the bridge is also checked by hand with Claude desktop before a release (Plan
+      # AF2 Task 12); the unpacked app runs without installing.
+      - name: Keep the unpacked app
+        uses: actions/upload-artifact@v7
+        with:
+          name: FantasyCompanion-win-unpacked
+          path: dist/win-unpacked
+          retention-days: 3
```

Modify `.github/workflows/release.yml`:

```diff
diff --git a/.github/workflows/release.yml b/.github/workflows/release.yml
index f5d84d7..0fe25aa 100644
--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@ -48,6 +48,17 @@ jobs:
           cat "$RUNNER_TEMP/stats-self-test.json"
           grep -q '"ok":true' "$RUNNER_TEMP/stats-self-test.json"

+      # Ask spec §10: Claude desktop runs the app's exe as Node (ELECTRON_RUN_AS_NODE) on the bundled
+      # MCP bridge inside the asar; a client on its stdio must list the tools and call one, in both
+      # protocol eras.
+      - name: Check the MCP bridge in the packaged app
+        shell: bash
+        timeout-minutes: 5
+        run: |
+          ./dist/win-unpacked/FantasyCompanion.exe --mcp-self-test="$RUNNER_TEMP/mcp-self-test.json"
+          cat "$RUNNER_TEMP/mcp-self-test.json"
+          grep -q '"ok":true' "$RUNNER_TEMP/mcp-self-test.json"
+
       - name: Check release files
         shell: bash
         run: ls -l dist/FantasyCompanion-Setup-*.exe dist/FantasyCompanion-Setup-*.exe.blockmap dist/latest.yml
```

Create `src/main/analyst/mcp/selfTest.ts`:

```ts
import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { type AnalystStats, createAnalyst } from '../tools'
import { writeEndpoint } from './endpoint'
import { startMcpHttp } from './http'
import { createMcpServer } from './server'

/**
 * The packaged gate for Claude over MCP (Ask spec §10): the app's exe runs the bundled bridge in
 * Node mode from inside the asar, and a client on its stdio lists the tools and calls one through it,
 * in both protocol eras. The analyst reads no database here (DuckDB has its own self-test).
 */
export interface McpSelfTest {
  ok: boolean
  legacy?: { tools: number; find: string }
  modern?: { tools: number; find: string }
  error?: string
}

const STATS: AnalystStats = {
  status: async () => ({
    available: true,
    through: { season: 2026, seasonType: 'REG', week: 1 },
    updatedAt: '2026-09-10T00:00:00Z',
    busy: false
  }),
  catalogue: async () => [],
  people: async () => [],
  query: async () => {
    throw new Error('no database in the self-test')
  },
  games: async () => [],
  outlook: async () => {
    throw new Error('no database in the self-test')
  },
  player: async () => {
    throw new Error('no database in the self-test')
  }
}

export async function mcpSelfTest(options: {
  exe: string
  bridge: string
  dir: string
  version: string
}): Promise<McpSelfTest> {
  const token = randomBytes(16).toString('hex')
  const analyst = createAnalyst({ stats: STATS, league: () => null })
  const http = await startMcpHttp({
    factory: () => createMcpServer({ analyst, version: options.version, examples: () => [] }),
    token,
    port: 0
  })
  writeEndpoint(options.dir, { url: http.url, token, pid: process.pid, version: options.version })
  const result: McpSelfTest = { ok: false }
  try {
    for (const era of ['legacy', 'modern'] as const) {
      const client = new Client(
        { name: 'self-test', version: options.version },
        { versionNegotiation: era === 'modern' ? { mode: { pin: '2026-07-28' } } : undefined }
      )
      await client.connect(
        new StdioClientTransport({
          command: options.exe,
          args: [options.bridge, '--user-data', options.dir],
          env: { ...(process.env as Record<string, string>), ELECTRON_RUN_AS_NODE: '1' }
        })
      )
      const { tools } = await client.listTools()
      const found = await client.callTool({
        name: 'find',
        arguments: { text: 'yards per route run', kind: 'metric' }
      })
      const text = (found.content as { type: string; text?: string }[])
        .map((c) => c.text ?? '')
        .join('\n')
      result[era] = { tools: tools.length, find: text.split('\n')[1] ?? '' }
      await client.close()
    }
    result.ok =
      result.legacy?.tools === 11 &&
      result.modern?.tools === 11 &&
      [result.legacy.find, result.modern.find].every((l) => l.startsWith('Metric: yprr'))
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
  } finally {
    await http.close()
  }
  return result
}
```

Modify `src/main/index.ts`:

```diff
diff --git a/src/main/index.ts b/src/main/index.ts
index 0ffb5b1..84faac1 100644
--- a/src/main/index.ts
+++ b/src/main/index.ts
@@ -1,10 +1,15 @@
 import { app, BrowserWindow, dialog, shell } from 'electron'
-import { existsSync, rmSync, writeFileSync } from 'node:fs'
+import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
 import { tmpdir } from 'node:os'
 import { join } from 'path'
 import { electronApp, is, optimizer } from '@electron-toolkit/utils'
 import { autoUpdater } from 'electron-updater'
 import icon from '../../resources/icon.png?asset'
+import { companionLeague } from '@main/analyst/league'
+import { registerMcpHandlers } from '@main/analyst/mcp/ipc'
+import { mcpSelfTest } from '@main/analyst/mcp/selfTest'
+import { createMcpService, type McpService } from '@main/analyst/mcp/service'
+import { createAnalyst } from '@main/analyst/tools'
 import { openDatabase, type Db } from '@main/db/connection'
 import { migrate } from '@main/db/migrate'
 import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
@@ -25,6 +30,9 @@ import { IPC } from '@shared/ipc'

 let mainWindow: BrowserWindow | null = null

+/** Ask spec §6.1: the shortcut the MCP bridge opens starts the app this way. */
+const MINIMIZED_FLAG = '--minimized'
+
 // Dev-mode spec §4: the recent-errors buffer runs from launch, whatever the mode.
 const errorLog = createErrorLog()
 captureMainErrors(errorLog)
@@ -47,7 +55,10 @@ function createWindow(): void {
     }
   })

-  mainWindow.on('ready-to-show', () => mainWindow?.show())
+  mainWindow.on('ready-to-show', () => {
+    if (process.argv.includes(MINIMIZED_FLAG)) mainWindow?.minimize()
+    else mainWindow?.show()
+  })
   mainWindow.on('closed', () => {
     mainWindow = null
   })
@@ -143,12 +154,59 @@ async function runStatsSelfTest(out: string): Promise<number> {
   return code
 }

+/**
+ * `--mcp-self-test=<file>` (Ask spec §10): the packaged app runs its MCP bridge as Node from the asar
+ * and calls a tool through it, writes the result as JSON to `<file>`, and exits 0 on success. CI runs
+ * it on the Windows build.
+ */
+const MCP_SELF_TEST_FLAG = '--mcp-self-test='
+
+/** Bundled beside the main entry by `electron.vite.config.ts`. */
+const mcpBridgePath = (): string => join(__dirname, 'mcpBridge.js')
+
+async function runMcpSelfTest(out: string): Promise<number> {
+  const dir = join(tmpdir(), `ffc-mcp-self-test-${process.pid}`)
+  mkdirSync(dir, { recursive: true })
+  const result = await mcpSelfTest({
+    exe: process.execPath,
+    bridge: mcpBridgePath(),
+    dir,
+    version: app.getVersion()
+  }).catch((err: unknown) => ({
+    ok: false,
+    error: err instanceof Error ? err.message : String(err)
+  }))
+  writeFileSync(out, JSON.stringify(result))
+  rmSync(dir, { recursive: true, force: true })
+  return result.ok ? 0 : 1
+}
+
+// Ask spec §6.1: one process holds the databases. A second launch (the MCP bridge's shortcut, or a
+// double-click) hands over to the first and quits; the self-tests run on their own.
+const selfTesting = process.argv.some(
+  (a) => a.startsWith(SELF_TEST_FLAG) || a.startsWith(MCP_SELF_TEST_FLAG)
+)
+const primary = selfTesting || app.requestSingleInstanceLock()
+if (!primary) app.quit()
+app.on('second-instance', (_event, argv) => {
+  if (!mainWindow || argv.includes(MINIMIZED_FLAG)) return
+  if (mainWindow.isMinimized()) mainWindow.restore()
+  mainWindow.show()
+  mainWindow.focus()
+})
+
 app.whenReady().then(async () => {
+  if (!primary) return
   const selfTest = process.argv.find((a) => a.startsWith(SELF_TEST_FLAG))
   if (selfTest) {
     app.exit(await runStatsSelfTest(selfTest.slice(SELF_TEST_FLAG.length)))
     return
   }
+  const mcpTest = process.argv.find((a) => a.startsWith(MCP_SELF_TEST_FLAG))
+  if (mcpTest) {
+    app.exit(await runMcpSelfTest(mcpTest.slice(MCP_SELF_TEST_FLAG.length)))
+    return
+  }
   electronApp.setAppUserModelId('com.yhabie.fantasycompanion')
   app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

@@ -169,6 +227,7 @@ app.whenReady().then(async () => {
     })
   }
   registerIpcHandlers(ctx)
+  const mcp = startMcp(ctx)
   registerDevHandlers({
     db: ctx.db,
     mode: createDevMode({ db: ctx.db, packaged: app.isPackaged, argv: process.argv }),
@@ -185,15 +244,20 @@ app.whenReady().then(async () => {
     startStats(ctx).catch((err) => console.error('stats refresh failed', err))
   }
   // Spec §2: the process must not exit while DuckDB runs a statement (Electron aborts), so the first
-  // quit closes the stats worker, which interrupts a running refresh, and then quits again.
-  let statsClosed = false
+  // quit stops the MCP server (Ask spec §6.1: `mcp.json` goes with it), closes the stats worker,
+  // which interrupts a running refresh, and then quits again.
+  let closed = false
   app.on('will-quit', (event) => {
-    if (statsClosed || !ctx.stats) return
+    if (closed) return
     event.preventDefault()
-    void ctx.stats.close().finally(() => {
-      statsClosed = true
-      app.quit()
-    })
+    void mcp
+      .stop()
+      .catch((err: unknown) => console.error('could not stop the MCP server', err))
+      .then(() => ctx.stats?.close())
+      .finally(() => {
+        closed = true
+        app.quit()
+      })
   })

   app.on('activate', () => {
@@ -201,6 +265,43 @@ app.whenReady().then(async () => {
   })
 })

+/** Ask spec §6.1: the analyst tools behind MCP, on when the user turned them on (Stats › Ask). */
+function startMcp(ctx: AppContext): McpService {
+  const analyst = ctx.stats
+    ? createAnalyst({
+        stats: ctx.stats,
+        league: () => {
+          const id = getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)
+          return id ? companionLeague(ctx.db, id) : null
+        }
+      })
+    : null
+  const mcp = createMcpService({
+    db: ctx.db,
+    analyst,
+    userData: app.getPath('userData'),
+    version: app.getVersion(),
+    exe: process.execPath,
+    bridge: mcpBridgePath(),
+    platform: process.platform,
+    env: process.env,
+    writeShortcut:
+      process.platform === 'win32'
+        ? (path) => {
+            const ok = shell.writeShortcutLink(path, 'create', {
+              target: process.execPath,
+              args: MINIMIZED_FLAG,
+              description: 'Starts FantasyCompanion for Claude'
+            })
+            if (!ok) throw new Error(`could not write ${path}`)
+          }
+        : null
+  })
+  registerMcpHandlers(mcp, () => mainWindow)
+  mcp.start().catch((err) => console.error('could not start the MCP server', err))
+  return mcp
+}
+
 app.on('window-all-closed', () => {
   if (process.platform !== 'darwin') app.quit()
 })
```

- [ ] **Step 2: Run the self-test on the dev build**

The main process has no unit test; the self-test is its check. In WSL (WSLg gives Electron a display):

```bash
npx electron-vite build
npx electron . --mcp-self-test=/tmp/mcp-self-test.json; echo "exit $?"; cat /tmp/mcp-self-test.json
```

Expected: `exit 0` and `{"ok":true,"legacy":{"tools":11,"find":"Metric: yprr = Yards per route run"},"modern":{"tools":11,"find":"Metric: yprr = Yards per route run"}}`. The dev Electron ran itself as Node on `out/main/mcpBridge.js`.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write src/main/analyst/mcp/selfTest.ts src/main/index.ts .github/workflows/package-check.yml .github/workflows/release.yml
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/mcp/selfTest.ts src/main/index.ts .github/workflows/package-check.yml .github/workflows/release.yml
git commit -m "feat: one instance, MCP at launch, self-test"
```

Expected: typecheck and lint clean; the suite at 1,307 passed, 6 skipped (a clean checkout).

---

### Task 7: Stats › Ask (spec §6.1, §8; amendment J)

A seventh item in the Stats nav, **Ask**, between Games and Glossary. Until Plan AH builds Ask itself, it holds the MCP part of the setup:

- **Use Claude:** a switch, the server's address, what leaves the PC, and why it cannot run when it cannot.
- **Claude desktop** (Windows): where its config is, Add (or Update), and Copy config entry.
- **Claude Code:** Copy command (when running) and Copy command for WSL.
- **"Make a new key"**, shown while the server runs.

**Files:**

- Create: `src/renderer/src/screens/stats/StatsAsk.tsx`, `tests/renderer/components/StatsAsk.test.tsx`
- Modify: `src/renderer/src/components/stats/StatsNav.tsx`, `src/renderer/src/screens/stats/StatsApp.tsx`, `tests/renderer/components/StatsShell.test.tsx`

- [ ] **Step 1: Write the tests**

Create `tests/renderer/components/StatsAsk.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StatsAsk } from '@/screens/stats/StatsAsk'
import { api } from '@/lib/api'
import type { McpStatus } from '@shared/ask'

vi.mock('@/lib/api', () => ({
  api: {
    ask: {
      mcp: {
        status: vi.fn(),
        setEnabled: vi.fn(),
        resetToken: vi.fn(),
        addToClaudeDesktop: vi.fn(),
        copy: vi.fn()
      }
    }
  }
}))
const mcp = vi.mocked(api.ask.mcp)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const PATH = 'C:\\Users\\me\\AppData\\Local\\Claude-Data\\claude_x\\claude_desktop_config.json'
const OFF: McpStatus = {
  enabled: false,
  windows: true,
  running: false,
  url: null,
  error: null,
  claudeDesktop: { path: PATH, state: 'absent' }
}
const ON: McpStatus = { ...OFF, enabled: true, running: true, url: 'http://127.0.0.1:41234/mcp' }

describe('Stats › Ask: Claude over MCP (Ask spec §6.1)', () => {
  it('is off until turned on; then shows the server and the Claude Code command', async () => {
    mcp.status.mockResolvedValue(OFF)
    mcp.setEnabled.mockResolvedValue(ON)
    render(<StatsAsk />)
    const toggle = await screen.findByRole('switch', { name: 'Let Claude read the app’s stats' })
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
    expect(screen.getByText('off')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy command' })).toBeNull()
    fireEvent.click(toggle)
    await screen.findByText('http://127.0.0.1:41234/mcp')
    expect(mcp.setEnabled).toHaveBeenCalledWith(true)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }))
    await screen.findByRole('button', { name: 'Copied' })
    expect(mcp.copy).toHaveBeenCalledWith('claude-code')
  })

  it('adds the app to Claude desktop and shows where', async () => {
    mcp.status.mockResolvedValue(ON)
    mcp.addToClaudeDesktop.mockResolvedValue({
      ...ON,
      claudeDesktop: { path: PATH, state: 'added' }
    })
    render(<StatsAsk />)
    expect(await screen.findByText(PATH)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add to Claude desktop' }))
    await screen.findByText(/^Added\. Quit and reopen Claude desktop/)
    expect(screen.queryByRole('button', { name: 'Add to Claude desktop' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copy command for WSL' }))
    await waitFor(() => expect(mcp.copy).toHaveBeenCalledWith('claude-code-wsl'))
  })

  it('says why the server is not running, and when Claude desktop is not found', async () => {
    mcp.status.mockResolvedValue({
      ...OFF,
      enabled: true,
      error:
        'The stats database could not be opened on this computer, so Claude has nothing to read.',
      claudeDesktop: { path: null, state: 'not-found' }
    })
    render(<StatsAsk />)
    await screen.findByText(/stats database could not be opened/)
    expect(screen.getByText(/Claude desktop was not found on this computer/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy config entry' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /make a new key/ })).toBeNull()
  })
})
```

Modify `tests/renderer/components/StatsShell.test.tsx`:

```diff
diff --git a/tests/renderer/components/StatsShell.test.tsx b/tests/renderer/components/StatsShell.test.tsx
index 1b95ca2..67fc53f 100644
--- a/tests/renderer/components/StatsShell.test.tsx
+++ b/tests/renderer/components/StatsShell.test.tsx
@@ -99,6 +99,9 @@ describe('the Stats nav', () => {
     // Games opens the week's games (Plan AE).
     fireEvent.click(screen.getByRole('button', { name: 'Games' }))
     expect(onNavigate).toHaveBeenCalledWith('games')
+    // Ask (Ask spec §8): Claude over MCP until Plan AH.
+    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
+    expect(onNavigate).toHaveBeenCalledWith('ask')
     fireEvent.click(screen.getByRole('button', { name: 'Glossary' }))
     expect(onNavigate).toHaveBeenCalledWith('glossary')
     expect(screen.getByText('Data through 2026 week 6 · updating…')).toBeTruthy()
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/components/StatsAsk.test.tsx tests/renderer/components/StatsShell.test.tsx
```

Expected: FAIL — `@/screens/stats/StatsAsk` does not exist, and the nav has no Ask button.

- [ ] **Step 3: Implement**

Modify `src/renderer/src/components/stats/StatsNav.tsx`:

```diff
diff --git a/src/renderer/src/components/stats/StatsNav.tsx b/src/renderer/src/components/stats/StatsNav.tsx
index 74831db..76d2fc1 100644
--- a/src/renderer/src/components/stats/StatsNav.tsx
+++ b/src/renderer/src/components/stats/StatsNav.tsx
@@ -8,10 +8,11 @@ import type { UpdateState } from '@shared/types'

 /**
  * `player` and `team` are the dashboards (spec §9.4, §9.3), `players` and `teams` the
- * leaderboards, `explore` Chart, Compare and Trends, `games` the week's games (§9.5).
+ * leaderboards, `explore` Chart, Compare and Trends, `games` the week's games (§9.5), `ask` Ask
+ * (Ask spec §8).
  */
 export type StatsScreen =
-  'home' | 'player' | 'players' | 'team' | 'teams' | 'explore' | 'games' | 'glossary'
+  'home' | 'player' | 'players' | 'team' | 'teams' | 'explore' | 'games' | 'ask' | 'glossary'

 const ITEMS: { id: StatsScreen; label: string }[] = [
   { id: 'home', label: 'Leaderboards' },
@@ -19,6 +20,7 @@ const ITEMS: { id: StatsScreen; label: string }[] = [
   { id: 'team', label: 'Teams' },
   { id: 'explore', label: 'Explore' },
   { id: 'games', label: 'Games' },
+  { id: 'ask', label: 'Ask' },
   { id: 'glossary', label: 'Glossary' }
 ]

@@ -38,7 +40,7 @@ interface StatsNavProps {
 }

 /**
- * Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", six items, Fantasy ↗, theme.
+ * Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", seven items, Fantasy ↗, theme.
  * Players and Teams open the dashboards, Explore its tools, Games the week's games.
  */
 export function StatsNav({
```

Modify `src/renderer/src/screens/stats/StatsApp.tsx`:

```diff
diff --git a/src/renderer/src/screens/stats/StatsApp.tsx b/src/renderer/src/screens/stats/StatsApp.tsx
index 962f1ef..fd34fd8 100644
--- a/src/renderer/src/screens/stats/StatsApp.tsx
+++ b/src/renderer/src/screens/stats/StatsApp.tsx
@@ -14,6 +14,7 @@ import { defaultScope, type StatsScope } from '@/lib/stats/scope'
 import { defaultTeam, topScorerQuery, type TeamTab } from '@/lib/stats/team'
 import { DEFAULT_TRENDS, type TrendsState } from '@/lib/stats/trends'
 import { useStatsData, useStatsQuery } from '@/lib/stats/useStats'
+import { StatsAsk } from '@/screens/stats/StatsAsk'
 import { StatsExplore, type ExploreTab } from '@/screens/stats/StatsExplore'
 import { StatsGames } from '@/screens/stats/StatsGames'
 import { StatsGlossary } from '@/screens/stats/StatsGlossary'
@@ -399,6 +400,7 @@ export function StatsApp({
                 onOpenPlayer={openPlayer}
               />
             )}
+            {screen === 'ask' && <StatsAsk />}
             {screen === 'glossary' && <StatsGlossary catalogue={data.catalogue} />}
             {viewsError && <div className="px-8 pb-4 text-[12px] text-bad">{viewsError}</div>}
           </>
```

Create `src/renderer/src/screens/stats/StatsAsk.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { StatsButton } from '@/components/stats/controls'
import { SectionHead } from '@/components/stats/parts'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { McpCopy, McpStatus } from '@shared/ask'

const DESKTOP: Record<McpStatus['claudeDesktop']['state'], string> = {
  added: 'Added. Quit and reopen Claude desktop if it was open, then ask it about your stats.',
  outdated:
    'Claude desktop has an older entry for FantasyCompanion (the app moved or was updated).',
  absent: 'Not added yet.',
  unreadable:
    'Claude desktop’s config is not valid JSON, so the app leaves it alone. Copy the entry and add it by hand.',
  'not-found':
    'Claude desktop was not found on this computer. Copy the entry and paste it into its config (Settings › Developer › Edit config).'
}

/** A copy button that says "Copied" for a moment. */
function CopyButton({
  done,
  disabled,
  onCopy,
  children
}: {
  done: boolean
  disabled: boolean
  onCopy: () => void
  children: string
}): React.JSX.Element {
  return (
    <StatsButton onClick={onCopy} disabled={disabled}>
      {done ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : children}
    </StatsButton>
  )
}

/**
 * Stats › Ask (Ask spec §6.1, §8): until Ask itself comes (Plan AH), this is where you let Claude read
 * the app's stats over MCP: on or off, Claude desktop's config, and the commands for Claude Code.
 */
export function StatsAsk(): React.JSX.Element {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<McpCopy | null>(null)

  useEffect(() => {
    void api.ask.mcp
      .status()
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  async function act(fn: () => Promise<McpStatus>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setStatus(await fn())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy(kind: McpCopy): Promise<void> {
    setError(null)
    try {
      await api.ask.mcp.copy(kind)
      setCopied(kind)
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2_000)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const desktop = status?.claudeDesktop
  return (
    <div className="flex max-w-[760px] flex-col gap-6 px-8 pt-[22px] pb-7">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] leading-none font-bold tracking-[-0.03em]">Ask</h1>
        <div className="text-[13px] leading-[1.45] text-fg-2">
          Ask questions about the app’s stats in Claude, with your own Claude plan. Asking from
          inside the app comes in a later version.
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-panel px-5 py-4">
        <SectionHead title="Use Claude" note="MCP" />
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={status?.enabled ?? false}
            aria-label="Let Claude read the app’s stats"
            disabled={!status || busy}
            onClick={() => status && void act(() => api.ask.mcp.setEnabled(!status.enabled))}
            className={cn(
              'relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-60',
              status?.enabled ? 'bg-cobalt' : 'bg-line'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-4 rounded-full bg-panel shadow transition-[left]',
                status?.enabled ? 'left-[18px]' : 'left-0.5'
              )}
            />
          </button>
          <span className="text-[13.5px] font-medium">Let Claude read the app’s stats</span>
          <span className="ml-auto font-mono text-[12px] text-fg-3">
            {status?.running ? status.url : status?.enabled ? 'starting…' : 'off'}
          </span>
        </div>
        <p className="m-0 text-[12.5px] leading-[1.45] text-fg-3">
          Claude desktop or Claude Code then calls the app’s read-only tools while it is open. The
          question and the rows Claude reads go to Anthropic as part of your chat; nothing else
          leaves this computer.
        </p>
        {status?.error && (
          <div className="rounded-[4px] bg-bad-s px-3 py-2 text-[12.5px] text-bad">
            {status.error}
          </div>
        )}
      </section>

      {status?.windows && (
        <section className="flex flex-col gap-3">
          <SectionHead title="Claude desktop" />
          <p className="m-0 text-[13px] leading-[1.45] text-fg-2">
            {desktop ? DESKTOP[desktop.state] : 'Looking for Claude desktop…'}
          </p>
          {desktop?.path && (
            <div className="truncate font-mono text-[11.5px] text-fg-3" title={desktop.path}>
              {desktop.path}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {desktop && (desktop.state === 'absent' || desktop.state === 'outdated') && (
              <StatsButton
                disabled={busy}
                onClick={() => void act(() => api.ask.mcp.addToClaudeDesktop())}
              >
                {desktop.state === 'absent' ? 'Add to Claude desktop' : 'Update Claude desktop'}
              </StatsButton>
            )}
            <CopyButton
              done={copied === 'claude-desktop'}
              disabled={busy}
              onCopy={() => void copy('claude-desktop')}
            >
              Copy config entry
            </CopyButton>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHead title="Claude Code" />
        <p className="m-0 text-[13px] leading-[1.45] text-fg-2">
          Run the command in a terminal; it adds the app for all your projects. Claude Code on
          Windows talks to the app directly; in WSL it goes through the same bridge as Claude
          desktop.
        </p>
        <div className="flex flex-wrap gap-2">
          {status?.running && (
            <CopyButton
              done={copied === 'claude-code'}
              disabled={busy}
              onCopy={() => void copy('claude-code')}
            >
              Copy command
            </CopyButton>
          )}
          {status?.windows && (
            <CopyButton
              done={copied === 'claude-code-wsl'}
              disabled={busy}
              onCopy={() => void copy('claude-code-wsl')}
            >
              Copy command for WSL
            </CopyButton>
          )}
        </div>
      </section>

      {status?.running && (
        <p className="m-0 text-[12px] leading-[1.45] text-fg-3">
          A copied Claude Code command holds a key. If you shared one by mistake,{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => api.ask.mcp.resetToken())}
            className="cursor-pointer text-fg-2 underline hover:text-fg"
          >
            make a new key
          </button>
          : copy the command again afterwards (Claude desktop follows on its own).
        </p>
      )}
      {error && <div className="text-[12.5px] text-bad">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/renderer/components/StatsAsk.test.tsx tests/renderer/components/StatsShell.test.tsx
```

Expected: PASS.

- [ ] **Step 5 (optional): Look at it**

`npm run dev`, open Stats › Ask, turn Claude on: the address appears, and the switch, the buttons and the copy feedback work in the light and dark themes. In WSL there is no Claude desktop part (`windows: false`).

- [ ] **Step 6: Check and commit**

```bash
npx prettier --write src/renderer/src/screens/stats/StatsAsk.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/screens/stats/StatsApp.tsx tests/renderer/components/StatsAsk.test.tsx tests/renderer/components/StatsShell.test.tsx
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/renderer/src/screens/stats/StatsAsk.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/screens/stats/StatsApp.tsx tests/renderer/components/StatsAsk.test.tsx tests/renderer/components/StatsShell.test.tsx
git commit -m "feat(stats): Ask tab with Claude over MCP"
```

Expected: typecheck and lint clean; the suite at 1,310 passed, 6 skipped (a clean checkout).

---

### Task 8: The AF2 gate test (spec §10)

Spec §10: "AF2 reports the same reference calls passing through the MCP server." On the frozen warehouse, every reference call is made directly and through the MCP server over HTTP, in both eras, and the texts must be equal. The test is skipped without `FFC_ASK_DB`, like AF1's.

**Files:**

- Create: `tests/ask/mcp.live.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/ask/mcp.live.test.ts`:

```ts
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { startMcpHttp } from '@main/analyst/mcp/http'
import { createMcpServer, toCallResult } from '@main/analyst/mcp/server'
import { createAnalyst } from '@main/analyst/tools'
import { openStatsService } from '@main/stats/service'
import { QUESTION_SET } from './questions'

/**
 * Ask spec §10 (Plan AF2's gate): on the frozen database, every reference call made through the MCP
 * server, in both protocol eras, returns what the analyst returns when called directly. Run with
 * `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask`; the file is copied first.
 */
const DB = process.env.FFC_ASK_DB
const TOKEN = 'gate-token'

const textOf = (r: { content?: unknown; isError?: boolean }): string =>
  `${r.isError ? 'error: ' : ''}${(r.content as { text: string }[]).map((c) => c.text).join('\n')}`

describe.skipIf(!DB || !existsSync(DB))('the reference calls through the MCP server', () => {
  it('match the direct calls in both eras', { timeout: 600_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-ask-mcp-'))
    copyFileSync(DB!, join(dir, 'stats.duckdb'))
    if (existsSync(`${DB}.wal`)) copyFileSync(`${DB}.wal`, join(dir, 'stats.duckdb.wal'))
    const service = await openStatsService(
      { path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') },
      () => {},
      async () => {
        throw new Error('offline')
      }
    )
    const analyst = createAnalyst({ stats: service, league: () => null })
    const http = await startMcpHttp({
      factory: () => createMcpServer({ analyst, version: 'gate', examples: () => [] }),
      token: TOKEN,
      port: 0
    })
    const refs = QUESTION_SET.questions.filter((q) => q.reference && !q.needsLeague)
    const summary: Record<string, unknown> = { references: refs.length }
    try {
      for (const era of ['legacy', 'modern'] as const) {
        const client = new Client(
          { name: 'gate', version: '1' },
          { versionNegotiation: era === 'modern' ? { mode: { pin: '2026-07-28' } } : undefined }
        )
        await client.connect(
          new StreamableHTTPClientTransport(new URL(http.url), {
            requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } }
          })
        )
        const tools = (await client.listTools()).tools.length
        let same = 0
        const ms: number[] = []
        const differ: string[] = []
        for (const q of refs) {
          const { tool, args } = q.reference!
          const direct = textOf(toCallResult(await analyst.run(tool, args, await analyst.turn())))
          const started = Date.now()
          const viaMcp = textOf(await client.callTool({ name: tool, arguments: args }))
          ms.push(Date.now() - started)
          if (viaMcp === direct) same++
          else differ.push(q.id)
        }
        ms.sort((a, b) => a - b)
        summary[era] = {
          tools,
          same: `${same}/${refs.length}`,
          differ,
          ms: {
            p50: ms[Math.floor(ms.length / 2)],
            p90: ms[Math.floor(ms.length * 0.9)],
            max: ms.at(-1)
          }
        }
        await client.close()
        expect(tools).toBe(11)
        expect(differ).toEqual([])
      }
    } finally {
      console.log(JSON.stringify(summary))
      if (process.env.FFC_ASK_MCP_REPORT)
        writeFileSync(process.env.FFC_ASK_MCP_REPORT, JSON.stringify(summary, null, 2))
      await http.close()
      await service.close()
    }
  })
})
```

- [ ] **Step 2: Check and commit**

```bash
npx prettier --write tests/ask/mcp.live.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add tests/ask/mcp.live.test.ts
git commit -m "test(ask): reference calls through the MCP server"
```

Expected: typecheck and lint clean; the suite at 1,310 passed, 7 skipped (a clean checkout: the new file is skipped without `FFC_ASK_DB`).

---

### Task 9: Docs

The spec amendments (§16) and the MCP part of `docs/reference/analyst.md`.

**Files:**

- Modify: `docs/reference/analyst.md`, `docs/superpowers/specs/2026-11-01-ask-analyst-design.md`

- [ ] **Step 1: Write the docs**

Modify `docs/reference/analyst.md`:

```diff
diff --git a/docs/reference/analyst.md b/docs/reference/analyst.md
index b32f390..f2574cf 100644
--- a/docs/reference/analyst.md
+++ b/docs/reference/analyst.md
@@ -19,7 +19,24 @@ What Plan AF1 built for Ask (spec `docs/superpowers/specs/2026-11-01-ask-analyst

 Shared: `src/shared/ask.ts` (tool results and cards), `src/shared/stats/aliases.ts`, `dimensions.ts`, `glossary.ts`, `semanticModel.ts`. The worker's `people` read (`src/main/stats/engine/people.ts`) feeds the player index. `companion.db` has `ask_examples` (migration 012, `src/main/db/repos/askExamples.ts`).

+## Claude over MCP (Plan AF2)
+
+`src/main/analyst/mcp/` puts the tools behind MCP, so Claude desktop and Claude Code answer from the app's data with your own Claude plan (spec §6.1, amendments §16).
+
+| File                         | What it does                                                                                                                                                                                                                                                                             |
+| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
+| `server.ts`                  | `createMcpServer()`: the full profile's tools (metric ids left out of the listed schemas), the brief as instructions and an `analyst` prompt, the glossary, semantic model and examples as resources. Text results only. `find` asks "which one?" by elicitation for namesakes.          |
+| `http.ts`                    | Streamable HTTP on `127.0.0.1` at `/mcp`: bearer token, Host and Origin checked, both protocol eras (2026-07-28, and the stateless fallback for 2025 clients).                                                                                                                           |
+| `endpoint.ts`                | `mcp.json` in `userData` (URL, token, pid, version): written when the server listens, removed when it stops.                                                                                                                                                                             |
+| `bridge.ts`, `bridgeMain.ts` | The stdio bridge (`out/main/mcpBridge.js`), run as the app's exe with `ELECTRON_RUN_AS_NODE=1`: forwards each message both ways, follows `mcp.json` across restarts, and starts the app once through `start-for-claude.lnk` (opened by `explorer.exe`, outside Claude's MSIX container). |
+| `claudeDesktop.ts`           | Finds Claude desktop's config (the Store app's `%LOCALAPPDATA%\Claude-Data\claude_*`, the classic `%APPDATA%\Claude`, an older Store app's package) and adds the entry after a backup.                                                                                                   |
+| `service.ts`, `ipc.ts`       | On / off (off by default), the port and token kept in `app_settings`, the shortcut, the copy commands (Claude Code over HTTP, Claude Code in WSL through the bridge, Claude desktop's entry), `ask:mcp*` IPC.                                                                            |
+| `selfTest.ts`                | `--mcp-self-test=<file>`: the packaged exe runs the bridge from the asar and a client calls a tool through it, in both eras (CI, Windows).                                                                                                                                               |
+
+The screen is Stats › Ask (`src/renderer/src/screens/stats/StatsAsk.tsx`) until Plan AH builds Ask itself. The app holds a single-instance lock: a second launch (the bridge's shortcut, or a double-click) hands over to the running app.
+
 ## Checking it

 - `npm test` runs the unit tests (`tests/main/analyst/`, `tests/ask/questions.test.ts`).
-- `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask` runs every reference call of `tests/ask/questions.json` on that database (copied first) and measures the resolver on the whole set: the AF1 gate.
+- `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask` runs every reference call of `tests/ask/questions.json` on that database (copied first) and measures the resolver on the whole set: the AF1 gate. It also makes each reference call through the MCP server in both protocol eras and compares the text with the direct call: the AF2 gate.
+- `FantasyCompanion.exe --mcp-self-test=<file>` checks the bridge in a packaged build (the Package check and Release workflows run it).
```

Modify `docs/superpowers/specs/2026-11-01-ask-analyst-design.md`:

```diff
diff --git a/docs/superpowers/specs/2026-11-01-ask-analyst-design.md b/docs/superpowers/specs/2026-11-01-ask-analyst-design.md
index b0c5a5e..62a71d4 100644
--- a/docs/superpowers/specs/2026-11-01-ask-analyst-design.md
+++ b/docs/superpowers/specs/2026-11-01-ask-analyst-design.md
@@ -372,3 +372,22 @@ Taken in Plan AF1 (`docs/superpowers/plans/2026-11-02-plan-af1-analyst-tools.md`
   - The resolver: the right tool for 140 of 140 questions, the named metric in the top 5 for 107 of 107, the players for 64 of 64, and every must-ask or must-decline question it can see (namesakes, advice, out-of-range seasons) caught; 40–50 ms a question.
   - The tools: every one of 141 reference calls runs and returns rows; 16 ms median, 44 ms 90th percentile, under 0.2 s at most; a cache hit 0 ms.
   - End to end (resolver → compact schema → model → tool), the probe's 20 questions on AC power: `qwen3:4b` 20 of 20 at 2.0 s median, `gemma3:4b` 19 of 20 at 1.4 s. On battery the GPU drops to its low power state and a call takes 3–4× as long: the evaluation (AG) records the power state and gates on AC.
+
+## 16. Plan AF2 amendments (2026-11-02)
+
+Taken in Plan AF2 (`docs/superpowers/plans/2026-11-02-plan-af2-mcp-server.md`), from its prototype and measurements on this PC:
+
+- **A. Both protocol eras, stateless (§6.1).** The server uses the MCP SDK v2 (`@modelcontextprotocol/server` 2.4.0, `node` 2.1.2, `client` 2.4.0 for the bridge). It serves the 2026-07-28 revision, which Claude Code 2.1.293 negotiates (`server/discover`, a per-request envelope, `subscriptions/listen`), and falls back to stateless serving for 2025 clients. A fresh server answers each request and nothing is kept between calls, so the split counter (§3.3) counts within one call.
+- **B. Text results only (§6.1).** No `structuredContent` and no `outputSchema`. Measured: Claude Code hands its model the structured content in place of the text, and the cards hold whole engine results. The model reads the compact text (§3.3); the cards stay for the in-app screen (AH).
+- **C. Metric ids are left out of the listed schemas (§3.2).** In the full profile, about 300 metric ids appear seven times: 34 of the tools' 51 KB, some 9,000 tokens in every conversation. Over MCP a metric is listed as a string (17.7 KB for all the tools). `find` gives the ids, and the analyst still checks every call against the full schema and names the nearest ids.
+- **D. "Which one?" in `find` (§4.1).** No question reaches the server, so namesakes are asked about in `find`: by a form elicitation when the request carries the capability (2026-07-28, as a multi-round-trip result). Otherwise (2025 clients, or the user declines) the matches are listed, and the brief tells the model to ask. The brief's first rule now says to call `find` when there is no context block.
+- **E. The port is kept, not random per launch (§6.1).** A port in 41000–48999 is picked once and kept in `app_settings`, and another is picked if it is taken or reserved. The token is kept the same way, so a Claude Code command stays valid across launches. "Make a new key" resets the token.
+- **F. Claude desktop's config (§6.1).** On this PC Claude desktop is the Store (MSIX) app. Its config is `%LOCALAPPDATA%\Claude-Data\claude_<id>\claude_desktop_config.json`, beside its own preferences, and `%APPDATA%\Claude\` does not exist. The app looks there first, then in the classic folder, then in an older Store app's package folder (unless that app's data has moved out). The edit keeps every other key and writes a timestamped backup. When no config is found, "Copy config entry" gives the JSON to paste.
+- **G. The app starts outside Claude's container (§6.1, §14 point 2).** Processes started by the Store Claude desktop run inside its MSIX container, and their new files under AppData land in Claude's package.
+  - Measured: a file written to `%LOCALAPPDATA%` went to `Packages\Claude_…\LocalCache\Local`, where an earlier FantasyCompanion run had already left its updater cache.
+  - Started by the bridge, the app's new database files (WAL, temp files) would therefore split from the real ones. So the bridge never starts the app as its own child. It opens `start-for-claude.lnk` (written by the app: the exe with `--minimized`) with `explorer.exe`, which starts it from the user's shell, outside the container.
+  - Measured: `explorer.exe` and WMI escape the container; `Start-Process` does not. Reads from inside the container see the real files, so the bridge reads `mcp.json` as it is.
+- **H. One instance (§6.1).** The app takes Electron's single-instance lock: a second launch (the shortcut, or a double-click) hands over to the running app and quits. Before, a second launch opened a second window whose stats section could not open the warehouse.
+- **I. Claude Code in WSL (§6.1).** WSL's default (NAT) networking cannot reach Windows' 127.0.0.1, so Claude Code in WSL runs the bridge through WSL interop (`WSLENV=ELECTRON_RUN_AS_NODE`). Measured: the installed exe runs as Node from WSL and reads its asar. Stats › Ask offers both commands: HTTP for Claude Code on Windows, the bridge for WSL.
+- **J. "Settings › Ask" is the Stats › Ask tab (§6.1, §8).** The app has no Settings screen. The Ask tab holds the MCP part now, and Plan AH builds the chat and the other setup cards around it.
+- **K. Not in AF2:** traces of MCP calls (no question reaches the server; AG's loop traces turns), removing the entry from Claude desktop (when Claude is turned off, the bridge says so), and `open_in_app` (AH, §15 G).
```

- [ ] **Step 2: Check and commit**

```bash
npx prettier --write docs/reference/analyst.md docs/superpowers/specs/2026-11-01-ask-analyst-design.md
git add docs/reference/analyst.md docs/superpowers/specs/2026-11-01-ask-analyst-design.md
git commit -m "docs: plan AF2 spec amendments and MCP reference"
```

---

### Task 10: The AF2 gate on the frozen database (spec §10)

- [ ] **Step 1: Freeze a copy of the warehouse**

**The app must be closed:** while it runs, Windows keeps `stats.duckdb` locked, and the copy fails with "Permission denied". Ask the user to quit it. Then, from WSL:

```bash
mkdir -p ~/ffc-ask && cp /mnt/c/Users/<you>/AppData/Roaming/FantasyCompanion/stats.duckdb* ~/ffc-ask/
```

Expected: `~/ffc-ask/stats.duckdb` (about 410 MB), plus `stats.duckdb.wal` when there is one.

- [ ] **Step 2: Run both gates**

```bash
FFC_ASK_DB=~/ffc-ask/stats.duckdb FFC_ASK_REPORT=/tmp/ask-gate.json FFC_ASK_MCP_REPORT=/tmp/ask-mcp-gate.json npm run test:ask
```

Expected: PASS.

- **AF1's summary** is like its plan's: references 141/141, tool 140/140, metric recall@5 107/107, players 64/64, ask or decline 12/12, slots 124/124. A warehouse past week 7 is fine: every reference names its seasons and weeks.
- **`/tmp/ask-mcp-gate.json`** has, for `legacy` and `modern`: `tools: 11`, `same: "141/141"`, `differ: []`, and the times through HTTP (`p50`, `p90`, `max`, in ms).
- Record the numbers for the status block (Task 13).

---

### Task 11: The Windows package check (spec §10)

- [ ] **Step 1: The Windows suite, the self-tests, the unpacked app**

**Ask the user before pushing.** Then:

```bash
git push origin feat/analyst-af2:check/plan-af2
gh run watch "$(gh run list --branch check/plan-af2 --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Expected: green.

- The log of "Check the MCP bridge in the packaged app" shows `{"ok":true,"legacy":{"tools":11,…},"modern":{"tools":11,…}}`.
- The run has an artifact `FantasyCompanion-win-unpacked`.
- Keep the branch until Task 12 is done.

If the MCP step fails, look at its JSON first:

- An `error` naming a module means the asar resolution failed in Node mode.
- A timeout means the exe did not run as Node: check that no Electron fuse turned off RunAsNode.

---

### Task 12: On this PC, with the user (spec §10: the bridge's gate)

The packaged app with Claude desktop (the Store app) and Claude Code in WSL. Step by step with the user; record what happens.

- [ ] **Step 1: Unpack the check build**

Ask the user to quit FantasyCompanion (v0.37.0) and Claude desktop. Then:

```bash
gh run download "$(gh run list --branch check/plan-af2 --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" -n FantasyCompanion-win-unpacked -D /mnt/c/Users/<you>/ffc-af2-check
```

- [ ] **Step 2: Turn Claude on, add it to Claude desktop**

The user starts `C:\Users\<you>\ffc-af2-check\FantasyCompanion.exe`, opens Stats › Ask and turns Claude on.

Expected:

- The switch is on and the address shows (`http://127.0.0.1:4xxxx/mcp`).
- `%APPDATA%\FantasyCompanion\mcp.json` and `start-for-claude.lnk` exist.
- Claude desktop shows "Not added yet", with the `Claude-Data` path.

The user presses **Add to Claude desktop** and confirms.

Expected:

- The status reads "Added".
- The config has `mcpServers["fantasy-companion"]` beside the untouched `preferences`.
- A `claude_desktop_config.json.<stamp>.bak` sits beside it.

- [ ] **Step 3: Ask Claude desktop**

The user opens Claude desktop. Then:

- Under Settings › Developer, `fantasy-companion` shows as running.
- Ask: "Who leads WRs in yards per route run this season?" The answer cites tool results.
- Ask: "How many tackles does Chris Jones have this season?" Claude desktop shows a "Which Chris Jones?" form if it supports elicitation; otherwise Claude asks in the chat.

Look at Claude desktop's log for the server (`…\Claude-Data\claude_<id>\logs\mcp-server-fantasy-companion.log`): it should show the protocol version used and no errors.

- [ ] **Step 4: The app closed: the bridge starts it outside the container**

The user quits FantasyCompanion and asks Claude desktop another question.

Expected:

- The app appears minimised in the taskbar within about 10 s, and the answer comes.
- Nothing new of the app's is in Claude's package:

  ```bash
  ls /mnt/c/Users/<you>/AppData/Local/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/ /mnt/c/Users/<you>/AppData/Local/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Local/
  ```

  No `FantasyCompanion` folder. The old `fantasy-football-companion-updater` from 2026-09-17 may stay.

- The real `%APPDATA%\FantasyCompanion\` has a fresh `mcp.json`.

If a new `FantasyCompanion` folder appears in the package, stop: the shortcut did not escape the container (amendment G). Report it.

- [ ] **Step 5: One instance**

With the app running, the user double-clicks `FantasyCompanion.exe` again.

Expected: the running window comes forward, and Task Manager shows a single FantasyCompanion process group.

- [ ] **Step 6: Claude Code in WSL**

The user presses **Copy command for WSL**, runs it in WSL, then:

```bash
claude mcp list
claude -p "Using the fantasy-companion tools: who leads RBs in rushing EPA per carry this season?"
```

Expected: `fantasy-companion` shows as connected, and the answer comes from the tools.

- [ ] **Step 7: Afterwards**

- Remove the check build's folder.
- Delete the check branch: `git push origin --delete check/plan-af2`.
- Once v0.38.0 is installed (Task 13), Stats › Ask shows Claude desktop as "older entry", because the exe moved. **Update Claude desktop** points it at the installed app, and `claude mcp remove fantasy-companion` plus a fresh copy does the same for Claude Code in WSL.

---

### Task 13: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 1,310 passed, 7 skipped (3 more with the untracked `playerImage` tests); the build has `out/main/mcpBridge.js`.

- [ ] **Step 2: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/analyst-af2`. It reviews against:

- the spec (§6.1, §10, §11) and the amendments (§16);
- the Review Focus list;
- the security of a local server: the token, Host and Origin, loopback only, the paths written, and the config edit.

Fix Critical and Important findings, each in its own commit, test first. Then re-run Step 1, Task 10 and, for any change to the bridge, the server or `index.ts`, Task 11's self-test.

- [ ] **Step 3: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/analyst-af2 -m "merge: feat/analyst-af2 (plan AF2)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.38.0" && git tag v0.38.0
git branch -d feat/analyst-af2
```

- [ ] **Step 4: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 10 numbers, and what Tasks 11 and 12 showed (the protocol era Claude desktop chose, whether it showed the elicitation form, how long a start took);
- the review fixes, and anything deferred.

Then commit, staging this file only: `git commit -m "docs(plan): mark plan AF2 complete"`.

- [ ] **Step 5: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.38.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests, both packaged self-tests, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.38.0 --draft=false`). The release notes should say:

- **Ask Claude about your stats:** turn it on in Stats › Ask, add it to Claude desktop with one button, or copy the command for Claude Code. Claude answers from the app's data, read only, with your Claude plan.
- **The app now runs once:** opening it again brings the running window forward.

---

## Self-review against the spec

| Spec                                                                                                             | Where                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| §6.1 In the app, Streamable HTTP on 127.0.0.1, bearer token, Origin checked                                      | Task 2 (`http.ts`: Host too, `/mcp` only, both eras: amendment A)                                                                |
| §6.1 Random port                                                                                                 | Task 5 (picked once and kept: amendment E)                                                                                       |
| §6.1 Off by default, turned on in Settings › Ask                                                                 | Task 5 (`ask_mcp_enabled`), Task 7 (Stats › Ask: amendment J)                                                                    |
| §6.1 The stdio bridge: the app's exe as Node, `mcpBridge.js`, port and token from a file in `userData`           | Task 3 (`mcp.json`, `out/main/mcpBridge.js`), Task 6 (`ELECTRON_RUN_AS_NODE`)                                                    |
| §6.1 / §14.2 The app not running: start it minimised, wait up to 30 s                                            | Task 3 (through `explorer.exe` and the shortcut: amendment G), Task 6 (`--minimized`, one instance: amendment H), Task 12 Step 4 |
| §6.1 Gated first on the packaged Windows build                                                                   | Task 6 (`--mcp-self-test`), Task 11 (Package check), Task 12                                                                     |
| §6.1 Claude Code connects to the HTTP endpoint                                                                   | Task 5 (the Windows command; WSL through the bridge: amendment I), Task 12 Step 6                                                |
| §6.1 Add to Claude desktop (after you confirm, with a backup), Copy Claude Code command                          | Task 4 (`%APPDATA%\Claude` and the Store app's folder: amendment F), Task 5 (the dialog), Task 7                                 |
| §6.1 The full tool profile                                                                                       | Task 2 (the metric-id lists left out of what Claude reads: amendment C)                                                          |
| §6.1 `structuredContent` with an `outputSchema`, plus the compact text                                           | Task 2 (text only: amendment B, measured)                                                                                        |
| §6.1 / §4.1 Elicitation for ambiguity where the client supports it                                               | Task 2 (`find`, 2026-07-28 form; listed otherwise: amendment D)                                                                  |
| §6.1 The brief as `instructions` and an `analyst` prompt                                                         | Task 2 (and the brief's first rule for MCP)                                                                                      |
| §6.1 Resources: the glossary, `semantic-model.yaml`, the verified examples                                       | Task 2 (`ffc://glossary`, `ffc://semantic-model.yaml`, `ffc://examples`)                                                         |
| §6.1 `open_in_app` shows answers in the app                                                                      | Plan AH (§15 G)                                                                                                                  |
| §10 The MCP server's unit tests: initialize, list tools, call a tool, `structuredContent`, bad token, bad Origin | Task 2 (each, in both eras; no `structuredContent` by amendment B)                                                               |
| §10 AF2 reports the reference calls passing through the MCP server                                               | Task 8, Task 10                                                                                                                  |
| §11 The AF2 row                                                                                                  | Every item above; `v0.38.0` in Task 13                                                                                           |
