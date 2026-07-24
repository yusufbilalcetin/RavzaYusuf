import { LEVEL_DATA, LEVEL_METADATA } from "./levels-data.js";

export { LEVEL_METADATA };

export { CHAPTER_NAMES, TIERS, TOTAL_LEVELS, chapterOf, chapterRange, difficultyLabel } from "./level-meta.js";

function decodeCells(flat) {
  const cells = [];
  for (let i = 0; i < flat.length; i += 2) cells.push({ row: flat[i], col: flat[i + 1] });
  return cells;
}

export const LEVELS = LEVEL_DATA.map(([rows, cols, pieces], index) => ({
  id: index + 1,
  ...LEVEL_METADATA,
  rows,
  cols,
  pieces: pieces.map(([cellsFlat, exitDir, blockedBy], pieceIndex) => ({
    id: pieceIndex,
    cells: decodeCells(cellsFlat),
    exitDir,
    blockedBy
  }))
}));

export function getLevel(id) {
  return LEVELS[id - 1] || LEVELS[0];
}
