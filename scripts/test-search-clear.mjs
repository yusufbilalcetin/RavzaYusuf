import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const TEST_FILE = fileURLToPath(import.meta.url);
const ARTIFACTS = join(ROOT, "test-artifacts", "search-clear");
const SEARCH_CSS_ROOT = join(ROOT, "css");
const RESPONSIVE_VIEWPORTS = [
  [320, 700],
  [360, 800],
  [375, 812],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1440, 900]
];
const THEME_PREFERENCES = ["light", "dark"];
const THEME_STYLES = [
  "noel-ask",
  "gece-mavisi",
  "orman-yesili",
  "mor-isik",
  "klasik-koyu",
  "pembe-tema"
];
const MIN_CLEAR_TARGET = 40;
const visualIssues = [];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};
const BROWSER_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
].filter(Boolean);
const browserPath = BROWSER_PATHS.find((candidate) => existsSync(candidate));
assert.ok(browserPath, "Chromium tabanlı bir tarayıcı bulunamadı.");

function expectVisual(condition, message) {
  if (!condition) visualIssues.push(message);
}

async function auditClearableSearchDefinitions() {
  const ignoredDirectories = new Set([".git", "node_modules", "test-artifacts"]);
  const sourceExtensions = new Set([".html", ".js", ".mjs"]);
  const definitions = [];
  const unmarkedSearchCandidates = [];
  const unidentifiedDefinitions = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
        await visit(join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || !sourceExtensions.has(extname(entry.name).toLowerCase())) continue;

      const filePath = join(directory, entry.name);
      if (resolve(filePath) === resolve(TEST_FILE)) continue;
      const source = await readFile(filePath, "utf8");
      const inputTags = source.match(/<input\b[^>]*>/gi) || [];
      inputTags.forEach((tag) => {
        const marked = /\bdata-clearable-search\b/i.test(tag);
        const id = tag.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] || "";
        const likelySearch = /\btype\s*=\s*["']search["']/i.test(tag)
          || /\bid\s*=\s*["'][^"']*search[^"']*["']/i.test(tag)
          || /\b(?:placeholder|aria-label)\s*=\s*["'][^"']*\b(?:ara|arama|search)\b/iu.test(tag);

        if (marked) {
          if (id) definitions.push({ filePath, selector: `#${id}` });
          else unidentifiedDefinitions.push(filePath.slice(ROOT.length + 1));
        } else if (likelySearch) {
          unmarkedSearchCandidates.push(filePath.slice(ROOT.length + 1));
        }
      });
    }
  }

  await visit(ROOT);
  return {
    count: definitions.length + unidentifiedDefinitions.length,
    selectors: definitions.map((entry) => entry.selector).sort(),
    files: [...new Set(definitions.map((entry) => entry.filePath.slice(ROOT.length + 1)))],
    unmarkedSearchCandidates,
    unidentifiedDefinitions
  };
}

const definitionAudit = await auditClearableSearchDefinitions();

async function auditSearchCssContracts() {
  const cssFiles = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".css") {
        cssFiles.push(filePath);
      }
    }
  }

  await visit(SEARCH_CSS_ROOT);
  const blocks = [];
  for (const filePath of cssFiles) {
    const source = (await readFile(filePath, "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      blocks.push({
        file: filePath.slice(ROOT.length + 1),
        selectors: match[1].trim(),
        declarations: match[2].trim()
      });
    }
  }

  const blocksFor = (selectorText) => blocks.filter((block) => (
    block.selectors.split(",").some((selector) => selector.trim() === selectorText)
  ));
  const declarationsFor = (selectorText) => blocksFor(selectorText).map((block) => block.declarations).join("\n");
  const cancelDeclarations = declarationsFor("input[data-clearable-search]::-webkit-search-cancel-button");
  const autofillStates = [
    "input[data-clearable-search]:-webkit-autofill",
    "input[data-clearable-search]:-webkit-autofill:hover",
    "input[data-clearable-search]:-webkit-autofill:focus",
    "input[data-clearable-search]:-webkit-autofill:active"
  ];
  const autofillMatches = autofillStates.map((selector) => ({
    selector,
    blocks: blocksFor(selector)
  }));
  const autofillDeclarations = autofillMatches
    .flatMap((entry) => entry.blocks.map((block) => block.declarations))
    .join("\n");

  return {
    nativeCancel: {
      selectorPresent: Boolean(cancelDeclarations),
      hidden: /\bdisplay\s*:\s*none\b/i.test(cancelDeclarations),
      appearanceRemoved: /(?:-webkit-)?appearance\s*:\s*none\b/i.test(cancelDeclarations)
    },
    autofill: {
      states: autofillMatches.map((entry) => ({
        selector: entry.selector,
        present: entry.blocks.length > 0,
        files: [...new Set(entry.blocks.map((block) => block.file))]
      })),
      textColorControlled: /-webkit-text-fill-color\s*:/i.test(autofillDeclarations),
      caretControlled: /\bcaret-color\s*:/i.test(autofillDeclarations),
      backgroundControlled: /(?:background(?:-color)?|-webkit-box-shadow|box-shadow)\s*:/i.test(autofillDeclarations)
    }
  };
}

const searchCssAudit = await auditSearchCssContracts();

await mkdir(ARTIFACTS, { recursive: true });
const local404s = [];
let serverPort = 0;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1/").pathname);
    let filePath = resolve(ROOT, `.${pathname}`);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) throw new Error("Geçersiz yol");
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    response.writeHead(200, { "content-type": TYPES[extname(filePath).toLowerCase()] || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch {
    local404s.push(request.url);
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolveListen, rejectListen) => {
  const onError = (error) => rejectListen(error);
  server.once("error", onError);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", onError);
    serverPort = server.address().port;
    resolveListen();
  });
});

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const profile = await mkdtemp(join(tmpdir(), "ravza-search-clear-"));
const browserProcess = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--disable-background-networking",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--window-size=1280,900",
  "about:blank"
], { stdio: "ignore" });
let browserSpawnError = null;
browserProcess.once("error", (error) => {
  browserSpawnError = error;
});

async function findPage() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      if (browserSpawnError) throw browserSpawnError;
      const activePort = Number.parseInt(
        (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/, 1)[0],
        10
      );
      if (!Number.isInteger(activePort)) throw new Error("Geçersiz CDP portu");
      const targets = await fetch(`http://127.0.0.1:${activePort}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === "page");
      if (target) return target;
    } catch {
      if (browserSpawnError) throw browserSpawnError;
      // Browser is still starting.
    }
    await delay(100);
  }
  throw new Error("Tarayıcı başlatılamadı.");
}

let socket;
let commandId = 0;
const pending = new Map();
const runtimeIssues = [];

function command(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCommand, rejectCommand) => {
    const timeoutId = setTimeout(() => {
      pending.delete(id);
      rejectCommand(new Error(`CDP komutu zaman aşımına uğradı: ${method}`));
    }, 20000);
    pending.set(id, {
      resolve(value) {
        clearTimeout(timeoutId);
        resolveCommand(value);
      },
      reject(error) {
        clearTimeout(timeoutId);
        rejectCommand(error);
      }
    });
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(expression, timeout = 16000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await delay(70);
  }
  throw new Error(`Zaman aşımı: ${expression}`);
}

async function setViewport(width, height, mobile = width < 768) {
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height
  });
  await delay(220);
}

async function navigateTo(pathname) {
  await command("Page.navigate", {
    url: `http://127.0.0.1:${serverPort}/${pathname}${pathname.includes("?") ? "&" : "?"}test=${Date.now()}`
  });
}

