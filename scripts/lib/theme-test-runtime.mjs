import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BASE_URL = (process.env.RAVZA_TEST_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const BROWSER_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function executableExists(candidate) {
  return candidate && existsSync(candidate);
}

function addUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

async function healthIsReady() {
  try {
    const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureTestServer() {
  if (await healthIsReady()) return { owned: false, close: async () => {} };

  const target = new URL(BASE_URL);
  assert.ok(
    ["127.0.0.1", "localhost"].includes(target.hostname),
    `${BASE_URL} yanit vermiyor. Uzak test adresi icin sunucuyu once kendiniz baslatin.`,
  );
  const server = spawn(process.execPath, [resolve(ROOT, "server.mjs")], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: target.hostname === "localhost" ? "127.0.0.1" : target.hostname,
      PORT: target.port || "80",
    },
    stdio: "ignore",
    windowsHide: true,
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await healthIsReady()) {
      return {
        owned: true,
        close: async () => {
          if (!server.killed) server.kill();
          await Promise.race([
            new Promise((resolveExit) => server.once("exit", resolveExit)),
            delay(1500),
          ]);
        },
      };
    }
    if (server.exitCode !== null) break;
    await delay(100);
  }

  if (!server.killed) server.kill();
  throw new Error(`${BASE_URL}/health test sunucusu baslatilamadi.`);
}

function availablePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function findBrowserPath() {
  return BROWSER_PATHS.find(executableExists);
}

export class ThemeTestBrowser {
  static async launch(label = "theme-test") {
    const browserPath = findBrowserPath();
    assert.ok(browserPath, "Chrome veya Edge bulunamadi. CHROME_PATH ile tarayici yolunu belirleyin.");
    assert.equal(typeof WebSocket, "function", "Bu test Node.js WebSocket destegi gerektirir.");

    const debugPort = await availablePort();
    const profile = resolve(tmpdir(), `ravza-${label}-${process.pid}-${Date.now()}`);
    assert.ok(profile.startsWith(`${resolve(tmpdir())}${sep}`), "Gecici tarayici profili guvenli dizinde degil.");
    const processHandle = spawn(browserPath, [
      "--headless=new",
      "--enable-gpu-rasterization",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: "ignore", windowsHide: true });

    let target = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
        target = targets.find((entry) => entry.type === "page") || null;
        if (target) break;
      } catch {
        // Chromium debug endpoint is still starting.
      }
      if (processHandle.exitCode !== null) break;
      await delay(100);
    }
    if (!target) {
      if (!processHandle.killed) processHandle.kill();
      await rm(profile, { recursive: true, force: true });
      throw new Error("Chromium debug hedefi acilamadi.");
    }

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", rejectOpen, { once: true });
    });

    const instance = new ThemeTestBrowser({ processHandle, profile, socket });
    await Promise.all([
      instance.command("Page.enable"),
      instance.command("Runtime.enable"),
      instance.command("Network.enable"),
      instance.command("Log.enable"),
    ]);
    await instance.command("Page.setLifecycleEventsEnabled", { enabled: true });
    return instance;
  }

  constructor({ processHandle, profile, socket }) {
    this.processHandle = processHandle;
    this.profile = profile;
    this.socket = socket;
    this.commandId = 0;
    this.pending = new Map();
    this.requests = new Map();
    this.activeCase = "startup";
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.localNetworkErrors = [];
    this.lifecycle = [];

    socket.addEventListener("message", (event) => this.#handleMessage(JSON.parse(event.data)));
  }

  #handleMessage(message) {
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      addUnique(this.consoleErrors, details.exception?.description || details.text || "JavaScript exception");
    }
    if (message.method === "Runtime.consoleAPICalled") {
      const output = message.params.args
        .map((entry) => entry.value ?? entry.unserializableValue ?? entry.description ?? "")
        .join(" ")
        .trim();
      if (message.params.type === "error") addUnique(this.consoleErrors, output);
      if (message.params.type === "warning") addUnique(this.consoleWarnings, output);
    }
    if (message.method === "Log.entryAdded") {
      const entry = message.params.entry;
      if (entry.level === "error") addUnique(this.consoleErrors, entry.text);
      if (entry.level === "warning") addUnique(this.consoleWarnings, entry.text);
    }
    if (message.method === "Network.requestWillBeSent") {
      this.requests.set(message.params.requestId, message.params.request.url);
    }
    if (message.method === "Network.responseReceived") {
      const { response } = message.params;
      if (this.#isLocalUrl(response.url) && response.status >= 400) {
        addUnique(this.localNetworkErrors, `${response.status} ${response.url}`);
      }
    }
    if (message.method === "Network.loadingFailed" && !message.params.canceled) {
      const url = this.requests.get(message.params.requestId) || "unknown request";
      if (this.#isLocalUrl(url) && message.params.errorText !== "net::ERR_ABORTED") {
        addUnique(this.localNetworkErrors, `${message.params.errorText}: ${url}`);
      }
    }
    if (message.method === "Page.lifecycleEvent") {
      this.lifecycle.push({ name: message.params.name, timestamp: message.params.timestamp });
    }

    if (!message.id || !this.pending.has(message.id)) return;
    const handlers = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) handlers.reject(new Error(`${this.activeCase}: ${message.error.message}`));
    else handlers.resolve(message.result);
  }

  #isLocalUrl(value) {
    try {
      return new URL(value).origin === new URL(BASE_URL).origin;
    } catch {
      return false;
    }
  }

  command(method, params = {}) {
    const id = ++this.commandId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
    });
  }

  async evaluate(expression, options = {}) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const result = await this.command("Runtime.evaluate", {
          expression,
          awaitPromise: options.awaitPromise !== false,
          returnByValue: options.returnByValue !== false,
          userGesture: options.userGesture === true,
        });
        if (result.exceptionDetails) {
          throw new Error(
            result.exceptionDetails.exception?.description
              || result.exceptionDetails.text
              || "Browser evaluation failed",
          );
        }
        return options.returnByValue === false ? result.result : result.result.value;
      } catch (error) {
        const changedContext = /context|navigat|Cannot find|Execution was destroyed/i.test(error.message);
        if (attempt === 5 || !changedContext) throw error;
        await delay(100);
      }
    }
    return undefined;
  }

  async waitFor(expression, label, timeout = 20000) {
    const startedAt = Date.now();
    let lastValue = null;
    while (Date.now() - startedAt < timeout) {
      lastValue = await this.evaluate(expression).catch(() => null);
      if (lastValue) return { elapsedMs: Date.now() - startedAt, value: lastValue };
      await delay(100);
    }
    throw new Error(`${label}: timeout. Last value: ${JSON.stringify(lastValue)}`);
  }

  clearDiagnostics(label) {
    this.activeCase = label;
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.localNetworkErrors = [];
    this.lifecycle = [];
    this.requests.clear();
  }

  diagnostics() {
    return {
      consoleErrors: [...this.consoleErrors],
      consoleWarnings: [...this.consoleWarnings],
      localNetworkErrors: [...this.localNetworkErrors],
      lifecycle: [...this.lifecycle],
    };
  }

  async setViewport(viewport) {
    await this.command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor || 1,
      mobile: viewport.mobile ?? viewport.width <= 768,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
  }

  async emulateColorScheme(scheme) {
    assert.ok(["light", "dark"].includes(scheme), `Unsupported color scheme: ${scheme}`);
    await this.command("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-color-scheme", value: scheme }],
    });
  }

  async addNewDocumentScript(source) {
    return this.command("Page.addScriptToEvaluateOnNewDocument", { source });
  }

  async navigate(pathOrUrl, readyExpression = "document.readyState === 'complete'", timeout = 25000) {
    const url = /^https?:/i.test(pathOrUrl) ? pathOrUrl : `${BASE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
    await this.command("Page.navigate", { url });
    await this.waitFor("document.readyState === 'complete'", `${url} document`, timeout);
    if (readyExpression) await this.waitFor(readyExpression, `${url} ready`, timeout);
    return url;
  }

  async reload(readyExpression = "document.readyState === 'complete'", timeout = 25000) {
    const previousOrigin = await this.evaluate("performance.timeOrigin").catch(() => null);
    await this.command("Page.reload", { ignoreCache: true });
    if (Number.isFinite(previousOrigin)) {
      await this.waitFor(`performance.timeOrigin !== ${JSON.stringify(previousOrigin)}`, "reload navigation", timeout);
    }
    await this.waitFor("document.readyState === 'complete'", "reload document", timeout);
    if (readyExpression) await this.waitFor(readyExpression, "reload ready", timeout);
  }

  async seedTheme(mode, style = "noel-ask") {
    await this.navigate("/health", "document.readyState === 'complete'");
    await this.evaluate(`(() => {
      const mode = ${JSON.stringify(mode)};
      const style = ${JSON.stringify(style)};
      if (mode == null) localStorage.removeItem("eul_theme");
      else localStorage.setItem("eul_theme", mode);
      if (style == null) localStorage.removeItem("eul_theme_style");
      else localStorage.setItem("eul_theme_style", style);
      localStorage.removeItem("theme");
      localStorage.removeItem("darkMode");
      return true;
    })()`);
    // Chromium may request /favicon.ico just after the JSON health document has
    // completed. Let that diagnostic settle before the caller starts a new case.
    await delay(250);
  }

  async elementCenter(selector) {
    const center = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 1 || rect.height <= 1 || style.display === "none" || style.visibility === "hidden") return null;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    assert.ok(center, `${selector} gorunur durumda bulunamadi.`);
    return center;
  }

  async click(selector, options = {}) {
    const point = await this.elementCenter(selector);
    const clickCount = options.clickCount || 1;
    await this.command("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x,
      y: point.y,
      button: "none",
    });
    await this.command("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount,
    });
    if (options.holdMs) await delay(options.holdMs);
    await this.command("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount,
    });
    return point;
  }

  async doubleClick(selector) {
    await this.click(selector, { clickCount: 1 });
    await delay(70);
    await this.click(selector, { clickCount: 2 });
  }

  async focus(selector) {
    const focused = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.focus({ preventScroll: true });
      return document.activeElement === element;
    })()`);
    assert.equal(focused, true, `${selector} focus alamadi.`);
  }

  async key(key, options = {}) {
    const table = {
      Enter: { code: "Enter", windowsVirtualKeyCode: 13 },
      " ": { code: "Space", windowsVirtualKeyCode: 32 },
      Escape: { code: "Escape", windowsVirtualKeyCode: 27 },
      ArrowDown: { code: "ArrowDown", windowsVirtualKeyCode: 40 },
      Tab: { code: "Tab", windowsVirtualKeyCode: 9 },
    };
    const definition = table[key] || { code: key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) };
    const modifiers = options.shift ? 8 : 0;
    const shared = {
      key,
      code: definition.code,
      windowsVirtualKeyCode: definition.windowsVirtualKeyCode,
      nativeVirtualKeyCode: definition.windowsVirtualKeyCode,
      modifiers,
    };
    await this.command("Page.bringToFront");
    await this.command("Emulation.setFocusEmulationEnabled", { enabled: true });
    await this.command("Input.dispatchKeyEvent", { type: "rawKeyDown", ...shared });
    if (key === " " || key === "Enter") {
      const text = key === "Enter" ? "\r" : " ";
      await this.command("Input.dispatchKeyEvent", { type: "char", ...shared, text, unmodifiedText: text });
    }
    await this.command("Input.dispatchKeyEvent", { type: "keyUp", ...shared });
  }

  async close() {
    for (const handlers of this.pending.values()) handlers.reject(new Error("Browser closed"));
    this.pending.clear();
    try { this.socket.close(); } catch { /* already closed */ }
    if (!this.processHandle.killed) this.processHandle.kill();
    await Promise.race([
      new Promise((resolveExit) => this.processHandle.once("exit", resolveExit)),
      delay(1500),
    ]);
    await rm(this.profile, { recursive: true, force: true });
  }
}

export function assertCleanDiagnostics(diagnostics, label, options = {}) {
  assert.deepEqual(diagnostics.consoleErrors, [], `${label}: console errors: ${diagnostics.consoleErrors.join(" | ")}`);
  assert.deepEqual(diagnostics.localNetworkErrors, [], `${label}: local network errors: ${diagnostics.localNetworkErrors.join(" | ")}`);
  if (!options.allowWarnings) {
    assert.deepEqual(diagnostics.consoleWarnings, [], `${label}: console warnings: ${diagnostics.consoleWarnings.join(" | ")}`);
  }
}
