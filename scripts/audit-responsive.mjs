// Responsive denetimi: her rotayı telefon/tablet/masaüstü genişliklerinde açar,
// yatay taşma + görünür alandan taşan öğe + küçük dokunma hedefi raporlar.
// Kullanım: python -m http.server 8765 (kök dizinde) sonra node scripts/audit-responsive.mjs
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9334;
const base = "http://127.0.0.1:8765";

const ROUTES = ["ana-sayfa", "ravzalingo", "kahoot", "calisma-merkezi", "konu-detay", "ezber-merkezi",
  "bosluk-doldurma", "quiz-merkezi", "sinav-merkezi", "hizli-tekrar", "birinci-sinif", "ikinci-sinif", "oyun"];
const WIDTHS = [[360, 780], [430, 930], [768, 1024], [1280, 800]];
const TOUCH_MIN = 44;

const profile = join(tmpdir(), `ravza-audit-${Date.now()}`);
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageTarget() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch { /* tarayıcı açılıyor */ }
    await delay(100);
  }
  throw new Error("Headless Edge açılamadı.");
}

const target = await pageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  socket.addEventListener("open", res, { once: true });
  socket.addEventListener("error", rej, { once: true });
});

let seq = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (!msg.id || !pending.has(msg.id)) return;
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  if (msg.error) reject(new Error(msg.error.message));
  else resolve(msg.result);
});

function command(method, params = {}) {
  const id = ++seq;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const res = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result.value;
}

// Sayfadaki taşan öğeleri ve küçük dokunma hedeflerini toplayan tarayıcı-içi ölçüm.
const PROBE = `(() => {
  const desc = (el) => el.tagName.toLowerCase()
    + (el.id ? "#" + el.id : "")
    + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
  const visible = (el, r) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";

  const active = document.querySelector("section.active");
  const scope = active || document.body;

  // Taşan öğeyi sınıflandır: bir üst kutu kaydırıyorsa sorun değil, kırpıyorsa içerik erişilemez.
  const kapsayici = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") return "kaydirilabilir";
      if (ox === "hidden" || ox === "clip") return "kirpiliyor";
    }
    return "gercek-tasma";
  };

  const tasan = [];
  for (const el of scope.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    if (r.right > innerWidth + 1 || r.left < -1) {
      const tiklanabilir = el.matches("button, a, input, select, textarea, img, [role=button], [onclick]");
      tasan.push({ el: desc(el), sag: Math.round(r.right), sol: Math.round(r.left), g: Math.round(r.width), tur: kapsayici(el), tiklanabilir });
    }
  }

  // checkbox/radio bir label içindeyse asıl dokunma hedefi label'dır — onu ölç.
  const hedefKutusu = (el) => {
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      const label = el.closest("label");
      if (label) return label.getBoundingClientRect();
    }
    return el.getBoundingClientRect();
  };

  // 44px kuralı dokunmatik genişlikler için; masaüstünde işaretçi fare, geçerli değil.
  const dokunmatik = innerWidth <= 768;

  const kucukHedef = [];
  for (const el of dokunmatik ? scope.querySelectorAll("button, a, input, select, textarea, [role=button]") : []) {
    const r = el.getBoundingClientRect();
    if (!visible(el, r)) continue;
    const hedef = hedefKutusu(el);
    if (hedef.height < ${TOUCH_MIN} - 0.5 || hedef.width < ${TOUCH_MIN} - 0.5) {
      const cs = getComputedStyle(el);
      kucukHedef.push({ el: desc(el), g: Math.round(hedef.width), y: Math.round(hedef.height), mh: cs.minHeight, pad: cs.paddingTop + "/" + cs.paddingBottom });
    }
  }

  // Kaydırılabilir şeritler sorun değil. Kırpılan kutular ancak içindeki tıklanabilir öğe de
  // ekran dışındaysa sorundur (RavzaLingo patikası: kutu geniş, düğme ortada ve görünür).
  const ciddi = tasan.filter((t) => t.tur !== "kaydirilabilir" && t.tiklanabilir);

  return {
    yatayTasma: document.documentElement.scrollWidth - innerWidth,
    tasan: ciddi.slice(0, 6),
    tasanSayi: ciddi.length,
    kaydirilabilirSayi: tasan.length - ciddi.length,
    kucukHedef: kucukHedef.slice(0, 6),
    kucukHedefSayi: kucukHedef.length
  };
})()`;

const report = [];

try {
  await command("Page.enable");
  await command("Runtime.enable");

  for (const [width, height] of WIDTHS) {
    await command("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: height
    });
    await command("Page.navigate", { url: `${base}/index.html` });
    // Uygulama modülleri yüklenip navigate() global'i hazır olana kadar bekle.
    for (let i = 0; i < 40; i += 1) {
      if (await evaluate("typeof window.navigate === 'function'")) break;
      await delay(150);
    }
    await delay(600);

    for (const route of ROUTES) {
      await evaluate(`window.navigate(${JSON.stringify(route)})`);
      await delay(700);
      const result = await evaluate(PROBE);
      if (result.yatayTasma > 0 || result.tasanSayi || result.kucukHedefSayi) {
        report.push({ width, route, ...result });
      }
    }
  }
} finally {
  socket.close();
  browser.kill();
}

if (!report.length) {
  console.log("✓ Hiçbir genişlikte taşma veya küçük dokunma hedefi yok.");
} else {
  for (const r of report) {
    console.log(`\n[${r.width}px] ${r.route}`);
    if (r.yatayTasma > 0) console.log(`  ✗ Yatay taşma: ${r.yatayTasma}px`);
    if (r.tasanSayi) {
      console.log(`  ✗ Görünür alandan taşan öğe: ${r.tasanSayi}`);
      for (const t of r.tasan) console.log(`      [${t.tur}] ${t.el}  (sol ${t.sol}, sağ ${t.sag}, genişlik ${t.g})`);
    }
    if (r.kucukHedefSayi) {
      console.log(`  ✗ 44px altı dokunma hedefi: ${r.kucukHedefSayi}`);
      for (const t of r.kucukHedef) console.log(`      ${t.el}  ${t.g}x${t.y}  min-height:${t.mh} pad:${t.pad}`);
    }
  }
  console.log(`\nToplam sorunlu (genişlik × sayfa): ${report.length}`);
}
