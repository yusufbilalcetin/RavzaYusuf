const CAPACITY = 4;
const BASE_HINTS = 3;
const BASE_SHUFFLES = 2;
const STORAGE_KEY = "renkSiralamaProgress:v1";
const SOUND_KEY = "renkSiralamaSoundOn";
const MAX_HISTORY = 120;

// Ilk 8 renk kasitli olarak birbirinden en cok ayrilan tonlar; benzeyen
// tonlar (acik/koyu varyantlar) listenin sonunda, sadece yuksek seviyelerde
// devreye girer. Boylece dusuk seviyeler mobilde de net ayirt edilebilir kalir.
const BASE_COLORS = [
  { id: "kirmizi", name: "Kırmızı", value: "#ff426f", deep: "#b80f3f" },
  { id: "mavi", name: "Mavi", value: "#22a7ff", deep: "#075ad8" },
  { id: "yesil", name: "Yeşil", value: "#30e06f", deep: "#0c9f44" },
  { id: "sari", name: "Sarı", value: "#ffd83d", deep: "#d89500" },
  { id: "turuncu", name: "Turuncu", value: "#ff8a2d", deep: "#cc4f00" },
  { id: "pembe", name: "Pembe", value: "#ff4fcb", deep: "#bc1590" },
  { id: "mor", name: "Mor", value: "#9f5cff", deep: "#5f2bc7" },
  { id: "turkuaz", name: "Turkuaz", value: "#25e5d7", deep: "#039b98" },
  { id: "lime", name: "Lime", value: "#b6f24f", deep: "#72a915" },
  { id: "lacivert", name: "Lacivert", value: "#6374ff", deep: "#2737bb" },
  { id: "mercan", name: "Mercan", value: "#ff6f61", deep: "#c92728" },
  { id: "altin", name: "Altın", value: "#f6b93b", deep: "#b66a00" },
  { id: "acikMavi", name: "Açık Mavi", value: "#5cc6ff", deep: "#1786c8" },
  { id: "koyuMor", name: "Koyu Mor", value: "#7a3fd0", deep: "#431f8f" },
  { id: "fusya", name: "Fuşya", value: "#ff33a1", deep: "#c40c6e" },
  { id: "acikYesil", name: "Açık Yeşil", value: "#8fe36a", deep: "#3f9b2a" }
];

const COLOR_MAP = new Map(BASE_COLORS.map((color) => [color.id, color]));
const KNOWN_COLOR_IDS = new Set(BASE_COLORS.map((color) => color.id));

// Renk sayisi temel paleti asarsa (cok yuksek seviyeler) altin oran acisiyla
// birbirinden ayrik yeni tonlar uretir; palet asla dongune girmez.
function colorIdAt(index) {
  if (index < BASE_COLORS.length) return BASE_COLORS[index].id;
  const id = `gen-${index}`;
  if (!COLOR_MAP.has(id)) {
    const hue = (index * 137.508) % 360;
    const color = {
      id,
      name: `Renk ${index + 1}`,
      value: hslToHex(hue, 72, 60),
      deep: hslToHex(hue, 80, 38)
    };
    COLOR_MAP.set(id, color);
    KNOWN_COLOR_IDS.add(id);
  }
  return id;
}

function colorPalette(count) {
  const ids = [];
  for (let index = 0; index < count; index += 1) ids.push(colorIdAt(index));
  return ids;
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const value = lig - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * value).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const ICONS = {
  back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6"/><path d="M20 12H9"/></svg>`,
  restart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M19 11a7 7 0 1 0 1.6 4.4"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>`,
  shuffle: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>`,
  hint: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 1 4 12.7c-.7.6-1 1.4-1 2.3H9c0-.9-.3-1.7-1-2.3A7 7 0 0 1 12 2Z"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m19 9-6 6"/><path d="m13 9 6 6"/></svg>`
};

