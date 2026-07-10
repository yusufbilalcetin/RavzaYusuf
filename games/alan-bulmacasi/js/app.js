import { LEVELS, getLevel } from "./levels.js";
import {
  cellKey,
  containsCell,
  isBoardComplete,
  normalizeRect,
  overlaps,
  rectArea,
  rectKey,
  validateRectangle
} from "./engine.js";
import { loadGameStore, saveGameStore } from "./storage.js";
import { GameSound, vibrate } from "./sound.js";

const REGION_COLORS = 6;
const SUCCESS_MESSAGES = [
  "Harikasın Ravza! 🌸",
  "Zekân yine parladı! ✨",
  "Bu bölümü de kusursuz tamamladın! 💗",
  "Yeni bir bölüm seni bekliyor.",
  "Her bulmaca seninle daha güzel."
];

const elements = {
  board: document.getElementById("board"),
  boardGrid: document.getElementById("boardGrid"),
  regionLayer: document.getElementById("regionLayer"),
  selectionPreview: document.getElementById("selectionPreview"),
  hintPreview: document.getElementById("hintPreview"),
  boardStatus: document.getElementById("boardStatus"),
  levelButton: document.getElementById("levelButton"),
  levelLabel: document.getElementById("levelLabel"),
  difficultyLabel: document.getElementById("difficultyLabel"),
  progressText: document.getElementById("progressText"),
  progressFill: document.getElementById("progressFill"),
  hintText: document.getElementById("hintText"),
  timeValue: document.getElementById("timeValue"),
  moveValue: document.getElementById("moveValue"),
  starValue: document.getElementById("starValue"),
  soundButton: document.getElementById("soundButton"),
  soundIcon: document.getElementById("soundIcon"),
  helpButton: document.getElementById("helpButton"),
  deleteButton: document.getElementById("deleteButton"),
  undoButton: document.getElementById("undoButton"),
  hintButton: document.getElementById("hintButton"),
  hintCount: document.getElementById("hintCount"),
  resetButton: document.getElementById("resetButton"),
  nextButton: document.getElementById("nextButton"),
  toast: document.getElementById("toast"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  modal: document.getElementById("modal"),
  confetti: document.getElementById("confetti")
};

const store = loadGameStore();
const sound = new GameSound(store.soundEnabled);
let state = null;
let drag = null;
let timerId = null;
let toastTimer = null;
let hintTimer = null;
let modalState = null;

function cloneRegions(regions) {
  return regions.map((region) => ({ ...region }));
}

function sanitizeRegions(level, value) {
  if (!Array.isArray(value)) return [];
  const accepted = [];
  value.forEach((candidate, index) => {
    const rect = {
      id: typeof candidate.id === "string" ? candidate.id : `saved-${index}`,
      row: Number(candidate.row),
      column: Number(candidate.column),
      height: Number(candidate.height),
      width: Number(candidate.width),
      color: Number.isInteger(candidate.color) ? candidate.color % REGION_COLORS : index % REGION_COLORS
    };
    const integers = [rect.row, rect.column, rect.height, rect.width].every(Number.isInteger);
    if (integers && validateRectangle(level, rect, accepted).valid) accepted.push(rect);
  });
  return accepted;
}

function numeric(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;
}

function loadLevel(levelId, options = {}) {
  const level = getLevel(levelId);
  const saved = options.fresh ? {} : (store.levels[level.id] || {});
  const regions = sanitizeRegions(level, saved.regions);
  const completed = isBoardComplete(level, regions);

  state = {
    level,
    regions,
    history: [],
    selectedRegionId: null,
    keyboardAnchor: null,
    moves: options.fresh ? 0 : numeric(saved.moves),
    elapsed: options.fresh ? 0 : numeric(saved.elapsed),
    hintsUsed: options.fresh ? 0 : Math.min(3, numeric(saved.hintsUsed)),
    undoCount: options.fresh ? 0 : numeric(saved.undoCount),
    resets: options.fresh ? 0 : numeric(saved.resets),
    nextColor: options.fresh ? regions.length : numeric(saved.nextColor, regions.length),
    completed,
    lastNewRegionId: null
  };

  store.currentLevel = level.id;
  renderLevel();
  persist();
}

function persist() {
  if (!state) return;
  store.levels[state.level.id] = {
    ...(store.levels[state.level.id] || {}),
    regions: cloneRegions(state.regions),
    moves: state.moves,
    elapsed: state.elapsed,
    hintsUsed: state.hintsUsed,
    undoCount: state.undoCount,
    resets: state.resets,
    nextColor: state.nextColor
  };
  store.currentLevel = state.level.id;
  saveGameStore(store);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function calculateStars() {
  if (!state) return 3;
  const efficient = state.moves <= state.level.clues.length + 2;
  if (state.hintsUsed === 0 && state.undoCount <= 1 && state.resets === 0 && efficient) return 3;
  if (state.hintsUsed <= 2 && state.undoCount <= 3 && state.resets <= 1) return 2;
  return 1;
}

function coveredCellCount() {
  return state.regions.reduce((sum, region) => sum + rectArea(region), 0);
}

function renderLevel() {
  const { level } = state;
  elements.board.classList.toggle("is-complete", state.completed);
  elements.boardGrid.style.gridTemplateColumns = `repeat(${level.columns}, minmax(0, 1fr))`;
  elements.boardGrid.style.gridTemplateRows = `repeat(${level.rows}, minmax(0, 1fr))`;
  elements.boardGrid.setAttribute("aria-rowcount", String(level.rows));
  elements.boardGrid.setAttribute("aria-colcount", String(level.columns));
  elements.boardGrid.innerHTML = "";

  const clueMap = new Map(level.clues.map((clue) => [cellKey(clue.row, clue.column), clue]));
  for (let row = 0; row < level.rows; row += 1) {
    for (let column = 0; column < level.columns; column += 1) {
      const clue = clueMap.get(cellKey(row, column));
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-rowindex", String(row + 1));
      cell.setAttribute("aria-colindex", String(column + 1));
      cell.setAttribute("aria-label", clue
        ? `${row + 1}. satır ${column + 1}. sütun, ${clue.value} sayısı`
        : `${row + 1}. satır ${column + 1}. sütun`);
      if (clue) {
        const badge = document.createElement("span");
        badge.className = "clue";
        badge.textContent = String(clue.value);
        cell.append(badge);
      }
      elements.boardGrid.append(cell);
    }
  }

  elements.levelLabel.textContent = `Bölüm ${level.id}`;
  elements.difficultyLabel.textContent = level.difficulty;
  hidePreview(elements.selectionPreview);
  hidePreview(elements.hintPreview);
  renderRegions();
  renderStats();
  setStatus(state.completed ? "Bölüm tamamlandı. Yeni bölüme geçebilirsin." : "Bir hücreden başlayıp dikdörtgen çiz.");
}

function positionOverlay(element, rect) {
  const { rows, columns } = state.level;
  element.style.left = `${(rect.column / columns) * 100}%`;
  element.style.top = `${(rect.row / rows) * 100}%`;
  element.style.width = `${(rect.width / columns) * 100}%`;
  element.style.height = `${(rect.height / rows) * 100}%`;
}

function coverageMap() {
  const map = new Map();
  state.regions.forEach((region) => {
    for (let row = region.row; row < region.row + region.height; row += 1) {
      for (let column = region.column; column < region.column + region.width; column += 1) {
        map.set(cellKey(row, column), region.id);
      }
    }
  });
  return map;
}

function renderRegions() {
  elements.regionLayer.innerHTML = "";
  state.regions.forEach((region) => {
    const item = document.createElement("div");
    item.className = "region";
    if (region.id === state.selectedRegionId) item.classList.add("is-selected");
    if (region.id === state.lastNewRegionId) item.classList.add("is-new");
    item.dataset.color = String(region.color);
    positionOverlay(item, region);
    elements.regionLayer.append(item);
  });

  const covered = coverageMap();
  elements.boardGrid.querySelectorAll(".cell").forEach((cell) => {
    const key = cellKey(Number(cell.dataset.row), Number(cell.dataset.column));
    const regionId = covered.get(key);
    if (regionId) cell.dataset.regionId = regionId;
    else delete cell.dataset.regionId;
  });

  state.lastNewRegionId = null;
  elements.deleteButton.disabled = !state.selectedRegionId;
}

function renderStats() {
  const total = state.level.rows * state.level.columns;
  const covered = coveredCellCount();
  const remainingHints = Math.max(0, 3 - state.hintsUsed);
  const stars = calculateStars();
  elements.progressText.textContent = `${covered} / ${total} hücre`;
  elements.progressFill.style.width = `${(covered / total) * 100}%`;
  elements.hintText.textContent = `${remainingHints} ipucu kaldı`;
  elements.timeValue.textContent = formatTime(state.elapsed);
  elements.moveValue.textContent = String(state.moves);
  elements.starValue.textContent = `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`;
  elements.starValue.setAttribute("aria-label", `${stars} yıldız mümkün`);
  elements.hintCount.textContent = String(remainingHints);
  elements.undoButton.disabled = state.history.length === 0;
  elements.hintButton.disabled = state.completed || remainingHints === 0;
  elements.nextButton.disabled = !state.completed || state.level.id >= LEVELS.length;
  elements.soundIcon.textContent = store.soundEnabled ? "♪" : "×";
  elements.soundButton.setAttribute("aria-label", store.soundEnabled ? "Sesi kapat" : "Sesi aç");
}

function setStatus(message, isError = false) {
  elements.boardStatus.textContent = message;
  elements.boardStatus.classList.toggle("is-error", isError);
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 1900);
}

function showPreview(element, rect, validityClass = "") {
  positionOverlay(element, rect);
  element.className = element === elements.hintPreview ? "hint-preview is-visible" : "selection-preview is-visible";
  if (validityClass) element.classList.add(validityClass);
}

function hidePreview(element) {
  element.classList.remove("is-visible", "is-valid", "is-invalid", "is-rejected");
}

function rejectSelection(rect, reason) {
  state.moves += 1;
  showPreview(elements.selectionPreview, rect, "is-invalid");
  elements.selectionPreview.classList.add("is-rejected");
  window.setTimeout(() => hidePreview(elements.selectionPreview), 230);
  setStatus(reason, true);
  showToast(reason);
  sound.play("wrong");
  vibrate(24);
  renderStats();
  persist();
}

function pushHistory() {
  state.history.push({
    regions: cloneRegions(state.regions),
    moves: state.moves,
    elapsed: state.elapsed,
    nextColor: state.nextColor,
    selectedRegionId: state.selectedRegionId,
    completed: state.completed
  });
  if (state.history.length > 80) state.history.shift();
}

function commitRectangle(rect, source = "pointer") {
  const result = validateRectangle(state.level, rect, state.regions);
  state.keyboardAnchor = null;
  if (!result.valid) {
    rejectSelection(rect, result.reason);
    return false;
  }

  pushHistory();
  state.moves += 1;
  state.completed = false;
  elements.board.classList.remove("is-complete");
  const id = `region-${Date.now()}-${state.moves}`;
  state.regions.push({
    ...rect,
    id,
    color: state.nextColor % REGION_COLORS
  });
  state.nextColor += 1;
  state.selectedRegionId = id;
  state.lastNewRegionId = id;
  hidePreview(elements.selectionPreview);
  setStatus(source === "keyboard" ? "Klavye seçimi eklendi." : "Doğru alan eklendi.");
  sound.play("correct");
  vibrate(12);
  renderRegions();
  renderStats();
  persist();
  checkCompletion();
  return true;
}

function cellFromPoint(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY)?.closest?.(".cell");
  return target && elements.boardGrid.contains(target) ? target : null;
}

