// Runs SQL strings read-only with a 5 s timeout, like the engine's limit.
import { readFileSync, writeFileSync } from 'node:fs'
import { DuckDBInstance } from '@duckdb/node-api'
const [, , dbPath, inFile, outFile] = process.argv
const sqls = JSON.parse(readFileSync(inFile, 'utf8')) as string[]
const inst = await DuckDBInstance.create(dbPath, {
  access_mode: 'READ_ONLY',
  memory_limit: '512MB',
  threads: '2'
})
const conn = await inst.connect()
const big = (_: string, v: unknown): unknown => (typeof v === 'bigint' ? Number(v) : v)
const out = []
for (const sql of sqls) {
  const timer = setTimeout(() => conn.interrupt(), 5000)
  try {
    const r = await conn.runAndReadAll(sql)
    out.push({ ok: true, rows: JSON.parse(JSON.stringify(r.getRowObjectsJS().slice(0, 10), big)) })
  } catch (e) {
    out.push({ ok: false, error: String((e as Error).message ?? e).slice(0, 300) })
  } finally {
    clearTimeout(timer)
  }
}
writeFileSync(outFile, JSON.stringify(out, null, 1))
