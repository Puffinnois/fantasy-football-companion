/**
 * API keys at rest (Ask spec §6.2, Plan AG1 amendment I): Electron's `safeStorage` (DPAPI on
 * Windows). A key is encrypted before it reaches `companion.db` and decrypted only to make a
 * request; it never goes to the renderer, a trace or a log. Without `safeStorage` (some Linux
 * setups) no key is stored, and the app says so.
 */
export interface KeyStore {
  available(): boolean
  encrypt(key: string): Uint8Array
  decrypt(cipher: Uint8Array): string
}

export const NO_KEY_STORE =
  'This computer cannot encrypt keys (no system keyring), so a key cannot be saved.'

/** The key store over Electron's `safeStorage`. */
export function safeStorageKeys(safe: {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(cipher: Buffer): string
}): KeyStore {
  return {
    available: () => safe.isEncryptionAvailable(),
    encrypt: (key) => {
      if (!safe.isEncryptionAvailable()) throw new Error(NO_KEY_STORE)
      return new Uint8Array(safe.encryptString(key))
    },
    decrypt: (cipher) => safe.decryptString(Buffer.from(cipher))
  }
}
