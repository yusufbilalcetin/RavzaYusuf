export function buildRegionMapAndOutline(width, height, cellSize) {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const total = width * height;
  const regionMap = new Uint32Array(total);
  const outline = new Uint8Array(total);

  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cellSize);
    const isRowEdge = y % cellSize === 0 || y === height - 1;
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      regionMap[idx] = row * cols + Math.floor(x / cellSize);
      outline[idx] = (isRowEdge || x % cellSize === 0 || x === width - 1) ? 1 : 0;
    }
  }

  return { regionMap, outline, cols };
}
