#!/usr/bin/env node
/**
 * Arka plan (wallpaper) galerisi ve mod davranisi.
 *
 * Iki bolum: saf durum mantigi (tarayicisiz) + tarayici davranisi.
 *
 * En kritik sozlesme: RASTGELE MOD gezinme/render basina DEGISMEZ. Bir oturum
 * icinde ayni gorsel kalir; yalnizca yeni oturumda degisir.
 *
 * Kullanim: node ./scripts/test-wallpaper.mjs
 */
import assert from "node:assert/strict";
import { ThemeTestBrowser, ensureTestServer, delay, assertCleanDiagnostics } from "./lib/theme-test-runtime.mjs";
import { pickDifferentId } from "../js/core/wallpaper.js";

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
/* 1. SAF SECIM MANTIGI                                                       */
/* ========================================================================== */

console.log("Arka plan · secim mantigi");

await runCase("tekrar etmemeye calisir ama tek aday varsa hata vermez", () => {
  const ids = ["a", "b", "c"];
  // random=0 -> ilk aday. "a" haric liste ["b","c"] oldugu icin "b" gelmeli.
  assert.equal(pickDifferentId(ids, "a", () => 0), "b");
  assert.equal(pickDifferentId(ids, "b", () => 0), "a");
  // Tek aday: ayni gorsel donse bile CALISIR, hata vermez (§12).
  assert.equal(pickDifferentId(["solo"], "solo", () => 0), "solo");
  assert.equal(pickDifferentId([], "x", () => 0), null);
});

await runCase("bozuk girdi cokertmez", () => {
  assert.equal(pickDifferentId(null, "a"), null);
  assert.equal(pickDifferentId(["a", null, 5, ""], "a", () => 0), "a");
  // random bozuk deger dondurse bile gecerli bir aday secilir.
  assert.ok(["a", "b"].includes(pickDifferentId(["a", "b"], null, () => NaN)));
});

/* ========================================================================== */
/* 2. TARAYICI                                                                */
/* ========================================================================== */

console.log("\nArka plan · tarayici");

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("wallpaper");

async function gotoHome() {
  await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
  await delay(500);
}

async function openPanel() {
  await browser.evaluate("window.openWallpaperPanel && window.openWallpaperPanel()");
  await browser.waitFor("document.getElementById('wallpaper-panel')?.open === true", "arka plan paneli");
  await delay(350);
}

const PANEL = `(() => {
  const node = document.getElementById('wallpaper-panel');
  if (!node) return null;
  const selected = [...node.querySelectorAll('[data-wp-select]')].filter(b => b.classList.contains('is-selected'));
  return {
    open: node.open === true,
    thumbs: node.querySelectorAll('[data-wp-select]').length,
    selectedIds: selected.map(b => b.dataset.wpSelect),
    pressed: [...node.querySelectorAll('[data-wp-select][aria-pressed="true"]')].map(b => b.dataset.wpSelect),
    mode: node.querySelector('[data-wp-mode].is-selected')?.dataset.wpMode || null,
    currentName: node.querySelector('#wp-current-name')?.textContent.trim(),
    names: [...node.querySelectorAll('.wp-thumb-name')].map(n => n.textContent.trim()),
    lazy: [...node.querySelectorAll('.wp-thumb-frame img')].every(img => img.loading === 'lazy'),
    buttons: [...node.querySelectorAll('[data-wp-select]')].every(b => b.tagName === 'BUTTON'),
  };
})()`;

const STAGE_THEME = `document.getElementById('anaSayfaHeroStage')?.dataset.homeHeroTheme || null`;
const STORE = `(() => ({
  mode: localStorage.getItem('ravzaYusufWallpaperMode'),
  fixed: localStorage.getItem('ravzaYusufWallpaperFixed'),
  session: sessionStorage.getItem('ravzaYusufWallpaperSession'),
}))()`;

