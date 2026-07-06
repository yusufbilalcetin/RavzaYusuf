import { createGameAudio } from "../utils/game-audio.js";
import { renderBoyamaApp } from "./boyama-page.js?v=pbn-save-20260706-1";
import { pbnLog } from "../utils/pbn-debug.js?v=pbn-save-20260706-1";

const GAME_META = {
  "boyama": {
    badge: "YENİ NESİL",
    title: "Boyama",
    subtitle: "Fotoğrafını yükle, piksel piksel numaraya göre boya."
  },
  "candy-match": {
    badge: "SONSUZ",
    title: "Candy Crush",
    subtitle: "Yan yana iki sekeri degistir. Uclu veya daha fazla eslesme puan verir; hamle siniri yok."
  },
  "fruit-match": {
    badge: "100 BÖLÜM",
    title: "Meyve Eşleştirme",
    subtitle: "Açık meyve taşlarını eşleştir, tüm tahtayı temizle ve yıldızları topla."
  },
  "flappy-bird": {
    badge: "SONSUZ",
    title: "Flappy Bird",
    subtitle: "Ekrana dokun veya bosluk tusuna bas, kusu borularin arasindan gecir."
  },
  "sudoku": {
    badge: "BULMACA",
    title: "Sudoku",
    subtitle: "Her satir, sutun ve 3x3 blokta 1-9 rakamlari birer kez olacak sekilde tahtayi doldur."
  },
  "memory-boxes": {
    badge: "YAKINDA",
    title: "Hafiza Kutulari",
    subtitle: "Ayni kartlari bulacagin hafiza oyunu burada acilacak."
  },
  "speed-race": {
    badge: "YAKINDA",
    title: "Hizli Yaris",
    subtitle: "Sureye karsi soru cozme oyunu burada acilacak."
  },
  "word-pop": {
    badge: "YAKINDA",
    title: "Kelime Patlat",
    subtitle: "Dogru kelime balonunu secme oyunu burada acilacak."
  },
  "picture-puzzle": {
    badge: "YAKINDA",
    title: "Resim Puzzle",
    subtitle: "Parcalari yerine tasima oyunu burada acilacak."
  },
  "quiz-battle": {
    badge: "YAKINDA",
    title: "Quiz Kapismasi",
    subtitle: "Puan toplayan yaris modu burada acilacak."
  }
};

const CANDIES = ["\u{1F353}", "\u{1F34B}", "\u{1F347}", "\u{1F36C}", "\u{1F36D}", "\u{1F9C1}"];
const BOARD_SIZE = 7;
const CANDY_CRUSH_APP_URL = "./games/candy-crush/dist/index.html";
const FRUIT_MATCH_APP_URL = "./games/meyve-eslestirme/dist/index.html";

let candyState = null;
let flappyState = null;
let sudokuState = null;
let boyamaState = null;

export function initOyun(options = {}) {
  const root = document.getElementById("games");
  if (!root) return undefined;

  if (root.dataset.gamesReady !== "true") {
    root.dataset.gamesReady = "true";

    root.querySelectorAll("[data-game]").forEach((tile) => {
      tile.addEventListener("click", () => openGame(root, tile.dataset.game));
    });

    root.querySelector("#gameCloseBtn")?.addEventListener("click", () => closeGame(root));
  }

  // Boot'ta yarım boyama işini geri açmak için (app.js -> tryResumeBoyama).
  window.__pbnOpenBoyamaResume = async (projectId) => {
    pbnLog("oyun.openBoyamaResume", { projectId });
    openGame(root, "boyama", { resumeProjectId: projectId });
    try { return await boyamaState?.resumeReady; } catch { return false; }
  };

  if (options.openGame) {
    openGame(root, options.openGame);
    return { skipTopScroll: true };
  }

  return undefined;
}

function openGame(root, gameId, options = {}) {
  pbnLog("oyun.openGame", { gameId });
  const meta = GAME_META[gameId] || GAME_META["candy-match"];
  const stage = root.querySelector("#gameStage");
  const badge = root.querySelector("#gameStageBadge");
  const title = root.querySelector("#gameStageTitle");
  const subtitle = root.querySelector("#gameStageSubtitle");
  const body = root.querySelector("#gameStageBody");

  if (!stage || !badge || !title || !subtitle || !body) return;

  badge.textContent = meta.badge;
  title.textContent = meta.title;
  subtitle.textContent = meta.subtitle;
  stage.hidden = false;

  destroyActiveGame();

  if (gameId === "candy-match") {
    enterGameFullscreen(root);
    root.classList.add("is-candy-crush-app");
    root.classList.remove("is-sudoku", "is-boyama");
    renderCandyCrushApp(body);
  } else if (gameId === "fruit-match") {
    enterGameFullscreen(root);
    root.classList.add("is-candy-crush-app");
    root.classList.remove("is-sudoku", "is-boyama");
    renderFruitMatchApp(body);
  } else if (gameId === "flappy-bird") {
    enterGameFullscreen(root);
    root.classList.remove("is-candy-crush-app", "is-sudoku", "is-boyama");
    renderFlappyBird(body);
  } else if (gameId === "sudoku") {
    enterGameFullscreen(root);
    root.classList.remove("is-candy-crush-app", "is-boyama");
    root.classList.add("is-sudoku");
    renderSudoku(body);
  } else if (gameId === "boyama") {
    enterGameFullscreen(root);
    root.classList.remove("is-candy-crush-app", "is-sudoku");
    root.classList.add("is-boyama");
    boyamaState = renderBoyamaApp(body, { resumeProjectId: options.resumeProjectId });
  } else {
    exitGameFullscreen(root);
    root.classList.remove("is-candy-crush-app");
    body.innerHTML = `
      <div class="game-soon-box">
        <strong>Yakinda</strong>
        <p>Bu kutuya tiklama sistemi hazir. Bu oyunun kurallari ve ekrani daha sonra eklenebilir.</p>
      </div>
    `;
  }

  stage.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCandyCrushApp(target) {
  renderIframeGame(target, CANDY_CRUSH_APP_URL, "Candy Crush");
}

function renderFruitMatchApp(target) {
  renderIframeGame(target, FRUIT_MATCH_APP_URL, "Meyve Eşleştirme");
}

function renderIframeGame(target, url, title) {
  target.innerHTML = `
    <div class="candy-crush-game-shell">
      <iframe
        class="candy-crush-game-frame"
        src="${url}"
        title="${title}"
        loading="eager"
        allow="autoplay; fullscreen"
      ></iframe>
      <a class="candy-crush-game-link" href="${url}" target="_blank" rel="noopener">Tam ekranda ac</a>
    </div>
  `;
}

function closeGame(root) {
  pbnLog("oyun.closeGame");
  const stage = root.querySelector("#gameStage");
  const body = root.querySelector("#gameStageBody");
  destroyActiveGame();
  exitGameFullscreen(root);
  if (stage) stage.hidden = true;
  if (body) body.innerHTML = "";
  candyState = null;
}

function destroyActiveGame() {
  if (flappyState) {
    flappyState.cleanup();
    flappyState = null;
  }
  if (sudokuState) {
    sudokuState.cleanup?.();
    sudokuState = null;
  }
  if (boyamaState) {
    pbnLog("oyun.destroyBoyama");
    boyamaState.cleanup?.();
    boyamaState = null;
  }
}

const GAME_FULLSCREEN_VIEWPORT = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
let savedViewportContent = null;

function enterGameFullscreen(root) {
  root.classList.add("is-game-fullscreen");
  document.body.classList.add("is-game-fullscreen");

  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (viewportMeta && savedViewportContent === null) {
    savedViewportContent = viewportMeta.getAttribute("content");
    viewportMeta.setAttribute("content", GAME_FULLSCREEN_VIEWPORT);
    pbnLog("oyun.viewportMeta", "fullscreen");
  }
}

function exitGameFullscreen(root) {
  root.classList.remove("is-game-fullscreen");
  root.classList.remove("is-candy-crush-app");
  root.classList.remove("is-sudoku");
  root.classList.remove("is-boyama");
  document.body.classList.remove("is-game-fullscreen");

  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (viewportMeta && savedViewportContent !== null) {
    viewportMeta.setAttribute("content", savedViewportContent);
    savedViewportContent = null;
    pbnLog("oyun.viewportMeta", "restored");
  }
}

function renderCandyMatch(target) {
  candyState = {
    board: createBoard(),
    selected: null,
    score: 0,
    message: "Sonsuz mod basladi. Bir sekeri sec, sonra yanindaki sekeri sec."
  };

  target.innerHTML = `
    <div class="candy-game">
      <div class="candy-stats">
        <span>Skor <strong id="candyScore">0</strong></span>
        <span>Hamle <strong id="candyMoves">sonsuz</strong></span>
        <button class="candy-reset-btn" type="button" id="candyResetBtn">Yeniden Baslat</button>
      </div>
      <div class="candy-board" id="candyBoard" aria-label="Seker eslestirme tahtasi"></div>
      <p class="candy-message" id="candyMessage">${candyState.message}</p>
    </div>
  `;

  target.querySelector("#candyResetBtn")?.addEventListener("click", () => renderCandyMatch(target));
  target.querySelector("#candyBoard")?.addEventListener("click", handleCandyClick);
  renderCandyBoard(target);
}

function createBoard() {
  let board = [];

  do {
    board = [];
    for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
      let candy = randomCandy();
      while (wouldCreateStartingMatch(board, index, candy)) {
        candy = randomCandy();
      }
      board.push(candy);
    }
  } while (!hasPossibleMove(board));

  return board;
}

function randomCandy() {
  return CANDIES[Math.floor(Math.random() * CANDIES.length)];
}

function wouldCreateStartingMatch(board, index, candy) {
  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;
  const leftMatch = col >= 2 && board[index - 1] === candy && board[index - 2] === candy;
  const topMatch = row >= 2 && board[index - BOARD_SIZE] === candy && board[index - BOARD_SIZE * 2] === candy;
  return leftMatch || topMatch;
}

