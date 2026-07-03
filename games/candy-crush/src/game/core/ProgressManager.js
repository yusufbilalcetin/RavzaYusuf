const STORAGE_KEY = "candy_crush_progress_v3";
const MAX_LIVES = 5;
const LIFE_REFILL_MS = 30 * 60 * 1000;
const DAILY_ACCEPT_LIMIT = 20;
const MAILBOX_LIMIT = 200;

const DEFAULT_BOOSTERS = {
  hammer: 2,
  freeSwap: 1,
  colorBlast: 1,
  targetFly: 1,
  extraMoves: 1,
  startLine: 1,
  startBomb: 1,
  startRainbow: 0,
  startMoves: 1
};

const DEFAULT_SETTINGS = {
  sound: true,
  music: false,
  reducedMotion: false
};

const DEFAULT_PROGRESS = {
  currentLevel: 1,
  maxUnlocked: 1,
  unlockedLevels: [1],
  stars: {},
  coins: 220,
  lives: MAX_LIVES,
  lastLifeRefillTime: Date.now(),
  boosters: DEFAULT_BOOSTERS,
  dailyRewardLastClaim: null,
  dailyRewardStreak: 0,
  mailboxLives: 0,
  acceptedLivesToday: 0,
  acceptedLivesDate: todayKey(),
  settings: DEFAULT_SETTINGS
};

export function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return applyLifeRefill(normalizeProgress(saved));
  } catch {
    return cloneDefault();
  }
}

export function saveProgress(progress) {
  const next = normalizeProgress(progress);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
  return cloneDefault();
}

export function recordWin(progress, level, starsEarned) {
  const next = normalizeProgress(progress);
  const levelNumber = Number(level.level || level);
  const stars = Math.max(1, Math.min(3, Number(starsEarned || 1)));
  const existingStars = Number(next.stars[levelNumber] || 0);
  const improvedStars = Math.max(existingStars, stars);
  const baseReward = stars === 3 ? 50 : stars === 2 ? 35 : 20;
  const difficultyBonus = level.difficulty === "legendary"
    ? 80
    : level.difficulty === "super_hard"
      ? 45
      : level.difficulty === "hard"
        ? 25
        : 0;

  next.stars[levelNumber] = improvedStars;
  next.currentLevel = Math.max(next.currentLevel, levelNumber + 1);
  next.maxUnlocked = Math.max(next.maxUnlocked, levelNumber + 1);
  next.unlockedLevels = uniqueRange(next.maxUnlocked);
  next.coins += baseReward + difficultyBonus;
  saveProgress(next);
  return { progress: next, coinReward: baseReward + difficultyBonus };
}

export function recordLoss(progress) {
  const next = applyLifeRefill(normalizeProgress(progress));
  next.lives = Math.max(0, next.lives - 1);
  if (next.lives < MAX_LIVES && !next.lastLifeRefillTime) next.lastLifeRefillTime = Date.now();
  saveProgress(next);
  return next;
}

export function canStartLevel(progress) {
  return applyLifeRefill(normalizeProgress(progress)).lives > 0;
}

