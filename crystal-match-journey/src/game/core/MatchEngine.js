export const CRYSTALS = {
  ruby: { label: "Yakut", color: 0xf25a76, glow: 0xff9ab0 },
  sapphire: { label: "Safir", color: 0x4b8dff, glow: 0xa8c9ff },
  emerald: { label: "Zumrut", color: 0x36d39a, glow: 0xa2ffd8 },
  sunstone: { label: "Gunes Tasi", color: 0xffc857, glow: 0xffe6a0 },
  amethyst: { label: "Ametist", color: 0xa66bff, glow: 0xd9c0ff },
  pearl: { label: "Inci", color: 0xf4f0ff, glow: 0xffffff }
};

const BLOCKER_GOAL_MAP = {
  ice: "ice",
  chain: "chain",
  crate: "crate",
  darkness: "darkness"
};

export class MatchEngine {
  constructor(level) {
    this.level = structuredClone(level);
    this.rows = this.level.rows;
    this.cols = this.level.cols;
    this.colors = this.level.colors;
    this.moves = this.level.moves;
    this.score = 0;
    this.collected = {};
    this.cleared = { ice: 0, chain: 0, crate: 0, darkness: 0 };
    this.relics = 0;
    this.message = this.level.tutorial || "Kristalleri eslestirerek hedefi tamamla.";
    this.board = this.createPlayableBoard();
    this.applyLevelBlockers();
    this.applyPreBoosters(this.level.preBoosters || []);
    this.ensurePlayableBoard();
  }

  getStatus() {
    return {
      level: this.level.level,
      moves: this.moves,
      score: this.score,
      collected: { ...this.collected },
      cleared: { ...this.cleared },
      relics: this.relics,
      message: this.message,
      goalProgress: this.getGoalProgress(),
      goalComplete: this.isGoalComplete(),
      stars: this.calculateStars()
    };
  }

  trySwap(first, second, options = {}) {
    if (!this.areAdjacent(first, second)) return { ok: false, reason: "Yan yana iki kristal sec." };
    if (!options.free && !this.canSwap(first, second)) return { ok: false, reason: "Bu hucre hareket edemez." };

    const firstCell = this.board[first];
    const secondCell = this.board[second];

    if (firstCell.special && secondCell.special) {
      this.consumeMove(options.free ? 0 : 1);
      const cleared = this.activateSpecialCombo(first, second);
      this.afterSuccessfulMove(cleared, "Ozel kristal kombinasyonu patladi.");
      return this.result(true, cleared);
    }

    if (firstCell.special === "rainbow" || secondCell.special === "rainbow") {
      this.consumeMove(options.free ? 0 : 1);
      const targetColor = firstCell.special === "rainbow" ? secondCell.color : firstCell.color;
      const cleared = this.clearColor(targetColor);
      this.afterSuccessfulMove(cleared, "Renk Kuresi ayni renkteki kristalleri temizledi.");
      return this.result(true, cleared);
    }

    this.swap(first, second);
    const matches = this.findAllMatches();

    if (!matches.length && !options.free) {
      this.swap(first, second);
      this.message = "Eslesme olmadi, hamle geri alindi.";
      return this.result(false, 0);
    }

    this.consumeMove(options.free ? 0 : 1);
    const cleared = matches.length ? this.resolveMatches(second) : 0;
    this.afterSuccessfulMove(cleared, options.free ? "Serbest Degisim kullanildi." : `${cleared} kristal temizlendi.`);
    return this.result(true, cleared);
  }

  applyHammer(index) {
    const cell = this.board[index];
    if (!cell || cell.void) return this.result(false, 0);
    const cleared = this.clearCells(new Set([index]), null, 1);
    this.applyGravity();
    this.collectDroppedRelics();
    this.ensurePlayableBoard();
    this.message = "Cekic secilen hucreyi kirdi.";
    return this.result(true, cleared || 1);
  }

  applyColorBlast(index) {
    const color = this.board[index]?.color;
    if (!color) return this.result(false, 0);
    const cleared = this.clearColor(color);
    this.afterSuccessfulMove(cleared, `${CRYSTALS[color]?.label || "Renk"} kristalleri patladi.`);
    return this.result(true, cleared);
  }

