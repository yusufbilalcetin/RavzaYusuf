import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BASE_URL,
  ROOT,
  ThemeTestBrowser,
  assertCleanDiagnostics,
  delay,
  ensureTestServer,
} from "./lib/theme-test-runtime.mjs";

const FULL = process.argv.includes("--full");
const QUICK = process.argv.includes("--quick") || !FULL;
const ARTIFACT_DIR = join(ROOT, "test-artifacts", "theme");
const TOGGLE_SELECTOR = "#topbar-theme-btn";
const STYLES = [
  "noel-ask",
  "gece-mavisi",
  "orman-yesili",
  "mor-isik",
  "klasik-koyu",
  "pembe-tema",
];

const VIEWPORTS = FULL
  ? [
      { name: "desktop-xl", width: 1920, height: 1080 },
      { name: "desktop", width: 1366, height: 768 },
      { name: "tablet-landscape", width: 1024, height: 768 },
      { name: "tablet-portrait", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
      { name: "mobile-small", width: 360, height: 800 },
    ]
  : [
      { name: "desktop", width: 1366, height: 768 },
      { name: "mobile", width: 390, height: 844 },
    ];

const ROUTES = [
  { name: "Ana Sayfa", route: "ana-sayfa", root: "#dashboard", ready: ".launcher-home-content", critical: true },
  { name: "RavzaLingo", route: "ravzalingo", root: "#ravzalingo", ready: ".rlz5-shell", critical: true },
  { name: "Kahoot", route: "kahoot", root: "#kahoot", ready: "#kahootRoot > *" },
  { name: "Calisma Merkezi", route: "calisma-merkezi", root: "#studyhub", ready: "#studyHubGrid", critical: true },
  { name: "Konu Detayi", route: "konu-detay", root: "#studydetail", ready: "#studyDetailContent > *" },
  { name: "Ezber Merkezi", route: "ezber-merkezi", root: "#memoryhub", ready: "#memoryPracticeSection", critical: true },
  { name: "Bosluk Doldurma", route: "bosluk-doldurma", root: "#fillgaphub", ready: ".fill-gap-hero" },
  { name: "Quiz Merkezi", route: "quiz-merkezi", root: "#quizhub", ready: "#quizHubGrid" },
  { name: "Quiz Coz", route: "quiz-coz", root: "#quizdetail", ready: "#quizDetailContent > *" },
  { name: "Sinav Merkezi", route: "sinav-merkezi", root: "#examcenter", ready: ".exam-pro-shell" },
  { name: "Sinav Coz", route: "sinav-coz", root: "#sinavcoz", ready: "#examSolveRoot > *" },
  { name: "Hizli Tekrar", route: "hizli-tekrar", root: "#recap", ready: ".recap-toolbar" },
  { name: "Birinci Sinif", route: "birinci-sinif", root: "#grade1", ready: "#grade1 h2" },
  { name: "Ikinci Sinif", route: "ikinci-sinif", root: "#grade2", ready: "#grade2 h2" },
  { name: "Ravza Books", route: "ravza-books", root: "#ravzabooks", ready: ".library-view", critical: true },
  { name: "Oyun Alani", route: "oyun", root: "#games", ready: "[data-game-catalog]", critical: true },
];

const MODE_CASES = [
  { name: "light", mode: "light", system: "dark", resolved: "light" },
  { name: "dark", mode: "dark", system: "light", resolved: "dark" },
  { name: "system-light", mode: "system", system: "light", resolved: "light" },
  { name: "system-dark", mode: "system", system: "dark", resolved: "dark" },
];

const EARLY_PROBE = `(() => {
  const captures = [];
  const record = (phase) => {
    const root = document.documentElement;
    const body = document.body;
    captures.push({
      phase,
      now: performance.now(),
      readyState: document.readyState,
      rootExists: Boolean(root),
      bodyExists: Boolean(body),
      bodyChildCount: body?.childElementCount || 0,
      root: root ? {
        mode: root.dataset.themeMode || null,
        resolvedMode: root.dataset.resolvedTheme || null,
        style: root.dataset.themeStyle || null,
        dark: root.classList.contains("dark"),
        themeDark: root.classList.contains("theme-dark"),
        themeLight: root.classList.contains("theme-light"),
        colorScheme: root.style.colorScheme || null,
        backgroundColor: root.style.backgroundColor || null,
      } : null,
      body: body ? {
        mode: body.dataset.themeMode || null,
        resolvedMode: body.dataset.resolvedTheme || null,
        style: body.dataset.themeStyle || null,
        dark: body.classList.contains("dark"),
        themeDark: body.classList.contains("theme-dark"),
        themeLight: body.classList.contains("theme-light"),
        colorScheme: body.style.colorScheme || null,
      } : null,
    });
  };
  const probe = { captures, firstAnimationFrame: null, domContentLoaded: null };
  Object.defineProperty(globalThis, "__RAVZA_THEME_EARLY_PROBE__", {
    value: probe,
    configurable: true,
  });
  record("document-start");
  new MutationObserver(() => record("mutation")).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "data-theme-mode", "data-resolved-theme", "data-theme-style", "style"],
  });
  requestAnimationFrame(() => {
    record("first-animation-frame");
    probe.firstAnimationFrame = captures.at(-1);
  });
  document.addEventListener("DOMContentLoaded", () => {
    record("dom-content-loaded");
    probe.domContentLoaded = captures.at(-1);
  }, { once: true });
})();`;

function routeReadyExpression(definition) {
  return `(() => {
    const root = document.querySelector(${JSON.stringify(definition.root)});
    const ready = document.querySelector(${JSON.stringify(definition.ready)});
    const rect = root?.getBoundingClientRect();
    const style = root ? getComputedStyle(root) : null;
    return Boolean(globalThis.__APP_STARTUP_STATE__?.completed
      && globalThis.__RAVZA_THEME__
      && document.body?.dataset.currentRoute === ${JSON.stringify(definition.route)}
      && root?.classList.contains("active")
      && ready
      && rect?.width > 1
      && rect?.height > 1
      && style?.display !== "none"
      && style?.visibility !== "hidden");
  })()`;
}

function expectedState(modeCase, style = "noel-ask") {
  return { mode: modeCase.mode, resolvedMode: modeCase.resolved, style };
}

async function readThemeSnapshot(browser) {
  return browser.evaluate(`(() => {
    const root = document.documentElement;
    const body = document.body;
    const copy = (element) => ({
      mode: element?.dataset.themeMode || null,
      resolvedMode: element?.dataset.resolvedTheme || null,
      style: element?.dataset.themeStyle || null,
      dark: element?.classList.contains("dark") || false,
      themeDark: element?.classList.contains("theme-dark") || false,
      themeLight: element?.classList.contains("theme-light") || false,
      colorScheme: element ? getComputedStyle(element).colorScheme : null,
      inlineColorScheme: element?.style.colorScheme || null,
    });
    return {
      api: globalThis.__RAVZA_THEME__?.getState?.() || null,
      published: globalThis.__RAVZA_THEME_STATE__ || null,
      boot: globalThis.__RAVZA_THEME_BOOT__ || null,
      root: copy(root),
      body: copy(body),
      metaThemeColor: document.querySelector('meta[name="theme-color"]')?.content || null,
      activeElement: document.activeElement?.id || document.activeElement?.getAttribute?.("data-theme-mode") || document.activeElement?.className || null,
      panelOpen: document.getElementById("theme-sheet")?.classList.contains("open") || false,
      panelHidden: document.getElementById("theme-sheet")?.getAttribute("aria-hidden") || null,
    };
  })()`);
}

function assertDomState(snapshot, expected, label, options = {}) {
  if (!options.allowMissingApi) {
    assert.ok(snapshot.api, `${label}: window.__RAVZA_THEME__ missing`);
    assert.deepEqual(
      { mode: snapshot.api.mode, resolvedMode: snapshot.api.resolvedMode, style: snapshot.api.style },
      expected,
      `${label}: API state mismatch`,
    );
  }
  for (const [targetName, target] of [["html", snapshot.root], ["body", snapshot.body]]) {
    assert.equal(target.mode, expected.mode, `${label}: ${targetName} data-theme-mode`);
    assert.equal(target.resolvedMode, expected.resolvedMode, `${label}: ${targetName} data-resolved-theme`);
    assert.equal(target.style, expected.style, `${label}: ${targetName} data-theme-style`);
    assert.equal(target.dark, expected.resolvedMode === "dark", `${label}: ${targetName}.dark`);
    assert.equal(target.themeDark, expected.resolvedMode === "dark", `${label}: ${targetName}.theme-dark`);
    assert.equal(target.themeLight, expected.resolvedMode === "light", `${label}: ${targetName}.theme-light`);
    assert.ok(target.colorScheme.includes(expected.resolvedMode), `${label}: ${targetName} color-scheme`);
  }
  assert.ok(snapshot.metaThemeColor, `${label}: theme-color meta is empty`);
}

async function assertEarlyTheme(browser, expected, label) {
  await browser.waitFor("globalThis.__RAVZA_THEME_EARLY_PROBE__?.firstAnimationFrame", `${label} early frame`);
  const probe = await browser.evaluate("globalThis.__RAVZA_THEME_EARLY_PROBE__");
  const frame = probe.firstAnimationFrame;
  assert.ok(frame?.root, `${label}: first animation-frame root snapshot missing`);
  assert.equal(frame.root.mode, expected.mode, `${label}: first-frame mode flash`);
  assert.equal(frame.root.resolvedMode, expected.resolvedMode, `${label}: first-frame resolved-mode flash`);
  assert.equal(frame.root.style, expected.style, `${label}: first-frame style flash`);
  assert.equal(frame.root.themeDark, expected.resolvedMode === "dark", `${label}: first-frame dark class flash`);
  assert.equal(frame.root.themeLight, expected.resolvedMode === "light", `${label}: first-frame light class flash`);
  assert.equal(frame.root.colorScheme, expected.resolvedMode, `${label}: first-frame color-scheme flash`);

  const visibleMismatches = probe.captures.filter((capture) => capture.bodyChildCount > 0 && capture.root?.mode && (
    capture.root.mode !== expected.mode
      || capture.root.resolvedMode !== expected.resolvedMode
      || capture.root.style !== expected.style
  ));
  assert.deepEqual(visibleMismatches, [], `${label}: themed DOM regressed before or after first render`);
  return {
    firstFrameMs: Math.round(frame.now * 100) / 100,
    firstThemedMs: Math.round((probe.captures.find((capture) => capture.root?.mode)?.now ?? frame.now) * 100) / 100,
    captureCount: probe.captures.length,
  };
}

async function seedAndOpenMain(browser, definition, modeCase, viewport, style = "noel-ask") {
  await browser.setViewport(viewport);
  await browser.emulateColorScheme(modeCase.system);
  await browser.seedTheme(modeCase.mode, style);
  const label = `${definition.name} / ${modeCase.name} / ${viewport.name}`;
  browser.clearDiagnostics(label);
  await browser.navigate(`/?page=${encodeURIComponent(definition.route)}`, routeReadyExpression(definition));
  const expected = expectedState(modeCase, style);
  const early = await assertEarlyTheme(browser, expected, label);
  const snapshot = await readThemeSnapshot(browser);
  assertDomState(snapshot, expected, label);
  const diagnostics = browser.diagnostics();
  assertCleanDiagnostics(diagnostics, label, { allowWarnings: true });
  return { label, expected, early, diagnostics, snapshot };
}

async function setApiState(browser, mode, style = null) {
  await browser.evaluate(`(() => {
    globalThis.__RAVZA_THEME__.setMode(${JSON.stringify(mode)}, { reason: "browser-test" });
    ${style ? `globalThis.__RAVZA_THEME__.setStyle(${JSON.stringify(style)}, { reason: "browser-test" });` : ""}
    globalThis.__RAVZA_THEME__.closePanel({ restoreFocus: false });
    return true;
  })()`);
  await browser.waitFor(
    `globalThis.__RAVZA_THEME__?.getState?.().mode === ${JSON.stringify(mode)}${style ? ` && globalThis.__RAVZA_THEME__?.getState?.().style === ${JSON.stringify(style)}` : ""}`,
    `set API theme ${mode}/${style || "unchanged"}`,
  );
}

const results = [];
let browser = null;
let server = null;

async function runCase(group, name, task) {
  const startedAt = Date.now();
  try {
    const details = await task();
    results.push({ group, name, status: "PASS", durationMs: Date.now() - startedAt, details });
    process.stdout.write(`PASS  ${group} / ${name}\n`);
  } catch (error) {
    results.push({
      group,
      name,
      status: "FAIL",
      durationMs: Date.now() - startedAt,
      error: error.stack || error.message || String(error),
      diagnostics: browser?.diagnostics?.() || null,
    });
    process.stderr.write(`FAIL  ${group} / ${name}: ${error.message}\n`);
  }
}

function quickRouteMatrix() {
  const criticalRoutes = ROUTES.filter((definition) => definition.critical);
  return criticalRoutes.map((definition, index) => ({
    definition,
    modeCase: MODE_CASES[index % MODE_CASES.length],
    viewport: VIEWPORTS[index % VIEWPORTS.length],
  }));
}

function fullRouteMatrix() {
  return ROUTES.flatMap((definition) => MODE_CASES.flatMap((modeCase) => (
    VIEWPORTS.map((viewport) => ({ definition, modeCase, viewport }))
  )));
}

async function testPanelPointerAndFocus(viewport) {
  const home = ROUTES[0];
  const modeCase = MODE_CASES[0];
  await seedAndOpenMain(browser, home, modeCase, viewport);

  /* TOPBAR TEMA DUGMESI KALDIRILDI (urun karari).
     Launcher sag ustunde artik yalnizca Arama ve Kontrol Merkezi var; tek
     dokunus/uzun basma/cift tiklama jestleri o dugmeye aitti ve dugme yok.
     Tema sistemi SILINMEDI - panel hala gercek bir yoldan aciliyor ve panel
     sozlesmesinin tamami (odak girisi, Escape, odak iadesi, mod ve stil
     secimi) burada korunuyor; yalnizca ACILIS YOLU gerceklige guncellendi. */
  await setApiState(browser, "light", "noel-ask");
  assert.equal(
    await browser.evaluate("!!document.getElementById('topbar-theme-btn')"),
    false,
    "eski topbar tema dugmesi hala DOM'da",
  );

  const CC_ENTRY = "#control-center-open";
  await browser.focus(CC_ENTRY);
  await browser.click(CC_ENTRY);
  await browser.waitFor("document.getElementById('control-center')?.open === true", "kontrol merkezi acildi");
  await browser.click('[data-cc-action="settings"]');
  await browser.waitFor("document.getElementById('theme-sheet')?.classList.contains('open')", "panel kontrol merkezinden acildi");
  await delay(430);
  let snapshot = await readThemeSnapshot(browser);
  assert.equal(snapshot.api.mode, "light", "panel acilisi modu degistirmemeli");
  assert.equal(snapshot.panelHidden, "false", "panel aria-hidden");
  assert.equal(
    await browser.evaluate("document.getElementById('theme-sheet').contains(document.activeElement)"),
    true,
    "focus must enter panel",
  );
  assert.equal(
    await browser.evaluate("document.getElementById('control-center')?.open === true"),
    false,
    "tek aktif overlay: panel acilinca kontrol merkezi kapanmali",
  );

  await browser.key("Escape");
  await browser.waitFor("!document.getElementById('theme-sheet')?.classList.contains('open')", "Escape closes panel");

  // Panel yeniden acilsin: mod/stil secimi asagida dogrulanacak.
  await browser.evaluate("window.openThemeSheet && window.openThemeSheet()");
  await browser.waitFor("document.getElementById('theme-sheet')?.classList.contains('open')", "panel yeniden acildi");
  await delay(300);
  await browser.click('.theme-mode-control [data-theme-mode="system"]');
  await browser.waitFor("globalThis.__RAVZA_THEME__.getState().mode === 'system'", "panel mode selection");
  await browser.click('.theme-choice-card[data-theme-id="gece-mavisi"]');
  await browser.waitFor("globalThis.__RAVZA_THEME__.getState().style === 'gece-mavisi' && !document.getElementById('theme-sheet')?.classList.contains('open')", "panel style selection");

  const diagnostics = browser.diagnostics();
  assertCleanDiagnostics(diagnostics, `panel ${viewport.name}`, { allowWarnings: true });
  return { viewport, diagnostics };
}

async function testSystemLiveChanges() {
  const home = ROUTES[0];
  await seedAndOpenMain(browser, home, MODE_CASES[2], VIEWPORTS[0]);
  const eventsBefore = await browser.evaluate(`(() => {
    globalThis.__themeTestEvents = [];
    addEventListener("app:theme-change", (event) => globalThis.__themeTestEvents.push(event.detail));
    return globalThis.__themeTestEvents.length;
  })()`);
  assert.equal(eventsBefore, 0);

  await browser.emulateColorScheme("dark");
  await browser.waitFor("globalThis.__RAVZA_THEME__.getState().resolvedMode === 'dark'", "system light to dark");
  assertDomState(await readThemeSnapshot(browser), { mode: "system", resolvedMode: "dark", style: "noel-ask" }, "system light to dark");
  await browser.emulateColorScheme("light");
  await browser.waitFor("globalThis.__RAVZA_THEME__.getState().resolvedMode === 'light'", "system dark to light");
  const events = await browser.evaluate("globalThis.__themeTestEvents");
  assert.ok(events.some((event) => event.mode === "system" && event.resolvedMode === "dark" && event.style === "noel-ask"), "dark system event missing");
  assert.ok(events.some((event) => event.mode === "system" && event.resolvedMode === "light" && event.style === "noel-ask"), "light system event missing");

  await setApiState(browser, "light");
  await browser.emulateColorScheme("dark");
  await delay(180);
  assert.equal((await readThemeSnapshot(browser)).api.resolvedMode, "light", "manual light must ignore OS dark");
  await setApiState(browser, "dark");
  await browser.emulateColorScheme("light");
  await delay(180);
  assert.equal((await readThemeSnapshot(browser)).api.resolvedMode, "dark", "manual dark must ignore OS light");
  return { events };
}

async function testPersistenceAndHistory() {
  const home = ROUTES[0];
  const ezber = ROUTES.find((definition) => definition.route === "ezber-merkezi");
  const quiz = ROUTES.find((definition) => definition.route === "quiz-merkezi");
  await seedAndOpenMain(browser, home, MODE_CASES[1], VIEWPORTS[0], "mor-isik");

  await browser.reload(routeReadyExpression(home));
  assertDomState(await readThemeSnapshot(browser), { mode: "dark", resolvedMode: "dark", style: "mor-isik" }, "reload persistence");

  await browser.evaluate(`Promise.resolve(globalThis.navigate(${JSON.stringify(ezber.route)})).then(() => true)`);
  await browser.waitFor(routeReadyExpression(ezber), "SPA navigation to Ezber");
  assertDomState(await readThemeSnapshot(browser), { mode: "dark", resolvedMode: "dark", style: "mor-isik" }, "SPA navigation");

  await browser.evaluate(`Promise.resolve(globalThis.navigate(${JSON.stringify(quiz.route)})).then(() => true)`);
  await browser.waitFor(routeReadyExpression(quiz), "SPA navigation to Quiz");
  await browser.evaluate("history.back(); true");
  await browser.waitFor(routeReadyExpression(ezber), "history back");
  assertDomState(await readThemeSnapshot(browser), { mode: "dark", resolvedMode: "dark", style: "mor-isik" }, "history back");
  await browser.evaluate("history.forward(); true");
  await browser.waitFor(routeReadyExpression(quiz), "history forward");
  assertDomState(await readThemeSnapshot(browser), { mode: "dark", resolvedMode: "dark", style: "mor-isik" }, "history forward");
  return { route: quiz.route };
}

/* Cam yüzeyler backdrop-filter yokken opak zemine düşüyor mu?

   Chrome'a "backdrop-filter'ı desteklemiyormuş gibi yap" dedirtemiyoruz, o
   yüzden @supports kuralının KENDİSİ doğrulanıyor: (a) her kanonik cam
   yüzeyi kapsayan bir olumsuzlama bloğu var mı, (b) düştüğü zemin gerçekten
   opak mı. İkincisi önemli - fallback yarı saydam bir renge düşerse camsız
   tarayıcıda altındaki içerik metnin arasından okunur ve kontrast çöker.

   Bu test, birisi yeni bir cam yüzey ekleyip fallback'ini unuttuğunda ya da
   --glass-surface-base'i şeffaflaştırdığında kırılır. */
async function testGlassFallback() {
  await browser.setViewport(VIEWPORTS[0]);

  for (const mode of ["light", "dark"]) {
    await browser.seedTheme(mode, "noel-ask");
    await browser.navigate("/?page=ana-sayfa", routeReadyExpression(ROUTES[0]));

    const result = await browser.evaluate(`(() => {
      const NEGATIONS = [];
      const walk = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules) {
            const text = rule.conditionText || "";
            if (rule.type === CSSRule.SUPPORTS_RULE && /not\\s*\\(/.test(text) && /backdrop-filter/.test(text)) {
              NEGATIONS.push(rule);
            }
            walk(rule.cssRules);
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try { walk(sheet.cssRules); } catch { /* cross-origin */ }
      }

      // Kural metinlerini birleştir: hangi seçiciler kapsanıyor?
      const covered = [];
      const declaredBackgrounds = [];
      for (const supports of NEGATIONS) {
        for (const rule of supports.cssRules) {
          if (!rule.selectorText) continue;
          covered.push(rule.selectorText);
          const bg = rule.style.getPropertyValue("background") || rule.style.getPropertyValue("background-color");
          if (bg) declaredBackgrounds.push(bg.trim());
        }
      }

      // Fallback zemininin gerçek alfası: --glass-surface-base'i probe ile çöz.
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px";
      probe.style.backgroundColor = "var(--glass-surface-base)";
      document.body.append(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();

      return {
        supportsBlocks: NEGATIONS.length,
        covered,
        declaredBackgrounds,
        glassSurfaceBase: resolved,
      };
    })()`);

    assert.ok(result.supportsBlocks > 0, `${mode}: backdrop-filter olumsuzlama blogu bulunamadi`);

    // Kanonik cam yüzeyler kapsanmali.
    const joined = result.covered.join(" ");
    for (const surface of [".glass-surface", ".theme-sheet", ".launcher-topbar", ".launcher-dock"]) {
      assert.ok(joined.includes(surface), `${mode}: ${surface} icin backdrop-filter fallback'i yok`);
    }

    // Fallback zemini opak olmali (alfa >= .8), yoksa metin okunmaz.
    const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i.exec(result.glassSurfaceBase);
    assert.ok(match, `${mode}: --glass-surface-base cozulemedi (${result.glassSurfaceBase})`);
    const alpha = match[4] == null ? 1 : Number(match[4]);
    assert.ok(alpha >= 0.8, `${mode}: --glass-surface-base alfasi ${alpha} - camsiz tarayicida metin okunmaz (>= .8 olmali)`);

    assert.ok(result.declaredBackgrounds.length > 0, `${mode}: fallback bloklarinda background bildirimi yok`);
  }

  return { checked: ["light", "dark"] };
}

async function testPresetContract() {
  const home = ROUTES[0];
  await seedAndOpenMain(browser, home, MODE_CASES[0], VIEWPORTS[0]);
  const checked = [];
  for (const style of STYLES) {
    for (const modeCase of [MODE_CASES[0], MODE_CASES[1]]) {
      await browser.emulateColorScheme(modeCase.system);
      await setApiState(browser, modeCase.mode, style);
      const snapshot = await readThemeSnapshot(browser);
      assertDomState(snapshot, expectedState(modeCase, style), `${style}/${modeCase.mode}`);
      const activeCount = await browser.evaluate(`document.querySelectorAll('.theme-choice-card[data-theme-id=${JSON.stringify(style)}].active[aria-selected="true"]').length`);
      assert.equal(activeCount, 1, `${style}: panel active state`);
      checked.push({ style, mode: modeCase.mode });
    }
  }
  return { checked };
}

async function readEmbeddedTheme(browser) {
  return browser.evaluate(`(() => {
    const frame = document.querySelector("#gameStageBody iframe");
    const root = frame?.contentDocument?.documentElement;
    const body = frame?.contentDocument?.body;
    if (!root || !body) return null;
    return {
      root: {
        mode: root.dataset.themeMode || null,
        resolvedMode: root.dataset.resolvedTheme || null,
        style: root.dataset.themeStyle || null,
        dark: root.classList.contains("dark") || root.classList.contains("theme-dark"),
        themeDark: root.classList.contains("theme-dark"),
        themeLight: root.classList.contains("theme-light"),
        colorScheme: getComputedStyle(root).colorScheme,
      },
      body: {
        mode: body.dataset.themeMode || null,
        resolvedMode: body.dataset.resolvedTheme || null,
        style: body.dataset.themeStyle || null,
        dark: body.classList.contains("dark") || body.classList.contains("theme-dark"),
        themeDark: body.classList.contains("theme-dark"),
        themeLight: body.classList.contains("theme-light"),
        colorScheme: getComputedStyle(body).colorScheme,
      },
      api: null,
      metaThemeColor: frame.contentDocument.querySelector('meta[name="theme-color"]')?.content || "bridge-owned",
    };
  })()`);
}

async function testEmbeddedBridge(gameId) {
  await browser.setViewport(VIEWPORTS[0]);
  await browser.emulateColorScheme("light");
  await browser.seedTheme("dark", "orman-yesili");
  browser.clearDiagnostics(`embedded ${gameId}`);
  const oyun = ROUTES.find((definition) => definition.route === "oyun");
  await browser.navigate(
    `/?page=oyun&game=${encodeURIComponent(gameId)}`,
    `(${routeReadyExpression(oyun)}) && (() => { const f = document.querySelector('#gameStageBody iframe'); return f?.contentDocument?.readyState === 'complete'; })()`,
  );
  await browser.waitFor(`(() => {
    const root = document.querySelector('#gameStageBody iframe')?.contentDocument?.documentElement;
    return root?.dataset.resolvedTheme === 'dark' && root?.dataset.themeStyle === 'orman-yesili';
  })()`, `${gameId} initial bridge`);
  let snapshot = await readEmbeddedTheme(browser);
  assertDomState(snapshot, { mode: "dark", resolvedMode: "dark", style: "orman-yesili" }, `${gameId} initial bridge`, { allowMissingApi: true });

  await browser.evaluate("globalThis.__RAVZA_THEME__.setMode('light', { reason: 'bridge-test' }); true");
  await browser.waitFor(`document.querySelector('#gameStageBody iframe')?.contentDocument?.documentElement?.dataset.resolvedTheme === 'light'`, `${gameId} live bridge`);
  snapshot = await readEmbeddedTheme(browser);
  assertDomState(snapshot, { mode: "light", resolvedMode: "light", style: "orman-yesili" }, `${gameId} live bridge`, { allowMissingApi: true });
  assertCleanDiagnostics(browser.diagnostics(), `${gameId} bridge`, { allowWarnings: true });
  return { gameId };
}

const STANDALONE_GAMES = [
  { name: "Cark Oyunu", path: "/games/cark-oyunu/", ready: ".wheel-app" },
  { name: "Alan Bulmacasi", path: "/games/alan-bulmacasi/", ready: ".game-shell" },
  { name: "Ok Bulmacasi", path: "/games/ok-bulmacasi/", ready: "#screenHome" },
  /* Oyun Kuresi (Flappy + Sudoku). Siteden link yok, dogrudan URL ile
     erisilir; <html data-theme="dark"> sabit yazildigi ve kopru hic
     yuklenmedigi icin site temasindan bagimsiz kalici koyuydu. */
  { name: "Oyun Kuresi", path: "/games/oyun-platformu/", ready: "#screen-menu" },
];

async function testStandaloneBridge(definition) {
  await browser.setViewport(VIEWPORTS[0]);
  await browser.emulateColorScheme("dark");
  await browser.seedTheme("system", "pembe-tema");
  browser.clearDiagnostics(`standalone ${definition.name}`);
  await browser.navigate(definition.path, `Boolean(document.querySelector(${JSON.stringify(definition.ready)}))`);
  await browser.waitFor("document.documentElement.dataset.resolvedTheme === 'dark' && document.documentElement.dataset.themeStyle === 'pembe-tema'", `${definition.name} initial theme`);
  let snapshot = await readThemeSnapshot(browser);
  assertDomState(snapshot, { mode: "system", resolvedMode: "dark", style: "pembe-tema" }, definition.name, { allowMissingApi: true });
  await browser.emulateColorScheme("light");
  await browser.waitFor("document.documentElement.dataset.resolvedTheme === 'light'", `${definition.name} system live change`);
  snapshot = await readThemeSnapshot(browser);
  assertDomState(snapshot, { mode: "system", resolvedMode: "light", style: "pembe-tema" }, `${definition.name} live`, { allowMissingApi: true });
  assertCleanDiagnostics(browser.diagnostics(), definition.name, { allowWarnings: true });
  return { game: definition.name };
}

function markdownReport(report) {
  const rows = report.results.map((result) => (
    `| ${result.status} | ${result.group.replaceAll("|", "\\|")} | ${result.name.replaceAll("|", "\\|")} | ${result.durationMs} | ${result.error ? result.error.split("\n")[0].replaceAll("|", "\\|") : "-"} |`
  ));
  return [
    "# Theme System Browser Test",
    "",
    `- Profile: ${report.profile}`,
    `- Base URL: ${report.baseUrl}`,
    `- Cases: ${report.summary.total}`,
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    `- Duration: ${report.durationMs} ms`,
    "",
    "| Status | Group | Case | Duration (ms) | Error |",
    "| --- | --- | --- | ---: | --- |",
    ...rows,
    "",
  ].join("\n");
}

const suiteStartedAt = Date.now();
try {
  server = await ensureTestServer();
  browser = await ThemeTestBrowser.launch("theme-system");
  await browser.addNewDocumentScript(EARLY_PROBE);

  const routeMatrix = QUICK ? quickRouteMatrix() : fullRouteMatrix();
  for (const { definition, modeCase, viewport } of routeMatrix) {
    await runCase("route-theme", `${definition.name} / ${modeCase.name} / ${viewport.name}`, async () => {
      const result = await seedAndOpenMain(browser, definition, modeCase, viewport);
      return { expected: result.expected, early: result.early, warnings: result.diagnostics.consoleWarnings };
    });
  }

  for (const modeCase of MODE_CASES) {
    await runCase("mode-matrix", modeCase.name, async () => {
      const result = await seedAndOpenMain(browser, ROUTES[0], modeCase, VIEWPORTS[0]);
      return { expected: result.expected, early: result.early };
    });
  }

  await runCase("runtime", "system media live changes", testSystemLiveChanges);
  await runCase("navigation", "direct reload SPA back-forward", testPersistenceAndHistory);
  await runCase("panel", "pointer keyboard focus desktop", () => testPanelPointerAndFocus(VIEWPORTS[0]));
  await runCase("panel", "pointer keyboard focus mobile", () => testPanelPointerAndFocus(VIEWPORTS.find((viewport) => viewport.width === 390) || VIEWPORTS.at(-1)));
  await runCase("presets", "six styles in light and dark", testPresetContract);
  await runCase("glass", "backdrop-filter fallback is opaque", testGlassFallback);

  await runCase("game-bridge", "Candy Crush iframe", () => testEmbeddedBridge("candy-match"));
  if (FULL) await runCase("game-bridge", "Meyve Eslesme iframe", () => testEmbeddedBridge("fruit-match"));
  const standaloneTargets = FULL ? STANDALONE_GAMES : STANDALONE_GAMES.slice(0, 1);
  for (const definition of standaloneTargets) {
    await runCase("game-bridge", definition.name, () => testStandaloneBridge(definition));
  }
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}

const report = {
  generatedAt: new Date().toISOString(),
  profile: FULL ? "full" : "quick",
  baseUrl: BASE_URL,
  durationMs: Date.now() - suiteStartedAt,
  summary: {
    total: results.length,
    passed: results.filter((result) => result.status === "PASS").length,
    failed: results.filter((result) => result.status === "FAIL").length,
  },
  matrix: {
    routes: FULL ? ROUTES.map((definition) => definition.route) : ROUTES.filter((definition) => definition.critical).map((definition) => definition.route),
    modes: MODE_CASES.map((entry) => entry.name),
    styles: STYLES,
    viewports: VIEWPORTS,
  },
  results,
};

await mkdir(ARTIFACT_DIR, { recursive: true });
await Promise.all([
  writeFile(join(ARTIFACT_DIR, "theme-system-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(join(ARTIFACT_DIR, "theme-system-report.md"), markdownReport(report), "utf8"),
]);

process.stdout.write(`\nTheme system: ${report.summary.passed}/${report.summary.total} PASS (${report.durationMs} ms)\n`);
process.stdout.write(`Report: ${join(ARTIFACT_DIR, "theme-system-report.json")}\n`);
if (report.summary.failed > 0) process.exitCode = 1;
