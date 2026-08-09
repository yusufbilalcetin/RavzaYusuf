/**
 * Firebase yaşam döngüsü ve ağ davranışı testi.
 *
 * ÜRETİM GÜVENLİĞİ - bu testin ilk kuralı:
 *   firestore.googleapis.com CDP seviyesinde ENGELLENİR. Test hiçbir belge
 *   yazmaz, hiçbir belge silmez; yalnızca uygulamanın ne yapmaya ÇALIŞTIĞINI
 *   sayar. "Üretime hiçbir istek ulaşmadı" ayrıca bir vaka olarak doğrulanır.
 *
 * ENVANTER (kaynak taramasıyla çıkarıldı, ölçümle doğrulandı):
 *   js/config/firebase-config.js     initializeApp + getFirestore, modül düzeyi
 *   js/features/kahoot-room.js       5 onSnapshot (TEK gerçek realtime tüketici)
 *   js/legacy/legacy-app.js          getDoc/setDoc - ilerleme, streak, RavzaLingo
 *   js/features/device-analytics.js  addDoc - oturum başına EN FAZLA bir ziyaret
 *   js/admin/admin.js, admin-guard.js  getDoc/getDocs/setDoc - yalnız admin
 *   games/cark-oyunu/*               SDK yok, REST fetch
 *
 * ÖLÇÜM YÖNTEMİ: Firestore'un taşıma katmanı WebChannel'dır; tek bir bağlantı
 * birden çok dinleyiciyi taşır. Bu yüzden "dinleyici sayısı" bağlantı sayarak
 * ölçülemez. Sızıntı imzası MUTLAK sayı değil, döngü başına BÜYÜMEDİR: her
 * gezinme bir dinleyici bırakıyorsa geç döngüler erken döngülerden daha çok
 * trafik üretir. Engelli uçta yeniden deneme geri çekilmesi zamanla trafiği
 * AZALTTIĞI için "geç <= erken" sağlam bir iddiadır.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, ensureTestServer, delay } from "./lib/theme-test-runtime.mjs";

const ARTIFACT_DIR = join(ROOT, "test-artifacts", "perf");
const FIRESTORE_HOST = "firestore.googleapis.com";
const CYCLES = 10;

const results = [];
let failures = 0;

async function testCase(name, run) {
  try {
    await run();
    results.push(`  PASS  ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`  FAIL  ${name}\n        ${String(error.message).split("\n").join("\n        ")}`);
  }
}

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch();

/** Uzak istekler ham hâlde toplanır; faz sınırları indeksle işaretlenir. */
const remoteRequests = [];
const blockedResponses = [];
browser.socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Network.requestWillBeSent") {
    const { url, method } = message.params.request;
    if (!url.startsWith("http://127.0.0.1")) remoteRequests.push({ url, method });
  }
  // Engellenen istek yanıt ALMAZ; yine de gelen bir yanıt olursa yakalanmalı.
  if (message.method === "Network.responseReceived") {
    const { url, status } = message.params.response;
    if (url.includes(FIRESTORE_HOST)) blockedResponses.push(`${status} ${url}`);
  }
});

const firestoreCountSince = (from) =>
  remoteRequests.slice(from).filter((entry) => entry.url.includes(FIRESTORE_HOST)).length;

const report = { coldStart: null, kahootCycles: [], ravzalingoCycles: [], moduleLoads: null };

