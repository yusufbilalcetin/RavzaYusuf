import { getDirectionFromLastSegment } from "./arrow-render.js";
import { distanceToPiece, getSegments, pointToSegmentDistance, pointsOf } from "./geometry.js";
import { calculatePolylineLength } from "./polyline.js";
import { solveLevel } from "./engine.js";
import { validateLevel } from "./validation.js";

function nearestDistance(piece, others) {
  const points = pointsOf(piece);
  let nearest = Infinity;
  for (const other of others) {
    if (other.id === piece.id) continue;
    for (const point of points) nearest = Math.min(nearest, distanceToPiece(point, other));
    for (const point of pointsOf(other)) nearest = Math.min(nearest, distanceToPiece(point, piece));
  }
  return Number.isFinite(nearest) ? nearest : 0;
}

function segmentDistance(a, b) {
  const points = [
    { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 },
    { x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }
  ];
  return Math.min(
    pointToSegmentDistance(points[0], b), pointToSegmentDistance(points[1], b),
    pointToSegmentDistance(points[2], a), pointToSegmentDistance(points[3], a)
  );
}

function emptyIslandMetrics(segments, bounds, sample = 0.35) {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / sample));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / sample));
  const occupied = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
    const point = { x: bounds.minX + (col + 0.5) * sample, y: bounds.minY + (row + 0.5) * sample };
    if (segments.some((segment) => pointToSegmentDistance(point, segment) <= 0.24)) occupied[row * cols + col] = 1;
  }
  const filled = occupied.reduce((sum, value) => sum + value, 0);
  const visited = new Uint8Array(occupied.length);
  const islands = [];
  const emptyRegions = [];
  for (let start = 0; start < occupied.length; start += 1) {
    if (occupied[start] || visited[start]) continue;
    const queue = [start]; visited[start] = 1; let size = 0; let edge = false;
    while (queue.length) {
      const index = queue.pop(); size += 1;
      const row = Math.floor(index / cols); const col = index % cols;
      if (!row || !col || row === rows - 1 || col === cols - 1) edge = true;
      [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].forEach(([nr, nc]) => {
        const next = nr * cols + nc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !occupied[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
      });
    }
    emptyRegions.push(size);
    if (!edge) islands.push(size);
  }
  const centerCells = [];
  for (let row = Math.floor(rows * .3); row < Math.ceil(rows * .7); row += 1) for (let col = Math.floor(cols * .3); col < Math.ceil(cols * .7); col += 1) centerCells.push(occupied[row * cols + col]);
  return {
    sampledFill: filled / occupied.length,
    largeEmptyIslandCount: islands.filter((size) => size >= 8).length,
    largestEmptyRegionRatio: Math.max(0, ...emptyRegions) / occupied.length,
    centralVoidRatio: centerCells.filter((value) => !value).length / Math.max(1, centerCells.length)
  };
}

