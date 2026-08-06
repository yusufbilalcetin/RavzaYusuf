// Bizim Çarkımız — havuz yalnızca couples-config.js'teki 28 pozisyon kodundan kurulur.
// Bu dosya PIN doğrulanmadan yüklenmez (app.js dinamik import eder).
import { createWheel, resetResults, setOptionStatus } from "./model.js";
import {
  TOTAL_OPTIONS,
  allowedCodes,
  filterAllowed,
  isAllowedCode,
  numberOf
} from "./couples-config.js";
import {
  cancelPendingImageRequest,
  clearPrivateImageCache,
  fetchPrivateImage
} from "./private-images.js";

export const STATE_KEY = "ravza-couples-state-v1";

export function defaultCouplesState() {
  return { used: [], history: [], favorites: [] };
}

/** Depodaki her kod config'e göre süzülür: tanımsız numara asla geri dönemez. */
export function loadCouplesState(storage = globalThis.localStorage) {
  let parsed = null;
  try {
    parsed = JSON.parse(storage?.getItem(STATE_KEY) || "null");
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") return defaultCouplesState();
  return {
    used: filterAllowed(parsed.used),
    favorites: filterAllowed(parsed.favorites),
    history: (Array.isArray(parsed.history) ? parsed.history : [])
      .filter((entry) => entry && isAllowedCode(entry.code))
      .map((entry) => ({ code: entry.code, at: entry.at || null, status: entry.status === "passed" ? "passed" : "accepted" }))
  };
}

export function saveCouplesState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STATE_KEY, JSON.stringify({
      used: filterAllowed(state.used),
      favorites: filterAllowed(state.favorites),
      history: state.history.filter((entry) => isAllowedCode(entry.code))
    }));
    return true;
  } catch {
    return false;
  }
}

/** Çarkı config'ten kurar; kullanılmışları "used" yapar. */
export function buildCouplesWheel(state = defaultCouplesState()) {
  const wheel = createWheel("Bizim Çarkımız", allowedCodes());
  const used = new Set(filterAllowed(state.used));
  wheel.allOptions.forEach((option) => {
    if (used.has(option.label)) setOptionStatus(wheel, option.id, "used");
  });
  return wheel;
}

export function startNewRound(wheel, state) {
  state.used = [];
  resetResults(wheel);
  return wheel;
}

export function recordSpin(state, code, status = "accepted") {
  if (!isAllowedCode(code)) throw new Error(`İzin verilmeyen kod: ${code}`);
  if (!state.used.includes(code)) state.used.push(code);
  state.history.unshift({ code, at: new Date().toISOString(), status });
  state.history = state.history.slice(0, 60);
  return state;
}

export function toggleFavorite(state, code) {
  if (!isAllowedCode(code)) throw new Error(`İzin verilmeyen kod: ${code}`);
  const index = state.favorites.indexOf(code);
  if (index >= 0) state.favorites.splice(index, 1);
  else state.favorites.push(code);
  return state.favorites.includes(code);
}

export function poolCounts(wheel) {
  return {
    total: TOTAL_OPTIONS,
    active: TOTAL_OPTIONS,
    remaining: wheel.availableOptions.length,
    used: TOTAL_OPTIONS - wheel.availableOptions.length,
    finished: wheel.availableOptions.length === 0
  };
}

export function describe(code) {
  const number = numberOf(code);
  return {
    code,
    number,
    caption: number ? `${number}. pozisyon` : ""
  };
}

