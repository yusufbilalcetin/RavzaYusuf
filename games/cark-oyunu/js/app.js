import {
  addOptions,
  clearWheel,
  deleteOption,
  parseOptionText,
  resetResults,
  selectOption
} from "./model.js";
import { loadStore, saveStore } from "./storage.js";
import * as lock from "./pin.js";

const $ = (selector, root = document) => root.querySelector(selector);

// Özel alanı görmek istediğinin işareti (gizli bilgi değil): kilitliyken nötr ekranı,
// açıkken özel çarkı gösterelim diye tutulur.
const INTENT_KEY = "ravza-couples-intent-v1";

const elements = {
  app: $(".wheel-app"),
  bannerText: $("#winnerBannerText"),
  banner: $("#winnerBanner"),
  optionCount: $("#optionCount"),
  bulkToggle: $("#bulkToggle"),
  optionEntry: $("#optionEntry"),
  input: $("#optionInput"),
  addButton: $("#addButton"),
  inputHelp: $("#inputHelp"),
  optionList: $("#optionList"),
  optionPanel: $(".option-panel"),
  wheelPanel: $(".wheel-panel"),
  privateHost: $("#privateHost"),
  wheelWrap: $("#wheelWrap"),
  canvas: $("#wheelCanvas"),
  spinButton: $("#spinButton"),
  overlay: $("#resultOverlay"),
  modalWinner: $("#modalWinner"),
  modalClose: $("#modalClose"),
  confetti: $("#confetti"),
  lockButton: $("#lockButton"),
  lockOverlay: $("#lockOverlay"),
  lockTitle: $("#lockTitle"),
  lockSub: $("#lockSub"),
  lockForm: $("#lockForm"),
  lockCurrent: $("#lockCurrent"),
  lockInput: $("#lockInput"),
  lockError: $("#lockError"),
  lockPersist: $("#lockPersist"),
  lockSubmit: $("#lockSubmit"),
  lockManage: $("#lockManage"),
  pinChange: $("#pinChange"),
  lockClose: $("#lockClose")
};

const context = elements.canvas.getContext("2d");
const store = loadStore();
const normalWheel = store.wheels.find((item) => item.id === store.activeWheelId) || store.wheels[0];

let wheel = normalWheel;
let visualOptions = availableOptions();
let rotation = 0;
let isSpinning = false;
let animationFrame = 0;
let selectedVisualId = null;

// "normal" · "locked" (özel alan kilitli, nötr ekran) · "private" (özel çark açık)
let mode = "normal";
let couples = null;        // PIN doğrulanınca dinamik yüklenen modül
let couplesState = null;
let privateUI = null;
let formMode = "enter";    // "enter" | "set" | "change" | "remove"

const POINTER_ANGLE = -Math.PI * .75;
const COLORS = ["#9d0038", "#5f2b6b", "#0f6d78", "#c1861d", "#2f5480", "#5f7f34", "#b8446b", "#464090"];

const wantsPrivate = () => globalThis.localStorage?.getItem(INTENT_KEY) === "1";
const setIntent = (value) => {
  if (value) globalThis.localStorage?.setItem(INTENT_KEY, "1");
  else globalThis.localStorage?.removeItem(INTENT_KEY);
};

function optionById(id) {
  return wheel.allOptions.find((option) => option.id === id);
}

function availableOptions() {
  return wheel.availableOptions.map(optionById).filter(Boolean);
}

function persist() {
  if (mode === "private") couples?.saveCouplesState(couplesState);
  else saveStore(store);
}

