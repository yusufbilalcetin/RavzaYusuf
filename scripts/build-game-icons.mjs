import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, "assets", "icons", "games");
const iconSize = 1024;

const rasterIcons = Object.freeze({
  "candy-crush": "assets/icons/games/source/candy-crush.webp",
  "meyve-eslestirme": "assets/icons/games/source/meyve-eslestirme.png",
  "flappy-bird": "assets/icons/games/source/flappy-bird.webp",
  "boyama": "assets/icons/games/source/boyama.webp",
  "renk-siralama": "assets/icons/games/source/renk-siralama.webp",
});

const vectorIcons = Object.freeze({
  sudoku: `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4f7ff"/><stop offset=".55" stop-color="#dbe4ff"/><stop offset="1" stop-color="#aebfff"/></linearGradient>
        <radialGradient id="gloss" cx=".32" cy=".2" r=".65"><stop stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#bg)"/>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#gloss)"/>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
      <rect x="18" y="18" width="64" height="64" rx="7" fill="#fff" stroke="#2b3a8f" stroke-width="3"/>
      <g stroke="#8f9cd9" stroke-width="1.4"><path d="M39.33 18v64M60.67 18v64M18 39.33h64M18 60.67h64"/></g>
      <g font-family="Arial,sans-serif" font-size="15" font-weight="700" text-anchor="middle"><text x="28.7" y="35" fill="#2b3a8f">5</text><text x="71.3" y="35" fill="#e0483f">3</text><text x="50" y="56.5" fill="#2b3a8f">7</text><text x="28.7" y="78" fill="#e0483f">9</text><text x="71.3" y="78" fill="#2b3a8f">1</text></g>
    </svg>`,
  "sans-carki": `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#283442"/><stop offset="1" stop-color="#0f141c"/></linearGradient>
        <radialGradient id="shine" cx=".3" cy=".18" r=".8"><stop stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#bg)"/>
      <path d="M50 16A34 34 0 0 1 74 26L50 50Z" fill="#9c4f45"/><path d="M74 26A34 34 0 0 1 84 50H50Z" fill="#315d67"/><path d="M84 50A34 34 0 0 1 74 74L50 50Z" fill="#b78632"/><path d="M74 74A34 34 0 0 1 50 84V50Z" fill="#556b3c"/><path d="M50 84A34 34 0 0 1 26 74L50 50Z" fill="#5f4f79"/><path d="M26 74A34 34 0 0 1 16 50H50Z" fill="#9b643e"/><path d="M16 50A34 34 0 0 1 26 26L50 50Z" fill="#35675b"/><path d="M26 26A34 34 0 0 1 50 16V50Z" fill="#8b4058"/>
      <circle cx="50" cy="50" r="34" fill="none" stroke="#f0ca6c" stroke-width="4"/><circle cx="50" cy="50" r="12" fill="#d4a949" stroke="#ffe49b" stroke-width="2.5"/><path d="M44 8h12l-6 15z" fill="#f0ca6c" stroke="#fff1bc" stroke-width="1"/>
      <circle cx="50" cy="50" r="46" fill="url(#shine)"/>
    </svg>`,
  "alan-bulmacasi": `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff8fb"/><stop offset="1" stop-color="#eadcf2"/></linearGradient></defs>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#bg)" stroke="#fff" stroke-width="2"/>
      <rect x="14" y="14" width="72" height="72" rx="10" fill="#fffdfd" stroke="#534358" stroke-width="2.5"/>
      <path d="M14 14h33v33H14z" fill="#c2b3eb" stroke="#7960c1" stroke-width="2"/><path d="M47 14h39v33H47z" fill="#b5ddf3" stroke="#4d96c2" stroke-width="2"/><path d="M14 47h33v39H14z" fill="#b6dfcc" stroke="#4c9d78" stroke-width="2"/><path d="M47 47h39v39H47z" fill="#f3b5c9" stroke="#c95c83" stroke-width="2"/>
      <g font-family="Arial,sans-serif" font-size="12" font-weight="800" text-anchor="middle" fill="#fff"><rect x="24" y="24" width="14" height="14" rx="4" fill="#403244"/><text x="31" y="35">4</text><rect x="60" y="24" width="14" height="14" rx="4" fill="#403244"/><text x="67" y="35">8</text><rect x="24" y="60" width="14" height="14" rx="4" fill="#403244"/><text x="31" y="71">6</text><rect x="60" y="60" width="14" height="14" rx="4" fill="#403244"/><text x="67" y="71">4</text></g>
    </svg>`,
  "ok-bulmacasi": `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0f6"/><stop offset=".55" stop-color="#f3c8da"/><stop offset="1" stop-color="#a93f6d"/></linearGradient><radialGradient id="gloss" cx=".32" cy=".2" r=".65"><stop stop-color="#fff" stop-opacity=".68"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#bg)"/><rect x="2" y="2" width="96" height="96" rx="24" fill="url(#gloss)"/><rect x="2" y="2" width="96" height="96" rx="24" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
      <path d="M27 76V43h31" fill="none" stroke="#5f2743" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="m47 28 12 15-18 5z" fill="#5f2743"/><circle cx="27" cy="76" r="5" fill="#fff" fill-opacity=".45"/>
    </svg>`,
});

await mkdir(outputDir, { recursive: true });

for (const [id, source] of Object.entries(rasterIcons)) {
  const kernel = id === "flappy-bird" ? sharp.kernel.nearest : sharp.kernel.lanczos3;
  const pngOptions = id === "flappy-bird"
    ? { compressionLevel: 9, adaptiveFiltering: true }
    : { compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 92, effort: 10, colours: 256, dither: 1 };
  await sharp(path.join(projectRoot, source))
    .resize({ width: iconSize, height: iconSize, fit: "contain", kernel })
    .png(pngOptions)
    .toFile(path.join(outputDir, `${id}.png`));
}

for (const [id, svg] of Object.entries(vectorIcons)) {
  await sharp(Buffer.from(svg), { density: 256 })
    .resize(iconSize, iconSize, { fit: "contain" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDir, `${id}.png`));
}

console.log(`[game-icons] ${Object.keys(rasterIcons).length + Object.keys(vectorIcons).length} ikon hazırlandı: assets/icons/games/`);
