import { openDatabase, type Db } from './connection'
import { migrate } from './migrate'
import { warehouseMigrations } from './warehouseMigrations'

/** Opens (and migrates) the stats warehouse's own database file (spec §10). */
export function openWarehouseDatabase(path: string): Db {
  const db = openDatabase(path)
  migrate(db, warehouseMigrations)
  return db
}
