# Dev mode and dev notes — design

**Date:** 2026-10-22 · **Status:** approved 2026-10-22 · **Release:** minor `v0.31.0`

**Goal.** While using the app, a developer can jot down a change they want — with a screenshot or a snipped region — without leaving the screen. Each note records where it was written and what the app looked like, and lands in a Markdown file that a human developer and Claude Code can both work from. The notes tool is for developers only, so the app gains an official **Dev mode**.

**Decisions taken with the user (2026-10-22).** Dev mode is a switch inside the one installed app, not a second build. Notes are a Markdown file, not a database table. A note carries: optional screenshot(s), optional snipped region(s), detailed context, a tag and a status, and recent errors.

## 1. Dev mode

- **One app, two modes.** "Public" is the app as today. "Dev" adds the developer tools (today: notes, §2). Same data, same league, same auto-updates.
- **Stored** as `dev_mode` (`'1'` / `'0'`) in `app_settings`. Absent → off in the packaged app, **on** when unpackaged (`npm run dev`).
- **Switch:**
  - `Ctrl+Shift+D` anywhere in the app toggles it. A toast confirms: `Dev mode on` / `Dev mode off`.
  - While on, both navs (Fantasy `TopNav` and the Stats nav) show a small **DEV** chip next to the version. Clicking it opens a menu: *Notes (Ctrl+Shift+N)*, *Open notes folder*, *Turn off Dev mode*.
  - `--dev-mode` on the command line turns it on for that launch only (handy for a shortcut on the Windows desktop).
- **Not a lock.** Anyone who knows the shortcut can turn it on; it only shows tools, it never changes data or results.
- **IPC:** `dev:get` → `boolean`, `dev:set(on)`, and a `dev:changed` event so both products update at once.

## 2. The notes panel

**Opening.** The floating **✎ Note** button (bottom-right, Dev mode only), `Ctrl+Shift+N`, or the DEV chip menu.

**A panel, not a modal.** It docks bottom-right (≈ 380 × 460 px), can be dragged by its header and collapsed to its title bar. The rest of the app stays usable while it is open: you can navigate, open a player, scroll to the thing you mean, then come back and keep typing. `Esc` collapses it; the draft is kept until saved or discarded (in memory, plus `localStorage` so a reload keeps it).

**Fields.**

| Field | Notes |
| --- | --- |
| Text | Required. Multi-line. The first line becomes the note's title (trimmed to 80 chars). |
| Tag | `Bug` · `Idea` · `Polish` — one, default `Idea`. |
| Attachments | 0–6 images, shown as thumbnails with ✕ to remove. |
| Context | A one-line summary (`Fantasy › Players · Josh Allen · wk 8`) with ↻ to re-capture from where you are now and ▸ to see the full JSON. |
| Include recent errors | Checkbox, on by default when there are any (§4), with the count. |

**Buttons:** *Screenshot*, *Snip*, *Save* (`Ctrl+Enter`), *Discard*, and *All notes* (§6).

### 2.1 The panel never appears in a capture

Both capture paths hide the panel, and every other dev overlay (the ✎ button, toasts), before taking the picture:

1. Set `data-dev-capture="1"` on `<html>`; CSS gives every dev overlay `visibility: hidden` under it (it keeps its layout, so nothing in the page moves).
2. Wait two animation frames so the hidden state is painted.
3. Main captures the window: `webContents.capturePage()` → PNG.
4. Remove the attribute. The panel is back where it was, with its draft.

### 2.2 Screenshot

The whole window as it looks right now, without the panel (§2.1). Added as an attachment.

### 2.3 Snip

1. Capture the whole window as in §2.1 (so the region you pick is exactly what was on screen, frozen — menus and hovers stay as they were).
2. Show that capture full-window in a snip overlay, dimmed, cursor a crosshair. Drag a rectangle; the selection shows undimmed with its size in px. Release to keep, drag again to redo, `Enter` / *Use* to confirm, `Esc` to cancel.
3. The crop is made at device-pixel resolution (selection × `devicePixelRatio`), so it stays sharp on a scaled display. Selections smaller than 8 × 8 px are ignored.
4. The overlay closes and the panel returns with the crop as an attachment.

