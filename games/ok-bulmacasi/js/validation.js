import { DIRECTIONS } from "./engine.js";
import { DEFAULT_LINE_WIDTH, getSegments, pointsOf } from "./geometry.js";

export function validateArrow(piece, board) {
  const errors = [];
  if (piece.id === undefined || piece.id === null) errors.push("Ok kimliği eksik.");
  const points = pointsOf(piece);
  if (points.length < 2) errors.push(`Ok ${piece.id}: en az iki nokta gerekli.`);
  getSegments(points).forEach((segment) => {
    if (segment.x1 === segment.x2 && segment.y1 === segment.y2) errors.push(`Ok ${piece.id}: sıfır uzunluklu segment.`);
    if (!segment.horizontal && !segment.vertical) errors.push(`Ok ${piece.id}: çapraz segment geçersiz.`);
  });
  points.forEach(({ x, y }) => {
    if (x < 0 || x > board.cols || y < 0 || y > board.rows) errors.push(`Ok ${piece.id}: nokta tahta dışında.`);
  });
  const direction = piece.direction || DIRECTIONS[piece.exitDir]?.key;
  if (!DIRECTIONS.some((item) => item.key === direction)) errors.push(`Ok ${piece.id}: geçersiz yön.`);
  if (points.length >= 2 && DIRECTIONS.some((item) => item.key === direction)) {
    const before = points.at(-2);
    const head = points.at(-1);
    const matches = direction === "up" ? head.x === before.x && head.y < before.y
      : direction === "right" ? head.y === before.y && head.x > before.x
        : direction === "down" ? head.x === before.x && head.y > before.y
          : head.y === before.y && head.x < before.x;
    if (!matches) errors.push(`Ok ${piece.id}: yön son segmentle uyuşmuyor.`);
  }
  if ((piece.lineWidth || DEFAULT_LINE_WIDTH) <= 0) errors.push(`Ok ${piece.id}: çizgi kalınlığı pozitif olmalı.`);
  return { valid: errors.length === 0, errors };
}

export function validateLevel(level) {
  const errors = [];
  if (!Number.isInteger(level.id) || level.id < 1) errors.push("Bölüm kimliği pozitif tam sayı olmalı.");
  if (!Number.isInteger(level.rows) || level.rows < 1 || !Number.isInteger(level.cols) || level.cols < 1) errors.push("Tahta ölçüleri geçersiz.");
  if (!Array.isArray(level.pieces) || level.pieces.length === 0) errors.push("Bölüm en az bir ok içermeli.");
  const ids = new Set();
  (level.pieces || []).forEach((piece) => {
    if (ids.has(piece.id)) errors.push(`Yinelenen ok kimliği: ${piece.id}`);
    ids.add(piece.id);
    errors.push(...validateArrow(piece, level).errors);
  });
  return { valid: errors.length === 0, errors };
}

export function calculateDifficulty(level, solverResult = {}) {
  const segments = level.pieces.map((piece) => getSegments(pointsOf(piece)).length);
  const averageSegments = segments.reduce((sum, value) => sum + value, 0) / Math.max(1, segments.length);
  const density = level.pieces.reduce((sum, piece) => sum + pointsOf(piece).length, 0) / (level.rows * level.cols);
  const safe = solverResult.initialSafe?.length || 1;
  const score = level.pieces.length + averageSegments * 2 + density * 12 - Math.min(6, safe);
  return { score, label: score < 20 ? "easy" : score < 45 ? "medium" : score < 76 ? "hard" : "expert" };
}
