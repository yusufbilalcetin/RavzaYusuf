import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
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
const STYLES = ["noel-ask", "gece-mavisi", "orman-yesili", "mor-isik", "klasik-koyu", "pembe-tema"];
const MODE_CASES = [
  { name: "light", mode: "light", system: "dark", resolved: "light" },
  { name: "dark", mode: "dark", system: "light", resolved: "dark" },
  { name: "system-light", mode: "system", system: "light", resolved: "light" },
  { name: "system-dark", mode: "system", system: "dark", resolved: "dark" },
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

const MAIN_ROUTES = [
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
].map((entry) => ({ ...entry, kind: "main", path: `/?page=${entry.route}`, scopeRoot: entry.root }));

const EMBEDDED_GAMES = [
  { name: "Candy Crush", gameId: "candy-match", kind: "iframe" },
  { name: "Meyve Eslestirme", gameId: "fruit-match", kind: "iframe" },
  { name: "Flappy Bird", gameId: "flappy-bird", kind: "main-game" },
  { name: "Boyama", gameId: "boyama", kind: "main-game" },
  { name: "Renk Siralama", gameId: "renk-siralama", kind: "main-game" },
  { name: "Sudoku", gameId: "sudoku", kind: "main-game" },
].map((entry) => ({
  ...entry,
  route: "oyun",
  root: "#games",
  ready: "[data-game-catalog]",
  path: `/?page=oyun&game=${entry.gameId}`,
  scopeRoot: entry.kind === "iframe" ? "body" : "#gameStage",
}));

const STANDALONE_GAMES = [
  { name: "Cark Oyunu", path: "/games/cark-oyunu/", ready: ".wheel-app" },
  { name: "Alan Bulmacasi", path: "/games/alan-bulmacasi/", ready: ".game-shell" },
  { name: "Ok Bulmacasi", path: "/games/ok-bulmacasi/", ready: "#screenHome" },
].map((entry) => ({ ...entry, kind: "standalone", scopeRoot: "body" }));

const TOKEN_PAIRS = [
  { name: "primary/base", foreground: "--text-primary", background: "--bg-base", threshold: 4.5 },
  { name: "secondary/base", foreground: "--text-secondary", background: "--bg-base", threshold: 4.5 },
  { name: "muted/base", foreground: "--text-muted", background: "--bg-base", threshold: 4.5 },
  { name: "primary/surface", foreground: "--text-primary", background: "--bg-surface", threshold: 4.5 },
  { name: "secondary/surface", foreground: "--text-secondary", background: "--bg-surface", threshold: 4.5 },
  { name: "on-accent/accent", foreground: "--text-on-accent", background: "--accent", threshold: 4.5 },
  { name: "search-text/search-bg", foreground: "--search-text", background: "--search-bg", threshold: 4.5 },
  { name: "search-placeholder/search-bg", foreground: "--search-placeholder", background: "--search-bg", threshold: 4.5 },
  { name: "search-clear-icon/search-clear-bg", foreground: "--search-clear-icon", background: "--search-clear-bg", threshold: 3 },
  { name: "border-strong/base", foreground: "--border-strong", background: "--bg-base", threshold: 3, kind: "ui" },
  { name: "focus-ring/base", foreground: "--focus-ring", background: "--bg-base", threshold: 3, kind: "ui" },
  { name: "success", foreground: "--success-fg", background: "--success-bg", threshold: 4.5 },
  { name: "warning", foreground: "--warning-fg", background: "--warning-bg", threshold: 4.5 },
  { name: "error", foreground: "--error-fg", background: "--error-bg", threshold: 4.5 },
  { name: "exam", foreground: "--exam-fg", background: "--exam-bg", threshold: 4.5 },
];

function routeReadyExpression(definition) {
  if (definition.kind === "standalone") {
    return `Boolean(document.querySelector(${JSON.stringify(definition.ready)}))`;
  }
  const base = `(() => {
    const root = document.querySelector(${JSON.stringify(definition.root)});
    return Boolean(globalThis.__APP_STARTUP_STATE__?.completed
      && document.body?.dataset.currentRoute === ${JSON.stringify(definition.route)}
      && root?.classList.contains("active")
      && document.querySelector(${JSON.stringify(definition.ready)}));
  })()`;
  if (definition.kind === "iframe") {
    return `(${base}) && (() => {
      const frame = document.querySelector("#gameStageBody iframe");
      return frame?.contentDocument?.readyState === "complete";
    })()`;
  }
  if (definition.kind === "main-game") {
    return `(${base}) && (() => {
      const stage = document.getElementById("gameStage");
      const body = document.getElementById("gameStageBody");
      return Boolean(stage && !stage.hidden && body?.children.length);
    })()`;
  }
  return base;
}

function parseColor(value) {
  if (!value || value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const srgb = String(value).match(/color\(srgb\s+([\d.]+)%?\s+([\d.]+)%?\s+([\d.]+)%?(?:\s*\/\s*([\d.]+)%?)?\s*\)/i);
  if (srgb) {
    const percentages = String(value).includes("%");
    const scale = percentages ? 2.55 : 255;
    const alphaScale = srgb[4] != null && String(srgb[0]).slice(String(srgb[0]).lastIndexOf("/")).includes("%") ? 100 : 1;
    return {
      r: Number(srgb[1]) * scale,
      g: Number(srgb[2]) * scale,
      b: Number(srgb[3]) * scale,
      a: srgb[4] == null ? 1 : Number(srgb[4]) / alphaScale,
    };
  }
  const rgb = String(value).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)/i);
  if (rgb) {
    const alpha = rgb[4] == null ? 1 : Number(rgb[4]) / (String(rgb[0]).includes("%") && Number(rgb[4]) > 1 ? 100 : 1);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: Math.max(0, Math.min(1, alpha)) };
  }
  const hex = String(value).match(/^#([\da-f]{3,8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length <= 4 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }
  return null;
}

