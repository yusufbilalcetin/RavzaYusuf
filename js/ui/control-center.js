/**
 * KONTROL MERKEZI - sistem hizli kontrol paneli.
 *
 * MIMARI KARARLAR:
 *
 * 1. Native <dialog> + showModal(). Ikinci bir popup sistemi YAZILMAZ; panel
 *    `.ui-sheet` sinifini kullanir, yani konum/genislik/VisualViewport
 *    davranisi components/centered-dialogs.css'ten gelir. Odak tuzagi, Escape
 *    ve ::backdrop tarayicidan gelir, top layer sayesinde z-index yarisi yok.
 *
 * 2. Durum PAYLASILIR. Tema theme.js'in (eul_theme / eul_theme_style), cam ve
 *    hareket appearance.js'in kanonik anahtarlarindadir. Kontrol Merkezi'ne
 *    ozel HICBIR localStorage anahtari acilmaz; panel her acilista ve her
 *    degisim olayinda gercek durumdan yeniden cizilir. Ayarlar'da yapilan
 *    degisiklik burada, burada yapilan Ayarlar'da gorunur.
 *
 * 3. Yalnizca GERCEK kontroller. Web uygulamasinin denetleyemedigi hicbir sey
 *    (Wi-Fi, Bluetooth, parlaklik) yok. Haptics bilincli olarak kaldirilmisti,
 *    geri getirilmedi. Spotlight henuz yok, olu dugme konmadi.
 */
import { claimOverlay, registerOverlay, releaseOverlay } from "../core/overlay-manager.js";
import { openThemeSheet } from "../core/theme.js";

const DIALOG_ID = "control-center";
export const CONTROL_CENTER_OVERLAY_ID = "control-center";

const ICON = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  sliders: ICON('<path d="M4 7h10M18 7h2M4 17h6M14 17h6"/><circle cx="16" cy="7" r="2"/><circle cx="12" cy="17" r="2"/>'),
  wallpaper: ICON('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/>'),
  books: ICON('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z"/>'),
  memory: ICON('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M8 9.5h8M8 13h5"/>'),
  exam: ICON('<path d="M6 3.5h9L19 8v12.5H6Z"/><path d="M14 3.5V8h5"/><path d="M9 13h6M9 16.5h4"/>'),
  games: ICON('<rect x="2.5" y="7" width="19" height="10" rx="4"/><path d="M7 10.5v3M5.5 12h3"/><circle cx="16" cy="11" r="1"/><circle cx="18.5" cy="13.5" r="1"/>'),
  close: ICON('<path d="M6 6l12 12M18 6 6 18"/>'),
};

/** Hizli uygulamalar: rota adlari GERCEK router rotalaridir. */
const QUICK_APPS = Object.freeze([
  { route: "ravza-books", label: "Ravza Books", icon: "books" },
  { route: "ezber-merkezi", label: "Ezber Merkezi", icon: "memory" },
  { route: "sinav-merkezi", label: "Sınav Merkezi", icon: "exam" },
  { route: "oyun", label: "Oyun Alanı", icon: "games" },
]);

let dialog = null;
let opener = null;

function isOpen() {
  return document.getElementById(DIALOG_ID)?.open === true;
}


function markup() {
  return `
    <div class="cc-panel ui-sheet-panel glass-surface glass-surface--overlay">
      <header class="cc-head">
        <h2 id="cc-title">Kontrol Merkezi</h2>
        <button class="cc-close" type="button" data-cc-close aria-label="Kapat">${ICONS.close}</button>
      </header>

      <div class="cc-body">
        <section class="cc-group">
          <h3 class="cc-group-title" id="cc-system-title">Sistem</h3>
          <div class="cc-tiles cc-tiles--wide" role="group" aria-labelledby="cc-system-title">
            <button class="cc-tile" type="button" data-cc-action="wallpaper">
              <span class="cc-tile-icon" aria-hidden="true">${ICONS.wallpaper}</span>
              <span class="cc-tile-label">Duvar Kağıdı ve Tema</span>
            </button>
          </div>
        </section>

        <section class="cc-group">
          <h3 class="cc-group-title" id="cc-apps-title">Hızlı Uygulamalar</h3>
          <div class="cc-tiles" role="group" aria-labelledby="cc-apps-title">
            ${QUICK_APPS.map((app) => `
              <button class="cc-tile" type="button" data-cc-route="${app.route}">
                <span class="cc-tile-icon" aria-hidden="true">${ICONS[app.icon]}</span>
                <span class="cc-tile-label">${app.label}</span>
              </button>`).join("")}
          </div>
        </section>
      </div>
    </div>`;
}

