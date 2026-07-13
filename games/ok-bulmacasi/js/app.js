import { CHAPTER_NAMES, CHAPTER_SIZE, TOTAL_LEVELS, chapterOf, chapterRange, difficultyLabel, getLevel } from "./levels.js";
import { DIRECTIONS, getPullablePieces, isPullable } from "./engine.js";
import { loadGameStore, saveGameStore } from "./storage.js";
import { GameSound, vibrate } from "./sound.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CELL = 64;
const START_LIVES = 3;
const START_HINTS = 3;

const dom = {
  board: document.getElementById("board"),
  boardSvg: document.getElementById("boardSvg"),
  boardStatus: document.getElementById("boardStatus"),
  levelButton: document.getElementById("levelButton"),
  levelLabel: document.getElementById("levelLabel"),
  difficultyLabel: document.getElementById("difficultyLabel"),
  livesHearts: document.getElementById("livesHearts"),
  progressFill: document.getElementById("progressFill"),
  remainingValue: document.getElementById("remainingValue"),
  livesValue: document.getElementById("livesValue"),
  starValue: document.getElementById("starValue"),
  hintButton: document.getElementById("hintButton"),
  hintCount: document.getElementById("hintCount"),
  resetButton: document.getElementById("resetButton"),
  nextButton: document.getElementById("nextButton"),
  soundButton: document.getElementById("soundButton"),
  soundIcon: document.getElementById("soundIcon"),
  helpButton: document.getElementById("helpButton"),
  toast: document.getElementById("toast"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  modal: document.getElementById("modal"),
  confetti: document.getElementById("confetti")
};

let store = loadGameStore();
const sound = new GameSound(store.soundEnabled);

const state = {
  levelId: store.currentLevel,
  level: null,
  pieces: [],
  lives: START_LIVES,
  hintsLeft: START_HINTS,
  pickerChapter: 1
};

let toastTimer = null;

function clampLevelId(id) {
  return Math.min(TOTAL_LEVELS, Math.max(1, id));
}

function loadLevel(id) {
  state.levelId = clampLevelId(id);
  state.level = getLevel(state.levelId);
  state.pieces = state.level.pieces.map((piece) => ({ ...piece }));
  state.lives = START_LIVES;
  state.hintsLeft = START_HINTS;

  dom.board.classList.remove("is-complete");
  dom.nextButton.disabled = true;

  renderBoard();
  renderLevelMeta();
  updateStats();
  setStatus("Bir yola dokunarak başla.");
}

function renderLevelMeta() {
  dom.levelLabel.textContent = `Bölüm ${state.levelId}`;
  dom.difficultyLabel.textContent = difficultyLabel(state.levelId);
}

/* ============================= BOARD (SVG) ============================= */

function toPointsAttr(points) {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function pieceGeometry(piece) {
  const centers = piece.cells.map((cell) => [cell.col * CELL + CELL / 2, cell.row * CELL + CELL / 2]);
  const { dr, dc } = DIRECTIONS[piece.exitDir];
  const dx = dc;
  const dy = dr;
  const last = centers[centers.length - 1];
  const lineEnd = [last[0] + dx * CELL * 0.55, last[1] + dy * CELL * 0.55];
  const tip = [last[0] + dx * CELL * 0.95, last[1] + dy * CELL * 0.95];
  const perp = [-dy, dx];
  const halfWidth = CELL * 0.22;
  const baseLeft = [lineEnd[0] + perp[0] * halfWidth, lineEnd[1] + perp[1] * halfWidth];
  const baseRight = [lineEnd[0] - perp[0] * halfWidth, lineEnd[1] - perp[1] * halfWidth];
  return { linePoints: [...centers, lineEnd], arrowPoints: [tip, baseLeft, baseRight] };
}

function buildPieceElement(piece) {
  const geometry = pieceGeometry(piece);
  const width = CELL * 0.3;

  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "piece");
  g.dataset.pieceId = String(piece.id);
  g.style.setProperty("--piece-width", String(width));

  const line = document.createElementNS(SVG_NS, "polyline");
  line.setAttribute("class", "piece-line");
  line.setAttribute("points", toPointsAttr(geometry.linePoints));
  line.setAttribute("stroke-width", String(width));

  const arrow = document.createElementNS(SVG_NS, "polygon");
  arrow.setAttribute("class", "piece-arrow");
  arrow.setAttribute("points", toPointsAttr(geometry.arrowPoints));

  g.append(line, arrow);
  return g;
}

function renderBoard() {
  const { rows, cols } = state.level;
  dom.boardSvg.setAttribute("viewBox", `0 0 ${cols * CELL} ${rows * CELL}`);
  dom.boardSvg.innerHTML = "";
  dom.board.style.setProperty("--board-ratio", (cols / rows).toFixed(4));

  const fragment = document.createDocumentFragment();
  state.pieces.forEach((piece) => fragment.appendChild(buildPieceElement(piece)));
  dom.boardSvg.appendChild(fragment);
}

function findPieceElement(id) {
  return dom.boardSvg.querySelector(`[data-piece-id="${id}"]`);
}

function handleBoardClick(event) {
  const target = event.target.closest("[data-piece-id]");
  if (!target || target.classList.contains("is-leaving")) return;

  const pieceId = Number(target.dataset.pieceId);
  const piece = state.pieces.find((item) => item.id === pieceId);
  if (!piece) return;

  const remainingIds = new Set(state.pieces.map((item) => item.id));
  if (isPullable(piece, remainingIds)) {
    pullPiece(piece, target);
  } else {
    rejectPiece(target);
  }
}

function pullPiece(piece, g) {
  sound.play("move");
  vibrate(12);

  const { dr, dc } = DIRECTIONS[piece.exitDir];
  const distance = (state.level.rows + state.level.cols + 6) * CELL;
  g.style.setProperty("--exit-x", `${dc * distance}px`);
  g.style.setProperty("--exit-y", `${dr * distance}px`);
  g.classList.add("is-leaving");

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    g.removeEventListener("transitionend", finish);
    g.remove();
    state.pieces = state.pieces.filter((item) => item.id !== piece.id);
    updateStats();
    if (state.pieces.length === 0) {
      completeLevel();
    } else {
      setStatus(`${state.pieces.length} yol kaldı.`);
    }
  };

  g.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, 340);
}