function fitText(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}…` : value;
}

function resizeCanvas() {
  const size = Math.max(280, Math.round(elements.canvas.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, 2)));
  if (elements.canvas.width !== size || elements.canvas.height !== size) {
    elements.canvas.width = size;
    elements.canvas.height = size;
  }
  drawWheel();
}

function drawEmptyWheel(size, center, radius) {
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fillStyle = "#c7c9ce";
  context.fill();
  context.fillStyle = "#565d68";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `600 ${Math.max(14, size * .03)}px "Segoe UI", sans-serif`;
  context.fillText(mode === "private" ? "Tüm seçenekler tamamlandı" : "Seçenek ekleyin", center, center + radius * .34);
}

function drawWheel(options = visualOptions, angle = rotation) {
  const size = elements.canvas.width;
  const center = size / 2;
  const radius = size * .485;
  context.clearRect(0, 0, size, size);

  if (!options.length) {
    drawEmptyWheel(size, center, radius);
    return;
  }

  const slice = Math.PI * 2 / options.length;
  options.forEach((option, index) => {
    const start = POINTER_ANGLE + angle + index * slice;
    const end = start + slice;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, end);
    context.closePath();
    context.fillStyle = option.id === selectedVisualId
      ? "#7f8792"
      : options.length === 1 ? "#9d0038" : COLORS[index % COLORS.length];
    context.fill();
    if (options.length > 1) {
      context.strokeStyle = "rgba(244,244,245,.38)";
      context.lineWidth = Math.max(1, size * .002);
      context.stroke();
    }

    if (options.length > 80 && index % Math.ceil(options.length / 40) !== 0) return;
    const middle = start + slice / 2;
    // Özel modda dilimde yalnızca kısa kod yazar (A-01, B-52); kaynak görsel çarka çizilmez.
    const label = mode !== "private" && options.length > 50
      ? String(index + 1)
      : fitText(option.label, options.length <= 12 ? 24 : options.length <= 24 ? 13 : 7);
    const fontSize = options.length <= 8 ? size * .038 : options.length <= 20 ? size * .027 : size * .018;
    context.save();
    context.translate(center, center);
    context.rotate(middle);
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.fillStyle = "#f4f4f5";
    context.font = `700 ${Math.max(9, fontSize)}px "Segoe UI", sans-serif`;
    context.fillText(label, radius * .86, 0, radius * .66);
    context.restore();
  });
}

function createOptionRow(option) {
  const row = document.createElement("div");
  row.className = "option-row";
  const text = document.createElement("span");
  text.textContent = option.label;
  text.title = option.label;
  const remove = document.createElement("button");
  remove.className = "delete-button";
  remove.type = "button";
  remove.dataset.optionId = option.id;
  remove.setAttribute("aria-label", `${option.label} seçeneğini sil`);
  row.append(text, remove);
  return row;
}

function render() {
  const isPrivate = mode === "private";
  elements.optionPanel.hidden = mode !== "normal";
  elements.wheelPanel.hidden = mode === "locked";
  elements.privateHost.hidden = mode === "normal";
  elements.app.classList.toggle("is-locked", mode === "locked");

  if (mode === "normal") {
    elements.optionCount.textContent = String(wheel.allOptions.length);
    elements.optionList.replaceChildren(...wheel.allOptions.map(createOptionRow));
    elements.bannerText.textContent = wheel.currentResult?.value || "Henüz seçim yok";
  }
  if (isPrivate) privateUI?.update();

  elements.spinButton.disabled = isSpinning || !wheel.allOptions.length || (isPrivate && !wheel.availableOptions.length);
  elements.canvas.setAttribute("aria-label", wheel.allOptions.length
    ? `${wheel.allOptions.length} seçenekli şans çarkı`
    : "Boş şans çarkı");
  drawWheel();
}

function replaceEntryField(isBulk) {
  const currentValue = elements.input.value;
  const field = document.createElement(isBulk ? "textarea" : "input");
  field.id = "optionInput";
  field.maxLength = isBulk ? 30000 : 160;
  field.placeholder = isBulk ? "Seçenekleri satır, virgül veya noktalı virgülle ayırın" : "Çarka seçenek ekleyin";
  field.setAttribute("aria-label", field.placeholder);
  if (!isBulk) field.type = "text";
  field.value = currentValue;
  elements.input.replaceWith(field);
  elements.input = field;
  bindInputKeyboard();
  field.focus();
}

function showInputMessage(message) {
  elements.inputHelp.textContent = message;
  window.clearTimeout(showInputMessage.timer);
  showInputMessage.timer = window.setTimeout(() => { elements.inputHelp.textContent = ""; }, 2800);
}

function addEnteredOptions() {
  if (isSpinning || mode !== "normal") return;
  const labels = parseOptionText(elements.input.value);
  if (!labels.length) {
    showInputMessage("Önce bir seçenek yazın.");
    elements.input.focus();
    return;
  }
  try {
    const result = addOptions(wheel, labels);
    elements.input.value = "";
    if (result.duplicates.length) showInputMessage(`${result.duplicates.length} tekrar eden seçenek eklenmedi.`);
    visualOptions = availableOptions();
    selectedVisualId = null;
    rotation = 0;
    persist();
    render();
  } catch (error) {
    showInputMessage(error.message);
  }
}

function bindInputKeyboard() {
  elements.input.addEventListener("keydown", (event) => {
    const shouldAdd = elements.bulkToggle.checked
      ? event.key === "Enter" && (event.ctrlKey || event.metaKey)
      : event.key === "Enter";
    if (shouldAdd) {
      event.preventDefault();
      addEnteredOptions();
    }
  });
}

// —— Kilit ————————————————————————————————————————————————————————————

function lockIconState(unlocked) {
  elements.lockButton.classList.toggle("is-open", unlocked);
  elements.lockButton.setAttribute("aria-pressed", String(unlocked));
  elements.lockButton.setAttribute("aria-label", unlocked ? "Özel alanı kilitle" : "Özel alanı aç");
}

function setFormMode(next) {
  formMode = next;
  const texts = {
    enter: ["Özel alan", "Devam etmek için şifreyi girin.", "Aç"],
    change: ["Şifreyi değiştir", "Mevcut şifreyi ve yeni şifreyi girin.", "Değiştir"]
  }[next];
  elements.lockTitle.textContent = texts[0];
  elements.lockSub.textContent = texts[1];
  elements.lockSubmit.textContent = texts[2];
  elements.lockCurrent.hidden = next !== "change";
  elements.lockInput.placeholder = next === "change" ? "Yeni şifre" : "Şifre";
  elements.lockManage.hidden = next !== "enter" || !lock.hasPin();
  elements.lockCurrent.value = "";
  elements.lockInput.value = "";
  elements.lockError.textContent = "";
}

/** Şifre Firestore'da: modal açılırken kaydı bir kez çekeriz. */
async function openLock(next = "enter") {
  elements.lockPersist.value = lock.getPersistMode();
  setFormMode(next);
  elements.lockOverlay.hidden = false;
  elements.lockInput.focus();
  try {
    await lock.loadPinRecord();
    elements.lockManage.hidden = next !== "enter";
  } catch (error) {
    elements.lockError.textContent = error.message;
  }
}

function closeLock() {
  elements.lockOverlay.hidden = true;
  elements.lockCurrent.value = "";
  elements.lockInput.value = "";
  elements.lockButton.focus();
}

function rejectPin(message) {
  elements.lockError.textContent = message;
  elements.lockInput.classList.remove("is-shaking");
  void elements.lockInput.offsetWidth; // sınıfı yeniden ekleyince animasyon baştan başlasın
  elements.lockInput.classList.add("is-shaking");
  elements.lockInput.select?.();
}

/** Özel alanı yalnızca doğru PIN'den sonra yükler (kod ve görseller lazy-load). */
async function enterPrivate() {
  if (!couples) couples = await import("./couples.js");
  couplesState = couples.loadCouplesState();
  const couplesWheel = couples.buildCouplesWheel(couplesState);
  privateUI = couples.createPrivateUI({
    wheel: couplesWheel,
    state: couplesState,
    onSpin: () => spin(),
    onChange: () => { couples.saveCouplesState(couplesState); render(); }
  });
  elements.privateHost.replaceChildren(privateUI.panel);
  document.body.append(privateUI.overlay);

  wheel = couplesWheel;
  visualOptions = availableOptions();
  selectedVisualId = null;
  rotation = 0;
  mode = "private";
  setIntent(true);
  lockIconState(true);
  render();
  resizeCanvas();
}

/** Kilitle: özel bileşenler DOM'dan kaldırılır, görsel referansları temizlenir. */
function lockPrivate() {
  privateUI?.destroy();
  privateUI = null;
  couplesState = null;
  lock.lock();
  wheel = normalWheel;
  visualOptions = availableOptions();
  selectedVisualId = null;
  rotation = 0;
  mode = "locked";
  lockIconState(false);
  renderLockedScreen();
  render();
}

function exitPrivate() {
  setIntent(false);
  mode = "normal";
  elements.privateHost.replaceChildren();
  lockIconState(false);
  render();
}

/** Kilitliyken gösterilen nötr ekran: gizli hiçbir içerik yok. */
function renderLockedScreen() {
  const card = document.createElement("section");
  card.className = "locked-card";
  const title = document.createElement("h2");
  title.textContent = "Özel Alan Kilitli";
  const text = document.createElement("p");
  text.textContent = "Devam etmek için sağ üstteki kilit simgesine dokun.";
  const open = document.createElement("button");
  open.className = "primary-button";
  open.type = "button";
  open.textContent = "Kilidi Aç";
  open.addEventListener("click", () => openLock());
  const back = document.createElement("button");
  back.className = "link-button";
  back.type = "button";
  back.textContent = "Normal çarka dön";
  back.addEventListener("click", exitPrivate);
  card.append(title, text, open, back);
  elements.privateHost.replaceChildren(card);
}

async function submitLock(event) {
  event.preventDefault();
  const current = elements.lockCurrent.value;
  const value = elements.lockInput.value;
  elements.lockSubmit.disabled = true;
  try {
    await lock.loadPinRecord();
    if (formMode === "change") {
      await lock.changePin(current, value);
      setFormMode("enter");
      elements.lockError.textContent = "Şifre değiştirildi.";
      return;
    }
    if (!(await lock.verifyPin(value))) {
      rejectPin("Hatalı şifre");
      return;
    }
    lock.markUnlocked();
    closeLock();
    await enterPrivate();
  } catch (error) {
    rejectPin(error.message);
  } finally {
    elements.lockSubmit.disabled = false;
  }
}

// —— Çevirme ——————————————————————————————————————————————————————————

function normalizeAngle(value) {
  const circle = Math.PI * 2;
  return ((value % circle) + circle) % circle;
}

function easeOutQuint(value) {
  return 1 - (1 - value) ** 5;
}

function buildConfetti() {
  const colors = ["#9d0038", "#ffd84d", "#8b49c4", "#68d3e8", "#94c95d", "#ff9fb9"];
  const pieces = Array.from({ length: 64 }, (_, index) => {
    const piece = document.createElement("i");
    piece.className = "confetti-piece";
    piece.style.left = `${18 + Math.random() * 64}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--drift", `${-180 + Math.random() * 360}px`);
    piece.style.animationDelay = `${Math.random() * .45}s`;
    return piece;
  });
  elements.confetti.replaceChildren(...pieces);
}

