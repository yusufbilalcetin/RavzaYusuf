// Gizli kilit butonu: başlığa 650 ms içinde üç kez dokunulana kadar DOM'da hiç bulunmaz.
//
// Bu YALNIZCA bir arayüz kolaylığıdır — güvenlik önlemi DEĞİLDİR. Butonu elle DOM'a ekleyen
// biri de PIN modalını açabilir. İstemci taraflı PIN ve public görseller gerçek erişim sınırı değildir.
//
// Gizleme CSS opaklığıyla değil, düğümü kaldırarak yapılır: gizliyken sekmeyle odaklanılamaz
// ve ekran okuyucu görmez.

const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS = [
  { className: "icon icon-locked", shapes: [["path", { d: "M8 10V7.5a4 4 0 0 1 8 0V10" }], ["rect", { x: 5, y: 10, width: 14, height: 10, rx: 2.5 }]] },
  { className: "icon icon-unlocked", shapes: [["path", { d: "M8 10V7.5a4 4 0 0 1 7.7-1.5" }], ["rect", { x: 5, y: 10, width: 14, height: 10, rx: 2.5 }]] }
];

function buildIcon(doc, { className, shapes }) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attributes] of shapes) {
    const shape = doc.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
    svg.append(shape);
  }
  return svg;
}

/**
 * @param title      Üç kez dokunulacak gizli tetikleyici (başlık).
 * @param host       Butonun ekleneceği kap (üst bar).
 * @param onActivate Butona tıklanınca çalışır (mevcut PIN akışı).
 */
export function createLockReveal({
  title,
  host,
  onActivate,
  tripleTapMs = 650,
  visibleMs = 10000,
  doc = globalThis.document,
  timers = globalThis,
  now = () => Date.now()
}) {
  let button = null;
  let hideTimer = 0;
  let firstTap = 0;
  let tapCount = 0;
  let open = false; // kilidin açık olup olmadığı — ikon ve aria bundan türetilir

  function clearHideTimer() {
    if (!hideTimer) return;
    timers.clearTimeout(hideTimer);
    hideTimer = 0;
  }

  function hide() {
    clearHideTimer();
    if (!button) return;
    button.remove();
    button = null;
  }

  function applyState() {
    if (!button) return;
    button.classList.toggle("is-open", open);
    button.setAttribute("aria-pressed", String(open));
    button.setAttribute("aria-label", open ? "Özel alanı kilitle" : "Özel alanı aç");
  }

  function show() {
    if (!button) {
      button = doc.createElement("button");
      button.className = "lock-button";
      button.id = "lockButton";
      button.type = "button";
      button.append(...ICONS.map((icon) => buildIcon(doc, icon)));
      button.addEventListener("click", handleActivate);
      applyState();
      host.append(button);
      // Sınıf bir sonraki karede eklenir ki geçiş (scale + opacity) gerçekten oynasın.
      const paint = timers.requestAnimationFrame || ((callback) => timers.setTimeout(callback, 0));
      paint(() => button?.classList.add("is-revealed"));
    }
    clearHideTimer();
    hideTimer = timers.setTimeout(hide, visibleMs);
  }

  function handleActivate() {
    clearHideTimer(); // modal açıkken buton kendiliğinden kaybolmasın
    onActivate();
  }

  function handleTap() {
    const stamp = now();
    if (!tapCount || stamp - firstTap > tripleTapMs) {
      firstTap = stamp;
      tapCount = 1;
      return;
    }
    tapCount += 1;
    if (tapCount < 3) return;
    firstTap = 0;
    tapCount = 0;
    show();
  }

  title.addEventListener("pointerdown", handleTap);

  return {
    show,
    hide,
    isVisible: () => Boolean(button),
    getButton: () => button,
    /** Kilit durumu değişti: ikon/aria güncellenir (buton görünür değilse bir sonraki gösterimde uygulanır). */
    setOpen(value) {
      open = Boolean(value);
      applyState();
    },
    destroy() {
      title.removeEventListener("pointerdown", handleTap);
      hide();
      firstTap = 0;
      tapCount = 0;
    }
  };
}
