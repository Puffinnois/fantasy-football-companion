# Auto-update via GitHub Releases — Design

**Status:** approved by the user on 2026-09-21 (approach and sections 1–3 reviewed one by one).
**Builds on:** the existing electron-builder NSIS target (`FantasyCompanion-Setup-<version>.exe`), the version in `package.json`, the public repo `Puffinnois/fantasy-football-companion`.
**Ships as:** `v0.10.1`, a standalone slice between Plan J (`v0.10.0`) and Plan K (`v0.11.0`).

## 1. Goal

Today every version is a new installer that each user downloads and runs by hand. After this slice a user installs once; every later version is fetched and installed by the app itself.

No server of our own: GitHub Releases hosts the three files `electron-updater` needs per version (`latest.yml`, the Setup exe, its `.blockmap`), and a GitHub Actions workflow builds and uploads them on a tag push.

### Decisions taken in brainstorming

| Question | Decision |
| --- | --- |
| Update feed | GitHub Releases on the public repo. Free, no token in the app, electron-builder publishes to it natively. |
| Where the Windows build runs | GitHub Actions on `windows-latest`, triggered by a version tag. Removes the wine dependency from the release path; local wine builds stay for testing. |
| Release gate | electron-builder creates a **draft** release; the user reviews it and clicks Publish. The updater only sees published releases. |
| Update prompt | Native dialog on `update-downloaded`: **Restart now** / **Later**. Later installs on next quit. No renderer change. |
| Check cadence | One check at launch, no periodic re-check. |
| Platforms | Updater active only in packaged Windows builds. Dev runs and the Linux AppImage never check. |

## 2. Release pipeline

### 2.1 `.github/workflows/release.yml`

- **Trigger:** `push` of tags matching `v*`.
- **Runner:** `windows-latest`. Node version from `.nvmrc` (`actions/setup-node` with `node-version-file`). `npm ci`.
- **Permissions:** `contents: write` (needed to create the release and upload assets).
- **Guard step:** compare the tag with `v` + `package.json` version; fail the job if they differ. electron-builder does not check this and would otherwise upload to a release named after `package.json`.
- **Steps, in order:** `npm test` → `npm run build` (typecheck + electron-vite build) → `npx electron-builder --win --publish never` (the `publish` block still makes it write `latest.yml`) → check the three files exist → `gh release create --draft` uploads them with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. electron-builder's own GitHub publisher is not used: in CI it raced two publisher instances and exited before the exe upload finished.
- **Result:** a draft release tagged `vX.Y.Z` holding `FantasyCompanion-Setup-X.Y.Z.exe`, `FantasyCompanion-Setup-X.Y.Z.exe.blockmap`, `latest.yml`.

### 2.2 `electron-builder.yml`

```yaml
publish:
  provider: github
  owner: Puffinnois
  repo: fantasy-football-companion
  releaseType: draft
```

### 2.3 `package.json` scripts

`build:win` becomes `npm run build && electron-builder --win --publish never`, so a local build can never publish. `build:mac` / `build:linux` get the same flag for symmetry.

### 2.4 Out of scope

- A general CI workflow running tests on every push / PR. Useful, separate chore.
- Code signing. Unsigned NSIS installers update fine; SmartScreen still warns on the first manual install only.

## 3. In-app updater

### 3.1 `src/main/updater.ts`

```ts
/** The slice of electron-updater's `autoUpdater` the module uses; the real object is structurally assignable. */
export interface UpdaterLike {
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
}

/** The slice of Electron's `dialog` the module uses. */
export interface DialogLike {
  showMessageBox(options: MessageBoxOptions): Promise<{ response: number }>
  showMessageBox(window: BrowserWindow, options: MessageBoxOptions): Promise<{ response: number }>
}

export interface UpdaterDeps {
  enabled: boolean                         // app.isPackaged && process.platform === 'win32'
  updater: UpdaterLike
  dialog: DialogLike
  getWindow: () => BrowserWindow | null
  log?: (message: string, err: unknown) => void   // defaults to console.error
}

export function installAutoUpdater(deps: UpdaterDeps): void
```

