// Config'teki numaraları kaynak görsellerle karşılaştırır: her hücrede kırmızı kalem izi var mı?
// (Bu bir DOĞRULAMA aracıdır — uygulama çalışırken renk algılama yapılmaz, havuz config'ten kurulur.)
// Kullanım: npm run couples:verify
import sharp from "sharp";
import { couplesWheelCatalogs } from "../games/cark-oyunu/js/couples-config.js";

const isMarker = (r, g, b) =>
  r >= 175 && r - g >= 95 && r - b >= 85 && Math.abs(g - b) <= 40 && g < 145 && b < 145;

// Bir hücre "işaretli" sayılır: kalem izi pikselleri hücre alanının %0.35'inden fazlaysa.
// (Komşu hücreye taşan çember kuyruklarını elemek için eşik.)
const THRESHOLD = 0.0035;

let totalOk = 0;
let totalExpected = 0;
const problems = [];

for (const catalog of couplesWheelCatalogs) {
  const { cols, rows, x, y, w, h } = catalog.grid;
  const { data, info } = await sharp(catalog.sourceImage).raw().toBuffer({ resolveWithObject: true });
  const counts = new Map();

  for (let index = 0; index < cols * rows; index += 1) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const left = Math.max(0, Math.round(x + col * w));
    const top = Math.max(0, Math.round(y + row * h));
    const right = Math.min(info.width, Math.round(left + w));
    const bottom = Math.min(info.height, Math.round(top + h));
    let red = 0;
    let area = 0;
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const i = (py * info.width + px) * info.channels;
        if (isMarker(data[i], data[i + 1], data[i + 2])) red += 1;
        area += 1;
      }
    }
    if (area) counts.set(index + 1, red / area);
  }

  const marked = [...counts].filter(([, ratio]) => ratio >= THRESHOLD).map(([number]) => number);
  const selected = new Set(catalog.selectedNumbers);
  const markedSet = new Set(marked);

  // Gerçek hata: config'te var ama görselde kırmızı yok.
  const unmarked = catalog.selectedNumbers.filter((number) => !markedSet.has(number));
  // Bilgi: kırmızı görünen ama seçilmemiş hücreler — komşu çemberin taşan yayı (gözle teyit edildi).
  const bleed = [...markedSet].filter((number) => !selected.has(number));

  const ok = catalog.selectedNumbers.length - unmarked.length;
  totalOk += ok;
  totalExpected += catalog.selectedNumbers.length;

  console.log(`${catalog.name}: ${ok}/${catalog.selectedNumbers.length} doğrulandı`);
  if (unmarked.length) {
    problems.push(`${catalog.name}: config'te olup görselde kırmızı bulunamayan → ${unmarked.join(", ")}`);
    unmarked.forEach((number) => console.log(`   ! ${number}: kırmızı oranı ${(counts.get(number) * 100).toFixed(2)}%`));
  }
  if (bleed.length) {
    console.log(`   bilgi · komşu çember taşması (havuza girmez): ${bleed.join(", ")}`);
  }
}

console.log(`Toplam: ${totalOk}/${totalExpected} doğrulandı`);
if (problems.length) {
  console.log("\nİncelenecekler:");
  problems.forEach((line) => console.log(` - ${line}`));
  process.exit(1);
}
