import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where the running app's MCP server is (Ask spec §6.1): `mcp.json` in `userData`, written when the
 * server listens and removed when it stops. The stdio bridge reads it, so Claude desktop's config
 * holds no port or token.
 */
export const ENDPOINT_FILE = 'mcp.json'

export interface McpEndpoint {
  url: string
  token: string
  pid: number
  version: string
}

export function writeEndpoint(dir: string, endpoint: McpEndpoint): void {
  const path = join(dir, ENDPOINT_FILE)
  // Written whole, then renamed: the bridge never reads half a file.
  writeFileSync(`${path}.tmp`, JSON.stringify(endpoint), { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
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
