import { DIRECTIONS, cellKey, corridorCells } from "../js/engine.js";
import { TOTAL_LEVELS, chapterOf, tierProgress } from "../js/level-meta.js";
import { readFileSync } from "node:fs";
import { calculateDensityMetrics, meetsDensityTarget } from "../js/level-audit.js";

const RESEARCH_TARGETS = JSON.parse(readFileSync(new URL("../../../research/arrows-original-design-targets.json", import.meta.url), "utf8")).targets;

export const GENERATOR_VERSION = 11;
export const LEVEL_DATA_VERSION = 2;
export const ENGINE_VERSION = 2;
export const SEED_BASE = 1000003;
const generationStats = { attempts: 0, regenerated: 0, similarityRejected: 0, densityRejected: 0, repaired: 0 };

// Kademe basina zorluk bandi. Her deger [kademe basi, kademe sonu] seklindedir;
// bolum, kendi kademesi icindeki konumuna gore bu bandin arasinda interpole edilir.
// Boylece zorluk 1..150 boyunca surekli buyur, kademe sinirlarinda sicrama olmaz.
const TIER_CONFIG = [
  { cols: [6, 7], rows: [7, 8], pieces: [3, 10], minLen: 2, maxLen: 4 },
  { cols: [8, 10], rows: [9, 12], pieces: [10, 22], minLen: 2, maxLen: 5 },
  { cols: [11, 14], rows: [13, 17], pieces: [22, 38], minLen: 3, maxLen: 7 },
  { cols: [14, 17], rows: [17, 21], pieces: [35, 55], minLen: 4, maxLen: 9 },
  { cols: [14, 16], rows: [23, 27], pieces: [50, 68], minLen: 4, maxLen: 9 },
  { cols: [16, 18], rows: [29, 31], pieces: [60, 75], minLen: 4, maxLen: 9 }
];

function lerpRound([from, to], t) {
  return Math.round(from + (to - from) * t);
}

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
  const { cols, rows, pieces, minLen, maxLen } = TIER_CONFIG[chapterOf(id) - 1];
  const t = tierProgress(id);
  const researchTarget = RESEARCH_TARGETS[id - 1];
  const preferred = researchTarget?.targetArrowCount?.preferred;
  const base = Number.isInteger(preferred) ? preferred : lerpRound(pieces, t);
  const jitter = Math.round((rng() - 0.5) * 2);
  const lower = researchTarget?.targetArrowCount?.min ?? pieces[0];
  const upper = researchTarget?.targetArrowCount?.max ?? pieces[1];
  const pieceCount = Math.max(lower, Math.min(upper, base + jitter));
  return { cols: lerpRound(cols, t), rows: lerpRound(rows, t), pieceCount, minLen, maxLen };
}

// Yalnizca dolu (baska parcaya ait govde) hucrelerden kacinan rastgele bir govde
// yurur. Koridorlar rezerve EDILMEZ - govdeler birbirinin kacis koridorunu
// serbestce kesebilir; yogunluk buradan gelir.
function buildPieceBody(rows, cols, occupied, targetLen, rng, reserved = new Set(), frontierBias = 0.985) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const frontier = [];
    if (occupied.size) {
      const occupiedKeys = [...occupied];
      for (let sample = 0; sample < Math.min(48, occupiedKeys.length * 2); sample += 1) {
        const [row, col] = occupiedKeys[Math.floor(rng() * occupiedKeys.length)].split(",").map(Number);
        const { dr, dc } = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
        const candidate = { row: row + dr, col: col + dc };
        const candidateKey = cellKey(candidate.row, candidate.col);
        if (candidate.row >= 0 && candidate.row < rows && candidate.col >= 0 && candidate.col < cols && !occupied.has(candidateKey) && !reserved.has(candidateKey)) frontier.push(candidate);
      }
    }
    const insetX = Math.max(0, Math.floor(cols * 0.06));
    const insetY = Math.max(0, Math.floor(rows * 0.05));
    const centerRow = (rows - 1) / 2;
    const centerCol = (cols - 1) / 2;
    frontier.sort((a, b) => Math.hypot(a.row - centerRow, a.col - centerCol) - Math.hypot(b.row - centerRow, b.col - centerCol));
    const compactFrontier = frontier.slice(0, Math.max(4, Math.ceil(frontier.length * 0.35)));
    const firstRow = insetY;
    const lastRow = rows - insetY - 1;
    const start = compactFrontier.length && rng() < frontierBias
      ? compactFrontier[Math.floor(rng() * compactFrontier.length)]
      : { row: firstRow + Math.floor(rng() * Math.max(1, lastRow - firstRow + 1)), col: insetX + Math.floor(rng() * Math.max(1, cols - insetX * 2)) };
    if (occupied.has(cellKey(start.row, start.col)) || reserved.has(cellKey(start.row, start.col))) continue;

    const path = [start];
    const used = new Set([cellKey(start.row, start.col)]);

    let previousStep = null;
    while (path.length < targetLen) {
      const current = path[path.length - 1];
      const candidates = shuffle(DIRECTIONS, rng).filter(({ dr, dc }) => {
        const nr = current.row + dr;
        const nc = current.col + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return false;
        const key = cellKey(nr, nc);
        return !used.has(key) && !occupied.has(key) && !reserved.has(key);
      });
      if (!candidates.length) break;

      const turning = previousStep ? candidates.filter((step) => step.dr !== previousStep.dr || step.dc !== previousStep.dc) : candidates;
      const pool = turning.length && rng() < 0.72 ? turning : candidates;
      const step = pool[0];
      const next = { row: current.row + step.dr, col: current.col + step.dc };
      path.push(next);
      used.add(cellKey(next.row, next.col));
      previousStep = step;
    }

    if (path.length >= 2) return path;
  }
  return null;
}

