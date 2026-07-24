import { DEFAULT_LINE_WIDTH, getArrowBounds } from "./geometry.js";
import { calculatePolylineLength, slicePolylineByDistance } from "./polyline.js";

export function getDirectionFromLastSegment(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  let index = points.length - 1;
  while (index > 0 && points[index].x === points[index - 1].x && points[index].y === points[index - 1].y) index -= 1;
  if (index === 0) return null;
  const previous = points[index - 1];
  const tip = points[index];
  if (tip.y === previous.y) return tip.x > previous.x ? "right" : "left";
  if (tip.x === previous.x) return tip.y > previous.y ? "down" : "up";
  return null;
}

export function createArrowRenderGeometry({ visiblePath, lineWidth = DEFAULT_LINE_WIDTH, headScale = 1 }) {
  if (!Array.isArray(visiblePath) || visiblePath.length < 2) return null;
  const visibleLength = calculatePolylineLength(visiblePath);
  if (visibleLength <= 0) return null;
  const tipSample = slicePolylineByDistance(visiblePath, Math.max(0, visibleLength - Math.max(lineWidth, 0.001)), visibleLength);
  const previous = tipSample[0];
  const tip = tipSample.at(-1);
  const dx = tip.x - previous.x;
  const dy = tip.y - previous.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const tangent = { x: dx / magnitude, y: dy / magnitude };
  const normal = { x: -tangent.y, y: tangent.x };
  const headLength = lineWidth * 3.4 * headScale;
  const headHalfWidth = lineWidth * 1.72 * headScale;
  const overlap = lineWidth * 0.45;
  const baseCenter = { x: tip.x - tangent.x * headLength, y: tip.y - tangent.y * headLength };
  const headPolygon = [
    { x: tip.x, y: tip.y },
    { x: baseCenter.x + normal.x * headHalfWidth, y: baseCenter.y + normal.y * headHalfWidth },
    { x: baseCenter.x - normal.x * headHalfWidth, y: baseCenter.y - normal.y * headHalfWidth }
  ];
  const bodyEndDistance = Math.max(0, visibleLength - headLength + overlap);
  const bodyPath = slicePolylineByDistance(visiblePath, 0, bodyEndDistance);
  const bodyEndPoint = bodyPath.at(-1) || visiblePath[0];
  return {
    bodyPath,
    headPolygon,
    tip: { x: tip.x, y: tip.y },
    tangent,
    bodyEndPoint: { x: bodyEndPoint.x, y: bodyEndPoint.y },
    headLength,
    headHalfWidth,
    visibleLength,
    bounds: getArrowBounds({ points: visiblePath, lineWidth })
  };
}