  applyTargetFly() {
    const target = this.findPriorityTarget();
    if (target === null) return this.result(false, 0);
    const cleared = this.clearCells(new Set([target]), null, 1);
    this.applyGravity();
    this.collectDroppedRelics();
    this.ensurePlayableBoard();
    this.message = "Ucan Kristal en kritik hedefe vurdu.";
    return this.result(true, cleared || 1);
  }

  addMoves(amount) {
    this.moves += amount;
    this.message = `${amount} hamle eklendi.`;
    return this.result(true, 0);
  }

  canSwap(first, second) {
    const a = this.board[first];
    const b = this.board[second];
    if (!a || !b || a.void || b.void) return false;
    if (this.isSolidBlocker(a) || this.isSolidBlocker(b)) return false;
    if (a.blocker?.type === "chain" || b.blocker?.type === "chain") return false;
    if (a.item === "relic" || b.item === "relic") return false;
    return Boolean(a.color && b.color);
  }

  areAdjacent(first, second) {
    const a = this.toRowCol(first);
    const b = this.toRowCol(second);
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  }

  createPlayableBoard() {
    let board;
    do {
      board = Array.from({ length: this.rows * this.cols }, (_, index) => ({
        color: this.randomColor(),
        special: null,
        blocker: null,
        item: null,
        void: false,
        seed: `${index}-${Math.random()}`
      }));
    } while (this.findMatches(board).length || !this.hasPossibleMove(board));
    return board;
  }

  applyLevelBlockers() {
    for (const empty of this.level.emptyCells || []) {
      const index = this.index(empty.row, empty.col);
      const cell = this.board[index];
      if (cell) Object.assign(cell, { color: null, special: null, blocker: null, item: null, void: true });
    }

    for (const blocker of this.level.blockers || []) {
      const index = this.index(blocker.row, blocker.col);
      const cell = this.board[index];
      if (!cell) continue;
      const type = blocker.type === "stone_box" ? "crate" : blocker.type;

      if (type === "void") {
        Object.assign(cell, { color: null, special: null, blocker: null, item: null, void: true });
      } else if (type === "relic") {
        cell.item = "relic";
        cell.special = null;
      } else if (["ice", "chain"].includes(type)) {
        cell.blocker = { type, hp: blocker.layer || 1 };
      } else if (["crate", "darkness"].includes(type)) {
        Object.assign(cell, {
          color: null,
          special: null,
          item: null,
          blocker: { type, hp: blocker.layer || 1 }
        });
      }
    }
  }

  applyPreBoosters(boosters) {
    boosters.forEach((boosterId) => {
      if (boosterId === "startMoves") this.moves += 3;
      if (boosterId === "startLine") this.placeStartingSpecial(Math.random() > 0.5 ? "lineH" : "lineV");
      if (boosterId === "startBomb") this.placeStartingSpecial("bomb");
      if (boosterId === "startRainbow") this.placeStartingSpecial("rainbow");
    });
  }

