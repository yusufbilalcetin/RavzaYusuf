import { createGameAudio } from "../utils/game-audio.js";

const GAME_META = {
  "candy-match": {
    badge: "SONSUZ",
    title: "Candy Crush",
    subtitle: "Yan yana iki sekeri degistir. Uclu veya daha fazla eslesme puan verir; hamle siniri yok."
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

let candyState = null;
let flappyState = null;
let sudokuState = null;

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

  if (options.openGame) {
    openGame(root, options.openGame);
    return { skipTopScroll: true };
  }

  return undefined;
}

function openGame(root, gameId) {
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
    root.classList.remove("is-sudoku");
    renderCandyCrushApp(body);
  } else if (gameId === "flappy-bird") {
    enterGameFullscreen(root);
    root.classList.remove("is-candy-crush-app");
    root.classList.remove("is-sudoku");
    renderFlappyBird(body);
  } else if (gameId === "sudoku") {
    enterGameFullscreen(root);
    root.classList.remove("is-candy-crush-app");
    root.classList.add("is-sudoku");
    renderSudoku(body);
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
  target.innerHTML = `
    <div class="candy-crush-game-shell">
      <iframe
        class="candy-crush-game-frame"
        src="${CANDY_CRUSH_APP_URL}"
        title="Candy Crush"
        loading="eager"
        allow="autoplay; fullscreen"
      ></iframe>
      <a class="candy-crush-game-link" href="${CANDY_CRUSH_APP_URL}" target="_blank" rel="noopener">Tam ekranda ac</a>
    </div>
  `;
}

function closeGame(root) {
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
}

function enterGameFullscreen(root) {
  root.classList.add("is-game-fullscreen");
  document.body.classList.add("is-game-fullscreen");
}

function exitGameFullscreen(root) {
  root.classList.remove("is-game-fullscreen");
  root.classList.remove("is-candy-crush-app");
  root.classList.remove("is-sudoku");
  document.body.classList.remove("is-game-fullscreen");
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
    speedCap: 230, intervalFloor: 1.3, gapFloor: 0.22
  },
  orta: {
    label: "Orta", gapRatio: 0.25, minGap: 145, speed: 190, interval: 1.45,
    speedRampPerPoint: 2.0, intervalRampPerPoint: -0.010, gapRampPerPoint: -0.0022,
    speedCap: 300, intervalFloor: 0.95, gapFloor: 0.16
  },
  zor: {
    label: "Zor", gapRatio: 0.19, minGap: 115, speed: 250, interval: 1.1,
    speedRampPerPoint: 3.0, intervalRampPerPoint: -0.014, gapRampPerPoint: -0.0032,
    speedCap: 380, intervalFloor: 0.65, gapFloor: 0.11
  }
};

const FLAPPY_CHARACTERS = {
  klasik: { label: "Klasik", price: 0, body1: "#ffe66d", body2: "#ffd23f", body3: "#f5a623", stroke: "#d98e04", belly: "#fff3c4", wing: "#f5a623", wingStroke: "#d98e04", beak: "#ff7043", beakStroke: "#d84315" },
  mavi: { label: "Gokyuzu", price: 40, body1: "#a7e8ff", body2: "#5fc9f5", body3: "#2e93cc", stroke: "#1c6f9e", belly: "#eaf9ff", wing: "#5fc9f5", wingStroke: "#1c6f9e", beak: "#ff8a5c", beakStroke: "#d8552a" },
  pembe: { label: "Gunbatimi", price: 60, body1: "#ffc7de", body2: "#f077a8", body3: "#c04a7e", stroke: "#96355f", belly: "#fff0f6", wing: "#f077a8", wingStroke: "#96355f", beak: "#ff7043", beakStroke: "#d84315" },
  yesil: { label: "Orman", price: 80, body1: "#c8f2a6", body2: "#8fd85a", body3: "#5aa72e", stroke: "#3f7a1f", belly: "#f1ffe0", wing: "#8fd85a", wingStroke: "#3f7a1f", beak: "#ffa94d", beakStroke: "#d97a1e" },
  mor: { label: "Ametist", price: 100, body1: "#e3c8ff", body2: "#b17ef0", body3: "#7d47bf", stroke: "#5c2f92", belly: "#f5ecff", wing: "#b17ef0", wingStroke: "#5c2f92", beak: "#ff8a65", beakStroke: "#d8552a" },
  altin: { label: "Altin", price: 150, body1: "#fff3b0", body2: "#ffd23f", body3: "#c98f1c", stroke: "#8f6110", belly: "#fffbe0", wing: "#ffe066", wingStroke: "#8f6110", beak: "#ff7043", beakStroke: "#d84315" }
};

