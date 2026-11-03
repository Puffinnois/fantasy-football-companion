# Plan AG1 — Ask: the in-app agent loop and its providers

**Status:** ready to execute, 2026-11-03. Amendments A–K approved by the user 2026-11-03. The code is the prototype's (`proto/ag1` at `4b994f8`, worktree `../ffc-ag1-proto`), split into the tasks below. Replayed from this text on clean `main` (a1fb5ac): every block applied and every failing step failed as stated (12 of 12); typecheck, lint and the suite were green at each task, 1,315 → 1,368 passed; after Task 11 the tree is byte-identical to the prototype, `package-lock.json` included. Task 12's two docs are the only additions beyond it. The live gate of Task 11 has not been re-run from this text: see Planning findings.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the app answers a stats question itself, with whichever model you set up: an Anthropic key, an OpenAI-compatible service (paid or free tier), or a local model in Ollama or LM Studio (spec §5, §6.2, the AG row of §11).

- **The agent loop** (`loop.ts`): resolver → model → tools → answer → checks, streamed, with the limits of §5.1. One loop for every model, three ways to call it: full profile with native tools, full profile in structured mode, compact profile.
- **Provider adapters**: Anthropic, OpenAI-compatible (presets OpenAI, Gemini, Groq, OpenRouter, Mistral, Custom), Ollama and LM Studio, with local-server detection and per-model capabilities (tools, thinking).
- **Keys** encrypted with `safeStorage`; **threads** and **follow-ups**; a trace per turn.
- **Replay:** recorded model replies run through the loop in `npm test`.
- **Stats › Ask** gains a Model section and a plain "try a question" box, so the loop can be used before Plan AH builds the screen.
- Ship `v0.39.0`.

**Not in AG1 (Plan AG2):** the evaluation runner (pass^k, paraphrases, penalty scoring, simulated user, rubric judge), the league fixture, the model matrix and its report, tuning of the compact profile and brief on the dev split, and the measured verdicts on the example library, sample-k and `bge-m3`. Also moved to AG2 by the user on 2026-11-03: `npm run ask:replay -- <trace>` and re-grading the recordings against the real engine in `npm run test:ask` (amendment E).

**Spec:** `docs/superpowers/specs/2026-11-01-ask-analyst-design.md` (approved 2026-11-02): §4.1 (thread state), §5, §6.2, §9, §10, the AG row of §11; amendments §15 (AF1) and §16 (AF2). Amended by this plan: Task 12 writes amendments A–K into the spec as §17. AF1/AF2's reference: `docs/reference/analyst.md`.

## Decisions (user, 2026-11-03)

- **AG is split like AF:** AG1 (`v0.39.0`) is the loop, the providers, the keys, the calling modes, threads and replay. AG2 is the evaluation and the model matrix, and its report decides the defaults Plan AH shows. AH stays after both.
- **Keys for AG2:** free-tier keys (Gemini, Groq, OpenRouter). The Claude tier only if the user's promotional credit is Anthropic API credit (console.anthropic.com → Billing). It is not checked yet. AG1 needs no paid key: its adapter tests use recorded replies.
- **Replay's other two parts go to AG2 (2026-11-03, after the prototype):** `npm run ask:replay -- <trace>` and re-grading the recordings against the real engine. AG1 ships with the replay in `npm test`, on recorded outcomes.
- **Local models:** pulling about 6–10 current models (60–90 GB) into WSL Ollama, and a couple into LM Studio on Windows, is fine. The shortlist comes from the current BFCL board at AG2 time.

## Planning findings (this PC, 2026-11-03)

- **Ollama 0.16.2 (WSL)** reports capabilities per model in `/api/show`: `qwen3:4b` → `completion, tools, thinking`; `gemma3:12b` → `completion, vision` (no tools, so structured mode only, as the probes found). Installed: `qwen3:4b`, `gemma3:4b`, `gemma3:12b`, `bge-m3`, `nomic-embed-text`.
- **The goal is the best model that runs easily here, not newer versions of the installed ones (user, 2026-11-03).** The installed models are old and stay only as the AF1 baseline. Current families in Ollama's library: Qwen 3.5 (`2b`, `4b`, `9b`, `27b`, `35b-a3b` MoE), Qwen 3.6 (`27b`, `35b-a3b`), Gemma 4 (`e2b`, `e4b`, `12b`, `26b-a4b` MoE, `31b`), GLM-4.7-Flash, Ministral 3 (`3b`, `8b`, `14b`) and Granite 4. The BFCL board doesn't list most 2026 small models yet: aggregators put GLM-4.5/4.7 and Qwen3 32B at the top of the open-weight models on v3. Guides point to Qwen 3.5 9B (about 6 GB at Q4) and Gemma 4 E4B for an 8 GB card. That evidence is thin, so our own evaluation decides (AG2).
- **WSL's Ollama is 0.16.2 (2026-02-16); the current release is 0.40.14 (2026-11-03).** The newer families probably need it, and upgrading takes sudo, so the user runs the installer. Old models stay as the baseline.
- **LM Studio** isn't reachable from WSL: NAT networking can't reach Windows' `127.0.0.1` (as in AF2 amendment I). The packaged app runs on Windows, where both `localhost:1234` and WSL's forwarded `localhost:11434` should answer; the check by hand confirms it (Task 13).
- **GPU:** the RTX 4060 was in P8 at planning. On battery a model call takes 3–4× as long (AF1 §15 K), so live checks record the power state.
- **The Anthropic API now** (from the `claude-api` reference, cached 2026-10-06):
  - Current tiers: `claude-opus-5-5` (strong, the default), `claude-sonnet-5-5`, `claude-haiku-5-5` (fast).
  - **Forced `tool_choice` (`any` / `tool`) returns 400** on Opus 5.5 and Sonnet 5.5. Structured output is `output_config.format` (a JSON Schema).
  - **No thinking budget any more:** `budget_tokens` returns 400 on the 5.x models, and Opus 5.5 can't turn thinking off. Depth is set with `output_config.effort` (`low` … `max`; Opus 5.5 defaults to `medium`). Sonnet 5.5 turns thinking off with `{type: "between_tools"}`.
  - Since 2026-10-21, `temperature` / `top_p` / `top_k` return 400 on every model.
  - **Preserved thinking:** history must be append-only. Each assistant turn's content blocks go back unchanged on the next request.
  - `stop_reason: "refusal"` must be handled. Server-side fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) are the recommended default on Opus 5.5 and Sonnet 5.5.
- **`@anthropic-ai/sdk`:** 1.0.0 came out 2026-10-21; the latest is 1.4.0 (2026-11-02). The pin is the newest 1.x at least two weeks old when Task 4 runs. 1.1.0 qualifies now, and 1.2.0 from 2026-11-06.
- **Later the same day (2026-11-03, checked while writing this text):** WSL's Ollama is now 0.40.14, so the upgrade above is done. `ollama list` shows no models, and neither `~/.ollama` nor the `ollama` service's home holds any. The models the prototype measured have to be pulled again before Task 11's live gate.

## Prototype findings (`proto/ag1` at `4b994f8`, 2026-11-03)

The prototype covers Tasks 1–11 (45 files, +8.6k lines). Suite 1,315 → 1,368 passed; lint and both typechecks clean. Measured on the frozen copy (`~/ffc-ask/stats.duckdb`, through 2026 week 8), on AC power:

- **The AG1 gate, through the real loop** (compact profile, structured mode, the probe's 20 questions):

  | Model       | Right | Call step, median | Whole turn, median |
  | ----------- | ----- | ----------------- | ------------------ |
  | `qwen3:4b`  | 20/20 | 1.9 s             | 13.8 s             |
  | `gemma3:4b` | 19/20 | 1.2 s             | 2.5 s              |

  The call step matches AF1 (§15 K). Across three runs `qwen3:4b` scored 19–20 and `gemma3:4b` 19. The whole turn adds the written answer.
- **Ollama's `qwen3:4b` is now a thinking-only model.** With `think: false` it writes its reasoning into the answer text instead of turning it off. Five answers ran to the output cap.
  - Fix: the local adapters drop everything up to `</think>`, and Ollama holds the answer back (no streaming) when a thinking model is asked not to think.
  - The compact answer has its own cap (1,024 tokens). When it is cut off, the turn gives the result's first rows instead.
  - A thinking-only model is slow to answer whatever the profile: a point for AG2's matrix.
- **Small models repeat a metric** (`gemma3:4b`: `["yprr", "yprr"]`, refused by the engine). `compactAnswer` now keeps each metric once, which saves a round trip.
- **Follow-ups:** all 8 of the set's follow-ups give their reference calls (perfect-model check, `tests/ask/followups.live.test.ts`), and none of the other 155 questions is mistaken for one. Two rules came from that run:
  - Without an opening word, only a question of three words or fewer, with no subject, position or ranking word, is a follow-up.
  - The last call's metric always stays among the candidates.
- **Replay needs the recorded tool outcomes.** On the real database a call can fail and the model retry; a fake engine can't reproduce that. A recording therefore keeps the players the resolver matched and each call's outcome (cards left out). The replay runs the real resolver, compact schema and loop with no model and no database: 2 files, 40 turns, 136 KB.
- **Small moves:** `listedSchema` moves from `mcp/server.ts` to `schema.ts`, since the loop uses it too. The presets move to `src/shared/askPresets.ts`, read by main and the Model section. MCP and the loop share one analyst (one cache, one player index).
- **The Anthropic adapter** is tested against recorded SSE through the SDK's own `fetch` option, with no live call. It sends adaptive thinking with `block_binding: drop_block`, effort `low` for "off" on Opus 5.5, `between_tools` on Sonnet 5.5, `disabled` on Haiku 5.5, and `fallbacks: "default"`. No `temperature`, no `tool_choice`.
- **Left for AG2, not built:** answering a "which one?" question back ("the KC one") as a clarification; follow-up chains longer than one step (the chain keeps the first question and the last call's time); the simulated user, which tests both.

## Amendments (spec §17; approved by the user 2026-11-03)

- **A. AG is split (§11):** AG1 v0.39.0 (this plan); AG2 (evaluation, matrix, report) before AH v0.40.0.
- **B. Anthropic through its official SDK (§6.2).** `@anthropic-ai/sdk` pinned exactly: one new dependency, which gives typed errors, streaming and retries. The OpenAI-compatible and local adapters use `fetch`, with no new dependency.
- **C. "Thinking budget" becomes effort (§5.1, §5.2).**
  - Anthropic: `output_config.effort`, `low` by default for the loop. Structured mode uses `output_config.format`, never a forced tool.
  - OpenAI-compatible: `reasoning_effort` where the preset supports it.
  - Ollama: `think` on or off. The setting is one control, "reasoning: off / low / high", mapped per provider.
- **D. Ollama through its native `/api/chat` (§6.2), not its OpenAI endpoint.** The native API takes `format` (a schema), `think`, `options.num_ctx` and `keep_alive`, which is what the probes measured. The OpenAI endpoint can't set the context size, so the brief would be cut at Ollama's default. To confirm in the prototype. LM Studio uses its OpenAI-compatible `/v1/chat/completions`, with capabilities from `/api/v0/models`.
- **E. Replay in two places (§10).**
  - Recorded replies live in `tests/ask/replays/`. `npm test` runs them through the real loop against the fake engine of the unit tests: adapter parsing, loop control, compact mapping and checks.
  - Re-grading against the real engine runs in `npm run test:ask` (the frozen database isn't in the repo or in CI).
  - `npm run ask:replay -- <trace>` re-runs a trace's calls on `FFC_ASK_DB`.
  - **Moved to AG2 (user, 2026-11-03):** the re-grading and `ask:replay`. In AG1, replay is the `npm test` part, and it returns each call's recorded outcome instead of using the fake engine.
- **F. A "try a question" box in Stats › Ask (§8, §16 J).** Plain text: the streamed answer, the tool calls and the checks, with Stop. No cards and no thread list (Plan AH). It lets the user try a provider the day AG1 ships.
- **G. Follow-ups (§4.1 thread state).** The thread keeps its last call. When a question names no subject or metric of its own ("now 2024", "only in the red zone"), the resolver carries the last call's subject and metric forward. The compact profile starts from the last call's arguments and changes only what the new words name. The full profile gets the last call in the context block.
- **H. Examples and sample-k are built, off by default (§5.1, §5.3).** Retrieving the top 3 `ask_examples` by masked question goes into the compact prompt; sample-k re-samples an invalid first call on a fast cloud model. Both are settings, and AG2 measures them. `bge-m3` comes behind the `Retriever` in AG2, only if the evaluation shows a gain.
- **I. Storage (§5.3, §6.2).** Migration 013 adds `ask_threads`, `ask_messages` and `ask_providers`. A key is stored as `safeStorage` ciphertext (DPAPI on Windows) and never reaches the renderer, a trace or a log. When `safeStorage` is unavailable (some Linux dev setups), keys aren't stored, and the app says so.
- **J. What leaves the PC (§6.2):** the Model section says it per provider. A cloud provider gets the question, the brief and the tool results (stats rows; league team and player names). A local one gets nothing that leaves the PC. Each answer names its model and tokens.
- **K. Anthropic server-side fallbacks on:** requests to Opus 5.5 and Sonnet 5.5 send `fallbacks: "default"`. A refusal elsewhere ends the turn with "the model declined", never a retry loop.

## Open points (the prototype against the outline)

The outline promised some things the prototype does not have. This text must reproduce the prototype byte for byte, so none of them is added here. The user moved items 1 and 2 to AG2 on 2026-11-03. The others are still the user's call: add one to the prototype and regenerate this plan, or move it to AG2.

| # | The outline or amendment | In the prototype | Consequence |
| --- | --- | --- | --- |
| 1 | Amendment E, Task 11, spec §10: `npm run ask:replay -- <trace>`, `scripts/ask-replay.ts` | Not built; no `scripts/` folder, no npm script | **Moved to AG2 (user, 2026-11-03).** Spec §17 E (Task 12) says so |
| 2 | Amendment E, Task 11: `test:ask` re-grades the recordings on the real engine | Not built. `test:ask` runs the live model (`loop.live.test.ts`) and the follow-ups on the database (`followups.live.test.ts`), but recordings replay only with their stored outcomes | **Moved to AG2 (user, 2026-11-03).** Until then, an engine change that alters an answer does not fail any replay |
| 3 | Task 11: recordings of `qwen3:4b` native and structured, `gemma3:4b` compact, one cloud reply per adapter | Two files, both compact and structured: `qwen3:4b`, `gemma3:4b` | The native and full-profile paths have scripted tests only, and the cloud adapters hand-written streams (item 7) |
| 4 | Task 8: tests for retrieval ranking and refusing evaluation questions | `examples.ts` has no test, and no test turns examples on in the loop | Task 8's failing step covers sample-k only |
| 5 | Task 1: a test of the channel list | None | Task 1's failing step is the typecheck (`src/preload/index.ts` does not implement the new `Api`) |
| 6 | Findings: `</think>` stripped, text held back for a thinking model | Built; `stripThinking()` and the hold-back have no direct test (recordings keep the text after stripping) | A regression here would show only in the live gate |
| 7 | Task 3: tests against recorded streams (OpenAI, Groq, Gemini, OpenRouter); 5xx | Hand-written streams; 401, 429, unreachable, no 5xx | Real services' streams are first met in Task 13 |
| 8 | Task 6: tests for the timeout | Stop is tested; the 90 s timeout is not | |
| 9 | Task 11: one free-tier call per adapter in the gate | `FFC_ASK_LIVE` takes only `ollama:` | Moved to Task 13, through the Test button, with the user's keys |
| 10 | Amendment C: `reasoning_effort` "where the preset supports it" | Sent for every OpenAI-compatible preset when reasoning is not off (LM Studio never) | A service that rejects it gives a readable 400 |
| 11 | Amendment H: "both are settings" | `ask.options` / `setOptions` over IPC; no control in Stats › Ask | AG2 sets them; a user cannot yet |

Two placements differ from the outline without changing any code: `createProvider()` (`providers/index.ts`) comes in Task 9, where its first test is, and the `compactAnswer` metric fix comes in Task 11, where the `gemma3:4b` recording makes its test fail.

## Architecture

- **Main process, `src/main/analyst/`:**
  - `providers/types.ts`: `Provider` with `chat(request, signal, onText?) → Promise<ChatReply>` and `models(signal)`; the neutral `ChatMessage`, `ChatRequest`, `ChatReply`; `ProviderError`.
  - `providers/anthropic.ts`, `providers/openaiCompatible.ts`, `providers/ollama.ts`, `providers/detect.ts` (Ollama `/api/tags` + `/api/show`, LM Studio `/api/v0/models`), `providers/index.ts` (`createProvider`), `providers/replay.ts`.
  - `loop.ts`: `askTurn({ question, provider, analyst, profile, mode, reasoning, history, last, examples, sampleK, signal, emit }) → Promise<LoopOutput>`. Events go through `emit`. Three modes: native, structured-full (`{thought, tool, args}` per step), compact (`{thought, args}` for the classifier's tool). Limits: 8 calls, 3 failed, an output cap per call, a token cap per turn, 90 s, Stop. `other` re-resolves once with k = 10. Then the answer call and the checks (`checks.ts`); the trace is built with `trace.ts`, already there.
  - `followup.ts`: the thread state of amendment G. `examples.ts`: retrieval (amendment H).
  - `keys.ts` (`safeStorage`), `askService.ts` + `askIpc.ts`: `ask:send` (events through `webContents.send`), `ask:stop`, `ask:threads`, `ask:messages`, `ask:deleteThread`, `ask:providers`, `ask:saveProvider`, `ask:removeProvider`, `ask:activateProvider`, `ask:models`, `ask:detect`, `ask:test`, `ask:openDashboard`, `ask:options`, `ask:setOptions`.
  - `schema.ts` gains `listedSchema` (moved from `mcp/server.ts`) and `strictCompatible`. `main/index.ts` makes one analyst for MCP and the loop.
- **Shared:** `src/shared/ask.ts` gains `ProviderKind`, `ProviderPreset`, `ProviderSettings` (no key), `ProviderInput`, `ModelInfo`, `LocalServer`, `AskCall`, `AskEvent`, `AskFlag`, `AskThread`, `AskMessage`, `AskOptions`. `src/shared/askPresets.ts` holds the presets. `src/shared/ipc.ts` gains `ask.*`, and the preload follows.
- **Renderer:** `StatsAsk.tsx` gains `ask/AskModel.tsx` and `ask/AskTry.tsx` (amendment F).
- **`companion.db`:** migration 013 (amendment I), `db/repos/askThreads.ts`, `db/repos/askProviders.ts`.

## Global Constraints

- **Branch** `feat/analyst-ag1` off `main`.
- **Commits.** One Conventional Commit per "Check and commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan:
  - `.gitignore`, `.claude/`, `.design-sync/`, `docs/design/FantasyCompanion UI/`;
  - `docs/research/nfl_predictive_metrics.md:Zone.Identifier`;
  - `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts`;
  - `tsconfig.node.tsbuildinfo`, `tsconfig.web.tsbuildinfo`.

  Stage files by name; never run `git add -A` or `git add .`.

- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`** (it rewrites the Sleeper fixtures). **Never format `tests/ask/replays/*.json`:** they are recordings, written with one space of indent.
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.**
  - Every new file is given whole.
  - Every change to an existing file is a diff that `git apply` takes as written: save it to a file and run `git apply <file>`, or make the same edit by hand.
  - After Task 11 the tree equals `proto/ag1` at `4b994f8`, except `package-lock.json` when npm resolves it differently. Check: `git diff --stat proto/ag1 HEAD`. Each task's code was run as its own commit on clean `main`: typecheck, lint and the suite were green, and each failing step failed as stated.
- **Test counts** are those of a clean checkout (`main`: 1,315 passed, 7 skipped). In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3. One existing test is flaky under the full suite and unrelated to this plan: `tests/renderer/components/DevTools.test.tsx` › "snip shows the frozen capture…". Re-run the suite when it is the only failure.
- **The Anthropic SDK is pinned** to 1.1.0, the version the prototype ran. The outline's rule (the newest 1.x at least two weeks old when Task 4 runs) would allow 1.2.0 from 2026-11-06; moving to it is a change of its own, after Task 14.
- **Scope.**
  - The resolver, the tools and the engine do not change. `compactAnswer` keeps each metric once, and `listedSchema` moves without a change.
  - No fantasy advice: the resolver already declines it, with no model call.
  - The renderer gains two sections in one tab. Threads have no list and answers no cards until Plan AH.
- **No network in the unit tests.** Adapters are tested with an injected `fetch`, and the Anthropic SDK takes it through its `fetch` option. Temporary folders only.
- **Keys.** A key goes into `saveProvider` and `models`, and never comes back. Never paste a real key into a test, a trace or a plan.
- **Gates.**
  - **Task 7:** `FFC_ASK_DB=~/ffc-ask/stats.duckdb npx vitest run tests/ask/followups.live.test.ts`: all 8 follow-ups, none of the other 155 taken for one.
  - **Task 11:** `FFC_ASK_DB=~/ffc-ask/stats.duckdb FFC_ASK_LIVE=ollama:qwen3:4b,ollama:gemma3:4b npm run test:ask`, on AC power: each model ≥ 19/20, at a median close to the table above.
  - **Task 13:** the Windows suite and self-tests on the Package check workflow, and the check by hand.
  - If a gate fails, stop and report to the user.
- **Release** `v0.39.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push**: `check/plan-ag1` in Task 13, then `main` and the tag.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A key leaks.**
   - Task 2: a saved key never comes back in `ProviderSettings`. Task 9: it does not reach the renderer's list or the Dev-mode trace. Task 13: no key in `log.jsonl`.
2. **A key is stored in the clear.**
   - Task 2 and Task 9: with no `safeStorage` the key is refused, and the app says so.
3. **Stats go to a service the user did not expect.**
   - Task 10: the Model section says what leaves the PC per kind, and nothing is sent until a model is added.
4. **A wrong number looks right.**
   - Task 6: the checks flag a number not in the results. Task 11: the replays pin the calls.
5. **The model's reasoning shows up as the answer, or the answer never comes.**
   - Task 5: `stripThinking` and the hold-back (no direct test: Open point 6). Task 6: a cut-off answer gives the result's first lines. Task 11: the live gate.
6. **A follow-up changes the wrong question, or a new question is read as a follow-up.**
   - Task 7: the perfect-model check on the frozen database (8 follow-ups, 155 other questions).
7. **A turn does not end.**
   - Task 6: the call and failure limits, Stop. Task 9: Stop through the service; one turn at a time.
8. **Anthropic returns 400 on every request.**
   - Task 4: no `temperature`, no forced `tool_choice`, no thinking budget. Task 13: a real call, if the user has API credit.
9. **Another provider reads a transcript it cannot use.**
   - Task 9: a thread resends a turn's transcript only to the provider that wrote it, and as text to any other. The test covers the same provider; the other branch has no test, so Task 14's review looks at it.

---

### Task 0: Branch and baseline

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/analyst-ag1
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/analyst-ag1`.

- [ ] **Step 2: Note the suite**

```bash
npx vitest run
```

Expected: 1,315 passed, 7 skipped on a clean checkout (1,318 passed with the untracked `playerImage` tests).

---

### Task 1: Shared types and IPC channels (spec §5, §6.2)

The renderer and main agree on the turn before either exists. The test is the type checker: the `Api` type grows, and the preload that implements it stops compiling until it follows.

**Files:**

- Modify: `src/shared/ask.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/analyst/checks.ts`

- [ ] **Step 1: Write the types**

Modify `src/shared/ask.ts`:

```diff
diff --git a/src/shared/ask.ts b/src/shared/ask.ts
index 5aab9bf..2422dd7 100644
--- a/src/shared/ask.ts
+++ b/src/shared/ask.ts
@@ -99,3 +99,111 @@ export interface McpStatus {
 
 /** What a copy button puts on the clipboard. */
 export type McpCopy = 'claude-code' | 'claude-code-wsl' | 'claude-desktop'
+
+// ---------------------------------------------------------------------------------------------
+// The in-app loop (Ask spec §5, §6.2; Plan AG1)
+
+/** Who answers: an Anthropic key, an OpenAI-compatible service, or a local server. */
+export type ProviderKind = 'anthropic' | 'openai' | 'ollama' | 'lmstudio'
+
+/** OpenAI-compatible presets (spec §6.2, §14 point 4); `custom` is any other base URL. */
+export type ProviderPreset = 'openai' | 'gemini' | 'groq' | 'openrouter' | 'mistral' | 'custom'
+
+/** Native tool calls, or one constrained JSON object per step (spec §5.2). */
+export type CallingMode = 'native' | 'structured'
+
+/** Every tool, or the classifier's tool with only the open slots (spec §3.2). */
+export type ToolProfile = 'full' | 'compact'
+
+/** One control for every provider (amendment C): Anthropic effort, OpenAI `reasoning_effort`, Ollama `think`. */
+export type Reasoning = 'off' | 'low' | 'high'
+
+/** A provider as the renderer sees it: never the key, only whether one is stored. */
+export interface ProviderSettings {
+  id: number
+  kind: ProviderKind
+  preset: ProviderPreset | null
+  label: string
+  baseUrl: string
+  model: string
+  profile: ToolProfile
+  mode: CallingMode
+  reasoning: Reasoning
+  hasKey: boolean
+  /** The provider Ask uses. */
+  active: boolean
+}
+
+/** What a new or changed provider sets; `key` only when it changes (`''` removes it). */
+export type ProviderInput = Omit<ProviderSettings, 'id' | 'hasKey' | 'active'> & {
+  key?: string
+}
+
+/** A model a server offers, with what it can do (spec §5.2: the calling mode defaults from it). */
+export interface ModelInfo {
+  id: string
+  tools: boolean
+  thinking: boolean
+  /** Its context window in tokens, when the server says. */
+  context: number | null
+}
+
+/** A local server found running (spec §6.2). */
+export interface LocalServer {
+  kind: 'ollama' | 'lmstudio'
+  baseUrl: string
+  models: ModelInfo[]
+}
+
+/** A tool call as the thread keeps it. */
+export interface AskCall {
+  tool: string
+  args: unknown
+}
+
+/** What the loop streams to the screen for one turn. */
+export type AskEvent =
+  | { type: 'status'; text: string }
+  | { type: 'call'; call: AskCall }
+  | { type: 'result'; outcome: ToolOutcome }
+  | { type: 'text'; delta: string }
+  | { type: 'done'; message: AskMessage }
+  | { type: 'error'; error: string }
+
+/** An answer check (spec §4.3) as the screen shows it. */
+export interface AskFlag {
+  kind: 'number' | 'sample' | 'base' | 'causal'
+  text: string
+  at: [number, number]
+  message: string
+  severity: 'flag' | 'soft'
+}
+
+export interface AskThread {
+  id: number
+  title: string
+  createdAt: string
+  updatedAt: string
+}
+
+export interface AskMessage {
+  id: number
+  threadId: number
+  role: 'user' | 'assistant'
+  text: string
+  calls: AskCall[]
+  results: ToolOutcome[]
+  flags: AskFlag[]
+  /** How the turn ended: answered, asked back, declined, stopped, or failed. */
+  outcome: 'answer' | 'ask' | 'decline' | 'stopped' | 'error' | null
+  model: string | null
+  tokens: { input: number; output: number } | null
+  ms: number | null
+  createdAt: string
+}
+
+/** Ask's settings (amendment H): the example library and sample-k, both off by default. */
+export interface AskOptions {
+  examples: boolean
+  sampleK: boolean
+}
```

Modify `src/shared/ipc.ts`:

```diff
diff --git a/src/shared/ipc.ts b/src/shared/ipc.ts
index 0d9d547..952176d 100644
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -44,7 +44,18 @@ import type {
   StatsView
 } from './stats/types'
 import type { DevNote, NewNote, NoteError, NoteStatus } from './devNotes'
-import type { McpCopy, McpStatus } from './ask'
+import type {
+  AskEvent,
+  AskMessage,
+  AskOptions,
+  AskThread,
+  LocalServer,
+  McpCopy,
+  McpStatus,
+  ModelInfo,
+  ProviderInput,
+  ProviderSettings
+} from './ask'
 
 export interface FindLeaguesResult {
   userId: string
@@ -200,6 +211,28 @@ export interface Api {
       /** Puts a command or config on the clipboard (the token stays in main). */
       copy(kind: McpCopy): Promise<void>
     }
+    /** Ask spec §6.2 (Plan AG1): the model providers; a key goes in, never comes back. */
+    providers: {
+      list(): Promise<ProviderSettings[]>
+      save(input: ProviderInput & { id?: number }): Promise<ProviderSettings>
+      remove(id: number): Promise<void>
+      activate(id: number): Promise<void>
+      models(input: ProviderInput & { id?: number }): Promise<ModelInfo[]>
+      /** The local servers running now (Ollama, LM Studio) and their models. */
+      detect(): Promise<LocalServer[]>
+      test(id: number): Promise<{ ok: boolean; message: string; ms: number }>
+      /** Where each provider's keys and usage are (opened in the browser). */
+      openDashboard(id: number): Promise<void>
+    }
+    /** Asks in a thread (null: a new one); the answer streams to `onEvent`, then resolves. */
+    send(threadId: number | null, question: string): Promise<AskMessage>
+    stop(): Promise<void>
+    onEvent(listener: (event: AskEvent) => void): () => void
+    threads(): Promise<AskThread[]>
+    messages(threadId: number): Promise<AskMessage[]>
+    deleteThread(id: number): Promise<void>
+    options(): Promise<AskOptions>
+    setOptions(options: AskOptions): Promise<AskOptions>
   }
 }
 
@@ -269,5 +302,21 @@ export const IPC = {
   askMcpSetEnabled: 'ask:mcpSetEnabled',
   askMcpResetToken: 'ask:mcpResetToken',
   askMcpAddToClaudeDesktop: 'ask:mcpAddToClaudeDesktop',
-  askMcpCopy: 'ask:mcpCopy'
+  askMcpCopy: 'ask:mcpCopy',
+  askProviders: 'ask:providers',
+  askSaveProvider: 'ask:saveProvider',
+  askRemoveProvider: 'ask:removeProvider',
+  askActivateProvider: 'ask:activateProvider',
+  askModels: 'ask:models',
+  askDetect: 'ask:detect',
+  askTest: 'ask:test',
+  askOpenDashboard: 'ask:openDashboard',
+  askSend: 'ask:send',
+  askStop: 'ask:stop',
+  askEvent: 'ask:event',
+  askThreads: 'ask:threads',
+  askMessages: 'ask:messages',
+  askDeleteThread: 'ask:deleteThread',
+  askOptions: 'ask:options',
+  askSetOptions: 'ask:setOptions'
 } as const
```

- [ ] **Step 2: Run the typecheck and see it fail**

```bash
npm run typecheck
```

Expected: FAIL. One error, TS2740 at `src/preload/index.ts(125,3)`: the `ask` object lacks the new members of `Api`.

- [ ] **Step 3: The preload follows, and the checks use the shared flag**

Modify `src/preload/index.ts`:

```diff
diff --git a/src/preload/index.ts b/src/preload/index.ts
index d191b8d..63340ee 100644
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -1,5 +1,6 @@
 import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
 import { IPC, type Api } from '@shared/ipc'
+import type { AskEvent } from '@shared/ask'
 import type { SuggestEvent, SyncLogEntry, UpdateState } from '@shared/types'
 
 const api: Api = {
@@ -129,7 +130,31 @@ const api: Api = {
       resetToken: () => ipcRenderer.invoke(IPC.askMcpResetToken),
       addToClaudeDesktop: () => ipcRenderer.invoke(IPC.askMcpAddToClaudeDesktop),
       copy: (kind) => ipcRenderer.invoke(IPC.askMcpCopy, kind)
-    }
+    },
+    providers: {
+      list: () => ipcRenderer.invoke(IPC.askProviders),
+      save: (input) => ipcRenderer.invoke(IPC.askSaveProvider, input),
+      remove: (id) => ipcRenderer.invoke(IPC.askRemoveProvider, id),
+      activate: (id) => ipcRenderer.invoke(IPC.askActivateProvider, id),
+      models: (input) => ipcRenderer.invoke(IPC.askModels, input),
+      detect: () => ipcRenderer.invoke(IPC.askDetect),
+      test: (id) => ipcRenderer.invoke(IPC.askTest, id),
+      openDashboard: (id) => ipcRenderer.invoke(IPC.askOpenDashboard, id)
+    },
+    send: (threadId, question) => ipcRenderer.invoke(IPC.askSend, threadId, question),
+    stop: () => ipcRenderer.invoke(IPC.askStop),
+    onEvent: (listener) => {
+      const handler = (_e: IpcRendererEvent, event: AskEvent): void => listener(event)
+      ipcRenderer.on(IPC.askEvent, handler)
+      return () => {
+        ipcRenderer.removeListener(IPC.askEvent, handler)
+      }
+    },
+    threads: () => ipcRenderer.invoke(IPC.askThreads),
+    messages: (threadId) => ipcRenderer.invoke(IPC.askMessages, threadId),
+    deleteThread: (id) => ipcRenderer.invoke(IPC.askDeleteThread, id),
+    options: () => ipcRenderer.invoke(IPC.askOptions),
+    setOptions: (options) => ipcRenderer.invoke(IPC.askSetOptions, options)
   }
 }
 
```

Modify `src/main/analyst/checks.ts`:

```diff
diff --git a/src/main/analyst/checks.ts b/src/main/analyst/checks.ts
index 822a01d..6a12845 100644
--- a/src/main/analyst/checks.ts
+++ b/src/main/analyst/checks.ts
@@ -1,4 +1,4 @@
-import type { StatsCard, ToolResult } from '@shared/ask'
+import type { AskFlag, StatsCard, ToolResult } from '@shared/ask'
 import type { MetricInfo } from '@shared/stats/types'
 import { fmt } from './format'
 
@@ -12,14 +12,7 @@ import { fmt } from './format'
  *   base   — a split's value given without the overall line;
  *   causal — "because", "due to" … (soft: underlined, not blocked).
  */
-export interface AnswerCheck {
-  kind: 'number' | 'sample' | 'base' | 'causal'
-  /** The words it is about, and where they are in the answer. */
-  text: string
-  at: [number, number]
-  message: string
-  severity: 'flag' | 'soft'
-}
+export type AnswerCheck = AskFlag
 
 /** A number as written; a sign only where it cannot be a hyphen ("2019-2024", "won 31-17"). */
 const NUMBER = /(?:(?<![\w.])[-−+])?\d[\d,]*(?:\.\d+)?%?/g
```

- [ ] **Step 4: Run the typecheck and see it pass**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/shared/ask.ts src/shared/ipc.ts src/preload/index.ts src/main/analyst/checks.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/shared/ask.ts src/shared/ipc.ts src/preload/index.ts src/main/analyst/checks.ts
git commit -m "feat(ask): shared types and IPC for the loop"
```

Expected: typecheck and lint clean; the suite at 1,315 passed, 7 skipped (a clean checkout).

---

### Task 2: Storage (spec §5.3, §6.2; amendment I)

Threads, their messages and the providers in `companion.db`, and the key store over `safeStorage`. Tests use a fake `safeStorage`: `tests/main/db/askRepos.test.ts`.

**Files:**

- Create: `src/main/db/migrations/013_ask_threads.sql`, `src/main/db/repos/askProviders.ts`, `src/main/db/repos/askThreads.ts`, `src/main/analyst/keys.ts`, `tests/main/db/askRepos.test.ts`
- Modify: `src/main/db/migrations/index.ts`, `tests/main/db/migrate.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/db/askRepos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AskMessage, ProviderInput } from '@shared/ask'
import { type Db, openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  activateAskProvider,
  activeAskProvider,
  deleteAskProvider,
  getAskProviderKey,
  listAskProviders,
  saveAskProvider
} from '@main/db/repos/askProviders'
import {
  addAskMessage,
  createAskThread,
  deleteAskThread,
  listAskMessages,
  listAskThreads,
  listAskTurns
} from '@main/db/repos/askThreads'
import { NO_KEY_STORE, safeStorageKeys } from '@main/analyst/keys'

function db(): Db {
  const d = openDatabase(':memory:')
  migrate(d)
  return d
}

const OLLAMA: Omit<ProviderInput, 'key'> = {
  kind: 'ollama',
  preset: null,
  label: 'Ollama',
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:4b',
  profile: 'compact',
  mode: 'structured',
  reasoning: 'off'
}

const message = (threadId: number, at: string): Omit<AskMessage, 'id'> => ({
  threadId,
  role: 'assistant',
  text: 'Puka Nacua leads.',
  calls: [{ tool: 'leaderboard', args: { metric: 'yprr' } }],
  results: [],
  flags: [],
  outcome: 'answer',
  model: 'qwen3:4b',
  tokens: { input: 900, output: 40 },
  ms: 2100,
  createdAt: at
})

describe('ask threads', () => {
  it('keeps messages in order and marks the thread used', () => {
    const d = db()
    const a = createAskThread(d, 'YPRR leaders', '2026-11-03T10:00:00Z')
    const b = createAskThread(d, 'Bijan vs man', '2026-11-03T11:00:00Z')
    addAskMessage(d, message(a.id, '2026-11-03T12:00:00Z'))
    expect(listAskThreads(d).map((t) => t.id)).toEqual([a.id, b.id])
    const [m] = listAskMessages(d, a.id)
    expect(m.calls).toEqual([{ tool: 'leaderboard', args: { metric: 'yprr' } }])
    expect(m.tokens).toEqual({ input: 900, output: 40 })
  })

  it('keeps the provider transcript and state for the loop only', () => {
    const d = db()
    const t = createAskThread(d, 'q', '2026-11-03T10:00:00Z')
    addAskMessage(d, message(t.id, '2026-11-03T10:00:01Z'), {
      providerId: 4,
      transcript: [{ role: 'assistant', content: [{ type: 'thinking', thinking: '' }] }],
      state: { last: { tool: 'leaderboard' } }
    })
    const [{ message: m, turn }] = listAskTurns(d, t.id)
    expect(Object.keys(m)).not.toContain('transcript')
    expect(turn.providerId).toBe(4)
    expect(turn.transcript).toHaveLength(1)
    expect(turn.state).toEqual({ last: { tool: 'leaderboard' } })
  })

  it('deletes a thread with its messages', () => {
    const d = db()
    const t = createAskThread(d, 'q', '2026-11-03T10:00:00Z')
    addAskMessage(d, message(t.id, '2026-11-03T10:00:01Z'))
    deleteAskThread(d, t.id)
    expect(listAskThreads(d)).toEqual([])
    expect(listAskMessages(d, t.id)).toEqual([])
  })
})

describe('ask providers', () => {
  it('makes the first provider active and never returns the key', () => {
    const d = db()
    const p = saveAskProvider(d, OLLAMA, undefined)
    const q = saveAskProvider(
      d,
      { ...OLLAMA, kind: 'openai', preset: 'groq', label: 'Groq', model: 'm' },
      new Uint8Array([1, 2, 3])
    )
    expect(p.active).toBe(true)
    expect(q.active).toBe(false)
    expect(q.hasKey).toBe(true)
    expect(JSON.stringify(listAskProviders(d))).not.toContain('key_cipher')
    expect(getAskProviderKey(d, q.id)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('keeps, replaces or removes a key on save', () => {
    const d = db()
    const p = saveAskProvider(d, OLLAMA, new Uint8Array([9]))
    expect(saveAskProvider(d, { ...OLLAMA, id: p.id, model: 'gemma3:4b' }, undefined).hasKey).toBe(
      true
    )
    expect(saveAskProvider(d, { ...OLLAMA, id: p.id }, null).hasKey).toBe(false)
    expect(getAskProviderKey(d, p.id)).toBeNull()
  })

  it('moves the active mark, and hands it on when the active one is removed', () => {
    const d = db()
    const p = saveAskProvider(d, OLLAMA, undefined)
    const q = saveAskProvider(d, { ...OLLAMA, label: 'Other' }, undefined)
    activateAskProvider(d, q.id)
    expect(activeAskProvider(d)?.id).toBe(q.id)
    deleteAskProvider(d, q.id)
    expect(activeAskProvider(d)?.id).toBe(p.id)
  })
})

describe('the key store', () => {
  const fake = (on: boolean): Parameters<typeof safeStorageKeys>[0] => ({
    isEncryptionAvailable: () => on,
    encryptString: (t: string) => Buffer.from(`enc:${t}`),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  })

  it('round-trips a key through safeStorage', () => {
    const keys = safeStorageKeys(fake(true))
    const cipher = keys.encrypt('sk-test')
    expect(Buffer.from(cipher).toString()).not.toBe('sk-test')
    expect(keys.decrypt(cipher)).toBe('sk-test')
  })

  it('refuses to store a key without encryption', () => {
    expect(() => safeStorageKeys(fake(false)).encrypt('sk-test')).toThrow(NO_KEY_STORE)
  })
})
```

Modify `tests/main/db/migrate.test.ts`:

```diff
diff --git a/tests/main/db/migrate.test.ts b/tests/main/db/migrate.test.ts
index 54aca6b..9a89f93 100644
--- a/tests/main/db/migrate.test.ts
+++ b/tests/main/db/migrate.test.ts
@@ -12,7 +12,7 @@ describe('migrate', () => {
         name: string
       }[]
     ).map((r) => r.name)
-    expect(version).toBe(12)
+    expect(version).toBe(13)
     expect(tables).toEqual(
       expect.arrayContaining([
         'app_settings',
@@ -40,6 +40,9 @@ describe('migrate', () => {
         'sleeper_week_stats',
         'stats_views',
         'ask_examples',
+        'ask_threads',
+        'ask_messages',
+        'ask_providers',
         'schema_version'
       ])
     )
@@ -50,7 +53,7 @@ describe('migrate', () => {
     migrate(db)
     expect(() => migrate(db)).not.toThrow()
     const row = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }
-    expect(row.n).toBe(12)
+    expect(row.n).toBe(13)
   })
 
   it('005 adds crosswalk.fantasypros_id and forgets the crosswalk step so it is re-downloaded', () => {
@@ -72,7 +75,7 @@ describe('migrate', () => {
        VALUES ('nflverse:crosswalk', 't', 't', 'ok', NULL, 10), ('nflverse:games', 't', 't', 'ok', NULL, 1)`
     ).run()
 
-    expect(migrate(db)).toBe(12)
+    expect(migrate(db)).toBe(13)
     const columns = (db.prepare('PRAGMA table_info(crosswalk)').all() as { name: string }[]).map(
       (c) => c.name
     )
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/db/askRepos.test.ts tests/main/db/migrate.test.ts
```

Expected: FAIL. `askRepos.test.ts` cannot find `@main/db/repos/askProviders`, and `migrate.test.ts` has 3 failures: `expected 12 to be 13`.

- [ ] **Step 3: The migration, the repos and the key store**

Create `src/main/db/migrations/013_ask_threads.sql`:

```sql
-- Ask spec §5.3, §6.2 (Plan AG1): threads and their messages, and the model providers.
-- A message keeps its tool calls and results (the screen's cards) and, for the provider that
-- wrote it, the provider's own transcript of the turn, so a follow-up resends it unchanged.
CREATE TABLE ask_threads (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ask_messages (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES ask_threads (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL,
  calls_json TEXT NOT NULL DEFAULT '[]',
  results_json TEXT NOT NULL DEFAULT '[]',
  flags_json TEXT NOT NULL DEFAULT '[]',
  outcome TEXT,
  model TEXT,
  provider_id INTEGER,
  transcript_json TEXT,
  state_json TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX ask_messages_thread ON ask_messages (thread_id, id);

-- A key is stored as safeStorage ciphertext (DPAPI on Windows), never as text.
CREATE TABLE ask_providers (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('anthropic', 'openai', 'ollama', 'lmstudio')),
  preset TEXT,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  profile TEXT NOT NULL CHECK (profile IN ('full', 'compact')),
  mode TEXT NOT NULL CHECK (mode IN ('native', 'structured')),
  reasoning TEXT NOT NULL CHECK (reasoning IN ('off', 'low', 'high')),
  key_cipher BLOB,
  active INTEGER NOT NULL DEFAULT 0
);
```

Modify `src/main/db/migrations/index.ts`:

```diff
diff --git a/src/main/db/migrations/index.ts b/src/main/db/migrations/index.ts
index 4ff1bd0..16a14b6 100644
--- a/src/main/db/migrations/index.ts
+++ b/src/main/db/migrations/index.ts
@@ -10,6 +10,7 @@ import waiversSql from './009_waivers.sql?raw'
 import sleeperStatsSql from './010_sleeper_stats.sql?raw'
 import statsViewsSql from './011_stats_views.sql?raw'
 import askExamplesSql from './012_ask_examples.sql?raw'
+import askThreadsSql from './013_ask_threads.sql?raw'
 
 export interface Migration {
   version: number
@@ -29,5 +30,6 @@ export const migrations: Migration[] = [
   { version: 9, name: 'waivers', sql: waiversSql },
   { version: 10, name: 'sleeper_stats', sql: sleeperStatsSql },
   { version: 11, name: 'stats_views', sql: statsViewsSql },
-  { version: 12, name: 'ask_examples', sql: askExamplesSql }
+  { version: 12, name: 'ask_examples', sql: askExamplesSql },
+  { version: 13, name: 'ask_threads', sql: askThreadsSql }
 ]
```

Create `src/main/db/repos/askProviders.ts`:

```ts
import type { ProviderInput, ProviderSettings } from '@shared/ask'
import type { Db } from '../connection'

/**
 * Ask spec §6.2: the model providers (`ask_providers`). A key is stored as ciphertext from the key
 * store (Plan AG1, amendment I); `ProviderSettings` only says whether there is one.
 */
interface ProviderRow {
  id: number
  kind: ProviderSettings['kind']
  preset: ProviderSettings['preset']
  label: string
  base_url: string
  model: string
  profile: ProviderSettings['profile']
  mode: ProviderSettings['mode']
  reasoning: ProviderSettings['reasoning']
  key_cipher: Uint8Array | null
  active: number
}

const settings = (r: ProviderRow): ProviderSettings => ({
  id: r.id,
  kind: r.kind,
  preset: r.preset,
  label: r.label,
  baseUrl: r.base_url,
  model: r.model,
  profile: r.profile,
  mode: r.mode,
  reasoning: r.reasoning,
  hasKey: r.key_cipher !== null && r.key_cipher.length > 0,
  active: r.active === 1
})

export function listAskProviders(db: Db): ProviderSettings[] {
  const rows = db
    .prepare('SELECT * FROM ask_providers ORDER BY id')
    .all() as unknown as ProviderRow[]
  return rows.map(settings)
}

export function getAskProvider(db: Db, id: number): ProviderSettings | null {
  const r = db.prepare('SELECT * FROM ask_providers WHERE id = ?').get(id) as unknown as
    ProviderRow | undefined
  return r ? settings(r) : null
}

/** The provider's key as stored (ciphertext), or null. */
export function getAskProviderKey(db: Db, id: number): Uint8Array | null {
  const r = db.prepare('SELECT key_cipher FROM ask_providers WHERE id = ?').get(id) as unknown as
    { key_cipher: Uint8Array | null } | undefined
  return r?.key_cipher && r.key_cipher.length > 0 ? r.key_cipher : null
}

/**
 * Adds a provider (no `id`) or changes one. `cipher` is the new key's ciphertext, `null` removes the
 * key, `undefined` keeps it. The first provider becomes the active one.
 */
export function saveAskProvider(
  db: Db,
  p: Omit<ProviderInput, 'key'> & { id?: number },
  cipher: Uint8Array | null | undefined
): ProviderSettings {
  if (p.id === undefined) {
    const first =
      (db.prepare('SELECT COUNT(*) AS n FROM ask_providers').get() as { n: number }).n === 0
    const r = db
      .prepare(
        `INSERT INTO ask_providers (kind, preset, label, base_url, model, profile, mode, reasoning, key_cipher, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        p.kind,
        p.preset,
        p.label,
        p.baseUrl,
        p.model,
        p.profile,
        p.mode,
        p.reasoning,
        cipher ?? null,
        first ? 1 : 0
      ) as unknown as ProviderRow
    return settings(r)
  }
  db.prepare(
    `UPDATE ask_providers SET kind = ?, preset = ?, label = ?, base_url = ?, model = ?, profile = ?,
       mode = ?, reasoning = ? WHERE id = ?`
  ).run(p.kind, p.preset, p.label, p.baseUrl, p.model, p.profile, p.mode, p.reasoning, p.id)
  if (cipher !== undefined)
    db.prepare('UPDATE ask_providers SET key_cipher = ? WHERE id = ?').run(cipher, p.id)
  const saved = getAskProvider(db, p.id)
  if (!saved) throw new Error(`there is no provider ${p.id}`)
  return saved
}

/** Makes one provider the active one. */
export function activateAskProvider(db: Db, id: number): void {
  db.prepare('UPDATE ask_providers SET active = CASE WHEN id = ? THEN 1 ELSE 0 END').run(id)
}

/** Removes a provider; when it was active, the first one left takes over. */
export function deleteAskProvider(db: Db, id: number): void {
  db.prepare('DELETE FROM ask_providers WHERE id = ?').run(id)
  const active = db.prepare('SELECT id FROM ask_providers WHERE active = 1').get()
  if (!active)
    db.prepare(
      'UPDATE ask_providers SET active = 1 WHERE id = (SELECT MIN(id) FROM ask_providers)'
    ).run()
}

export function activeAskProvider(db: Db): ProviderSettings | null {
  const r = db.prepare('SELECT * FROM ask_providers WHERE active = 1').get() as unknown as
    ProviderRow | undefined
  return r ? settings(r) : null
}
```

Create `src/main/db/repos/askThreads.ts`:

```ts
import type { AskCall, AskFlag, AskMessage, AskThread, ToolOutcome } from '@shared/ask'
import type { Db } from '../connection'

/**
 * Ask spec §5.3: threads and their messages (`ask_threads`, `ask_messages`), kept until deleted.
 * An assistant message also keeps the provider's own transcript of its turn and the follow-up state
 * (Plan AG1, amendment G); neither reaches the renderer.
 */
export interface StoredTurn {
  /** The provider that wrote `transcript`; another provider reads the thread as text. */
  providerId: number | null
  transcript: unknown[] | null
  state: unknown
}

interface ThreadRow {
  id: number
  title: string
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: number
  thread_id: number
  role: 'user' | 'assistant'
  text: string
  calls_json: string
  results_json: string
  flags_json: string
  outcome: AskMessage['outcome']
  model: string | null
  provider_id: number | null
  transcript_json: string | null
  state_json: string | null
  input_tokens: number | null
  output_tokens: number | null
  ms: number | null
  created_at: string
}

const thread = (r: ThreadRow): AskThread => ({
  id: r.id,
  title: r.title,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

/** A JSON column, or its fallback when it does not parse. */
function parsed<T>(json: string | null, fallback: T): T {
  if (json === null) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

const message = (r: MessageRow): AskMessage => ({
  id: r.id,
  threadId: r.thread_id,
  role: r.role,
  text: r.text,
  calls: parsed<AskCall[]>(r.calls_json, []),
  results: parsed<ToolOutcome[]>(r.results_json, []),
  flags: parsed<AskFlag[]>(r.flags_json, []),
  outcome: r.outcome,
  model: r.model,
  tokens:
    r.input_tokens === null || r.output_tokens === null
      ? null
      : { input: r.input_tokens, output: r.output_tokens },
  ms: r.ms,
  createdAt: r.created_at
})

export function createAskThread(db: Db, title: string, at: string): AskThread {
  const r = db
    .prepare('INSERT INTO ask_threads (title, created_at, updated_at) VALUES (?, ?, ?) RETURNING *')
    .get(title, at, at) as unknown as ThreadRow
  return thread(r)
}

/** Every thread, most recently used first. */
export function listAskThreads(db: Db): AskThread[] {
  const rows = db
    .prepare('SELECT * FROM ask_threads ORDER BY updated_at DESC, id DESC')
    .all() as unknown as ThreadRow[]
  return rows.map(thread)
}

export function getAskThread(db: Db, id: number): AskThread | null {
  const r = db.prepare('SELECT * FROM ask_threads WHERE id = ?').get(id) as unknown as
    ThreadRow | undefined
  return r ? thread(r) : null
}

/** Deletes a thread and its messages. */
export function deleteAskThread(db: Db, id: number): void {
  db.prepare('DELETE FROM ask_threads WHERE id = ?').run(id)
}

/** Adds a message and marks its thread used. */
export function addAskMessage(
  db: Db,
  m: Omit<AskMessage, 'id'>,
  turn: StoredTurn = { providerId: null, transcript: null, state: null }
): AskMessage {
  const r = db
    .prepare(
      `INSERT INTO ask_messages (thread_id, role, text, calls_json, results_json, flags_json, outcome,
         model, provider_id, transcript_json, state_json, input_tokens, output_tokens, ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .get(
      m.threadId,
      m.role,
      m.text,
      JSON.stringify(m.calls),
      JSON.stringify(m.results),
      JSON.stringify(m.flags),
      m.outcome,
      m.model,
      turn.providerId,
      turn.transcript === null ? null : JSON.stringify(turn.transcript),
      turn.state === null || turn.state === undefined ? null : JSON.stringify(turn.state),
      m.tokens?.input ?? null,
      m.tokens?.output ?? null,
      m.ms,
      m.createdAt
    ) as unknown as MessageRow
  db.prepare('UPDATE ask_threads SET updated_at = ? WHERE id = ?').run(m.createdAt, m.threadId)
  return message(r)
}

/** A thread's messages, oldest first. */
export function listAskMessages(db: Db, threadId: number): AskMessage[] {
  const rows = db
    .prepare('SELECT * FROM ask_messages WHERE thread_id = ? ORDER BY id')
    .all(threadId) as unknown as MessageRow[]
  return rows.map(message)
}

/** The thread's messages with what main keeps of each turn: for the loop, never the renderer. */
export function listAskTurns(
  db: Db,
  threadId: number
): { message: AskMessage; turn: StoredTurn }[] {
  const rows = db
    .prepare('SELECT * FROM ask_messages WHERE thread_id = ? ORDER BY id')
    .all(threadId) as unknown as MessageRow[]
  return rows.map((r) => ({
    message: message(r),
    turn: {
      providerId: r.provider_id,
      transcript: parsed<unknown[] | null>(r.transcript_json, null),
      state: parsed<unknown>(r.state_json, null)
    }
  }))
}
```

Create `src/main/analyst/keys.ts`:

```ts
/**
 * API keys at rest (Ask spec §6.2, Plan AG1 amendment I): Electron's `safeStorage` (DPAPI on
 * Windows). A key is encrypted before it reaches `companion.db` and decrypted only to make a
 * request; it never goes to the renderer, a trace or a log. Without `safeStorage` (some Linux
 * setups) no key is stored, and the app says so.
 */
export interface KeyStore {
  available(): boolean
  encrypt(key: string): Uint8Array
  decrypt(cipher: Uint8Array): string
}

export const NO_KEY_STORE =
  'This computer cannot encrypt keys (no system keyring), so a key cannot be saved.'

/** The key store over Electron's `safeStorage`. */
export function safeStorageKeys(safe: {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(cipher: Buffer): string
}): KeyStore {
  return {
    available: () => safe.isEncryptionAvailable(),
    encrypt: (key) => {
      if (!safe.isEncryptionAvailable()) throw new Error(NO_KEY_STORE)
      return new Uint8Array(safe.encryptString(key))
    },
    decrypt: (cipher) => safe.decryptString(Buffer.from(cipher))
  }
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/db/askRepos.test.ts tests/main/db/migrate.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/db/migrations/index.ts src/main/db/repos/askProviders.ts src/main/db/repos/askThreads.ts src/main/analyst/keys.ts tests/main/db/askRepos.test.ts tests/main/db/migrate.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/db/migrations/index.ts src/main/db/repos/askProviders.ts src/main/db/repos/askThreads.ts src/main/analyst/keys.ts tests/main/db/askRepos.test.ts tests/main/db/migrate.test.ts src/main/db/migrations/013_ask_threads.sql
git commit -m "feat(ask): threads, providers and keys"
```

Expected: typecheck and lint clean; the suite at 1,323 passed, 7 skipped (a clean checkout).

---

### Task 3: OpenAI-compatible adapter and presets (spec §6.2)

The neutral conversation every adapter speaks (`providers/types.ts`), the first adapter over `fetch`, and the presets the Model section will show. `strictCompatible` decides whether a schema is sent with `strict: true`. The tests use hand-written streams, split into 7-byte chunks so the parser sees partial lines (Open point 7).

**Files:**

- Create: `src/shared/askPresets.ts`, `src/main/analyst/providers/types.ts`, `src/main/analyst/providers/openaiCompatible.ts`, `tests/main/analyst/providers.test.ts`
- Modify: `src/main/analyst/schema.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/analyst/providers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { openAiCompatible } from '@main/analyst/providers/openaiCompatible'
import { type ChatRequest, ProviderError } from '@main/analyst/providers/types'

/** A fake fetch: records each request and answers with `reply(url, body)`. */
function fakeFetch(reply: (url: string, body: Record<string, unknown> | null) => Response): {
  fetch: typeof fetch
  calls: { url: string; body: Record<string, unknown> | null; headers: Headers }[]
} {
  const calls: { url: string; body: Record<string, unknown> | null; headers: Headers }[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const raw = init?.body ?? (input instanceof Request ? await input.text() : null)
    const body =
      typeof raw === 'string' && raw ? (JSON.parse(raw) as Record<string, unknown>) : null
    calls.push({ url, body, headers: new Headers(init?.headers ?? (input as Request).headers) })
    return reply(url, body)
  }) as typeof fetch
  return { fetch: f, calls }
}

/** A streamed body, split into small chunks so parsers see partial lines. */
function stream(text: string, contentType = 'text/event-stream'): Response {
  const bytes = new TextEncoder().encode(text)
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7))
      c.close()
    }
  })
  return new Response(body, { status: 200, headers: { 'content-type': contentType } })
}

const sse = (events: unknown[]): string =>
  events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')

const REQUEST: ChatRequest = {
  system: 'You are the analyst.',
  messages: [{ role: 'user', text: 'Who leads WRs in YPRR?' }],
  tools: [
    {
      name: 'leaderboard',
      description: 'Rank players.',
      schema: { type: 'object', properties: { metric: { type: 'string' } } }
    }
  ],
  maxTokens: 800,
  reasoning: 'off'
}

const signal = (): AbortSignal => new AbortController().signal

/** A schema strict structured output accepts. */
const CLOSED = {
  type: 'object' as const,
  properties: { thought: { type: 'string' as const } },
  required: ['thought'],
  additionalProperties: false
}

describe('the OpenAI-compatible adapter', () => {
  it('assembles a tool call streamed across chunks', async () => {
    const f = fakeFetch(() =>
      stream(
        sse([
          {
            choices: [
              { delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'leader' } }] } }
            ]
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { name: 'board', arguments: '{"met' } }]
                }
              }
            ]
          },
          {
            choices: [
              {
                delta: { tool_calls: [{ index: 0, function: { arguments: 'ric":"yprr"}' } }] },
                finish_reason: 'tool_calls'
              }
            ]
          },
          { choices: [], usage: { prompt_tokens: 1200, completion_tokens: 18 } }
        ]) + 'data: [DONE]\n\n'
      )
    )
    const p = openAiCompatible({
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1/',
      model: 'm',
      key: 'gsk',
      reasoning: false,
      fetch: f.fetch
    })
    const reply = await p.chat(REQUEST, signal())
    expect(reply.calls).toEqual([{ id: 'c1', name: 'leaderboard', args: { metric: 'yprr' } }])
    expect(reply.stop).toBe('tool')
    expect(reply.usage).toEqual({ input: 1200, output: 18 })
    expect(f.calls[0].url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(f.calls[0].headers.get('authorization')).toBe('Bearer gsk')
    expect(f.calls[0].body?.messages).toEqual([
      { role: 'system', content: 'You are the analyst.' },
      { role: 'user', content: 'Who leads WRs in YPRR?' }
    ])
    expect(f.calls[0].body).not.toHaveProperty('reasoning_effort')
  })

  it('streams text and asks for a JSON schema in structured mode', async () => {
    const f = fakeFetch(() =>
      stream(
        sse([
          { choices: [{ delta: { content: '{"thought":"' } }] },
          { choices: [{ delta: { content: 'x"}' }, finish_reason: 'stop' }] }
        ])
      )
    )
    const deltas: string[] = []
    const p = openAiCompatible({
      name: 'LM Studio',
      baseUrl: 'http://localhost:1234/v1',
      model: 'm',
      key: null,
      reasoning: true,
      fetch: f.fetch
    })
    const reply = await p.chat(
      { ...REQUEST, tools: undefined, json: { name: 'call', schema: CLOSED }, reasoning: 'low' },
      signal(),
      (d) => deltas.push(d)
    )
    expect(reply.text).toBe('{"thought":"x"}')
    expect(deltas.join('')).toBe(reply.text)
    expect(f.calls[0].body?.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'call', schema: CLOSED, strict: true }
    })
    expect(f.calls[0].body?.reasoning_effort).toBe('low')
    expect(f.calls[0].headers.get('authorization')).toBeNull()
  })

  it('sends tool results back in the conversation', async () => {
    const f = fakeFetch(() =>
      stream(sse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]))
    )
    const p = openAiCompatible({
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'm',
      key: 'k',
      reasoning: false,
      fetch: f.fetch
    })
    await p.chat(
      {
        ...REQUEST,
        messages: [
          ...REQUEST.messages,
          {
            role: 'assistant',
            text: '',
            calls: [{ id: 'c1', name: 'leaderboard', args: { metric: 'yprr' } }]
          },
          {
            role: 'tool',
            results: [{ id: 'c1', name: 'leaderboard', text: '1. Puka Nacua 3.10', error: false }]
          }
        ]
      },
      signal()
    )
    expect((f.calls[0].body?.messages as unknown[]).slice(2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'leaderboard', arguments: '{"metric":"yprr"}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'c1', content: '1. Puka Nacua 3.10' }
    ])
  })

  it('turns a 401 and a 429 into readable errors', async () => {
    const make = (status: number): ReturnType<typeof openAiCompatible> =>
      openAiCompatible({
        name: 'Groq',
        baseUrl: 'https://x',
        model: 'm',
        key: 'k',
        reasoning: false,
        fetch: fakeFetch(
          () =>
            new Response(JSON.stringify({ error: { message: 'nope' } }), {
              status,
              headers: { 'retry-after': '20' }
            })
        ).fetch
      })
    await expect(make(401).chat(REQUEST, signal())).rejects.toMatchObject({ kind: 'auth' })
    await expect(make(429).chat(REQUEST, signal())).rejects.toMatchObject({
      kind: 'rate',
      retryAfter: 20
    })
  })

  it('says when the server is not running', async () => {
    const f = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const p = openAiCompatible({
      name: 'LM Studio',
      baseUrl: 'http://localhost:1234/v1',
      model: 'm',
      key: null,
      reasoning: false,
      fetch: f
    })
    const err = await p.chat(REQUEST, signal()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect((err as ProviderError).kind).toBe('unreachable')
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/providers.test.ts
```

Expected: FAIL. Cannot find package '@main/analyst/providers/openaiCompatible'; no tests run.

- [ ] **Step 3: The types, the adapter, the presets**

Create `src/main/analyst/providers/types.ts`:

```ts
import type { ModelInfo, Reasoning } from '@shared/ask'
import type { Schema } from '../schema'

/**
 * One interface for every model the loop can call (Ask spec §6.2): Anthropic, an OpenAI-compatible
 * service, or a local server. The loop speaks this neutral conversation; each adapter maps it to its
 * API and back.
 */
export interface ToolSpec {
  name: string
  description: string
  schema: Schema
}

export interface ToolCall {
  id: string
  name: string
  /** Parsed arguments; a string when the model's JSON did not parse. */
  args: unknown
}

export interface ToolReply {
  id: string
  name: string
  text: string
  error: boolean
}

export type ChatMessage =
  | { role: 'user'; text: string }
  | {
      role: 'assistant'
      text: string
      calls: ToolCall[]
      /**
       * The provider's own content for this turn, sent back unchanged by the same provider
       * (Anthropic's thinking blocks must be: preserved thinking). `by` names who wrote it.
       */
      native?: { by: string; content: unknown }
    }
  | { role: 'tool'; results: ToolReply[] }

export interface ChatRequest {
  system: string
  messages: ChatMessage[]
  /** Native tool calling. */
  tools?: ToolSpec[]
  /** Structured mode: the reply is one JSON object following this schema (spec §5.2). */
  json?: { name: string; schema: Schema }
  /** The output cap for this call (spec §5.1). */
  maxTokens: number
  reasoning: Reasoning
}

export type StopReason = 'end' | 'tool' | 'length' | 'refusal'

export interface ChatReply {
  text: string
  calls: ToolCall[]
  usage: { input: number; output: number }
  stop: StopReason
  /** For the next request of the same conversation (see `ChatMessage.native`). */
  native?: { by: string; content: unknown }
}

export interface Provider {
  /** "Anthropic · claude-opus-5-5", for the answer's model chip and traces. */
  readonly label: string
  readonly model: string
  chat(
    request: ChatRequest,
    signal: AbortSignal,
    onText?: (delta: string) => void
  ): Promise<ChatReply>
  /** The models it offers, for the Model section. */
  models(signal: AbortSignal): Promise<ModelInfo[]>
}

/** A failure the user can act on: a bad key, a rate limit, a server that is not running. */
export type ProviderErrorKind = 'auth' | 'rate' | 'unreachable' | 'server' | 'request' | 'refusal'

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly retryAfter: number | null = null
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

/** The arguments as JSON, or the raw text when they do not parse (the loop teaches the fix). */
export function parseArgs(raw: string): unknown {
  if (raw.trim() === '') return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

/** An HTTP status as a provider error, with the server's own message when it gave one. */
export function httpError(
  who: string,
  status: number,
  body: string,
  retryAfter: string | null
): ProviderError {
  let detail = body.slice(0, 300)
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    detail = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? detail
  } catch {
    // not JSON: keep the text
  }
  const wait = retryAfter && Number.isFinite(Number(retryAfter)) ? Number(retryAfter) : null
  if (status === 401 || status === 403)
    return new ProviderError('auth', `${who} refused the key (${status}): ${detail}`)
  if (status === 429)
    return new ProviderError(
      'rate',
      `${who} is rate limiting this key${wait ? `; try again in ${wait} s` : ''}: ${detail}`,
      wait
    )
  if (status >= 500)
    return new ProviderError('server', `${who} had an error (${status}): ${detail}`)
  return new ProviderError('request', `${who} rejected the request (${status}): ${detail}`)
}

/** A fetch that failed before any answer: the server is not running, or there is no network. */
export function unreachable(who: string, url: string, err: unknown): ProviderError {
  if (err instanceof Error && err.name === 'AbortError') throw err
  return new ProviderError(
    'unreachable',
    `${who} did not answer at ${url}: ${err instanceof Error ? err.message : String(err)}`
  )
}

/** Splits a fetch body into lines as they arrive (SSE and NDJSON). */
export async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    let at = buffer.indexOf('\n')
    while (at >= 0) {
      yield buffer.slice(0, at).replace(/\r$/, '')
      buffer = buffer.slice(at + 1)
      at = buffer.indexOf('\n')
    }
  }
  buffer += decoder.decode()
  if (buffer.length > 0) yield buffer
}

export type Fetch = typeof fetch

/**
 * The answer without the model's reasoning. Some local models reason in the text even with
 * reasoning off (a thinking-only model, such as Ollama's `qwen3:4b` today): everything up to the
 * last `</think>` is reasoning, and so is a `<think>` block.
 */
export function stripThinking(text: string): string {
  const end = text.lastIndexOf('</think>')
  const after = end >= 0 ? text.slice(end + '</think>'.length) : text
  return after.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()
}
```

Modify `src/main/analyst/schema.ts`:

```diff
diff --git a/src/main/analyst/schema.ts b/src/main/analyst/schema.ts
index c109f4c..5639c10 100644
--- a/src/main/analyst/schema.ts
+++ b/src/main/analyst/schema.ts
@@ -85,3 +85,18 @@ export function check(schema: Schema, value: unknown, path = 'arguments'): strin
       return null
   }
 }
+
+/**
+ * The schema fits strict structured output (OpenAI's `strict: true`): every object closes its
+ * properties and requires all of them. Other schemas are sent without `strict`.
+ */
+export function strictCompatible(schema: Schema): boolean {
+  if (schema.type === 'object') {
+    const keys = Object.keys(schema.properties ?? {})
+    if (schema.additionalProperties !== false || keys.length === 0) return false
+    if (!keys.every((k) => schema.required?.includes(k))) return false
+    return keys.every((k) => strictCompatible(schema.properties![k]))
+  }
+  if (schema.type === 'array') return schema.items ? strictCompatible(schema.items) : false
+  return true
+}
```

Create `src/main/analyst/providers/openaiCompatible.ts`:

```ts
import type { ModelInfo } from '@shared/ask'
import { strictCompatible } from '../schema'
import {
  type ChatMessage,
  type ChatReply,
  type ChatRequest,
  type Fetch,
  httpError,
  lines,
  parseArgs,
  type Provider,
  ProviderError,
  type StopReason,
  stripThinking,
  type ToolCall,
  unreachable
} from './types'

/**
 * Any OpenAI-compatible chat API (Ask spec §6.2): OpenAI, Gemini, Groq, OpenRouter, Mistral, a
 * custom base URL, and LM Studio on this PC. Plain `fetch` with server-sent events: text deltas,
 * tool calls assembled across chunks, `response_format: json_schema` for structured mode.
 */
export interface OpenAiOptions {
  /** "Groq", "LM Studio": for messages and the model chip. */
  name: string
  baseUrl: string
  model: string
  key: string | null
  /** The model reasons and takes `reasoning_effort` (known from the server, or the user's setting). */
  reasoning: boolean
  fetch?: Fetch
}

type WireMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: {
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }[]
    }
  | { role: 'tool'; tool_call_id: string; content: string }

function wire(system: string, messages: ChatMessage[]): WireMessage[] {
  const out: WireMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant')
      out.push({
        role: 'assistant',
        content: m.text === '' ? null : m.text,
        ...(m.calls.length > 0
          ? {
              tool_calls: m.calls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: {
                  name: c.name,
                  arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args)
                }
              }))
            }
          : {})
      })
    else for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.id, content: r.text })
  }
  return out
}

interface Chunk {
  choices?: {
    delta?: {
      content?: string | null
      tool_calls?: {
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }[]
    }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
  error?: { message?: string }
}

const STOPS: Record<string, StopReason> = {
  stop: 'end',
  tool_calls: 'tool',
  function_call: 'tool',
  length: 'length',
  content_filter: 'refusal'
}

const trimSlash = (url: string): string => url.replace(/\/+$/, '')

export function openAiCompatible(o: OpenAiOptions): Provider {
  const doFetch = o.fetch ?? fetch
  const base = trimSlash(o.baseUrl)
  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(o.key ? { Authorization: `Bearer ${o.key}` } : {})
  })

  async function chat(
    req: ChatRequest,
    signal: AbortSignal,
    onText?: (delta: string) => void
  ): Promise<ChatReply> {
    const body: Record<string, unknown> = {
      model: o.model,
      messages: wire(req.system, req.messages),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: req.maxTokens
    }
    if (req.tools && req.tools.length > 0)
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.schema }
      }))
    if (req.json)
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: req.json.name,
          schema: req.json.schema,
          ...(strictCompatible(req.json.schema) ? { strict: true } : {})
        }
      }
    if (o.reasoning && req.reasoning !== 'off') body.reasoning_effort = req.reasoning
    const url = `${base}/chat/completions`
    let res: Response
    try {
      res = await doFetch(url, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal
      })
    } catch (err) {
      throw unreachable(o.name, url, err)
    }
    if (!res.ok || !res.body)
      throw httpError(o.name, res.status, await res.text(), res.headers.get('retry-after'))

    let text = ''
    let stop: StopReason = 'end'
    const usage = { input: 0, output: 0 }
    const calls = new Map<number, { id: string; name: string; args: string }>()
    for await (const line of lines(res.body)) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') break
      let chunk: Chunk
      try {
        chunk = JSON.parse(data) as Chunk
      } catch {
        continue
      }
      if (chunk.error)
        throw new ProviderError('server', `${o.name}: ${chunk.error.message ?? data}`)
      for (const choice of chunk.choices ?? []) {
        const d = choice.delta
        if (d?.content) {
          text += d.content
          onText?.(d.content)
        }
        for (const t of d?.tool_calls ?? []) {
          const c = calls.get(t.index) ?? { id: '', name: '', args: '' }
          if (t.id) c.id = t.id
          if (t.function?.name) c.name += t.function.name
          if (t.function?.arguments) c.args += t.function.arguments
          calls.set(t.index, c)
        }
        if (choice.finish_reason) stop = STOPS[choice.finish_reason] ?? 'end'
      }
      if (chunk.usage) {
        usage.input = chunk.usage.prompt_tokens ?? usage.input
        usage.output = chunk.usage.completion_tokens ?? usage.output
      }
    }
    const toolCalls: ToolCall[] = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, c]) => ({ id: c.id || `call_${i}`, name: c.name, args: parseArgs(c.args) }))
    if (toolCalls.length > 0 && stop === 'end') stop = 'tool'
    return { text: stripThinking(text), calls: toolCalls, usage, stop }
  }

  async function models(signal: AbortSignal): Promise<ModelInfo[]> {
    const url = `${base}/models`
    let res: Response
    try {
      res = await doFetch(url, { headers: headers(), signal })
    } catch (err) {
      throw unreachable(o.name, url, err)
    }
    if (!res.ok)
      throw httpError(o.name, res.status, await res.text(), res.headers.get('retry-after'))
    const j = (await res.json()) as { data?: { id: string; context_length?: number }[] }
    return (j.data ?? [])
      .map((m) => ({ id: m.id, tools: true, thinking: false, context: m.context_length ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  return { label: `${o.name} · ${o.model}`, model: o.model, chat, models }
}
```

Create `src/shared/askPresets.ts`:

```ts
import type { ProviderPreset } from './ask'

/**
 * The OpenAI-compatible presets (Ask spec §6.2, §14 point 4). Free tiers change their limits and
 * models, so a preset is only a starting base URL: every field stays editable (§13).
 */
export interface Preset {
  label: string
  baseUrl: string
  /** Where the key is made and the usage is shown (the app keeps no price table, §6.2). */
  dashboard: string | null
  free: boolean
}

export const PRESETS: Record<ProviderPreset, Preset> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    dashboard: 'https://platform.openai.com/usage',
    free: false
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    dashboard: 'https://aistudio.google.com/apikey',
    free: true
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    dashboard: 'https://console.groq.com/keys',
    free: true
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    dashboard: 'https://openrouter.ai/settings/keys',
    free: true
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    dashboard: 'https://console.mistral.ai/api-keys',
    free: false
  },
  custom: { label: 'Custom', baseUrl: '', dashboard: null, free: false }
}

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
export const ANTHROPIC_DASHBOARD = 'https://console.anthropic.com/settings/usage'
export const OLLAMA_BASE_URL = 'http://localhost:11434'
export const LMSTUDIO_BASE_URL = 'http://localhost:1234'
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/providers.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/shared/askPresets.ts src/main/analyst/schema.ts src/main/analyst/providers/types.ts src/main/analyst/providers/openaiCompatible.ts tests/main/analyst/providers.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/shared/askPresets.ts src/main/analyst/schema.ts src/main/analyst/providers/types.ts src/main/analyst/providers/openaiCompatible.ts tests/main/analyst/providers.test.ts
git commit -m "feat(ask): OpenAI-compatible adapter and presets"
```

Expected: typecheck and lint clean; the suite at 1,328 passed, 7 skipped (a clean checkout).

---

### Task 4: Anthropic adapter (spec §6.2; amendments B, C, K)

The official SDK, pinned. The tests hand the client a fake `fetch` with SSE, so no call leaves the PC. What the current models need is in the module's comment: structured mode through `output_config.format`, effort instead of a thinking budget, no `temperature`, no forced `tool_choice`, and each assistant turn's content sent back unchanged.

**Files:**

- Create: `src/main/analyst/providers/anthropic.ts`
- Modify: `package.json`, `package-lock.json`, `tests/main/analyst/providers.test.ts`

- [ ] **Step 1: Install the SDK**

```bash
npm install --save-exact --ignore-scripts @anthropic-ai/sdk@1.1.0
git diff package.json
```

Expected: `package-lock.json` changes, and `git diff package.json` shows exactly this (`--ignore-scripts` skips `electron-builder install-app-deps`; the SDK has no install script):

```diff
diff --git a/package.json b/package.json
index 7d97c2b..fefb498 100644
--- a/package.json
+++ b/package.json
@@ -29,6 +29,7 @@
     "node": ">=22.13"
   },
   "dependencies": {
+    "@anthropic-ai/sdk": "1.1.0",
     "@duckdb/node-api": "1.5.6-r.1",
     "@electron-toolkit/utils": "^4.0.0",
     "@modelcontextprotocol/client": "2.4.0",
```

- [ ] **Step 2: Write the tests**

Modify `tests/main/analyst/providers.test.ts`:

```diff
diff --git a/tests/main/analyst/providers.test.ts b/tests/main/analyst/providers.test.ts
index 1273842..9516935 100644
--- a/tests/main/analyst/providers.test.ts
+++ b/tests/main/analyst/providers.test.ts
@@ -1,4 +1,5 @@
 import { describe, expect, it } from 'vitest'
+import { anthropic, thinkingParams } from '@main/analyst/providers/anthropic'
 import { openAiCompatible } from '@main/analyst/providers/openaiCompatible'
 import { type ChatRequest, ProviderError } from '@main/analyst/providers/types'
 
@@ -229,3 +230,167 @@ describe('the OpenAI-compatible adapter', () => {
     expect((err as ProviderError).kind).toBe('unreachable')
   })
 })
+
+describe('the Anthropic adapter', () => {
+  const events = (blocks: unknown[], stop: string): unknown[] => [
+    {
+      type: 'message_start',
+      message: {
+        id: 'msg_1',
+        type: 'message',
+        role: 'assistant',
+        model: 'claude-opus-5-5',
+        content: [],
+        stop_reason: null,
+        usage: { input_tokens: 2100, output_tokens: 1 }
+      }
+    },
+    ...blocks,
+    { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 42 } },
+    { type: 'message_stop' }
+  ]
+  const anthropicSse = (evs: unknown[]): string =>
+    evs
+      .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
+      .join('')
+
+  const TOOL_USE = [
+    {
+      type: 'content_block_start',
+      index: 0,
+      content_block: { type: 'thinking', thinking: '', signature: '' }
+    },
+    {
+      type: 'content_block_delta',
+      index: 0,
+      delta: { type: 'signature_delta', signature: 'sig-1' }
+    },
+    { type: 'content_block_stop', index: 0 },
+    {
+      type: 'content_block_start',
+      index: 1,
+      content_block: { type: 'tool_use', id: 'toolu_1', name: 'leaderboard', input: {} }
+    },
+    {
+      type: 'content_block_delta',
+      index: 1,
+      delta: { type: 'input_json_delta', partial_json: '{"metric":' }
+    },
+    {
+      type: 'content_block_delta',
+      index: 1,
+      delta: { type: 'input_json_delta', partial_json: '"yprr"}' }
+    },
+    { type: 'content_block_stop', index: 1 }
+  ]
+
+  it('reads a tool call and keeps the turn for the next request', async () => {
+    const f = fakeFetch(() => stream(anthropicSse(events(TOOL_USE, 'tool_use'))))
+    const p = anthropic({ model: 'claude-opus-5-5', key: 'sk-ant', fetch: f.fetch })
+    const reply = await p.chat(REQUEST, signal())
+    expect(reply.calls).toEqual([{ id: 'toolu_1', name: 'leaderboard', args: { metric: 'yprr' } }])
+    expect(reply.stop).toBe('tool')
+    expect(reply.usage).toEqual({ input: 2100, output: 42 })
+    expect(reply.native?.by).toBe('anthropic:claude-opus-5-5')
+    const body = f.calls[0].body!
+    expect(body).not.toHaveProperty('temperature')
+    expect(body).not.toHaveProperty('tool_choice')
+    expect(body.thinking).toEqual({
+      type: 'adaptive',
+      block_binding: { prefix_mismatch_behavior: 'drop_block' }
+    })
+    expect(body.output_config).toEqual({ effort: 'low' })
+    expect(body.fallbacks).toBe('default')
+    expect(f.calls[0].headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
+
+    // The next request sends the assistant turn back unchanged (the thinking block with it).
+    const g = fakeFetch(() =>
+      stream(
+        anthropicSse(
+          events(
+            [
+              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
+              {
+                type: 'content_block_delta',
+                index: 0,
+                delta: { type: 'text_delta', text: 'Puka leads.' }
+              },
+              { type: 'content_block_stop', index: 0 }
+            ],
+            'end_turn'
+          )
+        )
+      )
+    )
+    const q = anthropic({ model: 'claude-opus-5-5', key: 'sk-ant', fetch: g.fetch })
+    const answer = await q.chat(
+      {
+        ...REQUEST,
+        messages: [
+          ...REQUEST.messages,
+          { role: 'assistant', text: reply.text, calls: reply.calls, native: reply.native },
+          {
+            role: 'tool',
+            results: [{ id: 'toolu_1', name: 'leaderboard', text: 'rows', error: false }]
+          }
+        ]
+      },
+      signal()
+    )
+    expect(answer.text).toBe('Puka leads.')
+    const sent = g.calls[0].body!.messages as {
+      role: string
+      content: { type: string; signature?: string }[]
+    }[]
+    expect(sent[1].content[0]).toMatchObject({ type: 'thinking', signature: 'sig-1' })
+    expect(sent[2]).toEqual({
+      role: 'user',
+      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'rows' }]
+    })
+  })
+
+  it('asks for structured output with output_config.format, never a forced tool', async () => {
+    const f = fakeFetch(() =>
+      stream(
+        anthropicSse(
+          events(
+            [
+              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
+              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{}' } },
+              { type: 'content_block_stop', index: 0 }
+            ],
+            'end_turn'
+          )
+        )
+      )
+    )
+    await anthropic({ model: 'claude-sonnet-5-5', key: 'k', fetch: f.fetch }).chat(
+      { ...REQUEST, tools: undefined, json: { name: 'call', schema: { type: 'object' } } },
+      signal()
+    )
+    const body = f.calls[0].body!
+    expect(body.output_config).toEqual({
+      format: { type: 'json_schema', schema: { type: 'object' } }
+    })
+    expect(body.thinking).toEqual({ type: 'between_tools' })
+    expect(body).not.toHaveProperty('tools')
+  })
+
+  it('ends the turn on a refusal', async () => {
+    const f = fakeFetch(() => stream(anthropicSse(events([], 'refusal'))))
+    await expect(
+      anthropic({ model: 'claude-opus-5-5', key: 'k', fetch: f.fetch }).chat(REQUEST, signal())
+    ).rejects.toMatchObject({ kind: 'refusal' })
+  })
+
+  it('maps reasoning to each family', () => {
+    expect(thinkingParams('claude-opus-5-5', 'high')).toMatchObject({
+      output_config: { effort: 'high' }
+    })
+    expect(thinkingParams('claude-haiku-5-5', 'off')).toEqual({
+      thinking: { type: 'disabled' },
+      betas: []
+    })
+    expect(thinkingParams('claude-3-haiku', 'off')).toEqual({})
+  })
+})
```

- [ ] **Step 3: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/providers.test.ts
```

Expected: FAIL. Cannot find package '@main/analyst/providers/anthropic'; no tests run.

- [ ] **Step 4: The adapter**

Create `src/main/analyst/providers/anthropic.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { ModelInfo, Reasoning } from '@shared/ask'
import {
  type ChatMessage,
  type ChatReply,
  type ChatRequest,
  type Fetch,
  type Provider,
  ProviderError,
  type StopReason,
  type ToolCall
} from './types'

/**
 * Anthropic's Messages API through its official SDK (Plan AG1, amendment B). What the current models
 * need (amendments C and K, from the API reference of 2026-10):
 *
 *   - no forced `tool_choice` (a 400 on Opus 5.5 and Sonnet 5.5): structured mode is
 *     `output_config.format`, a JSON Schema;
 *   - no thinking budget: depth is `output_config.effort`; Opus 5.5 cannot turn thinking off, Sonnet
 *     5.5 does it with `between_tools`, Haiku 5.5 with `disabled`;
 *   - no `temperature` (a 400 on every model since 2026-10-21);
 *   - an append-only history: each assistant turn's content goes back unchanged, and a thinking block
 *     that no longer fits its conversation is dropped rather than failing the request;
 *   - server-side fallbacks on a refusal, where the model has them.
 */
export interface AnthropicOptions {
  model: string
  key: string
  baseUrl?: string
  fetch?: Fetch
}

/** The strong and the fast tier (spec §7), for the Model section's first choices. */
export const ANTHROPIC_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']

interface Family {
  /** How "reasoning: off" is said: lowest effort (thinking cannot be off), `between_tools` or `disabled`. */
  off: 'low-effort' | 'between_tools' | 'disabled'
  fallbacks: boolean
}

/** By model id prefix; another model gets neither thinking settings nor betas. */
const FAMILIES: [string, Family][] = [
  ['claude-fable-5', { off: 'low-effort', fallbacks: true }],
  ['claude-opus-5', { off: 'low-effort', fallbacks: true }],
  ['claude-sonnet-5', { off: 'between_tools', fallbacks: true }],
  ['claude-haiku-5', { off: 'disabled', fallbacks: false }]
]

const BETA_FALLBACK = 'server-side-fallback-2026-07-01'
const BETA_BINDING = 'thinking-binding-controls-2026-08-01'

type Params = Anthropic.Beta.Messages.MessageCreateParamsStreaming

/** The request's thinking, effort and betas for the model and the reasoning setting. */
export function thinkingParams(
  model: string,
  reasoning: Reasoning
): Pick<Params, 'thinking' | 'output_config' | 'betas'> & { fallbacks?: 'default' } {
  const family = FAMILIES.find(([prefix]) => model.startsWith(prefix))?.[1]
  if (!family) return {}
  const adaptive: Params['thinking'] = {
    type: 'adaptive',
    block_binding: { prefix_mismatch_behavior: 'drop_block' }
  }
  const betas = [BETA_BINDING, ...(family.fallbacks ? [BETA_FALLBACK] : [])]
  const fallbacks = family.fallbacks ? { fallbacks: 'default' as const } : {}
  if (reasoning !== 'off')
    return { thinking: adaptive, output_config: { effort: reasoning }, betas, ...fallbacks }
  if (family.off === 'low-effort')
    return { thinking: adaptive, output_config: { effort: 'low' }, betas, ...fallbacks }
  if (family.off === 'between_tools')
    return {
      thinking: { type: 'between_tools' },
      betas: betas.filter((b) => b !== BETA_BINDING),
      ...fallbacks
    }
  return { thinking: { type: 'disabled' }, betas: betas.filter((b) => b !== BETA_BINDING) }
}

function wire(by: string, messages: ChatMessage[]): Anthropic.Beta.Messages.BetaMessageParam[] {
  const out: Anthropic.Beta.Messages.BetaMessageParam[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant') {
      if (m.native?.by === by) {
        out.push({
          role: 'assistant',
          content: m.native.content as Anthropic.Beta.Messages.BetaContentBlockParam[]
        })
        continue
      }
      const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = []
      if (m.text) content.push({ type: 'text', text: m.text })
      for (const c of m.calls)
        content.push({
          type: 'tool_use',
          id: c.id,
          name: c.name,
          input: typeof c.args === 'object' && c.args !== null ? c.args : {}
        })
      out.push({ role: 'assistant', content })
    } else
      // All of a step's results in one user message (parallel calls stay parallel).
      out.push({
        role: 'user',
        content: m.results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.text,
          ...(r.error ? { is_error: true } : {})
        }))
      })
  }
  return out
}

const STOPS: Partial<Record<string, StopReason>> = {
  end_turn: 'end',
  tool_use: 'tool',
  max_tokens: 'length',
  refusal: 'refusal',
  stop_sequence: 'end'
}

function sdkError(err: unknown): ProviderError {
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  )
    return new ProviderError('auth', `Anthropic refused the key: ${err.message}`)
  if (err instanceof Anthropic.RateLimitError) {
    const wait = Number(err.headers?.get('retry-after'))
    return new ProviderError(
      'rate',
      `Anthropic is rate limiting this key: ${err.message}`,
      Number.isFinite(wait) ? wait : null
    )
  }
  if (err instanceof Anthropic.APIConnectionError)
    return new ProviderError('unreachable', `Anthropic did not answer: ${err.message}`)
  if (err instanceof Anthropic.InternalServerError)
    return new ProviderError('server', `Anthropic had an error: ${err.message}`)
  if (err instanceof Anthropic.APIError)
    return new ProviderError('request', `Anthropic rejected the request: ${err.message}`)
  throw err
}

export function anthropic(o: AnthropicOptions): Provider {
  const client = new Anthropic({
    apiKey: o.key,
    ...(o.baseUrl ? { baseURL: o.baseUrl } : {}),
    ...(o.fetch ? { fetch: o.fetch } : {}),
    maxRetries: 2
  })
  const by = `anthropic:${o.model}`

  async function chat(
    req: ChatRequest,
    signal: AbortSignal,
    onText?: (delta: string) => void
  ): Promise<ChatReply> {
    const think = thinkingParams(o.model, req.reasoning)
    const params: Params = {
      model: o.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: wire(by, req.messages),
      stream: true,
      ...think,
      ...(req.tools && req.tools.length > 0
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.schema as Anthropic.Beta.Messages.BetaTool.InputSchema
            }))
          }
        : {})
    }
    if (req.json)
      params.output_config = {
        ...params.output_config,
        format: { type: 'json_schema', schema: req.json.schema as Record<string, unknown> }
      }
    let message: Anthropic.Beta.Messages.BetaMessage
    try {
      const stream = client.beta.messages.stream(params, { signal })
      if (onText) stream.on('text', (delta) => onText(delta))
      message = await stream.finalMessage()
    } catch (err) {
      if (signal.aborted) throw err
      throw sdkError(err)
    }
    const stop = STOPS[message.stop_reason ?? 'end_turn'] ?? 'end'
    if (stop === 'refusal')
      throw new ProviderError('refusal', 'The model declined to answer this question.')
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    const calls: ToolCall[] = message.content.flatMap((b) =>
      b.type === 'tool_use' ? [{ id: b.id, name: b.name, args: b.input }] : []
    )
    return {
      text,
      calls,
      usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
      stop,
      native: { by, content: message.content }
    }
  }

  async function models(signal: AbortSignal): Promise<ModelInfo[]> {
    try {
      const list: ModelInfo[] = []
      for await (const m of client.models.list({}, { signal }))
        list.push({ id: m.id, tools: true, thinking: true, context: m.max_input_tokens ?? null })
      return list
    } catch (err) {
      if (signal.aborted) throw err
      throw sdkError(err)
    }
  }

  return { label: `Anthropic · ${o.model}`, model: o.model, chat, models }
}
```

- [ ] **Step 5: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/providers.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 6: Check and commit**

```bash
npx prettier --write src/main/analyst/providers/anthropic.ts tests/main/analyst/providers.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/providers/anthropic.ts tests/main/analyst/providers.test.ts package.json package-lock.json
git commit -m "feat(ask): Anthropic adapter"
```

Expected: typecheck and lint clean; the suite at 1,332 passed, 7 skipped (a clean checkout).

---

### Task 5: Local servers (spec §5.2, §6.2; amendment D)

Ollama through its native `/api/chat`, and detection of Ollama and LM Studio with what each model can do. LM Studio's chat goes through the OpenAI-compatible adapter (`createProvider`, Task 9). The Model section (Task 10) defaults the calling mode from the capabilities: no `tools`, structured mode.

**Files:**

- Create: `src/main/analyst/providers/ollama.ts`, `src/main/analyst/providers/detect.ts`
- Modify: `tests/main/analyst/providers.test.ts`

- [ ] **Step 1: Write the tests**

Modify `tests/main/analyst/providers.test.ts`:

```diff
diff --git a/tests/main/analyst/providers.test.ts b/tests/main/analyst/providers.test.ts
index 9516935..8b9cc56 100644
--- a/tests/main/analyst/providers.test.ts
+++ b/tests/main/analyst/providers.test.ts
@@ -1,5 +1,7 @@
 import { describe, expect, it } from 'vitest'
 import { anthropic, thinkingParams } from '@main/analyst/providers/anthropic'
+import { detectLocalServers, lmStudioModels } from '@main/analyst/providers/detect'
+import { ollama, ollamaModels } from '@main/analyst/providers/ollama'
 import { openAiCompatible } from '@main/analyst/providers/openaiCompatible'
 import { type ChatRequest, ProviderError } from '@main/analyst/providers/types'
 
@@ -231,6 +233,109 @@ describe('the OpenAI-compatible adapter', () => {
   })
 })
 
+describe('the Ollama adapter', () => {
+  const ndjson = (lines: unknown[]): Response =>
+    stream(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'application/x-ndjson')
+
+  it('sets the context size, the schema and think, and reads a tool call', async () => {
+    const f = fakeFetch(() =>
+      ndjson([
+        {
+          message: {
+            content: '',
+            tool_calls: [{ function: { name: 'leaderboard', arguments: { metric: 'yprr' } } }]
+          },
+          done: false
+        },
+        {
+          message: { content: '' },
+          done: true,
+          done_reason: 'stop',
+          prompt_eval_count: 950,
+          eval_count: 30
+        }
+      ])
+    )
+    const p = ollama({
+      baseUrl: 'http://localhost:11434',
+      model: 'qwen3:4b',
+      info: { id: 'qwen3:4b', tools: true, thinking: true, context: 40960 },
+      context: 8192,
+      fetch: f.fetch
+    })
+    const reply = await p.chat(REQUEST, signal())
+    expect(reply.calls).toEqual([{ id: 'call_0', name: 'leaderboard', args: { metric: 'yprr' } }])
+    expect(reply.stop).toBe('tool')
+    expect(reply.usage).toEqual({ input: 950, output: 30 })
+    expect(f.calls[0].url).toBe('http://localhost:11434/api/chat')
+    expect(f.calls[0].body).toMatchObject({
+      think: false,
+      keep_alive: '10m',
+      options: { num_ctx: 8192, num_predict: 800 }
+    })
+  })
+
+  it('leaves think out for a model without it, and passes the schema as format', async () => {
+    const f = fakeFetch(() =>
+      ndjson([{ message: { content: '{"a":1}' }, done: true, done_reason: 'stop' }])
+    )
+    const p = ollama({
+      baseUrl: 'http://localhost:11434',
+      model: 'gemma3:4b',
+      info: { id: 'gemma3:4b', tools: false, thinking: false, context: null },
+      context: 8192,
+      fetch: f.fetch
+    })
+    const reply = await p.chat(
+      { ...REQUEST, tools: undefined, json: { name: 'call', schema: { type: 'object' } } },
+      signal()
+    )
+    expect(reply.text).toBe('{"a":1}')
+    expect(f.calls[0].body).not.toHaveProperty('think')
+    expect(f.calls[0].body?.format).toEqual({ type: 'object' })
+  })
+
+  it('lists chat models with their capabilities, embeddings left out', async () => {
+    const f = fakeFetch((url, body) => {
+      if (url.endsWith('/api/tags'))
+        return Response.json({ models: [{ name: 'qwen3:4b' }, { name: 'bge-m3:latest' }] })
+      const caps = body?.model === 'qwen3:4b' ? ['completion', 'tools', 'thinking'] : ['embedding']
+      return Response.json({ capabilities: caps, model_info: { 'qwen3.context_length': 40960 } })
+    })
+    expect(await ollamaModels('http://localhost:11434', signal(), f.fetch)).toEqual([
+      { id: 'qwen3:4b', tools: true, thinking: true, context: 40960 }
+    ])
+  })
+})
+
+describe('local server detection', () => {
+  it('reads LM Studio capabilities', async () => {
+    const f = fakeFetch(() =>
+      Response.json({
+        data: [
+          {
+            id: 'qwen/qwen3.5-9b',
+            type: 'llm',
+            capabilities: ['tool_use'],
+            max_context_length: 32768
+          },
+          { id: 'text-embedding-nomic', type: 'embeddings' }
+        ]
+      })
+    )
+    expect(await lmStudioModels('http://localhost:1234', signal(), f.fetch)).toEqual([
+      { id: 'qwen/qwen3.5-9b', tools: true, thinking: false, context: 32768 }
+    ])
+  })
+
+  it('skips servers that are not running', async () => {
+    const f = (async () => {
+      throw new TypeError('fetch failed')
+    }) as unknown as typeof fetch
+    expect(await detectLocalServers(f)).toEqual([])
+  })
+})
+
 describe('the Anthropic adapter', () => {
   const events = (blocks: unknown[], stop: string): unknown[] => [
     {
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/providers.test.ts
```

Expected: FAIL. Cannot find package '@main/analyst/providers/detect'; no tests run.

- [ ] **Step 3: The adapter and the detection**

Create `src/main/analyst/providers/ollama.ts`:

```ts
import type { ModelInfo } from '@shared/ask'
import {
  type ChatMessage,
  type ChatReply,
  type ChatRequest,
  type Fetch,
  httpError,
  lines,
  type Provider,
  ProviderError,
  type StopReason,
  stripThinking,
  unreachable
} from './types'

/**
 * Ollama through its own `/api/chat` (Plan AG1, amendment D), not its OpenAI endpoint: only the
 * native API sets the context size (`num_ctx`; Ollama's default would cut the brief), takes a JSON
 * Schema as `format` and turns reasoning on or off with `think`. This is what the probes measured.
 */
export interface OllamaOptions {
  baseUrl: string
  model: string
  /** From `/api/show`; null when unknown (then no `think` and no `tools` are sent). */
  info: ModelInfo | null
  /** The context to load the model with (tokens). */
  context: number
  fetch?: Fetch
}

/** How long Ollama keeps the model loaded after a call: follow-ups should not reload it. */
const KEEP_ALIVE = '10m'

type WireMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant'
      content: string
      tool_calls?: { function: { name: string; arguments: unknown } }[]
    }
  | { role: 'tool'; content: string; tool_name: string }

function wire(system: string, messages: ChatMessage[]): WireMessage[] {
  const out: WireMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant')
      out.push({
        role: 'assistant',
        content: m.text,
        ...(m.calls.length > 0
          ? { tool_calls: m.calls.map((c) => ({ function: { name: c.name, arguments: c.args } })) }
          : {})
      })
    else for (const r of m.results) out.push({ role: 'tool', content: r.text, tool_name: r.name })
  }
  return out
}

interface Line {
  message?: {
    content?: string
    tool_calls?: { function: { name: string; arguments: unknown } }[]
  }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

export function ollama(o: OllamaOptions): Provider {
  const doFetch = o.fetch ?? fetch
  const base = o.baseUrl.replace(/\/+$/, '')

  async function chat(
    req: ChatRequest,
    signal: AbortSignal,
    onText?: (delta: string) => void
  ): Promise<ChatReply> {
    const body: Record<string, unknown> = {
      model: o.model,
      messages: wire(req.system, req.messages),
      stream: true,
      keep_alive: KEEP_ALIVE,
      options: { num_ctx: o.context, num_predict: req.maxTokens }
    }
    if (req.tools && req.tools.length > 0)
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.schema }
      }))
    if (req.json) body.format = req.json.schema
    // A model without the capability rejects `think`, even `false`.
    if (o.info?.thinking) body.think = req.reasoning !== 'off'
    // A thinking model asked not to think may reason in the text anyway (a thinking-only model):
    // the text is held back until it is whole, then given without the reasoning.
    const hold = o.info?.thinking === true && req.reasoning === 'off' && !req.json
    const url = `${base}/api/chat`
    let res: Response
    try {
      res = await doFetch(url, { method: 'POST', body: JSON.stringify(body), signal })
    } catch (err) {
      throw unreachable('Ollama', url, err)
    }
    if (!res.ok || !res.body) throw httpError('Ollama', res.status, await res.text(), null)

    let text = ''
    let stop: StopReason = 'end'
    const usage = { input: 0, output: 0 }
    const calls: ChatReply['calls'] = []
    for await (const raw of lines(res.body)) {
      if (raw.trim() === '') continue
      let line: Line
      try {
        line = JSON.parse(raw) as Line
      } catch {
        continue
      }
      if (line.error) throw new ProviderError('server', `Ollama: ${line.error}`)
      const content = line.message?.content
      if (content) {
        text += content
        if (!hold) onText?.(content)
      }
      for (const c of line.message?.tool_calls ?? [])
        calls.push({
          id: `call_${calls.length}`,
          name: c.function.name,
          args: c.function.arguments
        })
      if (line.done) {
        usage.input = line.prompt_eval_count ?? 0
        usage.output = line.eval_count ?? 0
        if (line.done_reason === 'length') stop = 'length'
      }
    }
    if (calls.length > 0 && stop === 'end') stop = 'tool'
    const answer = stripThinking(text)
    if (hold && answer) onText?.(answer)
    return { text: answer, calls, usage, stop }
  }

  return {
    label: `Ollama · ${o.model}`,
    model: o.model,
    chat,
    models: (signal) => ollamaModels(base, signal, doFetch)
  }
}

interface ShowReply {
  capabilities?: string[]
  model_info?: Record<string, unknown>
}

/** One model's capabilities from `/api/show`; null for a model that does not chat (embeddings). */
export async function ollamaModel(
  base: string,
  id: string,
  signal: AbortSignal,
  doFetch: Fetch = fetch
): Promise<ModelInfo | null> {
  const res = await doFetch(`${base}/api/show`, {
    method: 'POST',
    body: JSON.stringify({ model: id }),
    signal
  })
  if (!res.ok) return { id, tools: false, thinking: false, context: null }
  const j = (await res.json()) as ShowReply
  const caps = j.capabilities ?? []
  if (!caps.includes('completion')) return null
  const context = Object.entries(j.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))
  return {
    id,
    tools: caps.includes('tools'),
    thinking: caps.includes('thinking'),
    context: typeof context?.[1] === 'number' ? context[1] : null
  }
}

/** The chat models Ollama has, with their capabilities. */
export async function ollamaModels(
  base: string,
  signal: AbortSignal,
  doFetch: Fetch = fetch
): Promise<ModelInfo[]> {
  const url = `${base}/api/tags`
  let res: Response
  try {
    res = await doFetch(url, { signal })
  } catch (err) {
    throw unreachable('Ollama', url, err)
  }
  if (!res.ok) throw httpError('Ollama', res.status, await res.text(), null)
  const j = (await res.json()) as { models?: { name: string }[] }
  const all = await Promise.all(
    (j.models ?? []).map((m) => ollamaModel(base, m.name, signal, doFetch))
  )
  return all.filter((m): m is ModelInfo => m !== null).sort((a, b) => a.id.localeCompare(b.id))
}
```

Create `src/main/analyst/providers/detect.ts`:

```ts
import type { LocalServer, ModelInfo } from '@shared/ask'
import { ollamaModels } from './ollama'
import { LMSTUDIO_BASE_URL, OLLAMA_BASE_URL } from '@shared/askPresets'
import type { Fetch } from './types'

/**
 * Finds the local servers that are running (Ask spec §6.2) and what each model can do, so the calling
 * mode defaults from it (§5.2): a model without tool calls gets structured mode. A server that is not
 * running is skipped quickly and quietly.
 */
const TIMEOUT_MS = 1500

interface LmStudioModel {
  id: string
  type?: string
  capabilities?: string[]
  max_context_length?: number
}

/** LM Studio's models with their capabilities (its own `/api/v0/models`). */
export async function lmStudioModels(
  base: string,
  signal: AbortSignal,
  doFetch: Fetch = fetch
): Promise<ModelInfo[]> {
  const res = await doFetch(`${base}/api/v0/models`, { signal })
  if (!res.ok) throw new Error(`LM Studio answered ${res.status}`)
  const j = (await res.json()) as { data?: LmStudioModel[] }
  return (j.data ?? [])
    .filter((m) => m.type === undefined || m.type === 'llm' || m.type === 'vlm')
    .map((m) => ({
      id: m.id,
      tools: (m.capabilities ?? []).includes('tool_use'),
      thinking: false,
      context: m.max_context_length ?? null
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function probe(
  kind: LocalServer['kind'],
  baseUrl: string,
  list: (signal: AbortSignal) => Promise<ModelInfo[]>
): Promise<LocalServer | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  try {
    return { kind, baseUrl, models: await list(signal) }
  } catch {
    return null
  }
}

export async function detectLocalServers(doFetch: Fetch = fetch): Promise<LocalServer[]> {
  const found = await Promise.all([
    probe('ollama', OLLAMA_BASE_URL, (s) => ollamaModels(OLLAMA_BASE_URL, s, doFetch)),
    probe('lmstudio', LMSTUDIO_BASE_URL, (s) => lmStudioModels(LMSTUDIO_BASE_URL, s, doFetch))
  ])
  return found.filter((s): s is LocalServer => s !== null)
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/providers.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/providers/ollama.ts src/main/analyst/providers/detect.ts tests/main/analyst/providers.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/providers/ollama.ts src/main/analyst/providers/detect.ts tests/main/analyst/providers.test.ts
git commit -m "feat(ask): Ollama adapter, local server detection"
```

Expected: typecheck and lint clean; the suite at 1,337 passed, 7 skipped (a clean checkout).

---

### Task 6: The loop (spec §5.1, §5.2)

One loop, three ways to call the model, with the limits of §5.1. The tests use a scripted provider and the fake engine. `listedSchema` moves from `mcp/server.ts` to `schema.ts`, because the native mode lists the same schemas MCP does. Follow-ups come in Task 7, examples and sample-k in Task 8.

**Files:**

- Create: `src/main/analyst/loop.ts`, `tests/main/analyst/loop.test.ts`
- Modify: `src/main/analyst/schema.ts`, `src/main/analyst/mcp/server.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/analyst/loop.test.ts`:

````ts
import { describe, expect, it } from 'vitest'
import type { AskEvent, CallingMode, ToolProfile } from '@shared/ask'
import type { StatsQuery } from '@shared/stats/types'
import { askTurn, jsonOf, type LoopInput, type LoopOutput } from '@main/analyst/loop'
import {
  type ChatReply,
  type ChatRequest,
  type Provider,
  ProviderError
} from '@main/analyst/providers/types'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult, statsRow } from '../../fixtures/analyst'

const PUKA = '00-0039075'

function stats(queries: StatsQuery[] = []): AnalystStats {
  return {
    status: async () => ({
      available: true,
      through: { season: 2026, seasonType: 'REG', week: 7 },
      updatedAt: '2026-10-27T00:00:00Z',
      busy: false
    }),
    catalogue: async () => catalogueInfo(new Map()),
    people: async () => PEOPLE,
    query: async (q) => {
      queries.push(q)
      return statsResult([
        statsRow(PUKA, 'Puka Nacua', { yprr: { raw: 3.1, sample: 210, rank: 1 } }, { team: 'LA' })
      ])
    },
    games: async () => [],
    outlook: async () => {
      throw new Error('not in this test')
    },
    player: async () => {
      throw new Error('not in this test')
    }
  }
}

type Step = Partial<ChatReply> | ((req: ChatRequest) => Partial<ChatReply>) | Error

/** A provider that answers each call with the next step, and keeps the requests. */
function scripted(steps: Step[]): Provider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = []
  let at = 0
  return {
    label: 'Scripted · test',
    model: 'test',
    requests,
    models: async () => [],
    async chat(req, signal, onText) {
      requests.push(structuredClone(req))
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      const step = steps[Math.min(at++, steps.length - 1)]
      if (step instanceof Error) throw step
      const r = typeof step === 'function' ? step(req) : step
      const reply: ChatReply = {
        text: r.text ?? '',
        calls: r.calls ?? [],
        usage: r.usage ?? { input: 100, output: 10 },
        stop: r.stop ?? (r.calls?.length ? 'tool' : 'end'),
        native: r.native
      }
      if (onText && reply.text) onText(reply.text)
      return reply
    }
  }
}

const json = (o: unknown): Partial<ChatReply> => ({ text: JSON.stringify(o) })

async function ask(
  question: string,
  provider: Provider,
  over: Partial<LoopInput> & { profile?: ToolProfile; mode?: CallingMode } = {}
): Promise<{ out: LoopOutput; events: AskEvent[]; queries: StatsQuery[] }> {
  const queries: StatsQuery[] = []
  const events: AskEvent[] = []
  const out = await askTurn({
    question,
    provider,
    analyst: createAnalyst({ stats: stats(queries), league: () => null }),
    profile: 'compact',
    mode: 'structured',
    reasoning: 'off',
    history: [],
    signal: new AbortController().signal,
    emit: (e) => events.push(e),
    ...over
  })
  return { out, events, queries }
}

const LEADERS = 'Who leads WRs in yards per route run?'

describe('a turn with no model call', () => {
  it('declines advice', async () => {
    const p = scripted([])
    const { out } = await ask('Should I start Bijan Robinson this week?', p)
    expect(out.outcome).toBe('decline')
    expect(p.requests).toHaveLength(0)
  })

  it('asks which namesake', async () => {
    const p = scripted([])
    const { out } = await ask("Chris Jones's sacks this season", p)
    expect(out.outcome).toBe('ask')
    expect(out.text).toContain('Which "Chris Jones" do you mean')
    expect(p.requests).toHaveLength(0)
  })
})

describe('the compact profile', () => {
  it('fills the classifier tool, runs it and answers from the result', async () => {
    const p = scripted([
      json({ thought: 'yprr for WRs', args: { metric: 'yprr', position: 'WR' } }),
      { text: 'Puka Nacua leads with 3.10 yards per route run.' }
    ])
    const { out, events, queries } = await ask(LEADERS, p)
    expect(out.outcome).toBe('answer')
    // No time in the question: the tool's default, the current season.
    expect(out.calls).toEqual([{ tool: 'leaderboard', args: { metric: 'yprr', position: 'WR' } }])
    expect(queries).toHaveLength(1)
    expect(p.requests[0].json?.name).toBe('leaderboard')
    expect(p.requests[0].messages[0]).toMatchObject({ role: 'user' })
    expect(p.requests[1].system).toContain('Answer the question in two or three sentences')
    expect(events.map((e) => e.type)).toEqual(['call', 'result', 'text'])
    expect(out.trace.profile).toBe('compact')
    expect(out.trace.calls[0].ok).toBe(true)
  })

  it('flags a number that is not in the data', async () => {
    const p = scripted([
      json({ thought: '', args: { metric: 'yprr', position: 'WR' } }),
      { text: 'Puka Nacua leads with 4.25 yards per route run.' }
    ])
    const { out } = await ask(LEADERS, p)
    expect(out.flags.map((f) => f.kind)).toContain('number')
  })

  it('re-resolves with more metrics once on "other"', async () => {
    const p = scripted([
      json({ thought: 'none fits', args: { metric: 'other', position: 'WR' } }),
      (req) => {
        const metric = req.json!.schema.properties!.args.properties!.metric
        expect(metric.enum!.length).toBeGreaterThan(6)
        return json({ thought: '', args: { metric: 'yprr', position: 'WR' } })
      },
      { text: 'Puka leads.' }
    ])
    const { out } = await ask(LEADERS, p)
    expect(out.outcome).toBe('answer')
    expect(p.requests).toHaveLength(3)
  })

  it('tells the model what was wrong, and gives up after three failures', async () => {
    const p = scripted([{ text: 'not json' }])
    const { out } = await ask(LEADERS, p)
    expect(out.outcome).toBe('error')
    expect(p.requests).toHaveLength(3)
    const last = p.requests[2].messages[0]
    expect(last.role === 'user' && last.text).toContain('Your reply did not fit')
  })

  it('answers from the result when the model runs out of room', async () => {
    const p = scripted([
      json({ thought: '', args: { metric: 'yprr', position: 'WR' } }),
      { text: 'Okay, the user is asking', stop: 'length' }
    ])
    const { out } = await ask(LEADERS, p)
    expect(out.text).toContain('Puka Nacua')
    expect(out.text).toContain('did not finish its answer')
  })
})

describe('the full profile, native tools', () => {
  it('runs the calls, sends the results back and answers', async () => {
    const p = scripted([
      {
        calls: [{ id: 'c1', name: 'leaderboard', args: { metric: 'yprr', position: 'WR' } }],
        native: { by: 'x', content: ['kept'] }
      },
      { text: 'Puka Nacua leads with 3.10.' }
    ])
    const { out } = await ask(LEADERS, p, { profile: 'full', mode: 'native' })
    expect(out.outcome).toBe('answer')
    const metric = p.requests[0].tools!.find((t) => t.name === 'leaderboard')!.schema.properties!
      .metric
    expect(metric).toMatchObject({ type: 'string' })
    expect(metric.enum).toBeUndefined()
    expect(p.requests[1].messages.slice(1)).toMatchObject([
      { role: 'assistant', native: { by: 'x', content: ['kept'] } },
      { role: 'tool', results: [{ id: 'c1', name: 'leaderboard', error: false }] }
    ])
    // The transcript is what the next turn resends.
    expect(out.transcript.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  })

  it('sends a failed call back with its error, then stops calling at the limit', async () => {
    const p = scripted([{ calls: [{ id: 'c', name: 'leaderboard', args: { metric: 'nope' } }] }])
    const { out } = await ask(LEADERS, p, { profile: 'full', mode: 'native' })
    expect(out.calls).toHaveLength(3)
    const tool = p.requests[1].messages.find((m) => m.role === 'tool')
    expect(tool?.role === 'tool' && tool.results[0]).toMatchObject({ error: true })
    const last = p.requests[p.requests.length - 1].messages.at(-1)
    expect(last).toMatchObject({ role: 'user', text: expect.stringContaining('Answer now') })
  })

  it('ends on a provider error with its message', async () => {
    const p = scripted([
      new ProviderError('refusal', 'The model declined to answer this question.')
    ])
    const { out } = await ask(LEADERS, p, { profile: 'full', mode: 'native' })
    expect(out.outcome).toBe('error')
    expect(out.text).toBe('The model declined to answer this question.')
  })

  it('stops when the user stops it', async () => {
    const stop = new AbortController()
    stop.abort()
    const { out } = await ask(LEADERS, scripted([{ text: 'x' }]), {
      profile: 'full',
      mode: 'native',
      signal: stop.signal
    })
    expect(out.outcome).toBe('stopped')
  })
})

describe('the full profile, structured mode', () => {
  it('takes steps until "answer", then writes the answer', async () => {
    const p = scripted([
      json({ thought: 'rank', tool: 'leaderboard', args: { metric: 'yprr', position: 'WR' } }),
      json({ thought: 'enough', tool: 'answer', args: {} }),
      { text: 'Puka Nacua leads.' }
    ])
    const { out } = await ask(LEADERS, p, { profile: 'full', mode: 'structured' })
    expect(out.outcome).toBe('answer')
    expect(out.calls.map((c) => c.tool)).toEqual(['leaderboard'])
    expect(p.requests[0].json?.name).toBe('step')
    expect(p.requests[2].json).toBeUndefined()
  })
})

describe('jsonOf', () => {
  it('reads a fenced or wrapped object', () => {
    expect(jsonOf('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(jsonOf('Here: {"a":1} done')).toEqual({ a: 1 })
    expect(jsonOf('nothing')).toBeUndefined()
  })
})
````

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/loop.test.ts
```

Expected: FAIL. Cannot find package '@main/analyst/loop'; no tests run.

- [ ] **Step 3: Move `listedSchema`, write the loop**

Modify `src/main/analyst/schema.ts`:

```diff
diff --git a/src/main/analyst/schema.ts b/src/main/analyst/schema.ts
index 5639c10..7ee4b07 100644
--- a/src/main/analyst/schema.ts
+++ b/src/main/analyst/schema.ts
@@ -86,6 +86,27 @@ export function check(schema: Schema, value: unknown, path = 'arguments'): strin
   }
 }
 
+/** An enum longer than this is a list of metric ids. */
+const LONG_ENUM = 40
+const METRIC_HINT = 'A metric id, such as yprr or rush_epa; find gives the ids for a stat’s name.'
+
+/**
+ * The schema Claude reads: the full profile's, without the lists of metric ids. Those are about 300
+ * ids, seven times over: 34 of the 51 KB the tools take, some 9,000 tokens in every conversation.
+ * `find` gives the ids, and the analyst still checks each call against the full schema and names
+ * the nearest ids when one is wrong.
+ */
+export function listedSchema(schema: unknown): unknown {
+  if (Array.isArray(schema)) return schema.map(listedSchema)
+  if (!schema || typeof schema !== 'object') return schema
+  const node = schema as Record<string, unknown>
+  if (Array.isArray(node.enum) && node.enum.length > LONG_ENUM) {
+    const description = [node.description, METRIC_HINT].filter(Boolean).join(' ')
+    return { type: 'string', description }
+  }
+  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, listedSchema(v)]))
+}
+
 /**
  * The schema fits strict structured output (OpenAI's `strict: true`): every object closes its
  * properties and requires all of them. Other schemas are sent without `strict`.
```

Modify `src/main/analyst/mcp/server.ts`:

```diff
diff --git a/src/main/analyst/mcp/server.ts b/src/main/analyst/mcp/server.ts
index b2ec74e..e09c057 100644
--- a/src/main/analyst/mcp/server.ts
+++ b/src/main/analyst/mcp/server.ts
@@ -19,6 +19,7 @@ import type { AskExample } from '@main/db/repos/askExamples'
 import { briefText } from '../brief'
 import type { Now } from '../time'
 import { type Analyst, toolDefinitions, type TurnContext } from '../tools'
+import { listedSchema } from '../schema'
 
 /**
  * The MCP server (Ask spec §6.1): the analyst tools of the full profile, the analyst brief as the
@@ -69,27 +70,6 @@ function fallbackSeasons(): number[] {
   return Array.from({ length: year - 2019 + 1 }, (_, i) => 2019 + i)
 }
 
-/** An enum longer than this is a list of metric ids. */
-const LONG_ENUM = 40
-const METRIC_HINT = 'A metric id, such as yprr or rush_epa; find gives the ids for a stat’s name.'
-
-/**
- * The schema Claude reads: the full profile's, without the lists of metric ids. Those are about 300
- * ids, seven times over: 34 of the 51 KB the tools take, some 9,000 tokens in every conversation.
- * `find` gives the ids, and the analyst still checks each call against the full schema and names
- * the nearest ids when one is wrong.
- */
-export function listedSchema(schema: unknown): unknown {
-  if (Array.isArray(schema)) return schema.map(listedSchema)
-  if (!schema || typeof schema !== 'object') return schema
-  const node = schema as Record<string, unknown>
-  if (Array.isArray(node.enum) && node.enum.length > LONG_ENUM) {
-    const description = [node.description, METRIC_HINT].filter(Boolean).join(' ')
-    return { type: 'string', description }
-  }
-  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, listedSchema(v)]))
-}
-
 const text = (t: string, isError = false): CallToolResult => ({
   content: [{ type: 'text', text: t }],
   ...(isError ? { isError: true } : {})
```

Create `src/main/analyst/loop.ts`:

````ts
import type {
  AskCall,
  AskEvent,
  AskFlag,
  AskMessage,
  CallingMode,
  Reasoning,
  ToolOutcome,
  ToolProfile,
  ToolResult
} from '@shared/ask'
import { type BriefKind, briefHash, briefText } from './brief'
import { checkAnswer } from './checks'
import { type CompactAnswer, compactAnswer, compactCall } from './compact'
import { type ProviderError, ProviderError as ProviderErrorClass } from './providers/types'
import type { ChatMessage, ChatReply, ChatRequest, Provider, ToolReply } from './providers/types'
import { type ContextBlock, contextText, resolve } from './resolve'
import { check, listedSchema, type Schema } from './schema'
import { type Analyst, toolsHash, type TurnContext } from './tools'
import { resolverTrace, type Trace, traceCall } from './trace'

/**
 * The agent loop (Ask spec §5.1): one loop for every model, with the planning and the checking in
 * code. A turn:
 *
 *   1. the resolver reads the question; an ambiguous name is
 *      asked back and advice or an out-of-range season declined, with no model call;
 *   2. the model gets the brief, the context block and the tools of its profile;
 *   3. the calls run (in parallel when a step makes several); a failed call goes back to the model
 *      with the error, which says how to fix it;
 *   4. the model writes the answer, streamed;
 *   5. the answer checks run against the turn's results.
 *
 * Three ways to call the model (§5.2): the full profile with native tool calls, the full profile in
 * structured mode (one JSON object per step), and the compact profile (the classifier's tool, only
 * its open slots, `{thought, args}`).
 */
export interface LoopLimits {
  /** Tool calls per turn. */
  calls: number
  /** Failed calls per turn. */
  failures: number
  /** The output cap of one model call (tokens). */
  callTokens: number
  /** The output cap of the compact profile's answer: two or three sentences, and room to think. */
  answerTokens: number
  /** Input and output tokens per turn. */
  turnTokens: number
  timeoutMs: number
}

export const LIMITS: LoopLimits = {
  calls: 8,
  failures: 3,
  callTokens: 1500,
  answerTokens: 1024,
  turnTokens: 120_000,
  timeoutMs: 90_000
}

export interface LoopInput {
  question: string
  provider: Provider
  analyst: Analyst
  profile: ToolProfile
  mode: CallingMode
  reasoning: Reasoning
  /** The thread's earlier turns, as the full profile resends them. */
  history: ChatMessage[]
  limits?: Partial<LoopLimits>
  signal: AbortSignal
  emit: (event: AskEvent) => void
}

export interface LoopOutput {
  text: string
  outcome: NonNullable<AskMessage['outcome']>
  calls: AskCall[]
  results: ToolOutcome[]
  flags: AskFlag[]
  tokens: { input: number; output: number }
  ms: number
  /** This turn's messages, for the next turn's history. */
  transcript: ChatMessage[]
  trace: Trace
}

/** Thrown inside a turn when it must end: the reason becomes the answer. */
class TurnEnd extends Error {
  constructor(
    readonly outcome: 'error' | 'stopped',
    message: string
  ) {
    super(message)
  }
}

/** The JSON object in a structured reply (some models wrap it in a fence or add words). */
export function jsonOf(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(t) as unknown
  } catch {
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1)) as unknown
      } catch {
        // fall through
      }
    }
    return undefined
  }
}

const STEP_THOUGHT = 300

/** The full profile's structured step: the next tool and its arguments, or `answer`. */
function stepSchema(tools: string[]): Schema {
  return {
    type: 'object',
    properties: {
      thought: { type: 'string', maxLength: STEP_THOUGHT },
      tool: { enum: [...tools, 'answer'] },
      args: { type: 'object' }
    },
    required: ['thought', 'tool', 'args'],
    additionalProperties: false
  }
}

const ambiguousText = (b: ContextBlock): string =>
  b.ambiguous
    .map((a) => {
      const options = a.options.map(
        (p) => `${p.name} (${[p.position, p.team].filter(Boolean).join(', ')})`
      )
      return `Which "${a.mention}" do you mean: ${options.join(' or ')}?`
    })
    .join(' ')

export async function askTurn(input: LoopInput): Promise<LoopOutput> {
  const started = Date.now()
  const limits = { ...LIMITS, ...input.limits }
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(limits.timeoutMs)])
  const { provider, analyst, emit } = input
  const turn: TurnContext = await analyst.turn()
  const deps = { people: turn.people, now: turn.now }
  let block = resolve(input.question, deps)

  const calls: AskCall[] = []
  const results: ToolOutcome[] = []
  const traced: Trace['calls'] = []
  const tokens = { input: 0, output: 0 }
  const transcript: ChatMessage[] = []
  let failures = 0
  let briefKind: BriefKind = input.profile === 'compact' ? 'compact-call' : 'analyst'

  const finish = (
    text: string,
    outcome: LoopOutput['outcome'],
    flags: AskFlag[] = []
  ): LoopOutput => {
    return {
      text,
      outcome,
      calls,
      results,
      flags,
      tokens,
      ms: Date.now() - started,
      transcript,
      trace: {
        at: new Date(started).toISOString(),
        question: input.question,
        brief: briefHash(briefKind),
        tools: toolsHash(turn.seasons),
        profile: input.profile,
        model: provider.label,
        mode: input.mode,
        resolver: resolverTrace(block),
        calls: traced,
        checks: flags.map((f) => ({ kind: f.kind, text: f.text })),
        tokens,
        ms: Date.now() - started
      }
    }
  }

  // 1. No model call for a decline or a name to ask about.
  if (block.decline) return finish(block.decline, 'decline')
  if (block.ambiguous.length > 0) return finish(ambiguousText(block), 'ask')

  /** One model call, with the turn's token budget and the stop reasons. */
  async function model(
    req: Omit<ChatRequest, 'maxTokens' | 'reasoning'>,
    stream: boolean,
    maxTokens = limits.callTokens
  ): Promise<ChatReply> {
    if (signal.aborted) throw new TurnEnd('stopped', 'Stopped.')
    if (tokens.input + tokens.output > limits.turnTokens)
      throw new TurnEnd('error', 'This question used up its token budget before an answer.')
    let reply: ChatReply
    try {
      reply = await provider.chat(
        { ...req, maxTokens, reasoning: input.reasoning },
        signal,
        stream ? (delta) => emit({ type: 'text', delta }) : undefined
      )
    } catch (err) {
      if (signal.aborted)
        throw new TurnEnd(
          'stopped',
          input.signal.aborted ? 'Stopped.' : 'The model took too long; the turn was stopped.'
        )
      if (err instanceof ProviderErrorClass)
        throw new TurnEnd('error', (err as ProviderError).message)
      throw err
    }
    tokens.input += reply.usage.input
    tokens.output += reply.usage.output
    return reply
  }

  /** Runs one tool call and records it. */
  async function run(tool: string, args: unknown): Promise<ToolOutcome> {
    const call = { tool, args }
    calls.push(call)
    emit({ type: 'call', call })
    const outcome = await analyst.run(tool, args, turn)
    results.push(outcome)
    traced.push(traceCall(tool, args, outcome))
    emit({ type: 'result', outcome })
    if (!outcome.ok) failures++
    return outcome
  }

  /** The result's title and first rows, when the model's answer did not come. */
  const fallbackAnswer = (outcome: ToolResult): string => {
    const rows = outcome.text.split('\n').slice(0, 6).join('\n')
    return `${rows}\n\n(The model did not finish its answer; these are the result's first lines.)`
  }

  const okResults = (): ToolResult[] => results.filter((r): r is ToolResult => r.ok)

  const checked = (text: string): LoopOutput => {
    const flags = checkAnswer(text, okResults(), turn.catalogue, {
      question: input.question,
      context: contextText(block)
    })
    return finish(text, 'answer', flags)
  }

  try {
    if (input.profile === 'compact') return checked(await compactTurn())
    if (input.mode === 'native') return checked(await nativeTurn())
    return checked(await structuredTurn())
  } catch (err) {
    if (err instanceof TurnEnd) return finish(err.message, err.outcome)
    throw err
  }

  // -------------------------------------------------------------------------------------------
  // The compact profile

  async function compactTurn(): Promise<string> {
    let cc = compactCall(block)!
    let widened = false
    let feedback: string | null = null
    let outcome: ToolOutcome | null = null
    while (outcome === null || !outcome.ok) {
      if (failures >= limits.failures)
        throw new TurnEnd('error', `The model could not make a valid call: ${feedbackOf(outcome)}`)
      const props = (cc.schema.properties!.args as Schema).properties ?? {}
      let args: Record<string, unknown> = {}
      if (Object.keys(props).length > 0) {
        const given = await compactArgs(cc, feedback)
        if (typeof given === 'string') {
          failures++
          feedback = given
          continue
        }
        args = given
      }
      const answer: CompactAnswer = compactAnswer(block, cc, args)
      if (answer.kind === 'other') {
        if (widened)
          throw new TurnEnd(
            'error',
            'None of the stats the app found fits the question; try naming the stat another way.'
          )
        // Ask spec §3.2 rule 5: re-resolve with the top 10 and ask once more.
        widened = true
        const wide = { ...deps, k: 10 }
        block = resolve(input.question, wide)
        cc = compactCall(block) ?? cc
        continue
      }
      outcome = await run(answer.name, answer.args)
      if (!outcome.ok) feedback = `The call failed: ${outcome.error}. Fix the arguments.`
    }
    briefKind = 'compact-answer'
    const reply = await model(
      {
        system: briefText('compact-answer', turn.now),
        messages: [
          {
            role: 'user',
            text: `Question: ${input.question}\n\nResult of ${outcome.tool}:\n${outcome.text}`
          }
        ]
      },
      true,
      limits.answerTokens
    )
    // An answer cut off (or all reasoning): the result's first lines say it instead.
    if (reply.stop === 'length' || reply.text.trim() === '') return fallbackAnswer(outcome)
    return reply.text.trim()
  }

  function feedbackOf(outcome: ToolOutcome | null): string {
    return outcome && !outcome.ok ? outcome.error : 'its replies did not fit the arguments'
  }

  /** The model's compact arguments, or what was wrong with its reply. */
  async function compactArgs(
    cc: NonNullable<ReturnType<typeof compactCall>>,
    feedback: string | null
  ): Promise<Record<string, unknown> | string> {
    const user = [contextText(block), `Question: ${input.question}`, feedback ?? '']
      .filter(Boolean)
      .join('\n\n')
    const argsSchema = cc.schema.properties!.args as Schema
    const system = briefText('compact-call', turn.now, {
      tool: cc.tool,
      description: cc.description
    })
    if (input.mode === 'native') {
      const reply = await model(
        {
          system,
          messages: [{ role: 'user', text: user }],
          tools: [{ name: cc.tool, description: cc.description, schema: argsSchema }]
        },
        false
      )
      const call = reply.calls[0]
      if (!call) return `Call ${cc.tool} with its arguments.`
      const problem = check(argsSchema, call.args)
      return problem ? `${problem}.` : (call.args as Record<string, unknown>)
    }
    const reply = await model(
      {
        system,
        messages: [{ role: 'user', text: user }],
        json: { name: cc.tool, schema: cc.schema }
      },
      false
    )
    const parsed = jsonOf(reply.text)
    const problem = check(cc.schema, parsed, 'reply')
    if (problem) return `Your reply did not fit: ${problem}. Reply with one JSON object.`
    return (parsed as { args: Record<string, unknown> }).args
  }

  // -------------------------------------------------------------------------------------------
  // The full profile

  function firstMessage(): ChatMessage {
    const parts = [contextText(block), `Question: ${input.question}`]
    return { role: 'user', text: parts.filter(Boolean).join('\n\n') }
  }

  async function nativeTurn(): Promise<string> {
    const tools = analyst.definitions(turn).map((d) => ({
      name: d.name,
      description: d.description,
      schema: listedSchema(d.schema) as Schema
    }))
    const system = briefText('analyst', turn.now)
    transcript.push(firstMessage())
    let stopping = false
    for (;;) {
      const reply = await model(
        { system, messages: [...input.history, ...transcript], tools },
        true
      )
      transcript.push({
        role: 'assistant',
        text: reply.text,
        calls: reply.calls,
        native: reply.native
      })
      if (reply.calls.length === 0 || stopping) return reply.text.trim()
      const replies: ToolReply[] = await Promise.all(
        reply.calls.map(async (c): Promise<ToolReply> => {
          if (calls.length >= limits.calls)
            return {
              id: c.id,
              name: c.name,
              text: 'The call limit is reached; answer from the results so far.',
              error: true
            }
          const outcome = await run(c.name, c.args)
          return outcome.ok
            ? { id: c.id, name: c.name, text: outcome.text, error: false }
            : { id: c.id, name: c.name, text: outcome.error, error: true }
        })
      )
      transcript.push({ role: 'tool', results: replies })
      if (failures >= limits.failures || calls.length >= limits.calls) {
        // One last call to answer from what there is.
        stopping = true
        transcript.push({
          role: 'user',
          text: 'Answer now from the results you have, or say what is missing. Do not call more tools.'
        })
      }
    }
  }

  async function structuredTurn(): Promise<string> {
    const defs = analyst.definitions(turn)
    const schema = stepSchema(defs.map((d) => d.name))
    const toolText = defs
      .map(
        (d) =>
          `- ${d.name}: ${d.description}\n  arguments: ${JSON.stringify(listedSchema(d.schema))}`
      )
      .join('\n')
    const system = `${briefText('analyst', turn.now)}\n\nTools:\n${toolText}\n\nReply with one JSON object: {"thought": "...", "tool": "<a tool, or answer when the results are enough>", "args": {...}}.`
    transcript.push(firstMessage())
    while (calls.length < limits.calls && failures < limits.failures) {
      const reply = await model(
        { system, messages: [...input.history, ...transcript], json: { name: 'step', schema } },
        false
      )
      transcript.push({ role: 'assistant', text: reply.text, calls: [] })
      const step = jsonOf(reply.text)
      const problem = check(schema, step, 'reply')
      if (problem) {
        failures++
        transcript.push({
          role: 'user',
          text: `Your reply did not fit: ${problem}. Reply with one JSON object.`
        })
        continue
      }
      const { tool, args } = step as { tool: string; args: unknown }
      if (tool === 'answer') break
      const outcome = await run(tool, args)
      transcript.push({
        role: 'user',
        text: outcome.ok
          ? `Result of ${tool}:\n${outcome.text}`
          : `The call failed: ${outcome.error}. Fix the arguments, or answer.`
      })
    }
    if (okResults().length === 0 && failures >= limits.failures)
      throw new TurnEnd('error', 'The model could not make a valid call.')
    transcript.push({
      role: 'user',
      text: 'Now write the answer for the question, from the results.'
    })
    const reply = await model(
      { system: briefText('analyst', turn.now), messages: [...input.history, ...transcript] },
      true
    )
    transcript.push({ role: 'assistant', text: reply.text, calls: [] })
    return reply.text.trim()
  }
}
````

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/loop.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/schema.ts src/main/analyst/mcp/server.ts src/main/analyst/loop.ts tests/main/analyst/loop.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/schema.ts src/main/analyst/mcp/server.ts src/main/analyst/loop.ts tests/main/analyst/loop.test.ts
git commit -m "feat(ask): the agent loop"
```

Expected: typecheck and lint clean; the suite at 1,350 passed, 7 skipped (a clean checkout).

---

### Task 7: Follow-ups (spec §4.1; amendment G)

The thread's last question and call carry into the next turn. In the unit suite the failing tests are the loop's. The set's 8 follow-ups run on the frozen database, with a perfect model (`tests/ask/perfect.ts`, moved out of `references.live.test.ts` so both gates share it).

**Files:**

- Create: `src/main/analyst/followup.ts`, `tests/ask/perfect.ts`, `tests/ask/followups.live.test.ts`
- Modify: `src/main/analyst/loop.ts`, `tests/main/analyst/loop.test.ts`, `tests/ask/references.live.test.ts`

- [ ] **Step 1: Write the tests**

Modify `tests/main/analyst/loop.test.ts`:

```diff
diff --git a/tests/main/analyst/loop.test.ts b/tests/main/analyst/loop.test.ts
index 2567e00..92e02ef 100644
--- a/tests/main/analyst/loop.test.ts
+++ b/tests/main/analyst/loop.test.ts
@@ -87,6 +87,7 @@ async function ask(
     mode: 'structured',
     reasoning: 'off',
     history: [],
+    last: null,
     signal: new AbortController().signal,
     emit: (e) => events.push(e),
     ...over
@@ -130,6 +131,7 @@ describe('the compact profile', () => {
     expect(events.map((e) => e.type)).toEqual(['call', 'result', 'text'])
     expect(out.trace.profile).toBe('compact')
     expect(out.trace.calls[0].ok).toBe(true)
+    expect(out.state).toEqual({ question: LEADERS, call: out.calls[0] })
   })
 
   it('flags a number that is not in the data', async () => {
@@ -174,6 +176,24 @@ describe('the compact profile', () => {
     expect(out.text).toContain('Puka Nacua')
     expect(out.text).toContain('did not finish its answer')
   })
+
+  it('carries a follow-up from the last call', async () => {
+    const p = scripted([
+      json({ thought: '', args: { metric: 'yprr', position: 'WR' } }),
+      { text: 'In 2024, Puka leads.' }
+    ])
+    const { out } = await ask('now 2024', p, {
+      last: {
+        question: 'Who leads WRs in yards per route run this season?',
+        call: { tool: 'leaderboard', args: { metric: 'yprr', position: 'WR', seasons: [2026] } }
+      }
+    })
+    expect(out.calls[0]).toEqual({
+      tool: 'leaderboard',
+      args: { metric: 'yprr', position: 'WR', seasons: [2024] }
+    })
+    expect(out.state.question).toBe('Who leads WRs in yards per route run this season?')
+  })
 })
 
 describe('the full profile, native tools', () => {
```

Create `tests/ask/perfect.ts`:

```ts
import type { CompactCall } from '@main/analyst/compact'

/**
 * A perfect model for the gates: the compact arguments that give a question's reference call, so the
 * resolver, the compact schema and the mapping back are measured without any model.
 */
/** A reference's situation arguments as the compact `filters` a perfect model would pick. */
export function flagsOf(args: Record<string, unknown>): string[] {
  const f: string[] = []
  for (const k of [
    'red_zone',
    'inside_10',
    'goal_line',
    'third_down',
    'pressure',
    'blitz',
    'play_action',
    'neutral',
    'two_minute'
  ]) {
    if (args[k] === true) f.push(k)
  }
  if (args.coverage) f.push(`${String(args.coverage)}_coverage`)
  if (args.home === true) f.push('home')
  if (args.home === false) f.push('road')
  const down = JSON.stringify(args.down ?? null)
  if (down === '[4]') f.push('fourth_down')
  if (down === '[1,2]') f.push('early_downs')
  return f
}

/** The slots the resolver fills, as the reference and the compact answer give them. */
const SLOTS = [
  'seasons',
  'weeks',
  'last_games',
  'season_type',
  'player',
  'team',
  'ids',
  'opponent',
  'rostered',
  'limit',
  'order',
  'side'
] as const

export function slotsOf(args: Record<string, unknown>, season: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of SLOTS) {
    let v = args[k]
    if (k === 'seasons' && v === undefined) v = [season]
    if (k === 'order' && v === undefined) v = 'best'
    if (k === 'ids' && Array.isArray(v)) v = [...v].sort()
    if (v !== undefined) out[k] = JSON.stringify(v)
  }
  return out
}

/** What a perfect model fills in a compact schema for this reference. */
export function perfectArgs(
  call: CompactCall,
  ref: Record<string, unknown>
): Record<string, unknown> {
  const props = (call.schema.properties!.args as { properties: Record<string, unknown> }).properties
  const model: Record<string, unknown> = {}
  if ('metric' in props) model.metric = ref.metric
  if ('metrics' in props) model.metrics = ref.metrics ?? ['default']
  if ('position' in props) model.position = ref.position ?? 'any'
  if ('by' in props) model.by = ref.by ?? 'none'
  if ('filters' in props) model.filters = flagsOf(ref)
  if ('what' in props) model.what = ref.what
  return model
}
```

Modify `tests/ask/references.live.test.ts`:

```diff
diff --git a/tests/ask/references.live.test.ts b/tests/ask/references.live.test.ts
index 9104fd7..506efd2 100644
--- a/tests/ask/references.live.test.ts
+++ b/tests/ask/references.live.test.ts
@@ -7,6 +7,7 @@ import { compactAnswer, compactCall } from '@main/analyst/compact'
 import { resolve } from '@main/analyst/resolve'
 import { createAnalyst, type TurnContext } from '@main/analyst/tools'
 import { openStatsService } from '@main/stats/service'
+import { perfectArgs, slotsOf } from './perfect'
 import { QUESTION_SET } from './questions'
 
 /**
@@ -28,59 +29,6 @@ const COMPACT: Record<string, string[]> = {
   describe: ['describe']
 }
 
-/** A reference's situation arguments as the compact `filters` a perfect model would pick. */
-function flagsOf(args: Record<string, unknown>): string[] {
-  const f: string[] = []
-  for (const k of [
-    'red_zone',
-    'inside_10',
-    'goal_line',
-    'third_down',
-    'pressure',
-    'blitz',
-    'play_action',
-    'neutral',
-    'two_minute'
-  ]) {
-    if (args[k] === true) f.push(k)
-  }
-  if (args.coverage) f.push(`${String(args.coverage)}_coverage`)
-  if (args.home === true) f.push('home')
-  if (args.home === false) f.push('road')
-  const down = JSON.stringify(args.down ?? null)
-  if (down === '[4]') f.push('fourth_down')
-  if (down === '[1,2]') f.push('early_downs')
-  return f
-}
-
-/** The slots the resolver fills, as the reference and the compact answer give them. */
-const SLOTS = [
-  'seasons',
-  'weeks',
-  'last_games',
-  'season_type',
-  'player',
-  'team',
-  'ids',
-  'opponent',
-  'rostered',
-  'limit',
-  'order',
-  'side'
-] as const
-
-function slotsOf(args: Record<string, unknown>, season: number): Record<string, string> {
-  const out: Record<string, string> = {}
-  for (const k of SLOTS) {
-    let v = args[k]
-    if (k === 'seasons' && v === undefined) v = [season]
-    if (k === 'order' && v === undefined) v = 'best'
-    if (k === 'ids' && Array.isArray(v)) v = [...v].sort()
-    if (v !== undefined) out[k] = JSON.stringify(v)
-  }
-  return out
-}
-
 const rowsOf = (r: ToolResult): number =>
   r.cards.reduce(
     (n, c) =>
@@ -182,16 +130,7 @@ describe.skipIf(!DB || !existsSync(DB))(
               q.category !== 'vague' &&
               q.category !== 'leading'
             ) {
-              const props = (
-                call.schema.properties!.args as { properties: Record<string, unknown> }
-              ).properties
-              const model: Record<string, unknown> = {}
-              if ('metric' in props) model.metric = ref.metric
-              if ('metrics' in props) model.metrics = ref.metrics ?? ['default']
-              if ('position' in props) model.position = ref.position ?? 'any'
-              if ('by' in props) model.by = ref.by ?? 'none'
-              if ('filters' in props) model.filters = flagsOf(ref)
-              if ('what' in props) model.what = ref.what
+              const model = perfectArgs(call, ref)
               const answer = compactAnswer(b, call, model)
               if (answer.kind === 'call') {
                 slotsAsked++
```

Create `tests/ask/followups.live.test.ts`:

```ts
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compactAnswer, compactCall } from '@main/analyst/compact'
import { followUp, isFollowUp } from '@main/analyst/followup'
import { resolve } from '@main/analyst/resolve'
import { createAnalyst } from '@main/analyst/tools'
import { openStatsService } from '@main/stats/service'
import { perfectArgs, slotsOf } from './perfect'
import { QUESTION_SET } from './questions'

/**
 * Plan AG1 (amendment G) on the frozen database: each follow-up of the question set, read with the
 * turn before it, gives its reference call when a perfect model fills the compact schema. Run with
 * `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask`.
 */
const DB = process.env.FFC_ASK_DB

describe.skipIf(!DB || !existsSync(DB))('follow-ups on the frozen database', () => {
  it('give their reference calls', { timeout: 300_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-ask-follow-'))
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
    const problems: Record<string, unknown>[] = []
    const items = QUESTION_SET.questions.filter((q) => q.previous && q.reference)
    try {
      const turn = await analyst.turn()
      const deps = { people: turn.people, now: turn.now }
      for (const q of items) {
        const fresh = resolve(q.question, deps)
        if (!isFollowUp(fresh)) {
          problems.push({ id: q.id, problem: 'not seen as a follow-up', type: fresh.type })
          continue
        }
        const b = followUp(
          q.question,
          { question: q.previous!.question, call: q.previous!.reference },
          deps
        )
        const call = compactCall(b)
        const ref = q.reference!
        if (!call || call.tool !== ref.tool) {
          problems.push({ id: q.id, problem: 'tool', got: call?.tool ?? null })
          continue
        }
        const want = ([] as unknown[]).concat(ref.args.metric ?? [], ref.args.metrics ?? [])
        const offered = b.metrics.map((m) => m.id)
        const missing = want.filter((m) => !offered.includes(String(m)))
        if (missing.length > 0)
          problems.push({ id: q.id, problem: 'metric not offered', missing, offered })
        const answer = compactAnswer(b, call, perfectArgs(call, ref.args))
        if (answer.kind !== 'call') continue
        const season = QUESTION_SET.frozen.season
        const a = slotsOf(ref.args, season)
        const g = slotsOf(answer.args, season)
        const wrong = [...new Set([...Object.keys(a), ...Object.keys(g)])].filter(
          (k) => a[k] !== g[k]
        )
        if (wrong.length > 0)
          problems.push({
            id: q.id,
            problem: 'slots',
            wrong: Object.fromEntries(wrong.map((k) => [k, { want: a[k], got: g[k] }]))
          })
      }
      // Fresh questions must not be taken for follow-ups.
      const fresh = QUESTION_SET.questions.filter((q) => !q.previous)
      const taken = fresh.filter((q) => isFollowUp(resolve(q.question, deps))).map((q) => q.id)
      console.log(JSON.stringify({ followups: items.length, problems, freshTaken: taken }, null, 1))
      expect(problems).toEqual([])
      expect(taken).toEqual([])
    } finally {
      await service.close()
    }
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/loop.test.ts
```

Expected: FAIL. 2 failed, 12 passed: "fills the classifier tool…" (`out.state`) and "carries a follow-up from the last call".

- [ ] **Step 3: The follow-up state, and the loop reads it**

Create `src/main/analyst/followup.ts`:

```ts
import type { AskCall } from '@shared/ask'
import { METRICS } from '@shared/stats/catalogue'
import { TOOL_OF } from './classify'
import { type ContextBlock, type NamedPlayer, resolve, type ResolveDeps } from './resolve'
import { padded } from './text'

/**
 * Follow-ups (Ask spec §4.1, thread state; Plan AG1 amendment G): "now 2024", "only in the red
 * zone", "and Gibbs?". The thread keeps its last question and call. A question that names no subject
 * of its own, or opens like a follow-up, is read together with the last question: the new words
 * replace what they name (time, players, situations, a split, the end of the scale, a limit) and the
 * rest carries over. The model then sees both questions and the last call; the compact profile keeps
 * the last tool and offers the metric candidates of both questions.
 */
export interface FollowState {
  question: string
  call: AskCall | null
}

const OPENERS =
  /^ (and|now|what about|how about|only|just|also|add|same|instead|then|but|by|vs|versus|compared to|without|with) /

/** Types a question keeps for itself even right after another: definitions, schedules, the league. */
const OWN_TYPES = new Set(['advice', 'out_of_range', 'definition', 'games', 'league'])

/** Words that make a question a ranking of its own ("most receiving yards", "WOPR leaders"). */
const RANKS =
  / (who|which|best|worst|most|fewest|least|top|leaders?|leads|highest|lowest|rank|ranked) /

/**
 * The new question continues the last one: it opens like a follow-up ("and Gibbs?", "now 2024",
 * "only in the red zone"), or it is a few words with no subject, position or ranking of its own.
 */
export function isFollowUp(block: ContextBlock): boolean {
  if (OWN_TYPES.has(block.type)) return false
  const t = padded(block.question)
  const words = block.question.trim().split(/\s+/).length
  if (words > 8) return false
  if (OPENERS.test(t)) return true
  const noSubject = block.players.length + block.ambiguous.length + block.teams.length === 0
  return words <= 3 && noSubject && block.positions.length === 0 && !RANKS.test(t)
}

const unique = <T>(xs: T[], key: (x: T) => string): T[] => {
  const seen = new Set<string>()
  return xs.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const ADDS = / (add|also|plus|and also|include) /

/** The block for a follow-up: the last question's, with what the new words name replaced. */
export function followUp(question: string, last: FollowState, deps: ResolveDeps): ContextBlock {
  const now = resolve(question, deps)
  const before = resolve(last.question, deps)
  // Metric candidates from both questions: "what about against the run?" alone names no metric.
  const both = resolve(`${last.question} ${question}`, deps)
  const k = deps.k ?? 5
  const adding = before.tool === 'compare' && ADDS.test(padded(question))
  const players: NamedPlayer[] = adding
    ? unique([...before.players, ...now.players], (p) => p.id)
    : now.players.length > 0
      ? now.players
      : before.players
  const tool =
    now.players.length > 0 && !adding && before.tool === 'compare' ? TOOL_OF[now.type] : before.tool
  const pick = <T>(mine: T[], theirs: T[]): T[] => (mine.length > 0 ? mine : theirs)
  return {
    ...before,
    question: `${last.question} → ${question}`,
    tool: now.decline || now.ambiguous.length > 0 ? null : tool,
    players: players.slice(0, 4),
    ambiguous: now.ambiguous,
    teams: pick(now.teams, before.teams),
    opponents: pick(now.opponents, before.opponents),
    positions: pick(now.positions, before.positions),
    time: now.time.said.length > 0 ? now.time : before.time,
    slots: {
      flags: unique([...before.slots.flags, ...now.slots.flags], (f) => f),
      groupings: pick(now.slots.groupings, before.slots.groupings),
      rostered: now.slots.rostered ?? before.slots.rostered,
      limit: now.slots.limit ?? before.slots.limit,
      end: now.slots.end ?? before.slots.end,
      side: now.slots.side ?? before.slots.side
    },
    // The last call's metric stays a choice: "only in the red zone" names red-zone metrics, but the
    // question is still about targets.
    metrics: unique(
      [...lastMetrics(last, before), ...now.metrics, ...both.metrics],
      (m) => m.id
    ).slice(0, k),
    decline: now.decline
  }
}

/** The last call's metrics as candidates, in the order the call named them. */
function lastMetrics(last: FollowState, before: ContextBlock): ContextBlock['metrics'] {
  const args = (last.call?.args ?? {}) as { metric?: unknown; metrics?: unknown }
  const ids = ([] as unknown[]).concat(args.metric ?? [], args.metrics ?? []).map(String)
  return ids
    .flatMap((id) => {
      const m = METRICS.get(id)
      return m ? [{ id: m.id, label: m.label, entity: m.entity, description: m.description }] : []
    })
    .concat(before.metrics.filter((m) => ids.length === 0 && m))
}

/** What the model reads about the last turn (the full profile). */
export function lastTurnText(last: FollowState): string {
  const call = last.call
    ? ` The last call was ${last.call.tool} ${JSON.stringify(last.call.args)}.`
    : ''
  return `This question follows: "${last.question}".${call} Keep what the new question does not change.`
}
```

Modify `src/main/analyst/loop.ts`:

```diff
diff --git a/src/main/analyst/loop.ts b/src/main/analyst/loop.ts
index dc40711..15eb4da 100644
--- a/src/main/analyst/loop.ts
+++ b/src/main/analyst/loop.ts
@@ -12,6 +12,7 @@ import type {
 import { type BriefKind, briefHash, briefText } from './brief'
 import { checkAnswer } from './checks'
 import { type CompactAnswer, compactAnswer, compactCall } from './compact'
+import { type FollowState, followUp, isFollowUp, lastTurnText } from './followup'
 import { type ProviderError, ProviderError as ProviderErrorClass } from './providers/types'
 import type { ChatMessage, ChatReply, ChatRequest, Provider, ToolReply } from './providers/types'
 import { type ContextBlock, contextText, resolve } from './resolve'
@@ -23,7 +24,7 @@ import { resolverTrace, type Trace, traceCall } from './trace'
  * The agent loop (Ask spec §5.1): one loop for every model, with the planning and the checking in
  * code. A turn:
  *
- *   1. the resolver reads the question; an ambiguous name is
+ *   1. the resolver reads the question (and, for a follow-up, the last one); an ambiguous name is
  *      asked back and advice or an out-of-range season declined, with no model call;
  *   2. the model gets the brief, the context block and the tools of its profile;
  *   3. the calls run (in parallel when a step makes several); a failed call goes back to the model
@@ -67,6 +68,8 @@ export interface LoopInput {
   reasoning: Reasoning
   /** The thread's earlier turns, as the full profile resends them. */
   history: ChatMessage[]
+  /** The thread's last question and call (follow-ups). */
+  last: FollowState | null
   limits?: Partial<LoopLimits>
   signal: AbortSignal
   emit: (event: AskEvent) => void
@@ -82,6 +85,7 @@ export interface LoopOutput {
   ms: number
   /** This turn's messages, for the next turn's history. */
   transcript: ChatMessage[]
+  state: FollowState
   trace: Trace
 }
 
@@ -150,7 +154,9 @@ export async function askTurn(input: LoopInput): Promise<LoopOutput> {
   const { provider, analyst, emit } = input
   const turn: TurnContext = await analyst.turn()
   const deps = { people: turn.people, now: turn.now }
-  let block = resolve(input.question, deps)
+  const fresh = resolve(input.question, deps)
+  const follow = input.last !== null && isFollowUp(fresh)
+  let block = follow ? followUp(input.question, input.last!, deps) : fresh
 
   const calls: AskCall[] = []
   const results: ToolOutcome[] = []
@@ -165,6 +171,7 @@ export async function askTurn(input: LoopInput): Promise<LoopOutput> {
     outcome: LoopOutput['outcome'],
     flags: AskFlag[] = []
   ): LoopOutput => {
+    const last = calls.length > 0 ? calls[calls.length - 1] : (input.last?.call ?? null)
     return {
       text,
       outcome,
@@ -174,6 +181,7 @@ export async function askTurn(input: LoopInput): Promise<LoopOutput> {
       tokens,
       ms: Date.now() - started,
       transcript,
+      state: { question: follow ? input.last!.question : input.question, call: last },
       trace: {
         at: new Date(started).toISOString(),
         question: input.question,
@@ -296,7 +304,7 @@ export async function askTurn(input: LoopInput): Promise<LoopOutput> {
         // Ask spec §3.2 rule 5: re-resolve with the top 10 and ask once more.
         widened = true
         const wide = { ...deps, k: 10 }
-        block = resolve(input.question, wide)
+        block = follow ? followUp(input.question, input.last!, wide) : resolve(input.question, wide)
         cc = compactCall(block) ?? cc
         continue
       }
@@ -331,7 +339,12 @@ export async function askTurn(input: LoopInput): Promise<LoopOutput> {
     cc: NonNullable<ReturnType<typeof compactCall>>,
     feedback: string | null
   ): Promise<Record<string, unknown> | string> {
-    const user = [contextText(block), `Question: ${input.question}`, feedback ?? '']
+    const user = [
+      contextText(block),
+      follow ? lastTurnText(input.last!) : '',
+      `Question: ${input.question}`,
+      feedback ?? ''
+    ]
       .filter(Boolean)
       .join('\n\n')
     const argsSchema = cc.schema.properties!.args as Schema
@@ -371,7 +384,11 @@ export async function askTurn(input: LoopInput): Promise<LoopOutput> {
   // The full profile
 
   function firstMessage(): ChatMessage {
-    const parts = [contextText(block), `Question: ${input.question}`]
+    const parts = [
+      contextText(block),
+      follow ? lastTurnText(input.last!) : '',
+      `Question: ${input.question}`
+    ]
     return { role: 'user', text: parts.filter(Boolean).join('\n\n') }
   }
 
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/loop.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 5: The follow-ups on the frozen database**

```bash
FFC_ASK_DB=~/ffc-ask/stats.duckdb npx vitest run tests/ask/followups.live.test.ts
```

Expected: PASS. 1 test: all 8 follow-ups give their reference calls, and none of the other 155 questions is taken for one (the test fails otherwise).

- [ ] **Step 6: Check and commit**

```bash
npx prettier --write src/main/analyst/followup.ts src/main/analyst/loop.ts tests/main/analyst/loop.test.ts tests/ask/perfect.ts tests/ask/references.live.test.ts tests/ask/followups.live.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/followup.ts src/main/analyst/loop.ts tests/main/analyst/loop.test.ts tests/ask/perfect.ts tests/ask/references.live.test.ts tests/ask/followups.live.test.ts
git commit -m "feat(ask): follow-ups carry the last call"
```

Expected: typecheck and lint clean; the suite at 1,351 passed, 8 skipped (a clean checkout).

---

### Task 8: Examples and sample-k, off by default (spec §5.1, §5.3; amendment H)

The retrieval goes into the compact prompt when `examples` is set, and an invalid first reply is re-sampled when `sampleK` is set. Plan AG2 measures both. The failing test here is sample-k's; `examples.ts` has no test in the prototype (Open point 4).

**Files:**

- Create: `src/main/analyst/examples.ts`
- Modify: `src/main/analyst/loop.ts`, `tests/main/analyst/loop.test.ts`

- [ ] **Step 1: Write the test**

Modify `tests/main/analyst/loop.test.ts`:

```diff
diff --git a/tests/main/analyst/loop.test.ts b/tests/main/analyst/loop.test.ts
index 92e02ef..16e1db1 100644
--- a/tests/main/analyst/loop.test.ts
+++ b/tests/main/analyst/loop.test.ts
@@ -88,6 +88,8 @@ async function ask(
     reasoning: 'off',
     history: [],
     last: null,
+    examples: null,
+    sampleK: false,
     signal: new AbortController().signal,
     emit: (e) => events.push(e),
     ...over
@@ -167,6 +169,17 @@ describe('the compact profile', () => {
     expect(last.role === 'user' && last.text).toContain('Your reply did not fit')
   })
 
+  it('re-samples an invalid first reply with sample-k on', async () => {
+    const p = scripted([
+      { text: 'oops' },
+      json({ thought: '', args: { metric: 'yprr', position: 'WR' } }),
+      { text: 'Puka leads.' }
+    ])
+    const { out } = await ask(LEADERS, p, { sampleK: true })
+    expect(out.outcome).toBe('answer')
+    expect(p.requests[1].messages).toEqual(p.requests[0].messages)
+  })
+
   it('answers from the result when the model runs out of room', async () => {
     const p = scripted([
       json({ thought: '', args: { metric: 'yprr', position: 'WR' } }),
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx vitest run tests/main/analyst/loop.test.ts
```

Expected: FAIL. 1 failed, 14 passed: "re-samples an invalid first reply with sample-k on".

- [ ] **Step 3: The retrieval, and the loop's seam**

Create `src/main/analyst/examples.ts`:

```ts
import type { AskExample } from '@main/db/repos/askExamples'

/**
 * The example library (Ask spec §5.3, report D9; Plan AG1 amendment H): verified question → call
 * pairs, retrieved by the masked question ("who leads {position} in {metric} since week {n}"), the
 * top 3 shown to the compact prompt. Off by default; Plan AG2 measures whether it helps. An
 * evaluation run passes its own questions in `exclude`, so the set never grades its own answers.
 */
const words = (masked: string): Set<string> =>
  new Set(
    masked
      .toLowerCase()
      .split(/[^a-z{}]+/)
      .filter((w) => w.length > 1)
  )

/** Jaccard similarity of the masked questions' words. */
export function similarity(a: string, b: string): number {
  const x = words(a)
  const y = words(b)
  if (x.size === 0 || y.size === 0) return 0
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / (x.size + y.size - both)
}

/** Below this, an example says nothing about the question. */
const MIN_SIMILARITY = 0.3

export function similarExamples(
  masked: string,
  tool: string | null,
  library: AskExample[],
  opts: { k?: number; exclude?: ReadonlySet<string> } = {}
): AskExample[] {
  const exclude = opts.exclude ?? new Set<string>()
  return library
    .filter((e) => !exclude.has(e.question.trim().toLowerCase()) && (!tool || e.tool === tool))
    .map((e) => ({ e, score: similarity(masked, e.masked) }))
    .filter((x) => x.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score || b.e.verifiedAt.localeCompare(a.e.verifiedAt))
    .slice(0, opts.k ?? 3)
    .map((x) => x.e)
}

/** The examples as the compact prompt shows them. */
export function examplesText(examples: AskExample[]): string {
  if (examples.length === 0) return ''
  const lines = examples.map((e) => `- "${e.masked}" → ${e.tool} ${JSON.stringify(e.args)}`)
  return `Questions like this one were answered with:\n${lines.join('\n')}`
}
```

Modify `src/main/analyst/loop.ts`:

```diff
diff --git a/src/main/analyst/loop.ts b/src/main/analyst/loop.ts
index 15eb4da..606b6af 100644
--- a/src/main/analyst/loop.ts
+++ b/src/main/analyst/loop.ts
@@ -9,16 +9,18 @@ import type {
   ToolProfile,
   ToolResult
 } from '@shared/ask'
+import type { AskExample } from '@main/db/repos/askExamples'
 import { type BriefKind, briefHash, briefText } from './brief'
 import { checkAnswer } from './checks'
 import { type CompactAnswer, compactAnswer, compactCall } from './compact'
+import { examplesText } from './examples'
 import { type FollowState, followUp, isFollowUp, lastTurnText } from './followup'
 import { type ProviderError, ProviderError as ProviderErrorClass } from './providers/types'
 import type { ChatMessage, ChatReply, ChatRequest, Provider, ToolReply } from './providers/types'
 import { type ContextBlock, contextText, resolve } from './resolve'
 import { check, listedSchema, type Schema } from './schema'
 import { type Analyst, toolsHash, type TurnContext } from './tools'
-import { resolverTrace, type Trace, traceCall } from './trace'
+import { maskQuestion, resolverTrace, type Trace, traceCall } from './trace'
 
 /**
  * The agent loop (Ask spec §5.1): one loop for every model, with the planning and the checking in
@@ -70,6 +72,10 @@ export interface LoopInput {
   history: ChatMessage[]
   /** The thread's last question and call (follow-ups). */
   last: FollowState | null
+  /** The example library (off: null). */
+  examples: ((masked: string, tool: string | null) => AskExample[]) | null
+  /** Re-sample an invalid first call instead of re-prompting (spec §5.1; off by default). */
+  sampleK: boolean
   limits?: Partial<LoopLimits>
   signal: AbortSignal
   emit: (event: AskEvent) => void
@@ -279,6 +285,7 @@ export async function askTurn(input: LoopInput): Promise<LoopOutput> {
     let cc = compactCall(block)!
     let widened = false
     let feedback: string | null = null
+    let sampled = false
     let outcome: ToolOutcome | null = null
     while (outcome === null || !outcome.ok) {
       if (failures >= limits.failures)
@@ -288,6 +295,11 @@ export async function askTurn(input: LoopInput): Promise<LoopOutput> {
       if (Object.keys(props).length > 0) {
         const given = await compactArgs(cc, feedback)
         if (typeof given === 'string') {
+          // An invalid reply: re-sample once when asked to, otherwise say what was wrong.
+          if (input.sampleK && !sampled) {
+            sampled = true
+            continue
+          }
           failures++
           feedback = given
           continue
@@ -339,9 +351,13 @@ export async function askTurn(input: LoopInput): Promise<LoopOutput> {
     cc: NonNullable<ReturnType<typeof compactCall>>,
     feedback: string | null
   ): Promise<Record<string, unknown> | string> {
+    const examples = input.examples
+      ? examplesText(input.examples(maskQuestion(block), cc.tool))
+      : ''
     const user = [
       contextText(block),
       follow ? lastTurnText(input.last!) : '',
+      examples,
       `Question: ${input.question}`,
       feedback ?? ''
     ]
```

- [ ] **Step 4: Run it and see it pass**

```bash
npx vitest run tests/main/analyst/loop.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/examples.ts src/main/analyst/loop.ts tests/main/analyst/loop.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/examples.ts src/main/analyst/loop.ts tests/main/analyst/loop.test.ts
git commit -m "feat(ask): examples and sample-k, off by default"
```

Expected: typecheck and lint clean; the suite at 1,352 passed, 8 skipped (a clean checkout).

---

### Task 9: Service and IPC (spec §5.3, §6.2; amendments G, I)

The providers and their keys, one turn at a time with Stop, the threads and their follow-up state, and the trace in Dev mode. `createProvider` builds a provider from its settings. `main/index.ts` makes one analyst for MCP and the loop. The tests run the service on a real `companion.db` in memory, with a fake OpenAI-compatible server.

**Files:**

- Create: `src/main/analyst/providers/index.ts`, `src/main/analyst/askService.ts`, `src/main/analyst/askIpc.ts`, `tests/main/analyst/askService.test.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/analyst/askService.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AskEvent, ProviderInput } from '@shared/ask'
import { type Db, openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getAskProviderKey } from '@main/db/repos/askProviders'
import { type AskService, createAskService } from '@main/analyst/askService'
import { type KeyStore, NO_KEY_STORE } from '@main/analyst/keys'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult, statsRow } from '../../fixtures/analyst'

const stats: AnalystStats = {
  status: async () => ({
    available: true,
    through: { season: 2026, seasonType: 'REG', week: 7 },
    updatedAt: '2026-10-27T00:00:00Z',
    busy: false
  }),
  catalogue: async () => catalogueInfo(new Map()),
  people: async () => PEOPLE,
  query: async () =>
    statsResult([
      statsRow('00-0039075', 'Puka Nacua', { yprr: { raw: 3.1, sample: 210, rank: 1 } })
    ]),
  games: async () => [],
  outlook: async () => {
    throw new Error('not in this test')
  },
  player: async () => {
    throw new Error('not in this test')
  }
}

const keys = (on = true): KeyStore => ({
  available: () => on,
  encrypt: (k) => new TextEncoder().encode(`enc:${k}`),
  decrypt: (c) => new TextDecoder().decode(c).replace(/^enc:/, '')
})

/** An OpenAI-compatible server: each request gets the next reply (as one SSE text chunk). */
function server(replies: (string | ((body: Record<string, unknown>) => string))[]): {
  fetch: typeof fetch
  bodies: Record<string, unknown>[]
  auth: (string | null)[]
} {
  const bodies: Record<string, unknown>[] = []
  const auth: (string | null)[] = []
  let at = 0
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url)
    auth.push(new Headers(init?.headers).get('authorization'))
    if (href.endsWith('/models')) return Response.json({ data: [{ id: 'm-1' }, { id: 'm-0' }] })
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    bodies.push(body)
    const signal = init?.signal
    const next = replies[Math.min(at++, replies.length - 1)]
    if (next === 'hang')
      return new Promise<Response>((_, reject) =>
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      )
    const text = typeof next === 'function' ? next(body) : next
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`
    return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch
  return { fetch: f, bodies, auth }
}

const GROQ: ProviderInput = {
  kind: 'openai',
  preset: 'groq',
  label: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'm-1',
  profile: 'compact',
  mode: 'structured',
  reasoning: 'off'
}

const CALL = JSON.stringify({ thought: '', args: { metric: 'yprr', position: 'WR' } })

function service(
  fetch: typeof globalThis.fetch,
  over: { dev?: boolean; keys?: KeyStore } = {}
): { ask: AskService; db: Db; userData: string } {
  const db = openDatabase(':memory:')
  migrate(db)
  const userData = mkdtempSync(join(tmpdir(), 'ffc-ask-service-'))
  const ask = createAskService({
    db,
    analyst: createAnalyst({ stats, league: () => null }),
    keys: over.keys ?? keys(),
    userData,
    devMode: () => over.dev ?? false,
    fetch,
    detect: async () => []
  })
  return { ask, db, userData }
}

describe('providers and keys', () => {
  it('stores a key encrypted and never hands it back', () => {
    const { ask, db } = service(server([]).fetch)
    const p = ask.saveProvider({ ...GROQ, key: ' gsk-secret ' })
    expect(p.hasKey).toBe(true)
    expect(JSON.stringify(ask.providers())).not.toContain('gsk-secret')
    expect(new TextDecoder().decode(getAskProviderKey(db, p.id)!)).toBe('enc:gsk-secret')
    expect(ask.saveProvider({ ...GROQ, id: p.id, key: '' }).hasKey).toBe(false)
  })

  it('refuses a key it cannot encrypt', () => {
    const { ask } = service(server([]).fetch, { keys: keys(false) })
    expect(() => ask.saveProvider({ ...GROQ, key: 'k' })).toThrow(NO_KEY_STORE)
  })

  it('lists models with the key being typed, or the saved one', async () => {
    const s = server([])
    const { ask } = service(s.fetch)
    expect((await ask.models({ ...GROQ, key: 'typed' })).map((m) => m.id)).toEqual(['m-0', 'm-1'])
    const p = ask.saveProvider({ ...GROQ, key: 'saved' })
    await ask.models({ ...GROQ, id: p.id })
    expect(s.auth).toEqual(['Bearer typed', 'Bearer saved'])
  })
})

describe('asking', () => {
  it('needs a model first', async () => {
    const { ask } = service(server([]).fetch)
    await expect(ask.send(null, 'Who leads WRs in YPRR?', () => {})).rejects.toThrow(
      'Set up a model first'
    )
  })

  it('answers in a new thread and keeps the turn for a follow-up', async () => {
    const s = server([CALL, 'Puka Nacua leads with 3.10.', CALL, 'In 2024, Puka leads.'])
    const { ask } = service(s.fetch)
    ask.saveProvider({ ...GROQ, key: 'k' })
    const events: AskEvent[] = []
    const first = await ask.send(null, 'Who leads WRs in yards per route run this season?', (e) =>
      events.push(e)
    )
    expect(first.outcome).toBe('answer')
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(ask.threads()).toHaveLength(1)
    const second = await ask.send(first.threadId, 'now 2024', () => {})
    expect(second.calls[0]).toMatchObject({ tool: 'leaderboard', args: { seasons: [2024] } })
    expect(JSON.stringify(s.bodies[2].messages)).toContain('This question follows')
    expect(ask.messages(first.threadId).map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant'
    ])
  })

  it('resends the thread to the full profile', async () => {
    const s = server(['First answer.', 'Second answer.'])
    const { ask } = service(s.fetch)
    ask.saveProvider({ ...GROQ, profile: 'full', mode: 'native', key: 'k' })
    const first = await ask.send(null, 'Who leads WRs in yards per route run?', () => {})
    await ask.send(first.threadId, 'Who leads TEs in targets per route run?', () => {})
    const sent = s.bodies[1].messages as { role: string; content: string | null }[]
    expect(sent.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(sent[2].content).toBe('First answer.')
  })

  it('stops a running turn', async () => {
    const s = server(['hang'])
    const { ask } = service(s.fetch)
    ask.saveProvider({ ...GROQ, key: 'k' })
    const pending = ask.send(null, 'Who leads WRs in yards per route run?', () => {})
    await new Promise((r) => setTimeout(r, 20))
    ask.stop()
    expect((await pending).outcome).toBe('stopped')
  })

  it('writes the trace in Dev mode, with no key in it', async () => {
    const s = server([CALL, 'Puka leads.'])
    const { ask, userData } = service(s.fetch, { dev: true })
    ask.saveProvider({ ...GROQ, key: 'gsk-secret' })
    await ask.send(null, 'Who leads WRs in yards per route run?', () => {})
    const log = join(userData, 'ask', 'log.jsonl')
    expect(existsSync(log)).toBe(true)
    const text = readFileSync(log, 'utf8')
    expect(JSON.parse(text.trim()).calls[0].tool).toBe('leaderboard')
    expect(text).not.toContain('gsk-secret')
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/askService.test.ts
```

Expected: FAIL. Cannot find package '@main/analyst/askService'; no tests run.

- [ ] **Step 3: The service, its IPC, the wiring**

Create `src/main/analyst/providers/index.ts`:

```ts
import type { ModelInfo, ProviderInput, ProviderSettings } from '@shared/ask'
import { anthropic } from './anthropic'
import { ollama, ollamaModel } from './ollama'
import { openAiCompatible } from './openaiCompatible'
import { PRESETS } from '@shared/askPresets'
import type { Fetch, Provider } from './types'

/**
 * A provider from its settings (Ask spec §6.2). The key is passed in decrypted for this request only;
 * Ollama models are looked up for their capabilities, so `think` and `tools` are only sent to a model
 * that takes them.
 */
export type ProviderSpec = Pick<
  ProviderSettings | ProviderInput,
  'kind' | 'preset' | 'baseUrl' | 'model' | 'profile'
>

/** The context Ollama loads a model with: the full profile's tools need room (spec §3.2). */
export const OLLAMA_CONTEXT = { compact: 8192, full: 32768 } as const

export async function createProvider(
  s: ProviderSpec,
  key: string | null,
  doFetch: Fetch = fetch
): Promise<Provider> {
  const base = s.baseUrl.replace(/\/+$/, '')
  switch (s.kind) {
    case 'anthropic':
      if (!key) throw new Error('Add your Anthropic API key first.')
      return anthropic({ model: s.model, key, ...(base ? { baseUrl: base } : {}), fetch: doFetch })
    case 'openai':
      return openAiCompatible({
        name: PRESETS[s.preset ?? 'custom'].label,
        baseUrl: base,
        model: s.model,
        key,
        reasoning: true,
        fetch: doFetch
      })
    case 'lmstudio':
      return openAiCompatible({
        name: 'LM Studio',
        baseUrl: `${base}/v1`,
        model: s.model,
        key: null,
        reasoning: false,
        fetch: doFetch
      })
    case 'ollama': {
      let info: ModelInfo | null = null
      try {
        info = await ollamaModel(base, s.model, AbortSignal.timeout(5000), doFetch)
      } catch {
        // Not running: the call itself says so.
      }
      return ollama({
        baseUrl: base,
        model: s.model,
        info,
        context: OLLAMA_CONTEXT[s.profile],
        fetch: doFetch
      })
    }
  }
}
```

Create `src/main/analyst/askService.ts`:

```ts
import { join } from 'node:path'
import type {
  AskEvent,
  AskMessage,
  AskOptions,
  AskThread,
  LocalServer,
  ModelInfo,
  ProviderInput,
  ProviderSettings
} from '@shared/ask'
import type { Db } from '@main/db/connection'
import { listAskExamples } from '@main/db/repos/askExamples'
import {
  activateAskProvider,
  activeAskProvider,
  deleteAskProvider,
  getAskProvider,
  getAskProviderKey,
  listAskProviders,
  saveAskProvider
} from '@main/db/repos/askProviders'
import {
  addAskMessage,
  createAskThread,
  deleteAskThread,
  listAskMessages,
  listAskThreads,
  listAskTurns
} from '@main/db/repos/askThreads'
import { getSetting, setSetting } from '@main/db/repos/settings'
import { similarExamples } from './examples'
import type { FollowState } from './followup'
import { type KeyStore, NO_KEY_STORE } from './keys'
import { askTurn } from './loop'
import { detectLocalServers } from './providers/detect'
import { createProvider } from './providers/index'
import type { ChatMessage, Fetch, Provider } from './providers/types'
import type { Analyst } from './tools'
import { appendTrace } from './trace'

/**
 * Ask in the app (Ask spec §5, §6.2; Plan AG1): the providers and their keys, the threads, and one
 * turn at a time through the loop, with Stop. Keys are decrypted only to build a request's provider
 * and never leave main.
 */
export const SETTING_ASK_EXAMPLES = 'ask_examples'
export const SETTING_ASK_SAMPLE_K = 'ask_sample_k'

export interface AskServiceDeps {
  db: Db
  /** Null when the stats database could not be opened. */
  analyst: Analyst | null
  keys: KeyStore
  userData: string
  devMode: () => boolean
  fetch?: Fetch
  detect?: () => Promise<LocalServer[]>
  now?: () => Date
}

export interface TestResult {
  ok: boolean
  message: string
  ms: number
}

export interface AskService {
  providers(): ProviderSettings[]
  saveProvider(input: ProviderInput & { id?: number }): ProviderSettings
  removeProvider(id: number): void
  activate(id: number): void
  /** The models a provider offers; `input` may be unsaved (its key, or the saved one's). */
  models(input: ProviderInput & { id?: number }): Promise<ModelInfo[]>
  detect(): Promise<LocalServer[]>
  /** One short call to the provider: is the key right, is the server up, how long it takes. */
  test(id: number): Promise<TestResult>
  /** Asks in a thread (a new one when `threadId` is null); resolves to the answer. */
  send(threadId: number | null, question: string, emit: (e: AskEvent) => void): Promise<AskMessage>
  /** Stops the turn that is running. */
  stop(): void
  threads(): AskThread[]
  messages(threadId: number): AskMessage[]
  deleteThread(id: number): void
  options(): AskOptions
  setOptions(o: AskOptions): AskOptions
}

const NOT_AVAILABLE =
  'The stats database could not be opened on this computer, so there is nothing to ask about.'

/** A thread's title: the question's start. */
const titleOf = (q: string): string => (q.length <= 60 ? q : `${q.slice(0, 57).trimEnd()}…`)

export function createAskService(deps: AskServiceDeps): AskService {
  const now = deps.now ?? (() => new Date())
  const doFetch = deps.fetch ?? fetch
  let running: AbortController | null = null

  function keyOf(id: number): string | null {
    const cipher = getAskProviderKey(deps.db, id)
    return cipher ? deps.keys.decrypt(cipher) : null
  }

  async function providerOf(s: ProviderSettings): Promise<Provider> {
    return createProvider(s, keyOf(s.id), doFetch)
  }

  /** The thread's earlier turns as this provider resends them, and its last question and call. */
  function threadState(
    threadId: number,
    providerId: number
  ): { history: ChatMessage[]; last: FollowState | null } {
    const history: ChatMessage[] = []
    let last: FollowState | null = null
    let question: string | null = null
    for (const { message, turn } of listAskTurns(deps.db, threadId)) {
      if (message.role === 'user') {
        question = message.text
        continue
      }
      if (turn.transcript && turn.providerId === providerId)
        history.push(...(turn.transcript as ChatMessage[]))
      else if (question !== null)
        history.push(
          { role: 'user', text: question },
          { role: 'assistant', text: message.text, calls: [] }
        )
      if (turn.state) last = turn.state as FollowState
      question = null
    }
    return { history, last }
  }

  function options(): AskOptions {
    return {
      examples: getSetting(deps.db, SETTING_ASK_EXAMPLES) === '1',
      sampleK: getSetting(deps.db, SETTING_ASK_SAMPLE_K) === '1'
    }
  }

  return {
    providers: () => listAskProviders(deps.db),

    saveProvider(input) {
      const { key, ...settings } = input
      let cipher: Uint8Array | null | undefined
      if (key === '') cipher = null
      else if (key !== undefined) {
        if (!deps.keys.available()) throw new Error(NO_KEY_STORE)
        cipher = deps.keys.encrypt(key.trim())
      }
      return saveAskProvider(deps.db, settings, cipher)
    },

    removeProvider: (id) => deleteAskProvider(deps.db, id),
    activate: (id) => activateAskProvider(deps.db, id),

    async models(input) {
      const key = input.key ?? (input.id !== undefined ? keyOf(input.id) : null)
      const p = await createProvider(input, key || null, doFetch)
      return p.models(AbortSignal.timeout(15_000))
    },

    detect: () => (deps.detect ?? (() => detectLocalServers(doFetch)))(),

    async test(id) {
      const s = getAskProvider(deps.db, id)
      if (!s) throw new Error(`there is no provider ${id}`)
      const started = Date.now()
      try {
        const p = await providerOf(s)
        const reply = await p.chat(
          {
            system: 'Reply with the single word OK.',
            messages: [{ role: 'user', text: 'Are you there?' }],
            maxTokens: 256,
            reasoning: 'off'
          },
          AbortSignal.timeout(60_000)
        )
        return {
          ok: true,
          message: `${p.label} answered "${reply.text.slice(0, 40)}" (${reply.usage.input} tokens in, ${reply.usage.output} out)`,
          ms: Date.now() - started
        }
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          ms: Date.now() - started
        }
      }
    },

    async send(threadId, question, emit) {
      if (!deps.analyst) throw new Error(NOT_AVAILABLE)
      if (running) throw new Error('A question is still being answered; stop it first.')
      const settings = activeAskProvider(deps.db)
      if (!settings) throw new Error('Set up a model first (Stats › Ask › Model).')
      const q = question.trim()
      if (!q) throw new Error('Ask a question first.')
      const thread = threadId ?? createAskThread(deps.db, titleOf(q), now().toISOString()).id
      const { history, last } = threadState(thread, settings.id)
      addAskMessage(deps.db, {
        threadId: thread,
        role: 'user',
        text: q,
        calls: [],
        results: [],
        flags: [],
        outcome: null,
        model: null,
        tokens: null,
        ms: null,
        createdAt: now().toISOString()
      })
      const controller = new AbortController()
      running = controller
      try {
        const opts = options()
        const library = opts.examples ? listAskExamples(deps.db) : []
        const out = await askTurn({
          question: q,
          provider: await providerOf(settings),
          analyst: deps.analyst,
          profile: settings.profile,
          mode: settings.mode,
          reasoning: settings.reasoning,
          history: settings.profile === 'full' ? history : [],
          last,
          examples: opts.examples ? (masked, tool) => similarExamples(masked, tool, library) : null,
          sampleK: opts.sampleK,
          signal: controller.signal,
          emit
        })
        if (deps.devMode()) appendTrace(join(deps.userData, 'ask'), out.trace)
        const message = addAskMessage(
          deps.db,
          {
            threadId: thread,
            role: 'assistant',
            text: out.text,
            calls: out.calls,
            results: out.results,
            flags: out.flags,
            outcome: out.outcome,
            model: out.trace.model,
            tokens: out.tokens,
            ms: out.ms,
            createdAt: now().toISOString()
          },
          { providerId: settings.id, transcript: out.transcript, state: out.state }
        )
        emit({ type: 'done', message })
        return message
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        emit({ type: 'error', error })
        throw err
      } finally {
        running = null
      }
    },

    stop: () => running?.abort(),
    threads: () => listAskThreads(deps.db),
    messages: (threadId) => listAskMessages(deps.db, threadId),
    deleteThread: (id) => deleteAskThread(deps.db, id),
    options,
    setOptions(o) {
      setSetting(deps.db, SETTING_ASK_EXAMPLES, o.examples ? '1' : '0')
      setSetting(deps.db, SETTING_ASK_SAMPLE_K, o.sampleK ? '1' : '0')
      return options()
    }
  }
}
```

Create `src/main/analyst/askIpc.ts`:

```ts
import { type BrowserWindow, ipcMain, shell } from 'electron'
import type { AskEvent, AskOptions, ProviderInput } from '@shared/ask'
import { IPC } from '@shared/ipc'
import type { AskService } from './askService'
import { ANTHROPIC_DASHBOARD, PRESETS } from '@shared/askPresets'

/** Ask in the app (Plan AG1): the providers, the turns (streamed as `ask:event`) and the threads. */
export function registerAskHandlers(ask: AskService, getWindow: () => BrowserWindow | null): void {
  const emit = (event: AskEvent): void => getWindow()?.webContents.send(IPC.askEvent, event)
  ipcMain.handle(IPC.askProviders, () => ask.providers())
  ipcMain.handle(IPC.askSaveProvider, (_e, input: ProviderInput & { id?: number }) =>
    ask.saveProvider(input)
  )
  ipcMain.handle(IPC.askRemoveProvider, (_e, id: number) => ask.removeProvider(id))
  ipcMain.handle(IPC.askActivateProvider, (_e, id: number) => ask.activate(id))
  ipcMain.handle(IPC.askModels, (_e, input: ProviderInput & { id?: number }) => ask.models(input))
  ipcMain.handle(IPC.askDetect, () => ask.detect())
  ipcMain.handle(IPC.askTest, (_e, id: number) => ask.test(id))
  ipcMain.handle(IPC.askOpenDashboard, async (_e, id: number) => {
    const p = ask.providers().find((x) => x.id === id)
    const url =
      p?.kind === 'anthropic' ? ANTHROPIC_DASHBOARD : p?.preset ? PRESETS[p.preset].dashboard : null
    if (url) await shell.openExternal(url)
  })
  ipcMain.handle(IPC.askSend, (_e, threadId: number | null, question: string) =>
    ask.send(threadId, question, emit)
  )
  ipcMain.handle(IPC.askStop, () => ask.stop())
  ipcMain.handle(IPC.askThreads, () => ask.threads())
  ipcMain.handle(IPC.askMessages, (_e, threadId: number) => ask.messages(threadId))
  ipcMain.handle(IPC.askDeleteThread, (_e, id: number) => ask.deleteThread(id))
  ipcMain.handle(IPC.askOptions, () => ask.options())
  ipcMain.handle(IPC.askSetOptions, (_e, o: AskOptions) => ask.setOptions(o))
}
```

Modify `src/main/index.ts`:

```diff
diff --git a/src/main/index.ts b/src/main/index.ts
index 7847df2..d9675af 100644
--- a/src/main/index.ts
+++ b/src/main/index.ts
@@ -1,15 +1,18 @@
-import { app, BrowserWindow, dialog, shell } from 'electron'
+import { app, BrowserWindow, dialog, safeStorage, shell } from 'electron'
 import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
 import { tmpdir } from 'node:os'
 import { join } from 'path'
 import { electronApp, is, optimizer } from '@electron-toolkit/utils'
 import { autoUpdater } from 'electron-updater'
 import icon from '../../resources/icon.png?asset'
+import { registerAskHandlers } from '@main/analyst/askIpc'
+import { createAskService } from '@main/analyst/askService'
+import { safeStorageKeys } from '@main/analyst/keys'
 import { companionLeague } from '@main/analyst/league'
 import { registerMcpHandlers } from '@main/analyst/mcp/ipc'
 import { mcpSelfTest } from '@main/analyst/mcp/selfTest'
 import { createMcpService, type McpService } from '@main/analyst/mcp/service'
-import { createAnalyst } from '@main/analyst/tools'
+import { type Analyst, createAnalyst } from '@main/analyst/tools'
 import { openDatabase, type Db } from '@main/db/connection'
 import { migrate } from '@main/db/migrate'
 import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
@@ -227,10 +230,16 @@ app.whenReady().then(async () => {
     })
   }
   registerIpcHandlers(ctx)
-  const mcp = startMcp(ctx)
+  // One analyst for Claude over MCP and the in-app loop: one cache, one player index.
+  const analyst = ctx.stats
+    ? createAnalyst({ stats: ctx.stats, league: () => leagueOf(ctx) })
+    : null
+  const mcp = startMcp(ctx, analyst)
+  const devMode = createDevMode({ db: ctx.db, packaged: app.isPackaged, argv: process.argv })
+  startAsk(ctx, analyst, () => devMode.get())
   registerDevHandlers({
     db: ctx.db,
-    mode: createDevMode({ db: ctx.db, packaged: app.isPackaged, argv: process.argv }),
+    mode: devMode,
     errors: errorLog,
     getWindow: () => mainWindow
   })
@@ -266,16 +275,7 @@ app.whenReady().then(async () => {
 })
 
 /** Ask spec §6.1: the analyst tools behind MCP, on when the user turned them on (Stats › Ask). */
-function startMcp(ctx: AppContext): McpService {
-  const analyst = ctx.stats
-    ? createAnalyst({
-        stats: ctx.stats,
-        league: () => {
-          const id = getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)
-          return id ? companionLeague(ctx.db, id) : null
-        }
-      })
-    : null
+function startMcp(ctx: AppContext, analyst: Analyst | null): McpService {
   const mcp = createMcpService({
     db: ctx.db,
     analyst,
@@ -304,6 +304,24 @@ function startMcp(ctx: AppContext): McpService {
   return mcp
 }
 
+/** Ask in the app (Plan AG1): the loop over the analyst, with the user's model. */
+function startAsk(ctx: AppContext, analyst: Analyst | null, dev: () => boolean): void {
+  const ask = createAskService({
+    db: ctx.db,
+    analyst,
+    keys: safeStorageKeys(safeStorage),
+    userData: app.getPath('userData'),
+    devMode: dev
+  })
+  registerAskHandlers(ask, () => mainWindow)
+}
+
+/** The imported league, read only, for the analyst's league tool. */
+function leagueOf(ctx: AppContext): ReturnType<typeof companionLeague> | null {
+  const id = getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)
+  return id ? companionLeague(ctx.db, id) : null
+}
+
 app.on('window-all-closed', () => {
   if (process.platform !== 'darwin') app.quit()
 })
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/askService.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/providers/index.ts src/main/analyst/askService.ts src/main/analyst/askIpc.ts src/main/index.ts tests/main/analyst/askService.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/providers/index.ts src/main/analyst/askService.ts src/main/analyst/askIpc.ts src/main/index.ts tests/main/analyst/askService.test.ts
git commit -m "feat(ask): the service, its IPC and wiring"
```

Expected: typecheck and lint clean; the suite at 1,360 passed, 8 skipped (a clean checkout).

---

### Task 10: Stats › Ask: the Model section and the try box (spec §6.2, §8; amendments F, J)

Add a model (a service, an address, a key, a model), find the ones on this PC, test one, and say what leaves the PC. The try box streams a turn as plain text, with Stop; questions in a row form a thread.

**Files:**

- Create: `src/renderer/src/screens/stats/ask/AskModel.tsx`, `src/renderer/src/screens/stats/ask/AskTry.tsx`, `tests/renderer/components/StatsAskModel.test.tsx`
- Modify: `src/renderer/src/screens/stats/StatsAsk.tsx`, `tests/renderer/components/StatsAsk.test.tsx`

- [ ] **Step 1: Write the tests**

Create `tests/renderer/components/StatsAskModel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AskModel } from '@/screens/stats/ask/AskModel'
import { AskTry } from '@/screens/stats/ask/AskTry'
import { api } from '@/lib/api'
import type { AskEvent, AskMessage, ProviderSettings } from '@shared/ask'

let listener: ((e: AskEvent) => void) | null = null
vi.mock('@/lib/api', () => ({
  api: {
    ask: {
      providers: {
        list: vi.fn(),
        save: vi.fn(),
        remove: vi.fn(),
        activate: vi.fn(),
        models: vi.fn(),
        detect: vi.fn(),
        test: vi.fn(),
        openDashboard: vi.fn()
      },
      send: vi.fn(),
      stop: vi.fn(),
      onEvent: vi.fn((l: (e: AskEvent) => void) => {
        listener = l
        return () => {
          listener = null
        }
      })
    }
  }
}))
const providers = vi.mocked(api.ask.providers)
const ask = vi.mocked(api.ask)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const GROQ: ProviderSettings = {
  id: 1,
  kind: 'openai',
  preset: 'groq',
  label: 'Groq (free tier)',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'llama-x',
  profile: 'full',
  mode: 'native',
  reasoning: 'off',
  hasKey: true,
  active: true
}

describe('Stats › Ask › Model (Plan AG1)', () => {
  it('adds an API model with its key, and says what leaves the PC', async () => {
    providers.list.mockResolvedValueOnce([]).mockResolvedValue([GROQ])
    providers.save.mockResolvedValue(GROQ)
    const onChange = vi.fn()
    render(<AskModel onChange={onChange} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a model' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Service' }), {
      target: { value: 'groq' }
    })
    expect((screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement).value).toBe(
      'https://api.groq.com/openai/v1'
    )
    expect(screen.getByText(/go to this service/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'gsk-1' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'llama-x' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('llama-x')
    expect(providers.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'openai', preset: 'groq', model: 'llama-x', key: 'gsk-1' })
    )
    expect(onChange).toHaveBeenLastCalledWith([GROQ])
  })

  it('finds local models and sets a small one up for the compact profile', async () => {
    providers.list.mockResolvedValue([])
    providers.detect.mockResolvedValue([
      {
        kind: 'ollama',
        baseUrl: 'http://localhost:11434',
        models: [{ id: 'gemma3:4b', tools: false, thinking: false, context: null }]
      }
    ])
    render(<AskModel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Find models on this PC' }))
    fireEvent.click(await screen.findByRole('button', { name: /gemma3:4b/ }))
    expect((screen.getByRole('combobox', { name: 'Model' }) as HTMLInputElement).value).toBe(
      'gemma3:4b'
    )
    expect((screen.getByRole('combobox', { name: 'Tools' }) as HTMLSelectElement).value).toBe(
      'compact'
    )
    expect((screen.getByRole('combobox', { name: 'Calling' }) as HTMLSelectElement).value).toBe(
      'structured'
    )
    expect(screen.getByText(/Nothing leaves this computer/)).toBeTruthy()
    expect(screen.queryByLabelText('API key')).toBeNull()
  })

  it('tests a saved model', async () => {
    providers.list.mockResolvedValue([GROQ])
    providers.test.mockResolvedValue({ ok: false, message: 'Groq refused the key (401)', ms: 300 })
    render(<AskModel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Test' }))
    await screen.findByText(/Groq refused the key/)
  })
})

describe('Stats › Ask › Try a question', () => {
  const answer: AskMessage = {
    id: 2,
    threadId: 7,
    role: 'assistant',
    text: 'Puka Nacua leads with 3.10.',
    calls: [{ tool: 'leaderboard', args: { metric: 'yprr' } }],
    results: [],
    flags: [],
    outcome: 'answer',
    model: 'Groq · llama-x',
    tokens: { input: 900, output: 20 },
    ms: 2100,
    createdAt: '2026-11-03T12:00:00Z'
  }

  it('streams the turn, then keeps the thread for a follow-up', async () => {
    let resolve: (m: AskMessage) => void = () => {}
    ask.send.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    render(<AskTry ready />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), {
      target: { value: 'Who leads WRs in YPRR?' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(ask.send).toHaveBeenCalledWith(null, 'Who leads WRs in YPRR?'))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    listener!({ type: 'call', call: { tool: 'leaderboard', args: { metric: 'yprr' } } })
    listener!({ type: 'text', delta: 'Puka Nacua leads' })
    await screen.findByText('Puka Nacua leads')
    resolve(answer)
    await screen.findByText('Puka Nacua leads with 3.10.')
    expect(screen.getByText(/Groq · llama-x/)).toBeTruthy()
    ask.send.mockResolvedValueOnce({ ...answer, id: 4 })
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), {
      target: { value: 'now 2024' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(ask.send).toHaveBeenLastCalledWith(7, 'now 2024'))
  })

  it('waits for a model', () => {
    render(<AskTry ready={false} />)
    expect((screen.getByRole('textbox', { name: 'Question' }) as HTMLInputElement).disabled).toBe(
      true
    )
  })
})
```

Modify `tests/renderer/components/StatsAsk.test.tsx`:

```diff
diff --git a/tests/renderer/components/StatsAsk.test.tsx b/tests/renderer/components/StatsAsk.test.tsx
index 542727b..54aa151 100644
--- a/tests/renderer/components/StatsAsk.test.tsx
+++ b/tests/renderer/components/StatsAsk.test.tsx
@@ -14,7 +14,20 @@ vi.mock('@/lib/api', () => ({
         resetToken: vi.fn(),
         addToClaudeDesktop: vi.fn(),
         copy: vi.fn()
-      }
+      },
+      providers: {
+        list: vi.fn(async () => []),
+        save: vi.fn(),
+        remove: vi.fn(),
+        activate: vi.fn(),
+        models: vi.fn(),
+        detect: vi.fn(),
+        test: vi.fn(),
+        openDashboard: vi.fn()
+      },
+      send: vi.fn(),
+      stop: vi.fn(),
+      onEvent: vi.fn(() => () => {})
     }
   }
 }))
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/components/StatsAsk.test.tsx tests/renderer/components/StatsAskModel.test.tsx
```

Expected: FAIL. `StatsAskModel.test.tsx` cannot resolve `@/screens/stats/ask/AskModel`; `StatsAsk.test.tsx` still passes (3 tests).

- [ ] **Step 3: The two sections**

Create `src/renderer/src/screens/stats/ask/AskModel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { StatsButton, StatsSelect } from '@/components/stats/controls'
import { SectionHead } from '@/components/stats/parts'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ANTHROPIC_BASE_URL,
  LMSTUDIO_BASE_URL,
  OLLAMA_BASE_URL,
  PRESETS as PRESET_INFO
} from '@shared/askPresets'
import type {
  CallingMode,
  LocalServer,
  ModelInfo,
  ProviderInput,
  ProviderKind,
  ProviderPreset,
  ProviderSettings,
  Reasoning,
  ToolProfile
} from '@shared/ask'

/**
 * Stats › Ask › Model (Ask spec §6.2, Plan AG1 amendment F): the models Ask can use — an Anthropic
 * key, an OpenAI-compatible service, or a local server — and which one is in use. A key goes to main
 * and is stored encrypted; it never comes back here.
 */
const KINDS: { value: ProviderKind; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude API)' },
  { value: 'openai', label: 'An API service (OpenAI-compatible)' },
  { value: 'ollama', label: 'Ollama on this PC' },
  { value: 'lmstudio', label: 'LM Studio on this PC' }
]

/** The services offered, free tiers first (spec §14 point 4); the addresses are main's presets. */
const ORDER: ProviderPreset[] = ['gemini', 'groq', 'openrouter', 'openai', 'mistral', 'custom']
const SERVICES = ORDER.map((value) => ({
  value,
  label: `${PRESET_INFO[value].label}${PRESET_INFO[value].free ? ' (free tier)' : ''}`,
  baseUrl: PRESET_INFO[value].baseUrl
}))

const BASE: Record<ProviderKind, string> = {
  anthropic: ANTHROPIC_BASE_URL,
  openai: SERVICES[0].baseUrl,
  ollama: OLLAMA_BASE_URL,
  lmstudio: LMSTUDIO_BASE_URL
}

/** What leaves the PC with each kind (spec §6.2). */
const LEAVES: Record<ProviderKind, string> = {
  anthropic:
    'Your question, the analyst brief and the tool results (stats rows; league team and player names) go to Anthropic.',
  openai:
    'Your question, the analyst brief and the tool results (stats rows; league team and player names) go to this service.',
  ollama: 'Nothing leaves this computer: the model runs here.',
  lmstudio: 'Nothing leaves this computer: the model runs here.'
}

const local = (k: ProviderKind): boolean => k === 'ollama' || k === 'lmstudio'

/** A new provider's defaults: small local models get the compact profile in structured mode. */
function draft(kind: ProviderKind, preset: ProviderPreset | null = null): ProviderInput {
  const p = SERVICES.find((x) => x.value === preset)
  return {
    kind,
    preset: kind === 'openai' ? (preset ?? 'gemini') : null,
    label:
      kind === 'openai'
        ? (p?.label ?? SERVICES[0].label)
        : KINDS.find((k) => k.value === kind)!.label,
    baseUrl: kind === 'openai' ? (p?.baseUrl ?? SERVICES[0].baseUrl) : BASE[kind],
    model: kind === 'anthropic' ? 'claude-opus-5-5' : '',
    profile: local(kind) ? 'compact' : 'full',
    mode: local(kind) ? 'structured' : 'native',
    reasoning: 'off',
    key: undefined
  }
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-fg-2">
      {label}
      {children}
    </label>
  )
}

const INPUT =
  'h-7 rounded-[6px] border border-line bg-panel px-2 text-[12.5px] text-fg placeholder:text-fg-3'

export function AskModel({
  onChange
}: {
  /** The providers as saved, after each change: whether a model is in use. */
  onChange?: (providers: ProviderSettings[]) => void
}): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderSettings[]>([])
  const [form, setForm] = useState<(ProviderInput & { id?: number }) | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [servers, setServers] = useState<LocalServer[] | null>(null)
  const [note, setNote] = useState<{ id: number; ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    const list = await api.ask.providers.list()
    setProviders(list)
    onChange?.(list)
  }
  useEffect(() => {
    void api.ask.providers
      .list()
      .then((list) => {
        setProviders(list)
        onChange?.(list)
      })
      .catch((err) => setError(errorMessage(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const listModels = (f: ProviderInput & { id?: number }): Promise<void> =>
    act(async () => setModels(await api.ask.providers.models(f)))

  const detect = (): Promise<void> => act(async () => setServers(await api.ask.providers.detect()))

  /** A local model found running, as a new provider's form. */
  function use(server: LocalServer, m: ModelInfo): void {
    setForm({ ...draft(server.kind), baseUrl: server.baseUrl, model: m.id })
    setModels(server.models)
  }

  async function save(): Promise<void> {
    if (!form) return
    await act(async () => {
      await api.ask.providers.save(form)
      setForm(null)
      setModels([])
      await load()
    })
  }

  const set = (patch: Partial<ProviderInput>): void => setForm((f) => (f ? { ...f, ...patch } : f))

  return (
    <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-panel px-5 py-4">
      <SectionHead title="Ask in the app" note="Model" />
      <p className="m-0 text-[12.5px] leading-[1.45] text-fg-3">
        Pick the model that answers questions inside the app: an API key, a free API tier, or a
        model running on this PC. Nothing is sent anywhere until you add one.
      </p>

      {providers.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Models">
          {providers.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-1 rounded-[7px] border border-line px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="ask-provider"
                  aria-label={`Use ${p.label} · ${p.model}`}
                  checked={p.active}
                  onChange={() =>
                    void act(async () => {
                      await api.ask.providers.activate(p.id)
                      await load()
                    })
                  }
                />
                <span className="text-[13px] font-medium">{p.label}</span>
                <span className="font-mono text-[12px] text-fg-2">{p.model}</span>
                <span className="text-[11.5px] text-fg-3">
                  {p.profile} · {p.mode}
                  {p.reasoning !== 'off' ? ` · reasoning ${p.reasoning}` : ''}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <StatsButton
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const r = await api.ask.providers.test(p.id)
                        setNote({
                          id: p.id,
                          ok: r.ok,
                          text: `${r.message} · ${(r.ms / 1000).toFixed(1)} s`
                        })
                      })
                    }
                  >
                    Test
                  </StatsButton>
                  <StatsButton
                    disabled={busy}
                    onClick={() => {
                      setForm({ ...p, key: undefined })
                      setModels([])
                    }}
                  >
                    Edit
                  </StatsButton>
                  <StatsButton
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api.ask.providers.remove(p.id)
                        await load()
                      })
                    }
                  >
                    Remove
                  </StatsButton>
                </span>
              </div>
              {note?.id === p.id && (
                <div className={cn('text-[12px]', note.ok ? 'text-good' : 'text-bad')}>
                  {note.text}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!form && (
        <div className="flex flex-wrap gap-2">
          <StatsButton disabled={busy} onClick={() => setForm(draft('openai'))}>
            Add a model
          </StatsButton>
          <StatsButton disabled={busy} onClick={() => void detect()}>
            Find models on this PC
          </StatsButton>
        </div>
      )}

      {servers && !form && (
        <div className="flex flex-col gap-2">
          {servers.length === 0 && (
            <p className="m-0 text-[12.5px] text-fg-2">
              Neither Ollama nor LM Studio is running on this PC (ports 11434 and 1234).
            </p>
          )}
          {servers.map((s) => (
            <div key={s.kind} className="flex flex-col gap-1">
              <div className="text-[12.5px] font-medium">
                {s.kind === 'ollama' ? 'Ollama' : 'LM Studio'} · {s.models.length} models
              </div>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {s.models.map((m) => (
                  <li key={m.id}>
                    <StatsButton
                      onClick={() => use(s, m)}
                      title={
                        m.tools ? 'Calls tools natively' : 'No native tool calls: structured mode'
                      }
                    >
                      {m.id}
                      <span className="text-[11px] text-fg-3">{m.tools ? 'tools' : 'json'}</span>
                    </StatsButton>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div
          className="flex flex-col gap-3 rounded-[7px] border border-line px-3 py-3"
          aria-label="Model settings"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <StatsSelect
                title="Kind"
                value={form.kind}
                options={KINDS}
                onChange={(kind) => {
                  setForm({ ...draft(kind), id: form.id })
                  setModels([])
                }}
              />
            </Field>
            {form.kind === 'openai' && (
              <Field label="Service">
                <StatsSelect
                  title="Service"
                  value={form.preset ?? 'custom'}
                  options={SERVICES}
                  onChange={(preset) => {
                    setForm({ ...draft('openai', preset), id: form.id })
                    setModels([])
                  }}
                />
              </Field>
            )}
            <Field label="Address">
              <input
                className={INPUT}
                aria-label="Address"
                value={form.baseUrl}
                onChange={(e) => set({ baseUrl: e.target.value })}
              />
            </Field>
            {!local(form.kind) && (
              <Field label={form.id !== undefined ? 'API key (leave empty to keep it)' : 'API key'}>
                <input
                  className={INPUT}
                  type="password"
                  aria-label="API key"
                  autoComplete="off"
                  value={form.key ?? ''}
                  onChange={(e) => set({ key: e.target.value === '' ? undefined : e.target.value })}
                />
              </Field>
            )}
            <Field label="Model">
              <div className="flex gap-1.5">
                <input
                  className={cn(INPUT, 'min-w-0 flex-1 font-mono')}
                  aria-label="Model"
                  list="ask-models"
                  value={form.model}
                  onChange={(e) => set({ model: e.target.value })}
                />
                <StatsButton disabled={busy} onClick={() => void listModels(form)}>
                  List
                </StatsButton>
              </div>
              <datalist id="ask-models">
                {models.map((m) => (
                  <option key={m.id} value={m.id} />
                ))}
              </datalist>
            </Field>
            <Field label="Tools">
              <StatsSelect<ToolProfile>
                title="Tools"
                value={form.profile}
                options={[
                  { value: 'compact', label: 'Compact (small models)' },
                  { value: 'full', label: 'Full (strong models)' }
                ]}
                onChange={(profile) => set({ profile })}
              />
            </Field>
            <Field label="Calling">
              <StatsSelect<CallingMode>
                title="Calling"
                value={form.mode}
                options={[
                  { value: 'native', label: 'Native tool calls' },
                  { value: 'structured', label: 'Structured JSON' }
                ]}
                onChange={(mode) => set({ mode })}
              />
            </Field>
            <Field label="Reasoning">
              <StatsSelect<Reasoning>
                title="Reasoning"
                value={form.reasoning}
                options={[
                  { value: 'off', label: 'Off (fastest)' },
                  { value: 'low', label: 'Low' },
                  { value: 'high', label: 'High (slowest)' }
                ]}
                onChange={(reasoning) => set({ reasoning })}
              />
            </Field>
          </div>
          <p className="m-0 text-[12px] leading-[1.45] text-fg-3">{LEAVES[form.kind]}</p>
          <div className="flex gap-2">
            <StatsButton
              disabled={busy || !form.model.trim() || !form.baseUrl.trim()}
              onClick={() => void save()}
            >
              Save
            </StatsButton>
            <StatsButton
              disabled={busy}
              onClick={() => {
                setForm(null)
                setModels([])
              }}
            >
              Cancel
            </StatsButton>
          </div>
        </div>
      )}
      {error && <div className="text-[12.5px] text-bad">{error}</div>}
    </section>
  )
}
```

Create `src/renderer/src/screens/stats/ask/AskTry.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { StatsButton } from '@/components/stats/controls'
import { SectionHead } from '@/components/stats/parts'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AskCall, AskEvent, AskMessage, ToolOutcome } from '@shared/ask'

/**
 * Stats › Ask › Try a question (Plan AG1, amendment F): plain text until Plan AH builds Ask itself —
 * the streamed answer, the tool calls and the answer checks, with Stop. Questions in a row form a
 * thread, so follow-ups work ("now 2024"); New thread starts over.
 */
interface Turn {
  question: string
  calls: AskCall[]
  outcomes: ToolOutcome[]
  text: string
  message: AskMessage | null
  error: string | null
}

const OUTCOME: Partial<Record<NonNullable<AskMessage['outcome']>, string>> = {
  ask: 'asked back',
  decline: 'declined',
  stopped: 'stopped',
  error: 'failed'
}

function TurnView({ turn }: { turn: Turn }): React.JSX.Element {
  const m = turn.message
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="text-[13px] font-medium">{turn.question}</div>
      {turn.calls.map((c, i) => {
        const o = turn.outcomes[i]
        return (
          <div key={i} className="font-mono text-[11.5px] leading-[1.4] text-fg-3">
            {c.tool} {JSON.stringify(c.args)}
            {o && (o.ok ? ` → ${o.title} (${o.ms} ms)` : ` → ${o.error}`)}
          </div>
        )
      })}
      <div className="text-[13px] leading-[1.5] whitespace-pre-wrap">{m ? m.text : turn.text}</div>
      {m && m.flags.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {m.flags.map((f, i) => (
            <li
              key={i}
              className={cn('text-[12px]', f.severity === 'flag' ? 'text-bad' : 'text-fg-3')}
            >
              “{f.text}”: {f.message}
            </li>
          ))}
        </ul>
      )}
      {m && (
        <div className="text-[11.5px] text-fg-3">
          {[
            m.outcome && OUTCOME[m.outcome],
            m.model,
            m.tokens && `${m.tokens.input} tokens in, ${m.tokens.output} out`,
            m.ms !== null && `${(m.ms / 1000).toFixed(1)} s`
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {turn.error && <div className="text-[12.5px] text-bad">{turn.error}</div>}
    </div>
  )
}

export function AskTry({ ready }: { ready: boolean }): React.JSX.Element {
  const [question, setQuestion] = useState('')
  const [thread, setThread] = useState<number | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const live = useRef<Turn | null>(null)

  useEffect(
    () =>
      api.ask.onEvent((e: AskEvent) => {
        if (!live.current) return
        const t = { ...live.current }
        if (e.type === 'call') t.calls = [...t.calls, e.call]
        else if (e.type === 'result') t.outcomes = [...t.outcomes, e.outcome]
        else if (e.type === 'text') t.text += e.delta
        else if (e.type === 'done') t.message = e.message
        else if (e.type === 'error') t.error = e.error
        live.current = t
        setTurns((all) => [...all.slice(0, -1), t])
      }),
    []
  )

  async function ask(): Promise<void> {
    const q = question.trim()
    if (!q || busy) return
    const turn: Turn = {
      question: q,
      calls: [],
      outcomes: [],
      text: '',
      message: null,
      error: null
    }
    live.current = turn
    setTurns((all) => [...all, turn])
    setQuestion('')
    setBusy(true)
    try {
      const message = await api.ask.send(thread, q)
      setThread(message.threadId)
      // Read now: `live` is cleared below, before React runs the update.
      const done = { ...(live.current ?? turn), message }
      setTurns((all) => [...all.slice(0, -1), done])
    } catch (err) {
      const failed = { ...(live.current ?? turn), error: errorMessage(err) }
      setTurns((all) => [...all.slice(0, -1), failed])
    } finally {
      live.current = null
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-panel px-5 py-4">
      <SectionHead title="Try a question" note="Plain text until the Ask screen comes" />
      {turns.length > 0 && (
        <div className="flex flex-col gap-3" aria-label="Answers">
          {turns.map((t, i) => (
            <TurnView key={i} turn={t} />
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ask()
        }}
      >
        <input
          aria-label="Question"
          className="h-8 min-w-0 flex-1 rounded-[6px] border border-line bg-panel px-2.5 text-[13px] text-fg placeholder:text-fg-3"
          placeholder={
            ready ? 'Who leads WRs in yards per route run since week 5?' : 'Add a model above first'
          }
          disabled={!ready}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {busy ? (
          <StatsButton onClick={() => void api.ask.stop()}>Stop</StatsButton>
        ) : (
          <StatsButton type="submit" disabled={!ready || !question.trim()}>
            Ask
          </StatsButton>
        )}
        <StatsButton
          disabled={busy || turns.length === 0}
          onClick={() => {
            setThread(null)
            setTurns([])
          }}
        >
          New thread
        </StatsButton>
      </form>
    </section>
  )
}
```

Modify `src/renderer/src/screens/stats/StatsAsk.tsx`:

```diff
diff --git a/src/renderer/src/screens/stats/StatsAsk.tsx b/src/renderer/src/screens/stats/StatsAsk.tsx
index 5dd7ca4..2c497b3 100644
--- a/src/renderer/src/screens/stats/StatsAsk.tsx
+++ b/src/renderer/src/screens/stats/StatsAsk.tsx
@@ -6,6 +6,8 @@ import { api } from '@/lib/api'
 import { errorMessage } from '@/lib/format'
 import { cn } from '@/lib/utils'
 import type { McpCopy, McpStatus } from '@shared/ask'
+import { AskModel } from './ask/AskModel'
+import { AskTry } from './ask/AskTry'
 
 const DESKTOP: Record<McpStatus['claudeDesktop']['state'], string> = {
   added: 'Added. Quit and reopen Claude desktop if it was open, then ask it about your stats.',
@@ -39,14 +41,17 @@ function CopyButton({
 }
 
 /**
- * Stats › Ask (Ask spec §6.1, §8): until Ask itself comes (Plan AH), this is where you let Claude read
- * the app's stats over MCP: on or off, Claude desktop's config, and the commands for Claude Code.
+ * Stats › Ask (Ask spec §6, §8): until Ask itself comes (Plan AH), this is where you pick the model
+ * that answers in the app and try a question (Plan AG1), and let Claude read the app's stats over
+ * MCP: on or off, Claude desktop's config, and the commands for Claude Code.
  */
 export function StatsAsk(): React.JSX.Element {
   const [status, setStatus] = useState<McpStatus | null>(null)
   const [busy, setBusy] = useState(false)
   const [error, setError] = useState<string | null>(null)
   const [copied, setCopied] = useState<McpCopy | null>(null)
+  /** A model is set up for Ask in the app. */
+  const [ready, setReady] = useState(false)
 
   useEffect(() => {
     void api.ask.mcp
@@ -84,11 +89,14 @@ export function StatsAsk(): React.JSX.Element {
       <header className="flex flex-col gap-2">
         <h1 className="m-0 text-[28px] leading-none font-bold tracking-[-0.03em]">Ask</h1>
         <div className="text-[13px] leading-[1.45] text-fg-2">
-          Ask questions about the app’s stats in Claude, with your own Claude plan. Asking from
-          inside the app comes in a later version.
+          Ask questions about the app’s stats: in Claude, with your own Claude plan, or here in the
+          app with a model you pick. The full Ask screen comes in a later version.
         </div>
       </header>
 
+      <AskModel onChange={(list) => setReady(list.some((p) => p.active))} />
+      <AskTry ready={ready} />
+
       <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-panel px-5 py-4">
         <SectionHead title="Use Claude" note="MCP" />
         <div className="flex items-center gap-3">
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/renderer/components/StatsAsk.test.tsx tests/renderer/components/StatsAskModel.test.tsx
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/renderer/src/screens/stats/ask/AskModel.tsx src/renderer/src/screens/stats/ask/AskTry.tsx src/renderer/src/screens/stats/StatsAsk.tsx tests/renderer/components/StatsAsk.test.tsx tests/renderer/components/StatsAskModel.test.tsx
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/renderer/src/screens/stats/ask/AskModel.tsx src/renderer/src/screens/stats/ask/AskTry.tsx src/renderer/src/screens/stats/StatsAsk.tsx tests/renderer/components/StatsAsk.test.tsx tests/renderer/components/StatsAskModel.test.tsx
git commit -m "feat(stats): Ask tab model section and try box"
```

Expected: typecheck and lint clean; the suite at 1,365 passed, 8 skipped (a clean checkout).

---

### Task 11: Replay and the live gate (spec §10; amendment E)

Two recordings of the probe's 20 questions (2 files, 40 turns, 136 KB) replay through the real resolver, compact schema and loop, with no model and no database. A recording keeps the players the resolver matched and each call's outcome, because a call can fail on the real database and the model retry. One recording finds a real bug: `gemma3:4b` repeats a metric (`["yprr", "yprr"]`), which `compactAnswer` must drop. The live harness (`loop.live.test.ts`) makes the recordings and runs the gate. `npm run ask:replay` and re-grading on the real engine are Plan AG2's (amendment E).

**Files:**

- Create: `src/main/analyst/providers/replay.ts`, `tests/ask/replay.test.ts`, `tests/ask/loop.live.test.ts`, `tests/ask/replays/gemma3-4b-compact-structured.json`, `tests/ask/replays/qwen3-4b-compact-structured.json`
- Modify: `src/main/analyst/compact.ts`

- [ ] **Step 1: The test and the recordings**

Create `tests/ask/replay.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CallingMode, ToolProfile } from '@shared/ask'
import type { Person } from '@shared/stats/types'
import { askTurn } from '@main/analyst/loop'
import { type Recording, replayAnalyst, replaying } from '@main/analyst/providers/replay'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { statsResult, statsRow } from '../fixtures/analyst'

/**
 * Ask spec §10 (Plan AG1, amendment E): recorded model replies and tool outcomes, replayed through
 * the real loop with no model and no database (the tools on the database are `npm run test:ask`'s). Each turn must ask the model the same things in the same order and make
 * the same calls: a change to the resolver, the compact schema or the loop that alters an answer
 * fails here. The recordings come from `tests/ask/loop.live.test.ts` with FFC_ASK_RECORD=1.
 */
interface ReplayFile {
  model: string
  profile: ToolProfile
  mode: CallingMode
  through: { season: number; week: number; seasonType: 'REG' | 'POST' }
  people: Person[]
  recordings: Recording[]
}

const DIR = join(__dirname, 'replays')
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.json'))

/** An engine that knows the recorded players and answers every query with one row. */
function engine(file: ReplayFile): AnalystStats {
  return {
    status: async () => ({
      available: true,
      through: file.through,
      updatedAt: 'replay',
      busy: false
    }),
    catalogue: async () => catalogueInfo(new Map()),
    people: async () => file.people,
    query: async (q) => {
      const p = file.people[0] ?? { id: '00-0000001', name: 'Replay Player' }
      const values = Object.fromEntries(q.metrics.map((m) => [m, { raw: 1, sample: 100 }]))
      return statsResult([statsRow(p.id, p.name, values)])
    },
    games: async () => [],
    outlook: async () => {
      throw new Error('no outlook in a replay')
    },
    player: async () => {
      throw new Error('no player in a replay')
    }
  }
}

describe('recorded model replies', () => {
  it('exist', () => expect(FILES.length).toBeGreaterThan(0))

  for (const name of FILES) {
    const file = JSON.parse(readFileSync(join(DIR, name), 'utf8')) as ReplayFile
    it(`replay ${name}`, async () => {
      const analyst = createAnalyst({ stats: engine(file), league: () => null })
      const problems: string[] = []
      for (const rec of file.recordings) {
        const provider = replaying(rec)
        try {
          const out = await askTurn({
            question: rec.question,
            provider,
            analyst: rec.outcomes ? replayAnalyst(analyst, rec.outcomes) : analyst,
            profile: file.profile,
            mode: file.mode,
            reasoning: 'off',
            history: [],
            last: null,
            examples: null,
            sampleK: false,
            signal: new AbortController().signal,
            emit: () => {}
          })
          if (provider.left() > 0) problems.push(`${rec.question}: ${provider.left()} calls unused`)
          if (rec.expect && JSON.stringify(out.calls) !== JSON.stringify(rec.expect.calls))
            problems.push(`${rec.question}: calls ${JSON.stringify(out.calls)}`)
        } catch (err) {
          problems.push(String(err))
        }
      }
      expect(problems).toEqual([])
    })
  }
})
```

Create `tests/ask/replays/gemma3-4b-compact-structured.json`:

```json
{
  "model": "gemma3:4b",
  "profile": "compact",
  "mode": "structured",
  "through": {
    "season": 2026,
    "week": 8,
    "seasonType": "REG"
  },
  "people": [
    {
      "id": "00-0036900",
      "name": "Ja'Marr Chase",
      "firstName": "Ja'Marr",
      "lastName": "Chase",
      "position": "WR",
      "team": "CIN",
      "firstSeason": 2021,
      "lastSeason": 2026,
      "games": 85,
      "recentGames": 23,
      "recentPoints": 441.8
    },
    {
      "id": "00-0038542",
      "name": "Bijan Robinson",
      "firstName": "Bijan",
      "lastName": "Robinson",
      "position": "RB",
      "team": "ATL",
      "firstSeason": 2023,
      "lastSeason": 2026,
      "games": 59,
      "recentGames": 25,
      "recentPoints": 524.1
    },
    {
      "id": "00-0034857",
      "name": "Josh Allen",
      "firstName": "Joshua",
      "lastName": "Allen",
      "position": "QB",
      "team": "BUF",
      "firstSeason": 2019,
      "lastSeason": 2026,
      "games": 123,
      "recentGames": 24,
      "recentPoints": 567.4
    },
    {
      "id": "00-0032764",
      "name": "Derrick Henry",
      "firstName": "Derrick",
      "lastName": "Henry",
      "position": "RB",
      "team": "BAL",
      "firstSeason": 2019,
      "lastSeason": 2026,
      "games": 114,
      "recentGames": 25,
      "recentPoints": 416.2
    },
    {
      "id": "00-0039075",
      "name": "Puka Nacua",
      "firstName": "Puka",
      "lastName": "Nacua",
      "position": "WR",
      "team": "LA",
      "firstSeason": 2023,
      "lastSeason": 2026,
      "games": 50,
      "recentGames": 22,
      "recentPoints": 513.6
    },
    {
      "id": "00-0039338",
      "name": "Brock Bowers",
      "firstName": "Brock",
      "lastName": "Bowers",
      "position": "TE",
      "team": "LV",
      "firstSeason": 2024,
      "lastSeason": 2026,
      "games": 35,
      "recentGames": 18,
      "recentPoints": 299.9
    },
    {
      "id": "00-0036358",
      "name": "CeeDee Lamb",
      "firstName": "Cedarian",
      "lastName": "Lamb",
      "position": "WR",
      "team": "DAL",
      "firstSeason": 2020,
      "lastSeason": 2026,
      "games": 103,
      "recentGames": 22,
      "recentPoints": 369.2
    },
    {
      "id": "00-0039139",
      "name": "Jahmyr Gibbs",
      "firstName": "Jahmyr",
      "lastName": "Gibbs",
      "position": "RB",
      "team": "DET",
      "firstSeason": 2023,
      "lastSeason": 2026,
      "games": 56,
      "recentGames": 24,
      "recentPoints": 562.7
    }
  ],
  "recordings": [
    {
      "model": "gemma3:4b",
      "question": "Who leads WRs in yards per route run since week 5?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Rank WRs by yprr since week 5\", \"args\": {\"metric\": \"yprr\", \"position\": \"WR\"}}",
            "calls": [],
            "usage": {
              "input": 437,
              "output": 35
            },
            "stop": "end"
          },
          "ms": 1202
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Adonai Mitchell leads WRs in yards per route run since week 5 with 3.94, based on 36 routes. Jaxon Smith-Njigba is second with 3.75, having run 103 routes. Within noise, Luther Burden III is third with 3.58, having run 76 routes.",
            "calls": [],
            "usage": {
              "input": 622,
              "output": 77
            },
            "stop": "end"
          },
          "ms": 1653
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "yprr",
              "seasons": [2026],
              "weeks": [5, 8],
              "position": "WR"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Yards per route run (yprr), WR, 2026 weeks 5–8: best first, qualified only.",
          "text": "Yards per route run (yprr), WR, 2026 weeks 5–8: best first, qualified only.\n1. Adonai Mitchell (00-0039890, WR, NYJ) — YPRR 3.94 (est.) on 36 routes, 100th pct\n2. Jaxon Smith-Njigba (00-0038543, WR, SEA) — YPRR 3.75 (est.) on 103 routes, 99th pct\n3. Luther Burden III (00-0040735, WR, CHI) — YPRR 3.58 (est.) on 76 routes, 98th pct\n4. Amon-Ra St. Brown (00-0036963, WR, DET) — YPRR 3.53 (est.) on 76 routes, 97th pct\n5. Jaylin Noel (00-0040138, WR, HOU) — YPRR 3.45 (est.) on 42 routes, 96th pct\n6. Malik Nabers (00-0039337, WR, NYG) — YPRR 3.36 (est.) on 118 routes, 96th pct\n7. Tee Higgins (00-0036410, WR, CIN) — YPRR 3.32 (est.) on 98 routes, 95th pct\n8. DeMario Douglas (00-0038621, WR, NE) — YPRR 3.13 (est.) on 80 routes, 94th pct\n9. Christian Watson (00-0038124, WR, GB) — YPRR 3.07 (est.) on 123 routes, 93rd pct\n10. Omar Cooper Jr. (00-0041511, WR, NYJ) — YPRR 2.91 (est.) on 75 routes, 92nd pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["yprr"],
              "scope": {
                "seasons": [2026],
                "weeks": [5, 8],
                "positions": ["WR"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Best tight end by targets per route run this season",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Rank tight ends by tprr\", \"args\": {\"metric\": \"tprr\", \"position\": \"TE\"}}",
            "calls": [],
            "usage": {
              "input": 391,
              "output": 29
            },
            "stop": "end"
          },
          "ms": 1130
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Isaiah Likely leads the tight ends with a TPRR of 31.2% on 202 routes. Brock Bowers is second with 30.3% on 201 routes. Within noise, Dalton Schultz is third with 27.2% on 158 routes.",
            "calls": [],
            "usage": {
              "input": 609,
              "output": 64
            },
            "stop": "end"
          },
          "ms": 1514
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "tprr",
              "seasons": [2026],
              "position": "TE"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Targets per route run (tprr), TE, 2026: best first, qualified only.",
          "text": "Targets per route run (tprr), TE, 2026: best first, qualified only.\n1. Isaiah Likely (00-0037838, TE, NYG) — TPRR 31.2% (est.) on 202 routes, 100th pct\n2. Brock Bowers (00-0039338, TE, LV) — TPRR 30.3% (est.) on 201 routes, 99th pct\n3. Dalton Schultz (00-0034383, TE, HOU) — TPRR 27.2% (est.) on 158 routes, 97th pct\n4. Trey McBride (00-0037744, TE, ARI) — TPRR 26.6% (est.) on 323 routes, 96th pct\n5. George Kittle (00-0033288, TE, SF) — TPRR 25.4% (est.) on 181 routes, 94th pct\n6. T.J. Hockenson (00-0035229, TE, MIN) — TPRR 24.3% (est.) on 152 routes, 93rd pct\n7. Kenyon Sadiq (00-0041032, TE, NYJ) — TPRR 23.9% (est.) on 113 routes, 91st pct\n8. Mark Andrews (00-0034753, TE, BAL) — TPRR 23.6% (est.) on 174 routes, 90th pct\n9. Tyler Warren (00-0040128, TE, IND) — TPRR 23.1% (est.) on 199 routes, 89th pct\n10. Dalton Kincaid (00-0038933, TE, BUF) — TPRR 22.3% (est.) on 157 routes, 87th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["tprr"],
              "scope": {
                "seasons": [2026],
                "positions": ["TE"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Which QBs had the best CPOE in 2025?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Rank QBs by CPOE in 2025.\", \"args\": {\"metric\": \"cpoe\", \"position\": \"QB\"}}",
            "calls": [],
            "usage": {
              "input": 414,
              "output": 36
            },
            "stop": "end"
          },
          "ms": 1268
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Drake Maye led the quarterbacks with a CPOE of +10.8 on 472 attempts. Brock Purdy followed with a CPOE of +7.2 on 272 attempts, while Jordan Love posted a CPOE of +5.5 on 411 attempts.",
            "calls": [],
            "usage": {
              "input": 600,
              "output": 63
            },
            "stop": "end"
          },
          "ms": 1361
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "cpoe",
              "seasons": [2025],
              "position": "QB"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Completion % over expected (cpoe), QB, 2025: best first, qualified only.",
          "text": "Completion % over expected (cpoe), QB, 2025: best first, qualified only.\n1. Drake Maye (00-0039851, QB, NE) — CPOE +10.8 on 472 attempts with a completion model, 100th pct\n2. Brock Purdy (00-0037834, QB, SF) — CPOE +7.2 on 272 attempts with a completion model, 97th pct\n3. Jordan Love (00-0036264, QB, GB) — CPOE +5.5 on 411 attempts with a completion model, 94th pct\n4. Sam Darnold (00-0034869, QB, SEA) — CPOE +5.2 on 451 attempts with a completion model, 91st pct\n5. Joe Burrow (00-0036442, QB, CIN) — CPOE +4.7 on 248 attempts with a completion model, 88th pct\n6. Mac Jones (00-0036972, QB, SF) — CPOE +3.7 on 278 attempts with a completion model, 84th pct\n7. Josh Allen (00-0034857, QB, BUF) — CPOE +3.5 on 445 attempts with a completion model, 81st pct\n8. Jalen Hurts (00-0036389, QB, PHI) — CPOE +3.2 on 427 attempts with a completion model, 78th pct\n9. Spencer Rattler (00-0039376, QB, NO) — CPOE +2.4 on 245 attempts with a completion model, 75th pct\n10. Daniel Jones (00-0035710, QB, IND) — CPOE +2.3 on 373 attempts with a completion model, 72nd pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["cpoe"],
              "scope": {
                "seasons": [2025],
                "positions": ["QB"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Top 5 running backs in rush yards over expected per carry",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"The question asks for the top 5 running backs ranked by RYOE per carry.\", \"args\": {\"metric\": \"ryoe_att\", \"position\": \"RB\"}}",
            "calls": [],
            "usage": {
              "input": 379,
              "output": 42
            },
            "stop": "end"
          },
          "ms": 1346
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Based on Next Gen Stats, Jaylen Warren leads with 1.87 RYOE per attempt on 119 carries. Kenneth Walker III is second at 1.76 RYOE/att on 141 carries, while Kenny Gainwell has 1.32 RYOE/att on 58 carries.",
            "calls": [],
            "usage": {
              "input": 424,
              "output": 73
            },
            "stop": "end"
          },
          "ms": 1479
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "ryoe_att",
              "position": "RB",
              "limit": 5
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "RYOE per attempt (ryoe_att), RB, 2026: best first, qualified only.",
          "text": "RYOE per attempt (ryoe_att), RB, 2026: best first, qualified only.\n1. Jaylen Warren (00-0037228, RB, PIT) — RYOE/att 1.87 on 119 Next Gen Stats carries, 100th pct\n2. Kenneth Walker III (00-0038134, RB, KC) — RYOE/att 1.76 on 141 Next Gen Stats carries, 98th pct\n3. Kenny Gainwell (00-0036919, RB, TB) — RYOE/att 1.32 on 58 Next Gen Stats carries, 95th pct\n4. Braelon Allen (00-0039794, RB, NYJ) — RYOE/att 1.18 on 112 Next Gen Stats carries, 93rd pct\n5. Bijan Robinson (00-0038542, RB, ATL) — RYOE/att 1.16 on 150 Next Gen Stats carries, 90th pct\nNotes: RYOE per attempt barely carries over from one season to the next (year-to-year r 0.20): treat it as noisy.",
          "cards": [],
          "notes": [
            "RYOE per attempt barely carries over from one season to the next (year-to-year r 0.20): treat it as noisy."
          ],
          "queries": [
            {
              "entity": "player",
              "metrics": ["ryoe_att"],
              "scope": {
                "seasons": [2026],
                "positions": ["RB"],
                "qualifiedOnly": true
              },
              "limit": 5
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Which defenses blitz the most?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"I need to rank defenses by their blitz rate.\", \"args\": {\"metric\": \"def_blitz_rate\"}}",
            "calls": [],
            "usage": {
              "input": 383,
              "output": 29
            },
            "stop": "end"
          },
          "ms": 966
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "The Minnesota Vikings led the league with a blitz rate of 71.4% on 206 charted dropbacks faced. The Washington Commanders were second with 45.5% on 246 charted dropbacks faced, and the New York Giants ranked third with 41.9% on 241 charted dropbacks faced.",
            "calls": [],
            "usage": {
              "input": 469,
              "output": 74
            },
            "stop": "end"
          },
          "ms": 1505
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "def_blitz_rate"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Blitz rate (def_blitz_rate), 2026: best first, qualified only.",
          "text": "Blitz rate (def_blitz_rate), 2026: best first, qualified only.\n1. Minnesota Vikings (MIN) — Blitz% 71.4% on 206 charted dropbacks faced, 100th pct\n2. Washington Commanders (WAS) — Blitz% 45.5% on 246 charted dropbacks faced, 97th pct\n3. New York Giants (NYG) — Blitz% 41.9% on 241 charted dropbacks faced, 94th pct\n4. Tampa Bay Buccaneers (TB) — Blitz% 41.0% on 268 charted dropbacks faced, 90th pct\n5. Chicago Bears (CHI) — Blitz% 40.6% on 224 charted dropbacks faced, 87th pct\n6. New England Patriots (NE) — Blitz% 39.0% on 251 charted dropbacks faced, 84th pct\n7. New York Jets (NYJ) — Blitz% 38.4% on 250 charted dropbacks faced, 81st pct\n8. Denver Broncos (DEN) — Blitz% 35.6% on 295 charted dropbacks faced, 77th pct\n9. Buffalo Bills (BUF) — Blitz% 35.5% on 262 charted dropbacks faced, 74th pct\n10. New Orleans Saints (NO) — Blitz% 34.6% on 257 charted dropbacks faced, 71st pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "team",
              "metrics": ["def_blitz_rate"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Which teams have the best playoff odds right now?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"The question asks about playoff odds, and 'playoff_pct' is the appropriate metric.\", \"args\": {\"metric\": \"playoff_pct\"}}",
            "calls": [],
            "usage": {
              "input": 374,
              "output": 36
            },
            "stop": "end"
          },
          "ms": 1109
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "As of now, the Buffalo Bills have the highest playoff odds at 96.8%, based on 7 games. The Denver Broncos and Jacksonville Jaguars are close behind with 93.4% and 93.3% respectively, both having played 8 and 7 games, respectively. Within noise, the San Francisco 49ers are also at 93.3% with 7 games played.",
            "calls": [],
            "usage": {
              "input": 464,
              "output": 88
            },
            "stop": "end"
          },
          "ms": 1766
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "playoff_pct"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Playoff odds (playoff_pct), 2026: best first, qualified only.",
          "text": "Playoff odds (playoff_pct), 2026: best first, qualified only.\n1. Buffalo Bills (BUF) — Playoff% 96.8% on 7 games, 100th pct\n2. Denver Broncos (DEN) — Playoff% 93.4% on 8 games, 97th pct\n3. Jacksonville Jaguars (JAX) — Playoff% 93.3% on 7 games, 90th pct\n3. San Francisco 49ers (SF) — Playoff% 93.3% on 7 games, 90th pct\n5. Minnesota Vikings (MIN) — Playoff% 91.4% on 7 games, 87th pct\n6. Pittsburgh Steelers (PIT) — Playoff% 82.5% on 8 games, 84th pct\n7. Cincinnati Bengals (CIN) — Playoff% 80.8% on 7 games, 81st pct\n8. New England Patriots (NE) — Playoff% 79.4% on 8 games, 77th pct\n9. Seattle Seahawks (SEA) — Playoff% 78.8% on 7 games, 74th pct\n10. Detroit Lions (DET) — Playoff% 75.9% on 7 games, 71st pct\nNotes: Playoff odds barely carries over from one season to the next (year-to-year r 0.24): treat it as noisy.",
          "cards": [],
          "notes": [
            "Playoff odds barely carries over from one season to the next (year-to-year r 0.24): treat it as noisy."
          ],
          "queries": [
            {
              "entity": "team",
              "metrics": ["playoff_pct"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Most red-zone carries among running backs last season",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Rank RB by red-zone carries\", \"args\": {\"metric\": \"rz_carries\", \"position\": \"RB\"}}",
            "calls": [],
            "usage": {
              "input": 396,
              "output": 31
            },
            "stop": "end"
          },
          "ms": 1088
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Christian McCaffrey led the way with 75 red-zone carries. Jonathan Taylor and Derrick Henry tied for second with 70 and 63 red-zone carries respectively. Within noise, James Cook, Javonte Williams, Travis Etienne, Kyren Williams, Jahmyr Gibbs, Josh Jacobs, and Zach Charbonnet all had 51-52 red-zone carries.",
            "calls": [],
            "usage": {
              "input": 498,
              "output": 82
            },
            "stop": "end"
          },
          "ms": 1717
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "rz_carries",
              "seasons": [2025],
              "position": "RB"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Red-zone carries (rz_carries), RB, 2025: best first, qualified only.",
          "text": "Red-zone carries (rz_carries), RB, 2025: best first, qualified only.\n1. Christian McCaffrey (00-0033280, RB, SF) — RZ Car 75, 100th pct\n2. Jonathan Taylor (00-0036223, RB, IND) — RZ Car 70, 99th pct\n3. Derrick Henry (00-0032764, RB, BAL) — RZ Car 63, 99th pct\n4. James Cook (00-0037248, RB, BUF) — RZ Car 56, 98th pct\n5. Javonte Williams (00-0036997, RB, DAL) — RZ Car 54, 97th pct\n5. Travis Etienne (00-0036973, RB, JAX) — RZ Car 54, 97th pct\n7. Kyren Williams (00-0037840, RB, LA) — RZ Car 53, 96th pct\n8. Jahmyr Gibbs (00-0039139, RB, DET) — RZ Car 52, 95th pct\n8. Josh Jacobs (00-0035700, RB, GB) — RZ Car 52, 95th pct\n10. Zach Charbonnet (00-0039165, RB, SEA) — RZ Car 51, 95th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["rz_carries"],
              "scope": {
                "seasons": [2025],
                "positions": ["RB"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Who has the highest target share among WRs over the last 3 weeks?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Rank WRs by target share over the last 3 weeks.\", \"args\": {\"metric\": \"target_share\", \"position\": \"WR\"}}",
            "calls": [],
            "usage": {
              "input": 415,
              "output": 36
            },
            "stop": "end"
          },
          "ms": 1285
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Emeka Egbuka has the highest target share among WRs over the last 3 weeks at 39.0%, with 16 targets. Jaxon Smith-Njigba is second at 38.4% on 28 targets, and CeeDee Lamb is third at 38.0% on 41 targets.",
            "calls": [],
            "usage": {
              "input": 600,
              "output": 75
            },
            "stop": "end"
          },
          "ms": 1730
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "target_share",
              "seasons": [2026],
              "weeks": [6, 8],
              "position": "WR"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Target share (target_share), WR, 2026 weeks 6–8: best first, qualified only.",
          "text": "Target share (target_share), WR, 2026 weeks 6–8: best first, qualified only.\n1. Emeka Egbuka (00-0040129, WR, TB) — Tgt% 39.0% on 16 targets, 100th pct\n2. Jaxon Smith-Njigba (00-0038543, WR, SEA) — Tgt% 38.4% on 28 targets, 99th pct\n3. CeeDee Lamb (00-0036358, WR, DAL) — Tgt% 38.0% on 41 targets, 98th pct\n4. Malik Nabers (00-0039337, WR, NYG) — Tgt% 34.3% on 24 targets, 97th pct\n5. Amon-Ra St. Brown (00-0036963, WR, DET) — Tgt% 33.9% on 19 targets, 96th pct\n6. Puka Nacua (00-0039075, WR, LA) — Tgt% 33.7% on 29 targets, 94th pct\n7. DeVonta Smith (00-0036912, WR, PHI) — Tgt% 31.8% on 14 targets, 93rd pct\n8. Matthew Golden (00-0040667, WR, GB) — Tgt% 31.4% on 38 targets, 92nd pct\n9. Justin Jefferson (00-0036322, WR, MIN) — Tgt% 30.8% on 16 targets, 91st pct\n10. Ja'Marr Chase (00-0036900, WR, CIN) — Tgt% 30.7% on 23 targets, 90th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["target_share"],
              "scope": {
                "seasons": [2026],
                "weeks": [6, 8],
                "positions": ["WR"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 1,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "How does Ja'Marr Chase do against man coverage this year?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Let's analyze Ja'Marr Chase's performance against man coverage this year.\", \"args\": {\"metrics\": [\"tprr_man\", \"yprr_man\"], \"filters\": [\"man_coverage\"]}}",
            "calls": [],
            "usage": {
              "input": 433,
              "output": 54
            },
            "stop": "end"
          },
          "ms": 1633
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Ja’Marr Chase has a TPRR of 00-0036900 vs man coverage through 2025. YPRR vs man coverage through 2025 is also published. The data is within noise.",
            "calls": [],
            "usage": {
              "input": 232,
              "output": 54
            },
            "stop": "end"
          },
          "ms": 1017
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0036900",
              "metrics": ["tprr_man", "yprr_man"],
              "seasons": [2026],
              "coverage": "man"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Ja'Marr Chase (00-0036900, WR, CIN), 2026, vs man.",
          "text": "Ja'Marr Chase (00-0036900, WR, CIN), 2026, vs man.\nNotes: Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season. TPRR vs man: published through 2025. YPRR vs man: published through 2025. No rows: nothing in this scope for this player or team (no game, or the metric starts later).",
          "cards": [],
          "notes": [
            "Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season.",
            "TPRR vs man: published through 2025.",
            "YPRR vs man: published through 2025.",
            "No rows: nothing in this scope for this player or team (no game, or the metric starts later)."
          ],
          "queries": [
            {
              "entity": "player",
              "metrics": ["tprr_man", "yprr_man"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false,
                "positions": ["WR"]
              },
              "situation": {
                "coverage": "man"
              },
              "limit": 5000
            }
          ],
          "ms": 94,
          "cached": false
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Show me Bijan Robinson's game log this season",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"The user wants the game log for Bijan Robinson this season.\", \"args\": {\"metrics\": [\"games\"], \"by\": \"week\"}}",
            "calls": [],
            "usage": {
              "input": 307,
              "output": 34
            },
            "stop": "end"
          },
          "ms": 1100
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Bijan Robinson appeared in 8 games this season. He played in Weeks 1 through 8 of the season. The remaining weeks were not qualified.",
            "calls": [],
            "usage": {
              "input": 223,
              "output": 32
            },
            "stop": "end"
          },
          "ms": 759
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0038542",
              "metrics": ["games"],
              "seasons": [2026],
              "by": "week"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Bijan Robinson (00-0038542, RB, ATL), 2026, by week.",
          "text": "Bijan Robinson (00-0038542, RB, ATL), 2026, by week.\nAll: G 8\nWeek 1: G 1\nWeek 2: G 1\nWeek 3: G 1\nWeek 4: G 1\nWeek 5: G 1\nWeek 6: G 1\nWeek 7: G 1\nWeek 8: G 1",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["games"],
              "scope": {
                "seasons": [2026],
                "players": ["00-0038542"],
                "qualifiedOnly": false
              },
              "groupBy": ["week"],
              "limit": 200
            },
            {
              "entity": "player",
              "metrics": ["games"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false,
                "positions": ["RB"]
              },
              "limit": 5000
            }
          ],
          "ms": 1,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "What is Josh Allen's EPA per dropback when he's pressured?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"The question asks for Josh Allen's EPA when pressured, so I'll use pressured_epa.\", \"args\": {\"metrics\": [\"pressured_epa\"], \"filters\": [\"pressure\"]}}",
            "calls": [],
            "usage": {
              "input": 420,
              "output": 48
            },
            "stop": "end"
          },
          "ms": 1494
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Josh Allen had -0.382 EPA per dropback when under pressure on 146 dropbacks. This represents the 66th percentile among quarterbacks, and the result is not qualified.",
            "calls": [],
            "usage": {
              "input": 246,
              "output": 43
            },
            "stop": "end"
          },
          "ms": 916
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0034857",
              "metrics": ["pressured_epa"],
              "pressure": true
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Josh Allen (00-0034857, QB, BUF), 2025, under pressure.",
          "text": "Josh Allen (00-0034857, QB, BUF), 2025, under pressure.\nPrss EPA -0.382 on 146 pressured dropbacks, 66th pct (percentiles among QBs, qualified rows only)\nNotes: Pressure, coverage, personnel, formation and on-field data are published through 2025: 2025 shown. Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season.",
          "cards": [],
          "notes": [
            "Pressure, coverage, personnel, formation and on-field data are published through 2025: 2025 shown.",
            "Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season."
          ],
          "queries": [
            {
              "entity": "player",
              "metrics": ["pressured_epa"],
              "scope": {
                "seasons": [2025],
                "qualifiedOnly": false,
                "positions": ["QB"]
              },
              "situation": {
                "pressure": true
              },
              "limit": 5000
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "How many yards per carry does Derrick Henry average in the red zone?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Let's find Derrick Henry's yards per carry specifically when he's in the red zone.\", \"args\": {\"metrics\": [\"rz_opportunity_share\"], \"filters\": [\"red_zone\"]}}",
            "calls": [],
            "usage": {
              "input": 397,
              "output": 49
            },
            "stop": "end"
          },
          "ms": 1432
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Let's find Derrick Henry's yards per carry specifically in the red zone.\", \"args\": {\"metrics\": [\"rz_carries\", \"rush_ypc\"], \"filters\": [\"red_zone\"]}}",
            "calls": [],
            "usage": {
              "input": 426,
              "output": 51
            },
            "stop": "end"
          },
          "ms": 1348
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Derrick Henry averages 3.4 yards per carry in the red zone, based on 40 carries. This rate is considered within noise, as it’s a percentile ranking among RBs with qualified rows only.",
            "calls": [],
            "usage": {
              "input": 231,
              "output": 46
            },
            "stop": "end"
          },
          "ms": 921
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0032764",
              "metrics": ["rz_opportunity_share"],
              "red_zone": true
            }
          },
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0032764",
              "metrics": ["rz_carries", "rush_ypc"],
              "red_zone": true
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": false,
          "tool": "player_stats",
          "error": "\"rz_opportunity_share\" cannot be split by situation: it does not come from plays",
          "ms": 5
        },
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Derrick Henry (00-0032764, RB, BAL), 2026, red zone.",
          "text": "Derrick Henry (00-0032764, RB, BAL), 2026, red zone.\nRZ Car 40, 100th pct · YPC 3.4 on 40 carries, 87th pct (percentiles among RBs, qualified rows only)\nNotes: Yards per carry barely carries over from one season to the next (year-to-year r 0.31): treat it as noisy.",
          "cards": [],
          "notes": [
            "Yards per carry barely carries over from one season to the next (year-to-year r 0.31): treat it as noisy."
          ],
          "queries": [
            {
              "entity": "player",
              "metrics": ["rz_carries", "rush_ypc"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false,
                "positions": ["RB"]
              },
              "situation": {
                "fieldZone": "redzone"
              },
              "limit": 5000
            }
          ],
          "ms": 50,
          "cached": false
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Puka Nacua's target share by week",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"The user wants to see Puka Nacua’s target share for each week.\", \"args\": {\"metrics\": [ \"target_share\"], \"by\": \"week\"}}",
            "calls": [],
            "usage": {
              "input": 422,
              "output": 41
            },
            "stop": "end"
          },
          "ms": 1241
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Puka Nacua achieved a target percentage of 34.1% across 74 targets. His target percentage fluctuated throughout the weeks, peaking at 44.4% in Week 5 and 48.0% in Week 8, with other weeks within noise.",
            "calls": [],
            "usage": {
              "input": 254,
              "output": 61
            },
            "stop": "end"
          },
          "ms": 1125
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0039075",
              "metrics": ["target_share"],
              "by": "week"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Puka Nacua (00-0039075, WR, LA), 2026, by week.",
          "text": "Puka Nacua (00-0039075, WR, LA), 2026, by week.\nAll: Tgt% 34.1% on 74 targets\nWeek 1: Tgt% 33.3%\nWeek 4: Tgt% 24.0%\nWeek 5: Tgt% 44.4%\nWeek 6: Tgt% 21.9%\nWeek 7: Tgt% 34.5%\nWeek 8: Tgt% 48.0%",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["target_share"],
              "scope": {
                "seasons": [2026],
                "players": ["00-0039075"],
                "qualifiedOnly": false
              },
              "groupBy": ["week"],
              "limit": 200
            },
            {
              "entity": "player",
              "metrics": ["target_share"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false,
                "positions": ["WR"]
              },
              "limit": 5000
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Brock Bowers' yards per route run in 2025",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Provide the player's YPRR metric for the specified year.\", \"args\": {\"metrics\": [\"yprr\", \"routes\", \"tprr\"]}}",
            "calls": [],
            "usage": {
              "input": 452,
              "output": 40
            },
            "stop": "end"
          },
          "ms": 1292
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Brock Bowers’ yards per route run in 2025 was 1.66 on 409 routes. This rate was 88th percentile among tight ends (qualified rows only).",
            "calls": [],
            "usage": {
              "input": 217,
              "output": 43
            },
            "stop": "end"
          },
          "ms": 927
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0039338",
              "metrics": ["yprr", "routes", "tprr"],
              "seasons": [2025]
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Brock Bowers (00-0039338, TE, LV), 2025.",
          "text": "Brock Bowers (00-0039338, TE, LV), 2025.\nYPRR 1.66 on 409 routes, 88th pct · Rts 409, 89th pct · TPRR 21.0% on 409 routes, 92nd pct (percentiles among TEs, qualified rows only)",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["yprr", "routes", "tprr"],
              "scope": {
                "seasons": [2025],
                "qualifiedOnly": false,
                "positions": ["TE"]
              },
              "limit": 5000
            }
          ],
          "ms": 26,
          "cached": false
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "How good is the Ravens' run defense this year?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: team_stats — One team’s ",
            "tools": [],
            "json": "team_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Let's analyze the Ravens' run defense performance this year.\", \"args\": { \"metrics\": [\"def_rush_epa\", \"def_stuff_rate\", \"def_line_yards\"]}}",
            "calls": [],
            "usage": {
              "input": 419,
              "output": 48
            },
            "stop": "end"
          },
          "ms": 1513
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "The Ravens’ run defense allows an average of -0.080 EPA per carry on 219 carries faced. Their stuff rate is 20.1% across 219 carries faced, ranking them 71st. Line yards allowed are 2.64 on 194 designed runs faced, placing them 77th.",
            "calls": [],
            "usage": {
              "input": 283,
              "output": 77
            },
            "stop": "end"
          },
          "ms": 1481
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "team_stats",
            "args": {
              "team": "BAL",
              "metrics": ["def_rush_epa", "def_stuff_rate", "def_line_yards"],
              "seasons": [2026],
              "side": "defense"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "team_stats",
          "title": "Baltimore Ravens (BAL), 2026.",
          "text": "Baltimore Ravens (BAL), 2026.\nRush EPA All -0.080 on 219 carries faced, 52nd pct · Stuff% All 20.1% on 219 carries faced, 71st pct · Line Yds All 2.64 on 194 designed runs faced, 77th pct (percentiles among the 32, qualified rows only)\nNotes: EPA per carry allowed barely carries over from one season to the next (year-to-year r 0.23): treat it as noisy. Stuff rate allowed barely carries over from one season to the next (year-to-year r 0.35): treat it as noisy.",
          "cards": [],
          "notes": [
            "EPA per carry allowed barely carries over from one season to the next (year-to-year r 0.23): treat it as noisy.",
            "Stuff rate allowed barely carries over from one season to the next (year-to-year r 0.35): treat it as noisy."
          ],
          "queries": [
            {
              "entity": "team",
              "metrics": ["def_rush_epa", "def_stuff_rate", "def_line_yards"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false
              },
              "limit": 5000
            }
          ],
          "ms": 16,
          "cached": false
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Detroit's offensive EPA per play by week",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: team_stats — One team’s ",
            "tools": [],
            "json": "team_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"The user wants to see Detroit's offensive EPA per play by week.\", \"args\": {\"metrics\": [\"adj_off_epa\"], \"by\": \"week\"}}",
            "calls": [],
            "usage": {
              "input": 409,
              "output": 42
            },
            "stop": "end"
          },
          "ms": 1354
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Through 7 games, the Detroit Lions have accumulated an average of +0.067 adjusted EPA per play. Their EPA per play has steadily increased, peaking at +0.084 in Week 5, and remaining at +0.067 in Week 8.",
            "calls": [],
            "usage": {
              "input": 243,
              "output": 60
            },
            "stop": "end"
          },
          "ms": 1236
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "team_stats",
            "args": {
              "team": "DET",
              "metrics": ["adj_off_epa"],
              "side": "offense",
              "by": "week"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "team_stats",
          "title": "Detroit Lions (DET), 2026, by week.",
          "text": "Detroit Lions (DET), 2026, by week.\nAll: Adj EPA +0.067 on 7 games\nWeek 1: Adj EPA +0.014\nWeek 2: Adj EPA +0.030\nWeek 3: Adj EPA +0.056\nWeek 4: Adj EPA +0.065\nWeek 5: Adj EPA +0.084\nWeek 7: Adj EPA +0.071\nWeek 8: Adj EPA +0.067",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "team",
              "metrics": ["adj_off_epa"],
              "scope": {
                "seasons": [2026],
                "teams": ["DET"],
                "qualifiedOnly": false
              },
              "groupBy": ["week"],
              "limit": 200
            },
            {
              "entity": "team",
              "metrics": ["adj_off_epa"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false
              },
              "limit": 5000
            }
          ],
          "ms": 25,
          "cached": false
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Compare Ja'Marr Chase and CeeDee Lamb in yards per route run",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: compare — Two to four pl",
            "tools": [],
            "json": "compare",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Comparing yprr for Chase and Lamb.\", \"args\": {\"metrics\": [\"yprr\", \"yprr\"]}}",
            "calls": [],
            "usage": {
              "input": 464,
              "output": 32
            },
            "stop": "end"
          },
          "ms": 1239
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Ja’Marr Chase has a YPRR of 2.17 on 227 routes, ranking 75th in percentile. CeeDee Lamb has a YPRR of 2.72 on 261 routes, ranking 89th in percentile. The results within noise.",
            "calls": [],
            "usage": {
              "input": 234,
              "output": 67
            },
            "stop": "end"
          },
          "ms": 1421
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "compare",
            "args": {
              "ids": ["00-0036900", "00-0036358"],
              "metrics": ["yprr"]
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "compare",
          "title": "Ja'Marr Chase vs CeeDee Lamb, 2026.",
          "text": "Ja'Marr Chase vs CeeDee Lamb, 2026.\nJa'Marr Chase (00-0036900, WR, CIN): YPRR 2.17 (est.) on 227 routes, 75th pct\nCeeDee Lamb (00-0036358, WR, DAL): YPRR 2.72 (est.) on 261 routes, 89th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["yprr"],
              "scope": {
                "seasons": [2026],
                "positions": ["WR"],
                "qualifiedOnly": false
              },
              "limit": 5000
            }
          ],
          "ms": 0,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "Bijan vs Gibbs: fantasy points per game this season",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: compare — Two to four pl",
            "tools": [],
            "json": "compare",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"Comparing fantasy points per game for Bijan Robinson and Jahmyr Gibbs this season.\", \"args\": {\"metrics\": [\"fantasy_ppg\"]}}",
            "calls": [],
            "usage": {
              "input": 436,
              "output": 36
            },
            "stop": "end"
          },
          "ms": 1222
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Bijan Robinson has averaged 19.2 fantasy points per game over 8 games, ranking 98th in the league. Jahmyr Gibbs has averaged 28.0 fantasy points per game over 7 games, ranking 100th in the league. Within noise, the two RBs are fairly comparable.",
            "calls": [],
            "usage": {
              "input": 217,
              "output": 70
            },
            "stop": "end"
          },
          "ms": 1402
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "compare",
            "args": {
              "ids": ["00-0038542", "00-0039139"],
              "metrics": ["fantasy_ppg"],
              "seasons": [2026]
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "compare",
          "title": "Bijan Robinson vs Jahmyr Gibbs, 2026.",
          "text": "Bijan Robinson vs Jahmyr Gibbs, 2026.\nBijan Robinson (00-0038542, RB, ATL): FP/G 19.2 on 8 games, 98th pct\nJahmyr Gibbs (00-0039139, RB, DET): FP/G 28.0 on 7 games, 100th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["fantasy_ppg"],
              "scope": {
                "seasons": [2026],
                "positions": ["RB"],
                "qualifiedOnly": false
              },
              "limit": 5000
            }
          ],
          "ms": 1,
          "cached": true
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "What does WOPR mean?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: describe — What a metric",
            "tools": [],
            "json": "describe",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"The question asks for a definition of WOPR.\", \"args\": {\"metric\": \"wopr\"}}",
            "calls": [],
            "usage": {
              "input": 394,
              "output": 26
            },
            "stop": "end"
          },
          "ms": 897
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "WOPR, or Weighted Opportunity Rating, is a metric that predicts receiving fantasy output for RBs, WRs, and TEs. It’s calculated as 1.5 times target share plus 0.7 times air-yards share, with a sample size of 30 over 17 games. The rating is higher is better, and shows a high level of stability with a correlation of 0.70.",
            "calls": [],
            "usage": {
              "input": 232,
              "output": 90
            },
            "stop": "end"
          },
          "ms": 1623
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "describe",
            "args": {
              "metric": "wopr"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "describe",
          "title": "WOPR (wopr).",
          "text": "WOPR (wopr).\nWeighted opportunity rating: 1.5 × target share + 0.7 × air-yards share. Predicts receiving fantasy output.\nUnit: number; higher is better. Sample: targets, qualified at 30 over 17 games.\nPositions: RB, WR, TE. Seasons: 2019 on. Sources: nflverse play-by-play.\nStability: year-to-year r 0.70 (high), half signal at 8 targets.",
          "cards": [],
          "notes": [],
          "queries": [],
          "ms": 0,
          "cached": false
        }
      ]
    },
    {
      "model": "gemma3:4b",
      "question": "What is RYOE?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: describe — What a metric",
            "tools": [],
            "json": "describe",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"The question asks for a definition of RYOE, so I'll select the metric that directly represents it.\", \"args\": {\"metric\": \"ryoe\"}}",
            "calls": [],
            "usage": {
              "input": 287,
              "output": 38
            },
            "stop": "end"
          },
          "ms": 1026
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "RYOE, or Rush yards over expected, measures rushing yards above what Next Gen Stats expects from a handoff. The unit is count, and a higher number is better, with a sample of games. The stability is low, with a correlation of 0.28 year-to-year across — games.",
            "calls": [],
            "usage": {
              "input": 218,
              "output": 65
            },
            "stop": "end"
          },
          "ms": 1267
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "describe",
            "args": {
              "metric": "ryoe"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "describe",
          "title": "Rush yards over expected (ryoe).",
          "text": "Rush yards over expected (ryoe).\nRushing yards above what Next Gen Stats expects from the blockers’ and defenders’ positions at the handoff: credits the runner, not the line.\nUnit: count; higher is better. Sample: games.\nPositions: RB. Seasons: 2019 on. Sources: NFL Next Gen Stats (nflverse).\nStability: year-to-year r 0.28 (low), half signal at — games.",
          "cards": [],
          "notes": [],
          "queries": [],
          "ms": 0,
          "cached": false
        }
      ]
    }
  ]
}
```

Create `tests/ask/replays/qwen3-4b-compact-structured.json`:

```json
{
  "model": "qwen3:4b",
  "profile": "compact",
  "mode": "structured",
  "through": {
    "season": 2026,
    "week": 8,
    "seasonType": "REG"
  },
  "people": [
    {
      "id": "00-0036900",
      "name": "Ja'Marr Chase",
      "firstName": "Ja'Marr",
      "lastName": "Chase",
      "position": "WR",
      "team": "CIN",
      "firstSeason": 2021,
      "lastSeason": 2026,
      "games": 85,
      "recentGames": 23,
      "recentPoints": 441.8
    },
    {
      "id": "00-0038542",
      "name": "Bijan Robinson",
      "firstName": "Bijan",
      "lastName": "Robinson",
      "position": "RB",
      "team": "ATL",
      "firstSeason": 2023,
      "lastSeason": 2026,
      "games": 59,
      "recentGames": 25,
      "recentPoints": 524.1
    },
    {
      "id": "00-0034857",
      "name": "Josh Allen",
      "firstName": "Joshua",
      "lastName": "Allen",
      "position": "QB",
      "team": "BUF",
      "firstSeason": 2019,
      "lastSeason": 2026,
      "games": 123,
      "recentGames": 24,
      "recentPoints": 567.4
    },
    {
      "id": "00-0032764",
      "name": "Derrick Henry",
      "firstName": "Derrick",
      "lastName": "Henry",
      "position": "RB",
      "team": "BAL",
      "firstSeason": 2019,
      "lastSeason": 2026,
      "games": 114,
      "recentGames": 25,
      "recentPoints": 416.2
    },
    {
      "id": "00-0039075",
      "name": "Puka Nacua",
      "firstName": "Puka",
      "lastName": "Nacua",
      "position": "WR",
      "team": "LA",
      "firstSeason": 2023,
      "lastSeason": 2026,
      "games": 50,
      "recentGames": 22,
      "recentPoints": 513.6
    },
    {
      "id": "00-0039338",
      "name": "Brock Bowers",
      "firstName": "Brock",
      "lastName": "Bowers",
      "position": "TE",
      "team": "LV",
      "firstSeason": 2024,
      "lastSeason": 2026,
      "games": 35,
      "recentGames": 18,
      "recentPoints": 299.9
    },
    {
      "id": "00-0036358",
      "name": "CeeDee Lamb",
      "firstName": "Cedarian",
      "lastName": "Lamb",
      "position": "WR",
      "team": "DAL",
      "firstSeason": 2020,
      "lastSeason": 2026,
      "games": 103,
      "recentGames": 22,
      "recentPoints": 369.2
    },
    {
      "id": "00-0039139",
      "name": "Jahmyr Gibbs",
      "firstName": "Jahmyr",
      "lastName": "Gibbs",
      "position": "RB",
      "team": "DET",
      "firstSeason": 2023,
      "lastSeason": 2026,
      "games": 56,
      "recentGames": 24,
      "recentPoints": 562.7
    }
  ],
  "recordings": [
    {
      "model": "qwen3:4b",
      "question": "Who leads WRs in yards per route run since week 5?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for WRs leading in yards per route run since week 5. The metric candidate 'yprr' fits as it's yards per route run for players. The time filter is 'since week 5' which translates to weeks 5-8 of 2:2026. The context specifies positions as WR and data through week 8 of 2026.\",\n  \"args\": {\n    \"metric\": \"yprr\",\n    \"position\": \"WR\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 429,
              "output": 111
            },
            "stop": "end"
          },
          "ms": 1942
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Okay, the user is asking who leads WRs in yards per route run since week 5. Let me check the result they provided.\n\nLooking at the leaderboard, the first entry is Adonai Mitchell with YPRR 3.94 on 36 routes. The result says \"best first\" and it's qualified. So he's the leader. The question specifies to use only numbers from the result. The YPRR is 3.94, which is the key number here. \n\nI need to make sure not to add any extra info. The user said two or three sentences. Since the answer is straightforward, I can state Adonai Mitchell leads with 3.94 YPRR. The result doesn't mention any splits or noise here, so no need for \"within noise\" since it's a clear leader. Also, the caveats about the data are to be passed on but the user said to pass on notes' caveats. However, the instruction says to pass on the notes' caveats but in this case, the result doesn't have notes mentioned. Wait, the user said \"Pass on the notes' caveats\" but the result doesn't have any notes listed here. So maybe just state the leader and the number.\n\nWait, the result says \"qualified only\" for the weeks 5-8. So the answer is Adonai Mitchell with 3.94 YPRR. The user wants only numbers from the result. So the answer should be: Adonai Mitchell leads WRs in yards per route run since week 5 with 3.94 YPRR (est.) on 36 routes. But the question says \"who leads\", so the name and the number. The result has the number as 3.94. \n\nWait, the instruction says \"Use only numbers that are in the result.\" So the number here is 3.94. But the answer needs to be in two or three sentences. Wait, the user's question is \"Who leads WRs in yards per route run since week 5?\" So the answer is the name and the number. \n\nLooking at the result: the first entry is Adonai Mitchell with YPRR 3.94. So the answer is Adonai Mitchell leads with 3.94 YPRR. The other numbers like routes or percentiles aren't needed here since the question is about who leads, so the leader's name and the YPRR value. \n\nWait, the instruction says \"For a rate marked 'not qualified', give its sample.\" But here all are qualified. So just state the leader and the rate. \n\nSo the answer in two sentences: Adonai Mitchell leads WRs in yards per route run since week 5 with 3.94 YPRR. The result shows this as the top entry with qualified data. \n\nWait, the user said \"Answer the question in two or three sentences from the tool result below.\" So maybe: Adonai Mitchell leads WRs in yards per route run since week 5 with 3.94 YPRR (est.). This is based on data from weeks 5–8. \n\nBut the instruction says \"Use only numbers that are in the result.\" So the numbers in the result are 3.94, 36 routes, etc. But the question is about who leads, so the key number is 3.94. \n\nWait, the exact result shows \"YPRR 3.94 (est.) on 36 routes\". So the number is 3.94. The answer should be: Adonai Mitchell leads WRs in yards per route run since week 5 with 3.94 YPRR. \n\nI think that's two sentences? Wait, no, the user wants two or three sentences. Let me see. \n\nThe answer: Adonai Mitchell leads WRs in yards per route run since week 5 with 3.94 YPRR (est.). The data is qualified for weeks 5–8. \n\nBut the instruction says \"Pass on the notes' caveats.\" However, the result doesn't have notes listed here. The result says \"qualified only\" so maybe the caveat is that it's qualified. But the user said \"Pass on the notes' caveats\" so if there are caveats in the notes, but here the result doesn't have a notes section. So maybe just state the leader and the number. \n\nThe answer should be: Adonai Mitchell leads WRs in yards per route run since week 5 with 3.94 YPRR. This is the highest rate from weeks 5–8. \n\nBut the user wants two or three sentences. Let me check the exact result again. The result says \"2026 weeks 5–8: best first, qualified only.\" So the data is for weeks 5",
            "calls": [],
            "usage": {
              "input": 619,
              "output": 1024
            },
            "stop": "length"
          },
          "ms": 15337
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "yprr",
              "seasons": [2026],
              "weeks": [5, 8],
              "position": "WR"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Yards per route run (yprr), WR, 2026 weeks 5–8: best first, qualified only.",
          "text": "Yards per route run (yprr), WR, 2026 weeks 5–8: best first, qualified only.\n1. Adonai Mitchell (00-0039890, WR, NYJ) — YPRR 3.94 (est.) on 36 routes, 100th pct\n2. Jaxon Smith-Njigba (00-0038543, WR, SEA) — YPRR 3.75 (est.) on 103 routes, 99th pct\n3. Luther Burden III (00-0040735, WR, CHI) — YPRR 3.58 (est.) on 76 routes, 98th pct\n4. Amon-Ra St. Brown (00-0036963, WR, DET) — YPRR 3.53 (est.) on 76 routes, 97th pct\n5. Jaylin Noel (00-0040138, WR, HOU) — YPRR 3.45 (est.) on 42 routes, 96th pct\n6. Malik Nabers (00-0039337, WR, NYG) — YPRR 3.36 (est.) on 118 routes, 96th pct\n7. Tee Higgins (00-0036410, WR, CIN) — YPRR 3.32 (est.) on 98 routes, 95th pct\n8. DeMario Douglas (00-0038621, WR, NE) — YPRR 3.13 (est.) on 80 routes, 94th pct\n9. Christian Watson (00-0038124, WR, GB) — YPRR 3.07 (est.) on 123 routes, 93rd pct\n10. Omar Cooper Jr. (00-0041511, WR, NYJ) — YPRR 2.91 (est.) on 75 routes, 92nd pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["yprr"],
              "scope": {
                "seasons": [2026],
                "weeks": [5, 8],
                "positions": ["WR"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 21,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Best tight end by targets per route run this season",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for the best tight end by targets per route run this season. The metric candidate 'tprr' (Targets per route run) fits the query. The context specifies the current season as 2026, and the position is TE (tight end). The filter for 'this season' is handled by the time context. No spl\", \"args\": {\n    \"metric\": \"tprr\",\n    \"position\": \"TE\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 383,
              "output": 101
            },
            "stop": "end"
          },
          "ms": 1786
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Isaiah Likely leads with 31.2% TPRR. This value is qualified based on the 2026 season data.",
            "calls": [],
            "usage": {
              "input": 618,
              "output": 282
            },
            "stop": "end"
          },
          "ms": 4256
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "tprr",
              "seasons": [2026],
              "position": "TE"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Targets per route run (tprr), TE, 2026: best first, qualified only.",
          "text": "Targets per route run (tprr), TE, 2026: best first, qualified only.\n1. Isaiah Likely (00-0037838, TE, NYG) — TPRR 31.2% (est.) on 202 routes, 100th pct\n2. Brock Bowers (00-0039338, TE, LV) — TPRR 30.3% (est.) on 201 routes, 99th pct\n3. Dalton Schultz (00-0034383, TE, HOU) — TPRR 27.2% (est.) on 158 routes, 97th pct\n4. Trey McBride (00-0037744, TE, ARI) — TPRR 26.6% (est.) on 323 routes, 96th pct\n5. George Kittle (00-0033288, TE, SF) — TPRR 25.4% (est.) on 181 routes, 94th pct\n6. T.J. Hockenson (00-0035229, TE, MIN) — TPRR 24.3% (est.) on 152 routes, 93rd pct\n7. Kenyon Sadiq (00-0041032, TE, NYJ) — TPRR 23.9% (est.) on 113 routes, 91st pct\n8. Mark Andrews (00-0034753, TE, BAL) — TPRR 23.6% (est.) on 174 routes, 90th pct\n9. Tyler Warren (00-0040128, TE, IND) — TPRR 23.1% (est.) on 199 routes, 89th pct\n10. Dalton Kincaid (00-0038933, TE, BUF) — TPRR 22.3% (est.) on 157 routes, 87th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["tprr"],
              "scope": {
                "seasons": [2026],
                "positions": ["TE"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 17,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Which QBs had the best CPOE in 2025?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for QBs with the best CPOE in 2025. CPOE is a metric candidate. The data is through week 8 of 2:2026, so 2025 is covered. The metric to use is 'cpoe' (Completion % over expected). No filter needed as it's asking for the best overall in 2025.\",\n  \"args\": {\n    \"metric\": \"cpoe\",\n    \"position\": \"QB\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 406,
              "output": 115
            },
            "stop": "end"
          },
          "ms": 1961
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Drake Maye led with +10.8 CPOE in 2025, followed by Brock Purdy at +7.2 and Jordan Love at +5.5. The top three QBs had CPOE values above +5.0 with qualified models.",
            "calls": [],
            "usage": {
              "input": 608,
              "output": 670
            },
            "stop": "end"
          },
          "ms": 9975
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "cpoe",
              "seasons": [2025],
              "position": "QB"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Completion % over expected (cpoe), QB, 2025: best first, qualified only.",
          "text": "Completion % over expected (cpoe), QB, 2025: best first, qualified only.\n1. Drake Maye (00-0039851, QB, NE) — CPOE +10.8 on 472 attempts with a completion model, 100th pct\n2. Brock Purdy (00-0037834, QB, SF) — CPOE +7.2 on 272 attempts with a completion model, 97th pct\n3. Jordan Love (00-0036264, QB, GB) — CPOE +5.5 on 411 attempts with a completion model, 94th pct\n4. Sam Darnold (00-0034869, QB, SEA) — CPOE +5.2 on 451 attempts with a completion model, 91st pct\n5. Joe Burrow (00-0036442, QB, CIN) — CPOE +4.7 on 248 attempts with a completion model, 88th pct\n6. Mac Jones (00-0036972, QB, SF) — CPOE +3.7 on 278 attempts with a completion model, 84th pct\n7. Josh Allen (00-0034857, QB, BUF) — CPOE +3.5 on 445 attempts with a completion model, 81st pct\n8. Jalen Hurts (00-0036389, QB, PHI) — CPOE +3.2 on 427 attempts with a completion model, 78th pct\n9. Spencer Rattler (00-0039376, QB, NO) — CPOE +2.4 on 245 attempts with a completion model, 75th pct\n10. Daniel Jones (00-0035710, QB, IND) — CPOE +2.3 on 373 attempts with a completion model, 72nd pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["cpoe"],
              "scope": {
                "seasons": [2025],
                "positions": ["QB"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 15,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Top 5 running backs in rush yards over expected per carry",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for the top 5 running backs in 'rush yards over expected per carry'. From the metric candidates, 'ryoe_att' matches this description (RYOE per attempt, which is rush yards over expected per carry). The context specifies positions as RB and data through week 8 of 2026. No additional\"\n  , \"args\": {\n    \"metric\": \"ryoe_att\",\n    \"position\": \"RB\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 365,
              "output": 101
            },
            "stop": "end"
          },
          "ms": 1834
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "1. Jaylen Warren: 1.87 RYOE/att on 119 carries, 2. Kenneth Walker III: 1.76 RYOE/att on 141 carries, 3. Kenny Gainwell: 1.32 RYOE/att on 58 carries, 4. Braelon Allen: 1.18 RYOE/att on 112 carries, 5. Bijan Robinson: 1.",
            "calls": [],
            "usage": {
              "input": 418,
              "output": 1024
            },
            "stop": "length"
          },
          "ms": 15138
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "ryoe_att",
              "position": "RB",
              "limit": 5
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "RYOE per attempt (ryoe_att), RB, 2026: best first, qualified only.",
          "text": "RYOE per attempt (ryoe_att), RB, 2026: best first, qualified only.\n1. Jaylen Warren (00-0037228, RB, PIT) — RYOE/att 1.87 on 119 Next Gen Stats carries, 100th pct\n2. Kenneth Walker III (00-0038134, RB, KC) — RYOE/att 1.76 on 141 Next Gen Stats carries, 98th pct\n3. Kenny Gainwell (00-0036919, RB, TB) — RYOE/att 1.32 on 58 Next Gen Stats carries, 95th pct\n4. Braelon Allen (00-0039794, RB, NYJ) — RYOE/att 1.18 on 112 Next Gen Stats carries, 93rd pct\n5. Bijan Robinson (00-0038542, RB, ATL) — RYOE/att 1.16 on 150 Next Gen Stats carries, 90th pct\nNotes: RYOE per attempt barely carries over from one season to the next (year-to-year r 0.20): treat it as noisy.",
          "cards": [],
          "notes": [
            "RYOE per attempt barely carries over from one season to the next (year-to-year r 0.20): treat it as noisy."
          ],
          "queries": [
            {
              "entity": "player",
              "metrics": ["ryoe_att"],
              "scope": {
                "seasons": [2026],
                "positions": ["RB"],
                "qualifiedOnly": true
              },
              "limit": 5
            }
          ],
          "ms": 16,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Which defenses blitz the most?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for defenses that blitz the most. The metric candidate 'def_blitz_rate' directly measures blitz rate (share of opponent dropbacks with a blitz), which fits the query. No filter is needed since the question doesn't specify a time period or other conditions beyond the current season.\",\n  \"args\": {\n    \"metric\": \"def_blitz_rate\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 366,
              "output": 84
            },
            "stop": "end"
          },
          "ms": 1503
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Minnesota Vikings blitz the most at 71.4% on 206 charted dropbacks faced. This rate ranks highest among all defenses in the 2026 season.",
            "calls": [],
            "usage": {
              "input": 476,
              "output": 337
            },
            "stop": "end"
          },
          "ms": 5052
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "def_blitz_rate"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Blitz rate (def_blitz_rate), 2026: best first, qualified only.",
          "text": "Blitz rate (def_blitz_rate), 2026: best first, qualified only.\n1. Minnesota Vikings (MIN) — Blitz% 71.4% on 206 charted dropbacks faced, 100th pct\n2. Washington Commanders (WAS) — Blitz% 45.5% on 246 charted dropbacks faced, 97th pct\n3. New York Giants (NYG) — Blitz% 41.9% on 241 charted dropbacks faced, 94th pct\n4. Tampa Bay Buccaneers (TB) — Blitz% 41.0% on 268 charted dropbacks faced, 90th pct\n5. Chicago Bears (CHI) — Blitz% 40.6% on 224 charted dropbacks faced, 87th pct\n6. New England Patriots (NE) — Blitz% 39.0% on 251 charted dropbacks faced, 84th pct\n7. New York Jets (NYJ) — Blitz% 38.4% on 250 charted dropbacks faced, 81st pct\n8. Denver Broncos (DEN) — Blitz% 35.6% on 295 charted dropbacks faced, 77th pct\n9. Buffalo Bills (BUF) — Blitz% 35.5% on 262 charted dropbacks faced, 74th pct\n10. New Orleans Saints (NO) — Blitz% 34.6% on 257 charted dropbacks faced, 71st pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "team",
              "metrics": ["def_blitz_rate"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 13,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Which teams have the best playoff odds right now?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for teams with the best playoff odds. The metric candidates include playoff_pct, which directly measures playoff odds (team). The context specifies the current season (2026 regular season through week 8). The question doesn't ask for a filter or split, so no additional filters are \",\n  \"args\": {\n    \"metric\": \"playoff_pct\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 358,
              "output": 86
            },
            "stop": "end"
          },
          "ms": 1573
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "The Buffalo Bills lead with 96.8% playoff odds. The Denver Broncos follow at 93.4%, while the Jacksonville Jaguars and San Francisco 49ers are tied at 93.3% each. These top teams' playoff odds are within noise per the data.",
            "calls": [],
            "usage": {
              "input": 447,
              "output": 691
            },
            "stop": "end"
          },
          "ms": 10096
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "playoff_pct"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Playoff odds (playoff_pct), 2026: best first, qualified only.",
          "text": "Playoff odds (playoff_pct), 2026: best first, qualified only.\n1. Buffalo Bills (BUF) — Playoff% 96.8% on 7 games, 100th pct\n2. Denver Broncos (DEN) — Playoff% 93.4% on 8 games, 97th pct\n3. Jacksonville Jaguars (JAX) — Playoff% 93.3% on 7 games, 90th pct\n3. San Francisco 49ers (SF) — Playoff% 93.3% on 7 games, 90th pct\n5. Minnesota Vikings (MIN) — Playoff% 91.4% on 7 games, 87th pct\n6. Pittsburgh Steelers (PIT) — Playoff% 82.5% on 8 games, 84th pct\n7. Cincinnati Bengals (CIN) — Playoff% 80.8% on 7 games, 81st pct\n8. New England Patriots (NE) — Playoff% 79.4% on 8 games, 77th pct\n9. Seattle Seahawks (SEA) — Playoff% 78.8% on 7 games, 74th pct\n10. Detroit Lions (DET) — Playoff% 75.9% on 7 games, 71st pct\nNotes: Playoff odds barely carries over from one season to the next (year-to-year r 0.24): treat it as noisy.",
          "cards": [],
          "notes": [
            "Playoff odds barely carries over from one season to the next (year-to-year r 0.24): treat it as noisy."
          ],
          "queries": [
            {
              "entity": "team",
              "metrics": ["playoff_pct"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 24,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Most red-zone carries among running backs last season",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for 'most red-zone carries among running backs last season'. The context specifies 'last season' = 2025, and the data is up to week 8 of 2026. The metric candidate 'rz_carries' (red-zone carries) fits perfectly. Since the question specifies 'last season' (2025), the time filter is \",\n  \"args\": {\n    \"metric\": \"rz_carries\",\n    \"position\": \"RB\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 372,
              "output": 112
            },
            "stop": "end"
          },
          "ms": 1947
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Christian McCaffrey had 75 red-zone carries. This is the highest count among running backs last season.",
            "calls": [],
            "usage": {
              "input": 492,
              "output": 325
            },
            "stop": "end"
          },
          "ms": 4804
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "rz_carries",
              "seasons": [2025],
              "position": "RB"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Red-zone carries (rz_carries), RB, 2025: best first, qualified only.",
          "text": "Red-zone carries (rz_carries), RB, 2025: best first, qualified only.\n1. Christian McCaffrey (00-0033280, RB, SF) — RZ Car 75, 100th pct\n2. Jonathan Taylor (00-0036223, RB, IND) — RZ Car 70, 99th pct\n3. Derrick Henry (00-0032764, RB, BAL) — RZ Car 63, 99th pct\n4. James Cook (00-0037248, RB, BUF) — RZ Car 56, 98th pct\n5. Javonte Williams (00-0036997, RB, DAL) — RZ Car 54, 97th pct\n5. Travis Etienne (00-0036973, RB, JAX) — RZ Car 54, 97th pct\n7. Kyren Williams (00-0037840, RB, LA) — RZ Car 53, 96th pct\n8. Jahmyr Gibbs (00-0039139, RB, DET) — RZ Car 52, 95th pct\n8. Josh Jacobs (00-0035700, RB, GB) — RZ Car 52, 95th pct\n10. Zach Charbonnet (00-0039165, RB, SEA) — RZ Car 51, 95th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["rz_carries"],
              "scope": {
                "seasons": [2025],
                "positions": ["RB"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 16,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Who has the highest target share among WRs over the last 3 weeks?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: leaderboard — Rank playe",
            "tools": [],
            "json": "leaderboard",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for the highest target share among WRs in the last 3 weeks (weeks 6-8 of 2026). The metric candidate 'target_share' fits perfectly as it's a stable player metric for target share. No filter is needed beyond the WR position and time frame.\",\n  \"args\": {\n    \"metric\": \"target_share\",\n    \"position\": \"WR\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 402,
              "output": 92
            },
            "stop": "end"
          },
          "ms": 1649
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Emeka Egbuka has the highest target share at 39.0% on 16 targets. This is the top rate among WRs for the specified 3-week period and is qualified.",
            "calls": [],
            "usage": {
              "input": 595,
              "output": 490
            },
            "stop": "end"
          },
          "ms": 7363
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "leaderboard",
            "args": {
              "metric": "target_share",
              "seasons": [2026],
              "weeks": [6, 8],
              "position": "WR"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "leaderboard",
          "title": "Target share (target_share), WR, 2026 weeks 6–8: best first, qualified only.",
          "text": "Target share (target_share), WR, 2026 weeks 6–8: best first, qualified only.\n1. Emeka Egbuka (00-0040129, WR, TB) — Tgt% 39.0% on 16 targets, 100th pct\n2. Jaxon Smith-Njigba (00-0038543, WR, SEA) — Tgt% 38.4% on 28 targets, 99th pct\n3. CeeDee Lamb (00-0036358, WR, DAL) — Tgt% 38.0% on 41 targets, 98th pct\n4. Malik Nabers (00-0039337, WR, NYG) — Tgt% 34.3% on 24 targets, 97th pct\n5. Amon-Ra St. Brown (00-0036963, WR, DET) — Tgt% 33.9% on 19 targets, 96th pct\n6. Puka Nacua (00-0039075, WR, LA) — Tgt% 33.7% on 29 targets, 94th pct\n7. DeVonta Smith (00-0036912, WR, PHI) — Tgt% 31.8% on 14 targets, 93rd pct\n8. Matthew Golden (00-0040667, WR, GB) — Tgt% 31.4% on 38 targets, 92nd pct\n9. Justin Jefferson (00-0036322, WR, MIN) — Tgt% 30.8% on 16 targets, 91st pct\n10. Ja'Marr Chase (00-0036900, WR, CIN) — Tgt% 30.7% on 23 targets, 90th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["target_share"],
              "scope": {
                "seasons": [2026],
                "weeks": [6, 8],
                "positions": ["WR"],
                "qualifiedOnly": true
              },
              "limit": 10
            }
          ],
          "ms": 29,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "How does Ja'Marr Chase do against man coverage this year?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks about Ja'Marr Chase's performance against man coverage this year (2026). The context shows the player is WR, CIN (Cincinnati), and the relevant metric candidates include tprr_man and yprr_man for man coverage. Since the question specifies 'this year' and the data is through week 8,\",\n  \"args\": {\n    \"metrics\": [\n      \"tprr_man\"\n    ],\n    \"filters\": [\n      \"man_coverage\"\n    ]\n  }\n}",
            "calls": [],
            "usage": {
              "input": 420,
              "output": 112
            },
            "stop": "end"
          },
          "ms": 2057
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Ja'Marr Chase has no data against man coverage this year. The sample size is 0, so the rate is not qualified.",
            "calls": [],
            "usage": {
              "input": 211,
              "output": 883
            },
            "stop": "end"
          },
          "ms": 12676
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0036900",
              "metrics": ["tprr_man"],
              "seasons": [2026],
              "coverage": "man"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Ja'Marr Chase (00-0036900, WR, CIN), 2026, vs man.",
          "text": "Ja'Marr Chase (00-0036900, WR, CIN), 2026, vs man.\nNotes: Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season. TPRR vs man: published through 2025. No rows: nothing in this scope for this player or team (no game, or the metric starts later).",
          "cards": [],
          "notes": [
            "Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season.",
            "TPRR vs man: published through 2025.",
            "No rows: nothing in this scope for this player or team (no game, or the metric starts later)."
          ],
          "queries": [
            {
              "entity": "player",
              "metrics": ["tprr_man"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false,
                "positions": ["WR"]
              },
              "situation": {
                "coverage": "man"
              },
              "limit": 5000
            }
          ],
          "ms": 96,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Show me Bijan Robinson's game log this season",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for Bijan Robinson's game log this season. The context shows the player is Bijan Robinson (RB, ATL) and the time is 'this season' (2026). The metric candidates include 'games' and 'games_played', but the question specifies a 'game log', which typically means detailed game-by-game (\"\n\n  , \"args\": {\n    \"metrics\": [\n      \"games\"\n    ],\n    \"by\": \"week\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 295,
              "output": 107
            },
            "stop": "end"
          },
          "ms": 1908
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Bijan Robinson played in 8 games this season. He started one game each week from week 1 through week 8.",
            "calls": [],
            "usage": {
              "input": 218,
              "output": 467
            },
            "stop": "end"
          },
          "ms": 6702
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0038542",
              "metrics": ["games"],
              "seasons": [2026],
              "by": "week"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Bijan Robinson (00-0038542, RB, ATL), 2026, by week.",
          "text": "Bijan Robinson (00-0038542, RB, ATL), 2026, by week.\nAll: G 8\nWeek 1: G 1\nWeek 2: G 1\nWeek 3: G 1\nWeek 4: G 1\nWeek 5: G 1\nWeek 6: G 1\nWeek 7: G 1\nWeek 8: G 1",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["games"],
              "scope": {
                "seasons": [2026],
                "players": ["00-0038542"],
                "qualifiedOnly": false
              },
              "groupBy": ["week"],
              "limit": 200
            },
            {
              "entity": "player",
              "metrics": ["games"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false,
                "positions": ["RB"]
              },
              "limit": 5000
            }
          ],
          "ms": 16,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "What is Josh Allen's EPA per dropback when he's pressured?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for Josh Allen's EPA per dropback when he's pressured. The metric candidate 'pressured_epa' matches this exactly (EPA when pressured). The context specifies the player ID 00-0034857 (QB, BUF) and the time frame up to week 8 of 2026. No additional filters or splits are needed beyond\",\n  \"args\": {\n    \"metrics\": [\n      \"pressured_epa\"\n    ],\n    \"filters\": [\n      \"pressure\"\n    ]\n  }\n}",
            "calls": [],
            "usage": {
              "input": 398,
              "output": 123
            },
            "stop": "end"
          },
          "ms": 2182
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Josh Allen has a Prss EPA of -0.382 per pressured dropback with 146 observations. This represents the 66th percentile among qualified QBs.",
            "calls": [],
            "usage": {
              "input": 234,
              "output": 1011
            },
            "stop": "end"
          },
          "ms": 14676
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0034857",
              "metrics": ["pressured_epa"],
              "pressure": true
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Josh Allen (00-0034857, QB, BUF), 2025, under pressure.",
          "text": "Josh Allen (00-0034857, QB, BUF), 2025, under pressure.\nPrss EPA -0.382 on 146 pressured dropbacks, 66th pct (percentiles among QBs, qualified rows only)\nNotes: Pressure, coverage, personnel, formation and on-field data are published through 2025: 2025 shown. Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season.",
          "cards": [],
          "notes": [
            "Pressure, coverage, personnel, formation and on-field data are published through 2025: 2025 shown.",
            "Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season."
          ],
          "queries": [
            {
              "entity": "player",
              "metrics": ["pressured_epa"],
              "scope": {
                "seasons": [2025],
                "qualifiedOnly": false,
                "positions": ["QB"]
              },
              "situation": {
                "pressure": true
              },
              "limit": 5000
            }
          ],
          "ms": 35,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "How many yards per carry does Derrick Henry average in the red zone?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for Derrick Henry's average yards per carry in the red zone. The context provides his ID (00-0032764) and the metric candidates. 'rz_carries' refers to red-zone carries, but the question wants yards per carry specifically in red zone. The metric 'rush_ypc' is yards per carry (total\", \"args\": {\n    \"metrics\": [\n      \"rush_ypc\"\n    ],\n    \"filters\": [\n      \"red_zone\"\n    ]\n  }}",
            "calls": [],
            "usage": {
              "input": 371,
              "output": 117
            },
            "stop": "end"
          },
          "ms": 2146
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "We are given the result for Derrick Henry in the red zone for the year 2026 (note: the year in the result is 2026, but the current year is 2:2024, so this might be a typo? However, we must use the numbers from the result). The result says: \"YPC 3.4 on 40 carries, 87th pct (percentiles among RBs, qualified rows only)\".\n\nThe question asks: \"How many yards per carry does Derrick Henry average in the red zone?\"\n\nFrom the result, we see:\n- YPC (Yards per carry) = 3.4\n- This is for 40 carries (but the question is about average yards per carry, so we use the YPC value)\n\nThe note says: \"Yards per carry barely carries over from one season to the next (year-to-year r 0.31): treat it as noisy.\" But we are to pass on the notes' caveats and not claim causes.\n\nWe are to use only numbers that are in the result. The result provides the YPC as 3.4.\n\nAlso, note the result says \"87th pct\" meaning 87th percentile. But the question is about the average (which is the YPC value we have).\n\nTherefore, the answer is 3.4 yards per carry.\n\nBut the question says: \"How many yards per carry does Derrick Henry average in the red zone?\"\n\nWe have the average (YPC) as 3.4.\n\nHowever, note the result says: \"YPC 3.4 on 40 carries\". This means he averaged 3.4 yards per carry over 40 carries.\n\nSo the answer is 3.4.\n\nBut the problem says: \"For a rate marked 'not qualified', give its sample.\" - However, in this case, the rate is qualified (we have a number).\n\nAlso, the problem says: \"For a split, give the overall line first, and say 'within noise' when the result does.\" - There is no split here.\n\nWe are to answer in two or three sentences.\n\nLet's write:\n\nDerrick Henry averages 3.4 yards per carry in the red zone. This figure is based on 40 carries and represents the 87th percentile among RBs.\n\nBut note: the problem says \"Use only numbers that are in the result\". The result has the numbers: 3.4, 40, 87th pct.\n\nHowever, the question asks for the average yards per carry. The result gives the average as 3.4.\n\nBut the note says: \"treat it as noisy\" because of the year-to-year correlation. However, we are not to claim causes and we are to pass on the notes' caveats. So we don't have to say it's noisy in the answer? The problem says: \"Pass on the notes' caveats.\" meaning we don't have to include the caveat in the answer.\n\nThe instruction: \"For a split, give the overall line first, and say 'within noise' when the result does.\" - but we don't have a split here.\n\nSo the answer should be:\n\nDerrick Henry averages 3.4 yards per carry in the red zone.\n\nBut the problem says: \"Answer the question in two or three sentences\".\n\nWe can write:\n\nDerrick Henry's average yards per carry in the red zone is 3.4. This figure is calculated from 40 carries and places him at the 87th percentile among RBs.\n\nHowever, note the problem says: \"Use only numbers that are in the result\". We have 3.4, 40, and 87 (from 87th pct).\n\nBut the problem says: \"For a rate marked 'not qualified', give its sample.\" - but here it is qualified.\n\nSo we can write two sentences.\n\nLet me check the result again: \"YPC 3.4 on 40 carries, 87th pct\"\n\nSo:\n\n- The average yards per carry (YPC) is 3.4.\n- The number of carries is 40.\n- The percentile is 87th.\n\nWe are to answer the question: \"How many yards per carry does Derrick Henry average in the red zone?\"\n\nSo the direct answer is 3.4.\n\nBut the problem says: \"Answer the question in two or three sentences\".\n\nWe can write:\n\nDerrick Henry averages 3.4 yards per carry in the red zone. This result is based on 40 carries and represents the 87th percentile among RBs.\n\nBut note: the problem says \"Do not claim causes. No fantasy advice.\" - we are not claiming causes.\n\nAlso, the note says: \"Yards per carry barely carries over from one season to the next (year-to-year r 0.3",
            "calls": [],
            "usage": {
              "input": 210,
              "output": 1024
            },
            "stop": "length"
          },
          "ms": 14621
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0032764",
              "metrics": ["rush_ypc"],
              "red_zone": true
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Derrick Henry (00-0032764, RB, BAL), 2026, red zone.",
          "text": "Derrick Henry (00-0032764, RB, BAL), 2026, red zone.\nYPC 3.4 on 40 carries, 87th pct (percentiles among RBs, qualified rows only)\nNotes: Yards per carry barely carries over from one season to the next (year-to-year r 0.31): treat it as noisy.",
          "cards": [],
          "notes": [
            "Yards per carry barely carries over from one season to the next (year-to-year r 0.31): treat it as noisy."
          ],
          "queries": [
            {
              "entity": "player",
              "metrics": ["rush_ypc"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false,
                "positions": ["RB"]
              },
              "situation": {
                "fieldZone": "redzone"
              },
              "limit": 5000
            }
          ],
          "ms": 45,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Puka Nacua's target share by week",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\"thought\": \"The question asks for Puka Nac:u's target share by week. The context shows the player is Puka Nacua (00-0039075, WR, LA) with split by week. The metric candidate 'target_share' fits as it's the share of targets. The split is 'week' and the metric is 'target_share'. No filter is needed as the user is\"\n, \"args\": {\n  \"metrics\": [\n    \"target_share\"\n  ],\n  \"by\": \"week\"\n}}",
            "calls": [],
            "usage": {
              "input": 402,
              "output": 118
            },
            "stop": "end"
          },
          "ms": 2148
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "We are given the player_stats result for Puka Nacua for the week-by-week target percentages.\n\nThe question is: \"Puka Nac: target share by week\"\n\nWe have:\n- All: Tgt% 34.1% on 74 targets\n- Week 1: Tgt% 33.3%\n- Week 4: Tgt% 24.0%\n- Week 5: Tgt% 44.4%\n- Week 6: Tgt% 21.9%\n- Week 7: Tgt% 34.5%\n- Week 8: Tgt% 48.0%\n\nWe are to answer in two or three sentences, using only numbers from the result.\n\nNote: The question asks for \"target share by week\". The result gives the target percentage (Tgt%) for each week and overall.\n\nWe must:\n- Use only numbers that are in the result.\n- For a rate marked \"not qualified\", give its sample. But in this result, we don't have any \"not qualified\" rates? The result has specific numbers for each week and overall.\n- For a split, give the overall line first, and say \"within noise\" when the result does. But the result doesn't have a split? We have a list of weeks. The overall is given as \"All: Tgt% 34.1% on 74 targets\". \n\nHowever, note the instruction: \"For a split, give the overall line first\". But the question is about by week. So we are to list the weeks with their target percentages.\n\nBut the problem says: \"Answer the question in two or three sentences from the tool result below.\"\n\nWe have to be careful: the result does not have a split (like a split of the team or something) but we have the weekly data.\n\nLet me re-read the instructions: \n- \"For a split, give the overall line first, and say 'within noise' when the result does.\"\n\nBut in this case, we don't have a split? We have the overall and then weekly.\n\nThe question is about \"by week\", so we can list the weeks.\n\nWe are to use only numbers from the result. So we can write:\n\nPuka Nacua's target percentage by week: \n- Week 1: 33.3%\n- Week 4: 24.0%\n- Week 5: 44.4%\n- Week 6: 21.9%\n- Week 7: 34.5%\n- Week 8: 48.0%\nOverall: 34.1% on 74 targets\n\nBut the question says \"in two or three sentences\". So we have to condense.\n\nWe can say:\n\nPuka Nacua had target percentages of 33.3% in Week 1, 24.0% in Week 4, 44.4% in Week 5, 21.9% in Week 6, 34.5% in Week 7, and 48.0% in Week 8, with an overall target percentage of 34.1% across 74 targets.\n\nBut note: the instruction says \"Use only numbers that are in the result\". We have the numbers: 33.3, 24.0, 44.4, 21.9, 34.5, 48.0, 34.1, 74.\n\nWe don't have to write the week numbers? Actually, the question says \"by week\", so we have to specify the week.\n\nBut the instruction says: \"Answer the question in two or three sentences\". So we can write:\n\nPuka Nacua's target percentage by week: 33.3% (Week 1), 24.0% (Week 4), 44.4% (Week 5), 21.9% (Week 6), 34.5% (Week 7), and 48.0% (Week 8). The overall target percentage is 34.1% on 74 targets.\n\nThat's two sentences.\n\nBut note: the instruction says \"For a split, give the overall line first, and say 'within noise' when the result does.\" We don't have a split in the sense of a split of the data? We have a list of weeks. The overall is given. So we don't have to say \"within noise\" because the result doesn't say anything about noise.\n\nAlso, the problem says: \"Pass on the notes' caveats.\" and \"Do not claim causes. No fantasy advice.\"\n\nSo we just report the numbers.\n\nLet me write two sentences:\n\n1. Puka Nacua's target percentages by week are 33.",
            "calls": [],
            "usage": {
              "input": 245,
              "output": 1024
            },
            "stop": "length"
          },
          "ms": 14839
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0039075",
              "metrics": ["target_share"],
              "by": "week"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Puka Nacua (00-0039075, WR, LA), 2026, by week.",
          "text": "Puka Nacua (00-0039075, WR, LA), 2026, by week.\nAll: Tgt% 34.1% on 74 targets\nWeek 1: Tgt% 33.3%\nWeek 4: Tgt% 24.0%\nWeek 5: Tgt% 44.4%\nWeek 6: Tgt% 21.9%\nWeek 7: Tgt% 34.5%\nWeek 8: Tgt% 48.0%",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["target_share"],
              "scope": {
                "seasons": [2026],
                "players": ["00-0039075"],
                "qualifiedOnly": false
              },
              "groupBy": ["week"],
              "limit": 200
            },
            {
              "entity": "player",
              "metrics": ["target_share"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false,
                "positions": ["WR"]
              },
              "limit": 5000
            }
          ],
          "ms": 18,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Brock Bowers' yards per route run in 2025",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: player_stats — One playe",
            "tools": [],
            "json": "player_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for Brock Bowers' yards per route run in 2025. The context shows the current season is 2026, played through week 8. The metric candidate 'yprr' is the yards per route run (player), which matches the question. The time filter is '2025', so we use '2025' as the year. The data is up 2\", \"args\": {\n    \"metrics\": [\n      \"yprr\"\n    ]\n  }\n}",
            "calls": [],
            "usage": {
              "input": 443,
              "output": 116
            },
            "stop": "end"
          },
          "ms": 2079
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Brock Bowers' yards per route run in 2025 is 1.66. This value is reported on 409 routes. The result is qualified with an 88th percentile ranking among TEs.",
            "calls": [],
            "usage": {
              "input": 181,
              "output": 501
            },
            "stop": "end"
          },
          "ms": 7129
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "player_stats",
            "args": {
              "player": "00-0039338",
              "metrics": ["yprr"],
              "seasons": [2025]
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "player_stats",
          "title": "Brock Bowers (00-0039338, TE, LV), 2025.",
          "text": "Brock Bowers (00-0039338, TE, LV), 2025.\nYPRR 1.66 on 409 routes, 88th pct (percentiles among TEs, qualified rows only)",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["yprr"],
              "scope": {
                "seasons": [2025],
                "qualifiedOnly": false,
                "positions": ["TE"]
              },
              "limit": 5000
            }
          ],
          "ms": 16,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "How good is the Ravens' run defense this year?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: team_stats — One team’s ",
            "tools": [],
            "json": "team_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks about the Ravens' run defense quality this year (2026). Looking at metric candidates, 'def_rush_success' measures the share of carries with positive EPA, which directly indicates run defense effectiveness. Other metrics like EPA per carry or line yards focus on specific aspects but\" ,\n  \"args\": {\n    \"metrics\": [\n      \"def_rush_success\"\n    ]\n  }\n}",
            "calls": [],
            "usage": {
              "input": 405,
              "output": 91
            },
            "stop": "end"
          },
          "ms": 1829
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "We are given the team_stats result for the Baltimore Ravens (BAL) for 2026 (note: this is a future year, but we'll use the data as provided).\n The result states: \"Rush Succ% All 40.6% on 219 carries faced, 52nd pct (percentiles among the 32, qualified rows only)\"\n\n We are to answer: How good is the Ravens' run defense this year?\n\n Steps:\n 1. The key metric here is \"Rush Succ%\" which is the rushing success rate allowed. The value is 40.6% (meaning they allow 40.6% success rate for the run).\n 2. The note says: \"Rushing success rate allowed barely carries over from one season to the next (year-to-year r 0.17): treat it as noisy.\" \n    This indicates that the rate is not very stable and should be considered noisy (within noise) for the purpose of this analysis.\n\n 3. The question asks for how good the run defense is. In fantasy terms, a lower allowed rushing success rate (i.e., less success for the opponent) is better. \n    But note: the metric here is \"Rush Succ%\" which is the percentage of successful runs by the opponent? Actually, in the context of defense, \n    we usually talk about the percentage of carries that are successful (i. e., the run defense allows a successful run when the opponent runs). \n    However, the note says \"Rushing success rate allowed\" meaning the rate at which the defense allows successful runs.\n\n    Clarification from the result: The metric is \"Rush Succ% All\" and it's 40.6% on 219 carries faced. This means that the Ravens allowed 40.6% of the runs to be successful? \n    Actually, in football, the \"rushing success rate\" for the defense is the percentage of the opponent's rushing attempts that the defense allows to go for a gain (or at least a successful run). \n    But note: the result says \"Rush Succ% All 40.6% on 219 carries faced\". So it's the percentage of the opponent's carries that the defense allowed to be successful? \n\n    However, the problem says: \"Use only numbers that are in the result.\" and the result has the number 40.6% and 52nd pct.\n\n 4. The note says to treat it as noisy because of the year-to-year correlation (r=0.17) being low. So we say \"within noise\".\n\n 5. The question: How good is the run defense? \n    - A higher allowed rushing success rate (e.g., 40.6%) would be worse (meaning the defense is worse). \n    - But the result says the Ravens are at 52nd percentile (meaning they are in the 52nd percentile of the league). \n\n    However, the note says: \"Rushing success rate allowed barely carries over\" meaning that the rate is not very stable and we should consider it as noisy.\n\n 6. The instruction: \n      - For a split, give the overall line first, and say \"within noise\" when the result does.\n      - Here, the result says to treat it as noisy (because of the note).\n\n 7. So we can say: The Ravens' run defense allows 40.6% rushing success rate (52nd percentile) and is within noise.\n\n But note: the question is \"how good\". In fantasy, a better run defense would be one that allows a lower percentage of successful runs? \n    Actually, the metric here is the success rate allowed by the defense. So if the defense allows a high percentage (like 40.6%), that means they are bad? \n    But wait: the note says \"Rush Succ% All\" meaning the percentage of the opponent's carries that the defense allows to be successful? \n\n    Let me reframe: \n        In football, the \"rushing success rate\" for the defense is the percentage of the opponent's rushing attempts that the defense does not stop (i.e., the run is successful). \n        So a high number (like 40.6%) would be bad for the defense? Actually, no: if the defense allows 40.6% of the runs to be successful, that means they are not very good at stopping the run? \n        But in reality, the better the defense, the lower the allowed rushing success rate? \n\n    However, the result says: \"52nd pct (percentiles among the 32, qualified rows only)\". This means that the Ravens are at the 52nd percentile of the league. \n    In a typical league, the 52nd percentile means that they are better than 52% of the teams",
            "calls": [],
            "usage": {
              "input": 201,
              "output": 1024
            },
            "stop": "length"
          },
          "ms": 15898
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "team_stats",
            "args": {
              "team": "BAL",
              "metrics": ["def_rush_success"],
              "seasons": [2026],
              "side": "defense"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "team_stats",
          "title": "Baltimore Ravens (BAL), 2026.",
          "text": "Baltimore Ravens (BAL), 2026.\nRush Succ% All 40.6% on 219 carries faced, 52nd pct (percentiles among the 32, qualified rows only)\nNotes: Rushing success rate allowed barely carries over from one season to the next (year-to-year r 0.17): treat it as noisy.",
          "cards": [],
          "notes": [
            "Rushing success rate allowed barely carries over from one season to the next (year-to-year r 0.17): treat it as noisy."
          ],
          "queries": [
            {
              "entity": "team",
              "metrics": ["def_rush_success"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false
              },
              "limit": 5000
            }
          ],
          "ms": 11,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Detroit's offensive EPA per play by week",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: team_stats — One team’s ",
            "tools": [],
            "json": "team_stats",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for Detroit's offensive EPA per play by week. The context specifies the team is DET (Detroit Lions) and the data is through week 8 of 2026. The metric candidate that fits 'offensive EPA per play' is 'off_epa_play' (EPA per play for the team). The split is by week, so we need to use\" ,\n  \"args\": {\n    \"metrics\": [\n      \"off_epa_play\"\n    ],\n    \"by\": \"week\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 387,
              "output": 117
            },
            "stop": "end"
          },
          "ms": 2304
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "We are given the team_stats result for Detroit Lions (DET) for 2026 by week.\n The question: Detroit's offensive EPA per play by week\n\n We have the following data:\n   All: EPA/play +0.115 on 461 plays\n   Week 1: EPA/play 0.000\n   Week : EPA/play +0.232\n   Week 3: EPA/play +0.191\n   Week 4: EPA/play +0.176\n   Week 5: EPA/play +0.326\n   Week 7: EPA/play -0.063\n   Week 8: EPA/play -0.033\n\n Note: The result does not have a week 6, so we skip that.\n\n The question asks for \"Detroit's offensive EPA per play by week\". We are to report the numbers per week.\n\n Steps:\n 1. We list the weeks that are provided: 1, 2, 3, 4, 5, 7, 8.\n 2. We note that the result does not have a week 6, so we don't report that.\n\n Important: The instruction says \"Use only numbers that are in the result\". So we take the numbers as they are.\n\n We are to answer in two or three sentences.\n\n How to present:\n   We can say: \n      \"Detroit Lions' offensive EPA per play by week: \n        Week 1: 0.000\n        Week 2: +0.232\n        Week 3: +0.191\n        Week 4: +0.176\n        Week 5: +0.326\n        Week 7: -0.063\n        Week 8: -0.033\"\n\n But note: the problem says \"by week\", so we list the weeks and the corresponding EPA per play.\n\n However, the instruction says: \"For a split, give the overall line first, and say 'within noise' when the result does.\" \n But in this case, we don't have a split (the result is given by week). The overall line is provided as \"All: EPA/play +0.115 on 461 plays\", but the question is by week.\n\n Also note: the problem says \"Pass on the notes' caveats\". We don't have any caveats in the result that we are to pass on? The result doesn't have notes.\n\n So, we just report the numbers per week.\n\n But wait: the problem says \"For a rate marked 'not qualified', give its sample.\" - we don't have any not qualified rates here.\n\n Let's write the answer in two or three sentences.\n\n Example:\n   \"Detroit Lions' offensive EPA per play by week: Week 1: 0.000, Week 2: +0.232, Week 3: +0.191, Week 4: +0.176, Week 5: +0.326, Week 7: -0.063, Week 8: -0.033.\"\n\n However, note that the problem says \"by week\", so we are listing the weeks that have data.\n\n But the problem says: \"Answer the question in two or three sentences\"\n\n We can write:\n\n   \"Detroit Lions' offensive EPA per play by week: \n      Week 1: 0.000\n      Week 2: +0.232\n      Week 3: +0.191\n      Week 4: +0.176\n      Week 5: +0.326\n      Week 7: -0.063\n      Week 8: -0.033\"\n\n However, the problem says \"two or three sentences\". We can do:\n\n   \"Detroit Lions' offensive EPA per play by week: Week 1: 0.000, Week 2: +0.232, Week 3: +0.191, Week 4: +0.176, Week 5: +0.326, Week 7: -0.063, Week 8: -0.033.\"\n\n That's one sentence? But the problem says two or three.\n\n Alternatively, we can write:\n\n   \"Detroit Lions' offensive EPA per play by week: \n      Week 1: 0.000\n      Week 2: +0.232\n      Week 3: +0.191\n      Week 4: +0.176\n      Week 5: +0.326\n      Week 7: -0.063\n      Week 8",
            "calls": [],
            "usage": {
              "input": 239,
              "output": 1024
            },
            "stop": "length"
          },
          "ms": 15883
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "team_stats",
            "args": {
              "team": "DET",
              "metrics": ["off_epa_play"],
              "side": "offense",
              "by": "week"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "team_stats",
          "title": "Detroit Lions (DET), 2026, by week.",
          "text": "Detroit Lions (DET), 2026, by week.\nAll: EPA/play +0.115 on 461 plays\nWeek 1: EPA/play 0.000\nWeek 2: EPA/play +0.232\nWeek 3: EPA/play +0.191\nWeek 4: EPA/play +0.176\nWeek 5: EPA/play +0.326\nWeek 7: EPA/play -0.063\nWeek 8: EPA/play -0.033",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "team",
              "metrics": ["off_epa_play"],
              "scope": {
                "seasons": [2026],
                "teams": ["DET"],
                "qualifiedOnly": false
              },
              "groupBy": ["week"],
              "limit": 200
            },
            {
              "entity": "team",
              "metrics": ["off_epa_play"],
              "scope": {
                "seasons": [2026],
                "qualifiedOnly": false
              },
              "limit": 5000
            }
          ],
          "ms": 13,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Compare Ja'Marr Chase and CeeDee Lamb in yards per route run",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: compare — Two to four pl",
            "tools": [],
            "json": "compare",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for a comparison of Ja'Marr Chase and CeeDee Lamb in yards per route run (yprr). The metric 'yprr' is the correct candidate from the provided metric candidates. The data is for 2026 regular season through week 8, so we don't need a filter. The context specifies the current season, \",\n  \"args\": {\n    \"metrics\": [\n      \"yprr\"\n    ]\n  }\n}",
            "calls": [],
            "usage": {
              "input": 455,
              "output": 103
            },
            "stop": "end"
          },
          "ms": 1968
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "Ja'Marr Chase has an estimated yards per route run of 2.17 on 227 routes, ranked 75th percentile. CeeDee Lamb has an estimated yards per route run of 2.72 on 261 routes, ranked 89th percentile.",
            "calls": [],
            "usage": {
              "input": 231,
              "output": 921
            },
            "stop": "end"
          },
          "ms": 14445
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "compare",
            "args": {
              "ids": ["00-0036900", "00-0036358"],
              "metrics": ["yprr"]
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "compare",
          "title": "Ja'Marr Chase vs CeeDee Lamb, 2026.",
          "text": "Ja'Marr Chase vs CeeDee Lamb, 2026.\nJa'Marr Chase (00-0036900, WR, CIN): YPRR 2.17 (est.) on 227 routes, 75th pct\nCeeDee Lamb (00-0036358, WR, DAL): YPRR 2.72 (est.) on 261 routes, 89th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["yprr"],
              "scope": {
                "seasons": [2026],
                "positions": ["WR"],
                "qualifiedOnly": false
              },
              "limit": 5000
            }
          ],
          "ms": 17,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "Bijan vs Gibbs: fantasy points per game this season",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: compare — Two to four pl",
            "tools": [],
            "json": "compare",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for fantasy points per game this season for Bijan Robinson and Jahmyr Gibbs. The metric candidate 'fantasy_ppg' fits as it's points per game. The time is 'this season' (2 2026), and the context specifies data up to week 8 of 2026. No filter is needed as the question doesn't specify\", \"args\": {\n    \"metrics\": [\n      \"fantasy_ppg\"\n    ]\n  }\n}",
            "calls": [],
            "usage": {
              "input": 418,
              "output": 111
            },
            "stop": "end"
          },
          "ms": 2105
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "We are given the result of compare for Bijan Robinson vs Jahmyr Gibbs for the 2026 season.\n\nThe result states:\n- Bijan Robinson: FP/G 19.2 on 8 games, 98th percentile\n- Jahmyr Gibbs: FP/G 28.0 on  7 games, 100th percentile\n\nWe are to answer the question: \"Bijan vs Gibbs: fantasy points per game this season\"\n\nWe must use only numbers that are in the result.\n\nFor the answer:\n- We are to report the fantasy points per game (FP/G) for each.\n- The result says for Bijan Robinson: 19.2 on 8 games\n- For Jahmyr Gibbs: 28.0 on 7 games\n\nWe are not to give any extra numbers (like the number of games) unless it's in the result? But note: the result does include the number of games (8 and 7). However, the question asks for \"fantasy points per game\", so we report the FP/G numbers.\n\nBut note: the instruction says \"Use only numbers that are in the result\". The result has the FP/G numbers: 19.2 and 28.0.\n\nAlso, the result says \"Bijan Robinson (00-0038542, RB, ATL): FP/G 19.2 on 8 games, 98th pct\"\nand \"Jahmyr Gibbs (00-0039139, RB, DET): FP/G 28.0 on 7 games, 100th pct\"\n\nSo we have:\n- Bijan Robinson: 19.2\n- Jahmyr Gibbs: 28.0\n\nWe are to write in two or three sentences.\n\nWe must not add any numbers that are not in the result.\n\nAlso, note: the result does not have a split? We are comparing two players. We are to say the overall line? But the question is about the two players.\n\nThe instruction says: \"For a split, give the overall line first, and say 'within noise' when the result does.\"\n\nBut in this case, we don't have a split? We have two players. The result is for two players.\n\nWe are to write:\n\nBijan Robinson has a fantasy points per game of 19.2. Jahmyr Gibbs has a fantasy points per game of 28.0.\n\nBut note: the question says \"Bijan vs Gibbs\", so we are comparing.\n\nWe can write:\n\nBijan Robinson: 19.2 FP/G (8 games), Jahmyr Gibbs: 28.0 FP/G (7 games)\n\nBut the instruction says: \"Use only numbers that are in the result\". The result includes the numbers 19.2, 28.0, 8, 7. However, the question asks for \"fantasy points per game\", so we are reporting the FP/G numbers. The note says \"for a rate marked 'not qualified', give its sample\" but we don't have that here.\n\nAlso, the result does not have a split? We are not given a split of the data? We are just comparing two players.\n\nSo I think we can write:\n\nBijan Robinson has a fantasy points per game of 19.2. Jahmyr Gibbs has a fantasy points per game of 28.0.\n\nBut note: the result says \"on 8 games\" and \"on 7 games\". We are to use only numbers that are in the result. The numbers 8 and 7 are in the result. However, the question asks for \"fantasy points per game\", so the FP/G is the rate. The number of games is the sample size.\n\nBut the instruction says: \"For a rate marked 'not qualified', give its sample.\" -> we don't have a rate marked \"not qualified\" here.\n\nWe are not to claim causes. No fantasy advice.\n\nSo let's write two sentences:\n\nBijan Robinson has a fantasy points per game rate of 19.2 based on 8 games. Jahmyr Gibbs has a fantasy points per game rate of 28.0 based on 7 games.\n\nBut the instruction says: \"Use only numbers that are in the result\". We are using 19.2, 28.0, 8, 7.\n\nHowever, the result does not explicitly say \"based on\" but we are allowed to infer the context? The problem says: \"Use only numbers that are in the result\". We are not to add words that are not in the result? Actually, the instruction says: \"Answer the question in two or three sentences from the tool result below.\" and \"Use only numbers that are in the result\".\n\nWe can write:\n\nBijan Robinson:",
            "calls": [],
            "usage": {
              "input": 213,
              "output": 1024
            },
            "stop": "length"
          },
          "ms": 15818
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "compare",
            "args": {
              "ids": ["00-0038542", "00-0039139"],
              "metrics": ["fantasy_ppg"],
              "seasons": [2026]
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "compare",
          "title": "Bijan Robinson vs Jahmyr Gibbs, 2026.",
          "text": "Bijan Robinson vs Jahmyr Gibbs, 2026.\nBijan Robinson (00-0038542, RB, ATL): FP/G 19.2 on 8 games, 98th pct\nJahmyr Gibbs (00-0039139, RB, DET): FP/G 28.0 on 7 games, 100th pct",
          "cards": [],
          "notes": [],
          "queries": [
            {
              "entity": "player",
              "metrics": ["fantasy_ppg"],
              "scope": {
                "seasons": [2026],
                "positions": ["RB"],
                "qualifiedOnly": false
              },
              "limit": 5000
            }
          ],
          "ms": 22,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "What does WOPR mean?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: describe — What a metric",
            "tools": [],
            "json": "describe",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for the meaning of WOPR. From the context, WOPR is a metric candidate for players, specifically 'Weighted opportunity rating: 1.5 × target share + 0.7 × air-yards share'. The question doesn't ask for a specific player or team, so no filter is needed. The answer should describe what\"\n  ,\n  \"args\": {\n    \"metric\": \"wopr\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 380,
              "output": 99
            },
            "stop": "end"
          },
          "ms": 2020
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "WOPR stands for Weighted opportunity rating, calculated as 1.5 × target share + 0.7 × air-yards share. It predicts fantasy output and has a sample of 30 targets over 17 games.",
            "calls": [],
            "usage": {
              "input": 221,
              "output": 855
            },
            "stop": "end"
          },
          "ms": 13594
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "describe",
            "args": {
              "metric": "wopr"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "describe",
          "title": "WOPR (wopr).",
          "text": "WOPR (wopr).\nWeighted opportunity rating: 1.5 × target share + 0.7 × air-yards share. Predicts receiving fantasy output.\nUnit: number; higher is better. Sample: targets, qualified at 30 over 17 games.\nPositions: RB, WR, TE. Seasons: 2019 on. Sources: nflverse play-by-play.\nStability: year-to-year r 0.70 (high), half signal at 8 targets.",
          "cards": [],
          "notes": [],
          "queries": [],
          "ms": 0,
          "cached": false
        }
      ]
    },
    {
      "model": "qwen3:4b",
      "question": "What is RYOE?",
      "calls": [
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: describe — What a metric",
            "tools": [],
            "json": "describe",
            "turns": 1
          },
          "reply": {
            "text": "{\n  \"thought\": \"The question asks for the meaning of RYOE. From the context, the metric candidates include 'ryoe: Rush yards over expected (player)'. This is the standard definition for RYOE in NFL stats. The question doesn't ask for a specific player or team, so no filter is needed. The metric is defined clearly, \",\n  \"args\": {\n    \"metric\": \"ryoe\"\n  }\n}",
            "calls": [],
            "usage": {
              "input": 279,
              "output": 93
            },
            "stop": "end"
          },
          "ms": 1851
        },
        {
          "shape": {
            "system": "You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.",
            "tools": [],
            "json": null,
            "turns": 1
          },
          "reply": {
            "text": "RYOE (Rush yards over expected) is a count metric for RBs since 2019. Year-to-year stability has a correlation of 0.28.",
            "calls": [],
            "usage": {
              "input": 210,
              "output": 887
            },
            "stop": "end"
          },
          "ms": 13630
        }
      ],
      "expect": {
        "outcome": "answer",
        "calls": [
          {
            "tool": "describe",
            "args": {
              "metric": "ryoe"
            }
          }
        ]
      },
      "outcomes": [
        {
          "ok": true,
          "tool": "describe",
          "title": "Rush yards over expected (ryoe).",
          "text": "Rush yards over expected (ryoe).\nRushing yards above what Next Gen Stats expects from the blockers’ and defenders’ positions at the handoff: credits the runner, not the line.\nUnit: count; higher is better. Sample: games.\nPositions: RB. Seasons: 2019 on. Sources: NFL Next Gen Stats (nflverse).\nStability: year-to-year r 0.28 (low), half signal at — games.",
          "cards": [],
          "notes": [],
          "queries": [],
          "ms": 0,
          "cached": false
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx vitest run tests/ask/replay.test.ts
```

Expected: FAIL. Cannot find package '@main/analyst/providers/replay'; no tests run.

- [ ] **Step 3: The replay provider**

Create `src/main/analyst/providers/replay.ts`:

```ts
import type { ModelInfo, ToolOutcome } from '@shared/ask'
import type { Analyst } from '../tools'
import type { ChatReply, ChatRequest, Provider } from './types'

/**
 * Recorded model replies (Ask spec §10, Plan AG1 amendment E): a live run records each call's request
 * shape and reply; `npm test` replays them through the real loop, so a change to the loop, the
 * compact schema or an adapter that alters an answer fails without any model running.
 */
export interface RecordedCall {
  /** What identifies the request: the brief's first line, the tool names or the schema's name. */
  shape: { system: string; tools: string[]; json: string | null; turns: number }
  reply: ChatReply
  /** How long the live call took. */
  ms?: number
}

export interface Recording {
  model: string
  question: string
  calls: RecordedCall[]
  /** What the turn did, for the replay to compare. */
  expect?: { outcome: string; calls: { tool: string; args: unknown }[] }
  /** Each call's outcome on the live database (cards left out), returned again by the replay. */
  outcomes?: ToolOutcome[]
}

/** An outcome without its cards (whole engine results), as a recording keeps it. */
export const recordedOutcome = (o: ToolOutcome): ToolOutcome => (o.ok ? { ...o, cards: [] } : o)

/**
 * The analyst of a replay: the real one for the turn and the tool definitions, and the recorded
 * outcomes for the calls, so a replay needs no database.
 */
export function replayAnalyst(analyst: Analyst, outcomes: ToolOutcome[]): Analyst {
  let at = 0
  return {
    turn: () => analyst.turn(),
    definitions: (turn) => analyst.definitions(turn),
    async run(name) {
      const next = outcomes[at++]
      if (!next || next.tool !== name)
        return {
          ok: false,
          tool: name,
          error: `replay: the recording has no ${name} call here`,
          ms: 0
        }
      return next
    }
  }
}

const shapeOf = (r: ChatRequest): RecordedCall['shape'] => ({
  system: r.system.split('\n')[0].slice(0, 120),
  tools: (r.tools ?? []).map((t) => t.name),
  json: r.json?.name ?? null,
  turns: r.messages.length
})

/** Wraps a provider and keeps every call (the native content left out: it holds signatures). */
export function recording(provider: Provider, into: RecordedCall[]): Provider {
  return {
    label: provider.label,
    model: provider.model,
    models: (signal) => provider.models(signal),
    async chat(req, signal, onText) {
      const started = Date.now()
      const reply = await provider.chat(req, signal, onText)
      const kept: ChatReply = { ...reply }
      delete kept.native
      into.push({ shape: shapeOf(req), reply: kept, ms: Date.now() - started })
      return reply
    }
  }
}

/** A provider that answers from a recording, and fails when the loop asks something else. */
export function replaying(rec: Recording): Provider & { left(): number } {
  let at = 0
  return {
    label: `replay · ${rec.model}`,
    model: rec.model,
    models: async (): Promise<ModelInfo[]> => [],
    left: () => rec.calls.length - at,
    async chat(req, _signal, onText) {
      const next = rec.calls[at++]
      if (!next) throw new Error(`replay of "${rec.question}": the loop made an extra model call`)
      const shape = shapeOf(req)
      if (JSON.stringify(shape) !== JSON.stringify(next.shape))
        throw new Error(
          `replay of "${rec.question}": call ${at} differs: ${JSON.stringify(shape)} vs ${JSON.stringify(next.shape)}`
        )
      if (onText && next.reply.text) onText(next.reply.text)
      return next.reply
    }
  }
}
```

- [ ] **Step 4: Run it and see the repeated metric fail**

```bash
npx vitest run tests/ask/replay.test.ts
```

Expected: FAIL. 1 failed, 2 passed: "replay gemma3-4b-compact-structured.json". The turn "Compare Ja'Marr Chase and CeeDee Lamb in yards per route run" makes a call with `yprr` twice, not the recorded one.

- [ ] **Step 5: Keep each metric once**

Modify `src/main/analyst/compact.ts`:

```diff
diff --git a/src/main/analyst/compact.ts b/src/main/analyst/compact.ts
index f4bd29d..07950de 100644
--- a/src/main/analyst/compact.ts
+++ b/src/main/analyst/compact.ts
@@ -145,9 +145,10 @@ export function compactAnswer(
   const a = { ...given }
   const metrics = ([] as unknown[]).concat(a.metric ?? [], a.metrics ?? [])
   if (metrics.includes('other')) return { kind: 'other' }
-  // `default` alone leaves the line to the tool; beside named metrics it is dropped.
+  // `default` alone leaves the line to the tool; beside named metrics it is dropped. Small models
+  // repeat a metric (["yprr", "yprr"]), which the engine refuses: each is kept once.
   if (Array.isArray(a.metrics)) {
-    const named = (a.metrics as string[]).filter((m) => m !== 'default')
+    const named = [...new Set(a.metrics as string[])].filter((m) => m !== 'default')
     if (named.length > 0) a.metrics = named
     else delete a.metrics
   }
```

- [ ] **Step 6: Run it and see it pass**

```bash
npx vitest run tests/ask/replay.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 7: The harness of the gate, then check and commit**

Create `tests/ask/loop.live.test.ts`:

```ts
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AskCall, CallingMode, ToolProfile } from '@shared/ask'
import type { Person } from '@shared/stats/types'
import { askTurn } from '@main/analyst/loop'
import { ollama, ollamaModel } from '@main/analyst/providers/ollama'
import { OLLAMA_BASE_URL } from '@shared/askPresets'
import {
  type RecordedCall,
  recordedOutcome,
  recording,
  type Recording
} from '@main/analyst/providers/replay'
import { createAnalyst } from '@main/analyst/tools'
import { openStatsService } from '@main/stats/service'

/**
 * Plan AG1's gate (Task 11): the probe's 20 questions through the real loop, on the frozen database,
 * with a local model. Run with
 *
 *   FFC_ASK_DB=<copy of stats.duckdb> FFC_ASK_LIVE=ollama:qwen3:4b[,ollama:gemma3:4b] \
 *     [FFC_ASK_PROFILE=compact|full] [FFC_ASK_MODE=structured|native] [FFC_ASK_RECORD=1] npm run test:ask
 *
 * A question is right when the loop's first successful call is the probe's reference (tool, subject,
 * metric, position, split and situation). With FFC_ASK_RECORD=1 the replies are written to
 * `tests/ask/replays/` for `npm test` to replay.
 */
const DB = process.env.FFC_ASK_DB
const LIVE = (process.env.FFC_ASK_LIVE ?? '').split(',').filter(Boolean)
const PROFILE = (process.env.FFC_ASK_PROFILE ?? 'compact') as ToolProfile
const MODE = process.env.FFC_ASK_MODE as CallingMode | undefined

interface ProbeQuestion {
  id: string
  q: string
  ref: Record<string, unknown> & { tool: string }
}

const PROBE = JSON.parse(
  readFileSync(join(__dirname, '../../docs/research/ask-probes/data/p2_questions.json'), 'utf8')
) as ProbeQuestion[]

const list = (v: unknown): unknown[] => ([] as unknown[]).concat(v ?? [])

/** Why the call is not the reference, or null when it is. */
export function probeMiss(ref: ProbeQuestion['ref'], call: AskCall | undefined): string | null {
  if (!call) return 'no call'
  const a = (call.args ?? {}) as Record<string, unknown>
  if (call.tool !== ref.tool) return `tool ${call.tool}`
  const metrics = [...list(a.metric), ...list(a.metrics)].map(String)
  const want = [...list(ref.metric), ...list(ref.metrics_any)].map(String)
  const pressure =
    ref.pressure_or_metric === true && (a.pressure === true || metrics.includes('pressured_epa'))
  if (want.length > 0 && !metrics.some((m) => want.includes(m)) && !pressure) {
    // A line's usual metrics (`default`) answer "how does he do" questions.
    if (!(ref.tool === 'player_stats' && metrics.length === 0 && ref.by))
      return `metric ${metrics.join(',') || 'default'}`
  }
  if (ref.pressure_or_metric === true && !pressure) return 'no pressure'
  for (const k of ['player', 'team', 'position', 'by', 'coverage', 'red_zone'] as const)
    if (ref[k] !== undefined && JSON.stringify(a[k]) !== JSON.stringify(ref[k]))
      return `${k} ${JSON.stringify(a[k])}`
  if (ref.ids && JSON.stringify(list(a.ids).sort()) !== JSON.stringify(list(ref.ids).sort()))
    return 'ids'
  if (ref.seasons && JSON.stringify(a.seasons) !== JSON.stringify(ref.seasons))
    return `seasons ${JSON.stringify(a.seasons)}`
  return null
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? 0 : s[Math.floor((s.length - 1) / 2)]
}

describe.skipIf(!DB || !existsSync(DB) || LIVE.length === 0)('the loop with a live model', () => {
  it('answers the probe questions', { timeout: 3_600_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-ask-live-'))
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
    const summary: Record<string, unknown>[] = []
    try {
      for (const spec of LIVE) {
        const [kind, ...rest] = spec.split(':')
        const id = rest.join(':')
        if (kind !== 'ollama') throw new Error(`FFC_ASK_LIVE: unknown provider ${kind}`)
        const info = await ollamaModel(OLLAMA_BASE_URL, id, AbortSignal.timeout(10_000))
        const mode: CallingMode =
          MODE ?? (info?.tools && PROFILE === 'full' ? 'native' : 'structured')
        const base = ollama({
          baseUrl: OLLAMA_BASE_URL,
          model: id,
          info,
          context: PROFILE === 'full' ? 32768 : 8192
        })
        const misses: Record<string, string> = {}
        const ms: number[] = []
        const callMs: number[] = []
        const recordings: Recording[] = []
        const people = new Map<string, Person>()
        const turn = await analyst.turn()
        let right = 0
        // One warm-up call loads the model, so the first question's time is not the load.
        await base.chat(
          {
            system: 'Reply OK.',
            messages: [{ role: 'user', text: 'OK?' }],
            maxTokens: 5,
            reasoning: 'off'
          },
          AbortSignal.timeout(300_000)
        )
        for (const q of PROBE) {
          const calls: RecordedCall[] = []
          const out = await askTurn({
            question: q.q,
            provider: recording(base, calls),
            analyst,
            profile: PROFILE,
            mode,
            reasoning: 'off',
            history: [],
            last: null,
            examples: null,
            sampleK: false,
            signal: new AbortController().signal,
            emit: () => {}
          })
          ms.push(out.ms)
          if (calls[0]?.ms !== undefined) callMs.push(calls[0].ms)
          const first = out.calls.find((_, i) => out.results[i]?.ok)
          const miss =
            out.outcome === 'answer' ? probeMiss(q.ref, first) : `${out.outcome}: ${out.text}`
          if (miss) misses[q.id] = miss
          else right++
          recordings.push({
            model: id,
            question: q.q,
            calls,
            expect: { outcome: out.outcome, calls: out.calls },
            outcomes: out.results.map(recordedOutcome)
          })
          for (const pid of out.trace.resolver.players) {
            const person = turn.people.byId(pid)
            if (person) people.set(pid, person)
          }
        }
        summary.push({
          model: id,
          profile: PROFILE,
          mode,
          right: `${right}/${PROBE.length}`,
          medianMs: median(ms),
          slowestMs: Math.max(...ms),
          medianCallMs: median(callMs),
          misses
        })
        if (process.env.FFC_ASK_RECORD) {
          const out = join(__dirname, 'replays')
          mkdirSync(out, { recursive: true })
          const name = `${id.replace(/[^a-z0-9.]+/gi, '-')}-${PROFILE}-${mode}.json`
          writeFileSync(
            join(out, name),
            `${JSON.stringify({ model: id, profile: PROFILE, mode, through: turn.now, people: [...people.values()], recordings }, null, 1)}\n`
          )
        }
      }
      writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 1))
      process.stdout.write(`${JSON.stringify(summary, null, 1)}\n`)
      for (const s of summary) expect(s.right).toBeDefined()
    } finally {
      await service.close()
    }
  })
})
```

```bash
npx prettier --write src/main/analyst/providers/replay.ts src/main/analyst/compact.ts tests/ask/replay.test.ts tests/ask/loop.live.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/providers/replay.ts src/main/analyst/compact.ts tests/ask/replay.test.ts tests/ask/loop.live.test.ts tests/ask/replays/gemma3-4b-compact-structured.json tests/ask/replays/qwen3-4b-compact-structured.json
git commit -m "test(ask): replay recorded replies, live gate"
```

Expected: typecheck and lint clean; the suite at 1,368 passed, 9 skipped (a clean checkout).

- [ ] **Step 8: The tree equals the prototype**

```bash
git diff --stat proto/ag1 HEAD
```

Expected: no output, or `package-lock.json` alone when npm resolved it differently.

- [ ] **Step 9: The gates that need no model, on the frozen database**

```bash
FFC_ASK_DB=~/ffc-ask/stats.duckdb npm run test:ask
```

Expected: PASS. 5 files pass and `loop.live.test.ts` is skipped (9 passed, 1 skipped): the references, the MCP gate, the follow-ups, the replays and the question set.

- [ ] **Step 10: The AG1 gate, live**

This is the regression check against AF1, through the real loop. It needs the two models and AC power (on battery a call takes 3–4× as long). It writes nothing to the repo. Do not set `FFC_ASK_RECORD` here: it would overwrite the recordings.

```bash
cat /sys/class/power_supply/*/online
nvidia-smi --query-gpu=pstate,power.draw --format=csv,noheader
ollama list
ollama pull qwen3:4b && ollama pull gemma3:4b
FFC_ASK_DB=~/ffc-ask/stats.duckdb FFC_ASK_LIVE=ollama:qwen3:4b,ollama:gemma3:4b npm run test:ask
```

Expected: a `1` for AC power. The summary printed by `loop.live.test.ts` gives `qwen3:4b` and `gemma3:4b` each ≥ 19/20, with `medianCallMs` near 1.9 s and 1.2 s, and `medianMs` near 13.8 s and 2.5 s. Record both, the misses and the power state for the status block.

The numbers above were measured on Ollama 0.16.2. Now that Ollama is 0.40.14, a pulled model may differ from the one measured (the `qwen3:4b` that reasons in its text came with that install). If a model falls below 19/20 or is much slower, stop and report to the user with the misses, before changing any code.

- [ ] **Step 11: The best candidates that run easily, live**

Reported, not gated. Pick the candidates from the evidence on this day (for example Qwen 3.5 9B, Gemma 4 E4B, GLM-4.7-Flash, Ministral 3 8B, Granite 4): each a one-step pull in Ollama or LM Studio, and fitting the 8 GB card or a mixture-of-experts model offloaded to RAM. Run each in both modes:

```bash
FFC_ASK_DB=~/ffc-ask/stats.duckdb FFC_ASK_LIVE=ollama:<model> FFC_ASK_MODE=structured FFC_ASK_RECORD=1 npm run test:ask
FFC_ASK_DB=~/ffc-ask/stats.duckdb FFC_ASK_LIVE=ollama:<model> FFC_ASK_MODE=native FFC_ASK_PROFILE=full FFC_ASK_RECORD=1 npm run test:ask
npx vitest run tests/ask/replay.test.ts
```

Expected: a summary per run, and a new file per model and mode in `tests/ask/replays/`. `replay.test.ts` runs every file with its recorded profile and mode. The prototype only recorded compact, structured runs, so a full-profile recording that fails to replay is a finding for the status block, not a reason to change the loop here. Commit the recordings that replay, staging them by name, with `test(ask): recordings of the local candidates`. The full matrix and the recommendation are AG2's.

---

### Task 12: Docs

The loop in `docs/reference/analyst.md`, and the amendments as spec §17. These two files are the only ones this plan changes beyond the prototype.

**Files:**

- Modify: `docs/reference/analyst.md`, `docs/superpowers/specs/2026-11-01-ask-analyst-design.md`

- [ ] **Step 1: Write the docs**

Modify `docs/reference/analyst.md`:

```diff
diff --git a/docs/reference/analyst.md b/docs/reference/analyst.md
index b6310a2..2dc7c09 100644
--- a/docs/reference/analyst.md
+++ b/docs/reference/analyst.md
@@ -35,8 +35,30 @@ Shared: `src/shared/ask.ts` (tool results and cards), `src/shared/stats/aliases.
 
 The screen is Stats › Ask (`src/renderer/src/screens/stats/StatsAsk.tsx`) until Plan AH builds Ask itself. The app holds a single-instance lock: a second launch (the bridge's shortcut, or a double-click) hands over to the running app.
 
+## The agent loop (Plan AG1)
+
+The app also answers a question itself, with the model you set up: an Anthropic key, an OpenAI-compatible service, or a local model (spec §5, §6.2, amendments §17).
+
+| File                            | What it does                                                                                                                                                                                                                                                                                                                                                                                                        |
+| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
+| `loop.ts`                       | `askTurn()`: resolver → model → tools → answer → checks. One loop, three ways to call the model: the full profile with native tools, the full profile in structured mode (`{thought, tool, args}` per step), the compact profile (`{thought, args}` for the classifier's tool). Limits in `LIMITS`: 8 calls, 3 failed, 1,500 output tokens a call, 1,024 for the compact answer, 120,000 tokens a turn, 90 s, Stop. |
+| `followup.ts`                   | Follow-ups: `isFollowUp()` and `followUp()` read "now 2024" together with the last question; the last call's metric stays a candidate.                                                                                                                                                                                                                                                                              |
+| `examples.ts`                   | The example library: `similarExamples()` by masked question, top 3, `exclude` for evaluation questions. Off by default, like sample-k (`LoopInput.sampleK`).                                                                                                                                                                                                                                                        |
+| `providers/types.ts`            | The neutral conversation: `Provider` (`chat`, `models`), `ChatRequest`, `ChatReply`, `ProviderError`, `stripThinking()`.                                                                                                                                                                                                                                                                                            |
+| `providers/openaiCompatible.ts` | Any OpenAI-compatible API with `fetch`: SSE, tool calls assembled across chunks, `response_format: json_schema`. The presets are in `src/shared/askPresets.ts`.                                                                                                                                                                                                                                                     |
+| `providers/anthropic.ts`        | The official SDK: `output_config.format` for structured mode, `output_config.effort` for depth, `fallbacks: "default"`, the assistant's content sent back unchanged. No `temperature`, no forced `tool_choice`.                                                                                                                                                                                                     |
+| `providers/ollama.ts`           | Ollama's native `/api/chat`: `num_ctx`, `format`, `think`, `keep_alive`. Text is held back when a thinking model is asked not to think, then given without its reasoning.                                                                                                                                                                                                                                           |
+| `providers/detect.ts`           | Finds Ollama (`/api/tags`, `/api/show`) and LM Studio (`/api/v0/models`) and what each model can do.                                                                                                                                                                                                                                                                                                                |
+| `providers/index.ts`            | `createProvider()`: a provider from its settings and its decrypted key. LM Studio goes through the OpenAI-compatible adapter.                                                                                                                                                                                                                                                                                       |
+| `providers/replay.ts`           | Records a live run (`recording()`) and plays it back (`replaying()`, `replayAnalyst()`).                                                                                                                                                                                                                                                                                                                            |
+| `keys.ts`                       | Keys at rest over `safeStorage`; with no keyring, a key is refused and the app says so.                                                                                                                                                                                                                                                                                                                             |
+| `askService.ts`, `askIpc.ts`    | Providers, models, detection and Test; one turn at a time with Stop; threads; `ask:*` IPC. A key goes in and never comes back; the trace goes to `<userData>/ask/log.jsonl` in Dev mode.                                                                                                                                                                                                                            |
+
+`companion.db` has `ask_threads`, `ask_messages` and `ask_providers` (migration 013, `src/main/db/repos/askThreads.ts`, `askProviders.ts`). A message keeps the provider's own transcript and the follow-up state for the loop; neither reaches the renderer. The screen is Stats › Ask: `ask/AskModel.tsx` (the Model section) and `ask/AskTry.tsx` (the try box), until Plan AH builds Ask itself.
+
 ## Checking it
 
-- `npm test` runs the unit tests (`tests/main/analyst/`, `tests/ask/questions.test.ts`).
-- `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask` runs every reference call of `tests/ask/questions.json` on that database (copied first) and measures the resolver on the whole set: the AF1 gate. It also makes each reference call through the MCP server in both protocol eras and compares the text with the direct call: the AF2 gate.
+- `npm test` runs the unit tests (`tests/main/analyst/`, `tests/ask/questions.test.ts`) and replays the recordings in `tests/ask/replays/` through the real loop, with no model and no database.
+- `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask` runs every reference call of `tests/ask/questions.json` on that database (copied first) and measures the resolver on the whole set: the AF1 gate. It also makes each reference call through the MCP server in both protocol eras and compares the text with the direct call: the AF2 gate. It also reads the follow-ups of the question set with a perfect model.
+- `FFC_ASK_DB=~/ffc-ask/stats.duckdb FFC_ASK_LIVE=ollama:qwen3:4b,ollama:gemma3:4b npm run test:ask` also runs the probe's 20 questions through the real loop with those models, on AC power: the AG1 gate. `FFC_ASK_PROFILE` and `FFC_ASK_MODE` pick the way to call them; `FFC_ASK_RECORD=1` writes the recordings.
 - `FantasyCompanion.exe --mcp-self-test=<file>` checks the bridge in a packaged build (the Package check and Release workflows run it).
```

Modify `docs/superpowers/specs/2026-11-01-ask-analyst-design.md`:

```diff
diff --git a/docs/superpowers/specs/2026-11-01-ask-analyst-design.md b/docs/superpowers/specs/2026-11-01-ask-analyst-design.md
index 62a71d4..96a0e4c 100644
--- a/docs/superpowers/specs/2026-11-01-ask-analyst-design.md
+++ b/docs/superpowers/specs/2026-11-01-ask-analyst-design.md
@@ -391,3 +391,23 @@ Taken in Plan AF2 (`docs/superpowers/plans/2026-11-02-plan-af2-mcp-server.md`),
 - **I. Claude Code in WSL (§6.1).** WSL's default (NAT) networking cannot reach Windows' 127.0.0.1, so Claude Code in WSL runs the bridge through WSL interop (`WSLENV=ELECTRON_RUN_AS_NODE`). Measured: the installed exe runs as Node from WSL and reads its asar. Stats › Ask offers both commands: HTTP for Claude Code on Windows, the bridge for WSL.
 - **J. "Settings › Ask" is the Stats › Ask tab (§6.1, §8).** The app has no Settings screen. The Ask tab holds the MCP part now, and Plan AH builds the chat and the other setup cards around it.
 - **K. Not in AF2:** traces of MCP calls (no question reaches the server; AG's loop traces turns), removing the entry from Claude desktop (when Claude is turned off, the bridge says so), and `open_in_app` (AH, §15 G).
+
+## 17. Plan AG1 amendments (2026-11-03)
+
+Taken in Plan AG1 (`docs/superpowers/plans/2026-11-03-plan-ag1-agent-loop.md`), approved by the user 2026-11-03, from its prototype and measurements on this PC:
+
+- **A. AG is split (§11).** AG1 `v0.39.0`: the loop, the providers, the keys, the calling modes, threads and replay. AG2: the evaluation, the model matrix and its report, `npm run ask:replay` and re-grading the recordings, before AH `v0.40.0`.
+- **B. Anthropic through its official SDK (§6.2).** `@anthropic-ai/sdk` 1.1.0, pinned exactly: one new dependency, for typed errors, streaming and retries. The OpenAI-compatible and local adapters use `fetch`, with no new dependency.
+- **C. "Thinking budget" becomes effort (§5.1, §5.2).** One control, "reasoning: off / low / high", mapped per provider.
+  - Anthropic: `output_config.effort`, `low` for "off" on Opus 5.5 (it cannot turn thinking off), `between_tools` on Sonnet 5.5, `disabled` on Haiku 5.5. Structured mode uses `output_config.format`, never a forced tool.
+  - OpenAI-compatible: `reasoning_effort` when reasoning is not off.
+  - Ollama: `think` on or off, sent only to a model with the capability.
+- **D. Ollama through its native `/api/chat` (§6.2), not its OpenAI endpoint.** The native API takes `format` (a schema), `think`, `options.num_ctx` and `keep_alive`, which is what the probes measured. The OpenAI endpoint cannot set the context size, so the brief would be cut at Ollama's default. LM Studio uses its OpenAI-compatible `/v1/chat/completions`, with capabilities from `/api/v0/models`.
+- **E. Replay (§10).** Recorded replies, the players the resolver matched and each call's outcome (cards left out) live in `tests/ask/replays/`. `npm test` runs them through the real resolver, compact schema and loop, with no model and no database. Moved to Plan AG2 (user, 2026-11-03): re-grading against the real engine in `npm run test:ask`, and `npm run ask:replay -- <trace>`.
+- **F. A "try a question" box in Stats › Ask (§8, §16 J).** Plain text: the streamed answer, the tool calls and the checks, with Stop. No cards and no thread list (Plan AH). It lets the user try a provider the day AG1 ships.
+- **G. Follow-ups (§4.1 thread state).** The thread keeps its last question and call. A question that opens like a follow-up, or has three words or fewer with no subject, position or ranking word, is read together with the last one: its words replace what they name and the rest carries forward. The last call's metric always stays among the candidates. The model also reads the last question and call.
+- **H. Examples and sample-k are built, off by default (§5.1, §5.3).** The top 3 `ask_examples` by masked question go into the compact prompt; sample-k re-samples an invalid first reply. Both are settings, and AG2 measures them. `bge-m3` comes behind a retriever in AG2, only if the evaluation shows a gain.
+- **I. Storage (§5.3, §6.2).** Migration 013 adds `ask_threads`, `ask_messages` and `ask_providers`. A key is stored as `safeStorage` ciphertext (DPAPI on Windows) and never reaches the renderer, a trace or a log. When `safeStorage` is unavailable (some Linux dev setups), keys are not stored, and the app says so.
+- **J. What leaves the PC (§6.2).** The Model section says it per provider. A cloud provider gets the question, the brief and the tool results (stats rows; league team and player names). A local one gets nothing that leaves the PC. Each answer names its model and tokens.
+- **K. Anthropic server-side fallbacks on.** Requests to Opus 5.5 and Sonnet 5.5 send `fallbacks: "default"`. A refusal elsewhere ends the turn with "the model declined", never a retry loop.
+- **Measured (2026-11-03, the frozen database through 2026 week 8, on AC power):** the probe's 20 questions through the real loop, compact profile, structured mode: `qwen3:4b` 20 of 20 (call step 1.9 s, whole turn 13.8 s, medians), `gemma3:4b` 19 of 20 (1.2 s, 2.5 s). Across three runs `qwen3:4b` scored 19–20 and `gemma3:4b` 19. All 8 follow-ups of the question set give their reference calls, and none of the other 155 questions is mistaken for one.
```

- [ ] **Step 2: Check and commit**

```bash
npx prettier --write docs/reference/analyst.md docs/superpowers/specs/2026-11-01-ask-analyst-design.md
git add docs/reference/analyst.md docs/superpowers/specs/2026-11-01-ask-analyst-design.md
git commit -m "docs(ask): the agent loop, spec amendments"
```

Expected: one commit; Prettier changes nothing.

---

### Task 13: Package check and the check by hand on Windows (spec §6.2, §10)

- [ ] **Step 1: The Windows suite, the self-tests, the unpacked app**

**Ask the user before pushing.** Then:

```bash
git push origin feat/analyst-ag1:check/plan-ag1
gh run watch "$(gh run list --branch check/plan-ag1 --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Expected: green, with both self-tests' logs as in Plan AF2, and an artifact `FantasyCompanion-win-unpacked`. Keep the branch until Step 2 is done.

- [ ] **Step 2: By hand, with the user, on the Windows build**

Unpack the artifact and run it on the real `userData`. WSL's networking can't reach Windows' `127.0.0.1`, so LM Studio is reached only from this build.

1. **Detection:** in Stats › Ask › Model, Find models on this PC lists WSL's Ollama (`localhost:11434`, forwarded) and LM Studio (`localhost:1234`), with their models. With a model that has no `tools` capability, the form picks structured mode.
2. **A key through DPAPI:** add a free-tier service (Groq or Gemini; the user makes the key from the dashboard link). Quit, reopen, and Test: it answers without the key being typed again. Then look at `ask_providers.key_cipher`: it is not the key.
3. **One question per provider kind in the try box:** Ollama, LM Studio, one OpenAI-compatible free tier. Each shows the streamed answer, its tool calls, the model and the tokens. Stop ends a turn. A follow-up ("now 2024") carries the last call.
4. **Anthropic:** only if the user's credit is API credit (console.anthropic.com → Billing; not checked yet, see Decisions). One Test and one question. Otherwise record that this adapter has had no real call.
5. **No key in the log:** with Dev mode on, ask one question, then search `<userData>\ask\log.jsonl` for the key: nothing.
6. **What leaves the PC:** the Model section says it for each kind, and with no provider set, nothing is sent.

Record what each showed for the status block. Then delete the branch, after the user agrees: `git push origin --delete check/plan-ag1`.

---

### Task 14: Release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 1,368 passed, 9 skipped (3 more with the untracked `playerImage` tests).

- [ ] **Step 2: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/analyst-ag1`. It reviews against:

- the spec (§5, §6.2, §10, §11) and the amendments (§17);
- the Review Focus list and the Open points;
- the security of keys: what crosses IPC, what is stored, what is logged, and which provider each key goes to.

Fix Critical and Important findings, each in its own commit, test first. Then re-run Step 1, Task 11's Step 9 and Step 10 and, for any change to `index.ts` or the build, Task 13's Step 1.

- [ ] **Step 3: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/analyst-ag1 -m "merge: feat/analyst-ag1 (plan AG1)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.39.0" && git tag v0.39.0
git branch -d feat/analyst-ag1
```

- [ ] **Step 4: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 11 gate numbers with the power state, the candidates' table, and what Task 13 showed;
- the review fixes, and anything deferred.

Then commit, staging this file only: `git commit -m "docs(plan): mark plan AG1 complete"`.

- [ ] **Step 5: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.39.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and both packaged self-tests, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.39.0 --draft=false`). The release notes:

- **Ask in the app:** add a model in Stats › Ask (an Anthropic key, an OpenAI-compatible service with a free tier, or a local model in Ollama or LM Studio) and try a question. The full Ask screen comes in a later version.
- **Your keys stay yours:** a key is encrypted on this PC and sent only to its own service. Local models send nothing out.

---

## Self-review against the spec

| Spec | Where |
| --- | --- |
| §4.1 Thread state, follow-ups | Task 7 (amendment G), Task 9 (kept with the thread) |
| §5.1 A turn: no model for an ambiguity or a decline; tools; the answer; the checks | Task 6 |
| §5.1 Tool calls in parallel when independent | Task 6 (`Promise.all` in native mode) |
| §5.1 `other` re-resolves once with the top 10 | Task 6 |
| §5.1 Limits: 8 calls, 3 failed, output cap, token cap, 90 s, Stop | Task 6, Task 9 (Stop); the timeout has no test (Open point 8) |
| §5.1 A thinking budget | Tasks 4, 5 (one reasoning control: amendment C) |
| §5.1 Sample-k seam, off by default | Task 8 |
| §5.2 Native and structured modes, capability from the server | Tasks 3–6, Task 10 (the default in the form) |
| §5.3 Threads in `companion.db` | Task 2, Task 9 |
| §5.3 A trace per turn, Dev mode's `log.jsonl` | Task 6 (built), Task 9 (appended) |
| §5.3 `ask_examples` retrieved by masked question, top 3 | Task 8; no test (Open point 4) |
| §6.2 Anthropic | Task 4 (the official SDK: amendments B, C, K) |
| §6.2 OpenAI-compatible and its presets | Task 3 |
| §6.2 Local servers: detection, models, capabilities | Task 5 (Ollama native: amendment D), Task 9 (LM Studio's chat) |
| §6.2 Keys with `safeStorage`, never logged, never sent to another provider | Task 2, Task 9, Task 13 |
| §6.2 What leaves the PC; each answer's model and tokens; dashboard links | Task 10 (amendment J) |
| §8 Stats › Ask until Plan AH | Task 10 (amendment F) |
| §9 Code layout | Architecture above |
| §10 Each adapter against recorded replies | Tasks 3–5, hand-written streams (Open point 7) |
| §10 Replay in `npm test` | Task 11 (with recorded outcomes) |
| §10 `npm run ask:replay`, re-grading against the engine | Plan AG2 (user, 2026-11-03; amendment E) |
| §11 The AG row | AG1's part here (amendment A); AG2 has the evaluation and the matrix |
