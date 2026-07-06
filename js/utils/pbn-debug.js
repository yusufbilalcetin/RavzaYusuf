// Boyama (PBN) teşhis loglayıcı.
//
// Amaç: gerçek iPhone Safari'de "kendi kendine ana sayfaya atma" olayının
// bir tam-sayfa reload mı (bellek baskısı) yoksa in-app bir ekran değişimi mi
// olduğunu KANITLAMAK. Bunun için loglar konsola basılırken aynı zamanda
// localStorage'ta bir halka tampona yazılır: reload sonrası önceki oturumun
// SON satırları hâlâ okunabilir olur (konsol reload'da temizlenir).
//
// Etkinleştirme: URL'de ?pbndebug=1 veya localStorage.pbnDebug === "1".
// Okuma: konsolda dumpPbnLog() çağır.

const RING_KEY = "pbnDebugLog";
const RING_MAX = 200;

let enabledCache = null;

function isEnabled() {
  if (enabledCache !== null) return enabledCache;
  try {
    const bySearch = typeof location !== "undefined" && /pbndebug/i.test(location.search || "");
    const byStore = localStorage.getItem("pbnDebug") === "1";
    // ?pbndebug=1 kalıcılaştırılır: reload sonrası da açık kalsın (reload teşhisi için şart).
    if (bySearch) { try { localStorage.setItem("pbnDebug", "1"); } catch { /* quota */ } }
    enabledCache = Boolean(bySearch || byStore);
  } catch {
    enabledCache = false;
  }
  return enabledCache;
}

function readRing() {
  try {
    const raw = localStorage.getItem(RING_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function pushRing(line) {
  try {
    const list = readRing();
    list.push(line);
    if (list.length > RING_MAX) list.splice(0, list.length - RING_MAX);
    localStorage.setItem(RING_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode — yut */
  }
}

function safeStringify(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "object" && value !== null) {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

export function pbnLog(tag, ...args) {
  if (!isEnabled()) return;
  const time = new Date().toISOString().slice(11, 23);
  const parts = args.map(safeStringify).join(" ");
  const line = `${time} [${tag}] ${parts}`;
  // eslint-disable-next-line no-console
  console.warn("[PBN DEBUG]", line);
  pushRing(line);
}

export function dumpPbnLog() {
  const list = readRing();
  // eslint-disable-next-line no-console
  console.log(`[PBN DEBUG] son ${list.length} satır:\n` + list.join("\n"));
  return list;
}

export function clearPbnLog() {
  try { localStorage.removeItem(RING_KEY); } catch { /* yut */ }
}

if (typeof window !== "undefined") {
  window.dumpPbnLog = dumpPbnLog;
  window.clearPbnLog = clearPbnLog;
}
