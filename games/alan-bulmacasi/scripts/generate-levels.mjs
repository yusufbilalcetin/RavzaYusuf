// js/levels-data.js dosyasini uretir. Tarayicida hicbir bolum hesaplanmaz.
//   npm run levels
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAllLevels } from "./level-generator.mjs";

const OUTPUT = fileURLToPath(new URL("../js/levels-data.js", import.meta.url));

const started = Date.now();
const levels = createAllLevels();

// Etiketler tekrar ettigi icin dizine cevrilir; nesne yerine dizi bicimi veriyi ~4x kucultur.
const labels = [...new Set(levels.map((level) => level.difficulty))];

const rows = levels.map((level) => {
  const clues = level.clues.map((clue) => [clue.row, clue.column, clue.value]);
  const solution = level.solution.map((rect) => [rect.row, rect.column, rect.height, rect.width]);
  const encoded = [level.rows, level.columns, labels.indexOf(level.difficulty), clues, solution];
  return `  ${JSON.stringify(encoded)}`;
});

const file = `// Uretilmis dosya - elle duzenleme. Yeniden uretmek icin: npm run levels
// Bicim: [rows, columns, difficultyIndex, [[row, column, value], ...], [[row, column, height, width], ...]]
export const DIFFICULTY_LABELS = ${JSON.stringify(labels)};

export const LEVEL_DATA = [
${rows.join(",\n")}
];
`;

writeFileSync(OUTPUT, file, "utf8");

const scores = levels.map((level) => level.score);
process.stdout.write(
  `${levels.length} bölüm üretildi (${((Date.now() - started) / 1000).toFixed(1)} sn), `
  + `${(Buffer.byteLength(file) / 1024).toFixed(0)}KB, skor ${Math.min(...scores)}-${Math.max(...scores)}\n`
);