function coordinates(cell) {
  return { row: Number(cell.dataset.row), column: Number(cell.dataset.column) };
}

function updateDrag(clientX, clientY) {
  if (!drag) return;
  const cell = cellFromPoint(clientX, clientY);
  if (!cell) {
    drag.outside = true;
    elements.selectionPreview.classList.add("is-invalid");
    elements.selectionPreview.classList.remove("is-valid");
    return;
  }
  drag.outside = false;
  drag.current = coordinates(cell);
  const rect = normalizeRect(drag.start, drag.current);
  const valid = validateRectangle(state.level, rect, state.regions).valid;
  showPreview(elements.selectionPreview, rect, valid ? "is-valid" : "is-invalid");
}

function finishDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  updateDrag(event.clientX, event.clientY);
  const currentDrag = drag;
  drag = null;
  if (currentDrag.outside) {
    const rect = normalizeRect(currentDrag.start, currentDrag.current);
    rejectSelection(rect, "Seçimi tahta sınırları içinde bitirmelisin.");
    return;
  }
  commitRectangle(normalizeRect(currentDrag.start, currentDrag.current));
}

function selectRegion(regionId) {
  state.selectedRegionId = regionId || null;
  state.keyboardAnchor = null;
  hidePreview(elements.selectionPreview);
  sound.play("select");
  renderRegions();
  setStatus(regionId ? "Alan seçildi. İstersen silebilirsin." : "Bir hücreden başlayıp dikdörtgen çiz.");
}

