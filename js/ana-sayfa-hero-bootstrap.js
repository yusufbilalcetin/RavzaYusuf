import { ANA_SAYFA_GORSELLERI } from "../data/ana-sayfa-gorselleri.js";
import {
  HOME_HERO_SELECTION_KEY,
  getOrSelectHomeHero
} from "./pages/ana-sayfa-rastgele-gorsel.js";

const initialRoute = new URL(location.href).searchParams.get("page");
const shouldBootstrapHomeHero = !initialRoute || initialRoute === "ana-sayfa";

if (shouldBootstrapHomeHero) {

globalThis.__RAVZA_YUSUF_HOME_HERO_METRICS__ = { cls: 0, lcp: 0 };
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) globalThis.__RAVZA_YUSUF_HOME_HERO_METRICS__.cls += entry.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    const lastEntry = list.getEntries().at(-1);
    if (lastEntry) globalThis.__RAVZA_YUSUF_HOME_HERO_METRICS__.lcp = lastEntry.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
} catch {
  // Eski tarayıcılarda performans gözlemi olmadan devam et.
}

const selectedTheme = getOrSelectHomeHero(ANA_SAYFA_GORSELLERI);

if (selectedTheme) {
  globalThis[HOME_HERO_SELECTION_KEY] = selectedTheme;
  globalThis.__RAVZA_YUSUF_HOME_HERO_BOOTSTRAP_AT__ = performance.now();

  const isMobile = matchMedia("(max-width: 768px)").matches;
  const variant = isMobile ? selectedTheme.mobile : selectedTheme.desktop;
  const sizes = isMobile
    ? "calc(100vw - 20px)"
    : "(max-width: 1600px) calc(100vw - 72px), 1536px";
  const preloadSrcSet = variant.avifSrcSet || variant.webpSrcSet;

  const placeholderPreload = document.createElement("link");
  placeholderPreload.rel = "preload";
  placeholderPreload.as = "image";
  placeholderPreload.href = selectedTheme.placeholder;
  document.head.append(placeholderPreload);

  const heroPreload = document.createElement("link");
  heroPreload.rel = "preload";
  heroPreload.as = "image";
  heroPreload.type = variant.avifSrcSet ? "image/avif" : "image/webp";
  heroPreload.setAttribute("imagesrcset", preloadSrcSet);
  heroPreload.setAttribute("imagesizes", sizes);
  heroPreload.setAttribute("fetchpriority", "high");
  document.head.append(heroPreload);
}
}