function rejectPiece(g) {
  sound.play("blocked");
  vibrate([30, 40, 30]);
  g.classList.add("is-shaking");
  setTimeout(() => g.classList.remove("is-shaking"), 260);
  loseLife();
}

function loseLife() {
  state.lives -= 1;
  updateStats();
  if (state.lives <= 0) {
    setStatus("Canların bitti!", true);
    failLevel();
  } else {
    setStatus("Bu yolun çıkışı kapalı, can gitti.", true);
  }
}

function updateStats() {
  const total = state.level.pieces.length;
  const remaining = state.pieces.length;
  const cleared = total - remaining;

  dom.remainingValue.textContent = String(remaining);
  dom.livesValue.textContent = String(Math.max(0, state.lives));
  dom.progressFill.style.width = `${total ? (cleared / total) * 100 : 0}%`;
  dom.hintCount.textContent = String(state.hintsLeft);
  dom.hintButton.disabled = state.hintsLeft <= 0;

  dom.livesHearts.innerHTML = Array.from({ length: START_LIVES }, (_, index) => (
    index < state.lives ? "♥" : '<span class="is-lost">♥</span>'
  )).join("");
}

function setStatus(message, isError = false) {
  dom.boardStatus.textContent = message;
  dom.boardStatus.classList.toggle("is-error", isError);
}

function showToast(message) {
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 2200);
}

function useHint() {
  if (state.hintsLeft <= 0) {
    showToast("İpucu kalmadı.");
    return;
  }
  const remainingIds = new Set(state.pieces.map((item) => item.id));
  const pullable = getPullablePieces(state.pieces, remainingIds);
  if (!pullable.length) return;

  const pick = pullable[Math.floor(Math.random() * pullable.length)];
  state.hintsLeft -= 1;
  updateStats();
  sound.play("hint");
  findPieceElement(pick.id)?.classList.add("is-hinting");
  setTimeout(() => findPieceElement(pick.id)?.classList.remove("is-hinting"), 1300);
  showToast("Bu yol şimdi güvenle çekilebilir.");
}

