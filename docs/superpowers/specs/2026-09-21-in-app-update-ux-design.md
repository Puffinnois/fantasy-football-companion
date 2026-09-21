# In-app update UX — Design

**Status:** approved by the user on 2026-09-21 (approach and sections 1–3 reviewed one by one).
**Builds on:** the auto-update slice (`2026-09-21-auto-update-design.md`, shipped in `v0.10.1`/`v0.10.2`): GitHub Releases feed, `Release` workflow, `electron-updater` wired through `src/main/updater.ts`, one check at launch, native **Restart now / Later** dialog.
**Ships as:** `v0.11.0`. Plan K moves to `v0.12.0`.

## 1. Goal

Replace the native update dialog and the NSIS wizard with the flow users know from Discord and similar apps:

1. When a newer version is found, an **Update** button appears in the app (bottom of the sidebar) and the download starts in the background.
2. Clicking it opens **our own popup**: version, release notes from the GitHub release, download progress, **Update & restart** / **Later**.
3. **Update & restart** installs silently and relaunches the app on the new version — no installer window.

Out of scope, recorded for later: code signing (Windows Smart App Control hard-blocks unsigned binaries; the user turned SAC off on their PC on 2026-09-21 and parked signing because every route costs money or an application). A manual "Check for updates" action.

### Decisions taken in brainstorming

| Question | Decision |
| --- | --- |
| Button placement | Bottom of the sidebar, pinned under the nav; a small `vX.Y.Z` label sits there permanently. |
| Popup content | Release notes from the GitHub release, rendered (sanitized HTML), plus progress and buttons. |
| Architecture | Main process owns one `UpdateState`; the renderer only renders it (approach A). |
| Check cadence | At launch and every hour while the app is open. |
| Install | `quitAndInstall(true, true)`: silent, auto-relaunch. `autoInstallOnAppQuit` stays on. |
| Errors | Recorded in the state, `console.error`-logged, never surfaced as UI. |

## 2. Main process

### 2.1 State

In `src/shared/types.ts`:

```ts
export type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string; notes: string | null }
  | { status: 'downloading'; version: string; notes: string | null; percent: number }
  | { status: 'ready'; version: string; notes: string | null }
  | { status: 'error'; message: string }
```

`notes` is the release body electron-updater's GitHub provider delivers as HTML in `UpdateInfo.releaseNotes` (GitHub renders the markdown of the release), or `null` when it is empty / not a string. `percent` is `ProgressInfo.percent` rounded to an integer.

### 2.2 `src/main/updater.ts` (rewrite)

```ts
export interface UpdaterLike {
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'update-available', listener: (info: { version: string; releaseNotes?: unknown }) => void): unknown
  on(event: 'download-progress', listener: (info: { percent: number }) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string; releaseNotes?: unknown }) => void): unknown
}

export interface UpdaterDeps {
  enabled: boolean                                   // app.isPackaged && process.platform === 'win32'
  updater: UpdaterLike
  onChange: (state: UpdateState) => void             // index.ts forwards to the window
  checkIntervalMs?: number                           // default 60 * 60 * 1000
  log?: (message: string, err: unknown) => void      // default console.error
}

export interface UpdateController {
  state(): UpdateState
  install(): void
}

export function installAutoUpdater(deps: UpdaterDeps): UpdateController
```

Behaviour:

- `!enabled` → returns a controller whose `state()` is `{ status: 'idle' }` forever and whose `install()` is a no-op; nothing is registered, no timer.
- Event → state: `update-available` → `available`; `download-progress` → `downloading` (keeps `version`/`notes`); `update-downloaded` → `ready`; `error` → `error` + log. Every transition calls `onChange` with the new state. A state is never pushed twice in a row if identical (progress events with the same rounded percent are dropped).
- `checkForUpdates()` at install time and every `checkIntervalMs`; rejections are logged. The timer is `unref()`'d so it never keeps the process alive.
- `install()` → `updater.quitAndInstall(true, true)` only when `state().status === 'ready'`; otherwise a no-op.
- No dialog dependency any more.

### 2.3 IPC

`src/shared/ipc.ts` adds `updateState: 'update:state'`, `updateInstall: 'update:install'`, `updateChanged: 'update:changed'`, `appVersion: 'app:version'`.

`src/main/ipc/handlers.ts`: `AppContext` gains `update: UpdateController`; handlers `update:state` → `ctx.update.state()`, `update:install` → `ctx.update.install()`, `app:version` → `app.getVersion()`.

`src/main/index.ts`: `installAutoUpdater({ enabled, updater: autoUpdater, onChange: (state) => mainWindow?.webContents.send(IPC.updateChanged, state) })` before `registerIpcHandlers(ctx)` so the controller is in `ctx`. A state change that happens before the window exists is simply not sent; the renderer's initial `update.state()` call covers it.

`src/preload/index.ts` (+ `.d.ts`): `api.update.state(): Promise<UpdateState>`, `api.update.install(): Promise<void>`, `api.update.onChange(listener): () => void` (same shape as `sync.onProgress`), `api.app.version(): Promise<string>`.

## 3. Renderer

### 3.1 Hook — `src/renderer/src/lib/useUpdateState.ts`