async function screenshot(filename) {
  const shot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  await writeFile(join(ARTIFACTS, filename), Buffer.from(shot.data, "base64"));
}

async function openRoute(route, sectionId, inputSelector) {
  await evaluate(`window.navigate(${JSON.stringify(route)})`);
  await waitFor(`document.querySelector(${JSON.stringify(`#${sectionId}.active`)}) && document.querySelector(${JSON.stringify(inputSelector)})?.dataset.searchClearReady === "true"`);
  await delay(160);
}

async function exerciseSearchControl({
  name,
  inputSelector,
  resultRootSelector,
  resultItemSelector,
  assertNoMatch = true,
  allowEmptyDefault = false
}) {
  const result = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(inputSelector)});
    const control = input?.closest("[data-search-clear-root], .search-clear-control");
    const button = control?.querySelector("[data-search-clear-button]");
    const emptyOnly = control?.querySelector("[data-search-clear-when-empty]");
    const resultsRoot = document.querySelector(${JSON.stringify(resultRootSelector)});
    const count = () => resultsRoot?.querySelectorAll(${JSON.stringify(resultItemSelector)}).length ?? -1;
    if (!input || !control || !button || !resultsRoot) return { missing: true };

    const emptyButtonHidden = button.hidden;
    const emptyButtonDisplay = getComputedStyle(button).display;
    const emptyOnlyHidden = emptyOnly?.hidden ?? null;
    const emptyOnlyDisplay = emptyOnly ? getComputedStyle(emptyOnly).display : null;
    const initialCount = count();
    input.value = "__ravza_no_match__";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const controlRect = control.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const inputStyle = getComputedStyle(input);
    const buttonStyle = getComputedStyle(button);
    const typedState = {
      buttonHidden: button.hidden,
      buttonDisplay: buttonStyle.display,
      emptyOnlyHidden: emptyOnly?.hidden ?? null,
      emptyOnlyDisplay: emptyOnly ? getComputedStyle(emptyOnly).display : null,
      resultCount: count(),
      insideControl: buttonRect.left >= controlRect.left && buttonRect.right <= controlRect.right,
      overlayControl: control.classList.contains("search-clear-control"),
      paddingRight: parseFloat(inputStyle.paddingRight) || 0,
      buttonWidth: buttonRect.width,
      buttonHeight: buttonRect.height,
      buttonLayoutWidth: button.offsetWidth,
      buttonLayoutHeight: button.offsetHeight,
      buttonCssWidth: parseFloat(buttonStyle.width) || 0,
      buttonCssHeight: parseFloat(buttonStyle.height) || 0,
      buttonTabIndex: button.tabIndex,
      buttonAriaLabel: button.getAttribute("aria-label"),
      inputAccessibleName: input.getAttribute("aria-label")
        || Array.from(input.labels || []).map((label) => label.textContent.trim()).filter(Boolean).join(" ")
    };

    button.click();
    const clickState = {
      value: input.value,
      buttonHidden: button.hidden,
      buttonDisplay: getComputedStyle(button).display,
      emptyOnlyHidden: emptyOnly?.hidden ?? null,
      emptyOnlyDisplay: emptyOnly ? getComputedStyle(emptyOnly).display : null,
      resultCount: count(),
      focusRetained: document.activeElement === input
    };

    input.value = "escape-test";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus({ preventScroll: true });
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true
    }));
    const escapeState = {
      value: input.value,
      buttonHidden: button.hidden,
      buttonDisplay: getComputedStyle(button).display,
      emptyOnlyHidden: emptyOnly?.hidden ?? null,
      emptyOnlyDisplay: emptyOnly ? getComputedStyle(emptyOnly).display : null,
      resultCount: count(),
      focusRetained: document.activeElement === input
    };

    return {
      emptyButtonHidden,
      emptyButtonDisplay,
      emptyOnlyHidden,
      emptyOnlyDisplay,
      initialCount,
      typedState,
      clickState,
      escapeState
    };
  })()`);

  const exerciseKeyboardActivation = async ({ key, code, virtualKeyCode, activation }) => {
    await command("Page.bringToFront");
    await command("Emulation.setFocusEmulationEnabled", { enabled: true });
    const prepared = await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(inputSelector)});
      const control = input?.closest("[data-search-clear-root], .search-clear-control");
      const button = control?.querySelector("[data-search-clear-button]");
      if (!input || !button) return false;
      input.value = "__ravza_keyboard_clear__";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      button.focus({ preventScroll: true });
      return document.activeElement === button && !button.hidden;
    })()`);
    assert.equal(prepared, true, `${name}: ${activation} testi için X odağı hazırlanamadı`);

    await command("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode
    });
    await command("Input.dispatchKeyEvent", {
      type: "char",
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
      text: key === "Enter" ? "\r" : " ",
      unmodifiedText: key === "Enter" ? "\r" : " "
    });
    await command("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode
    });
    await delay(40);

    return evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(inputSelector)});
      const control = input?.closest("[data-search-clear-root], .search-clear-control");
      const button = control?.querySelector("[data-search-clear-button]");
      const resultsRoot = document.querySelector(${JSON.stringify(resultRootSelector)});
      return {
        value: input?.value ?? null,
        buttonHidden: button?.hidden ?? false,
        resultCount: resultsRoot?.querySelectorAll(${JSON.stringify(resultItemSelector)}).length ?? -1,
        focusRetained: document.activeElement === input
      };
    })()`);
  };

  const enterState = await exerciseKeyboardActivation({
    key: "Enter",
    code: "Enter",
    virtualKeyCode: 13,
    activation: "Enter"
  });
  const spaceState = await exerciseKeyboardActivation({
    key: " ",
    code: "Space",
    virtualKeyCode: 32,
    activation: "Space"
  });

  assert.equal(result.missing, undefined, `${name}: bileşen eksik`);
  assert.equal(result.emptyButtonHidden, true, `${name}: boş inputta X gizli değil`);
  assert.equal(result.emptyButtonDisplay, "none", `${name}: boş inputta X CSS ile gizli değil`);
  if (!allowEmptyDefault) assert.ok(result.initialCount > 0, `${name}: varsayılan liste boş`);
  assert.equal(result.typedState.buttonHidden, false, `${name}: yazınca X görünmedi`);
  assert.notEqual(result.typedState.buttonDisplay, "none", `${name}: X görünür düzende değil`);
  assert.equal(result.typedState.insideControl, true, `${name}: X input kontrolünün dışına taşıyor`);
  expectVisual(
    result.typedState.buttonCssWidth >= MIN_CLEAR_TARGET,
    `${name}: X CSS genişliği ${result.typedState.buttonCssWidth}px; en az ${MIN_CLEAR_TARGET}px olmalı`
  );
  expectVisual(
    result.typedState.buttonCssHeight >= MIN_CLEAR_TARGET,
    `${name}: X CSS yüksekliği ${result.typedState.buttonCssHeight}px; en az ${MIN_CLEAR_TARGET}px olmalı`
  );
  expectVisual(
    result.typedState.buttonLayoutWidth >= MIN_CLEAR_TARGET,
    `${name}: X yerleşim genişliği ${result.typedState.buttonLayoutWidth}px; en az ${MIN_CLEAR_TARGET}px olmalı`
  );
  expectVisual(
    result.typedState.buttonLayoutHeight >= MIN_CLEAR_TARGET,
    `${name}: X yerleşim yüksekliği ${result.typedState.buttonLayoutHeight}px; en az ${MIN_CLEAR_TARGET}px olmalı`
  );
  assert.equal(result.typedState.buttonTabIndex, 0, `${name}: X klavye odağı alamıyor`);
  assert.equal(result.typedState.buttonAriaLabel, "Aramayı temizle", `${name}: X erişilebilir adı eksik`);
  assert.ok(result.typedState.inputAccessibleName, `${name}: arama inputunun erişilebilir adı eksik`);
  if (result.typedState.overlayControl) {
    expectVisual(
      result.typedState.paddingRight >= result.typedState.buttonCssWidth + 12,
      `${name}: input sağ paddingi ${result.typedState.paddingRight}px; ${result.typedState.buttonCssWidth}px X ile metnin çakışmasını önlemiyor`
    );
  }
  if (assertNoMatch) assert.equal(result.typedState.resultCount, 0, `${name}: eşleşmeyen sorgu listeyi filtrelemedi`);
  assert.deepEqual(result.clickState, {
    value: "",
    buttonHidden: true,
    buttonDisplay: "none",
    emptyOnlyHidden: result.emptyOnlyHidden,
    emptyOnlyDisplay: result.emptyOnlyDisplay,
    resultCount: result.initialCount,
    focusRetained: true
  }, `${name}: tıklayarak temizleme başarısız`);
  assert.deepEqual(result.escapeState, {
    value: "",
    buttonHidden: true,
    buttonDisplay: "none",
    emptyOnlyHidden: result.emptyOnlyHidden,
    emptyOnlyDisplay: result.emptyOnlyDisplay,
    resultCount: result.initialCount,
    focusRetained: true
  }, `${name}: Escape ile temizleme başarısız`);
  for (const [activation, keyboardState] of [["Enter", enterState], ["Space", spaceState]]) {
    assert.equal(keyboardState.value, "", `${name}: ${activation} inputu temizlemedi`);
    assert.equal(keyboardState.buttonHidden, true, `${name}: ${activation} sonrası X gizlenmedi`);
    assert.equal(
      keyboardState.resultCount,
      result.initialCount,
      `${name}: ${activation} sonrası varsayılan sonuçlar geri gelmedi`
    );
  }
  return result;
}

async function markPseudoTarget(inputSelector, target) {
  const markerAttribute = "data-search-clear-pseudo-target";
  const marked = await evaluate(`(() => {
    document.querySelectorAll("[${markerAttribute}]").forEach((node) => node.removeAttribute(${JSON.stringify(markerAttribute)}));
    const input = document.querySelector(${JSON.stringify(inputSelector)});
    const control = input?.closest("[data-search-clear-root], .search-clear-control");
    const node = ${JSON.stringify(target)} === "input"
      ? input
      : control?.querySelector("[data-search-clear-button]");
    if (!node) return false;
    node.setAttribute(${JSON.stringify(markerAttribute)}, "");
    node.focus({ preventScroll: true });
    return true;
  })()`);
  assert.equal(marked, true, `${inputSelector}: ${target} pseudo-state hedefi bulunamadı`);

  const documentNode = await command("DOM.getDocument");
  const query = await command("DOM.querySelector", {
    nodeId: documentNode.root.nodeId,
    selector: `[${markerAttribute}]`
  });
  assert.ok(query.nodeId, `${inputSelector}: ${target} CDP node bulunamadı`);
  return query.nodeId;
}

async function forcePseudoState(inputSelector, target, forcedPseudoClasses) {
  const nodeId = await markPseudoTarget(inputSelector, target);
  await command("CSS.forcePseudoState", { nodeId, forcedPseudoClasses });
  await delay(40);
  return nodeId;
}

async function inspectSearchVisualState(inputSelector) {
  return evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(inputSelector)});
    const control = input?.closest("[data-search-clear-root], .search-clear-control");
    const button = control?.querySelector("[data-search-clear-button]");
    if (!input || !control || !button) return { missing: true };

    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
    const parseColor = (value) => {
      if (!value || value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = "rgba(0, 0, 0, 0)";
      colorContext.fillStyle = value;
      colorContext.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: alpha / 255 };
    };
    const composite = (front, back) => {
      const alpha = front.a + back.a * (1 - front.a);
      if (alpha <= 0) return { r: 255, g: 255, b: 255, a: 1 };
      return {
        r: (front.r * front.a + back.r * back.a * (1 - front.a)) / alpha,
        g: (front.g * front.a + back.g * back.a * (1 - front.a)) / alpha,
        b: (front.b * front.a + back.b * back.a * (1 - front.a)) / alpha,
        a: alpha
      };
    };
    const effectiveBackground = (element) => {
      const layers = [];
      for (let node = element; node instanceof Element; node = node.parentElement) {
        layers.push(parseColor(getComputedStyle(node).backgroundColor));
      }
      let result = { r: 255, g: 255, b: 255, a: 1 };
      for (const layer of layers.reverse()) result = composite(layer, result);
      return result;
    };
    const luminance = (color) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= .04045
          ? normalized / 12.92
          : ((normalized + .055) / 1.055) ** 2.4;
      };
      return .2126 * channel(color.r) + .7152 * channel(color.g) + .0722 * channel(color.b);
    };
    const contrast = (first, second) => {
      const lighter = Math.max(luminance(first), luminance(second));
      const darker = Math.min(luminance(first), luminance(second));
      return Number(((lighter + .05) / (darker + .05)).toFixed(2));
    };
    const effectiveForeground = (rawColor, background) => composite(parseColor(rawColor), background);
    const indicator = (...styles) => styles.some((style) => (
      (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 1)
      || style.boxShadow !== "none"
    ));
    const snapshot = (style) => [
      style.color,
      style.backgroundColor,
      style.borderColor,
      style.boxShadow,
      style.transform,
      style.outlineColor,
      style.outlineStyle,
      style.outlineWidth
    ].join("|");

    const inputStyle = getComputedStyle(input);
    const placeholderStyle = getComputedStyle(input, "::placeholder");
    const controlStyle = getComputedStyle(control);
    const buttonStyle = getComputedStyle(button);
    const boundary = (
      inputStyle.borderTopStyle !== "none"
      && parseFloat(inputStyle.borderTopWidth) > 0
    ) ? input : control;
    const boundaryStyle = getComputedStyle(boundary);
    const inputBackground = effectiveBackground(input);
    const controlBackground = effectiveBackground(control);
    const buttonBackground = effectiveBackground(button);
    const boundaryBackground = effectiveBackground(boundary);
    const surroundingBackground = effectiveBackground(boundary.parentElement || document.body);
    const boundaryColorOnSurface = composite(parseColor(boundaryStyle.borderTopColor), boundaryBackground);
    const boundaryColorOutside = composite(parseColor(boundaryStyle.borderTopColor), surroundingBackground);
    const inputText = effectiveForeground(inputStyle.color, inputBackground);
    const placeholderText = effectiveForeground(placeholderStyle.color, inputBackground);
    const buttonText = effectiveForeground(buttonStyle.color, buttonBackground);
    const buttonBorderOnSurface = composite(parseColor(buttonStyle.borderColor), buttonBackground);
    const buttonBorderOutside = composite(parseColor(buttonStyle.borderColor), inputBackground);
    const buttonOutlineOutside = composite(parseColor(buttonStyle.outlineColor), inputBackground);
    const searchIcon = control.matches(".launcher-search-field")
      ? control.querySelector(":scope > svg")
      : input.closest(".topbar-search")?.querySelector(".topbar-search-icon");
    const searchIconStyle = searchIcon ? getComputedStyle(searchIcon) : null;
    const searchIconBackground = searchIcon ? effectiveBackground(searchIcon) : null;
    const searchIconPaint = searchIconStyle
      ? (searchIcon instanceof SVGElement
        ? (searchIconStyle.stroke && searchIconStyle.stroke !== "none"
          ? searchIconStyle.stroke
          : (searchIconStyle.fill && searchIconStyle.fill !== "none" ? searchIconStyle.fill : searchIconStyle.color))
        : searchIconStyle.color)
      : null;
    const buttonSvg = button.querySelector("svg");
    const buttonSvgStyle = buttonSvg ? getComputedStyle(buttonSvg) : null;

    return {
      missing: false,
      bodyDark: document.body.classList.contains("dark"),
      navigationTimeOrigin: performance.timeOrigin,
      visible: !button.hidden && buttonStyle.display !== "none",
      inputColor: inputStyle.color,
      inputBackground: inputStyle.backgroundColor,
      inputEffectiveBackground: inputBackground,
      placeholderColor: placeholderStyle.color,
      inputBorder: boundaryStyle.borderTopColor,
      inputBorderStyle: boundaryStyle.borderTopStyle,
      inputBorderWidth: parseFloat(boundaryStyle.borderTopWidth) || 0,
      controlBackground: controlStyle.backgroundColor,
      buttonColor: buttonStyle.color,
      buttonBackground: buttonStyle.backgroundColor,
      buttonBorder: buttonStyle.borderColor,
      buttonTransform: buttonStyle.transform,
      buttonBoxShadow: buttonStyle.boxShadow,
      buttonOutlineStyle: buttonStyle.outlineStyle,
      buttonOutlineWidth: parseFloat(buttonStyle.outlineWidth) || 0,
      buttonOutlineColor: buttonStyle.outlineColor,
      inputSnapshot: snapshot(inputStyle) + "|" + snapshot(controlStyle),
      buttonSnapshot: snapshot(buttonStyle),
      inputFocusIndicator: indicator(inputStyle, controlStyle),
      buttonFocusIndicator: indicator(buttonStyle),
      svgStroke: buttonSvgStyle?.stroke || null,
      svgFill: buttonSvgStyle?.fill || null,
      searchIconColor: searchIconStyle?.color || null,
      searchIconPaint,
      ratios: {
        inputText: contrast(inputText, inputBackground),
        placeholder: contrast(placeholderText, inputBackground),
        boundary: Math.max(
          contrast(boundaryColorOnSurface, boundaryBackground),
          contrast(boundaryColorOutside, surroundingBackground),
          contrast(boundaryBackground, surroundingBackground)
        ),
        clearIcon: contrast(buttonText, buttonBackground),
        clearSurface: contrast(buttonBackground, inputBackground),
        clearBoundary: Math.max(
          contrast(buttonBorderOnSurface, buttonBackground),
          contrast(buttonBorderOutside, inputBackground),
          contrast(buttonBackground, inputBackground)
        ),
        clearFocusRing: contrast(buttonOutlineOutside, inputBackground),
        searchIcon: searchIconStyle
          ? contrast(effectiveForeground(searchIconPaint, searchIconBackground), searchIconBackground)
          : null
      }
    };
  })()`);
}

