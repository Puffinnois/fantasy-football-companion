# Dev-notes plan — Dev mode and dev notes

**Status:** complete 2026-10-22. Merged to main as `b4042bc` and tagged `v0.31.0` on `ecf30b5` (not pushed yet). Stats-analysis Plans AD and AE keep their letters: this plan is named for its feature. Tasks 1–7 were executed from this text; each task's counts matched the plan (plus the 3 of the untracked `tests/shared/playerImage.test.ts`), and the tree was identical to the prototype's.

Task 8: both walk-throughs passed on a fresh copy of the dev league, before and after the review fixes. The panel is in neither capture (screenshot 1280 × 800, snip exactly the 540 × 300 selected). Esc collapses the panel and leaves the player file open, and focus returns to the text after Snip. Dragging, dark theme, the Stats context, All notes, Go there and Dev mode off all work. Step 5 (the packaged default on Windows) waits for the first install of `v0.31.0`.

Windows Package check green after all fixes (1,097 tests; `"ok":true`, `"query":true`).

Final review (fresh reviewer, Opus): 1 Critical, 1 Important and 8 Minor findings. The Critical, the Important and five Minors are fixed, each test-first in its own commit:

- (Critical) `d0f4fa3`: a note whose text left a code fence open (a pasted snippet) hid every later note. The next note then got a duplicate id, and deleting the first note removed the hidden ones. Unbalanced fences in the text are now closed on save. Every line of a multi-line error message is indented. The parser closes a fence only with the same character, at least as long, and a `##` heading followed by a meta line always starts a section.
- (Important) `eed782f`: a hand-edited meta line could make Delete remove `notes.md` or any other file in the folder. Only `img/<name>.png` files are read or deleted now, and an image another note still lists is kept.
- (Minor) `dc707c3`: Node warnings with a code (`[DEP0040] DeprecationWarning`) are left out, and repeats are collapsed before the cut to ten. `4d23c02`: Ctrl+Shift+N, the chip and ✎ open a collapsed panel expanded (`DevTools` keeps `collapsed`). One capture runs at a time, and main refuses more than six attachments. `9628e79`: a rename over a held `notes.md` (Windows EPERM / EBUSY / EACCES) is retried five times, and the temp file is removed on failure.

Deferred (Minor):

- Attachments are lost when Dev mode is switched off and on before saving (amendment C says until the app closes).
- A CRLF `notes.md` is rewritten as LF.
- Main does not type-check what the renderer sends (`tag`, `stack`), and the `dev:*` handlers also answer while Dev mode is off.

The tests: 1,097 passed, 5 skipped in a clean checkout (1,100 in this working tree).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an official **Dev mode** in the one installed app, and a **notes panel** for it (spec `docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md`).

- **Dev mode:** Ctrl+Shift+D switches it anywhere; it is stored, on under `npm run dev`, off in the packaged app, and `--dev-mode` turns it on for one launch. A DEV chip in both navs opens notes, the notes folder, and turns it off.
- **Notes:** ✎ Note or Ctrl+Shift+N opens a panel that docks bottom-right, drags and collapses while the app stays usable. A note has text (first line = title), a tag (Bug / Idea / Polish), optional screenshots and snipped regions (the panel never appears in them), the context of where it was written, and the app's recent errors.
- **The file:** one `notes.md` per notes folder, one `##` section per note with a machine-readable `<!-- note {...} -->` line, images in `img/`. Built for a person reading it and for Claude Code working from it; hand edits survive the app's rewrites.
- **All notes:** filter, mark done, delete, copy for Claude, go to where the note was written; open or change the folder.
- Ship `v0.31.0`.

**Architecture:**

- **Shared** (`src/shared/devNotes.ts`, pure): note types, a note's section, parsing the file into sections (fence-aware), editing a note's status, removing one, ids, the copy for Claude.
- **Main** (`src/main/dev/`): `mode.ts` (setting + flag), `errorLog.ts` (ring buffer fed by `console.error`, uncaught exceptions, renderer reports, and the sync log), `notesStore.ts` (folder, atomic writes, images, paths kept inside the folder), `ipc.ts` (the `dev:*` handlers: capture with `webContents.capturePage`, clipboard, folder dialogs). `index.ts` starts the error buffer at launch and registers the handlers.
- **Renderer:**
  - `lib/dev/`: `noteContext.tsx` (a registry screens write their parts to with `useNoteContext`, and Stats its screen with `useNoteScreen`), `capture.ts` (hide every `data-dev-overlay` with `html[data-dev-capture]`, wait two frames, capture; the snip's rectangle and crop), `devState.ts` (the context the DEV chip reads).
  - `components/dev/`: `DevTools` (mode, shortcuts, error forwarding, the ✎ button, toast, the panel), `NotesPanel`, `SnipOverlay`, `NotesList`, `DevChip`.
  - App wraps both products in `DevTools` (one instance, so the draft survives a product switch) and implements "Go there". Seven screens register what is open.

**Tech Stack:** Electron 39 (`webContents.capturePage`, `clipboard`, `dialog`, `shell`), React 19, Tailwind 4, `radix-ui` (Popover), `lucide-react`, TypeScript strict, Vitest (jsdom for components). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md` §1–§10. Amended by this plan: Task 7 writes the amendments into the spec as §11.

## Decisions (user, 2026-10-22)

- Dev mode is a switch inside the one app, not a separate build or update channel.
- Notes are a Markdown file, not a database table.
- A note carries optional screenshots, optional snips, the detailed context, a tag and a status, and the recent errors. The popup must never get in the way of a capture. The notes serve a human developer and Claude Code alike.
- Write the plan now; execute it separately.

## Planning findings (prototype, 2026-10-22)

The plan was built as a prototype first (branch `proto/dev-notes`, not pushed) and walked through in the built app on a copy of the dev league.

- **The panel is never in a capture.** With the player file open and the panel docked over it, both a screenshot (1280 × 800) and a snip (540 × 300 for a 540 × 300 selection at a device pixel ratio of 1) came out without the panel, the ✎ button or the snip's own overlay.
- **Esc needs focus in the panel.** After Snip's Use, focus sat on `<body>`, so Esc went to the player file's window listener and closed it while the panel stayed open. After Screenshot and Snip the text takes focus again (on the next frame: a `visibility: hidden` textarea takes no focus), and Esc then collapses the panel and leaves the file open.
- **Error noise.** Node prints `(node:…) ExperimentalWarning: SQLite is an experimental feature` through `console.error` at launch; it was the first "error" of every note. Left out. On Stats with a fresh `stats.duckdb`, each board's "still being built" rejection is logged by Electron (`Error occurred in handler for 'stats:query'`), which filled the ten slots with one message: repeats are now listed once with `(×n)`. Error times were UTC next to a local When line: now local.
- **The draft across products.** App renders a different tree per product, but both are rooted in `DevTools`, so React keeps one instance: the panel, its draft and its position survive "Stats ↗" and "Fantasy ↗".
- **Electron logs every IPC handler failure** through `console.error` (`Error occurred in handler for 'players:news': TypeError: fetch failed`), so a failed screen request reaches the buffer with no extra code.
- **Zoom.** The page zoom is only readable in the preload (`webFrame`); `devicePixelRatio` already includes it, so the context has no separate zoom (amendment A).

## Spec amendments (taken in this plan)

Task 7 Step 2 records these in the spec as §11. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. No zoom field (§3).** `env` is width, height, devicePixelRatio (which includes the page zoom) and theme.
- **B. Errors (§4).** Origins `main`, `renderer`, `sync` (workers' failures reach main's `console.error`). Uncaught exceptions through `uncaughtExceptionMonitor`. Node's process warnings left out. Repeats listed once with `(×n)`. Local times.
- **C. The draft (§2).** Text and tag survive a reload; attachments stay in memory until the app closes.
- **D. When the context is read (§3).** When the panel opens on a new note and on ↻, with the errors; main adds `app`, `league` and the save `time`.
- **E. IPC (§8).** The channel list as built, with `dev:notesImage` (thumbnails), `dev:notesFolder` and `dev:notesCopy` (main writes the clipboard).
- **F. What screens add (§3).** Plus the League screen's selected team and Waivers' mode.
- **G. Esc and focus (§2).** Esc collapses while focus is in the panel; focus returns to the text after a capture; the snip overlay takes Esc and Enter first.
- **H. Go there (§6).** Fantasy: the screen, or Players with the player's file. Stats: the player or team dashboard, else Stats.

## Global Constraints

- **Branch** `feat/dev-notes` off `main`.
- **Commits.** One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan:
  - `.gitignore`, `.design-sync/`, `docs/design/FantasyCompanion UI/`;
  - `docs/research/nfl_predictive_metrics.md:Zone.Identifier`;
  - `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts`;
  - `tsconfig.node.tsbuildinfo`, `tsconfig.web.tsbuildinfo`.

  Stage files by name; never run `git add -A`, `git add .` or `git add src tests` (the last one takes `playerImage` with it).

- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`** (it rewrites the Sleeper fixtures).
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.** Every new file is given whole. Every change to an existing file is a diff that `git apply` takes as written: save it to a file and run `git apply <file>`, or make the same edit by hand. The tasks were replayed in order on a clean copy of `main`, with typecheck, lint and the full suite green after each, and the final tree is byte-identical to the prototype.
- **Test counts** are those of a clean checkout (`main`: 1032 passed, 5 skipped). In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3.
- **Scope.** No screen changes beyond the DEV chip in both navs and one `useNoteContext` call per adopting screen (seven files). No database migration: `dev_mode` and `dev_notes_dir` live in the existing `app_settings`. Nothing outside Dev mode changes behaviour, except that main's `console.error` and uncaught exceptions are now also recorded in memory.
- **Network.** No test touches the network. Task 8's app runs refresh their scratch profile.
- **Gates.**
  - **Task 8:** every screenshot of the walk-through shows what its checklist says, and the saved `notes.md` and images match.
  - **Task 9 Step 2:** the Windows suite and self-test on the Package check workflow.
  - If a gate fails, stop and report the screenshot or the output to the user.
- **Release** `v0.31.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push**: `check/dev-notes` in Task 9, then `main` and the tag.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A hand edit or another note lost on a rewrite.** Examples: marking one note done reformats the others; a section without a meta line disappears; a `## ` line inside the context's code fence splits a note; CRLF line endings after an edit on Windows.
   - Task 1: the hand-edit, fence, broken-meta and CRLF tests. Task 2: a hand edit between two saves.
2. **The panel in its own picture.** Examples: the attribute left on after a failed capture (every overlay stays invisible); a snip that includes the dim layer; a crop off by the display scale.
   - Task 4: `captureWindow` on success and failure; `cropRect` at 1, 1.25 and 2. Task 5: the capture runs while the attribute is set. Task 8: the saved images.
3. **Keys that do two things.** Examples: Esc in the snip also closes a player file; Ctrl+Shift+N while Dev mode is off; Esc collapsing the panel and closing the file.
   - Task 5: the snip's Esc reaches no window listener; Ctrl+Shift+N does nothing while off. Task 8: Esc with the file open.
4. **Writing outside the folder.** A hand-edited meta line naming `../../something` must not be read as a thumbnail or deleted with its note; an attachment that is not a PNG writes nothing. Task 2.
5. **The wrong place in a note.** Examples: Stats' screen reported as the Fantasy screen; a part left behind after its screen unmounted; a remount's part removed by the old cleanup.
   - Task 4: the registry tests. Task 5: the saved `where`. Task 6: "Go there" for each product.
6. **Dev mode leaking into the public app.** Off by default when packaged; the chip, button and panel absent while off. Task 2 (`mode`), Task 5.
7. **Errors that are not errors, or none at all.** Node warnings, repeats, the 15-minute and 1-hour windows. Task 2.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/dev-notes
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/dev-notes`.

---

### Task 1: The notes file (spec §5)

The pure core: a note's Markdown section, the file parsed into sections, a status change or a removal that keeps every other byte, ids, and the copy for Claude.

**Files:**

- Create: `src/shared/devNotes.ts`, `tests/shared/devNotes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/devNotes.test.ts`:

````ts
import { describe, expect, it } from 'vitest'
import {
  appendNote,
  formatNotes,
  listNotes,
  localIso,
  nextNoteId,
  NOTES_HEADER,
  notesForClaude,
  noteTitle,
  parseNotes,
  removeNote,
  serializeNote,
  setNoteStatus,
  whereSummary,
  type NoteContext,
  type NoteError,
  type NoteMeta
} from '@shared/devNotes'

const CONTEXT: NoteContext = {
  product: 'fantasy',
  screen: 'trade',
  parts: {
    deal: { label: 'deal: J. Allen → Team 4', data: { players: ['4984'] } }
  },
  env: { width: 1280, height: 800, devicePixelRatio: 1.25, theme: 'dark' },
  app: { version: '0.30.0', build: 'packaged', platform: 'win32' },
  league: { id: 'L1', name: 'Emoney', season: '2026' },
  time: '2026-10-22T14:03:11+02:00'
}

const ERROR: NoteError = {
  at: '2026-10-22T12:02:58.000Z',
  origin: 'renderer',
  message: "TypeError: Cannot read properties of undefined (reading 'name')",
  stack: 'at TradeCard (TradeSuggestions.tsx:212:31)\nat renderWithHooks'
}

function meta(id: string, over: Partial<NoteMeta> = {}): NoteMeta {
  return {
    id,
    tag: 'bug',
    status: 'open',
    created: '2026-10-22T14:03:11+02:00',
    images: [],
    ...over
  }
}

function section(id: string, text: string, over: Partial<NoteMeta> = {}): string {
  return serializeNote(meta(id, over), {
    text,
    context: CONTEXT,
    errors: [],
    kinds: (over.images ?? []).map(() => 'snip')
  })
}

function fileWith(...sections: string[]): string {
  return sections.reduce((f, s) => formatNotes(appendNote(parseNotes(f), s)), '')
}

describe('a note’s section (dev-mode spec §5)', () => {
  it('writes the heading, the meta line, where and when, the text, images and folded blocks', () => {
    const raw = serializeNote(meta('N-014', { images: ['img/N-014-1.png', 'img/N-014-2.png'] }), {
      text: 'Trade card cuts off long player names\n"Amon-Ra St. Brown" is cut.',
      context: CONTEXT,
      errors: [ERROR],
      kinds: ['snip', 'screenshot']
    })
    const lines = raw.split('\n')
    expect(lines.slice(0, 9)).toEqual([
      '## N-014 · Bug · open — Trade card cuts off long player names',
      '',
      '<!-- note {"id":"N-014","tag":"bug","status":"open","created":"2026-10-22T14:03:11+02:00","images":["img/N-014-1.png","img/N-014-2.png"]} -->',
      '',
      '**Where:** Fantasy › Trade · deal: J. Allen → Team 4',
      '**When:** 2026-10-22 14:03 · v0.30.0 · packaged · win32',
      '',
      'Trade card cuts off long player names',
      '"Amon-Ra St. Brown" is cut.'
    ])
    expect(raw).toContain('![Snip 1](img/N-014-1.png)\n![Screenshot 2](img/N-014-2.png)\n')
    expect(raw).toContain(
      '<details><summary>Context</summary>\n\n```json\n{\n  "product": "fantasy"'
    )
    expect(raw).toContain(
      '<details><summary>Recent errors (1)</summary>\n\n```text\n' +
        `${new Date(ERROR.at).toTimeString().slice(0, 8)} renderer TypeError: Cannot read properties of undefined (reading 'name')\n` +
        '    at TradeCard (TradeSuggestions.tsx:212:31)\n    at renderWithHooks\n```'
    )
    expect(raw.endsWith('</details>\n')).toBe(true)
  })

  it('leaves the errors block out when there are none', () => {
    expect(section('N-001', 'An idea')).not.toContain('Recent errors')
  })

  it('escapes lines of the text that would start a section or a title', () => {
    const raw = section('N-001', 'Title\n## not a section\n# nor a title\n### fine')
    expect(raw).toContain('\\## not a section\n\\# nor a title\n### fine')
    const [note] = listNotes(parseNotes(fileWith(raw)))
    expect(note.text).toBe('Title\n## not a section\n# nor a title\n### fine')
  })
})

describe('the notes file', () => {
  it('starts with the header and reads back what was written', () => {
    const content = fileWith(section('N-001', 'First\nmore'), section('N-002', 'Second'))
    expect(content.startsWith(`${NOTES_HEADER}\n## N-001`)).toBe(true)
    expect(content).toContain('</details>\n\n## N-002')
    const notes = listNotes(parseNotes(content))
    expect(notes.map((n) => [n.id, n.title, n.text, n.status, n.tag])).toEqual([
      ['N-001', 'First', 'First\nmore', 'open', 'bug'],
      ['N-002', 'Second', 'Second', 'open', 'bug']
    ])
    expect(notes[0].where).toBe('Fantasy › Trade · deal: J. Allen → Team 4')
    expect(notes[0].context).toEqual(CONTEXT)
  })

  it('formats an untouched file byte for byte, CRLF aside', () => {
    const content = fileWith(section('N-001', 'One'), section('N-002', 'Two'))
    expect(formatNotes(parseNotes(content))).toBe(content)
  })

  it('does not split on a ## line inside a code fence', () => {
    const raw = section('N-001', 'One').replace('```json\n', '```json\n## inside the fence\n')
    const file = parseNotes(fileWith(raw))
    expect(file.sections).toHaveLength(1)
  })

  it('keeps hand edits, foreign sections and the header when another note changes', () => {
    const content = fileWith(section('N-001', 'One'), section('N-002', 'Two'))
      // A person rewrote the header, edited the text, folded nothing, and added their own section.
      .replace('# FantasyCompanion — dev notes', '# My notes\n\nRead me first.')
      .replace('\nOne\n', '\nOne, but longer\nDone in v0.31.0 (abc123)\n')
      .replace(/<details><summary>Context[\s\S]*?<\/details>\n/, '')
      .concat('\n## Ideas for later\n\nNo meta line here.\n')
    const changed = formatNotes(setNoteStatus(parseNotes(content), 'N-002', 'done'))
    const [before, after] = [content, changed].map((c) => c.split('## N-002')[0])
    expect(after).toBe(before)
    expect(changed.endsWith('\n## Ideas for later\n\nNo meta line here.\n')).toBe(true)
    const notes = listNotes(parseNotes(changed))
    expect(notes[0]).toMatchObject({
      text: 'One, but longer\nDone in v0.31.0 (abc123)',
      context: null
    })
    expect(notes[1].status).toBe('done')
    expect(changed).toContain('## N-002 · Bug · done — Two')
    expect(changed).toContain('"status":"done"')
  })

  it('takes the status and tag from the meta line, not the heading', () => {
    const content = fileWith(section('N-001', 'One')).replace(
      '"tag":"bug","status":"open"',
      '"tag":"polish","status":"done"'
    )
    expect(listNotes(parseNotes(content))[0]).toMatchObject({ tag: 'polish', status: 'done' })
  })

  it('skips a section whose meta line no longer parses, and keeps it', () => {
    const content = fileWith(section('N-001', 'One'), section('N-002', 'Two')).replace(
      '{"id":"N-001"',
      '{"id":"N-001",,'
    )
    const file = parseNotes(content)
    expect(listNotes(file).map((n) => n.id)).toEqual(['N-002'])
    expect(formatNotes(removeNote(file, 'N-002'))).toContain('{"id":"N-001",,')
  })

  it('removes a note and keeps the others', () => {
    const file = parseNotes(fileWith(section('N-001', 'One'), section('N-002', 'Two')))
    expect(listNotes(removeNote(file, 'N-001')).map((n) => n.id)).toEqual(['N-002'])
  })

  it('reads CRLF line endings', () => {
    const content = fileWith(section('N-001', 'One')).replace(/\n/g, '\r\n')
    expect(listNotes(parseNotes(content))[0].title).toBe('One')
  })
})

describe('ids, titles, times', () => {
  it('numbers a note one past the highest id, foreign headings included', () => {
    expect(nextNoteId(parseNotes(''))).toBe('N-001')
    const content = fileWith(section('N-001', 'One'), section('N-009', 'Nine')).concat(
      '\n## N-012 hand-written\n'
    )
    expect(nextNoteId(parseNotes(content))).toBe('N-013')
  })

  it('titles a note with its first line, trimmed to 80 characters', () => {
    expect(noteTitle('\n  First line  \nsecond')).toBe('First line')
    expect(noteTitle('x'.repeat(100))).toBe(`${'x'.repeat(79)}…`)
  })

  it('summarises where the note was written', () => {
    expect(
      whereSummary({
        product: 'stats',
        screen: 'player',
        parts: { player: { label: "Ja'Marr Chase", data: {} }, empty: { label: '', data: {} } }
      })
    ).toBe("Stats › Player · Ja'Marr Chase")
  })

  it('writes local time with its offset', () => {
    expect(localIso(new Date(2026, 9, 22, 14, 3, 11))).toMatch(/^2026-10-22T14:03:11[+-]\d\d:\d\d$/)
  })
})

