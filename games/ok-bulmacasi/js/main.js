import { TOTAL_LEVELS, chapterOf } from "./levels.js";
import { BoardRenderer } from "./render.js";
import {
  PULL_BLOCKED, PULL_OK, START_LIVES, attemptPull, clampLevelId, commitPull, createGame,
  gameStats, pullablePieces, restartGame, undoPull, useHint
} from "./state.js";
import { renderChapterCaption, renderChapterTabs, renderLevelGrid } from "./screens.js?v=10";
import { loadProgress, recordResult, resetProgress, saveProgress, serializeSession, updateProgress } from "./storage.js?v=10";

const WIN_DELAY = 380;
const DEBUG = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("debug") === "1";
const TUTORIALS = {
  1: "Yolu açık olan oka dokun.",
  2: "Önünde başka çizgi varsa önce engeli kaldır.",
  3: "Yalnızca uca değil, bütün okun hareket yoluna bak.",
  4: "Bir hamleyi geri getirmek için Geri al'ı kullan.",
  5: "Takılırsan İpucu güvenli bir oku gösterir."
};

const byId = (id) => document.getElementById(id);
const dom = {
  screens: { home: byId("screenHome"), levels: byId("screenLevels"), game: byId("screenGame") },
  continueLevel: byId("continueLevel"), play: byId("playButton"), newGame: byId("newGameButton"), daily: byId("dailyButton"), levelsButton: byId("levelsButton"), backHome: byId("backHome"),
  chapterTabs: byId("chapterTabs"), chapterCaption: byId("chapterCaption"), levelGrid: byId("levelGrid"),
  backToLevels: byId("backToLevels"), levelTag: byId("levelTag"), hearts: byId("hearts"), progressFill: byId("progressFill"),
  board: byId("board"), boardSvg: byId("boardSvg"), gameStatus: byId("gameStatus"), collisionNote: byId("collisionNote"), tutorial: byId("tutorial"),
  restart: byId("restartButton"), undo: byId("undoButton"), hint: byId("hintButton"), fit: byId("fitButton"),
  modalLayer: byId("modalLayer"), resultModal: byId("resultModal"), settingsModal: byId("settingsModal"), confirmModal: byId("confirmModal"),
  resultTitle: byId("resultTitle"), resultSymbol: byId("resultSymbol"), resultMessage: byId("resultMessage"), resultPrimary: byId("resultPrimary"), resultReplay: byId("resultReplay"), resultLevels: byId("resultLevels"),
  settingsClose: byId("closeSettings"), resetData: byId("resetDataButton"), confirmTitle: byId("confirmTitle"), confirmMessage: byId("confirmMessage"), confirmYes: byId("confirmYes"), confirmNo: byId("confirmNo")
};

const renderer = new BoardRenderer(dom.boardSvg);
let progress = loadProgress();
let game = null;
let pickerChapter = chapterOf(progress.currentLevel);
let inputLocked = false;
let activeModal = null;
let modalReturnFocus = null;
let confirmAction = null;
let audioContext = null;
const debugPanel = DEBUG ? Object.assign(document.createElement("output"), { className: "debug-panel" }) : null;
if (debugPanel) document.body.appendChild(debugPanel);

function buzz(pattern) {
  if (!progress.settings.vibration) return;
  try { navigator.vibrate?.(pattern); } catch { /* optional */ }
}

function tone(frequency, duration = 0.06) {
  if (!progress.settings.sound) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  } catch { /* optional */ }
}

function applySettings() {
  const resolvedMode = window.RavzaGameTheme?.getState().resolvedMode
    || document.documentElement.dataset.resolvedTheme
    || (progress.settings.dark ? "dark" : "light");
  const isDark = resolvedMode === "dark";
  document.documentElement.classList.toggle("theme-dark", isDark);
  document.documentElement.classList.toggle("thick-lines", progress.settings.thickLines);
  document.documentElement.classList.toggle("reduce-motion", progress.settings.reducedMotion);
  document.querySelectorAll("[data-setting]").forEach((input) => {
    input.checked = input.dataset.setting === "dark"
      ? isDark
      : Boolean(progress.settings[input.dataset.setting]);
  });
}