function handleCandyClick(event) {
  const cell = event.target.closest(".candy-cell");
  if (!cell || !candyState) return;

  const index = Number(cell.dataset.index);
  if (!Number.isInteger(index)) return;

  if (candyState.selected === null) {
    candyState.selected = index;
    candyState.message = "Simdi yanindaki bir sekeri sec.";
    renderCandyBoard(cell.closest(".game-stage-body"));
    return;
  }

  if (candyState.selected === index) {
    candyState.selected = null;
    candyState.message = "Secim iptal edildi.";
    renderCandyBoard(cell.closest(".game-stage-body"));
    return;
  }

  const first = candyState.selected;
  candyState.selected = null;

  if (!areAdjacent(first, index)) {
    candyState.selected = index;
    candyState.message = "Sadece yan yana olan iki sekeri degistirebilirsin.";
    renderCandyBoard(cell.closest(".game-stage-body"));
    return;
  }

  swapCandies(first, index);
  const matches = findMatches(candyState.board);

  if (!matches.size) {
    swapCandies(first, index);
    candyState.message = "Eslesme olmadi. Baska bir hamle dene.";
    renderCandyBoard(cell.closest(".game-stage-body"));
    return;
  }

  const cleared = resolveMatches();
  candyState.score += cleared * 10;

  if (!hasPossibleMove(candyState.board)) {
    candyState.board = createBoard();
    candyState.message = `${cleared} seker temizlendi. Tahta yenilendi, sonsuz mod devam ediyor.`;
  } else {
    candyState.message = `${cleared} seker temizlendi. Sonsuz mod devam ediyor.`;
  }

  renderCandyBoard(cell.closest(".game-stage-body"));
}

function areAdjacent(first, second) {
  const firstRow = Math.floor(first / BOARD_SIZE);
  const firstCol = first % BOARD_SIZE;
  const secondRow = Math.floor(second / BOARD_SIZE);
  const secondCol = second % BOARD_SIZE;
  return Math.abs(firstRow - secondRow) + Math.abs(firstCol - secondCol) === 1;
}

function hasPossibleMove(board) {
  for (let index = 0; index < board.length; index += 1) {
    const row = Math.floor(index / BOARD_SIZE);
    const col = index % BOARD_SIZE;
    const neighbors = [];

    if (col < BOARD_SIZE - 1) neighbors.push(index + 1);
    if (row < BOARD_SIZE - 1) neighbors.push(index + BOARD_SIZE);

    for (const neighbor of neighbors) {
      const testBoard = [...board];
      [testBoard[index], testBoard[neighbor]] = [testBoard[neighbor], testBoard[index]];
      if (findMatches(testBoard).size) return true;
    }
  }

  return false;
}

function swapCandies(first, second) {
  [candyState.board[first], candyState.board[second]] = [candyState.board[second], candyState.board[first]];
}

function findMatches(board) {
  const matches = new Set();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    let runStart = 0;
    for (let col = 1; col <= BOARD_SIZE; col += 1) {
      const current = col < BOARD_SIZE ? board[row * BOARD_SIZE + col] : null;
      const previous = board[row * BOARD_SIZE + col - 1];
      if (current === previous) continue;
      if (col - runStart >= 3 && previous) {
        for (let matchCol = runStart; matchCol < col; matchCol += 1) {
          matches.add(row * BOARD_SIZE + matchCol);
        }
      }
      runStart = col;
    }
  }

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let runStart = 0;
    for (let row = 1; row <= BOARD_SIZE; row += 1) {
      const current = row < BOARD_SIZE ? board[row * BOARD_SIZE + col] : null;
      const previous = board[(row - 1) * BOARD_SIZE + col];
      if (current === previous) continue;
      if (row - runStart >= 3 && previous) {
        for (let matchRow = runStart; matchRow < row; matchRow += 1) {
          matches.add(matchRow * BOARD_SIZE + col);
        }
      }
      runStart = row;
    }
  }

  return matches;
}

function resolveMatches() {
  let totalCleared = 0;
  let matches = findMatches(candyState.board);

  while (matches.size) {
    totalCleared += matches.size;
    matches.forEach((index) => {
      candyState.board[index] = null;
    });
    collapseBoard();
    matches = findMatches(candyState.board);
  }

  return totalCleared;
}

function collapseBoard() {
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    const stack = [];

    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const value = candyState.board[row * BOARD_SIZE + col];
      if (value) stack.push(value);
    }

    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      candyState.board[row * BOARD_SIZE + col] = stack.shift() || randomCandy();
    }
  }
}

function renderCandyBoard(target) {
  if (!target || !candyState) return;

  const board = target.querySelector("#candyBoard");
  const score = target.querySelector("#candyScore");
  const moves = target.querySelector("#candyMoves");
  const message = target.querySelector("#candyMessage");

  if (score) score.textContent = String(candyState.score);
  if (moves) moves.textContent = "sonsuz";
  if (message) message.textContent = candyState.message;

  if (!board) return;
  board.innerHTML = candyState.board.map((candy, index) => `
    <button
      class="candy-cell${candyState.selected === index ? " selected" : ""}"
      type="button"
      data-index="${index}"
      aria-label="Seker"
    >${candy}</button>
  `).join("");
}

/* ============================= FLAPPY BIRD ============================= */

const FLAPPY_DIFFICULTY = {
  kolay: {
    label: "Kolay", gapRatio: 0.32, minGap: 185, speed: 140, interval: 1.9,
    speedRampPerPoint: 1.2, intervalRampPerPoint: -0.006, gapRampPerPoint: -0.0015,
    speedCap: 230, intervalFloor: 1.3, gapFloor: 0.22, coinChance: 0.18
  },
  orta: {
    label: "Orta", gapRatio: 0.25, minGap: 145, speed: 190, interval: 1.45,
    speedRampPerPoint: 2.0, intervalRampPerPoint: -0.010, gapRampPerPoint: -0.0022,
    speedCap: 300, intervalFloor: 0.95, gapFloor: 0.16, coinChance: 0.30
  },
  zor: {
    label: "Zor", gapRatio: 0.19, minGap: 115, speed: 250, interval: 1.1,
    speedRampPerPoint: 3.0, intervalRampPerPoint: -0.014, gapRampPerPoint: -0.0032,
    speedCap: 380, intervalFloor: 0.65, gapFloor: 0.11, coinChance: 0.45
  }
};

const FLAPPY_STARTING_COINS = 20;

const FLAPPY_SHOP_TABS = [
  { id: "characters", label: "KARAKTERLER", icon: "bird" },
  { id: "backgrounds", label: "ARKA PLANLAR", icon: "land" },
  { id: "packages", label: "PAKETLER", icon: "gift" }
];

const FLAPPY_CHARACTERS = {
  klasik: { label: "KLASIK", price: 0, defaultOwned: true, body1: "#fff27a", body2: "#ffc914", body3: "#e58a00", stroke: "#cf7600", belly: "#fff8c9", wing: "#f0a800", wingStroke: "#bd6c00", beak: "#ffab28", beakStroke: "#9c5700", art: "classic" },
  kirmizi: { label: "KIRMIZI KUS", price: 100, body1: "#ff7a44", body2: "#ff2d18", body3: "#b21412", stroke: "#8d1715", belly: "#ffd7bc", wing: "#ff9a2e", wingStroke: "#a84a08", beak: "#ffb12c", beakStroke: "#9c5700", art: "red" },
  pilot: { label: "PILOT KUS", price: 250, body1: "#68d5ff", body2: "#1686d9", body3: "#0b4f94", stroke: "#073c78", belly: "#eaf9ff", wing: "#2aa9ea", wingStroke: "#07598f", beak: "#ffb12c", beakStroke: "#9c5700", art: "pilot" },
  simsek: { label: "SIMSEK KUS", price: 250, body1: "#fff36a", body2: "#ffd014", body3: "#ef9100", stroke: "#c67000", belly: "#fff8c9", wing: "#f5b400", wingStroke: "#bd6c00", beak: "#ffab28", beakStroke: "#9c5700", art: "speed" },
  ninja: { label: "NINJA KUS", price: 400, body1: "#344258", body2: "#121823", body3: "#06090f", stroke: "#03060b", belly: "#d8e1ef", wing: "#1d2635", wingStroke: "#03060b", beak: "#ffab28", beakStroke: "#9c5700", art: "ninja" },
  canavar: { label: "CANAVAR KUS", price: 400, body1: "#a7f35d", body2: "#5fc722", body3: "#2c881f", stroke: "#1f6419", belly: "#ecffd7", wing: "#76d942", wingStroke: "#2a7a1d", beak: "#ffb12c", beakStroke: "#9c5700", art: "monster" },
  unicorn: { label: "UNICORN KUS", price: 600, body1: "#dfb8ff", body2: "#9c6af2", body3: "#6239bd", stroke: "#47268f", belly: "#f7eaff", wing: "#c390ff", wingStroke: "#6940a8", beak: "#ffb9a2", beakStroke: "#9a4a36", art: "unicorn" },
  gizli: { label: "GIZLI KUS", price: null, locked: true, body1: "#44546d", body2: "#1b2d45", body3: "#0e1c2c", stroke: "#0a1522", belly: "#6c7d91", wing: "#263951", wingStroke: "#0b1928", beak: "#8fa1b8", beakStroke: "#263951", art: "secret" }
};

