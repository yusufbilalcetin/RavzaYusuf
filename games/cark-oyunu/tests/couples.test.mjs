import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { selectOption } from "../js/model.js";
import {
  allowedCodes,
  couplesWheelCatalogs,
  imagePathFor,
  isAllowedCode,
  validateCatalogs
} from "../js/couples-config.js";
import {
  buildCouplesWheel,
  defaultCouplesState,
  loadCouplesState,
  poolCounts,
  recordSpin,
  saveCouplesState,
  startNewRound,
  toggleCatalog,
  toggleFavorite
} from "../js/couples.js";
import {
  changePin,
  getPersistMode,
  hasPin,
  isUnlocked,
  loadPinRecord,
  lock,
  markUnlocked,
  resetCache,
  setPersistMode,
  verifyPin
} from "../js/pin.js";

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

const catalogById = (id) => couplesWheelCatalogs.find((catalog) => catalog.id === id);
const labels = (wheel) => wheel.availableOptions.map((id) => wheel.allOptions.find((option) => option.id === id).label);

// 1-4 · Config'in kendisi ————————————————————————————————————————————

await test("config doğrulaması temiz (adetler ve numaralar tutarlı)", () => {
  assert.deepEqual(validateCatalogs(), []);
});

await test("sistem 62 seçenekle açılır", () => {
  const wheel = buildCouplesWheel(defaultCouplesState());
  assert.equal(wheel.allOptions.length, 62);
  assert.equal(wheel.availableOptions.length, 62);
  assert.equal(poolCounts(wheel, defaultCouplesState()).remaining, 62);
});

await test("Katalog A tam 28 seçenek içerir", () => {
  assert.equal(catalogById("catalog-a").selectedNumbers.length, 28);
  assert.equal(allowedCodes().filter((code) => code.startsWith("A-")).length, 28);
});

await test("Katalog B tam 21 seçenek içerir", () => {
  assert.equal(catalogById("catalog-b").selectedNumbers.length, 21);
  assert.equal(allowedCodes().filter((code) => code.startsWith("B-")).length, 21);
});

await test("Katalog C tam 13 seçenek içerir", () => {
  assert.equal(catalogById("catalog-c").selectedNumbers.length, 13);
  assert.equal(allowedCodes().filter((code) => code.startsWith("C-")).length, 13);
});

// 5-6 · Kırmızı ile işaretlenmemiş numaralar —————————————————————————

await test("kırmızı ile işaretlenmemiş numara havuza eklenemez", () => {
  assert.equal(isAllowedCode("B-03"), false);  // B'de 3 işaretli değil
  assert.equal(isAllowedCode("C-01"), false);  // C'de 1 işaretli değil
  assert.equal(isAllowedCode("A-29"), false);  // A'da 29 yok
  assert.equal(isAllowedCode("B-52"), true);

  // Depoya elle sızdırılmış kodlar süzülür.
  const storage = memoryStorage();
  storage.setItem("ravza-couples-state-v1", JSON.stringify({
    used: ["B-03", "B-52"], favorites: ["C-01"], history: [{ code: "A-29" }, { code: "A-01" }], offCatalogs: ["sahte"]
  }));
  const state = loadCouplesState(storage);
  assert.deepEqual(state.used, ["B-52"]);
  assert.deepEqual(state.favorites, []);
  assert.deepEqual(state.history.map((entry) => entry.code), ["A-01"]);
  assert.deepEqual(state.offCatalogs, []);

  const wheel = buildCouplesWheel(state);
  assert.equal(wheel.allOptions.length, 62);
  assert.equal(wheel.allOptions.every((option) => isAllowedCode(option.label)), true);
  assert.throws(() => recordSpin(defaultCouplesState(), "B-03"), /İzin verilmeyen/);
  assert.throws(() => toggleFavorite(defaultCouplesState(), "C-01"), /İzin verilmeyen/);
});

await test("kırmızı ile işaretlenmemiş numara sonuç olarak gelemez", () => {
  const state = defaultCouplesState();
  const wheel = buildCouplesWheel(state);
  const results = [];
  for (let index = 0; index < 62; index += 1) results.push(selectOption(wheel).option.label);
  assert.equal(results.length, 62);
  assert.equal(results.every(isAllowedCode), true);
  assert.equal(new Set(results).size, 62);
  assert.throws(() => selectOption(wheel), /Bütün seçenekler seçildi/);
});

