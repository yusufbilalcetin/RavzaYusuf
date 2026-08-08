#!/usr/bin/env node
/**
 * Kontrol Merkezi GORSEL/DUZEN testi.
 *
 * test-control-center.mjs sozlesmeyi (hangi dugme neyi acar, overlay kurali,
 * odak) dogrular. Bu dosya ondan AYRIDIR ve yalnizca gecmiste gozle yakalanan
 * duzen kusurlarinin geri gelmemesini olcer:
 *
 *   - iki bolum ayni gridi paylasip sistem kartlarini satirin yarisina
 *     sikistirmasin,
 *   - panel dolgusu .ui-sheet-panel'inkiyle toplanip iki kat kenar yapmasin,
 *   - kartlar birbirine esit olsun ve ikon/baslik hizasi bozulmasin,
 *   - panelde cam icinde cam olmasin,
 *   - hicbir olcude yatay tasma ya da 44px altinda dokunma hedefi olmasin.
 *
 * Kullanim: node ./scripts/test-control-center-visual.mjs
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
const browser = await ThemeTestBrowser.launch("control-center-visual");

/** Spec §43'teki olculer. */
const VIEWPORTS = [
  { label: "390x844 (mobil)", width: 390, height: 844, apps: 2, pad: 20 },
  { label: "430x932 (mobil buyuk)", width: 430, height: 932, apps: 2, pad: 20 },
  { label: "768x1024 (tablet dikey)", width: 768, height: 1024, apps: 4, pad: 32 },
  { label: "1024x768 (tablet yatay)", width: 1024, height: 768, apps: 4, pad: 32 },
  { label: "1440x900 (masaustu)", width: 1440, height: 900, apps: 4, pad: 32 },
  { label: "1920x1080 (genis)", width: 1920, height: 1080, apps: 4, pad: 32 },
];

async function openCC() {
  await browser.evaluate(`(() => {
    const button = document.getElementById('control-center-open');
    button.focus();
    button.click();
  })()`);
  await browser.waitFor("document.getElementById('control-center')?.open === true", "kontrol merkezi");
  await delay(320);
}

async function closeCC() {
  await browser.evaluate("window.closeControlCenter?.()");
  await delay(200);
}

/** Panelin gercek olculeri - tarayicidan, varsayimdan degil. */
const MEASURE = `(() => {
  const dialog = document.getElementById('control-center');
  const panel = dialog.querySelector('.cc-panel');
  const box = (el) => { const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, right: r.right }; };
  const rows = (list) => [...list].map(box);
  const panelBox = box(panel);
  const head = box(dialog.querySelector('.cc-head'));
  const title = box(dialog.querySelector('.cc-head h2'));
  const close = box(dialog.querySelector('.cc-close'));
  const body = dialog.querySelector('.cc-body');
  const sys = rows(dialog.querySelectorAll('.cc-tile--system'));
  const apps = rows(dialog.querySelectorAll('.cc-tile--app'));
  const sysIcons = rows(dialog.querySelectorAll('.cc-tile--system .cc-tile-icon'));
  const appIcons = rows(dialog.querySelectorAll('.cc-tile--app .cc-tile-icon'));
  const sysLabels = rows(dialog.querySelectorAll('.cc-tile--system .cc-tile-label'));
  const appLabels = rows(dialog.querySelectorAll('.cc-tile--app .cc-tile-label'));
  const cs = getComputedStyle(panel);
  const tileStyles = [...dialog.querySelectorAll('.cc-tile')].map((el) => {
    const s = getComputedStyle(el);
    return { backdrop: s.backdropFilter, radius: parseFloat(s.borderTopLeftRadius), shadow: s.boxShadow };
  });
  return {
    viewport: { w: innerWidth, h: innerHeight },
    panel: panelBox,
    panelRadius: parseFloat(cs.borderTopLeftRadius),
    panelBackdrop: cs.backdropFilter,
    panelBg: cs.backgroundColor,
    head, title, close,
    bodyScrolls: body.scrollHeight > body.clientHeight + 1,
    sys, apps, sysIcons, appIcons, sysLabels, appLabels,
    tileStyles,
    docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    // Kaldirilan kontrollerden hicbir kalinti olmamali (spec §20, §42).
    leftovers: dialog.querySelectorAll('.cc-segmented, .cc-switch, .cc-row, [data-cc-theme], [data-cc-glass], [data-cc-motion]').length,
  };
})()`;

