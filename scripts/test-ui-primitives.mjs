#!/usr/bin/env node
/**
 * js/ui/sheet.js ilkelleri icin regresyon testi.
 *
 * Bu ilkeller native alert()/confirm()'in yerini aliyor, yani kullanicinin
 * "sil / bitir / cik" gibi geri donusu olmayan kararlari buradan geciyor.
 * Yanlis cozulen bir Promise sessizce yanlis dala girer - bu yuzden dogrulanan
 * sey gorunum degil, SOZLESME: hangi etkilesim hangi degeri cozer.
 *
 * Kullanim: node ./scripts/test-ui-primitives.mjs
 */
import assert from "node:assert/strict";
import { BASE_URL, ThemeTestBrowser, ensureTestServer, delay } from "./lib/theme-test-runtime.mjs";

const MIN_TAP = 44;

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

/** Sayfaya modulu yukleyip window'a asar; her testte tekrar kullanilir. */
const LOAD_MODULE = `(async () => {
  const mod = await import("/js/ui/sheet.js");
  window.__ui = mod;
  return typeof mod.uiConfirm === "function";
})()`;

await ensureTestServer();
const browser = await ThemeTestBrowser.launch("ui-primitives");

try {
  await browser.navigate("/");
  await browser.waitFor("!!document.querySelector('#launcherDock')", "launcher hazir");
  assert.equal(await browser.evaluate(LOAD_MODULE), true, "js/ui/sheet.js yuklenemedi");

  await runCase("uiAlert acilir, Tamam kapatir ve Promise cozulur", async () => {
    await browser.evaluate(`window.__alertDone = false;
      window.__ui.uiAlert("Test mesaji", { title: "Baslik" }).then(() => { window.__alertDone = true; });`,
      { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-sheet[open]')", "alert acildi");

    assert.equal(
      await browser.evaluate(`document.querySelector('.ui-sheet-message').textContent`),
      "Test mesaji",
    );
    // Tek buton olmali: alert'te iptal yok.
    assert.equal(await browser.evaluate(`document.querySelectorAll('.ui-sheet-btn').length`), 1);

    await browser.evaluate(`document.querySelector('.ui-sheet-btn').click()`, { awaitPromise: false });
    await browser.waitFor("window.__alertDone === true", "alert Promise cozuldu");
  });

  await runCase("uiConfirm: onay -> true", async () => {
    await browser.evaluate(`window.__r = "pending";
      window.__ui.uiConfirm("Emin misin?", { okLabel: "Evet" }).then((v) => { window.__r = v; });`,
      { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-sheet[open]')", "confirm acildi");
    await browser.evaluate(`[...document.querySelectorAll('.ui-sheet-btn')]
      .find((b) => b.dataset.uiValue === "ok").click()`, { awaitPromise: false });
    await browser.waitFor("window.__r === true", "confirm true cozdu");
  });

  await runCase("uiConfirm: iptal -> false", async () => {
    await browser.evaluate(`window.__r = "pending";
      window.__ui.uiConfirm("Emin misin?").then((v) => { window.__r = v; });`,
      { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-sheet[open]')", "confirm acildi");
    await browser.evaluate(`[...document.querySelectorAll('.ui-sheet-btn')]
      .find((b) => b.dataset.uiValue === "").click()`, { awaitPromise: false });
    await browser.waitFor("window.__r === false", "confirm false cozdu");
  });

  await runCase("uiConfirm: Escape -> false (kapatma = iptal)", async () => {
    await browser.evaluate(`window.__r = "pending";
      window.__ui.uiConfirm("Emin misin?").then((v) => { window.__r = v; });`,
      { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-sheet[open]')", "confirm acildi");
    await browser.key("Escape");
    await browser.waitFor("window.__r === false", "Escape false cozdu");
  });

  await runCase("Yikici onayda odak guvenli butonda baslar", async () => {
    await browser.evaluate(`window.__r = "pending";
      window.__ui.uiConfirm("Silinsin mi?", { destructive: true, okLabel: "Sil" })
        .then((v) => { window.__r = v; });`, { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-sheet[open]')", "confirm acildi");
    // Enter'a refleksle basan kullanici silmemeli: odak iptal butonunda olmali.
    assert.equal(
      await browser.evaluate(`document.activeElement?.dataset.uiValue`),
      "",
      "yikici onayda odak iptal butonunda degil",
    );
    await browser.key("Escape");
    await browser.waitFor("window.__r === false", "kapandi");
  });

  await runCase("uiActionSheet: secim degeri, iptal -> null", async () => {
    await browser.evaluate(`window.__r = "pending";
      window.__ui.uiActionSheet("Islem", [
        { label: "Duzenle", value: "edit" },
        { label: "Sil", value: "delete", destructive: true },
      ]).then((v) => { window.__r = v; });`, { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-sheet[open]')", "action sheet acildi");
    // 2 secim + otomatik eklenen Iptal.
    assert.equal(await browser.evaluate(`document.querySelectorAll('.ui-sheet-btn').length`), 3);
    await browser.evaluate(`[...document.querySelectorAll('.ui-sheet-btn')]
      .find((b) => b.dataset.uiValue === "delete").click()`, { awaitPromise: false });
    await browser.waitFor(`window.__r === "delete"`, "action sheet degeri cozdu");

    await browser.evaluate(`window.__r = "pending";
      window.__ui.uiActionSheet("Islem", [{ label: "Duzenle", value: "edit" }])
        .then((v) => { window.__r = v; });`, { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-sheet[open]')", "action sheet acildi");
    await browser.key("Escape");
    await browser.waitFor("window.__r === null", "iptal null cozdu");
  });

  await runCase("Kapanan diyalog DOM'da artik birakmaz", async () => {
    const leftovers = await browser.evaluate(`document.querySelectorAll('.ui-sheet').length`);
    assert.equal(leftovers, 0, `${leftovers} adet .ui-sheet DOM'da kaldi`);
  });

  await runCase("Diyalog butonlari >= 44px dokunma hedefi", async () => {
    await browser.setViewport({ width: 390, height: 844 });
    await browser.evaluate(`window.__ui.uiConfirm("Olcum", { okLabel: "Tamam" });`,
      { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-sheet[open]')", "confirm acildi");
    const small = await browser.evaluate(`(() => {
      return [...document.querySelectorAll('.ui-sheet-btn')]
        .map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; })
        .filter((m) => m.h < ${MIN_TAP} || m.w < ${MIN_TAP});
    })()`);
    assert.deepEqual(small, [], `kucuk dokunma hedefi: ${JSON.stringify(small)}`);
    await browser.key("Escape");
    await delay(250);
  });

  await runCase("showToast gorunur ve kendiliginden kaybolur", async () => {
    await browser.evaluate(`window.__ui.showToast("Kaydedildi", { duration: 400 })`,
      { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-toast.is-visible')", "toast gorundu");
    assert.equal(
      await browser.evaluate(`document.querySelector('.ui-toast').textContent`),
      "Kaydedildi",
    );
    // Toast'ta buton olmamali; olsaydi dokunma hedefi taramasina takilirdi.
    assert.equal(await browser.evaluate(`document.querySelectorAll('.ui-toast button').length`), 0);
    await browser.waitFor("document.querySelectorAll('.ui-toast').length === 0", "toast kayboldu", 5000);
  });

  await runCase("Mesaj metni HTML olarak yorumlanmaz", async () => {
    // Mesajlar Firebase hata metni gibi kontrolsuz kaynaklardan gelebiliyor.
    await browser.evaluate(`window.__ui.uiAlert("<img src=x onerror=window.__xss=1>")`,
      { awaitPromise: false });
    await browser.waitFor("!!document.querySelector('.ui-sheet[open]')", "alert acildi");
    assert.equal(await browser.evaluate(`document.querySelectorAll('.ui-sheet-message img').length`), 0);
    assert.equal(await browser.evaluate(`window.__xss === undefined`), true, "XSS calisti");
    await browser.key("Escape");
    await delay(250);
  });

  await runCase("Konsol hatasi yok", async () => {
    const diagnostics = browser.diagnostics();
    assert.deepEqual(diagnostics.consoleErrors, [], diagnostics.consoleErrors.join(" | "));
  });
} finally {
  await browser.close();
}

const failed = cases.filter((entry) => !entry.ok);
console.log(`\n${cases.length - failed.length}/${cases.length} gecti`);
if (failed.length) process.exitCode = 1;
else console.log("✓ UI ilkelleri (toast / alert / confirm / action sheet) sozlesmesi dogrulandi");
