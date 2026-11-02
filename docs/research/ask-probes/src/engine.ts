// Runs StatsQuery JSONs through the app's real engine (compile + runQuery) on a copy of stats.duckdb.
import { readFileSync, writeFileSync } from 'node:fs'
import { StatsDb } from '@main/stats/db'
import { runQuery } from '@main/stats/engine/run'
const [, , dbPath, inFile, outFile] = process.argv
const queries = JSON.parse(readFileSync(inFile, 'utf8')) as unknown[]
const db = await StatsDb.open(dbPath)
const out = []
for (const q of queries) {
  try {
    const r = await runQuery(db, q as never, { currentSeason: 2026, hasLeague: false })
    out.push({
      ok: true,
      rows: r.rows.slice(0, 10).map((row) => ({
        id: row.id,
        name: row.name,
        team: row.team,
        values: Object.fromEntries(Object.entries(row.values).map(([k, v]) => [k, v.value]))
      }))
    })
  } catch (e) {
    out.push({ ok: false, error: String((e as Error).message ?? e).slice(0, 300) })
  }
}
writeFileSync(outFile, JSON.stringify(out, null, 1))