export function getNextLifeText(progress) {
  const next = applyLifeRefill(normalizeProgress(progress));
  if (next.lives >= MAX_LIVES) return "Can dolu";
  const elapsed = Date.now() - Number(next.lastLifeRefillTime || Date.now());
  const remaining = Math.max(0, LIFE_REFILL_MS - elapsed);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function spendBooster(progress, boosterId) {
  const next = normalizeProgress(progress);
  if ((next.boosters[boosterId] || 0) <= 0) return { ok: false, progress: next };
  next.boosters[boosterId] -= 1;
  saveProgress(next);
  return { ok: true, progress: next };
}

export function addBooster(progress, boosterId, amount = 1) {
  const next = normalizeProgress(progress);
  next.boosters[boosterId] = (next.boosters[boosterId] || 0) + amount;
  saveProgress(next);
  return next;
}

export function buyBooster(progress, boosterId, price = 90) {
  const next = normalizeProgress(progress);
  if (next.coins < price) return { ok: false, progress: next };
  next.coins -= price;
  next.boosters[boosterId] = (next.boosters[boosterId] || 0) + 1;
  saveProgress(next);
  return { ok: true, progress: next };
}

export function buyLife(progress, cost = 80) {
  const next = applyLifeRefill(normalizeProgress(progress));
  if (next.coins < cost || next.lives >= MAX_LIVES) return { ok: false, progress: next };
  next.coins -= cost;
  next.lives = Math.min(MAX_LIVES, next.lives + 1);
  saveProgress(next);
  return { ok: true, progress: next };
}

export function grantAdLife(progress) {
  const next = applyLifeRefill(normalizeProgress(progress));
  next.lives = Math.min(MAX_LIVES, next.lives + 1);
  saveProgress(next);
  return next;
}

export function requestFriendLife(progress) {
  const next = normalizeProgress(progress);
  next.mailboxLives = Math.min(MAILBOX_LIMIT, next.mailboxLives + 3);
  saveProgress(next);
  return next;
}

export function acceptMailboxLife(progress) {
  const next = applyLifeRefill(normalizeProgress(progress));
  resetAcceptedLimitIfNeeded(next);
  if (next.mailboxLives <= 0 || next.acceptedLivesToday >= DAILY_ACCEPT_LIMIT || next.lives >= MAX_LIVES) {
    saveProgress(next);
    return { ok: false, progress: next };
  }
  next.mailboxLives -= 1;
  next.acceptedLivesToday += 1;
  next.lives += 1;
  saveProgress(next);
  return { ok: true, progress: next };
}

export function canClaimDailyReward(progress = loadProgress()) {
  return normalizeProgress(progress).dailyRewardLastClaim !== todayKey();
}

export function claimDailyReward(progress) {
  const next = normalizeProgress(progress);
  const today = todayKey();
  if (next.dailyRewardLastClaim === today) {
    return { claimed: false, progress: next, reward: null };
  }

  const yesterday = dateKey(Date.now() - 24 * 60 * 60 * 1000);
  next.dailyRewardStreak = next.dailyRewardLastClaim === yesterday
    ? (next.dailyRewardStreak % 7) + 1
    : 1;

  const rewards = [
    { day: 1, type: "coins", amount: 50, label: "50 Seker Parasi" },
    { day: 2, type: "booster", id: "hammer", amount: 1, label: "1 Cekic" },
    { day: 3, type: "coins", amount: 75, label: "75 Seker Parasi" },
    { day: 4, type: "booster", id: "freeSwap", amount: 1, label: "1 Serbest Degisim" },
    { day: 5, type: "booster", id: "colorBlast", amount: 1, label: "1 Renk Temizleyici" },
    { day: 6, type: "coins", amount: 100, label: "100 Seker Parasi" },
    { day: 7, type: "bundle", label: "Buyuk Sandik" }
  ];
  const reward = rewards[next.dailyRewardStreak - 1];

  if (reward.type === "coins") {
    next.coins += reward.amount;
  } else if (reward.type === "booster") {
    next.boosters[reward.id] = (next.boosters[reward.id] || 0) + reward.amount;
  } else {
    next.coins += 150;
    next.boosters.hammer += 1;
    next.boosters.colorBlast += 1;
    next.boosters.startRainbow += 1;
  }

  next.dailyRewardLastClaim = today;
  saveProgress(next);
  return { claimed: true, progress: next, reward };
}

export function updateSettings(progress, patch) {
  const next = normalizeProgress(progress);
  next.settings = { ...next.settings, ...patch };
  saveProgress(next);
  return next;
}

export function applyLifeRefill(progress) {
  const next = normalizeProgress(progress);
  if (next.lives >= MAX_LIVES) {
    next.lastLifeRefillTime = Date.now();
    saveProgress(next);
    return next;
  }

  const last = Number(next.lastLifeRefillTime || Date.now());
  const elapsed = Date.now() - last;
  if (elapsed < LIFE_REFILL_MS) return next;

  const gained = Math.floor(elapsed / LIFE_REFILL_MS);
  next.lives = Math.min(MAX_LIVES, next.lives + gained);
  next.lastLifeRefillTime = next.lives >= MAX_LIVES
    ? Date.now()
    : last + gained * LIFE_REFILL_MS;
  saveProgress(next);
  return next;
}

function normalizeProgress(progress) {
  const base = progress && typeof progress === "object" ? progress : cloneDefault();
  const maxUnlocked = Math.max(1, Number(base.maxUnlocked || base.currentLevel || 1));
  const normalized = {
    currentLevel: Math.max(1, Number(base.currentLevel || maxUnlocked)),
    maxUnlocked,
    unlockedLevels: Array.isArray(base.unlockedLevels) && base.unlockedLevels.length
      ? base.unlockedLevels.map(Number).filter(Boolean)
      : uniqueRange(maxUnlocked),
    stars: { ...(base.stars || {}) },
    coins: Math.max(0, Number(base.coins ?? DEFAULT_PROGRESS.coins)),
    lives: Math.max(0, Math.min(MAX_LIVES, Number(base.lives ?? MAX_LIVES))),
    lastLifeRefillTime: Number(base.lastLifeRefillTime || Date.now()),
    boosters: normalizeBoosters(base.boosters),
    dailyRewardLastClaim: base.dailyRewardLastClaim || null,
    dailyRewardStreak: Math.max(0, Math.min(7, Number(base.dailyRewardStreak || 0))),
    mailboxLives: Math.max(0, Math.min(MAILBOX_LIMIT, Number(base.mailboxLives || 0))),
    acceptedLivesToday: Math.max(0, Math.min(DAILY_ACCEPT_LIMIT, Number(base.acceptedLivesToday || 0))),
    acceptedLivesDate: base.acceptedLivesDate || todayKey(),
    settings: { ...DEFAULT_SETTINGS, ...(base.settings || {}) }
  };
  resetAcceptedLimitIfNeeded(normalized);
  return normalized;
}

function normalizeBoosters(boosters = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_BOOSTERS).map(([id, amount]) => [
      id,
      Math.max(0, Number(boosters?.[id] ?? amount))
    ])
  );
}

function resetAcceptedLimitIfNeeded(progress) {
  const today = todayKey();
  if (progress.acceptedLivesDate !== today) {
    progress.acceptedLivesDate = today;
    progress.acceptedLivesToday = 0;
  }
}

function uniqueRange(max) {
  return Array.from({ length: max }, (_, index) => index + 1);
}

function cloneDefault() {
  return normalizeProgress(structuredClone(DEFAULT_PROGRESS));
}

function todayKey() {
  return dateKey(Date.now());
}

function dateKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}
