import levels from "../data/levels.json";
import worlds from "../data/worlds.json";

export function getLevels() {
  return levels;
}

export function getWorlds() {
  return worlds;
}

export function getLevel(levelNumber) {
  return levels.find((level) => level.level === Number(levelNumber)) || levels[0];
}

export function getDifficultyLabel(difficulty) {
  const labels = {
    normal: "Normal",
    hard: "Hard Level",
    super_hard: "Super Hard Level",
    legendary: "Legendary Level"
  };
  return labels[difficulty] || "Normal";
}

export function getDifficultyClass(difficulty) {
  return ["hard", "super_hard", "legendary"].includes(difficulty) ? difficulty : "normal";
}

export function getGoalLabel(level) {
  if (!level?.goal) return "Hedef yok";
  const goal = level.goal;

  if (goal.type === "collect") return formatTargets(goal.targets);
  if (goal.type === "clear_ice") return `${goal.count} buz tabakasi temizle`;
  if (goal.type === "break_chains") return `${goal.count} zincir kir`;
  if (goal.type === "break_crates") return `${goal.count} tas kutu kir`;
  if (goal.type === "clear_darkness") return `${goal.count} karanlik madde temizle`;
  if (goal.type === "drop_relic") return `${goal.count} yildiz tasini indir`;

  if (goal.type === "mixed") {
    return [
      goal.targets ? formatTargets(goal.targets) : "",
      goal.clear ? formatBlockers(goal.clear) : "",
      goal.dropItems ? `${goal.dropItems} yildiz tasini indir` : ""
    ].filter(Boolean).join(" + ");
  }

  return "Kristal hedeflerini tamamla";
}

export function colorLabel(color) {
  const labels = {
    ruby: "yakut",
    sapphire: "safir",
    emerald: "zumrut",
    sunstone: "gunes tasi",
    amethyst: "ametist",
    pearl: "inci"
  };
  return labels[color] || color;
}

export function blockerLabel(type) {
  const labels = {
    ice: "buz",
    chain: "zincir",
    crate: "tas kutu",
    darkness: "karanlik",
    relic: "yildiz tasi",
    dropItems: "yildiz tasi"
  };
  return labels[type] || type;
}

export function isLevelUnlocked(progress, level) {
  return level.level <= progress.maxUnlocked;
}

export function getLevelStars(progress, levelNumber) {
  return Number(progress.stars?.[levelNumber] || 0);
}

function formatTargets(targets = {}) {
  return Object.entries(targets)
    .map(([color, count]) => `${count} ${colorLabel(color)}`)
    .join(" + ");
}

function formatBlockers(targets = {}) {
  return Object.entries(targets)
    .map(([type, count]) => `${count} ${blockerLabel(type)}`)
    .join(" + ");
}
