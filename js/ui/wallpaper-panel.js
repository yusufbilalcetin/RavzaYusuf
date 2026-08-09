/**
 * ARKA PLAN PANELI - gorsel odakli, Apple tarzi sade secici.
 *
 * Yeni bir popup ya da arka plan sistemi YAZILMAZ:
 *   - panel native <dialog> + `.ui-sheet` (centered-dialogs.css geometriyi verir)
 *   - kayit defteri  data/ana-sayfa-gorselleri.js  (TAMAMEN LOCAL)
 *   - durum          js/core/wallpaper.js (tek kanonik kaynak)
 *   - uygulama       ana-sayfa-rastgele-gorsel.js -> applyHomeHero()
 *
 * MOD SECIMI GALERININ ICINDEDIR. Ustte ayri bir Sabit/Rastgele kontrolu YOK:
 *   - galerinin ILK karti "Rastgele" -> mod secimidir, bir gorsel degildir
 *   - gercek bir gorsele tiklamak -> mod SABIT olur (ikinci onay istenmez)
 *
 * Kucuk resimler `mobile.fallback` kullanir (masaustu gorseli degil) ve
 * `loading="lazy"` tasir: 12 gorselin tamami tam cozunurlukte yuklenmez.
 */
import { claimOverlay, registerOverlay, releaseOverlay } from "../core/overlay-manager.js";
import {
  getWallpaperState,
  selectWallpaper,
  setWallpaperMode,
  pinCurrentWallpaper,
  randomizeWallpaper,
} from "../core/wallpaper.js";
import { ANA_SAYFA_GORSELLERI } from "../../data/ana-sayfa-gorselleri.js";
import { validThemes, applyHomeHero, preloadHomeHero } from "../pages/ana-sayfa-rastgele-gorsel.js";

const DIALOG_ID = "wallpaper-panel";
export const WALLPAPER_OVERLAY_ID = "wallpaper-panel";

/** Bozuk gorsel denemesi SINIRLI: sonsuz retry yok (§30). */
const MAX_PRELOAD_ATTEMPTS = 3;

const ICON = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  close: ICON('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: ICON('<path d="m5 13 4 4 10-10"/>'),
  shuffle: ICON('<path d="M3 7h4l10 10h4M17 3l4 4-4 4M3 17h4l3-3M14 10l3-3"/>'),
  pin: ICON('<path d="M12 17v4"/><path d="M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6Z"/>'),
};

let opener = null;

function pool() {
  return validThemes(ANA_SAYFA_GORSELLERI);
}

function isOpen() {
  return document.getElementById(DIALOG_ID)?.open === true;
}

function themeById(id) {
  return pool().find((theme) => theme.id === id) || null;
}

function currentTheme() {
  const state = getWallpaperState();
  return themeById(state.currentId) || pool()[0] || null;
}

/** Kutucuk ve panel icin KISA mod karsiligi (§22 - uzun ifade tekrar edilmez). */
const MODE_LABELS = Object.freeze({ fixed: "Sabit", "random-session": "Rastgele" });

export function wallpaperModeLabel() {
  return MODE_LABELS[getWallpaperState().mode] || MODE_LABELS.fixed;
}

/** Kontrol Merkezi karti ayni kisa etiketi kullanir - ikinci durum kaynagi yok. */
export const wallpaperModeShortLabel = wallpaperModeLabel;

function galleryMarkup(state) {
  const isRandom = state.mode === "random-session";
  // ILK KART = MOD. Bir gorsel dosyasi degildir, bu yuzden <img> tasimaz.
  const randomTile = `
    <button class="wp-thumb wp-thumb--random${isRandom ? " is-selected" : ""}" type="button"
            data-wp-random aria-pressed="${isRandom}">
      <span class="wp-thumb-frame">
        <span class="wp-thumb-shuffle" aria-hidden="true">${ICONS.shuffle}</span>
        <span class="wp-thumb-check" aria-hidden="true">${ICONS.check}</span>
      </span>
      <span class="wp-thumb-name">Rastgele</span>
    </button>`;

  const tiles = pool().map((theme) => {
    // Secili = SABIT moddaki gercek secim. Rastgele modda hicbir gorsel
    // "secili" degildir; o an gosterilen gorsel yalnizca ISARETLENIR (§20).
    const selected = state.mode === "fixed" && theme.id === state.currentId;
    const showing = state.mode !== "fixed" && theme.id === state.currentId;
    return `
      <button class="wp-thumb${selected ? " is-selected" : ""}${showing ? " is-showing" : ""}" type="button"
              data-wp-select="${theme.id}" aria-pressed="${selected}">
        <span class="wp-thumb-frame">
          <img src="${theme.mobile.fallback}" alt="" loading="lazy" decoding="async" />
          <span class="wp-thumb-check" aria-hidden="true">${ICONS.check}</span>
          ${showing ? '<span class="wp-thumb-now">şu an</span>' : ""}
        </span>
        <span class="wp-thumb-name">${theme.name}</span>
      </button>`;
  }).join("");

  return randomTile + tiles;
}

