import { LEVELS } from "../js/levels.js";
import { auditLevels } from "../js/level-audit.js";

const audit = auditLevels(LEVELS);
const fatalTypes = new Set(["invalid-geometry", "direction-mismatch", "invalid-exit-route", "initial-arrow-overlap"]);
const fatal = audit.results.flatMap((result) => result.issues).filter((issue) => fatalTypes.has(issue.issueType));
const ranges = [[1, 10], [11, 30], [31, 60], [61, 100], [101, 150]];
const densityByRange = ranges.map(([first, last]) => {
  const rows = audit.results.slice(first - 1, last);
  const average = (key) => rows.reduce((sum, row) => sum + row.density[key], 0) / rows.length;
  return {
    range: `${first}-${last}`,
    averageArrows: LEVELS.slice(first - 1, last).reduce((sum, level) => sum + level.pieces.length, 0) / rows.length,
    viewportOccupancy: average("viewportOccupancy"), internalDensity: average("internalDensity"),
    nearestSegmentDistance: average("averageNearestArrowDistance"), parallelCorridorScore: average("parallelCorridorScore"),
    nestingScore: average("nestingScore"), isolatedArrowRatio: average("isolatedArrowRatio"),
    largeEmptyIslands: rows.reduce((sum, row) => sum + row.density.largeEmptyIslandCount, 0)
  };
});
process.stdout.write(`${JSON.stringify({ ...audit.summary, densityByRange }, null, 2)}\n`);
if (fatal.length) {
  process.stderr.write(`${JSON.stringify(fatal.slice(0, 20), null, 2)}\n`);
  process.exitCode = 1;
}
