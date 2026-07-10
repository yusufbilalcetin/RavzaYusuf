import { DIFFICULTY_LABELS, LEVEL_DATA } from "./levels-data.js";

export { CHAPTER_NAMES, CHAPTER_SIZE, TOTAL_LEVELS, chapterOf, chapterRange, isBossLevel } from "./level-meta.js";

export const LEVELS = LEVEL_DATA.map(([rows, columns, difficultyIndex, clues, solution], index) => ({
  id: index + 1,
  rows,
  columns,
  difficulty: DIFFICULTY_LABELS[difficultyIndex],
  clues: clues.map(([row, column, value]) => ({ row, column, value })),
  solution: solution.map(([row, column, height, width]) => ({ row, column, height, width }))
}));

export function getLevel(id) {
  return LEVELS[id - 1] || LEVELS[0];
}
