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
 * GETs `url` as text: follows redirects (fetch default), gunzips gzip bodies (detected by magic bytes)
 * and retries once on 429 / 5xx. Returns null on 404; any other failure status throws `httpError`.
 */
export async function fetchText(
  url: string,
  options: FetchTextOptions,
  httpError: (status: number, url: string) => Error
): Promise<string | null> {
  const { fetchImpl, timeoutMs, retryDelayMs } = options
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.status === 404) return null
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer())
      const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
      return new TextDecoder().decode(gzipped ? gunzipSync(bytes) : bytes)
    }
    if (attempt === 0 && isRetryable(res.status)) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      continue
    }
    throw httpError(res.status, url)
  }
}
