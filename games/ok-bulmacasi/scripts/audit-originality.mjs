import { LEVELS } from "../js/levels.js";
import { fingerprintSimilarity, levelFingerprint } from "./level-generator.mjs";

const fingerprints = LEVELS.map(levelFingerprint);
let highestSimilarity = 0;
let closestPair = null;
let excessivePairs = 0;
const occupancyKeys = new Set();
let duplicateOccupancy = 0;

fingerprints.forEach((fingerprint, index) => {
  const occupancyKey = [...fingerprint.occupancy].sort().join("|");
  if (occupancyKeys.has(occupancyKey)) duplicateOccupancy += 1;
  occupancyKeys.add(occupancyKey);
  for (let other = 0; other < index; other += 1) {
    const similarity = fingerprintSimilarity(fingerprint, fingerprints[other]);
    if (similarity > highestSimilarity) { highestSimilarity = similarity; closestPair = [other + 1, index + 1]; }
    if (similarity >= 0.965) excessivePairs += 1;
  }
});

const report = {
  levels: LEVELS.length,
  comparedPairs: LEVELS.length * (LEVELS.length - 1) / 2,
  highestSimilarity,
  closestPair,
  excessivePairs,
  duplicateOccupancy,
  referenceComparison: "skipped: verified reference occupancy data is unavailable"
};
console.log(JSON.stringify(report, null, 2));
if (excessivePairs || duplicateOccupancy) process.exitCode = 1;