  placeStartingSpecial(special) {
    const candidates = this.board
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => cell.color && !cell.blocker && !cell.item && !cell.void);
    if (!candidates.length) return;
    candidates[Math.floor(Math.random() * candidates.length)].cell.special = special;
  }

  findAllMatches(board = this.board) {
    return [...this.findMatches(board), ...this.findSquareMatches(board)];
  }

  findMatches(board = this.board) {
    const groups = [];

    for (let row = 0; row < this.rows; row += 1) {
      let start = 0;
      for (let col = 1; col <= this.cols; col += 1) {
        const current = col < this.cols ? this.matchColor(board[this.index(row, col)]) : null;
        const previous = this.matchColor(board[this.index(row, col - 1)]);
        if (current && current === previous) continue;
        if (previous && col - start >= 3) {
          groups.push({
            color: previous,
            direction: "horizontal",
            cells: range(start, col).map((matchCol) => this.index(row, matchCol))
          });
        }
        start = col;
      }
    }

    for (let col = 0; col < this.cols; col += 1) {
      let start = 0;
      for (let row = 1; row <= this.rows; row += 1) {
        const current = row < this.rows ? this.matchColor(board[this.index(row, col)]) : null;
        const previous = this.matchColor(board[this.index(row - 1, col)]);
        if (current && current === previous) continue;
        if (previous && row - start >= 3) {
          groups.push({
            color: previous,
            direction: "vertical",
            cells: range(start, row).map((matchRow) => this.index(matchRow, col))
          });
        }
        start = row;
      }
    }

    return groups;
  }

  findSquareMatches(board = this.board) {
    const groups = [];
    for (let row = 0; row < this.rows - 1; row += 1) {
      for (let col = 0; col < this.cols - 1; col += 1) {
        const cells = [
          this.index(row, col),
          this.index(row, col + 1),
          this.index(row + 1, col),
          this.index(row + 1, col + 1)
        ];
        const color = this.matchColor(board[cells[0]]);
        if (color && cells.every((index) => this.matchColor(board[index]) === color)) {
          groups.push({ color, direction: "square", cells });
        }
      }
    }
    return groups;
  }

  matchColor(cell) {
    if (!cell || cell.void || this.isSolidBlocker(cell) || cell.item === "relic") return null;
    return cell.color;
  }

  resolveMatches(preferredIndex = null) {
    let totalCleared = 0;
    let groups = this.findAllMatches();
    let cascade = 0;

    while (groups.length) {
      cascade += 1;
      const specialPlan = this.planSpecial(groups, preferredIndex);
      const clearSet = this.expandSpecialClears(groups);
      const cleared = this.clearCells(clearSet, specialPlan, cascade);
      totalCleared += cleared;
      this.applyGravity();
      this.collectDroppedRelics();
      groups = this.findAllMatches();
      preferredIndex = null;
    }

    return totalCleared;
  }

  planSpecial(groups, preferredIndex) {
    const byCell = new Map();
    groups.forEach((group) => {
      group.cells.forEach((cell) => {
        if (!byCell.has(cell)) byCell.set(cell, []);
        byCell.get(cell).push(group);
      });
    });

    for (const [cell, cellGroups] of byCell.entries()) {
      const union = new Set(cellGroups.flatMap((group) => group.cells));
      if (cellGroups.length > 1 && union.size >= 5) {
        const group = cellGroups[0];
        return { index: preferredIndex && union.has(preferredIndex) ? preferredIndex : cell, color: group.color, special: "bomb" };
      }
    }

    const longLine = groups.find((group) => group.direction !== "square" && group.cells.length >= 5);
    if (longLine) {
      return {
        index: longLine.cells.includes(preferredIndex) ? preferredIndex : longLine.cells[0],
        color: longLine.color,
        special: "rainbow"
      };
    }

    const fourLine = groups.find((group) => group.direction !== "square" && group.cells.length >= 4);
    if (fourLine) {
      return {
        index: fourLine.cells.includes(preferredIndex) ? preferredIndex : fourLine.cells[0],
        color: fourLine.color,
        special: fourLine.direction === "horizontal" ? "lineH" : "lineV"
      };
    }

    const square = groups.find((group) => group.direction === "square");
    if (square) {
      return {
        index: square.cells.includes(preferredIndex) ? preferredIndex : square.cells[0],
        color: square.color,
        special: "flying"
      };
    }

    return null;
  }

  expandSpecialClears(groups) {
    const clearSet = new Set(groups.flatMap((group) => group.cells));
    for (const index of [...clearSet]) {
      const cell = this.board[index];
      if (cell?.special === "lineH") {
        const { row } = this.toRowCol(index);
        for (let col = 0; col < this.cols; col += 1) clearSet.add(this.index(row, col));
      }
      if (cell?.special === "lineV") {
        const { col } = this.toRowCol(index);
        for (let row = 0; row < this.rows; row += 1) clearSet.add(this.index(row, col));
      }
      if (cell?.special === "bomb") this.addArea(clearSet, index, 1);
      if (cell?.special === "flying") {
        const target = this.findPriorityTarget();
        if (target !== null) clearSet.add(target);
      }
    }
    return clearSet;
  }

  activateSpecialCombo(first, second) {
    const a = this.board[first];
    const b = this.board[second];
    const clearSet = new Set([first, second]);
    const specials = [a.special, b.special].sort().join("+");

    if (a.special === "rainbow" && b.special === "rainbow") {
      this.board.forEach((cell, index) => {
        if (cell.color && !this.isSolidBlocker(cell)) clearSet.add(index);
      });
    } else if (a.special === "rainbow" || b.special === "rainbow") {
      const other = a.special === "rainbow" ? b : a;
      this.board.forEach((cell, index) => {
        if (cell.color === other.color && !this.isSolidBlocker(cell)) clearSet.add(index);
      });
      if (other.special === "lineH" || other.special === "lineV") {
        [...clearSet].slice(0, 8).forEach((index) => this.addLine(clearSet, index));
      }
      if (other.special === "bomb") {
        [...clearSet].slice(0, 8).forEach((index) => this.addArea(clearSet, index, 1));
      }
    } else if (specials.includes("lineH") || specials.includes("lineV")) {
      if (a.special === "bomb" || b.special === "bomb") {
        [-1, 0, 1].forEach((offset) => {
          const { row, col } = this.toRowCol(second);
          if (this.inBounds(row + offset, col)) this.addRow(clearSet, row + offset);
          if (this.inBounds(row, col + offset)) this.addCol(clearSet, col + offset);
        });
      } else {
        this.addLine(clearSet, second);
      }
    } else if (a.special === "bomb" && b.special === "bomb") {
      this.addArea(clearSet, second, 2);
    } else if (a.special === "flying" || b.special === "flying") {
      const target = this.findPriorityTarget();
      if (target !== null) this.addArea(clearSet, target, 1);
    }

    const cleared = this.clearCells(clearSet, null, 1);
    this.applyGravity();
    this.collectDroppedRelics();
    this.resolveMatches();
    return cleared;
  }

  clearCells(clearSet, specialPlan = null, cascade = 1) {
    let cleared = 0;
    const blockersToDamage = new Set();

    for (const index of clearSet) {
      const cell = this.board[index];
      if (!cell || cell.void) continue;

      this.neighborIndexes(index).forEach((neighbor) => {
        const blocker = this.board[neighbor]?.blocker?.type;
        if (["crate", "darkness"].includes(blocker)) blockersToDamage.add(neighbor);
      });

      if (cell.blocker) {
        if (this.damageBlocker(index)) cleared += 1;
      }

      if (cell.color && !this.isSolidBlocker(cell)) {
        this.collected[cell.color] = (this.collected[cell.color] || 0) + 1;
        cleared += 1;
        Object.assign(cell, { color: null, special: null, item: null, seed: `${index}-${Date.now()}` });
      }
    }

    blockersToDamage.forEach((index) => {
      if (this.damageBlocker(index)) cleared += 1;
    });

    if (specialPlan) {
      const cell = this.board[specialPlan.index];
      if (cell && !cell.void) {
        Object.assign(cell, {
          color: specialPlan.color,
          special: specialPlan.special,
          blocker: null,
          item: null,
          seed: `special-${Date.now()}-${Math.random()}`
        });
      }
    }

    this.score += cleared * 20 * cascade;
    return cleared;
  }

  clearColor(color) {
    if (!color) return 0;
    const clearSet = new Set();
    this.board.forEach((cell, index) => {
      if (cell.color === color && !this.isSolidBlocker(cell)) clearSet.add(index);
    });
    const cleared = this.clearCells(clearSet, null, 1);
    this.applyGravity();
    this.collectDroppedRelics();
    this.resolveMatches();
    return cleared;
  }

  damageBlocker(index) {
    const cell = this.board[index];
    if (!cell?.blocker) return false;
    cell.blocker.hp -= 1;
    if (cell.blocker.hp > 0) return false;

    const type = cell.blocker.type;
    cell.blocker = null;
    if (BLOCKER_GOAL_MAP[type]) this.cleared[BLOCKER_GOAL_MAP[type]] += 1;
    if (["crate", "darkness"].includes(type)) {
      cell.color = null;
      cell.special = null;
      cell.item = null;
    }
    return true;
  }

  applyGravity() {
    for (let col = 0; col < this.cols; col += 1) {
      const movable = [];
      for (let row = this.rows - 1; row >= 0; row -= 1) {
        const index = this.index(row, col);
        const cell = this.board[index];
        if (cell.void || this.isSolidBlocker(cell)) continue;
        if (cell.color || cell.item === "relic") {
          movable.push({ color: cell.color, special: cell.special, item: cell.item, seed: cell.seed });
        }
        cell.color = null;
        cell.special = null;
        cell.item = null;
      }

      for (let row = this.rows - 1; row >= 0; row -= 1) {
        const index = this.index(row, col);
        const cell = this.board[index];
        if (cell.void || this.isSolidBlocker(cell)) continue;
        const next = movable.shift();
        if (next) {
          Object.assign(cell, next);
        } else {
          cell.color = this.randomColor();
          cell.special = null;
          cell.item = null;
          cell.seed = `new-${index}-${Date.now()}-${Math.random()}`;
        }
      }
    }
  }

  collectDroppedRelics() {
    for (let col = 0; col < this.cols; col += 1) {
      for (let row = this.rows - 1; row >= 0; row -= 1) {
        const index = this.index(row, col);
        const cell = this.board[index];
        if (cell?.item === "relic") {
          this.relics += 1;
          cell.item = null;
          cell.color = this.randomColor();
          cell.special = null;
          this.score += 250;
          break;
        }
        if (!cell?.void) break;
      }
    }
  }

  spreadDarkness() {
    const darkCells = this.board
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => cell.blocker?.type === "darkness");
    if (!darkCells.length) return;

    const candidates = [];
    darkCells.forEach(({ index }) => {
      this.neighborIndexes(index).forEach((neighbor) => {
        const cell = this.board[neighbor];
        if (cell && !cell.void && !cell.blocker && !cell.item) candidates.push(neighbor);
      });
    });

    if (!candidates.length) return;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    Object.assign(this.board[target], { color: null, special: null, item: null, blocker: { type: "darkness", hp: 1 } });
  }

  afterSuccessfulMove(cleared, message) {
    if ((this.level.blockers || []).some((blocker) => blocker.type === "darkness") && !this.cleared.darkness) {
      this.spreadDarkness();
    }
    this.ensurePlayableBoard();
    this.message = message;
    if (this.isGoalComplete()) this.message = "Hedef tamamlandi. Ada yolu acildi.";
  }

  ensurePlayableBoard() {
    if (this.hasPossibleMove(this.board)) return;
    this.message = "Tahtada hamle kalmadi, kristaller yeniden dizildi.";
    for (let attempt = 0; attempt < 120; attempt += 1) {
      this.board.forEach((cell, index) => {
        if (!cell || cell.void || this.isSolidBlocker(cell) || cell.item === "relic") return;
        cell.color = this.randomColor();
        cell.special = null;
        cell.seed = `shuffle-${attempt}-${index}-${Math.random()}`;
      });
      if (!this.findAllMatches().length && this.hasPossibleMove(this.board)) return;
    }

    const freeIndexes = this.board
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => cell?.color && !cell.void && !this.isSolidBlocker(cell) && cell.blocker?.type !== "chain" && cell.item !== "relic")
      .map(({ index }) => index);
    if (freeIndexes.length >= 3) {
      const color = this.board[freeIndexes[0]].color || this.randomColor();
      freeIndexes.slice(0, 3).forEach((index) => {
        this.board[index].color = color;
        this.board[index].special = null;
      });
    }
  }

  hasPossibleMove(board = this.board) {
    for (let index = 0; index < board.length; index += 1) {
      const cell = board[index];
      if (!cell || cell.void || this.isSolidBlocker(cell) || cell.blocker?.type === "chain" || cell.item === "relic") continue;
      const { row, col } = this.toRowCol(index);
      const neighbors = [];
      if (col < this.cols - 1) neighbors.push(this.index(row, col + 1));
      if (row < this.rows - 1) neighbors.push(this.index(row + 1, col));
      for (const neighbor of neighbors) {
        const other = board[neighbor];
        if (!other || other.void || this.isSolidBlocker(other) || other.blocker?.type === "chain" || other.item === "relic") continue;
        const test = board.map((item) => ({ ...item, blocker: item.blocker ? { ...item.blocker } : null }));
        [test[index], test[neighbor]] = [test[neighbor], test[index]];
        if (this.findAllMatches(test).length) return true;
      }
    }
    return false;
  }

  isGoalComplete() {
    const goal = this.level.goal;
    if (!goal) return false;

    if (goal.type === "collect") return everyTargetMet(goal.targets, this.collected);
    if (goal.type === "clear_ice") return this.cleared.ice >= goal.count;
    if (goal.type === "break_chains") return this.cleared.chain >= goal.count;
    if (goal.type === "break_crates") return this.cleared.crate >= goal.count;
    if (goal.type === "clear_darkness") return this.cleared.darkness >= goal.count;
    if (goal.type === "drop_relic") return this.relics >= goal.count;

    if (goal.type === "mixed") {
      const collectMet = goal.targets ? everyTargetMet(goal.targets, this.collected) : true;
      const clearMet = goal.clear ? Object.entries(goal.clear).every(([type, count]) => (this.cleared[type] || 0) >= count) : true;
      const dropMet = goal.dropItems ? this.relics >= goal.dropItems : true;
      return collectMet && clearMet && dropMet;
    }

    return false;
  }

  getGoalProgress() {
    const goal = this.level.goal;
    if (!goal) return [];

    if (goal.type === "collect") return toProgress(goal.targets, this.collected);
    if (goal.type === "clear_ice") return [{ key: "ice", current: this.cleared.ice, target: goal.count }];
    if (goal.type === "break_chains") return [{ key: "chain", current: this.cleared.chain, target: goal.count }];
    if (goal.type === "break_crates") return [{ key: "crate", current: this.cleared.crate, target: goal.count }];
    if (goal.type === "clear_darkness") return [{ key: "darkness", current: this.cleared.darkness, target: goal.count }];
    if (goal.type === "drop_relic") return [{ key: "relic", current: this.relics, target: goal.count }];

    if (goal.type === "mixed") {
      return [
        ...(goal.targets ? toProgress(goal.targets, this.collected) : []),
        ...(goal.clear ? toProgress(goal.clear, this.cleared) : []),
        ...(goal.dropItems ? [{ key: "relic", current: this.relics, target: goal.dropItems }] : [])
      ];
    }

    return [];
  }

  calculateStars() {
    const base = this.score + this.moves * 40;
    const one = this.level.moves * 80;
    const two = this.level.moves * 130;
    const three = this.level.moves * 180;
    if (base >= three) return 3;
    if (base >= two) return 2;
    if (base >= one) return 1;
    return this.isGoalComplete() ? 1 : 0;
  }

  findPriorityTarget() {
    const blockerTarget = this.board.findIndex((cell) => cell?.blocker);
    if (blockerTarget >= 0) return blockerTarget;
    const relicTarget = this.board.findIndex((cell) => cell?.item === "relic");
    if (relicTarget >= 0) return relicTarget;
    const goalColor = Object.keys(this.level.goal?.targets || {})[0];
    if (goalColor) {
      const colorTarget = this.board.findIndex((cell) => cell?.color === goalColor && !cell.blocker);
      if (colorTarget >= 0) return colorTarget;
    }
    return this.board.findIndex((cell) => cell?.color && !cell.blocker && !cell.void);
  }

  addLine(clearSet, index) {
    const { row, col } = this.toRowCol(index);
    this.addRow(clearSet, row);
    this.addCol(clearSet, col);
  }

  addRow(clearSet, row) {
    for (let col = 0; col < this.cols; col += 1) clearSet.add(this.index(row, col));
  }

  addCol(clearSet, col) {
    for (let row = 0; row < this.rows; row += 1) clearSet.add(this.index(row, col));
  }

  addArea(clearSet, index, radius) {
    const { row, col } = this.toRowCol(index);
    for (let r = row - radius; r <= row + radius; r += 1) {
      for (let c = col - radius; c <= col + radius; c += 1) {
        if (this.inBounds(r, c)) clearSet.add(this.index(r, c));
      }
    }
  }

  consumeMove(amount = 1) {
    this.moves = Math.max(0, this.moves - amount);
  }

  result(ok, cleared) {
    return {
      ok,
      cleared,
      status: this.getStatus(),
      won: this.isGoalComplete(),
      lost: this.moves <= 0 && !this.isGoalComplete()
    };
  }

  swap(first, second) {
    [this.board[first], this.board[second]] = [this.board[second], this.board[first]];
  }

  isSolidBlocker(cell) {
    return ["crate", "darkness"].includes(cell?.blocker?.type);
  }

  neighborIndexes(index) {
    const { row, col } = this.toRowCol(index);
    return [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1]
    ].filter(([r, c]) => this.inBounds(r, c)).map(([r, c]) => this.index(r, c));
  }

  toRowCol(index) {
    return { row: Math.floor(index / this.cols), col: index % this.cols };
  }

  index(row, col) {
    return row * this.cols + col;
  }

  inBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  randomColor() {
    return this.colors[Math.floor(Math.random() * this.colors.length)];
  }
}

function everyTargetMet(targets, source) {
  return Object.entries(targets || {}).every(([key, target]) => (source[key] || 0) >= target);
}

function toProgress(targets, source) {
  return Object.entries(targets || {}).map(([key, target]) => ({
    key,
    current: Math.min(source[key] || 0, target),
    target
  }));
}

function range(start, end) {
  return Array.from({ length: end - start }, (_, offset) => start + offset);
}