async function themeStyles(inputSelector, preference, { fixedContext = false } = {}) {
  const beforeTimeOrigin = await evaluate("performance.timeOrigin");
  if (!fixedContext) {
    await evaluate(`window.setThemePreference(${JSON.stringify(preference)})`);
    await waitFor(`document.body.classList.contains("dark") === ${preference === "dark"}`);
  }
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(inputSelector)});
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(220);
  const empty = await inspectSearchVisualState(inputSelector);
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(inputSelector)});
    input.value = "tema görünümü";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(220);

  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(inputSelector)});
    const button = input?.closest("[data-search-clear-root], .search-clear-control")?.querySelector("[data-search-clear-button]");
    input?.blur();
    button?.blur();
  })()`);
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  await delay(30);
  const normal = await inspectSearchVisualState(inputSelector);
  const inputHoverNodeId = await forcePseudoState(inputSelector, "input", ["hover"]);
  const inputHover = await inspectSearchVisualState(inputSelector);
  await command("CSS.forcePseudoState", { nodeId: inputHoverNodeId, forcedPseudoClasses: [] });

  const hoverNodeId = await forcePseudoState(inputSelector, "button", ["hover"]);
  const hover = await inspectSearchVisualState(inputSelector);
  await command("CSS.forcePseudoState", { nodeId: hoverNodeId, forcedPseudoClasses: [] });

  const activeNodeId = await forcePseudoState(inputSelector, "button", ["hover", "active"]);
  const active = await inspectSearchVisualState(inputSelector);
  await command("CSS.forcePseudoState", { nodeId: activeNodeId, forcedPseudoClasses: [] });

  const buttonFocusNodeId = await forcePseudoState(inputSelector, "button", ["focus", "focus-visible"]);
  const buttonFocus = await inspectSearchVisualState(inputSelector);
  await command("CSS.forcePseudoState", { nodeId: buttonFocusNodeId, forcedPseudoClasses: [] });

  const inputFocusNodeId = await forcePseudoState(inputSelector, "input", ["focus", "focus-visible"]);
  const inputFocus = await inspectSearchVisualState(inputSelector);
  await command("CSS.forcePseudoState", { nodeId: inputFocusNodeId, forcedPseudoClasses: [] });
  await evaluate(`document.querySelectorAll("[data-search-clear-pseudo-target]").forEach((node) => node.removeAttribute("data-search-clear-pseudo-target"))`);

  return {
    preference,
    fixedContext,
    noReload: [empty, normal, inputHover, hover, active, buttonFocus, inputFocus]
      .every((state) => state.navigationTimeOrigin === beforeTimeOrigin),
    empty,
    normal,
    inputHover,
    hover,
    active,
    buttonFocus,
    inputFocus
  };
}

function assertThemeVisuals(name, themeResult) {
  const label = `${name}/${themeResult.preference}`;
  const { empty, normal, inputHover, hover, active, buttonFocus, inputFocus } = themeResult;
  assert.equal(normal.missing, false, `${label}: tema bileşeni eksik`);
  expectVisual(themeResult.noReload, `${label}: tema/state kontrolü sırasında sayfa yeniden yüklendi`);
  expectVisual(!empty.visible, `${label}: boş inputta X görünür kaldı`);
  expectVisual(empty.ratios.placeholder >= 4.5, `${label}: boş input placeholder kontrastı ${empty.ratios.placeholder}, en az 4.5 olmalı`);
  expectVisual(empty.ratios.boundary >= 3, `${label}: boş input sınır kontrastı ${empty.ratios.boundary}, en az 3 olmalı`);
  expectVisual(normal.visible, `${label}: dolu inputta X görünmüyor`);
  expectVisual(normal.ratios.inputText >= 4.5, `${label}: input metni kontrastı ${normal.ratios.inputText}, en az 4.5 olmalı`);
  expectVisual(normal.ratios.placeholder >= 4.5, `${label}: placeholder kontrastı ${normal.ratios.placeholder}, en az 4.5 olmalı`);
  expectVisual(normal.inputBorderStyle !== "none" && normal.inputBorderWidth >= 1, `${label}: input/kapsayıcı sınırı görünür değil`);
  expectVisual(normal.ratios.boundary >= 3, `${label}: input/kapsayıcı sınır kontrastı ${normal.ratios.boundary}, en az 3 olmalı`);
  expectVisual(normal.ratios.clearIcon >= 3, `${label}: X ikon kontrastı ${normal.ratios.clearIcon}, en az 3 olmalı`);
  expectVisual(normal.ratios.clearBoundary >= 1.5, `${label}: X buton yüzeyi/sınırı kontrastı ${normal.ratios.clearBoundary}, en az 1.5 olmalı`);
  if (normal.ratios.searchIcon !== null) {
    expectVisual(normal.ratios.searchIcon >= 3, `${label}: arama ikonu kontrastı ${normal.ratios.searchIcon}, en az 3 olmalı`);
  }
  expectVisual(
    inputHover.inputSnapshot !== normal.inputSnapshot,
    `${label}: input hover durumu normal durumdan ayrışmıyor`
  );
  expectVisual(inputHover.ratios.inputText >= 4.5, `${label}: input hover metin kontrastı ${inputHover.ratios.inputText}, en az 4.5 olmalı`);
  expectVisual(inputHover.ratios.boundary >= 3, `${label}: input hover sınır kontrastı ${inputHover.ratios.boundary}, en az 3 olmalı`);
  expectVisual(
    normal.svgStroke === normal.buttonColor || normal.svgFill === normal.buttonColor,
    `${label}: X SVG rengi currentColor ile buton rengini izlemiyor`
  );
  expectVisual(
    hover.buttonSnapshot !== normal.buttonSnapshot,
    `${label}: X hover durumu normal durumdan ayrışmıyor`
  );
  expectVisual(hover.ratios.clearIcon >= 3, `${label}: X hover ikon kontrastı ${hover.ratios.clearIcon}, en az 3 olmalı`);
  expectVisual(
    active.buttonSnapshot !== hover.buttonSnapshot && active.buttonSnapshot !== normal.buttonSnapshot,
    `${label}: X active durumu görsel basılma geri bildirimi vermiyor`
  );
  expectVisual(active.ratios.clearIcon >= 3, `${label}: X active ikon kontrastı ${active.ratios.clearIcon}, en az 3 olmalı`);
  expectVisual(buttonFocus.buttonFocusIndicator, `${label}: X focus-visible göstergesi görünür değil`);
  expectVisual(buttonFocus.ratios.clearFocusRing >= 3, `${label}: X focus-visible halka kontrastı ${buttonFocus.ratios.clearFocusRing}, en az 3 olmalı`);
  expectVisual(
    buttonFocus.buttonSnapshot !== normal.buttonSnapshot,
    `${label}: X focus-visible durumu normal durumdan ayrışmıyor`
  );
  expectVisual(inputFocus.inputFocusIndicator, `${label}: input focus-visible göstergesi görünür değil`);
  expectVisual(inputFocus.ratios.boundary >= 3, `${label}: input focus sınır kontrastı ${inputFocus.ratios.boundary}, en az 3 olmalı`);
  expectVisual(
    inputFocus.inputSnapshot !== normal.inputSnapshot,
    `${label}: input focus-visible durumu normal durumdan ayrışmıyor`
  );
}

function assertThemePair(name, light, dark) {
  assertThemeVisuals(name, light);
  assertThemeVisuals(name, dark);
  expectVisual(light.normal.bodyDark === false, `${name}: light tercihinde body.dark kaldı`);
  expectVisual(dark.normal.bodyDark === true, `${name}: dark tercihinde body.dark uygulanmadı`);
  const lightFingerprint = [
    light.normal.inputColor,
    light.normal.inputBackground,
    light.normal.placeholderColor,
    light.normal.inputBorder,
    light.normal.controlBackground,
    light.normal.buttonColor,
    light.normal.buttonBackground,
    light.normal.buttonBorder,
    light.normal.searchIconColor
  ].join("|");
  const darkFingerprint = [
    dark.normal.inputColor,
    dark.normal.inputBackground,
    dark.normal.placeholderColor,
    dark.normal.inputBorder,
    dark.normal.controlBackground,
    dark.normal.buttonColor,
    dark.normal.buttonBackground,
    dark.normal.buttonBorder,
    dark.normal.searchIconColor
  ].join("|");
  expectVisual(lightFingerprint !== darkFingerprint, `${name}: arama bileşeni light/dark tema değişimine tepki vermiyor`);
}

async function assertResponsiveFit(inputSelector, name, width, theme) {
  const result = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(inputSelector)});
    if (!input) return { missing: true };
    input.scrollIntoView({ block: "center", inline: "nearest" });
    input.value = "çok uzun responsive arama metni ".repeat(8);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const control = input.closest("[data-search-clear-root], .search-clear-control");
    const button = control?.querySelector("[data-search-clear-button]");
    if (!control || !button) return { missing: true };
    const controlRect = control.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const inputStyle = getComputedStyle(input);
    const controlStyle = getComputedStyle(control);
    const overlayControl = control.classList.contains("search-clear-control");
    const paddingRight = parseFloat(inputStyle.paddingRight) || 0;
    const paddingLeft = parseFloat(inputStyle.paddingLeft) || 0;
    return {
      missing: false,
      controlInsideViewport: controlRect.left >= -1 && controlRect.right <= innerWidth + 1,
      buttonInsideControl: buttonRect.left >= controlRect.left - 1 && buttonRect.right <= controlRect.right + 1
        && buttonRect.top >= controlRect.top - 1 && buttonRect.bottom <= controlRect.bottom + 1,
      inputInsideControl: inputRect.left >= controlRect.left - 1 && inputRect.right <= controlRect.right + 1,
      buttonVisible: !button.hidden && getComputedStyle(button).display !== "none",
      buttonWidth: buttonRect.width,
      buttonHeight: buttonRect.height,
      buttonLayoutWidth: button.offsetWidth,
      buttonLayoutHeight: button.offsetHeight,
      overlayControl,
      paddingRight,
      textAreaWidth: inputRect.width - paddingLeft - paddingRight,
      textProtectedFromButton: overlayControl
        ? paddingRight >= buttonRect.width + 12 && buttonRect.left >= inputRect.left && buttonRect.right <= inputRect.right + 1
        : inputRect.right <= buttonRect.left + 1,
      borderRadius: Math.max(parseFloat(inputStyle.borderRadius) || 0, parseFloat(controlStyle.borderRadius) || 0),
      geometry: {
        control: { left: controlRect.left, right: controlRect.right, top: controlRect.top, bottom: controlRect.bottom },
        input: { left: inputRect.left, right: inputRect.right, top: inputRect.top, bottom: inputRect.bottom },
        button: { left: buttonRect.left, right: buttonRect.right, top: buttonRect.top, bottom: buttonRect.bottom }
      }
    };
  })()`);

  const label = `${name}/${theme}/${width}px`;
  expectVisual(!result.missing, `${label}: responsive bileşen eksik`);
  if (result.missing) return;
  expectVisual(result.controlInsideViewport, `${label}: arama kapsayıcısı viewport dışına taşıyor`);
  expectVisual(result.buttonInsideControl, `${label}: X arama kapsayıcısının dışına taşıyor (${JSON.stringify(result.geometry)})`);
  expectVisual(result.inputInsideControl, `${label}: input arama kapsayıcısının dışına taşıyor`);
  expectVisual(result.buttonVisible, `${label}: dolu inputta X görünmüyor`);
  expectVisual(
    result.buttonLayoutWidth >= MIN_CLEAR_TARGET && result.buttonLayoutHeight >= MIN_CLEAR_TARGET,
    `${label}: X dokunma alanı ${result.buttonLayoutWidth}×${result.buttonLayoutHeight}px; en az ${MIN_CLEAR_TARGET}×${MIN_CLEAR_TARGET}px olmalı`
  );
  expectVisual(result.textAreaWidth >= 44, `${label}: kullanılabilir metin alanı yalnızca ${result.textAreaWidth}px`);
  expectVisual(result.textProtectedFromButton, `${label}: uzun arama metni X alanıyla çakışabilir`);
  expectVisual(result.borderRadius > 0, `${label}: input/kapsayıcı border-radius kayboldu`);
}