`useUpdateState(): UpdateState` — `useState({ status: 'idle' })`, on mount `api.update.state().then(set)` and `api.update.onChange(set)` (unsubscribe on unmount). One instance in `App.tsx`; the state and a `openUpdate` callback flow down as props.

### 3.2 Sidebar footer — `src/renderer/src/components/Sidebar.tsx`

A footer block with `mt-auto` under the nav items:

- `UpdatePill` (new component, `components/UpdatePill.tsx`): rendered when `status` is `available`, `downloading` or `ready`. A full-width green button (`bg-emerald-600 hover:bg-emerald-500`, white text, `ArrowUpCircle` icon from lucide): label `Update to {version}`; while `downloading`, `Downloading {percent}%`. Always clickable → `onOpen()`.
- Version label: `v{version}` (`api.app.version()`, fetched once in `App.tsx` and passed to both the Sidebar and the dialog), muted (`text-xs text-sidebar-foreground/50`), always rendered.

### 3.3 Popup — `src/renderer/src/components/UpdateDialog.tsx`

Built on shadcn `Dialog` (`components/ui/dialog.tsx`, added with the shadcn CLI; the repo pins `cn` to `@/lib/utils` and has the ESLint override for generated ui files). Props: `state: UpdateState`, `currentVersion: string`, `open`, `onOpenChange`.

- Header: title `Update to {version}`, description `You're on {currentVersion}`.
- Body: `renderNotes(state.notes)` (below) set with `dangerouslySetInnerHTML` inside a `prose`-like scroll area (max height ~50vh); when `null`, the text `No release notes for this version.`
- Footer:
  - `downloading`: progress bar (`<div>` track + emerald fill at `percent%`) with `Downloading {percent}%`; primary button disabled.
  - `available` (download not started yet): same bar at 0 %, primary disabled.
  - `ready`: primary **Update & restart** → `api.update.install()`; the button becomes `Restarting…` and disabled.
  - Secondary **Later** on every status → closes the dialog. The pill stays.
- If the state goes to `idle` / `error` while open (should not happen in practice), the dialog closes.

### 3.4 Notes sanitizer — `src/renderer/src/lib/updateNotes.ts`

`renderNotes(html: string | null): string | null` using **DOMPurify** (`dompurify` dependency): `ALLOWED_TAGS = ['p','br','ul','ol','li','a','strong','em','b','i','code','pre','h1','h2','h3','h4','blockquote']`, `ALLOWED_ATTR = ['href']`; an `afterSanitizeAttributes` hook sets `target="_blank"` and `rel="noreferrer"` on every `<a>` so clicks go through the existing `setWindowOpenHandler` → default browser. Returns `null` when the input is `null` or sanitizes to whitespace.

## 4. Testing

- `tests/main/updater.test.ts` (rewrite): fake `UpdaterLike` that records listeners; cases — disabled → idle, no check, no listeners; enabled → immediate check + listeners; `update-available` → `available` with notes (string) / `null` (non-string); `download-progress` 41.6 → `downloading` 42, identical rounded percent not re-emitted; `update-downloaded` → `ready`; `error` → `error` + log; `install()` on `ready` → `quitAndInstall(true, true)`, on other states → not called; `checkForUpdates` rejection logged; hourly re-check with `vi.useFakeTimers()`.
- `tests/renderer/lib/updateNotes.test.ts`: keeps allowed tags, strips `script`/`img`/`style`/event handlers, forces `target`/`rel` on links, `null` for `null`/empty.
- `tests/renderer/components/UpdatePill.test.tsx`: hidden on `idle`/`error`; `Update to 0.11.0` on `available`/`ready`; `Downloading 42%` on `downloading`; click → `onOpen`.
- `tests/renderer/components/UpdateDialog.test.tsx` (`vi.mock('@/lib/api')`): primary disabled while downloading with the bar at the right width; `ready` → click calls `api.update.install()` once and shows `Restarting…`; Later → `onOpenChange(false)`; notes rendered / fallback text.
- Manual end to end: publish `v0.11.0`; the installed 0.10.2 still runs the old flow (native dialog → wizard) and lands on 0.11.0. The new pill/popup/silent install is first exercised by the next release (Plan K's `v0.12.0`, or a throwaway `v0.11.1`).

## 5. Files

```
src/shared/types.ts                          UpdateState
src/shared/ipc.ts                            update:state / update:install / update:changed / app:version
src/main/updater.ts                          state machine (rewrite), hourly check, install()
src/main/ipc/handlers.ts                     AppContext.update; update.* and app.version handlers
src/main/index.ts                            installAutoUpdater → ctx.update; onChange → webContents.send
src/preload/index.ts, src/preload/index.d.ts api.update.*, api.app.version
src/renderer/src/lib/useUpdateState.ts       hook
src/renderer/src/lib/updateNotes.ts          renderNotes (DOMPurify)
src/renderer/src/components/ui/dialog.tsx    shadcn Dialog
src/renderer/src/components/UpdatePill.tsx   sidebar button
src/renderer/src/components/UpdateDialog.tsx popup
src/renderer/src/components/Sidebar.tsx      footer: pill + version label
src/renderer/src/App.tsx                     hook, dialog mount, open state
docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md   Plan K → v0.12.0
package.json                                 dompurify (ships its own types), radix dialog via shadcn
```