const FLAPPY_BACKGROUNDS = {
  klasik: { label: "KLASIK", price: 0, defaultOwned: true, theme: "classic", sky: ["#0aa8f4", "#68d8ff", "#b7f2ff"], far: "#58b7d7", near: "#33a5c0", groundTop: "#75d944", groundBottom: "#8f4d18", star: false, sun: null },
  gunbatimi: { label: "GUN BATIMI", price: 100, theme: "sunset", sky: ["#ff8a40", "#ffbc62", "#7357b9"], far: "#c25b68", near: "#733a62", groundTop: "#4fa83a", groundBottom: "#8a4418", star: false, sun: "#ffd86e" },
  gece: { label: "GECE SEHIR", price: 250, theme: "night", sky: ["#071635", "#17336d", "#3d286b"], far: "#0e2446", near: "#111a35", groundTop: "#245b52", groundBottom: "#15233d", star: true, sun: "#fff3a8" },
  kar: { label: "KAR TEMASI", price: 250, theme: "snow", sky: ["#78ceff", "#bdeeff", "#eefbff"], far: "#8fb9d9", near: "#b9e9ff", groundTop: "#f7fcff", groundBottom: "#71b5d8", star: false, sun: null },
  col: { label: "COL", price: 400, theme: "desert", sky: ["#ffa84b", "#ffd071", "#ffe5a3"], far: "#e59a3a", near: "#cb7f25", groundTop: "#edbb42", groundBottom: "#a9651f", star: false, sun: "#fff09d" },
  orman: { label: "ORMAN", price: 400, theme: "forest", sky: ["#53c4ff", "#8fe1ff", "#d7ffdc"], far: "#257d5a", near: "#145d42", groundTop: "#49c54f", groundBottom: "#5f3a18", star: false, sun: null },
  gokyuzu: { label: "GOKYUZU ADALARI", price: 600, theme: "skylands", sky: ["#80c9ff", "#d4d6ff", "#fff1c8"], far: "#8f9ddc", near: "#6fb5d6", groundTop: "#7bd861", groundBottom: "#7a4b2a", star: false, sun: "#ffe38c" },
  yakinda: { label: "YAKINDA", price: null, locked: true, theme: "locked", sky: ["#193a5a", "#10263f", "#0c1d32"], far: "#223c58", near: "#142a42", groundTop: "#36546b", groundBottom: "#172535", star: false, sun: null }
};

const FLAPPY_PACKAGES = {
  baslangic: { label: "BASLANGIC", price: 180, theme: "starter", unlockCharacters: ["kirmizi"], unlockBackgrounds: ["gunbatimi"] },
  kahraman: { label: "KAHRAMAN", price: 500, theme: "hero", unlockCharacters: ["pilot", "simsek"], unlockBackgrounds: ["gece"] },
  efsane: { label: "EFSANE", price: 900, theme: "legend", unlockCharacters: ["unicorn"], unlockBackgrounds: ["gokyuzu"] },
  yakinda: { label: "YAKINDA", price: null, locked: true, theme: "locked", unlockCharacters: [], unlockBackgrounds: [] }
};