describe('copying notes for Claude (spec §6)', () => {
  it('gives the chosen sections, oldest first, with absolute image paths', () => {
    const file = parseNotes(
      fileWith(
        section('N-001', 'One', { images: ['img/N-001-1.png'] }),
        section('N-002', 'Two'),
        section('N-003', 'Three')
      )
    )
    const text = notesForClaude(file, ['N-003', 'N-001'], (p) => `C:\\notes\\${p}`)
    expect(text.indexOf('## N-001')).toBe(0)
    expect(text).toContain('![Snip 1](C:\\notes\\img/N-001-1.png)')
    expect(text).toContain('</details>\n\n## N-003')
    expect(text).not.toContain('N-002')
    expect(text.endsWith('</details>\n')).toBe(true)
  })
})
````

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/shared/devNotes.test.ts
```

Expected: FAIL — `Failed to resolve import "@shared/devNotes"`.

- [ ] **Step 3: Implement**

Create `src/shared/devNotes.ts`:

````ts
/**
 * Dev notes (dev-mode spec §5): one Markdown file, one `##` section per note, oldest first. Each
 * section carries a `<!-- note {...} -->` line the app reads back; everything else is free text a
 * person or Claude may edit. Pure: main reads and writes the file, the renderer only sees notes.
 */

export type NoteTag = 'bug' | 'idea' | 'polish'
export type NoteStatus = 'open' | 'done'

export const NOTE_TAGS: NoteTag[] = ['bug', 'idea', 'polish']

const TAG_LABEL: Record<NoteTag, string> = { bug: 'Bug', idea: 'Idea', polish: 'Polish' }

export function tagLabel(tag: NoteTag): string {
  return TAG_LABEL[tag]
}

/** One thing a screen says is open (spec §3), e.g. the player file: a label for the summary line. */
export interface NoteContextPart {
  label: string
  data: Record<string, unknown>
}

/** What the renderer knows when the panel opens or ↻ is pressed (spec §3). */
export interface NoteWhere {
  product: 'fantasy' | 'stats'
  /** The product's screen id: `players`, `trade`, `player` (Stats) … */
  screen: string
  /** Keyed by part (`player`, `week`, `deal`, `scope` …), in the order screens registered them. */
  parts: Record<string, NoteContextPart>
  env: {
    width: number
    height: number
    /** The display scale times the page zoom. */
    devicePixelRatio: number
    theme: 'light' | 'dark'
  }
}

/** The full context written in a note: the renderer's part plus what main knows. */
export interface NoteContext extends NoteWhere {
  app: { version: string; build: 'dev' | 'packaged'; platform: string }
  league: { id: string; name: string; season: string } | null
  /** Local ISO time with its offset. */
  time: string
}

/** One entry of the recent-errors buffer (spec §4). */
export interface NoteError {
  /** ISO time. */
  at: string
  origin: 'main' | 'renderer' | 'sync'
  message: string
  /** First stack lines, or null. */
  stack: string | null
}

export type NoteImageKind = 'screenshot' | 'snip'

/** An attachment before it is saved: a PNG as a data URL. */
export interface NoteImageDraft {
  kind: NoteImageKind
  dataUrl: string
}

/** What the panel sends to save. */
export interface NewNote {
  text: string
  tag: NoteTag
  where: NoteWhere
  errors: NoteError[]
  images: NoteImageDraft[]
}

/** The machine-readable line of a section. */
export interface NoteMeta {
  id: string
  tag: NoteTag
  status: NoteStatus
  /** Local ISO time with offset. */
  created: string
  /** Relative to the notes folder, e.g. `img/N-014-1.png`. */
  images: string[]
}

/** A note as the app lists it. */
export interface DevNote extends NoteMeta {
  title: string
  /** The developer's words, as they stand in the file now (hand edits included). */
  text: string
  /** The `**Where:**` line, or '' when it was removed. */
  where: string
  /** The context block, when it still parses. */
  context: NoteContext | null
}

/** A run of the file: the header, a note, or a section the app does not recognise (kept as is). */
export interface NotesSection {
  raw: string
  note: DevNote | null
}

export interface NotesFile {
  /** Everything before the first section. */
  header: string
  sections: NotesSection[]
}

export const NOTES_HEADER = `# FantasyCompanion — dev notes

Notes written in the app's Dev mode. One \`##\` section per note, oldest first.
Each section has a machine-readable \`<!-- note {...} -->\` line; keep it when editing by hand.
To close a note, set \`"status":"done"\` in that line (or use the app). Images are in \`img/\`.
`

const TITLE_MAX = 80
const META_LINE = /^<!-- note (\{.*\}) -->[ \t]*$/m
const FENCE = /^(```|~~~)/

/** The first non-empty line of the text, trimmed to 80 characters. */
export function noteTitle(text: string): string {
  const first =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? ''
  return first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX - 1).trimEnd()}…` : first
}

