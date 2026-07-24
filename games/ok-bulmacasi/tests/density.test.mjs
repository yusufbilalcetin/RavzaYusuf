import assert from "node:assert/strict";
import { LEVELS } from "../js/levels.js";
import { auditLevels, calculateDensityMetrics, meetsDensityTarget } from "../js/level-audit.js";
import { GENERATOR_VERSION, fingerprintSimilarity, generateLevel, levelFingerprint, repairSparseLevel } from "../scripts/level-generator.mjs";

const audit = auditLevels(LEVELS);
assert.equal(audit.summary.visualSparseLevels, 0, "150 bolum yeni gorsel yogunluk hedeflerini gecmeli");

for (const id of [5, 25, 50, 75, 100, 125, 150]) {
  const level = LEVELS[id - 1];
  const metrics = calculateDensityMetrics(level);
  assert.equal(meetsDensityTarget(level, metrics), true, `Bolum ${id} yogunluk hedefini gecmeli`);
  assert.ok(metrics.internalDensity > 0, "Ic doluluk hesaplanmali");
  assert.ok(metrics.parallelCorridorScore >= 0 && metrics.parallelCorridorScore <= 1, "Paralel koridor skoru normalize olmali");
  assert.ok(metrics.nestingScore >= 0, "Ic icelik skoru hesaplanmali");
  assert.ok(Number.isInteger(metrics.largeEmptyIslandCount), "Bos ada sayisi tam sayi olmali");
}

const late = LEVELS.slice(100).map(calculateDensityMetrics);
const average = (key) => late.reduce((sum, item) => sum + item[key], 0) / late.length;
assert.ok(average("averageNearestArrowDistance") < 1.1, "Ileri bolumlerde oklar yakin olmali");
assert.ok(average("parallelCorridorScore") > 0.4, "Ileri bolumlerde paralel koridorlar belirgin olmali");
assert.ok(average("nestingScore") > 2.5, "Ileri bolumlerde cok donuslu ic ice geometri olmali");
assert.ok(average("isolatedArrowRatio") < 0.03, "Ileri bolumlerde izole ok orani dusuk olmali");

const compact144 = calculateDensityMetrics(LEVELS[143]);
assert.ok(compact144.visualCompactnessScore >= 0.38, "Level 144 bosluklu gorunumu production'a girmemeli");
assert.ok(compact144.clusterCount <= 2 && compact144.miniIslandCount === 0, "Level 144 mini adalara parcalanmamali");
const sparseSynthetic = { id: 144, rows: 30, cols: 17, pieces: [
  { id:0, cells:[{row:1,col:1},{row:1,col:2}], exitDir:1 },
  { id:1, cells:[{row:14,col:8},{row:15,col:8}], exitDir:2 },
  { id:2, cells:[{row:28,col:15},{row:28,col:16}], exitDir:1 }
] };
const sparseMetrics = calculateDensityMetrics(sparseSynthetic);
assert.ok(sparseMetrics.fragmentationScore > .5 && !meetsDensityTarget(sparseSynthetic, sparseMetrics), "Level 144 tipi parcalanmis layout reddedilmeli");
const repaired144 = repairSparseLevel(144, 0);
assert.equal(meetsDensityTarget(repaired144), true, "repairSparseLevel kompakt bir aday bulmali");

const deterministicA = generateLevel(75);
const deterministicB = generateLevel(75);
assert.equal(deterministicA.generatorVersion, GENERATOR_VERSION, "Generator surumu level ile kaydedilmeli");
assert.deepEqual(deterministicA, deterministicB, "Ayni surum ve seed ayni bolumu uretmeli");
const fingerprintA = levelFingerprint(deterministicA);
const fingerprintB = levelFingerprint(generateLevel(76));
assert.ok(fingerprintSimilarity(fingerprintA, fingerprintB) < 0.965, "Ardisik bolumler ozgunluk esigini gecmeli");

console.log("Gorsel yogunluk dogrulandi: doluluk, paralellik, ic icelik, bos adalar ve izolasyon hedefleri gecti.");
