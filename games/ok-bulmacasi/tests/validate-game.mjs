import assert from "node:assert/strict";
import { LEVELS } from "../js/levels.js";
import { CHAPTER_SIZE, TOTAL_LEVELS, chapterOf } from "../js/level-meta.js";
import { levelSignature } from "../scripts/level-generator.mjs";
import { cellKey, corridorCells, getPullablePieces, isPullable, simulateFullyClearable } from "../js/engine.js";
import { loadGameStore, saveGameStore, STORAGE_KEY } from "../js/storage.js";

assert.equal(LEVELS.length, TOTAL_LEVELS, `${TOTAL_LEVELS} bölüm bulunmalı`);

const signatures = new Set();
const complexities = new Map();

for (const level of LEVELS) {
  assert.ok(level.pieces.length > 0, `Bölüm ${level.id} en az bir yol içermeli`);

  const cellOwners = new Map();
  for (const piece of level.pieces) {
    assert.ok(piece.cells.length >= 2, `Bölüm ${level.id} yol ${piece.id} en az 2 hücre olmalı`);

    const seenInPiece = new Set();
    piece.cells.forEach((cell, index) => {
      assert.ok(cell.row >= 0 && cell.row < level.rows, `Bölüm ${level.id} yol ${piece.id} satırı tahta içinde olmalı`);
      assert.ok(cell.col >= 0 && cell.col < level.cols, `Bölüm ${level.id} yol ${piece.id} sütunu tahta içinde olmalı`);

      const key = `${cell.row}:${cell.col}`;
      assert.equal(seenInPiece.has(key), false, `Bölüm ${level.id} yol ${piece.id} kendi üzerinden geçemez`);
      seenInPiece.add(key);

      if (index > 0) {
        const prev = piece.cells[index - 1];
        const stepDistance = Math.abs(prev.row - cell.row) + Math.abs(prev.col - cell.col);
        assert.equal(stepDistance, 1, `Bölüm ${level.id} yol ${piece.id} bitişik hücrelerden oluşmalı`);
      }

      assert.equal(cellOwners.has(key), false, `Bölüm ${level.id} bir hücreyi iki yol paylaşamaz (yollar kesişmemeli)`);
      cellOwners.set(key, piece.id);
    });

    assert.ok(piece.exitDir >= 0 && piece.exitDir <= 3, `Bölüm ${level.id} yol ${piece.id} çıkış yönü 0-3 arası olmalı`);

    // blockedBy sadece daha once yerlesmis (kucuk id'li) parcalari icermeli.
    piece.blockedBy.forEach((id) => {
      assert.ok(id < piece.id, `Bölüm ${level.id} yol ${piece.id} yalnızca kendinden önceki yollarca engellenebilir`);
    });
  }

  // blockedBy, gercek geometriyle (kacis koridoru) birebir eslesmeli - hicbir
  // parca kendi govdesini kesen bir koridora sahip olmamali ve daha sonraki
  // (buyuk id'li) bir parca, daha onceki bir parcanin koridoruna girmemeli.
  const bodySets = level.pieces.map((piece) => new Set(piece.cells.map((cell) => cellKey(cell.row, cell.col))));
  level.pieces.forEach((piece) => {
    const head = piece.cells[piece.cells.length - 1];
    const corridor = corridorCells(level.rows, level.cols, head.row, head.col, piece.exitDir);
    const ownBody = bodySets[piece.id];
    assert.ok(
      corridor.every(({ row, col }) => !ownBody.has(cellKey(row, col))),
      `Bölüm ${level.id} yol ${piece.id} kendi kaçış koridorunu kesmemeli`
    );

    const expectedBlockers = level.pieces
      .filter((other) => other.id !== piece.id && corridor.some(({ row, col }) => bodySets[other.id].has(cellKey(row, col))))
      .map((other) => other.id)
      .sort((a, b) => a - b);
    assert.deepEqual(
      [...piece.blockedBy].sort((a, b) => a - b),
      expectedBlockers,
      `Bölüm ${level.id} yol ${piece.id} blockedBy listesi gerçek koridor geometrisiyle eşleşmeli`
    );
  });

  // Her sirayla (herhangi bir sirayla) tahta tamamen bosaltilabilmeli - soft-lock olmamali.
  assert.equal(simulateFullyClearable(level.pieces), true, `Bölüm ${level.id} her durumda tamamen temizlenebilmeli`);

  // Baslangicta en az bir yol cekilebilir olmali.
  const remainingIds = new Set(level.pieces.map((piece) => piece.id));
  const initialPullable = getPullablePieces(level.pieces, remainingIds);
  assert.ok(initialPullable.length > 0, `Bölüm ${level.id} başlangıçta çekilebilir bir yol içermeli`);

  const signature = levelSignature(level);
  assert.equal(signatures.has(signature), false, `Bölüm ${level.id} başka bir bölümün birebir kopyası olmamalı`);
  signatures.add(signature);

  const chapter = chapterOf(level.id);
  const totalCells = level.pieces.reduce((sum, piece) => sum + piece.cells.length, 0);
  const complexity = level.pieces.length + totalCells / (level.rows * level.cols);
  if (!complexities.has(chapter)) complexities.set(chapter, []);
  complexities.get(chapter).push(complexity);
}