function renderFlappyBird(target) {
  target.innerHTML = `
    <div class="flappy-game">
      <div class="flappy-shell">
        <canvas id="flappyCanvas" class="flappy-canvas"></canvas>
        <button type="button" class="flappy-sound-btn" id="flappySoundBtn" aria-label="Sesi ac/kapat"></button>
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
  const soundBtn = target.querySelector("#flappySoundBtn");
  const context = canvas.getContext("2d");
  const audio = createGameAudio({ storageKey: "flappySoundOn" });

  function refreshSoundBtn() {
    const on = audio.isEnabled();
    soundBtn.textContent = on ? "\u{1F50A}" : "\u{1F507}";
    soundBtn.classList.toggle("is-muted", !on);
  }

  function onSoundBtnClick(event) {
    event.stopPropagation();
    const on = audio.toggle();
    refreshSoundBtn();
    if (on && (state.phase === "ready" || state.phase === "playing")) audio.startMusic();
  }

  soundBtn.addEventListener("click", onSoundBtnClick);
  refreshSoundBtn();

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
    coins: readFlappyCoins(),
    runCoins: 0,
    bird: { y: 0, velocity: 0 },
    pipes: [],
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
  }

  function showMenu() {
    state.phase = "menu";
    resetRound();
    audio.stopMusic();
    medal.hidden = true;
    overlayTitle.textContent = "Flappy Bird";
    overlayText.textContent = "Ne yapmak istersin?";
    bestLabel.textContent = `Altin: ${state.coins} \u{1FA99}`;
    menu.innerHTML = `
      <button class="flappy-menu-btn" type="button" data-action="play">Oyna</button>
      <button class="flappy-menu-btn" type="button" data-action="shop">Magaza</button>
    `;
    overlay.hidden = false;
  }

  function showDifficultyPicker() {
    state.phase = "menu";
    resetRound();
    audio.stopMusic();
    medal.hidden = true;
    overlayTitle.textContent = "Zorluk Sec";
    overlayText.textContent = "Zorluk seviyeni sec.";
    bestLabel.textContent = "";
    menu.innerHTML = Object.entries(FLAPPY_DIFFICULTY).map(([key, diff]) => {
      const best = readFlappyBest(key);
      return `<button class="flappy-menu-btn" type="button" data-diff="${key}">${diff.label}${best ? `<small>Rekor ${best}</small>` : ""}</button>`;
    }).join("") + `<button class="flappy-menu-btn flappy-menu-back" type="button" data-action="back">Geri</button>`;
    overlay.hidden = false;
  }

  function renderShopGrid() {
    const owned = readFlappyOwned();
    return `<div class="flappy-shop-grid">` + Object.entries(FLAPPY_CHARACTERS).map(([id, c]) => {
      const isOwned = owned.includes(id);
      const isEquipped = state.character === id;
      const affordable = state.coins >= c.price;
      const cls = ["flappy-shop-card", isEquipped ? "is-equipped" : "", !isOwned && !affordable ? "is-locked" : ""].filter(Boolean).join(" ");
      const statusLabel = isEquipped ? "Kusanildi" : isOwned ? "Sahipsin" : `${c.price} \u{1FA99}`;
      return `
        <button class="${cls}" type="button" data-char="${id}">
          <span class="flappy-shop-swatch" style="background: linear-gradient(135deg, ${c.body1}, ${c.body2} 60%, ${c.body3})"></span>
          <span class="flappy-shop-label">${c.label}</span>
          <small>${statusLabel}</small>
        </button>`;
    }).join("") + `</div>`;
  }

  function showShop() {
    state.phase = "shop";
    resetRound();
    audio.stopMusic();
    medal.hidden = true;
    overlayTitle.textContent = "Magaza";
    overlayText.textContent = `Altin: ${state.coins} \u{1FA99}`;
    bestLabel.textContent = "";
    menu.innerHTML = renderShopGrid() + `<button class="flappy-menu-btn flappy-menu-back" type="button" data-action="back">Geri</button>`;
    overlay.hidden = false;
  }

  function showReady() {
    state.phase = "ready";
    resetRound();
    audio.startMusic();
    state.best = readFlappyBest(state.difficulty);
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
        state.runCoins += 1;
        audio.play("score");
      }
    }
    state.pipes = state.pipes.filter((pipe) => pipe.x + PIPE_WIDTH > -10);

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

    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#69c8f2");
    sky.addColorStop(0.75, "#aee3f7");
    sky.addColorStop(1, "#d8f3fb");
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    const cloudSpan = width + 260;
    const cloudShift = (state.distance * 0.12) % cloudSpan;
    context.fillStyle = "rgba(255, 255, 255, .85)";
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

    context.fillStyle = "#b6e8c5";
    const backShift = (state.distance * 0.18) % 170;
    for (let x = -backShift; x < width + 170; x += 170) {
      context.beginPath();
      context.arc(x, groundY, 72, Math.PI, 2 * Math.PI);
      context.fill();
    }

    context.fillStyle = "#93dcaa";
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

  function drawGround() {
    const { width, height } = state;
    const groundY = height - GROUND_H;

    context.fillStyle = "#e0c98c";
    context.fillRect(0, groundY, width, GROUND_H);

    const shift = state.distance % 34;
    context.fillStyle = "rgba(184, 152, 90, .5)";
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
    grass.addColorStop(0, "#8be066");
    grass.addColorStop(1, "#5cb944");
    context.fillStyle = grass;
    context.fillRect(0, groundY, width, 12);
    context.fillStyle = "rgba(46, 125, 50, .6)";
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
    if (event.target.closest(".flappy-menu-btn, .flappy-sound-btn, .flappy-shop-card")) return;
    event.preventDefault();
    flap();
  }

  function onShopCardClick(id) {
    const owned = readFlappyOwned();
    if (owned.includes(id)) {
      if (state.character === id) return;
      state.character = id;
      writeFlappyEquipped(id);
      audio.play("equip");
      showShop();
      return;
    }
    const price = FLAPPY_CHARACTERS[id]?.price ?? Infinity;
    if (state.coins < price) {
      audio.play("click");
      return;
    }
    state.coins -= price;
    writeFlappyCoins(state.coins);
    writeFlappyOwned([...owned, id]);
    state.character = id;
    writeFlappyEquipped(id);
    audio.play("purchase");
    showShop();
  }

  function onMenuClick(event) {
    const button = event.target.closest(".flappy-menu-btn, .flappy-shop-card");
    if (!button) return;
    if (button.dataset.diff) {
      state.difficulty = button.dataset.diff;
      showReady();
      return;
    }
    if (button.dataset.char) {
      onShopCardClick(button.dataset.char);
      return;
    }
    const action = button.dataset.action;
    if (action === "play") { showDifficultyPicker(); return; }
    if (action === "shop") { showShop(); return; }
    if (action === "back") { showMenu(); return; }
    if (action === "retry") { showReady(); return; }
    if (action === "menu") { showDifficultyPicker(); return; }
    if (action === "home") { showMenu(); return; }
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
      soundBtn.removeEventListener("click", onSoundBtnClick);
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
    return Number(localStorage.getItem("flappyCoins")) || 0;
  } catch {
    return 0;
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
    return Array.isArray(parsed) && parsed.length ? parsed : ["klasik"];
  } catch {
    return ["klasik"];
  }
}

function writeFlappyOwned(list) {
  try {
    localStorage.setItem("flappyOwnedCharacters", JSON.stringify(list));
  } catch {
    /* localStorage kapali olabilir */
  }
}

function readFlappyEquipped() {
  try {
    return localStorage.getItem("flappyEquippedCharacter") || "klasik";
  } catch {
    return "klasik";
  }
}

function writeFlappyEquipped(id) {
  try {
    localStorage.setItem("flappyEquippedCharacter", id);
  } catch {
    /* localStorage kapali olabilir */
  }
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
