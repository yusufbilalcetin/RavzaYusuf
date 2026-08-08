#!/usr/bin/env node
/**
 * Sistem overlay koordinatoru regresyon testi.
 *
 * Dogrulanan sey GORUNUM degil SOZLESME: ayni anda tek birincil overlay acik
 * kalir, degistirme sirasinda odak yeni panelde kalir, govde scroll kilidi tek
 * yerden yonetilir ve panel kendi kendine kapaninca (Escape / kapat dugmesi)
 * koordinatorun kaydi bayat kalmaz.
 *
 * Uc ayri overlay mekanizmasi var ve UCU DE kapsanir:
 *   - sinif tabanli panel   -> tema paneli
 *   - launcher katmani      -> launcher aramasi
 *   - native <dialog>       -> okuyucu sayfalari (ayri sayfada)
 *
 * Kullanim: node ./scripts/test-overlay-manager.mjs
 */
import assert from "node:assert/strict";
import { ThemeTestBrowser, ensureTestServer, delay, assertCleanDiagnostics } from "./lib/theme-test-runtime.mjs";

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

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("overlay-manager");

/** Koordinatoru sayfa baglaminda kullanilabilir yapar. */
const MANAGER = `(await import('/js/core/overlay-manager.js'))`;

async function gotoLauncher() {
  await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
  await delay(500);
}

/** Acik olan birincil overlay'lerin DOM'dan okunan gercek listesi. */
const OPEN_OVERLAYS = `(() => {
  const open = [];
  if (document.getElementById('theme-sheet')?.classList.contains('open')) open.push('theme-panel');
  for (const [id, layer] of [
    ['launcher-search', 'launcherSearchLayer'],
    ['launcher-folder', 'launcherFolderLayer'],
    ['launcher-editor', 'launcherEditorLayer'],
  ]) {
    const node = document.getElementById(layer);
    if (node && !node.hidden) open.push(id);
  }
  for (const id of ['rdr-contents-sheet', 'rdr-search-sheet', 'rdr-settings-sheet']) {
    if (document.getElementById(id)?.open) { open.push('reader-sheet'); break; }
  }
  return open;
})()`;