// Zorluk kolaydan zora ilerlemeli: grup ortalama karmasikligi genel olarak azalmamali.
const chapterCount = TOTAL_LEVELS / CHAPTER_SIZE;
const chapterAverages = [];
for (let chapter = 1; chapter <= chapterCount; chapter += 1) {
  const values = complexities.get(chapter) || [];
  chapterAverages.push(values.reduce((sum, value) => sum + value, 0) / values.length);
}
for (let index = 1; index < chapterAverages.length; index += 1) {
  assert.ok(
    chapterAverages[index] >= chapterAverages[index - 1] - 1,
    `Grup ${index + 1} zorluğu (${chapterAverages[index].toFixed(2)}) önceki gruptan belirgin şekilde düşük olmamalı`
  );
}

// isPullable dogrudan dogrulama: blockedBy icindeki bir id hala tahtadaysa cekilemez.
const sample = { id: 5, blockedBy: [1, 2] };
assert.equal(isPullable(sample, new Set([1, 2, 5])), false, "Engelleyici hala tahtadaysa çekilemez");
assert.equal(isPullable(sample, new Set([5])), true, "Engelleyiciler kalktıysa çekilebilir");

let storedValue = "{bozuk";
globalThis.localStorage = {
  getItem(key) { return key === STORAGE_KEY ? storedValue : null; },
  setItem(key, value) { storedValue = value; }
};
assert.equal(loadGameStore().currentLevel, 1, "Bozuk kayıt güvenli varsayılana dönmeli");
assert.equal(saveGameStore({ currentLevel: 7, lastUnlocked: 8, soundEnabled: false, stars: { 1: 3 } }), true, "Kayıt yazılabilmeli");
assert.equal(loadGameStore().currentLevel, 7, "Kayıt yeniden okunabilmeli");
assert.equal(loadGameStore().soundEnabled, false, "Ses tercihi korunmalı");
assert.equal(loadGameStore().stars[1], 3, "Yıldız kaydı korunmalı");

saveGameStore({ currentLevel: 100, lastUnlocked: 100 });
assert.equal(loadGameStore().lastUnlocked, TOTAL_LEVELS, "100. bölüm açılabilmeli");
saveGameStore({ currentLevel: 999, lastUnlocked: 999 });
assert.equal(loadGameStore().lastUnlocked, TOTAL_LEVELS, "Sınır dışı kayıt son bölüme kırpılmalı");

console.log(
  `Ok Bulmacası doğrulandı: ${LEVELS.length} bölüm, tamamı her sırayla çözülebilir, kopyasız. `
  + `Grup ortalama karmaşıklığı: ${chapterAverages.map((value) => value.toFixed(2)).join(" → ")}`
);
