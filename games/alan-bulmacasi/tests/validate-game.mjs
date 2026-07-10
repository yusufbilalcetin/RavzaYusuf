import assert from "node:assert/strict";
import { LEVELS } from "../js/levels.js";
import {
  isBoardComplete,
  normalizeRect,
  rectArea,
  solveLevel,
  validateRectangle
} from "../js/engine.js";
import { loadGameStore, saveGameStore, STORAGE_KEY } from "../js/storage.js";

assert.equal(LEVELS.length, 30, "30 bölüm bulunmalı");

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
}

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

console.log(`Alan Bulmacası doğrulandı: ${LEVELS.length} bölüm, tamamı tek çözümlü.`);
