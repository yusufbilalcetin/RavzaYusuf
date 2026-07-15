export const GAME_ICONS = Object.freeze({
  "candy-crush": "./assets/icons/games/candy-crush.png",
  "meyve-eslestirme": "./assets/icons/games/meyve-eslestirme.png",
  "flappy-bird": "./assets/icons/games/flappy-bird.png",
  "boyama": "./assets/icons/games/boyama.png",
  "renk-siralama": "./assets/icons/games/renk-siralama.png",
  "sudoku": "./assets/icons/games/sudoku.png",
  "sans-carki": "./assets/icons/games/sans-carki.png",
  "alan-bulmacasi": "./assets/icons/games/alan-bulmacasi.png",
  "ok-bulmacasi": "./assets/icons/games/ok-bulmacasi.png",
});

export function gameIconPath(gameId) {
  return GAME_ICONS[gameId] || null;
}
