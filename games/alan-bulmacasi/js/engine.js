export function normalizeRect(start, end) {
  return {
    row: Math.min(start.row, end.row),
    column: Math.min(start.column, end.column),
    height: Math.abs(start.row - end.row) + 1,
    width: Math.abs(start.column - end.column) + 1
  };
}

export function rectArea(rect) {
  return rect.width * rect.height;
}

export function rectKey(rect) {
  return `${rect.row}:${rect.column}:${rect.height}:${rect.width}`;
}

export function cellKey(row, column) {
  return `${row}:${column}`;
}

export function rectCells(rect) {
  const cells = [];
  for (let row = rect.row; row < rect.row + rect.height; row += 1) {
    for (let column = rect.column; column < rect.column + rect.width; column += 1) {
      cells.push({ row, column });
    }
  }
  return cells;
}

export function containsCell(rect, row, column) {
  return row >= rect.row
    && row < rect.row + rect.height
    && column >= rect.column
    && column < rect.column + rect.width;
}

export function overlaps(a, b) {
  return a.row < b.row + b.height
    && a.row + a.height > b.row
    && a.column < b.column + b.width
    && a.column + a.width > b.column;
}

export function cluesInside(level, rect) {
  return level.clues.filter((clue) => containsCell(rect, clue.row, clue.column));
}

export function validateRectangle(level, rect, regions = [], ignoredRegionId = null) {
  if (!rect || rect.width < 1 || rect.height < 1) {
    return { valid: false, reason: "Dikdörtgen bir alan seçmelisin." };
  }

  const outside = rect.row < 0
    || rect.column < 0
    || rect.row + rect.height > level.rows
    || rect.column + rect.width > level.columns;
  if (outside) return { valid: false, reason: "Seçim tahta sınırlarının dışında kaldı." };

  const clues = cluesInside(level, rect);
  if (clues.length === 0) return { valid: false, reason: "Her alan tam olarak bir sayı içermeli." };
  if (clues.length > 1) return { valid: false, reason: "Bir alanda yalnızca bir sayı olabilir." };
  if (rectArea(rect) !== clues[0].value) {
    return { valid: false, reason: `${clues[0].value} sayısı için ${clues[0].value} hücre seçmelisin.` };
  }

  const collision = regions.some((region) => region.id !== ignoredRegionId && overlaps(rect, region));
  if (collision) return { valid: false, reason: "Bu alan tamamlanmış başka bir alanla çakışıyor." };

  return { valid: true, clue: clues[0] };
}

function divisors(value) {
  const pairs = [];
  for (let height = 1; height <= value; height += 1) {
    if (value % height === 0) pairs.push({ height, width: value / height });
  }
  return pairs;
}

export function rectangleOptionsForClue(level, clue) {
  const options = [];
  const otherClues = level.clues.filter((item) => item !== clue);

  divisors(clue.value).forEach(({ height, width }) => {
    const firstRow = clue.row - height + 1;
    const lastRow = clue.row;
    const firstColumn = clue.column - width + 1;
    const lastColumn = clue.column;

    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const rect = { row, column, height, width };
        const outside = row < 0 || column < 0 || row + height > level.rows || column + width > level.columns;
        if (outside) continue;
        if (otherClues.some((item) => containsCell(rect, item.row, item.column))) continue;
        options.push(rect);
      }
    }
  });

  return options;
}

export function solveLevel(level, limit = 2) {
  const indexed = level.clues.map((clue, clueIndex) => ({
    clue,
    clueIndex,
    options: rectangleOptionsForClue(level, clue)
  }));
  if (indexed.some((entry) => entry.options.length === 0)) return { count: 0, solution: null };

  const cellCount = level.rows * level.columns;
  const occupied = new Uint8Array(cellCount);
  const chosen = new Array(level.clues.length);
  const remaining = new Set(indexed.map((entry) => entry.clueIndex));
  let count = 0;
  let firstSolution = null;

  const canPlace = (rect) => rectCells(rect).every(({ row, column }) => !occupied[row * level.columns + column]);
  const mark = (rect, value) => rectCells(rect).forEach(({ row, column }) => {
    occupied[row * level.columns + column] = value;
  });

  function search() {
    if (count >= limit) return;
    if (remaining.size === 0) {
      if (occupied.every((value) => value === 1)) {
        count += 1;
        if (!firstSolution) firstSolution = chosen.map((rect) => ({ ...rect }));
      }
      return;
    }

    let next = null;
    let candidates = null;
    for (const clueIndex of remaining) {
      const entry = indexed[clueIndex];
      const available = entry.options.filter(canPlace);
      if (available.length === 0) return;
      if (!candidates || available.length < candidates.length) {
        next = clueIndex;
        candidates = available;
        if (available.length === 1) break;
      }
    }

    remaining.delete(next);
    for (const rect of candidates) {
      chosen[next] = rect;
      mark(rect, 1);
      search();
      mark(rect, 0);
      if (count >= limit) break;
    }
    remaining.add(next);
  }

  search();
  return { count, solution: firstSolution };
}

export function isBoardComplete(level, regions) {
  if (regions.length !== level.clues.length) return false;
  if (regions.some((region) => !validateRectangle(level, region, regions, region.id).valid)) return false;

  const covered = new Set();
  regions.forEach((region) => rectCells(region).forEach(({ row, column }) => covered.add(cellKey(row, column))));
  return covered.size === level.rows * level.columns;
}