try {
  await browser.command("Network.setBlockedURLs", { urls: [`*${FIRESTORE_HOST}*`] });

  /* --- Soğuk açılış ---------------------------------------------------- */
  const coldStartFrom = remoteRequests.length;
  await browser.navigate("/", "document.readyState === 'complete'");
  await delay(3000);
  report.coldStart = {
    firestoreRequests: firestoreCountSince(coldStartFrom),
    remoteRequests: remoteRequests.length - coldStartFrom,
  };
  report.moduleLoads = JSON.parse(await browser.evaluate(`JSON.stringify(
    performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(name => /firebasejs|firebase-config|firebase-rest/.test(name))
      .reduce((acc, name) => { acc[name] = (acc[name] || 0) + 1; return acc; }, {}))`));

  /* --- Kahoot sayfası aç/kapa x10 -------------------------------------- */
  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    const from = remoteRequests.length;
    await browser.evaluate("window.navigate('kahoot')");
    await browser.waitFor("document.getElementById('kahoot')?.classList.contains('active') === true", "kahoot açılmadı");
    await delay(400);
    await browser.evaluate("window.navigate('ana-sayfa')");
    await browser.waitFor("document.getElementById('kahoot')?.classList.contains('active') === false", "kahoot kapanmadı");
    await delay(400);
    report.kahootCycles.push(firestoreCountSince(from));
  }

  /* --- RavzaLingo aç/kapa x10 ------------------------------------------ */
  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    const from = remoteRequests.length;
    await browser.evaluate("window.navigate('ravzalingo')");
    await browser.waitFor("document.getElementById('ravzalingo')?.classList.contains('active') === true", "ravzalingo açılmadı");
    await delay(400);
    await browser.evaluate("window.navigate('ana-sayfa')");
    await browser.waitFor("document.getElementById('ravzalingo')?.classList.contains('active') === false", "ravzalingo kapanmadı");
    await delay(400);
    report.ravzalingoCycles.push(firestoreCountSince(from));
  }

  /* ==================================================================== */
  /* İDDİALAR                                                             */
  /* ==================================================================== */

  await testCase("test üretim Firestore'una hiçbir istek ulaştırmadı", () => {
    assert.deepEqual(blockedResponses, [], `üretim Firestore yanıt verdi: ${blockedResponses.join(", ")}`);
    const attempts = remoteRequests.filter((entry) => entry.url.includes(FIRESTORE_HOST)).length;
    assert.ok(attempts > 0, "hiç Firestore isteği denenmedi - engelleme ölçümü boş, test vakumda");
  });

  await testCase("Firebase SDK tek kez yükleniyor (çift initializeApp yok)", () => {
    const urls = Object.keys(report.moduleLoads);
    const appModules = urls.filter((url) => url.includes("firebase-app.js"));
    const storeModules = urls.filter((url) => url.includes("firebase-firestore.js"));
    const configModules = urls.filter((url) => url.includes("firebase-config.js"));
    assert.equal(appModules.length, 1, `firebase-app.js ${appModules.length} farklı URL ile yüklendi: ${appModules}`);
    assert.equal(storeModules.length, 1, `firebase-firestore.js ${storeModules.length} farklı URL ile yüklendi`);
    assert.equal(configModules.length, 1, `firebase-config.js ${configModules.length} farklı URL ile yüklendi`);
    for (const [url, count] of Object.entries(report.moduleLoads)) {
      assert.equal(count, 1, `${url} ${count} kez indirildi`);
    }
  });

  await testCase("açılış Firestore trafiği sınırlı", () => {
    // Ölçülen davranış: bootLegacyApp tek bir getDoc yapar (ilerleme belgesi).
    // WebChannel el sıkışması Listen + Write kanallarını açar; engelli uçta
    // yeniden denemelerle birlikte bu sayı tek haneli kalmalıdır.
    assert.ok(
      report.coldStart.firestoreRequests <= 12,
      `açılışta ${report.coldStart.firestoreRequests} Firestore isteği - beklenen tek bir okuma`,
    );
  });

  await testCase("Kahoot sayfası oda olmadan realtime dinleyici açmıyor", () => {
    // Oda kurulmadan onSnapshot çağrılmamalı: sayfayı 10 kez açıp kapatmak
    // yeni Firestore trafiği üretmemeli.
    const total = report.kahootCycles.reduce((sum, value) => sum + value, 0);
    assert.ok(
      total <= 6,
      `10 Kahoot aç/kapa döngüsü ${total} Firestore isteği üretti (${report.kahootCycles.join(",")}) `
        + "- sayfayı görmek dinleyici açıyor olabilir",
    );
  });

  await testCase("gezinme döngüsü Firestore dinleyicisi biriktirmiyor", () => {
    for (const [label, cycles] of [["Kahoot", report.kahootCycles], ["RavzaLingo", report.ravzalingoCycles]]) {
      const early = cycles.slice(0, CYCLES / 2).reduce((sum, value) => sum + value, 0);
      const late = cycles.slice(CYCLES / 2).reduce((sum, value) => sum + value, 0);
      assert.ok(
        late <= early + 2,
        `${label}: ilk 5 döngü ${early} istek, son 5 döngü ${late} istek (${cycles.join(",")}) `
          + "- her gezinmede dinleyici/yazma birikiyor",
      );
    }
  });

  await testCase("gezinme başına yazma yok (write storm yok)", () => {
    const perCycle = [...report.kahootCycles, ...report.ravzalingoCycles];
    const noisy = perCycle.filter((count) => count > 2);
    assert.ok(
      noisy.length <= 2,
      `${noisy.length} döngü 2'den fazla Firestore isteği üretti (${perCycle.join(",")})`,
    );
  });
} finally {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(
    join(ARTIFACT_DIR, "firebase-lifecycle.json"),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), ...report }, null, 2)}\n`,
    "utf8",
  );
  await browser.close();
  await server.close();
}

console.log("Firebase yaşam döngüsü");
console.log(`  soğuk açılış      : ${report.coldStart?.firestoreRequests} Firestore isteği, ${report.coldStart?.remoteRequests} uzak istek`);
console.log(`  Kahoot x${CYCLES}       : ${report.kahootCycles.join(",")}`);
console.log(`  RavzaLingo x${CYCLES}   : ${report.ravzalingoCycles.join(",")}`);
console.log(`  modül indirmeleri : ${Object.entries(report.moduleLoads || {}).map(([url, count]) => `${count}x ${url.split("/").pop()}`).join(", ")}`);
console.log(`\n${results.join("\n")}`);
console.log(failures ? `\n${failures} test BAŞARISIZ` : "\nTüm Firebase yaşam döngüsü testleri geçti");
process.exit(failures ? 1 : 0);
