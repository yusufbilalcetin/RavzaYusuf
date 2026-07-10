import assert from "node:assert/strict";
import { LEVELS } from "../js/levels.js";
import { CHAPTER_SIZE, TOTAL_LEVELS, chapterOf } from "../js/level-meta.js";
import { deduce, levelSignature, scoreBandFor } from "../scripts/level-generator.mjs";
import {
  isBoardComplete,
  normalizeRect,
  rectArea,
  solveLevel,
  validateRectangle
} from "../js/engine.js";
import { loadGameStore, saveGameStore, STORAGE_KEY } from "../js/storage.js";

assert.equal(LEVELS.length, TOTAL_LEVELS, `${TOTAL_LEVELS} bölüm bulunmalı`);

const signatures = new Set();
const scores = new Map();

for (const [index, level] of LEVELS.entries()) {
  assert.equal(level.id, index + 1, "Bölüm kimlikleri sıralı olmalı");
  assert.equal(level.clues.reduce((sum, clue) => sum + clue.value, 0), level.rows * level.columns, `Bölüm ${level.id} sayı toplamı`);
  assert.equal(level.solution.length, level.clues.length, `Bölüm ${level.id} çözüm alanı sayısı`);

  const regions = level.solution.map((rect, regionIndex) => ({ ...rect, id: `test-${regionIndex}`, color: regionIndex % 6 }));
  regions.forEach((region) => {
    assert.equal(validateRectangle(level, region, regions, region.id).valid, true, `Bölüm ${level.id} çözüm dikdörtgeni geçerli olmalı`);
  });
  assert.equal(isBoardComplete(level, regions), true, `Bölüm ${level.id} tahtayı tamamen kaplamalı`);
  assert.equal(solveLevel(level, 2).count, 1, `Bölüm ${level.id} tek çözümlü olmalı`);

  const signature = levelSignature(level);
  assert.equal(signatures.has(signature), false, `Bölüm ${level.id} başka bir bölümün birebir kopyası olmamalı`);
  signatures.add(signature);

  // Her bolum yalnizca tumdengelimle bitmeli; hicbiri tahmin gerektirmemeli.
  const measured = deduce(level);
  assert.notEqual(measured, null, `Bölüm ${level.id} tahmin gerektirmeden çözülebilmeli`);
  scores.set(level.id, measured.score);

  // 1. bolum elle tasarlandi ve ogreticiye bagli; skor bandi disinda kalmasi kabul edilir.
  if (level.id === 1) continue;
  const [low, high] = scoreBandFor(level.id);
  assert.ok(
    measured.score >= low && measured.score <= high,
    `Bölüm ${level.id} skoru ${measured.score}, ${low}-${high} bandında olmalı`
  );
}

const medians = [];
for (let chapter = 1; chapter <= TOTAL_LEVELS / CHAPTER_SIZE; chapter += 1) {
  const chapterScores = [...scores.entries()]
    .filter(([id]) => chapterOf(id) === chapter && id !== 1)
    .map(([, score]) => score)
    .sort((a, b) => a - b);
  medians.push(chapterScores[Math.floor(chapterScores.length / 2)]);
}
medians.forEach((median, index) => {
  if (index === 0) return;
  assert.ok(median >= medians[index - 1], `Grup ${index + 1} medyan zorluğu (${median}) önceki gruptan düşük olmamalı`);
});

const first = LEVELS[0];
const firstRegion = { ...first.solution[0], id: "first", color: 0 };
assert.equal(rectArea(firstRegion), 4, "İlk alan 2x2 ve 4 hücre olmalı");
assert.equal(validateRectangle(first, firstRegion).valid, true, "Doğru alan kabul edilmeli");
assert.equal(validateRectangle(first, { row: 0, column: 0, width: 1, height: 2 }).valid, false, "Eksik alan reddedilmeli");
assert.equal(validateRectangle(first, { row: 0, column: 0, width: 3, height: 2 }).valid, false, "Birden fazla sayı içeren alan reddedilmeli");
assert.equal(validateRectangle(first, { row: 2, column: 2, width: 1, height: 1 }).valid, false, "Sayısız alan reddedilmeli");
assert.equal(validateRectangle(first, { row: -1, column: 0, width: 2, height: 2 }).valid, false, "Tahta dışı alan reddedilmeli");
assert.equal(validateRectangle(first, first.solution[1], [firstRegion]).valid, true, "Çakışmayan alan kabul edilmeli");
assert.equal(validateRectangle(first, firstRegion, [firstRegion]).valid, false, "Çakışan alan reddedilmeli");
assert.deepEqual(normalizeRect({ row: 4, column: 5 }, { row: 2, column: 2 }), { row: 2, column: 2, height: 3, width: 4 }, "Ters sürükleme normalize edilmeli");

let storedValue = "{bozuk";
globalThis.localStorage = {
  getItem(key) { return key === STORAGE_KEY ? storedValue : null; },
  setItem(key, value) { storedValue = value; }
};
assert.equal(loadGameStore().currentLevel, 1, "Bozuk kayıt güvenli varsayılana dönmeli");
assert.equal(saveGameStore({ currentLevel: 7, lastUnlocked: 8, soundEnabled: false }), true, "Kayıt yazılabilmeli");
assert.equal(loadGameStore().currentLevel, 7, "Kayıt yeniden okunabilmeli");
assert.equal(loadGameStore().soundEnabled, false, "Ses tercihi korunmalı");

saveGameStore({ currentLevel: 200, lastUnlocked: 200 });
assert.equal(loadGameStore().lastUnlocked, TOTAL_LEVELS, "200. bölüm açılabilmeli");
saveGameStore({ currentLevel: 999, lastUnlocked: 999 });
assert.equal(loadGameStore().lastUnlocked, TOTAL_LEVELS, "Sınır dışı kayıt son bölüme kırpılmalı");

console.log(
  `Alan Bulmacası doğrulandı: ${LEVELS.length} bölüm, tamamı tek çözümlü, `
  + `tahminsiz çözülebilir ve kopyasız. Grup medyanları: ${medians.join(" → ")}`
);
