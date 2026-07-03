import { MatchEngine } from "./MatchEngine.js";

export function createBoardForLevel(level) {
  return new MatchEngine(level);
}

export function hasPlayableMove(engine) {
  return engine.hasPossibleMove(engine.board);
}

export function shuffleIfNeeded(engine) {
  engine.ensurePlayableBoard();
  return engine.board;
}