The snip overlay is itself a dev overlay, so it can never appear in a later capture.

## 3. Context

Captured when the panel opens, and again with ↻. Two parts:

**Where (summary line and first fields).**

- `product` (`fantasy` / `stats`) and `screen`.
- What is open on that screen, contributed by the screen through a `useNoteContext(part)` hook (a React context the panel reads; screens that don't call it contribute nothing). First adopters:
  - Players: the open player file (Sleeper id, name, position, team).
  - Lineup / Waivers: the week shown.
  - Trade: the deal on the builder (players and teams), the suggestion stance if a search is shown.
  - Stats: the scope, and the open player or team dashboard (gsis id / team, name).
- League: name, id, season, current week; none when no league is imported.

**Environment.** App version, `dev`/`packaged`, platform, window size, zoom, `devicePixelRatio`, theme, time (local ISO with offset).

The context is plain JSON in the note (§5) so it can grow without a format change.

## 4. Recent errors

- Main keeps a ring buffer of the last **30** errors: everything passed to `console.error` in main and in the stats/engine workers (already routed through main), uncaught exceptions, and renderer `error` / `unhandledrejection` events forwarded over IPC (`dev:reportError`). Each entry: time, origin (`main` / `renderer` / `worker`), message, first 8 stack lines.
- Sync failures already live in `sync_log`; the latest failed rows from the last hour are added too.
- A note attaches the errors from the **last 15 minutes**, at most **10**, newest first. The panel's checkbox shows the count and can turn them off.
- The buffer starts at launch whatever the mode, so turning Dev mode on after a problem still catches it. Memory only — nothing is written until a note is saved.

## 5. Storage — the notes file

**Folder.** `<userData>/dev-notes/` by default:

```
dev-notes/
  notes.md
  img/
    N-014-1.png
    N-014-2.png
```

*All notes* → *Change folder…* can point it elsewhere (stored as `dev_notes_dir`). Useful choice: the repo's `docs/dev-notes/` through `\\wsl.localhost\…`, so the packaged Windows app writes notes straight into the project. Default paths, for reference:

- Packaged on Windows: `%APPDATA%\FantasyCompanion\dev-notes\` — from WSL: `/mnt/c/Users/<you>/AppData/Roaming/FantasyCompanion/dev-notes/`.
- `npm run dev` in WSL: `~/.config/FantasyCompanion/dev-notes/` (a different store unless the folder is changed).

**One file, one section per note, oldest first** (new notes append, so diffs stay small). The file starts with a short header that tells a reader — human or Claude — how to use it:

```markdown
# FantasyCompanion — dev notes

Notes written in the app's Dev mode. One `##` section per note, oldest first.
Each section has a machine-readable `<!-- note {...} -->` line; keep it when editing by hand.
To close a note, set `"status":"done"` in that line (or use the app). Images are in `img/`.
```

**A note:**

````markdown
## N-014 · Bug · open — Trade card cuts off long player names

<!-- note {"id":"N-014","tag":"bug","status":"open","created":"2026-10-22T14:03:11+02:00","images":["img/N-014-1.png"]} -->

**Where:** Fantasy › Trade · deal: J. Allen → Team 4, J. Chase → me
**When:** 2026-10-22 14:03 · v0.30.0 · packaged · Windows

Trade card cuts off long player names
"Amon-Ra St. Brown" is cut at "Amon-Ra St." on the alternatives list.
Maybe wrap to two lines or shrink the font.

![Snip 1](img/N-014-1.png)

<details><summary>Context</summary>

```json
{ "product": "fantasy", "screen": "trade", "parts": { … }, "league": { … }, "env": { … } }
```

</details>

<details><summary>Recent errors (1)</summary>

```text
14:02:58 renderer  TypeError: Cannot read properties of undefined (reading 'name')
    at TradeCard (TradeSuggestions.tsx:212:31)
    …
```

</details>
````

**Why this shape.** The heading line carries id, tag, status and title, so `grep "· open —" notes.md` lists open work and a human can skim it. The text is the developer's own words, untouched. Context and errors are folded (`<details>`) so they don't crowd a rendered view, but are there in full for Claude. Image links are relative, so the folder can move.

**Writing.** Main owns the file. Every change reads it, applies the change, and writes atomically (temp file + rename). Images are written before the section that links them. Ids are `N-` + 3 digits, one more than the highest id in the file.

**Hand edits are expected.** The parser splits the file on lines starting with `## `; a section is a note when its `<!-- note {...} -->` line parses as JSON. The comment's `status` and `tag` win over the heading. Anything the app does not recognise — a section without the comment line, extra text, the header — is kept byte-for-byte on rewrite. A section the app changes (status, delete) gets its heading and comment line regenerated; its body is left as it is.

## 6. All notes

A second view of the panel lists notes newest first: id, tag, title, age, status, thumbnail. Filter: *Open* (default) / *Done* / *All*, and by tag.

Per note: *Mark done* / *Reopen*, *Delete* (confirms; removes its images), *Copy for Claude* (the note's section as Markdown with image paths made absolute, ready to paste in a session), *Go there* (switches to the note's product and screen; opens the player/team when the context has one).

Footer: *Open folder*, *Change folder…*, *Copy all open for Claude*.

## 7. Working the notes with Claude Code

No app change — this is how the format is meant to be used, recorded so the convention sticks:

- "Go through my open dev notes" → Claude reads `notes.md` (and the images it links), proposes what to do per note, and after implementing one sets its comment line to `"status":"done"` and adds a line `Done in vX.Y.Z (<commit>)` under the body.
- A memory entry records the notes path once the user has picked the folder.

## 8. Code layout

- `src/shared/devNotes.ts` — note types, Markdown serialize/parse (pure, the heart of the tests).
- `src/main/dev/` — `mode.ts` (setting + flag), `notesStore.ts` (folder, atomic writes, images), `errorLog.ts` (ring buffer, `console.error` hook), `capture.ts` (`capturePage`).
- `src/renderer/src/components/dev/` — `DevChip`, `NoteButton`, `NotesPanel`, `NotesList`, `SnipOverlay`; `lib/dev/noteContext.tsx` (the `useNoteContext` hook and provider).
- IPC: `dev:get`, `dev:set`, `dev:changed`, `dev:capture`, `dev:reportError`, `dev:recentErrors`, `dev:notesList`, `dev:notesSave`, `dev:notesSetStatus`, `dev:notesDelete`, `dev:notesOpenFolder`, `dev:notesChooseFolder`.
- Dev mode off: none of the renderer components mount and the shortcuts other than `Ctrl+Shift+D` do nothing. The error buffer still runs (§4).

## 9. Tests

- `devNotes`: serialize → parse round-trip; parse a file with hand edits (changed text, removed `<details>`, a foreign section, status edited in the comment only) and rewrite it unchanged except for the targeted note; id allocation; heading regeneration.
- `notesStore`: atomic write, image files named and removed with their note, folder change.
- `errorLog`: ring size, 15-minute / 10-entry window, stack trimming.
- Snip: rectangle → crop rect at a `devicePixelRatio` of 1, 1.25 and 2; tiny selections ignored.
- Panel: capture sets `data-dev-capture` before calling `dev:capture` and clears it after, including when the capture fails.
- Dev mode: default off when packaged / on when unpackaged, the flag, the toggle.

## 10. Out of scope

- A separate dev build, install or update channel.
- Syncing notes between machines (the folder choice covers sharing with the repo).
- Annotating screenshots (arrows, text). Snip covers "show exactly this part"; drawing can come later.
- Any other dev tool. Dev mode is built so more can be added behind it.
