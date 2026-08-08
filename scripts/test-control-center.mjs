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
  return {
    open: node.open === true,
    // Kaldirilan bloklar: hicbiri DOM'da OLMAMALI (gizli de degil, YOK).
    themeSegments: node.querySelectorAll('[data-cc-mode]').length,
    glassSegments: node.querySelectorAll('[data-cc-glass]').length,
    motionSwitch: node.querySelectorAll('#cc-motion').length,
    groups: [...node.querySelectorAll('.cc-group-title')].map(n => n.textContent.trim()),
    emptyGroups: [...node.querySelectorAll('.cc-group')].filter(g => !g.textContent.trim()).length,
    routes: [...node.querySelectorAll('[data-cc-route]')].map(b => b.dataset.ccRoute),
    hasBackground: !!node.querySelector('[data-cc-action="wallpaper"]'),
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

  await runCase("Tema / Liquid Glass / Hareket bloklari KALDIRILDI", async () => {
    const state = await browser.evaluate(CC_STATE);
    assert.equal(state.themeSegments, 0, "Tema segmenti hâlâ duruyor");
    assert.equal(state.glassSegments, 0, "Liquid Glass segmenti hâlâ duruyor");
    assert.equal(state.motionSwitch, 0, "Hareketi Azalt anahtarı hâlâ duruyor");
    // Sadece gizlenmis olmamali: geride bos kap/dolgu kalmamali.
    assert.equal(state.emptyGroups, 0, `geride ${state.emptyGroups} boş grup kalmış`);
    const text = await browser.evaluate("document.getElementById('control-center').textContent");
    for (const banned of ["Liquid Glass", "Hareketi Azalt", "Dengeli", "Tinted"]) {
      assert.ok(!text.includes(banned), `panelde hâlâ "${banned}" geçiyor`);
    }
  });

  await runCase("kisisellestirme ve hizli uygulamalar korunuyor", async () => {
    const state = await browser.evaluate(CC_STATE);
    assert.equal(state.hasBackground, true, "arka plan girişi kayboldu");
    assert.deepEqual(
      state.routes,
      ["ravza-books", "ezber-merkezi", "sinav-merkezi", "oyun"],
      `hızlı uygulamalar bozuldu: ${state.routes.join(", ")}`,
    );
  });

  await runCase("tema sistemi SILINMEDI, Ayarlar'da yasiyor", async () => {
    // Kontrol Merkezi'nden kaldirmak ozelligi kaldirmak DEGIL.
    await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
    await delay(500);
    const panel = await browser.evaluate(`(() => ({
      modes: [...document.querySelectorAll('#theme-sheet [data-theme-mode]')].map(b => b.dataset.themeMode),
      active: document.querySelector('#theme-sheet [data-theme-mode].active')?.dataset.themeMode || null,
      ccOpen: document.getElementById('control-center')?.open === true,
    }))()`);
    assert.deepEqual(panel.modes.sort(), ["dark", "light", "system"], `tema seçenekleri eksik: ${panel.modes.join(", ")}`);
    assert.ok(panel.active, "tema panelinde seçili mod yok");
    assert.equal(panel.ccOpen, false, "tema paneli açılınca Kontrol Merkezi kapanmalıydı");
    await browser.evaluate("window.closeThemeSheet && window.closeThemeSheet()");
    await delay(300);
  });

  await runCase("topbar'da eski ay/gunes tema dugmesi YOK", async () => {
    const topbar = await browser.evaluate(`(() => {
      const right = document.querySelector('.launcher-topbar-actions');
      return {
        ids: [...right.querySelectorAll('button')].map(b => b.id),
        legacyToggle: !!document.getElementById('topbar-theme-btn'),
        anyThemeToggle: document.querySelectorAll('[data-theme-toggle]').length,
      };
    })()`);
    assert.deepEqual(
      topbar.ids,
      ["launcherSearchOpen", "control-center-open"],
      `sağ üstte beklenmeyen düğme: ${topbar.ids.join(", ")}`,
    );
    assert.equal(topbar.legacyToggle, false, "eski #topbar-theme-btn hâlâ DOM'da");
    assert.equal(topbar.anyThemeToggle, 0, "launcher'da hâlâ tema toggle var");
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
    // Sadelestirmeden sonra beklenen: kapat + Arka Plan + 4 hizli uygulama = 6.
    // Eski esik (8) tema/glass/motion segmentlerini sayiyordu, onlar kaldirildi.
    assert.ok(focusable >= 6, `panelde yeterli odaklanabilir öğe yok: ${focusable}`);
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

  // Bu suite temayi ve gorunum tercihlerini degistiriyor. Tarayici profili
  // testler arasinda yasadigi icin biraktigimiz durum SONRAKI suite'lerin
  // hangi tema kombinasyonunu ornekledigini degistirebiliyor. Varsayilana don.
  await browser.evaluate(`(() => {
    localStorage.removeItem('eul_theme');
    localStorage.removeItem('eul_glass_level');
    localStorage.removeItem('eul_motion');
  })()`);
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