// 12-13 · Tekrarsız seçim ve tur ——————————————————————————————————————

await test("B-52 seçildikten sonra aynı turda tekrar gelmez", () => {
  const state = defaultCouplesState();
  const wheel = buildCouplesWheel(state);
  recordSpin(state, "B-52");
  const option = wheel.allOptions.find((item) => item.label === "B-52");
  const fresh = buildCouplesWheel(state); // depodan yeniden kurulunca da kullanılmış kalır
  assert.equal(option.status, "available");
  assert.equal(fresh.allOptions.find((item) => item.label === "B-52").status, "used");
  assert.equal(labels(fresh).includes("B-52"), false);
  assert.equal(fresh.availableOptions.length, 61);
  assert.equal(poolCounts(fresh, state).remaining, 61);
  assert.equal(poolCounts(fresh, state).total, 62);

  const drawn = [];
  for (let index = 0; index < 61; index += 1) drawn.push(selectOption(fresh).option.label);
  assert.equal(drawn.includes("B-52"), false);
});

await test("tur sıfırlanınca yalnızca izin verilen 62 seçenek geri gelir", () => {
  const state = defaultCouplesState();
  const wheel = buildCouplesWheel(state);
  for (let index = 0; index < 10; index += 1) recordSpin(state, selectOption(wheel).option.label);
  assert.equal(wheel.availableOptions.length, 52);

  startNewRound(wheel, state);
  assert.equal(wheel.availableOptions.length, 62);
  assert.deepEqual(state.used, []);
  assert.deepEqual([...labels(wheel)].sort(), [...allowedCodes()].sort());
  assert.equal(labels(wheel).every(isAllowedCode), true);
});

// 14 · Katalog filtreleri ————————————————————————————————————————————

await test("katalog kapatılınca doğru sayıda seçenek havuzdan çıkar", () => {
  const state = defaultCouplesState();
  const wheel = buildCouplesWheel(state);

  toggleCatalog(wheel, state, "catalog-b", false);
  assert.equal(wheel.availableOptions.length, 41); // 62 - 21
  assert.equal(labels(wheel).some((code) => code.startsWith("B-")), false);
  assert.equal(poolCounts(wheel, state).active, 41);

  toggleCatalog(wheel, state, "catalog-c", false);
  assert.equal(wheel.availableOptions.length, 28); // yalnızca A
  assert.equal(labels(wheel).every((code) => code.startsWith("A-")), true);

  toggleCatalog(wheel, state, "catalog-b", true);
  assert.equal(wheel.availableOptions.length, 49); // 28 + 21
  assert.equal(labels(wheel).filter((code) => code.startsWith("B-")).length, 21);
  assert.equal(labels(wheel).every(isAllowedCode), true);
});

await test("kapalı katalog, tur sıfırlansa bile havuza dönmez", () => {
  const state = defaultCouplesState();
  const wheel = buildCouplesWheel(state);
  toggleCatalog(wheel, state, "catalog-c", false);
  for (let index = 0; index < 5; index += 1) recordSpin(state, selectOption(wheel).option.label);

  startNewRound(wheel, state);
  assert.equal(wheel.availableOptions.length, 49);
  assert.equal(labels(wheel).some((code) => code.startsWith("C-")), false);
});

await test("kullanılmış seçenek, katalog kapanıp açılınca geri gelmez", () => {
  const state = defaultCouplesState();
  const wheel = buildCouplesWheel(state);
  recordSpin(state, "B-52");
  const rebuilt = buildCouplesWheel(state);
  toggleCatalog(rebuilt, state, "catalog-b", false);
  toggleCatalog(rebuilt, state, "catalog-b", true);
  assert.equal(labels(rebuilt).includes("B-52"), false);
  assert.equal(rebuilt.availableOptions.length, 61);
});

// 9-10 · Şifre (Firestore'da tutulur) ————————————————————————————————

