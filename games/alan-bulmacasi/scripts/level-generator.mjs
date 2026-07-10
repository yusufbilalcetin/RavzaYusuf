// Bolum uretimi yalnizca build zamaninda calisir. Tarayici uretilmis js/levels-data.js dosyasini okur.
import { rectCells, rectangleOptionsForClue, solveLevel } from "../js/engine.js";
import { TOTAL_LEVELS, chapterOf, isBossLevel, isReliefLevel } from "../js/level-meta.js";

// Elle tasarlanmis acilis bolumu. Ogreticiyle birebir uyumlu oldugu icin uretilmez.
export const FIRST_LEVEL = {
  id: 1,
  rows: 6,
  columns: 6,
  difficulty: "Başlangıç",
  clues: [
    { row: 0, column: 0, value: 4 },
    { row: 0, column: 4, value: 8 },
    { row: 3, column: 0, value: 6 },
    { row: 2, column: 4, value: 8 },
    { row: 4, column: 4, value: 4 },
    { row: 5, column: 3, value: 6 }
  ],
  solution: [
    { row: 0, column: 0, height: 2, width: 2 },
    { row: 0, column: 2, height: 2, width: 4 },
    { row: 2, column: 0, height: 3, width: 2 },
    { row: 2, column: 2, height: 2, width: 4 },
    { row: 4, column: 2, height: 1, width: 4 },
    { row: 5, column: 0, height: 1, width: 6 }
  ]
};

// Grup basina tumdengelim skoru bandi: [alt, ust].
const CHAPTER_BANDS = [
  [1, 4], [3, 8], [6, 12], [10, 16], [14, 21],
  [18, 26], [22, 31], [26, 36], [30, 42], [38, 52]
];

