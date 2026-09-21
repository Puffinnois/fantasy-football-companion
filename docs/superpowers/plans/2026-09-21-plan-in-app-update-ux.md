# In-app update UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native update dialog + NSIS wizard with an in-app Update button in the sidebar, a custom popup with release notes and progress, and a silent install that relaunches the app.

**Architecture:** The main process owns one `UpdateState` machine in `src/main/updater.ts` (fed by electron-updater events, re-checked hourly) and pushes each change to the renderer over `update:changed`; `update:state` / `update:install` / `app:version` are invoke handlers. The renderer keeps the state in a hook and renders an `UpdatePill` in the sidebar footer and an `UpdateDialog` (shadcn Dialog + DOMPurify-sanitized notes).

**Tech Stack:** Electron 39, electron-updater 6.8, React 19, shadcn (radix-ui umbrella package), DOMPurify, vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-21-in-app-update-ux-design.md`

## Global Constraints

- Ships as `v0.11.0`; Plan K moves to `v0.12.0`.
- Updater enabled only when `app.isPackaged && process.platform === 'win32'`; in dev the state is `idle` forever.
- Errors: `console.error` + `{ status: 'error' }` in the state. No dialog, no toast.
- Install: `quitAndInstall(true, true)` (silent, auto-relaunch), only from `ready`.
- Check cadence: at install time and every `60 * 60 * 1000` ms; timer `unref()`'d.
- Copy, verbatim: pill `Update to {version}` / `Downloading {percent}%`; dialog title `Update to {version}`, description `You're on {currentVersion}`, fallback `No release notes for this version.`, progress `Downloading {percent}%`, buttons `Update & restart` (→ `Restarting…`) and `Later`.
- Sanitizer whitelist: tags `p br ul ol li a strong em b i code pre h1 h2 h3 h4 blockquote`, attr `href`; every `<a>` gets `target="_blank" rel="noreferrer"`.
- Code style: prettier (single quotes, no semicolons, width 100, no trailing commas). Outside `components/ui/**`, ESLint requires explicit function return types and component files may export only components. `npm run lint` and `npm run typecheck` must stay clean; `tests/**` is typechecked by `tsconfig.node.json` (except `tests/renderer`, typechecked by `tsconfig.web.json`).
- Commits: Conventional Commits, imperative summary ≤ 50 chars, no trailers.

---

### Task 1: Update state machine (shared types, IPC names, `updater.ts` rewrite — TDD)

**Files:**
- Modify: `src/shared/types.ts` (append)
- Modify: `src/shared/ipc.ts:73-94` (`IPC` const)
- Rewrite: `src/main/updater.ts`
- Rewrite: `tests/main/updater.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 2–6):

```ts
// @shared/types
export type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; notes: string | null }
  | { status: 'downloading'; version: string; notes: string | null; percent: number }
  | { status: 'ready'; version: string; notes: string | null }
  | { status: 'error'; message: string }

// @main/updater
export interface UpdaterLike { checkForUpdates(); quitAndInstall(isSilent, isForceRunAfter); on(...) × 4 }
export interface UpdaterDeps { enabled; updater; onChange(state); checkIntervalMs?; log? }
export interface UpdateController { state(): UpdateState; install(): void }
export function installAutoUpdater(deps: UpdaterDeps): UpdateController

// IPC names
IPC.updateState = 'update:state', IPC.updateInstall = 'update:install',
IPC.updateChanged = 'update:changed', IPC.appVersion = 'app:version'
```

- [ ] **Step 1: Add the shared type and IPC names**

Append to `src/shared/types.ts`:

```ts

/** Auto-update progress as owned by the main process; the renderer only renders it. */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; notes: string | null }
  | { status: 'downloading'; version: string; notes: string | null; percent: number }
  | { status: 'ready'; version: string; notes: string | null }
  | { status: 'error'; message: string }
