import type { ProviderInput, ProviderSettings } from '@shared/ask'
import type { Db } from '../connection'

/**
 * Ask spec §6.2: the model providers (`ask_providers`). A key is stored as ciphertext from the key
 * store (Plan AG1, amendment I); `ProviderSettings` only says whether there is one.
 */
interface ProviderRow {
  id: number
  kind: ProviderSettings['kind']
  preset: ProviderSettings['preset']
  label: string
  base_url: string
  model: string
  profile: ProviderSettings['profile']
  mode: ProviderSettings['mode']
  reasoning: ProviderSettings['reasoning']
  key_cipher: Uint8Array | null
  active: number
}

const settings = (r: ProviderRow): ProviderSettings => ({
  id: r.id,
  kind: r.kind,
  preset: r.preset,
  label: r.label,
  baseUrl: r.base_url,
  model: r.model,
  profile: r.profile,
  mode: r.mode,
  reasoning: r.reasoning,
  hasKey: r.key_cipher !== null && r.key_cipher.length > 0,
  active: r.active === 1
})

export function listAskProviders(db: Db): ProviderSettings[] {
  const rows = db
    .prepare('SELECT * FROM ask_providers ORDER BY id')
    .all() as unknown as ProviderRow[]
  return rows.map(settings)
}

export function getAskProvider(db: Db, id: number): ProviderSettings | null {
  const r = db.prepare('SELECT * FROM ask_providers WHERE id = ?').get(id) as unknown as
    ProviderRow | undefined
  return r ? settings(r) : null
}

/** The provider's key as stored (ciphertext), or null. */
export function getAskProviderKey(db: Db, id: number): Uint8Array | null {
  const r = db.prepare('SELECT key_cipher FROM ask_providers WHERE id = ?').get(id) as unknown as
    { key_cipher: Uint8Array | null } | undefined
  return r?.key_cipher && r.key_cipher.length > 0 ? r.key_cipher : null
}

/**
 * Adds a provider (no `id`) or changes one. `cipher` is the new key's ciphertext, `null` removes the
 * key, `undefined` keeps it. The first provider becomes the active one.
 */
export function saveAskProvider(
  db: Db,
  p: Omit<ProviderInput, 'key'> & { id?: number },
  cipher: Uint8Array | null | undefined
): ProviderSettings {
  if (p.id === undefined) {
    const first =
      (db.prepare('SELECT COUNT(*) AS n FROM ask_providers').get() as { n: number }).n === 0
    const r = db
      .prepare(
        `INSERT INTO ask_providers (kind, preset, label, base_url, model, profile, mode, reasoning, key_cipher, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        p.kind,
        p.preset,
        p.label,
        p.baseUrl,
        p.model,
        p.profile,
        p.mode,
        p.reasoning,
        cipher ?? null,
        first ? 1 : 0
      ) as unknown as ProviderRow
    return settings(r)
  }
  db.prepare(
    `UPDATE ask_providers SET kind = ?, preset = ?, label = ?, base_url = ?, model = ?, profile = ?,
       mode = ?, reasoning = ? WHERE id = ?`
  ).run(p.kind, p.preset, p.label, p.baseUrl, p.model, p.profile, p.mode, p.reasoning, p.id)
  if (cipher !== undefined)
    db.prepare('UPDATE ask_providers SET key_cipher = ? WHERE id = ?').run(cipher, p.id)
  const saved = getAskProvider(db, p.id)
  if (!saved) throw new Error(`there is no provider ${p.id}`)
  return saved
}

/** Makes one provider the active one. */
export function activateAskProvider(db: Db, id: number): void {
  db.prepare('UPDATE ask_providers SET active = CASE WHEN id = ? THEN 1 ELSE 0 END').run(id)
}

/** Removes a provider; when it was active, the first one left takes over. */
export function deleteAskProvider(db: Db, id: number): void {
  db.prepare('DELETE FROM ask_providers WHERE id = ?').run(id)
  const active = db.prepare('SELECT id FROM ask_providers WHERE active = 1').get()
  if (!active)
    db.prepare(
      'UPDATE ask_providers SET active = 1 WHERE id = (SELECT MIN(id) FROM ask_providers)'
    ).run()
}

export function activeAskProvider(db: Db): ProviderSettings | null {
  const r = db.prepare('SELECT * FROM ask_providers WHERE active = 1').get() as unknown as
    ProviderRow | undefined
  return r ? settings(r) : null
}
