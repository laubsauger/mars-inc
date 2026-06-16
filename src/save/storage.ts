// Persistence backends (T24, §16). IndexedDB is the primary store; a small
// localStorage pointer records that a save exists (fast boot check). All I/O is
// best-effort: failures resolve to null/false rather than throwing, so a blocked
// or unavailable store never crashes boot (V14). No fallback *logic* — just the
// honest "no data" result the caller already handles.

const DB_NAME = 'mars-pit';
const STORE = 'profile';
const BACKUP_STORE = 'backups';
const PROFILE_KEY = 'main';
const QUARANTINE_KEY = 'corrupt';
const BOOT_POINTER = 'mars-pit:has-save';
const MAX_BACKUPS = 3;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(BACKUP_STORE)) db.createObjectStore(BACKUP_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

export async function idbGet<T>(): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(PROFILE_KEY);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function idbPut<T>(value: T): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, PROFILE_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return false;
  }
}

/** Write a timestamped backup and prune to the most recent MAX_BACKUPS. */
export async function idbBackup<T>(value: T, ts: number): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(BACKUP_STORE, 'readwrite');
      const store = tx.objectStore(BACKUP_STORE);
      store.put(value, ts);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        const keys = keysReq.result as IDBValidKey[];
        const sorted = keys.map(Number).sort((a, b) => a - b);
        for (let i = 0; i < sorted.length - MAX_BACKUPS; i++) store.delete(sorted[i]!);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return false;
  }
}

export async function idbBackupCount(): Promise<number> {
  try {
    const db = await openDb();
    return await new Promise<number>((resolve, reject) => {
      const req = db.transaction(BACKUP_STORE, 'readonly').objectStore(BACKUP_STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

/** Quarantine unreadable stored data so recovery never silently destroys it. */
export async function idbQuarantine(raw: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(raw, QUARANTINE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* best effort */
  }
}

/**
 * Wipe ALL persisted progress: deletes the whole IndexedDB (profile + every
 * backup + quarantine) and clears the boot pointer. Used by the Settings →
 * Reset Progress action. Best-effort like the rest (V14): never throws.
 *
 * Return value is "did the delete COMPLETE synchronously". In practice the live
 * page still holds open connections (we never cache/close them), so this almost
 * always resolves `false` via `onblocked` — the delete is *accepted and queued*,
 * and IndexedDB serialization guarantees it runs once the page unloads. The sole
 * caller (`SaveManager.reset`) reloads immediately and ignores the bool, so a
 * `false` here is the expected path, NOT a failure.
 */
export async function idbClear(): Promise<boolean> {
  setBootPointer(false);
  try {
    return await new Promise<boolean>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false); // queued behind live connections — completes on reload
    });
  } catch {
    return false;
  }
}

export function setBootPointer(present: boolean): void {
  try {
    if (present) localStorage.setItem(BOOT_POINTER, '1');
    else localStorage.removeItem(BOOT_POINTER);
  } catch {
    /* storage blocked — pointer is an optimization, not a source of truth */
  }
}

export function hasBootPointer(): boolean {
  try {
    return localStorage.getItem(BOOT_POINTER) === '1';
  } catch {
    return false;
  }
}
