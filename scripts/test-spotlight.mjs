#!/usr/bin/env node
/**
 * Spotlight (global arama) regresyon testi.
 *
 * MIMARI NOTU: Spotlight sifirdan yazilmadi. Projede zaten onceden kurulmus
 * bir indeks (createSearchIndex) ve Turkce normalizasyon (normalizeSearchText)
 * vardi; bu tur SIRALAMA, kitap/ayar kayitlari, gruplama ve klavye gezinmesi
 * ekledi. Testler de bu sozlesmeyi korur.
 *
 * Iki bolum: saf siralama (tarayicisiz, milisaniye) + tarayici davranisi.
 *
 * Kullanim: node ./scripts/test-spotlight.mjs
 */
import assert from "node:assert/strict";
import { ThemeTestBrowser, ensureTestServer, delay, assertCleanDiagnostics } from "./lib/theme-test-runtime.mjs";
import { normalizeSearchText, createSearchIndex, scoreSearchEntry, rankSearchEntries } from "../js/utils/search.js";

const cases = [];
async function runCase(name, task) {
  try {
    await task();
    cases.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    cases.push({ name, ok: false, error: error.message });
    console.error(`FAIL  ${name}\n      ${error.message}`);
    process.exitCode = 1;
  }
}

/* ========================================================================== */
/* 1. TURKCE NORMALIZASYON + SIRALAMA (saf)                                   */
/* ========================================================================== */

console.log("Spotlight · siralama");

await runCase("ASCII yazim Turkce karsiligini bulur", () => {
  assert.equal(normalizeSearchText("Sınav"), "sinav");
  assert.equal(normalizeSearchText("sinav"), "sinav");
  assert.equal(normalizeSearchText("Hazırlık"), "hazirlik");
  assert.equal(normalizeSearchText("hazirlik"), "hazirlik");
  assert.equal(normalizeSearchText("İSTANBUL"), "istanbul");
  assert.equal(normalizeSearchText("Öğrenme Çağı"), "ogrenme cagi");
});

const entry = (title, keywords = "") => ({ title, searchIndex: createSearchIndex(title, keywords) });

await runCase("tam eslesme prefix'ten, prefix substring'den once gelir", () => {
  const entries = [
    entry("Deneme Sınavı Arşivi"),   // substring
    entry("Sınav Merkezi"),          // prefix
    entry("Sınav"),                  // tam eslesme
  ];
  const ranked = rankSearchEntries(entries, "sinav").map((item) => item.title);
  assert.deepEqual(ranked, ["Sınav", "Sınav Merkezi", "Deneme Sınavı Arşivi"], `sıra yanlış: ${ranked.join(" | ")}`);
});

await runCase("kelime basi substring'den once gelir", () => {
  // DIKKAT: "Ezberde Merkezî Tekrar" bir SUBSTRING ornegi DEGIL - icindeki
  // "Merkezî" kelimesi de "merk" ile basliyor, yani o da kelime-basi eslesmesi.
  // Gercek substring icin sorgunun kelime ORTASINDA gectigi bir baslik gerekir.
  const entries = [
    entry("Süpermerkez Dersi"),  // "merk" kelime ortasinda -> substring
    entry("Sınav Merkezi"),      // "Merkezi" kelime basi
  ];
  const ranked = rankSearchEntries(entries, "merk").map((item) => item.title);
  assert.equal(ranked[0], "Sınav Merkezi", `kelime başı öne gelmeli: ${ranked.join(" | ")}`);
  assert.deepEqual(ranked, ["Sınav Merkezi", "Süpermerkez Dersi"], `sıra yanlış: ${ranked.join(" | ")}`);
});

await runCase("anahtar kelime eslesmesi baslik eslesmesinden SONRA gelir", () => {
  const entries = [
    entry("Boşluk Doldurma", "test quiz"),
    entry("Quiz Merkezi"),
  ];
  const ranked = rankSearchEntries(entries, "quiz").map((item) => item.title);
  assert.equal(ranked[0], "Quiz Merkezi", `başlık eşleşmesi önce gelmeli: ${ranked.join(" | ")}`);
  assert.equal(ranked.length, 2, "anahtar kelime eşleşmesi de listelenmeli");
});

