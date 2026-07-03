import Phaser from "phaser";
import { CRYSTALS, MatchEngine } from "../core/MatchEngine.js";
import { playSound } from "../utils/SoundManager.js";

const SPECIAL_LABELS = {
  lineH: "<>",
  lineV: "||",
  bomb: "*",
  rainbow: "O",
  flying: "^"
};

const BLOCKER_LABELS = {
  ice: "I",
  chain: "Z",
  crate: "K",
  darkness: "D"
};

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init(data) {
    this.level = data.level;
    this.callbacks = data.callbacks || {};
    this.engine = new MatchEngine(this.level);
    this.selected = null;
    this.activeBooster = null;
    this.finished = false;
    this.boardLayer = null;
    this.metrics = null;
    this.pointerStart = null;
    this.hasRenderedBoard = false;
  }

  create() {
    this.cameras.main.setBackgroundColor("#100719");
    this.scale.on("resize", this.renderBoard, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.callbacks.onSceneReady?.(this);
    this.emitStats();
    this.renderBoard({ animate: true });
  }

  activateBooster(boosterId) {
    if (this.finished) return;

    if (boosterId === "extraMoves") {
      if (!this.callbacks.onSpendBooster?.(boosterId)) return;
      const result = this.engine.addMoves(5);
      this.flashMessage("5 hamle eklendi.");
      this.completeAction(result);
      return;
    }

    if (boosterId === "targetFly") {
      if (!this.callbacks.onSpendBooster?.(boosterId)) return;
      const result = this.engine.applyTargetFly();
      this.completeAction(result);
      return;
    }

    this.activeBooster = boosterId;
    this.selected = null;
    const labels = {
      hammer: "Cekic: kirmak istedigin hucreyi sec.",
      freeSwap: "Serbest Degisim: iki komsu kristali sec.",
      colorBlast: "Renk Temizleyici: temizlenecek rengi sec."
    };
    this.engine.message = labels[boosterId] || "Booster secildi.";
    this.emitStats();
    this.renderBoard({ animate: false });
  }

  renderBoard(options = {}) {
    if (!this.engine) return;
    const animate = options.animate ?? !this.hasRenderedBoard;
    this.boardLayer?.destroy(true);
    this.boardLayer = this.add.container(0, 0);

    const width = this.scale.width;
    const height = this.scale.height;
    const rows = this.engine.rows;
    const cols = this.engine.cols;
    const boardSize = Math.floor(Math.min(width - 28, height - 28, 680));
    const cellSize = Math.floor(boardSize / Math.max(rows, cols));
    const boardWidth = cellSize * cols;
    const boardHeight = cellSize * rows;
    const originX = Math.floor((width - boardWidth) / 2);
    const originY = Math.floor((height - boardHeight) / 2);
    this.metrics = { originX, originY, cellSize, boardWidth, boardHeight };

    const back = this.add.graphics();
    back.fillStyle(0x1a0d2f, 0.88);
    back.fillRoundedRect(originX - 10, originY - 10, boardWidth + 20, boardHeight + 20, 22);
    back.lineStyle(2, 0x70e6ff, 0.18);
    back.strokeRoundedRect(originX - 10, originY - 10, boardWidth + 20, boardHeight + 20, 22);
    this.boardLayer.add(back);

    this.engine.board.forEach((cell, index) => {
      const { row, col } = this.engine.toRowCol(index);
      const x = originX + col * cellSize;
      const y = originY + row * cellSize;
      this.drawCell(index, cell, x, y, cellSize, animate);
    });
    this.hasRenderedBoard = true;
  }

  drawCell(index, cell, x, y, size, animate = false) {
    const group = this.add.container(x, y);
    const pad = Math.max(4, Math.floor(size * 0.08));
    const inner = size - pad * 2;

    const base = this.add.graphics();
    if (cell.void) {
      base.fillStyle(0x070314, 0.28);
      base.fillRoundedRect(pad, pad, inner, inner, 12);
      group.add(base);
      this.boardLayer.add(group);
      return;
    }

    base.fillStyle(0xffffff, this.selected === index ? 0.24 : 0.10);
    base.fillRoundedRect(pad, pad, inner, inner, 13);
    base.lineStyle(this.selected === index ? 3 : 1, this.selected === index ? 0xffdf7a : 0xffffff, this.selected === index ? 0.9 : 0.16);
    base.strokeRoundedRect(pad, pad, inner, inner, 13);
    group.add(base);

    if (cell.color) {
      const palette = CRYSTALS[cell.color] || CRYSTALS.ruby;
      const crystal = this.add.graphics();
      const cx = size / 2;
      const cy = size / 2;
      const r = inner * 0.34;
      crystal.fillStyle(palette.glow, 0.34);
      crystal.fillCircle(cx, cy, r * 1.2);
      crystal.fillStyle(palette.color, 1);
      crystal.fillPoints([
        new Phaser.Geom.Point(cx, cy - r),
        new Phaser.Geom.Point(cx + r * 0.78, cy),
        new Phaser.Geom.Point(cx, cy + r),
        new Phaser.Geom.Point(cx - r * 0.78, cy)
      ], true);
      crystal.lineStyle(2, 0xffffff, 0.44);
      crystal.strokePoints([
        new Phaser.Geom.Point(cx, cy - r),
        new Phaser.Geom.Point(cx + r * 0.78, cy),
        new Phaser.Geom.Point(cx, cy + r),
        new Phaser.Geom.Point(cx - r * 0.78, cy)
      ], true);
      group.add(crystal);

      if (cell.special) {
        group.add(this.add.text(cx, cy, SPECIAL_LABELS[cell.special] || "+", {
          fontFamily: "Arial, sans-serif",
          fontSize: `${Math.floor(size * 0.30)}px`,
          color: "#ffffff",
          fontStyle: "900"
        }).setOrigin(0.5));
      }
    }

    if (cell.item === "relic") {
      group.add(this.add.text(size / 2, size / 2, "S", {
        fontFamily: "Arial, sans-serif",
        fontSize: `${Math.floor(size * 0.44)}px`,
        color: "#ffe9a8",
        fontStyle: "900"
      }).setOrigin(0.5));
    }

    if (cell.blocker) {
      const blocker = this.add.graphics();
      const color = cell.blocker.type === "ice"
        ? 0xbbe9ff
        : cell.blocker.type === "chain"
          ? 0x45315d
          : cell.blocker.type === "darkness"
            ? 0x090513
            : 0x6e4d35;
      blocker.fillStyle(color, cell.blocker.type === "ice" ? 0.32 : 0.72);
      blocker.fillRoundedRect(pad + 2, pad + 2, inner - 4, inner - 4, 12);
      blocker.lineStyle(2, 0xffffff, cell.blocker.type === "darkness" ? 0.12 : 0.30);
      blocker.strokeRoundedRect(pad + 2, pad + 2, inner - 4, inner - 4, 12);
      group.add(blocker);
      group.add(this.add.text(size / 2, size / 2, BLOCKER_LABELS[cell.blocker.type] || "X", {
        fontFamily: "Arial, sans-serif",
        fontSize: `${Math.floor(size * 0.30)}px`,
        color: "#ffffff",
        fontStyle: "900"
      }).setOrigin(0.5));
    }

    group.setSize(size, size);
    group.setInteractive(new Phaser.Geom.Rectangle(0, 0, size, size), Phaser.Geom.Rectangle.Contains);
    group.on("pointerdown", (pointer) => {
      this.pointerStart = { index, x: pointer.x, y: pointer.y };
    });
    this.boardLayer.add(group);

    if (animate) {
      this.tweens.add({
        targets: group,
        scale: { from: 0.96, to: 1 },
        alpha: { from: 0.9, to: 1 },
        duration: 110,
        ease: "Cubic.easeOut"
      });
    }
  }

  handlePointerUp(pointer) {
    if (!this.pointerStart || this.finished || !this.metrics) return;

    const start = this.pointerStart;
    this.pointerStart = null;
    const dx = pointer.x - start.x;
    const dy = pointer.y - start.y;
    const dragDistance = Math.max(Math.abs(dx), Math.abs(dy));

    if (dragDistance >= 18) {
      const { row, col } = this.engine.toRowCol(start.index);
      const targetRow = row + (Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 1 : -1) : 0);
      const targetCol = col + (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0);
      if (!this.engine.inBounds(targetRow, targetCol)) return;
      this.selected = start.index;
      this.handleCell(this.engine.index(targetRow, targetCol));
      return;
    }

    const tapIndex = this.getIndexAtPointer(pointer);
    if (tapIndex === null) return;
    this.handleCell(tapIndex);
  }

  getIndexAtPointer(pointer) {
    const { originX, originY, cellSize, boardWidth, boardHeight } = this.metrics;
    if (pointer.x < originX || pointer.x > originX + boardWidth || pointer.y < originY || pointer.y > originY + boardHeight) return null;
    const col = Math.floor((pointer.x - originX) / cellSize);
    const row = Math.floor((pointer.y - originY) / cellSize);
    if (!this.engine.inBounds(row, col)) return null;
    return this.engine.index(row, col);
  }

  handleCell(index) {
    if (this.finished) return;
    playSound("click");

    if (this.activeBooster === "hammer") {
      if (!this.callbacks.onSpendBooster?.("hammer")) return;
      const result = this.engine.applyHammer(index);
      this.popEffect(index, 0xfff0a8);
      this.activeBooster = null;
      this.completeAction(result);
      return;
    }

    if (this.activeBooster === "colorBlast") {
      if (!this.callbacks.onSpendBooster?.("colorBlast")) return;
      const result = this.engine.applyColorBlast(index);
      this.popEffect(index, 0xc6f6ff);
      this.activeBooster = null;
      this.completeAction(result);
      return;
    }

    if (this.selected === null) {
      this.selected = index;
      this.engine.message = this.activeBooster === "freeSwap" ? "Ikinci kristali sec." : "Yanindaki bir kristali sec.";
      this.emitStats();
      this.renderBoard({ animate: false });
      return;
    }

    const first = this.selected;
    this.selected = null;

    if (first === index) {
      this.engine.message = "Secim iptal edildi.";
      this.emitStats();
      this.renderBoard({ animate: false });
      return;
    }

    if (this.activeBooster === "freeSwap") {
      if (!this.callbacks.onSpendBooster?.("freeSwap")) return;
      const result = this.engine.trySwap(first, index, { free: true });
      this.activeBooster = null;
      this.completeAction(result);
      return;
    }

    const result = this.engine.trySwap(first, index);
    if (!result.ok) {
      this.shakeBoard();
      this.emitStats();
      this.renderBoard({ animate: false });
      return;
    }
    this.completeAction(result);
  }

  completeAction(result) {
    if (result.cleared > 0) playSound("pop");
    this.emitStats();
    this.renderBoard({ animate: result.cleared > 0 });

    if (result.won) {
      this.finished = true;
      playSound("win");
      this.time.delayedCall(420, () => this.callbacks.onWin?.(this.engine.getStatus()));
    } else if (result.lost) {
      this.finished = true;
      playSound("lose");
      this.time.delayedCall(420, () => this.callbacks.onLose?.(this.engine.getStatus()));
    }
  }

  emitStats() {
    this.callbacks.onStatsChange?.(this.engine.getStatus());
  }

  flashMessage(message) {
    this.engine.message = message;
    this.emitStats();
  }

  popEffect(index, color) {
    if (!this.metrics) return;
    const { row, col } = this.engine.toRowCol(index);
    const { originX, originY, cellSize } = this.metrics;
    const circle = this.add.circle(originX + col * cellSize + cellSize / 2, originY + row * cellSize + cellSize / 2, cellSize * 0.18, color, 0.52);
    this.tweens.add({
      targets: circle,
      scale: 2.2,
      alpha: 0,
      duration: 260,
      ease: "Cubic.easeOut",
      onComplete: () => circle.destroy()
    });
  }

  shakeBoard() {
    if (!this.boardLayer) return;
    this.tweens.add({
      targets: this.boardLayer,
      x: { from: -5, to: 0 },
      duration: 80,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut"
    });
  }
}
