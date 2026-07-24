export const GEOMETRY_EPSILON = 0.001;
export const DEFAULT_LINE_WIDTH = 0.07;

export function pointsOf(piece) {
  if (piece.points) return piece.points;
  const points = piece.cells?.map(({ row, col }) => ({ x: col + 0.5, y: row + 0.5 })) || [];
  if (points.length && Number.isInteger(piece.exitDir)) {
    const direction = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][piece.exitDir];
    const head = points.at(-1);
    points.push({ x: head.x + direction.x * 0.42, y: head.y + direction.y * 0.42 });
  }
  return points;
}

export function getSegments(points) {
  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    segments.push({ index: index - 1, x1: a.x, y1: a.y, x2: b.x, y2: b.y, horizontal: a.y === b.y, vertical: a.x === b.x });
  }
  return segments;
}

export function segmentBounds(segment, lineWidth = DEFAULT_LINE_WIDTH) {
  const half = lineWidth / 2;
  return {
    minX: Math.min(segment.x1, segment.x2) - half,
    maxX: Math.max(segment.x1, segment.x2) + half,
    minY: Math.min(segment.y1, segment.y2) - half,
    maxY: Math.max(segment.y1, segment.y2) + half
  };
}

export function getArrowBounds(piece) {
  const points = pointsOf(piece);
  const half = (piece.lineWidth || DEFAULT_LINE_WIDTH) / 2;
  return {
    minX: Math.min(...points.map((point) => point.x)) - half,
    maxX: Math.max(...points.map((point) => point.x)) + half,
    minY: Math.min(...points.map((point) => point.y)) - half,
    maxY: Math.max(...points.map((point) => point.y)) + half
  };
}

export function getExitTranslation(piece, board) {
  const bounds = getArrowBounds(piece);
  const direction = piece.direction || ["up", "right", "down", "left"][piece.exitDir];
  if (direction === "up") return { x: 0, y: -(bounds.maxY + GEOMETRY_EPSILON) };
  if (direction === "right") return { x: board.cols - bounds.minX + GEOMETRY_EPSILON, y: 0 };
  if (direction === "down") return { x: 0, y: board.rows - bounds.minY + GEOMETRY_EPSILON };
  return { x: -(bounds.maxX + GEOMETRY_EPSILON), y: 0 };
}

export function getSweptRectangles(piece, board) {
  const original = pointsOf(piece);
  const originalLength = getSegments(original).reduce((sum, segment) => sum + Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1), 0);
  const head = original.at(-1);
  const directionIndex = Number.isInteger(piece.exitDir) ? piece.exitDir : ["up", "right", "down", "left"].indexOf(piece.direction);
  const direction = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][directionIndex];
  const outside = direction.y < 0 ? head.y : direction.y > 0 ? board.rows - head.y : direction.x < 0 ? head.x : board.cols - head.x;
  const length = outside + originalLength + 1;
  const combined = [...original, { x: head.x + direction.x * length, y: head.y + direction.y * length }];
  return getSegments(combined).map((segment) => ({
    segmentIndex: segment.index,
    // Hareket koridoru görünür çizginin yanında ok başı üçgenini de kapsar.
    ...segmentBounds(segment, Math.max(piece.lineWidth || DEFAULT_LINE_WIDTH, 0.26))
  }));
}

export function rectanglesIntersect(a, b, epsilon = GEOMETRY_EPSILON) {
  return a.maxX >= b.minX - epsilon && a.minX <= b.maxX + epsilon
    && a.maxY >= b.minY - epsilon && a.minY <= b.maxY + epsilon;
}

export function findArrowCollision(moving, active, board, epsilon = GEOMETRY_EPSILON) {
  const swept = getSweptRectangles(moving, board);
  let closest = null;
  for (const blocker of active) {
    if (blocker.id === moving.id || blocker.removed) continue;
    const blockerBounds = getSegments(pointsOf(blocker)).map((segment) => ({
      segmentIndex: segment.index,
      ...segmentBounds(segment, blocker.lineWidth || DEFAULT_LINE_WIDTH)
    }));
    swept.forEach((movingRect) => blockerBounds.forEach((blockingRect) => {
      if (!rectanglesIntersect(movingRect, blockingRect, epsilon)) return;
      const point = {
        x: (Math.max(movingRect.minX, blockingRect.minX) + Math.min(movingRect.maxX, blockingRect.maxX)) / 2,
        y: (Math.max(movingRect.minY, blockingRect.minY) + Math.min(movingRect.maxY, blockingRect.maxY)) / 2
      };
      const origin = pointsOf(moving).at(-1);
      const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
      if (!closest || distance < closest.distance) closest = {
        canMove: false, movingArrowId: moving.id, blockingArrowId: blocker.id,
        collisionPoint: point, movingSegmentIndex: movingRect.segmentIndex,
        blockingSegmentIndex: blockingRect.segmentIndex, distance
      };
    }));
  }
  return closest || { canMove: true, movingArrowId: moving.id, blockingArrowId: null, collisionPoint: null };
}

export function pointToSegmentDistance(point, segment) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - segment.x1, point.y - segment.y1);
  const t = Math.max(0, Math.min(1, ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared));
  return Math.hypot(point.x - (segment.x1 + t * dx), point.y - (segment.y1 + t * dy));
}

export function distanceToPiece(point, piece) {
  return Math.min(...getSegments(pointsOf(piece)).map((segment) => pointToSegmentDistance(point, segment)));
}
