import assert from "node:assert/strict";
import { ThemeTestBrowser, ensureTestServer, delay, assertCleanDiagnostics } from "./lib/theme-test-runtime.mjs";

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-interaction");
const mouse = (type, x, y) => browser.command("Input.dispatchMouseEvent", {
  type, x: Math.round(x), y: Math.round(y), button: "left",
  buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse",
});

try {
  await browser.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
  await browser.evaluate(`localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:'page'})); document.querySelector('.library-book-card[data-book-id="atesten-gomlek"]').click()`);
  await browser.waitFor("document.querySelector('.pdf-page.is-rendered')", "PDF reader", 60000);
  await delay(1800);
  const geometry = JSON.parse(await browser.evaluate(`(() => {
    const block = document.querySelector('.stf__block');
    const book = block.getBoundingClientRect();
    const stage = document.getElementById('rdr-stage');
    window.__readerProbe = { moves: 0, got: 0, lost: 0 };
    stage.addEventListener('pointermove', () => window.__readerProbe.moves++, true);
    block.addEventListener('gotpointercapture', () => window.__readerProbe.got++);
    block.addEventListener('lostpointercapture', () => window.__readerProbe.lost++);
    return JSON.stringify({x:book.x,y:book.y,w:book.width,h:book.height});
  })()`));
  const sx = geometry.x + geometry.w - 30;
  const sy = geometry.y + geometry.h / 2;
  const targets = [
    [geometry.x - 240, sy], [geometry.x + geometry.w + 240, sy],
    [geometry.x + geometry.w * .3, 2],
    [geometry.x + geometry.w * .3, 898],
  ];
  await mouse("mousePressed", sx, sy);
  await delay(60);
  for (const [tx, ty] of targets) {
    for (let step = 1; step <= 8; step++) {
      await mouse("mouseMoved", sx + (tx - sx) * step / 8, sy + (ty - sy) * step / 8);
    }
    const active = JSON.parse(await browser.evaluate(`JSON.stringify({
      curling: document.getElementById('rdr-stage').classList.contains('is-page-curling')
    })`));
    assert.equal(active.curling, true, "sinir disinda jest aktif kalmali");
  }
  await mouse("mouseReleased", targets.at(-1)[0], targets.at(-1)[1]);
  await delay(1400);
  assert.equal(await browser.evaluate(`document.getElementById('rdr-stage').classList.contains('is-page-curling')`), false);
  const probe = JSON.parse(await browser.evaluate("JSON.stringify(window.__readerProbe)"));
  assert.ok(probe.moves >= 32, `sinir disi move kaybi: ${probe.moves}/32`);

  await mouse("mousePressed", sx, sy);
  await browser.evaluate(`window.dispatchEvent(new Event('blur'))`);
  assert.equal(await browser.evaluate(`document.getElementById('rdr-stage').classList.contains('is-page-curling')`), false, "blur cleanup");
  assertCleanDiagnostics(browser, "reader interaction");
  console.log("PASS reader stage capture: 4 yon, outside release ve blur cleanup");
} finally {
  await browser.close();
  await server.close();
}