export function renderRenkSiralamaGame(target, { onExit } = {}) {
  const saved = readProgress();
  const level = clampInt(saved.currentLevel, 1, 1_000_000) || 1;
  const generated = generateLevel(level, seedForLevel(level));
  const initialBoard = isValidBoard(saved.initialBoard) ? cloneBoard(saved.initialBoard) : cloneBoard(generated.board);
  const savedBoard = isValidBoard(saved.board) && hasMatchingColorCounts(saved.board, initialBoard)
    ? cloneBoard(saved.board)
    : cloneBoard(initialBoard);

  const state = {
    target,
    onExit,
    audio: createSortAudio(),
    level,
    config: getLevelConfig(level),
    totalScore: Math.max(0, Number(saved.totalScore) || 0),
    completed: normalizeCompleted(saved.completed),
    initialBoard,
    board: savedBoard,
    selected: null,
    moves: Math.max(0, Number(saved.moves) || 0),
    history: [],
    hintsLeft: clampInt(saved.hintsLeft, 0, BASE_HINTS) ?? BASE_HINTS,
    shufflesLeft: clampInt(saved.shufflesLeft, 0, BASE_SHUFFLES) ?? BASE_SHUFFLES,
    hintsUsed: Math.max(0, Number(saved.hintsUsed) || 0),
    shufflesUsed: Math.max(0, Number(saved.shufflesUsed) || 0),
    won: Boolean(saved.won && isSolvedBoard(savedBoard)),
    levelScore: Math.max(0, Number(saved.levelScore) || 0),
    stars: clampInt(saved.stars, 1, 3) || 1,
    hintPair: null,
    invalidTube: null,
    pouring: null,
    animating: false,
    pourTimer: 0,
    hintTimer: 0,
    invalidTimer: 0,
    rafId: 0
  };

  target.classList.add("renk-sort-host");
  target.addEventListener("click", onClick);
  target.addEventListener("keydown", onKeyDown);
  render(state);
  persist(state);

  function onClick(event) {
    const actionButton = event.target.closest("[data-rs-action]");
    if (actionButton && target.contains(actionButton)) {
      handleAction(state, actionButton.dataset.rsAction);
      return;
    }

    const tubeButton = event.target.closest("[data-rs-tube]");
    if (tubeButton && target.contains(tubeButton)) {
      selectTube(state, Number(tubeButton.dataset.rsTube));
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      state.onExit?.();
    } else if (event.key.toLowerCase() === "u") {
      undoMove(state);
    } else if (event.key.toLowerCase() === "h") {
      useHint(state);
    } else if (event.key.toLowerCase() === "r") {
      restartLevel(state);
    }
  }

  return {
    cleanup() {
      clearTimeout(state.pourTimer);
      clearTimeout(state.hintTimer);
      clearTimeout(state.invalidTimer);
      cancelAnimationFrame(state.rafId);
      target.removeEventListener("click", onClick);
      target.removeEventListener("keydown", onKeyDown);
      target.classList.remove("renk-sort-host");
      target.innerHTML = "";
    }
  };
}

function handleAction(state, action) {
  if (action === "back") {
    state.audio.play("button");
    state.onExit?.();
    return;
  }

  if (action === "sound") {
    state.audio.toggle();
    render(state);
    return;
  }

  if (state.animating) return;

  if (action === "restart") restartLevel(state);
  else if (action === "undo") undoMove(state);
  else if (action === "shuffle") shuffleCurrentLevel(state);
  else if (action === "hint") useHint(state);
  else if (action === "next-level") startLevel(state, state.level + 1);
  else if (action === "replay") startLevel(state, state.level, { seed: seedForLevel(state.level) });
}

function startLevel(state, level, { seed = seedForLevel(level) } = {}) {
  const puzzle = generateLevel(level, seed);
  Object.assign(state, {
    level,
    config: puzzle.config,
    initialBoard: cloneBoard(puzzle.board),
    board: cloneBoard(puzzle.board),
    selected: null,
    moves: 0,
    history: [],
    hintsLeft: BASE_HINTS,
    shufflesLeft: BASE_SHUFFLES,
    hintsUsed: 0,
    shufflesUsed: 0,
    won: false,
    levelScore: 0,
    stars: 1,
    hintPair: null,
    invalidTube: null,
    pouring: null,
    animating: false
  });
  state.audio.play("button");
  clearTransientTimers(state);
  persist(state);
  render(state);
}

function restartLevel(state) {
  Object.assign(state, {
    board: cloneBoard(state.initialBoard),
    selected: null,
    moves: 0,
    history: [],
    hintsLeft: BASE_HINTS,
    shufflesLeft: BASE_SHUFFLES,
    hintsUsed: 0,
    shufflesUsed: 0,
    won: false,
    levelScore: 0,
    stars: 1,
    hintPair: null,
    invalidTube: null,
    pouring: null,
    animating: false
  });
  state.audio.play("button");
  clearTransientTimers(state);
  persist(state);
  render(state);
}

