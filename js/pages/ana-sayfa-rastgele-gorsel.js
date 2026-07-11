import { ANA_SAYFA_GORSELLERI } from "../../data/ana-sayfa-gorselleri.js";

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

function readLastTheme(storage) {
  try {
    return storage?.getItem(HOME_HERO_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function saveLastTheme(storage, themeId) {
  try {
    storage?.setItem(HOME_HERO_STORAGE_KEY, themeId);
  } catch {
    // Depolama kapalı olsa da görsel seçimi çalışmaya devam eder.
  }
}

export function rastgeleTemaSec(themes, options = {}) {
  const pool = validThemes(themes);
  if (!pool.length) return null;

  const storage = Object.prototype.hasOwnProperty.call(options, "storage")
    ? options.storage
    : getDefaultStorage();
  const random = typeof options.random === "function" ? options.random : Math.random;
  const lastThemeId = options.excludeId || readLastTheme(storage);
  const candidates = pool.length > 1
    ? pool.filter((theme) => theme.id !== lastThemeId)
    : pool;
  const safeCandidates = candidates.length ? candidates : pool;
  const randomValue = Number(random());
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), .999999999)
    : 0;
  const selected = safeCandidates[Math.floor(normalizedRandom * safeCandidates.length)] || pool[0];

  saveLastTheme(storage, selected.id);
  return selected;
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

  const earlySelection = globalThis[HOME_HERO_SELECTION_KEY];
  const selectedFromBootstrap = pool.find((theme) => theme.id === earlySelection?.id);
  if (selectedFromBootstrap) return selectedFromBootstrap;

  const selected = rastgeleTemaSec(pool);
  if (selected) globalThis[HOME_HERO_SELECTION_KEY] = selected;
  return selected;
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
      const fallback = rastgeleTemaSec(fallbackPool, { excludeId: selectedTheme?.id });
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
