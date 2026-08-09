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
 *   fixed          - kullanici bir gorsel sectii; hicbir kosulda degismez.
 *   random-session - HER GERCEK SAYFA YUKLEMESINDE yeni gorsel.
 *
 * Rastgele modun sinirini "document omru" belirler: secim sessionStorage'da
 * DEGIL, modul kapsamindaki bir degiskende tutulur. Yenileme modulu yeniden
 * degerlendirir, degisken sifirlanir ve yeni gorsel gelir; ayni document
 * icinde ise deger korunur, yani SPA gezinme arka plani ziplatmaz.
 *
 * KALICI olan yalnizca TERCIH'tir (mod, sabit secim, bir onceki gorsel) -
 * rastgele modun O ANKI sonucu asla depoya yazilmaz.
 */

export const WALLPAPER_MODES = Object.freeze(["fixed", "random-session"]);

export const WALLPAPER_KEYS = Object.freeze({
  /** Guncellemeden onceki tek anahtarli secim (yalnizca OKUNUR, migration icin). */
  legacy: "ravzaYusufSelectedWallpaper",
  mode: "ravzaYusufWallpaperMode",
  fixed: "ravzaYusufWallpaperFixed",
  previous: "ravzaYusufWallpaperPrevious",
  /** ESKI: rastgele secimi yenileme boyunca tasiyordu. Artik YALNIZCA silinir. */
  legacySession: "ravzaYusufWallpaperSession",
});

/**
 * BU DOCUMENT icin cozulmus rastgele arka plan.
 *
 * Bilincli olarak KALICI DEGILDIR. Document yeniden yuklenince modul yeniden
 * degerlendirilir, bu degisken null'a doner ve yeni bir secim yapilir - "her
 * yenilemede yeni arka plan" davranisi tam olarak buradan gelir.
 * Ayni document icinde ise memoization gorevi gorur: SPA gezinme, overlay
 * acilisi ve yeniden render yeni secim URETMEZ.
 */
let runtimeWallpaperId = null;

export const WALLPAPER_CHANGE_EVENT = "app:wallpaper-change";

function readLocal(key) {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}

function writeLocal(key, value) {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* depolama kapali olabilir */ }
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

/**
 * MIGRATION (§34): guncellemeden onceki tek anahtarli secim.
 *
 * Yeni anahtar yoksa ama eski anahtar varsa, eski secim SABIT kabul edilir.
 * Yazma islemi bir kez yapilir; sonrasinda eski anahtar okunmaz bile.
 * Boylece hicbir mevcut kullanici guncelleme sonrasi rastgele moda dusmez.
 */
function migrateLegacyFixedId() {
  if (readLocal(WALLPAPER_KEYS.fixed)) return;
  const legacy = readLocal(WALLPAPER_KEYS.legacy);
  if (typeof legacy !== "string" || !legacy) return;
  writeLocal(WALLPAPER_KEYS.fixed, legacy);
  // Mod anahtari hic yoksa zaten "fixed" okunur; yine de acikca yazilir.
  if (!readLocal(WALLPAPER_KEYS.mode)) writeLocal(WALLPAPER_KEYS.mode, "fixed");
}

export function getFixedWallpaperId() {
  migrateLegacyFixedId();
  const value = readLocal(WALLPAPER_KEYS.fixed);
  return typeof value === "string" && value ? value : null;
}

/**
 * ESKI OTURUM ANAHTARI TEMIZLIGI (§9).
 *
 * Onceki surum rastgele secimi sessionStorage'da tutuyordu; o anahtar hala
 * duruyorsa yenileme sonrasi eski gorseli geri getirmemeli. Okunmaz, SILINIR.
 */
function purgeLegacySessionKey() {
  try { globalThis.sessionStorage?.removeItem(WALLPAPER_KEYS.legacySession); } catch { /* yok sayilir */ }
}

/** Bu document icin cozulmus rastgele gorsel; depoya YAZILMAZ. */
export function getRuntimeWallpaperId() {
  return runtimeWallpaperId;
}

/** Yalnizca testler icin: document sinirini taklit eder. */
export function resetRuntimeWallpaper() {
  runtimeWallpaperId = null;
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
    runtimeId: runtimeWallpaperId,
    previousId: getPreviousWallpaperId(),
    currentId: mode === "fixed" ? getFixedWallpaperId() : runtimeWallpaperId,
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
export function chooseRandomWallpaper(ids, excludeId, random = Math.random) {
  // slice/filter zaten kopya uretir: kaynak dizi ASLA degistirilmez.
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
    /* SABIT MODDA RASTGELE SECICI CAGRILMAZ (§8, §42).
       Kayitli id yoksa ya da kayit defterinden silinmisse VARSAYILAN kullanilir:
       havuzun ilk gecerli ogesi. Deterministiktir - ayni depo hep ayni sonucu
       verir - ve durum onarilir (§31, §35). Burada rastgele secmek, "sabit"
       sozunu bozup her acilista farkli arka plan gosterebilirdi. */
    const fallback = pool[0] || null;
    if (fallback) writeLocal(WALLPAPER_KEYS.fixed, fallback);
    return fallback;
  }

  /* RASTGELE MOD: secim HER GERCEK DOCUMENT YUKLEMESINDE yenilenir.
     Bu document icin zaten cozulduyse ayni deger doner; boylece SPA gezinme,
     overlay acilisi ve yeniden render yeni secim URETMEZ (§10, §21, §29).
     Eski surumun sessionStorage'i burada BILINCLI olarak okunmaz - okusaydi
     yenileme sonrasi ayni gorsel geri gelirdi (§2, §20). */
  purgeLegacySessionKey();
  if (runtimeWallpaperId && pool.includes(runtimeWallpaperId)) return runtimeWallpaperId;

  // Ardisik tekrari onle: bir onceki yuklemenin gorseli adaylardan cikarilir.
  const chosen = chooseRandomWallpaper(pool, getPreviousWallpaperId(), random);
  if (chosen) {
    runtimeWallpaperId = chosen;
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
  runtimeWallpaperId = id;
  emit("select");
  return getWallpaperState();
}

export function setWallpaperMode(mode, ids = []) {
  const next = normalizeWallpaperMode(mode);
  writeLocal(WALLPAPER_KEYS.mode, next);
  if (next === "random-session") {
    purgeLegacySessionKey();
    // Moda gecince kullanici sonucu ANINDA gorur; secim yalnizca bellekte.
    const chosen = chooseRandomWallpaper(ids, runtimeWallpaperId || getPreviousWallpaperId());
    if (chosen) {
      runtimeWallpaperId = chosen;
      writeLocal(WALLPAPER_KEYS.previous, chosen);
    }
  } else {
    // Sabit moda donuldugunde su an gorunen gorsel sabitlenir.
    const current = runtimeWallpaperId || getFixedWallpaperId();
    if (current) {
      writeLocal(WALLPAPER_KEYS.fixed, current);
      runtimeWallpaperId = current;
    }
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
  const chosen = chooseRandomWallpaper(ids, current, random);
  if (!chosen) return getWallpaperState();
  runtimeWallpaperId = chosen;
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