function shuffleCurrentLevel(state) {
  if (state.shufflesLeft <= 0 || state.won) {
    showInvalid(state, state.selected ?? 0);
    return;
  }

  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const puzzle = generateLevel(state.level, seed);
  Object.assign(state, {
    initialBoard: cloneBoard(puzzle.board),
    board: cloneBoard(puzzle.board),
    selected: null,
    moves: 0,
    history: [],
    shufflesLeft: state.shufflesLeft - 1,
    shufflesUsed: state.shufflesUsed + 1,
    won: false,
    hintPair: null,
    invalidTube: null,
    pouring: null,
    animating: false
  });
  state.audio.play("shuffle");
  clearTransientTimers(state);
  persist(state);
  render(state);
}

function selectTube(state, index) {
  if (state.animating || state.won || !Number.isInteger(index)) return;
  const tube = state.board[index];
  if (!tube) return;

  if (state.selected === null) {
    if (!tube.length) {
      showInvalid(state, index);
      return;
    }
    state.selected = index;
    state.audio.play("select");
    render(state);
    return;
  }

  if (state.selected === index) {
    state.selected = null;
    state.audio.play("button");
    render(state);
    return;
  }

  const move = getValidMove(state.board, state.selected, index);
  if (!move) {
    showInvalid(state, index);
    return;
  }

  applyPlayerMove(state, move);
}

function applyPlayerMove(state, move) {
  const before = cloneBoard(state.board);
  state.history.push({ board: before, moves: state.moves });
  if (state.history.length > MAX_HISTORY) state.history.shift();

  applyRawMove(state.board, move.from, move.to, move.amount);
  state.moves += 1;
  state.selected = null;
  state.hintPair = null;
  state.invalidTube = null;
  state.animating = true;
  state.pouring = {
    from: move.from,
    to: move.to,
    color: move.color
  };

  state.audio.play("pour");
  persist(state);
  render(state);
  drawStream(state);

  const solved = isSolvedBoard(state.board);
  clearTimeout(state.pourTimer);
  state.pourTimer = setTimeout(() => {
    state.animating = false;
    state.pouring = null;
    if (solved) completeLevel(state);
    else {
      persist(state);
      render(state);
    }
  }, 520);
}

function undoMove(state) {
  if (state.animating || state.won) return;
  const entry = state.history.pop();
  if (!entry) {
    showInvalid(state, state.selected ?? 0);
    return;
  }
  state.board = cloneBoard(entry.board);
  state.moves = entry.moves;
  state.selected = null;
  state.hintPair = null;
  state.invalidTube = null;
  state.audio.play("undo");
  persist(state);
  render(state);
}

function useHint(state) {
  if (state.animating || state.won) return;
  if (state.hintsLeft <= 0) {
    showInvalid(state, state.selected ?? 0);
    return;
  }

  const hint = findHintMove(state.board);
  if (!hint) {
    showInvalid(state, state.selected ?? 0);
    return;
  }

  state.hintsLeft -= 1;
  state.hintsUsed += 1;
  state.hintPair = { from: hint.from, to: hint.to };
  state.selected = null;
  state.audio.play("hint");
  persist(state);
  render(state);

  clearTimeout(state.hintTimer);
  state.hintTimer = setTimeout(() => {
    state.hintPair = null;
    render(state);
  }, 1600);
}

function showInvalid(state, index) {
  state.invalidTube = index;
  state.audio.play("wrong");
  render(state);
  clearTimeout(state.invalidTimer);
  state.invalidTimer = setTimeout(() => {
    state.invalidTube = null;
    render(state);
  }, 430);
}

function completeLevel(state) {
  if (state.won) return;

  const score = calculateLevelScore(state);
  const stars = calculateStars(state);
  state.won = true;
  state.levelScore = score;
  state.stars = stars;
  state.totalScore += score;
  state.completed[String(state.level)] = Math.max(stars, state.completed[String(state.level)] || 0);
  state.selected = null;
  state.hintPair = null;
  state.invalidTube = null;
  state.audio.play("win");
  persist(state);
  render(state);
}

