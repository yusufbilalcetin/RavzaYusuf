import { DIRECTIONS, cellKey, corridorCells } from "../js/engine.js";
import { CHAPTER_SIZE, TOTAL_LEVELS, chapterOf } from "../js/level-meta.js";

// Bolum basina tahta boyutu ve parca sayisi/uzunlugu araligi (kolaydan zora buyur).
const CHAPTER_CONFIG = [
  { cols: 6, rows: 7, minPieces: 3, maxPieces: 4, minLen: 2, maxLen: 3 },
  { cols: 6, rows: 8, minPieces: 4, maxPieces: 5, minLen: 2, maxLen: 4 },
  { cols: 7, rows: 8, minPieces: 5, maxPieces: 6, minLen: 3, maxLen: 4 },
  { cols: 7, rows: 9, minPieces: 6, maxPieces: 7, minLen: 3, maxLen: 4 },
  { cols: 8, rows: 9, minPieces: 7, maxPieces: 8, minLen: 3, maxLen: 5 },
  { cols: 8, rows: 10, minPieces: 8, maxPieces: 9, minLen: 3, maxLen: 5 },
  { cols: 9, rows: 10, minPieces: 9, maxPieces: 10, minLen: 4, maxLen: 5 },
  { cols: 9, rows: 11, minPieces: 10, maxPieces: 11, minLen: 4, maxLen: 5 },
  { cols: 10, rows: 11, minPieces: 11, maxPieces: 12, minLen: 4, maxLen: 6 },
  { cols: 10, rows: 12, minPieces: 12, maxPieces: 14, minLen: 4, maxLen: 6 }
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(array, rng) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function configFor(id, rng) {
  const chapter = chapterOf(id);
  const { cols, rows, minPieces, maxPieces, minLen, maxLen } = CHAPTER_CONFIG[chapter - 1];
  const posInChapter = (id - 1) % CHAPTER_SIZE;
  const t = posInChapter / (CHAPTER_SIZE - 1);
  const base = Math.round(minPieces + (maxPieces - minPieces) * t);
  const jitter = Math.round((rng() - 0.5) * 2);
  const pieceCount = Math.max(minPieces, Math.min(maxPieces, base + jitter));
  return { cols, rows, pieceCount, minLen, maxLen };
}

// Kendine ve rezerve edilmis (baska parcaya ait govde/koridor) hucrelere hic
// degmeyen rastgele bir govde yurur. Boylece parcalarin govdeleri asla
// kesismez veya ic ice gecmez.
function buildPieceBody(rows, cols, reserved, targetLen, rng) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const start = { row: Math.floor(rng() * rows), col: Math.floor(rng() * cols) };
    if (reserved.has(cellKey(start.row, start.col))) continue;

    const path = [start];
    const used = new Set([cellKey(start.row, start.col)]);

    while (path.length < targetLen) {
      const current = path[path.length - 1];
      const candidates = shuffle(DIRECTIONS, rng).filter(({ dr, dc }) => {
        const nr = current.row + dr;
        const nc = current.col + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return false;
        const key = cellKey(nr, nc);
        return !used.has(key) && !reserved.has(key);
      });
      if (!candidates.length) break;

      const step = candidates[0];
      const next = { row: current.row + step.dr, col: current.col + step.dc };
      path.push(next);
      used.add(cellKey(next.row, next.col));
    }

    if (path.length >= 2) return path;
  }
  return null;
}

// Parcanin kafasindan cikacagi yonu secer; kendi govdesini kesen bir kacis
// koridoru olusturan yonler elenir (fiziksel olarak kendi kendini engelleme).
function chooseExitDir(body, rows, cols, rng) {
  const head = body[body.length - 1];
  const bodyKeys = new Set(body.map((cell) => cellKey(cell.row, cell.col)));

  const validDirs = shuffle([0, 1, 2, 3], rng).filter((dir) => {
    const corridor = corridorCells(rows, cols, head.row, head.col, dir);
    return !corridor.some(({ row, col }) => bodyKeys.has(cellKey(row, col)));
  });

  return validDirs.length ? validDirs[0] : null;
}

// Parcalari sirayla (rank 0, 1, 2, ...) yerlestirir. Her yeni parca, daha once
// yerlesmis TUM parcalarin hem govdesinden hem de kacis koridorundan
// tamamen kacinir - bu sayede sonradan eklenen bir parca, onceki bir parcanin
// koridoruna asla girip onu geriye donuk olarak engellemez. Boylece bir parca
// yalnizca KENDINDEN ONCE yerlesmis (kucuk id'li) parcalarca engellenebilir;
// bu da en kucuk id'li kalan parcanin her zaman cekilebilir kalmasini ve
// hicbir alt kumede tikanma (deadlock) olusmamasini garanti eder.
export function generateLevel(id) {
  const rng = mulberry32(id * 1000003 + 7);
  const { rows, cols, pieceCount, minLen, maxLen } = configFor(id, rng);

  const reserved = new Set();
  const bodies = [];
  const pieces = [];

  let guard = 0;
  while (pieces.length < pieceCount && guard < pieceCount * 40) {
    guard += 1;
    const targetLen = minLen + Math.floor(rng() * (maxLen - minLen + 1));
    const body = buildPieceBody(rows, cols, reserved, targetLen, rng);
    // ponytail: tahta dolmaya yaklastikca yer bulunamayabilir; boyle bir
    // durumda bolum planlanandan birkac parca az uretilir, yine de cozulebilir kalir.
    if (!body) break;

    const exitDir = chooseExitDir(body, rows, cols, rng);
    if (exitDir === null) continue;

    const head = body[body.length - 1];
    const corridor = corridorCells(rows, cols, head.row, head.col, exitDir);

    const blockedBy = [];
    bodies.forEach((otherBody, otherRank) => {
      if (corridor.some(({ row, col }) => otherBody.has(cellKey(row, col)))) blockedBy.push(otherRank);
    });

    body.forEach((cell) => reserved.add(cellKey(cell.row, cell.col)));
    corridor.forEach((cell) => reserved.add(cellKey(cell.row, cell.col)));
    bodies.push(new Set(body.map((cell) => cellKey(cell.row, cell.col))));
    pieces.push({ id: pieces.length, cells: body, exitDir, blockedBy });
  }

  return { id, rows, cols, pieces };
}

export function createAllLevels() {
  const levels = [];
  for (let id = 1; id <= TOTAL_LEVELS; id += 1) levels.push(generateLevel(id));
  return levels;
}

export function levelSignature(level) {
  const pieces = level.pieces
    .map((piece) => piece.cells.map(({ row, col }) => `${row},${col}`).join(">"))
    .sort()
    .join("|");
  return `${level.rows}x${level.cols}:${pieces}`;
}