```

In `src/shared/ipc.ts`, the `IPC` const currently ends with:

```ts
  syncStatus: 'sync:status',
  syncProgress: 'sync:progress'
} as const
```

Change to:

```ts
  syncStatus: 'sync:status',
  syncProgress: 'sync:progress',
  updateState: 'update:state',
  updateInstall: 'update:install',
  updateChanged: 'update:changed',
  appVersion: 'app:version'
} as const
```

- [ ] **Step 2: Write the failing tests**

Replace `tests/main/updater.test.ts` entirely with:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installAutoUpdater,
  type UpdateController,
  type UpdaterDeps,
  type UpdaterLike
} from '@main/updater'
import type { UpdateState } from '@shared/types'

type Listener = (payload: never) => unknown

interface Harness {
  controller: UpdateController
  /** Every state pushed through onChange, in order. */
  states: UpdateState[]
  logs: string[]
  counts: { checks: number }
  /** Arguments of each quitAndInstall call. */
  installs: [boolean, boolean][]
  registered: string[]
  emit: (event: string, payload: unknown) => void
}

interface Options {
  enabled?: boolean
  checkFails?: boolean
  checkIntervalMs?: number
}

function setup({ enabled = true, checkFails = false, checkIntervalMs }: Options = {}): Harness {
  const listeners = new Map<string, Listener>()
  const states: UpdateState[] = []
  const logs: string[] = []
  const counts = { checks: 0 }
  const installs: [boolean, boolean][] = []

  const updater: UpdaterLike = {
    checkForUpdates() {
      counts.checks++
      return checkFails ? Promise.reject(new Error('offline')) : Promise.resolve(null)
    },
    quitAndInstall(isSilent, isForceRunAfter) {
      installs.push([isSilent, isForceRunAfter])
    },
    on(event: string, listener: Listener) {
      listeners.set(event, listener)
      return updater
    }
  }
  const deps: UpdaterDeps = {
    enabled,
    updater,
    onChange: (state) => {
      states.push(state)
    },
    checkIntervalMs,
    log: (message) => {
      logs.push(message)
    }
  }
  const controller = installAutoUpdater(deps)
  return {
    controller,
    states,
    logs,
    counts,
    installs,
    registered: [...listeners.keys()].sort(),
    emit: (event, payload) => listeners.get(event)?.(payload as never)
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const info = (version = '0.11.0', releaseNotes: unknown = '<p>Notes</p>'): unknown => ({
  version,
  releaseNotes
})

afterEach(() => {
  vi.useRealTimers()
})

describe('installAutoUpdater', () => {
  it('does nothing when disabled', () => {
    const h = setup({ enabled: false })
    expect(h.counts.checks).toBe(0)
    expect(h.registered).toEqual([])
    expect(h.controller.state()).toEqual({ status: 'idle' })
    h.controller.install()
    expect(h.installs).toEqual([])
  })

  it('checks at once and subscribes to the four events', () => {
    const h = setup()
    expect(h.counts.checks).toBe(1)
    expect(h.registered).toEqual(['download-progress', 'error', 'update-available', 'update-downloaded'])
    expect(h.controller.state()).toEqual({ status: 'idle' })
  })

  it('goes available with the release notes, or null when they are not a string', () => {
    const h = setup()
    h.emit('update-available', info())
    expect(h.controller.state()).toEqual({ status: 'available', version: '0.11.0', notes: '<p>Notes</p>' })
    h.emit('update-available', info('0.11.0', [{ version: '0.11.0', note: 'x' }]))
    expect(h.controller.state()).toEqual({ status: 'available', version: '0.11.0', notes: null })
  })

  it('tracks download progress as a rounded percent and drops repeats', () => {
    const h = setup()
    h.emit('update-available', info())
    h.emit('download-progress', { percent: 41.6 })
    h.emit('download-progress', { percent: 41.7 })
    h.emit('download-progress', { percent: 43.2 })
    expect(h.states.map((s) => (s.status === 'downloading' ? s.percent : s.status))).toEqual([
      'available',
      42,
      43
    ])
    expect(h.controller.state()).toEqual({
      status: 'downloading',
      version: '0.11.0',
      notes: '<p>Notes</p>',
      percent: 43
    })
  })

  it('ignores progress before an update is known', () => {
    const h = setup()
    h.emit('download-progress', { percent: 10 })
    expect(h.states).toEqual([])
  })

  it('goes ready when downloaded and installs silently with relaunch', () => {
    const h = setup()
    h.emit('update-available', info())
    h.emit('update-downloaded', info())
    expect(h.controller.state()).toEqual({ status: 'ready', version: '0.11.0', notes: '<p>Notes</p>' })
    h.controller.install()
    expect(h.installs).toEqual([[true, true]])
  })

  it('does not install unless ready', () => {
    const h = setup()
    h.emit('update-available', info())
    h.controller.install()
    expect(h.installs).toEqual([])
  })

  it('records and logs updater errors', () => {
    const h = setup()
    expect(() => h.emit('error', new Error('boom'))).not.toThrow()
    expect(h.controller.state()).toEqual({ status: 'error', message: 'boom' })
    expect(h.logs).toEqual(['auto-update failed'])
  })

  it('logs a failed check without an unhandled rejection', async () => {
    const h = setup({ checkFails: true })
    await tick()
    expect(h.logs).toEqual(['auto-update check failed'])
    expect(h.controller.state()).toEqual({ status: 'idle' })
  })

  it('checks again every interval', () => {
    vi.useFakeTimers()
    const h = setup({ checkIntervalMs: 1000 })
    expect(h.counts.checks).toBe(1)
    vi.advanceTimersByTime(2500)
    expect(h.counts.checks).toBe(3)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/main/updater.test.ts`

Expected: FAIL — type/shape errors such as `deps.onChange is not a function` / `installAutoUpdater(...)` returning `undefined` (`Cannot read properties of undefined (reading 'state')`).

- [ ] **Step 4: Rewrite the module**

Replace `src/main/updater.ts` entirely with:

