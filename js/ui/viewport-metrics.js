/**
 * Görünür görüntü alanı ölçüleri -> CSS değişkenleri.
 *
 * NEDEN VAR: Ortalanmış bir diyalog "ekranın ortasında" değil, KULLANICININ
 * GÖREBİLDİĞİ alanın ortasında durmalıdır. Sanal klavye açıldığında layout
 * viewport (100dvh dâhil) çoğu mobil tarayıcıda DEĞİŞMEZ; yalnızca visual
 * viewport küçülür. Yani sadece CSS ile ortalanan bir arama popup'ı klavyenin
 * arkasında kalır.
 *
 * Bu modül :root üzerine iki değişken yazar:
 *   --visual-viewport-height  görünür yükseklik
 *   --visual-viewport-top     görünür alanın üstünün sayfa üstüne uzaklığı
 *
 * CSS bunları kullanır; VisualViewport desteklenmiyorsa değişkenler hiç
 * yazılmaz ve CSS'teki fallback (100dvh / 0px) devreye girer.
 *
 * Yazma maliyeti: resize/scroll olayları rAF ile birleştirilir ve değer
 * gerçekten değiştiyse DOM'a dokunulur - aksi hâlde klavye animasyonu boyunca
 * her karede style yazımı olur.
 */

let started = false;
let frame = 0;
let lastHeight = -1;
let lastTop = -1;

function apply() {
  frame = 0;
  const viewport = window.visualViewport;
  if (!viewport) return;

  // offsetTop: görünür alanın layout viewport içindeki kayması (klavye veya
  // sayfa yakınlaştırma sırasında sıfırdan farklı olur).
  const height = Math.round(viewport.height);
  const top = Math.round(viewport.offsetTop);
  if (height === lastHeight && top === lastTop) return;
  lastHeight = height;
  lastTop = top;

  const style = document.documentElement.style;
  style.setProperty("--visual-viewport-height", `${height}px`);
  style.setProperty("--visual-viewport-top", `${top}px`);
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(apply);
}

/** Bir kez çağrılır; tekrar çağrılması zararsızdır. */
export function initViewportMetrics() {
  if (started) return;
  const viewport = globalThis.visualViewport;
  if (!viewport) return;
  started = true;
  viewport.addEventListener("resize", schedule, { passive: true });
  viewport.addEventListener("scroll", schedule, { passive: true });
  apply();
}

export default initViewportMetrics;
