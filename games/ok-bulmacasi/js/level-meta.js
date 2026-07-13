// Bolum kimliginden turetilen ustveri. Seviye verisinde saklanmaz; hem oyun hem uretec buradan okur.
export const TOTAL_LEVELS = 100;
export const CHAPTER_SIZE = 10;

export const CHAPTER_NAMES = [
  "Isınma",
  "İlk Adımlar",
  "Alışkanlık",
  "Sıkı Çalışma",
  "Orta Seviye",
  "Yoğun Tempo",
  "Zorlu Bölüm",
  "Ustalık",
  "Büyük Sınav",
  "Final"
];

export function chapterOf(id) {
  return Math.min(CHAPTER_NAMES.length, Math.ceil(id / CHAPTER_SIZE));
}

export function chapterRange(chapter) {
  return { first: (chapter - 1) * CHAPTER_SIZE + 1, last: chapter * CHAPTER_SIZE };
}

export function difficultyLabel(id) {
  return CHAPTER_NAMES[chapterOf(id) - 1];
}
