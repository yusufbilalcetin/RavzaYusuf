import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ANA_SAYFA_GORSELLERI } from "../../data/ana-sayfa-gorselleri.js";
import { HOME_HERO_STORAGE_KEY, rastgeleTemaSec } from "./ana-sayfa-rastgele-gorsel.js";

function test(name, callback) {
  callback();
  console.log(`✓ ${name}`);
}

function memoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue) values.set(HOME_HERO_STORAGE_KEY, initialValue);
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    value: () => values.get(HOME_HERO_STORAGE_KEY)
  };
}

test("boş havuz kontrollü biçimde null döndürür", () => {
  assert.equal(rastgeleTemaSec([]), null);
  assert.equal(rastgeleTemaSec(null), null);
});

test("tek temalı havuz her zaman aynı temayı kullanır", () => {
  const storage = memoryStorage();
  const selected = rastgeleTemaSec([ANA_SAYFA_GORSELLERI[0]], { storage, random: () => .9 });
  assert.equal(selected.id, ANA_SAYFA_GORSELLERI[0].id);
  assert.deepEqual(JSON.parse(storage.value()), []);
});

test("bir tur içinde her görsel yalnızca bir kez gösterilir", () => {
  const storage = memoryStorage();
  const seenIds = new Set();
  for (let i = 0; i < ANA_SAYFA_GORSELLERI.length; i++) {
    const selected = rastgeleTemaSec(ANA_SAYFA_GORSELLERI, { storage, random: Math.random });
    assert.equal(seenIds.has(selected.id), false);
    seenIds.add(selected.id);
  }
  assert.equal(seenIds.size, ANA_SAYFA_GORSELLERI.length);
});

test("tur bitince yeni bir rastgele turla devam eder", () => {
  const storage = memoryStorage();
  for (let i = 0; i < ANA_SAYFA_GORSELLERI.length; i++) {
    rastgeleTemaSec(ANA_SAYFA_GORSELLERI, { storage, random: Math.random });
  }
  assert.deepEqual(JSON.parse(storage.value()), []);

  const nextTheme = rastgeleTemaSec(ANA_SAYFA_GORSELLERI, { storage, random: Math.random });
  assert.ok(ANA_SAYFA_GORSELLERI.some((theme) => theme.id === nextTheme.id));
  assert.equal(JSON.parse(storage.value()).length, ANA_SAYFA_GORSELLERI.length - 1);
});

test("localStorage engellendiğinde seçim çalışmaya devam eder", () => {
  const blockedStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); }
  };
  assert.ok(rastgeleTemaSec(ANA_SAYFA_GORSELLERI, { storage: blockedStorage, random: () => 0 }));
});

test("tema çiftlerinde responsive WebP ve var olan fallback dosyaları bulunur", () => {
  ANA_SAYFA_GORSELLERI.forEach((theme) => {
    for (const variantName of ["desktop", "mobile"]) {
      const variant = theme[variantName];
      assert.match(variant.fallback, new RegExp(`${theme.id}-${variantName}-\\d+-[0-9a-f]{8}\\.webp$`));
      assert.match(variant.webpSrcSet, /\.webp \d+w/);
      assert.doesNotMatch(variant.webpSrcSet, /\.png/);
      assert.equal(existsSync(fileURLToPath(new URL(`../../${variant.fallback.replace("./", "")}`, import.meta.url))), true);
    }
    assert.match(theme.placeholder, new RegExp(`${theme.id}-placeholder-[0-9a-f]{8}\\.webp$`));
  });
});

console.log("\nAna sayfa rastgele hero testleri geçti.");