```ts
import type { UpdateState } from '@shared/types'

interface UpdateInfoLike {
  version: string
  releaseNotes?: unknown
}

/** The slice of electron-updater's `autoUpdater` this module uses; injectable for tests. */
export interface UpdaterLike {
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'update-available', listener: (info: UpdateInfoLike) => void): unknown
  on(event: 'download-progress', listener: (info: { percent: number }) => void): unknown
  on(event: 'update-downloaded', listener: (info: UpdateInfoLike) => void): unknown
}

export interface UpdaterDeps {
  /** `app.isPackaged && process.platform === 'win32'` in production; false disables everything. */
  enabled: boolean
  updater: UpdaterLike
  /** Called with every new state; index.ts forwards it to the window. */
  onChange: (state: UpdateState) => void
  /** Re-check period. Defaults to one hour. */
  checkIntervalMs?: number
  /** Defaults to console.error. Every updater failure ends here and in the state, nowhere else. */
  log?: (message: string, err: unknown) => void
}

export interface UpdateController {
  state(): UpdateState
  /** Silent install + relaunch. No-op unless the state is `ready`. */
  install(): void
}

const HOUR_MS = 60 * 60 * 1000
const IDLE: UpdateState = { status: 'idle' }

/**
 * Owns the update state: electron-updater downloads a newer version in the background
 * (autoDownload) and installs it on quit (autoInstallOnAppQuit); the renderer shows the state and
 * asks for an immediate install. Failures — offline, no release yet, rate limit — are logged and
 * recorded, never shown natively.
 */
export function installAutoUpdater(deps: UpdaterDeps): UpdateController {
  if (!deps.enabled) return { state: () => IDLE, install: () => undefined }
  const log = deps.log ?? ((message, err) => console.error(message, err))
  let state: UpdateState = IDLE

  const set = (next: UpdateState): void => {
    if (JSON.stringify(next) === JSON.stringify(state)) return
    state = next
    deps.onChange(next)
  }

  deps.updater.on('error', (err) => {
    log('auto-update failed', err)
    set({ status: 'error', message: err.message })
  })
  deps.updater.on('update-available', (info) =>
    set({ status: 'available', version: info.version, notes: notesOf(info.releaseNotes) })
  )
  deps.updater.on('download-progress', (info) => {
    if (state.status !== 'available' && state.status !== 'downloading') return
    set({
      status: 'downloading',
      version: state.version,
      notes: state.notes,
      percent: Math.round(info.percent)
    })
  })
  deps.updater.on('update-downloaded', (info) =>
    set({ status: 'ready', version: info.version, notes: notesOf(info.releaseNotes) })
  )

  const check = (): void => {
    deps.updater.checkForUpdates().catch((err) => log('auto-update check failed', err))
  }
  check()
  setInterval(check, deps.checkIntervalMs ?? HOUR_MS).unref()

  return {
    state: () => state,
    install: () => {
      if (state.status === 'ready') deps.updater.quitAndInstall(true, true)
    }
  }
}

/** GitHub releases arrive as an HTML string; other providers may send arrays — we only render strings. */
function notesOf(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/updater.test.ts`

Expected: `Tests  10 passed (10)`.

- [ ] **Step 6: Typecheck (expect one known failure) and lint**

Run: `npm run typecheck:node 2>&1 | grep -E "error TS" | head`

Expected: exactly one error, in `src/main/index.ts` (the old `installAutoUpdater({ ... dialog ... })` call no longer matches). Task 2 fixes it. Anything else must be fixed now.

Run: `npx prettier --check src/main/updater.ts tests/main/updater.test.ts src/shared/types.ts src/shared/ipc.ts`
Expected: `All matched files use Prettier code style!` (otherwise `npx prettier --write` those files).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/shared/ipc.ts src/main/updater.ts tests/main/updater.test.ts
git commit -m "feat(updater): update state machine with hourly check"
```

---

### Task 2: Main-process wiring — handlers, index, preload, `Api`

**Files:**
- Modify: `src/shared/ipc.ts:1-8` (type import list) and the `Api` interface (after the `sync` block, ~line 70)
- Modify: `src/main/ipc/handlers.ts:1` (electron import), `:45` (`@shared/types` import list), `:47-55` (`AppContext`), end of `registerIpcHandlers`
- Modify: `src/main/index.ts` (imports; `whenReady` block)
- Modify: `src/preload/index.ts` (`api` object)

**Interfaces:**
- Consumes: `UpdateController`, `installAutoUpdater` (Task 1); `IPC.updateState/updateInstall/updateChanged/appVersion`; `UpdateState`.
- Produces (used by Tasks 5–6): `api.update.state(): Promise<UpdateState>`, `api.update.install(): Promise<void>`, `api.update.onChange(listener: (state: UpdateState) => void): () => void`, `api.app.version(): Promise<string>`.

- [ ] **Step 1: Extend the `Api` interface**

In `src/shared/ipc.ts`, add `UpdateState` to the `import type { ... } from './types'` list (keep it alphabetical — it goes last). Then, in `interface Api`, after the `sync` block:

```ts
  sync: {
    refresh(force?: boolean): Promise<SyncResult>
    status(): Promise<SyncStatus>
    onProgress(listener: (entry: SyncLogEntry) => void): () => void
  }
  update: {
    state(): Promise<UpdateState>
    /** Silent install + relaunch; no-op unless the state is `ready`. */
    install(): Promise<void>
    /** Fires on every state change; returns the unsubscribe function. */
    onChange(listener: (state: UpdateState) => void): () => void
  }
  app: {
    version(): Promise<string>
  }
}
```

- [ ] **Step 2: Handlers**

In `src/main/ipc/handlers.ts`:

Line 1, `import { ipcMain, type BrowserWindow } from 'electron'` → `import { app, ipcMain, type BrowserWindow } from 'electron'`.

Add `UpdateState` to the multi-line `import type { ... } from '@shared/types'` list ending at line 45 (alphabetical, last).

Add after the `@main/...` imports: `import type { UpdateController } from '@main/updater'`.

`AppContext` gains one field:

```ts
export interface AppContext {
  db: Db
  sleeper: SleeperClient
  nflverse: NflverseClient
  fantasypros: FantasyProsClient
  fantasycalc: FantasyCalcClient
  news: NewsCache
  getWindow: () => BrowserWindow | null
  update: UpdateController
}
```

At the end of `registerIpcHandlers`, after the `IPC.syncStatus` handler (the last one), add:

```ts

  ipcMain.handle(IPC.updateState, (): UpdateState => ctx.update.state())
  ipcMain.handle(IPC.updateInstall, (): void => ctx.update.install())
  ipcMain.handle(IPC.appVersion, (): string => app.getVersion())
