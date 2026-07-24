import assert from "node:assert/strict";
import { LEVELS, getLevel } from "../js/levels.js";
import {
  PULL_BLOCKED, PULL_IGNORED, PULL_OK, START_LIVES,
  attemptPull, commitPull, createGame, pullablePieces, restartGame, undoPull, useHint
} from "../js/state.js";
import { TIERS, TOTAL_LEVELS, chapterOf, chapterRange, difficultyLabel } from "../js/level-meta.js";
import { levelSignature } from "../scripts/level-generator.mjs";
import { cellKey, corridorCells, getPullablePieces, isPullable, simulateFullyClearable, solveLevel, stateHash } from "../js/engine.js";
import { isCompleted, isUnlocked, loadProgress, saveProgress, updateProgress, STORAGE_KEY } from "../js/storage.js";
import { validateLevel } from "../js/validation.js";

function pullAndCommit(game, pieceId) {
  const outcome = attemptPull(game, pieceId);
  if (outcome.result === PULL_OK) return { ...outcome, ...commitPull(game, pieceId) };
  return outcome;
}

assert.equal(LEVELS.length, TOTAL_LEVELS, `${TOTAL_LEVELS} bölüm bulunmalı`);

const signatures = new Set();
const complexities = new Map();

for (const level of LEVELS) {
  const schema = validateLevel(level);
  assert.equal(schema.valid, true, `Bölüm ${level.id} şema kontrolünden geçmeli: ${schema.errors.join(" | ")}`);
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
  assert.equal(simulateFullyClearable(level.pieces, level), true, `Bölüm ${level.id} tamamen temizlenebilmeli`);

  // Baslangicta en az bir yol cekilebilir olmali.
  const remainingIds = new Set(level.pieces.map((piece) => piece.id));
  const initialPullable = getPullablePieces(level.pieces, remainingIds, level);
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

// Geri alma yalnızca son başarılı oku geri getirmeli.
{
  const game = createGame(4);
  const before = game.pieces.length;
  const target = pullablePieces(game)[0];
  pullAndCommit(game, target.id);
  assert.equal(game.history.length, 1, "Başarılı hamle geçmişe eklenmeli");
  assert.equal(undoPull(game).id, target.id, "Geri alma son oku döndürmeli");
  assert.equal(game.pieces.length, before, "Geri alma ok sayısını eski hâline getirmeli");
  assert.equal(game.history.length, 0, "Geri alma geçmişten hamleyi düşürmeli");
}

// Zen modunda engelli seçim hata olarak sayılır ama can götürmez.
{
  const game = createGame(2, { zen: true });
  const remaining = new Set(game.pieces.map((piece) => piece.id));
  const blocked = game.pieces.find((piece) => !isPullable(piece, remaining));
  if (blocked) {
    attemptPull(game, blocked.id);
    assert.equal(game.lives, START_LIVES, "Zen modunda can azalmamalı");
    assert.equal(game.errors, 1, "Zen modunda yanlış seçim hata sayacına eklenmeli");
    assert.equal(game.status, "playing", "Zen modunda bölüm başarısız olmamalı");
  }
}

// İpucu gerçekten mevcut durumdaki güvenli bir oku önermeli.
{
  const game = createGame(3);
  const hint = useHint(game);
  assert.ok(hint, "İpucu güvenli bir ok bulmalı");
  assert.ok(pullablePieces(game).some((piece) => piece.id === hint.id), "İpucu seçilebilir oku göstermeli");
  assert.equal(game.hints, 1, "İpucu kullanımı sayılmalı");
}

// Yeniden başlatma bütün geçici state'i temizlemeli.
{
  const game = createGame(5);
  pullAndCommit(game, pullablePieces(game)[0].id);
  useHint(game);
  restartGame(game);
  assert.equal(game.pieces.length, game.level.pieces.length, "Restart bütün okları geri getirmeli");
  assert.equal(game.history.length, 0, "Restart hamle geçmişini temizlemeli");
  assert.equal(game.hints, 0, "Restart ipucu sayısını temizlemeli");
  assert.equal(game.lives, START_LIVES, "Restart canları yenilemeli");
}

assert.equal(stateHash(new Set([4, 1, 3])), "1,3,4", "State hash sıralamadan bağımsız ve deterministik olmalı");
for (const level of LEVELS) {
  const solved = solveLevel(level);
  assert.equal(solved.solvable, true, `Solver bölüm ${level.id} için çözüm bulmalı`);
  assert.equal(solved.solution.length, level.pieces.length, `Bölüm ${level.id} çözümü bütün okları içermeli`);
}

// Kademeler kesintisiz 1..TOTAL_LEVELS araligini kaplamali - bosluk/ortusme olmamali.
assert.equal(TIERS[0].first, 1, "İlk kademe 1. bölümden başlamalı");
assert.equal(TIERS[TIERS.length - 1].last, TOTAL_LEVELS, "Son kademe son bölümde bitmeli");
TIERS.forEach((tier, index) => {
  assert.ok(tier.last >= tier.first, `${tier.name} kademesinin aralığı geçerli olmalı`);
  if (index > 0) {
    assert.equal(tier.first, TIERS[index - 1].last + 1, `${tier.name} kademesi bir öncekiyle bitişik olmalı`);
  }
});

// Her bolum tam olarak bir kademeye dusmeli ve o kademenin adini tasimali.
for (let id = 1; id <= TOTAL_LEVELS; id += 1) {
  const tier = TIERS[chapterOf(id) - 1];
  assert.ok(id >= tier.first && id <= tier.last, `Bölüm ${id} kendi kademesinin aralığında olmalı`);
  assert.equal(difficultyLabel(id), tier.name, `Bölüm ${id} zorluk etiketi kademe adıyla eşleşmeli`);
  assert.deepEqual(chapterRange(chapterOf(id)), { first: tier.first, last: tier.last },
    `Bölüm ${id} kademe aralığı tutarlı olmalı`);
}

// Zorluk kolaydan zora ilerlemeli: kademe ortalama karmasikligi genel olarak azalmamali.
const chapterAverages = [];
for (let chapter = 1; chapter <= TIERS.length; chapter += 1) {
  const values = complexities.get(chapter) || [];
  assert.ok(values.length > 0, `${TIERS[chapter - 1].name} kademesi bölüm içermeli`);
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

/* ============================= STATE MAKINESI ============================= */

// Dogru oka basinca parca kalkmali, tahta durumu guncellenmeli.
{
  const game = createGame(1);
  const pullable = pullablePieces(game)[0];
  const before = game.pieces.length;
  const outcome = pullAndCommit(game, pullable.id);
  assert.equal(outcome.result, PULL_OK, "Çekilebilir yol kaldırılmalı");
  assert.equal(game.pieces.length, before - 1, "Kaldırılan yol state'ten düşmeli");
  assert.equal(game.lives, START_LIVES, "Doğru hamlede can gitmemeli");
}

// Engelli oka basinca can eksilmeli, parca tahtada kalmali.
{
  const game = createGame(1);
  const blocked = game.pieces.find((piece) => !isPullable(piece, new Set(game.pieces.map((p) => p.id))));
  if (blocked) {
    const before = game.pieces.length;
    const outcome = attemptPull(game, blocked.id);
    assert.equal(outcome.result, PULL_BLOCKED, "Engelli yol çekilememeli");
    assert.equal(game.lives, START_LIVES - 1, "Yanlış hamlede can eksilmeli");
    assert.equal(game.pieces.length, before, "Engelli yol tahtada kalmalı");
  }
}

// 3 yanlis hamlede bolum basarisiz olmali ve sonraki dokunuslar yok sayilmali.
{
  const game = createGame(2);
  const remaining = new Set(game.pieces.map((piece) => piece.id));
  const blocked = game.pieces.find((piece) => !isPullable(piece, remaining));
  if (blocked) {
    for (let i = 0; i < START_LIVES; i += 1) attemptPull(game, blocked.id);
    assert.equal(game.status, "lost", `${START_LIVES} yanlış hamlede bölüm başarısız olmalı`);
    assert.equal(attemptPull(game, blocked.id).result, PULL_IGNORED, "Kaybedilen bölümde hamle işlenmemeli");
  }
}

// Tum oklar kalkinca bolum kazanilmali.
{
  const game = createGame(1);
  let guard = 0;
  while (game.pieces.length > 0 && guard < 100) {
    guard += 1;
    pullAndCommit(game, pullablePieces(game)[0].id);
  }
  assert.equal(game.status, "won", "Tüm yollar kalkınca bölüm kazanılmalı");
  assert.equal(attemptPull(game, 0).result, PULL_IGNORED, "Kazanılan bölümde hamle işlenmemeli");
}

// Ayni parcaya cok hizli iki kez dokunmak state'i bozmamali ve can goturmemeli.
// (Parca ilk dokunusta state'ten aninda dustugu icin ikincisi yok sayilir.)
{
  const game = createGame(1);
  const target = pullablePieces(game)[0];
  const before = game.pieces.length;
  attemptPull(game, target.id);
  assert.equal(game.status, "animating", "Güvenli seçim kuyruk çıkana kadar animating durumunda kalmalı");
  assert.equal(game.pieces.length, before, "Ok animasyon tamamlanmadan state'ten kaldırılmamalı");
  assert.equal(game.history.length, 0, "Hamle animasyon tamamlanmadan geçmişe yazılmamalı");
  const second = attemptPull(game, target.id);
  commitPull(game, target.id);
  assert.equal(second.result, PULL_IGNORED, "Çekilmiş yola tekrar dokunmak yok sayılmalı");
  assert.equal(game.lives, START_LIVES, "Hızlı çift dokunuş can götürmemeli");
  assert.equal(game.pieces.length, before - 1, "Hızlı çift dokunuş yalnızca bir yol kaldırmalı");
}

// Basarisizlik sonrasi ayni bolum sifirdan baslamali (main.js: startLevel(game.levelId)).
{
  const game = createGame(5);
  pullAndCommit(game, pullablePieces(game)[0].id);
  const fresh = createGame(5);
  assert.equal(fresh.pieces.length, fresh.level.pieces.length, "Yeniden başlatma tüm yolları geri getirmeli");
  assert.equal(fresh.lives, START_LIVES, "Yeniden başlatma canları sıfırlamalı");
  assert.equal(fresh.status, "playing", "Yeniden başlatma durumu oynanabilir yapmalı");
}

// Seviye verisi (LEVELS) oynanirken mutasyona ugramamali.
{
  const original = getLevel(3).pieces.length;
  const game = createGame(3);
  while (game.pieces.length > 0) pullAndCommit(game, pullablePieces(game)[0].id);
  assert.equal(getLevel(3).pieces.length, original, "Oynamak seviye verisini bozmamalı");
}

// Sinir disi bolum kimlikleri guvenli araliga kirpilmali.
assert.equal(createGame(0).levelId, 1, "Sıfır bölüm ilk bölüme kırpılmalı");
assert.equal(createGame(9999).levelId, TOTAL_LEVELS, "Sınır dışı bölüm son bölüme kırpılmalı");

/* ============================= DEPOLAMA ============================= */

// Depolama: aktif bolum, acilan en yuksek bolum, tamamlananlar.
let storedValue = "{bozuk";
globalThis.localStorage = {
  getItem(key) { return key === STORAGE_KEY ? storedValue : null; },
  setItem(key, value) { storedValue = value; }
};
assert.equal(loadProgress().currentLevel, 1, "Bozuk kayıt güvenli varsayılana dönmeli");

storedValue = null;
const fresh = loadProgress();
assert.equal(fresh.currentLevel, 1, "Kayıt yokken ilk bölümden başlanmalı");
assert.equal(fresh.lastUnlocked, TOTAL_LEVELS, "Kayıt yokken bütün bölümler açık olmalı");
assert.deepEqual(fresh.completed, {}, "Kayıt yokken tamamlanan bölüm olmamalı");

assert.equal(saveProgress({ currentLevel: 7, lastUnlocked: 8, completed: { 6: true } }), true, "Kayıt yazılabilmeli");
assert.equal(loadProgress().currentLevel, 7, "Aktif bölüm okunabilmeli");
assert.equal(loadProgress().lastUnlocked, TOTAL_LEVELS, "Eski kayıt yüklenirken bütün bölümler açılmalı");
assert.equal(isCompleted(loadProgress(), 6), true, "Tamamlanan bölüm korunmalı");
assert.equal(isCompleted(loadProgress(), 7), false, "Tamamlanmayan bölüm işaretli olmamalı");

// Serbest erisim: tum gecerli bolumler ilk andan itibaren oynanabilir.
const p = loadProgress();
assert.equal(isUnlocked(p, 8), true, "Açılan bölüm oynanabilmeli");
assert.equal(isUnlocked(p, 9), true, "İlerideki bölüm de açık olmalı");
assert.equal(isUnlocked(p, 1), true, "İlk bölüm her zaman açık olmalı");

// Bolum tamamlaninca sonraki acilir (main.js: finishLevel).
updateProgress((store) => {
  store.completed[8] = true;
  store.lastUnlocked = Math.max(store.lastUnlocked, 9);
  store.currentLevel = 9;
});
assert.equal(loadProgress().lastUnlocked, TOTAL_LEVELS, "Bütün bölüm erişimi korunmalı");
assert.equal(isUnlocked(loadProgress(), 9), true, "Yeni açılan bölüm oynanabilmeli");

saveProgress({ currentLevel: 9999, lastUnlocked: 9999, completed: {} });
assert.equal(loadProgress().lastUnlocked, TOTAL_LEVELS, "Sınır dışı kayıt son bölüme kırpılmalı");
saveProgress({ currentLevel: -5, lastUnlocked: 0, completed: {} });
assert.equal(loadProgress().currentLevel, 1, "Sıfır altı kayıt ilk bölüme kırpılmalı");
saveProgress({ currentLevel: 1.5, lastUnlocked: 1, completed: {} });
assert.equal(loadProgress().currentLevel, 1, "Tam sayı olmayan kayıt ilk bölüme düşmeli");

saveProgress({ currentLevel: 20, lastUnlocked: 1, completed: {} });
assert.equal(loadProgress().currentLevel, 20, "Aktif bölüm eski kilit kaydından bağımsız korunmalı");

console.log(
  `Ok Bulmacası doğrulandı: ${LEVELS.length} bölüm, tamamı her sırayla çözülebilir, kopyasız. `
  + `Grup ortalama karmaşıklığı: ${chapterAverages.map((value) => value.toFixed(2)).join(" → ")}`
);
