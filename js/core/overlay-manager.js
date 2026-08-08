/**
 * SISTEM OVERLAY KOORDINATORU.
 *
 * NE DEGILDIR: yeni bir modal/dialog sistemi. Projede zaten UC ayri, calisan
 * mekanizma var ve hicbiri yeniden yazilmadi:
 *
 *   1. Native <dialog> + showModal()  - okuyucu sayfalari, js/ui/sheet.js
 *      (top layer, odak tuzagi, Escape ve ::backdrop tarayicidan gelir)
 *   2. Sinif tabanli panel            - tema paneli (#theme-sheet + backdrop)
 *   3. Launcher dialog katmanlari     - klasor / arama / duzenleyici
 *
 * SORUN: her mekanizma kendi icinde tutarli ama BIRBIRINDEN habersizdi. Tema
 * paneli acikken launcher aramasi acilabiliyor, ikisi ust uste kalabiliyordu;
 * her biri kendi backdrop'unu ve kendi scroll kilidini kuruyordu.
 *
 * BU MODULUN ISI yalnizca YASAM DONGUSU koordinasyonu:
 *   - ayni anda TEK birincil overlay
 *   - degistirme sirasinda odagin dogru yere gitmesi
 *   - tek bir govde scroll kilidi
 *   - aktif overlay'in kim oldugunun bilinmesi
 *
 * Icerige ait mantik (ne cizecegi, nasil acilacagi) HER ZAMAN ozelligin
 * kendisinde kalir. Burada DOM olusturulmaz, stil yazilmaz.
 *
 * Z-INDEX: burada z-index YONETILMEZ. Native <dialog> zaten "top layer"da
 * cizilir ve yarisa girmez; diger iki mekanizma kendi semantik katmanlarini
 * (--z-sheet / --z-modal) kullanmaya devam eder. Tek aktif overlay kurali
 * zaten katmanlarin cakismasini ortadan kaldiriyor.
 */

/**
 * Birincil overlay kimlikleri. BURADA durur cunku bu modulun hic bagimliligi
 * yok; kayit dosyasina koymak theme.js <-> overlay-registrations.js dongusu
 * yaratirdi (registrations theme'i, theme de kimlikleri isteyecekti).
 */
export const OVERLAY_IDS = Object.freeze({
  themePanel: "theme-panel",
  launcherSearch: "launcher-search",
  launcherFolder: "launcher-folder",
  launcherEditor: "launcher-editor",
  readerSheet: "reader-sheet",
});

/** id -> { id, isOpen, close, dismissible } */
const registry = new Map();
let activeId = null;
/** Degistirme sirasinda kapanan overlay odagi geri almasin diye kullanilir. */
let replacing = false;

const BODY_CLASS = "system-overlay-open";

function entryOf(id) {
  return registry.get(String(id)) || null;
}

/**
 * Aktif kaydi GERCEKLE esitler.
 *
 * Neden gerekli: bir overlay kendi kendine de kapanabilir - Escape, backdrop
 * tiklamasi, kendi kapat dugmesi. Bunlarin hepsini yakalamak icin her ozellige
 * "kapandim" cagrisi eklemek gerekirdi; bunun yerine aktif kaydin hala acik
 * olup olmadigi SORULDUGU AN dogrulanir. Boylece mevcut kapatma yollarinin
 * hicbirine dokunmadan durum tutarli kalir.
 */
function syncActive() {
  if (!activeId) return null;
  const entry = entryOf(activeId);
  if (!entry) {
    activeId = null;
  } else if (!safeIsOpen(entry)) {
    activeId = null;
  }
  applyBodyState();
  return activeId;
}

function safeIsOpen(entry) {
  try {
    return entry.isOpen() === true;
  } catch (_) {
    return false;
  }
}

/**
 * Govde scroll kilidi. TEK yerden yonetilir ve `position: fixed` HILESI
 * KULLANILMAZ - o yontem kaydirma konumunu kaybettirip acilis/kapanista
 * ziplamaya yol acar. Sinif, CSS'te `overflow: hidden` verir; konum korunur.
 */
function applyBodyState() {
  const body = document.body;
  if (!body) return;
  const shouldLock = Boolean(activeId);
  body.classList.toggle(BODY_CLASS, shouldLock);
}

/**
 * Bir overlay kaydeder.
 *
 * @param {object} options
 * @param {string} options.id benzersiz kimlik
 * @param {() => boolean} options.isOpen su an acik mi
 * @param {(reason: {replacing: boolean}) => void} options.close kapatma
 * @param {boolean} [options.dismissible=true] closeActiveOverlay onu kapatabilir mi
 */
