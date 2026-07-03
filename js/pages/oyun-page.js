const GAME_META = {
  "candy-match": {
    badge: "SONSUZ",
    title: "Candy Crush",
    subtitle: "Yan yana iki sekeri degistir. Uclu veya daha fazla eslesme puan verir; hamle siniri yok."
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
const CRYSTAL_MATCH_APP_URL = "./crystal-match-journey/dist/index.html";

let candyState = null;

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

  if (gameId === "candy-match") {
    enterGameFullscreen(root);
    root.classList.add("is-crystal-app");
    renderCrystalMatchApp(body);
  } else {
    exitGameFullscreen(root);
    root.classList.remove("is-crystal-app");
    body.innerHTML = `
      <div class="game-soon-box">
        <strong>Yakinda</strong>
        <p>Bu kutuya tiklama sistemi hazir. Bu oyunun kurallari ve ekrani daha sonra eklenebilir.</p>
      </div>
    `;
  }

  stage.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCrystalMatchApp(target) {
  target.innerHTML = `
    <div class="crystal-game-shell">
      <iframe
        class="crystal-game-frame"
        src="${CRYSTAL_MATCH_APP_URL}"
        title="Candy Crush"
        loading="eager"
        allow="autoplay; fullscreen"
      ></iframe>
      <a class="crystal-game-link" href="${CRYSTAL_MATCH_APP_URL}" target="_blank" rel="noopener">Tam ekranda ac</a>
    </div>
  `;
}

function closeGame(root) {
  const stage = root.querySelector("#gameStage");
  const body = root.querySelector("#gameStageBody");
  exitGameFullscreen(root);
  if (stage) stage.hidden = true;
  if (body) body.innerHTML = "";
  candyState = null;
}

function enterGameFullscreen(root) {
  root.classList.add("is-game-fullscreen");
  document.body.classList.add("is-game-fullscreen");
}

function exitGameFullscreen(root) {
  root.classList.remove("is-game-fullscreen");
  root.classList.remove("is-crystal-app");
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