function renderFlappyBird(target) {
  target.innerHTML = `
    <div class="flappy-game">
      <div class="flappy-shell">
        <canvas id="flappyCanvas" class="flappy-canvas"></canvas>
        <div class="flappy-overlay" id="flappyOverlay">
          <span class="flappy-medal" id="flappyMedal" hidden></span>
          <strong id="flappyOverlayTitle">Flappy Bird</strong>
          <p id="flappyOverlayText">Zorluk seviyeni sec.</p>
          <span class="flappy-best" id="flappyBest"></span>
          <div class="flappy-menu" id="flappyMenu"></div>
        </div>
      </div>
    </div>
  `;

  const shell = target.querySelector(".flappy-shell");
  const canvas = target.querySelector("#flappyCanvas");
  const overlay = target.querySelector("#flappyOverlay");
  const overlayTitle = target.querySelector("#flappyOverlayTitle");
  const overlayText = target.querySelector("#flappyOverlayText");
  const bestLabel = target.querySelector("#flappyBest");
  const medal = target.querySelector("#flappyMedal");
  const menu = target.querySelector("#flappyMenu");
  const context = canvas.getContext("2d");
  const audio = createGameAudio({
    storageKey: "flappySoundOn",
    settingsKey: "flappyAudioSettings",
    defaultSettings: { musicEnabled: true, sfxEnabled: true, masterVolume: 70 }
  });

  const GRAVITY = 1900;
  const FLAP_VELOCITY = -560;
  const PIPE_WIDTH = 78;
  const BIRD_X_RATIO = 0.3;
  const BIRD_RADIUS = 16;
  const GROUND_H = 48;

  const state = {
    phase: "menu",
    difficulty: "orta",
    character: readFlappyEquipped(),
    background: readFlappyEquippedBackground(),
    shopTab: "characters",
    shopMessage: "",
    coins: readFlappyCoins(),
    runCoins: 0,
    bird: { y: 0, velocity: 0 },
    pipes: [],
    coinItems: [],
    score: 0,
    best: 0,
    lastTime: 0,
    spawnTimer: 0,
    distance: 0,
    wingPhase: 0,
    rafId: 0,
    width: 0,
    height: 0
  };

  if (!readFlappyOwned().includes(state.character)) state.character = "klasik";
  if (!readFlappyOwnedBackgrounds().includes(state.background)) state.background = "klasik";

  const clouds = Array.from({ length: 6 }, (_, index) => ({
    x: index * 0.19 + 0.04,
    y: 0.08 + ((index * 37) % 30) / 100,
    scale: 0.7 + ((index * 53) % 40) / 100
  }));

  function params() {
    const base = FLAPPY_DIFFICULTY[state.difficulty] || FLAPPY_DIFFICULTY.orta;
    const s = state.score;
    return {
      ...base,
      speed: Math.min(base.speed + s * base.speedRampPerPoint, base.speedCap),
      interval: Math.max(base.interval + s * base.intervalRampPerPoint, base.intervalFloor),
      gapRatio: Math.max(base.gapRatio + s * base.gapRampPerPoint, base.gapFloor)
    };
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    state.width = shell.clientWidth;
    state.height = shell.clientHeight;
    canvas.width = Math.round(state.width * ratio);
    canvas.height = Math.round(state.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function gapSize() {
    return Math.max(state.height * params().gapRatio, params().minGap);
  }

  function resetRound() {
    state.bird.y = state.height * 0.45;
    state.bird.velocity = 0;
    state.pipes = [];
    state.coinItems = [];
    state.score = 0;
    state.spawnTimer = params().interval * 0.6;
    state.distance = 0;
  }

  function spawnPipe() {
    const gap = gapSize();
    const playHeight = state.height - GROUND_H;
    const margin = Math.max(playHeight * 0.08, 40);
    const gapTop = margin + Math.random() * (playHeight - gap - margin * 2);
    state.pipes.push({ x: state.width + PIPE_WIDTH, gapTop, gapBottom: gapTop + gap, passed: false });
    if (Math.random() < params().coinChance) {
      state.coinItems.push({
        x: state.width + PIPE_WIDTH + PIPE_WIDTH / 2,
        y: gapTop + gap / 2,
        collected: false,
        wobble: Math.random() * Math.PI * 2
      });
    }
  }

  function showMenu() {
    state.phase = "menu";
    resetRound();
    audio.stopMusic();
    overlay.classList.add("is-menu");
    overlay.classList.remove("is-shop");
    overlayTitle.hidden = true;
    overlayText.hidden = true;
    bestLabel.hidden = true;
    medal.hidden = true;
    menu.innerHTML = renderMainMenu();
    overlay.hidden = false;
  }

  function renderMainMenu() {
    const settings = audio.getSettings();
    const activeBars = Math.round(settings.masterVolume / 10);
    return `
      <section class="flappy-main-menu" aria-label="Flappy Bird ana menü">
        <div class="flappy-menu-ray flappy-menu-ray--a"></div>
        <div class="flappy-menu-ray flappy-menu-ray--b"></div>
        <div class="flappy-menu-cloud flappy-menu-cloud--1"></div>
        <div class="flappy-menu-cloud flappy-menu-cloud--2"></div>
        <div class="flappy-menu-cloud flappy-menu-cloud--3"></div>
        <div class="flappy-menu-cloud flappy-menu-cloud--4"></div>
        <div class="flappy-menu-hills"></div>
        <div class="flappy-menu-bushes"></div>
        <div class="flappy-menu-ground"></div>

        <div class="flappy-main-content">
          <div class="flappy-logo-row">
            <div class="flappy-menu-bird" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
            </div>
            <h2 class="flappy-game-logo"><span>Flappy</span><span>Bird</span></h2>
          </div>
          <p class="flappy-main-question">Ne yapmak istersin?</p>
          <div class="flappy-main-coins">
            <span>Altın: ${state.coins}</span>
            <i aria-hidden="true"></i>
          </div>
          <div class="flappy-main-actions">
            <button class="flappy-main-btn flappy-main-btn--play" type="button" data-action="play">Oyna</button>
            <button class="flappy-main-btn flappy-main-btn--shop" type="button" data-action="shop">Mağaza</button>
          </div>
          <section class="flappy-audio-panel" aria-label="Ses ayarları">
            <div class="flappy-audio-tab"><span aria-hidden="true"></span>Ses Ayarları<span aria-hidden="true"></span></div>
            <div class="flappy-audio-body">
              ${renderAudioToggle("music", "Müzik", "♪", settings.musicEnabled)}
              ${renderAudioToggle("sfx", "Ses Efektleri", "◔", settings.sfxEnabled)}
              <div class="flappy-audio-control flappy-audio-control--volume">
                <strong>Genel Ses</strong>
                <div class="flappy-volume-row">
                  <button class="flappy-volume-btn" type="button" data-action="volume-down" aria-label="Sesi azalt">−</button>
                  <div class="flappy-volume-bars" aria-label="Genel ses ${settings.masterVolume}">
                    ${Array.from({ length: 10 }, (_, index) => `<span class="${index < activeBars ? "is-filled" : ""}"></span>`).join("")}
                  </div>
                  <button class="flappy-volume-btn" type="button" data-action="volume-up" aria-label="Sesi artır">+</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    `;
  }

  function renderAudioToggle(type, label, icon, enabled) {
    return `
      <div class="flappy-audio-control">
        <strong>${label}</strong>
        <button class="flappy-audio-toggle${enabled ? " is-on" : " is-off"}" type="button" data-action="toggle-${type}" aria-pressed="${enabled}">
          <span class="flappy-audio-toggle-icon" aria-hidden="true">${icon}</span>
          <span>${enabled ? "Açık" : "Kapalı"}</span>
          <i aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  function showDifficultyPicker() {
    state.phase = "menu";
    resetRound();
    audio.stopMusic();
    overlay.classList.remove("is-menu");
    overlay.classList.remove("is-shop");
    overlayTitle.hidden = false;
    overlayText.hidden = false;
    bestLabel.hidden = false;
    medal.hidden = true;
    overlayTitle.textContent = "Zorluk Seç";
    overlayText.textContent = "Zorluk seviyeni sec.";
    bestLabel.textContent = "";
    menu.innerHTML = Object.entries(FLAPPY_DIFFICULTY).map(([key, diff]) => {
      const best = readFlappyBest(key);
      return `<button class="flappy-menu-btn" type="button" data-diff="${key}">${diff.label}${best ? `<small>Rekor ${best}</small>` : ""}</button>`;
    }).join("") + `<button class="flappy-menu-btn flappy-menu-back" type="button" data-action="back">Geri</button>`;
    overlay.hidden = false;
  }

  function showShop(tab = state.shopTab || "characters") {
    state.shopTab = FLAPPY_SHOP_TABS.some((item) => item.id === tab) ? tab : "characters";
    state.phase = "shop";
    resetRound();
    audio.stopMusic();
    overlay.classList.remove("is-menu");
    overlay.classList.add("is-shop");
    overlayTitle.hidden = true;
    overlayText.hidden = true;
    bestLabel.hidden = true;
    medal.hidden = true;
    menu.innerHTML = renderStoreScreen();
    overlay.hidden = false;
  }

  function renderStoreScreen() {
    const tab = state.shopTab;
    const subtitle = tab === "backgrounds" ? "Arka planları satın al" : tab === "packages" ? "Paketleri satın al" : "Karakterleri satın al";
    const info = tab === "backgrounds"
      ? "Yeni arka planlar oynayarak veya özel paketlerle açılabilir."
      : tab === "packages"
        ? "Paketler karakterleri ve arka planları birlikte açar."
        : "Yeni karakterler oynayarak veya özel paketlerle açılabilir.";
    const gridClass = tab === "packages" ? "flappy-store-grid flappy-store-grid--packages" : "flappy-store-grid";

    return `
      <section class="flappy-store flappy-store--${FLAPPY_BACKGROUNDS[state.background]?.theme || "classic"}" aria-label="Flappy Bird mağazası">
        <div class="flappy-store-cloud flappy-store-cloud--1"></div>
        <div class="flappy-store-cloud flappy-store-cloud--2"></div>
        <div class="flappy-store-cloud flappy-store-cloud--3"></div>
        <div class="flappy-store-city"></div>
        <div class="flappy-store-bushes"></div>
        <div class="flappy-store-ground"></div>

        <button class="flappy-store-back" type="button" data-action="back" aria-label="Geri">‹</button>

        <div class="flappy-store-wallet" aria-label="Altın miktarı">
          <span class="flappy-store-coin" aria-hidden="true">S</span>
          <strong>${state.coins}</strong>
          <button class="flappy-store-plus" type="button" data-action="add-coins" aria-label="Altın ekle">+</button>
        </div>

        <header class="flappy-store-title-wrap">
          <span class="flappy-store-wing flappy-store-wing--left" aria-hidden="true"></span>
          <h3>MAĞAZA</h3>
          <span class="flappy-store-wing flappy-store-wing--right" aria-hidden="true"></span>
          <p>${subtitle}</p>
        </header>

        <nav class="flappy-store-tabs" aria-label="Mağaza sekmeleri">
          ${FLAPPY_SHOP_TABS.map((shopTab) => `
            <button class="flappy-store-tab flappy-store-tab--${shopTab.icon}${tab === shopTab.id ? " is-active" : ""}" type="button" data-tab="${shopTab.id}">
              <span aria-hidden="true"></span>
              ${shopTab.label}
            </button>
          `).join("")}
        </nav>

        ${state.shopMessage ? `<div class="flappy-store-message" role="status">${state.shopMessage}</div>` : ""}

        <div class="${gridClass}">
          ${tab === "backgrounds" ? renderBackgroundCards() : tab === "packages" ? renderPackageCards() : renderCharacterCards()}
        </div>

        <div class="flappy-store-info">
          <span aria-hidden="true">★</span>
          <strong>${info}</strong>
        </div>
      </section>
    `;
  }

  function renderCharacterCards() {
    const owned = readFlappyOwned();
    return Object.entries(FLAPPY_CHARACTERS).map(([id, item]) => {
      const locked = Boolean(item.locked);
      const isOwned = item.defaultOwned || owned.includes(id);
      const isEquipped = state.character === id;
      const classes = ["flappy-item-card", "flappy-item-card--character", isEquipped ? "is-selected" : "", locked ? "is-locked" : ""].filter(Boolean).join(" ");
      return `
        <article class="${classes}">
          ${isEquipped ? `<span class="flappy-store-check" aria-hidden="true">✓</span>` : ""}
          <div class="flappy-item-art">${renderStoreBird(id, item)}</div>
          <h4>${item.label}</h4>
          <button class="flappy-store-buy" type="button" data-char="${id}" ${locked ? "disabled" : ""}>
            ${renderStoreButton({ item, locked, selected: isEquipped, owned: isOwned })}
          </button>
        </article>
      `;
    }).join("");
  }

  function renderBackgroundCards() {
    const owned = readFlappyOwnedBackgrounds();
    return Object.entries(FLAPPY_BACKGROUNDS).map(([id, item]) => {
      const locked = Boolean(item.locked);
      const isOwned = item.defaultOwned || owned.includes(id);
      const isEquipped = state.background === id;
      const classes = ["flappy-item-card", "flappy-item-card--background", isEquipped ? "is-selected" : "", locked ? "is-locked" : ""].filter(Boolean).join(" ");
      return `
        <article class="${classes}">
          ${isEquipped ? `<span class="flappy-store-check" aria-hidden="true">✓</span>` : ""}
          <div class="flappy-item-art">${renderBackgroundPreview(item.theme)}</div>
          <h4>${item.label}</h4>
          <button class="flappy-store-buy" type="button" data-bg="${id}" ${locked ? "disabled" : ""}>
            ${renderStoreButton({ item, locked, selected: isEquipped, owned: isOwned })}
          </button>
        </article>
      `;
    }).join("");
  }

  function renderPackageCards() {
    const owned = readFlappyOwnedPackages();
    return Object.entries(FLAPPY_PACKAGES).map(([id, item]) => {
      const locked = Boolean(item.locked);
      const isOwned = owned.includes(id);
      const classes = ["flappy-item-card", "flappy-item-card--package", isOwned ? "is-selected" : "", locked ? "is-locked" : ""].filter(Boolean).join(" ");
      return `
        <article class="${classes}">
          ${isOwned ? `<span class="flappy-store-check" aria-hidden="true">✓</span>` : ""}
          <div class="flappy-item-art">${renderPackageArt(item.theme)}</div>
          <h4>${item.label}</h4>
          <button class="flappy-store-buy" type="button" data-package="${id}" ${locked ? "disabled" : ""}>
            ${renderStoreButton({ item, locked, selected: false, owned: isOwned, packageCard: true })}
          </button>
        </article>
      `;
    }).join("");
  }

  function renderStoreButton({ item, locked, selected, owned, packageCard = false }) {
    if (locked) return `<span class="flappy-mini-lock" aria-hidden="true"></span> YAKINDA`;
    if (selected) return `<span aria-hidden="true">✓</span> KULLANILIYOR`;
    if (owned) return packageCard ? `<span aria-hidden="true">✓</span> AÇILDI` : "KULLAN";
    return `<span class="flappy-store-coin flappy-store-coin--small" aria-hidden="true">S</span> ${item.price}`;
  }

  function renderStoreBird(id, item) {
    return `
      <div class="flappy-store-bird flappy-store-bird--${item.art}" style="--body-a:${item.body1};--body-b:${item.body2};--body-c:${item.body3};--wing:${item.wing};" aria-hidden="true">
        <span class="store-bird-wing"></span>
        <span class="store-bird-tail"></span>
        <span class="store-bird-eye"></span>
        <span class="store-bird-beak"></span>
        <span class="store-bird-detail store-bird-detail--one"></span>
        <span class="store-bird-detail store-bird-detail--two"></span>
        <span class="store-bird-detail store-bird-detail--three"></span>
      </div>
    `;
  }

  function renderBackgroundPreview(theme) {
    return `
      <div class="flappy-bg-preview flappy-bg-preview--${theme}" aria-hidden="true">
        <span class="preview-sun"></span>
        <span class="preview-moon"></span>
        <span class="preview-cloud preview-cloud--a"></span>
        <span class="preview-cloud preview-cloud--b"></span>
        <span class="preview-city"></span>
        <span class="preview-tree preview-tree--a"></span>
        <span class="preview-tree preview-tree--b"></span>
        <span class="preview-ground"></span>
      </div>
    `;
  }

  function renderPackageArt(theme) {
    return `
      <div class="flappy-package-art flappy-package-art--${theme}" aria-hidden="true">
        <span></span>
        <i>★</i>
        <i>★</i>
      </div>
    `;
  }

  function showReady() {
    state.phase = "ready";
    resetRound();
    audio.startMusic();
    state.best = readFlappyBest(state.difficulty);
    overlay.classList.remove("is-menu");
    overlay.classList.remove("is-shop");
    overlayTitle.hidden = false;
    overlayText.hidden = false;
    bestLabel.hidden = false;
    medal.hidden = true;
    overlayTitle.textContent = `${params().label} Mod`;
    overlayText.textContent = "Baslamak icin ekrana dokun veya bosluk tusuna bas.";
    bestLabel.textContent = state.best > 0 ? `Rekor: ${state.best}` : "";
    menu.innerHTML = "";
    overlay.hidden = false;
  }

  function endRound() {
    state.phase = "dead";
    audio.stopMusic();
    audio.play("crash");
    if (state.score > state.best) {
      state.best = state.score;
      writeFlappyBest(state.difficulty, state.best);
    }
    state.coins += state.runCoins;
    writeFlappyCoins(state.coins);
    const earned = state.runCoins;
    state.runCoins = 0;
    const medalIcon = state.score >= 50 ? "\u{1F947}" : state.score >= 25 ? "\u{1F948}" : state.score >= 10 ? "\u{1F949}" : "";
    medal.textContent = medalIcon;
    medal.hidden = !medalIcon;
    overlay.classList.remove("is-menu");
    overlay.classList.remove("is-shop");
    overlayTitle.hidden = false;
    overlayText.hidden = false;
    bestLabel.hidden = false;
    overlayTitle.textContent = "Oyun Bitti";
    overlayText.textContent = `Skorun: ${state.score} — Kazanilan: ${earned} \u{1FA99}`;
    bestLabel.textContent = `Rekor (${params().label}): ${state.best} | Toplam Altin: ${state.coins}`;
    menu.innerHTML = `
      <button class="flappy-menu-btn" type="button" data-action="retry">Tekrar Oyna</button>
      <button class="flappy-menu-btn" type="button" data-action="menu">Zorluk Degistir</button>
      <button class="flappy-menu-btn" type="button" data-action="home">Ana Menu</button>
    `;
    overlay.hidden = false;
  }

  function startPlaying() {
    resetRound();
    state.phase = "playing";
    overlay.hidden = true;
    state.bird.velocity = FLAP_VELOCITY;
    audio.play("flap");
  }

  function flap() {
    if (state.phase === "ready") {
      startPlaying();
      return;
    }
    if (state.phase === "playing") {
      state.bird.velocity = FLAP_VELOCITY;
      audio.play("flap");
    }
  }

  function update(delta) {
    const diff = params();

    state.bird.velocity += GRAVITY * delta;
    state.bird.y += state.bird.velocity * delta;
    state.distance += diff.speed * delta;

    state.spawnTimer -= delta;
    if (state.spawnTimer <= 0) {
      spawnPipe();
      state.spawnTimer = diff.interval;
    }

    const birdX = state.width * BIRD_X_RATIO;

    for (const pipe of state.pipes) {
      pipe.x -= diff.speed * delta;
      if (!pipe.passed && pipe.x + PIPE_WIDTH < birdX - BIRD_RADIUS) {
        pipe.passed = true;
        state.score += 1;
        audio.play("score");
      }
    }
    state.pipes = state.pipes.filter((pipe) => pipe.x + PIPE_WIDTH > -10);

    const COIN_RADIUS = 14;
    for (const coin of state.coinItems) {
      coin.x -= diff.speed * delta;
      if (!coin.collected) {
        const dx = birdX - coin.x;
        const dy = state.bird.y - coin.y;
        if (Math.hypot(dx, dy) < BIRD_RADIUS + COIN_RADIUS) {
          coin.collected = true;
          state.runCoins += 1;
          audio.play("score");
        }
      }
    }
    state.coinItems = state.coinItems.filter((coin) => !coin.collected && coin.x > -30);

    if (state.bird.y - BIRD_RADIUS <= 0) {
      state.bird.y = BIRD_RADIUS;
      state.bird.velocity = Math.max(state.bird.velocity, 0);
    }

    const groundY = state.height - GROUND_H;
    if (state.bird.y + BIRD_RADIUS >= groundY) {
      state.bird.y = groundY - BIRD_RADIUS;
      endRound();
      return;
    }

    for (const pipe of state.pipes) {
      const withinPipeX = birdX + BIRD_RADIUS > pipe.x && birdX - BIRD_RADIUS < pipe.x + PIPE_WIDTH;
      if (!withinPipeX) continue;
      if (state.bird.y - BIRD_RADIUS < pipe.gapTop || state.bird.y + BIRD_RADIUS > pipe.gapBottom) {
        endRound();
        return;
      }
    }
  }

  function drawBackground() {
    const { width, height } = state;
    const groundY = height - GROUND_H;
    const theme = FLAPPY_BACKGROUNDS[state.background] || FLAPPY_BACKGROUNDS.klasik;

    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(0.68, theme.sky[1]);
    sky.addColorStop(1, theme.sky[2]);
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    if (theme.sun) {
      context.save();
      context.fillStyle = theme.sun;
      context.shadowColor = theme.sun;
      context.shadowBlur = 28;
      context.beginPath();
      context.arc(width * 0.74, height * 0.17, 34, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    if (theme.star) {
      context.fillStyle = "rgba(255, 247, 185, .85)";
      for (let i = 0; i < 34; i += 1) {
        const x = (i * 97 + state.distance * 0.03) % width;
        const y = 24 + ((i * 53) % Math.max(80, groundY * 0.5));
        const size = 1 + (i % 3);
        context.fillRect(x, y, size, size);
      }
      context.fillStyle = "rgba(255, 245, 178, .92)";
      context.beginPath();
      context.arc(width * 0.78, height * 0.15, 22, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = theme.sky[0];
      context.beginPath();
      context.arc(width * 0.79, height * 0.13, 20, 0, Math.PI * 2);
      context.fill();
    }

    const cloudSpan = width + 260;
    const cloudShift = (state.distance * 0.12) % cloudSpan;
    context.fillStyle = theme.theme === "night" ? "rgba(142, 172, 222, .32)" : "rgba(255, 255, 255, .85)";
    for (const cloud of clouds) {
      let x = cloud.x * cloudSpan - cloudShift;
      if (x < -260) x += cloudSpan;
      const y = cloud.y * height;
      const s = cloud.scale;
      context.beginPath();
      context.ellipse(x, y, 46 * s, 16 * s, 0, 0, Math.PI * 2);
      context.ellipse(x + 26 * s, y - 12 * s, 30 * s, 14 * s, 0, 0, Math.PI * 2);
      context.ellipse(x - 30 * s, y - 7 * s, 24 * s, 12 * s, 0, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = theme.far;
    const backShift = (state.distance * 0.18) % 170;
    for (let x = -backShift; x < width + 170; x += 170) {
      context.beginPath();
      context.arc(x, groundY, 72, Math.PI, 2 * Math.PI);
      context.fill();
    }

    context.fillStyle = theme.near;
    const frontShift = (state.distance * 0.3) % 130;
    for (let x = -frontShift + 55; x < width + 130; x += 130) {
      context.beginPath();
      context.arc(x, groundY, 48, Math.PI, 2 * Math.PI);
      context.fill();
    }
  }

  function drawPipe(pipe) {
    const groundY = state.height - GROUND_H;
    const capH = 26;

    const bodyGrad = context.createLinearGradient(pipe.x, 0, pipe.x + PIPE_WIDTH, 0);
    bodyGrad.addColorStop(0, "#5ec46a");
    bodyGrad.addColorStop(0.35, "#7fdd8b");
    bodyGrad.addColorStop(0.6, "#4cb85a");
    bodyGrad.addColorStop(1, "#319340");

    context.fillStyle = bodyGrad;
    context.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapTop - capH);
    context.fillRect(pipe.x, pipe.gapBottom + capH, PIPE_WIDTH, groundY - pipe.gapBottom - capH);

    const capGrad = context.createLinearGradient(pipe.x - 5, 0, pipe.x + PIPE_WIDTH + 5, 0);
    capGrad.addColorStop(0, "#6fd07a");
    capGrad.addColorStop(0.5, "#8ee89a");
    capGrad.addColorStop(1, "#2e8c3a");
    context.fillStyle = capGrad;
    context.fillRect(pipe.x - 5, pipe.gapTop - capH, PIPE_WIDTH + 10, capH);
    context.fillRect(pipe.x - 5, pipe.gapBottom, PIPE_WIDTH + 10, capH);

    context.strokeStyle = "rgba(20, 80, 30, .55)";
    context.lineWidth = 2;
    context.strokeRect(pipe.x - 5, pipe.gapTop - capH, PIPE_WIDTH + 10, capH);
    context.strokeRect(pipe.x - 5, pipe.gapBottom, PIPE_WIDTH + 10, capH);
  }

  function drawCoin(coin) {
    const spin = Math.cos(coin.wobble + state.distance * 0.012);
    const radiusX = Math.max(Math.abs(spin) * 15, 3);
    const radiusY = 15;

    context.save();
    context.translate(coin.x, coin.y);

    const bodyGrad = context.createLinearGradient(-radiusX, 0, radiusX, 0);
    bodyGrad.addColorStop(0, "#f7d35a");
    bodyGrad.addColorStop(0.5, "#ffe98a");
    bodyGrad.addColorStop(1, "#e0a92e");
    context.fillStyle = bodyGrad;
    context.beginPath();
    context.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(150, 96, 8, .7)";
    context.lineWidth = 2;
    context.stroke();

    if (Math.abs(spin) > 0.35) {
      context.fillStyle = "rgba(150, 96, 8, .55)";
      context.font = "700 15px 'Segoe UI', Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("$", 0, 1);
    }

    context.restore();
  }

  function drawGround() {
    const { width, height } = state;
    const groundY = height - GROUND_H;
    const theme = FLAPPY_BACKGROUNDS[state.background] || FLAPPY_BACKGROUNDS.klasik;

    context.fillStyle = theme.groundBottom;
    context.fillRect(0, groundY, width, GROUND_H);

    const shift = state.distance % 34;
    context.fillStyle = "rgba(0, 0, 0, .16)";
    for (let x = -shift - 34; x < width + 34; x += 34) {
      context.beginPath();
      context.moveTo(x, height);
      context.lineTo(x + 18, groundY + 12);
      context.lineTo(x + 30, groundY + 12);
      context.lineTo(x + 12, height);
      context.closePath();
      context.fill();
    }

    const grass = context.createLinearGradient(0, groundY, 0, groundY + 12);
    grass.addColorStop(0, theme.groundTop);
    grass.addColorStop(1, theme.groundBottom);
    context.fillStyle = grass;
    context.fillRect(0, groundY, width, 12);
    context.fillStyle = "rgba(255, 255, 255, .18)";
    context.fillRect(0, groundY + 12, width, 2);
  }

  function drawBird() {
    const palette = FLAPPY_CHARACTERS[state.character] || FLAPPY_CHARACTERS.klasik;
    const birdX = state.width * BIRD_X_RATIO;
    const dead = state.phase === "dead";
    const tilt = dead ? 0.9 : Math.max(-0.45, Math.min(0.9, state.bird.velocity / 700));

    context.save();
    context.translate(birdX, state.bird.y);
    context.rotate(tilt);

    const body = context.createRadialGradient(-4, -6, 4, 0, 0, BIRD_RADIUS + 6);
    body.addColorStop(0, palette.body1);
    body.addColorStop(0.65, palette.body2);
    body.addColorStop(1, palette.body3);
    context.fillStyle = body;
    context.beginPath();
    context.ellipse(0, 0, BIRD_RADIUS + 4, BIRD_RADIUS, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = palette.stroke;
    context.lineWidth = 2;
    context.stroke();

    if (palette.art === "speed") {
      context.fillStyle = "#161923";
      context.beginPath();
      context.moveTo(-2, -15);
      context.lineTo(-12, -5);
      context.lineTo(-5, -5);
      context.lineTo(-15, 8);
      context.lineTo(1, -3);
      context.lineTo(-7, -3);
      context.closePath();
      context.fill();
    }

    if (palette.art === "ninja") {
      context.fillStyle = "#e73838";
      context.fillRect(-18, -11, 26, 6);
      context.beginPath();
      context.moveTo(-16, -8);
      context.lineTo(-29, -15);
      context.lineTo(-23, -4);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(-17, -5);
      context.lineTo(-31, 3);
      context.lineTo(-22, 5);
      context.closePath();
      context.fill();
    }

    if (palette.art === "monster") {
      context.strokeStyle = "#1b5121";
      context.lineWidth = 1.8;
      context.beginPath();
      context.moveTo(-5, -13);
      context.lineTo(0, -7);
      context.lineTo(5, -13);
      context.stroke();
      context.fillStyle = "#7b8794";
      context.strokeStyle = "#26303b";
      context.lineWidth = 1.2;
      context.beginPath();
      context.rect(-22, -2, 5, 7);
      context.rect(15, -2, 5, 7);
      context.fill();
      context.stroke();
    }

    if (palette.art === "unicorn") {
      const horn = context.createLinearGradient(2, -28, 9, -11);
      horn.addColorStop(0, "#fff9b3");
      horn.addColorStop(1, "#ffb33f");
      context.fillStyle = horn;
      context.beginPath();
      context.moveTo(2, -15);
      context.lineTo(7, -30);
      context.lineTo(12, -14);
      context.closePath();
      context.fill();
      context.strokeStyle = "#7441b8";
      context.lineWidth = 1.4;
      context.stroke();
      ["#ff4fa3", "#ffd83d", "#36d1ff", "#7ef15e"].forEach((color, index) => {
        context.fillStyle = color;
        context.beginPath();
        context.arc(-12 + index * 4, -15 - (index % 2) * 3, 4, 0, Math.PI * 2);
        context.fill();
      });
    }

    if (palette.art === "pilot") {
      context.fillStyle = "#7a451d";
      context.beginPath();
      context.ellipse(-2, -13, 17, 9, 0.1, Math.PI, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#3d220f";
      context.lineWidth = 1.5;
      context.stroke();
      context.strokeStyle = "#3d220f";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(5, -12, 6, 0, Math.PI * 2);
      context.arc(17, -11, 6, 0, Math.PI * 2);
      context.moveTo(11, -12);
      context.lineTo(12, -12);
      context.stroke();
      context.fillStyle = "rgba(139, 232, 255, .55)";
      context.beginPath();
      context.arc(5, -12, 4, 0, Math.PI * 2);
      context.arc(17, -11, 4, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = palette.belly;
    context.beginPath();
    context.ellipse(2, 6, 10, 6, 0, 0, Math.PI * 2);
    context.fill();

    const wingAngle = dead ? 0.5 : Math.sin(state.wingPhase) * 0.7;
    context.save();
    context.translate(-4, 0);
    context.rotate(wingAngle);
    context.fillStyle = palette.wing;
    context.beginPath();
    context.ellipse(-6, 0, 11, 7, -0.3, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = palette.wingStroke;
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();

    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(8, -6, 5.5, 0, Math.PI * 2);
    context.fill();
    if (dead) {
      context.strokeStyle = "#222222";
      context.lineWidth = 1.8;
      context.beginPath();
      context.moveTo(6, -8);
      context.lineTo(11, -3);
      context.moveTo(11, -8);
      context.lineTo(6, -3);
      context.stroke();
    } else {
      context.fillStyle = "#222222";
      context.beginPath();
      context.arc(9.5, -6, 2.4, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = palette.beak;
    context.beginPath();
    context.moveTo(14, -1);
    context.lineTo(26, 2);
    context.lineTo(14, 6);
    context.closePath();
    context.fill();
    context.strokeStyle = palette.beakStroke;
    context.lineWidth = 1.5;
    context.stroke();

    context.restore();
  }

  function draw() {
    drawBackground();
    for (const pipe of state.pipes) drawPipe(pipe);
    for (const coin of state.coinItems) drawCoin(coin);
    drawGround();
    drawBird();

    if (state.phase === "playing") {
      context.fillStyle = "#ffffff";
      context.strokeStyle = "rgba(0, 0, 0, .35)";
      context.lineWidth = 5;
      context.font = "700 46px 'Segoe UI', Arial, sans-serif";
      context.textAlign = "center";
      context.strokeText(String(state.score), state.width / 2, 74);
      context.fillText(String(state.score), state.width / 2, 74);
    }
  }

  function frame(time) {
    state.rafId = requestAnimationFrame(frame);
    const delta = Math.min((time - state.lastTime) / 1000, 0.05);
    state.lastTime = time;
    if (state.phase === "playing") {
      state.wingPhase += delta * 16;
      update(delta);
    } else {
      state.wingPhase += delta * 5;
    }
    draw();
  }

  function onPointerDown(event) {
    if (event.target.closest(".flappy-menu-btn, .flappy-main-menu, .flappy-store")) return;
    event.preventDefault();
    flap();
  }

  function addShopMessage(message) {
    state.shopMessage = message;
  }

  function onCharacterClick(id) {
    const item = FLAPPY_CHARACTERS[id];
    if (!item || item.locked) {
      addShopMessage("Bu karakter yakinda acilacak.");
      showShop("characters");
      return;
    }

    const owned = readFlappyOwned();
    if (item.defaultOwned || owned.includes(id)) {
      state.character = id;
      writeFlappyEquipped(id);
      audio.play("equip");
      addShopMessage(`${item.label} kullaniliyor.`);
      showShop("characters");
      return;
    }

    const price = item.price ?? Infinity;
    if (state.coins < price) {
      audio.play("click");
      addShopMessage("Yeterli altin yok.");
      showShop("characters");
      return;
    }

    state.coins -= price;
    writeFlappyCoins(state.coins);
    writeFlappyOwned([...owned, id]);
    state.character = id;
    writeFlappyEquipped(id);
    audio.play("purchase");
    addShopMessage(`${item.label} satin alindi.`);
    showShop("characters");
  }

  function onBackgroundClick(id) {
    const item = FLAPPY_BACKGROUNDS[id];
    if (!item || item.locked) {
      addShopMessage("Bu arka plan yakinda acilacak.");
      showShop("backgrounds");
      return;
    }

    const owned = readFlappyOwnedBackgrounds();
    if (item.defaultOwned || owned.includes(id)) {
      state.background = id;
      writeFlappyEquippedBackground(id);
      audio.play("equip");
      addShopMessage(`${item.label} kullaniliyor.`);
      showShop("backgrounds");
      return;
    }

    const price = item.price ?? Infinity;
    if (state.coins < price) {
      audio.play("click");
      addShopMessage("Yeterli altin yok.");
      showShop("backgrounds");
      return;
    }

    state.coins -= price;
    writeFlappyCoins(state.coins);
    writeFlappyOwnedBackgrounds([...owned, id]);
    state.background = id;
    writeFlappyEquippedBackground(id);
    audio.play("purchase");
    addShopMessage(`${item.label} satin alindi.`);
    showShop("backgrounds");
  }

  function onPackageClick(id) {
    const item = FLAPPY_PACKAGES[id];
    if (!item || item.locked) {
      addShopMessage("Bu paket yakinda acilacak.");
      showShop("packages");
      return;
    }

    const ownedPackages = readFlappyOwnedPackages();
    if (ownedPackages.includes(id)) {
      audio.play("equip");
      addShopMessage(`${item.label} paketi acik.`);
      showShop("packages");
      return;
    }

    const price = item.price ?? Infinity;
    if (state.coins < price) {
      audio.play("click");
      addShopMessage("Yeterli altin yok.");
      showShop("packages");
      return;
    }

    const ownedCharacters = new Set(readFlappyOwned());
    const ownedBackgrounds = new Set(readFlappyOwnedBackgrounds());
    item.unlockCharacters.forEach((key) => {
      if (FLAPPY_CHARACTERS[key] && !FLAPPY_CHARACTERS[key].locked) ownedCharacters.add(key);
    });
    item.unlockBackgrounds.forEach((key) => {
      if (FLAPPY_BACKGROUNDS[key] && !FLAPPY_BACKGROUNDS[key].locked) ownedBackgrounds.add(key);
    });

    state.coins -= price;
    writeFlappyCoins(state.coins);
    writeFlappyOwnedPackages([...ownedPackages, id]);
    writeFlappyOwned([...ownedCharacters]);
    writeFlappyOwnedBackgrounds([...ownedBackgrounds]);
    audio.play("purchase");
    addShopMessage(`${item.label} paketi acildi.`);
    showShop("packages");
  }

  function onMenuClick(event) {
    const button = event.target.closest("[data-action], [data-diff], [data-char], [data-bg], [data-package], [data-tab]");
    if (!button) return;
    if (button.dataset.diff) {
      state.shopMessage = "";
      state.difficulty = button.dataset.diff;
      showReady();
      return;
    }
    if (button.dataset.char) {
      onCharacterClick(button.dataset.char);
      return;
    }
    if (button.dataset.bg) {
      onBackgroundClick(button.dataset.bg);
      return;
    }
    if (button.dataset.package) {
      onPackageClick(button.dataset.package);
      return;
    }
    if (button.dataset.tab) {
      state.shopMessage = "";
      showShop(button.dataset.tab);
      return;
    }
    const action = button.dataset.action;
    if (action === "play") { state.shopMessage = ""; audio.play("click"); showDifficultyPicker(); return; }
    if (action === "shop") { state.shopMessage = ""; audio.play("purchase"); showShop("characters"); return; }
    if (action === "toggle-music") {
      audio.toggleMusic();
      audio.play("click");
      showMenu();
      return;
    }
    if (action === "toggle-sfx") {
      const next = audio.toggleSfx();
      if (next) audio.play("click");
      showMenu();
      return;
    }
    if (action === "volume-down" || action === "volume-up") {
      const current = audio.getSettings().masterVolume;
      audio.setMasterVolume(current + (action === "volume-up" ? 10 : -10));
      audio.play("click");
      showMenu();
      return;
    }
    if (action === "add-coins") {
      state.coins += 250;
      writeFlappyCoins(state.coins);
      audio.play("purchase");
      addShopMessage("250 altin eklendi.");
      showShop(state.shopTab);
      return;
    }
    if (action === "back") { state.shopMessage = ""; showMenu(); return; }
    if (action === "retry") { state.shopMessage = ""; showReady(); return; }
    if (action === "menu") { state.shopMessage = ""; showDifficultyPicker(); return; }
    if (action === "home") { state.shopMessage = ""; showMenu(); return; }
  }

  function onKeyDown(event) {
    if (event.code !== "Space" && event.code !== "ArrowUp") return;
    if (!document.body.contains(canvas)) return;
    event.preventDefault();
    flap();
  }

  shell.addEventListener("pointerdown", onPointerDown);
  menu.addEventListener("click", onMenuClick);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  showMenu();
  state.rafId = requestAnimationFrame((time) => {
    state.lastTime = time;
    frame(time);
  });

  flappyState = {
    cleanup() {
      cancelAnimationFrame(state.rafId);
      audio.stopMusic();
      shell.removeEventListener("pointerdown", onPointerDown);
      menu.removeEventListener("click", onMenuClick);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", resizeCanvas);
    }
  };
}

function readFlappyBest(difficulty) {
  try {
    return Number(localStorage.getItem(`flappyBestScore-${difficulty}`)) || 0;
  } catch {
    return 0;
  }
}

function writeFlappyBest(difficulty, score) {
  try {
    localStorage.setItem(`flappyBestScore-${difficulty}`, String(score));
  } catch {
    /* localStorage kapali olabilir */
  }
}

function readFlappyCoins() {
  try {
    const raw = localStorage.getItem("flappyCoins");
    if (raw === null) return FLAPPY_STARTING_COINS;
    const amount = Number(raw);
    return Number.isFinite(amount) ? amount : FLAPPY_STARTING_COINS;
  } catch {
    return FLAPPY_STARTING_COINS;
  }
}

function writeFlappyCoins(amount) {
  try {
    localStorage.setItem("flappyCoins", String(amount));
  } catch {
    /* localStorage kapali olabilir */
  }
}

function readFlappyOwned() {
  try {
    const parsed = JSON.parse(localStorage.getItem("flappyOwnedCharacters"));
    const list = Array.isArray(parsed) && parsed.length ? parsed : ["klasik"];
    return normalizeFlappyKeys(list, FLAPPY_CHARACTERS, ["klasik"]);
  } catch {
    return ["klasik"];
  }
}

function writeFlappyOwned(list) {
  try {
    localStorage.setItem("flappyOwnedCharacters", JSON.stringify(normalizeFlappyKeys(list, FLAPPY_CHARACTERS, ["klasik"])));
  } catch {
    /* localStorage kapali olabilir */
  }
}

function readFlappyEquipped() {
  try {
    const id = localStorage.getItem("flappyEquippedCharacter") || "klasik";
    const item = FLAPPY_CHARACTERS[id];
    return item && !item.locked ? id : "klasik";
  } catch {
    return "klasik";
  }
}

function writeFlappyEquipped(id) {
  try {
    if (FLAPPY_CHARACTERS[id] && !FLAPPY_CHARACTERS[id].locked) {
      localStorage.setItem("flappyEquippedCharacter", id);
    }
  } catch {
    /* localStorage kapali olabilir */
  }
}

function readFlappyOwnedBackgrounds() {
  try {
    const parsed = JSON.parse(localStorage.getItem("flappyOwnedBackgrounds"));
    const list = Array.isArray(parsed) && parsed.length ? parsed : ["klasik"];
    return normalizeFlappyKeys(list, FLAPPY_BACKGROUNDS, ["klasik"]);
  } catch {
    return ["klasik"];
  }
}

function writeFlappyOwnedBackgrounds(list) {
  try {
    localStorage.setItem("flappyOwnedBackgrounds", JSON.stringify(normalizeFlappyKeys(list, FLAPPY_BACKGROUNDS, ["klasik"])));
  } catch {
    /* localStorage kapali olabilir */
  }
}

function readFlappyEquippedBackground() {
  try {
    const id = localStorage.getItem("flappyEquippedBackground") || "klasik";
    const item = FLAPPY_BACKGROUNDS[id];
    return item && !item.locked ? id : "klasik";
  } catch {
    return "klasik";
  }
}

function writeFlappyEquippedBackground(id) {
  try {
    if (FLAPPY_BACKGROUNDS[id] && !FLAPPY_BACKGROUNDS[id].locked) {
      localStorage.setItem("flappyEquippedBackground", id);
    }
  } catch {
    /* localStorage kapali olabilir */
  }
}

function readFlappyOwnedPackages() {
  try {
    const parsed = JSON.parse(localStorage.getItem("flappyOwnedPackages"));
    return normalizeFlappyKeys(Array.isArray(parsed) ? parsed : [], FLAPPY_PACKAGES, []);
  } catch {
    return [];
  }
}

function writeFlappyOwnedPackages(list) {
  try {
    localStorage.setItem("flappyOwnedPackages", JSON.stringify(normalizeFlappyKeys(list, FLAPPY_PACKAGES, [])));
  } catch {
    /* localStorage kapali olabilir */
  }
}

function normalizeFlappyKeys(list, source, defaults) {
  const valid = Array.isArray(list) ? list : [];
  return Array.from(new Set([
    ...defaults,
    ...valid.filter((id) => source[id] && !source[id].locked)
  ]));
}

/* =============================== SUDOKU =============================== */

const SUDOKU_DIFFICULTY = {
  kolay: { label: "Kolay", holes: 38 },
  orta: { label: "Orta", holes: 46 },
  zor: { label: "Zor", holes: 52 }
};
const SUDOKU_MAX_MISTAKES = 3;
const SUDOKU_HINTS = 3;

const SUDOKU_ICONS = {
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>`,
  erase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.6-4.6a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l6.2 6.2a1 1 0 0 1 0 1.4L12 21H7Z"/><path d="M17 17H9"/></svg>`,
  notes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  hint: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 1 4 12.7c-.6.5-1 1.3-1 2.3h-6c0-1-.4-1.8-1-2.3A7 7 0 0 1 12 2Z"/></svg>`
};

function renderSudoku(target) {
  sudokuState = {
    target,
    phase: "pick",
    difficulty: "orta",
    puzzle: null,
    solution: null,
    board: null,
    notes: null,
    selected: null,
    mistakes: 0,
    hintsLeft: SUDOKU_HINTS,
    notesMode: false,
    history: [],
    elapsed: 0,
    timerId: 0,
    cleanup: cleanupSudoku
  };

  window.addEventListener("keydown", onSudokuKeyDown);
  target.onclick = onSudokuClick;
  renderSudokuScreen();
}

function cleanupSudoku() {
  stopSudokuTimer();
  window.removeEventListener("keydown", onSudokuKeyDown);
  if (sudokuState?.target) sudokuState.target.onclick = null;
}

function startSudokuTimer() {
  stopSudokuTimer();
  sudokuState.timerId = setInterval(() => {
    if (!sudokuState) return;
    sudokuState.elapsed += 1;
    const label = sudokuState.target?.querySelector("#sudokuTime");
    if (label) label.textContent = formatSudokuTime(sudokuState.elapsed);
  }, 1000);
}

function stopSudokuTimer() {
  if (sudokuState?.timerId) {
    clearInterval(sudokuState.timerId);
    sudokuState.timerId = 0;
  }
}

function formatSudokuTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startSudokuGame(difficulty) {
  const config = SUDOKU_DIFFICULTY[difficulty] || SUDOKU_DIFFICULTY.orta;
  const { puzzle, solution } = createSudokuPuzzle(config.holes);

  Object.assign(sudokuState, {
    phase: "playing",
    difficulty,
    puzzle,
    solution,
    board: puzzle.map((row) => [...row]),
    notes: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set())),
    selected: null,
    mistakes: 0,
    hintsLeft: SUDOKU_HINTS,
    notesMode: false,
    history: [],
    elapsed: 0
  });

  startSudokuTimer();
  renderSudokuScreen();
}

function onSudokuClick(event) {
  if (!sudokuState) return;

  const diffBtn = event.target.closest("[data-diff]");
  if (diffBtn) {
    startSudokuGame(diffBtn.dataset.diff);
    return;
  }

  const actionBtn = event.target.closest("[data-action]");
  if (actionBtn) {
    if (actionBtn.dataset.action === "retry") {
      startSudokuGame(sudokuState.difficulty);
    } else if (actionBtn.dataset.action === "pick") {
      stopSudokuTimer();
      sudokuState.phase = "pick";
      renderSudokuScreen();
    }
    return;
  }

  if (sudokuState.phase !== "playing") return;

  const cell = event.target.closest(".sudoku-cell");
  if (cell) {
    sudokuState.selected = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    renderSudokuScreen();
    return;
  }

  const tool = event.target.closest("[data-tool]");
  if (tool) {
    handleSudokuTool(tool.dataset.tool);
    return;
  }

  const num = event.target.closest("[data-digit]");
  if (num && !num.disabled) enterSudokuDigit(Number(num.dataset.digit));
}

function onSudokuKeyDown(event) {
  if (!sudokuState || sudokuState.phase !== "playing") return;

  if (event.key >= "1" && event.key <= "9") {
    enterSudokuDigit(Number(event.key));
    return;
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    event.preventDefault();
    handleSudokuTool("erase");
    return;
  }

  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (moves[event.key]) {
    event.preventDefault();
    const current = sudokuState.selected || { row: 0, col: 0 };
    sudokuState.selected = {
      row: Math.min(8, Math.max(0, current.row + moves[event.key][0])),
      col: Math.min(8, Math.max(0, current.col + moves[event.key][1]))
    };
    renderSudokuScreen();
  }
}

function handleSudokuTool(tool) {
  if (tool === "undo") undoSudokuMove();
  else if (tool === "erase") eraseSudokuCell();
  else if (tool === "notes") {
    sudokuState.notesMode = !sudokuState.notesMode;
    renderSudokuScreen();
  } else if (tool === "hint") useSudokuHint();
}

function sudokuCellLocked(row, col) {
  const s = sudokuState;
  if (s.puzzle[row][col] !== 0) return true;
  return s.board[row][col] !== 0 && s.board[row][col] === s.solution[row][col];
}

function pushSudokuHistory(row, col) {
  sudokuState.history.push({
    row,
    col,
    value: sudokuState.board[row][col],
    notes: new Set(sudokuState.notes[row][col])
  });
}

function enterSudokuDigit(digit) {
  const s = sudokuState;
  if (!s.selected) return;
  const { row, col } = s.selected;
  if (sudokuCellLocked(row, col)) return;

  if (s.notesMode) {
    pushSudokuHistory(row, col);
    s.board[row][col] = 0;
    if (s.notes[row][col].has(digit)) s.notes[row][col].delete(digit);
    else s.notes[row][col].add(digit);
    renderSudokuScreen();
    return;
  }

  if (s.board[row][col] === digit) return;
  pushSudokuHistory(row, col);
  s.board[row][col] = digit;
  s.notes[row][col] = new Set();

  if (digit !== s.solution[row][col]) {
    s.mistakes += 1;
    if (s.mistakes >= SUDOKU_MAX_MISTAKES) {
      stopSudokuTimer();
      s.phase = "lost";
    }
  } else {
    clearSudokuPeerNotes(row, col, digit);
    if (isSudokuComplete()) {
      stopSudokuTimer();
      s.phase = "won";
    }
  }

  renderSudokuScreen();
}

function eraseSudokuCell() {
  const s = sudokuState;
  if (!s.selected) return;
  const { row, col } = s.selected;
  if (sudokuCellLocked(row, col)) return;
  if (s.board[row][col] === 0 && !s.notes[row][col].size) return;

  pushSudokuHistory(row, col);
  s.board[row][col] = 0;
  s.notes[row][col] = new Set();
  renderSudokuScreen();
}

function undoSudokuMove() {
  const s = sudokuState;
  const entry = s.history.pop();
  if (!entry) return;
  s.board[entry.row][entry.col] = entry.value;
  s.notes[entry.row][entry.col] = entry.notes;
  s.selected = { row: entry.row, col: entry.col };
  renderSudokuScreen();
}

function useSudokuHint() {
  const s = sudokuState;
  if (s.hintsLeft <= 0) return;

  let targetCell = null;
  if (s.selected && !sudokuCellLocked(s.selected.row, s.selected.col)) {
    targetCell = { ...s.selected };
  }
  if (!targetCell) {
    const openCells = [];
    for (let row = 0; row < 9; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        if (!sudokuCellLocked(row, col)) openCells.push({ row, col });
      }
    }
    if (!openCells.length) return;
    targetCell = openCells[Math.floor(Math.random() * openCells.length)];
  }

  const { row, col } = targetCell;
  pushSudokuHistory(row, col);
  s.board[row][col] = s.solution[row][col];
  s.notes[row][col] = new Set();
  s.hintsLeft -= 1;
  s.selected = { row, col };
  clearSudokuPeerNotes(row, col, s.board[row][col]);

  if (isSudokuComplete()) {
    stopSudokuTimer();
    s.phase = "won";
  }
  renderSudokuScreen();
}

