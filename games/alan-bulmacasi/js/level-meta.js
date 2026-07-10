// Bolum kimliginden turetilen ustveri. Seviye verisinde saklanmaz; hem oyun hem uretec buradan okur.
export const TOTAL_LEVELS = 200;
export const CHAPTER_SIZE = 20;

export const BOSS_LEVELS = new Set([50, 60, 100, 120, 140, 160, 175, 180, 190, 195, 199, 200]);

export const CHAPTER_NAMES = [
  "Başlangıç",
  "Temel Gelişim",
  "Orta Seviye",
  "Stratejik Alanlar",
  "İleri Orta",
  "Zor Seviyeler",
  "Uzmanlık",
  "Usta Seviyeler",
  "Büyük Ustalık",
  "Final"
];

export function chapterOf(id) {
  return Math.ceil(id / CHAPTER_SIZE);
}

export function chapterRange(chapter) {
  return { first: (chapter - 1) * CHAPTER_SIZE + 1, last: chapter * CHAPTER_SIZE };
}

export function isBossLevel(id) {
  return BOSS_LEVELS.has(id);
}

// 141-160 arasinda her 5. bolum nefes aldirir: normal, normal, zor, cok zor, rahatlatici.
export function isReliefLevel(id) {
  return id >= 141 && id <= 160 && id % 5 === 1;
}
