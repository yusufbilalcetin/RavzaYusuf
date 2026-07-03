/**
 * Kristal Ucusu — ozgun tek-dokunus ucus oyunu.
 * Karakter: Lumi, parildayan mini isik ejderi. Engeller: gokyuzunde suzulen kristal kuleler.
 */

import { formatTime } from "./sudoku.js";

const SKINS = {
  turkuaz: { body1: "#9df3ea", body2: "#37d0c4", body3: "#1e9a91", wing: "#7ce8dd", trail: "255, 214, 120" },
  gunbatimi: { body1: "#ffc7de", body2: "#f077a8", body3: "#c04a7e", wing: "#ff9ec7", trail: "255, 160, 200" },
  altin: { body1: "#ffe9a8", body2: "#f2c14e", body3: "#c98f1c", wing: "#ffd97a", trail: "160, 230, 255" }
};

const GRAVITY = 1750;
const FLAP_V = -520;
const BASE_SPEED = 158;
const MAX_SPEED = 320;
const CRYSTAL_W = 72;
const CHAR_X = 0.3;
const CHAR_R = 17;

const ICONS = {
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 4v16M14 4v16"/></svg>`
};

export class FlappyGame {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.onKey = this.onKey.bind(this);
    this.onPointer = this.onPointer.bind(this);
    this.onResize = this.onResize.bind(this);
    this.frame = this.frame.bind(this);
  }

  mount() {
    this.root.innerHTML = `
      <div class="game-head">
        <button class="icon-btn" type="button" data-act="home" aria-label="Ana menü">${ICONS.back}</button>
        <h2>Kristal Uçuşu</h2>
        <span style="width:42px"></span>
      </div>
      <div class="fl-shell" id="flShell">
        <canvas class="fl-canvas" id="flCanvas"></canvas>
        <div class="fl-hud">
          <button class="icon-btn" type="button" data-act="pause" title="Duraklat">${ICONS.pause}</button>
        </div>
        <div class="fl-overlay" id="flOverlay"></div>
      </div>
    `;

    this.shell = this.root.querySelector("#flShell");
    this.canvas = this.root.querySelector("#flCanvas");
    this.overlay = this.root.querySelector("#flOverlay");
    this.g = this.canvas.getContext("2d");

    this.stars = Array.from({ length: 40 }, (_, i) => ({
      x: (i * 61 % 100) / 100,
      y: (i * 37 % 55) / 100,
      phase: i * 1.7,
      size: 1 + (i % 3)
    }));
    this.clouds = Array.from({ length: 5 }, (_, i) => ({
      x: i * 0.23 + 0.05,
      y: 0.1 + ((i * 41) % 34) / 100,
      scale: 0.7 + ((i * 53) % 40) / 100
    }));

    this.s = {
      phase: "menu",
      y: 0, vy: 0,
      crystals: [],
      particles: [],
      score: 0,
      best: this.ctx.stats.flappy.best,
      elapsed: 0,
      distance: 0,
      spawnTimer: 0,
      wing: 0,
      time: 0,
      lastTime: 0,
      slowmo: 1,
      w: 0, h: 0,
      rafId: 0
    };

    this.root.onclick = (event) => {
      const act = event.target.closest("[data-act]");
      if (!act) return;
      this.ctx.audio.play("click");
      if (act.dataset.act === "home") this.ctx.goHome();
      if (act.dataset.act === "pause") this.togglePause();
      if (act.dataset.act === "play") this.showReady();
      if (act.dataset.act === "menu") this.showMenu();
    };

    this.shell.addEventListener("pointerdown", this.onPointer);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onResize);

    this.onResize();
    this.showMenu();
    this.s.rafId = requestAnimationFrame((t) => {
      this.s.lastTime = t;
      this.frame(t);
    });
  }

  unmount() {
    cancelAnimationFrame(this.s.rafId);
    this.shell.removeEventListener("pointerdown", this.onPointer);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    this.root.onclick = null;
    this.root.innerHTML = "";
  }

  onResize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.s.w = this.shell.clientWidth;
    this.s.h = this.shell.clientHeight;
    this.canvas.width = Math.round(this.s.w * ratio);
    this.canvas.height = Math.round(this.s.h * ratio);
    this.g.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  onPointer(event) {
    if (event.target.closest("button")) return;
    event.preventDefault();
    this.flap();
  }

  onKey(event) {
    if (event.key === "Escape") {
      this.ctx.goHome();
      return;
    }
    if (event.key === "p" || event.key === "P") {
      this.togglePause();
      return;
    }
    if (event.code === "Space" || event.code === "ArrowUp") {
      event.preventDefault();
      this.flap();
    }
  }

  /* ------------------------------ durumlar ------------------------------ */

  speed() {
    return Math.min(MAX_SPEED, BASE_SPEED + this.s.score * 3.4);
  }

  gap() {
    const ratio = Math.max(0.215, 0.3 - this.s.score * 0.0022);
    return Math.max(this.s.h * ratio, 132);
  }

  resetRound() {
    const s = this.s;
    s.y = s.h * 0.45;
    s.vy = 0;
    s.crystals = [];
    s.particles = [];
    s.score = 0;
    s.elapsed = 0;
    s.spawnTimer = 1.1;
    s.slowmo = 1;
  }

  showMenu() {
    this.s.phase = "menu";
    this.resetRound();
    const best = this.ctx.stats.flappy.best;
    this.overlay.innerHTML = `
      <h3>Kristal Uçuşu</h3>
      <p>Lumi'yi kristal kulelerin arasından geçir. Her geçiş +1 puan; hız yavaşça artar!</p>
      ${best ? `<p style="color:#f2c14e;font-weight:800">Rekor: ${best}</p>` : ""}
      <div class="fl-menu">
        <button class="btn btn-primary btn-primary--sky" type="button" data-act="play">Uçuşa Başla</button>
      </div>
    `;
    this.overlay.hidden = false;
  }

  showReady() {
    this.s.phase = "ready";
    this.resetRound();
    this.overlay.innerHTML = `
      <h3>Hazır mısın?</h3>
      <p>Dokun, tıkla veya <b>Space</b> ile kanat çırp.</p>
    `;
    this.overlay.hidden = false;
  }

  startPlaying() {
    this.s.phase = "playing";
    this.overlay.hidden = true;
    this.s.vy = FLAP_V;
    this.ctx.audio.play("start");
    this.emitParticles(7);
  }

  togglePause() {
    const s = this.s;
    if (s.phase === "playing") {
      s.phase = "paused";
      this.ctx.audio.play("nav");
      this.overlay.innerHTML = `
        <h3>⏸ Duraklatıldı</h3>
        <div class="fl-menu">
          <button class="btn btn-primary btn-primary--sky" type="button" data-act="pause">Devam Et</button>
          <button class="btn btn-ghost" type="button" data-act="menu" style="color:#fff">Ana Ekran</button>
        </div>
      `;
      this.overlay.hidden = false;
    } else if (s.phase === "paused") {
      s.phase = "playing";
      this.overlay.hidden = true;
      this.ctx.audio.play("nav");
    }
  }

  flap() {
    const s = this.s;
    if (s.phase === "ready") {
      this.startPlaying();
      return;
    }
    if (s.phase === "playing") {
      s.vy = FLAP_V;
      s.wing = 0;
      this.ctx.audio.play("flap");
      this.emitParticles(4);
    }
  }

  gameOver() {
    const s = this.s;
    s.phase = "dead";
    s.slowmo = 0.25;
    this.ctx.audio.play("crash");

    const stats = this.ctx.stats;
    stats.flappy.games += 1;
    stats.flappy.obstacles += s.score;
    let isRecord = false;
    if (s.score > stats.flappy.best) {
      stats.flappy.best = s.score;
      isRecord = true;
    }
    this.ctx.saveStats();
    this.ctx.refreshMenu();

    setTimeout(() => {
      if (this.s.phase !== "dead") return;
      this.ctx.audio.play("over");
      if (isRecord && s.score > 0) this.ctx.audio.play("record");
      this.overlay.innerHTML = `
        ${isRecord && s.score > 0 ? `<div class="record-chip">🏆 Yeni Rekor!</div>` : ""}
        <h3>Uçuş Bitti</h3>
        <div class="fl-result">
          <div><span>Skor</span><strong>${s.score}</strong></div>
          <div><span>Rekor</span><strong>${stats.flappy.best}</strong></div>
          <div><span>Süre</span><strong>${formatTime(Math.floor(s.elapsed))}</strong></div>
          <div><span>Geçilen kule</span><strong>${s.score}</strong></div>
        </div>
        <div class="fl-menu">
          <button class="btn btn-primary btn-primary--sky" type="button" data-act="play">Tekrar Uç</button>
          <button class="btn btn-ghost" type="button" data-act="home" style="color:#fff">Ana Menü</button>
        </div>
      `;
      this.overlay.hidden = false;
    }, 650);
  }

  /* ------------------------------ dongu ------------------------------ */

  frame(time) {
    this.s.rafId = requestAnimationFrame(this.frame);
    const s = this.s;
    let delta = Math.min((time - s.lastTime) / 1000, 0.05);
    s.lastTime = time;
    s.time = time / 1000;

    if (s.phase === "playing") {
      s.wing += delta * 15;
      s.elapsed += delta;
      this.update(delta);
    } else {
      s.wing += delta * 6;
      if (s.phase === "dead") this.updateDeath(delta * s.slowmo);
    }
    this.updateParticles(delta);
    this.draw();
  }

  update(delta) {
    const s = this.s;
    const speed = this.speed();

    s.vy += GRAVITY * delta;
    s.y += s.vy * delta;
    s.distance += speed * delta;

    s.spawnTimer -= delta;
    if (s.spawnTimer <= 0) {
      this.spawnCrystal();
      s.spawnTimer = Math.max(1.05, 245 / speed);
    }

    const charX = s.w * CHAR_X;

    for (const c of s.crystals) {
      c.x -= speed * delta;
      if (!c.passed && c.x + CRYSTAL_W < charX - CHAR_R) {
        c.passed = true;
        s.score += 1;
        this.ctx.audio.play("score");
        this.emitParticles(6, true);
      }
    }
    s.crystals = s.crystals.filter((c) => c.x + CRYSTAL_W > -20);

    if (s.y - CHAR_R <= 0) {
      s.y = CHAR_R;
      s.vy = Math.max(s.vy, 0);
    }

    const groundY = s.h - 30;
    if (s.y + CHAR_R >= groundY) {
      s.y = groundY - CHAR_R;
      this.gameOver();
      return;
    }

    const inset = 8;
    for (const c of s.crystals) {
      const withinX = charX + CHAR_R > c.x + inset && charX - CHAR_R < c.x + CRYSTAL_W - inset;
      if (!withinX) continue;
      if (s.y - CHAR_R < c.gapTop || s.y + CHAR_R > c.gapBottom) {
        this.gameOver();
        return;
      }
    }
  }

  updateDeath(delta) {
    const s = this.s;
    s.vy += GRAVITY * delta;
    s.y = Math.min(s.h - 30 - CHAR_R, s.y + s.vy * delta);
  }

  spawnCrystal() {
    const s = this.s;
    const gap = this.gap();
    const playH = s.h - 30;
    const margin = Math.max(playH * 0.09, 42);
    const gapTop = margin + Math.random() * (playH - gap - margin * 2);
    s.crystals.push({ x: s.w + CRYSTAL_W, gapTop, gapBottom: gapTop + gap, passed: false, hue: Math.random() * 40 - 20 });
  }

  emitParticles(count, gold = false) {
    const s = this.s;
    const skin = SKINS[this.ctx.settings.flappySkin] || SKINS.turkuaz;
    const charX = s.w * CHAR_X;
    for (let i = 0; i < count; i += 1) {
      s.particles.push({
        x: charX - 12 + Math.random() * 8,
        y: s.y + (Math.random() - 0.5) * 16,
        vx: -40 - Math.random() * 60,
        vy: (Math.random() - 0.5) * 70,
        life: 0.6 + Math.random() * 0.4,
        max: 1,
        size: gold ? 3.5 : 2.5,
        color: gold ? "255, 214, 110" : skin.trail
      });
    }
  }

  updateParticles(delta) {
    const s = this.s;
    for (const p of s.particles) {
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.life -= delta;
    }
    s.particles = s.particles.filter((p) => p.life > 0);
  }

  /* ------------------------------ cizim ------------------------------ */

  draw() {
    const { g, s } = this;
    const { w, h } = s;

    // Gokyuzu: gece mavisi -> mor -> gunbatimi turuncusu
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#101c44");
    sky.addColorStop(0.45, "#2c2a68");
    sky.addColorStop(0.78, "#6a4183");
    sky.addColorStop(1, "#d97b4f");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    // Yildizlar
    for (const st of this.stars) {
      const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(s.time * 1.6 + st.phase));
      g.fillStyle = `rgba(255, 245, 220, ${alpha})`;
      g.fillRect(st.x * w, st.y * h, st.size, st.size);
    }

    // Uzak daglar (paralaks)
    this.drawMountains("#1c2350", 0.16, h * 0.66, 190, 105);
    this.drawMountains("#2a2f63", 0.28, h * 0.74, 150, 85);

    // Bulutlar
    const span = w + 240;
    const cloudShift = (s.distance * 0.1) % span;
    g.fillStyle = "rgba(235, 225, 255, .16)";
    for (const cl of this.clouds) {
      let x = cl.x * span - cloudShift;
      if (x < -240) x += span;
      const y = cl.y * h;
      g.beginPath();
      g.ellipse(x, y, 52 * cl.scale, 15 * cl.scale, 0, 0, Math.PI * 2);
      g.ellipse(x + 30 * cl.scale, y - 11 * cl.scale, 32 * cl.scale, 13 * cl.scale, 0, 0, Math.PI * 2);
      g.fill();
    }

    // Kristaller
    for (const c of s.crystals) this.drawCrystal(c);

    // Zemin: parlayan kristal serit
    const groundY = h - 30;
    const ground = g.createLinearGradient(0, groundY, 0, h);
    ground.addColorStop(0, "#3b2d63");
    ground.addColorStop(1, "#241b45");
    g.fillStyle = ground;
    g.fillRect(0, groundY, w, 30);
    g.fillStyle = "rgba(160, 130, 255, .5)";
    g.fillRect(0, groundY, w, 2.5);
    const gShift = s.distance % 46;
    g.fillStyle = "rgba(190, 160, 255, .16)";
    for (let x = -gShift; x < w + 46; x += 46) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 12, groundY + 7);
      g.lineTo(x + 24, h);
      g.closePath();
      g.fill();
    }

    // Parcaciklar (isik izi)
    for (const p of s.particles) {
      g.fillStyle = `rgba(${p.color}, ${Math.max(0, p.life / p.max) * 0.85})`;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (p.life / p.max + 0.4), 0, Math.PI * 2);
      g.fill();
    }

    this.drawLumi();

    // Skor
    if (s.phase === "playing" || s.phase === "paused") {
      g.fillStyle = "#ffffff";
      g.strokeStyle = "rgba(10, 10, 40, .5)";
      g.lineWidth = 5;
      g.font = "800 44px Outfit, sans-serif";
      g.textAlign = "center";
      g.strokeText(String(s.score), w / 2, 66);
      g.fillText(String(s.score), w / 2, 66);
    }
  }

  drawMountains(color, parallax, baseY, spacing, height) {
    const { g, s } = this;
    const shift = (s.distance * parallax) % spacing;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(-spacing, s.h);
    for (let x = -shift - spacing; x < s.w + spacing; x += spacing) {
      g.lineTo(x, baseY);
      g.lineTo(x + spacing / 2, baseY - height);
    }
    g.lineTo(s.w + spacing, s.h);
    g.closePath();
    g.fill();
  }

  drawCrystal(c) {
    const { g, s } = this;
    const groundY = s.h - 30;

    const drawSpire = (top, bottom, pointDown) => {
      const midX = c.x + CRYSTAL_W / 2;
      const grad = g.createLinearGradient(c.x, 0, c.x + CRYSTAL_W, 0);
      grad.addColorStop(0, `hsl(${262 + c.hue}, 62%, 74%)`);
      grad.addColorStop(0.5, `hsl(${256 + c.hue}, 58%, 58%)`);
      grad.addColorStop(1, `hsl(${250 + c.hue}, 55%, 40%)`);
      g.fillStyle = grad;

      g.beginPath();
      if (pointDown) {
        g.moveTo(c.x, top);
        g.lineTo(c.x + CRYSTAL_W, top);
        g.lineTo(c.x + CRYSTAL_W * 0.82, bottom - 26);
        g.lineTo(midX, bottom);
        g.lineTo(c.x + CRYSTAL_W * 0.18, bottom - 26);
      } else {
        g.moveTo(midX, top);
        g.lineTo(c.x + CRYSTAL_W * 0.82, top + 26);
        g.lineTo(c.x + CRYSTAL_W, bottom);
        g.lineTo(c.x, bottom);
        g.lineTo(c.x + CRYSTAL_W * 0.18, top + 26);
      }
      g.closePath();
      g.fill();

      // parlak yuz cizgisi
      g.strokeStyle = "rgba(235, 225, 255, .5)";
      g.lineWidth = 1.6;
      g.beginPath();
      if (pointDown) {
        g.moveTo(c.x + CRYSTAL_W * 0.3, top);
        g.lineTo(midX, bottom - 6);
      } else {
        g.moveTo(midX, top + 6);
        g.lineTo(c.x + CRYSTAL_W * 0.3, bottom);
      }
      g.stroke();
    };

    // hafif parilti
    g.save();
    g.shadowColor = "rgba(150, 120, 255, .55)";
    g.shadowBlur = 16;
    drawSpire(0, c.gapTop, true);
    drawSpire(c.gapBottom, groundY, false);
    g.restore();
  }

  drawLumi() {
    const { g, s } = this;
    const skin = SKINS[this.ctx.settings.flappySkin] || SKINS.turkuaz;
    const x = s.w * CHAR_X;
    const dead = s.phase === "dead";
    const tilt = dead ? 0.85 : Math.max(-0.4, Math.min(0.85, s.vy / 640));

    g.save();
    g.translate(x, s.y);
    g.rotate(tilt);

    // isik halesi
    g.shadowColor = `rgba(${skin.trail}, .8)`;
    g.shadowBlur = 18;

    // govde
    const body = g.createRadialGradient(-5, -6, 4, 0, 0, CHAR_R + 8);
    body.addColorStop(0, skin.body1);
    body.addColorStop(0.62, skin.body2);
    body.addColorStop(1, skin.body3);
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 0, CHAR_R + 5, CHAR_R, 0, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;

    // karin
    g.fillStyle = "rgba(255, 250, 225, .85)";
    g.beginPath();
    g.ellipse(3, 7, 10, 5.5, 0, 0, Math.PI * 2);
    g.fill();

    // kucuk boynuzlar
    g.fillStyle = skin.body3;
    g.beginPath();
    g.moveTo(-2, -CHAR_R + 2);
    g.lineTo(1, -CHAR_R - 7);
    g.lineTo(5, -CHAR_R + 3);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(6, -CHAR_R + 3);
    g.lineTo(10, -CHAR_R - 4);
    g.lineTo(12, -CHAR_R + 5);
    g.closePath();
    g.fill();

    // kanat (cirpma animasyonu)
    const wingAngle = dead ? 0.55 : Math.sin(s.wing) * 0.75;
    g.save();
    g.translate(-6, -1);
    g.rotate(wingAngle);
    g.fillStyle = skin.wing;
    g.beginPath();
    g.ellipse(-7, 0, 12, 7.5, -0.35, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(20, 40, 60, .25)";
    g.lineWidth = 1.4;
    g.stroke();
    g.restore();

    // kuyruk isigi
    g.fillStyle = `rgba(${skin.trail}, .9)`;
    g.beginPath();
    g.arc(-CHAR_R - 4, 3, 3.4, 0, Math.PI * 2);
    g.fill();

    // goz
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(8, -6, 5.8, 0, Math.PI * 2);
    g.fill();
    if (dead) {
      g.strokeStyle = "#1e2742";
      g.lineWidth = 1.9;
      g.beginPath();
      g.moveTo(5.6, -8.4); g.lineTo(10.6, -3.4);
      g.moveTo(10.6, -8.4); g.lineTo(5.6, -3.4);
      g.stroke();
    } else {
      g.fillStyle = "#1e2742";
      g.beginPath();
      g.arc(9.6, -6, 2.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(10.4, -7, 0.9, 0, Math.PI * 2);
      g.fill();
    }

    // agiz / burun
    g.fillStyle = skin.body3;
    g.beginPath();
    g.ellipse(CHAR_R + 1, 1, 4.5, 3.2, 0, 0, Math.PI * 2);
    g.fill();

    g.restore();
  }
}