// —— Görünüm ————————————————————————————————————————————————————————————
// Nötr yer tutucu: görsel yoksa bunu göster.
const PLACEHOLDER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">
     <rect width="320" height="240" fill="#eceef2"/>
     <text x="160" y="126" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#8b93a1">Görsel bulunamadı</text>
   </svg>`);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG_NS = "http://www.w3.org/2000/svg";

function svgIcon(className, innerPaths) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of innerPaths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

function chevronIcon() {
  return svgIcon("chevron", ["M6 9l6 6 6-6"]);
}

function heartIcon(className = "icon-heart") {
  return svgIcon(className, ["M12 21s-7-4.6-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6C19 16.4 12 21 12 21z"]);
}

/**
 * Özel alanın DOM'unu kurar. Kilit açılmadan çağrılmaz; kilitlenince destroy() ile
 * tüm düğümler ve görsel URL referansları kaldırılır.
 */
export function createPrivateUI({ wheel, state, onSpin, onChange, returnFocus = null }) {
  const panel = el("section", "private-panel");

  // İstatistik kartları — js/app.js'in normal-mod kartlarıyla aynı sınıfları paylaşır (DRY),
  // `data-stat` özniteliği testlerin kararlı biçimde seçebilmesi için eklenir.
  const statRow = el("div", "stat-row");
  const totalValue = el("p", "stat-value", "0");
  totalValue.dataset.stat = "total";
  const totalIcon = el("span", "stat-icon");
  totalIcon.setAttribute("aria-hidden", "true");
  totalIcon.append(svgIcon("", ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"]));
  const totalBody = el("div", "stat-body");
  totalBody.append(el("p", "stat-label", "Toplam seçenek"), totalValue);
  const totalCard = el("div", "stat-card");
  totalCard.append(totalIcon, totalBody);

  const remainValue = el("p", "stat-value", "0");
  remainValue.dataset.stat = "remaining";
  const remainIcon = el("span", "stat-icon stat-icon-remain");
  remainIcon.setAttribute("aria-hidden", "true");
  remainIcon.append(svgIcon("", ["M12 4a8 8 0 100 16 8 8 0 000-16zM12 11a1 1 0 100 2 1 1 0 000-2z"]));
  const remainBody = el("div", "stat-body");
  remainBody.append(el("p", "stat-label", "Kalan seçenek"), remainValue);
  const remainCard = el("div", "stat-card");
  remainCard.append(remainIcon, remainBody);

  statRow.append(totalCard, remainCard);

  const round = el("button", "restart-button", "Yeni tur başlat");
  round.type = "button";

  // "Tüm pozisyonlar tamamlandı." mesajı — sayı kartlarının altında, yalnızca bittiğinde görünür.
  const counts = el("p", "private-counts");
  counts.hidden = true;

  const favTitle = el("button", "private-heading", "Favoriler");
  favTitle.type = "button";
  favTitle.setAttribute("aria-expanded", "true");
  favTitle.append(chevronIcon());
  const favList = el("div", "chip-list");
  const favSection = el("div", "private-section");
  favSection.append(favList);

  const historyTitle = el("button", "private-heading", "Geçmiş");
  historyTitle.type = "button";
  historyTitle.setAttribute("aria-expanded", "true");
  historyTitle.append(chevronIcon());
  const historyList = el("div", "chip-list");
  const historySection = el("div", "private-section");
  historySection.append(historyList);

  function toggleSection(button, section) {
    const expanded = button.getAttribute("aria-expanded") !== "false";
    button.setAttribute("aria-expanded", String(!expanded));
    section.hidden = expanded;
  }
  favTitle.addEventListener("click", () => toggleSection(favTitle, favSection));
  historyTitle.addEventListener("click", () => toggleSection(historyTitle, historySection));

  panel.append(statRow, round, counts, favTitle, favSection, historyTitle, historySection);

  // Sonuç modalı — hem çevirme sonucu hem de geçmiş/favori numarasına tıklanınca açılır.
  const overlay = el("div", "couples-overlay");
  overlay.hidden = true;
  const modal = el("section", "couples-modal");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  const kicker = el("p", "result-kicker", "Seçiminiz");
  const code = el("p", "couples-code", "—");
  const caption = el("p", "couples-caption", "");
  const figure = el("div", "couples-figure");
  const image = document.createElement("img");
  image.alt = "";
  image.decoding = "async";
  const imageStatus = el("p", "couples-image-status", "");
  imageStatus.hidden = true;
  figure.append(image, imageStatus);
  const actions = el("div", "couples-actions");
  const favorite = el("button", "ghost-button", "Favoriye ekle");
  const pass = el("button", "ghost-button", "Pas geç");
  const respin = el("button", "ghost-button", "Yeniden çevir");
  const ok = el("button", "primary-button", "Tamam");
  [favorite, pass, respin, ok].forEach((button) => { button.type = "button"; });
  actions.append(favorite, pass, respin, ok);
  modal.append(kicker, code, caption, figure, actions);
  overlay.append(modal);

  let currentCode = null;
  let imageRequest = 0;

  function update() {
    const pool = poolCounts(wheel);
    totalValue.textContent = String(pool.active);
    remainValue.textContent = String(pool.finished ? 0 : pool.remaining);
    counts.textContent = pool.finished ? "Tüm pozisyonlar tamamlandı." : "";
    counts.hidden = !pool.finished;
    counts.classList.toggle("is-finished", pool.finished);
    round.hidden = !pool.used;

    favList.replaceChildren(...state.favorites.map((value) => {
      const chip = el("button", "chip", value);
      chip.type = "button";
      chip.title = `${describe(value).caption} · görmek için tıkla`;
      chip.addEventListener("click", () => showResult(value, true));
      return chip;
    }));
    if (!state.favorites.length) {
      const empty = el("p", "empty-note");
      const text = document.createElement("span");
      text.textContent = "Henüz favori yok.";
      empty.append(heartIcon(), text);
      favList.append(empty);
    }

    historyList.replaceChildren(...state.history.slice(0, 20).map((entry) => {
      const chip = el("button", `chip is-${entry.status}`, entry.code);
      chip.type = "button";
      chip.title = `${describe(entry.code).caption}${entry.status === "passed" ? " · pas geçildi" : ""} · görmek için tıkla`;
      chip.addEventListener("click", () => showResult(entry.code, true));
      return chip;
    }));
    if (!state.history.length) historyList.append(el("p", "empty-note", "Henüz seçim yok."));
  }

  function clearImage() {
    imageRequest += 1;
    cancelPendingImageRequest();
    image.removeAttribute("src");
    image.onerror = null;
    figure.classList.remove("is-loading");
    imageStatus.hidden = true;
    imageStatus.textContent = "";
  }

  /** browse: geçmiş/favori listesinden açıldı — pas geçme ve yeniden çevirme anlamsız. */
  function showResult(value, browse = false) {
    currentCode = value;
    const info = describe(value);
    kicker.textContent = browse ? "Pozisyon" : "Seçiminiz";
    code.textContent = info.code;
    caption.textContent = info.caption;
    image.alt = `${info.code} pozisyon görseli`;
    favorite.textContent = state.favorites.includes(value) ? "Favoriden çıkar" : "Favoriye ekle";
    pass.hidden = browse;
    respin.hidden = browse;
    overlay.hidden = false;
    ok.focus();

    clearImage();
    const request = imageRequest;
    image.src = PLACEHOLDER;
    figure.classList.add("is-loading");
    imageStatus.textContent = "Görsel yükleniyor…";
    imageStatus.hidden = false;
    fetchPrivateImage(value)
      .then((dataUrl) => {
        if (!dataUrl || request !== imageRequest || currentCode !== value) return;
        image.onerror = () => {
          image.onerror = null;
          image.src = PLACEHOLDER;
          imageStatus.textContent = "Görsel yüklenemedi.";
          imageStatus.hidden = false;
        };
        image.src = dataUrl;
        figure.classList.remove("is-loading");
        imageStatus.hidden = true;
      })
      .catch(() => {
        if (request !== imageRequest || currentCode !== value) return;
        figure.classList.remove("is-loading");
        image.src = PLACEHOLDER;
        imageStatus.textContent = "Görsel yüklenemedi.";
        imageStatus.hidden = false;
      });
  }

  function closeResult() {
    overlay.hidden = true;
    clearImage(); // kilitlenince/kapanınca özel görsel referansı kalmasın
    currentCode = null;
    if (returnFocus?.isConnected) {
      try {
        returnFocus.focus({ preventScroll: true });
      } catch {
        returnFocus.focus();
      }
    }
  }

  favorite.addEventListener("click", () => {
    if (!currentCode) return;
    const added = toggleFavorite(state, currentCode);
    favorite.textContent = added ? "Favoriden çıkar" : "Favoriye ekle";
    onChange();
  });
  pass.addEventListener("click", () => {
    if (currentCode) {
      const entry = state.history.find((item) => item.code === currentCode);
      if (entry) entry.status = "passed";
      onChange();
    }
    closeResult();
  });
  respin.addEventListener("click", () => { closeResult(); onSpin(); });
  ok.addEventListener("click", closeResult);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeResult(); });

  round.addEventListener("click", () => { startNewRound(wheel, state); onChange(); });

  return {
    panel,
    overlay,
    update,
    showResult,
    closeResult,
    isResultOpen: () => !overlay.hidden,
    destroy() {
      closeResult();
      clearPrivateImageCache();
      overlay.remove();
      panel.remove();
    }
  };
}