```

- [ ] **Step 3: `index.ts`**

Imports: add `import { IPC } from '@shared/ipc'` after the `@main/...` imports. Keep `autoUpdater` and `installAutoUpdater` imports (already present). `dialog` stays imported (used by `openAppDatabase`).

In `app.whenReady().then(() => { ... })`, the block currently reads:

```ts
  const ctx: AppContext = {
    db: openAppDatabase(),
    sleeper: createSleeperClient(),
    nflverse: createNflverseClient(),
    fantasypros: createFantasyProsClient(),
    fantasycalc: createFantasyCalcClient(),
    news: createNewsCache(createSleeperNewsClient()),
    getWindow: () => mainWindow
  }
  registerIpcHandlers(ctx)
  createWindow()
  installAutoUpdater({
    enabled: app.isPackaged && process.platform === 'win32',
    updater: autoUpdater,
    dialog,
    getWindow: () => mainWindow
  })
```

Change to:

```ts
  const ctx: AppContext = {
    db: openAppDatabase(),
    sleeper: createSleeperClient(),
    nflverse: createNflverseClient(),
    fantasypros: createFantasyProsClient(),
    fantasycalc: createFantasyCalcClient(),
    news: createNewsCache(createSleeperNewsClient()),
    getWindow: () => mainWindow,
    update: installAutoUpdater({
      enabled: app.isPackaged && process.platform === 'win32',
      updater: autoUpdater,
      onChange: (state) => mainWindow?.webContents.send(IPC.updateChanged, state)
    })
  }
  registerIpcHandlers(ctx)
  createWindow()
```

(A change that fires before the window exists is dropped; the renderer's initial `update.state()` call covers it.)

- [ ] **Step 4: Preload**

In `src/preload/index.ts`, line 3 `import type { SyncLogEntry } from '@shared/types'` → `import type { SyncLogEntry, UpdateState } from '@shared/types'`. Then, after the `sync` block of the `api` object (before the closing `}`):

```ts
  sync: {
    refresh: (force) => ipcRenderer.invoke(IPC.syncRefresh, force ?? false),
    status: () => ipcRenderer.invoke(IPC.syncStatus),
    onProgress: (listener) => {
      const handler = (_event: IpcRendererEvent, entry: SyncLogEntry): void => listener(entry)
      ipcRenderer.on(IPC.syncProgress, handler)
      return () => {
        ipcRenderer.removeListener(IPC.syncProgress, handler)
      }
    }
  },
  update: {
    state: () => ipcRenderer.invoke(IPC.updateState),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    onChange: (listener) => {
      const handler = (_event: IpcRendererEvent, state: UpdateState): void => listener(state)
      ipcRenderer.on(IPC.updateChanged, handler)
      return () => {
        ipcRenderer.removeListener(IPC.updateChanged, handler)
      }
    }
  },
  app: {
    version: () => ipcRenderer.invoke(IPC.appVersion)
  }
}
```

- [ ] **Step 5: Typecheck, lint, tests, build**

Run: `npm run typecheck && npm run lint && npm test 2>&1 | grep -E "Test Files|Tests " && npm run build 2>&1 | grep -E "error|built in" | tail -2`

Expected: typecheck and lint silent; `Test Files  54 passed (54)`, `Tests  384 passed (384)` (the 6 old updater tests became 10); build ends with `✓ built in …` and no `error` line.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc.ts src/main/ipc/handlers.ts src/main/index.ts src/preload/index.ts
git commit -m "feat(updater): expose update state and install over IPC"
```

