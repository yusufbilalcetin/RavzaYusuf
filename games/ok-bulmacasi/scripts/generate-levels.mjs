// js/levels-data.js dosyasini uretir. Tarayicida hicbir bolum hesaplanmaz.
//   npm run levels
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION, GENERATOR_VERSION, LEVEL_DATA_VERSION, SEED_BASE, createAllLevels, getGenerationStats } from "./level-generator.mjs";

const OUTPUT = fileURLToPath(new URL("../js/levels-data.js", import.meta.url));

const started = Date.now();
const levels = createAllLevels();

const rows = levels.map((level) => {
  const pieces = level.pieces.map((piece) => {
    const cellsFlat = piece.cells.flatMap(({ row, col }) => [row, col]);
    return [cellsFlat, piece.exitDir, piece.blockedBy];
  });
  return `  ${JSON.stringify([level.rows, level.cols, pieces])}`;
});

const file = `// Uretilmis dosya - elle duzenleme. Yeniden uretmek icin: npm run generate:levels
// generatorVersion: ${GENERATOR_VERSION}; seedBase: ${SEED_BASE}
export const LEVEL_METADATA = Object.freeze({ levelDataVersion: ${LEVEL_DATA_VERSION}, engineVersion: ${ENGINE_VERSION}, generatorVersion: ${GENERATOR_VERSION}, seedBase: ${SEED_BASE} });
// Bicim: [rows, cols, [[cellsFlat, exitDir, blockedBy], ...]]
//   cellsFlat: [row, col, row, col, ...] (kuyruktan ok ucuna sirali hucreler)
//   exitDir: 0 yukari, 1 sag, 2 asagi, 3 sol
//   blockedBy: bu parca cekilmeden once tahtadan cikmasi gereken parca id'leri
export const LEVEL_DATA = [
${rows.join(",\n")}
];
`;

writeFileSync(OUTPUT, file, "utf8");

const pieceCounts = levels.map((level) => level.pieces.length);
const generation = getGenerationStats();
process.stdout.write(
  `${levels.length} bölüm üretildi (${((Date.now() - started) / 1000).toFixed(1)} sn), `
  + `${(Buffer.byteLength(file) / 1024).toFixed(0)}KB, parça sayısı ${Math.min(...pieceCounts)}-${Math.max(...pieceCounts)}, `
  + `yeniden deneme ${generation.regenerated}, benzerlik reddi ${generation.similarityRejected}, `
  + `yogunluk reddi ${generation.densityRejected}, repair ${generation.repaired}\n`
);
