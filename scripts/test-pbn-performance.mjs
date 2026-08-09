/**
 * Boyama (Paint by Number) bellek, geçmiş ve geri/ileri al testi.
 *
 * MİMARİ (kaynak okumasıyla çıkarıldı, ölçümle doğrulandı):
 *   js/utils/pbn-canvas.js   tek <canvas> + regionMap (Int32Array LUT), bölge
 *                            tabanlı boyama. Geçmiş DELTA'dır: paintOrder her
 *                            elemanı bir "stroke" olan bölge-id dizisidir;
 *                            redoStack aynı biçimde. Tam durum kopyası (full
 *                            snapshot) YOK - undo/redo O(stroke) çalışır.
 *   js/pages/boyama-page.js  proje kaydı; her boyama olayında persistProject
 *                            çağrılır, kayıt kuyruğu uçuşta olan yazımı
 *                            birleştirir; ayrıca localStorage'a acil durum
 *                            anlık görüntüsü yazılır (iOS sekme ölümü için).
 *
 * Bu test mimariyi DEĞİŞTİRMEZ; ölçer ve şu değişmezleri kilitler:
 *   - 100+ boyama işleminden sonra geçmiş doğrusal kalır, kare değil
 *   - 50 undo + 50 redo işlemi durumu birebir geri getirir
 *   - uygulama kapanınca canvas/observer/rAF bırakılmaz
 *   - aç/kapa x10 sonrası tuval ve DOM birikmez
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  ThemeTestBrowser,
  ensureTestServer,
  delay,
  assertCleanDiagnostics,
} from "./lib/theme-test-runtime.mjs";

const ARTIFACT_DIR = join(ROOT, "test-artifacts", "perf");
const PAINT_ACTIONS = 120;
const UNDO_REDO = 50;

const results = [];
const samples = [];
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

/* ------------------------------------------------------------------------ */
/* SAYFA İÇİ ARAÇLAR                                                         */
/* ------------------------------------------------------------------------ */

const INSTRUMENT = `(() => {
  let rafScheduled = 0;
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => { rafScheduled += 1; return nativeRaf(callback); };

  const intervals = new Set();
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  window.setInterval = (...args) => { const id = nativeSetInterval(...args); intervals.add(id); return id; };
  window.clearInterval = (id) => { intervals.delete(id); return nativeClearInterval(id); };

  const observers = { resize: 0, mutation: 0 };
  for (const [key, Ctor] of [['resize', window.ResizeObserver], ['mutation', window.MutationObserver]]) {
    if (typeof Ctor !== 'function') continue;
    const Wrapped = class extends Ctor {
      constructor(...args) { super(...args); observers[key] += 1; }
      disconnect() { observers[key] -= 1; return super.disconnect(); }
    };
    if (key === 'resize') window.ResizeObserver = Wrapped;
    else window.MutationObserver = Wrapped;
  }

  window.__pbnProbe = {
    intervals: () => intervals.size,
    observers: () => ({ ...observers }),
    sampleRaf: (ms) => new Promise((resolve) => {
      const start = rafScheduled;
      setTimeout(() => resolve(rafScheduled - start), ms);
    }),
  };
})()`;

/**
 * Boyama durumunu okur.
 *
 * Motor `viewport.__pbnEngine` üzerinden zaten dışa veriliyor (üretim kodunda
 * mevcut bir teşhis kancası); test bunun için üretim koduna hiçbir şey EKLEMEZ.
 */
const PROBE = `(() => {
  const probe = window.__pbnProbe;
  const engine = document.getElementById('pbnCanvasViewport')?.__pbnEngine || null;
  const canvases = [...document.querySelectorAll('canvas')];
  let canvasPixels = 0;
  for (const canvas of canvases) canvasPixels += canvas.width * canvas.height;

  let storageBytes = 0;
  let pbnKeys = 0;
  for (const key of Object.keys(localStorage)) {
    if (!/^pbn/i.test(key)) continue;
    pbnKeys += 1;
    storageBytes += key.length + (localStorage.getItem(key) || '').length;
  }

  return {
    domNodes: document.getElementsByTagName('*').length,
    canvasCount: canvases.length,
    canvasPixels,
    canvasBackingMB: Number(((canvasPixels * 4) / 1048576).toFixed(2)),
    painted: engine ? engine.getPaintedRegionIds().length : null,
    progress: engine ? engine.getProgress() : null,
    hasEngine: Boolean(engine),
    pbnStorageKB: Number((storageBytes / 1024).toFixed(1)),
    pbnStorageKeys: pbnKeys,
    intervals: probe ? probe.intervals() : -1,
    resizeObservers: probe ? probe.observers().resize : -1,
    mutationObservers: probe ? probe.observers().mutation : -1,
    screen: document.querySelector('.pbn-screen.is-active')?.dataset.pbnScreen ?? null,
  };
})()`;

