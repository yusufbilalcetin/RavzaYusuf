// Bizim Çarkımız — kaynak sayfalardan yalnızca config'te KIRMIZI ile işaretli pozisyonları kırpar.
// Kırmızı kalem izleri (çember/çizgi/numara) piksel maskesiyle silinip komşu renklerle doldurulur.
// Kullanım: npm run couples:crops   [--sheet]  (--sheet: doğrulama kontakt sayfası da üretir)
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { couplesWheelCatalogs, optionCode, validateCatalogs } from "../games/cark-oyunu/js/couples-config.js";

const OUT_ROOT = "assets/ciftler-carki";
const UPSCALE = 3;          // kaynak hücreler çok küçük (B'de 69x66) — sabit oranlı büyütme
const QUALITY = 86;

// Kırmızı kalem izi iki eşikle bulunur (Canny'deki histerezis mantığı):
//   güçlü : kalemin dolu gövdesi
//   zayıf : JPEG'in bıraktığı pembe hâle — yalnızca güçlü bir ize komşuysa silinir
// Kataloglardaki doğal renkler ikisinin de dışında kalır:
//   ten (255,216,192) r-g=39 · C figür magenta (144,24,72) r=144, b>g · C sarı (240,216,96) r-g=24
const isStrongMarker = (r, g, b) =>
  r >= 175 && r - g >= 95 && r - b >= 85 && Math.abs(g - b) <= 40 && g < 145 && b < 145;
// Ayıraç: kalemin soluk hâlesi nötrdür (g ≈ b), ten tonu ise sarıya çalar (g - b ≈ 24).
const isWeakMarker = (r, g, b) =>
  r >= 185 && r - g >= 30 && r - b >= 30 && Math.abs(g - b) <= 15;

/** Kırmızıyı maskeler (güçlü + bağlantılı zayıf), sonra komşu renklerle doldurur. */
function removeRedMarks(data, width, height, channels) {
  const size = width * height;
  const mask = new Uint8Array(size);
  const weak = new Uint8Array(size);
  for (let p = 0; p < size; p += 1) {
    const i = p * channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (isStrongMarker(r, g, b)) mask[p] = 1;
    else if (isWeakMarker(r, g, b)) weak[p] = 1;
  }
  if (!mask.some(Boolean)) return 0;

  // Maskeyi büyüt: her turda komşu pikseli al (zayıf olan her zaman, temiz olan ilk 2 turda —
  // böylece hem hâle hem kalemin kenar pikselleri temizlenir, sağlam boya yenmez).
  for (let pass = 0; pass < 14; pass += 1) {
    const grown = mask.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (mask[p]) continue;
        if (pass >= 2 && !weak[p]) continue;
        for (let dy = -1; dy <= 1 && !grown[p]; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue;
            if (mask[ny * width + nx]) { grown[p] = 1; break; }
          }
        }
      }
    }
    mask.set(grown);
  }

  const marked = mask.reduce((sum, value) => sum + value, 0);
  // ponytail: yayılım tabanlı basit doldurma — kalem izleri 3-6px, 40 tur fazlasıyla yetiyor.
  // Daha iyisi gerekirse (geniş çemberlerde bulanıklık) content-aware inpaint'e geçilir.
  for (let pass = 0; pass < 40; pass += 1) {
    const filled = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (!mask[p]) continue;
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue;
            const np = ny * width + nx;
            if (mask[np]) continue;
            const ni = np * channels;
            r += data[ni]; g += data[ni + 1]; b += data[ni + 2]; count += 1;
          }
        }
        if (!count) continue;
        const i = p * channels;
        data[i] = Math.round(r / count);
        data[i + 1] = Math.round(g / count);
        data[i + 2] = Math.round(b / count);
        filled.push(p);
      }
    }
    if (!filled.length) break;
    filled.forEach((p) => { mask[p] = 0; });
  }
  return marked;
}

const errors = validateCatalogs();
if (errors.length) {
  console.error("Config doğrulaması başarısız:\n" + errors.map((e) => ` - ${e}`).join("\n"));
  process.exit(1);
}

const report = [];
const sheetTiles = [];

for (const catalog of couplesWheelCatalogs) {
  const { cols, x, y, w, h, crop } = catalog.grid;
  const source = sharp(catalog.sourceImage);
  const meta = await source.metadata();
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  const cleared = removeRedMarks(data, info.width, info.height, info.channels);
  const clean = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  const cleanBuffer = await clean.png().toBuffer();

  const dir = `${OUT_ROOT}/${catalog.id}`;
  await mkdir(dir, { recursive: true });

  for (const number of catalog.selectedNumbers) {
    const index = number - 1;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const left = Math.max(0, Math.round(x + col * w + crop.x * w));
    const top = Math.max(0, Math.round(y + row * h + crop.y * h));
    const width = Math.min(Math.round(crop.w * w), meta.width - left);
    const height = Math.min(Math.round(crop.h * h), meta.height - top);

    const file = `${dir}/${String(number).padStart(2, "0")}.webp`;
    const tile = await sharp(cleanBuffer)
      .extract({ left, top, width, height })
      .resize({ width: Math.round(width * UPSCALE), kernel: "lanczos3" })
      .toBuffer();
    await writeFile(file, await sharp(tile).webp({ quality: QUALITY }).toBuffer());
    sheetTiles.push({ code: optionCode(catalog, number), tile });
    report.push({ code: optionCode(catalog, number), file, box: `${left},${top} ${width}x${height}` });
  }
  console.log(`${catalog.name}: ${catalog.selectedNumbers.length} kırpma · ${cleared} kırmızı piksel temizlendi`);
}

if (process.argv.includes("--sheet")) {
  const CELL = 190, COLS = 8;
  const rows = Math.ceil(sheetTiles.length / COLS);
  const tiles = await Promise.all(sheetTiles.map(async ({ code, tile }, index) => ({
    input: await sharp(tile).resize({ width: CELL - 10, height: CELL - 30, fit: "contain", background: "#fff" })
      .composite([{
        input: Buffer.from(`<svg width="${CELL - 10}" height="${CELL - 30}"><rect x="0" y="0" width="${CELL - 10}" height="${CELL - 30}" fill="none" stroke="#bbb"/><rect x="0" y="0" width="46" height="16" fill="#111"/><text x="4" y="12" font-size="12" font-weight="700" fill="#fff">${code}</text></svg>`),
        top: 0, left: 0
      }]).png().toBuffer(),
    top: Math.floor(index / COLS) * CELL + 5,
    left: (index % COLS) * CELL + 5
  })));
  await mkdir(".tmp", { recursive: true });
  await writeFile(".tmp/couples-sheet.png", await sharp({
    create: { width: COLS * CELL, height: rows * CELL, channels: 3, background: "#fff" }
  }).composite(tiles).png().toBuffer());
  console.log(".tmp/couples-sheet.png yazıldı (doğrulama için).");
}

console.log(`\nToplam ${report.length} pozisyon kırpıldı (beklenen 62).`);
if (report.length !== 62) process.exit(1);