function clearSudokuPeerNotes(row, col, digit) {
  const s = sudokuState;
  const blockRow = Math.floor(row / 3) * 3;
  const blockCol = Math.floor(col / 3) * 3;
  for (let index = 0; index < 9; index += 1) {
    s.notes[row][index].delete(digit);
    s.notes[index][col].delete(digit);
    s.notes[blockRow + Math.floor(index / 3)][blockCol + (index % 3)].delete(digit);
  }
}

function isSudokuComplete() {
  const { board, solution } = sudokuState;
  return board.every((rowValues, row) => rowValues.every((value, col) => value === solution[row][col]));
}

function sudokuRemaining(digit) {
  const { board, solution } = sudokuState;
  let placed = 0;
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      if (board[row][col] === digit && solution[row][col] === digit) placed += 1;
    }
  }
  return 9 - placed;
}

function renderSudokuCells() {
  const { puzzle, board, solution, selected, notes } = sudokuState;
  const selectedValue = selected ? board[selected.row][selected.col] : 0;

  return board.map((rowValues, row) => rowValues.map((value, col) => {
    const isGiven = puzzle[row][col] !== 0;
    const isSelected = !!selected && selected.row === row && selected.col === col;
    const isPeer = !!selected && !isSelected && (
      selected.row === row ||
      selected.col === col ||
      (Math.floor(selected.row / 3) === Math.floor(row / 3) && Math.floor(selected.col / 3) === Math.floor(col / 3))
    );
    const isSame = !isSelected && value !== 0 && value === selectedValue;
    const isWrong = value !== 0 && !isGiven && value !== solution[row][col];
    const cellNotes = notes[row][col];

    const classes = [
      "sudoku-cell",
      isGiven ? "is-given" : "is-user",
      isSelected ? "is-selected" : "",
      isPeer ? "is-peer" : "",
      isSame ? "is-same" : "",
      isWrong ? "is-wrong" : "",
      col % 3 === 2 && col !== 8 ? "block-right" : "",
      row % 3 === 2 && row !== 8 ? "block-bottom" : ""
    ].filter(Boolean).join(" ");

    let content = "";
    if (value !== 0) {
      content = String(value);
    } else if (cellNotes.size) {
      content = `<span class="sudoku-notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<i>${cellNotes.has(d) ? d : ""}</i>`).join("")}</span>`;
    }

    return `<button class="${classes}" type="button" data-row="${row}" data-col="${col}" aria-label="Satir ${row + 1}, sutun ${col + 1}">${content}</button>`;
  }).join("")).join("");
}

function renderSudokuScreen() {
  const { target, phase } = sudokuState;

  if (phase === "pick") {
    target.innerHTML = `
      <div class="sudoku-game">
        <div class="sudoku-panel">
          <strong>Sudoku</strong>
          <p>Zorluk seviyeni sec.</p>
          <div class="sudoku-panel-btns">
            ${Object.entries(SUDOKU_DIFFICULTY).map(([key, diff]) => `
              <button class="sudoku-panel-btn" type="button" data-diff="${key}">${diff.label}</button>
            `).join("")}
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (phase === "won" || phase === "lost") {
    const won = phase === "won";
    target.innerHTML = `
      <div class="sudoku-game">
        <div class="sudoku-panel">
          <strong>${won ? "Tebrikler!" : "Oyun Bitti"}</strong>
          <p>${won
            ? `${SUDOKU_DIFFICULTY[sudokuState.difficulty].label} sudokuyu ${formatSudokuTime(sudokuState.elapsed)} surede cozdun.`
            : `${SUDOKU_MAX_MISTAKES} hata yaptin. Yeni bir tahtayla tekrar dene.`}</p>
          <div class="sudoku-panel-btns">
            <button class="sudoku-panel-btn" type="button" data-action="retry">Tekrar Oyna</button>
            <button class="sudoku-panel-btn sudoku-panel-btn--ghost" type="button" data-action="pick">Zorluk Sec</button>
          </div>
        </div>
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <div class="sudoku-game">
      <div class="sudoku-topbar">
        <span>${SUDOKU_DIFFICULTY[sudokuState.difficulty].label}</span>
        <span>Hata: ${sudokuState.mistakes}/${SUDOKU_MAX_MISTAKES}</span>
        <span id="sudokuTime">${formatSudokuTime(sudokuState.elapsed)}</span>
      </div>
      <div class="sudoku-board" id="sudokuBoard" aria-label="Sudoku tahtasi">${renderSudokuCells()}</div>
      <div class="sudoku-tools">
        <button class="sudoku-tool-btn" type="button" data-tool="undo" aria-label="Geri al">
          ${SUDOKU_ICONS.undo}<small>Geri Al</small>
        </button>
        <button class="sudoku-tool-btn" type="button" data-tool="erase" aria-label="Sil">
          ${SUDOKU_ICONS.erase}<small>Sil</small>
        </button>
        <button class="sudoku-tool-btn${sudokuState.notesMode ? " is-active" : ""}" type="button" data-tool="notes" aria-label="Notlar">
          <span class="sudoku-tool-badge">${sudokuState.notesMode ? "ACIK" : "KAPALI"}</span>
          ${SUDOKU_ICONS.notes}<small>Notlar</small>
        </button>
        <button class="sudoku-tool-btn" type="button" data-tool="hint" aria-label="Ipucu">
          <span class="sudoku-tool-badge">${sudokuState.hintsLeft}</span>
          ${SUDOKU_ICONS.hint}<small>Ipucu</small>
        </button>
      </div>
      <div class="sudoku-numrow">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => {
          const remaining = sudokuRemaining(digit);
          return `<button class="sudoku-num" type="button" data-digit="${digit}" ${remaining <= 0 ? "disabled" : ""}>
            <span>${digit}</span><small>${remaining}</small>
          </button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function createSudokuPuzzle(holes) {
  const solution = generateSolvedSudoku();
  const puzzle = solution.map((row) => [...row]);

  const positions = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) positions.push({ row, col });
  }
  shuffleArray(positions);

  let removed = 0;
  for (const { row, col } of positions) {
    if (removed >= holes) break;
    puzzle[row][col] = 0;
    removed += 1;
  }

  return { puzzle, solution };
}

function generateSolvedSudoku() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));

  const fill = (index) => {
    if (index === 81) return true;
    const row = Math.floor(index / 9);
    const col = index % 9;
    const digits = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const digit of digits) {
      if (canPlaceSudokuDigit(board, row, col, digit)) {
        board[row][col] = digit;
        if (fill(index + 1)) return true;
        board[row][col] = 0;
      }
    }
    return false;
  };

  fill(0);
  return board;
}

function canPlaceSudokuDigit(board, row, col, digit) {
  for (let index = 0; index < 9; index += 1) {
    if (board[row][index] === digit || board[index][col] === digit) return false;
  }
  const blockRow = Math.floor(row / 3) * 3;
  const blockCol = Math.floor(col / 3) * 3;
  for (let r = blockRow; r < blockRow + 3; r += 1) {
    for (let c = blockCol; c < blockCol + 3; c += 1) {
      if (board[r][c] === digit) return false;
    }
  }
  return true;
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}
