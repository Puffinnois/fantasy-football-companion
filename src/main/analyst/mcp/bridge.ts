import { connect } from 'node:net'
import type { Readable, Writable } from 'node:stream'
import { type JSONRPCMessage, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { type McpEndpoint, readEndpoint } from './endpoint'

/**
 * The stdio bridge (Ask spec §6.1): Claude desktop speaks MCP over stdio, the app's server over
 * HTTP, so this forwards each message as it is, both ways. It runs as the app's own exe in Node mode
 * (`ELECTRON_RUN_AS_NODE`), reads the endpoint from `mcp.json`, and when the app is not running,
 * starts it through its shortcut (one start at a time) and waits for the server.
 */
export const NOT_RUNNING =
  'FantasyCompanion is not running, or Claude is turned off in Stats › Ask. Open the app, turn it on, and try again.'

export interface BridgeOptions {
  /** The app's `userData` folder, where `mcp.json` is. */
  userData: string
  /** A shortcut that starts the app minimised, or null when the bridge must not start it. */
  start: string | null
  input: Readable
  output: Writable
  log: (line: string) => void
  /** Opens the shortcut (Windows: `explorer.exe`, so the app starts outside the caller's package). */
  launch: (shortcut: string) => void
  /** How long to wait for the app's server after starting it. */
  waitMs?: number
  pollMs?: number
}

const isRequest = (
  m: JSONRPCMessage
): m is JSONRPCMessage & { id: string | number; method: string } =>
  'method' in m && 'id' in m && m.id !== undefined

/** The server answers on its port. */
function listening(url: string): Promise<boolean> {
  const { hostname, port } = new URL(url)
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: Number(port) })
    socket.setTimeout(1_000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Where the app stands after a failed send. */
type Revival = 'retry' | 'up' | 'down'

export async function runBridge(options: BridgeOptions): Promise<void> {
  const waitMs = options.waitMs ?? 30_000
  const pollMs = options.pollMs ?? 500
  const stdio = new StdioServerTransport(options.input, options.output)
  type Http = { transport: StreamableHTTPClientTransport; endpoint: McpEndpoint }
  let http: Promise<Http> | null = null
  let starting: Promise<boolean> | null = null

  /** The HTTP side, opened on the first message and kept until the app moves or goes. */
  function open(): Promise<Http> {
    if (http) return http
    const opening = (async () => {
      const endpoint = readEndpoint(options.userData)
      if (!endpoint) throw new Error(NOT_RUNNING)
      const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
        requestInit: { headers: { Authorization: `Bearer ${endpoint.token}` } }
      })
      transport.onmessage = (m) => void reply(m)
      transport.onerror = (err) => options.log(`http: ${err.message}`)
      await transport.start()
      return { transport, endpoint }
    })()
    http = opening
    opening.catch(() => {
      if (http === opening) http = null
    })
    return opening
  }

  /** Forgets the HTTP side a failed send used (not a newer one another send opened since). */
  function drop(used: Promise<Http> | null): void {
    if (!used || http !== used) return
    http = null
    void used.then(({ transport }) => transport.close()).catch(() => {})
  }

  /** To Claude; after it has gone (stdin closed), there is no one to tell. */
  const reply = (m: JSONRPCMessage): Promise<void> => stdio.send(m).catch(() => {})

  /** Opens the shortcut and waits for the server; concurrent failures share one start. */
  function startApp(shortcut: string): Promise<boolean> {
    starting ??= (async () => {
      options.log('starting FantasyCompanion')
      options.launch(shortcut)
      for (let waited = 0; waited < waitMs; waited += pollMs) {
        await sleep(pollMs)
        const e = readEndpoint(options.userData)
        if (e && (await listening(e.url))) return true
      }
      return false
    })().finally(() => (starting = null))
    return starting
  }

  /**
   * After a failed send. The app runs: a retry helps only if it moved since (a restart on another
   * port, a new key). The app is gone: start it, then retry.
   */
  async function revive(used: McpEndpoint | null, mayStart: boolean): Promise<Revival> {
    const now = readEndpoint(options.userData)
    if (now && (await listening(now.url)))
      return now.url !== used?.url || now.token !== used.token ? 'retry' : 'up'
    if (mayStart && options.start && (await startApp(options.start))) return 'retry'
    return 'down'
  }

  async function deliver(message: JSONRPCMessage): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      let side: Promise<Http> | null = null
      let used: McpEndpoint | null = null
      try {
        side = open()
        const { transport, endpoint } = await side
        used = endpoint
        await transport.send(message)
        return
      } catch (err) {
        const state = await revive(used, attempt === 0)
        if (state === 'retry' && attempt === 0) {
          drop(side)
          continue
        }
        const text = err instanceof Error ? err.message : String(err)
        options.log(
          `could not forward ${'method' in message ? message.method : 'a reply'}: ${text}`
        )
        if (isRequest(message))
          await reply({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: state === 'up' ? `FantasyCompanion could not answer: ${text}` : NOT_RUNNING
            }
          })
        return
      }
    }
  }

  await new Promise<void>((resolve) => {
    stdio.onmessage = (m) => void deliver(m)
    stdio.onerror = (err) => options.log(`stdio: ${err.message}`)
    stdio.onclose = () => {
      drop(http)
      resolve()
    }
    void stdio.start()
  })
}
