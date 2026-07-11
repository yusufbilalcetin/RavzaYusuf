import {
  addOptions,
  deleteOption,
  parseOptionText,
  resetResults,
  selectOption
} from "./model.js";
import { loadStore, saveStore } from "./storage.js";

const $ = (selector, root = document) => root.querySelector(selector);

const elements = {
  bannerText: $("#winnerBannerText"),
  optionCount: $("#optionCount"),
  bulkToggle: $("#bulkToggle"),
  optionEntry: $("#optionEntry"),
  input: $("#optionInput"),
  addButton: $("#addButton"),
  inputHelp: $("#inputHelp"),
  optionList: $("#optionList"),
  wheelWrap: $("#wheelWrap"),
  canvas: $("#wheelCanvas"),
  spinButton: $("#spinButton"),
  overlay: $("#resultOverlay"),
  modalWinner: $("#modalWinner"),
  modalClose: $("#modalClose"),
  confetti: $("#confetti")
};

const context = elements.canvas.getContext("2d");
const store = loadStore();
let wheel = store.wheels.find((item) => item.id === store.activeWheelId) || store.wheels[0];
let visualOptions = availableOptions();
let rotation = 0;
let isSpinning = false;
let animationFrame = 0;
let selectedVisualId = null;

const POINTER_ANGLE = -Math.PI * .75;
const COLORS = ["#9d0038", "#5b2a91", "#0d7180", "#d88b00", "#315f91", "#6d8f2f", "#c54972", "#4c4190"];

function optionById(id) {
  return wheel.allOptions.find((option) => option.id === id);
}

function availableOptions() {
  return wheel.availableOptions.map(optionById).filter(Boolean);
}

function persist() {
  saveStore(store);
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
  context.fillText("Seçenek ekleyin", center, center + radius * .34);
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
    const label = options.length > 50 ? String(index + 1) : fitText(option.label, options.length <= 12 ? 24 : options.length <= 24 ? 13 : 7);
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
  elements.optionCount.textContent = String(wheel.allOptions.length);
  elements.optionList.replaceChildren(...wheel.allOptions.map(createOptionRow));
  elements.spinButton.disabled = isSpinning || !wheel.allOptions.length;
  elements.bannerText.textContent = wheel.currentResult?.value || "Henüz seçim yok";
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
  if (isSpinning) return;
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
  persist();
  render();
  showResult(selection.option.label);
}

function spin() {
  if (isSpinning || !wheel.allOptions.length) return;
  if (!wheel.availableOptions.length) resetResults(wheel);

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
    if (!button || isSpinning) return;
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.overlay.hidden) closeResult();
  });

  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(elements.canvas);
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(animationFrame);
    observer.disconnect();
  }, { once: true });
}

persist();
bindEvents();
render();
resizeCanvas();
