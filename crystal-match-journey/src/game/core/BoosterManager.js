import boosters from "../data/boosters.json";

export const BOOSTERS = boosters;
export const PRE_LEVEL_BOOSTERS = boosters.filter((booster) => booster.category === "pre");
export const IN_GAME_BOOSTERS = boosters.filter((booster) => booster.category === "in_game" || booster.id === "extraMoves");

export function getBooster(id) {
  return BOOSTERS.find((booster) => booster.id === id);
}

export function getBoosterPrice(id) {
  return getBooster(id)?.price || 100;
}