---

### Task 3: Release-notes sanitizer (renderer — TDD)

**Files:**
- Create: `src/renderer/src/lib/updateNotes.ts`
- Test: `tests/renderer/lib/updateNotes.test.ts`
- Modify: `package.json` (`dompurify` dependency, via `npm install`)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 5): `renderNotes(html: string | null): string | null` — sanitized HTML or `null` when nothing is left.

- [ ] **Step 1: Install DOMPurify**

```bash
npm install dompurify@^3.4.15
```

Expected: `"dompurify": "^3.4.15"` under `dependencies` in `package.json` (it ships its own types; no `@types` package).

- [ ] **Step 2: Write the failing tests**

Create `tests/renderer/lib/updateNotes.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderNotes } from '@/lib/updateNotes'

describe('renderNotes', () => {
  it('keeps the formatting tags GitHub release bodies use', () => {
    const html = '<h2>Changes</h2><ul><li>Added <strong>x</strong> and <code>y</code></li></ul><p>Done</p>'
    expect(renderNotes(html)).toBe(html)
  })

  it('strips scripts, images, styles and event handlers', () => {
    const out = renderNotes(
      '<p onclick="alert(1)">Hi</p><script>alert(1)</script><img src="x" onerror="alert(1)"><style>p{}</style>'
    )
    expect(out).toBe('<p>Hi</p>')
  })

  it('opens links in a new window so the main process sends them to the browser', () => {
    expect(renderNotes('<a href="https://example.com/x">x</a>')).toBe(
      '<a href="https://example.com/x" target="_blank" rel="noreferrer">x</a>'
    )
  })

  it('returns null for null or empty input', () => {
    expect(renderNotes(null)).toBeNull()
    expect(renderNotes('')).toBeNull()
    expect(renderNotes('  <script>x</script> ')).toBeNull()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib/updateNotes.test.ts`

Expected: FAIL — `Failed to resolve import "@/lib/updateNotes"`.

- [ ] **Step 4: Implement**

Create `src/renderer/src/lib/updateNotes.ts`:

```ts
import DOMPurify from 'dompurify'

/** What a GitHub release body needs; anything else (scripts, images, styles, handlers) is dropped. */
const ALLOWED_TAGS = [
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'a',
  'strong',
  'em',
  'b',
  'i',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote'
]
const ALLOWED_ATTR = ['href']

// Links open a new window, which the main process's setWindowOpenHandler sends to the browser.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noreferrer')
  }
})

/** Sanitized HTML for the update dialog, or null when there is nothing worth showing. */
export function renderNotes(html: string | null): string | null {
  if (html === null) return null
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
  return clean.trim() === '' ? null : clean
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib/updateNotes.test.ts`

Expected: `Tests  4 passed (4)`. If the attribute order in the link test differs (`rel` before `target`), swap the expected string to match DOMPurify's output — the assertion is about both attributes being present with those values.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck:web && npm run lint`

Expected: silent.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/renderer/src/lib/updateNotes.ts tests/renderer/lib/updateNotes.test.ts
git commit -m "feat(ui): sanitizer for release notes"
```

---

### Task 4: `UpdatePill` and the sidebar footer (TDD)

**Files:**
- Create: `src/renderer/src/components/UpdatePill.tsx`
- Test: `tests/renderer/components/UpdatePill.test.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `UpdateState` (Task 1).
- Produces (used by Task 6): `UpdatePill({ state, onOpen })`; `Sidebar` gains props `update: UpdateState`, `version: string | null`, `onOpenUpdate: () => void`.

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/components/UpdatePill.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UpdatePill } from '@/components/UpdatePill'
import type { UpdateState } from '@shared/types'

afterEach(cleanup)

const available: UpdateState = { status: 'available', version: '0.11.0', notes: null }