function deleteSelectedRegion() {
  if (!state.selectedRegionId) return;
  const index = state.regions.findIndex((region) => region.id === state.selectedRegionId);
  if (index < 0) return;
  pushHistory();
  state.regions.splice(index, 1);
  state.selectedRegionId = null;
  state.moves += 1;
  state.completed = false;
  elements.board.classList.remove("is-complete");
  renderRegions();
  renderStats();
  setStatus("Seçili alan silindi.");
  persist();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  state.regions = cloneRegions(previous.regions);
  state.moves = previous.moves;
  state.elapsed = previous.elapsed;
  state.nextColor = previous.nextColor;
  state.selectedRegionId = previous.selectedRegionId;
  state.completed = previous.completed && isBoardComplete(state.level, state.regions);
  state.undoCount += 1;
  state.keyboardAnchor = null;
  elements.board.classList.toggle("is-complete", state.completed);
  hidePreview(elements.selectionPreview);
  renderRegions();
  renderStats();
  setStatus("Son işlem geri alındı.");
  sound.play("select");
  persist();
}

function sameRectangle(a, b) {
  return rectKey(a) === rectKey(b);
}

function nextHintTarget(requireFree = false) {
  const unsolved = state.level.solution.filter((solution) => !state.regions.some((region) => sameRectangle(region, solution)));
  if (!requireFree) return unsolved[0] || null;
  return unsolved.find((solution) => !state.regions.some((region) => overlaps(region, solution))) || null;
}

