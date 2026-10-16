import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createDownloads } from '@main/stats/download'
import { tempDir } from '../../fixtures/stats'

const respond =
  (status: number, body = ''): typeof fetch =>
  async () =>
    new Response(status === 404 ? null : body, { status })

describe('createDownloads', () => {
  it('hands the file to the reader and deletes it afterwards', async () => {
    const dir = tempDir()
    const downloads = createDownloads({ dir, fetchImpl: respond(200, 'abc') })
    let seen = ''
    const out = await downloads.withFile('https://x/f.parquet', async (path) => {
      expect(path.endsWith('.parquet')).toBe(true)
      seen = readFileSync(path, 'utf8')
      return 7
    })
    expect(out).toBe(7)
    expect(seen).toBe('abc')
    expect(readdirSync(dir)).toEqual([])
  })

  it('deletes the file when the reader throws', async () => {
    const dir = tempDir()
    const downloads = createDownloads({ dir, fetchImpl: respond(200, 'abc') })
    await expect(
      downloads.withFile('https://x/f.csv', async () => {
        throw new Error('bad file')
      })
    ).rejects.toThrow('bad file')
    expect(readdirSync(dir)).toEqual([])
  })

  it('returns null on 404 without calling the reader, and throws on other failures', async () => {
    const dir = `${tempDir()}/never-made`
    const missing = createDownloads({ dir, fetchImpl: respond(404) })
    expect(await missing.withFile('https://x/f.parquet', async () => 1)).toBeNull()
    expect(existsSync(dir)).toBe(false)
    const broken = createDownloads({ dir, fetchImpl: respond(403), retryDelayMs: 0 })
    await expect(broken.withFile('https://x/f.parquet', async () => 1)).rejects.toThrow(
      'HTTP 403 for https://x/f.parquet'
    )
  })

  it('stops a download when its signal aborts', async () => {
    const abort = new AbortController()
    const hanging: typeof fetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      )
    const downloads = createDownloads({ dir: tempDir(), fetchImpl: hanging, signal: abort.signal })
    const pending = downloads.withFile('https://x/f.parquet', async () => 1)
    abort.abort()
    await expect(pending).rejects.toThrow('aborted')
  })

  it('parses JSON and rejects an unreadable body', async () => {
    const ok = createDownloads({ dir: tempDir(), fetchImpl: respond(200, '[1,2]') })
    expect(await ok.json('https://x/s')).toEqual([1, 2])
    const bad = createDownloads({ dir: tempDir(), fetchImpl: respond(200, '<html>') })
    await expect(bad.json('https://x/s')).rejects.toThrow('unreadable JSON from https://x/s')
  })
})
