import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9333;
const profile = join(tmpdir(), `ravza-wheel-smoke-${Date.now()}`);
const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getPageTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch { /* Tarayıcının açılması bekleniyor. */ }
    await delay(100);
  }
  throw new Error("Headless Edge açılamadı.");
}

const target = await getPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let requestId = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text || "Tarayıcı istisnası");
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(message.params.entry.text);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

try {
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Log.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  await command("Page.navigate", { url: "http://127.0.0.1:8765/games/cark-oyunu/index.html" });
  await delay(800);

  const initial = await evaluate(`({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    count: document.querySelector('#optionCount')?.textContent,
    options: document.querySelectorAll('.option-row').length,
    overlayHidden: document.querySelector('#resultOverlay')?.hidden
  })`);
  assert.equal(initial.width, 390);
  assert.equal(initial.scrollWidth, 390, "Mobil sayfada yatay taşma var");
  assert.equal(initial.count, "1");
  assert.equal(initial.options, 1);
  assert.equal(initial.overlayHidden, true);

  const mobileSizes = [[320, 568], [360, 800], [375, 667], [390, 844], [393, 852], [412, 915], [430, 932], [768, 1024]];
  for (const [width, height] of mobileSizes) {
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: height
    });
    await delay(60);
    assert.equal(await evaluate("document.documentElement.scrollWidth"), width, `${width}x${height} görünümünde yatay taşma var`);
  }

  await evaluate(`(() => {
    const input = document.querySelector('#optionInput');
    input.value = 'Seçenek 2';
    document.querySelector('#addButton').click();
  })()`);
  assert.equal(await evaluate("document.querySelector('#optionCount').textContent"), "2");

  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("document.querySelector('#spinButton').click()");
  await delay(750);
  const spun = await evaluate(`({
    winner: document.querySelector('#modalWinner')?.textContent,
    banner: document.querySelector('#winnerBannerText')?.textContent,
    overlayHidden: document.querySelector('#resultOverlay')?.hidden,
    buttonDisabled: document.querySelector('#spinButton')?.disabled
  })`);
  assert.ok(["Seçenek 1", "Seçenek 2"].includes(spun.winner));
  assert.equal(spun.banner, spun.winner);
  assert.equal(spun.overlayHidden, false);
  assert.equal(spun.buttonDisabled, false);

  await command("Page.reload", { ignoreCache: true });
  await delay(600);
  assert.equal(await evaluate("document.querySelector('#optionCount')?.textContent"), "2");
  assert.equal(await evaluate("document.querySelector('#winnerBannerText')?.textContent"), spun.winner);
  assert.deepEqual(browserErrors, [], `Tarayıcı hataları: ${browserErrors.join(" | ")}`);

  console.log("✓ Sade seçenek paneli ve çark arayüzü yüklendi");
  console.log("✓ 320-768 px görünümlerinde yatay taşma yok");
  console.log("✓ Seçenek ekleme, dönüş, sonuç penceresi ve kayıt çalışıyor");
} finally {
  socket.close();
  browser.kill();
}
