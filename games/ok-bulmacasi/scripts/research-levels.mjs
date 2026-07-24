import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const researchRoot = fileURLToPath(new URL("../../../research/", import.meta.url));
const analysis = JSON.parse(readFileSync(`${researchRoot}/arrows-levels-1-150.json`, "utf8"));
const targets = JSON.parse(readFileSync(`${researchRoot}/arrows-original-design-targets.json`, "utf8"));
const ranges = JSON.parse(readFileSync(`${researchRoot}/arrows-level-ranges-summary.json`, "utf8"));
const report = readFileSync(`${researchRoot}/arrows-levels-1-150.md`, "utf8");
const allowedConfidence = new Set(["high", "medium", "low"]);
const allowedHosts = new Set(["arrowspuzzleguide.com", "www.youtube.com", "youtube.com", "play.google.com", "apps.apple.com", "lessmore.games"]);

assert.equal(analysis.levels.length, 150, "150 arastirma kaydi bulunmali");
assert.equal(new Set(analysis.levels.map(({ level }) => level)).size, 150, "Level numaralari tekrar etmemeli");
analysis.levels.forEach((entry, index) => {
  assert.equal(entry.level, index + 1, "Level numaralari 1-150 sirali olmali");
  assert.ok(allowedConfidence.has(entry.confidence), "Confidence gecersiz");
  assert.ok(Array.isArray(entry.sourceUrls) && entry.sourceUrls.length > 0, "Her level kaynak alani tasimali");
  entry.sourceUrls.forEach((url) => assert.ok(allowedHosts.has(new URL(url).hostname), `Bilinmeyen kaynak hostu: ${url}`));
  if (!entry.videoEvidence.initialFrameVerified) {
    assert.equal(entry.videoEvidence.timestamp, null, "Dogrulanmamis kareye zaman damgasi yazilmamali");
    assert.equal(entry.density, "unknown", "Dogrulanmamis gorsel yogunluk uydurulmamali");
  }
});
assert.equal(targets.targets.length, 150, "150 ozgun hedef bulunmali");
targets.targets.forEach((target, index) => {
  assert.equal(target.inspiredLevelNumber, index + 1);
  assert.match(target.seed, /^ok-original-\d{3}$/);
  assert.ok(target.targetArrowCount.min <= target.targetArrowCount.preferred && target.targetArrowCount.preferred <= target.targetArrowCount.max);
  assert.ok(target.originalityConstraints.length >= 5);
});
assert.equal(ranges.ranges.length, 9, "9 aralik ozeti bulunmali");
assert.equal((report.match(/^### Bölüm \d+$/gm) || []).length, 150, "Markdown 150 ayri baslik icermeli");

const confidence = analysis.levels.reduce((counts, entry) => ({ ...counts, [entry.confidence]: (counts[entry.confidence] || 0) + 1 }), {});
console.log(JSON.stringify({ levels: 150, targets: 150, ranges: 9, verifiedInitialFrames: analysis.metadata.verifiedInitialFrames, confidence }, null, 2));