try {
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await runCase("galeri TUM kayitli arka planlari gosterir", async () => {
    await gotoHome();
    await openPanel();
    const panel = await browser.evaluate(PANEL);
    const registrySize = await browser.evaluate(`(async () => (await import('/data/ana-sayfa-gorselleri.js')).ANA_SAYFA_GORSELLERI.length)()`);
    assert.equal(panel.thumbs, registrySize, `galeri ${panel.thumbs}/${registrySize} gorsel gosteriyor`);
    assert.equal(panel.buttons, true, "kucuk resimler gercek <button> olmali");
    assert.equal(panel.lazy, true, "kucuk resimler lazy yuklenmeli");
    // Ham teknik ID degil, insan okunur ad.
    assert.ok(panel.names.every((name) => name && !name.includes("-")), `ham ID gosteriliyor: ${panel.names.join(", ")}`);
  });

  await runCase("ayni anda YALNIZCA bir secili durum olur", async () => {
    const panel = await browser.evaluate(PANEL);
    assert.equal(panel.selectedIds.length, 1, `secili sayisi ${panel.selectedIds.length}`);
    assert.deepEqual(panel.pressed, panel.selectedIds, "aria-pressed gorsel secimle uyusmuyor");
  });

  await runCase("kucuk resme tiklamak arka plani ANINDA degistirir ve SABIT yapar", async () => {
    const target = await browser.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('[data-wp-select]')];
      const current = buttons.find(b => b.classList.contains('is-selected'))?.dataset.wpSelect;
      const other = buttons.find(b => b.dataset.wpSelect !== current);
      other.click();
      return other.dataset.wpSelect;
    })()`);
    await delay(700);
    const after = await browser.evaluate(PANEL);
    assert.deepEqual(after.selectedIds, [target], `secim uygulanmadi: ${after.selectedIds.join(",")}`);
    assert.equal(await browser.evaluate(STAGE_THEME), target, "launcher arka plani degismedi");
    const store = await browser.evaluate(STORE);
    assert.equal(store.mode, "fixed", `manuel secim sabit mod yapmali, gelen ${store.mode}`);
    assert.equal(store.fixed, target, "secim kalici kaydedilmedi");
  });

  await runCase("secim yenileme ve gezinme sonrasi korunur", async () => {
    const chosen = (await browser.evaluate(STORE)).fixed;
    await gotoHome();
    assert.equal(await browser.evaluate(STAGE_THEME), chosen, "yenilemeden sonra arka plan degisti");
    // Gezinme: baska rotaya git, geri don.
    await browser.evaluate("window.navigate && window.navigate('ravza-books')");
    await browser.waitFor("document.body.dataset.currentRoute === 'ravza-books'", "kitaplik", 30000);
    await browser.evaluate("window.navigate && window.navigate('ana-sayfa')");
    await browser.waitFor("document.body.dataset.currentRoute === 'ana-sayfa'", "ana sayfa", 30000);
    await delay(600);
    assert.equal(await browser.evaluate(STAGE_THEME), chosen, "gezinme arka plani degistirdi");
  });

  await runCase("RASTGELE mod: oturum boyunca SABIT kalir", async () => {
    await openPanel();
    await browser.evaluate(`document.querySelector('[data-wp-mode="random-session"]').click()`);
    await delay(700);
    const store = await browser.evaluate(STORE);
    assert.equal(store.mode, "random-session", "mod degismedi");
    assert.ok(store.session, "oturum gorseli secilmedi");
    const sessionId = store.session;

    // Ayni oturum: gezinme + yeniden render arka plani DEGISTIRMEMELI.
    await browser.evaluate("window.closeWallpaperPanel && window.closeWallpaperPanel()");
    for (const route of ["ravza-books", "ana-sayfa", "oyun", "ana-sayfa"]) {
      await browser.evaluate(`window.navigate && window.navigate('${route}')`);
      await browser.waitFor(`document.body.dataset.currentRoute === '${route}'`, route, 30000);
    }
    await delay(700);
    assert.equal(
      await browser.evaluate("sessionStorage.getItem('ravzaYusufWallpaperSession')"),
      sessionId,
      "gezinme oturum gorselini degistirdi",
    );
    assert.equal(await browser.evaluate(STAGE_THEME), sessionId, "gezinme arka plani degistirdi");

    // Ayni sekmede yenileme: yine ayni.
    await gotoHome();
    assert.equal(await browser.evaluate(STAGE_THEME), sessionId, "yenileme oturum gorselini degistirdi");
  });

  await runCase("Sabitle: rastgele gelen gorseli kalici yapar", async () => {
    await openPanel();
    const before = await browser.evaluate("sessionStorage.getItem('ravzaYusufWallpaperSession')");
    await browser.evaluate("document.querySelector('[data-wp-pin]').click()");
    await delay(600);
    const store = await browser.evaluate(STORE);
    assert.equal(store.mode, "fixed", "Sabitle modu sabit yapmali");
    assert.equal(store.fixed, before, "Sabitle gorseli kalici kaydetmeli");
    const panel = await browser.evaluate(PANEL);
    assert.deepEqual(panel.selectedIds, [before], "sabitlenen gorsel secili kalmali");
  });

  await runCase("Rastgele Degistir: farkli bir gorsel secer", async () => {
    const before = await browser.evaluate(STAGE_THEME);
    await browser.evaluate("document.querySelector('[data-wp-randomize]').click()");
    await delay(800);
    const after = await browser.evaluate(STAGE_THEME);
    assert.notEqual(after, before, "Rastgele Degistir ayni gorseli birakti");
    const panel = await browser.evaluate(PANEL);
    assert.deepEqual(panel.selectedIds, [after], "yeni gorsel secili gorunmeli");
  });

  await runCase("klavye ile secim calisir", async () => {
    const result = await browser.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('[data-wp-select]')];
      const current = buttons.find(b => b.classList.contains('is-selected'))?.dataset.wpSelect;
      const other = buttons.find(b => b.dataset.wpSelect !== current);
      other.focus();
      const focused = document.activeElement === other;
      other.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      other.click(); // Enter native olarak butonu calistirir
      return { focused, id: other.dataset.wpSelect };
    })()`);
    await delay(600);
    assert.equal(result.focused, true, "kucuk resim odaklanabilir degil");
    assert.equal(await browser.evaluate(STAGE_THEME), result.id, "klavye secimi uygulanmadi");
  });

  await runCase("Kontrol Merkezi acilinca Arka Plan paneli kapanir", async () => {
    await openPanel();
    await browser.evaluate("window.openControlCenter && window.openControlCenter()");
    await delay(500);
    const open = await browser.evaluate(`(() => ['wallpaper-panel', 'control-center']
      .filter(id => document.getElementById(id)?.open))()`);
    assert.deepEqual(open, ["control-center"], `tek panel beklenirken: ${open.join(", ")}`);
    // Ve tersi: Kontrol Merkezi'nden Arka Plan acilinca CC kapanir.
    await browser.evaluate(`document.querySelector('[data-cc-action="wallpaper"]').click()`);
    await delay(600);
    const open2 = await browser.evaluate(`(() => ['wallpaper-panel', 'control-center']
      .filter(id => document.getElementById(id)?.open))()`);
    assert.deepEqual(open2, ["wallpaper-panel"], `tek panel beklenirken: ${open2.join(", ")}`);
    await browser.key("Escape");
    await delay(300);
  });

  await runCase("bozuk depo cokertmez, guvenli varsayilana duser", async () => {
    await browser.evaluate(`(() => {
      localStorage.setItem('ravzaYusufWallpaperMode', '{bozuk');
      localStorage.setItem('ravzaYusufWallpaperFixed', 'olmayan-gorsel');
      sessionStorage.removeItem('ravzaYusufWallpaperSession');
    })()`);
    await gotoHome();
    const stage = await browser.evaluate(STAGE_THEME);
    assert.ok(stage, "bozuk depoda arka plan hic uygulanmadi");
    await openPanel();
    const panel = await browser.evaluate(PANEL);
    assert.equal(panel.open, true, "bozuk depoda panel acilmadi");
    assert.equal(panel.mode, "fixed", `bozuk mod guvenli varsayilana dusmeli, gelen ${panel.mode}`);
    await browser.key("Escape");
    await delay(300);
  });

  await runCase("eski kullanici migration'i: mod anahtari yoksa SABIT", async () => {
    // Bu surumden onceki kullanicilarda mod anahtari hic yok. Guncellemeden
    // sonra arka planlari birdenbire her ziyarette degismeye baslamamali.
    await browser.evaluate(`(() => {
      localStorage.removeItem('ravzaYusufWallpaperMode');
      localStorage.setItem('ravzaYusufWallpaperFixed', 'galata');
      sessionStorage.clear();
    })()`);
    await gotoHome();
    assert.equal(await browser.evaluate(STAGE_THEME), "galata", "eski secim korunmadi");
    await openPanel();
    assert.equal((await browser.evaluate(PANEL)).mode, "fixed", "migration sonrasi mod sabit olmali");
    await browser.key("Escape");
    await delay(300);
  });

  await runCase("konsol temiz kalir", async () => {
    await assertCleanDiagnostics(browser, "arka plan");
  });
} finally {
  await browser.close();
  await server.close();
}

const failed = cases.filter((entry) => !entry.ok);
console.log(`\nArka plan: ${cases.length - failed.length}/${cases.length} gecti`);
if (failed.length) {
  console.error(`${failed.length} test BASARISIZ`);
  process.exitCode = 1;
} else {
  console.log("✓ Galeri, secim, sabit/rastgele mod, Sabitle ve migration dogrulandi");
}
