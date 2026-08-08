#!/usr/bin/env node
/**
 * Ravza Books okuyucu görsel QA'i.
 *
 * screenshot.mjs rota x tema x viewport alıyor; okuyucunun ihtiyacı olan
 * eksen farklı: OKUMA TEMASI x KABUK DURUMU x AÇIK SAYFA. Bu script o
 * durumları kurar ve kareyi ancak durum oturduktan sonra alır (§50: geçiş
 * sırasında kare alma).
 *
 * Kullanım: node scripts/screenshot-reader.mjs [--out=klasor] [--book=perili-kosk]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, ensureTestServer, delay } from "./lib/theme-test-runtime.mjs";

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((value) => value.startsWith("--"))
    .map((value) => { const [key, ...rest] = value.slice(2).split("="); return [key, rest.join("=") || "true"]; }),
);

const BOOK = args.book || "perili-kosk";
const outDir = join(ROOT, "test-artifacts", "screens", args.out || "reader");
await mkdir(outDir, { recursive: true });

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-shots");
const saved = [];

async function shoot(name) {
  const { data } = await browser.command("Page.captureScreenshot", { format: "png" });
  const file = join(outDir, `${name}.png`);
  await writeFile(file, Buffer.from(data, "base64"));
  saved.push(name);
}

async function openLibrary() {
  await browser.navigate("/?page=ravza-books", "!!document.querySelector('#ravzabooks')");
  await browser.waitFor("document.querySelectorAll('.library-book-card').length > 0", "kitaplık");
  await delay(900);
}

async function openBook(bookId) {
  await browser.evaluate(`document.querySelector('.library-book-card[data-book-id="${bookId}"]').click()`);
  await browser.waitFor("document.querySelector('#ravzabooks')?.dataset.appMode === 'reading'", "okuma", 90000);
  await browser.waitFor("document.querySelectorAll('.pdf-page.is-rendered').length > 0", "sayfa render", 60000);
  await delay(900);
}

/** Kabuğu görünür yapar ve otomatik gizlemeyi durdurur; kare net olsun. */
async function pinChrome() {
  await browser.evaluate("document.querySelector('.reader-root').classList.add('controls-visible')");
  await delay(500);
}

async function hideChrome() {
  await browser.evaluate("document.querySelector('.reader-root').classList.remove('controls-visible')");
  await delay(500);
}

async function setReaderTheme(theme) {
  await browser.evaluate(`(() => {
    const prefs = JSON.parse(localStorage.getItem('ravza-books-prefs') || '{}');
    prefs.theme = ${JSON.stringify(theme)};
    localStorage.setItem('ravza-books-prefs', JSON.stringify(prefs));
    document.getElementById('ravzabooks').dataset.readerTheme = ${JSON.stringify(theme)};
  })()`);
  await delay(600);
}

try {
  /* --- Telefon --- */
  await browser.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  await browser.seedTheme("light");
  await openLibrary();
  await shoot("library-390-light");
  await browser.seedTheme("dark");
  await openLibrary();
  await shoot("library-390-dark");

  await openBook(BOOK);
  for (const theme of ["light", "sepia", "dark", "black"]) {
    await setReaderTheme(theme);
    await pinChrome();
    await shoot(`reader-390-${theme}-chrome`);
  }

  await setReaderTheme("light");
  await hideChrome();
  await shoot("reader-390-light-nochrome");

  await pinChrome();
  await browser.evaluate("document.getElementById('rdr-contents-open').click()");
  await delay(800);
  await shoot("reader-390-contents");
  await browser.evaluate("document.querySelector('#rdr-contents-sheet [data-close-sheet]').click()");
  await delay(400);

  await browser.evaluate("document.getElementById('rdr-search-open').click()");
  await delay(500);
  await browser.evaluate(`(() => {
    const input = document.getElementById('rdr-search-input');
    input.value = 'Sermet';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.waitFor("document.querySelectorAll('.reader-search-item').length > 0", "arama sonuçları", 40000);
  await delay(500);
  await shoot("reader-390-search");
  await browser.evaluate("document.querySelector('#rdr-search-sheet [data-close-sheet]').click()");
  await delay(400);

  await browser.evaluate("document.getElementById('rdr-settings-open').click()");
  await delay(800);
  await shoot("reader-390-settings");
  await browser.evaluate("document.querySelector('#rdr-settings-sheet [data-close-sheet]').click()");
  await delay(400);

  // Sayfa küçük resimleri sekmesi.
  await browser.evaluate("document.getElementById('rdr-contents-open').click()");
  await delay(500);
  await browser.evaluate("document.querySelector('.reader-tab[data-tab=\"pages\"]')?.click()");
  await browser.waitFor("document.querySelectorAll('.reader-thumb.is-loaded').length > 2", "küçük resimler", 40000);
  await delay(900);
  await shoot("reader-390-thumbnails");
  await browser.evaluate("document.querySelector('.reader-tab[data-tab=\"bookmarks\"]')?.click()");
  await delay(500);
  await shoot("reader-390-bookmarks");
  await browser.evaluate("document.querySelector('#rdr-contents-sheet [data-close-sheet]').click()");
  await delay(400);

  // Tema paneli (paylasilan popup): ortalanmis mi?
  await browser.navigate("/", "!!document.querySelector('#dashboard')");
  await delay(1500);
  await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
  await delay(900);
  await shoot("theme-panel-390-centered");
  await browser.evaluate("document.querySelector('[data-theme-sheet-close]')?.click()");
  await delay(500);
  await openLibrary();
  await openBook(BOOK);

  /* --- Büyük telefon --- */
  await browser.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await delay(1200);
  await pinChrome();
  await shoot("reader-430-light-chrome");

  /* --- Tablet dikey / yatay --- */
  await browser.setViewport({ width: 768, height: 1024, deviceScaleFactor: 2, mobile: true });
  await delay(1400);
  await pinChrome();
  await shoot("reader-768-portrait");

  await browser.setViewport({ width: 1024, height: 768, deviceScaleFactor: 2, mobile: true });
  await delay(1600);
  await pinChrome();
  await shoot("reader-1024-landscape");

  /* --- Masaüstü --- */
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await delay(1600);
  await pinChrome();
  await shoot("reader-1440-desktop");

  /* --- Sürekli kaydırma modu --- */
  await browser.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await delay(800);
  await browser.evaluate(`(() => {
    const prefs = JSON.parse(localStorage.getItem('ravza-books-prefs') || '{}');
    prefs.readerMode = 'scroll';
    localStorage.setItem('ravza-books-prefs', JSON.stringify(prefs));
  })()`);
  await openLibrary();
  await openBook(BOOK);
  await pinChrome();
  await shoot("reader-390-scroll-chrome");
  await hideChrome();
  await shoot("reader-390-scroll-nochrome");
} finally {
  await browser.close();
  await server.close();
}

console.log(`${saved.length} kare yazıldı:\n  ${saved.join("\n  ")}\n-> ${outDir}`);
