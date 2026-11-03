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
