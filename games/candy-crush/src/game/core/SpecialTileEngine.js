export const SPECIAL_TYPES = {
  lineH: "Isin Kristali",
  lineV: "Isin Kristali",
  bomb: "Patlayici Kristal",
  rainbow: "Renk Kuresi",
  flying: "Ucan Kristal"
};

export function getSpecialName(type) {
  return SPECIAL_TYPES[type] || "Ozel Kristal";
}
