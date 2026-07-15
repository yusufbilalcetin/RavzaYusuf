export const ASSET_AUDIT_CONFIG = Object.freeze({
  sourceEntries: Object.freeze([
    "index.html",
    "admin.html",
    "games",
    "assets",
    "css",
    "js",
    "data",
    "partials",
    "content",
    "manifest.json",
    "site.webmanifest",
    "vercel.json"
  ]),
  textExtensions: Object.freeze([".html", ".htm", ".css", ".js", ".mjs", ".jsx", ".json", ".webmanifest"]),
  imageExtensions: Object.freeze([".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg", ".gif"]),
  audioExtensions: Object.freeze([".mp3", ".wav", ".ogg", ".m4a", ".aac"]),
  ignoredDirectoryNames: Object.freeze(["node_modules", ".git", ".cache", "test-artifacts"]),
  thresholds: Object.freeze({
    gameIcon: 300 * 1024,
    logo: 500 * 1024,
    image: 1024 * 1024,
    hero: 1536 * 1024,
    audio: 2 * 1024 * 1024,
    javascript: 500 * 1024,
    css: 300 * 1024
  }),
  criticalGamePreloads: Object.freeze([
    "assets/icons/games/candy-crush.png",
    "assets/icons/games/meyve-eslestirme.png",
    "assets/icons/games/flappy-bird.png",
    "assets/icons/games/boyama.png"
  ]),
  routeAuditPort: 8787,
  routeWaitMs: 900,
  reportJson: "test-artifacts/asset-audit-report.json",
  reportMarkdown: "test-artifacts/asset-audit-report.md"
});

export function fileLimit(relativePath) {
  const value = relativePath.toLowerCase();
  if (value.startsWith("assets/icons/games/") && !value.includes("/source/")) return ["Oyun ikonu", ASSET_AUDIT_CONFIG.thresholds.gameIcon];
  if (/(^|\/)(logo|logos|branding)(\/|[-_.])/.test(value)) return ["Logo", ASSET_AUDIT_CONFIG.thresholds.logo];
  if (/\.(mp3|wav|ogg|m4a|aac)$/.test(value)) return ["Ses", ASSET_AUDIT_CONFIG.thresholds.audio];
  if (/\.js$/.test(value) && !value.includes("/dist/") && !value.includes("/vendor/")) return ["JavaScript", ASSET_AUDIT_CONFIG.thresholds.javascript];
  if (/\.css$/.test(value) && !value.includes("/dist/")) return ["CSS", ASSET_AUDIT_CONFIG.thresholds.css];
  if (/\.(png|jpe?g|webp|avif|svg|gif)$/.test(value)) {
    if (value.includes("ana-sayfa") || value.includes("hero")) return ["Hero görseli", ASSET_AUDIT_CONFIG.thresholds.hero];
    return ["Görsel", ASSET_AUDIT_CONFIG.thresholds.image];
  }
  return null;
}
