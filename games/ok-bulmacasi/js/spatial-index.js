export class SpatialGridIndex {
  constructor(cellSize = 1) { this.cellSize = cellSize; this.cells = new Map(); this.entries = new Map(); }
  #keys(bounds) {
    const keys = [];
    for (let y = Math.floor(bounds.minY / this.cellSize); y <= Math.floor(bounds.maxY / this.cellSize); y += 1) {
      for (let x = Math.floor(bounds.minX / this.cellSize); x <= Math.floor(bounds.maxX / this.cellSize); x += 1) keys.push(`${x}:${y}`);
    }
    return keys;
  }
  insert(id, bounds, value) {
    this.remove(id);
    const keys = this.#keys(bounds); this.entries.set(id, { bounds, value, keys });
    keys.forEach((key) => { if (!this.cells.has(key)) this.cells.set(key, new Set()); this.cells.get(key).add(id); });
  }
  remove(id) {
    const entry = this.entries.get(id); if (!entry) return;
    entry.keys.forEach((key) => { const bucket = this.cells.get(key); bucket?.delete(id); if (!bucket?.size) this.cells.delete(key); });
    this.entries.delete(id);
  }
  query(bounds) {
    const ids = new Set(this.#keys(bounds).flatMap((key) => [...(this.cells.get(key) || [])]));
    return [...ids].map((id) => this.entries.get(id)).filter((entry) => entry.bounds.maxX >= bounds.minX && entry.bounds.minX <= bounds.maxX && entry.bounds.maxY >= bounds.minY && entry.bounds.minY <= bounds.maxY).map((entry) => entry.value);
  }
}

