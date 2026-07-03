export function toIndex(row, col, cols) {
  return row * cols + col;
}

export function toRowCol(index, cols) {
  return { row: Math.floor(index / cols), col: index % cols };
}

export function inBounds(row, col, rows, cols) {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

export function neighbors(index, rows, cols) {
  const { row, col } = toRowCol(index, cols);
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1]
  ].filter(([r, c]) => inBounds(r, c, rows, cols)).map(([r, c]) => toIndex(r, c, cols));
}