function showScreen(name) {
  closeModal();
  Object.entries(dom.screens).forEach(([key, element]) => { element.hidden = key !== name; });
  document.body.dataset.screen = name;
  if (name === "levels") paintPicker();
  if (name === "home") {
    dom.continueLevel.textContent = progress.currentLevel;
    byId("completedCount").textContent = Object.keys(progress.completed).filter((id) => progress.completed[id]).length;
    byId("perfectCount").textContent = Object.values(progress.best).filter((result) => result.perfect).length;
    dom.play.hidden = !progress.session;
    const today = new Date().toISOString().slice(0, 10);
    byId("dailyStatus").textContent = progress.daily?.[today] ? "Bugünün bulmacası tamamlandı ✓" : "Bugünün özgün bulmacasını oyna";
  }
}

function saveGameSession() {
  if (!game || game.isDaily || game.status !== "playing") return;
  progress.session = serializeSession(game);
  progress.currentLevel = game.levelId;
  saveProgress(progress);
}

function paintPicker() {
  dom.chapterTabs.innerHTML = renderChapterTabs(pickerChapter, progress);
  dom.chapterCaption.textContent = renderChapterCaption(pickerChapter);
  dom.levelGrid.innerHTML = renderLevelGrid(pickerChapter, progress);
  requestAnimationFrame(() => dom.levelGrid.querySelector(".is-active")?.scrollIntoView({ block: "nearest" }));
}

function renderHud() {
  const total = game.level.pieces.length;
  const removed = total - game.pieces.length;
  dom.hearts.innerHTML = game.zen
    ? '<span class="zen-label">ZEN</span>'
    : Array.from({ length: START_LIVES }, (_, index) => `<span class="heart${index < game.lives ? "" : " is-lost"}">♥</span>`).join("");
  dom.hearts.setAttribute("aria-label", game.zen ? "Zen modu, sınırsız can" : `${game.lives} can kaldı`);
  dom.progressFill.style.width = `${(removed / total) * 100}%`;
  dom.undo.disabled = game.history.length === 0;
  dom.gameStatus.textContent = `Bölüm ${game.levelId}, ${total} oktan ${removed} tanesi kaldırıldı, ${game.zen ? "Zen modu" : `${game.lives} kalp kaldı`}.`;
  if (DEBUG) {
    const safe = pullablePieces(game).map((piece) => piece.id);
    renderer.renderDebug(game, safe);
    debugPanel.textContent = `level=${game.levelId} remaining=${game.pieces.length} safe=[${safe.join(",")}] zoom=${renderer.zoom.toFixed(2)} pan=${renderer.panX.toFixed(1)},${renderer.panY.toFixed(1)}`;
  }
}

function showTutorial() {
  const copy = TUTORIALS[game.levelId];
  if (!copy || progress.tutorialSeen[game.levelId]) { dom.tutorial.hidden = true; return; }
  dom.tutorial.textContent = copy;
  dom.tutorial.hidden = false;
  if (game.levelId === 1) setTimeout(() => showHint(false), 350);
}

function startLevel(id, options = {}) {
  const levelId = clampLevelId(id);
  game = createGame(levelId, { zen: progress.settings.zen });
  game.isDaily = Boolean(options.daily);
  if (options.resume && progress.session?.levelId === levelId) {
    const session = progress.session;
    const removed = new Set(Array.isArray(session.removedIds) ? session.removedIds : []);
    game.pieces = game.pieces.filter((piece) => !removed.has(piece.id));
    game.lives = Math.max(1, Math.min(START_LIVES, Number(session.lives) || START_LIVES));
    game.errors = Math.max(0, Number(session.errors) || 0);
    game.hints = Math.max(0, Number(session.hints) || 0);
    game.history = Array.isArray(session.history) ? session.history.filter((pieceId) => removed.has(pieceId)) : [];
    game.startedAt = Date.now() - Math.max(0, Number(session.elapsedMs) || 0);
  }
  if (!game.isDaily) progress.currentLevel = levelId;
  progress.stats.plays += 1;
  saveProgress(progress);
  inputLocked = false;
  dom.levelTag.textContent = `Bölüm ${levelId}`;
  renderer.render(game);
  dom.board.classList.remove("is-clearing");
  dom.collisionNote.textContent = "";
  showScreen("game");
  renderHud();
  showTutorial();
  saveGameSession();
}

