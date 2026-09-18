// Offline-Puffer für Token-Einreichungen: Eingaben landen in IndexedDB und
// werden nachgesendet, sobald wieder Netz da ist (window "online", SW-Sync
// oder beim nächsten Öffnen). Jede Einreichung ist an ihre URL gebunden.

const DB_NAME = "fess-einsatz";
const STORE = "pending";

export type PendingSubmission = {
  key: string; // z. B. "e:<token>" oder "crew:<token>:<shiftAssignmentId>"
  url: string;
  body: unknown;
  createdAt: string;
  lastError?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB nicht verfügbar"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB-Fehler"));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB-Fehler"));
      })
  );
}

export async function queueSubmission(item: PendingSubmission): Promise<void> {
  await tx("readwrite", (s) => s.put(item));
}

export async function getPending(key: string): Promise<PendingSubmission | undefined> {
  try {
    return await tx<PendingSubmission | undefined>("readonly", (s) => s.get(key) as IDBRequest<PendingSubmission | undefined>);
  } catch {
    return undefined;
  }
}

export async function removePending(key: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(key));
  } catch {
    // ignorieren
  }
}

async function allPending(): Promise<PendingSubmission[]> {
  try {
    return await tx<PendingSubmission[]>("readonly", (s) => s.getAll() as IDBRequest<PendingSubmission[]>);
  } catch {
    return [];
  }
}

export const FLUSH_EVENT = "fess-einsatz-flush";

let flushing = false;

// Sendet alle gepufferten Einreichungen; meldet Ergebnis je Key per Event
export async function flushQueue(): Promise<void> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return;
  flushing = true;
  try {
    for (const item of await allPending()) {
      try {
        const res = await fetch(item.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
        if (res.ok || res.status === 409 || res.status === 400 || res.status === 404) {
          // gesendet – oder fachlich abgelehnt (dann nicht endlos wiederholen)
          await removePending(item.key);
          let payload: unknown = null;
          try {
            payload = await res.json();
          } catch {
            payload = null;
          }
          window.dispatchEvent(new CustomEvent(FLUSH_EVENT, { detail: { key: item.key, ok: res.ok, status: res.status, payload } }));
        } else {
          const text = await res.text().catch(() => "");
          await queueSubmission({ ...item, lastError: `${res.status} ${text.slice(0, 120)}` });
        }
      } catch (err) {
        await queueSubmission({ ...item, lastError: err instanceof Error ? err.message : "Netzwerkfehler" });
      }
    }
  } finally {
    flushing = false;
  }
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}