/**
 * Paneli gercek duruma gore tazeler.
 *
 * Tema / Liquid Glass / Hareket kontrolleri Kontrol Merkezi'nden KALDIRILDI
 * (kopyalari Ayarlar'da yasamaya devam ediyor), bu yuzden burada senkronlanacak
 * bir segment kalmadi. Fonksiyon korunuyor cunku arka plan bilgisi ileride
 * buradan tazelenecek.
 */
function syncControls() {
  // Su an tazelenecek dinamik durum yok.
}

function ensureDialog() {
  const existing = document.getElementById(DIALOG_ID);
  if (existing) return existing;
  const node = document.createElement("dialog");
  node.id = DIALOG_ID;
  node.className = "ui-sheet ui-dialog--medium control-center";
  node.setAttribute("aria-labelledby", "cc-title");
  node.innerHTML = markup();
  document.body.appendChild(node);

  // Kapanis hangi yoldan gelirse gelsin koordinator haberdar olsun.
  node.addEventListener("close", () => releaseOverlay(CONTROL_CENTER_OVERLAY_ID));
  node.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeControlCenter();
  });
  // Backdrop tiklamasi: <dialog>'un kendisi backdrop alanidir.
  node.addEventListener("click", (event) => {
    if (event.target === node) closeControlCenter();
  });
  node.addEventListener("click", handleClick);
  dialog = node;
  return node;
}

function handleClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  if (target.closest("[data-cc-close]")) {
    closeControlCenter();
    return;
  }

  if (target.closest('[data-cc-action="wallpaper"]')) {
    // Mevcut tema/duvar kagidi panelini acar. Koordinator sayesinde Kontrol
    // Merkezi kendiliginden kapanir - burada elle kapatmaya gerek yok.
    openThemeSheet(document.getElementById("control-center-open"));
    return;
  }

  const route = target.closest("[data-cc-route]");
  if (route) {
    const destination = route.dataset.ccRoute;
    closeControlCenter({ restoreFocus: false });
    // Gercek router. Navigasyon mantigi burada TEKRARLANMAZ.
    window.navigate?.(destination);
  }
}


export function openControlCenter(trigger = document.activeElement) {
  const node = ensureDialog();
  if (node.open) return true;
  // Baska bir birincil overlay aciksa koordinator kapatir (tek aktif kural).
  claimOverlay(CONTROL_CENTER_OVERLAY_ID);
  opener = trigger instanceof HTMLElement ? trigger : null;
  syncControls();
  try {
    node.showModal();
  } catch (_) {
    return false;
  }
  return true;
}

export function closeControlCenter({ restoreFocus = true } = {}) {
  const node = document.getElementById(DIALOG_ID);
  if (!node?.open) return false;
  try { node.close(); } catch (_) {}
  if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
  return true;
}

export function isControlCenterOpen() {
  return isOpen();
}

export function initControlCenter() {
  registerOverlay({
    id: CONTROL_CENTER_OVERLAY_ID,
    isOpen,
    // Degistirme sirasinda odak yeni panele birakilir.
    close: ({ replacing }) => closeControlCenter({ restoreFocus: !replacing }),
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("#control-center-open")) {
      openControlCenter(document.getElementById("control-center-open"));
    }
  });
  Object.assign(window, { openControlCenter, closeControlCenter, isControlCenterOpen });
}