function dismissTutorial() {
  if (!game || dom.tutorial.hidden) return;
  progress.tutorialSeen[game.levelId] = true;
  saveProgress(progress);
  dom.tutorial.hidden = true;
}

function handlePieceTap(pieceId) {
  if (inputLocked || activeModal || !game || game.status !== "playing") return;
  dismissTutorial();
  const outcome = attemptPull(game, pieceId);
  if (outcome.result === PULL_OK) {
    inputLocked = true;
    buzz(10); tone(620);
    renderer.animateOut(outcome.piece, game.level, () => {
      const committed = commitPull(game, outcome.piece.id);
      if (!committed.committed) return;
      progress.stats.correctMoves += 1;
      inputLocked = false;
      renderHud();
      saveGameSession();
      if (committed.won) setTimeout(finishLevel, WIN_DELAY);
    });
    return;
  }
  if (outcome.result === PULL_BLOCKED) {
    buzz(35); tone(170, 0.09);
    renderer.shake(pieceId);
    progress.stats.errors += 1;
    saveGameSession();
    renderHud();
    dom.hearts.classList.add("is-shaking");
    dom.collisionNote.textContent = `Bu okun hareket yolu ${outcome.blockers.length} ok tarafından kapalı.`;
    setTimeout(() => { dom.hearts.classList.remove("is-shaking"); dom.collisionNote.textContent = ""; }, 1400);
    if (outcome.lost) setTimeout(showFailure, 360);
  }
}

function finishLevel() {
  if (!game || game.status !== "won") return;
  inputLocked = true;
  const stats = gameStats(game);
  const solved = game.levelId;
  const next = clampLevelId(solved + 1);
  progress = updateProgress((store) => {
    if (game.isDaily) {
      store.daily ||= {};
      store.daily[new Date().toISOString().slice(0, 10)] = { completed: true, stats };
    } else {
      recordResult(store, solved, stats);
      store.lastUnlocked = Math.max(store.lastUnlocked, next);
      store.currentLevel = solved < TOTAL_LEVELS ? next : solved;
      store.session = null;
    }
    store.totalHints += game.hints;
    store.stats.playTimeMs += stats.elapsedMs;
  });
  dom.progressFill.style.width = "100%";
  buzz([20, 35, 45]); tone(880, 0.15);
  showResult(true, stats);
}

function showFailure() { showResult(false, gameStats(game)); }

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function showResult(won, stats) {
  dom.resultSymbol.textContent = won ? (stats.perfect ? "★" : "✓") : "!";
  dom.resultTitle.textContent = won ? "Bölüm tamamlandı" : "Bir kez daha dene";
  dom.resultMessage.textContent = won ? (stats.perfect ? "Kusursuz çözüm!" : "Yeni bölüm açıldı.") : "Son yanlış hareket yolundaki başka bir oka çarptı.";
  byId("statLives").textContent = game.zen ? "∞" : stats.lives;
  byId("statTime").textContent = formatTime(stats.elapsedMs);
  byId("statErrors").textContent = stats.errors;
  byId("statHints").textContent = stats.hints;
  dom.resultPrimary.textContent = won ? (game.isDaily ? "Ana ekran" : (game.levelId < TOTAL_LEVELS ? "Sonraki bölüm" : "Bölümler")) : "Tekrar dene";
  openModal(dom.resultModal);
}

function showHint(count = true) {
  if (!game || inputLocked || activeModal) return;
  const piece = useHint(game);
  if (!piece) { dom.collisionNote.textContent = "Güvenli hareket bulunamadı."; return; }
  if (!count) game.hints = Math.max(0, game.hints - 1);
  renderer.hint(piece.id);
  progress.stats.hints += count ? 1 : 0;
  saveGameSession();
  renderHud();
  tone(760);
}

function restartCurrent() {
  if (!game) return;
  restartGame(game);
  renderer.render(game);
  inputLocked = false;
  renderHud();
  showTutorial();
  saveGameSession();
}

function openConfirm(title, message, action) {
  dom.confirmTitle.textContent = title; dom.confirmMessage.textContent = message; confirmAction = action; openModal(dom.confirmModal);
}

function openModal(modal) {
  modalReturnFocus = document.activeElement;
  dom.modalLayer.hidden = false;
  [dom.resultModal, dom.settingsModal, dom.confirmModal].forEach((item) => { item.hidden = item !== modal; });
  activeModal = modal;
  requestAnimationFrame(() => modal.querySelector("button, input")?.focus());
}