function useHint() {
  if (state.hintsUsed >= 3 || state.completed) return;
  const stage = state.hintsUsed;
  const target = nextHintTarget(stage === 2);
  if (!target) {
    showToast(stage === 2 ? "Önce çözümü kapatan alanı sil veya geri al." : "Gösterilecek alan kalmadı.");
    return;
  }

  if (stage === 0) {
    const clue = state.level.clues.find((item) => containsCell(target, item.row, item.column));
    const badge = elements.boardGrid.querySelector(`[data-row="${clue.row}"][data-column="${clue.column}"] .clue`);
    badge?.classList.remove("is-hinting");
    requestAnimationFrame(() => badge?.classList.add("is-hinting"));
    showToast("Bu sayıdan başlayabilirsin.");
    setStatus("Parlayan sayı için uygun dikdörtgeni bul.");
    sound.play("select");
  } else if (stage === 1) {
    clearTimeout(hintTimer);
    showPreview(elements.hintPreview, target);
    hintTimer = window.setTimeout(() => hidePreview(elements.hintPreview), 1800);
    showToast("Doğru alanın iki köşesi gösteriliyor.");
    setStatus("İşaretli köşeler arasında bir dikdörtgen çiz.");
    sound.play("select");
  } else {
    pushHistory();
    const id = `hint-${Date.now()}`;
    state.regions.push({ ...target, id, color: state.nextColor % REGION_COLORS });
    state.nextColor += 1;
    state.moves += 1;
    state.selectedRegionId = id;
    state.lastNewRegionId = id;
    showToast("Bir alan senin için tamamlandı.");
    setStatus("İpucu alanı eklendi. Kalan bölgeleri sen tamamla.");
    sound.play("correct");
    vibrate(12);
  }

  state.hintsUsed += 1;
  renderRegions();
  renderStats();
  persist();
  if (stage === 2) checkCompletion();
}

