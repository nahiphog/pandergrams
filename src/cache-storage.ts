import type { WordCacheSnapshot } from './solver'

// Bump this whenever dictionary rules, cache keys, or graph semantics change.
export const STORED_CACHE_VERSION = 1
export const MAX_CACHE_BYTES = 16 * 1024 * 1024
const DATABASE = 'pandergrams-word-search-cache'
const STORE = 'snapshots'
const KEY = 'completed-word-searches'
const STORAGE_TIMEOUT_MS = 3000

interface StoredCache { version: number; fingerprint: string; payload: string; checksum: string }

async function digest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function dictionaryFingerprint(dictionary: Set<string>): Promise<string> {
  return digest(JSON.stringify([...dictionary].sort()))
}

export async function encodeCache(fingerprint: string, snapshot: WordCacheSnapshot): Promise<StoredCache> {
  // Preserve the most recently used entries when the disk budget is smaller
  // than the in-memory graph budget.
  let entries = snapshot.entries
  let payload = JSON.stringify({ version: snapshot.version, entries })
  while (new TextEncoder().encode(payload).byteLength > MAX_CACHE_BYTES && entries.length) {
    entries = entries.slice(1)
    payload = JSON.stringify({ version: snapshot.version, entries })
  }
  return { version: STORED_CACHE_VERSION, fingerprint, payload, checksum: await digest(payload) }
}

export async function decodeCache(fingerprint: string, stored: unknown): Promise<unknown | null> {
  try {
    if (!stored || typeof stored !== 'object') return null
    const record = stored as Partial<StoredCache>
    if (record.version !== STORED_CACHE_VERSION || record.fingerprint !== fingerprint || typeof record.payload !== 'string' || record.payload.length > MAX_CACHE_BYTES || typeof record.checksum !== 'string') return null
    if (new TextEncoder().encode(record.payload).byteLength > MAX_CACHE_BYTES) return null
    if (await digest(record.payload) !== record.checksum) return null
    return JSON.parse(record.payload)
  } catch { return null }
}

/** Atomic single-record read/write; denied, blocked, or full storage is optional. */
async function access(write?: StoredCache, remove = false): Promise<{ ok: boolean; value?: unknown }> {
  return new Promise(resolve => {
    let database: IDBDatabase | undefined
    let transaction: IDBTransaction | undefined
    let done = false
    let value: unknown
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      database?.close()
      resolve({ ok, value })
    }
    const timer = setTimeout(() => {
      try { transaction?.abort() } catch { /* Already settled. */ }
      finish(false)
    }, STORAGE_TIMEOUT_MS)
    try {
      const request = indexedDB.open(DATABASE, 1)
      request.onupgradeneeded = () => {
        if (done) { request.transaction?.abort(); return }
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
      }
      request.onerror = () => finish(false)
      request.onblocked = () => finish(false)
      request.onsuccess = () => {
        database = request.result
        if (done) { database.close(); return }
        database.onversionchange = () => database?.close()
        try {
          transaction = database.transaction(STORE, write || remove ? 'readwrite' : 'readonly')
          const store = transaction.objectStore(STORE)
          const operation = remove ? store.delete(KEY) : write ? store.put(write, KEY) : store.get(KEY)
          operation.onsuccess = () => { value = operation.result }
          transaction.oncomplete = () => finish(true)
          transaction.onerror = () => finish(false)
          transaction.onabort = () => finish(false)
        } catch { finish(false) }
      }
    } catch { finish(false) }
  })
}

export async function loadWordCache(dictionary: Set<string>): Promise<{ fingerprint: string | null; snapshot: unknown | null }> {
  try {
    const fingerprint = await dictionaryFingerprint(dictionary)
    const stored = await access()
    return { fingerprint, snapshot: stored.ok ? await decodeCache(fingerprint, stored.value) : null }
  } catch { return { fingerprint: null, snapshot: null } }
}

export async function saveWordCache(fingerprint: string | null, snapshot: WordCacheSnapshot): Promise<boolean> {
  if (!fingerprint) return false
  try { return (await access(await encodeCache(fingerprint, snapshot))).ok }
  catch { return false }
}

/** Remove only saved solver graphs, leaving other site data untouched. */
export async function clearWordCache(): Promise<boolean> {
  return (await access(undefined, true)).ok
}
