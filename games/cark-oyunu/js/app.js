import {
  addOptions,
  clearWheel,
  deleteOption,
  parseOptionText,
  resetResults,
  selectOption
} from "./model.js";
import { loadStore, saveStore } from "./storage.js";
import {
  clearPinInput,
  loadPinConfig,
  resetPrivateAccess,
  verifyPin
} from "./private-pin.js";
import { createLockReveal } from "./lock-reveal.js";
import { POINTER_ANGLE, targetRotationFor, indexAtPointer, sliceAngle } from "./wheel-math.js";

const $ = (selector, root = document) => root.querySelector(selector);

const elements = {
  app: $(".wheel-app"),
  appBar: $(".app-bar"),
  brandTitle: $("#brandTitle"),
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
  optionColumn: $(".option-column"),
  wheelPanel: $(".wheel-panel"),
  privateHost: $("#privateHost"),
  wheelWrap: $("#wheelWrap"),
  canvas: $("#wheelCanvas"),
  spinButton: $("#spinButton"),
  overlay: $("#resultOverlay"),
  modalWinner: $("#modalWinner"),
  modalClose: $("#modalClose"),
  confetti: $("#confetti"),
  lockOverlay: $("#lockOverlay"),
  lockForm: $("#lockForm"),
  lockInput: $("#lockInput"),
  lockError: $("#lockError"),
  lockSubmit: $("#lockSubmit"),
  lockClose: $("#lockClose"),
  themeToggle: $("#themeToggle"),
  statTotal: $("#statTotal"),
  statRemaining: $("#statRemaining"),
  restartButton: $("#restartButton"),
  wheelPegs: $("#wheelPegs"),
  wheelPegsRotator: $("#wheelPegsRotator"),
  pointer: $(".wheel-pointer")
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
let frozenWheelViewportWidth = null;

// "normal" · "locked" (özel alan kilitli, nötr ekran) · "private" (özel çark açık)
let mode = "normal";
let couples = null;        // PIN doğrulanınca dinamik yüklenen modül
let couplesState = null;
let privateUI = null;
let lockReveal = null;     // gizli kilit butonu (başlığa üç kez dokununca üretilir)

// Dilim renkleri: beyaz metinle WCAG AA sağlayan koyu tonlar (kontrast oranı ≥ 4.5:1).
// Komşu dilimler kolayca ayrılsın diye ton/parlaklık dönüşümlü; neon yok. Bu 7 renk
// css/style.css'teki --wheel-1..7 değişkenleriyle birebir eşleşir (canvas fill string'i
// CSS custom property okuyamadığı için burada ayrıca sabit tutulur, bkz. plan notu).
const COLORS = ["#8e0e3f", "#5b2a86", "#1c3f6e", "#0e6e6a", "#3f7d3a", "#b8860a", "#b0416b"];

// >60 seçenekte pegler gösterilmez (etiket kesme eşiğiyle tutarlı bir görsel gürültü sınırı).
const MAX_PEGS = 60;
let lastPegCount = -1;
let lastPointerIndex = null;
let audioCtx = null;

// —— Tema (koyu/açık) ————————————————————————————————————————————————

function applyTheme(theme) {
  elements.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  elements.themeToggle.setAttribute("aria-label", theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç");
  elements.themeToggle.querySelector(".icon-sun").hidden = theme === "dark";
  elements.themeToggle.querySelector(".icon-moon").hidden = theme !== "dark";
}

function resolvedTheme() {
  return window.RavzaGameTheme?.getState().resolvedMode
    || document.documentElement.dataset.resolvedTheme
    || document.documentElement.dataset.theme
    || "light";
}

function handleThemeChange(event) {
  applyTheme(event.detail?.resolvedMode || resolvedTheme());
  drawWheel();
}

function initTheme() {
  applyTheme(resolvedTheme());
  window.addEventListener("app:theme-change", handleThemeChange);
}

function toggleTheme() {
  const next = resolvedTheme() === "dark" ? "light" : "dark";
  if (window.RavzaGameTheme) {
    window.RavzaGameTheme.setMode(next);
  } else {
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.resolvedTheme = next;
    applyTheme(next);
    drawWheel();
  }
}

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

function resizeCanvas() {
  const size = Math.max(280, Math.round(elements.canvas.getBoundingClientRect().width * Math.min(devicePixelRatio || 1, 2)));
  if (elements.canvas.width !== size || elements.canvas.height !== size) {
    elements.canvas.width = size;
    elements.canvas.height = size;
  }
  drawWheel();
}

function releaseWheelSize() {
  elements.wheelWrap.classList.remove("is-size-frozen");
  elements.wheelWrap.style.removeProperty("--wheel-frozen-size");
  frozenWheelViewportWidth = null;
}

/**
 * CSS ölçüsünü spin başında piksele sabitler. Safari'nin yalnız yükseklik değiştiren adres
 * çubuğu hareketi sahneyi yeniden boyutlandıramaz; gerçek yatay alan değişirse kilit çözülür.
 */
function freezeWheelSize() {
  const size = elements.wheelWrap.getBoundingClientRect().width;
  elements.wheelWrap.style.setProperty("--wheel-frozen-size", `${size}px`);
  elements.wheelWrap.classList.add("is-size-frozen");
  frozenWheelViewportWidth = window.innerWidth;
}

function handleViewportResize() {
  if (frozenWheelViewportWidth === null) return;
  const widthChanged = Math.abs(window.innerWidth - frozenWheelViewportWidth) > .5;
  if (!widthChanged || isSpinning) return;
  releaseWheelSize();
  requestAnimationFrame(resizeCanvas);
}

function drawEmptyWheel(size, center, radius) {
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fillStyle = cssThemeColor("--wheel-empty-bg", "#c7c9ce");
  context.fill();
  context.fillStyle = cssThemeColor("--wheel-empty-text", "#565d68");
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `600 ${Math.max(14, size * .03)}px "Segoe UI", sans-serif`;
  context.fillText(mode === "private" ? "Tüm seçenekler tamamlandı" : "Seçenek ekleyin", center, center + radius * .34);
}

const FONT_STACK = 'Inter, "Segoe UI", sans-serif';

function cssThemeColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Dilim rengine göre okunabilir yazı rengi (WCAG: açık zeminde koyu, koyu zeminde açık metin). */
function inkOn(background) {
  const channel = (offset) => {
    const value = parseInt(background.slice(offset, offset + 2), 16) / 255;
    return value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  };
  const luminance = .2126 * channel(1) + .7152 * channel(3) + .0722 * channel(5);
  return luminance > .32 ? "#16181d" : "#f7f7f8";
}

/**
 * Etiketi dilime sığdırır: önce font küçültülür, tabana rağmen sığmıyorsa kısaltılır.
 * `fillText`'in maxWidth parametresi harfleri sıkıştırıp çirkinleştirdiği için kullanılmaz.
 */
function fitLabel(label, baseSize, maxWidth) {
  context.font = `700 ${baseSize}px ${FONT_STACK}`;
  let width = context.measureText(label).width;
  if (width <= maxWidth) return label;

  const scaled = Math.max(10, Math.floor(baseSize * maxWidth / width));
  context.font = `700 ${scaled}px ${FONT_STACK}`;
  width = context.measureText(label).width;
  if (width <= maxWidth) return label;

  let text = label;
  while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return `${text}…`;
}

/** Seçenek sayısına göre taban font boyutu; 50'nin üstünde çarka hiç yazı çizilmez. */
function labelFontSize(count, size) {
  if (count > 50) return 0;
  if (count <= 12) return size * .038;
  if (count <= 24) return size * .027;
  return size * .018;
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
  const baseSize = labelFontSize(options.length, size);
  const maxWidth = radius * .62;

  options.forEach((option, index) => {
    const start = POINTER_ANGLE + angle + index * slice;
    const end = start + slice;
    const background = option.id === selectedVisualId
      ? cssThemeColor("--wheel-selected", "#7f8792")
      : options.length === 1 ? "#9d0038" : COLORS[index % COLORS.length];

    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, end);
    context.closePath();
    context.fillStyle = background;
    context.fill();
    if (options.length > 1) {
      context.strokeStyle = cssThemeColor("--wheel-divider", "rgba(255,255,255,.30)");
      context.lineWidth = Math.max(1, size * .0015);
      context.stroke();
    }

    // 50'den fazla seçenekte dilim yazısı okunamayacak kadar küçülür ve yüzlerce metin
    // ölçümü boşuna maliyet olur — kazanan sonuç kartında tam isimle gösterilir.
    if (!baseSize) return;

    const middle = start + slice / 2;
    // Sol yarıdaki dilimlerde metin baş aşağı düşer: eksen π kadar çevrilip hizalama tersine alınır.
    const flipped = Math.cos(middle) < 0;
    const text = fitLabel(option.label, baseSize, maxWidth); // context.font'u da ayarlar

    context.save();
    context.translate(center, center);
    context.rotate(flipped ? middle + Math.PI : middle);
    context.textAlign = flipped ? "left" : "right";
    context.textBaseline = "middle";
    context.fillStyle = inkOn(background);
    context.fillText(text, (flipped ? -1 : 1) * radius * .86, 0);
    context.restore();
  });
}

/**
 * Segment sınırlarındaki gümüş pegleri üretir. Açı hesabı drawWheel'in kullandığı
 * `POINTER_ANGLE + index*slice` modeliyle birebir aynıdır (wheel-math.js'ten salt-okunur
 * `sliceAngle`); pegler tek tek değil, `#wheelPegsRotator` konteyneri toptan `rotation` ile
 * döndürülerek çarkla senkron tutulur (bkz. animate()/settle()). Yalnızca seçenek sayısı
 * değiştiğinde yeniden üretilir — resize'da JS'siz, CSS yüzdeleriyle otomatik ölçeklenir.
 */
function renderPegs(count) {
  if (count === lastPegCount) return;
  lastPegCount = count;
  if (!count || count > MAX_PEGS) {
    elements.wheelPegsRotator.replaceChildren();
    return;
  }
  const slice = sliceAngle(count);
  const pegs = Array.from({ length: count }, (_, index) => {
    const angle = POINTER_ANGLE + index * slice;
    const peg = document.createElement("i");
    peg.className = "wheel-peg";
    peg.style.left = `${50 + 48.5 * Math.cos(angle)}%`;
    peg.style.top = `${50 + 48.5 * Math.sin(angle)}%`;
    return peg;
  });
  elements.wheelPegsRotator.replaceChildren(...pegs);
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
  // .option-panel'in sarmalayıcısı: özel/kilitli modda bu sütun tamamen kalksın, yoksa
  // içindeki not metni boş bir grid hücresi olarak kalıp #privateHost'un yerleşimini bozar.
  elements.optionColumn.hidden = mode !== "normal";
  elements.wheelPanel.hidden = mode === "locked";
  elements.privateHost.hidden = mode === "normal";
  elements.app.classList.toggle("is-locked", mode === "locked");

  if (mode === "normal") {
    elements.optionCount.textContent = String(wheel.allOptions.length);
    elements.statTotal.textContent = String(wheel.allOptions.length);
    elements.statRemaining.textContent = String(wheel.availableOptions.length);
    elements.restartButton.hidden = !wheel.usedOptions.length;
    elements.optionList.replaceChildren(...wheel.allOptions.map(createOptionRow));
    elements.bannerText.textContent = wheel.currentResult?.value || "Henüz seçim yok";
  }
  if (isPrivate) privateUI?.update();

  elements.spinButton.disabled = isSpinning || !wheel.allOptions.length || (isPrivate && !wheel.availableOptions.length);
  elements.canvas.setAttribute("aria-label", wheel.allOptions.length
    ? `${wheel.allOptions.length} seçenekli şans çarkı`
    : "Boş şans çarkı");
  drawWheel();
  renderPegs(visualOptions.length);
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
  lockReveal?.setOpen(unlocked);
}

/** PIN hash/salt yapılandırmasını modal açılırken Firestore'dan getirir. */
async function openLock() {
  resetPrivateAccess();
  clearPinInput(elements.lockInput);
  elements.lockError.textContent = "";
  elements.lockOverlay.hidden = false;
  elements.lockInput.focus();
  try {
    await loadPinConfig();
  } catch (error) {
    elements.lockError.textContent = error.message;
  }
}

function closeLock() {
  elements.lockOverlay.hidden = true;
  clearPinInput(elements.lockInput);
  elements.lockError.textContent = "";
  resetPrivateAccess();
  // Kilit butonu geçici bir gösterim: modal kapanınca yeniden gizlenir. Odak, onu doğuran
  // gizli tetikleyiciye (başlık) döner ki klavye kullanıcısı boşlukta kalmasın.
  lockReveal?.hide();
  elements.brandTitle.focus();
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
    onChange: () => { couples.saveCouplesState(couplesState); render(); },
    returnFocus: elements.spinButton
  });
  elements.privateHost.replaceChildren(privateUI.panel);
  document.body.append(privateUI.overlay);

  releaseWheelSize();
  wheel = couplesWheel;
  visualOptions = availableOptions();
  selectedVisualId = null;
  rotation = 0;
  mode = "private";
  lockIconState(true);
  render();
  resizeCanvas();
}

