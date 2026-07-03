import { buildRegionMapAndOutline } from "../utils/pbn-grid.js";

const MERGE_DELTA_E = 12;

function reportProgress(stage, progress) {
  self.postMessage({ type: "progress", stage, progress });
}

function srgbToLab(r, g, b) {
  let rr = r / 255, gg = g / 255, bb = b / 255;
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

  const x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
  const y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  const z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function buildGridCells(pixels, width, height, cellSize) {
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const cellCount = cols * rows;

  const sumR = new Float64Array(cellCount);
  const sumG = new Float64Array(cellCount);
  const sumB = new Float64Array(cellCount);
  const pxCount = new Uint32Array(cellCount);

  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cellSize);
    for (let x = 0; x < width; x++) {
      const cellIdx = row * cols + Math.floor(x / cellSize);
      const px = (y * width + x) * 4;
      sumR[cellIdx] += pixels[px];
      sumG[cellIdx] += pixels[px + 1];
      sumB[cellIdx] += pixels[px + 2];
      pxCount[cellIdx]++;
    }
  }

  const cellRgb = [];
  const cellLab = [];
  for (let i = 0; i < cellCount; i++) {
    const count = pxCount[i] || 1;
    const rgb = [sumR[i] / count, sumG[i] / count, sumB[i] / count];
    cellRgb.push(rgb);
    cellLab.push(srgbToLab(rgb[0], rgb[1], rgb[2]));
  }

  return { cols, rows, cellCount, cellRgb, cellLab, pxCount };
}

function kMeansLab(cellLab, k) {
  const n = cellLab.length;
  const effectiveK = Math.max(1, Math.min(k, n));

  const centroids = [cellLab[Math.floor(Math.random() * n)].slice()];
  while (centroids.length < effectiveK) {
    let best = null, bestDist = -1;
    for (let i = 0; i < n; i++) {
      const lab = cellLab[i];
      let minDist = Infinity;
      for (const c of centroids) {
        const d = deltaE(lab, c);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestDist) { bestDist = minDist; best = lab; }
    }
    centroids.push((best || cellLab[Math.floor(Math.random() * n)]).slice());
  }

  const assignment = new Int32Array(n);
  const iterations = 10;
  for (let iter = 0; iter < iterations; iter++) {
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const lab = cellLab[i];
      let bestIdx = 0, bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = deltaE(lab, centroids[c]);
        if (d < bestDist) { bestDist = d; bestIdx = c; }
      }
      assignment[i] = bestIdx;
      const sum = sums[bestIdx];
      sum[0] += lab[0]; sum[1] += lab[1]; sum[2] += lab[2]; sum[3] += 1;
    }
    for (let c = 0; c < centroids.length; c++) {
      const sum = sums[c];
      if (sum[3] > 0) centroids[c] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
    }
    reportProgress("colors", Math.round(((iter + 1) / iterations) * 100));
  }

  return { centroids, assignment };
}

function mergeSimilarCentroids(centroids, assignment) {
  const clusters = centroids.map((lab) => ({ lab: lab.slice(), count: 0 }));
  for (let i = 0; i < assignment.length; i++) clusters[assignment[i]].count++;

  let live = clusters.filter((c) => c.count > 0);

  let merged = true;
  while (merged && live.length > 1) {
    merged = false;
    outer:
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        if (deltaE(live[i].lab, live[j].lab) < MERGE_DELTA_E) {
          const a = live[i], b = live[j];
          const total = a.count + b.count;
          a.lab = [
            (a.lab[0] * a.count + b.lab[0] * b.count) / total,
            (a.lab[1] * a.count + b.lab[1] * b.count) / total,
            (a.lab[2] * a.count + b.lab[2] * b.count) / total
          ];
          a.count = total;
          live.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  return live;
}

self.onmessage = (event) => {
  const { data, width, height, k, cellSize } = event.data;

  try {
    reportProgress("downscale", 100);

    const rawPixels = new Uint8ClampedArray(data);
    const { cols, rows, cellCount, cellRgb, cellLab, pxCount } = buildGridCells(rawPixels, width, height, cellSize);

    const { centroids, assignment } = kMeansLab(cellLab, k);
    const mergedClusters = mergeSimilarCentroids(centroids, assignment);

    const finalAssignment = new Int32Array(cellCount);
    const rgbSums = mergedClusters.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < cellCount; i++) {
      let bestIdx = 0, bestDist = Infinity;
      for (let c = 0; c < mergedClusters.length; c++) {
        const d = deltaE(cellLab[i], mergedClusters[c].lab);
        if (d < bestDist) { bestDist = d; bestIdx = c; }
      }
      finalAssignment[i] = bestIdx;
      const sum = rgbSums[bestIdx];
      sum[0] += cellRgb[i][0]; sum[1] += cellRgb[i][1]; sum[2] += cellRgb[i][2]; sum[3] += 1;
    }

    const usedClusterIdxs = [];
    for (let c = 0; c < mergedClusters.length; c++) {
      if (rgbSums[c][3] > 0) usedClusterIdxs.push(c);
    }
    usedClusterIdxs.sort((a, b) => mergedClusters[a].lab[0] - mergedClusters[b].lab[0]);

    const clusterToNumber = new Map();
    const palette = usedClusterIdxs.map((clusterIdx, i) => {
      const number = i + 1;
      clusterToNumber.set(clusterIdx, number);
      const sum = rgbSums[clusterIdx];
      return {
        number,
        r: Math.round(sum[0] / sum[3]),
        g: Math.round(sum[1] / sum[3]),
        b: Math.round(sum[2] / sum[3]),
        cellCount: sum[3]
      };
    });
    reportProgress("labels", 100);

    const { regionMap, outline } = buildRegionMapAndOutline(width, height, cellSize);
    reportProgress("regions", 100);

    const regions = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cellIdx = row * cols + col;
        if (pxCount[cellIdx] === 0) continue;
        regions.push({
          id: cellIdx,
          paletteNumber: clusterToNumber.get(finalAssignment[cellIdx]),
          pixelCount: pxCount[cellIdx],
          labelX: Math.min(width - 1, col * cellSize + Math.floor(cellSize / 2)),
          labelY: Math.min(height - 1, row * cellSize + Math.floor(cellSize / 2))
        });
      }
    }
    reportProgress("finalize", 100);

    self.postMessage({
      type: "done",
      width, height, cellSize, cols, rows,
      regionMapBuffer: regionMap.buffer,
      outlineBuffer: outline.buffer,
      regions,
      palette
    }, [regionMap.buffer, outline.buffer]);
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || String(error) });
  }
};