function completeLevel() {
  sound.play("win");
  vibrate([20, 30, 20, 30, 60]);
  dom.board.classList.add("is-complete");
  setStatus("Bölüm tamamlandı!");
  spawnConfetti();

  const stars = Math.max(1, Math.min(START_LIVES, state.lives));
  store = loadGameStore();
  store.stars[state.levelId] = Math.max(store.stars[state.levelId] || 0, stars);
  store.currentLevel = state.levelId;
  store.lastUnlocked = Math.max(store.lastUnlocked, clampLevelId(state.levelId + 1));
  saveGameStore(store);

  dom.nextButton.disabled = state.levelId >= TOTAL_LEVELS;
  openWinModal(stars);
}

function failLevel() {
  sound.play("fail");
  vibrate([80, 50, 80]);
  openFailModal();
}

/* ============================= MODAL / TOAST ============================= */

function openModal(html) {
  dom.modal.innerHTML = html;
  dom.modalBackdrop.hidden = false;
}

function closeModal() {
  dom.modalBackdrop.hidden = true;
  dom.modal.innerHTML = "";
}

function starsMarkup(count) {
  return "★".repeat(count) + "☆".repeat(START_LIVES - count);
}

function openWinModal(stars) {
  openModal(`
    <div class="modal-mark">✓</div>
    <h2 id="modalTitle">Bölüm ${state.levelId} tamamlandı!</h2>
    <p>Tüm yolları tahtadan çektin.</p>
    <div class="stars-large" aria-label="${stars} yıldız">${starsMarkup(stars)}</div>
    <div class="result-stats">
      <div><span>Kalan Can</span><strong>${state.lives}</strong></div>
      <div><span>Toplam Yol</span><strong>${state.level.pieces.length}</strong></div>
    </div>
    <div class="modal-actions">
      <button class="modal-button" type="button" data-action="retry">Tekrar Oyna</button>
      ${state.levelId < TOTAL_LEVELS
        ? '<button class="modal-button modal-button--primary" type="button" data-action="next">Sonraki Bölüm</button>'
        : '<button class="modal-button modal-button--primary" type="button" data-action="close">Kapat</button>'}
    </div>
  `);
}

function openFailModal() {
  openModal(`
    <div class="modal-mark modal-mark--fail">✕</div>
    <h2 id="modalTitle">Canların bitti</h2>
    <p>Çıkışı kapalı bir yola dokununca can gider. Bölümü yeniden dene.</p>
    <div class="modal-actions">
      <button class="modal-button" type="button" data-action="picker">Bölüm Seç</button>
      <button class="modal-button modal-button--primary" type="button" data-action="retry">Tekrar Dene</button>
    </div>
  `);
}

function openHelpModal() {
  openModal(`
    <div class="modal-mark">?</div>
    <h2 id="modalTitle">Nasıl Oynanır</h2>
    <ul class="tutorial-list">
      <li><span>👉</span> Bir yola dokun, ok yönünde tahtadan çekilsin.</li>
      <li><span>🚧</span> Çıkış yolunda başka bir yol varsa çekilmez ve can gider.</li>
      <li><span>♥</span> 3 canın var; canlar biterse bölüm yeniden başlar.</li>
      <li><span>✦</span> İpucu, o an güvenle çekilebilecek bir yolu gösterir.</li>
      <li><span>★</span> Tüm yolları temizle, kalan canına göre yıldız kazan.</li>
    </ul>
    <div class="modal-actions">
      <button class="modal-button modal-button--primary" type="button" data-action="close">Anladım</button>
    </div>
  `);
}

function openLevelPicker() {
  state.pickerChapter = chapterOf(state.levelId);
  openModal(renderPickerHtml());
}