// Cikis yonu, kaldirma sirasinin tersine yerlestirmenin can alici noktasi:
// koridor hem kendi govdesinden hem de O AN TAHTADA OLAN tum govdelerden temiz
// olmali. Boylece bu parca, kendinden once yerlestirilenlerin hicbirine takilmaz.
function chooseExitDir(body, rows, cols, occupied, rng) {
  const head = body[body.length - 1];
  const bodyKeys = new Set(body.map((cell) => cellKey(cell.row, cell.col)));
  const validDirs = shuffle([0, 1, 2, 3], rng).filter((dir) => {
    const corridor = corridorCells(rows, cols, head.row, head.col, dir);
    return !corridor.some(({ row, col }) => bodyKeys.has(cellKey(row, col)) || occupied.has(cellKey(row, col)));
  });

  return validDirs.length ? validDirs[0] : null;
}

// Parcalari KALDIRMA SIRASININ TERSINE yerlestirir. Yerlestirilen her parcanin
// kacis koridoru, o an tahtada olan tum govdelerden temizdir - yani en son
// yerlestirilen parca, dolu tahtada bile cekilebilir durumdadir.
//
// Kaldirma sirasi = yerlestirmenin tersi. p_k kaldirildiginda tahtada yalnizca
// ondan ONCE yerlestirilenler (p_0..p_{k-1}) kalir ve p_k'nin koridoru
// yerlestirme aninda tam olarak onlardan temiz secilmisti. Dolayisiyla her
// parca sirasi geldiginde mutlaka cekilebilir: tikanma (deadlock) imkansiz.
//
// Sonradan yerlestirilen bir parcanin govdesi, onceki bir parcanin koridoruna
// GIREBILIR - bu serbestlik yogunlugu saglar; o parca zaten daha once
// kaldirilacagi icin engel kalici olmaz.
export function generateLevel(id, variant = 0) {
  const seedVariant = variant + (id === 1 ? 1 : 0); // Ilk bolum collision egitim testi icin en az bir bloklu ok tasir.
  const seed = id * SEED_BASE + GENERATOR_VERSION * 97 + seedVariant * 7919;
  const rng = mulberry32(seed);
  const { rows, cols, pieceCount, minLen, maxLen } = configFor(id, rng);

  const occupied = new Set(); // yalnizca govde hucreleri
  const reserved = new Set();
  const splitLayout = id >= 61 && id % 6 === 0;
  // İleri bölümlerin bir kısmı referanstaki ana dikey grup + alt yatay grup
  // kompozisyonunu kullanır. İki boş bant hücresi grupları ayırırken board'u
  // iki ayrı ekran gibi gösterecek kadar büyük bir boşluk oluşturmaz.
  if (splitLayout) {
    const gapStart = Math.floor(rows * 0.72);
    for (let row = gapStart; row < Math.min(rows, gapStart + 1); row += 1) {
      for (let col = 0; col < cols; col += 1) reserved.add(cellKey(row, col));
    }
  }
  const placed = [];

  let guard = 0;
  while (placed.length < pieceCount && guard < pieceCount * 60) {
    guard += 1;
    // Tahta doldukca kisa govdeler daha kolay yer bulur; uzundan kisaya denenir.
    const wanted = minLen + Math.floor(rng() * (maxLen - minLen + 1));
    let body = null;
    let exitDir = null;
    for (let targetLen = wanted; targetLen >= 2 && exitDir === null; targetLen -= 1) {
      body = buildPieceBody(rows, cols, occupied, targetLen, rng, reserved, splitLayout ? 0.9 : 0.985);
      if (!body) continue;
      exitDir = chooseExitDir(body, rows, cols, occupied, rng);
    }
    // ponytail: tahta doydugunda bolum planlanandan az parca ile biter;
    // cozulebilirlik yine garanti - dogrulayici her bolumu ayrica sinar.
    if (!body || exitDir === null) continue;

    body.forEach((cell) => occupied.add(cellKey(cell.row, cell.col)));
    placed.push({ cells: body, exitDir });
  }

  // Ters cevir: index 0 = en son yerlestirilen = ILK kaldirilan.
  const ordered = placed.reverse();
  const bodies = ordered.map((piece) => new Set(piece.cells.map((cell) => cellKey(cell.row, cell.col))));

  const pieces = ordered.map((piece, index) => {
    const head = piece.cells[piece.cells.length - 1];
    const swept = corridorCells(rows, cols, head.row, head.col, piece.exitDir);
    const blockedBy = [];
    ordered.forEach((_, other) => {
      if (other === index) return;
      if (swept.some(({ row, col }) => bodies[other].has(cellKey(row, col)))) blockedBy.push(other);
    });
    return { id: index, cells: piece.cells, exitDir: piece.exitDir, blockedBy };
  });

  return { id, rows, cols, pieces, seed, generatorVersion: GENERATOR_VERSION };
}