function over(foreground, background) {
  const outputAlpha = foreground.a + background.a * (1 - foreground.a);
  if (outputAlpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / outputAlpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / outputAlpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / outputAlpha,
    a: outputAlpha,
  };
}

function channelLuminance(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  return 0.2126 * channelLuminance(color.r) + 0.7152 * channelLuminance(color.g) + 0.0722 * channelLuminance(color.b);
}

function contrastRatio(first, second) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function formatColor(color) {
  if (!color) return null;
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${Math.round(color.a * 1000) / 1000})`;
}

function screenshotPixel(image, x, y) {
  const safeX = Math.max(0, Math.min(image.info.width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(image.info.height - 1, Math.round(y)));
  const offset = (safeY * image.info.width + safeX) * image.info.channels;
  return {
    r: image.data[offset],
    g: image.data[offset + 1],
    b: image.data[offset + 2],
    a: image.info.channels >= 4 ? image.data[offset + 3] / 255 : 1,
  };
}

function colorDistance(first, second) {
  return Math.sqrt((first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.b - second.b) ** 2);
}

function bestGlyphPixel(rendered, background, rect) {
  const left = Math.max(0, Math.floor(rect.left));
  const top = Math.max(0, Math.floor(rect.top));
  const right = Math.min(rendered.info.width - 1, Math.ceil(rect.right));
  const bottom = Math.min(rendered.info.height - 1, Math.ceil(rect.bottom));
  const stepX = Math.max(1, Math.floor((right - left) / 70));
  const stepY = Math.max(1, Math.floor((bottom - top) / 36));
  let best = null;
  for (let y = top; y <= bottom; y += stepY) {
    for (let x = left; x <= right; x += stepX) {
      const renderedPixel = screenshotPixel(rendered, x, y);
      const backgroundPixel = screenshotPixel(background, x, y);
      const difference = colorDistance(renderedPixel, backgroundPixel);
      if (!best || difference > best.difference) {
        best = { x, y, rendered: renderedPixel, background: backgroundPixel, difference };
      }
    }
  }
  if (best) return best;
  const x = (left + right) / 2;
  const y = (top + bottom) / 2;
  return { x, y, rendered: screenshotPixel(rendered, x, y), background: screenshotPixel(background, x, y), difference: 0 };
}

function scopeDocumentExpression(definition) {
  if (definition.kind === "iframe") {
    return `document.querySelector("#gameStageBody iframe")?.contentDocument`;
  }
  return "document";
}

function scopeOffsetExpression(definition) {
  if (definition.kind === "iframe") {
    return `(() => {
      const rect = document.querySelector("#gameStageBody iframe")?.getBoundingClientRect();
      return rect ? { x: rect.left, y: rect.top } : { x: 0, y: 0 };
    })()`;
  }
  return "({ x: 0, y: 0 })";
}

function candidateProbeExpression(definition) {
  return `(() => {
    const scopeDocument = ${scopeDocumentExpression(definition)};
    const scopeWindow = scopeDocument?.defaultView;
    const offset = ${scopeOffsetExpression(definition)};
    const root = scopeDocument?.querySelector(${JSON.stringify(definition.scopeRoot)});
    if (!scopeDocument || !scopeWindow || !root) return { error: "scope-missing", candidates: [] };

    const parse = (value) => {
      if (!value || value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
      const srgb = value.match(/color\\(srgb\\s+([\\d.]+)%?\\s+([\\d.]+)%?\\s+([\\d.]+)%?(?:\\s*\\/\\s*([\\d.]+)%?)?\\s*\\)/i);
      if (srgb) {
        const scale = value.includes("%") ? 2.55 : 255;
        const alphaPercent = srgb[4] != null && srgb[0].slice(srgb[0].lastIndexOf("/")).includes("%");
        return { r: +srgb[1] * scale, g: +srgb[2] * scale, b: +srgb[3] * scale, a: srgb[4] == null ? 1 : +srgb[4] / (alphaPercent ? 100 : 1) };
      }
      const match = value.match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.]+))?\\s*\\)/i);
      return match ? { r: +match[1], g: +match[2], b: +match[3], a: match[4] == null ? 1 : +match[4] } : null;
    };
    const over = (foreground, background) => {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (!alpha) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
        a: alpha,
      };
    };
    const format = (color) => color
      ? "rgba(" + Math.round(color.r) + ", " + Math.round(color.g) + ", " + Math.round(color.b) + ", " + (Math.round(color.a * 1000) / 1000) + ")"
      : null;
    const rendered = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= scopeWindow.innerHeight || rect.left >= scopeWindow.innerWidth) return false;
      for (let current = element; current; current = current.parentElement) {
        const style = scopeWindow.getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= .001 || current.hidden || current.inert) return false;
      }
      return !element.closest('[aria-hidden="true"], .sr-only, [hidden]');
    };
    const selector = (element) => {
      if (element.id) return "#" + CSS.escape(element.id);
      const parts = [];
      let current = element;
      while (current && current !== root && parts.length < 5) {
        let part = current.localName;
        const stableClasses = [...current.classList].filter((name) => !/^(?:active|open|show|visible|selected|is-)/.test(name)).slice(0, 2);
        if (stableClasses.length) part += stableClasses.map((name) => "." + CSS.escape(name)).join("");
        const siblings = current.parentElement ? [...current.parentElement.children].filter((node) => node.localName === current.localName) : [];
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const effectiveBackground = (element) => {
      let composite = { r: 0, g: 0, b: 0, a: 0 };
      let hasImage = false;
      const layers = [];
      for (let current = element; current; current = current.parentElement) {
        const style = scopeWindow.getComputedStyle(current);
        const color = parse(style.backgroundColor);
        if (style.backgroundImage && style.backgroundImage !== "none") hasImage = true;
        if (color?.a) {
          composite = over(composite, color);
          layers.push({ selector: selector(current), color: style.backgroundColor, opacity: style.opacity });
        }
      }
      const fallback = scopeDocument.documentElement.dataset.resolvedTheme === "dark"
        ? { r: 15, g: 17, b: 23, a: 1 }
        : { r: 255, g: 255, b: 255, a: 1 };
      composite = over(composite, fallback);
      return { color: format(composite), hasImage, layers };
    };
    const directText = (element) => [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
      .map((node) => node.textContent.trim())
      .join(" ")
      .replace(/\\s+/g, " ")
      .slice(0, 100);
    const directRect = (element) => {
      const node = [...element.childNodes].find((entry) => entry.nodeType === Node.TEXT_NODE && entry.textContent.trim());
      if (node) {
        const range = scopeDocument.createRange();
        range.selectNodeContents(node);
        const rectangles = [...range.getClientRects()].filter((rect) => rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.top < scopeWindow.innerHeight);
        if (rectangles.length) {
          const rect = rectangles[0];
          return { left: rect.left + offset.x, top: rect.top + offset.y, right: rect.right + offset.x, bottom: rect.bottom + offset.y };
        }
      }
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left + offset.x + Math.min(12, rect.width / 4),
        top: rect.top + offset.y + Math.min(8, rect.height / 4),
        right: rect.right + offset.x - Math.min(12, rect.width / 4),
        bottom: rect.bottom + offset.y - Math.min(8, rect.height / 4),
      };
    };

    const candidates = [];
    const elements = [root, ...root.querySelectorAll("*")].slice(0, 5000);
    for (const element of elements) {
      if (!(element instanceof scopeWindow.HTMLElement) || !rendered(element)) continue;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "OPTION"].includes(element.tagName)) continue;
      let text = directText(element);
      let style = scopeWindow.getComputedStyle(element);
      let source = "text";
      if (/^(INPUT|TEXTAREA)$/.test(element.tagName)) {
        text = String(element.value || element.placeholder || "").trim().slice(0, 100);
        if (!element.value && element.placeholder) {
          style = scopeWindow.getComputedStyle(element, "::placeholder");
          source = "placeholder";
        } else source = "input-value";
      }
      if (!text) continue;
      const rect = directRect(element);
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight || rect.right - rect.left <= 1 || rect.bottom - rect.top <= 1) continue;
      let opacity = 1;
      for (let current = element; current; current = current.parentElement) opacity *= Number(scopeWindow.getComputedStyle(current).opacity || 1);
      const fill = style.webkitTextFillColor && style.webkitTextFillColor !== "transparent" ? style.webkitTextFillColor : style.color;
      const weight = Number.parseInt(style.fontWeight, 10) || (style.fontWeight === "bold" ? 700 : 400);
      const fontSize = Number.parseFloat(style.fontSize) || 16;
      const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
      const background = effectiveBackground(element);
      candidates.push({
        key: selector(element) + "|" + source + "|" + text,
        selector: selector(element),
        tag: element.localName,
        source,
        text,
        rect,
        foreground: fill,
        opacity,
        fontSize,
        fontWeight: weight,
        large,
        threshold: large ? 3 : 4.5,
        disabled: element.matches(":disabled, [aria-disabled=true], .disabled, .is-disabled") || Boolean(element.closest(":disabled, [aria-disabled=true], .disabled, .is-disabled")),
        background,
        backgroundClip: style.backgroundClip || style.webkitBackgroundClip || "",
        mixBlendMode: style.mixBlendMode,
      });
      if (candidates.length >= 650) break;
    }
    return { candidates, scrollY: scopeWindow.scrollY, scrollHeight: scopeDocument.scrollingElement?.scrollHeight || 0 };
  })()`;
}

async function captureRaw(browser) {
  const capture = await browser.command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  return sharp(Buffer.from(capture.data, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function installAuditStyle(browser, definition, hidden) {
  const styleId = hidden ? "ravza-contrast-hide-text" : "ravza-contrast-freeze";
  const css = hidden
    ? `*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; } input::placeholder, textarea::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; }`
    : `*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; }`;
  await browser.evaluate(`(() => {
    const scopeDocument = ${scopeDocumentExpression(definition)};
    if (!scopeDocument) return false;
    let style = scopeDocument.getElementById(${JSON.stringify(styleId)});
    if (!style) {
      style = scopeDocument.createElement("style");
      style.id = ${JSON.stringify(styleId)};
      scopeDocument.head.append(style);
    }
    style.textContent = ${JSON.stringify(css)};
    return true;
  })()`);
}

async function removeAuditStyles(browser, definition) {
  await browser.evaluate(`(() => {
    const scopeDocument = ${scopeDocumentExpression(definition)};
    scopeDocument?.getElementById("ravza-contrast-hide-text")?.remove();
    scopeDocument?.getElementById("ravza-contrast-freeze")?.remove();
    return true;
  })()`).catch(() => {});
}

function analyzeCandidates(candidates, renderedScreenshot, backgroundScreenshot, context) {
  return candidates.map((candidate) => {
    const glyph = bestGlyphPixel(renderedScreenshot, backgroundScreenshot, candidate.rect);
    const sampledBackground = { ...glyph.background, a: 1 };
    const parsedForeground = parseColor(candidate.foreground);
    let foregroundSource = "computed-style";
    let effectiveForeground = null;
    if (parsedForeground) {
      const alphaForeground = { ...parsedForeground, a: parsedForeground.a * candidate.opacity };
      effectiveForeground = over(alphaForeground, sampledBackground);
    }
    if (!effectiveForeground || (parsedForeground.a === 0 && glyph.difference > 3) || candidate.backgroundClip.includes("text") || candidate.mixBlendMode !== "normal") {
      effectiveForeground = { ...glyph.rendered, a: 1 };
      foregroundSource = "browser-pixel";
    }
    const ratio = contrastRatio(effectiveForeground, sampledBackground);
    const exempt = candidate.disabled;
    return {
      kind: "text",
      ...context,
      selector: candidate.selector,
      tag: candidate.tag,
      source: candidate.source,
      text: candidate.text,
      foregroundComputed: candidate.foreground,
      foregroundEffective: formatColor(effectiveForeground),
      foregroundSource,
      opacity: candidate.opacity,
      backgroundComposited: candidate.background.color,
      backgroundSampled: formatColor(sampledBackground),
      backgroundSource: candidate.background.hasImage ? "browser-pixel-image-or-gradient" : "browser-pixel-solid-or-alpha",
      backgroundLayers: candidate.background.layers,
      glyphPixelDifference: Math.round(glyph.difference * 100) / 100,
      samplePoint: { x: glyph.x, y: glyph.y },
      fontSize: candidate.fontSize,
      fontWeight: candidate.fontWeight,
      largeText: candidate.large,
      ratio: Math.round(ratio * 100) / 100,
      threshold: candidate.threshold,
      status: exempt ? "EXEMPT_DISABLED" : ratio + 0.005 >= candidate.threshold ? "PASS" : "FAIL",
    };
  });
}

async function scrollScope(browser, definition, fraction) {
  await browser.evaluate(`(() => {
    const scopeDocument = ${scopeDocumentExpression(definition)};
    const scopeWindow = scopeDocument?.defaultView;
    const scrolling = scopeDocument?.scrollingElement;
    if (!scopeWindow || !scrolling) return false;
    const maximum = Math.max(0, scrolling.scrollHeight - scopeWindow.innerHeight);
    scopeWindow.scrollTo({ top: maximum * ${JSON.stringify(fraction)}, left: 0, behavior: "instant" });
    return true;
  })()`);
  await delay(160);
}

async function scanVisibleText(browser, definition, context) {
  const fractions = FULL ? [0, 0.33, 0.66, 1] : [0, 1];
  const records = [];
  const seen = new Set();
  // Route reveal transitions finish before the screenshots are frozen. Freezing
  // an in-flight opacity transition would otherwise audit a synthetic mid-frame.
  await delay(750);
  await installAuditStyle(browser, definition, false);
  try {
    for (const fraction of fractions) {
      await scrollScope(browser, definition, fraction);
      const probe = await browser.evaluate(candidateProbeExpression(definition));
      assert.equal(probe?.error, undefined, `${definition.name}: ${probe?.error || "contrast scope missing"}`);
      const candidates = probe.candidates.filter((candidate) => {
        const key = `${candidate.key}|${Math.round((candidate.rect.top + probe.scrollY) / 8)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!candidates.length) continue;
      const renderedScreenshot = await captureRaw(browser);
      await installAuditStyle(browser, definition, true);
      await delay(40);
      const backgroundScreenshot = await captureRaw(browser);
      await browser.evaluate(`(${scopeDocumentExpression(definition)})?.getElementById("ravza-contrast-hide-text")?.remove(); true`);
      records.push(...analyzeCandidates(candidates, renderedScreenshot, backgroundScreenshot, {
        ...context,
        scrollFraction: fraction,
      }));
    }
  } finally {
    await removeAuditStyles(browser, definition);
  }
  return records;
}