// Firestore REST cevabını taklit eden fetch. Gerçek ağa çıkılmaz.
function fakeFirestore(pin) {
  const store = { doc: null };
  const seed = async () => {
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await webcrypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, key, 256);
    const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
    store.doc = {
      fields: {
        salt: { stringValue: hex(salt) },
        hash: { stringValue: hex(bits) },
        iterations: { integerValue: "150000" }
      }
    };
  };
  const fetcher = async (url, options) => {
    if (options?.method === "PATCH") {
      store.doc = JSON.parse(options.body);
      return { ok: true, json: async () => store.doc };
    }
    return { ok: true, json: async () => store.doc || {} };
  };
  return { seed, fetcher, store };
}

await test("şifre Firestore'dan okunur, düz metin saklanmaz", async () => {
  resetCache();
  const remote = fakeFirestore("0609");
  await remote.seed();

  assert.equal(hasPin(), false, "kayıt çekilmeden şifre bilinmez");
  await loadPinRecord(remote.fetcher);
  assert.equal(hasPin(), true);

  const saved = remote.store.doc.fields;
  assert.equal(saved.hash.stringValue.includes("0609"), false, "şifre düz metin saklanmamalı");
  assert.equal(saved.salt.stringValue.length, 32);
  assert.equal(saved.hash.stringValue.length, 64);
});

await test("yanlış şifre ile erişim sağlanamaz", async () => {
  resetCache();
  const remote = fakeFirestore("0609");
  await remote.seed();
  await loadPinRecord(remote.fetcher);

  assert.equal(await verifyPin("0000"), false);
  assert.equal(await verifyPin("0608"), false);
  assert.equal(await verifyPin(""), false);
});

await test("doğru şifre ile özel çark açılır", async () => {
  const storage = memoryStorage();
  const session = memoryStorage();
  resetCache();
  const remote = fakeFirestore("0609");
  await remote.seed();
  await loadPinRecord(remote.fetcher);

  assert.equal(await verifyPin("0609"), true);
  assert.equal(isUnlocked(storage, session), false);

  markUnlocked(storage, session);
  assert.equal(isUnlocked(storage, session), true);

  lock(storage, session);
  assert.equal(isUnlocked(storage, session), false, "manuel kilitleme oturumu kapatmalı");
});

await test("şifre değiştirmek mevcut şifreyi gerektirir ve Firestore'a yazar", async () => {
  resetCache();
  const remote = fakeFirestore("0609");
  await remote.seed();
  await loadPinRecord(remote.fetcher);

  await assert.rejects(() => changePin("0000", "1234", remote.fetcher), /Mevcut şifre hatalı/);
  await assert.rejects(() => changePin("0609", "12", remote.fetcher), /en az 4 karakter/);
  assert.equal(await verifyPin("0609"), true, "başarısız denemeler şifreyi bozmamalı");

  await changePin("0609", "1234", remote.fetcher);
  assert.equal(await verifyPin("0609"), false);
  assert.equal(await verifyPin("1234"), true);
  assert.equal(remote.store.doc.fields.hash.stringValue.includes("1234"), false, "yeni şifre de düz metin olmamalı");
});

// Kayıt ve görsel yolları —————————————————————————————————————————————

await test("durum kaydı yalnızca izin verilen kodları yazar", () => {
  const storage = memoryStorage();
  const state = defaultCouplesState();
  recordSpin(state, "A-01");
  toggleFavorite(state, "C-50");
  state.used.push("B-03");        // elle bozma denemesi
  state.favorites.push("A-29");
  saveCouplesState(state, storage);

  const saved = JSON.parse(storage.getItem("ravza-couples-state-v1"));
  assert.deepEqual(saved.used, ["A-01"]);
  assert.deepEqual(saved.favorites, ["C-50"]);
});

await test("görsel yolları kırpılmış WebP dosyalarını gösterir", () => {
  assert.equal(imagePathFor("A-01"), "../../assets/ciftler-carki/catalog-a/01.webp");
  assert.equal(imagePathFor("B-52"), "../../assets/ciftler-carki/catalog-b/52.webp");
  assert.equal(imagePathFor("C-19"), "../../assets/ciftler-carki/catalog-c/19.webp");
  assert.equal(imagePathFor("B-100"), "../../assets/ciftler-carki/catalog-b/100.webp");
  assert.equal(imagePathFor("B-03"), null);
});

console.log("\nTüm özel çark testleri geçti.");
