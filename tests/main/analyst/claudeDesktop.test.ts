import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addToDesktop,
  CONFIG_FILE,
  desktopConfigPath,
  desktopState,
  type DesktopEntry
} from '@main/analyst/mcp/claudeDesktop'

const ENTRY: DesktopEntry = {
  command: 'C:\\Programs\\FantasyCompanion\\FantasyCompanion.exe',
  args: ['C:\\Programs\\FantasyCompanion\\resources\\app.asar\\out\\main\\mcpBridge.js'],
  env: { ELECTRON_RUN_AS_NODE: '1' }
}

function profile(): { local: string; roaming: string } {
  const root = mkdtempSync(join(tmpdir(), 'ffc-claude-'))
  const local = join(root, 'Local')
  const roaming = join(root, 'Roaming')
  mkdirSync(local)
  mkdirSync(roaming)
  return { local, roaming }
}

describe('finding Claude desktop’s config', () => {
  it('prefers the Store app’s data folder, then the classic install', () => {
    const p = profile()
    const env = { LOCALAPPDATA: p.local, APPDATA: p.roaming }
    expect(desktopConfigPath('win32', env)).toBeNull()
    mkdirSync(join(p.roaming, 'Claude'))
    expect(desktopConfigPath('win32', env)).toBe(join(p.roaming, 'Claude', CONFIG_FILE))
    mkdirSync(join(p.local, 'Claude-Data', 'claude_pzs8sxrjxfjjc'), { recursive: true })
    expect(desktopConfigPath('win32', env)).toBe(
      join(p.local, 'Claude-Data', 'claude_pzs8sxrjxfjjc', CONFIG_FILE)
    )
  })

  it('reads an older Store app inside its package, unless its data has moved out', () => {
    const p = profile()
    const env = { LOCALAPPDATA: p.local, APPDATA: p.roaming }
    const inside = join(
      p.local,
      'Packages',
      'Claude_pzs8sxrjxfjjc',
      'LocalCache',
      'Roaming',
      'Claude'
    )
    mkdirSync(inside, { recursive: true })
    expect(desktopConfigPath('win32', env)).toBe(join(inside, CONFIG_FILE))
    writeFileSync(join(inside, '.user-data-left.claude_pzs8sxrjxfjjc'), '')
    expect(desktopConfigPath('win32', env)).toBeNull()
  })
})

describe('adding the server to Claude desktop', () => {
  it('keeps Claude’s own settings and servers, and backs the file up first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-claude-'))
    const path = join(dir, CONFIG_FILE)
    const before = {
      preferences: { sidebarMode: 'epitaxy' },
      mcpServers: { other: { command: 'npx', args: ['x'] } }
    }
    writeFileSync(path, JSON.stringify(before))
    expect(desktopState(path, ENTRY)).toBe('absent')
    const backup = addToDesktop(path, ENTRY, new Date('2026-11-02T14:05:09Z'))
    expect(backup).toBe(`${path}.20261102-140509.bak`)
    expect(JSON.parse(readFileSync(backup!, 'utf8'))).toEqual(before)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      preferences: { sidebarMode: 'epitaxy' },
      mcpServers: { other: { command: 'npx', args: ['x'] }, 'fantasy-companion': ENTRY }
    })
    expect(desktopState(path, ENTRY)).toBe('added')
    expect(desktopState(path, { ...ENTRY, args: ['elsewhere.js'] })).toBe('outdated')
    expect(readdirSync(dir).sort()).toEqual([CONFIG_FILE, `${CONFIG_FILE}.20261102-140509.bak`])
  })

  it('creates the file when Claude has none, and never overwrites one it cannot read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-claude-'))
    const path = join(dir, CONFIG_FILE)
    expect(addToDesktop(path, ENTRY, new Date())).toBeNull()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      mcpServers: { 'fantasy-companion': ENTRY }
    })
    writeFileSync(path, '{ "preferences": ')
    expect(desktopState(path, ENTRY)).toBe('unreadable')
    expect(() => addToDesktop(path, ENTRY, new Date())).toThrow(/not valid JSON/)
    expect(readFileSync(path, 'utf8')).toBe('{ "preferences": ')
    expect(existsSync(join(dir, `.${CONFIG_FILE}.tmp`))).toBe(false)
  })
  it('refuses a config whose mcpServers is not an object', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-claude-'))
    const path = join(dir, CONFIG_FILE)
    for (const servers of ['"x"', '[1]', 'null']) {
      const text = `{ "preferences": {}, "mcpServers": ${servers} }`
      writeFileSync(path, text)
      expect(desktopState(path, ENTRY)).toBe('unreadable')
      expect(() => addToDesktop(path, ENTRY, new Date())).toThrow(/not valid/)
      expect(readFileSync(path, 'utf8')).toBe(text)
    }
    expect(readdirSync(dir)).toEqual([CONFIG_FILE])
  })
})
