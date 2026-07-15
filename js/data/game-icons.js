import { GAMES } from "../../data/games.js";

export const GAME_ICONS = Object.freeze(Object.fromEntries(
  GAMES.map((game) => [game.id, `./${game.icon}`])
));

export function gameIconPath(gameId) {
  return GAME_ICONS[gameId] || null;
}