async function resolveTokenPairs(browser, context) {
  const values = await browser.evaluate(`(() => {
    const pairs = ${JSON.stringify(TOKEN_PAIRS)};
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden";
    document.body.append(host);
    const output = pairs.map((pair) => {
      const probe = document.createElement("span");
      probe.style.color = "var(" + pair.foreground + ")";
      probe.style.backgroundColor = "var(" + pair.background + ")";
      host.append(probe);
      const style = getComputedStyle(probe);
      const value = { ...pair, foregroundComputed: style.color, backgroundComputed: style.backgroundColor };
      probe.remove();
      return value;
    });
    host.remove();
    return output;
  })()`);
  return values.map((pair) => {
    const foreground = parseColor(pair.foregroundComputed);
    const background = parseColor(pair.backgroundComputed);
    const fallback = context.resolvedMode === "dark"
      ? { r: 15, g: 17, b: 23, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 };
    const effectiveBackground = background ? over(background, fallback) : null;
    const effectiveForeground = foreground && effectiveBackground ? over(foreground, effectiveBackground) : null;
    const ratio = effectiveForeground && effectiveBackground ? contrastRatio(effectiveForeground, effectiveBackground) : 0;
    return {
      kind: pair.kind || "token-text",
      ...context,
      tokenPair: pair.name,
      foregroundToken: pair.foreground,
      backgroundToken: pair.background,
      foregroundComputed: pair.foregroundComputed,
      backgroundComputed: pair.backgroundComputed,
      foregroundEffective: formatColor(effectiveForeground),
      backgroundComposited: formatColor(effectiveBackground),
      ratio: Math.round(ratio * 100) / 100,
      threshold: pair.threshold,
      status: ratio + 0.005 >= pair.threshold ? "PASS" : "FAIL",
    };
  });
}

