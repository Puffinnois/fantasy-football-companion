import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { MCP_NAME } from './server'

/**
 * Claude desktop's MCP config (Ask spec §6.1, "Add to Claude desktop"). The file also holds Claude's
 * own preferences, so only `mcpServers["fantasy-companion"]` is written, after a backup.
 */
export const CONFIG_FILE = 'claude_desktop_config.json'

export interface DesktopEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

export type DesktopState = 'added' | 'outdated' | 'absent' | 'unreadable' | 'not-found'

/**
 * Where Claude desktop keeps its config, most likely first (Windows):
 * - the Store (MSIX) app keeps its data outside its package, in `%LOCALAPPDATA%\Claude-Data\claude_<id>\`
 *   (measured on this PC, 2026-11-02);
 * - the classic installer, `%APPDATA%\Claude\`;
 * - an older Store app, inside its package (`LocalCache\Roaming\Claude`), unless it has moved out
 *   (a `.user-data-left.*` marker stays behind).
 * The first folder that exists wins; the file itself may not exist yet.
 */
export function desktopConfigPath(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string = homedir()
): string | null {
  const dirs = (parent: string, prefix: string): string[] => {
    try {
      return readdirSync(parent)
        .filter((d) => d.toLowerCase().startsWith(prefix))
        .map((d) => join(parent, d))
    } catch {
      return []
    }
  }
  const candidates: string[] = []
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA
    const roaming = env.APPDATA
    if (local) candidates.push(...dirs(join(local, 'Claude-Data'), 'claude_'))
    if (roaming) candidates.push(join(roaming, 'Claude'))
    if (local)
      for (const pkg of dirs(join(local, 'Packages'), 'claude_')) {
        const dir = join(pkg, 'LocalCache', 'Roaming', 'Claude')
        const moved = dirs(dir, '.user-data-left').length > 0
        if (!moved) candidates.push(dir)
      }
  } else if (platform === 'darwin') {
    candidates.push(join(home, 'Library', 'Application Support', 'Claude'))
  }
  const found = candidates.find((d) => existsSync(d))
  return found ? join(found, CONFIG_FILE) : null
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function readConfig(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function desktopState(path: string | null, entry: DesktopEntry): DesktopState {
  if (!path) return 'not-found'
  const config = readConfig(path)
  if (!config) return 'unreadable'
  const servers = config.mcpServers as Record<string, unknown> | undefined
  const ours = servers?.[MCP_NAME]
  if (!ours) return 'absent'
  return same(ours, entry) ? 'added' : 'outdated'
}

/** Adds (or updates) the entry; the file as it was is kept beside it. Returns the backup's path. */
export function addToDesktop(path: string, entry: DesktopEntry, now: Date): string | null {
  const config = readConfig(path)
  if (!config)
    throw new Error(
      `Claude desktop's config is not valid JSON (${path}); fix it or add the server by hand`
    )
  let backup: string | null = null
  if (existsSync(path)) {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
    backup = `${path}.${stamp}.bak`
    copyFileSync(path, backup)
  }
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>
  const next = { ...config, mcpServers: { ...servers, [MCP_NAME]: entry } }
  const tmp = join(dirname(path), `.${CONFIG_FILE}.tmp`)
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`)
  renameSync(tmp, path)
  return backup
}
