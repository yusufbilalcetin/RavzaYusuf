#!/usr/bin/env node
/**
 * Kontrol Merkezi regresyon testi.
 *
 * Iki sey dogrulanir:
 *   1. SOZLESME - hangi kontrol hangi kanonik durumu degistirir ve iki yuzey
 *      (Kontrol Merkezi <-> Ayarlar/tema paneli) ayni durumu gosterir mi.
 *      Yalnizca localStorage degeri degil, GORUNEN arayuz de kontrol edilir.
 *   2. OVERLAY KURALI - koordinator uzerinden tek aktif panel, odak iadesi,
 *      scroll kilidi ve birikim olmamasi.
 *
 * Kullanim: node ./scripts/test-control-center.mjs
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
const browser = await ThemeTestBrowser.launch("control-center");

async function gotoLauncher() {
  await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
  await delay(500);
}

async function openCC() {
  await browser.evaluate(`(() => {
    const button = document.getElementById('control-center-open');
    button.focus();
    button.click();
  })()`);
  await browser.waitFor("document.getElementById('control-center')?.open === true", "kontrol merkezi");
  await delay(300);
}

const CC_STATE = `(() => {
  const node = document.getElementById('control-center');
  if (!node) return null;
  const selected = (attr) => node.querySelector('[data-' + attr + '].is-selected')?.dataset[
    attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] || null;
  return {
    open: node.open === true,
    mode: selected('cc-mode'),
    glass: selected('cc-glass'),
    motion: node.querySelector('#cc-motion')?.checked === true,
    pressedMode: node.querySelector('[data-cc-mode][aria-pressed="true"]')?.dataset.ccMode || null,
  };
})()`;

const OPEN_OVERLAYS = `(() => {
  const open = [];
  if (document.getElementById('control-center')?.open) open.push('control-center');
  if (document.getElementById('theme-sheet')?.classList.contains('open')) open.push('theme-panel');
  for (const [id, layer] of [['launcher-search', 'launcherSearchLayer'], ['launcher-folder', 'launcherFolderLayer']]) {
    const node = document.getElementById(layer);
    if (node && !node.hidden) open.push(id);
  }
  return open;
})()`;

try {
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await runCase("launcher seridinde Kontrol Merkezi girisi var ve 44px", async () => {
    await gotoLauncher();
    const button = await browser.evaluate(`(() => {
      const node = document.getElementById('control-center-open');
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        label: node.getAttribute('aria-label'),
        haspopup: node.getAttribute('aria-haspopup'),
        width: Math.round(rect.width), height: Math.round(rect.height),
        hasSvg: !!node.querySelector('svg'),
        text: node.textContent.trim(),
      };
    })()`);
    assert.ok(button, "Kontrol Merkezi düğmesi bulunamadı");
    assert.equal(button.label, "Kontrol Merkezi", "aria-label eksik");
    assert.equal(button.haspopup, "dialog", "aria-haspopup eksik");
    assert.ok(button.width >= 44 && button.height >= 44, `dokunma hedefi küçük: ${button.width}x${button.height}`);
    assert.equal(button.hasSvg, true, "SVG ikon yok");
    assert.equal(button.text, "", "emoji/metin ikon kullanılmış");
  });

  await runCase("panel acilir, ortalanir ve gercek kontrolleri tasir", async () => {
    await openCC();
    const state = await browser.evaluate(CC_STATE);
    assert.equal(state.open, true, "panel açılmadı");
    assert.ok(state.mode, "tema segmenti seçili değil");
    assert.ok(state.glass, "glass segmenti seçili değil");

    const content = await browser.evaluate(`(() => {
      const node = document.getElementById('control-center');
      const text = node.textContent;
      return {
        routes: [...node.querySelectorAll('[data-cc-route]')].map(b => b.dataset.ccRoute),
        hasHaptics: /Titreşim|Haptic/i.test(text),
        hasSpotlight: /Spotlight/i.test(text),
        hasWifi: /Wi-?Fi|Bluetooth|Uçak|Parlaklık/i.test(text),
        emoji: /[\\u{1F300}-\\u{1FAFF}\\u{2700}-\\u{27BF}]/u.test(text),
      };
    })()`);
    assert.deepEqual(
      content.routes,
      ["ravza-books", "ezber-merkezi", "sinav-merkezi", "oyun"],
      `hızlı uygulama rotaları yanlış: ${content.routes.join(", ")}`,
    );
    // Bilincli olarak DISARIDA birakilanlar.
    assert.equal(content.hasHaptics, false, "Haptics geri gelmiş (kaldırılmıştı)");
    assert.equal(content.hasSpotlight, false, "Spotlight ölü düğmesi eklenmiş");
    assert.equal(content.hasWifi, false, "web uygulamasının denetlemediği sahte kontrol var");
    assert.equal(content.emoji, false, "sistem kontrolünde emoji ikon var");
  });

  await runCase("panel ortalanir ve gorunur alanda kalir", async () => {
    const box = await browser.evaluate(`(() => {
      const panel = document.querySelector('#control-center .cc-panel');
      const rect = panel.getBoundingClientRect();
      return {
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        vw: innerWidth, vh: innerHeight,
        centerOffset: Math.abs((rect.left + rect.right) / 2 - innerWidth / 2),
        docScrollWidth: document.documentElement.scrollWidth,
      };
    })()`);
    assert.ok(box.centerOffset <= 2, `panel yatayda ortalanmamış (${box.centerOffset.toFixed(1)}px)`);
    assert.ok(box.top >= -1 && box.bottom <= box.vh + 1, "panel dikeyde taşıyor");
    assert.ok(box.docScrollWidth <= box.vw + 1, "yatay kaydırma oluştu");
  });

  /* ---- STATE SYNC: Kontrol Merkezi -> tema paneli ---- */
  await runCase("CC'de Koyu secilince tema paneli de Koyu gosterir", async () => {
    await browser.evaluate(`document.querySelector('[data-cc-mode="dark"]').click()`);
    await delay(400);
    const cc = await browser.evaluate(CC_STATE);
    assert.equal(cc.mode, "dark", "CC segmenti güncellenmedi");
    assert.equal(cc.pressedMode, "dark", "aria-pressed güncellenmedi");

    const applied = await browser.evaluate(`(() => ({
      body: document.body.classList.contains('dark'),
      stored: localStorage.getItem('eul_theme'),
    }))()`);
    assert.equal(applied.body, true, "koyu tema uygulanmadı");
    assert.equal(applied.stored, "dark", "kanonik anahtar güncellenmedi");

    // Tema panelini ac ve GORUNEN secimi dogrula (sadece storage degil).
    await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
    await delay(500);
    const panel = await browser.evaluate(`(() => {
      const active = document.querySelector('#theme-sheet [data-theme-mode].active');
      return { mode: active?.dataset.themeMode || null, ccOpen: document.getElementById('control-center')?.open === true };
    })()`);
    assert.equal(panel.mode, "dark", `tema panelinde Koyu seçili değil: ${panel.mode}`);
    // Tek aktif overlay: tema paneli acilinca CC kapanmis olmali.
    assert.equal(panel.ccOpen, false, "tema paneli açılınca Kontrol Merkezi kapanmalıydı");
  });

  /* ---- STATE SYNC: tema paneli -> Kontrol Merkezi ---- */
  await runCase("tema panelinde Sistem secilince CC de Sistem gosterir", async () => {
    await browser.evaluate(`document.querySelector('#theme-sheet [data-theme-mode="system"]').click()`);
    await delay(400);
    await browser.evaluate("window.closeThemeSheet && window.closeThemeSheet()");
    await delay(300);
    await openCC();
    const cc = await browser.evaluate(CC_STATE);
    assert.equal(cc.mode, "system", `CC'de Sistem seçili değil: ${cc.mode}`);
  });

  await runCase("Liquid Glass secimi iki yonlu tek durumdur", async () => {
    await browser.evaluate(`document.querySelector('[data-cc-glass="tinted"]').click()`);
    await delay(350);
    const applied = await browser.evaluate(`(() => ({
      cc: document.querySelector('[data-cc-glass].is-selected')?.dataset.ccGlass,
      attr: document.documentElement.dataset.glassLevel,
      stored: localStorage.getItem('eul_glass_level'),
      // Yuzeye ozel ikinci anahtar ACILMAMALI.
      strays: Object.keys(localStorage).filter(k => /controlCenter|cc_/i.test(k)),
    }))()`);
    assert.equal(applied.cc, "tinted", "CC seçimi güncellenmedi");
    assert.equal(applied.attr, "tinted", "belge özniteliği güncellenmedi");
    assert.equal(applied.stored, "tinted", "kanonik anahtar yazılmadı");
    assert.deepEqual(applied.strays, [], `yüzeye özel anahtar açılmış: ${applied.strays.join(", ")}`);

    // Panel kapanip yeniden acilinca ayni durum gorunmeli.
    await browser.evaluate("window.closeControlCenter && window.closeControlCenter()");
    await delay(300);
    await openCC();
    assert.equal((await browser.evaluate(CC_STATE)).glass, "tinted", "yeniden açılışta glass durumu kaybedildi");

    await browser.evaluate(`document.querySelector('[data-cc-glass="clear"]').click()`);
    await delay(350);
    assert.equal(
      await browser.evaluate("document.documentElement.dataset.glassLevel"),
      "clear",
      "Clear uygulanmadı",
    );
  });

  await runCase("Hareketi Azalt gercek tercihi degistirir", async () => {
    await browser.evaluate(`(() => {
      const input = document.getElementById('cc-motion');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await delay(350);
    const on = await browser.evaluate(`(() => ({
      attr: document.documentElement.dataset.reducedMotion,
      stored: localStorage.getItem('eul_motion'),
      checked: document.getElementById('cc-motion').checked,
    }))()`);
    assert.equal(on.attr, "true", "reduced-motion özniteliği yazılmadı");
    assert.equal(on.stored, "reduced", "kanonik anahtar yazılmadı");
    assert.equal(on.checked, true, "anahtar görünümü güncellenmedi");

    await browser.evaluate(`(() => {
      const input = document.getElementById('cc-motion');
      input.checked = false;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await delay(350);
    assert.equal(
      await browser.evaluate("document.documentElement.dataset.reducedMotion"),
      "false",
      "reduced-motion kapatılamadı",
    );
  });

  /* ---- OVERLAY KURALI ---- */
  await runCase("launcher aramasi aciksa CC acilinca kapanir", async () => {
    await browser.evaluate("window.closeControlCenter && window.closeControlCenter()");
    await delay(250);
    await browser.evaluate("window.openLauncherSearch && window.openLauncherSearch()");
    await delay(450);
    await openCC();
    const open = await browser.evaluate(OPEN_OVERLAYS);
    assert.deepEqual(open, ["control-center"], `tek panel beklenirken açık: ${open.join(", ")}`);
  });

  await runCase("Escape kapatir ve odak acan dugmeye doner", async () => {
    await browser.key("Escape");
    await browser.waitFor("document.getElementById('control-center')?.open !== true", "panel kapandı");
    await delay(350);
    const focused = await browser.evaluate("document.activeElement?.id");
    assert.equal(focused, "control-center-open", `odak açan düğmeye dönmedi: ${focused}`);
    assert.equal(
      await browser.evaluate("document.body.classList.contains('system-overlay-open')"),
      false,
      "scroll kilidi kalktı sanılıyordu",
    );
  });

  await runCase("hizli uygulama CC'yi kapatip gercek rotayi acar", async () => {
    await openCC();
    await browser.evaluate(`document.querySelector('[data-cc-route="ravza-books"]').click()`);
    await browser.waitFor("document.body.dataset.currentRoute === 'ravza-books'", "kitaplık rotası", 30000);
    await delay(400);
    assert.equal(
      await browser.evaluate("document.getElementById('control-center')?.open === true"),
      false,
      "uygulama açılırken Kontrol Merkezi açık kaldı",
    );
  });

  await runCase("20 kez ac/kapa birikim yapmaz", async () => {
    await gotoLauncher();
    for (let i = 0; i < 20; i += 1) {
      await browser.evaluate("window.openControlCenter && window.openControlCenter()");
      await delay(60);
      await browser.evaluate("window.closeControlCenter && window.closeControlCenter()");
      await delay(60);
    }
    await delay(400);
    const after = await browser.evaluate(`(() => ({
      dialogs: document.querySelectorAll('#control-center').length,
      allDialogs: document.querySelectorAll('dialog.control-center').length,
      open: document.getElementById('control-center')?.open === true,
      locked: document.body.classList.contains('system-overlay-open'),
    }))()`);
    assert.equal(after.dialogs, 1, `panel çoğaldı: ${after.dialogs}`);
    assert.equal(after.allDialogs, 1, `dialog düğümü birikti: ${after.allDialogs}`);
    assert.equal(after.open, false, "panel açık kaldı");
    assert.equal(after.locked, false, "scroll kilidi birikti");
  });

  await runCase("klavye ile gezilebilir ve odak panel icinde kalir", async () => {
    await openCC();
    const focusable = await browser.evaluate(`(() => {
      const node = document.getElementById('control-center');
      return [...node.querySelectorAll('button, input')].filter(el => el.offsetParent !== null || el.type === 'checkbox').length;
    })()`);
    assert.ok(focusable >= 8, `panelde yeterli odaklanabilir öğe yok: ${focusable}`);
    await browser.key("Tab");
    await delay(150);
    const inside = await browser.evaluate("!!document.activeElement?.closest('#control-center')");
    assert.equal(inside, true, "Tab odağı panelin dışına çıktı");
    await browser.key("Escape");
    await delay(300);
  });

  await runCase("mobil viewport'ta panel tasmaz", async () => {
    await browser.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await gotoLauncher();
    await openCC();
    const box = await browser.evaluate(`(() => {
      const panel = document.querySelector('#control-center .cc-panel');
      const rect = panel.getBoundingClientRect();
      const body = document.querySelector('#control-center .cc-body');
      return {
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        vw: innerWidth, vh: innerHeight,
        scrollable: body.scrollHeight > body.clientHeight,
        docScrollWidth: document.documentElement.scrollWidth,
      };
    })()`);
    assert.ok(box.left >= -1 && box.right <= box.vw + 1, "panel yatayda taşıyor");
    assert.ok(box.top >= -1 && box.bottom <= box.vh + 1, "panel dikeyde taşıyor");
    assert.ok(box.docScrollWidth <= box.vw + 1, "belge yatay kaydırma oluştu");
    await browser.key("Escape");
    await delay(300);
  });

  await runCase("konsol temiz kalir", async () => {
    await assertCleanDiagnostics(browser, "kontrol merkezi");
  });
} finally {
  await browser.close();
  await server.close();
}

const failed = cases.filter((entry) => !entry.ok);
console.log(`\nKontrol Merkezi: ${cases.length - failed.length}/${cases.length} gecti`);
if (failed.length) {
  console.error(`${failed.length} test BASARISIZ`);
  process.exitCode = 1;
} else {
  console.log("✓ Tek durum, tek aktif overlay, odak ve erisilebilirlik dogrulandi");
}