function closeModal() {
  if (!activeModal) return;
  dom.modalLayer.hidden = true;
  activeModal.hidden = true;
  activeModal = null;
  modalReturnFocus?.focus?.();
}

function openSettings() { applySettings(); openModal(dom.settingsModal); }

function bindEvents() {
  renderer.onPieceTap = handlePieceTap;
  dom.play.addEventListener("click", () => startLevel(progress.currentLevel, { resume: true }));
  dom.newGame.addEventListener("click", () => startLevel(progress.currentLevel));
  dom.daily.addEventListener("click", () => {
    const dayNumber = Math.floor(Date.now() / 86400000);
    startLevel((dayNumber % 30) + 1, { daily: true });
  });
  dom.levelsButton.addEventListener("click", () => showScreen("levels"));
  dom.backHome.addEventListener("click", () => showScreen("home"));
  dom.backToLevels.addEventListener("click", () => { pickerChapter = chapterOf(progress.currentLevel); showScreen("levels"); });
  dom.chapterTabs.addEventListener("click", (event) => { const tab = event.target.closest("[data-chapter]"); if (tab && !tab.disabled) { pickerChapter = Number(tab.dataset.chapter); paintPicker(); } });
  dom.levelGrid.addEventListener("click", (event) => { const cell = event.target.closest("[data-level]"); if (cell && !cell.disabled) startLevel(Number(cell.dataset.level)); });
  dom.tutorial.addEventListener("click", dismissTutorial);
  dom.fit.addEventListener("click", () => renderer.resetView());
  dom.hint.addEventListener("click", () => showHint(true));
  dom.undo.addEventListener("click", () => { if (undoPull(game)) { renderer.render(game); renderHud(); saveGameSession(); tone(420); } });
  dom.restart.addEventListener("click", () => openConfirm("Bölüm yeniden başlatılsın mı?", "Bu bölümdeki mevcut hamlelerin silinecek.", restartCurrent));
  [byId("openSettingsHome"), byId("openSettingsLevels"), byId("openSettingsGame")].forEach((button) => button.addEventListener("click", openSettings));
  dom.settingsClose.addEventListener("click", closeModal);
  document.querySelectorAll("[data-setting]").forEach((input) => input.addEventListener("change", () => {
    const setting = input.dataset.setting;
    progress.settings[setting] = input.checked;
    saveProgress(progress);
    if (setting === "dark") {
      if (window.RavzaGameTheme) window.RavzaGameTheme.setMode(input.checked ? "dark" : "light");
      else document.documentElement.classList.toggle("theme-dark", input.checked);
    }
    applySettings();
    if (game && input.dataset.setting === "zen") game.zen = input.checked;
    if (game) renderHud();
  }));
  dom.resetData.addEventListener("click", () => openConfirm("İlerleme sıfırlansın mı?", "Tamamlanan bölümler ve bütün ayarlar kalıcı olarak silinecek.", () => { progress = resetProgress(); applySettings(); showScreen("home"); }));
  byId("resetTutorialsButton").addEventListener("click", () => { progress.tutorialSeen = {}; saveProgress(progress); closeModal(); if (game) showTutorial(); });
  dom.confirmNo.addEventListener("click", closeModal);
  dom.confirmYes.addEventListener("click", () => { const action = confirmAction; closeModal(); confirmAction = null; action?.(); });
  dom.resultPrimary.addEventListener("click", () => game.status === "won" && game.isDaily ? showScreen("home") : game.status === "won" && game.levelId < TOTAL_LEVELS ? startLevel(game.levelId + 1) : game.status === "lost" ? restartCurrent() : showScreen("levels"));
  dom.resultReplay.addEventListener("click", restartCurrent);
  dom.resultLevels.addEventListener("click", () => showScreen("levels"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeModal && activeModal !== dom.confirmModal) closeModal();
    if (event.key === "Tab" && activeModal) {
      const focusable = [...activeModal.querySelectorAll("button:not([disabled]), input:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveGameSession(); });
  window.addEventListener("pagehide", saveGameSession);
  window.addEventListener("app:theme-change", applySettings);
}

applySettings(); bindEvents(); showScreen("home");
