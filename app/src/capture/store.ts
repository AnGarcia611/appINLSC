// Borrador del paquete de captura en IndexedDB: si se cierra la página o se apaga la tablet, se retoma donde iba.
import type { CapturePackage } from "./format"

const DB = "inlsc-captura"
const STORE = "borradores"
const KEY = "actual"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).finally(() => db.close())
}

export const loadDraft = () => run<CapturePackage | undefined>("readonly", (s) => s.get(KEY)).catch(() => undefined)
export const saveDraft = (pkg: CapturePackage) => run("readwrite", (s) => s.put(pkg, KEY)).then(() => true, () => false)
export const deleteDraft = () => run("readwrite", (s) => s.delete(KEY)).then(() => true, () => false)