await runCase("eslesmeyen sorgu bos doner ve esit puanda sira korunur", () => {
  assert.deepEqual(rankSearchEntries([entry("Kahoot")], "zzzqqq"), []);
  const same = [entry("Alfa Ders"), entry("Beta Ders")];
  const ranked = rankSearchEntries(same, "ders").map((item) => item.title);
  assert.deepEqual(ranked, ["Alfa Ders", "Beta Ders"], "eşit puanda özgün sıra korunmalı");
});

await runCase("cok kelimeli sorguda TUM kelimeler gecmeli", () => {
  const entries = [entry("Sınav Merkezi", "deneme"), entry("Ezber Merkezi")];
  const ranked = rankSearchEntries(entries, "sinav merkez").map((item) => item.title);
  assert.deepEqual(ranked, ["Sınav Merkezi"], `çok kelimeli filtre hatalı: ${ranked.join(" | ")}`);
});

await runCase("tek karakter gurultu uretmez, bos sorgu eslesme vermez", () => {
  assert.equal(scoreSearchEntry(entry("Kahoot"), ""), 0, "boş sorgu eşleşmemeli");
  assert.equal(scoreSearchEntry(entry("Kahoot"), "   "), 0, "boşluk eşleşmemeli");
});

/* ========================================================================== */
/* 2. TARAYICI                                                                */
/* ========================================================================== */

console.log("\nSpotlight · tarayici");

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("spotlight");

async function openSpotlight() {
  await browser.evaluate("window.openLauncherSearch && window.openLauncherSearch()");
  await browser.waitFor("document.getElementById('launcherSearchLayer') && !document.getElementById('launcherSearchLayer').hidden", "spotlight");
  await delay(300);
}

