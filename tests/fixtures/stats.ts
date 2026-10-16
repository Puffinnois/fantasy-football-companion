import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { StatsDb, sqlString } from '@main/stats/db'
import { bootstrapStatsDb } from '@main/stats/schema'

const opened: StatsDb[] = []
const dirs: string[] = []

afterEach(() => {
  for (const db of opened.splice(0)) db.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** An in-memory stats database with the macros and bookkeeping tables; closed after the test. */
export async function openTestDb(now = new Date('2026-10-16T12:00:00Z')): Promise<StatsDb> {
  const db = await StatsDb.open(':memory:', { threads: 1, memoryLimit: '256MB' })
  opened.push(db)
  await bootstrapStatsDb(db, now)
  return db
}

/** A temp directory removed after the test. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ffc-stats-'))
  dirs.push(dir)
  return dir
}

/** Writes `select`'s rows to `<dir>/<name>` as Parquet (or CSV / JSON by extension) and returns the path. */
export async function writeFixture(
  db: StatsDb,
  dir: string,
  name: string,
  select: string
): Promise<string> {
  const path = join(dir, name)
  const format = name.endsWith('.csv')
    ? 'csv, HEADER true'
    : name.endsWith('.json')
      ? 'json, ARRAY true'
      : 'parquet'
  await db.exec(`COPY (${select}) TO ${sqlString(path)} (FORMAT ${format})`)
  return path
}