/** Kilitle: özel bileşenler DOM'dan kaldırılır, görsel referansları temizlenir. */
function lockPrivate() {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  isSpinning = false;
  elements.wheelWrap.classList.remove("is-spinning");
  releaseWheelSize();
  privateUI?.destroy();
  privateUI = null;
  couplesState = null;
  elements.lockOverlay.hidden = true;
  clearPinInput(elements.lockInput);
  elements.lockError.textContent = "";
  resetPrivateAccess();
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
  resetPrivateAccess();
  releaseWheelSize();
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
  text.textContent = "Devam etmek için aşağıdaki düğmeye dokun.";
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
  const value = elements.lockInput.value;
  elements.lockSubmit.disabled = true;
  try {
    await loadPinConfig();
    if (!(await verifyPin(value))) {
      rejectPin("Hatalı PIN");
      return;
    }
    resetPrivateAccess();
    closeLock();
    await enterPrivate();
  } catch (error) {
    rejectPin(error.message);
  } finally {
    clearPinInput(elements.lockInput);
    elements.lockSubmit.disabled = false;
  }
}

// —— Çevirme ——————————————————————————————————————————————————————————

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
  // Odak modal tetikleyicisine donsun; uzun sayfada tarayici carki
  // viewporta getirmek icin sayfayi kendiliginden kaydirmasin.
  try {
    elements.spinButton.focus({ preventScroll: true });
  } catch {
    elements.spinButton.focus();
  }
}