Behaviour:

1. If `!enabled`, return without touching `updater`.
2. Register `updater.on('error', …)` → `log('auto-update failed', err)`. Never surfaces to the user.
3. Register `updater.on('update-downloaded', info)` → `dialog.showMessageBox(window, { type: 'info', title: 'Update ready', message: 'FantasyCompanion <version> is ready to install.', detail: 'Restart now to update, or it will install the next time you quit.', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1 })` — the one-argument form when there is no window. Response `0` → `updater.quitAndInstall()`. Otherwise nothing; electron-updater's default `autoInstallOnAppQuit` installs at the next quit.
4. `updater.checkForUpdates().catch((err) => log('auto-update check failed', err))`. Fire and forget. `autoDownload` stays at its default (`true`), so the delta downloads in the background.

Dependencies are injected so the module is tested without Electron. `src/main/index.ts` calls it once, after `createWindow()`, passing `autoUpdater` from `electron-updater`, Electron's `dialog`, and `() => mainWindow`.

### 3.2 Dependency

`electron-updater` in `dependencies` (not `devDependencies`): electron-vite externalizes main-process packages, so it must be present in the packaged `node_modules`.

### 3.3 Error handling

Every failure — offline, GitHub unreachable, no published release yet, API rate limit, corrupt download — is logged and otherwise silent. The app must behave exactly as today when the update check cannot complete.

## 4. Release ritual, versioning, docs

### 4.1 Ritual

```
npm version minor        # or patch / major: bumps package.json + lock, commits, tags vX.Y.Z
git push --follow-tags   # Action runs (~5 min) → draft release
```

Then add notes and press Publish on GitHub. `.npmrc` gets `message = "build: bump version to %s"` so the commit reads `build: bump version to 0.11.0`, the same convention as the existing bump commits, which touch the same two files.

### 4.2 Versioning

This slice ships as `v0.10.1`. Plan K keeps `v0.11.0`. Installs ≤ `0.10.0` have no updater and must be reinstalled once from the `v0.10.1` release; every later version arrives automatically.

### 4.3 Docs

- README build section: keep `build:win` as the local testing path (wine note unchanged); add the release ritual, the draft → Publish step, and the "reinstall once" note.
- `docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md` §9 (phasing): add one line noting the auto-update slice between J and K so plan letters and versions stay consistent.

## 5. Testing

### 5.1 Unit — `tests/main/updater.test.ts` (vitest)

Fake `updater` (records `on` handlers, `checkForUpdates` returns a controllable promise, `quitAndInstall` is a spy) and fake `dialog.showMessageBox` returning a chosen `response`.

| Case | Expectation |
| --- | --- |
| `enabled: false` | `checkForUpdates` not called, no handlers registered |
| `enabled: true` | `checkForUpdates` called once; `error` and `update-downloaded` handlers registered |
| `update-downloaded`, dialog answers `0` | `quitAndInstall` called; dialog message contains the version |
| `update-downloaded`, dialog answers `1` | `quitAndInstall` not called |
| `error` event | `log` called, nothing thrown |
| `checkForUpdates` rejects | `log` called, nothing thrown (unhandled-rejection free) |

### 5.2 End-to-end (manual, the real proof)

1. Push tag `v0.10.1`; confirm the Action succeeds and the draft holds the three files; publish it.
2. Install `FantasyCompanion-Setup-0.10.1.exe` on Windows.
3. Make a README-only change, `npm version patch` → `v0.10.2`, push, publish the draft.
4. Launch the installed app: the **Update ready** dialog appears; **Restart now** → the app relaunches as 0.10.2.

Without step 3–4 the first real test of the loop would be Plan K's release.

## 6. Files

```
.github/workflows/release.yml            new
electron-builder.yml                     publish block
package.json                             electron-updater dep; --publish never on build:* scripts
.npmrc                                   new: version commit message template
src/main/updater.ts                      new
src/main/index.ts                        call installAutoUpdater after createWindow()
tests/main/updater.test.ts               new
README.md                                release ritual, reinstall-once note
docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md   one roadmap line
```
