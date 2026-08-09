#!/usr/bin/env node
/**
 * RAVZA BOOKS KITAPLIGI - GLOBAL TEMA TESTI.
 *
 * Kitaplik ekrani GLOBAL tema motorunu (Acik/Koyu/Sistem) izlemeli.
 * Okuma temalari (Beyaz/Kagit/Gece/Siyah) AYRI bir sistemdir ve bu ekrandan
 * etkilenmemelidir.
 *
 * Dogrulananlar:
 *   - Acik ve koyu gercekten FARKLI yuzeyler uretir,
 *   - metin her iki temada zeminin tersinde ve okunabilir kontrastta,
 *   - KITAP KAPAKLARINA hicbir filtre/invert uygulanmaz,
 *   - kitapliga ozel ikinci bir tema tercihi (localStorage) YOKTUR,
 *   - Sistem modu isletim sistemi tercihini izler,
 *   - tema kitaplik acikken degistiginde yeniden yukleme gerekmez,
 *   - acilista acik/bej flash olusmaz.
 *
 * Kullanim: node ./scripts/test-books-library-theme.mjs
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
const browser = await ThemeTestBrowser.launch("books-library-theme");

async function openLibrary() {
  await browser.evaluate("window.navigate('ravza-books')");
  await browser.waitFor("document.body.dataset.currentRoute === 'ravza-books'", "kitaplik", 30000);
  await browser.waitFor("!!document.querySelector('.library-book-card')", "kitaplar", 30000);
  await delay(700);
}

async function gotoLauncher() {
  await browser.navigate("/", "!!document.querySelector('#launcherGrid .launcher-app')");
  await delay(600);
}

const setTheme = (mode) => browser.evaluate(
  `(async () => { const m = await import('/js/core/theme.js'); m.setThemeMode(${JSON.stringify(mode)}); })()`);

/** Kitaplik yuzeylerinin GERCEK hesaplanmis renkleri. */
const READ = `(() => {
  const root = document.querySelector('.library-root');
  if (!root) return null;
  const rgb = (value) => (String(value).match(/[\\d.]+/g) || []).map(Number);
  // WCAG bagil parlaklik.
  const lum = ([r, g, b]) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

  const card = document.querySelector('.library-book-card');
  const title = document.querySelector('.library-book-copy > strong');
  const author = document.querySelector('.library-book-copy');
  const heading = document.querySelector('.library-section-heading h2');
  const cover = document.querySelector('.library-cover-image');
  const shelf = document.querySelector('.library-shelf');
  const rootStyle = getComputedStyle(root);
  const bg = rgb(rootStyle.backgroundColor);

  const coverStyle = cover ? getComputedStyle(cover) : null;
  return {
    bg,
    bgLum: +lum(bg).toFixed(4),
    cream: rootStyle.getPropertyValue('--library-cream').trim(),
    ink: rootStyle.getPropertyValue('--library-ink').trim(),
    titleContrast: title ? +ratio(rgb(getComputedStyle(title).color), bg).toFixed(2) : null,
    headingContrast: heading ? +ratio(rgb(getComputedStyle(heading).color), bg).toFixed(2) : null,
    authorContrast: author ? +ratio(rgb(getComputedStyle(author).color), bg).toFixed(2) : null,
    // Kapaga uygulanan gorsel donusumler - hepsi "none" olmali.
    coverFilter: coverStyle ? coverStyle.filter : null,
    coverOpacity: coverStyle ? coverStyle.opacity : null,
    coverMix: coverStyle ? coverStyle.mixBlendMode : null,
    shelfPresent: !!shelf,
    shelfBg: shelf ? getComputedStyle(shelf).backgroundImage.slice(0, 40) : null,
    cardCount: document.querySelectorAll('.library-book-card').length,
  };
})()`;

