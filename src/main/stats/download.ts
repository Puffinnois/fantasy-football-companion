import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchBytes, type FetchTextOptions } from '@main/sources/http'

export class StatsHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`HTTP ${status} for ${url}`)
    this.name = 'StatsHttpError'
  }
}

export interface Downloads {
  /**
   * Downloads `url` to a temp file, runs `read` on its path, and deletes the file whatever happens.
   * Returns null without calling `read` when the file is not published (404).
   */
  withFile<T>(url: string, read: (path: string) => Promise<T>): Promise<T | null>
  /** GETs JSON (Sleeper); null on 404. */
  json(url: string): Promise<unknown>
}

export interface DownloadOptions {
  /** Temp files go here; created when missing. */
  dir: string
  fetchImpl?: typeof fetch
  /** Play-by-play is ~20 MB; the default leaves room for a slow connection. */
  timeoutMs?: number
  retryDelayMs?: number
}

/** Stats-analysis spec §4.4: files are Parquet where nflverse publishes it, read from disk by DuckDB. */
export function createDownloads(options: DownloadOptions): Downloads {
  const http: FetchTextOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? 120_000,
    retryDelayMs: options.retryDelayMs ?? 2_000
  }
  const error = (status: number, url: string): Error => new StatsHttpError(status, url)
  return {
    async withFile(url, read) {
      const bytes = await fetchBytes(url, http, error)
      if (bytes === null) return null
      mkdirSync(options.dir, { recursive: true })
      const extension = /\.(parquet|csv|json)$/.exec(url)?.[0] ?? ''
      const path = join(options.dir, `${randomUUID()}${extension}`)
      writeFileSync(path, bytes)
      try {
        return await read(path)
      } finally {
        rmSync(path, { force: true })
      }
    },
    async json(url) {
      const bytes = await fetchBytes(url, http, error)
      if (bytes === null) return null
      try {
        return JSON.parse(new TextDecoder().decode(bytes))
      } catch {
        throw new Error(`unreadable JSON from ${url}`)
      }
    }
  }
}
