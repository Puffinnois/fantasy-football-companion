# Auto-update via GitHub Releases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Packaged Windows builds fetch and install new versions from GitHub Releases by themselves; a tag push builds and uploads each release from GitHub Actions.

**Architecture:** A `release.yml` workflow on `windows-latest` runs tests, builds, and lets electron-builder upload the NSIS installer + `.blockmap` + `latest.yml` to a draft release. In the app, a small injectable module `src/main/updater.ts` wraps `electron-updater`: one check at launch, silent background download, a native Restart now / Later dialog on `update-downloaded`, every error logged and swallowed.

**Tech Stack:** Electron 39, electron-builder 26, electron-updater 6.8, GitHub Actions, vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-auto-update-design.md`

## Global Constraints

- Ships as `v0.10.1`; Plan K keeps `v0.11.0`.
- Updater active only when `app.isPackaged && process.platform === 'win32'`.
- Every updater failure is logged with `console.error` and never shown to the user.
- `electron-updater` goes in `dependencies` (electron-vite externalizes main-process packages).
- Release is created as a **draft**; the user publishes it by hand.
- Local `build:*` scripts pass `--publish never`.
- Node version comes from `.nvmrc` (22). No native modules (`node:sqlite` is built in).
- Code style: prettier (single quotes, no semicolons, width 100, no trailing commas); `npm run lint` and `npm run typecheck` must stay clean. `tests/**` is typechecked by `tsconfig.node.json`, so test code must be exactly typed.
- Commits: Conventional Commits, imperative summary ≤ 50 chars, no `Co-Authored-By` or other trailers.
- Dialog copy, verbatim: title `Update ready`, message `FantasyCompanion <version> is ready to install.`, detail `Restart now to update, or it will install the next time you quit.`, buttons `Restart now` / `Later`.

---

### Task 1: Release pipeline

**Files:**
- Modify: `electron-builder.yml` (append at end)
- Modify: `package.json:18-21` (`build:*` scripts)
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: the workflow name `Release` (used by `gh run list --workflow=release.yml` in Task 5); electron-builder's `publish` config (used by `electron-updater` at runtime — it reads `app-update.yml` that electron-builder generates from this block into the packaged app).

- [ ] **Step 1: Add the publish block to `electron-builder.yml`**

Append to the end of the file (after `npmRebuild: false`):

```yaml
publish:
  provider: github
  owner: Puffinnois
  repo: fantasy-football-companion
  releaseType: draft
```

- [ ] **Step 2: Make local builds never publish**

In `package.json`, change the four `build:*` scripts so they read exactly:

```json
    "build:unpack": "npm run build && electron-builder --dir",
    "build:win": "npm run build && electron-builder --win --publish never",
    "build:mac": "electron-vite build && electron-builder --mac --publish never",
    "build:linux": "electron-vite build && electron-builder --linux --publish never",
```

(`build:unpack` is unchanged: `--dir` never publishes.)

- [ ] **Step 3: Create the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      # electron-builder names the release after package.json, not the tag.
      - name: Check tag matches package.json version
        shell: bash
        run: |
          expected="v$(node -p "require('./package.json').version")"
          if [ "$GITHUB_REF_NAME" != "$expected" ]; then
            echo "Tag $GITHUB_REF_NAME does not match package.json version ($expected)" >&2
            exit 1
          fi

      - run: npm ci
      - run: npm test
      - run: npm run build

      - name: Package and upload to a draft release
        run: npx electron-builder --win --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Validate both YAML files parse and the config is picked up**

Run:

```bash
node -e "const y=require('js-yaml');const fs=require('fs');for (const f of ['electron-builder.yml','.github/workflows/release.yml']) { const d=y.load(fs.readFileSync(f,'utf8')); console.log(f, 'ok', f.startsWith('electron') ? JSON.stringify(d.publish) : d.on.push.tags) }"
```

Expected:

```
electron-builder.yml ok {"provider":"github","owner":"Puffinnois","repo":"fantasy-football-companion","releaseType":"draft"}
.github/workflows/release.yml ok [ 'v*' ]
```

(`js-yaml` is present transitively via electron-builder. If `require('js-yaml')` fails, run `npx --yes js-yaml electron-builder.yml` and `npx --yes js-yaml .github/workflows/release.yml` instead; each must print the parsed document without error.)

Then confirm the scripts: `grep -n '"build:' package.json` must show `--publish never` on `build:win`, `build:mac`, `build:linux`.

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml package.json .github/workflows/release.yml
git commit -m "ci: build and publish Windows releases on tag push"
```

---

### Task 2: Updater module (TDD)

**Files:**
- Create: `src/main/updater.ts`
- Test: `tests/main/updater.test.ts`
- Modify: `package.json` (`dependencies`, via `npm install`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (used by Task 3):

```ts
export interface UpdaterLike {
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
}
export interface DialogLike {
  showMessageBox(options: MessageBoxOptions): Promise<{ response: number }>
  showMessageBox(window: BrowserWindow, options: MessageBoxOptions): Promise<{ response: number }>
}
export interface UpdaterDeps {
  enabled: boolean
  updater: UpdaterLike
  dialog: DialogLike
  getWindow: () => BrowserWindow | null
  log?: (message: string, err: unknown) => void
}
export function installAutoUpdater(deps: UpdaterDeps): void
```

`electron-updater`'s real `autoUpdater` is structurally assignable to `UpdaterLike` (verified against 6.8.9), and Electron's `dialog` to `DialogLike`.

- [ ] **Step 1: Install the dependency**

```bash
npm install electron-updater@^6.8.9
```

Expected: `package.json` `dependencies` now lists `"electron-updater": "^6.8.9"` (not `devDependencies`). Check with `grep -n electron-updater package.json`.

- [ ] **Step 2: Write the failing tests**

Create `tests/main/updater.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { MessageBoxOptions } from 'electron'
import { installAutoUpdater, type UpdaterDeps, type UpdaterLike } from '@main/updater'

interface Harness {
  counts: { checks: number; installs: number }
  dialogs: MessageBoxOptions[]
  logs: string[]
  /** Event names the module subscribed to, in order. */
  registered: string[]
  /** Fires the listener registered for `error`. */
  emitError: (err: Error) => void
  /** Fires the listener registered for `update-downloaded` and waits for the prompt to settle. */
  emitDownloaded: (version: string) => Promise<void>
}

