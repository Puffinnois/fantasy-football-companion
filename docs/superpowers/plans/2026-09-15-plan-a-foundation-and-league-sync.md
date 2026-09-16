# Plan A — App Foundation & Sleeper League Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable Windows desktop app that imports a Sleeper league (teams, rosters, player database) into a local SQLite store and shows it, with a refresh/status bar.

**Architecture:** Electron with a strict split — the main process owns SQLite (`node:sqlite`), the Sleeper HTTP client and sync orchestration, exposed to a React renderer through a small typed IPC API. Core modules (`sources/`, `db/`, `sync/`) have no Electron imports and are tested headlessly with Vitest.

**Tech Stack:** Electron 39 (Node 22 built-in), electron-vite 5, React 19, TypeScript 5 (strict), Tailwind CSS 4, shadcn/ui, lucide-react, `node:sqlite`, Vitest, electron-builder 26 (NSIS).

**Spec:** `docs/superpowers/specs/2026-09-15-slice1-league-sync-stats-pipeline-design.md` (this plan covers spec milestones 1–3 plus the status bar). Plan B covers rules + scoring; Plan C covers the nflverse stats pipeline and the Players screen.

## Global Constraints

- Node **≥ 22.13** in WSL (for `node:sqlite` under Vitest); pinned in `.nvmrc`. Electron **≥ 35**.
- Storage is Node's built-in `node:sqlite` (`DatabaseSync`). **No native modules** in `dependencies`.
- `contextIsolation: true`, `nodeIntegration: false`; the renderer never touches SQLite or the network.
- All Sleeper calls go through `src/main/sources/sleeper.ts`; base URL `https://api.sleeper.app/v1`; 30 s timeout; retry once on 429/5xx; never retry other 4xx.
- Freshness windows: `sleeper:state` 10 min, `sleeper:league` 10 min, `sleeper:players` 24 h.
- Every sync step writes a `sync_log` row (`running` → `ok` | `error` | `skipped`). Sources are independent; one failing never blocks another.
- The Windows deliverable is `dist/FantasyCompanion-Setup-<version>.exe`, produced by `npm run build:win` from WSL. Data lives in `%APPDATA%\FantasyCompanion\companion.db`.
- Dark theme only. Position colours are the `--pos-*` tokens in `main.css`.
- Git: `main` branch, Conventional Commits, atomic commits, no AI trailers in the body except the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` line required by the environment.
- `node:sqlite` binds only `null | number | bigint | string | Uint8Array`. Convert booleans to `0/1` and never pass `undefined`.
- UI tasks (2, 10, 11, 12): the code given is the functional baseline. After it typechecks and the human check passes, the implementer may load the `frontend-design` skill to refine spacing, hierarchy and colour — without changing component names, props or IPC usage.

## File map

```
.nvmrc                                   Node version pin ("22")
package.json                             scripts: dev, build, build:win, test, typecheck, lint
electron.vite.config.ts                  aliases (@main, @shared, @), tailwind plugin, node:sqlite external
electron-builder.yml                     appId, productName, NSIS target, exclusions
vitest.config.ts                         node env, aliases, tests/**/*.test.ts
components.json                          shadcn config (Tailwind v4, aliases)
tsconfig.json / tsconfig.node.json / tsconfig.web.json   path aliases
src/shared/types.ts                      domain types shared by main + renderer
src/shared/ipc.ts                        Api interface + channel names
src/main/index.ts                        app bootstrap: DB, migrate, IPC, window, background refresh
src/main/env.d.ts                        vite/client types for ?raw / ?asset imports
src/main/db/connection.ts                openDatabase, withTransaction
src/main/db/migrate.ts                   migration runner (schema_version)
src/main/db/migrations/001_initial.sql   slice-1 tables
src/main/db/migrations/index.ts          ordered migration list
src/main/db/repos/{settings,state,syncLog,leagues,teams,players}.ts
src/main/sources/sleeper-types.ts        raw Sleeper JSON shapes
src/main/sources/sleeper.ts              SleeperClient (fetch + retry + timeout)
src/main/sync/mappers.ts                 Sleeper JSON → domain records (pure)
src/main/sync/sleeperSync.ts             importLeague / refreshSleeper orchestration
src/main/ipc/handlers.ts                 ipcMain.handle registrations
src/preload/index.ts, index.d.ts         contextBridge API
src/renderer/index.html
src/renderer/src/{main.tsx,App.tsx,env.d.ts}
src/renderer/src/assets/main.css         Tailwind + dark theme tokens
src/renderer/src/lib/{utils.ts,api.ts}
src/renderer/src/components/ui/*         shadcn: button, input, card, table, badge
src/renderer/src/components/{Sidebar,StatusBar}.tsx
src/renderer/src/screens/{SetupScreen,LeagueScreen}.tsx
tests/fixtures/sleeper.ts                typed minimal fixtures
tests/main/db/{migrate,repos}.test.ts
tests/main/sources/sleeper.test.ts
tests/main/sync/{mappers,sleeperSync}.test.ts
```

---

### Task 1: Toolchain, scaffold, first commit

**Files:**
- Create: `.nvmrc`, everything the scaffolder generates, `README.md` (replace)
- Modify: `package.json`

**Interfaces:**
- Produces: a running `npm run dev` Electron window; `npm run typecheck` passes.

- [x] **Step 1: Install Node 22 and pin it**

```bash
source ~/.nvm/nvm.sh && nvm install 22 && nvm alias default 22 && node -v
```
Expected: `v22.x.y` (≥ 22.13). Then:
```bash
cd /home/yhabie/project/fantasy-football-companion && echo "22" > .nvmrc
```
Every later shell in this plan starts with `source ~/.nvm/nvm.sh && nvm use` from the project root.

- [x] **Step 2: Scaffold with electron-vite (react-ts) into the project directory**

The scaffolder refuses a non-empty directory, so scaffold beside it and copy in:
```bash
cd /home/yhabie/project && npm create @quick-start/electron@latest ffc-scaffold -- --template react-ts --skip </dev/null \
  && cp -a ffc-scaffold/. fantasy-football-companion/ && rm -rf ffc-scaffold \
  && cd fantasy-football-companion && ls
```
Expected: `README.md build docs electron-builder.yml electron.vite.config.ts eslint.config.mjs package.json resources src tsconfig.json tsconfig.node.json tsconfig.web.json` plus `.gitignore`, `.prettierrc.yaml`, `.editorconfig`, `.vscode`.

- [x] **Step 3: Fix package identity and add the test script**

Edit `package.json`: set `"name": "fantasy-football-companion"`, `"version": "0.1.0"`, `"description": "Desktop companion for Sleeper fantasy football leagues"`, `"author": "yhabie"`, delete the `"homepage"` line, and add to `"scripts"`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```
Then replace `README.md` with:
```markdown
# Fantasy Football Companion

Windows desktop companion for a Sleeper fantasy football league: league sync, stats, and decision support.

- Design: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- Dev (WSL2, Node 22 via nvm): `npm install && npm run dev`
- Windows installer: `npm run build:win` → `dist/FantasyCompanion-Setup-<version>.exe`
- Tests: `npm test`
```

- [x] **Step 4: Install and smoke-test the dev window**

```bash
source ~/.nvm/nvm.sh && nvm use && npm install 2>&1 | tail -3
```
Expected: `added N packages` with no `ERR!`. Then:
```bash
LOG=/tmp/claude-1000/-home-yhabie-project-fantasy-football-companion/e02bcffe-e13c-490d-a0df-040a3789a0e6/scratchpad/dev.log; \
timeout 25 npm run dev > "$LOG" 2>&1; grep -ciE "error|exception" "$LOG" || true; grep -m1 "dev server running" "$LOG"
```
Expected: the error count line prints `0` and the dev-server line appears. (Electron opens a WSLg window with the template page and is killed after 25 s — `timeout` exit 124 is fine.)

- [x] **Step 5: Typecheck and commit**

```bash
npm run typecheck && git add -A && git commit -q -m "build: scaffold electron-vite react-ts app

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && git log --oneline | head -1
```

---

### Task 2: Aliases, Tailwind, shadcn primitives, app shell

**Files:**
- Modify: `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/assets/main.css`
- Create: `components.json`, `src/renderer/src/lib/utils.ts`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/components/ui/{button,input,card,table,badge}.tsx` (via shadcn CLI)
- Delete: `src/renderer/src/assets/base.css`, `src/renderer/src/assets/electron.svg`, `src/renderer/src/assets/wavy-lines.svg`, `src/renderer/src/components/Versions.tsx`

**Interfaces:**
- Produces: `Screen` type and `Sidebar` component; `cn()` helper; theme tokens `bg-background`, `text-muted-foreground`, `bg-sidebar`, `text-pos-qb` … `text-pos-def`.

- [x] **Step 1: Install UI and test dependencies**

```bash
source ~/.nvm/nvm.sh && nvm use && npm i -D tailwindcss @tailwindcss/vite class-variance-authority clsx tailwind-merge lucide-react vitest 2>&1 | tail -2
```

- [x] **Step 2: Configure aliases and plugins**

Replace `electron.vite.config.ts`:
```ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: { ...shared, '@main': resolve('src/main') } },
    build: { rollupOptions: { external: ['node:sqlite'] } }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()]
  }
})
```

Replace `tsconfig.json` (root; the `paths` here are only for the shadcn CLI):
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/renderer/src/*"] }
  }
}
```

Replace `tsconfig.node.json`:
```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.*",
    "vitest.config.*",
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*",
    "tests/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"],
    "baseUrl": ".",
    "paths": {
      "@main/*": ["src/main/*"],
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

Replace `tsconfig.web.json`:
```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/renderer/src/env.d.ts",
    "src/renderer/src/**/*",
    "src/renderer/src/**/*.tsx",
    "src/preload/*.d.ts",
    "src/shared/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/renderer/src/*"],
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

- [x] **Step 3: Theme CSS and HTML shell**

Delete the template assets and component:
```bash
rm src/renderer/src/assets/base.css src/renderer/src/assets/electron.svg src/renderer/src/assets/wavy-lines.svg src/renderer/src/components/Versions.tsx
```

Replace `src/renderer/src/assets/main.css`:
```css
@import 'tailwindcss';
@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.5rem;
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.21 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.21 0.006 285.885);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.92 0.004 286.32);
  --primary-foreground: oklch(0.21 0.006 285.885);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: oklch(0.274 0.006 286.033);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.552 0.016 285.938);
  --sidebar: oklch(0.17 0.005 285.823);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.274 0.006 286.033);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --pos-qb: oklch(0.72 0.17 340);
  --pos-rb: oklch(0.75 0.16 160);
  --pos-wr: oklch(0.75 0.15 240);
  --pos-te: oklch(0.78 0.15 70);
  --pos-k: oklch(0.8 0.08 300);
  --pos-def: oklch(0.7 0.05 250);
}

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-pos-qb: var(--pos-qb);
  --color-pos-rb: var(--pos-rb);
  --color-pos-wr: var(--pos-wr);
  --color-pos-te: var(--pos-te);
  --color-pos-k: var(--pos-k);
  --color-pos-def: var(--pos-def);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html,
  body,
  #root {
    height: 100%;
  }
  body {
    @apply bg-background text-foreground antialiased;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  }
}
```