async function seedAndOpen(browser, definition, modeCase, style, viewport) {
  await browser.setViewport(viewport);
  await browser.emulateColorScheme(modeCase.system);
  await browser.seedTheme(modeCase.mode, style);
  const label = `${definition.name}/${modeCase.name}/${style}/${viewport.name}`;
  browser.clearDiagnostics(label);
  await browser.navigate(definition.path, routeReadyExpression(definition), 30000);
  if (definition.kind === "iframe") {
    await browser.waitFor(`(() => {
      const root = document.querySelector("#gameStageBody iframe")?.contentDocument?.documentElement;
      return root?.dataset.themeMode === ${JSON.stringify(modeCase.mode)}
        && root?.dataset.resolvedTheme === ${JSON.stringify(modeCase.resolved)}
        && root?.dataset.themeStyle === ${JSON.stringify(style)};
    })()`, `${label} iframe theme`, 10000);
  } else {
    await browser.waitFor(`document.documentElement.dataset.themeMode === ${JSON.stringify(modeCase.mode)}
      && document.documentElement.dataset.resolvedTheme === ${JSON.stringify(modeCase.resolved)}
      && document.documentElement.dataset.themeStyle === ${JSON.stringify(style)}`, `${label} document theme`, 10000);
  }
  return label;
}

