import { DuckDBInstance } from '@duckdb/node-api'
const [, , dbPath, sql] = process.argv
const inst = await DuckDBInstance.create(dbPath, { access_mode: 'READ_ONLY' })
const conn = await inst.connect()
const r = await conn.runAndReadAll(sql)
for (const row of r.getRowObjectsJS())
  console.log(JSON.stringify(row, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))
