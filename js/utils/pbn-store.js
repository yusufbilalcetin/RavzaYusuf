import { pbnLog } from "./pbn-debug.js?v=pbn-save-20260706-1";

const DB_NAME = "pbnStudio";
const DB_VERSION = 3;
const STORE_NAME = "projects";
// Tamamlanan boyamalar ayrı bir object store + ayrı localStorage index'inde
// tutulur; böylece "Son çalışmalar" (yarım işler) listesinden bağımsızdır.
const COMPLETED_STORE_NAME = "completed";
const INDEX_KEY = "pbnProjectsIndex";
const COMPLETED_INDEX_KEY = "pbnCompletedIndex";
const OPEN_TIMEOUT_MS = 8000;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      pbnLog("store.openThrow", error);
      dbPromise = null; // tekrar denenebilsin
      reject(error);
      return;
    }

    // onblocked/askıda kalma: başka sekme upgrade'i bloklarsa promise sonsuza
    // asılı kalıp kayıtları sessizce engellemesin.
    const timer = setTimeout(() => {
      pbnLog("store.openTimeout");
      dbPromise = null;
      finish(reject, new Error("IndexedDB açılışı zaman aşımına uğradı"));
    }, OPEN_TIMEOUT_MS);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(COMPLETED_STORE_NAME)) {
        db.createObjectStore(COMPLETED_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onblocked = () => {
      pbnLog("store.openBlocked");
      console.warn("pbnStudio veritabanı yükseltmesi başka bir açık sekme tarafından bloklandı.");
    };
    request.onsuccess = () => { clearTimeout(timer); finish(resolve, request.result); };
    request.onerror = () => {
      clearTimeout(timer);
      pbnLog("store.openError", request.error);
      dbPromise = null;
      finish(reject, request.error);
    };
  });
  return dbPromise;
}

export function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? sortIndexEntries(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function sortIndexEntries(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const bTime = b.updatedAt || b.createdAt || 0;
    const aTime = a.updatedAt || a.createdAt || 0;
    return bTime - aTime;
  });
}

function writeIndex(list) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(sortIndexEntries(list).slice(0, 24)));
  } catch {
    /* ignore quota errors */
  }
}

export function upsertIndexEntry(entry) {
  const list = readIndex().filter((item) => item.id !== entry.id);
  writeIndex([entry, ...list]);
}

export function removeIndexEntry(id) {
  writeIndex(readIndex().filter((item) => item.id !== id));
}

export async function saveProject(record) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  upsertIndexEntry({
    id: record.id,
    name: record.name,
    thumbnail: record.thumbnail,
    updatedAt: record.updatedAt
  });
}

export async function loadProject(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  removeIndexEntry(id);
}

/* ---------- Tamamlanan boyamalar (%100) ---------- */

function sortCompletedEntries(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const bTime = b.completedAt || 0;
    const aTime = a.completedAt || 0;
    return bTime - aTime;
  });
}

export function readCompletedIndex() {
  try {
    const raw = localStorage.getItem(COMPLETED_INDEX_KEY);
    return raw ? sortCompletedEntries(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeCompletedIndex(list) {
  try {
    // Tamamlananlar kürasyonlu bir galeri: kullanıcı silene dek kalır.
    // Yine de aşırı büyümeye karşı geniş bir tavan uygulanır.
    localStorage.setItem(COMPLETED_INDEX_KEY, JSON.stringify(sortCompletedEntries(list).slice(0, 120)));
  } catch {
    /* ignore quota errors */
  }
}

function upsertCompletedIndexEntry(entry) {
  const list = readCompletedIndex().filter((item) => item.id !== entry.id);
  writeCompletedIndex([entry, ...list]);
}

function removeCompletedIndexEntry(id) {
  writeCompletedIndex(readCompletedIndex().filter((item) => item.id !== id));
}

export async function saveCompleted(record) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(COMPLETED_STORE_NAME, "readwrite");
    tx.objectStore(COMPLETED_STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  upsertCompletedIndexEntry({
    id: record.id,
    name: record.name,
    thumbnail: record.thumbnail,
    completedAt: record.completedAt,
    progress: record.progress ?? 100
  });
}

export async function loadCompleted(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(COMPLETED_STORE_NAME, "readonly");
    const request = tx.objectStore(COMPLETED_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCompleted(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(COMPLETED_STORE_NAME, "readwrite");
    tx.objectStore(COMPLETED_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  removeCompletedIndexEntry(id);
}
