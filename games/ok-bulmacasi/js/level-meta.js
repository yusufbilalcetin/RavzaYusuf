// Bolum kimliginden turetilen ustveri. Seviye verisinde saklanmaz; hem oyun,
// hem bolum secme ekrani, hem de uretec buradan okur.
// Kademeler esit boyutlu DEGILDIR - her biri kendi araligini tasir.
export const TIERS = Object.freeze([
  { name: "Başlangıç", first: 1, last: 10 },
  { name: "Kolay", first: 11, last: 30 },
  { name: "Orta", first: 31, last: 60 },
  { name: "Zor", first: 61, last: 100 },
  { name: "Çok Zor", first: 101, last: 130 },
  { name: "Usta", first: 131, last: 150 }
]);

export const TOTAL_LEVELS = TIERS[TIERS.length - 1].last;
export const CHAPTER_NAMES = Object.freeze(TIERS.map((tier) => tier.name));

export function chapterOf(id) {
  const index = TIERS.findIndex((tier) => id >= tier.first && id <= tier.last);
  return index === -1 ? TIERS.length : index + 1;
}

export function chapterRange(chapter) {
  const tier = TIERS[Math.min(TIERS.length, Math.max(1, chapter)) - 1];
  return { first: tier.first, last: tier.last };
}

export function difficultyLabel(id) {
  return CHAPTER_NAMES[chapterOf(id) - 1];
}

// Bolumun kendi kademesi icindeki ilerlemesi (0..1). Uretec zorlugu bu oranla
// kademe icinde yumusakca buyutur.
export function tierProgress(id) {
  const { first, last } = chapterRange(chapterOf(id));
  return last === first ? 0 : (id - first) / (last - first);
}
