import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where the running app's MCP server is (Ask spec §6.1): `mcp.json` in `userData`, written when the
 * server listens and removed when it stops. The stdio bridge reads it, so Claude desktop's config
 * holds no port or token. With Claude turned off it holds `{"off":true}` instead, so the bridge says
 * so rather than starting the app (amendment K).
 */
export const ENDPOINT_FILE = 'mcp.json'

export interface McpEndpoint {
  url: string
  token: string
  pid: number
  version: string
}

function write(dir: string, content: object): void {
  const path = join(dir, ENDPOINT_FILE)
  // Written whole, then renamed: the bridge never reads half a file.
  writeFileSync(`${path}.tmp`, JSON.stringify(content), { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}

export function writeEndpoint(dir: string, endpoint: McpEndpoint): void {
  write(dir, endpoint)
}

/** Claude is turned off in Stats › Ask: the bridge answers so without starting the app. */
export function markOff(dir: string): void {
  write(dir, { off: true })
}

export function isOff(dir: string): boolean {
  try {
    return (
      (JSON.parse(readFileSync(join(dir, ENDPOINT_FILE), 'utf8')) as { off?: unknown }).off === true
    )
  } catch {
    return false
  }
}

/** The endpoint, or null when there is none (the app is not running, or Ask › Claude is off). */
export function readEndpoint(dir: string): McpEndpoint | null {
  try {
    const e = JSON.parse(readFileSync(join(dir, ENDPOINT_FILE), 'utf8')) as Partial<McpEndpoint>
    if (typeof e.url !== 'string' || typeof e.token !== 'string') return null
    return {
      url: e.url,
      token: e.token,
      pid: typeof e.pid === 'number' ? e.pid : 0,
      version: typeof e.version === 'string' ? e.version : ''
    }
  } catch {
    return null
  }
}

export function removeEndpoint(dir: string): void {
  rmSync(join(dir, ENDPOINT_FILE), { force: true })
}