function completeLevelRecord(stars) {
  const previous = store.completed[state.level.id] || {};
  store.completed[state.level.id] = {
    stars: Math.max(numeric(previous.stars), stars),
    bestTime: previous.bestTime ? Math.min(numeric(previous.bestTime), state.elapsed) : state.elapsed,
    minMoves: previous.minMoves ? Math.min(numeric(previous.minMoves), state.moves) : state.moves,
    hintsUsed: state.hintsUsed
  };
  store.lastUnlocked = Math.min(LEVELS.length, Math.max(store.lastUnlocked, state.level.id + 1));
}

function checkCompletion() {
  if (!isBoardComplete(state.level, state.regions)) return false;
  state.completed = true;
  clearTimeout(toastTimer);
  elements.toast.hidden = true;
  elements.board.classList.add("is-complete");
  const stars = calculateStars();
  completeLevelRecord(stars);
  renderStats();
  persist();
  sound.play("complete");
  vibrate([18, 30, 24]);
  launchConfetti();
  window.setTimeout(() => openSuccessModal(stars), 260);
  return true;
}

function launchConfetti() {
  elements.confetti.innerHTML = "";
  const symbols = ["♥", "✦", "❀"];
  for (let index = 0; index < 20; index += 1) {
    const piece = document.createElement("span");
    piece.textContent = symbols[index % symbols.length];
    piece.style.left = `${4 + Math.random() * 92}%`;
    piece.style.animationDelay = `${Math.random() * .28}s`;
    piece.style.setProperty("--drift", `${-60 + Math.random() * 120}px`);
    piece.style.color = ["#a93f6d", "#7960c1", "#d98237", "#4c9d78"][index % 4];
    elements.confetti.append(piece);
  }
  window.setTimeout(() => { elements.confetti.innerHTML = ""; }, 2400);
}

function resetLevel({ fresh = false } = {}) {
  if (!fresh) pushHistory();
  state.regions = [];
  state.selectedRegionId = null;
  state.keyboardAnchor = null;
  state.completed = false;
  state.moves = 0;
  state.elapsed = 0;
  state.nextColor = 0;
  if (fresh) {
    state.history = [];
    state.hintsUsed = 0;
    state.undoCount = 0;
    state.resets = 0;
  } else {
    state.resets += 1;
  }
  elements.board.classList.remove("is-complete");
  hidePreview(elements.selectionPreview);
  hidePreview(elements.hintPreview);
  renderRegions();
  renderStats();
  setStatus("Bölüm yeniden başladı.");
  persist();
}

function goToNextLevel() {
  if (!state.completed || state.level.id >= LEVELS.length) return;
  closeModal();
  loadLevel(state.level.id + 1);
}

function openModal(html, options = {}) {
  if (modalState) closeModal(false);
  modalState = {
    previousFocus: document.activeElement,
    dismissible: options.dismissible !== false
  };
  elements.modal.innerHTML = html;
  elements.modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    elements.modal.querySelector("button, [href], [tabindex]:not([tabindex='-1'])")?.focus();
  });
}

function closeModal(restoreFocus = true) {
  if (!modalState) return;
  const previousFocus = modalState.previousFocus;
  modalState = null;
  elements.modalBackdrop.hidden = true;
  elements.modal.innerHTML = "";
  document.body.style.overflow = "";
  if (restoreFocus && previousFocus instanceof HTMLElement) previousFocus.focus();
}

function openTutorial() {
  store.tutorialSeen = true;
  saveGameStore(store);
  openModal(`
    <div class="modal-mark" aria-hidden="true">4</div>
    <h2 id="modalTitle">Alanları nasıl bölersin?</h2>
    <p>Bir sayıyı, değeri kadar hücre içeren tek bir dikdörtgenle buluştur.</p>
    <div class="tutorial-demo" aria-hidden="true"><i></i><i></i><i></i><i></i><strong>4</strong></div>
    <ol class="tutorial-list">
      <li><span>1</span>Bir sayıdan başlayarak sürükle.</li>
      <li><span>2</span>Sayının değeri kadar hücre seç.</li>
      <li><span>3</span>Bütün alanı boşluk bırakmadan tamamla.</li>
    </ol>
    <div class="modal-actions">
      <button class="modal-button modal-button--primary" id="tutorialClose" type="button" aria-label="Öğreticiyi kapat">Anladım</button>
    </div>
  `);
  document.getElementById("tutorialClose")?.addEventListener("click", () => closeModal());
}

