import type { Migration } from '../migrations'
import warehouseSql from './001_warehouse.sql?raw'

/** `warehouse.db` (stats-warehouse spec §10), versioned apart from the app database. */
export const warehouseMigrations: Migration[] = [
  { version: 1, name: 'warehouse', sql: warehouseSql }
]
