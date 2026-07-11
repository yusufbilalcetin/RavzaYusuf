// Bizim Çarkımız — havuz yalnızca couples-config.js'teki (kırmızı ile işaretli) 62 koddan kurulur.
// Bu dosya PIN doğrulanmadan yüklenmez (app.js dinamik import eder).
import { createWheel, resetResults, setOptionStatus } from "./model.js";
import {
  TOTAL_OPTIONS,
  allowedCodes,
  catalogOf,
  couplesWheelCatalogs,
  filterAllowed,
  imagePathFor,
  isAllowedCode,
  numberOf
} from "./couples-config.js";

export const STATE_KEY = "ravza-couples-state-v1";

const CATALOG_IDS = new Set(couplesWheelCatalogs.map((catalog) => catalog.id));

export function defaultCouplesState() {
  return { used: [], history: [], favorites: [], offCatalogs: [] };
}

/** Depodaki her kod config'e göre süzülür: kırmızı işaretsiz numara asla geri dönemez. */
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
    offCatalogs: [...new Set(Array.isArray(parsed.offCatalogs) ? parsed.offCatalogs : [])].filter((id) => CATALOG_IDS.has(id)),
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
      offCatalogs: state.offCatalogs.filter((id) => CATALOG_IDS.has(id)),
      history: state.history.filter((entry) => isAllowedCode(entry.code))
    }));
    return true;
  } catch {
    return false;
  }
}

/** Çarkı config'ten kurar; kullanılmışları "used", kapalı katalogları "disabled" yapar. */
export function buildCouplesWheel(state = defaultCouplesState()) {
  const wheel = createWheel("Bizim Çarkımız", allowedCodes());
  const off = new Set(state.offCatalogs);
  const used = new Set(filterAllowed(state.used));
  wheel.allOptions.forEach((option) => {
    const catalog = catalogOf(option.label);
    if (off.has(catalog.id)) setOptionStatus(wheel, option.id, "disabled");
    else if (used.has(option.label)) setOptionStatus(wheel, option.id, "used");
  });
  return wheel;
}

export function toggleCatalog(wheel, state, catalogId, enabled) {
  if (!CATALOG_IDS.has(catalogId)) return false;
  const off = new Set(state.offCatalogs);
  if (enabled) off.delete(catalogId);
  else off.add(catalogId);
  state.offCatalogs = [...off];

  const used = new Set(filterAllowed(state.used));
  wheel.allOptions
    .filter((option) => catalogOf(option.label).id === catalogId)
    .forEach((option) => {
      const status = !enabled ? "disabled" : used.has(option.label) ? "used" : "available";
      setOptionStatus(wheel, option.id, status);
    });
  return true;
}

export function startNewRound(wheel, state) {
  state.used = [];
  resetResults(wheel); // kapalı kataloglar "disabled" kalır, yalnızca kullanılmışlar havuza döner
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

export function poolCounts(wheel, state) {
  const activeTotal = wheel.allOptions.filter((option) => option.status !== "disabled").length;
  return {
    total: TOTAL_OPTIONS,
    active: activeTotal,
    remaining: wheel.availableOptions.length,
    used: activeTotal - wheel.availableOptions.length,
    finished: activeTotal > 0 && wheel.availableOptions.length === 0
  };
}

export function describe(code) {
  const catalog = catalogOf(code);
  const number = numberOf(code);
  return {
    code,
    catalogName: catalog?.name || "",
    number,
    caption: catalog ? `${catalog.name} · ${number}. pozisyon` : "",
    image: imagePathFor(code)
  };
}

// —— Görünüm ————————————————————————————————————————————————————————————
// Nötr yer tutucu: kırpılmış görsel yoksa bunu göster (kaynak sayfa asla gösterilmez).
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

/**
 * Özel alanın DOM'unu kurar. Kilit açılmadan çağrılmaz; kilitlenince destroy() ile
 * tüm düğümler ve görsel URL referansları kaldırılır.
 */
export function createPrivateUI({ wheel, state, onSpin, onChange }) {
  const panel = el("section", "private-panel");
  const summary = el("div", "private-summary");
  const counts = el("p", "private-counts");
  const round = el("button", "ghost-button", "Yeni tur başlat");
  round.type = "button";
  summary.append(counts, round);

  const filters = el("div", "catalog-filters");
  const filterInputs = couplesWheelCatalogs.map((catalog) => {
    const label = el("label", "catalog-filter");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !state.offCatalogs.includes(catalog.id);
    input.dataset.catalogId = catalog.id;
    label.append(input, el("span", null, `${catalog.name} — ${catalog.selectedNumbers.length} seçenek`));
    filters.append(label);
    return input;
  });

  const favTitle = el("h2", "private-heading", "Favoriler");
  const favList = el("div", "chip-list");
  const historyTitle = el("h2", "private-heading", "Geçmiş");
  const historyList = el("div", "chip-list");
  panel.append(summary, filters, favTitle, favList, historyTitle, historyList);

  // Sonuç modalı
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
  figure.append(image);
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

  function update() {
    const pool = poolCounts(wheel, state);
    counts.textContent = pool.finished
      ? "Tüm seçili pozisyonlar tamamlandı."
      : `Toplam seçenek ${pool.active} · Kalan seçenek ${pool.remaining}`;
    counts.classList.toggle("is-finished", pool.finished);
    round.hidden = !pool.used;

    favList.replaceChildren(...state.favorites.map((value) => {
      const chip = el("button", "chip", value);
      chip.type = "button";
      chip.title = describe(value).caption;
      chip.addEventListener("click", () => {
        toggleFavorite(state, value);
        onChange();
      });
      return chip;
    }));
    if (!state.favorites.length) favList.append(el("p", "empty-note", "Henüz favori yok."));

    historyList.replaceChildren(...state.history.slice(0, 20).map((entry) => {
      const chip = el("span", `chip is-${entry.status}`, entry.code);
      chip.title = `${describe(entry.code).caption}${entry.status === "passed" ? " · pas geçildi" : ""}`;
      return chip;
    }));
    if (!state.history.length) historyList.append(el("p", "empty-note", "Henüz seçim yok."));
  }

  function showResult(value) {
    currentCode = value;
    const info = describe(value);
    code.textContent = info.code;
    caption.textContent = info.caption;
    image.alt = `${info.code} pozisyon görseli`;
    image.onerror = () => { image.onerror = null; image.src = PLACEHOLDER; };
    image.src = info.image || PLACEHOLDER;
    favorite.textContent = state.favorites.includes(value) ? "Favoriden çıkar" : "Favoriye ekle";
    overlay.hidden = false;
    ok.focus();
  }

  function closeResult() {
    overlay.hidden = true;
    image.removeAttribute("src"); // kilitlenince/kapanınca görsel referansı kalmasın
    currentCode = null;
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
  filters.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-catalog-id]");
    if (!input) return;
    toggleCatalog(wheel, state, input.dataset.catalogId, input.checked);
    onChange();
  });

  return {
    panel,
    overlay,
    update,
    showResult,
    closeResult,
    isResultOpen: () => !overlay.hidden,
    destroy() {
      closeResult();
      filterInputs.length = 0;
      overlay.remove();
      panel.remove();
    }
  };
}