function openResetModal() {
  openModal(`
    <div class="modal-mark" aria-hidden="true">↻</div>
    <h2 id="modalTitle">Bölüm sıfırlansın mı?</h2>
    <p>Tahtadaki alanlar temizlenir. Bu işlemi daha sonra geri alabilirsin.</p>
    <div class="modal-actions">
      <button class="modal-button" id="resetCancel" type="button" aria-label="Sıfırlamadan vazgeç">Vazgeç</button>
      <button class="modal-button modal-button--primary" id="resetConfirm" type="button" aria-label="Bölümü sıfırlamayı onayla">Sıfırla</button>
    </div>
  `);
  document.getElementById("resetCancel")?.addEventListener("click", () => closeModal());
  document.getElementById("resetConfirm")?.addEventListener("click", () => {
    closeModal();
    resetLevel();
  });
}

function openLevelPicker() {
  const buttons = LEVELS.map((level) => {
    const unlocked = level.id <= store.lastUnlocked;
    const complete = Boolean(store.completed[level.id]);
    const classes = ["level-choice", level.id === state.level.id ? "is-current" : "", complete ? "is-complete" : ""].filter(Boolean).join(" ");
    const stars = complete ? `, ${store.completed[level.id].stars} yıldız` : "";
    return `<button class="${classes}" type="button" data-level="${level.id}" ${unlocked ? "" : "disabled"} aria-label="Bölüm ${level.id}${unlocked ? stars : ", kilitli"}">${level.id}</button>`;
  }).join("");
  openModal(`
    <div class="modal-mark" aria-hidden="true">▦</div>
    <h2 id="modalTitle">Bölüm seç</h2>
    <p>Tamamladıkça yeni bölümler açılır.</p>
    <div class="level-grid">${buttons}</div>
    <div class="modal-actions">
      <button class="modal-button modal-button--primary" id="levelClose" type="button" aria-label="Bölüm seçiciyi kapat">Kapat</button>
    </div>
  `);
  elements.modal.querySelectorAll("[data-level]").forEach((button) => {
    button.addEventListener("click", () => {
      const levelId = Number(button.dataset.level);
      closeModal(false);
      loadLevel(levelId);
    });
  });
  document.getElementById("levelClose")?.addEventListener("click", () => closeModal());
}

function openSuccessModal(stars) {
  const message = SUCCESS_MESSAGES[(state.level.id - 1) % SUCCESS_MESSAGES.length];
  const hasNext = state.level.id < LEVELS.length;
  openModal(`
    <div class="modal-mark" aria-hidden="true">♥</div>
    <h2 id="modalTitle">${message}</h2>
    <p>Bölüm ${state.level.id} tamamlandı.</p>
    <div class="stars-large" aria-label="${stars} yıldız">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>
    <div class="result-stats">
      <div><span>Süre</span><strong>${formatTime(state.elapsed)}</strong></div>
      <div><span>Hamle</span><strong>${state.moves}</strong></div>
    </div>
    <div class="modal-actions">
      <button class="modal-button" id="replayButton" type="button" aria-label="Bölümü tekrar oyna">Tekrar Oyna</button>
      <button class="modal-button modal-button--primary" id="modalNextButton" type="button" aria-label="${hasNext ? "Sonraki bölüme geç" : "Tüm bölümler tamamlandı"}" ${hasNext ? "" : "disabled"}>${hasNext ? "Sonraki Bölüm" : "Tüm Bölümler Bitti"}</button>
    </div>
  `);
  document.getElementById("replayButton")?.addEventListener("click", () => {
    closeModal();
    resetLevel({ fresh: true });
  });
  document.getElementById("modalNextButton")?.addEventListener("click", goToNextLevel);
}