function getValidMove(board, from, to) {
  if (from === to) return null;
  const source = board[from];
  const target = board[to];
  if (!source?.length || !target || target.length >= CAPACITY) return null;

  const color = topColor(source);
  const targetColor = topColor(target);
  if (target.length && targetColor !== color) return null;

  const amount = Math.min(countTopRun(source), CAPACITY - target.length);
  if (amount <= 0) return null;
  return { from, to, color, amount };
}

function applyRawMove(board, from, to, amount) {
  const moved = board[from].splice(board[from].length - amount, amount);
  board[to].push(...moved);
}

function findHintMove(board) {
  const preferred = [];
  const fallback = [];

  for (let from = 0; from < board.length; from += 1) {
    for (let to = 0; to < board.length; to += 1) {
      const move = getValidMove(board, from, to);
      if (!move) continue;

      const source = board[from];
      const target = board[to];
      const sourceComplete = isCompleteTube(source);
      const targetComplete = isCompleteTube(target);
      const targetWillComplete = target.length + move.amount === CAPACITY && (
        target.length === 0 || target.every((color) => color === move.color)
      );

      let score = 0;
      if (target.length) score += 30;
      if (targetWillComplete) score += 25;
      if (source.length - move.amount === 0) score += 12;
      score += move.amount * 5;
      if (sourceComplete && target.length === 0) score -= 30;
      if (targetComplete) score -= 20;

      const entry = { ...move, score };
      if (score > 0) preferred.push(entry);
      else fallback.push(entry);
    }
  }

  const list = preferred.length ? preferred : fallback;
  return list.sort((a, b) => b.score - a.score)[0] || null;
}

function generateLevel(level, seed) {
  const config = getLevelConfig(level);
  // "best" = en iyi karisan board; "bestOpen" = en iyi karisan AMA en az bir
  // bos tup kalan board. Bos tup manevra alani ve klasik gorunum saglar; dusuk
  // seviyelerde neredeyse her zaman bulunur, yuksek seviyelerde bulunamazsa
  // (dolu tahta = daha zor) sorunsuz best'e dusulur. Cozulebilirlik her iki
  // durumda da garantidir cunku board cozulmus halden geciyor.
  let best = null;
  let bestScore = -Infinity;
  let bestOpen = null;
  let bestOpenScore = -Infinity;

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const rng = createRng((seed + attempt * 1013904223) >>> 0);
    const board = createSolvedBoard(config);

    for (let step = 0; step < config.scrambleMoves; step += 1) {
      const moves = findReversibleScrambleMoves(board);
      if (!moves.length) break;
      const move = weightedPick(moves, rng);
      applyRawMove(board, move.from, move.to, move.amount);
    }

    if (isSolvedBoard(board)) continue;
    const mixScore = scoreBoardMix(board);
    if (mixScore > bestScore) {
      bestScore = mixScore;
      best = cloneBoard(board);
    }
    const hasEmpty = board.some((tube) => tube.length === 0);
    if (hasEmpty && mixScore > bestOpenScore) {
      bestOpenScore = mixScore;
      bestOpen = cloneBoard(board);
    }
  }

  return {
    config,
    board: bestOpen || best || createFallbackMixedBoard(config)
  };
}

function createSolvedBoard(config) {
  const board = config.colors.map((colorId) => Array(CAPACITY).fill(colorId));
  for (let index = 0; index < config.emptyTubes; index += 1) board.push([]);
  return board;
}

function createFallbackMixedBoard(config) {
  const board = createSolvedBoard(config);
  const emptyIndexes = Array.from({ length: config.emptyTubes }, (_, index) => config.colorCount + index);

  for (let pass = 0; pass < 2; pass += 1) {
    for (let from = 0; from < config.colorCount; from += 1) {
      const to = emptyIndexes[(from + pass) % emptyIndexes.length];
      if (board[from].length > 1 && board[to].length < CAPACITY) {
        applyRawMove(board, from, to, 1);
      }
    }
  }
  return board;
}