export function scoreBandFor(id) {
  if (id === TOTAL_LEVELS) return [50, Infinity];
  const [low, high] = CHAPTER_BANDS[chapterOf(id) - 1];
  const span = high - low;
  if (isBossLevel(id)) return [low + span * 0.6, high + 6];
  if (isReliefLevel(id)) return [low, low + span * 0.4];
  return [low, high];
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function possibleSplits(rect) {
  const splits = [];
  for (let cut = 1; cut < rect.width; cut += 1) {
    if (cut * rect.height < 2 || (rect.width - cut) * rect.height < 2) continue;
    splits.push({ orientation: "vertical", cut, balance: Math.abs(rect.width / 2 - cut) });
  }
  for (let cut = 1; cut < rect.height; cut += 1) {
    if (cut * rect.width < 2 || (rect.height - cut) * rect.width < 2) continue;
    splits.push({ orientation: "horizontal", cut, balance: Math.abs(rect.height / 2 - cut) });
  }
  return splits;
}

function applySplit(rect, split) {
  if (split.orientation === "vertical") {
    return [
      { ...rect, width: split.cut },
      { ...rect, column: rect.column + split.cut, width: rect.width - split.cut }
    ];
  }
  return [
    { ...rect, height: split.cut },
    { ...rect, row: rect.row + split.cut, height: rect.height - split.cut }
  ];
}

function splitPartition(rows, columns, target, random) {
  const regions = [{ row: 0, column: 0, height: rows, width: columns }];

  while (regions.length < target) {
    const candidates = regions
      .map((rect, index) => ({ rect, index, splits: possibleSplits(rect) }))
      .filter((entry) => entry.splits.length)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    const pool = candidates.slice(0, Math.min(3, candidates.length));
    const choice = pool[Math.floor(random() * pool.length)];
    if (!choice) break;

    const sortedSplits = choice.splits.sort((a, b) => a.balance - b.balance);
    const splitPool = sortedSplits.slice(0, Math.min(4, sortedSplits.length));
    const split = splitPool[Math.floor(random() * splitPool.length)];
    const [first, second] = applySplit(choice.rect, split);
    regions.splice(choice.index, 1, first, second);
  }

  return regions;
}

function clueFromRegion(rect, random) {
  return {
    row: rect.row + Math.floor(random() * rect.height),
    column: rect.column + Math.floor(random() * rect.width),
    value: rect.width * rect.height
  };
}

/**
 * Bolumu yalnizca iki tumdengelim kuraliyla cozmeye calisir:
 *   Kural 1 - gecerli tek yerlesimi kalan ipucu yerlesir.
 *   Kural 2 - yalnizca tek bir ipucunun kapsayabildigi bos hucre o ipucunun yerlesimini zorlar.
 * Ikisi de tikanirsa oyuncu tahmin etmek zorunda kalir; bolum reddedilir.
 * Skor = tur sayisi + 3 x kural2 kullanimi (kural 2 daha derin bir cikarim).
 */
export function deduce(level) {
  const columns = level.columns;
  const occupied = new Uint8Array(level.rows * columns);
  const options = new Map(level.clues.map((clue) => [clue, rectangleOptionsForClue(level, clue)]));
  const remaining = new Set(level.clues);

  const isFree = (rect) => rectCells(rect).every(({ row, column }) => !occupied[row * columns + column]);
  const place = (rect) => rectCells(rect).forEach(({ row, column }) => { occupied[row * columns + column] = 1; });

  let rounds = 0;
  let deepSteps = 0;

  while (remaining.size) {
    let progressed = false;

    for (const clue of [...remaining]) {
      const available = options.get(clue).filter(isFree);
      if (available.length === 0) return null;
      if (available.length === 1) {
        place(available[0]);
        remaining.delete(clue);
        progressed = true;
      }
    }

    if (!progressed) {
      const reachableBy = new Map();
      for (const clue of remaining) {
        for (const rect of options.get(clue).filter(isFree)) {
          for (const { row, column } of rectCells(rect)) {
            const cell = row * columns + column;
            if (!reachableBy.has(cell)) reachableBy.set(cell, new Set());
            reachableBy.get(cell).add(clue);
          }
        }
      }

      for (const [cell, owners] of reachableBy) {
        if (occupied[cell] || owners.size !== 1) continue;
        const clue = [...owners][0];
        const forced = options.get(clue)
          .filter((rect) => isFree(rect) && rectCells(rect).some(({ row, column }) => row * columns + column === cell));
        if (forced.length !== 1) continue;
        place(forced[0]);
        remaining.delete(clue);
        deepSteps += 1;
        progressed = true;
        break;
      }
    }

    if (!progressed) return null;
    rounds += 1;
  }

  return { rounds, deepSteps, score: rounds + 3 * deepSteps };
}

export function levelSignature(level) {
  const clues = level.clues
    .map((clue) => `${clue.row},${clue.column},${clue.value}`)
    .sort()
    .join("|");
  return `${level.rows}x${level.columns}:${clues}`;
}

// 1-30 arasi bugunku egriyle birebir ayni kalir. 31-200 ayni 9x9 tahtada surer;
// zorluk tahta buyuterek degil, olculen tumdengelim derinligiyle artar.
export function settingsForLevel(id) {
  if (id <= 2) return { rows: 5, columns: 5, target: 6 + (id % 2), difficulty: "Kolay" };
  if (id <= 5) return { rows: 6, columns: 6, target: 7 + (id % 2), difficulty: "Kolay" };
  if (id <= 10) return { rows: 6, columns: 6, target: 8 + (id % 3), difficulty: "Orta" };
  if (id <= 15) return { rows: 7, columns: 7, target: 10 + (id % 2), difficulty: "Orta zor" };
  if (id <= 20) return { rows: 8, columns: 8, target: 11 + (id % 3), difficulty: "Orta zor" };
  if (id <= 25) return { rows: 8, columns: 8, target: 13 + (id % 2), difficulty: "Zor" };
  if (id <= 30) return { rows: 9, columns: 9, target: 14 + (id % 3), difficulty: "Zor" };
  if (id <= 60) return { rows: 9, columns: 9, target: 15 + (id % 4), difficulty: "Zor" };
  if (id <= 100) return { rows: 9, columns: 9, target: 15 + (id % 5), difficulty: "Çok zor" };
  if (id <= 140) return { rows: 9, columns: 9, target: 14 + (id % 6), difficulty: "Usta" };
  if (id <= 180) return { rows: 9, columns: 9, target: 14 + (id % 5), difficulty: "Büyük usta" };
  return { rows: 9, columns: 9, target: 14 + (id % 4), difficulty: "Final" };
}

const MAX_ATTEMPTS = 60000;

function buildCandidate(id, rows, columns, target, attempt) {
  const random = mulberry32(id * 100003 + attempt * 97);
  const solution = splitPartition(rows, columns, target, random);
  if (solution.length !== target) return null;
  const clues = solution.map((rect) => clueFromRegion(rect, random));
  return { id, rows, columns, clues, solution };
}

export function createLevel(id, seen) {
  const settings = settingsForLevel(id);
  const [low, high] = scoreBandFor(id);

  // Ipucu sayisi bandi tutturmaya yetmezse kademeli olarak gevsetilir.
  const targets = [settings.target, settings.target - 1, settings.target + 1, settings.target - 2, settings.target + 2]
    .filter((value) => value >= 4);

  for (const target of targets) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const candidate = buildCandidate(id, settings.rows, settings.columns, target, attempt);
      if (!candidate) continue;
      if (solveLevel(candidate, 2).count !== 1) continue;

      const signature = levelSignature(candidate);
      if (seen.has(signature)) continue;

      const measured = deduce(candidate);
      if (!measured) continue;
      if (measured.score < low || measured.score > high) continue;

      seen.add(signature);
      return { ...candidate, difficulty: settings.difficulty, score: measured.score };
    }
  }

  throw new Error(`Bölüm ${id} için ${low}-${high} skor bandında tek çözümlü bulmaca üretilemedi.`);
}

export function createAllLevels() {
  const seen = new Set();
  const first = { ...FIRST_LEVEL, score: deduce(FIRST_LEVEL)?.score ?? 0 };
  seen.add(levelSignature(FIRST_LEVEL));

  const levels = [first];
  for (let id = 2; id <= TOTAL_LEVELS; id += 1) levels.push(createLevel(id, seen));
  return levels;
}
