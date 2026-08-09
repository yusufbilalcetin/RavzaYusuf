/**
 * Mobil GPU / boyama profili — 390x844 öncelikli.
 *
 * SINIR: bu bir masaüstü Chromium'dur, gerçek telefon GPU'su DEĞİLDİR.
 * Ölçülen şeyler cihazdan bağımsız yapısal maliyetlerdir: kaç öğe blur
 * istiyor, blur iç içe mi, kaç öğe kalıcı GPU katmanı rezerve ediyor, boşta
 * kaç animasyon karesi planlanıyor. Kare süresi ve gerçek GPU bellek
 * rakamları BURADA ÖLÇÜLEMEZ; onlar için gerçek cihaz gerekir.
 *
 * Neden bu metrikler: iç içe backdrop-filter her katmanda ayrı bir blur geçişi
 * demektir ve mobil GPU'da en pahalı ikinci iştir (birincisi büyük boyama
 * alanı). Kalıcı will-change ise katmanı sonsuza dek bellekte tutar - geçici
 * kullanımda faydalı, kalıcıda zarar.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, ensureTestServer, delay } from "./lib/theme-test-runtime.mjs";

const ARTIFACT_DIR = join(ROOT, "test-artifacts", "perf");
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };

const results = [];
const report = [];
let failures = 0;

async function testCase(name, run) {
  try {
    await run();
    results.push(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`  FAIL  ${name}\n        ${String(error.message).split("\n").join("\n        ")}`);
  }
}

const INSTRUMENT = `(() => {
  let rafScheduled = 0;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => { rafScheduled += 1; return nativeRaf(callback); };
  window.__gpuProbe = {
    sampleRaf: (ms) => new Promise((resolve) => {
      const start = rafScheduled;
      setTimeout(() => resolve(rafScheduled - start), ms);
    }),
  };
})()`;

const PROBE = `(() => {
  const all = [...document.querySelectorAll('*')];
  const visible = all.filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  const blurred = [];
  const willChange = [];
  const heavyShadow = [];
  const fixedBackgrounds = [];
  let biggestShadowBlur = 0;

  for (const node of visible) {
    const style = getComputedStyle(node);
    const backdrop = style.backdropFilter || style.webkitBackdropFilter || 'none';
    if (backdrop && backdrop !== 'none') blurred.push(node);
    if (style.willChange && style.willChange !== 'auto') willChange.push(\`\${node.tagName.toLowerCase()}.\${node.className}\`.slice(0, 70));
    if (style.backgroundAttachment === 'fixed') fixedBackgrounds.push(\`\${node.tagName.toLowerCase()}.\${String(node.className).slice(0, 40)}\`);
    const shadow = style.boxShadow;
    if (shadow && shadow !== 'none') {
      for (const match of shadow.matchAll(/(-?\\d+(?:\\.\\d+)?)px/g)) {
        const value = Math.abs(Number(match[1]));
        if (value > biggestShadowBlur) biggestShadowBlur = value;
      }
      if (/\\b(6\\d|[7-9]\\d|\\d{3,})px/.test(shadow)) heavyShadow.push(\`\${node.tagName.toLowerCase()}.\${String(node.className).slice(0, 40)}\`);
    }
  }

  // İÇ İÇE BLUR: blur isteyen bir öğenin atalarından biri de blur istiyorsa
  // GPU aynı bölgeyi iki kez bulanıklaştırır.
  const blurredSet = new Set(blurred);
  const nested = [];
  for (const node of blurred) {
    let parent = node.parentElement;
    while (parent) {
      if (blurredSet.has(parent)) {
        nested.push(\`\${String(parent.className).slice(0, 34)} > \${String(node.className).slice(0, 34)}\`);
        break;
      }
      parent = parent.parentElement;
    }
  }

  return {
    domNodes: all.length,
    visibleNodes: visible.length,
    backdropFilters: blurred.length,
    nestedBackdropFilters: nested.length,
    nestedSamples: nested.slice(0, 6),
    willChangeCount: willChange.length,
    willChangeSamples: willChange.slice(0, 6),
    heavyShadows: heavyShadow.length,
    heavyShadowSamples: heavyShadow.slice(0, 4),
    biggestShadowBlur,
    fixedBackgrounds: fixedBackgrounds.length,
    fixedBackgroundSamples: fixedBackgrounds.slice(0, 4),
  };
})()`;

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch();

try {
  await browser.addNewDocumentScript(INSTRUMENT);
  await browser.setViewport(MOBILE);
  await browser.navigate("/", "document.readyState === 'complete'");
  await delay(1800);

  const screens = [
    ["Launcher", null],
    ["Ana Sayfa", "ana-sayfa"],
    ["Ravza Books", "ravza-books"],
    ["Ezber Merkezi", "ezber-merkezi"],
    ["Sınav Merkezi", "sinav-merkezi"],
    ["Oyun Alanı", "oyun"],
    ["Kahoot", "kahoot"],
  ];

  for (const [label, route] of screens) {
    if (route) {
      await browser.evaluate(`window.navigate(${JSON.stringify(route)})`);
      await delay(1400);
    }
    const measured = await browser.evaluate(PROBE);
    const idleRaf = await browser.evaluate("window.__gpuProbe.sampleRaf(1000)");
    report.push({ screen: label, ...measured, idleRafPerSecond: idleRaf });
  }

  /* --- Control Center ve Wallpaper picker: en yoğun cam yüzeyler ---------- */
  await browser.evaluate("window.navigate('ana-sayfa')");
  await delay(800);
  const openedControlCenter = await browser.evaluate(
    "typeof window.openControlCenter === 'function' ? (window.openControlCenter(), true) : false",
  );
  if (openedControlCenter) {
    await delay(900);
    const measured = await browser.evaluate(PROBE);
    report.push({ screen: "Control Center", ...measured, idleRafPerSecond: await browser.evaluate("window.__gpuProbe.sampleRaf(1000)") });
    await browser.evaluate("document.querySelectorAll('dialog[open]').forEach(node => node.close())");
    await delay(400);
  }

  /* ==================================================================== */
  /* İDDİALAR                                                             */
  /* ==================================================================== */

  await testCase("hiçbir ekranda iç içe backdrop-filter yok", () => {
    for (const entry of report) {
      assert.equal(
        entry.nestedBackdropFilters,
        0,
        `${entry.screen}: ${entry.nestedBackdropFilters} iç içe blur (${entry.nestedSamples.join(" | ")}) `
          + "- GPU aynı bölgeyi iki kez bulanıklaştırıyor",
      );
    }
  });

  await testCase("aynı anda açık blur yüzeyi sayısı sınırlı", () => {
    for (const entry of report) {
      assert.ok(
        entry.backdropFilters <= 12,
        `${entry.screen}: ${entry.backdropFilters} görünür öğe backdrop-filter istiyor`,
      );
    }
  });

  await testCase("kalıcı will-change bırakılmıyor", () => {
    // will-change yalnızca sürükleme/çevirme sürerken açılmalı; boştaki bir
    // ekranda katman rezerve etmek belleği boşuna tutar.
    for (const entry of report) {
      assert.ok(
        entry.willChangeCount <= 2,
        `${entry.screen}: ${entry.willChangeCount} öğe boştayken will-change tutuyor (${entry.willChangeSamples.join(", ")})`,
      );
    }
  });

  await testCase("boştaki ekranlar sürekli animasyon karesi planlamıyor", () => {
    for (const entry of report) {
      assert.ok(
        entry.idleRafPerSecond <= 12,
        `${entry.screen}: boşta saniyede ${entry.idleRafPerSecond} rAF planlanıyor `
          + "- kapanmayan bir animasyon döngüsü var",
      );
    }
  });

  await testCase("mobilde background-attachment: fixed yaygınlaşmıyor", () => {
    // Tek bir gövde katmanı kabul; her ek sabit arka plan kaydırmada yeniden
    // boyama maliyeti demektir.
    for (const entry of report) {
      assert.ok(
        entry.fixedBackgrounds <= 1,
        `${entry.screen}: ${entry.fixedBackgrounds} öğede background-attachment: fixed `
          + `(${entry.fixedBackgroundSamples.join(", ")})`,
      );
    }
  });
} finally {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(
    join(ARTIFACT_DIR, "mobile-gpu.json"),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), viewport: "390x844 @3x", screens: report }, null, 2)}\n`,
    "utf8",
  );
  await browser.close();
  await server.close();
}

console.log("Mobil GPU profili · 390x844 @3x (masaüstü Chromium - gerçek telefon GPU'su değil)");
console.log(
  report
    .map((entry) => [
      entry.screen.padEnd(16),
      `dom ${String(entry.domNodes).padStart(5)}`,
      `görünür ${String(entry.visibleNodes).padStart(4)}`,
      `blur ${String(entry.backdropFilters).padStart(2)} (iç içe ${entry.nestedBackdropFilters})`,
      `will-change ${entry.willChangeCount}`,
      `ağır gölge ${String(entry.heavyShadows).padStart(2)} (en büyük ${entry.biggestShadowBlur}px)`,
      `fixed-bg ${entry.fixedBackgrounds}`,
      `boşta rAF ${entry.idleRafPerSecond}/sn`,
    ].join("  "))
    .join("\n"),
);
console.log(`\n${results.join("\n")}`);
console.log(failures ? `\n${failures} test BAŞARISIZ` : "\nTüm mobil GPU testleri geçti");
process.exit(failures ? 1 : 0);
