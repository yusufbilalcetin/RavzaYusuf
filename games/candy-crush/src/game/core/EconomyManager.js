import { buyBooster, buyLife, getNextLifeText } from "./ProgressManager.js";

export const CURRENCY_NAME = "Seker Parasi";

export function getWinCoinReward(level, stars) {
  const base = stars >= 3 ? 50 : stars === 2 ? 35 : 20;
  const bonus = level.difficulty === "legendary"
    ? 80
    : level.difficulty === "super_hard"
      ? 45
      : level.difficulty === "hard"
        ? 25
        : 0;
  return base + bonus;
}

export function buyShopBooster(progress, booster) {
  return buyBooster(progress, booster.id, booster.price);
}

export function buyShopLife(progress) {
  return buyLife(progress);
}

export function getLifeTimer(progress) {
  return getNextLifeText(progress);
}