const near = (a, b, tolerance, label) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a.toFixed(1)} ~ ${b.toFixed(1)} degil (tolerans ${tolerance})`);

const allEqual = (values, tolerance, label) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  assert.ok(max - min <= tolerance, `${label}: ${min.toFixed(1)}..${max.toFixed(1)} araligi ${tolerance}px'i asiyor`);
};

try {
  await browser.seedTheme("light");
  await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
  await delay(400);

  for (const viewport of VIEWPORTS) {
    await runCase(`${viewport.label} - duzen`, async () => {
      await browser.setViewport({ width: viewport.width, height: viewport.height });
      await delay(260);
      await openCC();
      const m = await browser.evaluate(MEASURE);

      assert.equal(m.leftovers, 0, "kaldirilan Tema/Cam/Hareket kontrollerinden kalinti var");
      assert.equal(m.docOverflow, false, "belge yatayda tasiyor");

      // Panel gercekten ortalanir.
      near(m.panel.x + m.panel.w / 2, m.viewport.w / 2, 2, "panel yatay merkez");

      // Panel viewport'a sigar ve makul genislikte kalir (spec §2, §27).
      assert.ok(m.panel.w <= m.viewport.w - 16, `panel viewport'a sigmiyor (${m.panel.w})`);
      if (viewport.width >= 720) {
        assert.ok(m.panel.w >= 540 && m.panel.w <= 620,
          `masaustu panel genisligi 540-620 disinda: ${m.panel.w}`);
      } else {
        const ratio = m.panel.w / m.viewport.w;
        assert.ok(ratio >= 0.88 && ratio <= 0.95,
          `mobil panel viewport'un %${(ratio * 100).toFixed(1)}'i (beklenen %88-95)`);
      }

      // Sistem HER ZAMAN iki sutun ve iki kart satirin TAMAMINI kaplar.
      assert.equal(m.sys.length, 2, "iki sistem karti bekleniyor");
      near(m.sys[0].y, m.sys[1].y, 1, "sistem kartlari ayni satirda degil");
      allEqual(m.sys.map((t) => t.w), 1, "sistem kart genislikleri");
      allEqual(m.sys.map((t) => t.h), 1, "sistem kart yukseklikleri");
      // Ikisi birlikte icerik genisliginin tamamini doldurur; yarisinda kalmaz.
      const sysSpan = m.sys[1].right - m.sys[0].x;
      const contentWidth = m.panel.w - 2 * viewport.pad;
      near(sysSpan, contentWidth, 3, "sistem kartlari icerik genisligini doldurmuyor");

      // Hizli uygulamalar: mobilde 2x2, genis ekranda tek sirada dort.
      assert.equal(m.apps.length, 4, "dort hizli uygulama bekleniyor");
      const appRows = new Set(m.apps.map((t) => Math.round(t.y)));
      assert.equal(appRows.size, viewport.apps === 4 ? 1 : 2,
        `hizli uygulama satir sayisi beklenenden farkli (${appRows.size})`);
      allEqual(m.apps.map((t) => t.w), 1, "hizli uygulama genislikleri");
      allEqual(m.apps.map((t) => t.h), 1, "hizli uygulama yukseklikleri");

      // Ikon ve basliklar ayni hizada - kartlar 1 ve 3 satira dagilmaz.
      allEqual(m.sysIcons.map((i) => i.top), 1, "sistem ikon hizasi");
      allEqual(m.sysLabels.map((l) => l.top), 1, "sistem baslik hizasi");
      for (const row of [0, 2]) {
        const inRow = m.appIcons.filter((_, index) =>
          Math.round(m.apps[index].y) === Math.round(m.apps[row]?.y ?? -1));
        if (inRow.length > 1) allEqual(inRow.map((i) => i.top), 1, "hizli uygulama ikon hizasi");
      }

      // Dokunma hedefleri.
      assert.ok(m.close.w >= 44 && m.close.h >= 44, `kapat 44px altinda: ${m.close.w}x${m.close.h}`);
      for (const tile of [...m.sys, ...m.apps]) {
        assert.ok(tile.h >= 44, `kart yuksekligi 44px altinda: ${tile.h}`);
      }

      // Baslik ve kapat dikeyde ayni eksende, kapat panelden kopuk degil.
      near(m.title.y + m.title.h / 2, m.close.y + m.close.h / 2, 3, "baslik/kapat dikey eksen");
      const closeGap = m.panel.right - m.close.right;
      near(closeGap, viewport.pad, 3, "kapat dugmesinin sag kenar bosluğu");

      // Panel dolgusu TEK kaynaktan: sol kenar bosluğu beklenen dolguya esit.
      near(m.title.x - m.panel.x, viewport.pad, 3, "baslik sol dolgusu");

      // Cam icinde cam yok: dis kabuk bulanik, kartlar degil (spec §34).
      assert.notEqual(m.panelBackdrop, "none", "panel cam yuzeyini kaybetmis");
      for (const tile of m.tileStyles) {
        assert.equal(tile.backdrop, "none", "kartta backdrop-filter var - cam icinde cam");
        assert.equal(tile.shadow, "none", "kartin kendi golgesi var");
      }

      // Radius hiyerarsisi: panel > sistem karti > hizli uygulama.
      const sysRadius = m.tileStyles[0].radius;
      const appRadius = m.tileStyles[m.tileStyles.length - 1].radius;
      assert.ok(m.panelRadius > sysRadius, `panel radius (${m.panelRadius}) sistem kartindan (${sysRadius}) buyuk degil`);
      assert.ok(sysRadius > appRadius, `sistem karti radius (${sysRadius}) hizli uygulamadan (${appRadius}) buyuk degil`);

      await closeCC();
    });
  }

  await runCase("panel icerige gore yukselir, bos kutu birakmaz", async () => {
    await browser.setViewport({ width: 1440, height: 900 });
    await delay(220);
    await openCC();
    const m = await browser.evaluate(MEASURE);
    // Son kartin altindaki bosluk, panelin ust dolgusuyla ayni mertebede olmali:
    // kaldirilan Tema/Cam/Hareket bloklarindan arta kalan bosluk YOK.
    const lastBottom = Math.max(...m.apps.map((t) => t.bottom));
    const tailSpace = m.panel.bottom - lastBottom;
    assert.ok(tailSpace <= 40, `kartlarin altinda ${tailSpace.toFixed(0)}px olu bosluk var`);
    assert.equal(m.bodyScrolls, false, "bu icerik masaustunde kaydirma gerektirmemeli");
    await closeCC();
  });

  await runCase("acik ve koyu temada panel arka plandan ayrisir", async () => {
    await browser.setViewport({ width: 1440, height: 900 });
    const readings = {};
    for (const mode of ["light", "dark"]) {
      await browser.evaluate(`(async () => {
        const m = await import('/js/core/theme.js');
        m.setThemeMode(${JSON.stringify(mode)});
      })()`);
      await delay(320);
      await openCC();
      readings[mode] = await browser.evaluate(`(() => {
        const dialog = document.getElementById('control-center');
        const parse = (value) => (value.match(/[\\d.]+/g) || []).map(Number);
        const panel = getComputedStyle(dialog.querySelector('.cc-panel'));
        const tile = getComputedStyle(dialog.querySelector('.cc-tile'));
        const title = getComputedStyle(dialog.querySelector('.cc-head h2'));
        return { panelBg: parse(panel.backgroundColor), tileBg: parse(tile.backgroundColor),
                 titleColor: parse(title.color) };
      })()`);
      await closeCC();
    }

    const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Panel her iki temada da gorunur bir yuzeydir; sut beyaz kutu ya da
    // arka plana karisan seffaflik degil.
    for (const mode of ["light", "dark"]) {
      const alpha = readings[mode].panelBg[3] ?? 1;
      assert.ok(alpha >= 0.5 && alpha <= 0.95,
        `${mode}: panel opakligi ${alpha} - ya kayboluyor ya tamamen opak`);
    }
    // Acik ve koyu gercekten FARKLI olmali: tek bir sabit yuzey degil.
    const lightPanel = luminance(readings.light.panelBg);
    const darkPanel = luminance(readings.dark.panelBg);
    assert.ok(lightPanel - darkPanel > 60,
      `panel temaya tepki vermiyor (acik ${lightPanel.toFixed(0)} / koyu ${darkPanel.toFixed(0)})`);
    // Metin her temada zeminin tersinde olmali.
    assert.ok(luminance(readings.light.titleColor) < lightPanel, "acik temada baslik zeminden koyu degil");
    assert.ok(luminance(readings.dark.titleColor) > darkPanel, "koyu temada baslik zeminden acik degil");
    // Kart dolgusu panelden ayrisacak kadar var ama cam degil.
    for (const mode of ["light", "dark"]) {
      const alpha = readings[mode].tileBg[3] ?? 1;
      assert.ok(alpha >= 0.05, `${mode}: kart dolgusu ${alpha} - panelden ayrismiyor`);
    }
  });

  await runCase("odak halkasi kartin kendi radiusunu izler", async () => {
    await browser.setViewport({ width: 1440, height: 900 });
    await delay(200);
    await openCC();
    // :focus-visible programatik .focus() ile ESLESMEZ. Halkanin gercekten
    // cizildigini gormek icin klavyeyle gezinmek zorunludur.
    let focus = null;
    for (let step = 0; step < 8; step += 1) {
      await browser.key("Tab");
      await delay(90);
      focus = await browser.evaluate(`(() => {
        const el = document.activeElement;
        if (!el || !el.classList.contains('cc-tile')) return null;
        const s = getComputedStyle(el);
        return { focusVisible: el.matches(':focus-visible'),
                 outlineWidth: parseFloat(s.outlineWidth), outlineStyle: s.outlineStyle,
                 outlineColor: s.outlineColor, radius: parseFloat(s.borderTopLeftRadius),
                 label: el.textContent.trim().slice(0, 20) };
      })()`);
      if (focus) break;
    }
    assert.ok(focus, "Tab ile hicbir kutucuga odaklanilamadi");
    assert.equal(focus.focusVisible, true, "kart klavye odaginda :focus-visible eslesmiyor");
    assert.notEqual(focus.outlineStyle, "none", "odak gostergesi kaldirilmis");
    assert.ok(focus.outlineWidth >= 2, `odak halkasi ${focus.outlineWidth}px - en az 2px olmali`);
    // Halka kartin GERCEK gorsel sahibine cizilir; kart yuvarlak, halka da oyle.
    assert.ok(focus.radius >= 16, "kart radiusu kaybolmus - halka kare gorunur");
    // Tarayicinin varsayilan mavi outline'i degil, semantic accent.
    assert.notEqual(focus.outlineColor, "rgb(0, 95, 204)", "tarayici varsayilan mavi outline'i kullaniliyor");
    await closeCC();
  });

  await runCase("konsol temiz kalir", async () => {
    // DAR ve GEREKCELI tek istisna: /favicon.ico. index.html zaten
    // <link rel="icon" href="data:,"> tanimlar; bu istek yalnizca harness
    // klavye testi icin sekmeyi one getirdiginde (Page.bringToFront) olusur,
    // sayfanin kendi davranisi degildir. Baska HICBIR hata hosgorulmez.
    const favicon = /favicon\.ico/;
    const isFaviconNoise = (line) =>
      favicon.test(line) || /404 \(Not Found\)/.test(line);
    const filtered = {
      consoleErrors: browser.consoleErrors.filter((line) => !isFaviconNoise(line)),
      consoleWarnings: browser.consoleWarnings,
      localNetworkErrors: browser.localNetworkErrors.filter((line) => !favicon.test(line)),
    };
    // Istisnanin gercekten favicon oldugunu KANITLA: 404 varsa favicon olmali.
    for (const line of browser.localNetworkErrors) {
      assert.match(line, favicon, `beklenmeyen ag hatasi: ${line}`);
    }
    assertCleanDiagnostics(filtered, "kontrol merkezi gorsel");
  });
} finally {
  await browser.close();
  await server.close();
}

const passed = cases.filter((entry) => entry.ok).length;
console.log(`\nKontrol Merkezi (gorsel): ${passed}/${cases.length} gecti`);
if (passed === cases.length) {
  console.log("✓ Alti olcude duzen, hiyerarsi, tema ayrisimi ve odak dogrulandi");
}
