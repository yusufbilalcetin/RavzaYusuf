import { ANA_SAYFA_GORSELLERI } from "../../data/ana-sayfa-gorselleri.js";
import { resolveWallpaperId } from "../core/wallpaper.js";

export const HOME_HERO_STORAGE_KEY = "ravzaYusufLastHomeHero";
export const HOME_HERO_SELECTION_KEY = "__RAVZA_YUSUF_HOME_HERO__";

function getDefaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function validThemes(themes) {
  if (!Array.isArray(themes)) return [];
  return themes.filter((theme) => (
    theme
    && typeof theme.id === "string"
    && typeof theme.alt === "string"
    && typeof theme.placeholder === "string"
    && typeof theme.desktop?.fallback === "string"
    && typeof theme.desktop?.webpSrcSet === "string"
    && typeof theme.mobile?.fallback === "string"
    && typeof theme.mobile?.webpSrcSet === "string"
  ));
}

function readQueue(storage) {
  try {
    const raw = storage?.getItem(HOME_HERO_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(storage, queue) {
  try {
    storage?.setItem(HOME_HERO_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Depolama kapalı olsa da görsel seçimi çalışmaya devam eder.
  }
}

function shuffle(array, random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const randomValue = Number(random());
    const normalizedRandom = Number.isFinite(randomValue)
      ? Math.min(Math.max(randomValue, 0), .999999999)
      : 0;
    const j = Math.floor(normalizedRandom * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function rastgeleTemaSec(themes, options = {}) {
  const pool = validThemes(themes);
  if (!pool.length) return null;

  const storage = Object.prototype.hasOwnProperty.call(options, "storage")
    ? options.storage
    : getDefaultStorage();
  const random = typeof options.random === "function" ? options.random : Math.random;
  const poolIds = pool.map((theme) => theme.id);

  let queue = readQueue(storage).filter((id) => poolIds.includes(id));
  if (!queue.length) queue = shuffle(poolIds, random);

  const [selectedId, ...remainingQueue] = queue;
  saveQueue(storage, remainingQueue);
  return pool.find((theme) => theme.id === selectedId) || pool[0];
}

function setSource(source, srcset) {
  if (srcset) source.setAttribute("srcset", srcset);
  else source.removeAttribute("srcset");
}

function cssUrl(url) {
  const absoluteUrl = new URL(url, document.baseURI).href;
  return `url("${absoluteUrl.replaceAll('"', '\\"')}")`;
}

export function getOrSelectHomeHero(themes = ANA_SAYFA_GORSELLERI) {
  const pool = validThemes(themes);
  if (!pool.length) return null;

  /* Arka plan durumu (sabit / oturumluk rastgele) once sorulur.
     resolveWallpaperId rastgele secimi YALNIZCA oturumda henuz secim yoksa
     yapar, yani gezinme ve yeniden render arka plani degistirmez. */
  const resolvedId = resolveWallpaperId(pool.map((theme) => theme.id));
  const resolved = pool.find((theme) => theme.id === resolvedId);
  if (resolved) {
    globalThis[HOME_HERO_SELECTION_KEY] = resolved;
    return resolved;
  }

  const earlySelection = globalThis[HOME_HERO_SELECTION_KEY];
  const selectedFromBootstrap = pool.find((theme) => theme.id === earlySelection?.id);
  if (selectedFromBootstrap) return selectedFromBootstrap;

  const selected = rastgeleTemaSec(pool);
  if (selected) globalThis[HOME_HERO_SELECTION_KEY] = selected;
  return selected;
}

/**
 * Gorseli yalnizca YUKLER; hicbir durum yazmaz, sahneye dokunmaz.
 *
 * Cagiran taraf once bunu bekler, sonra secimi kalici hale getirir. Boylece
 * bozuk bir gorsel kimligi asla aktif duruma yazilmaz (§29).
 * Ayni <img> onbellegini kullandigi icin sonrasindaki applyHomeHero anindadir.
 */
export function preloadHomeHero(theme) {
  if (!theme?.desktop?.fallback) return Promise.resolve(false);
  return new Promise((resolveLoad) => {
    const image = new Image();
    image.onload = () => resolveLoad(true);
    image.onerror = () => resolveLoad(false);
    image.src = theme.desktop.fallback;
    if (image.complete) resolveLoad(Boolean(image.naturalWidth));
  });
}

/**
 * Secili arka plani sahneye uygular.
 *
 * Disa aciliyor cunku Arka Plan paneli de ayni yolu kullanmali - ikinci bir
 * uygulama yolu yazmak, iki farkli gorsel durumuna yol acardi.
 * Gorsel ONCE preload edilir; hazir olmadan degistirilmez, boylece
 * beyaz/siyah flash olusmaz (§13).
 */
export function applyHomeHero(theme) {
  if (!theme) return false;
  const stage = document.getElementById("anaSayfaHeroStage");
  const heroImage = document.getElementById("anaSayfaHeroImage");
  if (!stage || !heroImage) return false;

  const paint = () => {
    stage.dataset.homeHeroTheme = theme.id;
    stage.classList.remove("is-home-hero-error");
    stage.style.setProperty("--home-hero-placeholder", cssUrl(theme.placeholder));
    stage.style.setProperty("--home-hero-desktop-position", theme.desktopPosition || "center center");
    stage.style.setProperty("--home-hero-mobile-position", theme.mobilePosition || "center center");
    heroImage.alt = theme.alt;
    setSource(document.getElementById("anaSayfaHeroMobileAvif"), theme.mobile.avifSrcSet);
    setSource(document.getElementById("anaSayfaHeroMobileWebp"), theme.mobile.webpSrcSet);
    setSource(document.getElementById("anaSayfaHeroDesktopAvif"), theme.desktop.avifSrcSet);
    setSource(document.getElementById("anaSayfaHeroDesktopWebp"), theme.desktop.webpSrcSet);
    heroImage.src = theme.desktop.fallback;
    stage.classList.add("is-home-hero-loaded");
    globalThis[HOME_HERO_SELECTION_KEY] = theme;
  };

  const preload = new Image();
  preload.onload = paint;
  // Yuklenemezse eski gorsel ekranda kalir; kirik goruntu gosterilmez.
  preload.onerror = () => {};
  preload.src = theme.desktop.fallback;
  if (preload.complete && preload.naturalWidth) paint();
  return true;
}

export function initAnaSayfaRastgeleGorsel(themes = ANA_SAYFA_GORSELLERI) {
  globalThis.__RAVZA_YUSUF_HOME_HERO_INIT_AT__ = performance.now();
  const stage = document.getElementById("anaSayfaHeroStage");
  const mobileAvif = document.getElementById("anaSayfaHeroMobileAvif");
  const mobileWebp = document.getElementById("anaSayfaHeroMobileWebp");
  const desktopAvif = document.getElementById("anaSayfaHeroDesktopAvif");
  const desktopWebp = document.getElementById("anaSayfaHeroDesktopWebp");
  const heroImage = document.getElementById("anaSayfaHeroImage");
  if (!stage || !mobileAvif || !mobileWebp || !desktopAvif || !desktopWebp || !heroImage) return null;

  const pool = validThemes(themes);
  if (!pool.length) {
    stage.classList.add("is-home-hero-error");
    return null;
  }

  if (stage.dataset.homeHeroReady === "true") {
    return pool.find((theme) => theme.id === stage.dataset.homeHeroTheme) || null;
  }

  stage.dataset.homeHeroReady = "true";
  let selectedTheme = getOrSelectHomeHero(pool);
  let fallbackAttempted = false;

  function markLoaded() {
    if (!heroImage.naturalWidth) return;
    stage.classList.add("is-home-hero-loaded");
    stage.dataset.homeHeroLoadedAt = String(performance.now());
  }

  function applyTheme(theme) {
    selectedTheme = theme;
    globalThis[HOME_HERO_SELECTION_KEY] = theme;
    stage.dataset.homeHeroTheme = theme.id;
    stage.classList.remove("is-home-hero-error", "is-home-hero-loaded");
    stage.style.setProperty("--home-hero-placeholder", cssUrl(theme.placeholder));
    stage.style.setProperty("--home-hero-desktop-position", theme.desktopPosition || "center center");
    stage.style.setProperty("--home-hero-mobile-position", theme.mobilePosition || "center center");
    heroImage.alt = theme.alt;

    setSource(mobileAvif, theme.mobile.avifSrcSet);
    setSource(mobileWebp, theme.mobile.webpSrcSet);
    setSource(desktopAvif, theme.desktop.avifSrcSet);
    setSource(desktopWebp, theme.desktop.webpSrcSet);

    // Kaynaklar hazırlandıktan sonra fallback src en son atanır.
    heroImage.src = theme.desktop.fallback;
    if (heroImage.complete) requestAnimationFrame(markLoaded);
  }

  heroImage.addEventListener("load", markLoaded);
  heroImage.addEventListener("error", () => {
    const fallbackPool = pool.filter((theme) => theme.id !== selectedTheme?.id);
    if (!fallbackAttempted && fallbackPool.length) {
      fallbackAttempted = true;
      const fallback = rastgeleTemaSec(fallbackPool);
      if (fallback) {
        applyTheme(fallback);
        return;
      }
    }

    stage.classList.add("is-home-hero-error");
    [mobileAvif, mobileWebp, desktopAvif, desktopWebp].forEach((source) => source.removeAttribute("srcset"));
    heroImage.removeAttribute("src");
    heroImage.alt = "";
    console.warn("Ana sayfa hero görseli yüklenemedi.");
  });

  if (selectedTheme) applyTheme(selectedTheme);
  else stage.classList.add("is-home-hero-error");
  return selectedTheme;
}
