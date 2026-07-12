import assert from "node:assert/strict";
import { selectOption } from "../js/model.js";
import {
  TOTAL_OPTIONS,
  allowedCodes,
  imageDocumentPathFor,
  isAllowedCode
} from "../js/couples-config.js";
import {
  buildCouplesWheel,
  defaultCouplesState,
  loadCouplesState,
  poolCounts,
  recordSpin,
  saveCouplesState,
  startNewRound,
  toggleFavorite
} from "../js/couples.js";

function test(name, callback) {
  try {
    const result = callback();
    if (result instanceof Promise) {
      return result.then(() => console.log(`✓ ${name}`), (error) => { console.error(`✗ ${name}`); throw error; });
    }
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
  return Promise.resolve();
}

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear()
  };
};

const labels = (wheel) => wheel.availableOptions.map((id) => wheel.allOptions.find((option) => option.id === id).label);

// 1-2 · Config'in kendisi ————————————————————————————————————————————

await test("sistem 28 seçenekle açılır", () => {
  const wheel = buildCouplesWheel(defaultCouplesState());
  assert.equal(TOTAL_OPTIONS, 28);
  assert.equal(wheel.allOptions.length, 28);
  assert.equal(wheel.availableOptions.length, 28);
  assert.equal(poolCounts(wheel).remaining, 28);
});

await test("kodlar 01'den 28'e sırayla ve tekrarsız üretilir", () => {
  const codes = allowedCodes();
  assert.equal(codes.length, 28);
  assert.equal(new Set(codes).size, 28);
  assert.equal(codes[0], "01");
  assert.equal(codes[13], "14");
  assert.equal(codes.at(-1), "28");
});

// 3-4 · Tanımsız numaralar —————————————————————————————————————————

await test("tanımsız numara havuza eklenemez", () => {
  assert.equal(isAllowedCode("14"), true);
  assert.equal(isAllowedCode("29"), false);   // 28'den sonrası yok
  assert.equal(isAllowedCode("00"), false);
  assert.equal(isAllowedCode("A-01"), false); // eski katalog kodları artık geçersiz
  assert.equal(isAllowedCode("B-52"), false);

  // Depodaki eski/sızdırılmış kodlar süzülür — eski durum kendiliğinden sıfırlanır.
  const storage = memoryStorage();
  storage.setItem("ravza-couples-state-v1", JSON.stringify({
    used: ["B-52", "07"], favorites: ["C-01"], history: [{ code: "A-29" }, { code: "01" }], offCatalogs: ["sahte"]
  }));
  const state = loadCouplesState(storage);
  assert.deepEqual(state.used, ["07"]);
  assert.deepEqual(state.favorites, []);
  assert.deepEqual(state.history.map((entry) => entry.code), ["01"]);

  const wheel = buildCouplesWheel(state);
  assert.equal(wheel.allOptions.length, 28);
  assert.equal(wheel.allOptions.every((option) => isAllowedCode(option.label)), true);
  assert.throws(() => recordSpin(defaultCouplesState(), "B-52"), /İzin verilmeyen/);
  assert.throws(() => toggleFavorite(defaultCouplesState(), "29"), /İzin verilmeyen/);
});

await test("tanımsız numara sonuç olarak gelemez", () => {
  const wheel = buildCouplesWheel(defaultCouplesState());
  const results = [];
  for (let index = 0; index < 28; index += 1) results.push(selectOption(wheel).option.label);
  assert.equal(results.every(isAllowedCode), true);
  assert.equal(new Set(results).size, 28);
  assert.throws(() => selectOption(wheel), /Bütün seçenekler seçildi/);
});

// 5-6 · Tekrarsız seçim ve tur ——————————————————————————————————————

await test("14 seçildikten sonra aynı turda tekrar gelmez", () => {
  const state = defaultCouplesState();
  const wheel = buildCouplesWheel(state);
  recordSpin(state, "14");
  const option = wheel.allOptions.find((item) => item.label === "14");
  const fresh = buildCouplesWheel(state); // depodan yeniden kurulunca da kullanılmış kalır
  assert.equal(option.status, "available");
  assert.equal(fresh.allOptions.find((item) => item.label === "14").status, "used");
  assert.equal(labels(fresh).includes("14"), false);
  assert.equal(fresh.availableOptions.length, 27);
  assert.equal(poolCounts(fresh).remaining, 27);
  assert.equal(poolCounts(fresh).total, 28);

  const drawn = [];
  for (let index = 0; index < 27; index += 1) drawn.push(selectOption(fresh).option.label);
  assert.equal(drawn.includes("14"), false);
});

await test("tur sıfırlanınca 28 seçeneğin tamamı geri gelir", () => {
  const state = defaultCouplesState();
  const wheel = buildCouplesWheel(state);
  for (let index = 0; index < 10; index += 1) recordSpin(state, selectOption(wheel).option.label);
  assert.equal(wheel.availableOptions.length, 18);

  startNewRound(wheel, state);
  assert.equal(wheel.availableOptions.length, 28);
  assert.deepEqual(state.used, []);
  assert.deepEqual([...labels(wheel)].sort(), [...allowedCodes()].sort());
});

// Kayıt ve görsel yolları —————————————————————————————————————————————

await test("durum kaydı yalnızca izin verilen kodları yazar", () => {
  const storage = memoryStorage();
  const state = defaultCouplesState();
  recordSpin(state, "01");
  toggleFavorite(state, "22");
  state.used.push("B-03");        // elle bozma denemesi
  state.favorites.push("29");
  saveCouplesState(state, storage);

  const saved = JSON.parse(storage.getItem("ravza-couples-state-v1"));
  assert.deepEqual(saved.used, ["01"]);
  assert.deepEqual(saved.favorites, ["22"]);
});

await test("görsel belge yolları yalnızca 01-28 Firestore allowlist'inden üretilir", () => {
  assert.equal(imageDocumentPathFor("01"), "couplesWheelImages/01");
  assert.equal(imageDocumentPathFor("14"), "couplesWheelImages/14");
  assert.equal(imageDocumentPathFor("28"), "couplesWheelImages/28");
  assert.equal(imageDocumentPathFor("29"), null);
  assert.equal(imageDocumentPathFor("A-01"), null);
});

console.log("\nTüm özel çark testleri geçti.");