export function registerOverlay({ id, isOpen, close, dismissible = true }) {
  if (!id || typeof isOpen !== "function" || typeof close !== "function") return () => {};
  const key = String(id);
  registry.set(key, { id: key, isOpen, close, dismissible });
  return () => {
    if (activeId === key) activeId = null;
    registry.delete(key);
    applyBodyState();
  };
}

export function isOverlayRegistered(id) {
  return registry.has(String(id));
}

/** Su an acik olan birincil overlay'in kimligi (yoksa null). */
export function getActiveOverlay() {
  return syncActive();
}

export function isOverlayOpen(id) {
  const entry = entryOf(id);
  return Boolean(entry && safeIsOpen(entry));
}

/**
 * Bir overlay'i acilmaya hazirlar: acikken baska bir birincil overlay varsa
 * ONU KAPATIR ve yeni sahibi isaretler.
 *
 * Ozellikler bunu kendi acma fonksiyonlarinin BASINDA cagirir; acma isini
 * yine kendileri yapar. Boylece her ozellik kendi acilis animasyonuna,
 * odaklama kuralina ve icerigine sahip olmaya devam eder.
 */
export function claimOverlay(id) {
  const key = String(id);
  const entry = entryOf(key);
  syncActive();
  if (activeId && activeId !== key) {
    const current = entryOf(activeId);
    if (current) {
      // DEGISTIRME: kapanan overlay odagi kendi tetikleyicisine GERI ALMAMALI,
      // yoksa yeni acilan panelden odagi caliyor.
      replacing = true;
      try { current.close({ replacing: true }); } catch (_) {}
      replacing = false;
    }
  }
  activeId = entry ? key : null;
  applyBodyState();
  return true;
}

/**
 * Overlay'i acar. Ozellik `open` geri cagrimini kayit sirasinda vermediyse
 * yalnizca sahiplik devralinir (claimOverlay ile ayni).
 */
export function openOverlay(id, options = {}) {
  const entry = entryOf(id);
  if (!entry) return false;
  claimOverlay(id);
  if (typeof entry.open === "function") {
    try { entry.open(options); } catch (_) { return false; }
  }
  return true;
}

export function closeOverlay(id, options = {}) {
  const entry = entryOf(id);
  if (!entry || !safeIsOpen(entry)) return false;
  try { entry.close({ replacing: false, ...options }); } catch (_) {}
  if (activeId === String(id)) activeId = null;
  applyBodyState();
  return true;
}

/** Aktif overlay'i kapatir (Escape / geri jesti gibi genel cikislar icin). */
export function closeActiveOverlay(options = {}) {
  syncActive();
  if (!activeId) return false;
  const entry = entryOf(activeId);
  if (!entry || entry.dismissible === false) return false;
  return closeOverlay(activeId, options);
}

/** Rota/sayfa degisiminde acik kalan paneli temizler. */
export function closeOverlaysForNavigation() {
  syncActive();
  if (!activeId) return false;
  return closeOverlay(activeId, { navigation: true });
}

/**
 * Kayit defterinden GERCEGI okuyup aktif kaydi ve govde kilidini tazeler.
 *
 * Neden gerekli: kilit yalnizca "aktif kim?" diye soruldugunda hesaplansaydi,
 * bir panel kendi kendine kapandiktan sonra kimse sormazsa `overflow: hidden`
 * govdede ASILI kalirdi. Bu fonksiyon kapanis anlarinda cagrilir.
 */
export function refreshOverlayState() {
  let found = null;
  for (const entry of registry.values()) {
    if (safeIsOpen(entry)) { found = entry.id; break; }
  }
  activeId = found;
  applyBodyState();
  return activeId;
}

/** Belirli bir overlay kapandi: kaydi birak ve kilidi tazele. */
export function releaseOverlay(id) {
  if (activeId === String(id)) activeId = null;
  return refreshOverlayState();
}

/** Kapanan overlay'in odagi geri almamasi gerekip gerekmedigi. */
export function isReplacingOverlay() {
  return replacing;
}

/**
 * Native <dialog> kapanislarini yakalar. `close` olayi BUBBLE ETMEZ, bu yuzden
 * capture fazinda dinlenir; Escape / backdrop / close() yollarinin hepsi buraya
 * duser ve govde kilidi asili kalmaz.
 */
if (typeof document !== "undefined") {
  document.addEventListener("close", () => refreshOverlayState(), true);
}

/** Yalnizca testler icin: kayit defterini ve durumu sifirlar. */
export function __resetOverlayManager() {
  registry.clear();
  activeId = null;
  replacing = false;
  applyBodyState();
}