// —— İbre "tık" tepkisi —————————————————————————————————————————————
// wheel-math.js'in indexAtPointer'ı ile hangi dilimin ibrenin altından geçtiğini algılar;
// kendi açı hesaplamasını yapmaz, drawWheel'in kullandığı aynı modeli salt-okunur tüketir.

function tickPointerIfCrossed(progress) {
  const currentIndex = indexAtPointer(rotation, visualOptions.length);
  if (lastPointerIndex !== null && currentIndex !== lastPointerIndex) {
    const strong = progress > .85;
    elements.pointer.classList.remove("is-tick", "is-tick-strong");
    void elements.pointer.offsetWidth; // reflow: animasyon baştan oynasın (bannerGlow/shake ile aynı idiom)
    elements.pointer.classList.add(strong ? "is-tick-strong" : "is-tick");
    playTickSound();
  }
  lastPointerIndex = currentIndex;
}

/**
 * Opsiyonel kısa "tık" sesi (WebAudio, dosya yok). yalnızca spin() (kullanıcı jesti) sırasında
 * çağrılır, bu yüzden AudioContext her zaman bir jest çağrı yığınının içinde oluşturulur.
 * Tüm hatalar sessizce yutulur — konsola hiçbir şey yazılmaz (tests/wheel-browser.test.mjs
 * konsolun tamamen temiz kalmasını doğruluyor).
 */