function findReversibleScrambleMoves(board) {
  const moves = [];

  for (let from = 0; from < board.length; from += 1) {
    const source = board[from];
    if (!source.length) continue;
    const groupSize = countTopRun(source);
    const maxAmount = groupSize === source.length ? groupSize : Math.max(0, groupSize - 1);
    if (maxAmount <= 0) continue;

    for (let amount = 1; amount <= maxAmount; amount += 1) {
      for (let to = 0; to < board.length; to += 1) {
        if (to === from) continue;
        const target = board[to];
        if (target.length + amount > CAPACITY) continue;

        const color = topColor(source);
        let weight = 1;
        if (target.length && topColor(target) !== color) weight += 8;
        if (target.length && topColor(target) === color) weight += 1;
        if (!target.length) weight += 2;
        if (amount === 1) weight += 2;
        moves.push({ from, to, amount, weight });
      }
    }
  }

  return moves;
}

function weightedPick(items, rng) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

// Board'un ne kadar "gercekten karisik" oldugunu puanlar. Cok renkli tupler
// odullenir; baslangicta zaten cozulmus (tek renk dolu) tupler cezalandirilir
// cunku bunlar seviyeyi kolaylastirir. Bos tup tercihi generateLevel'de ayrica
// ele alindigi icin burada bos/dolu tup sayisi puanlanmaz.
function scoreBoardMix(board) {
  let score = 0;
  for (const tube of board) {
    if (!tube.length) continue;
    const unique = new Set(tube).size;
    if (unique > 1) score += unique * 6 + tube.length;
    else if (tube.length === CAPACITY) score -= 10;
    else score += 1;
  }
  return score;
}

// Seviye numarasina gore zorluk. Renk sayisi kademeli araliklarla artar; her
// aralik oncekinden daha genis, boylece artis kontrollu kalir. Renk paleti 16
// ile sinirlanir (mobil ekrana sigmasi ve okunabilirlik icin), 16'dan sonra
// zorluk yalnizca karistirma ile artmaya devam eder.
const COLOR_TIERS = [
  { upTo: 5, colors: 4 },
  { upTo: 15, colors: 5 },
  { upTo: 30, colors: 6 },
  { upTo: 50, colors: 7 },
  { upTo: 80, colors: 8 },
  { upTo: 120, colors: 9 },
  { upTo: 180, colors: 10 },
  { upTo: 250, colors: 11 }
];
const MAX_COLORS = 16;
const MAX_SCRAMBLE = 250;

// Karistirma hamlesi seviye planiyla birebir ortusen kirilma noktalari.
// Aradaki seviyeler dogrusal interpolasyonla hesaplanir; 250 sonrasi yavas
// yavas artar ve MAX_SCRAMBLE ile sinirlanir (performans icin).
const SCRAMBLE_ANCHORS = [
  [1, 10], [5, 15], [15, 25], [30, 35], [50, 50],
  [80, 70], [120, 90], [180, 120], [250, 150]
];

function getLevelConfig(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level)) || 1);
  const colorCount = levelColorCount(safeLevel);
  const emptyTubes = levelEmptyTubes(safeLevel);
  return {
    level: safeLevel,
    colorCount,
    emptyTubes,
    tubeCount: colorCount + emptyTubes,
    colors: colorPalette(colorCount),
    scrambleMoves: levelScrambleMoves(safeLevel)
  };
}

function levelColorCount(level) {
  for (const tier of COLOR_TIERS) {
    if (level <= tier.upTo) return tier.colors;
  }
  // 251 ve sonrasi: her ~120 seviyede +1 renk, 16'da sabitlenir.
  return Math.min(MAX_COLORS, 11 + Math.floor((level - 250) / 120));
}

function levelEmptyTubes(level) {
  return level > 120 ? 3 : 2;
}

function levelScrambleMoves(level) {
  const first = SCRAMBLE_ANCHORS[0];
  const last = SCRAMBLE_ANCHORS[SCRAMBLE_ANCHORS.length - 1];
  if (level <= first[0]) return first[1];
  if (level >= last[0]) return Math.min(MAX_SCRAMBLE, Math.round(last[1] + (level - last[0]) * 0.4));

  for (let index = 1; index < SCRAMBLE_ANCHORS.length; index += 1) {
    const [x1, y1] = SCRAMBLE_ANCHORS[index - 1];
    const [x2, y2] = SCRAMBLE_ANCHORS[index];
    if (level <= x2) return Math.round(y1 + (y2 - y1) * (level - x1) / (x2 - x1));
  }
  return last[1];
}

function calculateLevelScore(state) {
  const par = getParMoves(state.config);
  const base = 100 + Math.min(260, state.level * 4);
  const moveBonus = Math.max(0, par - state.moves) * 8;
  const penalty = state.hintsUsed * 18 + state.shufflesUsed * 32;
  return Math.max(25, base + moveBonus - penalty);
}

