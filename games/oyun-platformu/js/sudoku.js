/**
 * Sudoku modulu — uretim, arayuz, notlar, geri al/ileri al, ipucu, duraklatma.
 */

const DIFFICULTY = {
  kolay: { label: "Kolay", holes: 36, base: 1000 },
  orta: { label: "Orta", holes: 44, base: 2000 },
  zor: { label: "Zor", holes: 50, base: 3200 },
  uzman: { label: "Uzman", holes: 56, base: 5000 }
};

const MAX_MISTAKES = 3;
const MAX_HINTS = 3;

const ICONS = {
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>`,
  erase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.6-4.6a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l6.2 6.2a1 1 0 0 1 0 1.4L12 21H7Z"/><path d="M17 17H9"/></svg>`,
  notes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  hint: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 1 4 12.7c-.6.5-1 1.3-1 2.3h-6c0-1-.4-1.8-1-2.3A7 7 0 0 1 12 2Z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 4v16M14 4v16"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  restart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`
};

export class SudokuGame {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { audio, settings, stats, saveStats, goHome, refreshMenu }
    this.state = null;
    this.timerId = 0;
    this.onKey = this.onKey.bind(this);
    this.onClick = this.onClick.bind(this);
  }

  mount() {
    this.root.onclick = this.onClick;
    window.addEventListener("keydown", this.onKey);
    this.showSetup();
  }

  unmount() {
    this.stopTimer();
    this.root.onclick = null;
    window.removeEventListener("keydown", this.onKey);
    this.root.innerHTML = "";
    this.state = null;
  }

  /* ------------------------------ akis ------------------------------ */

  showSetup() {
    this.stopTimer();
    this.state = { phase: "setup" };
    const bests = this.ctx.stats.sudoku.bests;
    this.root.innerHTML = `
      <div class="game-head">
        <button class="icon-btn" type="button" data-act="home" aria-label="Ana menü">${ICONS.back}</button>
        <h2>Sudoku</h2>
        <span style="width:42px"></span>
      </div>
      <div class="panel">
        <h3>Zorluk Seç</h3>
        <p>Her seviye yeni ve benzersiz bir tahta üretir.</p>
        <div class="panel-btns">
          ${Object.entries(DIFFICULTY).map(([key, diff]) => `
            <button class="diff-btn" type="button" data-diff="${key}">
              ${diff.label}
              <small>${bests[key] ? "En iyi: " + formatTime(bests[key]) : "Henüz çözülmedi"}</small>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  start(difficulty, reuseBoard = null) {
    const config = DIFFICULTY[difficulty];
    const { puzzle, solution } = reuseBoard || createPuzzle(config.holes);

    this.state = {
      phase: "playing",
      difficulty,
      puzzle,
      solution,
      board: puzzle.map((row) => [...row]),
      notes: emptyNotes(),
      selected: null,
      mistakes: 0,
      hintsLeft: MAX_HINTS,
      notesMode: false,
      history: [],
      redo: [],
      elapsed: 0,
      paused: false,
      animCell: null,
      animType: null
    };

    this.ctx.audio.play("start");
    this.startTimer();
    this.render();
  }

  startTimer() {
    this.stopTimer();
    this.timerId = setInterval(() => {
      if (!this.state || this.state.phase !== "playing" || this.state.paused) return;
      this.state.elapsed += 1;
      const label = this.root.querySelector("#sdTime");
      if (label) label.textContent = formatTime(this.state.elapsed);
    }, 1000);
  }

  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = 0;
    }
  }

  finish(won) {
    const s = this.state;
    this.stopTimer();
    s.phase = won ? "won" : "lost";

    const stats = this.ctx.stats;
    stats.sudoku.games += 1;
    stats.sudoku.totalMistakes += s.mistakes;

    let isRecord = false;
    let score = 0;
    if (won) {
      stats.sudoku.wins += 1;
      const best = stats.sudoku.bests[s.difficulty];
      if (!best || s.elapsed < best) {
        stats.sudoku.bests[s.difficulty] = s.elapsed;
        isRecord = true;
      }
      score = Math.max(100, DIFFICULTY[s.difficulty].base - s.mistakes * 150 - (MAX_HINTS - s.hintsLeft) * 200 - s.elapsed * 2);
      this.ctx.audio.play("win");
      if (isRecord) this.ctx.audio.play("record");
      spawnConfetti();
    } else {
      this.ctx.audio.play("over");
    }
    this.ctx.saveStats();
    this.ctx.refreshMenu();

    s.result = { score, isRecord };
    this.render();
  }

  /* ------------------------------ girisler ------------------------------ */

  onClick(event) {
    const s = this.state;
    if (!s) return;

    const act = event.target.closest("[data-act]");
    if (act) {
      this.handleAction(act.dataset.act);
      return;
    }

    const diffBtn = event.target.closest("[data-diff]");
    if (diffBtn) {
      this.ctx.audio.play("click");
      this.start(diffBtn.dataset.diff);
      return;
    }

    if (s.phase !== "playing" || s.paused) return;

    const cell = event.target.closest(".sd-cell");
    if (cell) {
      s.selected = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
      this.ctx.audio.play("select");
      this.render();
      return;
    }

    const tool = event.target.closest("[data-tool]");
    if (tool) {
      this.handleTool(tool.dataset.tool);
      return;
    }

    const num = event.target.closest("[data-digit]");
    if (num && !num.disabled) this.enterDigit(Number(num.dataset.digit));
  }

  handleAction(act) {
    const s = this.state;
    this.ctx.audio.play("click");
    if (act === "home") this.ctx.goHome();
    else if (act === "setup") this.showSetup();
    else if (act === "restart" && s.difficulty) {
      this.start(s.difficulty, { puzzle: s.puzzle, solution: s.solution });
    } else if (act === "new" && s.difficulty) {
      this.start(s.difficulty);
    } else if (act === "pause") this.togglePause();
  }

  togglePause() {
    const s = this.state;
    if (!s || s.phase !== "playing") return;
    s.paused = !s.paused;
    this.ctx.audio.play("nav");
    this.render();
  }

  onKey(event) {
    const s = this.state;
    if (!s) return;

    if (event.key === "Escape") {
      if (s.phase === "playing") this.ctx.goHome();
      return;
    }
    if (s.phase !== "playing") return;

    if (event.key === "p" || event.key === "P") {
      this.togglePause();
      return;
    }
    if (s.paused) return;

    if (event.key >= "1" && event.key <= "9") {
      this.enterDigit(Number(event.key));
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      this.handleTool("erase");
      return;
    }
    if (event.key === "n" || event.key === "N") {
      this.handleTool("notes");
      return;
    }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault();
      const cur = s.selected || { row: 0, col: 0 };
      s.selected = {
        row: clamp(cur.row + moves[event.key][0]),
        col: clamp(cur.col + moves[event.key][1])
      };
      this.render();
    }
  }

  handleTool(tool) {
    const s = this.state;
    if (tool === "undo") this.undo();
    else if (tool === "redo") this.redoMove();
    else if (tool === "erase") this.erase();
    else if (tool === "notes") {
      s.notesMode = !s.notesMode;
      this.ctx.audio.play("nav");
      this.render();
    } else if (tool === "hint") this.hint();
  }

  cellLocked(row, col) {
    const s = this.state;
    if (s.puzzle[row][col] !== 0) return true;
    return s.board[row][col] !== 0 && s.board[row][col] === s.solution[row][col];
  }

  pushHistory(row, col) {
    const s = this.state;
    s.history.push({ row, col, value: s.board[row][col], notes: new Set(s.notes[row][col]) });
    s.redo = [];
  }

  snapshot(row, col) {
    const s = this.state;
    return { row, col, value: s.board[row][col], notes: new Set(s.notes[row][col]) };
  }

  applySnapshot(entry) {
    const s = this.state;
    s.board[entry.row][entry.col] = entry.value;
    s.notes[entry.row][entry.col] = entry.notes;
    s.selected = { row: entry.row, col: entry.col };
  }

  enterDigit(digit) {
    const s = this.state;
    if (!s.selected) return;
    const { row, col } = s.selected;
    if (this.cellLocked(row, col)) return;

    if (s.notesMode) {
      this.pushHistory(row, col);
      s.board[row][col] = 0;
      if (s.notes[row][col].has(digit)) s.notes[row][col].delete(digit);
      else s.notes[row][col].add(digit);
      this.ctx.audio.play("note");
      this.render();
      return;
    }

    if (s.board[row][col] === digit) return;
    this.pushHistory(row, col);
    s.board[row][col] = digit;
    s.notes[row][col] = new Set();

    const correct = digit === s.solution[row][col];
    if (correct) {
      clearPeerNotes(s, row, col, digit);
      s.animCell = `${row},${col}`;
      s.animType = "good";
      this.ctx.audio.play("good");
      if (isComplete(s)) {
        this.finish(true);
        return;
      }
    } else if (this.ctx.settings.autoCheck) {
      s.mistakes += 1;
      s.animCell = `${row},${col}`;
      s.animType = "bad";
      this.ctx.audio.play("error");
      if (s.mistakes >= MAX_MISTAKES) {
        this.finish(false);
        return;
      }
    } else {
      this.ctx.audio.play("place");
      if (isComplete(s)) {
        this.finish(true);
        return;
      }
    }
    this.render();
  }

  erase() {
    const s = this.state;
    if (!s.selected) return;
    const { row, col } = s.selected;
    if (this.cellLocked(row, col)) return;
    if (s.board[row][col] === 0 && !s.notes[row][col].size) return;
    this.pushHistory(row, col);
    s.board[row][col] = 0;
    s.notes[row][col] = new Set();
    this.ctx.audio.play("place");
    this.render();
  }

  undo() {
    const s = this.state;
    const entry = s.history.pop();
    if (!entry) return;
    s.redo.push(this.snapshot(entry.row, entry.col));
    this.applySnapshot(entry);
    this.ctx.audio.play("click");
    this.render();
  }

  redoMove() {
    const s = this.state;
    const entry = s.redo.pop();
    if (!entry) return;
    s.history.push(this.snapshot(entry.row, entry.col));
    this.applySnapshot(entry);
    this.ctx.audio.play("click");
    this.render();
  }

  hint() {
    const s = this.state;
    if (s.hintsLeft <= 0) return;

    let cell = null;
    if (s.selected && !this.cellLocked(s.selected.row, s.selected.col)) cell = { ...s.selected };
    if (!cell) {
      const open = [];
      for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
        if (!this.cellLocked(r, c)) open.push({ row: r, col: c });
      }
      if (!open.length) return;
      cell = open[Math.floor(Math.random() * open.length)];
    }

    this.pushHistory(cell.row, cell.col);
    s.board[cell.row][cell.col] = s.solution[cell.row][cell.col];
    s.notes[cell.row][cell.col] = new Set();
    s.hintsLeft -= 1;
    s.selected = cell;
    s.animCell = `${cell.row},${cell.col}`;
    s.animType = "good";
    clearPeerNotes(s, cell.row, cell.col, s.board[cell.row][cell.col]);
    this.ctx.audio.play("hint");

    if (isComplete(s)) {
      this.finish(true);
      return;
    }
    this.render();
  }

  /* ------------------------------ cizim ------------------------------ */

  render() {
    const s = this.state;
    if (!s) return;

    if (s.phase === "setup") {
      this.showSetup();
      return;
    }

    if (s.phase === "won" || s.phase === "lost") {
      const won = s.phase === "won";
      const best = this.ctx.stats.sudoku.bests[s.difficulty];
      this.root.innerHTML = `
        <div class="game-head">
          <button class="icon-btn" type="button" data-act="home" aria-label="Ana menü">${ICONS.back}</button>
          <h2>Sudoku</h2>
          <span style="width:42px"></span>
        </div>
        <div class="panel">
          ${won && s.result.isRecord ? `<div class="record-chip">🏆 Yeni en iyi süre!</div>` : ""}
          <h3>${won ? "Tebrikler!" : "Oyun Bitti"}</h3>
          <p>${won ? "Tahtayı başarıyla tamamladın." : `${MAX_MISTAKES} hata yapıldı. Pes etmek yok!`}</p>
          <div class="result-stats">
            <div><span>Zorluk</span><strong>${DIFFICULTY[s.difficulty].label}</strong></div>
            <div><span>Süre</span><strong>${formatTime(s.elapsed)}</strong></div>
            <div><span>Hata</span><strong>${s.mistakes}/${MAX_MISTAKES}</strong></div>
            <div><span>İpucu</span><strong>${MAX_HINTS - s.hintsLeft}/${MAX_HINTS}</strong></div>
            ${won ? `<div><span>Puan</span><strong>${s.result.score}</strong></div>` : ""}
            <div><span>En iyi süre</span><strong>${best ? formatTime(best) : "—"}</strong></div>
          </div>
          <div class="panel-btns">
            <button class="btn btn-primary" type="button" data-act="new">Yeni Oyun</button>
            ${won ? "" : `<button class="btn btn-gold" type="button" data-act="restart">Aynı Tahtayı Tekrar Dene</button>`}
            <button class="btn btn-ghost" type="button" data-act="setup">Zorluk Seç</button>
          </div>
        </div>
      `;
      return;
    }

    this.root.innerHTML = `
      <div class="game-head">
        <button class="icon-btn" type="button" data-act="home" aria-label="Ana menü">${ICONS.back}</button>
        <h2>Sudoku</h2>
        <div class="game-head-actions">
          <button class="icon-btn" type="button" data-act="restart" title="Yeniden başlat">${ICONS.restart}</button>
          <button class="icon-btn" type="button" data-act="pause" title="Duraklat">${ICONS.pause}</button>
        </div>
      </div>

      <div class="sd-topbar">
        <span>${DIFFICULTY[s.difficulty].label}</span>
        <span>Hata: <b>${s.mistakes}/${MAX_MISTAKES}</b></span>
        <span>Süre: <b id="sdTime">${formatTime(s.elapsed)}</b></span>
      </div>

      <div class="sd-board-wrap">
        <div class="sd-board theme-${this.ctx.settings.sudokuTheme}">${this.renderCells()}</div>
        ${s.paused ? `
          <div class="sd-paused">
            <span>⏸ Duraklatıldı</span>
            <button class="btn btn-primary" type="button" data-act="pause">Devam Et</button>
          </div>` : ""}
      </div>

      <div class="sd-tools">
        <button class="sd-tool" type="button" data-tool="undo" ${s.history.length ? "" : "disabled"}>${ICONS.undo}<small>Geri Al</small></button>
        <button class="sd-tool" type="button" data-tool="redo" ${s.redo.length ? "" : "disabled"}>${ICONS.redo}<small>İleri Al</small></button>
        <button class="sd-tool" type="button" data-tool="erase">${ICONS.erase}<small>Sil</small></button>
        <button class="sd-tool${s.notesMode ? " is-on" : ""}" type="button" data-tool="notes">
          <span class="sd-badge">${s.notesMode ? "AÇIK" : "KAPALI"}</span>${ICONS.notes}<small>Notlar</small>
        </button>
        <button class="sd-tool" type="button" data-tool="hint" ${s.hintsLeft ? "" : "disabled"}>
          <span class="sd-badge">${s.hintsLeft}</span>${ICONS.hint}<small>İpucu</small>
        </button>
      </div>

      <div class="sd-numrow">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
          const remaining = this.remaining(d);
          return `<button class="sd-num" type="button" data-digit="${d}" ${remaining <= 0 ? "disabled" : ""}>
            <span>${d}</span><small>${remaining}</small>
          </button>`;
        }).join("")}
      </div>
    `;

    s.animCell = null;
    s.animType = null;
  }

  renderCells() {
    const s = this.state;
    const autoCheck = this.ctx.settings.autoCheck;
    const selectedValue = s.selected ? s.board[s.selected.row][s.selected.col] : 0;

    return s.board.map((rowValues, row) => rowValues.map((value, col) => {
      const isGiven = s.puzzle[row][col] !== 0;
      const isSel = !!s.selected && s.selected.row === row && s.selected.col === col;
      const isPeer = !!s.selected && !isSel && (
        s.selected.row === row || s.selected.col === col ||
        (Math.floor(s.selected.row / 3) === Math.floor(row / 3) && Math.floor(s.selected.col / 3) === Math.floor(col / 3))
      );
      const isSame = !isSel && value !== 0 && value === selectedValue;
      const isWrong = autoCheck && value !== 0 && !isGiven && value !== s.solution[row][col];
      const anim = s.animCell === `${row},${col}` ? ` anim-${s.animType}` : "";

      const classes = [
        "sd-cell",
        isGiven ? "" : "is-user",
        isSel ? "is-sel" : "",
        isPeer ? "is-peer" : "",
        isSame ? "is-same" : "",
        isWrong ? "is-wrong" : "",
        col % 3 === 2 && col !== 8 ? "bl-r" : "",
        row % 3 === 2 && row !== 8 ? "bl-b" : ""
      ].filter(Boolean).join(" ") + anim;

      let content = "";
      if (value !== 0) content = String(value);
      else if (s.notes[row][col].size) {
        content = `<span class="sd-notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<i>${s.notes[row][col].has(d) ? d : ""}</i>`).join("")}</span>`;
      }

      return `<button class="${classes}" type="button" data-row="${row}" data-col="${col}" aria-label="Satır ${row + 1}, sütun ${col + 1}">${content}</button>`;
    }).join("")).join("");
  }

  remaining(digit) {
    const s = this.state;
    let placed = 0;
    for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) {
      if (s.board[r][c] === digit && s.solution[r][c] === digit) placed += 1;
    }
    return 9 - placed;
  }
}

/* ------------------------------ yardimcilar ------------------------------ */

function clamp(v) {
  return Math.min(8, Math.max(0, v));
}

function emptyNotes() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
}

function isComplete(s) {
  return s.board.every((rowValues, row) => rowValues.every((value, col) => value === s.solution[row][col]));
}

function clearPeerNotes(s, row, col, digit) {
  const blockRow = Math.floor(row / 3) * 3;
  const blockCol = Math.floor(col / 3) * 3;
  for (let i = 0; i < 9; i += 1) {
    s.notes[row][i].delete(digit);
    s.notes[i][col].delete(digit);
    s.notes[blockRow + Math.floor(i / 3)][blockCol + (i % 3)].delete(digit);
  }
}

export function formatTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const sec = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function createPuzzle(holes) {
  let best = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const solution = generateSolved();
    const puzzle = solution.map((row) => [...row]);
    const positions = [];
    for (let r = 0; r < 9; r += 1) for (let c = 0; c < 9; c += 1) positions.push({ r, c });
    shuffle(positions);

    let removed = 0;
    for (const { r, c } of positions) {
      if (removed >= holes) break;
      const old = puzzle[r][c];
      puzzle[r][c] = 0;

      if (countSolutions(puzzle, 2) === 1) {
        removed += 1;
      } else {
        puzzle[r][c] = old;
      }
    }

    if (!best || removed > best.removed) best = { puzzle, solution, removed };
    if (removed >= holes) break;
  }

  return { puzzle: best.puzzle, solution: best.solution };
}

function generateSolved() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  const fill = (index) => {
    if (index === 81) return true;
    const row = Math.floor(index / 9);
    const col = index % 9;
    for (const digit of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (canPlace(board, row, col, digit)) {
        board[row][col] = digit;
        if (fill(index + 1)) return true;
        board[row][col] = 0;
      }
    }
    return false;
  };
  fill(0);
  return board;
}

function canPlace(board, row, col, digit) {
  for (let i = 0; i < 9; i += 1) {
    if (board[row][i] === digit || board[i][col] === digit) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r += 1) for (let c = bc; c < bc + 3; c += 1) {
    if (board[r][c] === digit) return false;
  }
  return true;
}

function countSolutions(board, limit) {
  let count = 0;

  const solve = () => {
    if (count >= limit) return;
    const next = findBestEmptyCell(board);
    if (!next) {
      count += 1;
      return;
    }
    if (!next.candidates.length) return;

    for (const digit of next.candidates) {
      board[next.row][next.col] = digit;
      solve();
      board[next.row][next.col] = 0;
      if (count >= limit) return;
    }
  };

  solve();
  return count;
}

function findBestEmptyCell(board) {
  let best = null;

  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      if (board[row][col] !== 0) continue;
      const candidates = [];
      for (let digit = 1; digit <= 9; digit += 1) {
        if (canPlace(board, row, col, digit)) candidates.push(digit);
      }
      if (!best || candidates.length < best.candidates.length) {
        best = { row, col, candidates };
        if (candidates.length <= 1) return best;
      }
    }
  }

  return best;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function spawnConfetti() {
  const colors = ["#f2c14e", "#37d0c4", "#8b6cf0", "#ff7eb0", "#7be084"];
  for (let i = 0; i < 70; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${2.4 + Math.random() * 2}s`;
    piece.style.animationDelay = `${Math.random() * 0.7}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 5200);
  }
}