function clusterMetrics(level, threshold = 1.35) {
  const remaining = new Set(level.pieces.map((piece) => piece.id));
  const sizes = [];
  while (remaining.size) {
    const queue = [remaining.values().next().value]; remaining.delete(queue[0]); let size = 0;
    while (queue.length) {
      const id = queue.pop(); size += 1;
      const piece = level.pieces.find((item) => item.id === id);
      for (const otherId of [...remaining]) {
        const other = level.pieces.find((item) => item.id === otherId);
        if (nearestDistance(piece, [piece, other]) <= threshold) { remaining.delete(otherId); queue.push(otherId); }
      }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return { clusterCount: sizes.length, miniIslandCount: sizes.filter((size) => size <= 3).length, mainClusterRatio: (sizes[0] || 0) / Math.max(1, level.pieces.length) };
}

export function calculateDensityMetrics(level) {
  const allPoints = level.pieces.flatMap(pointsOf);
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const contentWidth = Math.max(0.001, maxX - minX);
  const contentHeight = Math.max(0.001, maxY - minY);
  const contentBoundsArea = contentWidth * contentHeight;
  const boardArea = level.rows * level.cols;
  const segments = level.pieces.flatMap((piece) => getSegments(pointsOf(piece)).map((segment) => ({ ...segment, pieceId: piece.id })));
  const totalSegmentLength = level.pieces.reduce((sum, piece) => sum + calculatePolylineLength(pointsOf(piece)), 0);
  const nearest = level.pieces.map((piece) => nearestDistance(piece, level.pieces));
  const averageNearestArrowDistance = nearest.reduce((sum, value) => sum + value, 0) / Math.max(1, nearest.length);
  let parallelPairs = 0; let nearPairs = 0;
  for (let left = 0; left < segments.length; left += 1) for (let right = left + 1; right < segments.length; right += 1) {
    const a = segments[left]; const b = segments[right];
    if (a.pieceId === b.pieceId) continue;
    const distance = segmentDistance(a, b);
    if (distance <= 1.45) nearPairs += 1;
    if (distance >= 0.55 && distance <= 1.45 && ((a.horizontal && b.horizontal) || (a.vertical && b.vertical))) parallelPairs += 1;
  }
  const turns = level.pieces.reduce((sum, piece) => sum + Math.max(0, pointsOf(piece).length - 2), 0);
  const lengths = segments.map((segment) => Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1));
  const raster = emptyIslandMetrics(segments, { minX, maxX, minY, maxY });
  const clusters = clusterMetrics(level);
  const compactness = Math.max(0, Math.min(1,
    raster.sampledFill * 1.4
    + (parallelPairs / Math.max(1, nearPairs)) * .28
    + Math.min(1, (turns / Math.max(1, level.pieces.length)) / 4) * .18
    + clusters.mainClusterRatio * .24
    - raster.largestEmptyRegionRatio * .42
    - raster.centralVoidRatio * .18
    - Math.min(1, clusters.miniIslandCount / 4) * .25
  ));
  return {
    boardArea,
    contentBoundsArea,
    contentUsage: contentBoundsArea / boardArea,
    lineDensity: totalSegmentLength / contentBoundsArea,
    internalDensity: raster.sampledFill,
    viewportOccupancy: (contentWidth / level.cols) * (contentHeight / level.rows),
    totalSegmentLength,
    averageNearestArrowDistance,
    isolatedArrowCount: nearest.filter((distance) => distance > 2.5).length,
    isolatedArrowRatio: nearest.filter((distance) => distance > 2.5).length / Math.max(1, nearest.length),
    largeEmptyIslandCount: raster.largeEmptyIslandCount,
    largestEmptyRegionRatio: raster.largestEmptyRegionRatio,
    centralVoidRatio: raster.centralVoidRatio,
    ...clusters,
    fragmentationScore: 1 - clusters.mainClusterRatio,
    groupCompactness: clusters.mainClusterRatio,
    visualCompactnessScore: compactness,
    parallelCorridorScore: parallelPairs / Math.max(1, nearPairs),
    nestingScore: turns / Math.max(1, level.pieces.length),
    turnCount: turns,
    cornersPerArea: turns / contentBoundsArea,
    averageSegmentsPerArrow: segments.length / Math.max(1, level.pieces.length),
    shortSegmentCount: lengths.filter((length) => length < 1.25).length,
    mediumSegmentCount: lengths.filter((length) => length >= 1.25 && length <= 2.75).length,
    longSegmentCount: lengths.filter((length) => length > 2.75).length,
    horizontalFill: contentWidth / level.cols,
    verticalFill: contentHeight / level.rows
  };
}

export function densityTargetsFor(levelId) {
  if (levelId <= 10) return { internalDensity: 0.055, parallelCorridorScore: 0, nestingScore: 0.45, isolatedArrowRatio: 1 };
  if (levelId <= 30) return { internalDensity: 0.16, parallelCorridorScore: 0.3, nestingScore: 1.25, isolatedArrowRatio: 0.18 };
  if (levelId <= 60) return { internalDensity: 0.22, parallelCorridorScore: 0.36, nestingScore: 2, isolatedArrowRatio: 0.1 };
  return { internalDensity: 0.2, parallelCorridorScore: 0.36, nestingScore: 2.1, isolatedArrowRatio: 0.08 };
}

export function meetsDensityTarget(level, density = calculateDensityMetrics(level)) {
  const target = densityTargetsFor(level.id);
  const intentionalSplit = level.id >= 61 && level.id % 6 === 0;
  return density.internalDensity >= target.internalDensity
    && density.parallelCorridorScore >= target.parallelCorridorScore
    && density.nestingScore >= target.nestingScore
    && density.isolatedArrowRatio <= target.isolatedArrowRatio
    && density.largeEmptyIslandCount <= Math.max(1, Math.floor(level.pieces.length / 35))
    && (level.id < 61 || density.visualCompactnessScore >= 0.38)
    && (level.id < 61 || density.mainClusterRatio >= (intentionalSplit ? 0.55 : 0.8))
    && (level.id < 61 || density.clusterCount <= (intentionalSplit ? 2 : 1))
    && (level.id < 101 || density.miniIslandCount <= 3)
    && (level.id < 101 || density.centralVoidRatio <= 0.86);
}

export function auditLevel(level) {
  const issues = [];
  const validation = validateLevel(level);
  validation.errors.forEach((message) => issues.push({ levelId: level.id, arrowId: null, issueType: "invalid-geometry", autoFixApplied: false, message }));
  level.pieces.forEach((piece) => {
    const points = pointsOf(piece);
    const expectedDirection = ["up", "right", "down", "left"][piece.exitDir];
    const actualDirection = getDirectionFromLastSegment(points);
    if (expectedDirection !== actualDirection) issues.push({ levelId: level.id, arrowId: piece.id, issueType: "direction-mismatch", expectedDirection, actualDirection, points, autoFixApplied: false, message: "Son segment çıkış yönüyle uyuşmuyor." });
    const last = points.at(-1);
    const previous = points.at(-2);
    if (last && previous && Math.hypot(last.x - previous.x, last.y - previous.y) < 0.22) issues.push({ levelId: level.id, arrowId: piece.id, issueType: "insufficient-final-segment", expectedDirection, actualDirection, points, autoFixApplied: false, message: "Son segment ok başı için kısa." });
  });
  const density = calculateDensityMetrics(level);
  const sparse = level.id > 10 && (density.contentUsage < 0.5 || density.averageNearestArrowDistance > 2.25 || density.isolatedArrowCount > Math.max(2, level.pieces.length * 0.12));
  if (sparse) issues.push({ levelId: level.id, arrowId: null, issueType: "sparse-layout", autoFixApplied: false, message: "Bölüm yoğunluk hedefinin altında." });
  if (!meetsDensityTarget(level, density)) issues.push({ levelId: level.id, arrowId: null, issueType: "visual-density", autoFixApplied: false, message: "Gorsel yogunluk hedefinin altinda." });
  const solver = solveLevel(level);
  if (!solver.solvable) issues.push({ levelId: level.id, arrowId: null, issueType: "invalid-exit-route", autoFixApplied: false, message: "Solver tam çözüm bulamadı." });
  return { levelId: level.id, issues, density, solver };
}

export function auditLevels(levels) {
  const results = levels.map(auditLevel);
  const issueCounts = {};
  results.flatMap((result) => result.issues).forEach((issue) => { issueCounts[issue.issueType] = (issueCounts[issue.issueType] || 0) + 1; });
  return {
    results,
    summary: {
      levels: levels.length,
      arrows: levels.reduce((sum, level) => sum + level.pieces.length, 0),
      issueCounts,
      directionMismatch: issueCounts["direction-mismatch"] || 0,
      reversedPoints: 0,
      manualFixes: 0,
      initialOverlaps: issueCounts["initial-arrow-overlap"] || 0,
      sparseLevels: issueCounts["sparse-layout"] || 0,
      visualSparseLevels: issueCounts["visual-density"] || 0,
      unsolvedLevels: issueCounts["invalid-exit-route"] || 0
    }
  };
}