/** `Fantasy › Players · Josh Allen · wk 8` (spec §3). */
export function whereSummary(where: Pick<NoteWhere, 'product' | 'screen' | 'parts'>): string {
  const product = where.product === 'fantasy' ? 'Fantasy' : 'Stats'
  const screen = where.screen.charAt(0).toUpperCase() + where.screen.slice(1)
  const parts = Object.values(where.parts)
    .map((p) => p.label)
    .filter((l) => l !== '')
  return [`${product} › ${screen}`, ...parts].join(' · ')
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

/** `2026-10-22T14:03:11+02:00`: local time with its offset. */
export function localIso(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/** `2026-10-22 14:03` from a local ISO time, without re-reading it in another zone. */
function shortTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

/** Lines that would start a new section, or a title, are escaped so the file keeps its shape. */
function escapeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
    .map((l) => (/^#{1,2}(\s|$)/.test(l) ? `\\${l}` : l))
    .join('\n')
}

function headingLine(meta: Pick<NoteMeta, 'id' | 'tag' | 'status'>, title: string): string {
  return `## ${meta.id} · ${tagLabel(meta.tag)} · ${meta.status} — ${title}`
}

function metaLine(meta: NoteMeta): string {
  return `<!-- note ${JSON.stringify(meta)} -->`
}

function errorLines(errors: NoteError[]): string {
  return errors
    .map((e) => {
      // Local, like the note's When line.
      const time = new Date(e.at).toTimeString().slice(0, 8)
      const head = `${time} ${e.origin.padEnd(8)} ${e.message}`
      return e.stack ? `${head}\n${e.stack.replace(/^/gm, '    ')}` : head
    })
    .join('\n')
}

/** The image's alt text in the file: `Screenshot 1`, `Snip 2`. */
export function imageAlt(kind: NoteImageKind, n: number): string {
  return `${kind === 'snip' ? 'Snip' : 'Screenshot'} ${n}`
}

/**
 * A new note's section (spec §5), ending with one newline. `images` are the saved files' relative
 * paths with their kinds, in the order they were attached.
 */
export function serializeNote(
  meta: NoteMeta,
  input: { text: string; context: NoteContext; errors: NoteError[]; kinds: NoteImageKind[] }
): string {
  const { context } = input
  const when = [
    shortTime(context.time),
    `v${context.app.version}`,
    context.app.build,
    context.app.platform
  ].join(' · ')
  const lines = [
    headingLine(meta, noteTitle(input.text)),
    '',
    metaLine(meta),
    '',
    `**Where:** ${whereSummary(context)}`,
    `**When:** ${when}`,
    '',
    escapeText(input.text),
    ''
  ]
  if (meta.images.length > 0) {
    meta.images.forEach((path, i) => lines.push(`![${imageAlt(input.kinds[i], i + 1)}](${path})`))
    lines.push('')
  }
  lines.push(
    '<details><summary>Context</summary>',
    '',
    '```json',
    JSON.stringify(context, null, 2),
    '```',
    '',
    '</details>',
    ''
  )
  if (input.errors.length > 0) {
    lines.push(
      `<details><summary>Recent errors (${input.errors.length})</summary>`,
      '',
      '```text',
      errorLines(input.errors),
      '```',
      '',
      '</details>',
      ''
    )
  }
  return lines.join('\n')
}

function isTag(v: unknown): v is NoteTag {
  return v === 'bug' || v === 'idea' || v === 'polish'
}

function readMeta(raw: string): NoteMeta | null {
  const m = META_LINE.exec(raw)
  if (!m) return null
  try {
    const json = JSON.parse(m[1]) as Record<string, unknown>
    if (typeof json.id !== 'string' || json.id === '') return null
    return {
      id: json.id,
      tag: isTag(json.tag) ? json.tag : 'idea',
      status: json.status === 'done' ? 'done' : 'open',
      created: typeof json.created === 'string' ? json.created : '',
      images: Array.isArray(json.images)
        ? json.images.filter((p): p is string => typeof p === 'string')
        : []
    }
  } catch {
    return null
  }
}

/** The JSON fence inside the `Context` details block, when it still parses. */
function readContext(raw: string): NoteContext | null {
  const m = /<summary>Context<\/summary>[\s\S]*?```json\n([\s\S]*?)\n```/.exec(raw)
  if (!m) return null
  try {
    return JSON.parse(m[1]) as NoteContext
  } catch {
    return null
  }
}

/**
 * The developer's words: the section without its heading, meta line, Where / When lines, images
 * and details blocks. Hand-written lines (a "Done in …" line, say) are kept.
 */
function readText(raw: string): string {
  const out: string[] = []
  let details = 0
  for (const line of raw.split('\n').slice(1)) {
    if (/^<details>/.test(line)) details++
    if (details > 0) {
      if (/^<\/details>/.test(line)) details--
      continue
    }
    if (META_LINE.test(line) || /^\*\*(Where|When):\*\*/.test(line) || /^!\[.*\]\(.*\)$/.test(line))
      continue
    out.push(line.replace(/^\\(#{1,2}(\s|$))/, '$1'))
  }
  return out.join('\n').trim()
}

function readNote(raw: string): DevNote | null {
  const meta = readMeta(raw)
  if (!meta) return null
  const heading = raw.split('\n', 1)[0]
  const dash = heading.indexOf(' — ')
  const where = /^\*\*Where:\*\* (.*)$/m.exec(raw)
  return {
    ...meta,
    title: dash >= 0 ? heading.slice(dash + 3).trim() : heading.replace(/^##\s*/, ''),
    text: readText(raw),
    where: where ? where[1] : '',
    context: readContext(raw)
  }
}

/** Splits on lines starting with `## ` outside code fences (spec §5 "Hand edits"). */
export function parseNotes(content: string): NotesFile {
  const text = content.replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const starts: number[] = []
  let fenced = false
  lines.forEach((line, i) => {
    if (FENCE.test(line)) fenced = !fenced
    else if (!fenced && /^## /.test(line)) starts.push(i)
  })
  if (starts.length === 0) return { header: text, sections: [] }
  const header = lines.slice(0, starts[0]).join('\n')
  const sections = starts.map((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length
    const raw = lines.slice(start, end).join('\n')
    return { raw, note: readNote(raw) }
  })
  return { header, sections }
}

/** The file again: unchanged sections byte for byte. */
export function formatNotes(file: NotesFile): string {
  return [file.header, ...file.sections.map((s) => s.raw)].join('\n')
}

export function listNotes(file: NotesFile): DevNote[] {
  return file.sections.flatMap((s) => (s.note ? [s.note] : []))
}

/** `N-` and three digits, one more than the highest id in the file (foreign sections too). */
export function nextNoteId(file: NotesFile): string {
  let max = 0
  for (const s of file.sections) {
    const m = /^## N-(\d+)/.exec(s.raw) ?? (s.note ? /^N-(\d+)$/.exec(s.note.id) : null)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `N-${pad(max + 1, 3)}`
}

/** Appends a section, with a blank line before it. */
export function appendNote(file: NotesFile, raw: string): NotesFile {
  const header =
    file.sections.length === 0 ? withBlankEnd(file.header || NOTES_HEADER) : file.header
  const sections = file.sections.map((s, i) =>
    i === file.sections.length - 1 ? { ...s, raw: withBlankEnd(s.raw) } : s
  )
  return {
    header,
    sections: [...sections, { raw: raw.replace(/\n+$/, '\n'), note: readNote(raw) }]
  }
}

/** The text ends with exactly one empty line, so the next `##` is separated from it. */
function withBlankEnd(raw: string): string {
  return `${raw.replace(/\n+$/, '')}\n`
}

/**
 * Sets a note's status: its heading and meta line are regenerated, its body is left as it is.
 * Returns the file unchanged when no note has the id.
 */
export function setNoteStatus(file: NotesFile, id: string, status: NoteStatus): NotesFile {
  return {
    ...file,
    sections: file.sections.map((s) => {
      if (s.note?.id !== id) return s
      const meta: NoteMeta = {
        id: s.note.id,
        tag: s.note.tag,
        status,
        created: s.note.created,
        images: s.note.images
      }
      const lines = s.raw.split('\n')
      lines[0] = headingLine(meta, s.note.title)
      const raw = lines.join('\n').replace(META_LINE, metaLine(meta))
      return { raw, note: readNote(raw) }
    })
  }
}

/** Removes a note's section; its images are main's to delete. */
export function removeNote(file: NotesFile, id: string): NotesFile {
  return { ...file, sections: file.sections.filter((s) => s.note?.id !== id) }
}

/**
 * The notes' sections as one Markdown text for a Claude session (spec §6), oldest first, with
 * each image link made absolute by `absolute`.
 */
export function notesForClaude(
  file: NotesFile,
  ids: string[],
  absolute: (path: string) => string
): string {
  return file.sections
    .filter((s) => s.note !== null && ids.includes(s.note.id))
    .map((s) => {
      const images = new Set(s.note?.images ?? [])
      return s.raw
        .replace(/^(!\[[^\]]*\]\()([^)]+)\)$/gm, (line, head: string, path: string) =>
          images.has(path) ? `${head}${absolute(path)})` : line
        )
        .trimEnd()
    })
    .join('\n\n')
    .concat('\n')
}
````

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/shared/devNotes.test.ts && npm run typecheck && npx eslint src tests electron.vite.config.ts
```

Expected: 16 passed; typecheck and lint clean. The full suite: 1048 passed, 5 skipped.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/shared/devNotes.ts tests/shared/devNotes.test.ts
git add src/shared/devNotes.ts tests/shared/devNotes.test.ts
git commit -m "feat(dev): read and write the dev notes file"
```

---

### Task 2: Dev mode, recent errors and the notes folder in main (spec §1, §4, §5)

**Files:**

- Create: `src/main/dev/mode.ts`, `src/main/dev/errorLog.ts`, `src/main/dev/notesStore.ts`, `tests/main/dev/mode.test.ts`, `tests/main/dev/errorLog.test.ts`, `tests/main/dev/notesStore.test.ts`
- Modify: `src/main/db/repos/syncLog.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/dev/mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting } from '@main/db/repos/settings'
import { createDevMode, SETTING_DEV_MODE } from '@main/dev/mode'

function db(): ReturnType<typeof openDatabase> {
  const d = openDatabase(':memory:')
  migrate(d)
  return d
}

describe('dev mode (dev-mode spec §1)', () => {
  it('is off in the packaged app and on unpackaged until it is switched', () => {
    expect(createDevMode({ db: db(), packaged: true, argv: [] }).get()).toBe(false)
    expect(createDevMode({ db: db(), packaged: false, argv: [] }).get()).toBe(true)
  })

  it('is stored, and the stored choice wins over the default', () => {
    const d = db()
    const mode = createDevMode({ db: d, packaged: true, argv: [] })
    mode.set(true)
    expect(getSetting(d, SETTING_DEV_MODE)).toBe('1')
    expect(createDevMode({ db: d, packaged: true, argv: [] }).get()).toBe(true)
    const dev = createDevMode({ db: d, packaged: false, argv: [] })
    dev.set(false)
    expect(dev.get()).toBe(false)
  })

  it('--dev-mode turns it on for this launch only, until it is switched', () => {
    const d = db()
    const mode = createDevMode({ db: d, packaged: true, argv: ['app.exe', '--dev-mode'] })
    expect(mode.get()).toBe(true)
    expect(getSetting(d, SETTING_DEV_MODE)).toBeNull()
    mode.set(false)
    expect(mode.get()).toBe(false)
    expect(createDevMode({ db: d, packaged: true, argv: [] }).get()).toBe(false)
  })
})
```

Create `tests/main/dev/errorLog.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { finishSync, startSync } from '@main/db/repos/syncLog'
import {
  captureMainErrors,
  collapseRepeats,
  createErrorLog,
  errorEntry,
  recentErrors,
  RECENT_MS,
  trimStack
} from '@main/dev/errorLog'
import type { NoteError } from '@shared/devNotes'

const T0 = Date.parse('2026-10-22T12:00:00.000Z')

function entry(minutesAgo: number, message = `m${minutesAgo}`): NoteError {
  return {
    at: new Date(T0 - minutesAgo * 60_000).toISOString(),
    origin: 'main',
    message,
    stack: null
  }
}

describe('the recent-errors buffer (dev-mode spec §4)', () => {
  it('keeps the last 30', () => {
    const log = createErrorLog()
    for (let i = 0; i < 35; i++) log.push(entry(0, `e${i}`))
    expect(log.recent(T0)).toHaveLength(10)
    expect(log.recent(T0)[0].message).toBe('e34')
  })

  it('attaches the last 15 minutes, newest first, at most 10', () => {
    const log = createErrorLog()
    log.push(entry(20))
    log.push(entry(15))
    log.push(entry(3))
    log.push(entry(1))
    expect(log.recent(T0).map((e) => e.message)).toEqual(['m1', 'm3', 'm15'])
    expect(log.recent(T0 + RECENT_MS)).toEqual([])
  })

  it('trims a stack to its first eight lines', () => {
    const stack = Array.from({ length: 12 }, (_, i) => `   at f${i} (x.ts:${i})`).join('\n')
    expect(trimStack(stack)?.split('\n')).toEqual(
      Array.from({ length: 8 }, (_, i) => `at f${i} (x.ts:${i})`)
    )
    expect(trimStack('')).toBeNull()
    expect(trimStack(null)).toBeNull()
  })

  it('reads console.error’s arguments', () => {
    const err = new TypeError('boom')
    const e = errorEntry(['stats refresh failed', err, { code: 7 }], 'main', new Date(T0))
    expect(e).toMatchObject({
      at: '2026-10-22T12:00:00.000Z',
      origin: 'main',
      message: 'stats refresh failed TypeError: boom {"code":7}'
    })
    expect(e.stack?.split('\n')[0]).toMatch(/^at /)
  })
})

describe('capturing main’s errors', () => {
  const original = console.error
  afterEach(() => {
    console.error = original
  })

  it('records console.error and still prints it', () => {
    const printed = vi.fn()
    console.error = printed
    const log = createErrorLog()
    captureMainErrors(log, () => new Date(T0))
    console.error('could not start', new Error('nope'))
    expect(printed).toHaveBeenCalledTimes(1)
    expect(log.recent(T0)[0].message).toBe('could not start Error: nope')
  })

  it('leaves out Node’s process warnings', () => {
    console.error = vi.fn()
    const log = createErrorLog()
    captureMainErrors(log, () => new Date(T0))
    console.error('(node:44633) ExperimentalWarning: SQLite is an experimental feature')
    expect(log.recent(T0)).toEqual([])
  })
})

describe('the errors a note attaches', () => {
  it('adds the sync log’s failures of the last hour, newest first, at most 10', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const fail = (source: string, minutesAgo: number): void => {
      const at = new Date(T0 - minutesAgo * 60_000).toISOString()
      finishSync(db, startSync(db, source, at), 'error', at, 'HTTP 503', 0)
    }
    fail('sleeper:league', 90)
    fail('nflverse:stats:2026', 30)
    const ok = startSync(db, 'sleeper:players', new Date(T0).toISOString())
    finishSync(db, ok, 'ok', new Date(T0).toISOString(), null, 10)
    const log = createErrorLog()
    log.push(entry(5))
    expect(recentErrors({ db, errors: log }, new Date(T0))).toEqual([
      entry(5),
      {
        at: new Date(T0 - 30 * 60_000).toISOString(),
        origin: 'sync',
        message: 'nflverse:stats:2026: HTTP 503',
        stack: null
      }
    ])
    for (let i = 0; i < 12; i++) log.push(entry(1, `e${i}`))
    log.push(entry(1, 'e0'))
    expect(recentErrors({ db, errors: log }, new Date(T0))).toHaveLength(10)
  })
})

describe('repeats', () => {
  it('lists the same error once, the newest, with its count', () => {
    expect(collapseRepeats([entry(1, 'same'), entry(2, 'other'), entry(3, 'same')])).toEqual([
      { ...entry(1, 'same'), message: 'same (×2)' },
      entry(2, 'other')
    ])
  })
})
```

Create `tests/main/dev/notesStore.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createNotesStore, NOTES_FILE } from '@main/dev/notesStore'
import type { NewNote } from '@shared/devNotes'

// A 1×1 PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ffc-notes-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const EXTRA = {
  app: { version: '0.31.0', build: 'dev' as const, platform: 'linux' },
  league: null,
  time: '2026-10-22T14:03:11+02:00'
}

function note(text: string, images: NewNote['images'] = []): NewNote {
  return {
    text,
    tag: 'idea',
    where: {
      product: 'stats',
      screen: 'home',
      parts: {},
      env: { width: 1280, height: 800, devicePixelRatio: 1, theme: 'light' }
    },
    errors: [],
    images
  }
}

describe('the notes folder (dev-mode spec §5)', () => {
  it('creates the folder and the file, writes images before the note links them', () => {
    const dir = join(tempDir(), 'dev-notes')
    const store = createNotesStore(() => dir)
    const saved = store.save(
      note('First', [
        { kind: 'screenshot', dataUrl: PNG },
        { kind: 'snip', dataUrl: PNG }
      ]),
      EXTRA
    )
    expect(saved).toMatchObject({
      id: 'N-001',
      images: ['img/N-001-1.png', 'img/N-001-2.png'],
      where: 'Stats › Home'
    })
    expect(existsSync(join(dir, 'img', 'N-001-2.png'))).toBe(true)
    const content = readFileSync(join(dir, NOTES_FILE), 'utf8')
    expect(content).toContain('![Screenshot 1](img/N-001-1.png)\n![Snip 2](img/N-001-2.png)')
    expect(store.image('img/N-001-1.png')).toBe(PNG)
  })

  it('lists newest first and numbers on', () => {
    const dir = tempDir()
    const store = createNotesStore(() => dir)
    store.save(note('First'), EXTRA)
    store.save(note('Second'), EXTRA)
    expect(store.list().map((n) => [n.id, n.title])).toEqual([
      ['N-002', 'Second'],
      ['N-001', 'First']
    ])
  })

  it('keeps a hand edit made between two saves', () => {
    const dir = tempDir()
    const store = createNotesStore(() => dir)
    store.save(note('First'), EXTRA)
    const path = join(dir, NOTES_FILE)
    writeFileSync(path, readFileSync(path, 'utf8').replace('\nFirst\n', '\nFirst, edited\n'))
    store.save(note('Second'), EXTRA)
    expect(readFileSync(path, 'utf8')).toContain('\nFirst, edited\n')
    expect(existsSync(`${path}.${process.pid}.tmp`)).toBe(false)
  })

  it('marks done and removes a note with its images', () => {
    const dir = tempDir()
    const store = createNotesStore(() => dir)
    store.save(note('First', [{ kind: 'snip', dataUrl: PNG }]), EXTRA)
    store.save(note('Second'), EXTRA)
    store.setStatus('N-002', 'done')
    expect(store.list()[0].status).toBe('done')
    store.remove('N-001')
    expect(store.list().map((n) => n.id)).toEqual(['N-002'])
    expect(existsSync(join(dir, 'img', 'N-001-1.png'))).toBe(false)
  })

  it('refuses an attachment that is not a PNG and writes no note', () => {
    const dir = tempDir()
    const store = createNotesStore(() => dir)
    expect(() =>
      store.save(note('x', [{ kind: 'snip', dataUrl: 'data:text/html;base64,PGI+' }]), EXTRA)
    ).toThrow('not a PNG')
    expect(existsSync(join(dir, NOTES_FILE))).toBe(false)
  })

  it('never reads or deletes outside the folder', () => {
    const outer = tempDir()
    const dir = join(outer, 'notes')
    writeFileSync(join(outer, 'secret.png'), 'x')
    const store = createNotesStore(() => dir)
    expect(store.image('../secret.png')).toBeNull()
    expect(store.image(join(outer, 'secret.png'))).toBeNull()
  })

  it('follows a folder change', () => {
    const [a, b] = [tempDir(), tempDir()]
    let current = a
    const store = createNotesStore(() => current)
    store.save(note('In A'), EXTRA)
    current = b
    expect(store.list()).toEqual([])
    store.save(note('In B'), EXTRA)
    expect(store.list().map((n) => n.id)).toEqual(['N-001'])
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/dev
```

Expected: FAIL — the three `@main/dev/*` modules do not resolve.

- [ ] **Step 3: Implement**

The sync log gains the failures since a time:

```diff
diff --git a/src/main/db/repos/syncLog.ts b/src/main/db/repos/syncLog.ts
index 84ba690..e5186dc 100644
--- a/src/main/db/repos/syncLog.ts
+++ b/src/main/db/repos/syncLog.ts
@@ -69,6 +69,16 @@ export function getLastFinishedSync(db: Db, source: string): SyncLogEntry | null
   return row ? toEntry(row) : null
 }

+/** Failed entries finished at or after `since` (ISO), newest first (dev-mode spec §4). */
+export function listErrorsSince(db: Db, since: string): SyncLogEntry[] {
+  const rows = db
+    .prepare(
+      "SELECT * FROM sync_log WHERE status = 'error' AND finished_at >= ? ORDER BY id DESC LIMIT 10"
+    )
+    .all(since) as unknown as Row[]
+  return rows.map(toEntry)
+}
+
 export function getLastError(db: Db): SyncLogEntry | null {
   const row = db
     .prepare("SELECT * FROM sync_log WHERE status = 'error' ORDER BY id DESC LIMIT 1")
```

Create `src/main/dev/mode.ts`:

```ts
import type { Db } from '@main/db/connection'
import { getSetting, setSetting } from '@main/db/repos/settings'

export const SETTING_DEV_MODE = 'dev_mode'
export const DEV_MODE_FLAG = '--dev-mode'

export interface DevMode {
  get(): boolean
  set(on: boolean): void
}

/**
 * Dev mode (dev-mode spec §1): stored as `dev_mode`; absent → on in an unpackaged app, off in the
 * packaged one. `--dev-mode` turns it on for this launch only, until it is switched.
 */
export function createDevMode(deps: { db: Db; packaged: boolean; argv: string[] }): DevMode {
  let forced = deps.argv.includes(DEV_MODE_FLAG)
  return {
    get: () => {
      if (forced) return true
      const stored = getSetting(deps.db, SETTING_DEV_MODE)
      return stored === null ? !deps.packaged : stored === '1'
    },
    set: (on) => {
      forced = false
      setSetting(deps.db, SETTING_DEV_MODE, on ? '1' : '0')
    }
  }
}
```

Create `src/main/dev/errorLog.ts`:

```ts
import type { Db } from '@main/db/connection'
import { listErrorsSince } from '@main/db/repos/syncLog'
import type { NoteError } from '@shared/devNotes'

const MAX_ENTRIES = 30
const NODE_WARNING = /^\(node:\d+\) \w*Warning:/
const STACK_LINES = 8
/** A note attaches the errors of the last 15 minutes, at most 10 (dev-mode spec §4). */
export const RECENT_MS = 15 * 60 * 1000
export const RECENT_MAX = 10

export interface ErrorLog {
  push(entry: NoteError): void
  /** Newest first, within `RECENT_MS` of `now`, at most `RECENT_MAX`. */
  recent(now: number): NoteError[]
}

export function createErrorLog(): ErrorLog {
  const entries: NoteError[] = []
  return {
    push: (entry) => {
      entries.push({ ...entry, stack: trimStack(entry.stack) })
      if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
    },
    recent: (now) =>
      entries
        .filter((e) => now - Date.parse(e.at) <= RECENT_MS)
        .reverse()
        .slice(0, RECENT_MAX)
  }
}

/** The first eight lines of a stack, each trimmed; null when there is none. */
export function trimStack(stack: string | null | undefined): string | null {
  if (!stack) return null
  const lines = stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  return lines.length === 0 ? null : lines.slice(0, STACK_LINES).join('\n')
}

/** `console.error`'s arguments as one entry: errors by name and message, the first one's stack. */
export function errorEntry(args: unknown[], origin: NoteError['origin'], at: Date): NoteError {
  const message = args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
  const error = args.find((a): a is Error => a instanceof Error)
  // An Error's stack repeats its message on the first line.
  const stack = error?.stack?.split('\n').slice(1).join('\n') ?? null
  return { at: at.toISOString(), origin, message, stack: trimStack(stack) }
}

/**
 * Records every `console.error` and uncaught exception of the main process (spec §4), whatever
 * the mode, and still prints them. `uncaughtExceptionMonitor` observes without changing Electron's
 * handling.
 */
export function captureMainErrors(log: ErrorLog, now: () => Date = () => new Date()): void {
  const original = console.error.bind(console)
  console.error = (...args: unknown[]): void => {
    // Node prints its process warnings (ExperimentalWarning …) through console.error: not errors.
    if (!(typeof args[0] === 'string' && NODE_WARNING.test(args[0])))
      log.push(errorEntry(args, 'main', now()))
    original(...args)
  }
  process.on('uncaughtExceptionMonitor', (err) => log.push(errorEntry([err], 'main', now())))
}

/** Sync failures of the last hour join a note's errors (dev-mode spec §4). */
const SYNC_ERRORS_MS = 60 * 60 * 1000

/** The errors a note attaches now: the buffer's and the sync log's, newest first, at most 10. */
export function recentErrors(deps: { db: Db; errors: ErrorLog }, now: Date): NoteError[] {
  const sync: NoteError[] = listErrorsSince(
    deps.db,
    new Date(now.getTime() - SYNC_ERRORS_MS).toISOString()
  ).map((e) => ({
    at: e.finishedAt ?? e.startedAt,
    origin: 'sync',
    message: `${e.source}: ${e.message ?? 'failed'}`,
    stack: null
  }))
  const sorted = [...deps.errors.recent(now.getTime()), ...sync].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at)
  )
  return collapseRepeats(sorted).slice(0, RECENT_MAX)
}

/** The same error again (a query retried, say) is listed once, newest, with its count. */
export function collapseRepeats(errors: NoteError[]): NoteError[] {
  const seen = new Map<string, { entry: NoteError; count: number }>()
  for (const e of errors) {
    const key = `${e.origin}|${e.message}`
    const hit = seen.get(key)
    if (hit) hit.count++
    else seen.set(key, { entry: e, count: 1 })
  }
  return [...seen.values()].map(({ entry, count }) =>
    count > 1 ? { ...entry, message: `${entry.message} (×${count})` } : entry
  )
}
```

Create `src/main/dev/notesStore.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative } from 'node:path'
import {
  appendNote,
  formatNotes,
  listNotes,
  nextNoteId,
  notesForClaude,
  parseNotes,
  removeNote,
  serializeNote,
  setNoteStatus,
  type DevNote,
  type NewNote,
  type NoteContext,
  type NoteStatus,
  type NotesFile
} from '@shared/devNotes'

export const NOTES_FILE = 'notes.md'
const IMG_DIR = 'img'
const PNG_DATA_URL = /^data:image\/png;base64,/

export interface NotesStore {
  /** The folder in use now. */
  dir(): string
  /** Newest first. */
  list(): DevNote[]
  /** Writes the images, then the note's section; returns the note as it reads back. */
  save(input: NewNote, extra: Omit<NoteContext, keyof NewNote['where']>): DevNote
  setStatus(id: string, status: NoteStatus): void
  /** Removes the section and its images. */
  remove(id: string): void
  /** A note's image as a data URL, for the list's thumbnails; null when it is gone. */
  image(path: string): string | null
  /** The notes' sections for a Claude session, image paths absolute (spec §6). */
  forClaude(ids: string[]): string
}

/**
 * The notes folder (dev-mode spec §5). Main owns the file: every change reads it, applies the
 * change and writes it atomically, so a hand edit made meanwhile is kept.
 */
export function createNotesStore(dir: () => string): NotesStore {
  const file = (): string => join(dir(), NOTES_FILE)

  const read = (): NotesFile => {
    const path = file()
    return parseNotes(existsSync(path) ? readFileSync(path, 'utf8') : '')
  }

  const write = (notes: NotesFile): void => {
    const path = file()
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, formatNotes(notes))
    renameSync(tmp, path)
  }

  /** A path inside the folder, never outside it (a hand-edited meta line could say anything). */
  const inside = (path: string): string | null => {
    const full = normalize(join(dir(), path))
    const rel = relative(dir(), full)
    return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? null : full
  }

  return {
    dir,
    list: () => listNotes(read()).reverse(),
    save: (input, extra) => {
      const notes = read()
      const id = nextNoteId(notes)
      if (input.images.some((img) => !PNG_DATA_URL.test(img.dataUrl)))
        throw new Error('An attachment is not a PNG image')
      mkdirSync(join(dir(), IMG_DIR), { recursive: true })
      const images = input.images.map((img, i) => {
        const rel = `${IMG_DIR}/${id}-${i + 1}.png`
        writeFileSync(
          join(dir(), rel),
          Buffer.from(img.dataUrl.replace(PNG_DATA_URL, ''), 'base64')
        )
        return rel
      })
      const context: NoteContext = { ...input.where, ...extra }
      const raw = serializeNote(
        { id, tag: input.tag, status: 'open', created: extra.time, images },
        { text: input.text, context, errors: input.errors, kinds: input.images.map((i) => i.kind) }
      )
      const next = appendNote(notes, raw)
      write(next)
      const saved = listNotes(next).find((n) => n.id === id)
      if (!saved) throw new Error(`Note ${id} was not written`)
      return saved
    },
    setStatus: (id, status) => write(setNoteStatus(read(), id, status)),
    remove: (id) => {
      const notes = read()
      const note = listNotes(notes).find((n) => n.id === id)
      if (!note) return
      write(removeNote(notes, id))
      for (const path of note.images) {
        const full = inside(path)
        if (full) rmSync(full, { force: true })
      }
    },
    image: (path) => {
      const full = inside(path)
      if (!full || !existsSync(full)) return null
      return `data:image/png;base64,${readFileSync(full).toString('base64')}`
    },
    forClaude: (ids) => notesForClaude(read(), ids, (path) => join(dir(), path))
  }
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/dev && npm run typecheck && npx eslint src tests electron.vite.config.ts
```

Expected: 18 passed (3 + 8 + 7); typecheck and lint clean. The full suite: 1066 passed, 5 skipped.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/dev src/main/db/repos/syncLog.ts tests/main/dev
git add src/main/dev/mode.ts src/main/dev/errorLog.ts src/main/dev/notesStore.ts src/main/db/repos/syncLog.ts tests/main/dev
git commit -m "feat(dev): keep dev mode, errors and notes in main"
```

---

### Task 3: The `dev:*` IPC (spec §8; amendment E)

Electron's `ipcMain`, `capturePage`, `clipboard` and `dialog` are not unit-tested here (no test imports `electron`); the typecheck holds the shapes together and Task 8 runs every channel in the app.

**Files:**

- Create: `src/main/dev/ipc.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/index.ts`

- [ ] **Step 1: The API**

```diff
diff --git a/src/shared/ipc.ts b/src/shared/ipc.ts
index 229980d..7c52699 100644
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -43,6 +43,7 @@ import type {
   StatsStatus,
   StatsView
 } from './stats/types'
+import type { DevNote, NewNote, NoteError, NoteStatus } from './devNotes'

 export interface FindLeaguesResult {
   userId: string
@@ -126,6 +127,35 @@ export interface Api {
   app: {
     version(): Promise<string>
   }
+  /** Dev-mode spec §1–§6: the developer tools; only the mode itself works when it is off. */
+  dev: {
+    mode(): Promise<boolean>
+    /** Stores the choice; every window hears it through `onModeChanged`. */
+    setMode(on: boolean): Promise<void>
+    onModeChanged(listener: (on: boolean) => void): () => void
+    /** The window as it looks now, as a PNG data URL (the renderer hides its dev overlays first). */
+    capture(): Promise<string>
+    /** A renderer error for the recent-errors buffer (spec §4); fire and forget. */
+    reportError(error: { message: string; stack: string | null }): void
+    /** The errors a note would attach now, newest first. */
+    recentErrors(): Promise<NoteError[]>
+    notes: {
+      /** Newest first. */
+      list(): Promise<DevNote[]>
+      save(note: NewNote): Promise<DevNote>
+      setStatus(id: string, status: NoteStatus): Promise<void>
+      remove(id: string): Promise<void>
+      /** A note's image (its path relative to the folder) as a data URL; null when it is gone. */
+      image(path: string): Promise<string | null>
+      /** The notes folder in use. */
+      folder(): Promise<string>
+      openFolder(): Promise<void>
+      /** Asks for a folder; resolves to it, null if cancelled. */
+      chooseFolder(): Promise<string | null>
+      /** Copies the notes' sections, image paths made absolute, to the clipboard (spec §6). */
+      copy(ids: string[]): Promise<void>
+    }
+  }
   /** Stats-analysis spec §7: the stats section's data, with or without a league. */
   stats: {
     /** Runs one query in the stats worker; rejects with a readable message on an invalid query. */
@@ -193,6 +223,21 @@ export const IPC = {
   updateInstall: 'update:install',
   updateChanged: 'update:changed',
   appVersion: 'app:version',
+  devMode: 'dev:mode',
+  devSetMode: 'dev:setMode',
+  devChanged: 'dev:changed',
+  devCapture: 'dev:capture',
+  devReportError: 'dev:reportError',
+  devRecentErrors: 'dev:recentErrors',
+  devNotesList: 'dev:notesList',
+  devNotesSave: 'dev:notesSave',
+  devNotesSetStatus: 'dev:notesSetStatus',
+  devNotesRemove: 'dev:notesRemove',
+  devNotesImage: 'dev:notesImage',
+  devNotesFolder: 'dev:notesFolder',
+  devNotesOpenFolder: 'dev:notesOpenFolder',
+  devNotesChooseFolder: 'dev:notesChooseFolder',
+  devNotesCopy: 'dev:notesCopy',
   statsQuery: 'stats:query',
   statsCatalogue: 'stats:catalogue',
   statsStatus: 'stats:status',
```

```diff
diff --git a/src/preload/index.ts b/src/preload/index.ts
index 815ecff..be40efc 100644
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -76,6 +76,31 @@ const api: Api = {
   app: {
     version: () => ipcRenderer.invoke(IPC.appVersion)
   },
+  dev: {
+    mode: () => ipcRenderer.invoke(IPC.devMode),
+    setMode: (on) => ipcRenderer.invoke(IPC.devSetMode, on),
+    onModeChanged: (listener) => {
+      const handler = (_event: IpcRendererEvent, on: boolean): void => listener(on)
+      ipcRenderer.on(IPC.devChanged, handler)
+      return () => {
+        ipcRenderer.removeListener(IPC.devChanged, handler)
+      }
+    },
+    capture: () => ipcRenderer.invoke(IPC.devCapture),
+    reportError: (error) => ipcRenderer.send(IPC.devReportError, error),
+    recentErrors: () => ipcRenderer.invoke(IPC.devRecentErrors),
+    notes: {
+      list: () => ipcRenderer.invoke(IPC.devNotesList),
+      save: (note) => ipcRenderer.invoke(IPC.devNotesSave, note),
+      setStatus: (id, status) => ipcRenderer.invoke(IPC.devNotesSetStatus, id, status),
+      remove: (id) => ipcRenderer.invoke(IPC.devNotesRemove, id),
+      image: (path) => ipcRenderer.invoke(IPC.devNotesImage, path),
+      folder: () => ipcRenderer.invoke(IPC.devNotesFolder),
+      openFolder: () => ipcRenderer.invoke(IPC.devNotesOpenFolder),
+      chooseFolder: () => ipcRenderer.invoke(IPC.devNotesChooseFolder),
+      copy: (ids) => ipcRenderer.invoke(IPC.devNotesCopy, ids)
+    }
+  },
   stats: {
     query: (query) => ipcRenderer.invoke(IPC.statsQuery, query),
     catalogue: () => ipcRenderer.invoke(IPC.statsCatalogue),
```

- [ ] **Step 2: The handlers**

Create `src/main/dev/ipc.ts`:

```ts
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from '@main/db/connection'
import { getLeague } from '@main/db/repos/leagues'
import { getSetting, SETTING_ACTIVE_LEAGUE, setSetting } from '@main/db/repos/settings'
import { errorEntry, recentErrors, type ErrorLog } from '@main/dev/errorLog'
import type { DevMode } from '@main/dev/mode'
import { createNotesStore } from '@main/dev/notesStore'
import { localIso, type NewNote, type NoteError, type NoteStatus } from '@shared/devNotes'
import { IPC } from '@shared/ipc'

export const SETTING_DEV_NOTES_DIR = 'dev_notes_dir'

export interface DevDeps {
  db: Db
  mode: DevMode
  errors: ErrorLog
  getWindow: () => BrowserWindow | null
  now?: () => Date
}

/** Dev mode and the notes (dev-mode spec §1–§6). */
export function registerDevHandlers(deps: DevDeps): void {
  const now = deps.now ?? (() => new Date())
  const folder = (): string =>
    getSetting(deps.db, SETTING_DEV_NOTES_DIR) ?? join(app.getPath('userData'), 'dev-notes')
  const notes = createNotesStore(folder)

  ipcMain.handle(IPC.devMode, (): boolean => deps.mode.get())
  ipcMain.handle(IPC.devSetMode, (_event, on: boolean): void => {
    deps.mode.set(on)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.devChanged, on)
  })
  ipcMain.handle(IPC.devCapture, async (): Promise<string> => {
    const window = deps.getWindow()
    if (!window) throw new Error('No window to capture')
    return (await window.webContents.capturePage()).toDataURL()
  })
  ipcMain.on(IPC.devReportError, (_event, error: { message: string; stack: string | null }) => {
    const entry = errorEntry([String(error?.message ?? 'error')], 'renderer', now())
    deps.errors.push({ ...entry, stack: error?.stack ?? null })
  })
  ipcMain.handle(IPC.devRecentErrors, (): NoteError[] => recentErrors(deps, now()))

  ipcMain.handle(IPC.devNotesList, () => notes.list())
  ipcMain.handle(IPC.devNotesSave, (_event, note: NewNote) => {
    const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
    const league = leagueId ? getLeague(deps.db, leagueId) : null
    return notes.save(note, {
      app: {
        version: app.getVersion(),
        build: app.isPackaged ? 'packaged' : 'dev',
        platform: process.platform
      },
      league: league ? { id: league.leagueId, name: league.name, season: league.season } : null,
      time: localIso(now())
    })
  })
  ipcMain.handle(IPC.devNotesSetStatus, (_event, id: string, status: NoteStatus) =>
    notes.setStatus(id, status)
  )
  ipcMain.handle(IPC.devNotesRemove, (_event, id: string) => notes.remove(id))
  ipcMain.handle(IPC.devNotesImage, (_event, path: string) => notes.image(path))
  ipcMain.handle(IPC.devNotesFolder, (): string => folder())
  ipcMain.handle(IPC.devNotesOpenFolder, async (): Promise<void> => {
    mkdirSync(folder(), { recursive: true })
    const failed = await shell.openPath(folder())
    if (failed) throw new Error(failed)
  })
  ipcMain.handle(IPC.devNotesChooseFolder, async (): Promise<string | null> => {
    const window = deps.getWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Dev notes folder',
      defaultPath: folder(),
      properties: ['openDirectory', 'createDirectory']
    }
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const dir = picked.canceled ? null : (picked.filePaths[0] ?? null)
    if (dir) setSetting(deps.db, SETTING_DEV_NOTES_DIR, dir)
    return dir
  })
  ipcMain.handle(IPC.devNotesCopy, (_event, ids: string[]): void =>
    clipboard.writeText(notes.forClaude(ids))
  )
}
```

Main starts the error buffer before anything else and registers the handlers after the app's:

```diff
diff --git a/src/main/index.ts b/src/main/index.ts
index 812c239..0ffb5b1 100644
--- a/src/main/index.ts
+++ b/src/main/index.ts
@@ -17,11 +17,18 @@ import { createSleeperClient } from '@main/sources/sleeper'
 import { createSleeperNewsClient } from '@main/sources/sleeperNews'
 import { startStatsWorker, type StatsClient } from '@main/stats/client'
 import { STATS_DERIVED_STEP, STATS_MODELS_STEP } from '@main/stats/sync'
+import { captureMainErrors, createErrorLog } from '@main/dev/errorLog'
+import { registerDevHandlers } from '@main/dev/ipc'
+import { createDevMode } from '@main/dev/mode'
 import { installAutoUpdater } from '@main/updater'
 import { IPC } from '@shared/ipc'

 let mainWindow: BrowserWindow | null = null

+// Dev-mode spec §4: the recent-errors buffer runs from launch, whatever the mode.
+const errorLog = createErrorLog()
+captureMainErrors(errorLog)
+
 function createWindow(): void {
   mainWindow = new BrowserWindow({
     width: 1280,
@@ -162,6 +169,12 @@ app.whenReady().then(async () => {
     })
   }
   registerIpcHandlers(ctx)
+  registerDevHandlers({
+    db: ctx.db,
+    mode: createDevMode({ db: ctx.db, packaged: app.isPackaged, argv: process.argv }),
+    errors: errorLog,
+    getWindow: () => mainWindow
+  })
   createWindow()

   retireWarehouse()
```

- [ ] **Step 3: Check**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
```

Expected: clean; 1066 passed, 5 skipped.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/main/dev/ipc.ts src/shared/ipc.ts src/preload/index.ts src/main/index.ts
git add src/main/dev/ipc.ts src/shared/ipc.ts src/preload/index.ts src/main/index.ts
git commit -m "feat(dev): serve dev mode and notes over IPC"
```

---

### Task 4: Context, capture and crop in the renderer (spec §2.1, §2.3, §3)

**Files:**

- Create: `src/renderer/src/lib/dev/noteContext.tsx`, `src/renderer/src/lib/dev/capture.ts`, `src/renderer/src/lib/dev/devState.ts`, `tests/renderer/lib/devCapture.test.ts`, `tests/renderer/lib/devNoteContext.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/lib/devCapture.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CAPTURE_ATTR, captureWindow, cropRect, rectBetween } from '@/lib/dev/capture'

describe('capturing the window (dev-mode spec §2.1)', () => {
  it('hides the dev overlays while main captures, and shows them again', async () => {
    const root = document.documentElement
    let during: string | null = null
    const shot = await captureWindow(async () => {
      during = root.getAttribute(CAPTURE_ATTR)
      return 'data:image/png;base64,AAAA'
    })
    expect(shot).toBe('data:image/png;base64,AAAA')
    expect(during).toBe('1')
    expect(root.hasAttribute(CAPTURE_ATTR)).toBe(false)
  })

  it('shows them again when the capture fails', async () => {
    await expect(
      captureWindow(() => Promise.reject(new Error('No window to capture')))
    ).rejects.toThrow('No window to capture')
    expect(document.documentElement.hasAttribute(CAPTURE_ATTR)).toBe(false)
  })
})

describe('the snip rectangle (spec §2.3)', () => {
  it('spans two points whichever way it was dragged', () => {
    expect(rectBetween({ x: 300, y: 40 }, { x: 100, y: 240 })).toEqual({
      x: 100,
      y: 40,
      width: 200,
      height: 200
    })
  })

  it('scales to the capture’s pixels, rounding outward', () => {
    const image = { width: 3200, height: 2000 }
    const sel = { x: 10.5, y: 20, width: 100, height: 50.2 }
    expect(cropRect(sel, 1, image)).toEqual({ x: 10, y: 20, width: 101, height: 51 })
    expect(cropRect(sel, 1.25, image)).toEqual({ x: 13, y: 25, width: 126, height: 63 })
    expect(cropRect(sel, 2, image)).toEqual({ x: 21, y: 40, width: 200, height: 101 })
  })

  it('stays inside the image and ignores a selection under 8 × 8', () => {
    expect(
      cropRect({ x: 1200, y: 700, width: 200, height: 200 }, 2, { width: 2560, height: 1600 })
    ).toEqual({ x: 2400, y: 1400, width: 160, height: 200 })
    expect(
      cropRect({ x: 0, y: 0, width: 7, height: 100 }, 2, { width: 100, height: 100 })
    ).toBeNull()
  })
})
```

Create `tests/renderer/lib/devNoteContext.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  NoteContextRegistry,
  NoteContextRegistryContext,
  useNoteContext,
  useNoteScreen
} from '@/lib/dev/noteContext'

afterEach(cleanup)

function Part({ k, label }: { k: string; label: string | null }): null {
  useNoteContext(k, label === null ? null : { label, data: { label } })
  return null
}

function Screen({ name }: { name: string }): null {
  useNoteScreen(name)
  return null
}

describe('what the screens say is open (dev-mode spec §3)', () => {
  it('registers parts while mounted, in order, and forgets them on unmount', () => {
    const registry = new NoteContextRegistry()
    const tree = (children: React.ReactNode): React.JSX.Element => (
      <NoteContextRegistryContext.Provider value={registry}>
        {children}
      </NoteContextRegistryContext.Provider>
    )
    const { rerender } = render(
      tree(
        <>
          <Part k="week" label="wk 8" />
          <Part k="player" label="Josh Allen" />
        </>
      )
    )
    expect(registry.snapshot('lineup')).toEqual({
      screen: 'lineup',
      parts: {
        week: { label: 'wk 8', data: { label: 'wk 8' } },
        player: { label: 'Josh Allen', data: { label: 'Josh Allen' } }
      }
    })
    rerender(
      tree(
        <>
          <Part k="week" label="wk 9" />
          <Part k="player" label={null} />
        </>
      )
    )
    expect(Object.keys(registry.snapshot('lineup').parts)).toEqual(['week'])
    expect(registry.snapshot('lineup').parts.week.label).toBe('wk 9')
    rerender(tree(null))
    expect(registry.snapshot('lineup').parts).toEqual({})
  })

  it('takes a product’s own screen over the app’s while it is mounted', () => {
    const registry = new NoteContextRegistry()
    const { rerender } = render(
      <NoteContextRegistryContext.Provider value={registry}>
        <Screen name="player" />
      </NoteContextRegistryContext.Provider>
    )
    expect(registry.snapshot('home').screen).toBe('player')
    rerender(
      <NoteContextRegistryContext.Provider value={registry}>
        {null}
      </NoteContextRegistryContext.Provider>
    )
    expect(registry.snapshot('home').screen).toBe('home')
  })

  it('does nothing outside the dev tools', () => {
    expect(() => render(<Part k="week" label="wk 1" />)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/lib/devCapture.test.ts tests/renderer/lib/devNoteContext.test.tsx
```

Expected: FAIL — `@/lib/dev/capture` and `@/lib/dev/noteContext` do not resolve.

- [ ] **Step 3: Implement**

Create `src/renderer/src/lib/dev/noteContext.tsx`:

```tsx
import { createContext, useContext, useEffect } from 'react'
import type { NoteContextPart } from '@shared/devNotes'

/**
 * What the screens say is open (dev-mode spec §3). Screens register parts while they are mounted;
 * the notes panel reads them when it opens or ↻ is pressed. Kept outside React state: registering
 * re-renders nothing.
 */
export class NoteContextRegistry {
  private parts = new Map<string, NoteContextPart>()
  private screens: string[] = []

  setPart(key: string, part: NoteContextPart): void {
    this.parts.delete(key)
    this.parts.set(key, part)
  }

  clearPart(key: string, part: NoteContextPart): void {
    // A later registration under the same key (a remount) is not undone by the old cleanup.
    if (this.parts.get(key) === part) this.parts.delete(key)
  }

  /** A product's inner screen (Stats' `player`) over the app's; the latest one wins. */
  pushScreen(screen: string): () => void {
    this.screens.push(screen)
    return () => {
      const i = this.screens.lastIndexOf(screen)
      if (i >= 0) this.screens.splice(i, 1)
    }
  }

  snapshot(fallbackScreen: string): { screen: string; parts: Record<string, NoteContextPart> } {
    return {
      screen: this.screens.at(-1) ?? fallbackScreen,
      parts: Object.fromEntries(this.parts)
    }
  }
}

export const NoteContextRegistryContext = createContext<NoteContextRegistry | null>(null)

/**
 * Registers a part while the component is mounted and the part is not null. The part is compared
 * by value, so an object built on every render does not re-register.
 */
export function useNoteContext(key: string, part: NoteContextPart | null): void {
  const registry = useContext(NoteContextRegistryContext)
  const json = part === null ? null : JSON.stringify(part)
  useEffect(() => {
    if (!registry || json === null) return
    const value = JSON.parse(json) as NoteContextPart
    registry.setPart(key, value)
    return () => registry.clearPart(key, value)
  }, [registry, key, json])
}

/** The screen a product shows inside the app's (Stats' own nav). */
export function useNoteScreen(screen: string): void {
  const registry = useContext(NoteContextRegistryContext)
  useEffect(() => registry?.pushScreen(screen), [registry, screen])
}
```

Create `src/renderer/src/lib/dev/capture.ts`:

```ts
/**
 * Dev-mode spec §2.1: every dev overlay (`data-dev-overlay`) is hidden while the window is captured,
 * so the notes panel never appears in a screenshot or a snip.
 */
export const CAPTURE_ATTR = 'data-dev-capture'

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** Hides the overlays, waits two frames so the hidden state is painted, captures, shows them again. */
export async function captureWindow(capture: () => Promise<string>): Promise<string> {
  const root = document.documentElement
  root.setAttribute(CAPTURE_ATTR, '1')
  try {
    await nextFrame()
    await nextFrame()
    return await capture()
  } finally {
    root.removeAttribute(CAPTURE_ATTR)
  }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Selections smaller than this, in CSS px, are ignored (spec §2.3). */
export const MIN_SNIP = 8

/** The rectangle between two pointer positions, whichever way it was dragged. */
export function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  }
}

/**
 * A selection in CSS px as the crop in the capture's pixels (spec §2.3): scaled by the capture's
 * pixels per CSS px (the device pixel ratio), rounded outward, kept inside the image. Null when
 * the selection is too small.
 */
export function cropRect(
  sel: Rect,
  scale: number,
  image: { width: number; height: number }
): Rect | null {
  if (sel.width < MIN_SNIP || sel.height < MIN_SNIP) return null
  const x = Math.max(0, Math.floor(sel.x * scale))
  const y = Math.max(0, Math.floor(sel.y * scale))
  const right = Math.min(image.width, Math.ceil((sel.x + sel.width) * scale))
  const bottom = Math.min(image.height, Math.ceil((sel.y + sel.height) * scale))
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

/** Crops a PNG data URL with a canvas; resolves to the crop as a PNG data URL. */
export function cropImage(dataUrl: string, crop: Rect): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = crop.width
      canvas.height = crop.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not crop the capture'))
        return
      }
      ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Could not read the capture'))
    img.src = dataUrl
  })
}
```

Create `src/renderer/src/lib/dev/devState.ts`:

```ts
import { createContext, useContext } from 'react'

/** The notes panel's two views (dev-mode spec §2, §6). */
export type PanelView = 'note' | 'list'

export interface DevState {
  on: boolean
  setOn(on: boolean): void
  openNotes(view: PanelView): void
  openFolder(): void
}

export const DevContext = createContext<DevState | null>(null)

/** Dev mode and its tools, for the navs' DEV chip; null outside `DevTools`. */
export function useDev(): DevState | null {
  return useContext(DevContext)
}
```

The capture rule:

```diff
diff --git a/src/renderer/src/assets/main.css b/src/renderer/src/assets/main.css
index c0a271f..eff380b 100644
--- a/src/renderer/src/assets/main.css
+++ b/src/renderer/src/assets/main.css
@@ -270,3 +270,8 @@
     @apply py-16 text-center font-cond text-[16px] leading-none font-bold tracking-[0.14em] text-fg-3 uppercase;
   }
 }
+
+/* Dev-mode spec §2.1: dev overlays never appear in a capture; they keep their layout meanwhile. */
+html[data-dev-capture] [data-dev-overlay] {
+  visibility: hidden !important;
+}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/renderer/lib/devCapture.test.ts tests/renderer/lib/devNoteContext.test.tsx && npm run typecheck && npx eslint src tests electron.vite.config.ts
```

Expected: 8 passed (5 + 3); clean. The full suite: 1074 passed, 5 skipped.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/src/lib/dev src/renderer/src/assets/main.css tests/renderer/lib/devCapture.test.ts tests/renderer/lib/devNoteContext.test.tsx
git add src/renderer/src/lib/dev src/renderer/src/assets/main.css tests/renderer/lib/devCapture.test.ts tests/renderer/lib/devNoteContext.test.tsx
git commit -m "feat(dev): capture and context for dev notes"
```

---

### Task 5: The dev tools, the panel, snip and the list (spec §1, §2, §6; amendments C, G)

**Files:**

- Create: `src/renderer/src/components/dev/DevTools.tsx`, `src/renderer/src/components/dev/NotesPanel.tsx`, `src/renderer/src/components/dev/SnipOverlay.tsx`, `src/renderer/src/components/dev/NotesList.tsx`, `src/renderer/src/components/dev/DevChip.tsx`, `tests/renderer/components/DevTools.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/components/DevTools.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DevChip } from '@/components/dev/DevChip'
import { DevTools } from '@/components/dev/DevTools'
import { api } from '@/lib/api'
import { CAPTURE_ATTR } from '@/lib/dev/capture'
import { useNoteContext } from '@/lib/dev/noteContext'
import type { DevNote, NoteError } from '@shared/devNotes'

vi.mock('@/lib/api', () => ({
  api: {
    dev: {
      mode: vi.fn(),
      setMode: vi.fn(),
      onModeChanged: vi.fn(),
      capture: vi.fn(),
      reportError: vi.fn(),
      recentErrors: vi.fn(),
      notes: {
        list: vi.fn(),
        save: vi.fn(),
        setStatus: vi.fn(),
        remove: vi.fn(),
        image: vi.fn(),
        folder: vi.fn(),
        openFolder: vi.fn(),
        chooseFolder: vi.fn(),
        copy: vi.fn()
      }
    }
  }
}))

const SHOT = 'data:image/png;base64,iVBORw0KGgo='
const ERROR: NoteError = {
  at: '2026-10-22T12:00:00.000Z',
  origin: 'renderer',
  message: 'TypeError: boom',
  stack: null
}

function note(over: Partial<DevNote> = {}): DevNote {
  return {
    id: 'N-001',
    tag: 'bug',
    status: 'open',
    created: '2026-10-22T14:03:11+02:00',
    images: [],
    title: 'Trade card cuts names',
    text: 'Trade card cuts names',
    where: 'Fantasy › Trade',
    context: null,
    ...over
  }
}

function PlayerFile(): null {
  useNoteContext('player', { label: 'Josh Allen', data: { playerId: '4984' } })
  return null
}

const onGo = vi.fn()
function renderTools(): void {
  render(
    <DevTools product="fantasy" screen="players" onGo={onGo}>
      <DevChip />
      <PlayerFile />
    </DevTools>
  )
}

function press(code: string): void {
  fireEvent.keyDown(window, { code, ctrlKey: true, shiftKey: true })
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  vi.mocked(api.dev.mode).mockResolvedValue(true)
  vi.mocked(api.dev.setMode).mockResolvedValue()
  vi.mocked(api.dev.onModeChanged).mockReturnValue(() => {})
  vi.mocked(api.dev.recentErrors).mockResolvedValue([ERROR])
  vi.mocked(api.dev.capture).mockResolvedValue(SHOT)
  vi.mocked(api.dev.notes.save).mockResolvedValue(note())
  vi.mocked(api.dev.notes.list).mockResolvedValue([])
  vi.mocked(api.dev.notes.folder).mockResolvedValue('/notes')
  vi.mocked(api.dev.notes.setStatus).mockResolvedValue()
  vi.mocked(api.dev.notes.remove).mockResolvedValue()
  vi.mocked(api.dev.notes.copy).mockResolvedValue()
  vi.mocked(api.dev.notes.image).mockResolvedValue(null)
})
afterEach(cleanup)

describe('dev mode (dev-mode spec §1)', () => {
  it('shows nothing while off, and Ctrl+Shift+D turns it on', async () => {
    vi.mocked(api.dev.mode).mockResolvedValue(false)
    renderTools()
    await waitFor(() => expect(api.dev.mode).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Note/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'DEV' })).toBeNull()
    press('KeyN')
    expect(screen.queryByRole('dialog')).toBeNull()
    press('KeyD')
    expect(api.dev.setMode).toHaveBeenCalledWith(true)
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Dev mode on')
    expect(screen.getByRole('button', { name: 'DEV' })).toBeTruthy()
  })

  it('follows a switch made elsewhere', async () => {
    let listener: (on: boolean) => void = () => {}
    vi.mocked(api.dev.onModeChanged).mockImplementation((l) => {
      listener = l
      return () => {}
    })
    renderTools()
    expect(await screen.findByRole('button', { name: 'DEV' })).toBeTruthy()
    act(() => listener(false))
    expect(screen.queryByRole('button', { name: 'DEV' })).toBeNull()
  })

  it('the DEV chip opens notes and turns Dev mode off', async () => {
    renderTools()
    fireEvent.click(await screen.findByRole('button', { name: 'DEV' }))
    fireEvent.click(screen.getByRole('button', { name: /All notes/ }))
    expect(await screen.findByText('No notes yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'DEV' }))
    fireEvent.click(screen.getByRole('button', { name: /Turn off Dev mode/ }))
    expect(api.dev.setMode).toHaveBeenCalledWith(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('forwards renderer errors to main whatever the mode', async () => {
    vi.mocked(api.dev.mode).mockResolvedValue(false)
    renderTools()
    const error = new TypeError('boom')
    window.dispatchEvent(new ErrorEvent('error', { error, message: 'boom' }))
    expect(api.dev.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'TypeError: boom' })
    )
  })
})

describe('writing a note (spec §2, §3)', () => {
  it('opens with Ctrl+Shift+N and saves the text, tag, context and errors', async () => {
    renderTools()
    await screen.findByRole('button', { name: 'DEV' })
    press('KeyN')
    const text = await screen.findByRole('textbox', { name: 'Note' })
    expect(await screen.findByText(/Fantasy › Players · Josh Allen/)).toBeTruthy()
    fireEvent.change(text, { target: { value: 'Trade card cuts names\nmore' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Bug' }))
    expect(await screen.findByText('Include recent errors (1)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.dev.notes.save).toHaveBeenCalledTimes(1))
    const saved = vi.mocked(api.dev.notes.save).mock.calls[0][0]
    expect(saved).toMatchObject({
      text: 'Trade card cuts names\nmore',
      tag: 'bug',
      errors: [ERROR],
      images: [],
      where: {
        product: 'fantasy',
        screen: 'players',
        parts: { player: { label: 'Josh Allen', data: { playerId: '4984' } } }
      }
    })
    expect(saved.where.env).toMatchObject({ theme: 'light' })
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Saved N-001')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves the errors out when unticked; saves nothing without text', async () => {
    renderTools()
    fireEvent.click(await screen.findByRole('button', { name: /Note/ }))
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'x' } })
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Note' }), {
      key: 'Enter',
      ctrlKey: true
    })
    await waitFor(() => expect(api.dev.notes.save).toHaveBeenCalled())
    expect(vi.mocked(api.dev.notes.save).mock.calls[0][0].errors).toEqual([])
  })

  it('takes a screenshot with the panel hidden, and removes it', async () => {
    let hidden: boolean | null = null
    vi.mocked(api.dev.capture).mockImplementation(async () => {
      hidden = document.documentElement.hasAttribute(CAPTURE_ATTR)
      return SHOT
    })
    renderTools()
    fireEvent.click(await screen.findByRole('button', { name: /Note/ }))
    expect(screen.getByRole('dialog').hasAttribute('data-dev-overlay')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Screenshot' }))
    expect(await screen.findByRole('img', { name: 'Screenshot 1' })).toBeTruthy()
    expect(hidden).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment 1' }))
    expect(screen.queryByRole('img', { name: 'Screenshot 1' })).toBeNull()
  })

  it('snip shows the frozen capture, and Esc cancels it without closing anything else', async () => {
    const outside = vi.fn()
    window.addEventListener('keydown', outside)
    renderTools()
    fireEvent.click(await screen.findByRole('button', { name: /Note/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Snip' }))
    const overlay = await screen.findByLabelText('Snip a region')
    expect(screen.getByRole('button', { name: 'Use' })).toHaveProperty('disabled', true)
    fireEvent.keyDown(overlay, { key: 'Escape' })
    expect(screen.queryByLabelText('Snip a region')).toBeNull()
    expect(outside).not.toHaveBeenCalled()
    window.removeEventListener('keydown', outside)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('keeps the draft when closed, and across a reload', async () => {
    renderTools()
    fireEvent.click(await screen.findByRole('button', { name: /Note/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'Half a thought' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: /Note/ }))
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveProperty('value', 'Half a thought')
    cleanup()
    renderTools()
    fireEvent.click(await screen.findByRole('button', { name: /Note/ }))
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveProperty('value', 'Half a thought')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveProperty('value', '')
  })
})

describe('all notes (spec §6)', () => {
  it('filters, marks done, copies, deletes and goes there', async () => {
    const context = { product: 'fantasy', screen: 'trade', parts: {} } as never
    vi.mocked(api.dev.notes.list).mockResolvedValue([
      note({ id: 'N-002', title: 'Second', context }),
      note({ id: 'N-001', title: 'Done one', status: 'done' })
    ])
    renderTools()
    fireEvent.click(await screen.findByRole('button', { name: 'DEV' }))
    fireEvent.click(screen.getByRole('button', { name: /All notes/ }))
    expect(await screen.findByText('Second')).toBeTruthy()
    expect(screen.queryByText('Done one')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'all' }))
    expect(screen.getByText('Done one')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark done' })[0])
    expect(api.dev.notes.setStatus).toHaveBeenCalledWith('N-002', 'done')
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy for Claude' })[0])
    expect(api.dev.notes.copy).toHaveBeenCalledWith(['N-002'])
    expect(await screen.findByText('Copied N-002')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy all open' }))
    expect(api.dev.notes.copy).toHaveBeenLastCalledWith(['N-002'])

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Delete N-001' }))
    expect(api.dev.notes.remove).toHaveBeenCalledWith('N-001')

    fireEvent.click(screen.getByRole('button', { name: 'Go there' }))
    expect(onGo).toHaveBeenCalledWith(context)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/components/DevTools.test.tsx
```

Expected: FAIL — `@/components/dev/DevChip` does not resolve.

- [ ] **Step 3: Implement**

Create `src/renderer/src/components/dev/DevTools.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { NotesPanel } from '@/components/dev/NotesPanel'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { DevContext, type DevState, type PanelView } from '@/lib/dev/devState'
import { NoteContextRegistry, NoteContextRegistryContext } from '@/lib/dev/noteContext'
import type { NoteContext, NoteWhere } from '@shared/devNotes'

interface DevToolsProps {
  product: NoteWhere['product']
  /** The app's screen; a product's own screen registered with `useNoteScreen` wins. */
  screen: string
  /** "Go there" (spec §6): opens the note's product and screen. */
  onGo: (context: NoteContext) => void
  children: React.ReactNode
}

const TOAST_MS = 2500

/** Forwards renderer errors to main's recent-errors buffer (spec §4), whatever the mode. */
function useErrorForwarding(): void {
  useEffect(() => {
    const onError = (e: ErrorEvent): void => {
      const err = e.error instanceof Error ? e.error : null
      api.dev.reportError({
        message: err ? `${err.name}: ${err.message}` : e.message,
        stack: err?.stack?.split('\n').slice(1).join('\n') ?? null
      })
    }
    const onRejection = (e: PromiseRejectionEvent): void => {
      const err = e.reason instanceof Error ? e.reason : null
      api.dev.reportError({
        message: `Unhandled rejection: ${err ? `${err.name}: ${err.message}` : String(e.reason)}`,
        stack: err?.stack?.split('\n').slice(1).join('\n') ?? null
      })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
}

/**
 * Dev mode (dev-mode spec §1–§2): Ctrl+Shift+D switches it anywhere; while on, the ✎ Note button,
 * Ctrl+Shift+N and the notes panel. Screens below register what is open with `useNoteContext`.
 */
export function DevTools({ product, screen, onGo, children }: DevToolsProps): React.JSX.Element {
  const registry = useMemo(() => new NoteContextRegistry(), [])
  const [on, setOnState] = useState(false)
  const [view, setView] = useState<PanelView | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useErrorForwarding()

  const flash = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(() => {
    void api.dev
      .mode()
      .then(setOnState)
      .catch(() => setOnState(false))
    return api.dev.onModeChanged(setOnState)
  }, [])

  const setOn = useCallback(
    (next: boolean) => {
      api.dev
        .setMode(next)
        .then(() => {
          setOnState(next)
          if (!next) setView(null)
          flash(next ? 'Dev mode on' : 'Dev mode off')
        })
        .catch((err) => flash(errorMessage(err)))
    },
    [flash]
  )

  const openFolder = useCallback(() => {
    api.dev.notes.openFolder().catch((err) => flash(errorMessage(err)))
  }, [flash])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return
      if (e.code === 'KeyD') {
        e.preventDefault()
        setOn(!on)
      } else if (e.code === 'KeyN' && on) {
        e.preventDefault()
        setView('note')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on, setOn])

  // Read when the panel asks, so it is where the developer is now.
  const productRef = useRef({ product, screen })
  useEffect(() => {
    productRef.current = { product, screen }
  }, [product, screen])
  const where = useCallback((): NoteWhere => {
    const { product: p, screen: s } = productRef.current
    return {
      product: p,
      ...registry.snapshot(s),
      env: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      }
    }
  }, [registry])

  const state = useMemo<DevState>(
    () => ({ on, setOn, openNotes: setView, openFolder }),
    [on, setOn, openFolder]
  )

  return (
    <NoteContextRegistryContext.Provider value={registry}>
      <DevContext.Provider value={state}>
        {children}
        {on && (
          <>
            {view === null && (
              <button
                type="button"
                data-dev-overlay=""
                onClick={() => setView('note')}
                title="Write a dev note (Ctrl+Shift+N)"
                className="fixed right-4 bottom-4 z-50 flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-panel px-3.5 py-2 text-[12.5px] font-semibold text-fg shadow-[0_6px_20px_var(--shadow-c)] hover:bg-hover"
              >
                <NotebookPen className="size-4" />
                Note
              </button>
            )}
            <NotesPanel
              view={view}
              onView={setView}
              where={where}
              onSaved={(id) => flash(`Saved ${id}`)}
              onGo={(context) => {
                setView(null)
                onGo(context)
              }}
              onOpenFolder={openFolder}
            />
          </>
        )}
        {toast && (
          <div
            role="status"
            data-dev-overlay=""
            className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-paper shadow-[0_6px_20px_var(--shadow-c)]"
          >
            {toast}
          </div>
        )}
      </DevContext.Provider>
    </NoteContextRegistryContext.Provider>
  )
}
```

Create `src/renderer/src/components/dev/NotesPanel.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ChevronDown, ChevronUp, RotateCw, Scissors, X } from 'lucide-react'
import { NotesList } from '@/components/dev/NotesList'
import { SnipOverlay } from '@/components/dev/SnipOverlay'
import { api } from '@/lib/api'
import { captureWindow } from '@/lib/dev/capture'
import type { PanelView } from '@/lib/dev/devState'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  NOTE_TAGS,
  tagLabel,
  whereSummary,
  type NoteContext,
  type NoteError,
  type NoteImageDraft,
  type NoteTag,
  type NoteWhere
} from '@shared/devNotes'

/** Dev-mode spec §2: at most six attachments a note. */
export const MAX_IMAGES = 6
const DRAFT_KEY = 'companion.devNoteDraft'
const MARGIN = 16

interface Draft {
  text: string
  tag: NoteTag
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    const d = raw ? (JSON.parse(raw) as Partial<Draft>) : {}
    return {
      text: typeof d.text === 'string' ? d.text : '',
      tag: NOTE_TAGS.includes(d.tag as NoteTag) ? (d.tag as NoteTag) : 'idea'
    }
  } catch {
    return { text: '', tag: 'idea' }
  }
}

function storeDraft(draft: Draft | null): void {
  try {
    if (draft === null || draft.text === '') localStorage.removeItem(DRAFT_KEY)
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // a reload loses the draft, nothing else
  }
}

interface NotesPanelProps {
  /** null: closed (the draft is kept). */
  view: PanelView | null
  onView: (view: PanelView | null) => void
  /** Where the developer is now (spec §3). */
  where: () => NoteWhere
  onSaved: (id: string) => void
  onGo: (context: NoteContext) => void
  onOpenFolder: () => void
}

/**
 * The notes panel (dev-mode spec §2): docked bottom-right, draggable by its header, collapsible;
 * the app stays usable around it. Every capture hides it first (§2.1).
 */
export function NotesPanel({
  view,
  onView,
  where: readWhere,
  onSaved,
  onGo,
  onOpenFolder
}: NotesPanelProps): React.JSX.Element | null {
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [images, setImages] = useState<NoteImageDraft[]>([])
  const [where, setWhere] = useState<NoteWhere | null>(null)
  const [errors, setErrors] = useState<NoteError[]>([])
  const [withErrors, setWithErrors] = useState(true)
  const [showContext, setShowContext] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [snipSource, setSnipSource] = useState<string | null>(null)
  // null: docked bottom-right; else where it was dragged to.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  // Both land together once the errors are read: the summary never shows without its count.
  const recapture = useCallback(() => {
    const done = (list: NoteError[]): void => {
      setWhere(readWhere())
      setErrors(list)
    }
    api.dev.recentErrors().then(done, () => done([]))
  }, [readWhere])

  // Captured when the panel opens on a new note (spec §3).
  const opened = view !== null
  useEffect(() => {
    if (opened && where === null) recapture()
  }, [opened, where, recapture])

  useEffect(() => {
    if (view === 'note' && !collapsed) textRef.current?.focus()
  }, [view, collapsed])

  const update = (next: Draft): void => {
    setDraft(next)
    storeDraft(next)
  }

  const reset = (): void => {
    update({ text: '', tag: 'idea' })
    setImages([])
    setWhere(null)
    setErrors([])
    setWithErrors(true)
    setShowContext(false)
    setProblem(null)
  }

  const shoot = async (snip: boolean): Promise<void> => {
    setProblem(null)
    try {
      const shot = await captureWindow(api.dev.capture)
      if (snip) setSnipSource(shot)
      else setImages((list) => [...list, { kind: 'screenshot', dataUrl: shot }])
    } catch (err) {
      setProblem(errorMessage(err))
    }
    // Back to the text, so typing (and Esc) go to the panel.
    if (!snip) textRef.current?.focus()
  }

  const save = async (): Promise<void> => {
    if (draft.text.trim() === '' || busy) return
    setBusy(true)
    setProblem(null)
    try {
      const saved = await api.dev.notes.save({
        text: draft.text,
        tag: draft.tag,
        where: where ?? readWhere(),
        errors: withErrors ? errors : [],
        images
      })
      reset()
      onView(null)
      onSaved(saved.id)
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const startDrag = (e: React.PointerEvent): void => {
    if ((e.target as HTMLElement).closest('button')) return
    const panel = panelRef.current
    if (!panel) return
    const box = panel.getBoundingClientRect()
    const dx = e.clientX - box.left
    const dy = e.clientY - box.top
    const move = (ev: PointerEvent): void => {
      const left = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - box.width)
      const top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40)
      setPos({ left, top })
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (view === null) return null
  const full = images.length >= MAX_IMAGES

  return (
    <>
      <div
        ref={panelRef}
        data-dev-overlay=""
        role="dialog"
        aria-label="Dev notes"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setCollapsed(true)
          } else if (e.key === 'Enter' && e.ctrlKey && view === 'note') {
            e.preventDefault()
            void save()
          }
        }}
        style={pos ? { left: pos.left, top: pos.top } : { right: MARGIN, bottom: MARGIN }}
        className={cn(
          'fixed z-50 flex w-[380px] flex-col overflow-hidden rounded-[10px] border border-line bg-panel text-fg shadow-[0_18px_48px_var(--shadow-c)]',
          !collapsed && 'max-h-[min(560px,calc(100vh-32px))]',
          snipSource !== null && 'invisible'
        )}
      >
        <header
          onPointerDown={startDrag}
          className="flex h-10 shrink-0 cursor-move items-center gap-1 border-b border-line pr-1.5 pl-3 select-none"
        >
          {(['note', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                onView(v)
                setCollapsed(false)
              }}
              className={cn(
                'cursor-pointer rounded-[6px] px-2 py-1 text-[12px] font-semibold',
                view === v ? 'bg-panel-2 text-fg' : 'text-fg-3 hover:text-fg'
              )}
            >
              {v === 'note' ? 'Note' : 'All notes'}
            </button>
          ))}
          <span className="ml-1 rounded-[4px] bg-brand px-1.5 py-0.5 font-mono text-[10px] font-bold text-on-brand">
            DEV
          </span>
          <span className="flex-1" />
          <button
            type="button"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            title={collapsed ? 'Expand' : 'Collapse (Esc)'}
            onClick={() => setCollapsed((c) => !c)}
            className="flex size-7 cursor-pointer items-center justify-center rounded-[6px] text-fg-2 hover:bg-hover hover:text-fg"
          >
            {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <button
            type="button"
            aria-label="Close"
            title="Close (the draft is kept)"
            onClick={() => onView(null)}
            className="flex size-7 cursor-pointer items-center justify-center rounded-[6px] text-fg-2 hover:bg-hover hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </header>
        {!collapsed && view === 'list' && <NotesList onGo={onGo} onOpenFolder={onOpenFolder} />}
        {!collapsed && view === 'note' && (
          <div className="flex min-h-0 flex-col gap-3 overflow-auto p-3 text-[12.5px]">
            <textarea
              ref={textRef}
              aria-label="Note"
              value={draft.text}
              onChange={(e) => update({ ...draft, text: e.target.value })}
              placeholder="What should change? The first line is the title."
              rows={6}
              className="min-h-[110px] w-full resize-y rounded-[7px] border border-line bg-paper px-2.5 py-2 text-[13px] leading-[1.45] outline-none focus:border-fg-3"
            />
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Tag">
              {NOTE_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={draft.tag === t}
                  onClick={() => update({ ...draft, tag: t })}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-medium',
                    draft.tag === t
                      ? 'border-fg bg-fg text-paper'
                      : 'border-line text-fg-2 hover:text-fg'
                  )}
                >
                  {tagLabel(t)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={full}
                onClick={() => void shoot(false)}
                title="The whole window, without this panel"
                className="flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-line px-2.5 py-1.5 font-medium hover:bg-hover disabled:cursor-default disabled:opacity-40"
              >
                <Camera className="size-3.5" />
                Screenshot
              </button>
              <button
                type="button"
                disabled={full}
                onClick={() => void shoot(true)}
                title="Drag a box around the part you mean"
                className="flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-line px-2.5 py-1.5 font-medium hover:bg-hover disabled:cursor-default disabled:opacity-40"
              >
                <Scissors className="size-3.5" />
                Snip
              </button>
              <span className="text-[11.5px] text-fg-3">
                {images.length}/{MAX_IMAGES}
              </span>
            </div>
            {images.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {images.map((img, i) => (
                  <li key={i} className="relative">
                    <img
                      src={img.dataUrl}
                      alt={`${img.kind === 'snip' ? 'Snip' : 'Screenshot'} ${i + 1}`}
                      className="h-[54px] max-w-[96px] rounded-[5px] border border-line object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Remove attachment ${i + 1}`}
                      onClick={() => setImages((list) => list.filter((_, k) => k !== i))}
                      className="absolute -top-1.5 -right-1.5 flex size-[18px] cursor-pointer items-center justify-center rounded-full bg-ink text-paper"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-[7px] bg-panel-2 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-expanded={showContext}
                  onClick={() => setShowContext((s) => !s)}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left text-fg-2 hover:text-fg"
                  title="Show the full context"
                >
                  {showContext ? '▾' : '▸'} {where ? whereSummary(where) : '…'}
                </button>
                <button
                  type="button"
                  aria-label="Capture the context again"
                  title="Capture the context again, from where you are now"
                  onClick={recapture}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-[5px] text-fg-2 hover:bg-hover hover:text-fg"
                >
                  <RotateCw className="size-3.5" />
                </button>
              </div>
              {showContext && where && (
                <pre className="mt-2 max-h-[160px] overflow-auto font-mono text-[10.5px] leading-[1.4] text-fg-2">
                  {JSON.stringify(where, null, 2)}
                </pre>
              )}
              <label className="mt-1.5 flex items-center gap-2 text-fg-2">
                <input
                  type="checkbox"
                  checked={withErrors && errors.length > 0}
                  disabled={errors.length === 0}
                  onChange={(e) => setWithErrors(e.target.checked)}
                />
                {errors.length === 0
                  ? 'No recent errors'
                  : `Include recent errors (${errors.length})`}
              </label>
            </div>
            {problem && <p className="m-0 text-bad">{problem}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="cursor-pointer rounded-[7px] px-2.5 py-1.5 font-medium text-fg-2 hover:bg-hover hover:text-fg"
              >
                Discard
              </button>
              <span className="flex-1" />
              <button
                type="button"
                disabled={draft.text.trim() === '' || busy}
                onClick={() => void save()}
                title="Save (Ctrl+Enter)"
                className="cursor-pointer rounded-[7px] bg-ink px-3.5 py-1.5 font-semibold text-paper hover:opacity-90 disabled:cursor-default disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
      {snipSource !== null && (
        <SnipOverlay
          source={snipSource}
          onDone={(crop) => {
            setSnipSource(null)
            if (crop) setImages((list) => [...list, { kind: 'snip', dataUrl: crop }])
            // Once the panel is visible again: a hidden textarea takes no focus.
            requestAnimationFrame(() => textRef.current?.focus())
          }}
          onError={(message) => {
            setSnipSource(null)
            setProblem(message)
          }}
        />
      )}
    </>
  )
}
```

Create `src/renderer/src/components/dev/SnipOverlay.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { cropImage, cropRect, MIN_SNIP, rectBetween, type Rect } from '@/lib/dev/capture'

interface SnipOverlayProps {
  /** The window captured just before (spec §2.3): the region is picked on this frozen frame. */
  source: string
  /** The crop as a PNG data URL, or null when cancelled. */
  onDone: (crop: string | null) => void
  onError: (message: string) => void
}

/**
 * Snip (dev-mode spec §2.3): the frozen capture, dimmed; drag a rectangle, release to keep, drag
 * again to redo; Enter or Use confirms, Esc cancels.
 */
export function SnipOverlay({ source, onDone, onError }: SnipOverlayProps): React.JSX.Element {
  const imgRef = useRef<HTMLImageElement>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [sel, setSel] = useState<Rect | null>(null)
  const [dragging, setDragging] = useState(false)
  const usable = sel !== null && sel.width >= MIN_SNIP && sel.height >= MIN_SNIP

  const confirm = useCallback(() => {
    const img = imgRef.current
    if (!img || !sel) return
    const crop = cropRect(sel, img.naturalWidth / img.clientWidth, {
      width: img.naturalWidth,
      height: img.naturalHeight
    })
    if (!crop) return
    cropImage(source, crop).then(onDone, (err: Error) => onError(err.message))
  }, [sel, source, onDone, onError])

  useEffect(() => {
    // Capture phase: Esc must not also close a player file under the overlay.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDone(null)
      } else if (e.key === 'Enter') {
        e.stopPropagation()
        e.preventDefault()
        confirm()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirm, onDone])

  const point = (e: React.PointerEvent): { x: number; y: number } => ({
    x: Math.min(Math.max(0, e.clientX), window.innerWidth),
    y: Math.min(Math.max(0, e.clientY), window.innerHeight)
  })

  return (
    <div
      data-dev-overlay=""
      aria-label="Snip a region"
      className="fixed inset-0 z-[60] cursor-crosshair overflow-hidden select-none"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        e.currentTarget.setPointerCapture?.(e.pointerId)
        const p = point(e)
        setStart(p)
        setSel({ ...p, width: 0, height: 0 })
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (dragging && start) setSel(rectBetween(start, point(e)))
      }}
      onPointerUp={() => setDragging(false)}
    >
      <img
        ref={imgRef}
        src={source}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      {sel === null ? (
        <div className="absolute inset-0 bg-black/45" />
      ) : (
        <div
          className="absolute border border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{ left: sel.x, top: sel.y, width: sel.width, height: sel.height }}
        >
          {usable && (
            <span className="absolute -top-6 left-0 rounded-[4px] bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white">
              {Math.round(sel.width)} × {Math.round(sel.height)}
            </span>
          )}
        </div>
      )}
      <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/75 py-1.5 pr-1.5 pl-4 text-[12.5px] text-white">
        <span>Drag to select · Enter to use · Esc to cancel</span>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="cursor-pointer rounded-full px-3 py-1 hover:bg-white/15"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!usable || dragging}
          onClick={confirm}
          className="cursor-pointer rounded-full bg-white px-3 py-1 font-semibold text-black disabled:cursor-default disabled:opacity-40"
        >
          Use
        </button>
      </div>
    </div>
  )
}
```

Create `src/renderer/src/components/dev/NotesList.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, FolderOpen, MapPin, RotateCw, Trash } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NOTE_TAGS, tagLabel, type DevNote, type NoteContext, type NoteTag } from '@shared/devNotes'

type StatusFilter = 'open' | 'done' | 'all'

/** Notes shown under the filters, newest first (the list comes newest first). */
function filterNotes(notes: DevNote[], status: StatusFilter, tag: NoteTag | 'all'): DevNote[] {
  return notes.filter(
    (n) => (status === 'all' || n.status === status) && (tag === 'all' || n.tag === tag)
  )
}

function Thumb({ path }: { path: string }): React.JSX.Element | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api.dev.notes
      .image(path)
      .then((url) => live && setSrc(url))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [path])
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className="h-[42px] w-[64px] shrink-0 rounded-[4px] border border-line object-cover"
    />
  )
}