try {
  await browser.setViewport({ width: 1440, height: 900 });

  let light = null;
  let dark = null;

  await runCase("acik tema: kitaplik acik yuzey, metin okunabilir", async () => {
    await gotoLauncher();
    await setTheme("light");
    await delay(300);
    await openLibrary();
    light = await browser.evaluate(READ);
    assert.ok(light, "kitaplik koku bulunamadi");
    assert.ok(light.cardCount > 0, "kitap karti yok");
    assert.ok(light.bgLum > 0.5, `acik temada zemin karanlik (lum ${light.bgLum})`);
    assert.ok(light.titleContrast >= 4.5, `kitap basligi kontrasti ${light.titleContrast}`);
    assert.ok(light.headingContrast >= 4.5, `bolum basligi kontrasti ${light.headingContrast}`);
    assert.ok(light.authorContrast >= 4.5, `yazar metni kontrasti ${light.authorContrast}`);
  });

  await runCase("koyu tema: kitaplik koyu yuzey, metin okunabilir", async () => {
    await setTheme("dark");
    await delay(600);
    dark = await browser.evaluate(READ);
    assert.ok(dark.bgLum < 0.1, `koyu temada zemin aydinlik (lum ${dark.bgLum})`);
    // Saf siyah degil: kitapla uyumlu sicak komur istendi.
    assert.ok(dark.bg.some((channel) => channel > 12), `zemin saf siyaha cok yakin: ${dark.bg}`);
    assert.ok(dark.titleContrast >= 4.5, `kitap basligi kontrasti ${dark.titleContrast}`);
    assert.ok(dark.headingContrast >= 4.5, `bolum basligi kontrasti ${dark.headingContrast}`);
    assert.ok(dark.authorContrast >= 4.5, `yazar metni kontrasti ${dark.authorContrast}`);
  });

  await runCase("acik ve koyu GERCEKTEN farkli", async () => {
    assert.notEqual(light.cream, dark.cream, "tema degisince zemin tokeni ayni kaldi");
    assert.notEqual(light.ink, dark.ink, "tema degisince metin tokeni ayni kaldi");
    assert.ok(light.bgLum - dark.bgLum > 0.5,
      `parlaklik farki yetersiz: ${light.bgLum} / ${dark.bgLum}`);
  });

  await runCase("kitap kapaklarina HICBIR filtre uygulanmaz", async () => {
    for (const [label, reading] of [["acik", light], ["koyu", dark]]) {
      assert.equal(reading.coverFilter, "none", `${label}: kapaga filter uygulanmis (${reading.coverFilter})`);
      assert.equal(reading.coverMix, "normal", `${label}: kapaga mix-blend-mode uygulanmis`);
      assert.equal(Number(reading.coverOpacity), 1, `${label}: kapak saydamlastirilmis`);
    }
  });

  await runCase("tema kitaplik ACIKKEN degisir, yeniden yukleme gerekmez", async () => {
    // Kitaplik zaten acik; sadece temayi degistir ve ayni document'te olc.
    await setTheme("light");
    await delay(500);
    const nowLight = await browser.evaluate(READ);
    assert.ok(nowLight.bgLum > 0.5, "kitaplik acikken acik temaya donmedi");
    assert.equal(nowLight.cardCount, light.cardCount, "tema degisimi kitap listesini bozdu");
    await setTheme("dark");
    await delay(500);
    const nowDark = await browser.evaluate(READ);
    assert.ok(nowDark.bgLum < 0.1, "kitaplik acikken koyu temaya gecmedi");
    assert.equal(nowDark.cardCount, light.cardCount, "tema degisimi kitap listesini bozdu");
  });

  await runCase("kitapliga OZEL tema tercihi olusturulmaz", async () => {
    const keys = await browser.evaluate(`(() => {
      const all = [...Array(localStorage.length).keys()].map((i) => localStorage.key(i));
      return all.filter((key) => /book|kitap|librar/i.test(key) && /theme|dark|tema/i.test(key));
    })()`);
    assert.deepEqual(keys, [], `kitapliga ozel tema anahtari acilmis: ${keys.join(", ")}`);
  });

  await runCase("Sistem modu isletim sistemi tercihini izler", async () => {
    await setTheme("system");
    await browser.emulateColorScheme("dark");
    await delay(600);
    const systemDark = await browser.evaluate(READ);
    assert.ok(systemDark.bgLum < 0.1, `Sistem+koyu'da kitaplik acik kaldi (lum ${systemDark.bgLum})`);

    await browser.emulateColorScheme("light");
    await delay(600);
    const systemLight = await browser.evaluate(READ);
    assert.ok(systemLight.bgLum > 0.5, `Sistem+acik'ta kitaplik koyu kaldi (lum ${systemLight.bgLum})`);
    await browser.emulateColorScheme("light");
  });

  await runCase("acilista acik/bej flash olusmaz", async () => {
    await setTheme("dark");
    await delay(300);
    // Tema durumu head'deki senkron bootstrap ile ILK BOYAMADAN once yazilir.
    // Bunu tam sayfa yuklemesinde, kitaplik cizilmeden once olcuyoruz.
    await browser.navigate("/?page=ravza-books", "document.readyState !== 'loading'");
    const early = await browser.evaluate(`(() => ({
      bodyDark: document.body?.classList.contains('dark') ?? null,
      resolved: document.body?.dataset.resolvedTheme ?? null,
      bodyBg: document.body ? getComputedStyle(document.body).backgroundColor : null,
    }))()`);
    assert.equal(early.bodyDark, true, "ilk boyamada body koyu isaretli degil");
    assert.equal(early.resolved, "dark", "ilk boyamada cozulen tema koyu degil");
    const channels = (early.bodyBg.match(/[\d.]+/g) || []).map(Number);
    assert.ok(channels.slice(0, 3).every((c) => c < 90),
      `ilk boyamada govde zemini acik: ${early.bodyBg}`);
  });

  await runCase("okuma temalari kitaplik temasindan BAGIMSIZ", async () => {
    // Reader'in kendi tema anahtari global temadan etkilenmemeli.
    const before = await browser.evaluate(
      `(() => [...Array(localStorage.length).keys()].map((i) => localStorage.key(i))
        .filter((k) => /reader/i.test(k) && /theme/i.test(k))
        .map((k) => k + '=' + localStorage.getItem(k)))()`);
    await setTheme("light");
    await delay(400);
    await setTheme("dark");
    await delay(400);
    const after = await browser.evaluate(
      `(() => [...Array(localStorage.length).keys()].map((i) => localStorage.key(i))
        .filter((k) => /reader/i.test(k) && /theme/i.test(k))
        .map((k) => k + '=' + localStorage.getItem(k)))()`);
    assert.deepEqual(after, before, "global tema degisimi okuma temasini degistirdi");
  });

  await runCase("mobilde koyu tema tasma yapmaz", async () => {
    await browser.setViewport({ width: 390, height: 844 });
    await delay(400);
    await gotoLauncher();
    await setTheme("dark");
    await delay(300);
    await openLibrary();
    const mobile = await browser.evaluate(`(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      bg: getComputedStyle(document.querySelector('.library-root')).backgroundColor,
      cards: document.querySelectorAll('.library-book-card').length,
    }))()`);
    assert.equal(mobile.overflow, false, "mobilde yatay tasma var");
    assert.ok(mobile.cards > 0, "mobilde kitap karti yok");
    const channels = (mobile.bg.match(/[\d.]+/g) || []).map(Number);
    assert.ok(channels.slice(0, 3).every((c) => c < 60), `mobil koyu zemin acik: ${mobile.bg}`);
  });

  await runCase("konsol temiz kalir", async () => {
    assertCleanDiagnostics(browser, "kitaplik temasi");
  });
} finally {
  await browser.close();
  await server.close();
}

const passed = cases.filter((entry) => entry.ok).length;
console.log(`\nKitaplik temasi: ${passed}/${cases.length} gecti`);
if (passed === cases.length) {
  console.log("✓ Global tema, kontrast, kapak korumasi ve reader bagimsizligi dogrulandi");
}