function showResult(value) {
  elements.modalWinner.textContent = value;
  buildConfetti();
  elements.overlay.hidden = false;
  elements.modalClose.focus();
}

function closeResult() {
  elements.overlay.hidden = true;
  elements.confetti.replaceChildren();
  elements.spinButton.focus();
}

function finishSpin(selection) {
  isSpinning = false;
  selectedVisualId = selection.option.id;
  elements.wheelWrap.classList.remove("is-spinning");

  if (mode === "private") {
    couples.recordSpin(couplesState, selection.option.label);
    persist();
    render();
    privateUI.showResult(selection.option.label);
    return;
  }

  persist();
  render();
  elements.banner.classList.remove("is-new");
  void elements.banner.offsetWidth; // her kazananda parlama animasyonu baştan oynasın
  elements.banner.classList.add("is-new");
  showResult(selection.option.label);
}

function spin() {
  if (isSpinning || !wheel.allOptions.length) return;
  // Özel modda tur kendiliğinden sıfırlanmaz: kullanıcı "Yeni tur başlat" demeli.
  if (!wheel.availableOptions.length) {
    if (mode === "private") return;
    resetResults(wheel);
  }

  visualOptions = availableOptions();
  selectedVisualId = null;
  const selection = selectOption(wheel);
  const slice = Math.PI * 2 / visualOptions.length;
  const desired = normalizeAngle(-(selection.selectedIndex + .5) * slice);
  const current = normalizeAngle(rotation);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const totalRotation = normalizeAngle(desired - current) + (reduceMotion ? 1 : 6) * Math.PI * 2;
  const startRotation = rotation;
  const startTime = performance.now();
  const duration = reduceMotion ? 550 : 3600;

  isSpinning = true;
  elements.spinButton.disabled = true;
  elements.wheelWrap.classList.add("is-spinning");

  function animate(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    rotation = startRotation + totalRotation * easeOutQuint(progress);
    drawWheel(visualOptions, rotation);
    if (progress < 1) {
      animationFrame = requestAnimationFrame(animate);
      return;
    }
    animationFrame = 0;
    finishSpin(selection);
  }

  animationFrame = requestAnimationFrame(animate);
}

