/**
 * Ravza Books okuyucu davranış testleri.
 *
 * İki bölüm:
 *   1. SAF TESTLER  - arama indeksi. Tarayıcı gerekmez, milisaniyeler sürer.
 *   2. TARAYICI      - okuyucu kabuğu, içindekiler, arama, tema, mod, konum.
 *
 * Saf testler önce koşar: arama mantığı bozuksa tarayıcı açmaya gerek yok.
 *
 * Kitap seçimi bilinçli:
 *   kucuk-prens  -> PDF outline'ı VAR (27 bölüm), içindekiler testi buradan.
 *   perili-kosk  -> outline YOK ve 12 sayfa (hızlı), "dürüst boş durum" testi.
 */
import assert from "node:assert/strict";
import { ROOT, ThemeTestBrowser, ensureTestServer, delay, assertCleanDiagnostics } from "./lib/theme-test-runtime.mjs";
import {
  foldTurkish,
  createPageEntry,
  searchBookIndex,
  isSearchableQuery,
} from "../js/pages/ravza-books-search.js";
import { RAVZA_BOOKS } from "../data/ravza-books.js";

const results = [];
let failures = 0;

async function testCase(name, run) {
  try {
    await run();
    results.push(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`  FAIL  ${name}\n        ${error.message.split("\n").join("\n        ")}`);
  }
}

/* ========================================================================== */
/* 1. ARAMA İNDEKSİ (saf)                                                     */
/* ========================================================================== */

console.log("Ravza Books · arama indeksi");

await testCase("Türkçe katlama uzunluğu korur (ofset sözleşmesi)", () => {
  for (const sample of ["Sınav", "İSTANBUL", "Kaşağı", "Edîb", "ığdır", "Çğüöşı"]) {
    assert.equal(foldTurkish(sample).length, sample.length, `uzunluk değişti: ${sample}`);
  }
});

await testCase("Türkçe katlama i/ı/İ/I ayrımını kaldırır", () => {
  assert.equal(foldTurkish("SINAV"), "sinav");
  assert.equal(foldTurkish("Sınav"), "sinav");
  assert.equal(foldTurkish("İstanbul"), "istanbul");
  assert.equal(foldTurkish("hazırlık"), "hazirlik");
  assert.equal(foldTurkish("Edîb"), "edib");
});

await testCase("Boşluklu metinde normal eşleşme exact işaretlenir", () => {
  const entries = [createPageEntry(4, "Sermet Bey gözünü köşkten alamıyordu.")];
  const [hit] = searchBookIndex(entries, "sermet bey");
  assert.ok(hit, "eşleşme bulunamadı");
  assert.equal(hit.pageNumber, 4);
  assert.equal(hit.exact, true);
  assert.equal(hit.snippet.match, "Sermet Bey");
});

await testCase("Bozuk PDF metninde boşluksuz kurtarma çalışır", () => {
  // Perili Köşk s.6'daki GERÇEK çıkarım bozukluğu.
  const entries = [createPageEntry(6, "– Bu ra da otu ra maz sınız efendim")];
  const [hit] = searchBookIndex(entries, "oturamazsınız");
  assert.ok(hit, "boşluksuz eşleşme bulunamadı");
  assert.equal(hit.exact, false, "kurtarma eşleşmesi exact olarak işaretlenmemeli");
  assert.equal(hit.snippet.match, "otu ra maz sınız");
});

await testCase("Harf harf ayrılmış isim bulunur", () => {
  // Ateşten Gömlek s.1'deki GERÇEK çıkarım bozukluğu.
  const entries = [createPageEntry(1, "H a l id e E d îb A d iv a r")];
  const [hit] = searchBookIndex(entries, "Halide");
  assert.ok(hit, "harf harf ayrılmış isim bulunamadı");
  assert.equal(hit.exact, false);
});

await testCase("Exact eşleşmeler loose eşleşmelerden önce sıralanır", () => {
  const entries = [
    createPageEntry(1, "H a l id e E d îb"),
    createPageEntry(9, "HALİDE EDİB ADIVAR"),
  ];
  const hits = searchBookIndex(entries, "Halide");
  assert.equal(hits.length, 2);
  assert.equal(hits[0].pageNumber, 9, "exact eşleşme başta olmalı");
  assert.equal(hits[0].exact, true);
  assert.equal(hits[1].exact, false);
});

await testCase("Tek karakterlik sorgu aranmaz", () => {
  assert.equal(isSearchableQuery("a"), false);
  assert.equal(isSearchableQuery(" "), false);
  assert.equal(isSearchableQuery("ab"), true);
  assert.deepEqual(searchBookIndex([createPageEntry(1, "aaaa")], "a"), []);
});

await testCase("Snippet kelime sınırına çekilir ve boşlukları sadeleştirir", () => {
  const entries = [createPageEntry(1, "birinci   kelime  aranan  sonraki   kelimeler burada")];
  const [hit] = searchBookIndex(entries, "aranan");
  assert.equal(hit.snippet.match, "aranan");
  assert.ok(!/\s{2}/.test(hit.snippet.before), "snippet'te çoklu boşluk kalmamalı");
  assert.ok(!/\s{2}/.test(hit.snippet.after), "snippet'te çoklu boşluk kalmamalı");
});

/* ========================================================================== */
/* 2. OKUYUCU (tarayıcı)                                                      */
/* ========================================================================== */

console.log("Ravza Books · okuyucu");

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("ravza-books-reader");

/** Kitaplığa git ve kartların gelmesini bekle. */
async function openLibrary() {
  await browser.navigate("/?page=ravza-books", "!!document.querySelector('#ravzabooks')");
  await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık kartları");
}

/** Kitabı aç ve okuma moduna geçmesini bekle. PDF indirmesi uzun sürebilir. */
async function openBook(bookId) {
  await browser.evaluate(`document.querySelector('.library-book-card[data-book-id="${bookId}"]').click()`);
  await browser.waitFor(
    "document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
    `${bookId} okuma modu`,
    60000,
  );
  // Kabuk animasyonu otursun.
  await delay(400);
}