export function createAllLevels() {
  generationStats.attempts = 0; generationStats.regenerated = 0; generationStats.similarityRejected = 0; generationStats.densityRejected = 0; generationStats.repaired = 0;
  const levels = [];
  const fingerprints = [];
  for (let id = 1; id <= TOTAL_LEVELS; id += 1) {
    let accepted = null;
    for (let variant = 0; variant < 16 && !accepted; variant += 1) {
      generationStats.attempts += 1;
      const candidate = generateLevel(id, variant);
      const fingerprint = levelFingerprint(candidate);
      if (fingerprints.some((previous) => fingerprintSimilarity(fingerprint, previous) >= 0.965)) {
        generationStats.regenerated += 1; generationStats.similarityRejected += 1; continue;
      }
      if (id >= 61 && !meetsDensityTarget(candidate, calculateDensityMetrics(candidate))) {
        generationStats.regenerated += 1; generationStats.densityRejected += 1; continue;
      }
      accepted = candidate; fingerprints.push(fingerprint);
    }
    if (!accepted) {
      const repaired = repairSparseLevel(id, 16);
      const fingerprint = levelFingerprint(repaired);
      if (!meetsDensityTarget(repaired, calculateDensityMetrics(repaired)) || fingerprints.some((previous) => fingerprintSimilarity(fingerprint, previous) >= 0.965)) throw new Error(`Bolum ${id} kompaktlik ve ozgunluk esigini gecemedi.`);
      accepted = repaired; fingerprints.push(fingerprint); generationStats.repaired += 1;
    }
    levels.push(accepted);
  }
  return levels;
}

export function repairSparseLevel(id, startVariant = 16) {
  let best = null; let bestScore = -Infinity;
  for (let variant = startVariant; variant < startVariant + 24; variant += 1) {
    const candidate = generateLevel(id, variant);
    const metrics = calculateDensityMetrics(candidate);
    if (metrics.visualCompactnessScore > bestScore) { best = candidate; bestScore = metrics.visualCompactnessScore; }
    if (meetsDensityTarget(candidate, metrics)) return candidate;
  }
  return best;
}

function directionCode(a, b) {
  if (b.col > a.col) return "R"; if (b.col < a.col) return "L";
  if (b.row > a.row) return "D"; return "U";
}

export function levelFingerprint(level) {
  const routes = level.pieces.map((piece) => {
    const directions = piece.cells.slice(1).map((cell, index) => directionCode(piece.cells[index], cell));
    const turns = directions.slice(1).map((direction, index) => direction === directions[index] ? "S" : `${directions[index]}${direction}`);
    return `${directions.join("")}:${turns.join(".")}`;
  }).sort();
  const occupancy = new Set(level.pieces.flatMap((piece) => piece.cells.map(({ row, col }) => `${Math.min(15, Math.floor(row * 16 / level.rows))},${Math.min(15, Math.floor(col * 16 / level.cols))}`)));
  const directionHistogram = [0, 1, 2, 3].map((dir) => level.pieces.filter((piece) => piece.exitDir === dir).length / level.pieces.length);
  const dependencyDegrees = level.pieces.map((piece) => piece.blockedBy.length).sort((a, b) => a - b);
  return { routes, occupancy, directionHistogram, dependencyDegrees, pieceCount: level.pieces.length };
}

function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  let intersection = 0; left.forEach((value) => { if (right.has(value)) intersection += 1; });
  return intersection / union.size;
}

export function fingerprintSimilarity(left, right) {
  const countScore = 1 - Math.min(1, Math.abs(left.pieceCount - right.pieceCount) / Math.max(left.pieceCount, right.pieceCount));
  const routeScore = jaccard(new Set(left.routes), new Set(right.routes));
  const occupancyScore = jaccard(left.occupancy, right.occupancy);
  const histogramScore = 1 - left.directionHistogram.reduce((sum, value, index) => sum + Math.abs(value - right.directionHistogram[index]), 0) / 2;
  const degreeScore = jaccard(new Set(left.dependencyDegrees), new Set(right.dependencyDegrees));
  return countScore * 0.15 + routeScore * 0.35 + occupancyScore * 0.2 + histogramScore * 0.15 + degreeScore * 0.15;
}

export function getGenerationStats() { return { ...generationStats }; }

export function levelSignature(level) {
  const pieces = level.pieces
    .map((piece) => piece.cells.map(({ row, col }) => `${row},${col}`).join(">"))
    .sort()
    .join("|");
  return `${level.rows}x${level.cols}:${pieces}`;
}
