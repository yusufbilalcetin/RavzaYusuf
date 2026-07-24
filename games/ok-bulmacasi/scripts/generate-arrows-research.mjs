import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../../../research/", import.meta.url));
mkdirSync(output, { recursive: true });

const STORE = "https://apps.apple.com/us/app/arrows-puzzle-escape/id6748397500";
const PLAY = "https://play.google.com/store/apps/details?id=com.ecffri.arrows";
const OFFICIAL = "https://lessmore.games/";
const GUIDE = "https://arrowspuzzleguide.com/levels/";
const PLAYLIST = "https://www.youtube.com/playlist?list=PLd8d9HPTAXv6rWbiyW9LFlyV0lbSVd21z";
const UNKNOWN = "unknown";

function band(level) {
  if (level <= 10) return { difficulty: "tutorial", density: "very-low", arrows: [3, 10], layout: ["straight-corridors", "nested-L"] };
  if (level <= 30) return { difficulty: "easy", density: "low", arrows: [10, 22], layout: ["nested-L", "nested-U", "horizontal-layers"] };
  if (level <= 60) return { difficulty: "medium", density: "medium", arrows: [22, 38], layout: ["compact-block", "dense-center", "zigzag-network"] };
  if (level <= 100) return { difficulty: "hard", density: "high", arrows: [35, 55], layout: ["irregular-maze", "nested-U", "main-and-lower-group"] };
  return { difficulty: level <= 130 ? "very-hard" : "expert", density: "very-high", arrows: [50, 75], layout: ["irregular-maze", "dense-center", "outside-layers", "main-and-lower-group"] };
}

function targetCount(level, [min, max]) {
  const local = level <= 10 ? (level - 1) / 9 : level <= 30 ? (level - 11) / 19 : level <= 60 ? (level - 31) / 29 : level <= 100 ? (level - 61) / 39 : (level - 101) / 49;
  return Math.round(min + (max - min) * local);
}

const levels = Array.from({ length: 150 }, (_, index) => {
  const level = index + 1;
  const guideUrl = `${GUIDE}${level}`;
  return {
    level,
    sourceUrls: [guideUrl, PLAYLIST],
    sourceDate: "2026-07-18",
    confidence: "low",
    estimatedArrowCount: { min: null, max: null, bestEstimate: null, status: UNKNOWN },
    difficulty: level <= 50 ? "easy" : "medium",
    density: UNKNOWN,
    overallShape: UNKNOWN,
    groupCount: UNKNOWN,
    layoutType: [],
    hasMainUpperGroup: UNKNOWN,
    hasLowerHorizontalGroup: UNKNOWN,
    directionBalance: { up: UNKNOWN, down: UNKNOWN, left: UNKNOWN, right: UNKNOWN },
    arrowShapeDistribution: { straight: UNKNOWN, L: UNKNOWN, U: UNKNOWN, zigzag: UNKNOWN, longMultiTurn: UNKNOWN },
    segmentLengthDistribution: { short: UNKNOWN, medium: UNKNOWN, long: UNKNOWN },
    averageTurnsPerArrow: UNKNOWN,
    parallelCorridors: UNKNOWN,
    nesting: UNKNOWN,
    isolatedArrowRatio: UNKNOWN,
    largeEmptyAreas: UNKNOWN,
    safeFirstMoveEstimate: UNKNOWN,
    dependencyDepth: UNKNOWN,
    solutionStyle: UNKNOWN,
    visualDescription: `Bölüm ${level} başlangıç karesi doğrulanabilir çözünürlükte incelenemedi; görsel geometri alanları bilinçli olarak doldurulmadı.`,
    difficultyReason: "Rehber sayfası seviye bağlantısı sağlıyor ancak başlangıç geometrisini doğrulayacak veri sağlamıyor.",
    distinctiveFeatures: [],
    originalLevelDesignRecommendation: `Referans siluetini kullanmadan, özgün seed arrows-original-${String(level).padStart(3, "0")} ile kademe hedeflerine uygun yeni geometri üret.`,
    videoEvidence: { videoUrl: PLAYLIST, timestamp: null, initialFrameVerified: false }
  };
});

const targets = levels.map(({ level }) => {
  const profile = band(level);
  const preferred = targetCount(level, profile.arrows);
  return {
    inspiredLevelNumber: level,
    seed: `ok-original-${String(level).padStart(3, "0")}`,
    generatorVersion: 11,
    targetArrowCount: { min: profile.arrows[0], max: profile.arrows[1], preferred },
    targetDensity: profile.density,
    targetGroupCount: level > 60 && level % 3 === 0 ? 2 : 1,
    targetLayoutFamilies: profile.layout.slice(0, 2 + (level % 2)),
    targetDifficulty: profile.difficulty,
    targetTurnsPerArrow: { min: level <= 10 ? 0.5 : level <= 30 ? 1 : 1.8, max: level <= 30 ? 2.5 : 3.8 },
    targetDirectionDistribution: { up: 0.25, down: 0.25, left: 0.25, right: 0.25 },
    requiredFeatures: level > 30 ? ["low-isolation", "balanced-directions", "short-medium-segments"] : ["clear-safe-start"],
    forbiddenFeatures: ["reference-silhouette", "reference-solution-order", "matching-normalized-coordinates"],
    originalityConstraints: [
      "Do not reuse the reference silhouette",
      "Do not reuse the same solution order",
      "Do not reuse matching normalized coordinates",
      "Do not reproduce the same occupancy bitmap",
      "Do not reproduce the same dependency graph"
    ]
  };
});