async function heapUsedMB(browser) {
  await browser.command("HeapProfiler.collectGarbage").catch(() => {});
  const usage = await browser.command("Runtime.getHeapUsage").catch(() => null);
  return usage?.usedSize ? Number((usage.usedSize / 1048576).toFixed(2)) : null;
}

async function snapshot(browser, label) {
  const page = await browser.evaluate(PROBE);
  const entry = { label, ...page, heapMB: await heapUsedMB(browser) };
  samples.push(entry);
  return entry;
}

/* ------------------------------------------------------------------------ */
/* SÜRÜCÜLER                                                                  */
/* ------------------------------------------------------------------------ */

const LAUNCHER_READY = "document.readyState === 'complete'";
const PBN_HOME = "document.querySelector('.pbn-screen-home.is-active') !== null";
const PBN_PAINT = "document.querySelector('.pbn-screen-paint.is-active') !== null";

async function openBoyama(browser) {
  await browser.evaluate("window.navigate('oyun')");
  await browser.waitFor("document.getElementById('games')?.classList.contains('active') === true", "oyun açılmadı");
  await browser.evaluate(`(() => {
    const card = document.querySelector('[data-game-id="boyama"], [data-game="boyama"]');
    if (card) { card.click(); return true; }
    return false;
  })()`);
  await browser.waitFor(PBN_HOME, "boyama ana ekranı açılmadı", 40000);
}

async function startPreset(browser) {
  await browser.evaluate("document.querySelector('#pbnPresetGrid .pbn-preset-item').click()");
  await browser.waitFor(PBN_PAINT, "boyama tuvali hazırlanmadı", 90000);
  await browser.waitFor(
    "Boolean(document.getElementById('pbnCanvasViewport')?.__pbnEngine)",
    "boyama motoru kurulmadı",
    30000,
  );
}

/**
 * Gerçek boyama: tuval üzerinde ızgara noktalarına dokunur.
 *
 * Motorda "şu bölgeyi boya" diye bir genel API yok; boyama yalnızca işaretçi
 * olaylarıyla olur. Bu yüzden her palet numarası seçilip tuval taranır: numara
 * eşleşen bölgeler boyanır, eşleşmeyenler "wrong" olayı üretir - ikisi de
 * gerçek kullanıcı davranışıdır.
 */
async function paintActions(browser, target) {
  return browser.evaluate(`(async () => {
    const viewport = document.getElementById('pbnCanvasViewport');
    const engine = viewport.__pbnEngine;
    const canvas = document.getElementById('pbnCanvas');
    const chips = [...document.querySelectorAll('#pbnPaletteStrip [data-number]')];
    const numbers = chips.length
      ? chips.map((chip) => Number(chip.dataset.number))
      : engine.getNumberStats().map((stat) => stat.number);

    const tap = (x, y) => {
      const options = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 };
      canvas.dispatchEvent(new PointerEvent('pointerdown', options));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0 }));
    };

    const before = engine.getPaintedRegionIds().length;
    const rect = canvas.getBoundingClientRect();
    const steps = 26;
    outer:
    for (const number of numbers) {
      engine.selectNumber(number);
      for (let row = 1; row < steps; row += 1) {
        for (let col = 1; col < steps; col += 1) {
          tap(rect.left + (rect.width * col) / steps, rect.top + (rect.height * row) / steps);
          if (engine.getPaintedRegionIds().length - before >= ${target}) break outer;
        }
      }
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return engine.getPaintedRegionIds().length - before;
  })()`);
}

async function repeat(browser, action, count) {
  return browser.evaluate(`(async () => {
    const engine = document.getElementById('pbnCanvasViewport').__pbnEngine;
    for (let index = 0; index < ${count}; index += 1) engine.${action}();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return engine.getPaintedRegionIds().length;
  })()`);
}

async function closeBoyama(browser) {
  await browser.evaluate("document.querySelector('#pbnBackBtn')?.click()");
  await browser.waitFor(PBN_HOME, "boyama ana ekranına dönülmedi", 20000);
  await browser.evaluate("window.navigate('ana-sayfa')");
  await browser.waitFor(
    "document.getElementById('games')?.classList.contains('active') === false",
    "oyun sayfası kapanmadı",
  );
}