const ACTION =
  'flex cursor-pointer items-center gap-1 rounded-[5px] px-1.5 py-1 text-fg-2 hover:bg-hover hover:text-fg'

interface NotesListProps {
  onGo: (context: NoteContext) => void
  onOpenFolder: () => void
}

/** All notes (dev-mode spec §6): filter, mark done, delete, copy for Claude, go there. */
export function NotesList({ onGo, onOpenFolder }: NotesListProps): React.JSX.Element {
  const [notes, setNotes] = useState<DevNote[] | null>(null)
  const [folder, setFolder] = useState('')
  const [status, setStatus] = useState<StatusFilter>('open')
  const [tag, setTag] = useState<NoteTag | 'all'>('all')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([api.dev.notes.list(), api.dev.notes.folder()])
      .then(([list, dir]) => {
        setNotes(list)
        setFolder(dir)
      })
      .catch((err) => setMessage(errorMessage(err)))
  }, [])
  useEffect(load, [load])

  const act = (work: Promise<unknown>, done?: string): void => {
    setMessage(null)
    work
      .then(() => {
        if (done) setMessage(done)
        load()
      })
      .catch((err) => setMessage(errorMessage(err)))
  }

  const shown = notes ? filterNotes(notes, status, tag) : []
  const open = notes?.filter((n) => n.status === 'open') ?? []

  return (
    <div className="flex min-h-0 flex-col text-[12.5px]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        {(['open', 'done', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              'cursor-pointer rounded-full px-2 py-0.5 capitalize',
              status === s ? 'bg-fg text-paper' : 'text-fg-2 hover:text-fg'
            )}
          >
            {s}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <select
          aria-label="Tag"
          value={tag}
          onChange={(e) => setTag(e.target.value as NoteTag | 'all')}
          className="rounded-[5px] border border-line bg-paper px-1.5 py-0.5"
        >
          <option value="all">Every tag</option>
          {NOTE_TAGS.map((t) => (
            <option key={t} value={t}>
              {tagLabel(t)}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <button type="button" aria-label="Reload" title="Reload" onClick={load} className={ACTION}>
          <RotateCw className="size-3.5" />
        </button>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-auto p-0">
        {notes === null && <li className="px-3 py-6 text-center text-fg-3">Loading…</li>}
        {notes !== null && shown.length === 0 && (
          <li className="px-3 py-6 text-center text-fg-3">
            {notes.length === 0 ? 'No notes yet.' : 'No notes under these filters.'}
          </li>
        )}
        {shown.map((n) => (
          <li key={n.id} className="border-b border-line px-3 py-2.5">
            <div className="flex gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10.5px] text-fg-3">
                  {n.id} · {tagLabel(n.tag)} · {relativeTime(n.created)}
                  {n.status === 'done' && <span className="text-good"> · done</span>}
                </div>
                <div
                  className={cn(
                    'mt-0.5 font-medium',
                    n.status === 'done' && 'text-fg-3 line-through'
                  )}
                >
                  {n.title}
                </div>
                {n.where && (
                  <div className="mt-0.5 truncate text-[11.5px] text-fg-3">{n.where}</div>
                )}
              </div>
              {n.images[0] && <Thumb path={n.images[0]} />}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button
                type="button"
                className={ACTION}
                onClick={() =>
                  act(api.dev.notes.setStatus(n.id, n.status === 'open' ? 'done' : 'open'))
                }
              >
                <Check className="size-3.5" />
                {n.status === 'open' ? 'Mark done' : 'Reopen'}
              </button>
              <button
                type="button"
                className={ACTION}
                title="Copy this note as Markdown, image paths absolute"
                onClick={() => act(api.dev.notes.copy([n.id]), `Copied ${n.id}`)}
              >
                <Copy className="size-3.5" />
                Copy for Claude
              </button>
              {n.context && (
                <button type="button" className={ACTION} onClick={() => onGo(n.context!)}>
                  <MapPin className="size-3.5" />
                  Go there
                </button>
              )}
              {confirming === n.id ? (
                <>
                  <button
                    type="button"
                    className={cn(ACTION, 'text-bad hover:text-bad')}
                    onClick={() => {
                      setConfirming(null)
                      act(api.dev.notes.remove(n.id), `Deleted ${n.id}`)
                    }}
                  >
                    Delete {n.id}
                  </button>
                  <button type="button" className={ACTION} onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" className={ACTION} onClick={() => setConfirming(n.id)}>
                  <Trash className="size-3.5" />
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {message && <p className="m-0 border-t border-line px-3 py-1.5 text-fg-2">{message}</p>}
      <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-2">
        <button type="button" className={ACTION} onClick={onOpenFolder} title={folder}>
          <FolderOpen className="size-3.5" />
          Open folder
        </button>
        <button
          type="button"
          className={ACTION}
          onClick={() =>
            act(
              api.dev.notes.chooseFolder().then((dir) => {
                if (dir) setFolder(dir)
              })
            )
          }
        >
          Change folder…
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className={ACTION}
          disabled={open.length === 0}
          onClick={() =>
            act(
              api.dev.notes.copy(open.map((n) => n.id)),
              `Copied ${open.length} open note${open.length === 1 ? '' : 's'}`
            )
          }
        >
          <Copy className="size-3.5" />
          Copy all open
        </button>
      </div>
    </div>
  )
}
```

Create `src/renderer/src/components/dev/DevChip.tsx`:

```tsx
import { useState } from 'react'
import { Popover } from 'radix-ui'
import { useDev } from '@/lib/dev/devState'

const ITEM =
  'flex h-8 w-full cursor-pointer items-center justify-between gap-4 px-3 text-left text-fg hover:bg-hover'

/**
 * The DEV chip (dev-mode spec §1), next to the version in both navs while Dev mode is on: Notes,
 * the notes folder, and turning Dev mode off.
 */
export function DevChip(): React.JSX.Element | null {
  const dev = useDev()
  const [open, setOpen] = useState(false)
  if (!dev?.on) return null
  const pick = (run: () => void) => () => {
    setOpen(false)
    run()
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Dev mode (Ctrl+Shift+D)"
          className="cursor-pointer rounded-[4px] bg-brand px-1.5 py-[3px] font-mono text-[10px] leading-none font-bold tracking-[0.06em] text-on-brand hover:opacity-90"
        >
          DEV
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[230px] rounded-[10px] bg-panel py-1 text-[12.5px] shadow-[0_0_0_1px_var(--line),0_10px_28px_rgba(0,0,0,0.18)]"
        >
          <button type="button" className={ITEM} onClick={pick(() => dev.openNotes('note'))}>
            New note <span className="font-mono text-[11px] text-fg-3">Ctrl+Shift+N</span>
          </button>
          <button type="button" className={ITEM} onClick={pick(() => dev.openNotes('list'))}>
            All notes
          </button>
          <button type="button" className={ITEM} onClick={pick(dev.openFolder)}>
            Open notes folder
          </button>
          <div className="my-1 h-px bg-line" />
          <button type="button" className={ITEM} onClick={pick(() => dev.setOn(false))}>
            Turn off Dev mode <span className="font-mono text-[11px] text-fg-3">Ctrl+Shift+D</span>
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/renderer/components/DevTools.test.tsx && npm run typecheck && npx eslint src tests electron.vite.config.ts
```

Expected: 10 passed; clean (the lint rules `react-hooks/set-state-in-effect`, `react-hooks/refs` and `react-refresh/only-export-components` included). The full suite: 1084 passed, 5 skipped.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/src/components/dev tests/renderer/components/DevTools.test.tsx
git add src/renderer/src/components/dev tests/renderer/components/DevTools.test.tsx
git commit -m "feat(dev): add the dev tools and notes panel"
```

---

### Task 6: Both products, the navs and the screens (spec §1, §3, §6; amendments F, H)

App wraps both products in one `DevTools` and goes where a note was written; the navs show the DEV chip; seven screens say what is open.

**Files:**

- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/components/TopNav.tsx`, `src/renderer/src/components/stats/StatsNav.tsx`, `src/renderer/src/components/PlayerDetailPanel.tsx`, `src/renderer/src/screens/LeagueScreen.tsx`, `src/renderer/src/screens/LineupScreen.tsx`, `src/renderer/src/screens/TradeScreen.tsx`, `src/renderer/src/screens/WaiverScreen.tsx`, `src/renderer/src/screens/stats/StatsApp.tsx`, `src/renderer/src/screens/stats/StatsPlayer.tsx`, `tests/renderer/components/App.test.tsx`

- [ ] **Step 1: Write the failing test**

App's test mocks `DevTools` with three "Go there" buttons, and the Trade screen:

```diff
diff --git a/tests/renderer/components/App.test.tsx b/tests/renderer/components/App.test.tsx
index 62709d4..5ffe195 100644
--- a/tests/renderer/components/App.test.tsx
+++ b/tests/renderer/components/App.test.tsx
@@ -76,12 +76,43 @@ vi.mock('@/screens/LeagueScreen', async () => {
     }
   }
 })
+vi.mock('@/screens/TradeScreen', () => ({ TradeScreen: () => <div>Trade screen</div> }))
 vi.mock('@/screens/PlayersScreen', () => ({
   PlayersScreen: ({ focus }: { focus: { playerId: string } | null }) => (
     <div>Players screen on {focus?.playerId ?? 'nobody'}</div>
   )
 }))
 vi.mock('@/components/UpdateDialog', () => ({ UpdateDialog: () => null }))
+// Dev mode is tested on its own; here only App's "Go there" (dev-mode spec §6).
+vi.mock('@/components/dev/DevTools', () => {
+  const where = (product: string, screen: string, parts: Record<string, unknown>): unknown => ({
+    product,
+    screen,
+    parts: Object.fromEntries(Object.entries(parts).map(([k, data]) => [k, { label: k, data }]))
+  })
+  return {
+    DevTools: ({ children, onGo }: { children: React.ReactNode; onGo: (c: unknown) => void }) => (
+      <>
+        {children}
+        <button type="button" onClick={() => onGo(where('fantasy', 'trade', {}))}>
+          Go to Trade
+        </button>
+        <button
+          type="button"
+          onClick={() => onGo(where('fantasy', 'lineup', { player: { playerId: '7564' } }))}
+        >
+          Go to a player file
+        </button>
+        <button
+          type="button"
+          onClick={() => onGo(where('stats', 'player', { player: { id: '00-0036900' } }))}
+        >
+          Go to a Stats player
+        </button>
+      </>
+    )
+  }
+})

 const LEAGUE: League = {
   leagueId: 'L1',
@@ -149,4 +180,16 @@ describe('App: two products (stats-analysis spec §9.1)', () => {
     fireEvent.click(await screen.findByRole('button', { name: 'Full stats of the Rams' }))
     expect(await screen.findByText('Stats focus: team LA')).toBeTruthy()
   })
+
+  it('goes where a dev note was written (dev-mode spec §6)', async () => {
+    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
+    render(<App />)
+    expect(await screen.findByText('League screen')).toBeTruthy()
+    fireEvent.click(screen.getByRole('button', { name: 'Go to Trade' }))
+    expect(screen.getByText('Trade screen')).toBeTruthy()
+    fireEvent.click(screen.getByRole('button', { name: 'Go to a player file' }))
+    expect(screen.getByText('Players screen on 7564')).toBeTruthy()
+    fireEvent.click(screen.getByRole('button', { name: 'Go to a Stats player' }))
+    expect(screen.getByText('Stats focus: player 00-0036900')).toBeTruthy()
+  })
 })
```

- [ ] **Step 2: Run it and see it fail**

```bash
npx vitest run tests/renderer/components/App.test.tsx
```

Expected: 1 failed (`goes where a dev note was written` — no "Go to Trade" button), 5 passed.

- [ ] **Step 3: Implement**

App:

```diff
diff --git a/src/renderer/src/App.tsx b/src/renderer/src/App.tsx
index 37ac604..e6a2915 100644
--- a/src/renderer/src/App.tsx
+++ b/src/renderer/src/App.tsx
@@ -1,4 +1,5 @@
 import { useCallback, useEffect, useMemo, useState } from 'react'
+import { DevTools } from '@/components/dev/DevTools'
 import { TopNav, type Screen } from '@/components/TopNav'
 import { UpdateDialog } from '@/components/UpdateDialog'
 import { SetupScreen } from '@/screens/SetupScreen'
@@ -14,6 +15,9 @@ import { api } from '@/lib/api'
 import { ProductLinksContext, type ProductLinks } from '@/lib/productLinks'
 import { useTheme } from '@/lib/theme'
 import { useUpdateState } from '@/lib/useUpdateState'
+import type { NoteContext } from '@shared/devNotes'
+
+const SCREENS: Screen[] = ['setup', 'league', 'rules', 'players', 'lineup', 'trade', 'waivers']

 /** Screens with an Edition masthead lay out their own scroll regions; the rest scroll as a page. */
 const FULL_BLEED: Screen[] = ['league', 'players', 'lineup', 'trade', 'waivers', 'rules', 'setup']
@@ -53,6 +57,30 @@ export default function App(): React.JSX.Element {
     []
   )

+  // Dev-mode spec §6 "Go there": the note's product and screen, and its player or team.
+  const goTo = useCallback(
+    (context: NoteContext) => {
+      const data = (key: string): Record<string, unknown> => context.parts[key]?.data ?? {}
+      if (context.product === 'stats') {
+        const player = data('player').id
+        const team = data('team').team
+        setStatsFocus((f) => {
+          const nonce = (f?.nonce ?? 0) + 1
+          if (typeof player === 'string') return { kind: 'player', id: player, nonce }
+          if (typeof team === 'string') return { kind: 'team', team, nonce }
+          return f
+        })
+        setProduct('stats')
+        return
+      }
+      setProduct('fantasy')
+      const player = data('player').playerId
+      if (typeof player === 'string') openPlayer(player)
+      else if (SCREENS.includes(context.screen as Screen)) setScreen(context.screen as Screen)
+    },
+    [openPlayer]
+  )
+
   useEffect(() => {
     void api.app
       .version()
@@ -109,7 +137,7 @@ export default function App(): React.JSX.Element {

   if (product === 'stats') {
     return (
-      <>
+      <DevTools product="stats" screen="home" onGo={goTo}>
         <StatsApp
           hasLeague={hasLeague}
           leagueKey={dataVersion}
@@ -130,54 +158,56 @@ export default function App(): React.JSX.Element {
           onScope={setStatsScope}
         />
         {updateDialog}
-      </>
+      </DevTools>
     )
   }

   return (
-    <ProductLinksContext.Provider value={links}>
-      <div className="flex h-full flex-col">
-        <TopNav
-          current={screen}
-          onNavigate={setScreen}
-          hasLeague={hasLeague}
-          update={update}
-          version={version}
-          onOpenUpdate={() => setUpdateOpen(true)}
-          theme={theme}
-          onToggleTheme={toggleTheme}
-          refreshKey={dataVersion}
-          onRefreshed={bumpData}
-          onOpenStats={() => {
-            setStatsFocus(null)
-            setProduct('stats')
-          }}
-        />
-        <main
-          className={
-            FULL_BLEED.includes(screen)
-              ? 'flex min-h-0 flex-1 flex-col'
-              : 'min-h-0 flex-1 overflow-auto px-8 py-6'
-          }
-        >
-          {screen === 'setup' && (
-            <SetupScreen
-              onImported={() => {
-                setHasLeague(true)
-                bumpData()
-              }}
-              onGoLeague={() => setScreen('league')}
-            />
-          )}
-          {screen === 'league' && <LeagueScreen key={dataVersion} onOpenPlayer={openPlayer} />}
-          {screen === 'rules' && <RulesScreen onSaved={bumpData} />}
-          {screen === 'players' && <PlayersScreen dataVersion={dataVersion} focus={focus} />}
-          {screen === 'lineup' && <LineupScreen dataVersion={dataVersion} />}
-          {screen === 'trade' && <TradeScreen dataVersion={dataVersion} />}
-          {screen === 'waivers' && <WaiverScreen dataVersion={dataVersion} />}
-        </main>
-        {updateDialog}
-      </div>
-    </ProductLinksContext.Provider>
+    <DevTools product="fantasy" screen={screen} onGo={goTo}>
+      <ProductLinksContext.Provider value={links}>
+        <div className="flex h-full flex-col">
+          <TopNav
+            current={screen}
+            onNavigate={setScreen}
+            hasLeague={hasLeague}
+            update={update}
+            version={version}
+            onOpenUpdate={() => setUpdateOpen(true)}
+            theme={theme}
+            onToggleTheme={toggleTheme}
+            refreshKey={dataVersion}
+            onRefreshed={bumpData}
+            onOpenStats={() => {
+              setStatsFocus(null)
+              setProduct('stats')
+            }}
+          />
+          <main
+            className={
+              FULL_BLEED.includes(screen)
+                ? 'flex min-h-0 flex-1 flex-col'
+                : 'min-h-0 flex-1 overflow-auto px-8 py-6'
+            }
+          >
+            {screen === 'setup' && (
+              <SetupScreen
+                onImported={() => {
+                  setHasLeague(true)
+                  bumpData()
+                }}
+                onGoLeague={() => setScreen('league')}
+              />
+            )}
+            {screen === 'league' && <LeagueScreen key={dataVersion} onOpenPlayer={openPlayer} />}
+            {screen === 'rules' && <RulesScreen onSaved={bumpData} />}
+            {screen === 'players' && <PlayersScreen dataVersion={dataVersion} focus={focus} />}
+            {screen === 'lineup' && <LineupScreen dataVersion={dataVersion} />}
+            {screen === 'trade' && <TradeScreen dataVersion={dataVersion} />}
+            {screen === 'waivers' && <WaiverScreen dataVersion={dataVersion} />}
+          </main>
+          {updateDialog}
+        </div>
+      </ProductLinksContext.Provider>
+    </DevTools>
   )
 }
```

The navs:

```diff
diff --git a/src/renderer/src/components/TopNav.tsx b/src/renderer/src/components/TopNav.tsx
index 5e11d5f..2788a77 100644
--- a/src/renderer/src/components/TopNav.tsx
+++ b/src/renderer/src/components/TopNav.tsx
@@ -1,4 +1,5 @@
 import { useCallback, useEffect, useState } from 'react'
+import { DevChip } from '@/components/dev/DevChip'
 import { Mark } from '@/components/edition'
 import { UpdatePill } from '@/components/UpdatePill'
 import { api } from '@/lib/api'
@@ -137,6 +138,7 @@ export function TopNav({
       >
         <Mark />
         <span className="text-[15px] leading-none font-semibold tracking-[-0.01em]">Companion</span>
+        <DevChip />
       </div>
       <div className="flex gap-[22px] self-stretch font-cond text-[15px] leading-none font-bold tracking-[0.08em] uppercase">
         {ITEMS.map(({ id, label }) => (
diff --git a/src/renderer/src/components/stats/StatsNav.tsx b/src/renderer/src/components/stats/StatsNav.tsx
index 70523d2..ca63938 100644
--- a/src/renderer/src/components/stats/StatsNav.tsx
+++ b/src/renderer/src/components/stats/StatsNav.tsx
@@ -1,3 +1,4 @@
+import { DevChip } from '@/components/dev/DevChip'
 import { Mark } from '@/components/edition'
 import { UpdatePill } from '@/components/UpdatePill'
 import { freshness } from '@/lib/stats/scope'
@@ -56,6 +57,7 @@ export function StatsNav({
         <span className="text-[15px] leading-none font-semibold tracking-[-0.01em]">
           Companion <span className="font-medium text-fg-3">Stats</span>
         </span>
+        <DevChip />
       </div>
       <div className="flex gap-[22px] self-stretch text-[13.5px] leading-none font-medium">
         {ITEMS.map(({ id, label }) => {
```

The screens:

```diff
diff --git a/src/renderer/src/components/PlayerDetailPanel.tsx b/src/renderer/src/components/PlayerDetailPanel.tsx
index 6642971..6b45a91 100644
--- a/src/renderer/src/components/PlayerDetailPanel.tsx
+++ b/src/renderer/src/components/PlayerDetailPanel.tsx
@@ -13,6 +13,7 @@ import {
 import { NewsSection } from '@/components/NewsSection'
 import { WeeklyChart } from '@/components/WeeklyChart'
 import { api } from '@/lib/api'
+import { useNoteContext } from '@/lib/dev/noteContext'
 import { errorMessage, fmtPct, fmtPoints } from '@/lib/format'
 import { cellText, columnGroups, rosAdjustLine } from '@/lib/playersTableView'
 import {
@@ -147,6 +148,21 @@ export function PlayerDetailPanel({
   const [watch, setWatch] = useState<{ playerId: string; on: boolean } | null>(null)
   const playerId = player?.playerId ?? null
   const key = playerId === null ? null : `${season}|${playerId}`
+  // Dev-mode spec §3: the open player file.
+  useNoteContext(
+    'player',
+    player
+      ? {
+          label: player.fullName,
+          data: {
+            playerId: player.playerId,
+            name: player.fullName,
+            position: player.position,
+            team: player.team
+          }
+        }
+      : null
+  )
   // Spec §9.4: "Full stats ↗" opens the player (a defense: its team) in Companion Stats.
   const links = useProductLinks()
   const [link, setLink] = useState<{ playerId: string; link: PlayerLink | null } | null>(null)
diff --git a/src/renderer/src/screens/LeagueScreen.tsx b/src/renderer/src/screens/LeagueScreen.tsx
index de4b662..569f0e2 100644
--- a/src/renderer/src/screens/LeagueScreen.tsx
+++ b/src/renderer/src/screens/LeagueScreen.tsx
@@ -12,6 +12,7 @@ import {
   type Tone
 } from '@/components/edition'
 import { api } from '@/lib/api'
+import { useNoteContext } from '@/lib/dev/noteContext'
 import { errorMessage } from '@/lib/format'
 import {
   DEFAULT_PLAYOFF_TEAMS,
@@ -153,6 +154,11 @@ export function LeagueScreen({ onOpenPlayer }: LeagueScreenProps): React.JSX.Ele
   const [roster, setRoster] = useState<RosterPlayer[]>([])
   const [error, setError] = useState<string | null>(null)
   const [ctx, setCtx] = useState<PointsContext | null>(null)
+  const team = teams?.find((t) => t.rosterId === selected) ?? null
+  useNoteContext(
+    'team',
+    team ? { label: team.teamName ?? team.displayName, data: { rosterId: team.rosterId } } : null
+  )
   const [playoffTeams, setPlayoffTeams] = useState(DEFAULT_PLAYOFF_TEAMS)

   useEffect(() => {
diff --git a/src/renderer/src/screens/LineupScreen.tsx b/src/renderer/src/screens/LineupScreen.tsx
index 32085aa..1a876cc 100644
--- a/src/renderer/src/screens/LineupScreen.tsx
+++ b/src/renderer/src/screens/LineupScreen.tsx
@@ -12,6 +12,7 @@ import {
 } from '@/components/edition'
 import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
 import { api } from '@/lib/api'
+import { useNoteContext } from '@/lib/dev/noteContext'
 import { errorMessage } from '@/lib/format'
 import {
   benchFor,
@@ -132,6 +133,7 @@ export function LineupScreen({ dataVersion }: LineupScreenProps): React.JSX.Elem
   const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
   const [applied, setApplied] = useState<string | null>(null)
   const [selected, setSelected] = useState<DetailTarget | null>(null)
+  useNoteContext('week', week !== null ? { label: `wk ${week}`, data: { season, week } } : null)

   useEffect(() => {
     void api.players
diff --git a/src/renderer/src/screens/TradeScreen.tsx b/src/renderer/src/screens/TradeScreen.tsx
index cf725dc..dbcca30 100644
--- a/src/renderer/src/screens/TradeScreen.tsx
+++ b/src/renderer/src/screens/TradeScreen.tsx
@@ -4,14 +4,17 @@ import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
 import { TradeBuilder } from '@/components/TradeBuilder'
 import { TradeSuggestions } from '@/components/TradeSuggestions'
 import { api } from '@/lib/api'
+import { useNoteContext } from '@/lib/dev/noteContext'
 import { errorMessage } from '@/lib/format'
 import {
   EMPTY_DEAL,
   addTeam,
   dealFromMoves,
   dealOf,
+  getsLine,
   proposalFrom,
   pruneDeal,
+  teamLabel,
   type BuilderDeal
 } from '@/lib/tradeBuilder'
 import { ordinalSuffix } from '@/lib/leagueView'
@@ -130,6 +133,15 @@ export function TradeScreen({ dataVersion }: TradeScreenProps): React.JSX.Elemen

   const pool = loaded?.key === key ? loaded.pool : null
   const notice = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
+  // Dev-mode spec §3: the tab, and the deal on the builder.
+  const sides = pool && deal.picks.length > 0 ? [pool.me.rosterId, ...deal.teams] : []
+  useNoteContext('trade', {
+    label: [
+      tab,
+      ...sides.map((id) => `${teamLabel(pool!, id)} gets ${getsLine(deal, id, pool!)}`)
+    ].join(' · '),
+    data: { season, tab, deal }
+  })

   const changeDeal = (d: BuilderDeal): void => {
     dealSeq.current++
diff --git a/src/renderer/src/screens/WaiverScreen.tsx b/src/renderer/src/screens/WaiverScreen.tsx
index 2fb00ff..bdd284d 100644
--- a/src/renderer/src/screens/WaiverScreen.tsx
+++ b/src/renderer/src/screens/WaiverScreen.tsx
@@ -11,6 +11,7 @@ import {
 } from '@/components/edition'
 import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
 import { api } from '@/lib/api'
+import { useNoteContext } from '@/lib/dev/noteContext'
 import { errorMessage, fmtSigned } from '@/lib/format'
 import { ordinalSuffix } from '@/lib/leagueView'
 import { fmtMarket } from '@/lib/tradeView'
@@ -529,6 +530,10 @@ export function WaiverScreen({ dataVersion }: WaiverScreenProps): React.JSX.Elem
   } | null>(null)
   const [streamFailed, setStreamFailed] = useState<{ key: string; message: string } | null>(null)
   const [streamChoice, setStreamChoice] = useState<Record<string, number>>({})
+  useNoteContext('mode', {
+    label: mode === 'ros' ? 'rest of season' : `streaming wk ${pickedWeek ?? 'next'}`,
+    data: { season, mode, week: pickedWeek, position: chip }
+  })

   useEffect(() => {
     void api.players
```

```diff
diff --git a/src/renderer/src/screens/stats/StatsApp.tsx b/src/renderer/src/screens/stats/StatsApp.tsx
index 6c5dd1c..4cafea2 100644
--- a/src/renderer/src/screens/stats/StatsApp.tsx
+++ b/src/renderer/src/screens/stats/StatsApp.tsx
@@ -1,6 +1,7 @@
 import { useEffect, useState } from 'react'
 import { StatsNav, type StatsScreen } from '@/components/stats/StatsNav'
 import { api } from '@/lib/api'
+import { useNoteContext, useNoteScreen } from '@/lib/dev/noteContext'
 import { errorMessage } from '@/lib/format'
 import type { BoardDef } from '@/lib/stats/boards'
 import { bestFirst, defaultBoard, normalizeBoard } from '@/lib/stats/leaderboard'
@@ -129,6 +130,19 @@ export function StatsApp({
     setScreen('player')
   }

+  // Dev-mode spec §3: Stats' screen, its scope, and the team dashboard's team.
+  useNoteScreen(screen)
+  useNoteContext('scope', {
+    label: `${effective.season}${effective.weeks ? ` wk ${effective.weeks[0]}–${effective.weeks[1]}` : ''} ${effective.seasonType} · ${effective.scoring}`,
+    data: { ...effective }
+  })
+  useNoteContext(
+    'team',
+    screen === 'team' && shownTeam
+      ? { label: shownTeam, data: { team: shownTeam, tab: teamTab } }
+      : null
+  )
+
   const openBoard = (board: LeaderboardBoard, selected: string | null): void => {
     setOpen((o) => ({ board, selected, nonce: (o?.nonce ?? 0) + 1 }))
     setScreen(board.entity === 'player' ? 'players' : 'teams')
diff --git a/src/renderer/src/screens/stats/StatsPlayer.tsx b/src/renderer/src/screens/stats/StatsPlayer.tsx
index ce0e880..45096ca 100644
--- a/src/renderer/src/screens/stats/StatsPlayer.tsx
+++ b/src/renderer/src/screens/stats/StatsPlayer.tsx
@@ -9,6 +9,7 @@ import { ScopeBar } from '@/components/stats/ScopeBar'
 import { PercentileBar, StatSection, StatSections } from '@/components/stats/StatLines'
 import { WeekChart } from '@/components/stats/WeekChart'
 import { api } from '@/lib/api'
+import { useNoteContext } from '@/lib/dev/noteContext'
 import { fmtStat } from '@/lib/stats/format'
 import { qualifies } from '@/lib/stats/leaderboard'
 import {
@@ -137,6 +138,12 @@ export function StatsPlayer({
   onOpenFantasyPlayer?: (playerId: string) => void
 }): React.JSX.Element {
   const { bio, error: bioError } = usePlayerBio(player.id, data.version)
+  // Dev-mode spec §3: the dashboard's player and tab.
+  const known = bio?.id === player.id ? bio : null
+  useNoteContext('player', {
+    label: known?.name ?? player.id,
+    data: { id: player.id, name: known?.name ?? null, position: known?.position ?? null, tab }
+  })
   const position: PositionGroup | null =
     player.position ?? positionGroup(bio?.id === player.id ? bio.position : null)
   // The rail follows the player shown; a position picked in it shows until its leader opens.
```

- [ ] **Step 4: Run and check**

```bash
npx vitest run && npm run typecheck && npx eslint src tests electron.vite.config.ts
```

Expected: 1085 passed, 5 skipped; clean. The App, StatsApp, StatsPlayer, Trade, Waiver, Lineup, League and player-file tests stay green: outside `DevTools` the hooks do nothing.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/src/App.tsx src/renderer/src/components/TopNav.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/components/PlayerDetailPanel.tsx src/renderer/src/screens/LeagueScreen.tsx src/renderer/src/screens/LineupScreen.tsx src/renderer/src/screens/TradeScreen.tsx src/renderer/src/screens/WaiverScreen.tsx src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsPlayer.tsx tests/renderer/components/App.test.tsx
git add src/renderer/src/App.tsx src/renderer/src/components/TopNav.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/components/PlayerDetailPanel.tsx src/renderer/src/screens/LeagueScreen.tsx src/renderer/src/screens/LineupScreen.tsx src/renderer/src/screens/TradeScreen.tsx src/renderer/src/screens/WaiverScreen.tsx src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsPlayer.tsx tests/renderer/components/App.test.tsx
git commit -m "feat(dev): wire dev notes into both products"
```

---

### Task 7: Docs

**Files:**

- Create: `docs/reference/dev-notes.md`
- Modify: `README.md`, `docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md`

- [ ] **Step 1: The reference**

Create `docs/reference/dev-notes.md`:

````markdown
# Dev mode and dev notes — reference

Added in v0.31.0 (spec `docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md`, amended in §11). Dev mode shows developer tools inside the one installed app; today that is the notes panel, for writing down changes while using the app.

## Dev mode

- **Ctrl+Shift+D** anywhere switches it on or off; a toast confirms. Stored as `dev_mode` in `app_settings`. With nothing stored it is **on** under `npm run dev` and **off** in the packaged app.
- `--dev-mode` on the command line turns it on for that launch only (until it is switched), e.g. a second Windows shortcut: `FantasyCompanion.exe --dev-mode`.
- While on, both navs show an amber **DEV** chip next to "Companion": New note (Ctrl+Shift+N), All notes, Open notes folder, Turn off Dev mode.
- It only shows tools; it changes no data and no result.

## Writing a note

**✎ Note** (bottom-right), **Ctrl+Shift+N** or the DEV chip opens the panel. It docks bottom-right, drags by its header, collapses (chevron, or **Esc** while working in it) and closes (✕) without losing the draft. The app stays usable around it.

| Part                  | What it does                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Text                  | Required; the first line is the title. Text and tag survive a reload; attachments live until the app closes.                                                         |
| Tag                   | Bug · Idea (default) · Polish                                                                                                                                        |
| Screenshot            | The whole window, without the panel or any dev overlay                                                                                                               |
| Snip                  | Freezes the window (without the panel), then drag a box; Enter or Use keeps it, Esc cancels. Cropped at full resolution.                                             |
| Context line          | `Fantasy › Players · Josh Allen`: where you were when the panel opened. ▸ shows the JSON, ↻ captures it again from where you are now.                                |
| Include recent errors | The app's errors of the last 15 minutes (main process, renderer, sync failures of the last hour), at most 10, repeats counted. Ticked by default when there are any. |
| Save                  | Ctrl+Enter. Writes the note and its images, closes the panel, "Saved N-014".                                                                                         |

What a screen adds to the context (`useNoteContext`, `src/renderer/src/lib/dev/noteContext.tsx`): the open player file (any Fantasy screen), the League screen's selected team, Lineup's week, Waivers' mode and week, Trade's tab and deal; in Stats, the screen, the scope, the team dashboard's team and the player dashboard's player. Main adds the app version, dev or packaged, the platform, the league and the time.

## All notes

Newest first; Open (default) / Done / All, and by tag. Per note: Mark done / Reopen, Copy for Claude (the note's Markdown with absolute image paths, to paste in a session), Go there (the note's product and screen; its player's file or dashboard, or its team's), Delete (asks; removes its images). Footer: Open folder, Change folder…, Copy all open.

## The notes folder

| Run                  | Default folder                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Packaged, Windows    | `%APPDATA%\FantasyCompanion\dev-notes\` — from WSL `/mnt/c/Users/<you>/AppData/Roaming/FantasyCompanion/dev-notes/` |
| `npm run dev` in WSL | `~/.config/FantasyCompanion/dev-notes/`                                                                             |

_Change folder…_ stores another one as `dev_notes_dir` (e.g. the repo's `docs/dev-notes/` through `\\wsl.localhost\…`, so the Windows app writes into the project).

The folder holds `notes.md` and `img/<id>-<n>.png`. `notes.md` starts with a short header, then one `##` section per note, oldest first:

```markdown
## N-014 · Bug · open — Trade card cuts off long player names

<!-- note {"id":"N-014","tag":"bug","status":"open","created":"2026-10-22T14:03:11+02:00","images":["img/N-014-1.png"]} -->

**Where:** Fantasy › Trade · build · Me gets J. Chase · Team 4 gets J. Allen
**When:** 2026-10-22 14:03 · v0.31.0 · packaged · win32

Trade card cuts off long player names
"Amon-Ra St. Brown" is cut at "Amon-Ra St." on the alternatives list.

![Snip 1](img/N-014-1.png)

<details><summary>Context</summary> … the context as JSON … </details>

<details><summary>Recent errors (1)</summary> … time, origin, message, stack … </details>
```

- The `<!-- note {...} -->` line is what the app reads: id, tag, status, created, images. Its `status` and `tag` win over the heading's.
- Hand edits are fine: the app rewrites only the heading and meta line of a note it changes, and keeps everything else (other notes, extra lines, a section without a meta line, the header) byte for byte. Lines of a note's text that start with `#` or `##` are written escaped (`\#`) so they never start a section.
- Main owns the file (`src/main/dev/notesStore.ts`): every change reads it again and writes it atomically.

## Working the notes with Claude Code

- "Go through my open dev notes": read `notes.md` (and the images it links), propose what to do per note, and after implementing one set its meta line to `"status":"done"` and add a line `Done in vX.Y.Z (<commit>)` under its text.
- Or paste one note from _Copy for Claude_ into a session.

## Code

| Where                              | What                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/shared/devNotes.ts`           | Note types; the file's write, parse and edit functions (pure)                                       |
| `src/main/dev/mode.ts`             | The setting and `--dev-mode`                                                                        |
| `src/main/dev/errorLog.ts`         | The recent-errors buffer: `console.error`, uncaught exceptions, renderer errors, sync               |
| `src/main/dev/notesStore.ts`       | The folder: notes, images, atomic writes                                                            |
| `src/main/dev/ipc.ts`              | `dev:*` handlers: mode, capture, errors, notes, folder, clipboard                                   |
| `src/renderer/src/components/dev/` | `DevTools` (mode, shortcuts, error forwarding), `DevChip`, `NotesPanel`, `SnipOverlay`, `NotesList` |
| `src/renderer/src/lib/dev/`        | `noteContext.tsx` (screens' parts), `capture.ts` (hide, capture, crop), `devState.ts`               |
````

```diff
diff --git a/README.md b/README.md
index bc8d74d..1425aab 100644
--- a/README.md
+++ b/README.md
@@ -6,6 +6,7 @@ Windows desktop companion for a Sleeper fantasy football league: league sync, st
 - Data reference (value & signals payload, definitions, where each number is shown): `docs/reference/value-and-signals.md`
 - Stats: the database `docs/reference/stats-database.md`, the screens `docs/reference/stats-screens.md`. Stats works without a league: the app then opens on it.
 - Plans: `docs/superpowers/plans/`
+- Dev mode (Ctrl+Shift+D) and dev notes (Ctrl+Shift+N): `docs/reference/dev-notes.md`
 - Changelog: GitHub Releases (`https://github.com/Puffinnois/fantasy-football-companion/releases`) — each release's notes are what the in-app update popup shows.
 - Dev (WSL2, Node 22 via nvm): `npm install && npm run dev`
 - Dev data (Linux): `~/.config/FantasyCompanion/companion.db`; packaged (Windows): `%APPDATA%\FantasyCompanion\companion.db`
```

- [ ] **Step 2: The spec's amendments (§11)**

The diff also carries Prettier's table alignment of the spec's §2 table.

````diff
diff --git a/docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md b/docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md
index efc7dc6..e0f74b1 100644
--- a/docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md
+++ b/docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md
@@ -12,7 +12,7 @@
 - **Stored** as `dev_mode` (`'1'` / `'0'`) in `app_settings`. Absent → off in the packaged app, **on** when unpackaged (`npm run dev`).
 - **Switch:**
   - `Ctrl+Shift+D` anywhere in the app toggles it. A toast confirms: `Dev mode on` / `Dev mode off`.
-  - While on, both navs (Fantasy `TopNav` and the Stats nav) show a small **DEV** chip next to the version. Clicking it opens a menu: *Notes (Ctrl+Shift+N)*, *Open notes folder*, *Turn off Dev mode*.
+  - While on, both navs (Fantasy `TopNav` and the Stats nav) show a small **DEV** chip next to the version. Clicking it opens a menu: _Notes (Ctrl+Shift+N)_, _Open notes folder_, _Turn off Dev mode_.
   - `--dev-mode` on the command line turns it on for that launch only (handy for a shortcut on the Windows desktop).
 - **Not a lock.** Anyone who knows the shortcut can turn it on; it only shows tools, it never changes data or results.
 - **IPC:** `dev:get` → `boolean`, `dev:set(on)`, and a `dev:changed` event so both products update at once.
@@ -25,15 +25,15 @@

 **Fields.**

-| Field | Notes |
-| --- | --- |
-| Text | Required. Multi-line. The first line becomes the note's title (trimmed to 80 chars). |
-| Tag | `Bug` · `Idea` · `Polish` — one, default `Idea`. |
-| Attachments | 0–6 images, shown as thumbnails with ✕ to remove. |
-| Context | A one-line summary (`Fantasy › Players · Josh Allen · wk 8`) with ↻ to re-capture from where you are now and ▸ to see the full JSON. |
-| Include recent errors | Checkbox, on by default when there are any (§4), with the count. |
+| Field                 | Notes                                                                                                                                |
+| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
+| Text                  | Required. Multi-line. The first line becomes the note's title (trimmed to 80 chars).                                                 |
+| Tag                   | `Bug` · `Idea` · `Polish` — one, default `Idea`.                                                                                     |
+| Attachments           | 0–6 images, shown as thumbnails with ✕ to remove.                                                                                    |
+| Context               | A one-line summary (`Fantasy › Players · Josh Allen · wk 8`) with ↻ to re-capture from where you are now and ▸ to see the full JSON. |
+| Include recent errors | Checkbox, on by default when there are any (§4), with the count.                                                                     |

-**Buttons:** *Screenshot*, *Snip*, *Save* (`Ctrl+Enter`), *Discard*, and *All notes* (§6).
+**Buttons:** _Screenshot_, _Snip_, _Save_ (`Ctrl+Enter`), _Discard_, and _All notes_ (§6).

 ### 2.1 The panel never appears in a capture

@@ -51,7 +51,7 @@ The whole window as it looks right now, without the panel (§2.1). Added as an a
 ### 2.3 Snip

 1. Capture the whole window as in §2.1 (so the region you pick is exactly what was on screen, frozen — menus and hovers stay as they were).
-2. Show that capture full-window in a snip overlay, dimmed, cursor a crosshair. Drag a rectangle; the selection shows undimmed with its size in px. Release to keep, drag again to redo, `Enter` / *Use* to confirm, `Esc` to cancel.
+2. Show that capture full-window in a snip overlay, dimmed, cursor a crosshair. Drag a rectangle; the selection shows undimmed with its size in px. Release to keep, drag again to redo, `Enter` / _Use_ to confirm, `Esc` to cancel.
 3. The crop is made at device-pixel resolution (selection × `devicePixelRatio`), so it stays sharp on a scaled display. Selections smaller than 8 × 8 px are ignored.
 4. The overlay closes and the panel returns with the crop as an attachment.

@@ -94,7 +94,7 @@ dev-notes/
     N-014-2.png
 ```

-*All notes* → *Change folder…* can point it elsewhere (stored as `dev_notes_dir`). Useful choice: the repo's `docs/dev-notes/` through `\\wsl.localhost\…`, so the packaged Windows app writes notes straight into the project. Default paths, for reference:
+_All notes_ → _Change folder…_ can point it elsewhere (stored as `dev_notes_dir`). Useful choice: the repo's `docs/dev-notes/` through `\\wsl.localhost\…`, so the packaged Windows app writes notes straight into the project. Default paths, for reference:

 - Packaged on Windows: `%APPDATA%\FantasyCompanion\dev-notes\` — from WSL: `/mnt/c/Users/<you>/AppData/Roaming/FantasyCompanion/dev-notes/`.
 - `npm run dev` in WSL: `~/.config/FantasyCompanion/dev-notes/` (a different store unless the folder is changed).
@@ -152,11 +152,11 @@ Maybe wrap to two lines or shrink the font.

 ## 6. All notes

-A second view of the panel lists notes newest first: id, tag, title, age, status, thumbnail. Filter: *Open* (default) / *Done* / *All*, and by tag.
+A second view of the panel lists notes newest first: id, tag, title, age, status, thumbnail. Filter: _Open_ (default) / _Done_ / _All_, and by tag.

-Per note: *Mark done* / *Reopen*, *Delete* (confirms; removes its images), *Copy for Claude* (the note's section as Markdown with image paths made absolute, ready to paste in a session), *Go there* (switches to the note's product and screen; opens the player/team when the context has one).
+Per note: _Mark done_ / _Reopen_, _Delete_ (confirms; removes its images), _Copy for Claude_ (the note's section as Markdown with image paths made absolute, ready to paste in a session), _Go there_ (switches to the note's product and screen; opens the player/team when the context has one).

-Footer: *Open folder*, *Change folder…*, *Copy all open for Claude*.
+Footer: _Open folder_, _Change folder…_, _Copy all open for Claude_.

 ## 7. Working the notes with Claude Code

@@ -188,3 +188,16 @@ No app change — this is how the format is meant to be used, recorded so the co
 - Syncing notes between machines (the folder choice covers sharing with the repo).
 - Annotating screenshots (arrows, text). Snip covers "show exactly this part"; drawing can come later.
 - Any other dev tool. Dev mode is built so more can be added behind it.
+
+## 11. Amendments (dev-notes plan, 2026-10-22)
+
+Taken while building the plan's prototype; the reference is `docs/reference/dev-notes.md`.
+
+- **A. No zoom field (§3).** Electron gives the page zoom to the preload only; `env.devicePixelRatio` already includes it. `env` is width, height, devicePixelRatio, theme.
+- **B. Errors (§4).** Origins are `main`, `renderer` and `sync`: the stats and engine workers' failures reach main's `console.error`, so they are `main`. Uncaught exceptions are observed with `uncaughtExceptionMonitor`, which leaves Electron's own handling as it is. Node's process warnings (`(node:…) ExperimentalWarning: …`) are not errors and are left out. The same error again is listed once, the newest, with `(×n)`. Times in the note are local, like its When line.
+- **C. The draft (§2).** Its text and tag survive a reload (`localStorage`); attachments stay in memory until the app closes (a PNG is too large for `localStorage`).
+- **D. When the context is read (§3).** When the panel opens on a new note and on ↻, together with the recent errors. The note's `time` and When line are the save time; main adds `app`, `league` and `time` at save.
+- **E. IPC (§8).** `dev:mode`, `dev:setMode`, `dev:changed`, `dev:capture`, `dev:reportError` (a send, not an invoke), `dev:recentErrors`, `dev:notesList`, `dev:notesSave`, `dev:notesSetStatus`, `dev:notesRemove`, `dev:notesImage` (a thumbnail as a data URL; paths outside the folder are refused), `dev:notesFolder`, `dev:notesOpenFolder`, `dev:notesChooseFolder`, `dev:notesCopy` (main writes the clipboard, image paths absolute).
+- **F. What screens add (§3).** As §3, plus the League screen's selected team and Waivers' mode. The trade part's label is the tab and each side's "gets" line.
+- **G. Esc and focus (§2).** Esc collapses the panel while focus is in it; after Screenshot or Snip, focus returns to the text. The snip overlay takes Esc and Enter first, so they never also close a player file under it.
+- **H. Go there (§6).** Fantasy: the note's screen, or Players with the player's file when the note has one. Stats: the note's player or team dashboard, else Stats on its last screen.
````

- [ ] **Step 3: Commit**

```bash
npx prettier --write docs/reference/dev-notes.md README.md docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md
git add docs/reference/dev-notes.md README.md docs/superpowers/specs/2026-10-22-dev-mode-notes-design.md
git commit -m "docs(dev): document dev mode and dev notes"
```

---

### Task 8: The app, walked through

Outside the repo: `~/project/ffc-dev-notes-live/` (a copy of the dev league, the driver, its screenshots).

- [ ] **Step 1: A profile with the dev league**

```bash
mkdir -p ~/project/ffc-dev-notes-live/profile
node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync(process.env.HOME+'/.config/FantasyCompanion/companion.db',{readOnly:true}).exec(\"VACUUM INTO '\"+process.env.HOME+\"/project/ffc-dev-notes-live/profile/companion.db'\")"
npx electron-vite build
```

- [ ] **Step 2: The driver**

Copy Plan AC's driver (Task 7 Step 3 of `docs/superpowers/plans/2026-10-21-plan-ac-player-dashboard.md`) to `~/project/ffc-dev-notes-live/drive.mjs` and add two steps after the `if (s.type)` line:

```js
// {key:["KeyN", "N", 78, modifiers]} modifiers: alt 1, ctrl 2, meta 4, shift 8
if (s.key) {
  const [code, key, vk, modifiers] = s.key
  for (const type of ['rawKeyDown', 'keyUp'])
    await send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: vk, modifiers })
}
// {drag:[x1,y1,x2,y2]}
if (s.drag) {
  const [x1, y1, x2, y2] = s.drag
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 })
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: x1,
    y: y1,
    button: 'left',
    buttons: 1,
    clickCount: 1
  })
  for (let i = 1; i <= 8; i++)
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x1 + ((x2 - x1) * i) / 8,
      y: y1 + ((y2 - y1) * i) / 8,
      button: 'left',
      buttons: 1
    })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: x2,
    y: y2,
    button: 'left',
    buttons: 0,
    clickCount: 1
  })
}
```

Do not send a `size` step: the window's own 1280 × 800 is what `capturePage` captures.

- [ ] **Step 3: Walk-through 1 — writing a note**

Create `~/project/ffc-dev-notes-live/steps-1.json`:

```json
[
  {
    "wait": 15000
  },
  {
    "shot": "01-fantasy-dev"
  },
  {
    "click": "Players"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const r = document.querySelector('tbody tr'); if (!r) return 'no row'; r.click(); return r.textContent.slice(0, 40) })()"
  },
  {
    "wait": 2500
  },
  {
    "shot": "02-player-file"
  },
  {
    "key": ["KeyN", "N", 78, 10]
  },
  {
    "wait": 1500
  },
  {
    "shot": "03-panel-open"
  },
  {
    "click": "textarea"
  },
  {
    "type": "Player file header wraps badly\nThe team badge sits under the name."
  },
  {
    "click": "Bug"
  },
  {
    "wait": 300
  },
  {
    "shot": "04-typed"
  },
  {
    "click": "Screenshot"
  },
  {
    "wait": 1500
  },
  {
    "shot": "05-screenshot-attached"
  },
  {
    "click": "Snip"
  },
  {
    "wait": 1500
  },
  {
    "shot": "06-snip-overlay"
  },
  {
    "drag": [180, 120, 720, 420]
  },
  {
    "wait": 400
  },
  {
    "shot": "07-snip-selected"
  },
  {
    "click": "Use"
  },
  {
    "wait": 1200
  },
  {
    "shot": "08-snip-attached"
  },
  {
    "eval": "(() => { const b = document.querySelector('[role=dialog] [aria-expanded]'); b.click(); return b.textContent })()"
  },
  {
    "wait": 400
  },
  {
    "shot": "09-context"
  },
  {
    "key": ["Escape", "Escape", 27, 0]
  },
  {
    "wait": 400
  },
  {
    "shot": "10-collapsed"
  },
  {
    "eval": "(() => ({ fileOpen: !!document.querySelector('aside'), collapsed: !document.querySelector('textarea') }))()"
  },
  {
    "click": "[aria-label=Expand]"
  },
  {
    "wait": 400
  },
  {
    "click": "Save"
  },
  {
    "wait": 1500
  },
  {
    "shot": "11-saved-toast"
  },
  {
    "click": "Stats ↗"
  },
  {
    "wait": 5000
  },
  {
    "key": ["KeyN", "N", 78, 10]
  },
  {
    "wait": 1500
  },
  {
    "shot": "12-stats-panel"
  },
  {
    "click": "All notes"
  },
  {
    "wait": 1500
  },
  {
    "shot": "13-all-notes"
  },
  {
    "key": ["KeyD", "D", 68, 10]
  },
  {
    "wait": 1200
  },
  {
    "shot": "14-dev-off"
  }
]
```

```bash
APP=. node ~/project/ffc-dev-notes-live/drive.mjs ~/project/ffc-dev-notes-live/profile ~/project/ffc-dev-notes-live/steps-1.json ~/project/ffc-dev-notes-live/shots-1
```

Check (unpackaged, so Dev mode starts on):

- `01`: DEV chip beside "Companion"; ✎ Note bottom-right.
- `02`: a player file open. `03`: the panel docked over the file, empty text, Idea selected, context `Fantasy › Players · <the player>`, "Include recent errors (n)".
- `05`: one thumbnail; `06`: the frozen window dimmed under "Drag to select · Enter to use · Esc to cancel", the panel and the ✎ button gone; `07`: the 540 × 300 selection undimmed with its size; `08`: two thumbnails, the panel back with its text.
- The `eval` after `09` prints `{"fileOpen":true,"collapsed":true}`: Esc collapsed the panel and left the file open. `10`: the collapsed bar.
- `11`: "Saved N-001", the panel closed. `12`: in Stats, the panel with `Stats › Home · <season> REG · league`; `13`: All notes with N-001, its thumbnail and its actions. `14`: "Dev mode off", no chip, no button.
- `profile/dev-notes/notes.md`: the header, then `## N-001 · Bug · open — Player file header wraps badly`, the meta line with both images, Where and When lines, the text, `![Screenshot 1]` and `![Snip 2]`, the context JSON with the player (`playerId`, `name`, `position`, `team`) and the league, and the errors block with local times and no `ExperimentalWarning`.
- `img/N-001-1.png` is 1280 × 800 and shows the player file **without the panel**; `img/N-001-2.png` is 540 × 300 and is exactly the selected region, undimmed.

- [ ] **Step 4: Walk-through 2 — dragging, dark, Stats, the list**

Create `~/project/ffc-dev-notes-live/steps-2.json`:

```json
[
  {
    "wait": 15000
  },
  {
    "key": ["KeyD", "D", 68, 10]
  },
  {
    "wait": 800
  },
  {
    "click": "Players"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const r = document.querySelectorAll('tbody tr')[3]; r.click(); return r.textContent.slice(0, 30) })()"
  },
  {
    "wait": 2000
  },
  {
    "click": "Note"
  },
  {
    "wait": 1200
  },
  {
    "click": "textarea"
  },
  {
    "type": "Snip then Esc"
  },
  {
    "click": "Snip"
  },
  {
    "wait": 1200
  },
  {
    "drag": [40, 360, 500, 470]
  },
  {
    "click": "Use"
  },
  {
    "wait": 800
  },
  {
    "eval": "document.activeElement && document.activeElement.tagName"
  },
  {
    "key": ["Escape", "Escape", 27, 0]
  },
  {
    "wait": 400
  },
  {
    "eval": "(() => ({ fileOpen: !!document.querySelector('aside'), collapsed: !document.querySelector('textarea') }))()"
  },
  {
    "shot": "01-collapsed-file-open"
  },
  {
    "drag": [1000, 780, 420, 120]
  },
  {
    "wait": 400
  },
  {
    "shot": "02-dragged"
  },
  {
    "click": "[aria-label=Expand]"
  },
  {
    "wait": 300
  },
  {
    "click": "[aria-label='Switch theme']"
  },
  {
    "wait": 600
  },
  {
    "click": "[aria-label='Capture the context again']"
  },
  {
    "wait": 600
  },
  {
    "shot": "03-dark-dragged"
  },
  {
    "click": "Save"
  },
  {
    "wait": 1200
  },
  {
    "click": "Stats ↗"
  },
  {
    "wait": 3000
  },
  {
    "click": "Players"
  },
  {
    "wait": 4000
  },
  {
    "key": ["KeyN", "N", 78, 10]
  },
  {
    "wait": 1200
  },
  {
    "shot": "04-stats-player-panel"
  },
  {
    "click": "All notes"
  },
  {
    "wait": 1200
  },
  {
    "shot": "05-list-dark"
  },
  {
    "eval": "(() => { const b = [...document.querySelectorAll('button')].filter((e) => e.textContent.trim() === 'Go there'); b[b.length - 1].click(); return b.length })()"
  },
  {
    "wait": 2500
  },
  {
    "shot": "06-went-there"
  },
  {
    "click": "[aria-label='Switch theme']"
  }
]
```

```bash
APP=. node ~/project/ffc-dev-notes-live/drive.mjs ~/project/ffc-dev-notes-live/profile ~/project/ffc-dev-notes-live/steps-2.json ~/project/ffc-dev-notes-live/shots-2
```

Check:

- The first `eval` after Use prints `"TEXTAREA"` (focus came back); the next `{"fileOpen":true,"collapsed":true}`.
- `02`: the collapsed bar dragged to the top middle. `03`: expanded in place, dark theme, the context re-captured (still Puka Nacua), one snip thumbnail.
- `04`: the Stats player screen, the panel where it was left, context `Stats › Player · …`. `05`: All notes, dark, N-002 above N-001, both with thumbnails.
- `06`: "Go there" on N-001 opened Fantasy's Players board with N-001's player's file (the row walk-through 1 opened), in dark.

- [ ] **Step 5: The packaged default**

Dev mode is off in a packaged build until switched. On Windows, after Task 9's Package check, run the unpacked app from the workflow's artifact once by hand if one is available; otherwise check it on the first install of `v0.31.0` (no DEV chip until Ctrl+Shift+D; the switch survives a restart; `FantasyCompanion.exe --dev-mode` turns it on for that launch).

---

### Task 9: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 1085 passed | 5 skipped (1088 in this working tree); the build succeeds.

- [ ] **Step 2: The Windows suite and self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/dev-notes:check/dev-notes
gh run watch "$(gh run list --branch check/dev-notes --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/dev-notes
```

Expected: green. Windows matters here: the notes file is written with `\n` and read back with `\r\n` tolerated, and paths in the copy for Claude are Windows paths.

- [ ] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/dev-notes` against the spec, its §11 amendments and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first. Re-run Step 1 after them, and Task 8 after a panel change.

- [ ] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/dev-notes -m "merge: feat/dev-notes (dev-notes plan)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.31.0" && git tag v0.31.0
git branch -d feat/dev-notes
```

- [ ] **Step 5: Status block**

Replace this plan's Status line with the outcome: the merge commit and the tag, the walk-through, the review fixes and anything deferred. Then commit, staging this file only: `git commit -m "docs(plan): mark dev-notes plan complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.31.0
```

Watch the Release workflow (`gh run watch … --exit-status`). When it is green, ask the user whether to publish the draft (`gh release edit v0.31.0 --draft=false`). The release notes should say:

- Dev mode: Ctrl+Shift+D turns it on or off (off by default). It shows a DEV chip and the developer tools; nothing else changes.
- Dev notes: ✎ Note or Ctrl+Shift+N writes a note about the app from any screen, with optional screenshots or a snipped region (the note panel never appears in them), where you were, and recent errors. Notes go to `dev-notes/notes.md` in the app's data folder (changeable), ready for a developer or Claude Code.

---

## Self-review against the spec

- **§1 Dev mode** (Tasks 2, 3, 5, 6): stored as `dev_mode`, default by packaging, Ctrl+Shift+D with a toast, the DEV chip in both navs with its three items, `--dev-mode` for one launch, `dev:get`/`set`/`changed` (as `dev:mode`, `dev:setMode`, `dev:changed`, amendment E).
- **§2 The panel** (Task 5): ✎ Note, Ctrl+Shift+N and the chip open it; docked, draggable, collapsible, non-modal; Esc collapses (amendment G); the draft kept (amendment C); text with first-line title, tag, up to six attachments with ✕, the context line with ↻ and ▸, the errors checkbox with its count; Screenshot, Snip, Save (Ctrl+Enter), Discard, All notes.
  - **§2.1** the attribute, two frames, `capturePage`, removed after (also on failure) — Task 4, checked in the app in Task 8.
  - **§2.2** Screenshot. **§2.3** Snip on the frozen capture, drag / redo / Enter / Use / Esc, device-pixel crop, under 8 × 8 ignored, itself a dev overlay.
- **§3 Context** (Tasks 4–6): product and screen (Stats' own screen), the parts of the first adopters (§3's list plus amendment F), the league, the environment (amendment A).
- **§4 Recent errors** (Task 2): 30-entry buffer from launch, `console.error`, uncaught exceptions, renderer events, sync failures of the last hour; 15 minutes, 10 newest; memory only (amendment B).
- **§5 Storage** (Tasks 1, 2): the folder and `img/`, _Change folder…_, the header, the section's shape, `<details>` blocks, relative image links, atomic writes, images before the section, ids, hand edits kept.
- **§6 All notes** (Task 5): newest first, Open / Done / All and tag; Mark done / Reopen, Delete with confirmation and its images, Copy for Claude, Go there (amendment H); Open folder, Change folder…, Copy all open.
- **§7 Working with Claude** (Task 7): documented in the reference; the memory entry for the chosen folder is written when the user picks one.
- **§8 Code layout:** as the spec, plus `src/renderer/src/lib/dev/devState.ts` (the DEV chip's context, kept out of a component file for Fast Refresh).
- **§9 Tests:** every item, plus the registry, the App's "Go there" and the walk-through.
- **§10 Out of scope:** no separate build, no syncing, no annotation, no other dev tool.