function handleModalKeydown(event) {
  if (!modalState) return;
  if (event.key === "Escape" && modalState.dismissible) {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...elements.modal.querySelectorAll("button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleBoardKeydown(event) {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const current = coordinates(cell);
  const movement = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1]
  }[event.key];
  if (movement) {
    event.preventDefault();
    const row = Math.min(state.level.rows - 1, Math.max(0, current.row + movement[0]));
    const column = Math.min(state.level.columns - 1, Math.max(0, current.column + movement[1]));
    elements.boardGrid.querySelector(`[data-row="${row}"][data-column="${column}"]`)?.focus();
    return;
  }
  if (event.key === "Escape") {
    state.keyboardAnchor = null;
    hidePreview(elements.selectionPreview);
    selectRegion(null);
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  if (cell.dataset.regionId) {
    selectRegion(cell.dataset.regionId);
    return;
  }
  if (!state.keyboardAnchor) {
    state.keyboardAnchor = current;
    showPreview(elements.selectionPreview, { ...current, width: 1, height: 1 }, "is-invalid");
    setStatus("İlk köşe seçildi. Ok tuşlarıyla diğer köşeye git ve Enter'a bas.");
    sound.play("select");
  } else {
    commitRectangle(normalizeRect(state.keyboardAnchor, current), "keyboard");
  }
}

function bindEvents() {
  elements.board.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const cell = event.target.closest(".cell");
    if (!cell) return;
    event.preventDefault();
    if (cell.dataset.regionId) {
      selectRegion(cell.dataset.regionId);
      return;
    }
    const start = coordinates(cell);
    state.selectedRegionId = null;
    renderRegions();
    drag = { pointerId: event.pointerId, start, current: start, outside: false };
    elements.board.setPointerCapture(event.pointerId);
    updateDrag(event.clientX, event.clientY);
    sound.play("select");
  });
  elements.board.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    updateDrag(event.clientX, event.clientY);
  });
  elements.board.addEventListener("pointerup", finishDrag);
  elements.board.addEventListener("pointercancel", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    hidePreview(elements.selectionPreview);
    setStatus("Seçim iptal edildi.");
  });
  elements.boardGrid.addEventListener("keydown", handleBoardKeydown);

  elements.soundButton.addEventListener("click", () => {
    store.soundEnabled = !store.soundEnabled;
    sound.setEnabled(store.soundEnabled);
    if (store.soundEnabled) sound.play("select");
    saveGameStore(store);
    renderStats();
    showToast(store.soundEnabled ? "Ses açıldı." : "Ses kapatıldı.");
  });
  elements.helpButton.addEventListener("click", openTutorial);
  elements.levelButton.addEventListener("click", openLevelPicker);
  elements.deleteButton.addEventListener("click", deleteSelectedRegion);
  elements.undoButton.addEventListener("click", undo);
  elements.hintButton.addEventListener("click", useHint);
  elements.resetButton.addEventListener("click", openResetModal);
  elements.nextButton.addEventListener("click", goToNextLevel);
  elements.modalBackdrop.addEventListener("pointerdown", (event) => {
    if (event.target === elements.modalBackdrop && modalState?.dismissible) closeModal();
  });
  document.addEventListener("keydown", handleModalKeydown);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) persist();
  });
  window.addEventListener("pagehide", persist);
}

function startTimer() {
  clearInterval(timerId);
  timerId = window.setInterval(() => {
    if (!document.hidden && state && !state.completed && !modalState) {
      state.elapsed += 1;
      elements.timeValue.textContent = formatTime(state.elapsed);
      if (state.elapsed % 5 === 0) persist();
    }
  }, 1000);
}

function boot() {
  bindEvents();
  const requested = Number(new URLSearchParams(location.search).get("level"));
  const initial = Number.isInteger(requested) && requested <= store.lastUnlocked
    ? requested
    : Math.min(store.currentLevel, store.lastUnlocked);
  loadLevel(initial);
  startTimer();
  if (!store.tutorialSeen) window.setTimeout(openTutorial, 280);
}

boot();