function bindEvents() {
  elements.addButton.addEventListener("click", addEnteredOptions);
  elements.bulkToggle.addEventListener("change", () => replaceEntryField(elements.bulkToggle.checked));
  bindInputKeyboard();

  elements.optionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-option-id]");
    if (!button || isSpinning || mode !== "normal") return;
    deleteOption(wheel, button.dataset.optionId);
    visualOptions = availableOptions();
    selectedVisualId = null;
    rotation = 0;
    persist();
    render();
  });

  elements.spinButton.addEventListener("click", spin);
  elements.modalClose.addEventListener("click", closeResult);
  elements.overlay.addEventListener("click", (event) => {
    if (event.target === elements.overlay) closeResult();
  });

  elements.lockButton.addEventListener("click", () => {
    if (isSpinning) return;
    if (mode === "private") lockPrivate();
    else openLock();
  });
  elements.lockForm.addEventListener("submit", submitLock);
  elements.lockClose.addEventListener("click", closeLock);
  elements.lockOverlay.addEventListener("click", (event) => {
    if (event.target === elements.lockOverlay) closeLock();
  });
  elements.lockPersist.addEventListener("change", () => lock.setPersistMode(elements.lockPersist.value));
  elements.pinChange.addEventListener("click", () => setFormMode("change"));

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (privateUI?.isResultOpen()) privateUI.closeResult();
    else if (!elements.overlay.hidden) closeResult();
    else if (!elements.lockOverlay.hidden) closeLock();
  });

  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(elements.canvas);
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(animationFrame);
    observer.disconnect();
  }, { once: true });
}

async function start() {
  saveStore(store);
  bindEvents();

  if (wantsPrivate() && lock.isUnlocked()) {
    await enterPrivate();
    return;
  }
  if (wantsPrivate()) {
    mode = "locked";
    lockIconState(false);
    renderLockedScreen();
  }
  render();
  resizeCanvas();
}

start();
