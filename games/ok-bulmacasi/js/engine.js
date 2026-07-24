import { findContinuousArrowCollision } from "./continuous-collision.js";

// Yon 0=yukari 1=sag 2=asagi 3=sol. dr/dc bir adimlik hucre kaymasidir.
export const DIRECTIONS = [
  { key: "up", dr: -1, dc: 0 },
  { key: "right", dr: 0, dc: 1 },
  { key: "down", dr: 1, dc: 0 },
  { key: "left", dr: 0, dc: -1 }
];

export function cellKey(row, col) {
  return `${row}:${col}`;
}

// Bir parcanin kafasindan (yolun son hucresi), kendi yonunde tahta kenarina
// kadar uzanan duz kacis koridoru. Bu koridorda baska bir parcanin govdesi
// varsa parca cekilemez.
export function corridorCells(rows, cols, headRow, headCol, dir) {
  const { dr, dc } = DIRECTIONS[dir];
  const cells = [];
  let r = headRow + dr;
  let c = headCol + dc;
  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    cells.push({ row: r, col: c });
    r += dr;
    c += dc;
  }
  return cells;
}

// Parçanın yalnızca ucunu değil, bütün gövdesini hareket yönünde tahta dışına
// kadar öteleyerek kaplayacağı hücreleri döndürür. Kendi başlangıç hücreleri
// sonuçtan çıkarılır; böylece yalnızca gerçek hareket koridoru kalır.
export function sweptCells(rows, cols, piece) {
  const { dr, dc } = DIRECTIONS[piece.exitDir] || {};
  if (!Number.isInteger(dr) || !Number.isInteger(dc)) return [];
  const own = new Set(piece.cells.map(({ row, col }) => cellKey(row, col)));
  const swept = new Map();
  for (const cell of piece.cells) {
    let row = cell.row + dr;
    let col = cell.col + dc;
    while (row >= 0 && row < rows && col >= 0 && col < cols) {
      const key = cellKey(row, col);
      if (!own.has(key)) swept.set(key, { row, col });
      row += dr;
      col += dc;
    }
  }
  return [...swept.values()];
}

export function blockersForPiece(level, piece, remainingIds = new Set(level.pieces.map((item) => item.id))) {
  const active = level.pieces.filter((other) => remainingIds.has(other.id));
  const collision = findContinuousArrowCollision(piece, active, level);
  if (collision.canMove) return [];
  const blocker = active.find((other) => other.id === collision.blockingArrowId);
  return blocker ? [blocker] : [];
}

export function movementResult(level, piece, remainingIds = new Set(level.pieces.map((item) => item.id))) {
  const active = level.pieces.filter((other) => remainingIds.has(other.id));
  return findContinuousArrowCollision(piece, active, level);
}

// Bir parca, uzerinde blockedBy'de sayilan ve hala tahtada duran parcalarin
// hicbiri kalmadiginda cekilebilir. blockedBy, uretim sirasinda hesaplanan ve
// bu parcanin kacis koridorunda govdesi bulunan (kendinden once yerlesmis)
// parcalarin kimlikleridir.
export function isPullable(piece, remainingIds, level = null) {
  if (level) return blockersForPiece(level, piece, remainingIds).length === 0;
  return (piece.blockedBy || []).every((id) => !remainingIds.has(id));
}

export function getPullablePieces(pieces, remainingIds, level = null) {
  return pieces.filter((piece) => remainingIds.has(piece.id) && isPullable(piece, remainingIds, level));
}

// Uretecin garantisini dogrular: herhangi bir sirayla (her adimda cekilebilir
// bir parca secilerek) tahta tamamen bosaltilabiliyor mu?
export function simulateFullyClearable(pieces, level = null) {
  const remaining = new Set(pieces.map((piece) => piece.id));
  while (remaining.size > 0) {
    const next = pieces.find((piece) => remaining.has(piece.id) && isPullable(piece, remaining, level));
    if (!next) return false;
    remaining.delete(next.id);
  }
  return true;
}

export function stateHash(remainingIds) {
  return [...remainingIds].sort((a, b) => a - b).join(",");
}

export function solveLevel(level, { maxSolutions = 1 } = {}) {
  const memo = new Map();
  let solutionCount = 0;
  let firstSolution = null;

  function visit(remaining, path) {
    if (remaining.size === 0) {
      solutionCount += 1;
      firstSolution ||= [...path];
      return solutionCount >= maxSolutions;
    }
    const hash = stateHash(remaining);
    if (memo.get(hash) === false) return false;
    const safe = getPullablePieces(level.pieces, remaining, level);
    if (!safe.length) {
      memo.set(hash, false);
      return false;
    }
    let solved = false;
    for (const piece of safe) {
      const next = new Set(remaining);
      next.delete(piece.id);
      solved = visit(next, [...path, piece.id]) || solved;
      if (solutionCount >= maxSolutions) break;
    }
    if (!solved) memo.set(hash, false);
    return solved;
  }

  const initial = new Set(level.pieces.map((piece) => piece.id));
  visit(initial, []);
  return {
    solvable: solutionCount > 0,
    solutionCount,
    solution: firstSolution || [],
    initialSafe: getPullablePieces(level.pieces, initial, level).map((piece) => piece.id)
  };
}