try {
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await runCase("koordinator kayitli overlay'leri tanir", async () => {
    await gotoLauncher();
    const known = await browser.evaluate(`(async () => {
      const m = ${MANAGER};
      return ['theme-panel', 'launcher-search', 'launcher-folder', 'launcher-editor', 'reader-sheet']
        .filter(id => m.isOverlayRegistered(id));
    })()`);
    assert.deepEqual(
      known.sort(),
      ["launcher-editor", "launcher-folder", "launcher-search", "reader-sheet", "theme-panel"],
      `eksik kayit: ${known.join(", ")}`,
    );
  });

  await runCase("hicbir sey acik degilken aktif overlay yok", async () => {
    const active = await browser.evaluate(`(async () => ${MANAGER}.getActiveOverlay())()`);
    assert.equal(active, null, `beklenmeyen aktif overlay: ${active}`);
    const locked = await browser.evaluate("document.body.classList.contains('system-overlay-open')");
    assert.equal(locked, false, "hiçbir overlay yokken scroll kilidi açık kalmış");
  });

  await runCase("tema paneli acilinca aktif overlay olur ve scroll kilitlenir", async () => {
    await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
    await delay(500);
    const state = await browser.evaluate(`(async () => ({
      active: ${MANAGER}.getActiveOverlay(),
      open: ${OPEN_OVERLAYS},
      locked: document.body.classList.contains('system-overlay-open'),
    }))()`);
    assert.equal(state.active, "theme-panel", `aktif overlay yanlış: ${state.active}`);
    assert.deepEqual(state.open, ["theme-panel"], `açık overlay listesi: ${state.open.join(", ")}`);
    assert.equal(state.locked, true, "overlay açıkken gövde scroll kilidi yok");
  });

  await runCase("ikinci overlay acilinca BIRINCISI kapanir (tek aktif kural)", async () => {
    // Tema paneli hâlâ açık; launcher aramasını aç.
    await browser.evaluate("window.openLauncherSearch && window.openLauncherSearch()");
    await delay(600);
    const state = await browser.evaluate(`(async () => ({
      active: ${MANAGER}.getActiveOverlay(),
      open: ${OPEN_OVERLAYS},
      locked: document.body.classList.contains('system-overlay-open'),
    }))()`);
    assert.deepEqual(
      state.open,
      ["launcher-search"],
      `iki panel üst üste kaldı: ${state.open.join(", ")}`,
    );
    assert.equal(state.active, "launcher-search", `aktif overlay yanlış: ${state.active}`);
    assert.equal(state.locked, true, "scroll kilidi devrede kalmalı");
  });

  await runCase("degistirme sirasinda odak YENI panelde kalir", async () => {
    // Kapanan panel odağı kendi tetikleyicisine geri almamalı.
    const focus = await browser.evaluate(`(() => {
      const active = document.activeElement;
      return {
        id: active?.id || '',
        insideSearch: !!active?.closest('#launcherSearchLayer'),
        insideTheme: !!active?.closest('#theme-sheet'),
      };
    })()`);
    assert.equal(focus.insideTheme, false, "odak kapanan tema panelinde kalmış");
    assert.equal(focus.insideSearch, true, `odak yeni panelde değil (aktif: ${focus.id})`);
  });

  await runCase("Escape aktif overlay'i kapatir ve kilidi birakir", async () => {
    await browser.key("Escape");
    await delay(600);
    // ONEMLI: kilit, getActiveOverlay() CAGRILMADAN once okunur. Ayni ifade
    // icinde once koordinatore sormak, syncActive()'i tetikleyip iddiayi kendi
    // kendine dogru yapiyordu - kilit gercekte asili kalsa bile test geciyordu.
    const locked = await browser.evaluate("document.body.classList.contains('system-overlay-open')");
    const state = await browser.evaluate(`(async () => ({
      active: ${MANAGER}.getActiveOverlay(),
      open: ${OPEN_OVERLAYS},
      locked: ${JSON.stringify(false)} || false,
    }))()`);
    state.locked = locked;
    assert.deepEqual(state.open, [], `Escape sonrası açık kalan: ${state.open.join(", ")}`);
    assert.equal(state.active, null, "Escape sonrası aktif overlay kaydı bayat kaldı");
    assert.equal(state.locked, false, "Escape sonrası scroll kilidi kalkmadı");
  });

  await runCase("panel kendi kendine kapaninca kayit BAYAT kalmaz", async () => {
    // Koordinatore "kapandim" demeden kapatilir; kayit yine de temizlenmeli.
    await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
    await delay(400);
    assert.equal(
      await browser.evaluate(`(async () => ${MANAGER}.getActiveOverlay())()`),
      "theme-panel",
      "tema paneli aktif olmalıydı",
    );
    await browser.evaluate("window.closeThemeSheet && window.closeThemeSheet()");
    await delay(400);
    const lockedNow = await browser.evaluate("document.body.classList.contains('system-overlay-open')");
    const after = await browser.evaluate(`(async () => ({
      active: ${MANAGER}.getActiveOverlay(),
    }))()`);
    after.locked = lockedNow;
    assert.equal(after.active, null, "kendi kendine kapanan panel aktif görünmeye devam ediyor");
    assert.equal(after.locked, false, "scroll kilidi bayat kaldı");
  });

  await runCase("closeActiveOverlay aktif olani kapatir", async () => {
    await browser.evaluate("window.openLauncherSearch && window.openLauncherSearch()");
    await delay(500);
    const closed = await browser.evaluate(`(async () => ${MANAGER}.closeActiveOverlay())()`);
    await delay(500);
    assert.equal(closed, true, "closeActiveOverlay false döndü");
    assert.deepEqual(await browser.evaluate(OPEN_OVERLAYS), [], "panel kapanmadı");
  });

  await runCase("tekrarli ac/kapa birikim yapmaz", async () => {
    for (let i = 0; i < 5; i += 1) {
      await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
      await delay(220);
      await browser.key("Escape");
      await delay(220);
    }
    const lockedAfterCycles = await browser.evaluate("document.body.classList.contains('system-overlay-open')");
    const state = await browser.evaluate(`(async () => ({
      active: ${MANAGER}.getActiveOverlay(),
      open: ${OPEN_OVERLAYS},
      locked: false,
      // Tek backdrop kurali: her acilista yeni backdrop uretilmemeli.
      backdrops: document.querySelectorAll('#theme-sheet-backdrop').length,
      openBackdrops: [...document.querySelectorAll('#theme-sheet-backdrop')]
        .filter(node => node.classList.contains('open')).length,
      lockClasses: [...document.body.classList].filter(c => /overlay-open|sheet-open/.test(c)),
    }))()`);
    state.locked = lockedAfterCycles;
    assert.deepEqual(state.open, [], "tekrarlı açılıştan sonra panel açık kaldı");
    assert.equal(state.active, null, "aktif kayıt temizlenmedi");
    assert.equal(state.locked, false, "scroll kilidi birikti");
    assert.equal(state.backdrops, 1, `backdrop çoğaldı: ${state.backdrops}`);
    assert.equal(state.openBackdrops, 0, "açık backdrop kaldı");
    assert.deepEqual(state.lockClasses, [], `gövdede bayat kilit sınıfı: ${state.lockClasses.join(", ")}`);
  });

  await runCase("rota degisimi acik overlay'i temizler", async () => {
    await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
    await delay(400);
    await browser.evaluate(`(async () => ${MANAGER}.closeOverlaysForNavigation())()`);
    await delay(400);
    const state = await browser.evaluate(`(async () => ({
      active: ${MANAGER}.getActiveOverlay(),
      open: ${OPEN_OVERLAYS},
      locked: document.body.classList.contains('system-overlay-open'),
    }))()`);
    assert.deepEqual(state.open, [], "gezinme sonrası panel açık kaldı");
    assert.equal(state.active, null, "gezinme sonrası aktif kayıt kaldı");
    assert.equal(state.locked, false, "gezinme sonrası scroll kilidi kaldı");
  });

  /* --- Native <dialog> tarafi: okuyucu sayfalari --- */
  await runCase("okuyucu sayfasi acilinca tema paneli kapanir", async () => {
    await browser.navigate("/?page=ravza-books", "!!document.querySelector('#ravzabooks')");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
    await browser.evaluate(`document.querySelector('.library-book-card[data-book-id="perili-kosk"]').click()`);
    await browser.waitFor("document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'", "okuma", 90000);
    await delay(800);

    await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
    await delay(500);
    assert.equal(
      await browser.evaluate(`(async () => ${MANAGER}.getActiveOverlay())()`),
      "theme-panel",
      "tema paneli okuyucu üstünde açılmalıydı",
    );

    await browser.evaluate("document.getElementById('rdr-settings-open').click()");
    await delay(700);
    const state = await browser.evaluate(`(async () => ({
      active: ${MANAGER}.getActiveOverlay(),
      open: ${OPEN_OVERLAYS},
    }))()`);
    assert.deepEqual(
      state.open,
      ["reader-sheet"],
      `native dialog açılınca tema paneli kapanmalıydı: ${state.open.join(", ")}`,
    );
    assert.equal(state.active, "reader-sheet", `aktif overlay yanlış: ${state.active}`);
    await browser.key("Escape");
    await delay(400);
  });

  /* --- Mobil: VisualViewport ve merkezleme bozulmamali --- */
  await runCase("mobil viewport'ta panel gorunur alanda kalir", async () => {
    await browser.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await gotoLauncher();
    await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
    await delay(600);
    const box = await browser.evaluate(`(() => {
      const sheet = document.getElementById('theme-sheet');
      const rect = sheet.getBoundingClientRect();
      return {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        vh: window.innerHeight, vw: window.innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
      };
    })()`);
    assert.ok(box.bottom > 0 && box.top < box.vh, "panel görünür alanın dışında");
    assert.ok(box.left >= -1 && box.right <= box.vw + 1, "panel yatayda taşıyor");
    assert.ok(box.docScrollWidth <= box.vw + 1, `yatay kaydırma oluştu (${box.docScrollWidth})`);
    await browser.key("Escape");
    await delay(400);
  });

  await runCase("konsol temiz kalir", async () => {
    await assertCleanDiagnostics(browser, "overlay manager");
  });
} finally {
  await browser.close();
  await server.close();
}

const failed = cases.filter((entry) => !entry.ok);
console.log(`\nOverlay Manager: ${cases.length - failed.length}/${cases.length} gecti`);
if (failed.length) {
  console.error(`${failed.length} test BASARISIZ`);
  process.exitCode = 1;
} else {
  console.log("✓ Tek aktif overlay, odak devri, scroll kilidi ve temizlik dogrulandi");
}