describe('UpdatePill', () => {
  it('renders nothing when idle or errored', () => {
    const { container } = render(<UpdatePill state={{ status: 'idle' }} onOpen={() => undefined} />)
    expect(container.innerHTML).toBe('')
    cleanup()
    const errored = render(
      <UpdatePill state={{ status: 'error', message: 'x' }} onOpen={() => undefined} />
    )
    expect(errored.container.innerHTML).toBe('')
  })

  it('offers the update when available or ready', () => {
    render(<UpdatePill state={available} onOpen={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Update to 0.11.0' })).toBeTruthy()
    cleanup()
    render(<UpdatePill state={{ ...available, status: 'ready' }} onOpen={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Update to 0.11.0' })).toBeTruthy()
  })

  it('shows the percentage while downloading', () => {
    render(
      <UpdatePill state={{ ...available, status: 'downloading', percent: 42 }} onOpen={() => undefined} />
    )
    expect(screen.getByRole('button', { name: 'Downloading 42%' })).toBeTruthy()
  })

  it('opens the dialog on click', () => {
    const onOpen = vi.fn()
    render(<UpdatePill state={available} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
```

(The repo has no jest-dom matchers, hence the plain `toBeTruthy()` / `innerHTML` assertions.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/components/UpdatePill.test.tsx`

Expected: FAIL — `Failed to resolve import "@/components/UpdatePill"`.

- [ ] **Step 3: Implement the pill**

Create `src/renderer/src/components/UpdatePill.tsx`:

```tsx
import { CircleArrowUp } from 'lucide-react'
import type { UpdateState } from '@shared/types'

interface UpdatePillProps {
  state: UpdateState
  onOpen: () => void
}

function label(state: UpdateState): string | null {
  switch (state.status) {
    case 'available':
    case 'ready':
      return `Update to ${state.version}`
    case 'downloading':
      return `Downloading ${state.percent}%`
    default:
      return null
  }
}

/** Sidebar button shown while an update is known; the dialog does the rest. */
export function UpdatePill({ state, onOpen }: UpdatePillProps): React.JSX.Element | null {
  const text = label(state)
  if (text === null) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
    >
      <CircleArrowUp className="size-4" />
      {text}
    </button>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/components/UpdatePill.test.tsx`

Expected: `Tests  4 passed (4)`.

- [ ] **Step 5: Sidebar footer**

In `src/renderer/src/components/Sidebar.tsx`:

Add `import { UpdatePill } from '@/components/UpdatePill'` and `import type { UpdateState } from '@shared/types'` after the existing imports.

Props:

```tsx
interface SidebarProps {
  current: Screen
  onNavigate: (screen: Screen) => void
  hasLeague: boolean
  update: UpdateState
  version: string | null
  onOpenUpdate: () => void
}
```

Signature: `export function Sidebar({ current, onNavigate, hasLeague, update, version, onOpenUpdate }: SidebarProps): React.JSX.Element {`

Inside the `<nav>`, after the `{items.map(...)}` block and before `</nav>`, add:

```tsx
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <UpdatePill state={update} onOpen={onOpenUpdate} />
        {version !== null && (
          <div className="px-2 text-xs text-sidebar-foreground/50">v{version}</div>
        )}
      </div>
```

- [ ] **Step 6: Typecheck (expect one known failure) and lint**

Run: `npm run typecheck:web 2>&1 | grep -E "error TS" | head`

Expected: exactly one error, in `src/renderer/src/App.tsx` (`Sidebar` now requires `update`, `version`, `onOpenUpdate`). Task 6 fixes it.

Run: `npm run lint` → silent. `npx prettier --check src/renderer/src/components/UpdatePill.tsx src/renderer/src/components/Sidebar.tsx tests/renderer/components/UpdatePill.test.tsx` → all formatted.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/UpdatePill.tsx src/renderer/src/components/Sidebar.tsx tests/renderer/components/UpdatePill.test.tsx
git commit -m "feat(ui): update pill in the sidebar footer"
```

---

### Task 5: Dialog primitive and `UpdateDialog` (TDD)

**Files:**
- Create: `src/renderer/src/components/ui/dialog.tsx`
- Create: `src/renderer/src/components/UpdateDialog.tsx`
- Test: `tests/renderer/components/UpdateDialog.test.tsx`

**Interfaces:**
- Consumes: `renderNotes` (Task 3), `api.update.install` (Task 2), `UpdateState`, `Button` from `@/components/ui/button`.
- Produces (used by Task 6): `UpdateDialog({ state, currentVersion, open, onOpenChange })`.

- [ ] **Step 1: shadcn Dialog primitive**

Create `src/renderer/src/components/ui/dialog.tsx` (hand-written from the shadcn "new-york" template on the `radix-ui` umbrella package the repo already uses; no animation classes because `tw-animate-css` is not installed):

```tsx
import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn('fixed inset-0 z-50 bg-black/50', className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg sm:max-w-lg',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle
}
```

(`components/ui/**` has the ESLint override, so no explicit return types are needed here.)

- [ ] **Step 2: Write the failing tests**

Create `tests/renderer/components/UpdateDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UpdateDialog } from '@/components/UpdateDialog'
import { api } from '@/lib/api'
import type { UpdateState } from '@shared/types'

vi.mock('@/lib/api', () => ({ api: { update: { install: vi.fn() } } }))
const installMock = vi.mocked(api.update.install)

const ready: UpdateState = { status: 'ready', version: '0.11.0', notes: '<p>Big <strong>news</strong></p>' }

function renderDialog(state: UpdateState, onOpenChange = vi.fn()): ReturnType<typeof vi.fn> {
  render(<UpdateDialog state={state} currentVersion="0.10.2" open onOpenChange={onOpenChange} />)
  return onOpenChange
}

beforeEach(() => {
  installMock.mockReset()
  installMock.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('UpdateDialog', () => {
  it('shows versions and the sanitized notes', () => {
    renderDialog(ready)
    expect(screen.getByRole('heading', { name: 'Update to 0.11.0' })).toBeTruthy()
    expect(screen.getByText("You're on 0.10.2")).toBeTruthy()
    expect(screen.getByText('news').tagName).toBe('STRONG')
  })

  it('falls back when there are no notes', () => {
    renderDialog({ ...ready, notes: null })
    expect(screen.getByText('No release notes for this version.')).toBeTruthy()
  })

  it('disables the install button and shows progress while downloading', () => {
    renderDialog({ ...ready, status: 'downloading', percent: 42 })
    expect(screen.getByText('Downloading 42%')).toBeTruthy()
    expect(screen.getByTestId('update-progress').style.width).toBe('42%')
    expect((screen.getByRole('button', { name: 'Update & restart' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('installs once when ready and reports restarting', () => {
    renderDialog(ready)
    const button = screen.getByRole('button', { name: 'Update & restart' })
    fireEvent.click(button)
    expect(installMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Restarting…' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Restarting…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Later closes the dialog', () => {
    const onOpenChange = renderDialog(ready)
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders nothing when there is no update', () => {
    const { container } = render(
      <UpdateDialog state={{ status: 'idle' }} currentVersion="0.10.2" open onOpenChange={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
    expect(document.body.textContent).toBe('')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/components/UpdateDialog.test.tsx`

Expected: FAIL — `Failed to resolve import "@/components/UpdateDialog"`.

- [ ] **Step 4: Implement the dialog**

Create `src/renderer/src/components/UpdateDialog.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { renderNotes } from '@/lib/updateNotes'
import type { UpdateState } from '@shared/types'

interface UpdateDialogProps {
  state: UpdateState
  currentVersion: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The update popup: release notes, download progress, Update & restart / Later. */
export function UpdateDialog({
  state,
  currentVersion,
  open,
  onOpenChange
}: UpdateDialogProps): React.JSX.Element | null {
  const [installing, setInstalling] = useState(false)
  if (state.status === 'idle' || state.status === 'error') return null

  const notes = renderNotes(state.notes)
  const ready = state.status === 'ready'
  const percent = state.status === 'downloading' ? state.percent : ready ? 100 : 0
  const install = (): void => {
    setInstalling(true)
    void api.update.install().catch(() => setInstalling(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update to {state.version}</DialogTitle>
          <DialogDescription>You&apos;re on {currentVersion}</DialogDescription>
        </DialogHeader>
        {notes === null ? (
          <p className="text-sm text-muted-foreground">No release notes for this version.</p>
        ) : (
          <div
            className="max-h-[50vh] overflow-auto text-sm [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2"
            dangerouslySetInnerHTML={{ __html: notes }}
          />
        )}
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
            <div
              data-testid="update-progress"
              className="h-full bg-emerald-500 transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          {!ready && <p className="text-xs text-muted-foreground">Downloading {percent}%</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Later
          </Button>
          <Button disabled={!ready || installing} onClick={install}>
            {installing ? 'Restarting…' : 'Update & restart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/components/UpdateDialog.test.tsx`

Expected: `Tests  6 passed (6)`. Radix renders the content into `document.body` through a portal, which is why the queries use `screen`. If Radix logs a warning about a missing `Description`, the `DialogDescription` is not rendered — check the header markup.

- [ ] **Step 6: Typecheck (still the one App.tsx error from Task 4) and lint**

Run: `npm run typecheck:web 2>&1 | grep -E "error TS" | head` → exactly the `App.tsx` `Sidebar` props error. `npm run lint` → silent. `npx prettier --check src/renderer/src/components/ui/dialog.tsx src/renderer/src/components/UpdateDialog.tsx tests/renderer/components/UpdateDialog.test.tsx` → formatted.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ui/dialog.tsx src/renderer/src/components/UpdateDialog.tsx tests/renderer/components/UpdateDialog.test.tsx
git commit -m "feat(ui): update dialog with notes and progress"
```

---

### Task 6: App wiring, docs, full verification

**Files:**
- Create: `src/renderer/src/lib/useUpdateState.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md` (§9 Phasing, Plan K line)
- Modify: `README.md` (auto-update bullet)

**Interfaces:**
- Consumes: `api.update.*`, `api.app.version` (Task 2); `Sidebar` props (Task 4); `UpdateDialog` (Task 5).
- Produces: `useUpdateState(): UpdateState`.

- [ ] **Step 1: The hook**

Create `src/renderer/src/lib/useUpdateState.ts`:

```ts
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { UpdateState } from '@shared/types'

/** Mirrors the main process's update state: initial fetch + change events. */
export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    let received = false
    // Subscribe first so nothing is missed while the initial fetch is in flight.
    const unsubscribe = api.update.onChange((next) => {
      received = true
      setState(next)
    })
    void api.update
      .state()
      .then((initial) => {
        if (!received) setState(initial)
      })
      .catch(() => undefined)
    return unsubscribe
  }, [])
  return state
}
```

- [ ] **Step 2: Wire `App.tsx`**

Imports — add:

```ts
import { UpdateDialog } from '@/components/UpdateDialog'
import { useUpdateState } from '@/lib/useUpdateState'
```

State — after `const bumpData = useCallback(...)`:

```ts
  const update = useUpdateState()
  const [version, setVersion] = useState<string | null>(null)
  const [updateOpen, setUpdateOpen] = useState(false)

  useEffect(() => {
    void api.app
      .version()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])

  useEffect(() => {
    if (update.status === 'idle' || update.status === 'error') setUpdateOpen(false)
  }, [update.status])
```

Render — the `Sidebar` line becomes:

```tsx
        <Sidebar
          current={screen}
          onNavigate={setScreen}
          hasLeague={hasLeague}
          update={update}
          version={version}
          onOpenUpdate={() => setUpdateOpen(true)}
        />
```

and just before `<StatusBar .../>`:

```tsx
      <UpdateDialog
        state={update}
        currentVersion={version ?? '?'}
        open={updateOpen}
        onOpenChange={setUpdateOpen}
      />
```

- [ ] **Step 3: Docs**

In `docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md` §9 Phasing, the line

```
- **Plan K** — League screen power ranking + sort toggle (§5.2), the Opponent section (§5.1 item 5) → `v0.11.0`.
```

becomes

```
- **In-app update UX** (own spec: `2026-09-21-in-app-update-ux-design.md`, plan: `2026-09-21-plan-in-app-update-ux.md`) — sidebar Update button, custom popup, silent install → `v0.11.0`.
- **Plan K** — League screen power ranking + sort toggle (§5.2), the Opponent section (§5.1 item 5) → `v0.12.0`.
```

In `README.md`, the bullet starting `- Auto-update: packaged Windows builds check GitHub Releases once at launch and offer **Restart now / Later**` becomes:

```
- Auto-update: packaged Windows builds check GitHub Releases at launch and hourly. A green **Update to X.Y.Z** button appears at the bottom of the sidebar once a newer version is found; it opens a popup with the release notes and **Update & restart** (silent install, relaunch). Installs ≤ 0.10.0 have no updater — reinstall once from the latest release. Windows **Smart App Control** blocks the unsigned installer; it has to be off (code signing is the proper fix, not done yet).
```

- [ ] **Step 4: Full verification**

Run: `npm run typecheck && npm run lint && npm test 2>&1 | grep -E "Test Files|Tests " && npm run build 2>&1 | grep -E "error|built in" | tail -2`

Expected: typecheck and lint silent; `Test Files  57 passed (57)`, `Tests  398 passed (398)` (384 after Task 2 + 4 notes + 4 pill + 6 dialog); build succeeds.

- [ ] **Step 5: Dev smoke**

Run the dev app the way this repo's notes say (`npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu`; record the PID and stop it by PID, never `pkill -f`). Expected: the sidebar shows `v0.11.0`-to-be (`v0.10.2` until the bump) at the bottom and **no** update pill (dev → `idle`). Stop the app.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/lib/useUpdateState.ts src/renderer/src/App.tsx docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md README.md
git commit -m "feat(ui): wire in-app update flow"
```

---

### Task 7: Release `v0.11.0`

Run by the user with Claude driving the commands. The installed 0.10.2 still carries the *old* flow (native dialog → NSIS wizard), so this release is delivered through it; the new pill/popup/silent install is first exercised by the next release (Plan K's `v0.12.0`, or a throwaway `v0.11.1` if the user wants to see it sooner).

- [ ] **Step 1: Bump, tag, push**

```bash
git status --short          # must be empty
npm version minor           # → 0.11.0: commit "build: bump version to 0.11.0" + tag v0.11.0
git push --follow-tags
```

If no `Release` run appears within ~20 s (`gh run list --workflow=release.yml --limit 1`), re-push the tag alone: `git push origin :refs/tags/v0.11.0 && git push origin v0.11.0`.

- [ ] **Step 2: Watch the run and check the draft**

```bash
gh run watch --exit-status $(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh api repos/Puffinnois/fantasy-football-companion/releases -q '.[] | "\(.tag_name) draft=\(.draft) assets=\([.assets[].name] | join(","))"'
```

Expected: the run succeeds; `v0.11.0 draft=true assets=FantasyCompanion-Setup-0.11.0.exe,FantasyCompanion-Setup-0.11.0.exe.blockmap,latest.yml` and no duplicate `v0.11.0` entry.

- [ ] **Step 3: Publish (user)**

```bash
gh release edit v0.11.0 --draft=false --notes "In-app updates: a green Update button in the sidebar, release notes in a popup, silent install and relaunch. Sidebar shows the current version."
```

Verify: `curl -sL https://github.com/Puffinnois/fantasy-football-companion/releases/download/v0.11.0/latest.yml | head -1` prints `version: 0.11.0`.

- [ ] **Step 4: Observe on Windows**

Launch the installed 0.10.2: old **Update ready** dialog → **Restart now** → NSIS wizard (Smart App Control is off) → app relaunches. Expected: sidebar footer shows `v0.11.0`, no pill (nothing newer). Windows *Installed apps* shows 0.11.0.

- [ ] **Step 5: Close out**

Tick this plan, add progress notes at the end, update the project-status memory (auto-update UX shipped in `v0.11.0`; Plan K → `v0.12.0` next; the new flow is verified at the next release).