function renderPickerHtml() {
  const chapter = state.pickerChapter;
  const { first, last } = chapterRange(chapter);
  const tabs = CHAPTER_NAMES.map((name, index) => {
    const chapterId = index + 1;
    const { first: chapterFirst } = chapterRange(chapterId);
    const locked = chapterFirst > store.lastUnlocked;
    return `<button class="chapter-tab${chapterId === chapter ? " is-active" : ""}" type="button" data-chapter="${chapterId}" ${locked ? "disabled" : ""}>${chapterId}</button>`;
  }).join("");

  const levels = [];
  for (let id = first; id <= last; id += 1) {
    const locked = id > store.lastUnlocked;
    const isCurrent = id === state.levelId;
    const stars = store.stars[id] || 0;
    const classes = ["level-choice", isCurrent ? "is-current" : "", stars > 0 ? "is-complete" : ""].filter(Boolean).join(" ");
    levels.push(`<button class="${classes}" type="button" data-level="${id}" ${locked ? "disabled" : ""}>${id}</button>`);
  }

  return `
    <div class="modal-mark">☰</div>
    <h2 id="modalTitle">Bölüm Seç</h2>
    <p>${CHAPTER_NAMES[chapter - 1]} — Bölüm ${first}-${last}</p>
    <nav class="chapter-tabs" aria-label="Grup seç">${tabs}</nav>
    <div class="level-grid" aria-label="Bölümler">${levels.join("")}</div>
    <p class="chapter-caption">★ tamamlanan bölümleri gösterir.</p>
    <div class="modal-actions">
      <button class="modal-button" type="button" data-action="close">Kapat</button>
    </div>
  `;
}

function handleModalClick(event) {
  const chapterButton = event.target.closest("[data-chapter]");
  if (chapterButton) {
    state.pickerChapter = Number(chapterButton.dataset.chapter);
    dom.modal.innerHTML = renderPickerHtml();
    return;
  }

  const levelButton = event.target.closest("[data-level]");
  if (levelButton) {
    loadLevel(Number(levelButton.dataset.level));
    store = loadGameStore();
    store.currentLevel = state.levelId;
    saveGameStore(store);
    closeModal();
    return;
  }

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;

  if (action === "close") closeModal();
  else if (action === "retry") { closeModal(); loadLevel(state.levelId); }
  else if (action === "next") { closeModal(); loadLevel(state.levelId + 1); }
  else if (action === "picker") { openLevelPicker(); }
}

/* ============================= CONFETTI ============================= */

function spawnConfetti() {
  const pieces = ["✦", "✧", "❋", "✺", "✹"];
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 22; index += 1) {
    const span = document.createElement("span");
    span.textContent = pieces[index % pieces.length];
    span.style.left = `${Math.random() * 100}%`;
    span.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
    span.style.animationDelay = `${Math.random() * 0.3}s`;
    fragment.appendChild(span);
  }
  dom.confetti.innerHTML = "";
  dom.confetti.appendChild(fragment);
  setTimeout(() => { dom.confetti.innerHTML = ""; }, 2200);
}

/* ============================= INIT ============================= */

function updateSoundIcon() {
  dom.soundIcon.textContent = store.soundEnabled ? "♪" : "✕";
  dom.soundButton.setAttribute("aria-label", store.soundEnabled ? "Sesi kapat" : "Sesi aç");
}

function init() {
  dom.boardSvg.addEventListener("click", handleBoardClick);
  dom.hintButton.addEventListener("click", useHint);
  dom.resetButton.addEventListener("click", () => loadLevel(state.levelId));
  dom.nextButton.addEventListener("click", () => loadLevel(state.levelId + 1));
  dom.levelButton.addEventListener("click", openLevelPicker);
  dom.helpButton.addEventListener("click", openHelpModal);
  dom.modal.addEventListener("click", handleModalClick);
  dom.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.modalBackdrop.hidden) closeModal();
  });

  dom.soundButton.addEventListener("click", () => {
    store = loadGameStore();
    store.soundEnabled = !store.soundEnabled;
    saveGameStore(store);
    sound.setEnabled(store.soundEnabled);
    updateSoundIcon();
  });

  updateSoundIcon();
  loadLevel(store.currentLevel);

  if (!store.tutorialSeen) {
    openHelpModal();
    store = loadGameStore();
    store.tutorialSeen = true;
    saveGameStore(store);
  }
}

init();