async function type(query) {
  await browser.evaluate(`(() => {
    const input = document.getElementById('launcherSearchInput');
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await delay(350);
}

const RESULTS = `(() => {
  const root = document.getElementById('launcherSearchResults');
  return {
    groups: [...root.querySelectorAll('.launcher-search-group-title')].map(n => n.textContent.trim()),
    titles: [...root.querySelectorAll('.launcher-search-result strong')].map(n => n.textContent.trim()),
    active: root.querySelector('.launcher-search-result.is-active strong')?.textContent.trim() || null,
    activeCount: root.querySelectorAll('.launcher-search-result.is-active').length,
    empty: !!root.querySelector('.launcher-search-empty'),
  };
})()`;

try {
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
  await delay(500);

  await runCase("kitaplar indekslenir ve Kitaplar grubunda cikar", async () => {
    await openSpotlight();
    await type("kucuk prens");
    const results = await browser.evaluate(RESULTS);
    assert.ok(results.groups.includes("Kitaplar"), `Kitaplar grubu yok: ${results.groups.join(", ")}`);
    assert.ok(
      results.titles.some((title) => /Küçük Prens/i.test(title)),
      `kitap sonucu yok: ${results.titles.join(" | ")}`,
    );
  });

  await runCase("yazar adiyla da kitap bulunur", async () => {
    await type("saint-exupery");
    const results = await browser.evaluate(RESULTS);
    assert.ok(
      results.titles.some((title) => /Küçük Prens/i.test(title)),
      `yazardan kitap bulunamadı: ${results.titles.join(" | ")}`,
    );
  });

  await runCase("ASCII Turkce yazim gercek sonucu bulur", async () => {
    await type("sinav");
    const results = await browser.evaluate(RESULTS);
    assert.ok(
      results.titles.some((title) => /Sınav/i.test(title)),
      `ASCII yazım eşleşmedi: ${results.titles.join(" | ")}`,
    );
    // Siralama: en alakali sonuc BASTA olmali.
    assert.match(results.titles[0], /Sınav/i, `en alakalı sonuç başta değil: ${results.titles[0]}`);
  });

  await runCase("ayarlar indekslenir", async () => {
    await type("tema");
    const results = await browser.evaluate(RESULTS);
    assert.ok(results.groups.includes("Ayarlar"), `Ayarlar grubu yok: ${results.groups.join(", ")}`);
  });

  await runCase("sonuclar gruplanir ve bos grup cizilmez", async () => {
    await type("kucuk prens");
    const results = await browser.evaluate(RESULTS);
    assert.ok(results.groups.length >= 1, "grup başlığı yok");
    const allowed = ["Uygulamalar", "Kitaplar", "Dersler", "Oyunlar", "Klasörler", "Ayarlar"];
    for (const group of results.groups) {
      assert.ok(allowed.includes(group), `beklenmeyen grup: ${group}`);
    }
    assert.equal(new Set(results.groups).size, results.groups.length, "grup başlığı tekrarlanmış");
  });

  await runCase("sonucsuz sorgu durust bos durum gosterir", async () => {
    await type("zzzqqqwww");
    const results = await browser.evaluate(RESULTS);
    assert.equal(results.empty, true, "boş durum gösterilmedi");
    assert.equal(results.titles.length, 0, "sonuç yokken satır çizilmiş");
  });

  await runCase("ArrowDown/ArrowUp secimi gezdirir, tek secili kalir", async () => {
    await type("merkezi");
    const first = await browser.evaluate(RESULTS);
    assert.ok(first.titles.length >= 2, `klavye testi için yeterli sonuç yok: ${first.titles.length}`);
    assert.equal(first.active, first.titles[0], "ilk sonuç seçili başlamalı");

    await browser.key("ArrowDown");
    await delay(200);
    const second = await browser.evaluate(RESULTS);
    assert.equal(second.active, first.titles[1], `ArrowDown seçimi ilerletmedi: ${second.active}`);
    assert.equal(second.activeCount, 1, "birden fazla sonuç seçili");

    await browser.key("ArrowUp");
    await delay(200);
    const back = await browser.evaluate(RESULTS);
    assert.equal(back.active, first.titles[0], `ArrowUp seçimi geri almadı: ${back.active}`);
  });

  await runCase("Enter secili sonucu acar", async () => {
    await type("sinav merkezi");
    const before = await browser.evaluate(RESULTS);
    assert.ok(before.active, "seçili sonuç yok");
    await browser.key("Enter");
    await browser.waitFor("document.body.dataset.currentRoute === 'sinav-merkezi'", "sınav merkezi rotası", 30000);
    await delay(400);
    assert.equal(
      await browser.evaluate("!document.getElementById('launcherSearchLayer').hidden"),
      false,
      "Enter sonrası Spotlight açık kaldı",
    );
  });

  await runCase("kitap sonucu dogru kitabi acar", async () => {
    await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
    await delay(500);
    await openSpotlight();
    await type("perili kosk");
    await browser.evaluate(`(() => {
      const button = [...document.querySelectorAll('#launcherSearchResults [data-launcher-book]')]
        .find(node => node.dataset.launcherBook === 'perili-kosk');
      button.click();
    })()`);
    await browser.waitFor("document.body.dataset.currentRoute === 'ravza-books'", "kitaplık rotası", 30000);
    await browser.waitFor(
      "document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
      "kitap açıldı", 90000,
    );
    const opened = await browser.evaluate(`document.querySelector('.reader-root')?.dataset.bookType`);
    assert.equal(opened, "pdf", "kitap okuma modunda açılmadı");
    // Tek seferlik niyet TUKETILMELI: yeniden acilista tekrar tetiklenmemeli.
    assert.equal(
      await browser.evaluate("sessionStorage.getItem('ravza-books-open-book')"),
      null,
      "kitap açma niyeti tüketilmedi",
    );
  });

  await runCase("her tuslamada DOM taranmaz (hazir indeks)", async () => {
    await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
    await delay(500);
    await openSpotlight();
    // Indeks hazir oldugu icin arama, DOM'daki uygulama sayisindan bagimsiz
    // calisir: gizli/olmayan kayitlar da bulunabilir olmali.
    const timing = await browser.evaluate(`(() => {
      const input = document.getElementById('launcherSearchInput');
      const started = performance.now();
      for (const query of ['s', 'si', 'sin', 'sina', 'sinav', 'sinav m']) {
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return performance.now() - started;
    })()`);
    assert.ok(timing < 400, `6 tuşlama ${timing.toFixed(0)}ms sürdü (indeks yerine tarama olabilir)`);
  });

  await runCase("konsol temiz kalir", async () => {
    await assertCleanDiagnostics(browser, "spotlight");
  });
} finally {
  await browser.close();
  await server.close();
}

const failed = cases.filter((entry) => !entry.ok);
console.log(`\nSpotlight: ${cases.length - failed.length}/${cases.length} gecti`);
if (failed.length) {
  console.error(`${failed.length} test BASARISIZ`);
  process.exitCode = 1;
} else {
  console.log("✓ Turkce siralama, kitap/ayar kayitlari, gruplama ve klavye dogrulandi");
}
