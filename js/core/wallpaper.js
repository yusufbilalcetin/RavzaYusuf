/**
 * ARKA PLAN (WALLPAPER) DURUMU - TEK KANONIK KAYNAK.
 *
 * Yeni bir arka plan sistemi YAZILMAZ. Secim havuzu ve gorsel uygulama
 * js/pages/ana-sayfa-rastgele-gorsel.js'te kalir; bu modul yalnizca
 * "hangi arka plan gosterilecek" sorusunun durumunu tutar.
 *
 * BAGIMLILIK YOK: bu dosya hicbir sey import etmez. Sebep, ana-sayfa modulunun
 * de bunu import etmesi gerekmesi - aksi halde dongusel bagimlilik olusurdu.
 *
 * IKI MOD:
 *   fixed          - kullanici bir gorsel sectii; degismez.
 *   random-session - her YENI oturumda rastgele; oturum icinde SABIT.
 *
 * "Oturum" = sessionStorage omru. Ayni sekmede yenileme ayni gorseli verir;
 * sekme kapanip yeniden acilinca yeni gorsel gelir. Boylece "her geldigimde
 * yeni arka plan" hissi olusur ama gezinirken arka plan zıplamaz.
 */

export const WALLPAPER_MODES = Object.freeze(["fixed", "random-session"]);

export const WALLPAPER_KEYS = Object.freeze({
  mode: "ravzaYusufWallpaperMode",
  fixed: "ravzaYusufWallpaperFixed",
  previous: "ravzaYusufWallpaperPrevious",
  session: "ravzaYusufWallpaperSession",
});

export const WALLPAPER_CHANGE_EVENT = "app:wallpaper-change";

function readLocal(key) {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}

function writeLocal(key, value) {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* depolama kapali olabilir */ }
}

function readSession(key) {
  try { return globalThis.sessionStorage?.getItem(key) ?? null; } catch { return null; }
}

function writeSession(key, value) {
  try { globalThis.sessionStorage?.setItem(key, value); } catch { /* yok sayilir */ }
}

export function normalizeWallpaperMode(value) {
  return WALLPAPER_MODES.includes(value) ? value : "fixed";
}

/**
 * MIGRATION + BOZUK DEPO GUVENLIGI.
 *
 * Mod anahtari hic yoksa (bu surumden onceki kullanicilar) "fixed" kabul
 * edilir: guncellemeden sonra kimsenin arka plani birdenbire her ziyarette
 * degismeye baslamasin. Rastgele mod OPT-IN'dir.
 * Bozuk/taninmayan deger de ayni guvenli varsayilana duser.
 */
export function getWallpaperMode() {
  return normalizeWallpaperMode(readLocal(WALLPAPER_KEYS.mode));
}

export function getFixedWallpaperId() {
  const value = readLocal(WALLPAPER_KEYS.fixed);
  return typeof value === "string" && value ? value : null;
}

export function getSessionWallpaperId() {
  const value = readSession(WALLPAPER_KEYS.session);
  return typeof value === "string" && value ? value : null;
}

export function getPreviousWallpaperId() {
  const value = readLocal(WALLPAPER_KEYS.previous);
  return typeof value === "string" && value ? value : null;
}

export function getWallpaperState() {
  const mode = getWallpaperMode();
  return {
    mode,
    fixedId: getFixedWallpaperId(),
    sessionId: getSessionWallpaperId(),
    previousId: getPreviousWallpaperId(),
    currentId: mode === "fixed" ? getFixedWallpaperId() : getSessionWallpaperId(),
  };
}

function emit(reason) {
  globalThis.dispatchEvent?.(new CustomEvent(WALLPAPER_CHANGE_EVENT, {
    detail: { ...getWallpaperState(), reason },
  }));
}

/**
 * Havuzdan, verilen kimlikten FARKLI bir kimlik secer.
 *
 * Deterministik ve test edilebilir: rastgelelik disaridan verilebilir.
 * Tek aday varsa onu dondurur - hata vermez (§12).
 */
export function pickDifferentId(ids, excludeId, random = Math.random) {
  const pool = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id);
  if (!pool.length) return null;
  const candidates = pool.filter((id) => id !== excludeId);
  const source = candidates.length ? candidates : pool;
  const value = Number(random());
  const ratio = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999) : 0;
  return source[Math.floor(ratio * source.length)];
}