async function connectCdpSocket(url, timeout = 12000) {
  const connection = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      connection.removeEventListener("open", onOpen);
      connection.removeEventListener("error", onError);
    };
    const onOpen = () => {
      cleanup();
      resolveOpen();
    };
    const onError = () => {
      cleanup();
      rejectOpen(new Error("CDP WebSocket bağlantısı kurulamadı."));
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      connection.close();
      rejectOpen(new Error("CDP WebSocket bağlantısı zaman aşımına uğradı."));
    }, timeout);

    connection.addEventListener("open", onOpen, { once: true });
    connection.addEventListener("error", onError, { once: true });
  });
  return connection;
}

try {
  const target = await findPage();
  socket = await connectCdpSocket(target.webSocketDebuggerUrl);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      runtimeIssues.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      runtimeIssues.push(message.params.args.map((arg) => arg.value || arg.description || "").filter(Boolean).join(" "));
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      runtimeIssues.push(message.params.entry.text);
    }
    if (!message.id || !pending.has(message.id)) return;
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(message.error.message));
    else callbacks.resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Log.enable");
  await command("DOM.enable");
  await command("CSS.enable");
  await setViewport(1280, 900, false);
  await navigateTo("index.html");
  await waitFor("window.__APP_STARTUP_STATE__?.completed && typeof window.setThemePreference === 'function' && document.querySelector('#launcherSearchInput')?.dataset.searchClearReady === 'true'");

  const mainCases = [
    {
      name: "Çalışma Merkezi",
      route: "calisma-merkezi",
      sectionId: "studyhub",
      inputSelector: "#studyFilter",
      resultRootSelector: "#studyHubGrid",
      resultItemSelector: ".topic-card"
    },
    {
      name: "Quiz Merkezi",
      route: "quiz-merkezi",
      sectionId: "quizhub",
      inputSelector: "#quizFilter",
      resultRootSelector: "#quizHubGrid",
      resultItemSelector: ".topic-card"
    },
    {
      name: "Ezber Merkezi",
      route: "ezber-merkezi",
      sectionId: "memoryhub",
      inputSelector: "#memoryFilter",
      resultRootSelector: "#memoryHubGrid",
      resultItemSelector: ".memory-card",
      before: "window.setMemoryTab('cards')"
    },
    {
      name: "Hızlı Tekrar",
      route: "hizli-tekrar",
      sectionId: "recap",
      inputSelector: "#recapFilter",
      resultRootSelector: "#recapGrid",
      resultItemSelector: ".flashcard"
    },
    {
      name: "Boşluk Doldurma",
      route: "bosluk-doldurma",
      sectionId: "fillgaphub",
      inputSelector: "#fillGapSearch",
      resultRootSelector: "#fillGapGrid",
      resultItemSelector: ".fill-gap-card"
    }
  ];

  const mainResults = [];
  const mainThemeResults = [];
  for (const testCase of mainCases) {
    await openRoute(testCase.route, testCase.sectionId, testCase.inputSelector);
    if (testCase.before) {
      await evaluate(testCase.before);
      await waitFor(`document.querySelector(${JSON.stringify(testCase.inputSelector)})?.offsetParent !== null`);
      await delay(120);
    }
    mainResults.push(await exerciseSearchControl(testCase));
    const light = await themeStyles(testCase.inputSelector, "light");
    const dark = await themeStyles(testCase.inputSelector, "dark");
    assertThemePair(testCase.name, light, dark);
    mainThemeResults.push({ name: testCase.name, light, dark });
  }

  await evaluate("window.openLauncherSearch(document.querySelector('#launcherSearchOpen'), false)");
  await waitFor("document.querySelector('#launcherSearchLayer').classList.contains('is-open')");
  const launcherAffordance = await evaluate(`(async () => {
    const root = document.querySelector(".launcher-search-field");
    const input = document.querySelector("#launcherSearchInput");
    const button = root.querySelector("[data-search-clear-button]");
    const emptyHint = root.querySelector("[data-search-clear-when-empty]");
    const icon = root.querySelector(":scope > svg");
    const initialHintVisible = !emptyHint.hidden && getComputedStyle(emptyHint).display !== "none";

    document.querySelector("[data-launcher-search-close]").focus();
    icon.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const shellClickFocusedInput = document.activeElement === input;
    await new Promise((resolveFocusTransition) => setTimeout(resolveFocusTransition, 220));
    const focusedStyle = getComputedStyle(root);
    const visibleFocusIndicator = focusedStyle.boxShadow !== "none";

    input.value = "ipucu";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const typedHintHidden = emptyHint.hidden && getComputedStyle(emptyHint).display === "none";
    button.click();
    const clearedHintVisible = !emptyHint.hidden && getComputedStyle(emptyHint).display !== "none";

    return { initialHintVisible, shellClickFocusedInput, visibleFocusIndicator, typedHintHidden, clearedHintVisible };
  })()`);
  assert.deepEqual(launcherAffordance, {
    initialHintVisible: true,
    shellClickFocusedInput: true,
    visibleFocusIndicator: true,
    typedHintHidden: true,
    clearedHintVisible: true
  }, "Launcher: odak yüzeyi, klavye odağı veya Esc ipucu senkronu bozuk");
  const launcherResult = await exerciseSearchControl({
    name: "Global launcher araması",
    inputSelector: "#launcherSearchInput",
    resultRootSelector: "#launcherSearchResults",
    resultItemSelector: ".launcher-search-result"
  });
  assert.equal(await evaluate("document.querySelector('#launcherSearchLayer').classList.contains('is-open')"), true, "Launcher: dolu inputta Escape modalı kapattı");
  await evaluate(`document.querySelector("#launcherSearchInput").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }))`);
  await waitFor("document.querySelector('#launcherSearchLayer').hidden");

  await evaluate("window.navigate('ana-sayfa')");
  await waitFor("document.body.dataset.currentRoute === 'ana-sayfa'");
  await evaluate("window.launcherEditMode(true); window.openLauncherEditor('apps')");
  await waitFor("document.querySelector('#launcherEditorAppFilter')?.dataset.searchClearReady === 'true'");
  const editorAppsResult = await exerciseSearchControl({
    name: "Launcher uygulama editörü",
    inputSelector: "#launcherEditorAppFilter",
    resultRootSelector: "#launcherEditorContent",
    resultItemSelector: ".launcher-editor-choice:not([hidden])"
  });
  const editorAppsLight = await themeStyles("#launcherEditorAppFilter", "light");
  const editorAppsDark = await themeStyles("#launcherEditorAppFilter", "dark");
  assertThemePair("Launcher uygulama editörü", editorAppsLight, editorAppsDark);
  await evaluate("window.closeLauncherEditor(false); window.openLauncherEditor('widgets')");
  await waitFor("document.querySelector('#launcherEditorWidgetFilter')?.dataset.searchClearReady === 'true'");
  const editorWidgetsResult = await exerciseSearchControl({
    name: "Launcher widget editörü",
    inputSelector: "#launcherEditorWidgetFilter",
    resultRootSelector: "#launcherEditorContent",
    resultItemSelector: ".launcher-widget-choice:not([hidden])"
  });
  const editorWidgetsLight = await themeStyles("#launcherEditorWidgetFilter", "light");
  const editorWidgetsDark = await themeStyles("#launcherEditorWidgetFilter", "dark");
  assertThemePair("Launcher widget editörü", editorWidgetsLight, editorWidgetsDark);
  await evaluate("window.closeLauncherEditor(false); window.launcherEditMode(false)");

  await openRoute("ezber-merkezi", "memoryhub", "#memoryFilter");
  await evaluate("window.setMemoryTab('cards')");
  await evaluate(`window.setThemePreference("light"); (() => {
    const input = document.querySelector("#memoryFilter");
    input.value = "tema görünümü";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(220);
  await screenshot("memory-light-desktop.png");
  await evaluate("window.setThemePreference('dark')");
  await waitFor("document.body.classList.contains('dark')");
  await delay(220);
  await screenshot("memory-dark-desktop.png");

  const presetThemeResults = [];
  for (const themeStyle of THEME_STYLES) {
    await evaluate(`window.selectTheme(${JSON.stringify(themeStyle)})`);
    await waitFor(`document.body.dataset.themeStyle === ${JSON.stringify(themeStyle)}`);
    const light = await themeStyles("#memoryFilter", "light");
    const dark = await themeStyles("#memoryFilter", "dark");
    assertThemePair(`Ezber Merkezi/${themeStyle}`, light, dark);
    presetThemeResults.push({ themeStyle, light, dark });
  }

  await evaluate("window.openLauncherSearch(document.querySelector('#launcherSearchOpen'), false)");
  await waitFor("document.querySelector('#launcherSearchLayer').classList.contains('is-open')");
  const launcherLight = await themeStyles("#launcherSearchInput", "light");
  const launcherDark = await themeStyles("#launcherSearchInput", "dark");
  assertThemePair("Global launcher araması", launcherLight, launcherDark);
  await evaluate("window.closeLauncherSearch(false, false)");

  for (const [width, height] of RESPONSIVE_VIEWPORTS) {
    await setViewport(width, height, width < 768);
    for (const theme of THEME_PREFERENCES) {
      await evaluate(`window.setThemePreference(${JSON.stringify(theme)})`);
      await waitFor(`document.body.classList.contains("dark") === ${theme === "dark"}`);
      for (const testCase of mainCases) {
        await openRoute(testCase.route, testCase.sectionId, testCase.inputSelector);
        if (testCase.before) {
          await evaluate(testCase.before);
          await waitFor(`document.querySelector(${JSON.stringify(testCase.inputSelector)})?.offsetParent !== null`);
          await delay(80);
        }
        await assertResponsiveFit(testCase.inputSelector, testCase.name, width, theme);
      }

      await evaluate("window.navigate('ana-sayfa')");
      await waitFor("document.body.dataset.currentRoute === 'ana-sayfa'");
      await evaluate("window.openLauncherSearch(document.querySelector('#launcherSearchOpen'), false)");
      await waitFor("document.querySelector('#launcherSearchLayer').classList.contains('is-open')");
      await assertResponsiveFit("#launcherSearchInput", "Global launcher araması", width, theme);
      await evaluate("window.closeLauncherSearch(false, false); window.launcherEditMode(true); window.openLauncherEditor('apps')");
      await waitFor("document.querySelector('#launcherEditorAppFilter')?.dataset.searchClearReady === 'true'");
      await assertResponsiveFit("#launcherEditorAppFilter", "Launcher uygulama editörü", width, theme);
      await evaluate("window.closeLauncherEditor(false); window.openLauncherEditor('widgets')");
      await waitFor("document.querySelector('#launcherEditorWidgetFilter')?.dataset.searchClearReady === 'true'");
      await assertResponsiveFit("#launcherEditorWidgetFilter", "Launcher widget editörü", width, theme);
      await evaluate("window.closeLauncherEditor(false); window.launcherEditMode(false)");

      if (width === 390 && theme === "dark") {
        await openRoute("ezber-merkezi", "memoryhub", "#memoryFilter");
        await evaluate("window.setMemoryTab('cards')");
        await screenshot("memory-dark-mobile.png");
      }
    }
  }

  await navigateTo("admin.html");
  await waitFor("document.querySelector('#globalSearch')");
  await evaluate(`sessionStorage.setItem("yusuf_ravza_admin_demo_session", "1"); location.reload()`);
  await waitFor("!document.querySelector('#adminApp').hidden && document.querySelector('#globalSearch')?.dataset.searchClearReady === 'true'", 20000);
  await delay(250);

  const globalAdminResult = await evaluate(`(() => {
    const input = document.querySelector("#globalSearch");
    const control = input.closest(".search-clear-control");
    const button = control.querySelector("[data-search-clear-button]");
    const hiddenCount = () => document.querySelectorAll("#admin-overview .is-hidden-by-search").length;
    const initiallyHidden = button.hidden;
    const initiallyDisplayed = getComputedStyle(button).display;
    input.value = "__ravza_no_match__";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const hiddenAfterSearch = hiddenCount();
    const visibleAfterTyping = !button.hidden && getComputedStyle(button).display !== "none";
    const controlRect = control.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const buttonWidth = parseFloat(getComputedStyle(button).width) || 0;
    const buttonHeight = parseFloat(getComputedStyle(button).height) || 0;
    const paddingRight = parseFloat(getComputedStyle(input).paddingRight) || 0;
    button.click();
    const clickState = {
      hiddenAfterClear: hiddenCount(),
      valueAfterClear: input.value,
      focusRetained: document.activeElement === input,
      buttonHiddenAfterClear: button.hidden,
      buttonDisplayAfterClear: getComputedStyle(button).display
    };

    input.value = "escape-test";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus({ preventScroll: true });
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true
    }));
    const escapeState = {
      hiddenAfterClear: hiddenCount(),
      valueAfterClear: input.value,
      focusRetained: document.activeElement === input,
      buttonHiddenAfterClear: button.hidden,
      buttonDisplayAfterClear: getComputedStyle(button).display
    };

    return {
      initiallyHidden,
      initiallyDisplayed,
      hiddenAfterSearch,
      visibleAfterTyping,
      buttonInsideControl: buttonRect.left >= controlRect.left && buttonRect.right <= controlRect.right,
      paddingRight,
      buttonWidth,
      buttonHeight,
      buttonTabIndex: button.tabIndex,
      buttonAriaLabel: button.getAttribute("aria-label"),
      inputAccessibleName: input.getAttribute("aria-label")
        || Array.from(input.labels || []).map((label) => label.textContent.trim()).filter(Boolean).join(" "),
      clickState,
      escapeState
    };
  })()`);
  assert.equal(globalAdminResult.initiallyHidden, true);
  assert.equal(globalAdminResult.initiallyDisplayed, "none");
  assert.ok(globalAdminResult.hiddenAfterSearch > 0);
  assert.equal(globalAdminResult.visibleAfterTyping, true);
  assert.equal(globalAdminResult.buttonInsideControl, true);
  assert.ok(globalAdminResult.paddingRight >= globalAdminResult.buttonWidth + 12);
  expectVisual(
    globalAdminResult.buttonWidth >= MIN_CLEAR_TARGET && globalAdminResult.buttonHeight >= MIN_CLEAR_TARGET,
    `Admin global arama: X alanı ${globalAdminResult.buttonWidth}×${globalAdminResult.buttonHeight}px; en az ${MIN_CLEAR_TARGET}×${MIN_CLEAR_TARGET}px olmalı`
  );
  assert.equal(globalAdminResult.buttonTabIndex, 0);
  assert.equal(globalAdminResult.buttonAriaLabel, "Aramayı temizle");
  assert.ok(globalAdminResult.inputAccessibleName);
  const expectedAdminClearState = {
    hiddenAfterClear: 0,
    valueAfterClear: "",
    focusRetained: true,
    buttonHiddenAfterClear: true,
    buttonDisplayAfterClear: "none"
  };
  assert.deepEqual(globalAdminResult.clickState, expectedAdminClearState);
  assert.deepEqual(globalAdminResult.escapeState, expectedAdminClearState);
  const adminThemeResults = [];
  const globalAdminTheme = await themeStyles("#globalSearch", "admin-dark", { fixedContext: true });
  assertThemeVisuals("Admin global arama", globalAdminTheme);
  adminThemeResults.push({ name: "Admin global arama", result: globalAdminTheme });

  const adminCases = [
    ["Kullanıcı araması", "users", "#userSearch", "#usersTable"],
    ["Admin quiz araması", "quiz", "#quizSearch", "#quizTable"],
    ["Admin sınav araması", "exams", "#examSearch", "#examTable"],
    ["Admin kart araması", "flashcards", "#cardSearch", "#flashcardTable"]
  ];
  const adminResults = [];
  for (const [name, page, inputSelector, resultRootSelector] of adminCases) {
    await evaluate(`document.querySelector(${JSON.stringify(`.admin-nav-item[data-page="${page}"]`)})?.click()`);
    await waitFor(`document.querySelector(${JSON.stringify(`.admin-section[data-page="${page}"].active`)})`);
    adminResults.push(await exerciseSearchControl({
      name,
      inputSelector,
      resultRootSelector,
      resultItemSelector: "tr:not(:has(.empty-state))",
      allowEmptyDefault: true
    }));
    const themeResult = await themeStyles(inputSelector, "admin-dark", { fixedContext: true });
    assertThemeVisuals(name, themeResult);
    adminThemeResults.push({ name, result: themeResult });
  }

  for (const [width, height] of RESPONSIVE_VIEWPORTS) {
    await setViewport(width, height, width < 768);
    await assertResponsiveFit("#globalSearch", "Admin global arama", width, "admin-dark");
    for (const [name, page, inputSelector] of adminCases) {
      await evaluate(`document.querySelector(${JSON.stringify(`.admin-nav-item[data-page="${page}"]`)})?.click()`);
      await waitFor(`document.querySelector(${JSON.stringify(`.admin-section[data-page="${page}"].active`)})`);
      await assertResponsiveFit(inputSelector, name, width, "admin-dark");
    }
    if (width === 390) await screenshot("admin-dark-mobile.png");
  }

  const ignoredExternalIssues = runtimeIssues.filter((issue) => (
    issue.includes("@firebase/firestore")
    && issue.includes("Could not reach Cloud Firestore backend")
  ));
  const applicationRuntimeIssues = runtimeIssues.filter((issue) => !ignoredExternalIssues.includes(issue));
  const testedSelectors = [
    ...mainCases.map((testCase) => testCase.inputSelector),
    "#launcherSearchInput",
    "#launcherEditorAppFilter",
    "#launcherEditorWidgetFilter",
    "#globalSearch",
    ...adminCases.map((testCase) => testCase[2])
  ].sort();
  const testedDefinitions = testedSelectors.length;
  assert.equal(
    definitionAudit.count,
    testedDefinitions,
    `Kaynakta ${definitionAudit.count} arama alanı var ancak test ${testedDefinitions} alanı kapsıyor: ${definitionAudit.files.join(", ")}`
  );
  assert.deepEqual(
    definitionAudit.selectors,
    testedSelectors,
    "Kaynakta keşfedilen arama alanları ile test edilen alan kimlikleri eşleşmiyor"
  );
  assert.deepEqual(
    definitionAudit.unidentifiedDefinitions,
    [],
    `data-clearable-search taşıyan fakat id'si olmayan alanlar var: ${definitionAudit.unidentifiedDefinitions.join(", ")}`
  );
  assert.deepEqual(
    definitionAudit.unmarkedSearchCandidates,
    [],
    `Temizleme bileşenine bağlanmamış olası arama alanları var: ${definitionAudit.unmarkedSearchCandidates.join(", ")}`
  );
  assert.deepEqual(local404s, [], `Yerel 404 bulundu: ${local404s.join(", ")}`);
  assert.deepEqual(applicationRuntimeIssues, [], `Uygulama konsol/runtime hatası bulundu:\n${applicationRuntimeIssues.join("\n")}`);

  expectVisual(searchCssAudit.nativeCancel.selectorPresent, "CSS: özel X kullanılan search inputlar için WebKit native cancel seçicisi eksik");
  expectVisual(searchCssAudit.nativeCancel.hidden, "CSS: WebKit native search cancel butonu display:none ile gizlenmiyor");
  expectVisual(searchCssAudit.nativeCancel.appearanceRemoved, "CSS: WebKit native search cancel appearance kaldırılmıyor");
  for (const state of searchCssAudit.autofill.states) {
    expectVisual(state.present, `CSS: zorunlu autofill durumu eksik: ${state.selector}`);
  }
  expectVisual(searchCssAudit.autofill.textColorControlled, "CSS: autofill metin rengi -webkit-text-fill-color ile kontrol edilmiyor");
  expectVisual(searchCssAudit.autofill.caretControlled, "CSS: autofill caret rengi kontrol edilmiyor");
  expectVisual(searchCssAudit.autofill.backgroundControlled, "CSS: autofill arka planı kontrol edilmiyor");
  const uniqueVisualIssues = [...new Set(visualIssues)];

  console.log(JSON.stringify({
    checkedDefinitions: testedDefinitions,
    discoveredDefinitions: definitionAudit.count,
    checkedSelectors: testedSelectors,
    definitionFiles: definitionAudit.files,
    unmarkedSearchCandidates: definitionAudit.unmarkedSearchCandidates.length,
    mainSearches: mainResults.length,
    mainThemeChecks: mainThemeResults.length * 2,
    launcherSearches: [launcherResult, editorAppsResult, editorWidgetsResult].length,
    launcherThemeChecks: 6,
    adminSearches: adminResults.length + 1,
    adminThemeContexts: adminThemeResults.length,
    presetThemeChecks: presetThemeResults.length * THEME_PREFERENCES.length,
    responsiveViewports: RESPONSIVE_VIEWPORTS.map(([width, height]) => `${width}x${height}`),
    responsiveMainThemes: THEME_PREFERENCES,
    searchCssAudit,
    visualIssueCount: uniqueVisualIssues.length,
    visualIssues: uniqueVisualIssues,
    applicationRuntimeIssues: applicationRuntimeIssues.length,
    ignoredExternalOfflineWarnings: ignoredExternalIssues.length,
    local404s: local404s.length
  }, null, 2));
  if (uniqueVisualIssues.length) {
    throw new Error(`Arama bileşeni görsel/tema denetimi başarısız (${uniqueVisualIssues.length} bulgu).`);
  }
} finally {
  socket?.close();
  const exited = new Promise((resolveExit) => browserProcess.once("exit", resolveExit));
  browserProcess.kill();
  await Promise.race([exited, delay(2000)]);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      break;
    } catch (error) {
      if (error?.code !== "EBUSY" || attempt === 5) throw error;
      await delay(250);
    }
  }
  await new Promise((resolveClose) => server.close(resolveClose));
}