function playTickSound() {
  try {
    if (wheel.settings?.sound === false) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + .05);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + .05);
  } catch {
    // Ses her zaman opsiyoneldir: herhangi bir tarayıcı/ortam kısıtı sessizce yok sayılır.
  }
}

function finishSpin(selection) {
  isSpinning = false;
  handleViewportResize();
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
  lastPointerIndex = null;
  const selection = selectOption(wheel);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Bitiş açısı kazanan dilimin ORTASINA oturur (sınırına değil) — ibrenin gösterdiği dilim
  // ile duyurulan kazanan matematiksel olarak aynıdır (tests/wheel-math.test.mjs).
  const startRotation = rotation;
  const target = targetRotationFor(selection.selectedIndex, visualOptions.length, startRotation, reduceMotion ? 1 : 6);
  const totalRotation = target - startRotation;
  const startTime = performance.now();
  const duration = reduceMotion ? 550 : 4800;

  isSpinning = true;
  freezeWheelSize();
  elements.spinButton.disabled = true;
  elements.wheelWrap.classList.add("is-spinning");

  function settle() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    document.removeEventListener("visibilitychange", onVisibility);
    rotation = target; // kayan nokta birikimi kalmasın: son kare tam hedefe otursun
    drawWheel(visualOptions, rotation);
    elements.wheelPegsRotator.style.transform = `rotate(${rotation}rad)`;
    finishSpin(selection);
  }

  // Sekme arka plana alınınca requestAnimationFrame durur; animasyon asla bitmez ve çark
  // "dönüyor" durumunda kilitli kalırdı. Gizlenince dönüşü hemen sonuçlandırıyoruz:
  // kazanan zaten seçilmişti, kullanıcı geri döndüğünde tutarlı bir sonuç bulur.
  function onVisibility() {
    if (document.hidden && isSpinning) settle();
  }
  document.addEventListener("visibilitychange", onVisibility);

  function animate(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    if (progress >= 1) {
      settle();
      return;
    }
    rotation = startRotation + totalRotation * easeOutQuint(progress);
    drawWheel(visualOptions, rotation);
    elements.wheelPegsRotator.style.transform = `rotate(${rotation}rad)`;
    tickPointerIfCrossed(progress);
    animationFrame = requestAnimationFrame(animate);
  }

  if (document.hidden) {
    settle(); // zaten arka plandayız: dönecek kare yok
    return;
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

  elements.themeToggle.addEventListener("click", toggleTheme);

  elements.restartButton.addEventListener("click", () => {
    if (isSpinning || mode !== "normal" || !wheel.allOptions.length) return;
    resetResults(wheel);
    visualOptions = availableOptions();
    selectedVisualId = null;
    rotation = 0;
    persist();
    render();
  });

  // Kilit butonu DOM'da yok: başlığa 650 ms içinde üç kez dokununca üretilir, 10 sn sonra kaldırılır.
  // Bu yalnızca arayüz kolaylığıdır — yetki sınırı değildir.
  lockReveal = createLockReveal({
    title: elements.brandTitle,
    host: elements.appBar,
    onActivate: () => {
      if (isSpinning) return;
      if (mode === "private") {
        lockPrivate();
        lockReveal.show(); // kilitlendi: ikon durumu görünsün, sonra yine kendiliğinden kaybolsun
        return;
      }
      openLock();
    }
  });
  lockReveal.setOpen(mode === "private");

  elements.lockForm.addEventListener("submit", submitLock);
  elements.lockClose.addEventListener("click", closeLock);
  elements.lockOverlay.addEventListener("click", (event) => {
    if (event.target === elements.lockOverlay) closeLock();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (privateUI?.isResultOpen()) privateUI.closeResult();
    else if (!elements.overlay.hidden) closeResult();
    else if (!elements.lockOverlay.hidden) closeLock();
  });

  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(elements.canvas);
  window.addEventListener("resize", handleViewportResize, { passive: true });
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(animationFrame);
    observer.disconnect();
    window.removeEventListener("resize", handleViewportResize);
    window.removeEventListener("app:theme-change", handleThemeChange);
    privateUI?.destroy();
    privateUI = null;
    clearPinInput(elements.lockInput);
    resetPrivateAccess();
    lockReveal?.destroy(); // listener ve gizleme sayacı geride kalmasın
  }, { once: true });
}

function start() {
  saveStore(store);
  initTheme();
  bindEvents();
  render();
  resizeCanvas();
}

start();
