const DB_NAME = "pbnStudio";
const DB_VERSION = 2;
const STORE_NAME = "projects";
const GALLERY_STORE = "gallery";
const INDEX_KEY = "pbnProjectsIndex";
const GALLERY_MAX_ITEMS = 60;

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
      if (!db.objectStoreNames.contains(GALLERY_STORE)) {
        db.createObjectStore(GALLERY_STORE, { keyPath: "id" });
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
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

export function upsertIndexEntry(entry) {
  const list = readIndex();
  const existingPos = list.findIndex((item) => item.id === entry.id);
  if (existingPos >= 0) list[existingPos] = entry;
  else list.unshift(entry);
  writeIndex(list.slice(0, 24));
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

/* ---------- galeri (tamamlanmış eserler) ---------- */

export async function saveGalleryItem(record) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, "readwrite");
    tx.objectStore(GALLERY_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Kapasite aşımında en eski kayıtlar silinir.
  const items = await listGalleryItems();
  if (items.length > GALLERY_MAX_ITEMS) {
    const excess = items.slice(GALLERY_MAX_ITEMS);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(GALLERY_STORE, "readwrite");
      const store = tx.objectStore(GALLERY_STORE);
      for (const item of excess) store.delete(item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export async function listGalleryItems() {
  const db = await openDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, "readonly");
    const request = tx.objectStore(GALLERY_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getGalleryItem(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, "readonly");
    const request = tx.objectStore(GALLERY_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteGalleryItem(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(GALLERY_STORE, "readwrite");
    tx.objectStore(GALLERY_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