Replace `src/renderer/index.html`:
```html
<!doctype html>
<html class="dark">
  <head>
    <meta charset="UTF-8" />
    <title>Fantasy Companion</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://sleepercdn.com"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/renderer/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [x] **Step 4: Add shadcn primitives**

Create `components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/renderer/src/assets/main.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```
Then:
```bash
source ~/.nvm/nvm.sh && nvm use && npx shadcn@latest add button input card table badge --yes --overwrite 2>&1 | tail -8 && ls src/renderer/src/components/ui
```
Expected: `badge.tsx button.tsx card.tsx input.tsx table.tsx`. The CLI also adds `@radix-ui/react-slot` to `dependencies`. If it reports it cannot resolve the `@/` alias, the root `tsconfig.json` `paths` from Step 2 is missing — re-check it.

- [x] **Step 5: Sidebar and App shell**

Create `src/renderer/src/components/Sidebar.tsx`:
```tsx
import { BookOpen, Settings, Trophy, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Screen = 'setup' | 'league' | 'rules' | 'players'

interface SidebarProps {
  current: Screen
  onNavigate: (screen: Screen) => void
  hasLeague: boolean
}

const items: { id: Screen; label: string; icon: typeof Trophy; enabled: (hasLeague: boolean) => boolean }[] = [
  { id: 'league', label: 'League', icon: Trophy, enabled: (hasLeague) => hasLeague },
  { id: 'rules', label: 'Rules', icon: BookOpen, enabled: () => false },
  { id: 'players', label: 'Players', icon: Users, enabled: () => false },
  { id: 'setup', label: 'Setup', icon: Settings, enabled: () => true }
]

export function Sidebar({ current, onNavigate, hasLeague }: SidebarProps): React.JSX.Element {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3">
      <div className="mb-6 px-2 pt-2 text-sm font-semibold tracking-wide text-sidebar-foreground/90">
        Fantasy Companion
      </div>
      {items.map(({ id, label, icon: Icon, enabled }) => {
        const isEnabled = enabled(hasLeague)
        return (
          <button
            key={id}
            type="button"
            disabled={!isEnabled}
            onClick={() => onNavigate(id)}
            className={cn(
              'mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              current === id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              !isEnabled && 'cursor-not-allowed opacity-40 hover:bg-transparent'
            )}
          >
            <Icon className="size-4" />
            {label}
            {!isEnabled && id !== 'league' && (
              <span className="ml-auto text-[10px] uppercase text-muted-foreground">soon</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
```

Replace `src/renderer/src/App.tsx` (placeholder content; screens arrive in Tasks 10–12):
```tsx
import { useState } from 'react'
import { Sidebar, type Screen } from '@/components/Sidebar'

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('setup')
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar current={screen} onNavigate={setScreen} hasLeague={false} />
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <h1 className="text-2xl font-semibold capitalize">{screen}</h1>
          <p className="text-sm text-muted-foreground">Coming up.</p>
        </main>
      </div>
      <footer className="flex h-9 shrink-0 items-center border-t bg-sidebar px-4 text-xs text-muted-foreground">
        status bar
      </footer>
    </div>
  )
}
```

`src/renderer/src/main.tsx` stays as generated (it imports `./assets/main.css` and renders `<App />`).

- [x] **Step 6: Verify and commit** _(human check pending — see progress notes)_

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint && \
LOG=/tmp/claude-1000/-home-yhabie-project-fantasy-football-companion/e02bcffe-e13c-490d-a0df-040a3789a0e6/scratchpad/dev.log; \
timeout 25 npm run dev > "$LOG" 2>&1; grep -ciE "error|exception" "$LOG" || true
```
Expected: typecheck and lint pass; error count `0`. **Human check:** run `npm run dev` yourself — a dark window with a left sidebar ("League" greyed out, "Setup" active) and a footer bar.

```bash
git add -A && git commit -q -m "feat(ui): add tailwind theme, shadcn primitives and app shell

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Windows installer (milestone 2)

**Files:**
- Modify: `electron-builder.yml`

**Interfaces:**
- Produces: `dist/FantasyCompanion-Setup-0.1.0.exe`, verified to install and launch on Windows.

- [x] **Step 1: Builder config**

Replace `electron-builder.yml`:
```yaml
appId: com.yhabie.fantasycompanion
productName: FantasyCompanion
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!tests/*'
  - '!docs/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!vitest.config.{js,ts,mjs,cjs}'
  - '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml,.nvmrc,components.json}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
asarUnpack:
  - resources/**
win:
  executableName: FantasyCompanion
  target:
    - nsis
nsis:
  artifactName: ${productName}-Setup-${version}.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
  oneClick: false
  allowToChangeInstallationDirectory: true
linux:
  target:
    - AppImage
  category: Utility
appImage:
  artifactName: ${name}-${version}.${ext}
npmRebuild: false
```

- [~] **Step 2: Build the installer from WSL**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build:win 2>&1 | tail -15 && ls -la dist/*.exe
```
Expected: `dist/FantasyCompanion-Setup-0.1.0.exe` (~90–110 MB). First run downloads NSIS/winCodeSign helpers into `~/.cache/electron-builder`.

If the log ends with an error mentioning **wine** (used to stamp the icon/version resources), choose one:
- WSL: `sudo apt-get install -y wine64` and rerun; or
- Windows PowerShell (Node installed on Windows): `cd \\wsl$\Ubuntu\home\yhabie\project\fantasy-football-companion; npm run build:win`
Record which path worked in `README.md` under "Windows installer".

- [ ] **Step 3: Copy to the Windows Desktop and launch the installer**

```bash
WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r'); \
cp dist/FantasyCompanion-Setup-0.1.0.exe "/mnt/c/Users/$WINUSER/Desktop/" && \
powershell.exe -NoProfile -Command "Start-Process \"\$env:USERPROFILE\Desktop\FantasyCompanion-Setup-0.1.0.exe\""
```
**Human check:** the NSIS installer appears on Windows; install; the app opens from the Start Menu / Desktop shortcut with the same dark shell as Task 2. (SmartScreen may warn because the exe is unsigned — "More info → Run anyway".)

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml README.md && git commit -q -m "build: configure windows nsis installer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: SQLite connection and migrations

**Files:**
- Create: `vitest.config.ts`, `src/main/env.d.ts`, `src/main/db/connection.ts`, `src/main/db/migrate.ts`, `src/main/db/migrations/001_initial.sql`, `src/main/db/migrations/index.ts`
- Test: `tests/main/db/migrate.test.ts`

**Interfaces:**
- Produces: `type Db = DatabaseSync`; `openDatabase(path: string): Db`; `withTransaction<T>(db: Db, fn: () => T): T`; `migrate(db: Db): number` (returns schema version).

- [x] **Step 1: Vitest config and Vite types for main**

Create `vitest.config.ts`:
```ts
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
```

Create `src/main/env.d.ts`:
```ts
/// <reference types="vite/client" />
```

- [x] **Step 2: Write the failing test**

Create `tests/main/db/migrate.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'

describe('migrate', () => {
  it('creates all slice-1 tables on an empty database', () => {
    const db = openDatabase(':memory:')
    const version = migrate(db)
    const tables = (db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[]).map((r) => r.name)
    expect(version).toBe(1)
    expect(tables).toEqual(
      expect.arrayContaining([
        'app_settings', 'nfl_state', 'leagues', 'teams', 'players', 'roster_players', 'sync_log', 'schema_version'
      ])
    )
  })

  it('is idempotent', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    const row = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }
    expect(row.n).toBe(1)
  })

  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(() =>
      db.prepare("INSERT INTO teams (league_id, roster_id, display_name, updated_at) VALUES ('nope', 1, 'x', 'now')").run()
    ).toThrow(/FOREIGN KEY/)
  })
})
```

- [x] **Step 3: Run it to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/db/migrate.test.ts 2>&1 | tail -6
```
Expected: FAIL — `Failed to resolve import "@main/db/connection"`.

- [x] **Step 4: Implement connection, schema, runner**

Create `src/main/db/connection.ts`:
```ts
import { DatabaseSync } from 'node:sqlite'

export type Db = DatabaseSync

export function openDatabase(path: string): Db {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

export function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
```

Create `src/main/db/migrations/001_initial.sql`:
```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE nfl_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  season TEXT NOT NULL,
  week INTEGER NOT NULL,
  display_week INTEGER NOT NULL,
  season_type TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE leagues (
  league_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  status TEXT NOT NULL,
  total_rosters INTEGER NOT NULL,
  sleeper_raw TEXT NOT NULL,
  synced_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE teams (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  roster_id INTEGER NOT NULL,
  owner_id TEXT,
  display_name TEXT NOT NULL,
  team_name TEXT,
  avatar TEXT,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  fpts REAL NOT NULL DEFAULT 0,
  fpts_against REAL NOT NULL DEFAULT 0,
  is_me INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, roster_id)
);

CREATE TABLE players (
  player_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  position TEXT,
  fantasy_positions TEXT,
  team TEXT,
  status TEXT,
  injury_status TEXT,
  age INTEGER,
  years_exp INTEGER,
  depth_chart_order INTEGER,
  search_rank INTEGER,
  gsis_id TEXT,
  sportradar_id TEXT,
  espn_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_players_team ON players(team);

CREATE TABLE roster_players (
  league_id TEXT NOT NULL,
  roster_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('starter', 'bench', 'ir', 'taxi')),
  starter_index INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, roster_id, player_id),
  FOREIGN KEY (league_id, roster_id) REFERENCES teams(league_id, roster_id) ON DELETE CASCADE
);

CREATE TABLE sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error', 'skipped')),
  message TEXT,
  rows_written INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sync_log_source ON sync_log(source, id);
```

Create `src/main/db/migrations/index.ts`:
```ts
import initial from './001_initial.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

export const migrations: Migration[] = [{ version: 1, name: 'initial', sql: initial }]
```

Create `src/main/db/migrate.ts`:
```ts
import { withTransaction, type Db } from './connection'
import { migrations } from './migrations'

export function migrate(db: Db): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`)
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version').get() as { v: number }
  let current = row.v
  for (const m of migrations) {
    if (m.version <= current) continue
    withTransaction(db, () => {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString()
      )
    })
    current = m.version
  }
  return current
}
```

- [x] **Step 5: Run tests, typecheck, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/db/migrate.test.ts 2>&1 | tail -6 && npm run typecheck:node
```
Expected: `3 passed`.
```bash
git add -A && git commit -q -m "feat(db): add sqlite connection and initial schema migration

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Shared types and the Sleeper client

**Files:**
- Create: `src/shared/types.ts`, `src/main/sources/sleeper-types.ts`, `src/main/sources/sleeper.ts`
- Test: `tests/main/sources/sleeper.test.ts`

**Interfaces:**
- Produces: all domain types below; `SleeperClient` interface; `createSleeperClient(options?: SleeperClientOptions): SleeperClient`; `SleeperHttpError { status: number; url: string }`.

- [x] **Step 1: Domain types**

Create `src/shared/types.ts`:
```ts
export interface LeagueSummary {
  leagueId: string
  name: string
  season: string
  status: string
  totalRosters: number
}

export interface League extends LeagueSummary {
  syncedAt: string | null
}

export interface Team {
  leagueId: string
  rosterId: number
  ownerId: string | null
  displayName: string
  teamName: string | null
  avatar: string | null
  wins: number
  losses: number
  ties: number
  fpts: number
  fptsAgainst: number
  isMe: boolean
}

export type RosterSlot = 'starter' | 'bench' | 'ir' | 'taxi'

export interface RosterPlayer {
  playerId: string
  slot: RosterSlot
  starterIndex: number | null
  fullName: string
  position: string | null
  team: string | null
  status: string | null
  injuryStatus: string | null
}

export interface NflState {
  season: string
  week: number
  displayWeek: number
  seasonType: string
  fetchedAt: string
}

export type SyncStatusKind = 'ok' | 'error' | 'skipped'

export interface SyncLogEntry {
  id: number
  source: string
  startedAt: string
  finishedAt: string | null
  status: SyncStatusKind | 'running'
  message: string | null
  rowsWritten: number
}

export interface SyncResult {
  steps: SyncLogEntry[]
}

export interface SyncStatus {
  nflState: NflState | null
  lastSleeperSync: SyncLogEntry | null
  lastError: SyncLogEntry | null
  activeLeagueId: string | null
}
```

Create `src/main/sources/sleeper-types.ts` (raw JSON shapes, only the fields we read):
```ts
export interface SleeperUser {
  user_id: string
  username: string
  display_name: string
  avatar: string | null
}

export interface SleeperLeague {
  league_id: string
  name: string
  season: string
  status: string
  total_rosters: number
  sport: string
  settings: Record<string, number>
  scoring_settings: Record<string, number>
  roster_positions: string[]
  previous_league_id: string | null
}

export interface SleeperLeagueUser {
  user_id: string
  display_name: string
  avatar: string | null
  metadata?: { team_name?: string } | null
}

export interface SleeperRosterSettings {
  wins?: number
  losses?: number
  ties?: number
  fpts?: number
  fpts_decimal?: number
  fpts_against?: number
  fpts_against_decimal?: number
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string | null
  league_id: string
  players: string[] | null
  starters: string[] | null
  reserve: string[] | null
  taxi: string[] | null
  settings: SleeperRosterSettings | null
}

export interface SleeperPlayer {
  player_id: string
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  position: string | null
  fantasy_positions: string[] | null
  team: string | null
  status?: string | null
  injury_status?: string | null
  age?: number | null
  years_exp?: number | null
  depth_chart_order?: number | null
  search_rank?: number | null
  gsis_id?: string | null
  sportradar_id?: string | null
  espn_id?: number | string | null
}

export interface SleeperNflState {
  season: string
  week: number
  display_week: number
  season_type: string
  league_season: string
}
```

- [x] **Step 2: Write the failing tests**

Create `tests/main/sources/sleeper.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createSleeperClient, SleeperHttpError } from '@main/sources/sleeper'

function fakeFetch(responses: Array<{ status: number; body?: unknown }>): typeof fetch {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.shift()
    if (!next) throw new Error('no more fake responses')
    const body = next.body === undefined ? null : JSON.stringify(next.body)
    return new Response(body, { status: next.status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

describe('createSleeperClient', () => {
  it('parses JSON and builds the URL from the base', async () => {
    const fetchImpl = fakeFetch([
      { status: 200, body: { season: '2026', week: 2, display_week: 1, season_type: 'regular', league_season: '2026' } }
    ])
    const client = createSleeperClient({ fetchImpl, baseUrl: 'https://example.test/v1' })
    const state = await client.getNflState()
    expect(state.week).toBe(2)
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/v1/state/nfl', expect.anything())
  })

  it('returns null on 404 and on a JSON null body', async () => {
    const client = createSleeperClient({ fetchImpl: fakeFetch([{ status: 404 }, { status: 200, body: null }]) })
    expect(await client.getUser('nobody')).toBeNull()
    expect(await client.getLeague('123')).toBeNull()
  })

  it('retries once on 429 then succeeds', async () => {
    const fetchImpl = fakeFetch([{ status: 429, body: 'slow down' }, { status: 200, body: [] }])
    const client = createSleeperClient({ fetchImpl, retryDelayMs: 0 })
    expect(await client.getLeagueUsers('123')).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws SleeperHttpError after a second failure', async () => {
    const fetchImpl = fakeFetch([{ status: 500, body: 'boom' }, { status: 500, body: 'boom' }])
    const client = createSleeperClient({ fetchImpl, retryDelayMs: 0 })
    await expect(client.getLeagueRosters('123')).rejects.toBeInstanceOf(SleeperHttpError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry 4xx client errors', async () => {
    const fetchImpl = fakeFetch([{ status: 400, body: 'bad' }])
    const client = createSleeperClient({ fetchImpl, retryDelayMs: 0 })
    await expect(client.getLeagueRosters('123')).rejects.toMatchObject({ status: 400 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('treats a missing required resource as an error', async () => {
    const client = createSleeperClient({ fetchImpl: fakeFetch([{ status: 404 }]) })
    await expect(client.getNflState()).rejects.toMatchObject({ status: 404 })
  })

  it('URL-encodes usernames', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: null }])
    const client = createSleeperClient({ fetchImpl, baseUrl: 'https://example.test/v1' })
    await client.getUser('a b')
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/v1/user/a%20b', expect.anything())
  })
})
```

- [x] **Step 3: Run to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/sources/sleeper.test.ts 2>&1 | tail -4
```
Expected: FAIL — `Failed to resolve import "@main/sources/sleeper"`.

- [x] **Step 4: Implement the client**

Create `src/main/sources/sleeper.ts`:
```ts
import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperNflState,
  SleeperPlayer,
  SleeperRoster,
  SleeperUser
} from './sleeper-types'

export interface SleeperClient {
  getUser(username: string): Promise<SleeperUser | null>
  getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]>
  getLeague(leagueId: string): Promise<SleeperLeague | null>
  getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]>
  getLeagueRosters(leagueId: string): Promise<SleeperRoster[]>
  getAllPlayers(): Promise<Record<string, SleeperPlayer>>
  getNflState(): Promise<SleeperNflState>
}

export class SleeperHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string
  ) {
    super(`Sleeper ${status} for ${url}: ${body.slice(0, 200)}`)
    this.name = 'SleeperHttpError'
  }
}

export interface SleeperClientOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])

export function createSleeperClient(options: SleeperClientOptions = {}): SleeperClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? 'https://api.sleeper.app/v1'
  const timeoutMs = options.timeoutMs ?? 30_000
  const retryDelayMs = options.retryDelayMs ?? 1_000

  async function getJson<T>(path: string): Promise<T | null> {
    const url = `${baseUrl}${path}`
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 404) return null
      if (res.ok) return (await res.json()) as T | null
      const body = await res.text()
      if (attempt === 0 && RETRY_STATUSES.has(res.status)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        continue
      }
      throw new SleeperHttpError(res.status, url, body)
    }
  }

  async function getJsonRequired<T>(path: string): Promise<T> {
    const value = await getJson<T>(path)
    if (value === null) throw new SleeperHttpError(404, `${baseUrl}${path}`, 'not found')
    return value
  }

  return {
    getUser: (username) => getJson<SleeperUser>(`/user/${encodeURIComponent(username)}`),
    getUserLeagues: (userId, season) => getJsonRequired<SleeperLeague[]>(`/user/${userId}/leagues/nfl/${season}`),
    getLeague: (leagueId) => getJson<SleeperLeague>(`/league/${leagueId}`),
    getLeagueUsers: (leagueId) => getJsonRequired<SleeperLeagueUser[]>(`/league/${leagueId}/users`),
    getLeagueRosters: (leagueId) => getJsonRequired<SleeperRoster[]>(`/league/${leagueId}/rosters`),
    getAllPlayers: () => getJsonRequired<Record<string, SleeperPlayer>>('/players/nfl'),
    getNflState: () => getJsonRequired<SleeperNflState>('/state/nfl')
  }
}
```

- [x] **Step 5: Run tests, typecheck, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/sources/sleeper.test.ts 2>&1 | tail -4 && npm run typecheck:node
```
Expected: `7 passed`.
```bash
git add -A && git commit -q -m "feat(sources): add sleeper api client with retry and timeout

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Repositories

**Files:**
- Create: `src/main/db/repos/settings.ts`, `state.ts`, `syncLog.ts`, `leagues.ts`, `teams.ts`, `players.ts`
- Test: `tests/main/db/repos.test.ts`

**Interfaces:**
- Consumes: `Db`, `openDatabase`, `migrate`, domain types.
- Produces (all take `db: Db` first):
  - settings: `getSetting(db, key): string | null`, `setSetting(db, key, value): void`, constants `SETTING_ACTIVE_LEAGUE = 'active_league_id'`, `SETTING_MY_USER = 'my_user_id'`
  - state: `setNflState(db, state: NflState)`, `getNflState(db): NflState | null`
  - syncLog: `startSync(db, source, startedAt): number`, `finishSync(db, id, status, finishedAt, message, rowsWritten): SyncLogEntry`, `getLastSync(db, source, status?): SyncLogEntry | null`, `getLastError(db): SyncLogEntry | null`
  - leagues: `interface LeagueRecord extends League { sleeperRaw: string }`, `upsertLeague(db, league: LeagueRecord, updatedAt)`, `getLeague(db, leagueId): League | null`
  - teams: `interface RosterPlayerRecord { rosterId; playerId; slot; starterIndex }`, `replaceTeams(db, leagueId, teams: Team[], updatedAt)`, `listTeams(db, leagueId): Team[]`, `replaceRosterPlayers(db, leagueId, rows, updatedAt)`, `listRoster(db, leagueId, rosterId): RosterPlayer[]`
  - players: `interface PlayerRecord`, `upsertPlayers(db, players: PlayerRecord[], updatedAt): number`, `countPlayers(db): number`

- [x] **Step 1: Write the failing tests**

Create `tests/main/db/repos.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting, setSetting } from '@main/db/repos/settings'
import { getNflState, setNflState } from '@main/db/repos/state'
import { finishSync, getLastError, getLastSync, startSync } from '@main/db/repos/syncLog'
import { getLeague, upsertLeague } from '@main/db/repos/leagues'
import { listRoster, listTeams, replaceRosterPlayers, replaceTeams } from '@main/db/repos/teams'
import { countPlayers, upsertPlayers, type PlayerRecord } from '@main/db/repos/players'
import type { Team } from '@shared/types'

const T = '2026-09-15T12:00:00.000Z'

function team(rosterId: number, extra: Partial<Team> = {}): Team {
  return {
    leagueId: 'L1', rosterId, ownerId: `u${rosterId}`, displayName: `Owner ${rosterId}`, teamName: null, avatar: null,
    wins: 0, losses: 0, ties: 0, fpts: 0, fptsAgainst: 0, isMe: false, ...extra
  }
}

function player(playerId: string, extra: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    playerId, fullName: `Player ${playerId}`, firstName: null, lastName: null, position: 'RB', fantasyPositions: ['RB'],
    team: 'BUF', status: 'Active', injuryStatus: null, age: null, yearsExp: null, depthChartOrder: null, searchRank: null,
    gsisId: null, sportradarId: null, espnId: null, ...extra
  }
}

describe('repos', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    upsertLeague(db, { leagueId: 'L1', name: 'L', season: '2026', status: 'in_season', totalRosters: 2, syncedAt: T, sleeperRaw: '{}' }, T)
  })

  it('settings round-trip and overwrite', () => {
    expect(getSetting(db, 'k')).toBeNull()
    setSetting(db, 'k', 'a')
    setSetting(db, 'k', 'b')
    expect(getSetting(db, 'k')).toBe('b')
  })

  it('nfl state is a singleton upsert', () => {
    expect(getNflState(db)).toBeNull()
    setNflState(db, { season: '2026', week: 2, displayWeek: 1, seasonType: 'regular', fetchedAt: T })
    setNflState(db, { season: '2026', week: 3, displayWeek: 2, seasonType: 'regular', fetchedAt: T })
    expect(getNflState(db)).toMatchObject({ week: 3, displayWeek: 2 })
  })

  it('sync log start/finish/last/error', () => {
    const a = startSync(db, 'sleeper:league', T)
    finishSync(db, a, 'ok', T, null, 5)
    const b = startSync(db, 'sleeper:players', T)
    finishSync(db, b, 'error', T, 'boom', 0)
    expect(getLastSync(db, 'sleeper:league')).toMatchObject({ id: a, status: 'ok', rowsWritten: 5 })
    expect(getLastSync(db, 'sleeper:players', 'ok')).toBeNull()
    expect(getLastError(db)).toMatchObject({ id: b, message: 'boom' })
  })

  it('league upsert updates in place', () => {
    upsertLeague(db, { leagueId: 'L1', name: 'Renamed', season: '2026', status: 'in_season', totalRosters: 2, syncedAt: T, sleeperRaw: '{}' }, T)
    expect(getLeague(db, 'L1')).toMatchObject({ name: 'Renamed', totalRosters: 2 })
    expect(getLeague(db, 'nope')).toBeNull()
  })

  it('teams are replaced and listed with mine first', () => {
    replaceTeams(db, 'L1', [team(1, { wins: 3 }), team(2, { wins: 1, isMe: true })], T)
    replaceTeams(db, 'L1', [team(1, { wins: 3 }), team(2, { wins: 1, isMe: true })], T)
    const teams = listTeams(db, 'L1')
    expect(teams.map((t) => t.rosterId)).toEqual([2, 1])
    expect(teams[0].isMe).toBe(true)
  })

  it('roster lists players joined with names, ordered by slot then starter index', () => {
    replaceTeams(db, 'L1', [team(1)], T)
    upsertPlayers(db, [player('a', { fullName: 'Aaron', position: 'QB' }), player('b', { fullName: 'Bob' })], T)
    replaceRosterPlayers(db, 'L1', [
      { rosterId: 1, playerId: 'b', slot: 'bench', starterIndex: null },
      { rosterId: 1, playerId: 'zzz', slot: 'starter', starterIndex: 1 },
      { rosterId: 1, playerId: 'a', slot: 'starter', starterIndex: 0 }
    ], T)
    const roster = listRoster(db, 'L1', 1)
    expect(roster.map((r) => r.playerId)).toEqual(['a', 'zzz', 'b'])
    expect(roster[0]).toMatchObject({ fullName: 'Aaron', position: 'QB', slot: 'starter' })
    expect(roster[1].fullName).toBe('zzz')
  })

  it('replacing teams cascades roster players', () => {
    replaceTeams(db, 'L1', [team(1)], T)
    replaceRosterPlayers(db, 'L1', [{ rosterId: 1, playerId: 'a', slot: 'bench', starterIndex: null }], T)
    replaceTeams(db, 'L1', [team(1)], T)
    expect(listRoster(db, 'L1', 1)).toEqual([])
  })

  it('player upsert is idempotent and stores fantasy positions as JSON', () => {
    expect(upsertPlayers(db, [player('a'), player('b', { fantasyPositions: ['WR', 'RB'] })], T)).toBe(2)
    upsertPlayers(db, [player('a', { team: 'KC' })], T)
    expect(countPlayers(db)).toBe(2)
    const row = db.prepare('SELECT team, fantasy_positions FROM players WHERE player_id = ?').get('b') as { team: string; fantasy_positions: string }
    expect(JSON.parse(row.fantasy_positions)).toEqual(['WR', 'RB'])
    expect((db.prepare('SELECT team FROM players WHERE player_id = ?').get('a') as { team: string }).team).toBe('KC')
  })
})
```

- [x] **Step 2: Run to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/db/repos.test.ts 2>&1 | tail -4
```
Expected: FAIL — cannot resolve `@main/db/repos/settings`.

- [x] **Step 3: Implement the repositories**

Create `src/main/db/repos/settings.ts`:
```ts
import type { Db } from '../connection'

export const SETTING_ACTIVE_LEAGUE = 'active_league_id'
export const SETTING_MY_USER = 'my_user_id'

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}
```

Create `src/main/db/repos/state.ts`:
```ts
import type { NflState } from '@shared/types'
import type { Db } from '../connection'

interface Row {
  season: string
  week: number
  display_week: number
  season_type: string
  fetched_at: string
}

export function setNflState(db: Db, state: NflState): void {
  db.prepare(
    `INSERT INTO nfl_state (id, season, week, display_week, season_type, fetched_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET season = excluded.season, week = excluded.week,
       display_week = excluded.display_week, season_type = excluded.season_type, fetched_at = excluded.fetched_at`
  ).run(state.season, state.week, state.displayWeek, state.seasonType, state.fetchedAt)
}

export function getNflState(db: Db): NflState | null {
  const row = db
    .prepare('SELECT season, week, display_week, season_type, fetched_at FROM nfl_state WHERE id = 1')
    .get() as Row | undefined
  if (!row) return null
  return {
    season: row.season,
    week: row.week,
    displayWeek: row.display_week,
    seasonType: row.season_type,
    fetchedAt: row.fetched_at
  }
}
```

Create `src/main/db/repos/syncLog.ts`:
```ts
import type { SyncLogEntry, SyncStatusKind } from '@shared/types'
import type { Db } from '../connection'

interface Row {
  id: number
  source: string
  started_at: string
  finished_at: string | null
  status: SyncLogEntry['status']
  message: string | null
  rows_written: number
}

function toEntry(r: Row): SyncLogEntry {
  return {
    id: r.id,
    source: r.source,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    message: r.message,
    rowsWritten: r.rows_written
  }
}

export function startSync(db: Db, source: string, startedAt: string): number {
  const result = db
    .prepare("INSERT INTO sync_log (source, started_at, status) VALUES (?, ?, 'running')")
    .run(source, startedAt)
  return Number(result.lastInsertRowid)
}

export function finishSync(
  db: Db,
  id: number,
  status: SyncStatusKind,
  finishedAt: string,
  message: string | null,
  rowsWritten: number
): SyncLogEntry {
  db.prepare('UPDATE sync_log SET status = ?, finished_at = ?, message = ?, rows_written = ? WHERE id = ?').run(
    status,
    finishedAt,
    message,
    rowsWritten,
    id
  )
  const row = db.prepare('SELECT * FROM sync_log WHERE id = ?').get(id) as Row | undefined
  if (!row) throw new Error(`sync_log ${id} not found`)
  return toEntry(row)
}

export function getLastSync(db: Db, source: string, status?: SyncStatusKind): SyncLogEntry | null {
  const row = (
    status
      ? db.prepare('SELECT * FROM sync_log WHERE source = ? AND status = ? ORDER BY id DESC LIMIT 1').get(source, status)
      : db.prepare('SELECT * FROM sync_log WHERE source = ? ORDER BY id DESC LIMIT 1').get(source)
  ) as Row | undefined
  return row ? toEntry(row) : null
}

export function getLastError(db: Db): SyncLogEntry | null {
  const row = db.prepare("SELECT * FROM sync_log WHERE status = 'error' ORDER BY id DESC LIMIT 1").get() as
    | Row
    | undefined
  return row ? toEntry(row) : null
}
```

Create `src/main/db/repos/leagues.ts`:
```ts
import type { League } from '@shared/types'
import type { Db } from '../connection'

export interface LeagueRecord extends League {
  sleeperRaw: string
}

interface Row {
  league_id: string
  name: string
  season: string
  status: string
  total_rosters: number
  synced_at: string | null
}

export function upsertLeague(db: Db, league: LeagueRecord, updatedAt: string): void {
  db.prepare(
    `INSERT INTO leagues (league_id, name, season, status, total_rosters, sleeper_raw, synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(league_id) DO UPDATE SET name = excluded.name, season = excluded.season, status = excluded.status,
       total_rosters = excluded.total_rosters, sleeper_raw = excluded.sleeper_raw, synced_at = excluded.synced_at,
       updated_at = excluded.updated_at`
  ).run(
    league.leagueId,
    league.name,
    league.season,
    league.status,
    league.totalRosters,
    league.sleeperRaw,
    league.syncedAt,
    updatedAt
  )
}

export function getLeague(db: Db, leagueId: string): League | null {
  const row = db
    .prepare('SELECT league_id, name, season, status, total_rosters, synced_at FROM leagues WHERE league_id = ?')
    .get(leagueId) as Row | undefined
  if (!row) return null
  return {
    leagueId: row.league_id,
    name: row.name,
    season: row.season,
    status: row.status,
    totalRosters: row.total_rosters,
    syncedAt: row.synced_at
  }
}
```

Create `src/main/db/repos/teams.ts`:
```ts
import type { RosterPlayer, RosterSlot, Team } from '@shared/types'
import type { Db } from '../connection'

export interface RosterPlayerRecord {
  rosterId: number
  playerId: string
  slot: RosterSlot
  starterIndex: number | null
}

interface TeamRow {
  league_id: string
  roster_id: number
  owner_id: string | null
  display_name: string
  team_name: string | null
  avatar: string | null
  wins: number
  losses: number
  ties: number
  fpts: number
  fpts_against: number
  is_me: number
}

interface RosterRow {
  player_id: string
  slot: RosterSlot
  starter_index: number | null
  full_name: string
  position: string | null
  team: string | null
  status: string | null
  injury_status: string | null
}

export function replaceTeams(db: Db, leagueId: string, teams: Team[], updatedAt: string): void {
  db.prepare('DELETE FROM teams WHERE league_id = ?').run(leagueId)
  const insert = db.prepare(
    `INSERT INTO teams (league_id, roster_id, owner_id, display_name, team_name, avatar, wins, losses, ties, fpts,
       fpts_against, is_me, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const t of teams) {
    insert.run(
      leagueId, t.rosterId, t.ownerId, t.displayName, t.teamName, t.avatar,
      t.wins, t.losses, t.ties, t.fpts, t.fptsAgainst, t.isMe ? 1 : 0, updatedAt
    )
  }
}

export function listTeams(db: Db, leagueId: string): Team[] {
  const rows = db
    .prepare('SELECT * FROM teams WHERE league_id = ? ORDER BY is_me DESC, wins DESC, fpts DESC')
    .all(leagueId) as unknown as TeamRow[]
  return rows.map((r) => ({
    leagueId: r.league_id,
    rosterId: r.roster_id,
    ownerId: r.owner_id,
    displayName: r.display_name,
    teamName: r.team_name,
    avatar: r.avatar,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    fpts: r.fpts,
    fptsAgainst: r.fpts_against,
    isMe: r.is_me === 1
  }))
}

export function replaceRosterPlayers(db: Db, leagueId: string, rows: RosterPlayerRecord[], updatedAt: string): void {
  db.prepare('DELETE FROM roster_players WHERE league_id = ?').run(leagueId)
  const insert = db.prepare(
    'INSERT INTO roster_players (league_id, roster_id, player_id, slot, starter_index, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const r of rows) insert.run(leagueId, r.rosterId, r.playerId, r.slot, r.starterIndex, updatedAt)
}

export function listRoster(db: Db, leagueId: string, rosterId: number): RosterPlayer[] {
  const rows = db
    .prepare(
      `SELECT rp.player_id, rp.slot, rp.starter_index,
         COALESCE(p.full_name, rp.player_id) AS full_name, p.position, p.team, p.status, p.injury_status
       FROM roster_players rp
       LEFT JOIN players p ON p.player_id = rp.player_id
       WHERE rp.league_id = ? AND rp.roster_id = ?
       ORDER BY CASE rp.slot WHEN 'starter' THEN 0 WHEN 'bench' THEN 1 WHEN 'ir' THEN 2 ELSE 3 END,
         rp.starter_index, p.position, full_name`
    )
    .all(leagueId, rosterId) as unknown as RosterRow[]
  return rows.map((r) => ({
    playerId: r.player_id,
    slot: r.slot,
    starterIndex: r.starter_index,
    fullName: r.full_name,
    position: r.position,
    team: r.team,
    status: r.status,
    injuryStatus: r.injury_status
  }))
}
```

Create `src/main/db/repos/players.ts`:
```ts
import type { Db } from '../connection'

export interface PlayerRecord {
  playerId: string
  fullName: string
  firstName: string | null
  lastName: string | null
  position: string | null
  fantasyPositions: string[] | null
  team: string | null
  status: string | null
  injuryStatus: string | null
  age: number | null
  yearsExp: number | null
  depthChartOrder: number | null
  searchRank: number | null
  gsisId: string | null
  sportradarId: string | null
  espnId: string | null
}

export function upsertPlayers(db: Db, players: PlayerRecord[], updatedAt: string): number {
  const stmt = db.prepare(
    `INSERT INTO players (player_id, full_name, first_name, last_name, position, fantasy_positions, team, status,
       injury_status, age, years_exp, depth_chart_order, search_rank, gsis_id, sportradar_id, espn_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET full_name = excluded.full_name, first_name = excluded.first_name,
       last_name = excluded.last_name, position = excluded.position, fantasy_positions = excluded.fantasy_positions,
       team = excluded.team, status = excluded.status, injury_status = excluded.injury_status, age = excluded.age,
       years_exp = excluded.years_exp, depth_chart_order = excluded.depth_chart_order, search_rank = excluded.search_rank,
       gsis_id = excluded.gsis_id, sportradar_id = excluded.sportradar_id, espn_id = excluded.espn_id,
       updated_at = excluded.updated_at`
  )
  let written = 0
  for (const p of players) {
    stmt.run(
      p.playerId, p.fullName, p.firstName, p.lastName, p.position,
      p.fantasyPositions ? JSON.stringify(p.fantasyPositions) : null,
      p.team, p.status, p.injuryStatus, p.age, p.yearsExp, p.depthChartOrder, p.searchRank,
      p.gsisId, p.sportradarId, p.espnId, updatedAt
    )
    written++
  }
  return written
}

export function countPlayers(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM players').get() as { n: number }).n
}
```

- [x] **Step 4: Run tests, typecheck, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/db/repos.test.ts 2>&1 | tail -4 && npm run typecheck:node
```
Expected: `8 passed`.
```bash
git add -A && git commit -q -m "feat(db): add league, team, roster, player and sync-log repositories

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Fixtures and mappers

**Files:**
- Create: `tests/fixtures/sleeper.ts`, `src/main/sync/mappers.ts`
- Test: `tests/main/sync/mappers.test.ts`

**Interfaces:**
- Consumes: Sleeper raw types, `LeagueRecord`, `RosterPlayerRecord`, `PlayerRecord`, `Team`, `NflState`, `LeagueSummary`.
- Produces: `mapNflState(s, fetchedAt): NflState`, `mapLeagueSummary(l): LeagueSummary`, `mapLeague(l, syncedAt): LeagueRecord`, `mapTeams(leagueId, rosters, users, myUserId): Team[]`, `mapRosterPlayers(rosters): RosterPlayerRecord[]`, `mapPlayers(players): PlayerRecord[]`.

- [x] **Step 1: Fixtures**

Create `tests/fixtures/sleeper.ts` (ids and gsis values are illustrative; replace with captures from the user's real league when it is known — the shapes are what matter):
```ts
import type {
  SleeperLeague, SleeperLeagueUser, SleeperNflState, SleeperPlayer, SleeperRoster, SleeperUser
} from '@main/sources/sleeper-types'

export const nflState: SleeperNflState = {
  season: '2026', week: 2, display_week: 1, season_type: 'regular', league_season: '2026'
}

export const user: SleeperUser = { user_id: 'u1', username: 'me', display_name: 'Me', avatar: null }

export const league: SleeperLeague = {
  league_id: 'L1', name: 'Test League', season: '2026', status: 'in_season', total_rosters: 2, sport: 'nfl',
  settings: { num_teams: 2, waiver_type: 2, waiver_budget: 100, trade_deadline: 13, playoff_week_start: 15, playoff_teams: 6 },
  scoring_settings: { rec: 1, rush_yd: 0.1, rec_yd: 0.1, rush_td: 6, rec_td: 6, pass_td: 4, pass_yd: 0.04, fum_lost: -2 },
  roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'IR'],
  previous_league_id: null
}

export const users: SleeperLeagueUser[] = [
  { user_id: 'u1', display_name: 'Me', avatar: null, metadata: { team_name: 'Cook Book' } },
  { user_id: 'u2', display_name: 'Rival', avatar: 'abc', metadata: null }
]

export const rosters: SleeperRoster[] = [
  {
    roster_id: 1, owner_id: 'u1', league_id: 'L1',
    players: ['4866', '6794', '8259', 'LAR'], starters: ['4866', '6794', '0', 'LAR'], reserve: ['8259'], taxi: null,
    settings: { wins: 1, losses: 0, ties: 0, fpts: 131, fpts_decimal: 42, fpts_against: 98, fpts_against_decimal: 6 }
  },
  {
    roster_id: 2, owner_id: 'u2', league_id: 'L1',
    players: ['7564', '9509'], starters: ['7564'], reserve: null, taxi: ['9509'],
    settings: { wins: 0, losses: 1, ties: 0, fpts: 98, fpts_decimal: 6, fpts_against: 131, fpts_against_decimal: 42 }
  }
]

const base = { status: 'Active', injury_status: null, depth_chart_order: 1, sportradar_id: null, espn_id: null }

export const players: Record<string, SleeperPlayer> = {
  '4866': { ...base, player_id: '4866', full_name: 'Saquon Barkley', first_name: 'Saquon', last_name: 'Barkley', position: 'RB', fantasy_positions: ['RB'], team: 'PHI', age: 29, years_exp: 8, search_rank: 5, gsis_id: ' 00-0034844', sportradar_id: 'sr-1', espn_id: 3929630 },
  '6794': { ...base, player_id: '6794', full_name: 'Justin Jefferson', first_name: 'Justin', last_name: 'Jefferson', position: 'WR', fantasy_positions: ['WR'], team: 'MIN', age: 27, years_exp: 6, search_rank: 2, gsis_id: '00-0036322' },
  '8259': { ...base, player_id: '8259', full_name: 'James Cook', first_name: 'James', last_name: 'Cook', position: 'RB', fantasy_positions: ['RB'], team: 'BUF', age: 26, years_exp: 4, search_rank: 12, gsis_id: '00-0037248', injury_status: 'Questionable' },
  '7564': { ...base, player_id: '7564', full_name: "Ja'Marr Chase", first_name: "Ja'Marr", last_name: 'Chase', position: 'WR', fantasy_positions: ['WR'], team: 'CIN', age: 26, years_exp: 5, search_rank: 1, gsis_id: '00-0036900' },
  '9509': { ...base, player_id: '9509', full_name: 'Bijan Robinson', first_name: 'Bijan', last_name: 'Robinson', position: 'RB', fantasy_positions: ['RB'], team: 'ATL', age: 24, years_exp: 3, search_rank: 3, gsis_id: '00-0039013' },
  LAR: { player_id: 'LAR', first_name: 'Los Angeles', last_name: 'Rams', position: 'DEF', fantasy_positions: ['DEF'], team: 'LAR', status: null, injury_status: null, age: null, years_exp: null, depth_chart_order: null, search_rank: null, gsis_id: null, sportradar_id: null, espn_id: null },
  '1234': { ...base, player_id: '1234', full_name: 'Retired Guy', first_name: 'Retired', last_name: 'Guy', position: 'QB', fantasy_positions: ['QB'], team: null, status: 'Inactive', age: 38, years_exp: 15, search_rank: 9999999, gsis_id: '' }
}
```

- [x] **Step 2: Write the failing tests**

Create `tests/main/sync/mappers.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mapLeague, mapNflState, mapPlayers, mapRosterPlayers, mapTeams } from '@main/sync/mappers'
import * as fx from '../../fixtures/sleeper'

describe('mappers', () => {
  it('maps nfl state', () => {
    expect(mapNflState(fx.nflState, 'T')).toEqual({ season: '2026', week: 2, displayWeek: 1, seasonType: 'regular', fetchedAt: 'T' })
  })

  it('maps league and keeps the raw JSON', () => {
    const rec = mapLeague(fx.league, 'T')
    expect(rec).toMatchObject({ leagueId: 'L1', name: 'Test League', totalRosters: 2, syncedAt: 'T' })
    expect(JSON.parse(rec.sleeperRaw).scoring_settings.rec).toBe(1)
  })

  it('maps teams with owner names, decimal points and isMe', () => {
    const teams = mapTeams('L1', fx.rosters, fx.users, 'u1')
    expect(teams).toHaveLength(2)
    expect(teams[0]).toMatchObject({ rosterId: 1, displayName: 'Me', teamName: 'Cook Book', wins: 1, fpts: 131.42, fptsAgainst: 98.06, isMe: true })
    expect(teams[1]).toMatchObject({ rosterId: 2, displayName: 'Rival', teamName: null, avatar: 'abc', isMe: false })
  })

  it('falls back when the owner is unknown and myUserId is null', () => {
    const teams = mapTeams('L1', [{ ...fx.rosters[0], owner_id: null, settings: null }], fx.users, null)
    expect(teams[0]).toMatchObject({ displayName: 'Roster 1', wins: 0, fpts: 0, isMe: false })
  })

  it('maps roster slots: starters keep order and skip empty "0" slots; reserve→ir; taxi→taxi; rest→bench', () => {
    const rows = mapRosterPlayers(fx.rosters)
    expect(rows.filter((r) => r.rosterId === 1)).toEqual([
      { rosterId: 1, playerId: '4866', slot: 'starter', starterIndex: 0 },
      { rosterId: 1, playerId: '6794', slot: 'starter', starterIndex: 1 },
      { rosterId: 1, playerId: 'LAR', slot: 'starter', starterIndex: 2 },
      { rosterId: 1, playerId: '8259', slot: 'ir', starterIndex: null }
    ])
    expect(rows.filter((r) => r.rosterId === 2)).toEqual([
      { rosterId: 2, playerId: '7564', slot: 'starter', starterIndex: 0 },
      { rosterId: 2, playerId: '9509', slot: 'taxi', starterIndex: null }
    ])
  })

  it('maps players: trims gsis ids, blanks become null, DEF names from first/last, espn id stringified', () => {
    const recs = mapPlayers(fx.players)
    expect(recs).toHaveLength(7)
    const byId = Object.fromEntries(recs.map((r) => [r.playerId, r]))
    expect(byId['4866']).toMatchObject({ fullName: 'Saquon Barkley', gsisId: '00-0034844', espnId: '3929630', sportradarId: 'sr-1' })
    expect(byId['LAR']).toMatchObject({ fullName: 'Los Angeles Rams', position: 'DEF', gsisId: null })
    expect(byId['1234'].gsisId).toBeNull()
    expect(byId['8259'].injuryStatus).toBe('Questionable')
  })
})
```

- [x] **Step 3: Run to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/sync/mappers.test.ts 2>&1 | tail -4
```
Expected: FAIL — cannot resolve `@main/sync/mappers`.

- [x] **Step 4: Implement mappers**

Create `src/main/sync/mappers.ts`:
```ts
import type { LeagueRecord } from '@main/db/repos/leagues'
import type { PlayerRecord } from '@main/db/repos/players'
import type { RosterPlayerRecord } from '@main/db/repos/teams'
import type {
  SleeperLeague, SleeperLeagueUser, SleeperNflState, SleeperPlayer, SleeperRoster
} from '@main/sources/sleeper-types'
import type { LeagueSummary, NflState, Team } from '@shared/types'

const EMPTY_STARTER_SLOT = '0'

export function mapNflState(s: SleeperNflState, fetchedAt: string): NflState {
  return { season: s.season, week: s.week, displayWeek: s.display_week, seasonType: s.season_type, fetchedAt }
}

export function mapLeagueSummary(l: SleeperLeague): LeagueSummary {
  return { leagueId: l.league_id, name: l.name, season: l.season, status: l.status, totalRosters: l.total_rosters }
}

export function mapLeague(l: SleeperLeague, syncedAt: string): LeagueRecord {
  return { ...mapLeagueSummary(l), syncedAt, sleeperRaw: JSON.stringify(l) }
}

export function mapTeams(
  leagueId: string,
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[],
  myUserId: string | null
): Team[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]))
  return rosters.map((r) => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined
    const s = r.settings ?? {}
    return {
      leagueId,
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      displayName: owner?.display_name ?? `Roster ${r.roster_id}`,
      teamName: owner?.metadata?.team_name ?? null,
      avatar: owner?.avatar ?? null,
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      fpts: (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100,
      fptsAgainst: (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100,
      isMe: myUserId !== null && r.owner_id === myUserId
    }
  })
}

export function mapRosterPlayers(rosters: SleeperRoster[]): RosterPlayerRecord[] {
  const out: RosterPlayerRecord[] = []
  for (const r of rosters) {
    const starters = (r.starters ?? []).filter((id) => id !== EMPTY_STARTER_SLOT)
    const starterSet = new Set(starters)
    const reserve = new Set(r.reserve ?? [])
    const taxi = new Set(r.taxi ?? [])
    starters.forEach((playerId, starterIndex) => {
      out.push({ rosterId: r.roster_id, playerId, slot: 'starter', starterIndex })
    })
    for (const playerId of r.players ?? []) {
      if (starterSet.has(playerId)) continue
      const slot = reserve.has(playerId) ? 'ir' : taxi.has(playerId) ? 'taxi' : 'bench'
      out.push({ rosterId: r.roster_id, playerId, slot, starterIndex: null })
    }
  }
  return out
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function mapPlayers(players: Record<string, SleeperPlayer>): PlayerRecord[] {
  const out: PlayerRecord[] = []
  for (const [playerId, p] of Object.entries(players)) {
    const composed = [p.first_name, p.last_name].filter(Boolean).join(' ')
    const fullName = p.full_name || composed || playerId
    out.push({
      playerId,
      fullName,
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      position: p.position ?? null,
      fantasyPositions: p.fantasy_positions ?? null,
      team: p.team ?? null,
      status: p.status ?? null,
      injuryStatus: p.injury_status ?? null,
      age: p.age ?? null,
      yearsExp: p.years_exp ?? null,
      depthChartOrder: p.depth_chart_order ?? null,
      searchRank: p.search_rank ?? null,
      gsisId: blankToNull(p.gsis_id),
      sportradarId: blankToNull(p.sportradar_id),
      espnId: p.espn_id === null || p.espn_id === undefined ? null : String(p.espn_id)
    })
  }
  return out
}
```

- [x] **Step 5: Run tests, typecheck, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/sync/mappers.test.ts 2>&1 | tail -4 && npm run typecheck:node
```
Expected: `6 passed`.
```bash
git add -A && git commit -q -m "feat(sync): map sleeper payloads to domain records

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Sync orchestration

**Files:**
- Create: `src/main/sync/sleeperSync.ts`
- Test: `tests/main/sync/sleeperSync.test.ts`

**Interfaces:**
- Consumes: repos, mappers, `SleeperClient`, `withTransaction`.
- Produces: `SOURCE_STATE = 'sleeper:state'`, `SOURCE_LEAGUE = 'sleeper:league'`, `SOURCE_PLAYERS = 'sleeper:players'`; `interface SyncDeps { db: Db; sleeper: SleeperClient; now?: () => Date; onStep?: (entry: SyncLogEntry) => void }`; `importLeague(deps, leagueId, myUserId: string | null): Promise<SyncResult>`; `refreshSleeper(deps, options?: { force?: boolean }): Promise<SyncResult>`; `isFresh(db, source, freshnessMs, now): boolean`.

- [x] **Step 1: Write the failing tests**

Create `tests/main/sync/sleeperSync.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getLeague } from '@main/db/repos/leagues'
import { countPlayers } from '@main/db/repos/players'
import { getSetting, SETTING_ACTIVE_LEAGUE, SETTING_MY_USER } from '@main/db/repos/settings'
import { getLastError } from '@main/db/repos/syncLog'
import { listRoster, listTeams } from '@main/db/repos/teams'
import type { SleeperClient } from '@main/sources/sleeper'
import { importLeague, refreshSleeper, SOURCE_LEAGUE, SOURCE_PLAYERS, SOURCE_STATE } from '@main/sync/sleeperSync'
import * as fx from '../../fixtures/sleeper'

function fakeClient(overrides: Partial<SleeperClient> = {}): SleeperClient {
  return {
    getUser: vi.fn(async () => fx.user),
    getUserLeagues: vi.fn(async () => [fx.league]),
    getLeague: vi.fn(async () => fx.league),
    getLeagueUsers: vi.fn(async () => fx.users),
    getLeagueRosters: vi.fn(async () => fx.rosters),
    getAllPlayers: vi.fn(async () => fx.players),
    getNflState: vi.fn(async () => fx.nflState),
    ...overrides
  }
}

describe('sleeper sync', () => {
  let db: Db
  let clock: Date
  const now = (): Date => clock

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    clock = new Date('2026-09-15T12:00:00.000Z')
  })

  it('importLeague writes league, teams, rosters, players and settings', async () => {
    const steps: string[] = []
    const result = await importLeague(
      { db, sleeper: fakeClient(), now, onStep: (e) => steps.push(`${e.source}:${e.status}`) },
      'L1',
      'u1'
    )
    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok'])
    expect(steps).toEqual([`${SOURCE_STATE}:ok`, `${SOURCE_LEAGUE}:ok`, `${SOURCE_PLAYERS}:ok`])
    expect(getLeague(db, 'L1')?.name).toBe('Test League')
    expect(listTeams(db, 'L1').map((t) => [t.rosterId, t.isMe])).toEqual([[1, true], [2, false]])
    expect(listRoster(db, 'L1', 1)).toHaveLength(4)
    expect(listRoster(db, 'L1', 1)[0]).toMatchObject({ playerId: '4866', fullName: 'Saquon Barkley' })
    expect(countPlayers(db)).toBe(7)
    expect(getSetting(db, SETTING_ACTIVE_LEAGUE)).toBe('L1')
    expect(getSetting(db, SETTING_MY_USER)).toBe('u1')
  })

  it('refresh skips fresh sources and re-fetches stale ones', async () => {
    const sleeper = fakeClient()
    await importLeague({ db, sleeper, now }, 'L1', 'u1')

    const fresh = await refreshSleeper({ db, sleeper, now })
    expect(fresh.steps.map((s) => s.status)).toEqual(['skipped', 'skipped', 'skipped'])
    expect(sleeper.getLeague).toHaveBeenCalledTimes(1)

    clock = new Date('2026-09-15T12:11:00.000Z')
    const stale = await refreshSleeper({ db, sleeper, now })
    expect(stale.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'skipped'])
    expect(sleeper.getLeague).toHaveBeenCalledTimes(2)
    expect(sleeper.getAllPlayers).toHaveBeenCalledTimes(1)

    const forced = await refreshSleeper({ db, sleeper, now }, { force: true })
    expect(forced.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok'])
    expect(sleeper.getAllPlayers).toHaveBeenCalledTimes(2)
  })

  it('a failing league step is logged and does not block the players step', async () => {
    const sleeper = fakeClient({ getLeagueRosters: vi.fn(async () => { throw new Error('Sleeper 503') }) })
    const result = await importLeague({ db, sleeper, now }, 'L1', 'u1')
    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'error', 'ok'])
    expect(result.steps[1].message).toContain('503')
    expect(getLastError(db)).toMatchObject({ source: SOURCE_LEAGUE })
    expect(getLeague(db, 'L1')).toBeNull()
    expect(countPlayers(db)).toBe(7)
  })

  it('a league that does not exist is an error with a clear message', async () => {
    const sleeper = fakeClient({ getLeague: vi.fn(async () => null) })
    const result = await importLeague({ db, sleeper, now }, 'nope', null)
    expect(result.steps[1]).toMatchObject({ status: 'error' })
    expect(result.steps[1].message).toMatch(/not found/i)
  })

  it('refresh without a configured league only syncs state and players', async () => {
    const sleeper = fakeClient()
    const result = await refreshSleeper({ db, sleeper, now })
    expect(result.steps.map((s) => s.source)).toEqual([SOURCE_STATE, SOURCE_PLAYERS])
    expect(sleeper.getLeague).not.toHaveBeenCalled()
  })
})
```

- [x] **Step 2: Run to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/main/sync/sleeperSync.test.ts 2>&1 | tail -4
```
Expected: FAIL — cannot resolve `@main/sync/sleeperSync`.

- [x] **Step 3: Implement orchestration**

Create `src/main/sync/sleeperSync.ts`:
```ts
import { withTransaction, type Db } from '@main/db/connection'
import { upsertLeague } from '@main/db/repos/leagues'
import { upsertPlayers } from '@main/db/repos/players'
import { getSetting, SETTING_ACTIVE_LEAGUE, SETTING_MY_USER, setSetting } from '@main/db/repos/settings'
import { setNflState } from '@main/db/repos/state'
import { finishSync, getLastSync, startSync } from '@main/db/repos/syncLog'
import { replaceRosterPlayers, replaceTeams } from '@main/db/repos/teams'
import type { SleeperClient } from '@main/sources/sleeper'
import type { SyncLogEntry, SyncResult } from '@shared/types'
import { mapLeague, mapNflState, mapPlayers, mapRosterPlayers, mapTeams } from './mappers'

export const SOURCE_STATE = 'sleeper:state'
export const SOURCE_LEAGUE = 'sleeper:league'
export const SOURCE_PLAYERS = 'sleeper:players'

const MINUTE = 60 * 1000
export const FRESHNESS_MS: Record<string, number> = {
  [SOURCE_STATE]: 10 * MINUTE,
  [SOURCE_LEAGUE]: 10 * MINUTE,
  [SOURCE_PLAYERS]: 24 * 60 * MINUTE
}

export interface SyncDeps {
  db: Db
  sleeper: SleeperClient
  now?: () => Date
  onStep?: (entry: SyncLogEntry) => void
}

export interface RefreshOptions {
  force?: boolean
}

function nowOf(deps: SyncDeps): Date {
  return (deps.now ?? (() => new Date()))()
}

export function isFresh(db: Db, source: string, freshnessMs: number, now: Date): boolean {
  const last = getLastSync(db, source, 'ok')
  if (!last?.finishedAt) return false
  return now.getTime() - new Date(last.finishedAt).getTime() < freshnessMs
}

async function runStep(deps: SyncDeps, source: string, force: boolean, fn: () => Promise<number>): Promise<SyncLogEntry> {
  const id = startSync(deps.db, source, nowOf(deps).toISOString())
  let entry: SyncLogEntry
  if (!force && isFresh(deps.db, source, FRESHNESS_MS[source], nowOf(deps))) {
    entry = finishSync(deps.db, id, 'skipped', nowOf(deps).toISOString(), 'fresh', 0)
  } else {
    try {
      const rows = await fn()
      entry = finishSync(deps.db, id, 'ok', nowOf(deps).toISOString(), null, rows)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      entry = finishSync(deps.db, id, 'error', nowOf(deps).toISOString(), message, 0)
    }
  }
  deps.onStep?.(entry)
  return entry
}

function syncState(deps: SyncDeps, force: boolean): Promise<SyncLogEntry> {
  return runStep(deps, SOURCE_STATE, force, async () => {
    const state = await deps.sleeper.getNflState()
    setNflState(deps.db, mapNflState(state, nowOf(deps).toISOString()))
    return 1
  })
}

function syncLeague(deps: SyncDeps, leagueId: string, myUserId: string | null, force: boolean): Promise<SyncLogEntry> {
  return runStep(deps, SOURCE_LEAGUE, force, async () => {
    const [league, users, rosters] = await Promise.all([
      deps.sleeper.getLeague(leagueId),
      deps.sleeper.getLeagueUsers(leagueId),
      deps.sleeper.getLeagueRosters(leagueId)
    ])
    if (!league) throw new Error(`League ${leagueId} not found on Sleeper`)
    const ts = nowOf(deps).toISOString()
    const teams = mapTeams(leagueId, rosters, users, myUserId)
    const rosterPlayers = mapRosterPlayers(rosters)
    withTransaction(deps.db, () => {
      upsertLeague(deps.db, mapLeague(league, ts), ts)
      replaceTeams(deps.db, leagueId, teams, ts)
      replaceRosterPlayers(deps.db, leagueId, rosterPlayers, ts)
    })
    return teams.length + rosterPlayers.length
  })
}

function syncPlayers(deps: SyncDeps, force: boolean): Promise<SyncLogEntry> {
  return runStep(deps, SOURCE_PLAYERS, force, async () => {
    const all = await deps.sleeper.getAllPlayers()
    const records = mapPlayers(all)
    const ts = nowOf(deps).toISOString()
    return withTransaction(deps.db, () => upsertPlayers(deps.db, records, ts))
  })
}

export async function importLeague(deps: SyncDeps, leagueId: string, myUserId: string | null): Promise<SyncResult> {
  setSetting(deps.db, SETTING_ACTIVE_LEAGUE, leagueId)
  if (myUserId) setSetting(deps.db, SETTING_MY_USER, myUserId)
  const steps: SyncLogEntry[] = []
  steps.push(await syncState(deps, true))
  steps.push(await syncLeague(deps, leagueId, myUserId, true))
  steps.push(await syncPlayers(deps, false))
  return { steps }
}

export async function refreshSleeper(deps: SyncDeps, options: RefreshOptions = {}): Promise<SyncResult> {
  const force = options.force ?? false
  const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
  const myUserId = getSetting(deps.db, SETTING_MY_USER)
  const steps: SyncLogEntry[] = []
  steps.push(await syncState(deps, force))
  if (leagueId) steps.push(await syncLeague(deps, leagueId, myUserId, force))
  steps.push(await syncPlayers(deps, force))
  return { steps }
}
```

- [x] **Step 4: Run the whole suite, typecheck, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -6 && npm run typecheck:node
```
Expected: all files pass (`Tests  29 passed` — 3 + 7 + 8 + 6 + 5).
```bash
git add -A && git commit -q -m "feat(sync): orchestrate sleeper import and refresh with freshness windows

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: IPC contract, preload bridge, handlers, main bootstrap

**Files:**
- Create: `src/shared/ipc.ts`, `src/main/ipc/handlers.ts`, `src/renderer/src/lib/api.ts`
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/index.ts`

**Interfaces:**
- Consumes: repos, sync, `SleeperClient`, `mapLeagueSummary`.
- Produces: `Api` (renderer-facing), `IPC` channel constants, `registerIpcHandlers(ctx: AppContext)`, `api` singleton in the renderer.

- [x] **Step 1: Contract**

Create `src/shared/ipc.ts`:
```ts
import type { League, LeagueSummary, RosterPlayer, SyncLogEntry, SyncResult, SyncStatus, Team } from './types'

export interface FindLeaguesResult {
  userId: string
  leagues: LeagueSummary[]
}

export interface Api {
  setup: {
    findLeagues(username: string): Promise<FindLeaguesResult>
    importLeague(leagueId: string, userId: string | null): Promise<SyncResult>
  }
  league: {
    get(): Promise<League | null>
    teams(): Promise<Team[]>
    roster(rosterId: number): Promise<RosterPlayer[]>
  }
  sync: {
    refresh(force?: boolean): Promise<SyncResult>
    status(): Promise<SyncStatus>
    onProgress(listener: (entry: SyncLogEntry) => void): () => void
  }
}

export const IPC = {
  setupFindLeagues: 'setup:findLeagues',
  setupImportLeague: 'setup:importLeague',
  leagueGet: 'league:get',
  leagueTeams: 'league:teams',
  leagueRoster: 'league:roster',
  syncRefresh: 'sync:refresh',
  syncStatus: 'sync:status',
  syncProgress: 'sync:progress'
} as const
```

- [x] **Step 2: Preload bridge**

Replace `src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type Api } from '@shared/ipc'
import type { SyncLogEntry } from '@shared/types'

const api: Api = {
  setup: {
    findLeagues: (username) => ipcRenderer.invoke(IPC.setupFindLeagues, username),
    importLeague: (leagueId, userId) => ipcRenderer.invoke(IPC.setupImportLeague, leagueId, userId)
  },
  league: {
    get: () => ipcRenderer.invoke(IPC.leagueGet),
    teams: () => ipcRenderer.invoke(IPC.leagueTeams),
    roster: (rosterId) => ipcRenderer.invoke(IPC.leagueRoster, rosterId)
  },
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
  }
}

contextBridge.exposeInMainWorld('api', api)
```

Replace `src/preload/index.d.ts`:
```ts
import type { Api } from '@shared/ipc'

declare global {
  interface Window {
    api: Api
  }
}

export {}
```

Create `src/renderer/src/lib/api.ts`:
```ts
import type { Api } from '@shared/ipc'

export const api: Api = window.api
```

- [x] **Step 3: Handlers**

Create `src/main/ipc/handlers.ts`:
```ts
import { ipcMain, type BrowserWindow } from 'electron'
import type { Db } from '@main/db/connection'
import { getLeague } from '@main/db/repos/leagues'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import { getLastError, getLastSync } from '@main/db/repos/syncLog'
import { listRoster, listTeams } from '@main/db/repos/teams'
import type { SleeperClient } from '@main/sources/sleeper'
import { mapLeagueSummary } from '@main/sync/mappers'
import { importLeague, refreshSleeper, SOURCE_LEAGUE, type SyncDeps } from '@main/sync/sleeperSync'
import { IPC, type FindLeaguesResult } from '@shared/ipc'
import type { League, RosterPlayer, SyncResult, SyncStatus, Team } from '@shared/types'

export interface AppContext {
  db: Db
  sleeper: SleeperClient
  getWindow: () => BrowserWindow | null
}

export function syncDeps(ctx: AppContext): SyncDeps {
  return {
    db: ctx.db,
    sleeper: ctx.sleeper,
    onStep: (entry) => ctx.getWindow()?.webContents.send(IPC.syncProgress, entry)
  }
}

export function registerIpcHandlers(ctx: AppContext): void {
  const activeLeagueId = (): string | null => getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)

  ipcMain.handle(IPC.setupFindLeagues, async (_event, username: string): Promise<FindLeaguesResult> => {
    const user = await ctx.sleeper.getUser(username.trim())
    if (!user) throw new Error(`No Sleeper user named "${username.trim()}"`)
    const state = await ctx.sleeper.getNflState()
    const leagues = await ctx.sleeper.getUserLeagues(user.user_id, state.league_season || state.season)
    return { userId: user.user_id, leagues: leagues.map(mapLeagueSummary) }
  })

  ipcMain.handle(IPC.setupImportLeague, (_event, leagueId: string, userId: string | null): Promise<SyncResult> =>
    importLeague(syncDeps(ctx), leagueId, userId)
  )

  ipcMain.handle(IPC.leagueGet, (): League | null => {
    const id = activeLeagueId()
    return id ? getLeague(ctx.db, id) : null
  })

  ipcMain.handle(IPC.leagueTeams, (): Team[] => {
    const id = activeLeagueId()
    return id ? listTeams(ctx.db, id) : []
  })

  ipcMain.handle(IPC.leagueRoster, (_event, rosterId: number): RosterPlayer[] => {
    const id = activeLeagueId()
    return id ? listRoster(ctx.db, id, rosterId) : []
  })

  ipcMain.handle(IPC.syncRefresh, (_event, force: boolean): Promise<SyncResult> =>
    refreshSleeper(syncDeps(ctx), { force })
  )

  ipcMain.handle(IPC.syncStatus, (): SyncStatus => ({
    nflState: getNflState(ctx.db),
    lastSleeperSync: getLastSync(ctx.db, SOURCE_LEAGUE, 'ok'),
    lastError: getLastError(ctx.db),
    activeLeagueId: activeLeagueId()
  }))
}
```

- [x] **Step 4: Main bootstrap**

Replace `src/main/index.ts`:
```ts
import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { registerIpcHandlers, syncDeps, type AppContext } from '@main/ipc/handlers'
import { createSleeperClient } from '@main/sources/sleeper'
import { refreshSleeper } from '@main/sync/sleeperSync'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#18181b',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function openAppDatabase(): Db {
  const dbPath = join(app.getPath('userData'), 'companion.db')
  try {
    const db = openDatabase(dbPath)
    migrate(db)
    return db
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('Database error', `Could not open ${dbPath}\n\n${message}`)
    app.quit()
    throw err
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.yhabie.fantasycompanion')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const ctx: AppContext = {
    db: openAppDatabase(),
    sleeper: createSleeperClient(),
    getWindow: () => mainWindow
  }
  registerIpcHandlers(ctx)
  createWindow()

  if (getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)) {
    refreshSleeper(syncDeps(ctx)).catch((err) => console.error('background refresh failed', err))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [x] **Step 5: Typecheck, lint, smoke-run, commit**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint && \
LOG=/tmp/claude-1000/-home-yhabie-project-fantasy-football-companion/e02bcffe-e13c-490d-a0df-040a3789a0e6/scratchpad/dev.log; \
timeout 25 npm run dev > "$LOG" 2>&1; grep -ciE "error|exception" "$LOG" || true
```
Expected: typecheck + lint pass, error count `0`. (The DB file is created at `~/.config/fantasy-football-companion/companion.db` on Linux; `ls` it to confirm.)
```bash
git add -A && git commit -q -m "feat(ipc): expose typed api to renderer and bootstrap database

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Setup screen

**Files:**
- Create: `src/renderer/src/screens/SetupScreen.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `api.setup.*`, `api.sync.onProgress`, `LeagueSummary`, `SyncLogEntry`.
- Produces: `SetupScreen({ onImported: () => void })`.

- [x] **Step 1: Screen**

Create `src/renderer/src/screens/SetupScreen.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import type { LeagueSummary, SyncLogEntry } from '@shared/types'

interface SetupScreenProps {
  onImported: () => void
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(err)
}

export function SetupScreen({ onImported }: SetupScreenProps): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [leagueIdInput, setLeagueIdInput] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [leagues, setLeagues] = useState<LeagueSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncLogEntry[]>([])

  useEffect(() => api.sync.onProgress((entry) => setProgress((p) => [...p, entry])), [])

  async function findLeagues(): Promise<void> {
    setBusy(true)
    setError(null)
    setLeagues([])
    try {
      const result = await api.setup.findLeagues(username)
      setUserId(result.userId)
      setLeagues(result.leagues)
      if (result.leagues.length === 0) setError('No leagues found for this user in the current season.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function importLeague(leagueId: string, ownerUserId: string | null): Promise<void> {
    setBusy(true)
    setError(null)
    setProgress([])
    try {
      const result = await api.setup.importLeague(leagueId, ownerUserId)
      const failed = result.steps.find((s) => s.status === 'error')
      if (failed) setError(`${failed.source}: ${failed.message}`)
      else onImported()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Connect your Sleeper league</h1>
        <p className="text-sm text-muted-foreground">
          Enter your Sleeper username to list your leagues for this season.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void findLeagues()
        }}
      >
        <Input
          placeholder="Sleeper username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
          autoFocus
        />
        <Button type="submit" disabled={busy || username.trim() === ''}>
          Find leagues
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {leagues.map((l) => (
          <Card key={l.leagueId}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{l.name}</CardTitle>
                <CardDescription>
                  {l.season} · {l.totalRosters} teams · {l.status.replace(/_/g, ' ')}
                </CardDescription>
              </div>
              <Button size="sm" disabled={busy} onClick={() => void importLeague(l.leagueId, userId)}>
                Import
              </Button>
            </CardHeader>
          </Card>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">…or paste a league ID</summary>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void importLeague(leagueIdInput.trim(), null)
          }}
        >
          <Input
            placeholder="League ID (18 digits)"
            value={leagueIdInput}
            onChange={(e) => setLeagueIdInput(e.target.value)}
            disabled={busy}
          />
          <Button type="submit" variant="secondary" disabled={busy || !/^\d{10,}$/.test(leagueIdInput.trim())}>
            Import by ID
          </Button>
        </form>
        <p className="mt-1 text-xs text-muted-foreground">
          Without a username the app cannot tell which team is yours.
        </p>
      </details>

      {progress.length > 0 && (
        <Card>
          <CardContent className="space-y-1 pt-4 text-sm">
            {progress.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span className="text-muted-foreground">{p.source}</span>
                <span className={p.status === 'error' ? 'text-destructive' : ''}>
                  {p.status}
                  {p.rowsWritten ? ` · ${p.rowsWritten} rows` : ''}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [x] **Step 2: Wire into App**

Replace `src/renderer/src/App.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react'
import { Sidebar, type Screen } from '@/components/Sidebar'
import { SetupScreen } from '@/screens/SetupScreen'
import { api } from '@/lib/api'

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('league')
  const [hasLeague, setHasLeague] = useState<boolean | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const bumpData = useCallback(() => setDataVersion((v) => v + 1), [])

  useEffect(() => {
    void api.league.get().then((league) => {
      setHasLeague(league !== null)
      if (league === null) setScreen('setup')
    })
  }, [])

  if (hasLeague === null) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar current={screen} onNavigate={setScreen} hasLeague={hasLeague} />
        <main className="min-w-0 flex-1 overflow-auto p-6">
          {screen === 'setup' && (
            <SetupScreen
              onImported={() => {
                setHasLeague(true)
                setScreen('league')
                bumpData()
              }}
            />
          )}
          {screen === 'league' && (
            <p key={dataVersion} className="text-sm text-muted-foreground">
              League screen arrives in the next task.
            </p>
          )}
        </main>
      </div>
      <footer className="flex h-9 shrink-0 items-center border-t bg-sidebar px-4 text-xs text-muted-foreground">
        status bar
      </footer>
    </div>
  )
}
```

- [x] **Step 3: Verify with a real import, commit** _(human check pending — see progress notes)_

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint
```
**Human check:** `npm run dev` → Setup screen → enter your Sleeper username → your league(s) appear → Import → progress lines `sleeper:state ok`, `sleeper:league ok · N rows`, `sleeper:players ok · ~11000 rows` → the app switches to the League placeholder. Confirm the data landed:
```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.HOME+'/.config/fantasy-football-companion/companion.db');console.log(db.prepare('SELECT name, total_rosters FROM leagues').all(), db.prepare('SELECT COUNT(*) n FROM roster_players').get(), db.prepare('SELECT COUNT(*) n FROM players').get())"
```
Expected: your league name, roster player count ≈ teams × roster size, players ≈ 11 000.

```bash
git add -A && git commit -q -m "feat(ui): add sleeper setup screen with league import

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: League screen

**Files:**
- Create: `src/renderer/src/screens/LeagueScreen.tsx`, `src/renderer/src/components/PositionBadge.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `api.league.*`, `League`, `Team`, `RosterPlayer`.
- Produces: `LeagueScreen()`, `PositionBadge({ position })` (reused by Plan C's Players screen).

- [x] **Step 1: Position badge**

Create `src/renderer/src/components/PositionBadge.tsx`:
```tsx
import { cn } from '@/lib/utils'

const POSITION_CLASS: Record<string, string> = {
  QB: 'bg-pos-qb/20 text-pos-qb',
  RB: 'bg-pos-rb/20 text-pos-rb',
  WR: 'bg-pos-wr/20 text-pos-wr',
  TE: 'bg-pos-te/20 text-pos-te',
  K: 'bg-pos-k/20 text-pos-k',
  DEF: 'bg-pos-def/20 text-pos-def'
}

export function PositionBadge({ position }: { position: string | null }): React.JSX.Element {
  const pos = position ?? '—'
  return (
    <span
      className={cn(
        'inline-block w-10 rounded px-1.5 py-0.5 text-center text-xs font-semibold',
        POSITION_CLASS[pos] ?? 'bg-muted text-muted-foreground'
      )}
    >
      {pos}
    </span>
  )
}
```

- [x] **Step 2: Screen**

Create `src/renderer/src/screens/LeagueScreen.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PositionBadge } from '@/components/PositionBadge'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { League, RosterPlayer, Team } from '@shared/types'

const SLOT_ORDER = ['starter', 'bench', 'ir', 'taxi'] as const
const SLOT_LABEL: Record<RosterPlayer['slot'], string> = { starter: 'Starters', bench: 'Bench', ir: 'IR', taxi: 'Taxi' }

function teamLabel(t: Team): string {
  return t.teamName ?? t.displayName
}

export function LeagueScreen(): React.JSX.Element {
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [roster, setRoster] = useState<RosterPlayer[]>([])

  useEffect(() => {
    void api.league.get().then(setLeague)
    void api.league.teams().then((list) => {
      setTeams(list)
      setSelected((current) => current ?? list[0]?.rosterId ?? null)
    })
  }, [])

  useEffect(() => {
    if (selected === null) return
    void api.league.roster(selected).then(setRoster)
  }, [selected])

  const selectedTeam = teams.find((t) => t.rosterId === selected) ?? null
  const groups = SLOT_ORDER.map((slot) => ({ slot, players: roster.filter((p) => p.slot === slot) })).filter(
    (g) => g.players.length > 0
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{league?.name ?? 'League'}</h1>
        <p className="text-sm text-muted-foreground">{league ? `${league.season} · ${league.totalRosters} teams` : ''}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {teams.map((t) => (
            <button
              key={t.rosterId}
              type="button"
              onClick={() => setSelected(t.rosterId)}
              className={cn(
                'rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/40',
                selected === t.rosterId && 'border-primary/60 bg-accent/60'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate font-medium">{teamLabel(t)}</div>
                {t.isMe && <Badge variant="secondary">You</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{t.displayName}</div>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="font-semibold tabular-nums">
                  {t.wins}-{t.losses}
                  {t.ties ? `-${t.ties}` : ''}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  PF {t.fpts.toFixed(1)} · PA {t.fptsAgainst.toFixed(1)}
                </span>
              </div>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedTeam ? teamLabel(selectedTeam) : 'Select a team'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.map((g) => (
              <div key={g.slot}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {SLOT_LABEL[g.slot]}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Pos</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="w-14">Team</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.players.map((p) => (
                      <TableRow key={p.playerId}>
                        <TableCell>
                          <PositionBadge position={p.position} />
                        </TableCell>
                        <TableCell className="font-medium">{p.fullName}</TableCell>
                        <TableCell className="text-muted-foreground">{p.team ?? 'FA'}</TableCell>
                        <TableCell className={cn('text-xs', p.injuryStatus && 'text-destructive')}>
                          {p.injuryStatus ?? ''}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
            {selectedTeam && groups.length === 0 && (
              <p className="text-sm text-muted-foreground">No players on this roster.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [x] **Step 3: Wire into App**

In `src/renderer/src/App.tsx`, add the import
```tsx
import { LeagueScreen } from '@/screens/LeagueScreen'
```
and replace the `{screen === 'league' && (…placeholder…)}` block with:
```tsx
          {screen === 'league' && <LeagueScreen key={dataVersion} />}
```

- [x] **Step 4: Verify, commit** _(human check pending — see progress notes)_

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint
```
**Human check:** `npm run dev` → League screen shows every team as a card with record and PF/PA, your team first with a "You" badge; clicking a card shows its roster grouped Starters / Bench / IR with position colours; injured players show their status in red.

```bash
git add -A && git commit -q -m "feat(ui): add league screen with team cards and rosters

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Status bar and refresh

**Files:**
- Create: `src/renderer/src/lib/format.ts`, `src/renderer/src/components/StatusBar.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `api.sync.*`, `SyncStatus`.
- Produces: `relativeTime(iso, now?): string`; `StatusBar({ refreshKey: number; onRefreshed: () => void })`.

- [x] **Step 1: Formatting helper**

Create `src/renderer/src/lib/format.ts`:
```ts
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never'
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
```

- [x] **Step 2: Component**

Create `src/renderer/src/components/StatusBar.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SyncStatus } from '@shared/types'

interface StatusBarProps {
  refreshKey: number
  onRefreshed: () => void
}

export function StatusBar({ refreshKey, onRefreshed }: StatusBarProps): React.JSX.Element {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [showError, setShowError] = useState(false)

  const load = useCallback((): void => {
    void api.sync.status().then(setStatus)
  }, [])

  useEffect(load, [load, refreshKey])
  useEffect(() => api.sync.onProgress(load), [load])

  async function refresh(): Promise<void> {
    setBusy(true)
    try {
      await api.sync.refresh(true)
      onRefreshed()
    } finally {
      setBusy(false)
      load()
    }
  }

  const error = status?.lastError ?? null
  const errorIsCurrent = error !== null && (!status?.lastSleeperSync || error.id > status.lastSleeperSync.id)

  return (
    <footer className="flex h-9 shrink-0 items-center gap-4 border-t bg-sidebar px-4 text-xs text-muted-foreground">
      <span>
        NFL {status?.nflState ? `${status.nflState.season} · week ${status.nflState.displayWeek}` : '—'}
      </span>
      <span>Sleeper: {relativeTime(status?.lastSleeperSync?.finishedAt)}</span>
      <span>Stats: not yet</span>
      {errorIsCurrent && (
        <button
          type="button"
          onClick={() => setShowError((s) => !s)}
          className="flex items-center gap-1 text-destructive"
        >
          <AlertTriangle className="size-3.5" /> sync error
        </button>
      )}
      {showError && error && (
        <span className="truncate text-destructive">
          {error.source}: {error.message}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 px-2"
        disabled={busy || !status?.activeLeagueId}
        onClick={() => void refresh()}
      >
        <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} /> Refresh
      </Button>
    </footer>
  )
}
```

- [x] **Step 3: Wire into App**

In `src/renderer/src/App.tsx`, add
```tsx
import { StatusBar } from '@/components/StatusBar'
```
and replace the `<footer …>status bar</footer>` element with:
```tsx
      <StatusBar refreshKey={dataVersion} onRefreshed={bumpData} />
```

- [x] **Step 4: Verify, commit** _(human check pending — see progress notes)_

```bash
source ~/.nvm/nvm.sh && nvm use && npm run typecheck && npm run lint && npm test 2>&1 | tail -4
```
**Human check:** `npm run dev` → footer shows `NFL 2026 · week N`, `Sleeper: just now`; click **Refresh** → spinner, then the League screen re-renders. Turn off Wi-Fi and Refresh again → a red "sync error" appears and clicking it shows the message; the league data is still shown.

```bash
git add -A && git commit -q -m "feat(ui): add status bar with sync state and refresh

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Windows build with real data, tag

**Files:** none new.

- [ ] **Step 1: Build and install on Windows**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -3 && npm run build:win 2>&1 | tail -5 && \
WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r'); \
cp dist/FantasyCompanion-Setup-0.1.0.exe "/mnt/c/Users/$WINUSER/Desktop/" && \
powershell.exe -NoProfile -Command "Start-Process \"\$env:USERPROFILE\Desktop\FantasyCompanion-Setup-0.1.0.exe\""
```
**Human check on Windows:** install over the Task 3 build, launch, run Setup with your username, import, browse the League screen, press Refresh. Data file exists at `%APPDATA%\FantasyCompanion\companion.db`.

- [ ] **Step 2: Tag**

```bash
git tag -a v0.1.0 -m "Plan A: foundation and Sleeper league sync" && git tag
```

---

## Self-review notes

- **Spec coverage (milestones 1–3 + status bar):** skeleton (T1–2), Windows installer (T3, T13), SQLite + migrations + sync_log (T4), Sleeper source (T5), repos (T6), mapping + sync + freshness + transactional per-source writes + independent sources (T7–8), IPC/preload with contextIsolation (T9), Setup with per-step progress and "paste a league ID" (T10), League screen with mine-first and slot grouping (T11), status bar with last sync / NFL week / refresh / error indicator (T12), background refresh on launch when stale (T9 Step 4). Bye weeks and points columns are deliberately absent until Plans B/C provide schedules and scoring.
- **Deferred to Plan B/C:** `rules`, `scoring_rules`, `roster_slots`, `player_ids`, `player_week_*`, `team_week_stats`, `games` tables (added as migration `002+`); the "Stats: not yet" label in the status bar.
- **Type consistency:** `SyncLogEntry.status` includes `'running'`; `finishSync` only accepts `SyncStatusKind`. `Api.setup.importLeague` takes `userId: string | null` in both the preload and the handler. `listTeams` orders `is_me DESC` so the UI needs no re-sort.

## Progress notes (2026-09-15)

- Tasks 1–2, 4–12 implemented and reviewed (subagent-driven; per-task review + final whole-branch review: "Ready to merge — Yes"). 41 Vitest tests, typecheck and lint clean. HEAD `cc3c533`.
- Task 3: `electron-builder.yml` committed; `npm run build:win` needs `wine64` in WSL (`sudo apt-get install -y wine64`), then Steps 2–4.
- Task 13 pending (needs the Task 3 build + a real Sleeper import on Windows).
- Deviations from the plan text (all reviewed): shadcn 4.21 emits `radix-ui` (unified) instead of `@radix-ui/react-slot`; scoped ESLint override for generated ui files; `execArgv --disable-warning=ExperimentalWarning` in Vitest; `productName` added to `package.json` so packaged data lands in `%APPDATA%\FantasyCompanion` (dev: `~/.config/FantasyCompanion`); `importLeague` sets `active_league_id` only after the league step succeeds; Setup navigates to League unless the `sleeper:league` step itself failed; commit subjects shortened to ≤ 50 chars.
- Human checks still pending: T2 dark shell, T10 real import with your Sleeper username, T11/T12 screens, T13 Windows install.
- Open decision: retry on network errors/timeouts (constraint only mandates 429/5xx) — left as-is.
- Electron under this WSL needs `npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu` (GPU process crash otherwise); irrelevant to the Windows build.
