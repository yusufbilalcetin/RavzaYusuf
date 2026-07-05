const DB_NAME = "pbnStudio";
const DB_VERSION = 2;
const STORE_NAME = "projects";
const INDEX_KEY = "pbnProjectsIndex";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onblocked = () => {
      console.warn("pbnStudio veritabanı yükseltmesi başka bir açık sekme tarafından bloklandı.");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