/**
 * Bu oturumda gosterilecek arka planin kimligi.
 *
 * ONEMLI: rastgele secim YALNIZCA oturumda henuz secim yoksa yapilir. Her
 * cagrida yeniden rastgele secilseydi arka plan gezinme/render basina
 * degisirdi - istenmeyen davranis tam olarak budur (§10, §20).
 */
export function resolveWallpaperId(ids, { random = Math.random } = {}) {
  const pool = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (!pool.length) return null;
  const mode = getWallpaperMode();

  if (mode === "fixed") {
    const fixed = getFixedWallpaperId();
    if (fixed && pool.includes(fixed)) return fixed;
    // Sabit mod ama gecerli bir secim yok: havuzdan biri secilir ve sabitlenir.
    const chosen = pickDifferentId(pool, getPreviousWallpaperId(), random);
    if (chosen) writeLocal(WALLPAPER_KEYS.fixed, chosen);
    return chosen;
  }

  const session = getSessionWallpaperId();
  if (session && pool.includes(session)) return session;
  // Yeni oturum: onceki ziyaretin gorselinden FARKLI olmaya calis (§10).
  const chosen = pickDifferentId(pool, getPreviousWallpaperId(), random);
  if (chosen) {
    writeSession(WALLPAPER_KEYS.session, chosen);
    writeLocal(WALLPAPER_KEYS.previous, chosen);
  }
  return chosen;
}

/** Kullanici galeriden bilincli secim yapti: mod SABIT olur (§2, §9). */
export function selectWallpaper(id) {
  if (typeof id !== "string" || !id) return getWallpaperState();
  writeLocal(WALLPAPER_KEYS.mode, "fixed");
  writeLocal(WALLPAPER_KEYS.fixed, id);
  writeLocal(WALLPAPER_KEYS.previous, id);
  writeSession(WALLPAPER_KEYS.session, id);
  emit("select");
  return getWallpaperState();
}

export function setWallpaperMode(mode, ids = []) {
  const next = normalizeWallpaperMode(mode);
  writeLocal(WALLPAPER_KEYS.mode, next);
  if (next === "random-session") {
    // Moda gecerken bu oturum icin bir gorsel secilir; sonra sabit kalir.
    const chosen = pickDifferentId(ids, getPreviousWallpaperId());
    if (chosen) {
      writeSession(WALLPAPER_KEYS.session, chosen);
      writeLocal(WALLPAPER_KEYS.previous, chosen);
    }
  } else {
    // Sabit moda donuldugunde su an gorunen gorsel sabitlenir.
    const current = getSessionWallpaperId() || getFixedWallpaperId();
    if (current) writeLocal(WALLPAPER_KEYS.fixed, current);
  }
  emit("mode");
  return getWallpaperState();
}

/** "Sabitle": su an gorunen (rastgele gelmis) gorseli kalici yapar (§11). */
export function pinCurrentWallpaper() {
  const current = getWallpaperState().currentId;
  if (!current) return getWallpaperState();
  return selectWallpaper(current);
}

/** "Rastgele Degistir": modu DEGISTIRMEDEN yeni bir gorsel secer (§12). */
export function randomizeWallpaper(ids, { random = Math.random } = {}) {
  const current = getWallpaperState().currentId;
  const chosen = pickDifferentId(ids, current, random);
  if (!chosen) return getWallpaperState();
  writeSession(WALLPAPER_KEYS.session, chosen);
  writeLocal(WALLPAPER_KEYS.previous, chosen);
  // Sabit moddayken de gorsel degisir; kullanici isterse "Sabitle" der.
  if (getWallpaperMode() === "fixed") writeLocal(WALLPAPER_KEYS.fixed, chosen);
  emit("randomize");
  return getWallpaperState();
}

export function onWallpaperChange(callback, options = {}) {
  if (typeof callback !== "function") return () => {};
  const handler = (event) => callback(event.detail, event);
  globalThis.addEventListener?.(WALLPAPER_CHANGE_EVENT, handler, { signal: options.signal });
  return () => globalThis.removeEventListener?.(WALLPAPER_CHANGE_EVENT, handler);
}
