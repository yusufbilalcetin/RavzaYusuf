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

// Bir parca, uzerinde blockedBy'de sayilan ve hala tahtada duran parcalarin
// hicbiri kalmadiginda cekilebilir. blockedBy, uretim sirasinda hesaplanan ve
// bu parcanin kacis koridorunda govdesi bulunan (kendinden once yerlesmis)
// parcalarin kimlikleridir.
export function isPullable(piece, remainingIds) {
  return piece.blockedBy.every((id) => !remainingIds.has(id));
}

export function getPullablePieces(pieces, remainingIds) {
  return pieces.filter((piece) => remainingIds.has(piece.id) && isPullable(piece, remainingIds));
}

// Uretecin garantisini dogrular: herhangi bir sirayla (her adimda cekilebilir
// bir parca secilerek) tahta tamamen bosaltilabiliyor mu?
export function simulateFullyClearable(pieces) {
  const remaining = new Set(pieces.map((piece) => piece.id));
  while (remaining.size > 0) {
    const next = pieces.find((piece) => remaining.has(piece.id) && isPullable(piece, remaining));
    if (!next) return false;
    remaining.delete(next.id);
  }
  return true;
}