const ranges = [[1, 10], [11, 30], [31, 50], [51, 70], [71, 80], [81, 100], [101, 120], [121, 130], [131, 150]].map(([first, last]) => {
  const rangeTargets = targets.slice(first - 1, last);
  return {
    range: `${first}-${last}`,
    evidenceConfidence: "low",
    verifiedReferenceAverageArrowCount: UNKNOWN,
    verifiedReferenceDensity: UNKNOWN,
    targetAverageArrowCount: +(rangeTargets.reduce((sum, item) => sum + item.targetArrowCount.preferred, 0) / rangeTargets.length).toFixed(2),
    dominantTargetLayouts: [...new Set(rangeTargets.flatMap((item) => item.targetLayoutFamilies))],
    targetAverageGroupCount: +(rangeTargets.reduce((sum, item) => sum + item.targetGroupCount, 0) / rangeTargets.length).toFixed(2),
    segmentBalance: first <= 10 ? "medium-dominant" : "short-and-medium-dominant",
    nesting: first <= 10 ? "low" : first <= 50 ? "medium" : "high",
    parallelCorridors: first <= 10 ? "low" : first <= 50 ? "medium" : "high",
    safeFirstMoveTrend: first <= 30 ? "multiple-valid-starts" : "fewer-safe-starts",
    progressionNote: "Bu değerler doğrulanmış referans ölçümü değil, özgün generator hedefidir."
  };
});

const markdown = [
  "# Arrows – Puzzle Escape, Bölüm 1–150 Araştırma Raporu",
  "",
  "> Araştırma tarihi: 18 Temmuz 2026. Walkthrough başlangıç kareleri doğrulanamadığı için görsel alanlar uydurulmamış ve `unknown` bırakılmıştır.",
  ""
];
levels.forEach((entry) => markdown.push(
  `### Bölüm ${entry.level}`, "",
  "- Tahmini ok sayısı: unknown (başlangıç karesi doğrulanamadı)",
  `- Yoğunluk: ${entry.density}`,
  `- Genel şekil: ${entry.overallShape}`,
  `- Grup sayısı: ${entry.groupCount}`,
  "- Baskın ok şekilleri: unknown",
  "- Baskın yönler: unknown",
  `- Paralel koridor seviyesi: ${entry.parallelCorridors}`,
  `- İç içelik seviyesi: ${entry.nesting}`,
  `- Çözüm yapısı: ${entry.solutionStyle}`,
  `- Zorluk nedeni: ${entry.difficultyReason}`,
  "- Dikkat çeken tasarım özelliği: Başlangıç görüntüsü doğrulanamadığı için belirtilmedi.",
  `- Özgün uygulama önerisi: ${entry.originalLevelDesignRecommendation}`,
  `- Kaynak: ${entry.sourceUrls.join(" · ")}`,
  `- Güven seviyesi: ${entry.confidence}`, ""
));

const sources = `# Arrows araştırma kaynakları\n\nAraştırma tarihi: 18 Temmuz 2026\n\n| Kaynak | Kapsam | Tarih | Güvenilirlik | Not |\n|---|---|---|---|---|\n| [Google Play](${PLAY}) | Oyun/genel | erişim: 2026-07-18 | yüksek | Resmî mağaza; arama indeksinde içerik sınırlıydı. |\n| [App Store](${STORE}) | Oyun/genel | © 2025, erişim: 2026-07-18 | yüksek | Lessmore GmbH, kategori ve uygulama bilgisi doğrulandı. |\n| [Lessmore](${OFFICIAL}) | Oyun/genel | erişim: 2026-07-18 | yüksek | Resmî geliştirici açıklaması. |\n| [Arrows Puzzle Guide](${GUIDE}) | 1–150 sayfa dizini | güncel tarama: 2026-07-18 | orta/düşük | Her level için sayfa var; metinler geometri ölçümü için yeterli değil. |\n| [YouTube playlist](${PLAYLIST}) | 1–150 walkthrough iddiası | tarih doğrulanamadı | düşük | Arama aracı başlangıç kareleri ve zaman damgalarını doğrulayamadı. |\n\n## Zaman damgaları\n\nDoğrulanmış bölüm başlangıç zaman damgası: **0/150**. Uydurma zaman damgası eklenmedi.\n`;

writeFileSync(`${output}/arrows-levels-1-150.json`, `${JSON.stringify({ metadata: { researchedAt: "2026-07-18", levels: 150, verifiedInitialFrames: 0, limitation: "Walkthrough initial frames were not accessible to the research tool." }, levels }, null, 2)}\n`);
writeFileSync(`${output}/arrows-levels-1-150.md`, `${markdown.join("\n")}\n`);
writeFileSync(`${output}/arrows-level-ranges-summary.json`, `${JSON.stringify({ metadata: { confidence: "low" }, ranges }, null, 2)}\n`);
writeFileSync(`${output}/arrows-original-design-targets.json`, `${JSON.stringify({ generatorVersion: 11, targets }, null, 2)}\n`);
writeFileSync(`${output}/arrows-sources.md`, sources);
console.log("Arrows araştırma paketi üretildi: 150 düşük güvenli kaynak kaydı ve 150 özgün tasarım hedefi.");