function markup() {
  const state = getWallpaperState();
  const current = currentTheme();
  const isRandom = state.mode === "random-session";
  return `
    <div class="wp-panel ui-sheet-panel glass-surface glass-surface--overlay">
      <header class="wp-head">
        <h2 id="wp-title">Arka Plan</h2>
        <button class="wp-close" type="button" data-wp-close aria-label="Kapat">${ICONS.close}</button>
      </header>

      <div class="wp-body">
        <section class="wp-group">
          <h3 class="wp-group-title">Mevcut Arka Plan</h3>
          <div class="wp-preview">
            ${current ? `<img id="wp-preview-image" src="${current.mobile.fallback}" alt="${current.alt}" />` : ""}
          </div>
          <p class="wp-preview-meta">
            <span class="wp-preview-name" id="wp-current-name">${current ? current.name : "—"}</span>
            <span class="wp-preview-mode" id="wp-current-mode" hidden>${MODE_LABELS["random-session"]}</span>
          </p>
          <!-- "Sabitle" YALNIZCA rastgele modda anlamlidir; sabit modda
               gosterilmez, boylece olu bir dugme kalmaz (§18). -->
          <div class="wp-actions" id="wp-actions"${isRandom ? "" : " hidden"}>
            <button class="wp-action" type="button" data-wp-pin>${ICONS.pin}<span>Sabitle</span></button>
          </div>
        </section>

        <section class="wp-group">
          <h3 class="wp-group-title" id="wp-gallery-title">Arka Planlar</h3>
          <div class="wp-gallery" id="wp-gallery" role="group" aria-labelledby="wp-gallery-title">
            ${galleryMarkup(state)}
          </div>
        </section>
      </div>
    </div>`;
}

/** Panel ve arka plan, GERCEK duruma gore tazelenir. */
function sync({ apply = true } = {}) {
  const node = document.getElementById(DIALOG_ID);
  const state = getWallpaperState();
  const current = currentTheme();
  if (apply && current) applyHomeHero(current);
  if (!node) return;

  const gallery = node.querySelector("#wp-gallery");
  if (gallery) gallery.innerHTML = galleryMarkup(state);

  const preview = node.querySelector("#wp-preview-image");
  if (preview && current) {
    preview.src = current.mobile.fallback;
    preview.alt = current.alt;
  }
  const name = node.querySelector("#wp-current-name");
  if (name) name.textContent = current ? current.name : "—";

  // Mod rozeti ve Sabitle YALNIZCA rastgele modda gorunur.
  const isRandom = state.mode === "random-session";
  const mode = node.querySelector("#wp-current-mode");
  if (mode) mode.hidden = !isRandom;
  const actions = node.querySelector("#wp-actions");
  if (actions) actions.hidden = !isRandom;
}

/**
 * Gorseli ONCE dogrular, sonra durumu yazar (§29).
 *
 * Bozuk bir gorsel hicbir zaman aktif duruma yazilmaz; yuklenemezse ekrandaki
 * arka plan oldugu gibi kalir. Beyaz/siyah/kirik flash olusmaz.
 */
async function commitSelection(id) {
  const theme = themeById(id);
  if (!theme) return false;
  const ok = await preloadHomeHero(theme);
  if (!ok) return false;
  selectWallpaper(id);
  sync();
  return true;
}

/**
 * Rastgele moda gecer ve bu oturumun gorselini SECER.
 *
 * Aday yuklenemezse SINIRLI sayida baska aday denenir; hicbiri olmazsa mod
 * yine de rastgele kalir ve ekrandaki gorsel korunur - kor retry dongusu yok.
 */
async function commitRandomMode() {
  const ids = pool().map((theme) => theme.id);
  setWallpaperMode("random-session", ids);

  for (let attempt = 0; attempt < MAX_PRELOAD_ATTEMPTS; attempt += 1) {
    const theme = themeById(getWallpaperState().currentId);
    if (theme && (await preloadHomeHero(theme))) {
      sync();
      return true;
    }
    // Modu DEGISTIRMEDEN bu oturum icin baska bir aday sec.
    randomizeWallpaper(ids);
  }
  sync({ apply: false });
  return false;
}

function handleClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  if (target.closest("[data-wp-close]")) { closeWallpaperPanel(); return; }

  // Galerinin ilk karti: MOD secimi.
  if (target.closest("[data-wp-random]")) { void commitRandomMode(); return; }

  // Gercek bir gorsel: manuel secim = SABIT mod, ikinci onay yok (§5).
  const pick = target.closest("[data-wp-select]");
  if (pick) { void commitSelection(pick.dataset.wpSelect); return; }

  if (target.closest("[data-wp-pin]")) { pinCurrentWallpaper(); sync({ apply: false }); }
}

function ensureDialog() {
  const existing = document.getElementById(DIALOG_ID);
  if (existing) return existing;
  const node = document.createElement("dialog");
  node.id = DIALOG_ID;
  node.className = "ui-sheet ui-dialog--large wallpaper-panel";
  node.setAttribute("aria-labelledby", "wp-title");
  node.innerHTML = markup();
  document.body.appendChild(node);
  node.addEventListener("close", () => releaseOverlay(WALLPAPER_OVERLAY_ID));
  node.addEventListener("cancel", (event) => { event.preventDefault(); closeWallpaperPanel(); });
  node.addEventListener("click", (event) => { if (event.target === node) closeWallpaperPanel(); });
  node.addEventListener("click", handleClick);
  return node;
}

export function openWallpaperPanel(trigger = document.activeElement) {
  const node = ensureDialog();
  if (node.open) return true;
  claimOverlay(WALLPAPER_OVERLAY_ID);
  opener = trigger instanceof HTMLElement ? trigger : null;
  // Panel her acilista gercek durumdan yeniden cizilir.
  node.innerHTML = markup();
  try { node.showModal(); } catch (_) { return false; }
  sync({ apply: false });
  return true;
}

export function closeWallpaperPanel({ restoreFocus = true } = {}) {
  const node = document.getElementById(DIALOG_ID);
  if (!node?.open) return false;
  try { node.close(); } catch (_) {}
  if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
  return true;
}

export function initWallpaperPanel() {
  registerOverlay({
    id: WALLPAPER_OVERLAY_ID,
    isOpen,
    close: ({ replacing }) => closeWallpaperPanel({ restoreFocus: !replacing }),
  });
  Object.assign(globalThis, { openWallpaperPanel, closeWallpaperPanel });
}
