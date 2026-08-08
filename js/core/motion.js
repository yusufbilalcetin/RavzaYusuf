const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");

// base/degiskenler.css'teki --ease-emphasis ile ayni egri. Web Animations API
// custom property cozemedigi icin deger burada birebir tekrarlanir.
const EASE_EMPHASIS = "cubic-bezier(.22, 1, .36, 1)";
// iOS uygulama acilis gecisi ~350ms; 420ms olcusunde bir gecikme "web" gibi
// hissettiriyordu. Sayfa solmasi (280ms, tipografi.css) ile birlikte
// tasarim dilinin 180-350ms araligina oturur.
const MORPH_DURATION = 340;

// Acilirken sayfa ikonun bulundugu noktadan buyur, kapanirken ana ekran ayni
// noktanin etrafinda hafifce genisleyerek yerine oturur - yon boylece
// hissedilir. Degerler gercek ikon oraninda degil: ikon boyutuna kadar
// kuculmek sayfa icerigini okunamayacak kadar eziyor.
const OPEN_FROM_SCALE = 0.42;
const CLOSE_FROM_SCALE = 1.12;

export function prefersReducedMotion() {
  return reducedMotionQuery.matches;
}

/**
 * Sayfayi, verilen ikonun merkezinden buyuterek (kapanista o merkeze dogru
 * toplayarak) canlandirir. transform-origin ikona sabitlendigi icin hareket
 * "bu ikondan geldi" bilgisini tasir.
 *
 * Yalnizca transform ve opacity animasyonlanir; ikisi de compositor'da calisir
 * ve layout tetiklemez. Az hareket tercihinde hicbir sey yapilmaz.
 *
 * @param {Element | null} pageElement Animasyonu alacak sayfa govdesi.
 * @param {DOMRect | null} iconRect Kaynak ikonun ekrandaki dikdortgeni.
 * @param {"open" | "close"} direction
 */
export function morphPageFromIcon(pageElement, iconRect, direction = "open") {
  if (!pageElement || !iconRect || !iconRect.width) return;
  if (prefersReducedMotion() || typeof pageElement.animate !== "function") return;

  const pageRect = pageElement.getBoundingClientRect();
  if (!pageRect.width || !pageRect.height) return;

  const originX = iconRect.left + iconRect.width / 2 - pageRect.left;
  const originY = iconRect.top + iconRect.height / 2 - pageRect.top;
  const fromScale = direction === "close" ? CLOSE_FROM_SCALE : OPEN_FROM_SCALE;

  pageElement.style.transformOrigin = `${originX}px ${originY}px`;

  const animation = pageElement.animate(
    [
      { transform: `scale(${fromScale})`, opacity: 0 },
      { transform: "scale(1)", opacity: 1 }
    ],
    { duration: MORPH_DURATION, easing: EASE_EMPHASIS }
  );

  const restore = () => { pageElement.style.transformOrigin = ""; };
  animation.finished.then(restore, restore);
}
