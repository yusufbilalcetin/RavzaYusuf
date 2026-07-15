const APP_ICON_NAMES = Object.freeze({
  ravzalingo: "RavzaLingo",
  kahoot: "Kahoot",
  "calisma-merkezi": "Çalışma Merkezi",
  "ezber-merkezi": "Ezber Merkezi",
  "bosluk-doldurma": "Boşluk Doldurma",
  "quiz-merkezi": "Quiz Merkezi",
  "sinav-merkezi": "Sınav Merkezi",
  "hizli-tekrar": "Hızlı Tekrar",
  "sinif-ogretmen": "1. Sınıf",
  "sinif-ogrenci": "2. Sınıf",
  "ok-bulmacasi": "Ok Bulmacası"
});

export const APP_ICON_IDS = Object.freeze(Object.keys(APP_ICON_NAMES));

function iconRecord(id, name) {
  const base = `assets/icons/apps`;
  return Object.freeze({
    id,
    name,
    src: `${base}/128/${id}.webp`,
    srcset: Object.freeze([
      `${base}/128/${id}.webp 1x`,
      `${base}/256/${id}.webp 2x`
    ]),
    avifSrcset: Object.freeze([
      `${base}/128/${id}.avif 1x`,
      `${base}/256/${id}.avif 2x`
    ]),
    fallback: `${base}/128/${id}.png`,
    master: `${base}/source/${id}.png`,
    width: 128,
    height: 128
  });
}

export const APP_ICONS = Object.freeze(Object.fromEntries(
  Object.entries(APP_ICON_NAMES).map(([id, name]) => [id, iconRecord(id, name)])
));

export function findAppIcon(iconId) {
  return APP_ICONS[iconId] || null;
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function appIconPictureMarkup(iconId, options = {}) {
  const icon = findAppIcon(iconId);
  if (!icon) return "";

  const eager = options.eager === true;
  const pictureClass = options.pictureClass || "app-icon-picture";
  const imageClass = options.imageClass ? ` class="${escapeAttribute(options.imageClass)}"` : "";
  const alt = options.alt ?? "";
  const width = Number(options.width) || icon.width;
  const height = Number(options.height) || icon.height;
  const avifSrcset = icon.avifSrcset.map((entry) => `./${entry}`).join(", ");
  const webpSrcset = icon.srcset.map((entry) => `./${entry}`).join(", ");

  return `<picture class="${escapeAttribute(pictureClass)}" data-app-icon="${escapeAttribute(iconId)}"><source type="image/avif" srcset="${escapeAttribute(avifSrcset)}"><source type="image/webp" srcset="${escapeAttribute(webpSrcset)}"><img${imageClass} src="./${escapeAttribute(icon.fallback)}" alt="${escapeAttribute(alt)}" width="${width}" height="${height}" loading="${eager ? "eager" : "lazy"}" decoding="async" fetchpriority="${eager ? "high" : "low"}"></picture>`;
}
