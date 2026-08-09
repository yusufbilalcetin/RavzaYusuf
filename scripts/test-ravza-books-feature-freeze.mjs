import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, ensureTestServer, delay, assertCleanDiagnostics } from "./lib/theme-test-runtime.mjs";

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("ravza-books-feature-freeze");
const artifactDir = join(ROOT, "test-artifacts", "ravza-books-feature-freeze");
await mkdir(artifactDir, { recursive: true });

try {
  for (const viewport of [
    { width: 390, height: 844, mobile: true },
    { width: 1440, height: 900, mobile: false },
  ]) {
    await browser.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
    await browser.evaluate(`document.querySelector('.library-book-card[data-book-id="atesten-gomlek"]').click()`);
    await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "PDF reader", 60000);
    await delay(1000);
    await browser.evaluate(`document.getElementById('rdr-settings-open').click()`);
    await browser.waitFor("document.getElementById('rdr-settings-sheet')?.open", "settings open");

    const contract = JSON.parse(await browser.evaluate(`(() => {
      const sheet = document.getElementById('rdr-settings-sheet');
      const body = sheet.querySelector('.reader-sheet-body');
      const visible = el => !el.hidden && getComputedStyle(el).display !== 'none';
      return JSON.stringify({
        title: sheet.querySelector('h2')?.textContent.trim(),
        headings: [...body.querySelectorAll('.reader-settings-label')].map(el => el.textContent.trim()),
        themes: [...body.querySelectorAll('[data-theme]')].map(el => el.textContent.trim()),
        modes: [...body.querySelectorAll('[data-mode]')].map(el => el.textContent.trim()),
        controls: [...body.querySelectorAll('button, input, select, textarea')].filter(visible).map(el => ({
          tag: el.tagName, id: el.id, type: el.type || '', theme: el.dataset.theme || '', mode: el.dataset.mode || ''
        })),
        bookInfo: [...body.querySelectorAll('.pdf-book-title, .pdf-book-meta, .reader-settings-note')].map(el => el.textContent.trim()),
        touchTargets: [...body.querySelectorAll('button, label.switch, label.file-btn')].filter(visible).map(el => {
          const r=el.getBoundingClientRect(); return {name:el.textContent.trim() || el.htmlFor || el.id,w:r.width,h:r.height};
        }),
        overflow: body.scrollWidth <= body.clientWidth,
        zoomControls: body.querySelectorAll('.zoom-btn, #rdr-zoom-group, [data-zoom]').length,
        preferenceControls: body.querySelectorAll('select, textarea').length,
      });
    })()`));

    assert.equal(contract.title, "Temalar ve Ayarlar");
    assert.deepEqual(contract.headings, ["Okuma teması", "Okuma modu", "Açık kitap", "Geri bildirim", "Okuma ekranı", "Kitap"]);
    assert.deepEqual(contract.themes, ["Beyaz", "Kâğıt", "Koyu", "Siyah"]);
    assert.deepEqual(contract.modes, ["Sayfa", "Kaydırma"]);
    const allowed = new Set([
      ...["light", "sepia", "dark", "black"].map(theme => `BUTTON::button:${theme}:`),
      ...["page", "scroll"].map(mode => `BUTTON::button::${mode}`),
      "INPUT:sound-toggle:checkbox::", "INPUT:wake-lock-toggle:checkbox::",
      "INPUT:fullscreen-toggle:checkbox::", "INPUT:txt-book-input:file::",
    ]);
    const actual = contract.controls.map(item => `${item.tag}:${item.id}:${item.type}:${item.theme}:${item.mode}`);
    assert.ok(actual.every(item => allowed.has(item)), `beklenmeyen ayar kontrolu: ${actual.filter(item => !allowed.has(item)).join(', ')}`);
    assert.ok(actual.includes("INPUT:sound-toggle:checkbox::"), "Sayfa sesi yok");
    assert.ok(actual.includes("INPUT:wake-lock-toggle:checkbox::"), "Ekrani Acik Tut yok");
    assert.ok(actual.includes("INPUT:txt-book-input:file::"), "TXT kitap sec yok");
    assert.ok(contract.bookInfo.some(text => text.includes("Ateşten Gömlek")), "acik kitap adi yok");
    assert.ok(contract.bookInfo.some(text => /PDF/.test(text) && /sayfa/.test(text)), "PDF/sayfa bilgisi yok");
    assert.equal(contract.zoomControls, 0, "feature-freeze disi zoom kontrolu bulundu");
    assert.equal(contract.preferenceControls, 0, "beklenmeyen select/textarea bulundu");
    assert.equal(contract.overflow, true, `${viewport.width}px ayarlar paneli yatay tasiyor`);
    const undersized = contract.touchTargets.filter(target => target.w < 44 || target.h < 44);
    assert.equal(undersized.length, 0, `${viewport.width}px 44px altinda dokunma hedefi: ${JSON.stringify(undersized)}`);

    const shot = await browser.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(artifactDir, `settings-${viewport.width}.png`), Buffer.from(shot.data, "base64"));
  }
  assertCleanDiagnostics(browser, "Ravza Books feature freeze");
  console.log("PASS Ravza Books feature freeze: mevcut kontrol seti, kitap bilgisi, 44px hedefler ve responsive panel");
} finally {
  await browser.close();
  await server.close();
}