async function applyMainTheme(browser, modeCase, style) {
  await browser.emulateColorScheme(modeCase.system);
  await browser.evaluate(`(() => {
    globalThis.__RAVZA_THEME__.setMode(${JSON.stringify(modeCase.mode)}, { reason: "contrast-audit" });
    globalThis.__RAVZA_THEME__.setStyle(${JSON.stringify(style)}, { reason: "contrast-audit" });
    return true;
  })()`);
  await browser.waitFor(`globalThis.__RAVZA_THEME__?.getState?.().mode === ${JSON.stringify(modeCase.mode)}
    && globalThis.__RAVZA_THEME__?.getState?.().resolvedMode === ${JSON.stringify(modeCase.resolved)}
    && globalThis.__RAVZA_THEME__?.getState?.().style === ${JSON.stringify(style)}`, `${modeCase.name}/${style} theme apply`);
}

function quickVisualMatrix() {
  const routes = MAIN_ROUTES.filter((definition) => definition.critical);
  return routes.map((definition, index) => ({
    definition,
    modeCase: MODE_CASES[index % MODE_CASES.length],
    style: STYLES[index % STYLES.length],
    viewport: VIEWPORTS[index % VIEWPORTS.length],
  }));
}

function fullVisualMatrix() {
  const applications = [...MAIN_ROUTES, ...EMBEDDED_GAMES, ...STANDALONE_GAMES];
  return applications.flatMap((definition) => MODE_CASES.flatMap((modeCase) => STYLES.flatMap((style) => (
    VIEWPORTS.map((viewport) => ({ definition, modeCase, style, viewport }))
  ))));
}