interface Options {
  enabled?: boolean
  /** Index of the dialog button the fake user presses. */
  response?: number
  checkFails?: boolean
}

type ErrorListener = (err: Error) => void
type DownloadedListener = (info: { version: string }) => unknown

function setup({ enabled = true, response = 0, checkFails = false }: Options = {}): Harness {
  const counts = { checks: 0, installs: 0 }
  const dialogs: MessageBoxOptions[] = []
  const logs: string[] = []
  const registered: string[] = []
  let onError: ErrorListener | undefined
  let onDownloaded: DownloadedListener | undefined

  const updater: UpdaterLike = {
    checkForUpdates() {
      counts.checks++
      return checkFails ? Promise.reject(new Error('offline')) : Promise.resolve(null)
    },
    quitAndInstall() {
      counts.installs++
    },
    on(event: 'error' | 'update-downloaded', listener: ErrorListener | DownloadedListener) {
      registered.push(event)
      if (event === 'error') onError = listener as ErrorListener
      else onDownloaded = listener as DownloadedListener
      return updater
    }
  }

  const deps: UpdaterDeps = {
    enabled,
    updater,
    dialog: {
      showMessageBox(...args: unknown[]) {
        dialogs.push(args[args.length - 1] as MessageBoxOptions)
        return Promise.resolve({ response })
      }
    },
    getWindow: () => null,
    log: (message) => {
      logs.push(message)
    }
  }
  installAutoUpdater(deps)

  return {
    counts,
    dialogs,
    logs,
    registered,
    emitError: (err) => onError?.(err),
    emitDownloaded: async (version) => {
      await onDownloaded?.({ version })
    }
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('installAutoUpdater', () => {
  it('does nothing when disabled', () => {
    const h = setup({ enabled: false })
    expect(h.counts.checks).toBe(0)
    expect(h.registered).toEqual([])
  })

  it('checks once at launch and subscribes to error and update-downloaded', () => {
    const h = setup()
    expect(h.counts.checks).toBe(1)
    expect(h.registered.sort()).toEqual(['error', 'update-downloaded'])
  })

  it('installs when the user picks Restart now', async () => {
    const h = setup({ response: 0 })
    await h.emitDownloaded('0.10.2')
    expect(h.dialogs).toHaveLength(1)
    expect(h.dialogs[0].title).toBe('Update ready')
    expect(h.dialogs[0].message).toBe('FantasyCompanion 0.10.2 is ready to install.')
    expect(h.dialogs[0].buttons).toEqual(['Restart now', 'Later'])
    expect(h.counts.installs).toBe(1)
  })

  it('does not install when the user picks Later', async () => {
    const h = setup({ response: 1 })
    await h.emitDownloaded('0.10.2')
    expect(h.dialogs).toHaveLength(1)
    expect(h.counts.installs).toBe(0)
  })

  it('logs updater errors without throwing', () => {
    const h = setup()
    expect(() => h.emitError(new Error('boom'))).not.toThrow()
    expect(h.logs).toEqual(['auto-update failed'])
  })

  it('logs a failed launch check without an unhandled rejection', async () => {
    const h = setup({ checkFails: true })
    await tick()
    expect(h.logs).toEqual(['auto-update check failed'])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/main/updater.test.ts`

Expected: FAIL — `Failed to resolve import "@main/updater"` (module does not exist yet).

- [ ] **Step 4: Implement the module**

Create `src/main/updater.ts`:

```ts
import type { BrowserWindow, MessageBoxOptions } from 'electron'

/** The slice of electron-updater's `autoUpdater` this module uses; injectable for tests. */
export interface UpdaterLike {
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
}

/** The slice of Electron's `dialog` this module uses; injectable for tests. */
export interface DialogLike {
  showMessageBox(options: MessageBoxOptions): Promise<{ response: number }>
  showMessageBox(window: BrowserWindow, options: MessageBoxOptions): Promise<{ response: number }>
}

export interface UpdaterDeps {
  /** `app.isPackaged && process.platform === 'win32'` in production; false disables everything. */
  enabled: boolean
  updater: UpdaterLike
  dialog: DialogLike
  getWindow: () => BrowserWindow | null
  /** Defaults to console.error. Every updater failure ends here and nowhere else. */
  log?: (message: string, err: unknown) => void
}

const RESTART_NOW = 0

/**
 * One update check at launch. electron-updater downloads a newer version in the background
 * (autoDownload) and installs it on quit (autoInstallOnAppQuit); once it is downloaded we offer
 * an immediate restart. Failures — offline, no release yet, rate limit — are logged and swallowed.
 */
export function installAutoUpdater(deps: UpdaterDeps): void {
  if (!deps.enabled) return
  const log = deps.log ?? ((message, err) => console.error(message, err))

  deps.updater.on('error', (err) => log('auto-update failed', err))
  deps.updater.on('update-downloaded', (info) =>
    promptRestart(deps, info.version).catch((err) => log('auto-update prompt failed', err))
  )
  deps.updater.checkForUpdates().catch((err) => log('auto-update check failed', err))
}

async function promptRestart(deps: UpdaterDeps, version: string): Promise<void> {
  const options: MessageBoxOptions = {
    type: 'info',
    title: 'Update ready',
    message: `FantasyCompanion ${version} is ready to install.`,
    detail: 'Restart now to update, or it will install the next time you quit.',
    buttons: ['Restart now', 'Later'],
    defaultId: RESTART_NOW,
    cancelId: 1
  }
  const window = deps.getWindow()
  const { response } = window
    ? await deps.dialog.showMessageBox(window, options)
    : await deps.dialog.showMessageBox(options)
  if (response === RESTART_NOW) deps.updater.quitAndInstall()
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/updater.test.ts`

Expected: `Tests  6 passed (6)`.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

Expected: both exit 0 with no output besides the commands. If prettier formatting differs, run `npx prettier --write src/main/updater.ts tests/main/updater.test.ts` and re-run lint.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/main/updater.ts tests/main/updater.test.ts
git commit -m "feat(updater): auto-update module with restart prompt"
```

---

### Task 3: Wire the updater into the main process

**Files:**
- Modify: `src/main/index.ts:1-2` (imports) and `src/main/index.ts:80` (after `createWindow()`)

**Interfaces:**
- Consumes: `installAutoUpdater(deps: UpdaterDeps)` from `@main/updater` (Task 2); `autoUpdater` from `electron-updater`; `dialog` from `electron` (already imported); `mainWindow` module variable (already exists).
- Produces: nothing new.

- [ ] **Step 1: Add the imports**

At the top of `src/main/index.ts`, the first line currently reads:

```ts
import { app, BrowserWindow, dialog, shell } from 'electron'
```

Keep it, and add after the `@electron-toolkit/utils` import (line 3):

```ts
import { autoUpdater } from 'electron-updater'
```

and after the other `@main/...` imports (alphabetical, so after `@main/sources/sleeperNews`):

```ts
import { installAutoUpdater } from '@main/updater'
```

- [ ] **Step 2: Call it after the window exists**

In the `app.whenReady().then(() => { ... })` block, the current lines are:

```ts
  registerIpcHandlers(ctx)
  createWindow()

  if (getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)) {
```

Change to:

```ts
  registerIpcHandlers(ctx)
  createWindow()
  installAutoUpdater({
    enabled: app.isPackaged && process.platform === 'win32',
    updater: autoUpdater,
    dialog,
    getWindow: () => mainWindow
  })

  if (getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)) {
```

- [ ] **Step 3: Typecheck, lint, full test run**

Run: `npm run typecheck && npm run lint && npm test`

Expected: typecheck and lint silent; vitest ends with all suites passed (the count includes the 6 new updater tests). A typecheck error on `updater: autoUpdater` or `dialog` would mean the `UpdaterLike` / `DialogLike` shapes in Task 2 drifted from the spec — fix the interfaces there, not with a cast here.

- [ ] **Step 4: Confirm the dependency is externalized, not bundled**

Run: `npm run build && grep -c 'require("electron-updater")' out/main/index.js`

Expected: the build succeeds and the grep prints `1` — electron-vite leaves `electron-updater` as a runtime `require`, which is why it must live in `dependencies` (Task 2 Step 1). A `0` means it was inlined; check that `package.json` lists it under `dependencies`.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(updater): check for updates at launch"
```

---

### Task 4: Release ritual and docs

**Files:**
- Create: `.npmrc`
- Modify: `README.md:10-11`
- Modify: `docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md:243-244` (§9 Phasing)

**Interfaces:**
- Consumes: the workflow from Task 1 (referenced by name in the README).
- Produces: `npm version <bump>` producing the commit `build: bump version to X.Y.Z` and tag `vX.Y.Z` (used in Task 5).

- [ ] **Step 1: Commit-message template for `npm version`**

Create `.npmrc` with exactly:

```
message = "build: bump version to %s"
```

Verify: `npm config get message` prints `build: bump version to %s`.

(`.npmrc` is already excluded from the packaged app by `electron-builder.yml` and is not gitignored.)

- [ ] **Step 2: README**

Replace the two lines

```
- Windows installer: `npm run build:win` → `dist/FantasyCompanion-Setup-<version>.exe`
  - Building from WSL needs 32-bit wine for electron-builder's NSIS step (the installer is a 32-bit binary): `sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine64 wine32:i386`. Verified on Ubuntu 24.04 / wine 9.0.
```

with

```
- Windows installer, local test build: `npm run build:win` → `dist/FantasyCompanion-Setup-<version>.exe` (never publishes)
  - Building from WSL needs 32-bit wine for electron-builder's NSIS step (the installer is a 32-bit binary): `sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine64 wine32:i386`. Verified on Ubuntu 24.04 / wine 9.0.
- Release: `npm version <patch|minor|major>` (bumps `package.json`, commits `build: bump version to X.Y.Z`, tags `vX.Y.Z`) → `git push --follow-tags` → the `Release` workflow builds on Windows and uploads the installer to a **draft** GitHub release → add notes, press **Publish**.
- Auto-update: packaged Windows builds check GitHub Releases once at launch and offer **Restart now / Later** once a newer version has downloaded (Later installs on next quit). Installs ≤ 0.10.0 have no updater — reinstall once from the `v0.10.1` release.
```

- [ ] **Step 3: Roadmap line in the 6a spec**

In `docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md` §9 Phasing, between the **Plan J** and **Plan K** bullets, insert:

```
- **Auto-update** (own spec: `2026-09-21-auto-update-design.md`, plan: `2026-09-21-plan-auto-update.md`) — GitHub Releases + in-app updater → `v0.10.1`.
```

- [ ] **Step 4: Check formatting**

Run: `npx prettier --check README.md .npmrc docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md`

Expected: `All matched files use Prettier code style!` (if `.npmrc` is reported as unsupported, that is fine — prettier ignores it).

- [ ] **Step 5: Commit**

```bash
git add .npmrc README.md docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md
git commit -m "docs: release ritual and auto-update notes"
```

---

### Task 5: Release `v0.10.1` and verify the loop end to end

This task is run by the user with Claude driving the commands; it needs GitHub and a Windows machine. `gh` is authenticated as `Puffinnois`.

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm version`)
- Modify: `README.md` (throwaway change for `v0.10.2`)

**Interfaces:**
- Consumes: everything above.
- Produces: published releases `v0.10.1` and `v0.10.2`.

- [ ] **Step 1: Bump, tag, push**

Working tree must be clean (`git status --short` prints nothing). Then:

```bash
npm version patch
git log --oneline -1 && git tag --points-at HEAD
```

Expected: `build: bump version to 0.10.1` and tag `v0.10.1`. Then push branch and tag (main has no upstream yet):

```bash
git push -u origin main --follow-tags
```

- [ ] **Step 2: Watch the workflow**

The run appears a few seconds after the push:

```bash
gh run list --workflow=release.yml --limit 1
gh run watch --exit-status $(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: the run ends with `✓ ... completed with 'success'`. Typical duration 4–8 minutes.

If it fails: read the log with `gh run view --log-failed`, fix, commit on main, then move the tag and clean the draft:

```bash
gh release delete v0.10.1 --yes 2>/dev/null; true
git tag -f v0.10.1 && git push -f origin v0.10.1
```

(`package.json` still says 0.10.1, so the guard passes.) Re-run Step 2.

- [ ] **Step 3: Verify the draft assets and publish**

```bash
gh release view v0.10.1 --json isDraft,assets -q '{draft: .isDraft, files: [.assets[].name]}'
```

Expected:

```
{"draft":true,"files":["FantasyCompanion-Setup-0.10.1.exe","FantasyCompanion-Setup-0.10.1.exe.blockmap","latest.yml"]}
```

Publish:

```bash
gh release edit v0.10.1 --draft=false --notes "Auto-update: this and later versions update themselves. Installs of 0.10.0 or older must be reinstalled from this release once."
```

- [ ] **Step 4: Install on Windows**

Download `FantasyCompanion-Setup-0.10.1.exe` from the release page on the Windows machine, run it (SmartScreen: More info → Run anyway), launch the app once. Expected: app runs as before; no update dialog (there is nothing newer).

- [ ] **Step 5: Throwaway `v0.10.2` to exercise the update path**

On WSL, make a README-only change (e.g. add a `- Changelog: GitHub Releases` line under the docs bullets), then:

```bash
git add README.md && git commit -m "docs: point to GitHub Releases for changelog"
npm version patch
git push --follow-tags
gh run watch --exit-status $(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh release edit v0.10.2 --draft=false --notes "Verifies the auto-update path."
```

- [ ] **Step 6: Observe the update**

On Windows, launch the installed 0.10.1 app. Expected within ~30 s: dialog **Update ready** — *FantasyCompanion 0.10.2 is ready to install.* Press **Restart now**. Expected: the app quits, the installer runs silently, the app relaunches; Windows *Apps → Installed apps* shows FantasyCompanion 0.10.2.

If no dialog appears: on Windows, start the installed exe from a terminal so `console.error` output is visible — default install folder `%LOCALAPPDATA%\Programs\FantasyCompanion\FantasyCompanion.exe` — and look for `auto-update ...` lines. A downloaded-but-not-installed update sits in `%LOCALAPPDATA%\fantasycompanion-updater\pending\`. The most common cause is the release still being a draft (`gh release view v0.10.2 --json isDraft`).

- [ ] **Step 7: Close out**

Mark this plan's tasks done, and update the FFC project status memory (slice list, `v0.10.2` current, plan K next).
