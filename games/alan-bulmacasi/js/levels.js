import { solveLevel } from "./engine.js";

const FIRST_LEVEL = {
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

function settingsForLevel(id) {
  if (id <= 2) return { rows: 5, columns: 5, target: 6 + (id % 2), difficulty: "Kolay" };
  if (id <= 5) return { rows: 6, columns: 6, target: 7 + (id % 2), difficulty: "Kolay" };
  if (id <= 10) return { rows: 6, columns: 6, target: 8 + (id % 3), difficulty: "Orta" };
  if (id <= 15) return { rows: 7, columns: 7, target: 10 + (id % 2), difficulty: "Orta zor" };
  if (id <= 20) return { rows: 8, columns: 8, target: 11 + (id % 3), difficulty: "Orta zor" };
  if (id <= 25) return { rows: 8, columns: 8, target: 13 + (id % 2), difficulty: "Zor" };
  return { rows: 9, columns: 9, target: 14 + (id % 3), difficulty: "Zor" };
}

function createUniqueLevel(id) {
  const settings = settingsForLevel(id);
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const random = mulberry32(id * 100003 + attempt * 97);
    const solution = splitPartition(settings.rows, settings.columns, settings.target, random);
    const clues = solution.map((rect) => clueFromRegion(rect, random));
    const level = { id, ...settings, clues, solution };
    if (solveLevel(level, 2).count === 1) return level;
  }
  throw new Error(`Bölüm ${id} için tek çözüm üretilemedi.`);
}

export function createAllLevels() {
  return [FIRST_LEVEL, ...Array.from({ length: 29 }, (_, index) => createUniqueLevel(index + 2))];
}

export const LEVELS = createAllLevels();

export function getLevel(id) {
  return LEVELS.find((level) => level.id === id) || LEVELS[0];
}
