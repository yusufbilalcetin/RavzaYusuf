import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  addOptions,
  createWheel,
  generateNumberRange,
  parseOptionText,
  resetResults,
  selectOption,
  setOptionStatus,
  undoLastSpin
} from "../js/model.js";
import { STORAGE_KEY, loadStore, saveStore } from "../js/storage.js";

function test(name, callback) {
  try {
    callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("satır, virgül ve noktalı virgül girişleri ayrıştırılır", () => {
  assert.deepEqual(parseOptionText("Ravza\nYusuf, Ahmet; Ayşe"), ["Ravza", "Yusuf", "Ahmet", "Ayşe"]);
});

test("1 ile 100 arasında tam liste oluşturulur", () => {
  const values = generateNumberRange(1, 100, 1);
  assert.equal(values.length, 100);
  assert.equal(values[0], "1");
  assert.equal(values.at(-1), "100");
});

test("yinelenen ve boşluk farkı olan seçenekler engellenir", () => {
  const wheel = createWheel("Test", ["Yusuf"]);
  const result = addOptions(wheel, [" Yusuf ", "yusuf", "Ravza"]);
  assert.equal(result.added.length, 1);
  assert.equal(result.duplicates.length, 2);
  assert.equal(wheel.allOptions.length, 2);
});

test("zorlanan 56 sonucu ikinci kez seçilemez", () => {
  const wheel = createWheel("1-100", generateNumberRange(1, 100));
  const first = selectOption(wheel, () => 55);
  assert.equal(first.option.label, "56");
  assert.equal(wheel.usedOptions.includes(first.option.id), true);
  assert.equal(wheel.availableOptions.includes(first.option.id), false);
  while (wheel.availableOptions.length) {
    const result = selectOption(wheel, () => 0);
    assert.notEqual(result.option.label, "56");
  }
});

test("100 dönüş sonunda her seçenek tam bir kez seçilir", () => {
  const wheel = createWheel("1-100", generateNumberRange(1, 100));
  const results = [];
  while (wheel.availableOptions.length) results.push(selectOption(wheel, () => wheel.availableOptions.length - 1).option.label);
  assert.equal(results.length, 100);
  assert.equal(new Set(results).size, 100);
  assert.equal(wheel.usedOptions.length, 100);
  assert.throws(() => selectOption(wheel, () => 0), /Bütün seçenekler/);
});

test("geri alma seçeneği yeniden aktif yapar", () => {
  const wheel = createWheel("Geri alma", ["A", "B", "C"]);
  const result = selectOption(wheel, () => 1);
  const undone = undoLastSpin(wheel);
  assert.equal(undone.value, result.option.label);
  assert.equal(wheel.availableOptions.includes(result.option.id), true);
  assert.equal(wheel.spinHistory.length, 0);
});

test("pasif seçenek seçime girmez ve yeniden etkinleştirilebilir", () => {
  const wheel = createWheel("Pasif", ["A", "B"]);
  const disabledId = wheel.availableOptions[0];
  setOptionStatus(wheel, disabledId, "disabled");
  assert.equal(selectOption(wheel, () => 0).option.label, "B");
  setOptionStatus(wheel, disabledId, "available");
  assert.equal(wheel.availableOptions.includes(disabledId), true);
});

test("sonuç sıfırlama seçenekleri korur", () => {
  const wheel = createWheel("Sıfırla", ["A", "B", "C"]);
  selectOption(wheel, () => 0);
  resetResults(wheel);
  assert.equal(wheel.allOptions.length, 3);
  assert.equal(wheel.availableOptions.length, 3);
  assert.equal(wheel.usedOptions.length, 0);
  assert.equal(wheel.spinHistory.length, 0);
});

test("500 seçenek performanslı biçimde tamamlanır", () => {
  const wheel = createWheel("1-500", generateNumberRange(1, 500));
  const start = performance.now();
  while (wheel.availableOptions.length) selectOption(wheel, (length) => length - 1);
  const elapsed = performance.now() - start;
  assert.equal(wheel.spinHistory.length, 500);
  assert.equal(new Set(wheel.spinHistory.map((entry) => entry.value)).size, 500);
  assert.ok(elapsed < 1000, `500 seçim ${elapsed.toFixed(1)} ms sürdü`);
});

test("kayıt yenilendiğinde kalan seçenekler korunur", () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const wheel = createWheel("Kayıt", generateNumberRange(1, 100));
  for (let index = 0; index < 13; index += 1) selectOption(wheel, () => 0);
  const store = { version: 1, wheels: [wheel], activeWheelId: wheel.id, updatedAt: "" };
  assert.equal(saveStore(store, storage), true);
  assert.ok(memory.has(STORAGE_KEY));
  const restored = loadStore(storage);
  assert.equal(restored.wheels[0].availableOptions.length, 87);
  assert.equal(restored.wheels[0].spinHistory.length, 13);
});

test("bozuk kayıt güvenli varsayılan duruma döner", () => {
  const storage = { getItem: () => "{bozuk-json", setItem: () => {} };
  const restored = loadStore(storage);
  assert.equal(restored.wheels.length, 1);
  assert.ok(restored.wheels[0].allOptions.length > 0);
});

console.log("\nTüm çark mantığı testleri geçti.");
