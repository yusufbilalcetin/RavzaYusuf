/**
 * Scroll-reveal davranis testi.
 *
 * Kritik nokta: icerik hicbir kosulda kalici olarak gorunmez kalmamali.
 * IntersectionObserver arka plan sekmesinde askiya alinabilir; o durumda
 * emniyet agi devreye girip her seyi acmali. Gozlemci calisiyorsa emniyet
 * agi devreye GIRMEMELI, yoksa uzun sayfalarda alt bloklar vaktinden once
 * acilir ve kademeli giris kaybolur.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8477;
// fileURLToPath sart: proje yolunda bosluk var, URL.pathname onu %20 olarak
// birakir ve dosya okumalari sessizce 404'e duser.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };

const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  try {
    const body = await readFile(join(ROOT, path === "/" ? "/index.html" : path));
    response.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

const profile = join(tmpdir(), `ravza-scroll-reveal-${Date.now()}`);
const browser = spawn(CHROME, [
  "--headless=new", "--no-first-run", "--disable-extensions", "--remote-debugging-port=9412",
  `--user-data-dir=${profile}`, "about:blank"
], { stdio: "ignore" });

let socket;
let nextId = 1;
const pending = new Map();

async function connect() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await fetch("http://127.0.0.1:9412/json/list").then((r) => r.json());
      const page = targets.find((t) => t.type === "page");
      if (page) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.onopen = resolve;
          socket.onerror = reject;
        });
        socket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          const entry = pending.get(message.id);
          if (!entry) return;
          pending.delete(message.id);
          entry(message.result);
        };
        return;
      }
    } catch {
      // tarayici henuz ayakta degil
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Chrome DevTools baglantisi kurulamadi");
}

function send(method, params) {
  const id = nextId += 1;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "evaluate hatasi");
  return result?.result?.value;
};

try {
  await connect();
  await send("Page.enable", {});
  await send("Runtime.enable", {});
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?page=sinav-merkezi` });

  await evaluate(`(async () => {
    for (let i = 0; i < 80; i += 1) {
      if (document.querySelector('#page-root .page.active [data-reveal]')) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  })()`);

  const targets = await evaluate(`document.querySelectorAll('#page-root .page.active [data-reveal]').length`);
  assert.ok(targets >= 3, `Reveal hedefi sayfa kabugunun altina inmeli, bulunan: ${targets}`);

  // Gozlemci calisirken: ust bloklar acilir, alt bloklar KAPALI kalir.
  // Hepsinin birden acilmasi kademeli girisin kayboldugu anlamina gelirdi.
  const live = await evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 2400));
    const all = [...document.querySelectorAll('#page-root .page.active [data-reveal]')];
    return {
      revealed: all.filter(el => el.classList.contains('is-revealed')).length,
      hidden: all.filter(el => getComputedStyle(el).opacity === '0').length
    };
  })()`);
  assert.ok(live.revealed >= 1, "Gorunur alandaki bloklar acilmadi");
  assert.ok(live.hidden >= 1, "Alt bloklar da acilmis: emniyet agi calisan gozlemciyi eziyor");

  // Kaydirinca alt bloklar da acilmali.
  const afterScroll = await evaluate(`(async () => {
    document.querySelector('.main-content').scrollTo({ top: 99999, behavior: 'auto' });
    await new Promise(r => setTimeout(r, 900));
    return [...document.querySelectorAll('#page-root .page.active [data-reveal]')]
      .filter(el => getComputedStyle(el).opacity === '0').length;
  })()`);
  assert.equal(afterScroll, 0, "Kaydirmaya ragmen gizli kalan blok var");

  // RavzaLingo kendi node/path animasyonlarina sahip tam ekran bir uygulama.
  // On binlerce piksel yuksekligindeki kokunu tek reveal hedefi yapmak,
  // normal viewportta threshold oranina hic ulasamamasina neden oluyordu.
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?page=ravzalingo` });
  const ravzaLingo = await evaluate(`(async () => {
    for (let i = 0; i < 120; i += 1) {
      if (document.querySelector('#ravzaLingoRoot .rlz5-shell')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 400));
    const root = document.querySelector('#ravzaLingoRoot');
    const rect = root?.getBoundingClientRect();
    return {
      shell: Boolean(root?.querySelector('.rlz5-shell')),
      sections: root?.querySelectorAll('.rlz5-section').length || 0,
      rootOpacity: root ? getComputedStyle(root).opacity : '0',
      rootHeight: Math.round(rect?.height || 0),
      rootReveal: root?.hasAttribute('data-reveal') || false,
      htmlReveal: document.documentElement.classList.contains('has-scroll-reveal')
    };
  })()`);
  assert.equal(ravzaLingo.shell && ravzaLingo.sections > 0, true, "RavzaLingo icerigi render edilmedi");
  assert.ok(ravzaLingo.rootHeight > 0, "RavzaLingo kokunun olcusu sifir");
  assert.equal(ravzaLingo.rootOpacity, "1", "RavzaLingo koku opacity:0 kaldi");
  assert.equal(ravzaLingo.rootReveal || ravzaLingo.htmlReveal, false, "RavzaLingo gereksiz scroll-reveal kapsamina girdi");

  // Emniyet agi: gozlemci hic raporlamazsa icerik yine de gorunur olmali.
  // IntersectionObserver, uygulama scriptleri calismadan once devre disi
  // birakilir - arka plan sekmesinde askiya alinmis gozlemciyi taklit eder.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.IntersectionObserver = function () {
      return { observe() {}, unobserve() {}, disconnect() {} };
    };`
  });
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?page=sinav-merkezi` });

  const deadObserverHidden = await evaluate(`(async () => {
    for (let i = 0; i < 80; i += 1) {
      if (document.querySelector('#page-root .page.active [data-reveal]')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 2400));
    return [...document.querySelectorAll('#page-root .page.active [data-reveal]')]
      .filter(el => getComputedStyle(el).opacity === '0').length;
  })()`);
  assert.equal(deadObserverHidden, 0, "Gozlemci olu iken icerik gorunmez kaldi");

  // Ilk callback'in yalnizca non-intersecting kayitlar bildirmesi de "observer
  // canli" demek degildir. Timer bu callback'te iptal edilirse icerik kalici
  // gizli kalir; bu senaryo dogrudan o regresyonu yakalar.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.IntersectionObserver = function (callback) {
      return {
        observe(element) {
          queueMicrotask(() => callback([{ target: element, isIntersecting: false }], this));
        },
        unobserve() {},
        disconnect() {}
      };
    };`
  });
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?page=sinav-merkezi&observer=non-intersecting` });
  const falseCallbackHidden = await evaluate(`(async () => {
    for (let i = 0; i < 80; i += 1) {
      if (document.querySelector('#page-root .page.active [data-reveal]')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 2400));
    return [...document.querySelectorAll('#page-root .page.active [data-reveal]')]
      .filter(el => getComputedStyle(el).opacity === '0').length;
  })()`);
  assert.equal(falseCallbackHidden, 0, "Non-intersecting ilk callback emniyet timer'ini erken iptal etti");

  console.log(`✓ Scroll-reveal: ${targets} hedef · kademeli acilis korunuyor · RavzaLingo ilk render gorunur · olu/non-intersecting gozlemcide icerik yine gorunur`);
} finally {
  socket?.close();
  browser.kill();
  server.close();
}