const cases = [];
const checks = [];
let browser = null;
let server = null;
const startedAt = Date.now();

async function runCase(group, name, task) {
  const caseStartedAt = Date.now();
  const checkStart = checks.length;
  try {
    const details = await task();
    const ownChecks = checks.slice(checkStart);
    const failures = ownChecks.filter((entry) => entry.status === "FAIL");
    const status = failures.length ? "FAIL" : "PASS";
    cases.push({ group, name, status, durationMs: Date.now() - caseStartedAt, checks: ownChecks.length, failures: failures.length, details });
    const writer = status === "PASS" ? process.stdout : process.stderr;
    writer.write(`${status.padEnd(5)} ${group} / ${name} (${ownChecks.length} checks, ${failures.length} failures)\n`);
  } catch (error) {
    cases.push({ group, name, status: "ERROR", durationMs: Date.now() - caseStartedAt, checks: checks.length - checkStart, error: error.stack || error.message || String(error), diagnostics: browser?.diagnostics?.() || null });
    process.stderr.write(`ERROR ${group} / ${name}: ${error.message}\n`);
  }
}

async function tokenMatrixAudit() {
  const home = MAIN_ROUTES[0];
  await seedAndOpen(browser, home, MODE_CASES[0], STYLES[0], VIEWPORTS[0]);
  const matrix = [];
  for (const style of STYLES) {
    for (const modeCase of [MODE_CASES[0], MODE_CASES[1]]) {
      await applyMainTheme(browser, modeCase, style);
      const entries = await resolveTokenPairs(browser, {
        application: home.name,
        mode: modeCase.mode,
        resolvedMode: modeCase.resolved,
        style,
        viewport: VIEWPORTS[0].name,
      });
      checks.push(...entries);
      matrix.push({ style, mode: modeCase.mode, checks: entries.length, failures: entries.filter((entry) => entry.status === "FAIL").length });
    }
  }
  return { matrix };
}

