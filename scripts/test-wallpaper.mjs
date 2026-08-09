#!/usr/bin/env node
/**
 * ARKA PLAN (WALLPAPER) SISTEMI TESTI.
 *
 * Iki katman:
 *   1. SAF - chooseRandomWallpaper ve resolveWallpaperId sozlesmeleri, gercek
 *      bir spy ile. Sabit modda rastgele secicinin CAGRILMADIGI burada
 *      kanitlanir (spec §8, §42): resolver'a enjekte edilen `random`
 *      fonksiyonu hic cagrilmazsa rastgele bir secim uretilmis olamaz.
 *   2. TARAYICI - 127.0.0.1:8000 uzerinde gercek kalicilik: sabit secim,
 *      oturum kararliligi, yeni oturum, Sabitle, kurtarma ve migration.
 *
 * Kullanim: node ./scripts/test-wallpaper.mjs
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

/* ---------------------------------------------------------------- SAF ---- */

/** Node'da web storage yok; modul globalThis uzerinden okudugu icin stub yeter. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    snapshot: () => Object.fromEntries(map),
  };
}

function withStorage(local = {}, session = {}) {
  const localStore = memoryStorage(local);
  const sessionStore = memoryStorage(session);
  globalThis.localStorage = localStore;
  globalThis.sessionStorage = sessionStore;
  return { localStore, sessionStore };
}

const { chooseRandomWallpaper, resolveWallpaperId, resetRuntimeWallpaper, WALLPAPER_KEYS } =
  await import("../js/core/wallpaper.js");

const IDS = ["anneanne", "asansor", "fantastik", "galata"];

await runCase("chooseRandomWallpaper: onceki gorseli hariç tutar", () => {
  const ids = ["a", "b"];
  assert.equal(chooseRandomWallpaper(ids, "a", () => 0), "b");
  assert.equal(chooseRandomWallpaper(ids, "b", () => 0), "a");
});

await runCase("chooseRandomWallpaper: tek aday ve bos kayit defteri", () => {
  assert.equal(chooseRandomWallpaper(["solo"], "solo", () => 0), "solo");
  assert.equal(chooseRandomWallpaper([], "x", () => 0), null);
  assert.equal(chooseRandomWallpaper(null, "x", () => 0), null);
});

await runCase("chooseRandomWallpaper: kaynak diziyi DEGISTIRMEZ", () => {
  const ids = [...IDS];
  chooseRandomWallpaper(ids, "galata", () => 0.5);
  assert.deepEqual(ids, IDS, "kaynak dizi degistirildi");
});

await runCase("chooseRandomWallpaper: her zaman gecerli bir oge dondurur", () => {
  for (const value of [0, 0.25, 0.5, 0.75, 0.999999, 1, -1, NaN, Infinity]) {
    const chosen = chooseRandomWallpaper(IDS, null, () => value);
    assert.ok(IDS.includes(chosen), `gecersiz sonuc (${value}): ${chosen}`);
  }
  // Bozuk ogeler ayiklanir.
  assert.equal(chooseRandomWallpaper([null, "", 0, "ok"], null, () => 0), "ok");
});

await runCase("SABIT modda rastgele secici CAGRILMAZ (spy)", () => {
  let calls = 0;
  const spy = () => { calls += 1; return 0; };

  // 1. Gecerli sabit secim.
  withStorage({ [WALLPAPER_KEYS.mode]: "fixed", [WALLPAPER_KEYS.fixed]: "galata" });
  assert.equal(resolveWallpaperId(IDS, { random: spy }), "galata");
  assert.equal(calls, 0, "gecerli sabit secimde rastgele cagrildi");

  // 2. Hic tercih yok (yeni kullanici) -> varsayilan, yine rastgele YOK.
  withStorage({});
  const fresh = resolveWallpaperId(IDS, { random: spy });
  assert.equal(calls, 0, "tercihsiz kullanicida rastgele cagrildi");
  assert.equal(fresh, IDS[0], "varsayilan deterministik degil");

  // 3. Kayitli sabit id kayit defterinden SILINMIS.
  withStorage({ [WALLPAPER_KEYS.mode]: "fixed", [WALLPAPER_KEYS.fixed]: "silinmis-gorsel" });
  const repaired = resolveWallpaperId(IDS, { random: spy });
  assert.equal(calls, 0, "silinmis sabit id'de rastgele cagrildi");
  assert.equal(repaired, IDS[0], "guvenli varsayilana dusmedi");
});

await runCase("SABIT mod ayni depoda HEP ayni sonucu verir", () => {
  withStorage({ [WALLPAPER_KEYS.mode]: "fixed", [WALLPAPER_KEYS.fixed]: "fantastik" });
  const reads = Array.from({ length: 25 }, () => resolveWallpaperId(IDS));
  assert.deepEqual([...new Set(reads)], ["fantastik"], "sabit mod kararsiz");
});

await runCase("RASTGELE mod: AYNI document icinde yeniden zar ATILMAZ", () => {
  withStorage({ [WALLPAPER_KEYS.mode]: "random-session" });
  resetRuntimeWallpaper();
  const first = resolveWallpaperId(IDS, { random: () => 0.4 });

  // Sonraki cagrilar SPA gezinme / yeniden render'i temsil eder: ayni deger.
  let calls = 0;
  const spy = () => { calls += 1; return 0.9; };
  for (let index = 0; index < 10; index += 1) {
    assert.equal(resolveWallpaperId(IDS, { random: spy }), first, "document icinde gorsel degisti");
  }
  assert.equal(calls, 0, "document icinde rastgele yeniden cagrildi");
});

await runCase("RASTGELE mod: HER document yuklemesi yeni gorsel secer", () => {
  withStorage({ [WALLPAPER_KEYS.mode]: "random-session" });
  const seen = [];
  // resetRuntimeWallpaper() gercek bir sayfa yenilemesini temsil eder:
  // modul kapsamindaki secim sifirlanir, tercihler (localStorage) kalir.
  for (let load = 0; load < 8; load += 1) {
    resetRuntimeWallpaper();
    seen.push(resolveWallpaperId(IDS));
  }
  assert.equal(seen.filter(Boolean).length, seen.length, "bir yuklemede gorsel secilemedi");
  for (let index = 1; index < seen.length; index += 1) {
    assert.notEqual(seen[index], seen[index - 1],
      `${index}. yuklemede ayni gorsel arka arkaya geldi: ${seen[index]}`);
  }
  assert.ok(new Set(seen).size > 1, "yenilemeler hep ayni gorseli verdi");
});

await runCase("RASTGELE sonucu depoya YAZILMAZ", () => {
  const { localStore, sessionStore } = withStorage({ [WALLPAPER_KEYS.mode]: "random-session" });
  resetRuntimeWallpaper();
  const chosen = resolveWallpaperId(IDS);
  // Yalnizca TERCIH kalici: mod ve "bir onceki". Secimin kendisi degil.
  assert.equal(sessionStore.getItem(WALLPAPER_KEYS.legacySession), null, "oturum anahtarina yazildi");
  assert.equal(localStore.getItem(WALLPAPER_KEYS.fixed), null, "rastgele secim sabit gibi kaydedildi");
  assert.equal(localStore.getItem(WALLPAPER_KEYS.previous), chosen, "tekrar onleme bilgisi yazilmadi");
});

await runCase("ESKI oturum anahtari yenilemede gorseli SABITLEMEZ", () => {
  const { sessionStore } = withStorage(
    { [WALLPAPER_KEYS.mode]: "random-session" },
    { [WALLPAPER_KEYS.legacySession]: "galata" },
  );
  const loads = [];
  for (let load = 0; load < 6; load += 1) {
    resetRuntimeWallpaper();
    loads.push(resolveWallpaperId(IDS));
  }
  assert.ok(new Set(loads).size > 1, "eski oturum anahtari gorseli sabitledi");
  assert.equal(sessionStore.getItem(WALLPAPER_KEYS.legacySession), null, "eski anahtar temizlenmedi");
});

await runCase("RASTGELE mod: bir onceki yuklemenin gorselinden KACINIR", () => {
  const { localStore } = withStorage(
    { [WALLPAPER_KEYS.mode]: "random-session", [WALLPAPER_KEYS.previous]: "galata" },
  );
  resetRuntimeWallpaper();
  // random=0 ilk adayi secer; "galata" aday listesinden cikarilmis olmali.
  const chosen = resolveWallpaperId(IDS, { random: () => 0 });
  assert.notEqual(chosen, "galata", "bir onceki yuklemenin gorseli tekrar secildi");
  assert.equal(localStore.getItem(WALLPAPER_KEYS.previous), chosen, "tekrar onleme bilgisi guncellenmedi");
});

await runCase("bozuk depo cokertmez", () => {
  withStorage({ [WALLPAPER_KEYS.mode]: "{bozuk-json", [WALLPAPER_KEYS.fixed]: "" });
  assert.equal(resolveWallpaperId(IDS), IDS[0]);
  withStorage({ [WALLPAPER_KEYS.mode]: "random-session" });
  resetRuntimeWallpaper();
  assert.ok(IDS.includes(resolveWallpaperId(IDS)), "rastgele modda gecerli gorsel uretilmedi");
  // Depolama tamamen erisilemez olsa bile cokmemeli.
  globalThis.localStorage = null;
  globalThis.sessionStorage = null;
  assert.equal(resolveWallpaperId(IDS), IDS[0]);
});

await runCase("migration: eski tek anahtarli secim SABIT kabul edilir", () => {
  const { localStore } = withStorage({ [WALLPAPER_KEYS.legacy]: "galata" });
  let calls = 0;
  assert.equal(resolveWallpaperId(IDS, { random: () => { calls += 1; return 0; } }), "galata");
  assert.equal(calls, 0, "migration sirasinda rastgele cagrildi");
  assert.equal(localStore.getItem(WALLPAPER_KEYS.mode), "fixed", "mod sabit yazilmadi");
  assert.equal(localStore.getItem(WALLPAPER_KEYS.fixed), "galata", "eski secim tasinmadi");
});

/* ----------------------------------------------------------- TARAYICI ---- */

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
  const thumbs = [...node.querySelectorAll('[data-wp-select]')];
  const randomTile = node.querySelector('[data-wp-random]');
  const tiles = [...node.querySelectorAll('.wp-thumb')];
  return {
    open: node.open === true,
    thumbs: thumbs.length,
    selectedIds: thumbs.filter(b => b.classList.contains('is-selected')).map(b => b.dataset.wpSelect),
    showingIds: thumbs.filter(b => b.classList.contains('is-showing')).map(b => b.dataset.wpSelect),
    pressed: thumbs.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.wpSelect),
    randomFirst: tiles[0] === randomTile,
    randomSelected: randomTile?.classList.contains('is-selected') === true,
    randomPressed: randomTile?.getAttribute('aria-pressed') === 'true',
    randomHasImage: !!randomTile?.querySelector('img'),
    pinVisible: !node.querySelector('#wp-actions')?.hidden,
    modeBadgeVisible: !node.querySelector('#wp-current-mode')?.hidden,
    currentName: node.querySelector('#wp-current-name')?.textContent.trim(),
    names: [...node.querySelectorAll('.wp-thumb-name')].map(n => n.textContent.trim()),
    lazy: [...node.querySelectorAll('.wp-thumb-frame img')].every(img => img.loading === 'lazy'),
    buttons: thumbs.every(b => b.tagName === 'BUTTON'),
    // Ustte ayri mod kontrolu OLMAMALI (spec §3, §53).
    legacyModeControls: node.querySelectorAll('[data-wp-mode], .wp-segmented, [data-wp-randomize]').length,
  };
})()`;

const STAGE_THEME = `document.getElementById('anaSayfaHeroStage')?.dataset.homeHeroTheme || null`;
const STORE = `(() => ({
  mode: localStorage.getItem('ravzaYusufWallpaperMode'),
  fixed: localStorage.getItem('ravzaYusufWallpaperFixed'),
  previous: localStorage.getItem('ravzaYusufWallpaperPrevious'),
  legacySession: sessionStorage.getItem('ravzaYusufWallpaperSession'),
}))()`;

/* Etkin mod MODULDEN okunur. Eksik ya da bozuk bir deger okuma aninda
   "fixed"e normalize edilir; modul depoya gereksiz yazma yapmaz. Bu yuzden
   ham localStorage degerini degil, sistemin GERCEKTEN kullandigi modu olcuyoruz. */
const EFFECTIVE_MODE = `(async () => (await import('/js/core/wallpaper.js')).getWallpaperMode())()`;

/* GERCEK sayfa yuklemesi. gotoHome() zaten tam bir document navigasyonudur:
   modul kapsami sifirlanir, localStorage kalir - yani F5 ile ayni sey. */
const reload = gotoHome;

/** O an EKRANDA olan arka planin kimligi (gorulen sey, depo degil). */
const CURRENT = STAGE_THEME;

try {
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await runCase("panel: Rastgele karti ILK sirada, ustte mod kontrolu YOK", async () => {
    await gotoHome();
    await browser.evaluate("localStorage.clear(); sessionStorage.clear()");
    await gotoHome();
    await openPanel();
    const panel = await browser.evaluate(PANEL);
    const registrySize = await browser.evaluate(
      `(async () => (await import('/data/ana-sayfa-gorselleri.js')).ANA_SAYFA_GORSELLERI.length)()`);
    assert.equal(panel.legacyModeControls, 0, "ustte eski mod kontrolu / Rastgele Degistir duruyor");
    assert.equal(panel.randomFirst, true, "Rastgele karti galerinin ilk ogesi degil");
    assert.equal(panel.randomHasImage, false, "Rastgele karti bir gorsel dosyasi tasiyor");
    assert.equal(panel.thumbs, registrySize, `galeri ${panel.thumbs}/${registrySize} gorsel gosteriyor`);
    assert.equal(panel.buttons, true, "kucuk resimler gercek <button> olmali");
    assert.equal(panel.lazy, true, "kucuk resimler lazy yuklenmeli");
    assert.ok(panel.names.every((name) => name && !name.includes("-")), `ham ID gosteriliyor: ${panel.names}`);
  });

  await runCase("varsayilan: tercih yokken SABIT mod", async () => {
    assert.equal(await browser.evaluate(EFFECTIVE_MODE), "fixed",
      "tercihi olmayan kullanici sabit modda baslamiyor");
    const panel = await browser.evaluate(PANEL);
    assert.equal(panel.randomSelected, false, "varsayilan olarak Rastgele secili");
    assert.equal(panel.pinVisible, false, "sabit modda Sabitle dugmesi gorunuyor");
  });

  await runCase("gorsel secmek = SABIT mod, aninda uygulanir", async () => {
    const target = await browser.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('[data-wp-select]')];
      const current = buttons.find(b => b.classList.contains('is-selected'))?.dataset.wpSelect;
      const other = buttons.find(b => b.dataset.wpSelect !== current);
      other.click();
      return other.dataset.wpSelect;
    })()`);
    await delay(900);
    const panel = await browser.evaluate(PANEL);
    assert.deepEqual(panel.selectedIds, [target], `secim uygulanmadi: ${panel.selectedIds}`);
    assert.deepEqual(panel.pressed, [target], "aria-pressed secimle uyusmuyor");
    assert.equal(panel.randomSelected, false, "gorsel secilince Rastgele hala secili");
    assert.equal(panel.pinVisible, false, "sabit modda Sabitle gorunuyor");
    assert.equal(await browser.evaluate(STAGE_THEME), target, "launcher arka plani degismedi");
    const store = await browser.evaluate(STORE);
    assert.equal(store.mode, "fixed", `manuel secim sabit yapmali, gelen ${store.mode}`);
    assert.equal(store.fixed, target, "secim kalici kaydedilmedi");
  });

  await runCase("SABIT: yenileme, gezinme ve YENI OTURUM sonrasi ayni", async () => {
    const chosen = (await browser.evaluate(STORE)).fixed;

    await gotoHome();
    assert.equal(await browser.evaluate(STAGE_THEME), chosen, "yenilemeden sonra degisti");

    await browser.evaluate("window.navigate && window.navigate('ravza-books')");
    await browser.waitFor("document.body.dataset.currentRoute === 'ravza-books'", "kitaplik", 30000);
    await browser.evaluate("window.navigate && window.navigate('ana-sayfa')");
    await browser.waitFor("document.body.dataset.currentRoute === 'ana-sayfa'", "ana sayfa", 30000);
    await delay(600);
    assert.equal(await browser.evaluate(STAGE_THEME), chosen, "gezinme arka plani degistirdi");

    // Bes ardisik gercek yenileme: sabit gorsel HIC degismemeli (§32).
    for (let load = 0; load < 5; load += 1) {
      await reload();
      assert.equal(await browser.evaluate(CURRENT), chosen, `${load + 1}. yenilemede sabit gorsel degisti`);
    }
    assert.equal((await browser.evaluate(STORE)).fixed, chosen, "sabit kayit bozuldu");
  });

  await runCase("SABIT modda rastgele yolu CALISMAZ (gozlemlenebilir kanit)", async () => {
    // Rastgele yol calissaydi `previous` anahtarini yazardi. Bircok yeni
    // oturum acilir; anahtar hic olusmamali ve gorsel hic degismemeli.
    await browser.evaluate(`localStorage.removeItem('ravzaYusufWallpaperPrevious')`);
    const chosen = (await browser.evaluate(STORE)).fixed;
    for (let visit = 0; visit < 3; visit += 1) {
      await reload();
      const store = await browser.evaluate(STORE);
      assert.equal(await browser.evaluate(CURRENT), chosen, `${visit}. yenilemede gorsel degisti`);
      assert.equal(store.previous, null, "sabit modda rastgele yolu calisti (previous yazildi)");
      assert.equal(store.legacySession, null, "sabit modda eski oturum anahtari yazildi");
    }
  });

  await runCase("RASTGELE karti: mod secer, oturum gorseli belirlenir", async () => {
    await openPanel();
    await browser.evaluate(`document.querySelector('[data-wp-random]').click()`);
    await delay(900);
    const store = await browser.evaluate(STORE);
    const current = await browser.evaluate(CURRENT);
    assert.equal(store.mode, "random-session", `mod ${store.mode}`);
    assert.ok(current, "rastgele mod gorsel uygulamadi");
    const panel = await browser.evaluate(PANEL);
    assert.equal(panel.randomSelected, true, "Rastgele karti secili degil");
    assert.equal(panel.randomPressed, true, "Rastgele karti aria-pressed=false");
    assert.equal(panel.selectedIds.length, 0, "rastgele modda bir gorsel de 'secili' isaretlenmis");
    assert.deepEqual(panel.showingIds, [current], "o an gosterilen gorsel isaretlenmemis");
    assert.equal(panel.pinVisible, true, "rastgele modda Sabitle gorunmuyor");
    assert.equal(panel.modeBadgeVisible, true, "rastgele modda mod rozeti gorunmuyor");
  });

  await runCase("RASTGELE: ayni document icinde hicbir sey degistirmez", async () => {
    const pinned = await browser.evaluate(CURRENT);
    await browser.evaluate("window.closeWallpaperPanel && window.closeWallpaperPanel()");
    await delay(200);

    // Rota degisimi.
    await browser.evaluate("window.navigate && window.navigate('ezber-merkezi')");
    await browser.waitFor("document.body.dataset.currentRoute === 'ezber-merkezi'", "ezber", 30000);
    await browser.evaluate("window.navigate && window.navigate('ana-sayfa')");
    await browser.waitFor("document.body.dataset.currentRoute === 'ana-sayfa'", "ana sayfa", 30000);
    await delay(500);
    assert.equal(await browser.evaluate(CURRENT), pinned, "SPA gezinme arka plani degistirdi");

    // Kontrol Merkezi + Spotlight.
    await browser.evaluate("window.openControlCenter && window.openControlCenter()");
    await delay(250);
    await browser.evaluate("window.closeControlCenter && window.closeControlCenter()");
    await delay(250);

    // Yeniden boyutlandirma.
    await browser.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(400);
    await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await delay(400);

    // Tema degisimi.
    await browser.evaluate(`(async () => {
      const m = await import('/js/core/theme.js');
      m.setThemeMode('dark');
    })()`);
    await delay(400);

    assert.equal((await browser.evaluate(STORE)).mode, "random-session", "mod degisti");
    assert.equal(await browser.evaluate(CURRENT), pinned, "sahnedeki gorsel degisti");
  });

  await runCase("RASTGELE: HER yenilemede yeni gorsel gelir", async () => {
    // Bu turun en kritik kabul kriteri (§30): dort ardisik GERCEK yenileme,
    // her biri bir oncekinden farkli olmali.
    const seen = [await browser.evaluate(CURRENT)];
    for (let load = 0; load < 4; load += 1) {
      await reload();
      const current = await browser.evaluate(CURRENT);
      assert.ok(current, `${load + 1}. yenilemede gorsel uygulanmadi`);
      assert.notEqual(current, seen[seen.length - 1],
        `${load + 1}. yenilemede AYNI gorsel arka arkaya geldi: ${current}`);
      assert.equal((await browser.evaluate(STORE)).mode, "random-session", "mod yenilemede kaybedildi");
      seen.push(current);
    }
    assert.ok(new Set(seen).size > 2, `yenilemeler yeterince cesitlenmedi: ${seen.join(", ")}`);
  });

  await runCase("RASTGELE sonucu depoda TASINMIYOR", async () => {
    const store = await browser.evaluate(STORE);
    const current = await browser.evaluate(CURRENT);
    // Kalici olan yalnizca tercih: mod + tekrar onleme bilgisi.
    assert.equal(store.legacySession, null, "eski oturum anahtari hala yaziliyor");
    assert.notEqual(store.mode, "fixed", "rastgele mod sabite cevrildi");
    assert.equal(store.previous, current, "tekrar onleme bilgisi guncel degil");
  });

  await runCase("ESKI oturum anahtari enjekte edilse bile gorseli SABITLEMEZ", async () => {
    const before = await browser.evaluate(CURRENT);
    await browser.evaluate(
      `sessionStorage.setItem('ravzaYusufWallpaperSession', ${JSON.stringify("galata")})`);
    const seen = [];
    for (let load = 0; load < 3; load += 1) {
      await reload();
      seen.push(await browser.evaluate(CURRENT));
    }
    assert.ok(new Set(seen).size > 1, `eski anahtar gorseli sabitledi: ${seen.join(", ")}`);
    assert.equal((await browser.evaluate(STORE)).legacySession, null, "eski anahtar temizlenmedi");
    assert.ok(before, "onceki gorsel okunamadi");
  });

  await runCase("Sabitle: gorsel degismez, mod SABIT olur", async () => {
    await openPanel();
    const beforeStage = await browser.evaluate(CURRENT);
    const currentId = beforeStage;
    await browser.evaluate(`document.querySelector('[data-wp-pin]').click()`);
    await delay(600);

    const store = await browser.evaluate(STORE);
    assert.equal(store.mode, "fixed", `Sabitle sonrasi mod ${store.mode}`);
    assert.equal(store.fixed, currentId, "sabitlenen gorsel yanlis");
    assert.equal(await browser.evaluate(CURRENT), beforeStage, "Sabitle gorseli degistirdi");

    const panel = await browser.evaluate(PANEL);
    assert.equal(panel.pinVisible, false, "sabitledikten sonra Sabitle hala gorunuyor");
    assert.equal(panel.randomSelected, false, "sabitledikten sonra Rastgele hala secili");
    assert.deepEqual(panel.selectedIds, [currentId], "sabitlenen gorsel secili isaretlenmedi");

    // Uc ardisik yenileme: sabitlenen gorsel degismemeli (§36).
    for (let load = 0; load < 3; load += 1) {
      await reload();
      assert.equal(await browser.evaluate(CURRENT), currentId,
        `${load + 1}. yenilemede sabitlenen gorsel degisti`);
    }
  });

  await runCase("rastgele moddan manuel secim SABIT'e dondurur", async () => {
    await openPanel();
    await browser.evaluate(`document.querySelector('[data-wp-random]').click()`);
    await delay(800);
    const target = await browser.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('[data-wp-select]')];
      const showing = buttons.find(b => b.classList.contains('is-showing'))?.dataset.wpSelect;
      const other = buttons.find(b => b.dataset.wpSelect !== showing);
      other.click();
      return other.dataset.wpSelect;
    })()`);
    await delay(900);
    const store = await browser.evaluate(STORE);
    const panel = await browser.evaluate(PANEL);
    assert.equal(store.mode, "fixed", `manuel secim sonrasi mod ${store.mode}`);
    assert.equal(store.fixed, target, "manuel secim kaydedilmedi");
    assert.equal(panel.randomSelected, false, "Rastgele karti hala secili");
    assert.deepEqual(panel.selectedIds, [target], "secili gorsel yanlis");
    assert.equal(await browser.evaluate(CURRENT), target, "sahne guncellenmedi");

    // Yenileme sonrasi da ayni kalmali (§37).
    await reload();
    assert.equal(await browser.evaluate(CURRENT), target, "manuel secim yenilemede degisti");
    assert.equal((await browser.evaluate(STORE)).mode, "fixed", "yenilemede mod degisti");
  });

  await runCase("Kontrol Merkezi etiketi gercek durumla senkron", async () => {
    const read = `(() => {
      window.openControlCenter && window.openControlCenter();
      return document.getElementById('cc-wallpaper-mode')?.textContent.trim();
    })()`;

    await browser.evaluate("window.closeWallpaperPanel && window.closeWallpaperPanel()");
    await delay(200);
    assert.equal(await browser.evaluate(read), "Sabit", "sabit modda etiket yanlis");

    await browser.evaluate("window.closeControlCenter && window.closeControlCenter()");
    await openPanel();
    await browser.evaluate(`document.querySelector('[data-wp-random]').click()`);
    await delay(800);
    await browser.evaluate("window.closeWallpaperPanel && window.closeWallpaperPanel()");
    await delay(250);
    assert.equal(await browser.evaluate(read), "Rastgele", "rastgele modda etiket yanlis");
    await browser.evaluate("window.closeControlCenter && window.closeControlCenter()");
  });

  await runCase("tum arka plan varliklari YEREL kaynaktan gelir", async () => {
    await openPanel();
    const remoteSources = await browser.evaluate(`(() => {
      const node = document.getElementById('wallpaper-panel');
      const stage = document.getElementById('anaSayfaHeroStage');
      const raw = [];
      [...node.querySelectorAll('img')].forEach(img => raw.push(img.currentSrc || img.src));
      const hero = document.getElementById('anaSayfaHeroImage');
      if (hero) raw.push(hero.currentSrc || hero.src);
      [...(stage?.querySelectorAll('source') || [])].forEach(s => raw.push(s.srcset));
      // srcset "url 360w, url 720w" bicimindedir; her adayi ayri cozumle.
      const candidates = raw.filter(Boolean).flatMap(value =>
        String(value).split(',').map(part => part.trim().split(/[ 	]+/)[0]).filter(Boolean));
      const remote = candidates.filter(candidate => {
        if (candidate.startsWith('data:')) return false;
        try { return new URL(candidate, location.href).origin !== location.origin; }
        catch { return true; }
      });
      return { count: candidates.length, remote: [...new Set(remote)] };
    })()`);
    assert.ok(remoteSources.count > 0, "hic arka plan varligi bulunamadi");
    assert.deepEqual(remoteSources.remote, [], `uzak kaynak kullanilmis: ${remoteSources.remote}`);

    /* Ag katmani: iddia WALLPAPER SISTEMI hakkindadir, uygulamanin tamami
       hakkinda degil. Site genelinde Google Fonts ve Firebase gibi uzak
       bagimliliklar var; bunlar bu gorevin kapsami disindadir. Burada
       goruntu (image) isteklerinin tamaminin ayni kaynaktan geldigi olculur -
       yani hicbir arka plan CDN'den ya da uzak API'den gelmiyor. */
    const remoteImages = await browser.evaluate(`(() => {
      const IMAGE_EXTENSIONS = ['.avif', '.webp', '.jpg', '.jpeg', '.png'];
      return performance.getEntriesByType('resource')
        .filter(entry => {
          if (entry.initiatorType === 'img') return true;
          const path = entry.name.split('?')[0].toLowerCase();
          return IMAGE_EXTENSIONS.some(extension => path.endsWith(extension));
        })
        .map(entry => entry.name)
        .filter(name => !name.startsWith(location.origin) && !name.startsWith('data:'));
    })()`);
    assert.deepEqual(remoteImages, [], `uzak gorsel istegi var: ${remoteImages.join(", ")}`);

    await browser.evaluate("window.closeWallpaperPanel && window.closeWallpaperPanel()");
  });

  await runCase("bozuk durum enjekte edilince cokme olmaz, onarilir", async () => {
    await browser.evaluate(`(() => {
      localStorage.setItem('ravzaYusufWallpaperMode', '{bozuk');
      localStorage.setItem('ravzaYusufWallpaperFixed', 'artik-yok-boyle-bir-gorsel');
      sessionStorage.setItem('ravzaYusufWallpaperSession', '');
    })()`);
    await gotoHome();
    const store = await browser.evaluate(STORE);
    const stage = await browser.evaluate(STAGE_THEME);
    assert.equal(await browser.evaluate(EFFECTIVE_MODE), "fixed",
      "bozuk mod guvenli varsayilana dusmedi");
    assert.ok(stage, "arka plan hic uygulanmadi");
    const known = await browser.evaluate(
      `(async () => (await import('/data/ana-sayfa-gorselleri.js')).ANA_SAYFA_GORSELLERI.map(t => t.id))()`);
    assert.ok(known.includes(stage), `bilinmeyen gorsel uygulandi: ${stage}`);
    assert.equal(store.fixed, stage, "durum onarilmadi");
  });

  await runCase("klavye ile secim calisir", async () => {
    await gotoHome();
    await openPanel();
    const result = await browser.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('[data-wp-select]')];
      const current = buttons.find(b => b.classList.contains('is-selected'))?.dataset.wpSelect;
      const target = buttons.find(b => b.dataset.wpSelect !== current);
      target.focus();
      return { focused: document.activeElement === target, id: target.dataset.wpSelect };
    })()`);
    assert.equal(result.focused, true, "kucuk resim odaklanamiyor");
    await browser.key("Enter");
    await delay(800);
    const panel = await browser.evaluate(PANEL);
    assert.deepEqual(panel.selectedIds, [result.id], "Enter ile secim calismadi");
    await browser.evaluate("window.closeWallpaperPanel && window.closeWallpaperPanel()");
  });

  await runCase("Kontrol Merkezi acilinca Arka Plan paneli kapanir", async () => {
    await openPanel();
    await browser.evaluate("window.openControlCenter && window.openControlCenter()");
    await delay(350);
    const state = await browser.evaluate(`(() => ({
      wallpaper: document.getElementById('wallpaper-panel')?.open === true,
      control: document.getElementById('control-center')?.open === true,
    }))()`);
    assert.equal(state.wallpaper, false, "iki birincil overlay ayni anda acik");
    assert.equal(state.control, true, "kontrol merkezi acilmadi");
    await browser.evaluate("window.closeControlCenter && window.closeControlCenter()");
  });

  await runCase("konsol temiz kalir", async () => {
    assertCleanDiagnostics(browser, "arka plan");
  });
} finally {
  await browser.close();
  await server.close();
}

const passed = cases.filter((entry) => entry.ok).length;
console.log(`\nArka plan: ${passed}/${cases.length} gecti`);
if (passed === cases.length) {
  console.log("✓ Sabit kaliciligi, oturum kararliligi, Sabitle, yerel varliklar ve kurtarma dogrulandi");
}
