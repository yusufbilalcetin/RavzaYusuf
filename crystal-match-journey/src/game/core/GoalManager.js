import { getGoalLabel } from "./LevelManager.js";

export function describeGoal(level) {
  return getGoalLabel(level);
}

export function isGoalComplete(status) {
  return Boolean(status?.goalComplete);
}

export function remainingGoals(status) {
  return (status?.goalProgress || []).map((item) => ({
    ...item,
    remaining: Math.max(0, item.target - item.current)
  }));
}
