const catalog = [
  {
    id: "candy-crush",
    name: "Candy Crush",
    icon: "assets/icons/games/candy-crush.png",
    path: "?page=oyun&game=candy-match",
    standalonePath: "games/candy-crush/dist/",
    order: 1,
    status: "active",
    launchMode: "embedded",
    handlerId: "candy-match",
    launcherId: "candy-match",
    tone: "game",
    badge: "SONSUZ",
    subtitle: "Yan yana iki şekeri değiştir. Üçlü veya daha fazla eşleşme puan verir; hamle sınırı yok.",
    keywords: ["şeker", "eşleştirme"]
  },
  {
    id: "meyve-eslestirme",
    name: "Meyve Eşleştirme",
    icon: "assets/icons/games/meyve-eslestirme.png",
    path: "?page=oyun&game=fruit-match",
    standalonePath: "games/meyve-eslestirme/dist/",
    order: 2,
    status: "active",
    launchMode: "embedded",
    handlerId: "fruit-match",
    launcherId: "fruit-match",
    tone: "game",
    badge: "100 BÖLÜM",
    subtitle: "Açık meyve taşlarını eşleştir, tüm tahtayı temizle ve yıldızları topla.",
    keywords: ["meyve", "eşleştirme"]
  },
  {
    id: "flappy-bird",
    name: "Flappy Bird",
    icon: "assets/icons/games/flappy-bird.png",
    path: "?page=oyun&game=flappy-bird",
    order: 3,
    status: "active",
    launchMode: "embedded",
    handlerId: "flappy-bird",
    launcherId: "flappy-bird",
    tone: "game",
    badge: "SONSUZ",
    subtitle: "Ekrana dokun veya boşluk tuşuna bas, kuşu boruların arasından geçir.",
    keywords: ["kuş", "refleks"]
  },
  {
    id: "boyama",
    name: "Boyama",
    icon: "assets/icons/games/boyama.png",
    path: "?page=oyun&game=boyama",
    order: 4,
    status: "active",
    launchMode: "embedded",
    handlerId: "boyama",
    launcherId: "boyama",
    tone: "game",
    badge: "YENİ NESİL",
    subtitle: "Fotoğrafını yükle, piksel piksel numaraya göre boya.",
    keywords: ["renk", "çizim"]
  },
  {
    id: "renk-siralama",
    name: "Renk Sıralama",
    icon: "assets/icons/games/renk-siralama.png",
    path: "?page=oyun&game=renk-siralama",
    order: 5,
    status: "active",
    launchMode: "embedded",
    handlerId: "renk-siralama",
    launcherId: "renk-siralama",
    tone: "game",
    badge: "SONSUZ SEVİYE",
    subtitle: "Renkli sıvıları cam tüplerde tek renge ayır. Seviyeler sonsuz, her biri çözülebilir.",
    keywords: ["renk", "sıralama"]
  },
  {
    id: "sudoku",
    name: "Sudoku",
    icon: "assets/icons/games/sudoku.png",
    path: "?page=oyun&game=sudoku",
    order: 6,
    status: "active",
    launchMode: "embedded",
    handlerId: "sudoku",
    launcherId: "sudoku",
    tone: "blue",
    badge: "BULMACA",
    subtitle: "Her satır, sütun ve 3×3 blokta 1–9 rakamları birer kez olacak şekilde tahtayı doldur.",
    keywords: ["sayı", "bulmaca"]
  },
  {
    id: "sans-carki",
    name: "Şans Çarkı",
    icon: "assets/icons/games/sans-carki.png",
    path: "games/cark-oyunu/",
    order: 7,
    status: "active",
    launchMode: "link",
    launcherId: "chance-wheel",
    tone: "rose",
    badge: "ÇARK",
    subtitle: "Çarkı çevir ve sonucu keşfet.",
    keywords: ["şans", "çark", "çevir"]
  },
  {
    id: "alan-bulmacasi",
    name: "Alan Bulmacası",
    icon: "assets/icons/games/alan-bulmacasi.png",
    path: "games/alan-bulmacasi/",
    order: 8,
    status: "active",
    launchMode: "link",
    launcherId: "area-puzzle",
    tone: "amber",
    badge: "200 BÖLÜM",
    subtitle: "Alanları hesapla ve bütün bölümleri tamamla.",
    keywords: ["alan", "bulmaca", "matematik"]
  },
  {
    id: "ok-bulmacasi",
    name: "Ok Bulmacası",
    icon: "assets/icons/games/ok-bulmacasi.png",
    path: "games/ok-bulmacasi/",
    order: 9,
    status: "active",
    launchMode: "link",
    launcherId: "arrow-puzzle",
    tone: "burgundy",
    badge: "100 BÖLÜM",
    subtitle: "Okların yönünü çöz ve tahtayı temizle.",
    keywords: ["ok", "bulmaca", "yön"]
  }
];

export const GAMES = Object.freeze(catalog
  .sort((first, second) => first.order - second.order)
  .map((game) => Object.freeze({
    ...game,
    keywords: Object.freeze([...(game.keywords || [])])
  })));

export const ACTIVE_GAMES = Object.freeze(GAMES.filter((game) => game.status === "active"));

export function findGame(gameId) {
  return GAMES.find((game) => game.id === gameId || game.handlerId === gameId || game.launcherId === gameId) || null;
}