try {
  await browser.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  await testCase("kitaplık veri kaynağındaki her kitabı listeler", async () => {
    await openLibrary();
    // Sabit sayı yazmak, kitap eklendiginde testi kirilgan yapiyordu (HEAD'de
    // 5 -> 10 oldu). Iddia artik TEK KAYNAKTAN turetiliyor: veri ne diyorsa
    // kitaplik onu gostermeli - ne eksik ne fazla.
    const shown = await browser.evaluate(
      "[...document.querySelectorAll('.library-book-card')].map(node => node.dataset.bookId).sort()",
    );
    assert.deepEqual(shown, [...RAVZA_BOOKS.map(book => book.id)].sort(), "kitaplık veriyle birebir olmalı");
  });

  await testCase("kitap tam ekran okuyucuya girer, site kabuğu kaybolur", async () => {
    await openBook("perili-kosk");
    const shell = await browser.evaluate(`(() => {
      const hidden = (id) => {
        const node = document.getElementById(id);
        return !node || getComputedStyle(node).display === 'none';
      };
      const page = document.querySelector('#ravzabooks');
      const rect = page.getBoundingClientRect();
      return {
        topbarHidden: hidden('topbar-root'),
        launcherHidden: hidden('launcher-shell-root'),
        fillsViewport: Math.round(rect.height) >= window.innerHeight - 1 && Math.round(rect.width) >= window.innerWidth - 1,
        hasDock: !!document.querySelector('.reader-dock'),
        hasTopbar: !!document.querySelector('.reader-topbar'),
      };
    })()`);
    assert.equal(shell.topbarHidden, true, "site topbar'ı gizlenmeli");
    assert.equal(shell.launcherHidden, true, "launcher gizlenmeli");
    assert.equal(shell.fillsViewport, true, "okuyucu görüntü alanını kaplamalı");
    assert.equal(shell.hasDock, true, "yüzen kontrol yığını olmalı");
    assert.equal(shell.hasTopbar, true, "üst şerit olmalı");
  });

  await testCase("dock düğmeleri 44px dokunma hedefini karşılar", async () => {
    const small = await browser.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('.reader-dock button, .reader-topbar button')];
      return nodes
        .filter((node) => node.offsetParent !== null)
        .map((node) => ({ id: node.id || node.className, h: Math.round(node.getBoundingClientRect().height) }))
        .filter((entry) => entry.h < 44);
    })()`);
    assert.deepEqual(small, [], `44px altı hedefler: ${JSON.stringify(small)}`);
  });

  await testCase("kabuk dokunuşla gizlenip geri gelir", async () => {
    const visibleFirst = await browser.evaluate("document.querySelector('.reader-root').classList.contains('controls-visible')");
    assert.equal(visibleFirst, true, "kitap açılışında kontroller görünür olmalı");
    // Sahnenin ortasına dokun: sayfa kenarı değil, kabuk anahtarı.
    // Olay, dinleyicinin bağlı olduğu yüzeyin İÇİNDEKİ bir elemandan
    // gönderilir; pointer olayları yukarı kabarır, aşağı inmez.
    await browser.evaluate(`(() => {
      const stage = document.getElementById('rdr-stage');
      const rect = stage.getBoundingClientRect();
      const target = document.querySelector('.stf__item .pdf-canvas-frame')
        || document.querySelector('.pdf-page')
        || stage;
      const point = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
      const opts = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, ...point };
      target.dispatchEvent(new PointerEvent('pointerdown', opts));
      target.dispatchEvent(new PointerEvent('pointerup', opts));
    })()`);
    await delay(250);
    const hidden = await browser.evaluate("!document.querySelector('.reader-root').classList.contains('controls-visible')");
    assert.equal(hidden, true, "ortaya dokunuş kabuğu gizlemeli");
  });

  await testCase("outline'ı olmayan kitap içindekiler yerine dürüst boş durum gösterir", async () => {
    await browser.evaluate("document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler sayfası");
    const sheet = await browser.evaluate(`(() => ({
      chapters: document.querySelectorAll('#rdr-contents-body .reader-toc-item[data-level]').length,
      empty: document.querySelector('#rdr-contents-body .reader-sheet-empty')?.textContent || '',
      hasGoto: !!document.getElementById('rdr-goto-form'),
    }))()`);
    assert.equal(sheet.chapters, 0, "Perili Köşk'ün outline'ı yok, bölüm listelenmemeli");
    assert.match(sheet.empty, /bölüm bilgisi yok/i, "boş durum dürüstçe açıklanmalı");
    assert.equal(sheet.hasGoto, true, "sayfaya git formu sunulmalı");
    await browser.evaluate("document.querySelector('#rdr-contents-sheet [data-close-sheet]').click()");
    await delay(200);
  });

  await testCase("kitapta arama gerçek sonuç döndürür ve sayfaya atlar", async () => {
    await browser.evaluate("document.getElementById('rdr-search-open').click()");
    await browser.waitFor("document.getElementById('rdr-search-sheet')?.open === true", "arama sayfası");
    await browser.evaluate(`(() => {
      const input = document.getElementById('rdr-search-input');
      input.value = 'Sermet';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await browser.waitFor("document.querySelectorAll('.reader-search-item').length > 0", "arama sonuçları", 30000);
    const target = await browser.evaluate(`(() => {
      const item = document.querySelector('.reader-search-item');
      return Number(item.dataset.gotoPage);
    })()`);
    assert.ok(target >= 1, "sonuç geçerli bir sayfa numarası taşımalı");
    await browser.evaluate("document.querySelector('.reader-search-item').click()");
    await delay(600);
    const state = await browser.evaluate(`(() => ({
      sheetOpen: document.getElementById('rdr-search-sheet')?.open === true,
      page: Number(document.getElementById('reader-inner').dataset.currentPage),
    }))()`);
    assert.equal(state.sheetOpen, false, "sonuca tıklayınca arama kapanmalı");
    assert.equal(state.page, target, "okuyucu sonucun sayfasına gitmeli");
  });

  await testCase("kitap içi arama temizleme düğmesi çalışır", async () => {
    await browser.evaluate("document.getElementById('rdr-search-open').click()");
    await browser.waitFor("document.getElementById('rdr-search-sheet')?.open === true", "arama sayfası");
    await browser.evaluate(`(() => {
      const input = document.getElementById('rdr-search-input');
      input.value = 'Sermet';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await browser.waitFor(
      "document.querySelector('#rdr-search-input')?.closest('.search-clear-control')?.querySelector('[data-search-clear-button]')?.hidden === false",
      "temizleme düğmesi görünür",
    );
    await browser.evaluate("document.querySelector('#rdr-search-input').closest('.search-clear-control').querySelector('[data-search-clear-button]').click()");
    await delay(400);
    const cleared = await browser.evaluate(`(() => ({
      value: document.getElementById('rdr-search-input').value,
      buttonHidden: document.querySelector('#rdr-search-input').closest('.search-clear-control').querySelector('[data-search-clear-button]').hidden,
    }))()`);
    assert.equal(cleared.value, "", "temizleme düğmesi alanı boşaltmalı");
    assert.equal(cleared.buttonHidden, true, "alan boşken temizleme düğmesi gizlenmeli");
    await browser.evaluate("document.querySelector('#rdr-search-sheet [data-close-sheet]').click()");
    await delay(200);
  });

  /**
   * §10/§11 - "KITAPTA ARA" ALANINDA TARAYICI MAVISI OLMAMALI.
   *
   * Bildirilen kusur: mobilde alana dokununca doygun mavi bir dikdortgen
   * beliriyordu. Kaynak Ravza Books degil, TARAYICI VARSAYILANIYDI:
   * -webkit-tap-highlight-color = rgba(51,181,229,0.4). Ayrica caret ve secim
   * global pembe --selection-bg'yi aliyordu; kahve/kagit paletinde yabanci
   * duruyordu. Odak da `outline:none` ile tamamen silinmisti.
   *
   * Bu test dort okuma temasinin HEPSINDE bakar; birinde gerileme olursa yakalar.
   */
  const isBlueish = (color) => {
    const [r, g, b] = (String(color).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    if (![r, g, b].every(Number.isFinite)) return false;
    // Mavi kanal digerlerini belirgin sekilde asiyorsa "tarayici mavisi".
    return b > r + 30 && b > g + 12;
  };

  for (const theme of ["light", "sepia", "dark", "black"]) {
    await testCase(`kitapta ara alanı ${theme} temasında tarayıcı mavisi göstermez`, async () => {
      await browser.evaluate(`(() => {
        const prefs = JSON.parse(localStorage.getItem('ravza-books-prefs') || '{}');
        prefs.theme = ${JSON.stringify(theme)};
        localStorage.setItem('ravza-books-prefs', JSON.stringify(prefs));
      })()`);
      await openLibrary();
      await openBook("perili-kosk");
      await browser.evaluate("document.getElementById('rdr-search-open').click()");
      await browser.waitFor("document.getElementById('rdr-search-sheet')?.open === true", "arama sayfası");
      await browser.evaluate(`(() => {
        const input = document.getElementById('rdr-search-input');
        input.focus();
        input.value = 'köşk';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.select();
      })()`);
      await delay(400);

      const style = await browser.evaluate(`(() => {
        const input = document.getElementById('rdr-search-input');
        const field = input.closest('.reader-search-field');
        const inputStyle = getComputedStyle(input);
        const fieldStyle = getComputedStyle(field);
        return {
          tapHighlight: inputStyle.getPropertyValue('-webkit-tap-highlight-color'),
          fieldTapHighlight: fieldStyle.getPropertyValue('-webkit-tap-highlight-color'),
          caret: inputStyle.caretColor,
          selectionBg: getComputedStyle(input, '::selection').backgroundColor,
          fieldBg: fieldStyle.backgroundColor,
          fieldBorder: fieldStyle.borderTopColor,
          fieldShadow: fieldStyle.boxShadow,
          accent: getComputedStyle(document.getElementById('ravzabooks')).getPropertyValue('--accent').trim(),
          focused: document.activeElement?.id,
        };
      })()`);

      assert.equal(style.focused, "rdr-search-input", "alan odakta olmalı");
      // 1. Dokunma parlamasi tamamen kapali olmali (mavi dikdortgenin kaynagi).
      for (const [label, value] of [["input", style.tapHighlight], ["alan", style.fieldTapHighlight]]) {
        assert.match(
          String(value).replace(/\s/g, ""),
          /^(rgba\(0,0,0,0\)|transparent)$/,
          `${label} dokunma parlamasi kapali degil: ${value}`,
        );
      }
      // 2. Hicbir gorunur yuzey tarayici mavisi olmamali.
      for (const [label, value] of [
        ["alan zemini", style.fieldBg],
        ["alan kenarligi", style.fieldBorder],
        ["caret", style.caret],
        ["seçim zemini", style.selectionBg],
      ]) {
        assert.ok(!isBlueish(value), `${label} mavi: ${value}`);
      }
      // 3. Caret ve secim OKUMA temasindan gelmeli, global pembeden degil.
      assert.ok(!/255,\s*157,\s*184/.test(style.caret), `caret hâlâ global pembe: ${style.caret}`);
      assert.ok(
        !/255,\s*157,\s*184/.test(style.selectionBg),
        `seçim hâlâ global pembe: ${style.selectionBg}`,
      );
      // 4. Odak GORUNUR kalmali - erisilebilirlik silinerek "duzeltilmedi".
      assert.notEqual(style.fieldShadow, "none", "odakta görünür bir işaret kalmalı");

      await browser.evaluate("document.querySelector('#rdr-search-sheet [data-close-sheet]').click()");
      await delay(200);
    });
  }

  // Sonraki testler acik tema bekliyor.
  await browser.evaluate(`(() => {
    const prefs = JSON.parse(localStorage.getItem('ravza-books-prefs') || '{}');
    prefs.theme = 'light';
    localStorage.setItem('ravza-books-prefs', JSON.stringify(prefs));
  })()`);

  await testCase("okuma teması değişir ve kalıcı olur", async () => {
    await browser.evaluate("document.getElementById('rdr-settings-open').click()");
    await browser.waitFor("document.getElementById('rdr-settings-sheet')?.open === true", "ayarlar sayfası");
    await browser.evaluate("document.querySelector('.reader-sheet .theme-btn[data-theme=\"black\"]').click()");
    await delay(250);
    const applied = await browser.evaluate(`(() => ({
      attr: document.getElementById('ravzabooks').dataset.readerTheme,
      stored: JSON.parse(localStorage.getItem('ravza-books-prefs') || '{}').theme,
      themeColor: document.querySelector('meta[name="theme-color"]')?.content,
    }))()`);
    assert.equal(applied.attr, "black", "okuma teması uygulanmalı");
    assert.equal(applied.stored, "black", "okuma teması kaydedilmeli");
    assert.equal(applied.themeColor, "#000000", "adres çubuğu rengi temayı izlemeli");
  });

  await testCase("okuma kabuğu cam, kitap sayfası opak kalır", async () => {
    const surfaces = await browser.evaluate(`(() => {
      const dock = document.querySelector('.reader-dock-row');
      const canvasFrame = document.querySelector('.pdf-canvas-frame');
      const read = (node) => node && getComputedStyle(node);
      const dockStyle = read(dock);
      const frameStyle = read(canvasFrame);
      return {
        dockBlurred: /blur/.test(dockStyle.backdropFilter || dockStyle.webkitBackdropFilter || ''),
        frameBlurred: /blur/.test(frameStyle.backdropFilter || frameStyle.webkitBackdropFilter || ''),
        frameBg: frameStyle.backgroundColor,
      };
    })()`);
    assert.equal(surfaces.dockBlurred, true, "kontrol yüzeyi cam olmalı");
    assert.equal(surfaces.frameBlurred, false, "kitap sayfası ASLA cam olmamalı (§27)");
    assert.ok(!/rgba\(0,\s*0,\s*0,\s*0\)/.test(surfaces.frameBg), "kitap sayfası opak zemin taşımalı");
  });

  await testCase("sürekli kaydırma moduna geçilir ve konum korunur", async () => {
    const before = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
    await browser.evaluate("document.querySelector('.mode-btn[data-mode=\"scroll\"]').click()");
    await browser.waitFor(
      "document.querySelector('#reader-inner')?.dataset.readerMode === 'scroll' && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
      "sürekli mod",
      60000,
    );
    await delay(500);
    const after = await browser.evaluate(`(() => ({
      page: Number(document.getElementById('reader-inner').dataset.currentPage),
      scrollable: (() => {
        const node = document.getElementById('rdr-flipbook');
        return node.scrollHeight > node.clientHeight + 10;
      })(),
      stored: JSON.parse(localStorage.getItem('ravza-books-prefs') || '{}').readerMode,
    }))()`);
    assert.equal(after.stored, "scroll", "okuma modu kaydedilmeli");
    assert.equal(after.scrollable, true, "sürekli modda dikey kaydırma olmalı");
    assert.equal(after.page, before, "mod değişiminde okuma konumu korunmalı");
  });

  await testCase("yer imi eklenir ve kalıcı olur", async () => {
    // Sayfa moduna geri dön: kalan testler oradan devam etsin.
    await browser.evaluate("document.getElementById('rdr-settings-open').click()");
    await browser.waitFor("document.getElementById('rdr-settings-sheet')?.open === true", "ayarlar sayfası");
    await browser.evaluate("document.querySelector('.mode-btn[data-mode=\"page\"]').click()");
    await browser.waitFor(
      "document.querySelector('#reader-inner')?.dataset.readerMode === 'page' && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
      "sayfa modu",
      60000,
    );
    await delay(400);

    await browser.evaluate("document.getElementById('rdr-bookmark').click()");
    await delay(300);
    const bookmark = await browser.evaluate(`(() => ({
      pressed: document.getElementById('rdr-bookmark').getAttribute('aria-pressed'),
      stored: JSON.parse(localStorage.getItem('ravza-books-bookmarks') || '{}')['perili-kosk'] || [],
    }))()`);
    assert.equal(bookmark.pressed, "true", "yer imi düğmesi basılı görünmeli");
    assert.ok(bookmark.stored.length > 0, "yer imi kaydedilmeli");
  });

  await testCase("kaydedilen konum kitaplığa dönüp geri gelince korunur", async () => {
    // Bu proje "elle kaydet" modelini kullanır: konum yalnızca yer imi
    // düğmesiyle yazılır, sayfa çevirmek onu oynatmaz. Önceki test kaydetti.
    const savedPage = await browser.evaluate(`(() => {
      const raw = localStorage.getItem('ravzaBooksProgress:perili-kosk');
      return raw ? JSON.parse(raw).savedPage : null;
    })()`);
    assert.ok(savedPage >= 1, "önceki testte kaydedilmiş bir sayfa olmalı");

    await browser.evaluate("document.getElementById('rdr-back').click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplığa dönüş");
    await openBook("perili-kosk");
    const resumed = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
    assert.equal(resumed, savedPage, "kitap kaydedilen sayfadan açılmalı");
  });

  await testCase("gezinmek kaydedilen sayfayı oynatmaz (elle kaydet modeli)", async () => {
    const before = await browser.evaluate(`JSON.parse(localStorage.getItem('ravzaBooksProgress:perili-kosk')).savedPage`);
    // İlerleme barıyla başka bir sayfaya git: kayıt DEĞİŞMEMELİ.
    await browser.evaluate(`(() => {
      const range = document.getElementById('rdr-progress');
      range.value = String(Math.min(Number(range.max), Number(range.value) + 3));
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await delay(700);
    const state = await browser.evaluate(`(() => ({
      current: Number(document.getElementById('reader-inner').dataset.currentPage),
      saved: JSON.parse(localStorage.getItem('ravzaBooksProgress:perili-kosk')).savedPage,
    }))()`);
    assert.notEqual(state.current, before, "ilerleme barı gerçekten sayfayı değiştirmeli");
    assert.equal(state.saved, before, "kaydetmeden gezinmek kayıtlı sayfayı değiştirmemeli");
  });

  await testCase("outline'ı olan kitapta gerçek içindekiler listelenir", async () => {
    await browser.evaluate("document.getElementById('rdr-back').click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplığa dönüş");
    await openBook("kucuk-prens");
    await browser.evaluate("document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler sayfası");
    const toc = await browser.evaluate(`(() => {
      const items = [...document.querySelectorAll('#rdr-contents-body .reader-toc-item[data-level]')];
      return {
        count: items.length,
        first: items[0]?.querySelector('.reader-toc-title')?.textContent?.trim(),
        pages: items.slice(0, 5).map((node) => Number(node.dataset.gotoPage)),
        current: document.querySelectorAll('#rdr-contents-body .reader-toc-item.is-current').length,
      };
    })()`);
    assert.ok(toc.count >= 20, `Küçük Prens'te en az 20 bölüm beklenir, gelen ${toc.count}`);
    assert.ok(toc.pages.every((page) => Number.isInteger(page) && page > 0), "her bölüm gerçek sayfaya çözülmeli");
    assert.deepEqual([...toc.pages].sort((a, b) => a - b), toc.pages, "bölümler sayfa sırasında olmalı");
    // Kitap ön kısmındayken (ilk bölümden önce) hiçbir bölüm işaretlenmez -
    // bu DOĞRU davranıştır, olmayan bölüm uydurulmaz. Aynı anda birden fazla
    // işaretlenmesi ise hatadır.
    assert.ok(toc.current <= 1, `en fazla bir bölüm geçerli olabilir, gelen ${toc.current}`);
  });

  await testCase("içindekilerden bölüme atlanır", async () => {
    const target = await browser.evaluate(`(() => {
      const item = document.querySelectorAll('#rdr-contents-body .reader-toc-item[data-level]')[3];
      return Number(item.dataset.gotoPage);
    })()`);
    await browser.evaluate("document.querySelectorAll('#rdr-contents-body .reader-toc-item[data-level]')[3].click()");
    await delay(900);
    const state = await browser.evaluate(`(() => ({
      open: document.getElementById('rdr-contents-sheet')?.open === true,
      page: Number(document.getElementById('reader-inner').dataset.currentPage),
    }))()`);
    assert.equal(state.open, false, "bölüme atlayınca sayfa kapanmalı");
    assert.equal(state.page, target, "okuyucu seçilen bölümün sayfasına gitmeli");

    // Artık bir bölümün içindeyiz: içindekiler o bölümü işaretlemeli.
    await browser.evaluate("document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler tekrar");
    const marked = await browser.evaluate(`(() => {
      const items = [...document.querySelectorAll('#rdr-contents-body .reader-toc-item[data-level]')];
      const current = items.filter((node) => node.classList.contains('is-current'));
      return { count: current.length, page: Number(current[0]?.dataset.gotoPage) };
    })()`);
    assert.equal(marked.count, 1, "bölüm içindeyken tam olarak bir bölüm işaretli olmalı");
    assert.equal(marked.page, target, "işaretli bölüm atlanan bölüm olmalı");
    await browser.evaluate("document.querySelector('#rdr-contents-sheet [data-close-sheet]').click()");
    await delay(200);
  });

  await testCase("üst şerit gerçek bölüm ilerlemesi gösterir", async () => {
    const status = await browser.evaluate("document.getElementById('rdr-status')?.textContent?.trim()");
    assert.ok(status, "üst şerit boş olmamalı");
    assert.match(
      status,
      /(Bölümde \d+ sayfa kaldı|Bölümün sonu|%\d+ tamamlandı)/,
      `beklenmeyen durum metni: ${status}`,
    );
  });

  await testCase("dock kitap sayfasının okunur alanını örtmez", async () => {
    // Kontroller görünürken sayfanın alt kenarı dock'un altında kalmamalı.
    await browser.evaluate("document.getElementById('rdr-stage').click()");
    await delay(300);
    const overlap = await browser.evaluate(`(() => {
      const root = document.querySelector('.reader-root');
      if (!root.classList.contains('controls-visible')) return { skipped: true };
      const dock = document.querySelector('.reader-dock').getBoundingClientRect();
      const canvas = document.querySelector('.pdf-page.is-rendered canvas');
      if (!canvas) return { skipped: true };
      const page = canvas.getBoundingClientRect();
      const covered = Math.max(0, page.bottom - dock.top);
      return { skipped: false, covered: Math.round(covered), pageHeight: Math.round(page.height) };
    })()`);
    if (!overlap.skipped) {
      const ratio = overlap.covered / Math.max(1, overlap.pageHeight);
      assert.ok(ratio < 0.35, `dock sayfanın %${Math.round(ratio * 100)}'ini örtüyor (sınır %35)`);
    }
  });

  /* ---------------------------------------------------------------------- */
  /* MOBİL GEOMETRİ / SAYFA MODU / SÜREKLİ MOD                               */
  /* ---------------------------------------------------------------------- */

  /** Okuma modunu depoya yazıp kitabı temiz açar. */
  async function openWith(bookId, mode) {
    await browser.evaluate(`(() => {
      const prefs = JSON.parse(localStorage.getItem('ravza-books-prefs') || '{}');
      prefs.readerMode = ${JSON.stringify(mode)};
      localStorage.setItem('ravza-books-prefs', JSON.stringify(prefs));
    })()`);
    await openLibrary();
    await openBook(bookId);
    // GECERLI sayfanin kendisi render olana kadar bekle: "herhangi bir sayfa
    // render oldu" yetmiyor, olculecek olan gorunen sayfa.
    await browser.waitFor(
      `(() => { const n = document.getElementById('reader-inner')?.dataset.currentPage;
        return !!document.querySelector('.pdf-page[data-pdf-page="' + n + '"].is-rendered'); })()`,
      "geçerli sayfa render",
      60000,
    );
    await delay(700);
  }

  const READER_GEOMETRY = `(() => {
    // GECERLI sayfa olculur, DOM'daki ILK sayfa degil. Sayfa modunda cevirme
    // motoru gorunmeyen sayfalari display:none yapar; ilk .pdf-page kapali
    // oldugunda 0x0 dikdortgen donuyor ve "ortalanmis mi" olcumu anlamsizlasiyor
    // (leftGap 0 / rightGap = viewport). Olculecek sey ekranda DURAN sayfadir.
    const current = Number(document.getElementById('reader-inner').dataset.currentPage);
    const page = document.querySelector('.pdf-page[data-pdf-page="' + current + '"]');
    if (!page || page.getBoundingClientRect().width < 1) {
      throw new Error('geçerli sayfa (' + current + ') ölçülebilir değil');
    }
    const canvas = page.querySelector('canvas');
    const dock = document.querySelector('.reader-dock');
    const pr = page.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const dr = dock.getBoundingClientRect();
    return {
      page: { left: pr.left, right: pr.right, top: pr.top, bottom: pr.bottom, width: pr.width, height: pr.height },
      canvasStyleWidth: parseFloat(canvas.style.width) || 0,
      canvasRectWidth: cr.width,
      canvasAttrWidth: canvas.width,
      dockTop: dr.top,
      chromeTop: parseFloat(getComputedStyle(document.getElementById('reader-inner')).getPropertyValue('--reader-chrome-top')) || 0,
      chromeBottom: parseFloat(getComputedStyle(document.getElementById('reader-inner')).getPropertyValue('--reader-chrome-bottom')) || 0,
      // Sahnenin ICERIK kutusu = sayfaya gercekten ayrilan alan.
      stage: (() => {
        const stage = document.getElementById('rdr-stage');
        const cs = getComputedStyle(stage);
        const pad = side => parseFloat(cs['padding' + side]) || 0;
        return {
          width: stage.clientWidth - pad('Left') - pad('Right'),
          height: stage.clientHeight - pad('Top') - pad('Bottom'),
        };
      })(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      dpr: window.devicePixelRatio,
      mode: document.getElementById('reader-inner').dataset.readerMode,
    };
  })()`;

  // §2: tek bir telefon genişliğine göre yamamak yasak - ölçü matrisi geniş.
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [393, 852], [402, 874], [430, 932]]) {
    await testCase(`sayfa modu geometrisi ${width}x${height} içinde kalır`, async () => {
      await browser.setViewport({ width, height, deviceScaleFactor: 3, mobile: true });
      await openWith("kucuk-prens", "page");
      const g = await browser.evaluate(READER_GEOMETRY);

      assert.equal(g.mode, "page", "sayfa modu etkin olmalı");
      // Yatayda taşma yok.
      assert.ok(g.page.left >= -1, `sayfa soldan taşıyor (left ${g.page.left.toFixed(1)})`);
      assert.ok(g.page.right <= width + 1, `sayfa sağdan taşıyor (right ${g.page.right.toFixed(1)} > ${width})`);
      assert.ok(g.page.width <= width + 1, `sayfa görüntü alanından geniş (${g.page.width.toFixed(1)})`);
      assert.ok(
        g.docScrollWidth <= width + 1,
        `yatay kaydırma oluştu (scrollWidth ${g.docScrollWidth} > ${width})`,
      );
      // Yatayda ortalanmış.
      const leftGap = g.page.left;
      const rightGap = width - g.page.right;
      assert.ok(Math.abs(leftGap - rightGap) <= 2, `sayfa yatayda ortalanmamış (${leftGap.toFixed(1)} / ${rightGap.toFixed(1)})`);
      // GÖSTERİM ölçüsü ile RENDER çözünürlüğü karışmamalı (§6).
      assert.ok(
        Math.abs(g.canvasStyleWidth - g.canvasRectWidth) <= 1,
        `canvas CSS genişliği (${g.canvasStyleWidth}) gerçek genişlikle (${g.canvasRectWidth}) uyuşmuyor`,
      );
      assert.ok(
        g.canvasAttrWidth >= g.canvasRectWidth * 1.5,
        `canvas çözünürlüğü DPR için yetersiz (${g.canvasAttrWidth} vs ${g.canvasRectWidth})`,
      );
      // Sayfa, yüzen kontrollerin arkasında kalmamalı (§25).
      assert.ok(
        g.page.bottom <= g.dockTop + 1,
        `sayfa dock'un arkasına giriyor (sayfa alt ${g.page.bottom.toFixed(1)} > dock üst ${g.dockTop.toFixed(1)})`,
      );
      assert.ok(g.page.top >= -1, `sayfa üstten taşıyor (${g.page.top.toFixed(1)})`);

      /* §4 - DEV BOS BANT KONTROLU.

         "Sayfa ekranin %X'ini kaplasin" demek YANLIS olurdu: 3:4'luk bir PDF
         sayfasi 390x844 (en-boy 0.46) bir telefonda ZORUNLU olarak genislige
         sigar ve altta/ustte bos alan kalir. Bu letterbox, hata degil geometri.

         Gercek hata, KABUGUN alani yemesiydi: dock uc yigilmis tam genislik
         satir tasirken 844px telefonda 270px kapliyor, ayrilan toplam kabuk
         %40'a cikiyordu. Bu yuzden iki ayri sey olculur:
           1. ayrilan kabuk ekranin makul bir dilimini gecmemeli,
           2. sayfa, KALAN alanin en az bir eksenini tam doldurmali (fit-page:
              scale = min(genislik, yukseklik) - yani bos kalan eksen digerinin
              zorunlu sonucudur, tembellik degil. */
      const chromeRatio = (g.chromeTop + g.chromeBottom) / height;
      assert.ok(
        chromeRatio <= 0.30,
        `kabuk ekranin %${Math.round(chromeRatio * 100)}'ini ayiriyor (sinir %30, eski yerlesim %40)`,
      );
      const { width: availableWidth, height: availableHeight } = g.stage;
      // Sahne, kabuk ayrildiktan sonra kalan alani zaten temsil ediyor; ekstra
      // pay birakilmadigini dogrula.
      assert.ok(
        availableHeight >= height - g.chromeTop - g.chromeBottom - 16,
        `sahne, kabuk disinda fazladan ${(height - g.chromeTop - g.chromeBottom - availableHeight).toFixed(0)}px yiyor`,
      );
      assert.ok(
        g.page.width <= availableWidth + 1 && g.page.height <= availableHeight + 1,
        `sayfa kullanilabilir alani asiyor (${g.page.width.toFixed(0)}x${g.page.height.toFixed(0)} > ${availableWidth.toFixed(0)}x${availableHeight.toFixed(0)})`,
      );
      const fillsWidth = g.page.width >= availableWidth - 2;
      const fillsHeight = g.page.height >= availableHeight - 2;
      assert.ok(
        fillsWidth || fillsHeight,
        `sayfa hicbir ekseni doldurmuyor (${g.page.width.toFixed(0)}x${g.page.height.toFixed(0)} / kullanilabilir ${availableWidth.toFixed(0)}x${availableHeight.toFixed(0)})`,
      );
    });
  }

  await browser.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, mobile: true });

  await testCase("sayfa modu ileri/geri gezinir ve durum tek kaynaktan gelir", async () => {
    await openWith("kucuk-prens", "page");
    const start = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
    await browser.key("ArrowRight");
    await browser.waitFor(
      `Number(document.getElementById('reader-inner').dataset.currentPage) > ${start}`,
      "ileri sayfa",
      15000,
    );
    const next = await browser.evaluate(`(() => ({
      page: Number(document.getElementById('reader-inner').dataset.currentPage),
      label: document.getElementById('rdr-progress-label').textContent.trim(),
      slider: Number(document.getElementById('rdr-progress').value),
    }))()`);
    assert.ok(next.page > start, "ileri gitmeli");
    // §10: tek yetkili currentPage - etiket ve scrubber onunla aynı olmalı.
    assert.equal(next.slider, next.page - 1, "scrubber geçerli sayfayla uyuşmuyor");
    assert.match(next.label, new RegExp(`^${next.page}\\s*/`), `sayfa etiketi uyuşmuyor: ${next.label}`);

    await browser.key("ArrowLeft");
    await browser.waitFor(
      `Number(document.getElementById('reader-inner').dataset.currentPage) === ${start}`,
      "geri sayfa",
      15000,
    );
  });

  await testCase("sürekli modda sayfalar üst üste yığılmadan akar", async () => {
    await openWith("kucuk-prens", "scroll");
    const flow = await browser.evaluate(`(() => {
      const s = document.getElementById('rdr-flipbook');
      const rect = n => s.querySelector('.pdf-page[data-pdf-page="' + n + '"]').getBoundingClientRect();
      const a = rect(1), b = rect(2), c = rect(3);
      return { h: a.height, gap1: b.top - a.bottom, gap2: c.top - b.bottom,
               step: b.top - a.top, scrollH: s.scrollHeight, total: s.querySelectorAll('.pdf-page').length };
    })()`);
    // Sayfalar aspect-ratio ile boyutlaniyordu ama grid satiri bu yuksekligi
    // OLCMUYORDU: her satir 0px cikiyor, sayfalar yalnizca gap kadar (12px)
    // kayarak ust uste biniyordu. Bir sonraki sayfanin ustu, oncekinin ALTINDAN
    // sonra gelmeli - yigilma bu iddiayi gecemez.
    assert.ok(
      flow.step >= flow.h,
      `sayfalar yığılmış: adım ${flow.step.toFixed(1)}px ama sayfa ${flow.h.toFixed(1)}px yüksek`,
    );
    // §7: bosluk kucuk ve tutarli. Yuzlerce piksel asla.
    for (const [label, gap] of [["1-2", flow.gap1], ["2-3", flow.gap2]]) {
      assert.ok(gap >= 4 && gap <= 24, `${label} arası sayfa boşluğu makul değil: ${gap.toFixed(1)}px`);
    }
    assert.ok(Math.abs(flow.gap1 - flow.gap2) <= 1, "sayfa boşluğu tutarsız");
    // Toplam yukseklik gercek sayfa sayisiyla orantili olmali.
    assert.ok(
      flow.scrollH > flow.total * flow.h * 0.9,
      `kaydirici toplam yuksekligi cok kucuk: ${flow.scrollH}px (${flow.total} x ${flow.h.toFixed(0)}px)`,
    );
  });

  await testCase("sürekli mod GERÇEKTEN dikey kaydırır", async () => {
    const before = await browser.evaluate(`(() => {
      const s = document.getElementById('rdr-flipbook');
      return { top: s.scrollTop, clientH: s.clientHeight, scrollH: s.scrollHeight,
               page: Number(document.getElementById('reader-inner').dataset.currentPage) };
    })()`);
    assert.ok(before.scrollH > before.clientH + 10, "kaydırıcı taşmıyor (scrollHeight <= clientHeight)");

    // CSS'e bakmak kaydırdığını KANITLAMAZ (§33): gerçek tekerlek olayı gönder.
    const centre = await browser.evaluate(`(() => {
      const r = document.getElementById('rdr-flipbook').getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    for (let step = 0; step < 6; step += 1) {
      await browser.command("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: centre.x, y: centre.y, deltaX: 0, deltaY: 600,
      });
      await delay(160);
    }
    await delay(1200);

    const after = await browser.evaluate(`(() => {
      const s = document.getElementById('rdr-flipbook');
      return { top: s.scrollTop, page: Number(document.getElementById('reader-inner').dataset.currentPage) };
    })()`);
    assert.ok(after.top > before.top + 50, `kaydırma gerçekleşmedi (${before.top} -> ${after.top})`);
    assert.ok(after.page > before.page, `kaydırınca geçerli sayfa güncellenmedi (${before.page} -> ${after.page})`);
  });

  await testCase("sürekli modda tüm sayfalar aynı anda render edilmez", async () => {
    // 166 sayfalık kitapta hepsini yüksek çözünürlükte tutmak bellek felaketi (§44).
    const rendered = await browser.evaluate("document.querySelectorAll('.pdf-page.is-rendered').length");
    const total = await browser.evaluate("document.querySelectorAll('.pdf-page').length");
    assert.ok(total >= 160, `Küçük Prens 166 sayfa olmalı, gelen ${total}`);
    assert.ok(rendered > 0, "görünür sayfalar render edilmeli");
    assert.ok(rendered <= 12, `render penceresi çok geniş: ${rendered}/${total} sayfa canlı`);
  });

  await testCase("mod değişimi okuma konumunu korur (her iki yön)", async () => {
    await openWith("kucuk-prens", "page");
    await browser.evaluate(`(() => {
      const range = document.getElementById('rdr-progress');
      range.value = '5';
      range.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await browser.waitFor("Number(document.getElementById('reader-inner').dataset.currentPage) === 6", "6. sayfa");
    await delay(600);

    // Sayfa -> sürekli
    await browser.evaluate("document.getElementById('rdr-mode').click()");
    await browser.waitFor(
      "document.getElementById('reader-inner')?.dataset.readerMode === 'scroll' && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
      "sürekli moda geçiş", 60000,
    );
    await delay(1200);
    const inScroll = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
    assert.ok(Math.abs(inScroll - 6) <= 1, `sürekli moda geçişte konum kaybedildi (${inScroll})`);

    // Sürekli içinde ilerle
    await browser.evaluate(`(() => {
      const s = document.getElementById('rdr-flipbook');
      const target = s.querySelector('.pdf-page[data-pdf-page="9"]');
      s.scrollTop += target.getBoundingClientRect().top - s.getBoundingClientRect().top;
    })()`);
    await delay(1400);
    const scrolled = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
    assert.ok(Math.abs(scrolled - 9) <= 1, `kaydırma sonrası sayfa yanlış (${scrolled})`);

    // Sürekli -> sayfa
    await browser.evaluate("document.getElementById('rdr-mode').click()");
    await browser.waitFor(
      "document.getElementById('reader-inner')?.dataset.readerMode === 'page' && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
      "sayfa moduna dönüş", 60000,
    );
    await delay(1200);
    const back = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
    assert.ok(Math.abs(back - scrolled) <= 1, `sayfa moduna dönüşte konum kaybedildi (${scrolled} -> ${back})`);
    assert.notEqual(back, 1, "mod değişimi 1. sayfaya sıfırlamamalı");
  });

  await testCase("mod göstergesi gerçek modu yansıtır", async () => {
    const state = await browser.evaluate(`(() => ({
      mode: document.getElementById('reader-inner').dataset.readerMode,
      label: document.getElementById('rdr-mode-label')?.textContent?.trim(),
    }))()`);
    // §20: arayüz etiketi renderer durumundan sapmamalı.
    assert.equal(state.label, state.mode === "scroll" ? "Kaydır" : "Sayfa", `etiket moddan sapmış: ${JSON.stringify(state)}`);
  });

  await testCase("bozuk readerMode güvenle sayfa moduna düşer", async () => {
    for (const bad of ['"potato"', "null", "123"]) {
      await browser.evaluate(`(() => {
        const prefs = JSON.parse(localStorage.getItem('ravza-books-prefs') || '{}');
        prefs.readerMode = ${bad};
        localStorage.setItem('ravza-books-prefs', JSON.stringify(prefs));
      })()`);
      await openLibrary();
      await openBook("perili-kosk");
      const mode = await browser.evaluate("document.getElementById('reader-inner').dataset.readerMode");
      assert.equal(mode, "page", `bozuk readerMode (${bad}) sayfa moduna düşmeli, gelen ${mode}`);
    }
  });

  // §31: BEŞ kitabın tamamı gerçekten açılıp gezilmeli.
  for (const [bookId, title, pages] of [
    ["kucuk-prens", "Küçük Prens", 166],
    ["kasagi", "Kaşağı", 146],
    ["atesten-gomlek", "Ateşten Gömlek", 224],
    ["dede-korkut-hikayeleri", "Dede Korkut Hikâyeleri", 200],
    ["perili-kosk", "Perili Köşk", 12],
  ]) {
    await testCase(`${title}: aç → ileri → sürekli → sayfa → yeniden aç`, async () => {
      await openWith(bookId, "page");
      const total = await browser.evaluate("document.querySelectorAll('.pdf-page').length");
      assert.equal(total, pages, `${title} ${pages} sayfa olmalı, gelen ${total}`);

      const first = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
      await browser.key("ArrowRight");
      await browser.waitFor(
        `Number(document.getElementById('reader-inner').dataset.currentPage) > ${first}`,
        `${title} ileri`, 20000,
      );
      const advanced = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");

      // Sürekli moda geç ve gerçekten kaydırılabilir olduğunu doğrula.
      await browser.evaluate("document.getElementById('rdr-mode').click()");
      await browser.waitFor(
        "document.getElementById('reader-inner')?.dataset.readerMode === 'scroll' && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
        `${title} sürekli`, 90000,
      );
      await delay(900);
      const scrollable = await browser.evaluate(`(() => {
        const s = document.getElementById('rdr-flipbook');
        return s.scrollHeight > s.clientHeight + 4;
      })()`);
      // 12 sayfalık Perili Köşk dahil her kitap taşmalı.
      assert.equal(scrollable, true, `${title} sürekli modda kaydırılamıyor`);

      await browser.evaluate("document.getElementById('rdr-mode').click()");
      await browser.waitFor(
        "document.getElementById('reader-inner')?.dataset.readerMode === 'page' && document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'",
        `${title} sayfa`, 90000,
      );
      await delay(700);
      const back = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
      assert.ok(Math.abs(back - advanced) <= 1, `${title}: mod turundan sonra konum kaydı (${advanced} -> ${back})`);

      // Kapat ve yeniden aç: kaldığı yerden devam etmeli.
      await browser.evaluate("document.getElementById('rdr-back').click()");
      await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", `${title} kitaplık`);
      await openBook(bookId);
      const resumed = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
      assert.ok(Math.abs(resumed - back) <= 1, `${title}: yeniden açılışta konum kaybedildi (${back} -> ${resumed})`);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* KÜÇÜK RESİM GEZGİNİ (§6/§7)                                             */
  /* ---------------------------------------------------------------------- */

  await testCase("sayfalar sekmesi küçük resimleri tembel üretir", async () => {
    // Hangi kitabın açık olduğunu ÖNCEKİ testlerden miras almayalım:
    // sıraya bağlı test kırılgandır.
    await browser.evaluate("document.getElementById('rdr-back')?.click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
    await openBook("perili-kosk");
    await browser.evaluate("document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler");
    await browser.evaluate("document.querySelector('.reader-tab[data-tab=\"pages\"]').click()");
    await browser.waitFor("document.querySelectorAll('.reader-thumb').length > 0", "küçük resim ızgarası");
    await browser.waitFor("document.querySelectorAll('.reader-thumb.is-loaded').length > 0", "ilk küçük resim", 30000);
    await delay(700);
    const grid = await browser.evaluate(`(() => ({
      cells: document.querySelectorAll('.reader-thumb').length,
      loaded: document.querySelectorAll('.reader-thumb.is-loaded').length,
      errored: document.querySelectorAll('.reader-thumb.has-error').length,
      current: document.querySelectorAll('.reader-thumb.is-current').length,
      hasImageData: !!document.querySelector('.reader-thumb.is-loaded img')?.src?.startsWith('data:image'),
    }))()`);
    assert.equal(grid.cells, 12, `Perili Köşk 12 hücre göstermeli, gelen ${grid.cells}`);
    assert.ok(grid.loaded > 0, "en az bir küçük resim üretilmeli");
    assert.equal(grid.errored, 0, "küçük resim render hatası olmamalı");
    assert.equal(grid.current, 1, "geçerli sayfa tam olarak bir kez işaretlenmeli");
    assert.equal(grid.hasImageData, true, "küçük resim gerçek PDF çıktısı olmalı");
  });

  await testCase("küçük resme tıklamak o sayfaya götürür", async () => {
    const target = await browser.evaluate(`(() => {
      const cell = [...document.querySelectorAll('.reader-thumb')].find(node => Number(node.dataset.gotoPage) === 4);
      return cell ? Number(cell.dataset.gotoPage) : null;
    })()`);
    assert.equal(target, 4, "4. sayfa hücresi bulunmalı");
    await browser.evaluate("[...document.querySelectorAll('.reader-thumb')].find(n => Number(n.dataset.gotoPage) === 4).click()");
    await delay(900);
    const state = await browser.evaluate(`(() => ({
      open: document.getElementById('rdr-contents-sheet')?.open === true,
      page: Number(document.getElementById('reader-inner').dataset.currentPage),
    }))()`);
    assert.equal(state.open, false, "küçük resme tıklayınca popup kapanmalı");
    assert.equal(state.page, 4, "okuyucu 4. sayfaya gitmeli");
  });

  await testCase("büyük kitapta küçük resimler açılışta toptan render edilmez", async () => {
    // 224 sayfalık Ateşten Gömlek: sekme açılır açılmaz 224 render başlarsa
    // okuyucu donar. Yalnızca görünür hücreler üretilmeli (§59).
    await browser.evaluate("document.getElementById('rdr-back').click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
    await openBook("atesten-gomlek");
    await browser.evaluate("document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler");
    await browser.evaluate("document.querySelector('.reader-tab[data-tab=\"pages\"]').click()");
    await browser.waitFor("document.querySelectorAll('.reader-thumb.is-loaded').length > 0", "ilk küçük resim", 40000);
    await delay(1500);
    const grid = await browser.evaluate(`(() => ({
      cells: document.querySelectorAll('.reader-thumb').length,
      loaded: document.querySelectorAll('.reader-thumb.is-loaded').length,
    }))()`);
    assert.equal(grid.cells, 224, `224 hücre beklenir, gelen ${grid.cells}`);
    assert.ok(grid.loaded > 0, "görünür küçük resimler üretilmeli");
    assert.ok(
      grid.loaded < grid.cells * 0.5,
      `küçük resimler tembel üretilmeli: ${grid.loaded}/${grid.cells} render edildi`,
    );
    await browser.evaluate("document.querySelector('#rdr-contents-sheet [data-close-sheet]').click()");
    await delay(300);
  });

  await testCase("geçersiz outline'lı kitapta Bölümler sekmesi gösterilmez", async () => {
    // Ateşten Gömlek'in outline'ı 5 kez "Boş Sayfa": genel kuralla reddedilir.
    await browser.evaluate("document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler");
    const tabs = await browser.evaluate(`(() => ({
      tabs: [...document.querySelectorAll('.reader-tab')].map(node => node.dataset.tab),
      noOutlineNote: !!document.getElementById('rdr-no-outline'),
      chapterItems: document.querySelectorAll('#rdr-panel-chapters .reader-toc-item').length,
    }))()`);
    assert.ok(!tabs.tabs.includes("chapters"), `bozuk outline'da Bölümler sekmesi olmamalı: ${tabs.tabs}`);
    assert.equal(tabs.noOutlineNote, true, "bölüm bilgisi yokluğu dürüstçe açıklanmalı");
    assert.equal(tabs.chapterItems, 0, "uydurma bölüm listelenmemeli");
    await browser.evaluate("document.querySelector('#rdr-contents-sheet [data-close-sheet]').click()");
    await delay(300);
    await browser.evaluate("document.getElementById('rdr-back').click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
    await openBook("perili-kosk");
  });

  /* ---------------------------------------------------------------------- */
  /* SON OKUNAN KONUM vs YER İMİ (§3-§5)                                     */
  /* ---------------------------------------------------------------------- */

  await testCase("son okunan sayfa yer iminden AYRI anahtarda saklanır", async () => {
    // Temiz durum: bu kitabın her iki kaydını da sıfırla.
    await browser.evaluate(`(() => {
      localStorage.removeItem('ravzaBooksProgress:perili-kosk');
      const map = JSON.parse(localStorage.getItem('ravza-books-last-read') || '{}');
      delete map['perili-kosk'];
      localStorage.setItem('ravza-books-last-read', JSON.stringify(map));
    })()`);
    await browser.evaluate("document.getElementById('rdr-back').click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
    await openBook("perili-kosk");

    // 3. sayfaya git ve yer imle -> yer imi 3.
    await browser.evaluate(`(() => {
      const range = document.getElementById('rdr-progress');
      range.value = '2';
      range.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await delay(800);
    await browser.evaluate("document.getElementById('rdr-bookmark').click()");
    await delay(500);

    // Sonra 7. sayfaya kadar "oku" (yer imlemeden).
    await browser.evaluate(`(() => {
      const range = document.getElementById('rdr-progress');
      range.value = '6';
      range.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await delay(1200);

    const stored = await browser.evaluate(`(() => ({
      bookmark: JSON.parse(localStorage.getItem('ravzaBooksProgress:perili-kosk') || 'null'),
      lastRead: JSON.parse(localStorage.getItem('ravza-books-last-read') || '{}')['perili-kosk'],
      current: Number(document.getElementById('reader-inner').dataset.currentPage),
    }))()`);
    assert.equal(stored.current, 7, "ilerleme barı 7. sayfaya gitmeliydi");
    assert.equal(stored.bookmark?.savedPage, 3, "yer imi 3. sayfada kalmalı (gezinmek onu oynatmaz)");
    assert.equal(stored.lastRead?.page, 7, "son okunan sayfa 7 olarak ayrı anahtarda saklanmalı");
  });

  await testCase("kitap kaldığı yerden devam eder, yer imi yerinde kalır", async () => {
    await browser.evaluate("document.getElementById('rdr-back').click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
    await openBook("perili-kosk");
    const resumed = await browser.evaluate(`(() => ({
      current: Number(document.getElementById('reader-inner').dataset.currentPage),
      savedPage: Number(document.getElementById('reader-inner').dataset.savedPage),
    }))()`);
    assert.equal(resumed.current, 7, "kitap son okunan 7. sayfadan açılmalı");
    assert.equal(resumed.savedPage, 3, "yer imi hâlâ 3. sayfayı göstermeli");
  });

  await testCase("kitaplık kartı devam edilecek sayfayı gösterir", async () => {
    await browser.evaluate("document.getElementById('rdr-back').click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
    const label = await browser.evaluate(`(() => {
      const card = document.querySelector('.library-book-card[data-book-id="perili-kosk"]');
      return card?.querySelector('.library-reading-state')?.textContent?.replace(/\\s+/g, ' ').trim();
    })()`);
    assert.match(label, /Sayfa 7/, `kart son okunan sayfayı göstermeli, gelen: ${label}`);
    assert.match(label, /Devam Et/, "kart Devam Et eylemini göstermeli");
  });

  await testCase("baştan başla son okunan konumu sıfırlar", async () => {
    await openBook("perili-kosk");
    await browser.evaluate("document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler");
    await browser.evaluate("document.getElementById('rdr-restart').click()");
    await delay(900);
    const state = await browser.evaluate(`(() => ({
      current: Number(document.getElementById('reader-inner').dataset.currentPage),
      savedPage: Number(document.getElementById('reader-inner').dataset.savedPage),
    }))()`);
    assert.equal(state.current, 1, "baştan başla 1. sayfaya gitmeli");
    assert.equal(state.savedPage, 3, "baştan başla yer imini silmemeli");
  });

  await testCase("sayfaya git geçersiz girdide satır içi hata gösterir", async () => {
    await browser.evaluate("document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler");
    await browser.evaluate(`(() => {
      const input = document.getElementById('rdr-goto-input');
      input.value = '9999';
      document.getElementById('rdr-goto-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })()`);
    await delay(400);
    const state = await browser.evaluate(`(() => ({
      errorShown: document.getElementById('rdr-goto-error')?.hidden === false,
      errorText: document.getElementById('rdr-goto-error')?.textContent || '',
      stillOpen: document.getElementById('rdr-contents-sheet')?.open === true,
    }))()`);
    assert.equal(state.errorShown, true, "geçersiz sayfa satır içi hata göstermeli");
    assert.match(state.errorText, /1 ile 12 arasında/, `hata metni sınırları söylemeli: ${state.errorText}`);
    assert.equal(state.stillOpen, true, "geçersiz girdide popup kapanmamalı");
    await browser.evaluate("document.querySelector('#rdr-contents-sheet [data-close-sheet]').click()");
    await delay(300);
  });

  await testCase("bozuk son-okunan kaydı okuyucuyu çökertmez", async () => {
    await browser.evaluate(`localStorage.setItem('ravza-books-last-read', JSON.stringify({ 'perili-kosk': { page: -4 }, bozuk: 'metin' }))`);
    await browser.evaluate("document.getElementById('rdr-back').click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
    await openBook("perili-kosk");
    const page = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
    assert.ok(page >= 1 && page <= 12, `geçersiz kayıt güvenli sayfaya düşmeli, gelen ${page}`);
  });

  await testCase("sayfa sayısını aşan son-okunan kaydı sınırlanır", async () => {
    await browser.evaluate(`localStorage.setItem('ravza-books-last-read', JSON.stringify({ 'perili-kosk': { page: 5000 } }))`);
    await browser.evaluate("document.getElementById('rdr-back').click()");
    await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
    await openBook("perili-kosk");
    const page = await browser.evaluate("Number(document.getElementById('reader-inner').dataset.currentPage)");
    assert.ok(page >= 1 && page <= 12, `5000 sayfa 12'ye sınırlanmalı, gelen ${page}`);
  });

  /* ---------------------------------------------------------------------- */
  /* ORTALANMIŞ POPUP GEOMETRİSİ (§27-§35, §46)                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Panel merkezinin GÖRÜNÜR alanın merkezine yakınlığını ölçer.
   * Kesin piksel iddiası yok (kırılgan olurdu); tolerans oranlı.
   */
  async function measureCentering(sheetId) {
    return browser.evaluate(`(() => {
      const sheet = document.getElementById(${JSON.stringify(sheetId)});
      const panel = sheet?.querySelector('.reader-sheet-panel, .ui-sheet-panel');
      if (!sheet?.open || !panel) return null;
      const rect = panel.getBoundingClientRect();
      const vv = window.visualViewport;
      const viewTop = vv ? vv.offsetTop : 0;
      const viewHeight = vv ? vv.height : window.innerHeight;
      const viewWidth = vv ? vv.width : window.innerWidth;
      return {
        dx: Math.abs((rect.left + rect.width / 2) - (viewWidth / 2)),
        dy: Math.abs((rect.top + rect.height / 2) - (viewTop + viewHeight / 2)),
        width: rect.width,
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        viewWidth,
        viewHeight,
        viewTop,
      };
    })()`);
  }

  for (const [label, sheetId, opener] of [
    ["içindekiler", "rdr-contents-sheet", "rdr-contents-open"],
    ["kitapta ara", "rdr-search-sheet", "rdr-search-open"],
    ["ayarlar", "rdr-settings-sheet", "rdr-settings-open"],
  ]) {
    await testCase(`${label} popup'ı ekranın ortasında açılır`, async () => {
      await browser.evaluate(`document.getElementById('${opener}').click()`);
      await browser.waitFor(`document.getElementById('${sheetId}')?.open === true`, `${label} açık`);
      await delay(500);
      const box = await measureCentering(sheetId);
      assert.ok(box, `${label} paneli ölçülemedi`);
      // Yatayda tam ortada olmalı.
      assert.ok(box.dx <= 2, `${label} yatayda ortalanmamış (sapma ${box.dx.toFixed(1)}px)`);
      // Dikeyde küçük bir tolerans: iç kaydırma/dolgu farkı olabilir.
      assert.ok(box.dy <= 8, `${label} dikeyde ortalanmamış (sapma ${box.dy.toFixed(1)}px)`);
      // Ekranın dışına taşmamalı (§28).
      assert.ok(box.top >= -1, `${label} üstten taşıyor (top ${box.top.toFixed(1)})`);
      assert.ok(
        box.bottom <= box.viewTop + box.viewHeight + 1,
        `${label} alttan taşıyor (bottom ${box.bottom.toFixed(1)} > ${(box.viewTop + box.viewHeight).toFixed(1)})`,
      );
      // Kenar boşluğu korunmalı.
      assert.ok(box.width <= box.viewWidth - 24, `${label} yatayda kenar boşluğu bırakmıyor`);
      await browser.evaluate(`document.querySelector('#${sheetId} [data-close-sheet]').click()`);
      await delay(300);
    });
  }

  await testCase("popup Escape ile kapanır ve odak açan düğmeye döner", async () => {
    await browser.evaluate("document.getElementById('rdr-contents-open').focus(); document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler açık");
    await delay(300);
    // Odak sayfanın İÇİNDE olmalı (native dialog odak tuzağı).
    const focusInside = await browser.evaluate(
      "document.getElementById('rdr-contents-sheet').contains(document.activeElement)",
    );
    assert.equal(focusInside, true, "modal açıkken odak sayfanın içinde olmalı");

    await browser.key("Escape");
    await delay(400);
    const after = await browser.evaluate(`(() => ({
      open: document.getElementById('rdr-contents-sheet')?.open === true,
      focused: document.activeElement?.id || '',
    }))()`);
    assert.equal(after.open, false, "Escape popup'ı kapatmalı");
    assert.equal(after.focused, "rdr-contents-open", "kapanınca odak açan düğmeye dönmeli");
  });

  await testCase("popup backdrop tıklamasıyla kapanır", async () => {
    await browser.evaluate("document.getElementById('rdr-settings-open').click()");
    await browser.waitFor("document.getElementById('rdr-settings-sheet')?.open === true", "ayarlar açık");
    await delay(300);
    // Backdrop = dialog elemanının kendisi; panelin dışına tıkla.
    await browser.evaluate(`(() => {
      const sheet = document.getElementById('rdr-settings-sheet');
      const rect = sheet.querySelector('.reader-sheet-panel').getBoundingClientRect();
      sheet.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true,
        clientX: rect.left / 2, clientY: 12,
      }));
    })()`);
    await delay(400);
    assert.equal(
      await browser.evaluate("document.getElementById('rdr-settings-sheet')?.open === true"),
      false,
      "backdrop tıklaması popup'ı kapatmalı",
    );
  });

  await testCase("popup geniş ekranda da ortalanır", async () => {
    await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await delay(1200);
    await browser.evaluate("document.getElementById('rdr-contents-open').click()");
    await browser.waitFor("document.getElementById('rdr-contents-sheet')?.open === true", "içindekiler açık");
    await delay(500);
    const box = await measureCentering("rdr-contents-sheet");
    assert.ok(box.dx <= 2, `masaüstünde yatayda ortalanmamış (${box.dx.toFixed(1)}px)`);
    assert.ok(box.dy <= 8, `masaüstünde dikeyde ortalanmamış (${box.dy.toFixed(1)}px)`);
    // Masaüstünde popup tüm ekranı kaplamamalı.
    assert.ok(box.width < box.viewWidth * 0.7, "masaüstünde popup aşırı geniş");
    await browser.evaluate("document.querySelector('#rdr-contents-sheet [data-close-sheet]').click()");
    await delay(300);
    await browser.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await delay(1000);
  });

  await testCase("okuyucu konsol hatası üretmez", async () => {
    const diagnostics = browser.diagnostics();
    assertCleanDiagnostics(diagnostics, "ravza-books-reader", { allowWarnings: true });
  });
} finally {
  await browser.close();
  await server.close();
}

console.log(results.join("\n"));
console.log(failures ? `\n${failures} test BAŞARISIZ` : "\nTüm okuyucu testleri geçti");
process.exit(failures ? 1 : 0);
