import { LEVEL_DATA } from "./levels-data.js";

export { CHAPTER_NAMES, CHAPTER_SIZE, TOTAL_LEVELS, chapterOf, chapterRange, difficultyLabel } from "./level-meta.js";

function decodeCells(flat) {
  const cells = [];
  for (let i = 0; i < flat.length; i += 2) cells.push({ row: flat[i], col: flat[i + 1] });
  return cells;
}

export const LEVELS = LEVEL_DATA.map(([rows, cols, pieces], index) => ({
  id: index + 1,
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
