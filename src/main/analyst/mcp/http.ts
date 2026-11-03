import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler
} from '@modelcontextprotocol/node'
import { createMcpHandler, type McpServerFactory } from '@modelcontextprotocol/server'

/**
 * The MCP server over Streamable HTTP (Ask spec §6.1): on 127.0.0.1 only, at `/mcp`, behind a bearer
 * token, with the Host and Origin headers checked so a web page cannot reach it (DNS rebinding,
 * cross-site requests). Both protocol eras are served: 2026-07-28 requests and the stateless
 * fallback for 2025 clients.
 */
export const MCP_PATH = '/mcp'

export interface McpHttp {
  port: number
  url: string
  close(): Promise<void>
}

export interface McpHttpOptions {
  factory: McpServerFactory
  token: string
  /** 0 picks a free port. */
  port: number
  onError?: (err: Error) => void
}

function json(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** Constant-time comparison of the `Authorization` header with the token. */
function authorized(req: IncomingMessage, token: string): boolean {
  const given = Buffer.from(req.headers.authorization ?? '')
  const wanted = Buffer.from(`Bearer ${token}`)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

/** Listens on `127.0.0.1:port`; rejects with the socket error (EADDRINUSE, EACCES) when it cannot. */
export async function startMcpHttp(options: McpHttpOptions): Promise<McpHttp> {
  const handler = createMcpHandler(options.factory, { onerror: options.onError })
  const serve = toNodeHandler(handler, { onerror: options.onError })
  const checkHost = localhostHostValidation()
  const checkOrigin = localhostOriginValidation()

  const server = createServer((req, res) => {
    // The guards answer 403 themselves.
    if (!checkHost(req, res) || !checkOrigin(req, res)) return
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (path !== MCP_PATH) return json(res, 404, { error: 'not found' })
    if (!authorized(req, options.token)) return json(res, 401, { error: 'unauthorized' })
    serve(req, res).catch((err: unknown) => {
      options.onError?.(err instanceof Error ? err : new Error(String(err)))
      if (!res.headersSent) json(res, 500, { error: 'internal error' })
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const port = (server.address() as AddressInfo).port
  return {
    port,
    url: `http://127.0.0.1:${port}${MCP_PATH}`,
    async close() {
      await handler.close()
      // `subscriptions/listen` streams stay open until the client leaves: end them.
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}
