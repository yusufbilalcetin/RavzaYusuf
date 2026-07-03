import Phaser from "phaser";
import { MatchEngine } from "../core/MatchEngine.js";
import { playSound, vibrate } from "../utils/SoundManager.js";

const CANDY_STYLES = {
  ruby: { fill: 0xff435b, shadow: 0xb70e2d, shine: 0xffd8df, type: "stripe" },
  sapphire: { fill: 0x1598ff, shadow: 0x0757c9, shine: 0xc6efff, type: "sphere" },
  emerald: { fill: 0x27d83d, shadow: 0x087d1b, shine: 0xd6ffdc, type: "square" },
  sunstone: { fill: 0xff981f, shadow: 0xb94e05, shine: 0xffe0a1, type: "drop" },
  amethyst: { fill: 0xce22ff, shadow: 0x7d0fb8, shine: 0xffc7ff, type: "cluster" },
  pearl: { fill: 0xffd451, shadow: 0xc17d06, shine: 0xffffff, type: "lozenge" }
};

const BOOSTER_MESSAGES = {
  hammer: "Cekic: kirmak istedigin hucreyi sec.",
  freeSwap: "Serbest Degisim: iki komsu sekeri sec.",
  colorBlast: "Renk Temizleyici: temizlenecek rengi sec."
};

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init(data) {
    this.level = data.level;
    this.callbacks = data.callbacks || {};
    this.reducedMotion = Boolean(data.reducedMotion);
    this.engine = new MatchEngine(this.level);
    this.selected = null;
    this.activeBooster = null;
    this.finished = false;
    this.inputLocked = false;
    this.boardLayer = null;
    this.fxLayer = null;
    this.metrics = null;
    this.cellGroups = new Map();
    this.dragState = null;
    this.hasRenderedBoard = false;
  }

  create() {
    this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
    this.scale.on("resize", this.renderBoard, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.callbacks.onSceneReady?.(this);
    this.emitStats();
    this.renderBoard({ animate: true, drop: true });
  }

  spendBooster(boosterId) {
    const ok = Boolean(this.callbacks.onSpendBooster?.(boosterId));
    if (ok) {
      playSound("boost");
      vibrate("boost");
    }
    return ok;
  }

  activateBooster(boosterId) {
    if (this.finished || this.inputLocked) return;

    if (boosterId === "extraMoves") {
      if (!this.spendBooster(boosterId)) return;
      this.inputLocked = true;
      this.runResolvedAction(this.engine.addMoves(5), { sourceIndex: null });
      return;
    }

    if (boosterId === "targetFly") {
      if (!this.spendBooster(boosterId)) return;
      this.inputLocked = true;
      this.runResolvedAction(this.engine.applyTargetFly(), { sourceIndex: null });
      return;
    }

    this.activeBooster = boosterId;
    this.selected = null;
    this.engine.message = BOOSTER_MESSAGES[boosterId] || "Booster secildi.";
    this.emitStats();
    this.renderBoard({ animate: false });
  }

  renderBoard(options = {}) {
    if (!this.engine) return;

    const animate = options.animate ?? !this.hasRenderedBoard;
    this.boardLayer?.destroy(true);
    this.fxLayer?.destroy(true);
    this.cellGroups = new Map();
    this.boardLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);

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
    back.fillStyle(0x14586f, 0.30);
    back.fillRoundedRect(originX - 14, originY - 14, boardWidth + 28, boardHeight + 28, 22);
    back.lineStyle(4, 0x8fd9ea, 0.30);
    back.strokeRoundedRect(originX - 14, originY - 14, boardWidth + 28, boardHeight + 28, 22);
    this.boardLayer.add(back);

    this.engine.board.forEach((cell, index) => {
      const { row, col } = this.engine.toRowCol(index);
      const x = originX + col * cellSize;
      const y = originY + row * cellSize;
      this.drawCell(index, cell, x, y, cellSize, { ...options, animate });
    });

    this.hasRenderedBoard = true;
  }

  drawCell(index, cell, x, y, size, options = {}) {
    const group = this.add.container(x, y);
    const pad = Math.max(4, Math.floor(size * 0.07));
    const inner = size - pad * 2;
    const cx = size / 2;
    const cy = size / 2;

    if (cell.void) {
      this.boardLayer.add(group);
      this.cellGroups.set(index, group);
      return;
    }

    const base = this.add.graphics();
    if (this.selected === index) {
      base.fillStyle(0x6acbf1, 0.55);
      base.fillRoundedRect(pad, pad, inner, inner, 11);
      base.lineStyle(4, 0xfff09b, 0.95);
      base.strokeRoundedRect(pad, pad, inner, inner, 11);
    } else {
      base.fillStyle(0xffffff, 0.03);
      base.fillRoundedRect(pad, pad, inner, inner, 11);
    }
    group.add(base);

    const piece = this.add.container(0, 0);
    group.piece = piece;
    group.add(piece);

    if (cell.color) this.drawCandy(piece, cell.color, cx, cy, inner, cell.special);
    if (cell.item === "relic") this.drawOrderDrop(piece, cx, cy, inner);
    if (cell.blocker) this.drawBlocker(group, cell.blocker, cx, cy, inner);

    group.setSize(size, size);
    group.setInteractive(new Phaser.Geom.Rectangle(0, 0, size, size), Phaser.Geom.Rectangle.Contains);
    group.on("pointerdown", (pointer) => this.handlePointerDown(index, pointer));
    this.boardLayer.add(group);
    this.cellGroups.set(index, group);

    if (options.animate && piece.list.length) {
      if (options.drop) {
        piece.y = -size * Phaser.Math.Between(2, 5);
        piece.alpha = 0.2;
        this.tweens.add({
          targets: piece,
          y: 0,
          alpha: 1,
          duration: 220 + this.engine.toRowCol(index).row * 24,
          delay: Phaser.Math.Between(0, 45),
          ease: "Back.easeOut"
        });
      } else {
        this.tweens.add({
          targets: piece,
          scale: { from: 0.94, to: 1 },
          alpha: { from: 0.86, to: 1 },
          duration: 120,
          ease: "Cubic.easeOut"
        });
      }
    }
  }

  drawCandy(group, color, cx, cy, inner, special = null) {
    const style = special === "rainbow" ? null : (CANDY_STYLES[color] || CANDY_STYLES.ruby);
    const candy = this.add.graphics();
    const r = inner * 0.36;

    if (special === "rainbow") {
      candy.fillStyle(0x6b3b24, 0.38);
      candy.fillEllipse(cx + r * 0.12, cy + r * 0.18, r * 1.82, r * 1.54);
      candy.fillStyle(0x4b271a, 1);
      candy.fillCircle(cx, cy, r * 0.92);
      const dots = [0xff435b, 0x1598ff, 0x27d83d, 0xffd451, 0xce22ff, 0xffffff];
      for (let i = 0; i < 18; i += 1) {
        const angle = (Math.PI * 2 * i) / 18;
        const radius = r * (0.24 + (i % 3) * 0.18);
        candy.fillStyle(dots[i % dots.length], 1);
        candy.fillCircle(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, Math.max(2, r * 0.10));
      }
      candy.lineStyle(2, 0xffffff, 0.35);
      candy.strokeCircle(cx, cy, r * 0.92);
      group.add(candy);
      return;
    }

    candy.fillStyle(style.shadow, 0.32);
    candy.fillEllipse(cx + r * 0.10, cy + r * 0.18, r * 1.82, r * 1.46);
    candy.fillStyle(style.fill, 1);

    if (style.type === "square") {
      candy.fillRoundedRect(cx - r * 0.88, cy - r * 0.72, r * 1.76, r * 1.44, r * 0.28);
      candy.lineStyle(2, 0xffffff, 0.36);
      candy.strokeRoundedRect(cx - r * 0.88, cy - r * 0.72, r * 1.76, r * 1.44, r * 0.28);
    } else if (style.type === "drop") {
      candy.fillEllipse(cx, cy, r * 1.24, r * 1.78);
      candy.lineStyle(2, 0xffffff, 0.34);
      candy.strokeEllipse(cx, cy, r * 1.24, r * 1.78);
      candy.lineStyle(Math.max(2, r * 0.16), 0xfff1b9, 0.45);
      candy.strokeEllipse(cx, cy, r * 0.72, r * 1.08);
    } else if (style.type === "cluster") {
      const petal = r * 0.43;
      const points = [[0, -0.56], [0.54, -0.16], [0.34, 0.50], [-0.34, 0.50], [-0.54, -0.16]];
      points.forEach(([px, py]) => candy.fillCircle(cx + px * r, cy + py * r, petal));
      candy.fillCircle(cx, cy, petal * 1.04);
      candy.lineStyle(2, 0xffffff, 0.28);
      points.forEach(([px, py]) => candy.strokeCircle(cx + px * r, cy + py * r, petal));
    } else if (style.type === "stripe") {
      candy.fillRoundedRect(cx - r * 0.72, cy - r * 0.90, r * 1.44, r * 1.80, r * 0.66);
      candy.lineStyle(5, 0xffffff, 0.82);
      candy.lineBetween(cx - r * 0.68, cy - r * 0.52, cx + r * 0.48, cy + r * 0.64);
      candy.lineBetween(cx - r * 0.50, cy - r * 0.82, cx + r * 0.72, cy + r * 0.40);
      candy.lineStyle(2, 0xffffff, 0.34);
      candy.strokeRoundedRect(cx - r * 0.72, cy - r * 0.90, r * 1.44, r * 1.80, r * 0.66);
    } else if (style.type === "lozenge") {
      candy.fillPoints([
        new Phaser.Geom.Point(cx, cy - r * 0.98),
        new Phaser.Geom.Point(cx + r * 0.76, cy),
        new Phaser.Geom.Point(cx, cy + r * 0.98),
        new Phaser.Geom.Point(cx - r * 0.76, cy)
      ], true);
      candy.lineStyle(2, 0xffffff, 0.36);
      candy.strokePoints([
        new Phaser.Geom.Point(cx, cy - r * 0.98),
        new Phaser.Geom.Point(cx + r * 0.76, cy),
        new Phaser.Geom.Point(cx, cy + r * 0.98),
        new Phaser.Geom.Point(cx - r * 0.76, cy)
      ], true);
    } else {
      candy.fillEllipse(cx, cy, r * 1.74, r * 1.52);
      candy.lineStyle(2, 0xffffff, 0.34);
      candy.strokeEllipse(cx, cy, r * 1.74, r * 1.52);
      candy.lineStyle(3, 0xffffff, 0.28);
      candy.lineBetween(cx - r * 0.78, cy + r * 0.08, cx + r * 0.78, cy + r * 0.08);
    }

    // Glassy candy pop: a soft inner-rim glow under the highlight, then the
    // highlight itself, then a crisp comma-shaped specular glint on top.
    candy.fillStyle(0xffffff, 0.14);
    candy.fillEllipse(cx - r * 0.05, cy - r * 0.30, r * 1.30, r * 0.68);
    candy.fillStyle(style.shine, 0.70);
    candy.fillEllipse(cx - r * 0.28, cy - r * 0.36, r * 0.56, r * 0.20);
    candy.fillStyle(0xffffff, 0.85);
    candy.fillEllipse(cx - r * 0.34, cy - r * 0.40, r * 0.22, r * 0.10);
    candy.fillStyle(0xffffff, 0.22);
    candy.fillEllipse(cx + r * 0.24, cy + r * 0.28, r * 0.68, r * 0.16);

    if (special === "lineH" || special === "lineV") {
      candy.lineStyle(Math.max(3, r * 0.18), 0xffffff, 0.86);
      if (special === "lineH") {
        candy.lineBetween(cx - r * 0.86, cy - r * 0.22, cx + r * 0.86, cy - r * 0.22);
        candy.lineBetween(cx - r * 0.86, cy + r * 0.24, cx + r * 0.86, cy + r * 0.24);
      } else {
        candy.lineBetween(cx - r * 0.24, cy - r * 0.86, cx - r * 0.24, cy + r * 0.86);
        candy.lineBetween(cx + r * 0.24, cy - r * 0.86, cx + r * 0.24, cy + r * 0.86);
      }
    }

    if (special === "bomb") {
      candy.fillStyle(0xffffff, 0.36);
      candy.fillCircle(cx, cy, r * 0.38);
      candy.lineStyle(4, 0xffffff, 0.54);
      candy.strokeCircle(cx, cy, r * 0.72);
    }

    if (special === "flying") {
      candy.fillStyle(0xbff6ff, 0.70);
      candy.fillTriangle(cx - r * 0.72, cy, cx - r * 1.14, cy - r * 0.30, cx - r * 1.10, cy + r * 0.32);
      candy.fillTriangle(cx + r * 0.72, cy, cx + r * 1.14, cy - r * 0.30, cx + r * 1.10, cy + r * 0.32);
    }

    group.add(candy);
  }

  drawBlocker(group, blocker, cx, cy, inner) {
    const gfx = this.add.graphics();
    const r = inner * 0.40;

    if (blocker.type === "ice") {
      // Frosted glass slab: tinted base, crystal petals, a crack line and a
      // bright rim so it reads as a solid layer sitting over the candy.
      gfx.fillStyle(0xbfeaff, 0.30);
      gfx.fillRoundedRect(cx - r * 1.05, cy - r * 1.05, r * 2.1, r * 2.1, r * 0.4);
      gfx.fillStyle(0xfff9ee, 0.96);
      const petals = [[0, -0.38], [0.38, 0], [0, 0.38], [-0.38, 0], [0.27, -0.27], [-0.27, 0.27]];
      petals.forEach(([px, py]) => gfx.fillEllipse(cx + px * r, cy + py * r, r * 0.92, r * 1.16));
      gfx.fillStyle(0xf5dfbd, 0.54);
      gfx.fillCircle(cx, cy, r * 0.36);
      gfx.lineStyle(1.5, 0x8fd6ee, 0.55);
      gfx.lineBetween(cx - r * 0.5, cy - r * 0.62, cx + r * 0.18, cy - r * 0.08);
      gfx.lineBetween(cx + r * 0.18, cy - r * 0.08, cx - r * 0.1, cy + r * 0.5);
      gfx.lineStyle(2, 0xffffff, 0.68);
      gfx.strokeCircle(cx, cy, r * 1.02);
    } else if (blocker.type === "chain") {
      // Two overlapping wrought-iron rings, like a lock over the candy.
      gfx.lineStyle(Math.max(5, r * 0.20), 0x2b3252, 0.92);
      gfx.strokeEllipse(cx - r * 0.30, cy, r * 0.56, r * 0.74);
      gfx.strokeEllipse(cx + r * 0.30, cy, r * 0.56, r * 0.74);
      gfx.lineStyle(2, 0x9fb0e0, 0.42);
      gfx.strokeEllipse(cx - r * 0.30, cy, r * 0.40, r * 0.56);
      gfx.strokeEllipse(cx + r * 0.30, cy, r * 0.40, r * 0.56);
    } else if (blocker.type === "darkness") {
      // Layered violet fog with a soft vignette instead of a flat square.
      gfx.fillStyle(0x11091f, 0.86);
      gfx.fillRoundedRect(cx - r, cy - r, r * 2, r * 2, 12);
      gfx.fillStyle(0x2c1a4a, 0.40);
      gfx.fillCircle(cx, cy, r * 0.88);
      gfx.fillStyle(0x6d4bb0, 0.24);
      gfx.fillCircle(cx - r * 0.18, cy - r * 0.22, r * 0.58);
      gfx.fillStyle(0xb99cf0, 0.14);
      gfx.fillCircle(cx + r * 0.22, cy + r * 0.20, r * 0.30);
    } else {
      // Wooden crate: base fill, cross braces, and plank-grain stripes.
      gfx.fillStyle(0xa76a3a, 0.95);
      gfx.fillRoundedRect(cx - r, cy - r, r * 2, r * 2, 12);
      gfx.lineStyle(1.5, 0x7a4a26, 0.30);
      for (let stripe = -2; stripe <= 2; stripe += 1) {
        const y = cy + stripe * r * 0.38;
        gfx.lineBetween(cx - r * 0.94, y, cx + r * 0.94, y);
      }
      gfx.lineStyle(4, 0x6a3e24, 0.55);
      gfx.lineBetween(cx - r * 0.86, cy - r * 0.86, cx + r * 0.86, cy + r * 0.86);
      gfx.lineBetween(cx + r * 0.86, cy - r * 0.86, cx - r * 0.86, cy + r * 0.86);
      gfx.lineStyle(2, 0xffe2b8, 0.48);
      gfx.strokeRoundedRect(cx - r, cy - r, r * 2, r * 2, 12);
    }

    group.add(gfx);
  }

  drawOrderDrop(group, cx, cy, inner) {
    const gfx = this.add.graphics();
    const r = inner * 0.37;
    gfx.fillStyle(0xfff6dd, 0.98);
    for (let i = 0; i < 5; i += 1) {
      const angle = (Math.PI * 2 * i) / 5;
      gfx.fillEllipse(cx + Math.cos(angle) * r * 0.36, cy + Math.sin(angle) * r * 0.36, r * 0.72, r * 1.05);
    }
    gfx.fillStyle(0xf1d7ad, 0.62);
    gfx.fillCircle(cx, cy, r * 0.30);
    gfx.lineStyle(2, 0xffffff, 0.72);
    gfx.strokeCircle(cx, cy, r * 1.02);
    group.add(gfx);
  }

  handlePointerDown(index, pointer) {
    if (this.finished || this.inputLocked || !this.metrics) return;

    if (this.activeBooster) {
      this.handleCell(index);
      return;
    }

    if (!this.isCellDraggable(index)) {
      this.pulseInvalid(index);
      return;
    }

    const group = this.cellGroups.get(index);
    if (!group?.piece) return;

    playSound("click");
    this.dragState = {
      index,
      group,
      piece: group.piece,
      startX: pointer.x,
      startY: pointer.y,
      targetIndex: null
    };
    this.boardLayer.bringToTop(group);
    this.tweens.killTweensOf(group.piece);
    this.tweens.add({
      targets: group.piece,
      scale: 1.08,
      duration: 90,
      ease: "Cubic.easeOut"
    });
  }

  handlePointerMove(pointer) {
    if (!this.dragState || this.inputLocked || !this.metrics) return;

    const { cellSize } = this.metrics;
    const dx = pointer.x - this.dragState.startX;
    const dy = pointer.y - this.dragState.startY;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const maxPull = cellSize * 0.62;
    const softPull = cellSize * 0.10;
    const piece = this.dragState.piece;

    piece.x = horizontal ? Phaser.Math.Clamp(dx, -maxPull, maxPull) : Phaser.Math.Clamp(dx, -softPull, softPull);
    piece.y = horizontal ? Phaser.Math.Clamp(dy, -softPull, softPull) : Phaser.Math.Clamp(dy, -maxPull, maxPull);

    // A deliberate swipe should feel identical to before, but a light tap
    // that wobbles a few pixels (finger roll, mouse jitter) must never be
    // mistaken for a swap with the neighbor — hence the larger, floor-backed
    // commit distance instead of the old flat 42% of a cell.
    const distance = horizontal ? dx : dy;
    const commitThreshold = Math.max(cellSize * 0.56, 24);
    if (Math.abs(distance) < commitThreshold) return;

    const { row, col } = this.engine.toRowCol(this.dragState.index);
    const targetRow = row + (!horizontal ? (distance > 0 ? 1 : -1) : 0);
    const targetCol = col + (horizontal ? (distance > 0 ? 1 : -1) : 0);
    if (!this.engine.inBounds(targetRow, targetCol)) {
      this.snapDraggedPiece();
      return;
    }
    const targetIndex = this.engine.index(targetRow, targetCol);
    this.tryDragSwap(targetIndex);
  }

  handlePointerUp() {
    if (this.dragState && !this.inputLocked) this.snapDraggedPiece();
  }

  tryDragSwap(targetIndex) {
    const drag = this.dragState;
    if (!drag || this.inputLocked) return;

    const first = drag.index;
    if (targetIndex === first || !this.engine.canSwap(first, targetIndex)) {
      this.snapDraggedPiece();
      this.pulseInvalid(targetIndex);
      return;
    }

    this.inputLocked = true;
    this.dragState = null;
    this.animateSwapPieces(first, targetIndex).then(() => {
      const result = this.engine.trySwap(first, targetIndex);
      if (!result.ok) {
        this.shakeBoard(4);
        this.engine.message = result.status?.message || "Eslesme olmadi, hamle geri alindi.";
        this.emitStats();
        this.resetSwapPieces(first, targetIndex).then(() => {
          this.inputLocked = false;
          this.renderBoard({ animate: false });
        });
        return;
      }
      this.runResolvedAction(result, { sourceIndex: targetIndex });
    });
  }

  snapDraggedPiece() {
    const drag = this.dragState;
    if (!drag) return;
    this.dragState = null;
    this.tweens.add({
      targets: drag.piece,
      x: 0,
      y: 0,
      scale: 1,
      duration: 150,
      ease: "Back.easeOut"
    });
  }

  animateSwapPieces(first, second) {
    const firstGroup = this.cellGroups.get(first);
    const secondGroup = this.cellGroups.get(second);
    if (!firstGroup?.piece || !secondGroup?.piece) return Promise.resolve();

    const delta = this.getCellDelta(first, second);
    return Promise.all([
      this.tweenTo(firstGroup.piece, { x: delta.x, y: delta.y, scale: 1.02, duration: 150, ease: "Sine.easeInOut" }),
      this.tweenTo(secondGroup.piece, { x: -delta.x, y: -delta.y, scale: 1.02, duration: 150, ease: "Sine.easeInOut" })
    ]);
  }

  resetSwapPieces(first, second) {
    const firstGroup = this.cellGroups.get(first);
    const secondGroup = this.cellGroups.get(second);
    return Promise.all([
      firstGroup?.piece ? this.tweenTo(firstGroup.piece, { x: 0, y: 0, scale: 1, duration: 150, ease: "Sine.easeInOut" }) : Promise.resolve(),
      secondGroup?.piece ? this.tweenTo(secondGroup.piece, { x: 0, y: 0, scale: 1, duration: 150, ease: "Sine.easeInOut" }) : Promise.resolve()
    ]);
  }

  handleCell(index) {
    if (this.finished || this.inputLocked) return;
    playSound("click");

    if (this.activeBooster === "hammer") {
      if (!this.spendBooster("hammer")) return;
      this.inputLocked = true;
      const result = this.engine.applyHammer(index);
      this.activeBooster = null;
      this.runResolvedAction(result, { sourceIndex: index });
      return;
    }

    if (this.activeBooster === "colorBlast") {
      if (!this.engine.board[index]?.color) {
        this.pulseInvalid(index);
        return;
      }
      if (!this.spendBooster("colorBlast")) return;
      this.inputLocked = true;
      const result = this.engine.applyColorBlast(index);
      this.activeBooster = null;
      this.runResolvedAction(result, { sourceIndex: index });
      return;
    }

    if (this.activeBooster === "freeSwap") {
      if (this.selected === null) {
        this.selected = index;
        this.engine.message = "Ikinci komsu sekeri sec.";
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
      if (!this.spendBooster("freeSwap")) return;
      this.inputLocked = true;
      this.activeBooster = null;
      this.runResolvedAction(this.engine.trySwap(first, index, { free: true }), { sourceIndex: index });
    }
  }

  runResolvedAction(result, options = {}) {
    if (!result.ok) {
      this.inputLocked = false;
      this.emitStats();
      this.renderBoard({ animate: false });
      return;
    }

    if (result.cleared > 0) {
      playSound("pop");
      vibrate("pop");
    }
    this.emitStats();
    this.playResolutionEffects(result, options).then(() => {
      this.renderBoard({ animate: result.cleared > 0, drop: result.cleared > 0 });
      this.emitStats();

      if (result.won) {
        this.finished = true;
        playSound("win");
        vibrate("win");
        this.time.delayedCall(420, () => this.callbacks.onWin?.(this.engine.getStatus()));
      } else if (result.lost) {
        this.finished = true;
        playSound("lose");
        vibrate("lose");
        this.time.delayedCall(420, () => this.callbacks.onLose?.(this.engine.getStatus()));
      } else {
        this.inputLocked = false;
      }
    });
  }

  playResolutionEffects(result, options = {}) {
    const clearEvents = (result.events || []).filter((event) => event.type === "clear" && event.indexes?.length);

    if (!clearEvents.length && result.cleared <= 0) {
      if (options.sourceIndex !== null && options.sourceIndex !== undefined) this.popEffect(options.sourceIndex, 0x9ff7ff);
      return this.delay(80);
    }

    let lastDelay = 0;
    clearEvents.forEach((event, eventIndex) => {
      const delay = eventIndex * 135;
      lastDelay = delay;
      this.time.delayedCall(delay, () => {
        const cascade = event.cascade || eventIndex + 1;
        event.indexes.slice(0, 42).forEach((index) => this.burstAtIndex(index, cascade));
        this.beamEffect(event.indexes, cascade);
        if (event.count >= 8 || cascade > 1) {
          this.waveEffect(cascade);
          this.shakeBoard(Math.min(10, 3 + cascade * 2));
        }
        if (cascade > 1) {
          this.showCombo(cascade, event.count);
          playSound("combo");
          vibrate("combo");
        }
      });
    });

    return this.delay(lastDelay + 360);
  }

  burstAtIndex(index, cascade = 1) {
    if (!this.metrics || !this.fxLayer) return;
    const center = this.getCellCenter(index);
    const radius = this.metrics.cellSize * (0.22 + cascade * 0.03);
    const flash = this.add.circle(center.x, center.y, radius, 0xffffff, 0.60);
    this.fxLayer.add(flash);
    this.tweens.add({
      targets: flash,
      scale: 2.4,
      alpha: 0,
      duration: this.reducedMotion ? 160 : 300,
      ease: "Cubic.easeOut",
      onComplete: () => flash.destroy()
    });

    const colors = [0xffffff, 0xfff0a8, 0xff77bd, 0x7ee7ff, 0xffcf43];
    const particleCount = this.reducedMotion ? 4 : 9;
    for (let i = 0; i < particleCount; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = this.metrics.cellSize * Phaser.Math.FloatBetween(0.22, 0.58);
      const particle = this.add.circle(center.x, center.y, Phaser.Math.Between(2, 4), colors[i % colors.length], 0.95);
      this.fxLayer.add(particle);
      this.tweens.add({
        targets: particle,
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance,
        scale: 0.25,
        alpha: 0,
        duration: 260 + cascade * 35,
        ease: "Cubic.easeOut",
        onComplete: () => particle.destroy()
      });
    }
  }

  beamEffect(indexes, cascade = 1) {
    if (!this.metrics || !indexes.length) return;
    const rows = new Map();
    const cols = new Map();
    indexes.forEach((index) => {
      const { row, col } = this.engine.toRowCol(index);
      rows.set(row, (rows.get(row) || 0) + 1);
      cols.set(col, (cols.get(col) || 0) + 1);
    });

    rows.forEach((count, row) => {
      if (count < Math.min(6, this.engine.cols)) return;
      const y = this.metrics.originY + row * this.metrics.cellSize + this.metrics.cellSize / 2;
      const beam = this.add.rectangle(this.metrics.originX + this.metrics.boardWidth / 2, y, this.metrics.boardWidth + 46, this.metrics.cellSize * 0.20, 0xffffff, 0.75);
      this.fxLayer.add(beam);
      this.tweens.add({
        targets: beam,
        scaleY: 5 + cascade * 0.25,
        alpha: 0,
        duration: 260,
        ease: "Cubic.easeOut",
        onComplete: () => beam.destroy()
      });
    });

    cols.forEach((count, col) => {
      if (count < Math.min(6, this.engine.rows)) return;
      const x = this.metrics.originX + col * this.metrics.cellSize + this.metrics.cellSize / 2;
      const beam = this.add.rectangle(x, this.metrics.originY + this.metrics.boardHeight / 2, this.metrics.cellSize * 0.20, this.metrics.boardHeight + 46, 0xffffff, 0.78);
      this.fxLayer.add(beam);
      this.tweens.add({
        targets: beam,
        scaleX: 5 + cascade * 0.25,
        alpha: 0,
        duration: 260,
        ease: "Cubic.easeOut",
        onComplete: () => beam.destroy()
      });
    });
  }

  waveEffect(cascade = 1) {
    if (!this.metrics || !this.fxLayer || this.reducedMotion) return;
    const wave = this.add.circle(
      this.metrics.originX + this.metrics.boardWidth / 2,
      this.metrics.originY + this.metrics.boardHeight / 2,
      this.metrics.cellSize,
      0xffffff,
      0.08
    );
    wave.setStrokeStyle(4, 0xffffff, 0.45);
    this.fxLayer.add(wave);
    this.tweens.add({
      targets: wave,
      scale: 4.8 + cascade * 0.25,
      alpha: 0,
      duration: 330,
      ease: "Cubic.easeOut",
      onComplete: () => wave.destroy()
    });
  }

  showCombo(cascade, count) {
    if (!this.metrics || !this.fxLayer) return;
    const x = this.metrics.originX + this.metrics.boardWidth / 2;
    const y = this.metrics.originY + this.metrics.boardHeight * 0.38;

    const glow = this.add.circle(x, y, this.metrics.cellSize * 0.9, 0xffe14d, 0.30);
    this.fxLayer.add(glow);
    this.tweens.add({
      targets: glow,
      scale: 1.8,
      alpha: 0,
      duration: 380,
      ease: "Cubic.easeOut",
      onComplete: () => glow.destroy()
    });

    const text = this.add.text(
      x,
      y,
      `Combo x${cascade}`,
      {
        fontFamily: "Georgia, serif",
        fontSize: `${Math.floor(this.metrics.cellSize * 0.54)}px`,
        color: "#ffffff",
        stroke: "#d92b86",
        strokeThickness: 5,
        fontStyle: "900"
      }
    ).setOrigin(0.5);
    this.fxLayer.add(text);
    this.tweens.add({
      targets: text,
      y: text.y - this.metrics.cellSize * 0.7,
      scale: { from: 0.86, to: 1.18 },
      alpha: 0,
      duration: 520,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy()
    });
  }

  pulseInvalid(index) {
    const group = this.cellGroups.get(index);
    if (!group?.piece) return;
    this.tweens.add({
      targets: group.piece,
      x: { from: -3, to: 0 },
      duration: 60,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut"
    });
  }

  popEffect(index, color) {
    if (!this.metrics) return;
    const center = this.getCellCenter(index);
    const circle = this.add.circle(center.x, center.y, this.metrics.cellSize * 0.18, color, 0.52);
    this.fxLayer?.add(circle);
    this.tweens.add({
      targets: circle,
      scale: 2.2,
      alpha: 0,
      duration: 260,
      ease: "Cubic.easeOut",
      onComplete: () => circle.destroy()
    });
  }

  shakeBoard(amount = 5) {
    if (!this.boardLayer || this.reducedMotion) return;
    this.tweens.add({
      targets: this.boardLayer,
      x: { from: -amount, to: 0 },
      duration: 70,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut"
    });
  }

  isCellDraggable(index) {
    const cell = this.engine.board[index];
    if (!cell || cell.void || cell.item === "relic") return false;
    if (this.engine.isSolidBlocker(cell) || cell.blocker?.type === "chain") return false;
    return Boolean(cell.color);
  }

  getCellCenter(index) {
    const { row, col } = this.engine.toRowCol(index);
    return {
      x: this.metrics.originX + col * this.metrics.cellSize + this.metrics.cellSize / 2,
      y: this.metrics.originY + row * this.metrics.cellSize + this.metrics.cellSize / 2
    };
  }

  getCellDelta(first, second) {
    const a = this.engine.toRowCol(first);
    const b = this.engine.toRowCol(second);
    return {
      x: (b.col - a.col) * this.metrics.cellSize,
      y: (b.row - a.row) * this.metrics.cellSize
    };
  }

  tweenTo(target, config) {
    return new Promise((resolve) => {
      this.tweens.add({
        targets: target,
        ...config,
        onComplete: resolve
      });
    });
  }

  delay(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  emitStats() {
    this.callbacks.onStatsChange?.(this.engine.getStatus());
  }
}