function calculateStars(state) {
  const par = getParMoves(state.config);
  if (state.moves <= par && state.hintsUsed === 0 && state.shufflesUsed === 0) return 3;
  if (state.moves <= Math.ceil(par * 1.4) && state.shufflesUsed <= 1) return 2;
  return 1;
}

function getParMoves(config) {
  return config.colorCount * 5 + config.emptyTubes * 3 + Math.floor(config.level / 8);
}

function isSolvedBoard(board) {
  return board.every((tube) => tube.length === 0 || isCompleteTube(tube));
}

function isCompleteTube(tube) {
  return tube.length === CAPACITY && tube.every((color) => color === tube[0]);
}

function topColor(tube) {
  return tube[tube.length - 1];
}

function countTopRun(tube) {
  if (!tube.length) return 0;
  const color = topColor(tube);
  let count = 0;
  for (let index = tube.length - 1; index >= 0; index -= 1) {
    if (tube[index] !== color) break;
    count += 1;
  }
  return count;
}

function render(state) {
  const columns = getColumnCount(state.board.length);
  state.target.innerHTML = `
    <div class="renk-sort-game" tabindex="0">
      <div class="rs-neon-field" aria-hidden="true"></div>
      <header class="rs-topbar">
        <div class="rs-top-left">
          <button class="rs-icon-btn rs-back-btn" type="button" data-rs-action="back" aria-label="Geri">
            ${ICONS.back}<span>Geri</span>
          </button>
          <button class="rs-icon-btn" type="button" data-rs-action="restart" aria-label="Yeniden başlat">
            ${ICONS.restart}
          </button>
        </div>
        <div class="rs-level-pill" aria-live="polite">
          <small>Seviye</small>
          <strong>${state.level}</strong>
        </div>
        <div class="rs-top-right">
          <span class="rs-stat"><small>Puan</small><strong>${formatNumber(state.totalScore)}</strong></span>
          <span class="rs-stat"><small>Hamle</small><strong>${state.moves}</strong></span>
          <button class="rs-icon-btn rs-icon-btn--counter" type="button" data-rs-action="hint" aria-label="İpucu" ${state.hintsLeft <= 0 || state.won ? "disabled" : ""}>
            <span>${state.hintsLeft}</span>${ICONS.hint}
          </button>
          <button class="rs-icon-btn" type="button" data-rs-action="sound" aria-label="Ses">
            ${state.audio.isEnabled() ? ICONS.soundOn : ICONS.soundOff}
          </button>
        </div>
      </header>

      <main class="rs-playfield">
        <div class="rs-board-shell">
          <div class="rs-tube-grid${state.won ? " is-level-complete" : ""}" style="--rs-columns:${columns}">
            ${state.board.map((tube, index) => renderTube(state, tube, index)).join("")}
          </div>
          ${state.pouring ? `<span class="rs-stream" style="--stream-color:${COLOR_MAP.get(state.pouring.color)?.value || "#fff"}"></span>` : ""}
        </div>
      </main>

      <footer class="rs-actions">
        <button class="rs-action-btn" type="button" data-rs-action="undo" ${state.history.length ? "" : "disabled"}>
          ${ICONS.undo}<span>Geri Al</span>
        </button>
        <button class="rs-action-btn" type="button" data-rs-action="shuffle" ${state.shufflesLeft > 0 && !state.won ? "" : "disabled"}>
          ${ICONS.shuffle}<span>Karıştır</span><small>${state.shufflesLeft}</small>
        </button>
        <button class="rs-action-btn" type="button" data-rs-action="hint" ${state.hintsLeft > 0 && !state.won ? "" : "disabled"}>
          ${ICONS.hint}<span>İpucu</span><small>${state.hintsLeft}</small>
        </button>
      </footer>

      ${state.won ? renderWinModal(state) : ""}
    </div>
  `;
}

function renderTube(state, tube, index) {
  const classes = ["rs-tube"];
  if (state.selected === index) classes.push("is-selected");
  if (state.invalidTube === index) classes.push("is-invalid");
  if (state.hintPair?.from === index) classes.push("is-hint-source");
  if (state.hintPair?.to === index) classes.push("is-hint-target");
  if (isCompleteTube(tube)) classes.push("is-complete");

  if (state.pouring?.from === index) {
    classes.push("is-pouring-from", state.pouring.from < state.pouring.to ? "is-pouring-right" : "is-pouring-left");
  }
  if (state.pouring?.to === index) classes.push("is-pouring-to");

  return `
    <button class="${classes.join(" ")}" type="button" data-rs-tube="${index}" aria-label="Tüp ${index + 1}">
      <span class="rs-tube-rim" aria-hidden="true"></span>
      <span class="rs-glass" aria-hidden="true">
        <span class="rs-liquid-stack">
          ${tube.map((colorId) => renderLiquidLayer(colorId)).join("")}
        </span>
        <span class="rs-glass-shine"></span>
      </span>
      <span class="rs-tube-shadow" aria-hidden="true"></span>
    </button>
  `;
}

function renderLiquidLayer(colorId) {
  const color = COLOR_MAP.get(colorId);
  if (!color) return "";
  return `
    <span
      class="rs-liquid-layer"
      style="--liquid:${color.value};--liquid-deep:${color.deep}"
      title="${color.name}"
    ></span>
  `;
}

function renderWinModal(state) {
  return `
    <div class="rs-win" role="dialog" aria-modal="true" aria-labelledby="rsWinTitle">
      <div class="rs-confetti" aria-hidden="true">${renderConfetti()}</div>
      <div class="rs-win-card">
        <span class="rs-win-kicker">${renderStars(state.stars)}</span>
        <h3 id="rsWinTitle">Seviye Tamamlandı!</h3>
        <div class="rs-win-stats">
          <span><small>Hamle</small><strong>${state.moves}</strong></span>
          <span><small>Kazanılan</small><strong>${state.levelScore}</strong></span>
        </div>
        <div class="rs-win-actions">
          <button class="rs-win-btn rs-win-btn--primary" type="button" data-rs-action="next-level">Sonraki Seviye</button>
          <button class="rs-win-btn" type="button" data-rs-action="replay">Tekrar Oyna</button>
        </div>
      </div>
    </div>
  `;
}

function renderStars(count) {
  return Array.from({ length: 3 }, (_, index) => `<span class="${index < count ? "is-on" : ""}">★</span>`).join("");
}

function renderConfetti() {
  const colors = ["#ff4fcb", "#25e5d7", "#ffd83d", "#9f5cff", "#30e06f", "#ff8a2d"];
  return Array.from({ length: 24 }, (_, index) => {
    const color = colors[index % colors.length];
    const x = 8 + (index * 37) % 84;
    const delay = (index * 53) % 420;
    const rotate = (index * 41) % 180;
    return `<i style="--c:${color};--x:${x}%;--d:${delay}ms;--r:${rotate}deg"></i>`;
  }).join("");
}

function drawStream(state) {
  cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(() => {
    const stream = state.target.querySelector(".rs-stream");
    const source = state.target.querySelector(`[data-rs-tube="${state.pouring?.from}"]`);
    const target = state.target.querySelector(`[data-rs-tube="${state.pouring?.to}"]`);
    const shell = state.target.querySelector(".rs-board-shell");
    if (!stream || !source || !target || !shell) return;

    const shellRect = shell.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const startX = sourceRect.left + sourceRect.width / 2 - shellRect.left;
    const startY = sourceRect.top + sourceRect.height * 0.22 - shellRect.top;
    const endX = targetRect.left + targetRect.width / 2 - shellRect.left;
    const endY = targetRect.top + targetRect.height * 0.24 - shellRect.top;
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.max(36, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    stream.style.left = `${startX}px`;
    stream.style.top = `${startY}px`;
    stream.style.width = `${length}px`;
    stream.style.transform = `rotate(${angle}deg)`;
  });
}

function getColumnCount(tubeCount) {
  if (tubeCount <= 6) return 3;
  if (tubeCount <= 8) return 4;
  if (tubeCount <= 11) return 5;
  return 6;
}

function clearTransientTimers(state) {
  clearTimeout(state.pourTimer);
  clearTimeout(state.hintTimer);
  clearTimeout(state.invalidTimer);
  cancelAnimationFrame(state.rafId);
}

function persist(state) {
  const payload = {
    currentLevel: state.level,
    totalScore: state.totalScore,
    completed: state.completed,
    initialBoard: state.initialBoard,
    board: state.board,
    moves: state.moves,
    hintsLeft: state.hintsLeft,
    shufflesLeft: state.shufflesLeft,
    hintsUsed: state.hintsUsed,
    shufflesUsed: state.shufflesUsed,
    won: state.won,
    levelScore: state.levelScore,
    stars: state.stars
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* localStorage kullanilamiyorsa oyun yine calisir. */
  }
}

function readProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeCompleted(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([level, stars]) => [
    level,
    clampInt(stars, 1, 3) || 1
  ]));
}

function isValidBoard(board) {
  return Array.isArray(board)
    && board.length >= 2
    && board.every((tube) => (
      Array.isArray(tube)
      && tube.length <= CAPACITY
      && tube.every((colorId) => KNOWN_COLOR_IDS.has(colorId))
    ));
}

function hasMatchingColorCounts(board, initialBoard) {
  const counts = boardCounts(board);
  const initialCounts = boardCounts(initialBoard);
  if (counts.size !== initialCounts.size) return false;
  for (const [color, count] of initialCounts) {
    if (counts.get(color) !== count) return false;
  }
  return true;
}

function boardCounts(board) {
  const counts = new Map();
  for (const tube of board) {
    for (const color of tube) counts.set(color, (counts.get(color) || 0) + 1);
  }
  return counts;
}

function cloneBoard(board) {
  return board.map((tube) => [...tube]);
}

function seedForLevel(level) {
  return (Math.imul(level, 2654435761) + 1013904223) >>> 0;
}

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampInt(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(value);
}

function createSortAudio() {
  let context = null;
  let master = null;
  let enabled = readSoundEnabled();

  function readSoundEnabled() {
    try {
      return localStorage.getItem(SOUND_KEY) !== "0";
    } catch {
      return true;
    }
  }

  function writeSoundEnabled(value) {
    try {
      localStorage.setItem(SOUND_KEY, value ? "1" : "0");
    } catch {
      /* depolama kapali olabilir */
    }
  }

  function ensure() {
    if (!enabled) return false;
    if (!context) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      context = new Ctx();
      master = context.createGain();
      master.gain.value = 0.38;
      master.connect(context.destination);
    }
    if (context.state === "suspended") context.resume();
    return true;
  }

  function tone(freq, duration, { type = "sine", delay = 0, gain = 0.24, slide = 0 } = {}) {
    if (!ensure()) return;
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const volume = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + duration);
    volume.gain.setValueAtTime(0.0001, t0);
    volume.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(volume);
    volume.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.04);
  }

  function noise(duration = 0.12, gain = 0.16, filterFreq = 1100) {
    if (!ensure()) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const volume = context.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    volume.gain.setValueAtTime(gain, context.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(volume);
    volume.connect(master);
    source.start();
  }

  const effects = {
    select() {
      tone(720, 0.06, { type: "triangle", gain: 0.16, slide: 120 });
    },
    pour() {
      noise(0.18, 0.12, 840);
      tone(420, 0.14, { type: "sine", gain: 0.08, slide: -80 });
    },
    wrong() {
      tone(160, 0.12, { type: "sawtooth", gain: 0.12, slide: -40 });
      tone(120, 0.09, { type: "sawtooth", gain: 0.1, delay: 0.06, slide: -30 });
    },
    win() {
      tone(660, 0.1, { type: "triangle", gain: 0.16 });
      tone(880, 0.12, { type: "triangle", gain: 0.15, delay: 0.08 });
      tone(1320, 0.16, { type: "triangle", gain: 0.13, delay: 0.18 });
    },
    button() {
      tone(540, 0.05, { type: "triangle", gain: 0.11 });
    },
    undo() {
      tone(520, 0.06, { type: "sine", gain: 0.12, slide: -110 });
    },
    hint() {
      tone(900, 0.06, { type: "sine", gain: 0.13 });
      tone(1180, 0.08, { type: "sine", gain: 0.11, delay: 0.05 });
    },
    shuffle() {
      noise(0.16, 0.14, 1600);
      tone(360, 0.08, { type: "triangle", gain: 0.13, slide: 260 });
    }
  };

  return {
    play(name) {
      effects[name]?.();
    },
    isEnabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      writeSoundEnabled(enabled);
      if (enabled) effects.button();
      return enabled;
    }
  };
}
