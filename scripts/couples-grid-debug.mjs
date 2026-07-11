// Izgara hizasını gözle doğrulamak için kaynak sayfaların üstüne hücre çizgilerini basar.
// Kullanım: node scripts/couples-grid-debug.mjs  ->  .tmp/grid-<id>.png
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { couplesWheelCatalogs } from "../games/cark-oyunu/js/couples-config.js";

await mkdir(".tmp", { recursive: true });

for (const catalog of couplesWheelCatalogs) {
  const { cols, rows, x, y, w, h, crop } = catalog.grid;
  const image = sharp(catalog.sourceImage);
  const { width, height } = await image.metadata();
  const parts = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cx = x + col * w;
      const cy = y + row * h;
      const number = row * cols + col + 1;
      parts.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="none" stroke="#00a0ff" stroke-width="1"/>`);
      parts.push(`<rect x="${cx + crop.x * w}" y="${cy + crop.y * h}" width="${crop.w * w}" height="${crop.h * h}" fill="none" stroke="#00ff00" stroke-width="1.5"/>`);
      parts.push(`<text x="${cx + 3}" y="${cy + 12}" font-size="11" font-weight="700" fill="#00a0ff">${number}</text>`);
    }
  }
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
  const out = `.tmp/grid-${catalog.id}.png`;
  await writeFile(out, await image.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer());
  console.log(`${out}  (${width}x${height}, ${cols}x${rows})`);
}
