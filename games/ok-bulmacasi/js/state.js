// Oyun state makinesi. DOM'a hic dokunmaz - render ve main katmanlari buradan okur.
import { getLevel, TOTAL_LEVELS } from "./levels.js";
import { blockersForPiece, getPullablePieces, isPullable, movementResult } from "./engine.js";

export const START_LIVES = 3;

export const PULL_OK = "pull";
export const PULL_BLOCKED = "blocked";
export const PULL_IGNORED = "ignored";

export function clampLevelId(id) {
  return Math.min(TOTAL_LEVELS, Math.max(1, Number.isInteger(id) ? id : 1));
}

export function createGame(levelId, options = {}) {
  const id = clampLevelId(levelId);
  const level = getLevel(id);
  return {
    levelId: id,
    level,
    // Parca nesneleri kopyalanir; seviye verisi (LEVELS) hicbir zaman mutasyona ugramaz.
    pieces: level.pieces.map((piece) => ({ ...piece })),
    lives: START_LIVES,
    status: "playing", // "playing" | "won" | "lost"
    zen: Boolean(options.zen),
    startedAt: Date.now(),
    errors: 0,
    hints: 0,
    history: []
  };
}

export function remainingIdsOf(game) {
  return new Set(game.pieces.map((piece) => piece.id));
}

export function pullablePieces(game) {
  return getPullablePieces(game.level.pieces, remainingIdsOf(game), game.level);
}

// Bir parcaya dokunuldugunda cagrilir. Parca cekilebiliyorsa state'ten ANINDA
// dusurulur - cikis animasyonu tamamen gorsel katmanda kalir. Boylece animasyon
// suresince gelen hizli dokunuslar, zaten cekilmis bir parcaya karsi engel
// hesaplayamaz.
export function attemptPull(game, pieceId) {
  if (game.status !== "playing") return { result: PULL_IGNORED };

  const piece = game.pieces.find((item) => item.id === pieceId);
  if (!piece) return { result: PULL_IGNORED };

  const remaining = remainingIdsOf(game);
  if (!isPullable(piece, remaining, game.level)) {
    const collision = movementResult(game.level, piece, remaining);
    game.errors += 1;
    if (!game.zen) game.lives -= 1;
    if (game.lives <= 0) game.status = "lost";
    return {
      result: PULL_BLOCKED,
      piece,
      blockers: blockersForPiece(game.level, piece, remaining).map((item) => item.id),
      collision,
      lost: game.status === "lost"
    };
  }

  game.status = "animating";
  game.animatingPieceId = piece.id;
  return { result: PULL_OK, piece, won: game.pieces.length === 1 };
}

export function commitPull(game, pieceId) {
  if (game.status !== "animating" || game.animatingPieceId !== pieceId) return { committed: false };
  const piece = game.pieces.find((item) => item.id === pieceId);
  if (!piece) return { committed: false };
  game.history.push(piece.id);
  game.pieces = game.pieces.filter((item) => item.id !== piece.id);
  game.animatingPieceId = null;
  game.status = game.pieces.length === 0 ? "won" : "playing";
  return { committed: true, piece, won: game.status === "won" };
}

export function undoPull(game) {
  if (game.status !== "playing" || game.history.length === 0) return null;
  const pieceId = game.history.pop();
  const original = game.level.pieces.find((piece) => piece.id === pieceId);
  if (!original) return null;
  game.pieces = [...game.pieces, { ...original }].sort((a, b) => a.id - b.id);
  return original;
}

export function restartGame(game) {
  const isDaily = game.isDaily;
  const fresh = createGame(game.levelId, { zen: game.zen });
  Object.assign(game, fresh);
  game.isDaily = isDaily;
  return game;
}

export function useHint(game) {
  if (game.status !== "playing") return null;
  const safe = pullablePieces(game);
  if (!safe.length) return null;
  const previous = game.lastHintId;
  const index = Math.max(0, safe.findIndex((piece) => piece.id === previous));
  const selected = safe[(index + (previous == null ? 0 : 1)) % safe.length];
  game.lastHintId = selected.id;
  game.hints += 1;
  return selected;
}

export function gameStats(game) {
  return {
    lives: game.lives,
    errors: game.errors,
    hints: game.hints,
    elapsedMs: Math.max(0, Date.now() - game.startedAt),
    perfect: game.errors === 0 && game.hints === 0
  };
}