async function panelAudit(modeCase, viewport) {
  const home = MAIN_ROUTES[0];
  await seedAndOpen(browser, home, modeCase, "noel-ask", viewport);
  await browser.evaluate("globalThis.__RAVZA_THEME__.openPanel(document.getElementById('topbar-theme-btn')); true");
  await browser.waitFor("document.getElementById('theme-sheet')?.classList.contains('open')", "theme panel open");
  const entries = await scanVisibleText(browser, { ...home, scopeRoot: "#theme-sheet" }, {
    application: "Tema Paneli",
    mode: modeCase.mode,
    resolvedMode: modeCase.resolved,
    style: "noel-ask",
    viewport: viewport.name,
  });
  checks.push(...entries);
  assertCleanDiagnostics(browser.diagnostics(), `theme panel ${modeCase.name}/${viewport.name}`, { allowWarnings: true });
  return { entries: entries.length };
}

try {
  server = await ensureTestServer();
  browser = await ThemeTestBrowser.launch("theme-contrast");

  await runCase("tokens", "6 presets x light/dark semantic pairs", tokenMatrixAudit);

  const visualMatrix = QUICK ? quickVisualMatrix() : fullVisualMatrix();
  for (const { definition, modeCase, style, viewport } of visualMatrix) {
    const name = `${definition.name}/${modeCase.name}/${style}/${viewport.name}`;
    await runCase("rendered", name, async () => {
      await seedAndOpen(browser, definition, modeCase, style, viewport);
      const entries = await scanVisibleText(browser, definition, {
        application: definition.name,
        mode: modeCase.mode,
        resolvedMode: modeCase.resolved,
        style,
        viewport: viewport.name,
      });
      assert.ok(entries.length > 0, `${name}: no visible text candidates`);
      checks.push(...entries);
      const diagnostics = browser.diagnostics();
      assertCleanDiagnostics(diagnostics, name, { allowWarnings: true });
      return { entries: entries.length, warnings: diagnostics.consoleWarnings };
    });
  }

  await runCase("panel", "light/desktop", () => panelAudit(MODE_CASES[0], VIEWPORTS[0]));
  await runCase("panel", "dark/mobile", () => panelAudit(MODE_CASES[1], VIEWPORTS.find((entry) => entry.width === 390) || VIEWPORTS.at(-1)));
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
}

