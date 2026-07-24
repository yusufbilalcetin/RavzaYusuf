import { DIRECTIONS } from "./engine.js";
import { DEFAULT_LINE_WIDTH, pointsOf } from "./geometry.js";

export function segmentLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function calculatePolylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += segmentLength(points[index - 1], points[index]);
  return total;
}

export function buildCumulativeLengths(points) {
  let distance = 0;
  return points.map((point, index) => {
    if (index > 0) distance += segmentLength(points[index - 1], point);
    return { point: { ...point }, distance };
  });
}

export function getPointAtDistance(points, targetDistance) {
  const cumulative = buildCumulativeLengths(points);
  const total = cumulative.at(-1)?.distance || 0;
  const distance = Math.max(0, Math.min(total, targetDistance));
  for (let index = 1; index < cumulative.length; index += 1) {
    if (distance > cumulative[index].distance) continue;
    const previous = cumulative[index - 1];
    const current = cumulative[index];
    const segmentDistance = current.distance - previous.distance;
    const t = segmentDistance === 0 ? 0 : (distance - previous.distance) / segmentDistance;
    const x = previous.point.x + (current.point.x - previous.point.x) * t;
    const y = previous.point.y + (current.point.y - previous.point.y) * t;
    const dx = current.point.x - previous.point.x;
    const dy = current.point.y - previous.point.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x, y, tangent: { x: dx / length, y: dy / length }, distance };
  }
  const last = cumulative.at(-1)?.point || { x: 0, y: 0 };
  return { ...last, tangent: { x: 1, y: 0 }, distance };
}

export function slicePolylineByDistance(points, fromDistance, toDistance) {
  const cumulative = buildCumulativeLengths(points);
  const total = cumulative.at(-1)?.distance || 0;
  const from = Math.max(0, Math.min(total, fromDistance));
  const to = Math.max(from, Math.min(total, toDistance));
  const result = [getPointAtDistance(points, from)];
  cumulative.forEach((entry) => {
    if (entry.distance > from && entry.distance < to) result.push({ ...entry.point, distance: entry.distance });
  });
  result.push(getPointAtDistance(points, to));
  return result.filter((point, index, array) => index === 0 || point.x !== array[index - 1].x || point.y !== array[index - 1].y);
}

export function createExitExtension(piece, board, safetyMargin = 1) {
  const points = pointsOf(piece);
  const head = points.at(-1);
  const originalLength = calculatePolylineLength(points);
  const direction = DIRECTIONS[piece.exitDir];
  const distanceToOutside = direction.dr < 0 ? head.y + (piece.lineWidth || DEFAULT_LINE_WIDTH)
    : direction.dr > 0 ? board.rows - head.y + (piece.lineWidth || DEFAULT_LINE_WIDTH)
      : direction.dc < 0 ? head.x + (piece.lineWidth || DEFAULT_LINE_WIDTH)
        : board.cols - head.x + (piece.lineWidth || DEFAULT_LINE_WIDTH);
  const length = distanceToOutside + originalLength + safetyMargin;
  return { x: head.x + direction.dc * length, y: head.y + direction.dr * length };
}

export function buildCombinedRoute(piece, board) {
  const original = pointsOf(piece);
  const extension = createExitExtension(piece, board);
  return {
    points: [...original, extension],
    originalLength: calculatePolylineLength(original),
    totalLength: calculatePolylineLength([...original, extension]),
    exitExtension: extension
  };
}

export function getAnimatedArrowPath(piece, board, progressDistance) {
  const route = buildCombinedRoute(piece, board);
  const tailDistance = Math.max(0, Math.min(route.totalLength - route.originalLength, progressDistance));
  const headDistance = tailDistance + route.originalLength;
  const visible = slicePolylineByDistance(route.points, tailDistance, headDistance);
  const head = getPointAtDistance(route.points, headDistance);
  const tail = getPointAtDistance(route.points, tailDistance);
  return { ...route, visible, head, tail, tailDistance, headDistance };
}
