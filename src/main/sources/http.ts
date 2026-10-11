import { gunzipSync } from 'node:zlib'

export interface FetchTextOptions {
  fetchImpl: typeof fetch
  timeoutMs: number
  retryDelayMs: number
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * GETs `url` as raw bytes: follows redirects (fetch default) and retries once on 429 / 5xx.
 * Returns null on 404; any other failure status throws `httpError`.
 */
export async function fetchBytes(
  url: string,
  options: FetchTextOptions,
  httpError: (status: number, url: string) => Error
): Promise<Uint8Array | null> {
  const { fetchImpl, timeoutMs, retryDelayMs } = options
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.status === 404) return null
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    if (attempt === 0 && isRetryable(res.status)) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      continue
    }
    throw httpError(res.status, url)
  }
}

/** UTF-8 text of `bytes`, gunzipped first when they are gzip (detected by magic bytes). */
export function decodeText(bytes: Uint8Array): string {
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
  return new TextDecoder().decode(gzipped ? gunzipSync(bytes) : bytes)
}

/** `fetchBytes` as text: gzip bodies are gunzipped (see `decodeText`). */
export async function fetchText(
  url: string,
  options: FetchTextOptions,
  httpError: (status: number, url: string) => Error
): Promise<string | null> {
  const bytes = await fetchBytes(url, options, httpError)
  return bytes === null ? null : decodeText(bytes)
}
