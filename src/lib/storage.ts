import type { Graph } from "../model/types";
import { loadGraph } from "./graph";

export const STORAGE_KEY = "plyloom.graph.v2";
export const LEGACY_KEYS = ["atlas.graph.v2", "atlas.graph.v1"];
const DATABASE = "plyloom", STORE = "projects";
export interface StoredProject { graph: Graph | null; warning: string | null; migrate: boolean; blocked?: boolean }

/** Each operation owns its connection. Resolve writes only on transaction
 * completion, never on put.onsuccess (a later quota error can still abort). */
async function database(): Promise<IDBDatabase> {
  if (!window.indexedDB) throw new Error("IndexedDB unavailable");
  return new Promise((resolve, reject) => {
    let failed = false;
    const request = window.indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onerror = () => { failed = true; reject(request.error); };
    request.onblocked = () => { failed = true; reject(new Error("IndexedDB blocked")); };
    request.onsuccess = () => {
      const db = request.result;
      if (failed) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted"));
      tx.onerror = () => reject(tx.error);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
    });
  } finally { db.close(); }
}

function legacyRaw(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) ?? LEGACY_KEYS.map(k => localStorage.getItem(k)).find(Boolean) ?? null; }
  catch { return null; }
}

export async function readAutosave(): Promise<StoredProject> {
  let value: unknown;
  let blocked = false;
  try { value = await transaction("readonly", store => store.get("current")); } catch { blocked = !!window.indexedDB; }
  const raw = value === undefined ? legacyRaw() : null;
  if (value === undefined && raw === null) return { graph: null, warning: null, migrate: false, blocked };
  try {
    const graph = loadGraph(value === undefined ? JSON.parse(raw!) : value).graph;
    return { graph, warning: graph ? null : raw ?? recoveryText(value), migrate: !!graph && value === undefined && !blocked, blocked };
  } catch { return { graph: null, warning: raw ?? recoveryText(value), migrate: false, blocked }; }
}

function recoveryText(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_, v) => {
    if (typeof v === "bigint") return String(v);
    if (v && typeof v === "object") { if (seen.has(v)) return "[Repeated reference]"; seen.add(v); }
    return v;
  }) ?? "null";
}

export async function writeAutosave(graph: Graph, recovery: string | null = null): Promise<"indexeddb" | "local"> {
  // No JSON.stringify on the normal path: IDB stores a structured clone.
  if (window.indexedDB) {
    await transaction("readwrite", store => {
      if (recovery) store.put(recovery, "recovery");
      return store.put(graph, "current");
    });
    return "indexeddb";
  }
  // Older/file-restricted browsers retain the previous behavior, with a visible status.
  if (recovery) localStorage.setItem("plyloom.graph.recovery", recovery);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
  return "local";
}

export async function clearAutosave(): Promise<void> {
  if (window.indexedDB) await transaction("readwrite", store => store.delete("current"));
  localStorage.removeItem(STORAGE_KEY);
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}

/** Bounded idle scheduling: continual input cannot postpone saving indefinitely. */
export function inIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 1000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 50);
  return () => window.clearTimeout(id);
}
