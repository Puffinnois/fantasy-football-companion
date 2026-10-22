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