const failures = checks.filter((entry) => entry.status === "FAIL");
const report = {
  generatedAt: new Date().toISOString(),
  profile: FULL ? "full" : "quick",
  methodology: {
    text: "Computed foreground color and cumulative opacity are alpha-composited over a browser screenshot sampled with text hidden. CSS background layers are independently composited and reported for traceability.",
    imageBackgrounds: "Image, gradient, translucent and backdrop-filter surfaces use the browser-rendered background pixel at the strongest glyph sample point.",
    thresholds: "WCAG AA: 4.5:1 normal text, 3:1 large text and non-text UI tokens. Disabled text is recorded as exempt.",
  },
  baseUrl: BASE_URL,
  durationMs: Date.now() - startedAt,
  summary: {
    cases: cases.length,
    passedCases: cases.filter((entry) => entry.status === "PASS").length,
    failedCases: cases.filter((entry) => entry.status === "FAIL").length,
    errorCases: cases.filter((entry) => entry.status === "ERROR").length,
    checks: checks.length,
    passedChecks: checks.filter((entry) => entry.status === "PASS").length,
    failedChecks: failures.length,
    exemptChecks: checks.filter((entry) => entry.status.startsWith("EXEMPT")).length,
  },
  matrix: {
    applications: FULL ? [...MAIN_ROUTES, ...EMBEDDED_GAMES, ...STANDALONE_GAMES].map((entry) => entry.name) : MAIN_ROUTES.filter((entry) => entry.critical).map((entry) => entry.name),
    modes: MODE_CASES.map((entry) => entry.name),
    styles: STYLES,
    viewports: VIEWPORTS,
  },
  cases,
  failures,
  checks,
};

function markdownEscape(value) {
  return String(value ?? "-").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function markdownReport(data) {
  const failureRows = data.failures.map((entry) => `| ${markdownEscape(entry.application)} | ${markdownEscape(entry.mode)}/${markdownEscape(entry.style)} | ${markdownEscape(entry.viewport)} | ${markdownEscape(entry.tokenPair || entry.selector)} | ${markdownEscape(entry.text || entry.kind)} | ${entry.ratio} | ${entry.threshold} | ${markdownEscape(entry.foregroundComputed)} | ${markdownEscape(entry.backgroundSampled || entry.backgroundComposited)} |`);
  const errorRows = data.cases.filter((entry) => entry.status === "ERROR").map((entry) => `| ${markdownEscape(entry.group)} | ${markdownEscape(entry.name)} | ${markdownEscape(entry.error?.split("\n")[0])} |`);
  return [
    "# Theme Contrast Audit",
    "",
    `- Profile: ${data.profile}`,
    `- Cases: ${data.summary.cases}`,
    `- Checks: ${data.summary.checks}`,
    `- PASS: ${data.summary.passedChecks}`,
    `- FAIL: ${data.summary.failedChecks}`,
    `- Exempt disabled: ${data.summary.exemptChecks}`,
    `- Case errors: ${data.summary.errorCases}`,
    `- Duration: ${data.durationMs} ms`,
    "",
    "## Contrast failures",
    "",
    "| Application | Theme | Viewport | Token / selector | Text / kind | Ratio | Required | Computed foreground | Actual/composited background |",
    "| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |",
    ...(failureRows.length ? failureRows : ["| - | - | - | - | No failures | - | - | - | - |"]),
    "",
    "## Execution errors",
    "",
    "| Group | Case | Error |",
    "| --- | --- | --- |",
    ...(errorRows.length ? errorRows : ["| - | - | None |"]),
    "",
    "Every PASS/FAIL/EXEMPT measurement, background layer and sample point is available in `theme-contrast-report.json`.",
    "",
  ].join("\n");
}

await mkdir(ARTIFACT_DIR, { recursive: true });
await Promise.all([
  writeFile(join(ARTIFACT_DIR, "theme-contrast-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(join(ARTIFACT_DIR, "theme-contrast-report.md"), markdownReport(report), "utf8"),
]);

process.stdout.write(`\nTheme contrast: ${report.summary.passedChecks}/${report.summary.checks} PASS; ${report.summary.failedChecks} FAIL; ${report.summary.errorCases} errors (${report.durationMs} ms)\n`);
process.stdout.write(`Report: ${join(ARTIFACT_DIR, "theme-contrast-report.json")}\n`);
if (report.summary.failedChecks || report.summary.errorCases) process.exitCode = 1;