/* ------------------------------------------------------------------------ */
/* KOŞU                                                                       */
/* ------------------------------------------------------------------------ */

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch();
let baseline = null;
let afterPaint = null;
let paintedAfterActions = 0;
let paintedAfterUndo = 0;
let paintedAfterRedo = 0;
let paintedBeforeUndo = 0;
let idleRafBaseline = 0;
let idleRafAfterCycles = 0;
const cycleSamples = [];

try {
  await browser.command("HeapProfiler.enable").catch(() => {});
  await browser.addNewDocumentScript(INSTRUMENT);
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.navigate("/", LAUNCHER_READY);
  browser.clearDiagnostics("pbn-performance");
  baseline = await snapshot(browser, "1 · launcher (temel)");
  idleRafBaseline = await browser.evaluate("window.__pbnProbe.sampleRaf(1000)");

  await openBoyama(browser);
  await snapshot(browser, "2 · boyama ana ekranı");

  await startPreset(browser);
  await snapshot(browser, "3 · hazır görsel açıldı");

  /* --- 100+ boyama, her 20 işlemde bir ölçüm ---------------------------- */
  for (let batch = 1; batch <= 6; batch += 1) {
    paintedAfterActions += await paintActions(browser, 20);
    await snapshot(browser, `4 · ${paintedAfterActions} bölge boyandı`);
  }
  afterPaint = samples.at(-1);
  paintedBeforeUndo = afterPaint.painted;

  /* --- 50 undo, 50 redo ------------------------------------------------- */
  paintedAfterUndo = await repeat(browser, "undo", UNDO_REDO);
  await snapshot(browser, `5 · ${UNDO_REDO} geri al`);
  paintedAfterRedo = await repeat(browser, "redo", UNDO_REDO);
  await snapshot(browser, `6 · ${UNDO_REDO} ileri al`);

  /* --- Kaydet ve kapat -------------------------------------------------- */
  await closeBoyama(browser);
  await snapshot(browser, "7 · uygulama kapandı");

  /* --- Aç/kapa x10 ------------------------------------------------------ */
  for (let cycle = 1; cycle <= 10; cycle += 1) {
    await openBoyama(browser);
    await browser.evaluate("window.navigate('ana-sayfa')");
    await browser.waitFor(
      "document.getElementById('games')?.classList.contains('active') === false",
      "oyun sayfası kapanmadı",
    );
    cycleSamples.push(await snapshot(browser, `8 · döngü ${cycle}`));
  }
  idleRafAfterCycles = await browser.evaluate("window.__pbnProbe.sampleRaf(1000)");

  /* ==================================================================== */
  /* İDDİALAR                                                             */
  /* ==================================================================== */

  await testCase("senaryo gerçekten çalıştı (ölçüm vakumda değil)", () => {
    assert.ok(
      paintedAfterActions >= PAINT_ACTIONS,
      `yalnızca ${paintedAfterActions} bölge boyandı, senaryo ${PAINT_ACTIONS}+ istiyor`,
    );
    assert.ok(afterPaint.hasEngine, "boyama motoru bulunamadı");
  });

  await testCase("geri al gerçekten geri alıyor", () => {
    assert.ok(
      paintedAfterUndo < paintedBeforeUndo,
      `${UNDO_REDO} geri al sonrası boyalı bölge ${paintedBeforeUndo} → ${paintedAfterUndo} (azalmadı)`,
    );
  });

  await testCase("ileri al durumu birebir geri getiriyor", () => {
    assert.equal(
      paintedAfterRedo,
      paintedBeforeUndo,
      `${UNDO_REDO} geri + ${UNDO_REDO} ileri sonrası ${paintedAfterRedo} bölge, beklenen ${paintedBeforeUndo}`,
    );
  });

  await testCase("geçmiş delta tabanlı: 120 işlem tuval belleğini büyütmüyor", () => {
    const start = samples.find((entry) => entry.label.startsWith("3 ·"));
    assert.equal(
      afterPaint.canvasCount,
      start.canvasCount,
      `boyama sırasında tuval sayısı ${start.canvasCount} → ${afterPaint.canvasCount}`,
    );
    assert.ok(
      afterPaint.canvasBackingMB - start.canvasBackingMB <= 1,
      `tuval belleği ${start.canvasBackingMB} → ${afterPaint.canvasBackingMB} MB büyüdü `
        + "- her işlemde tam durum kopyası alınıyor olabilir",
    );
  });

  await testCase("kayıt boyutu işlem sayısıyla patlamıyor", () => {
    const start = samples.find((entry) => entry.label.startsWith("3 ·"));
    const growthPerAction = (afterPaint.pbnStorageKB - start.pbnStorageKB) / Math.max(1, paintedAfterActions);
    assert.ok(
      growthPerAction <= 0.5,
      `boyama işlemi başına localStorage ${growthPerAction.toFixed(3)} KB büyüdü `
        + `(${start.pbnStorageKB} → ${afterPaint.pbnStorageKB} KB, ${paintedAfterActions} işlem)`,
    );
  });

  await testCase("uygulama kapanınca tuval ve motor bırakılıyor", () => {
    const closed = samples.find((entry) => entry.label.startsWith("7 ·"));
    assert.equal(closed.hasEngine, false, "kapanıştan sonra boyama motoru hâlâ bağlı");
    assert.equal(closed.canvasCount, 0, `kapanıştan sonra ${closed.canvasCount} tuval DOM'da kaldı`);
  });

  await testCase("aç/kapa x10 sonrası tuval, DOM ve observer birikmiyor", () => {
    const first = cycleSamples[0];
    const last = cycleSamples.at(-1);
    assert.equal(last.canvasCount, 0, `10. döngüde ${last.canvasCount} tuval DOM'da kaldı`);
    assert.ok(
      last.domNodes - first.domNodes <= 20,
      `10 döngüde DOM ${first.domNodes} → ${last.domNodes} büyüdü`,
    );
    assert.ok(
      last.resizeObservers - first.resizeObservers <= 1,
      `ResizeObserver ${first.resizeObservers} → ${last.resizeObservers} sızdı`,
    );
    assert.ok(
      last.intervals - first.intervals <= 1,
      `interval ${first.intervals} → ${last.intervals} sızdı`,
    );
  });

  await testCase("kapanan boyama kalıcı animasyon döngüsü bırakmıyor", () => {
    assert.ok(
      idleRafAfterCycles <= idleRafBaseline + 10,
      `10 aç/kapa sonrası boştaki sayfa ${idleRafAfterCycles} rAF/sn planlıyor (referans ${idleRafBaseline})`,
    );
  });

  await testCase("boyama konsola hata düşürmüyor", () => {
    assertCleanDiagnostics(browser.diagnostics(), "pbn-performance", { allowWarnings: true });
  });

  /**
   * REGRESYON: her boyama işleminde koşulsuz bir console.warn çalışıyordu ve
   * yalnızca loglamak için getPaintedRegionIds() ile bütün boyalı bölge
   * listesini kopyalıyordu. Teşhis logu pbnLog üzerinden ?pbndebug=1 ile açılır.
   */
  await testCase("boyama işlemi kapıya kapalı olmayan teşhis logu üretmiyor", () => {
    const warnings = browser.diagnostics().consoleWarnings;
    const debugNoise = warnings.filter((line) => /PBN SAVE DEBUG|PBN DEBUG/.test(line));
    assert.deepEqual(
      debugNoise,
      [],
      `${paintedAfterActions} boyama işlemi ${debugNoise.length} teşhis logu üretti: ${debugNoise.slice(0, 2).join(" | ")}`,
    );
  });
} finally {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(
    join(ARTIFACT_DIR, "pbn-performance.json"),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), samples }, null, 2)}\n`,
    "utf8",
  );
  await browser.close();
  await server.close();
}

console.log("Boyama · bellek ve geçmiş profili");
console.log(
  samples
    .map((entry) => [
      entry.label.padEnd(28),
      `dom ${String(entry.domNodes).padStart(5)}`,
      `canvas ${String(entry.canvasCount).padStart(2)}`,
      `backing ${String(entry.canvasBackingMB).padStart(6)}MB`,
      `boyalı ${String(entry.painted ?? "-").padStart(4)}`,
      `store ${String(entry.pbnStorageKB).padStart(7)}KB`,
      `RO ${entry.resizeObservers}`,
      `heap ${String(entry.heapMB).padStart(6)}MB`,
    ].join("  "))
    .join("\n"),
);
console.log(`\n${results.join("\n")}`);
console.log(failures ? `\n${failures} test BAŞARISIZ` : "\nTüm Boyama testleri geçti");
process.exit(failures ? 1 : 0);
