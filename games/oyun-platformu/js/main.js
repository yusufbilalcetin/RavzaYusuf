import { loadSettings, saveSettings, loadStats, saveStats } from "./storage.js";
import { AudioManager } from "./audio.js";
import { SudokuGame, formatTime } from "./sudoku.js";
import { FlappyGame } from "./flappy.js";

const settings = loadSettings();
const stats = loadStats();
const audio = new AudioManager(settings);

const ctx = {
  audio,
  settings,
  stats,
  saveStats: () => saveStats(stats),
  goHome: () => showScreen("menu"),
  refreshMenu
};

const screens = {
  menu: document.getElementById("screen-menu"),
  sudoku: document.getElementById("screen-sudoku"),
  flappy: document.getElementById("screen-flappy")
};

const games = {
  sudoku: new SudokuGame(document.getElementById("sudokuRoot"), ctx),
  flappy: new FlappyGame(document.getElementById("flappyRoot"), ctx)
};

let activeGame = null;
let musicStarted = false;

/* ------------------------------ ekran gecisi ------------------------------ */

function showScreen(name) {
  if (activeGame) {
    games[activeGame].unmount();
    activeGame = null;
  }
  Object.entries(screens).forEach(([key, el]) => el.classList.toggle("is-active", key === name));
  document.body.dataset.screen = name;

  if (name === "sudoku" || name === "flappy") {
    activeGame = name;
    games[name].mount();
  } else {
    refreshMenu();
  }
  audio.play("nav");
}

document.querySelectorAll("[data-open]").forEach((btn) => {
  btn.addEventListener("click", () => {
    audio.play("click");
    showScreen(btn.dataset.open);
  });
});

document.getElementById("btnHome").addEventListener("click", () => showScreen("menu"));

/* ------------------------------ ana menu verisi ------------------------------ */

function refreshMenu() {
  const bests = Object.values(stats.sudoku.bests).filter(Boolean);
  const bestTime = bests.length ? Math.min(...bests) : null;
  document.getElementById("menuSudokuBest").textContent = bestTime ? formatTime(bestTime) : "—";
  document.getElementById("menuFlappyBest").textContent = String(stats.flappy.best);
}

/* ------------------------------ tema ------------------------------ */

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

document.getElementById("btnTheme").addEventListener("click", () => {
  settings.theme = settings.theme === "dark" ? "light" : "dark";
  applyTheme();
  syncSettingsUI();
  saveSettings(settings);
  audio.play("click");
});

/* ------------------------------ ses / muzik dugmeleri ------------------------------ */

const btnSound = document.getElementById("btnSound");
const btnMusic = document.getElementById("btnMusic");

function syncAudioButtons() {
  btnSound.classList.toggle("is-off", !settings.sfx);
  btnMusic.classList.toggle("is-off", !settings.music);
}

btnSound.addEventListener("click", () => {
  settings.sfx = !settings.sfx;
  saveSettings(settings);
  syncAudioButtons();
  syncSettingsUI();
  audio.play("click");
});

btnMusic.addEventListener("click", () => {
  settings.music = !settings.music;
  saveSettings(settings);
  syncAudioButtons();
  syncSettingsUI();
  audio.syncMusic();
  audio.play("click");
});

/* ------------------------------ modallar ------------------------------ */

const modalSettings = document.getElementById("modalSettings");
const modalStats = document.getElementById("modalStats");

function openModal(modal) {
  modal.hidden = false;
  audio.play("nav");
}

function closeModals() {
  modalSettings.hidden = true;
  modalStats.hidden = true;
}

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => {
    closeModals();
    audio.play("click");
  });
});

[modalSettings, modalStats].forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModals();
  });
});

document.getElementById("btnSettings").addEventListener("click", () => {
  syncSettingsUI();
  openModal(modalSettings);
});

document.getElementById("btnStats").addEventListener("click", () => {
  renderStats();
  openModal(modalStats);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && (!modalSettings.hidden || !modalStats.hidden)) closeModals();
});

/* ------------------------------ ayarlar arayuzu ------------------------------ */

const setName = document.getElementById("setName");
const setSfx = document.getElementById("setSfx");
const setSfxVol = document.getElementById("setSfxVol");
const setMusic = document.getElementById("setMusic");
const setMusicVol = document.getElementById("setMusicVol");
const setAutoCheck = document.getElementById("setAutoCheck");

function syncSeg(id, value) {
  document.querySelectorAll(`#${id} button`).forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.value === value);
  });
}

function syncSettingsUI() {
  setName.value = settings.playerName;
  setSfx.checked = settings.sfx;
  setSfxVol.value = Math.round(settings.sfxVol * 100);
  setMusic.checked = settings.music;
  setMusicVol.value = Math.round(settings.musicVol * 100);
  setAutoCheck.checked = settings.autoCheck;
  syncSeg("setTheme", settings.theme);
  syncSeg("setSudokuTheme", settings.sudokuTheme);
  syncSeg("setFlappySkin", settings.flappySkin);
}

setName.addEventListener("change", () => {
  settings.playerName = setName.value.trim() || "Oyuncu";
  saveSettings(settings);
});

setSfx.addEventListener("change", () => {
  settings.sfx = setSfx.checked;
  saveSettings(settings);
  syncAudioButtons();
  audio.play("click");
});

setSfxVol.addEventListener("input", () => {
  settings.sfxVol = Number(setSfxVol.value) / 100;
  saveSettings(settings);
  audio.play("click");
});

setMusic.addEventListener("change", () => {
  settings.music = setMusic.checked;
  saveSettings(settings);
  syncAudioButtons();
  audio.syncMusic();
});

setMusicVol.addEventListener("input", () => {
  settings.musicVol = Number(setMusicVol.value) / 100;
  saveSettings(settings);
  audio.updateMusicVolume();
});

setAutoCheck.addEventListener("change", () => {
  settings.autoCheck = setAutoCheck.checked;
  saveSettings(settings);
});

function bindSeg(id, key, after) {
  document.querySelectorAll(`#${id} button`).forEach((btn) => {
    btn.addEventListener("click", () => {
      settings[key] = btn.dataset.value;
      saveSettings(settings);
      syncSeg(id, settings[key]);
      audio.play("click");
      if (after) after();
    });
  });
}

bindSeg("setTheme", "theme", applyTheme);
bindSeg("setSudokuTheme", "sudokuTheme");
bindSeg("setFlappySkin", "flappySkin");

document.getElementById("btnFullscreen").addEventListener("click", () => {
  audio.play("click");
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

/* ------------------------------ istatistikler ------------------------------ */

const BADGES = [
  { id: "ilk-sudoku", label: "🧩 İlk Sudoku", test: () => stats.sudoku.wins >= 1 },
  { id: "uzman", label: "🎓 Uzman Çözücü", test: () => Boolean(stats.sudoku.bests.uzman) },
  { id: "hizli", label: "⚡ 5 Dakika Altı", test: () => Object.values(stats.sudoku.bests).some((t) => t && t < 300) },
  { id: "ucus-10", label: "🕊 10 Kule", test: () => stats.flappy.best >= 10 },
  { id: "ucus-25", label: "🌟 25 Kule", test: () => stats.flappy.best >= 25 },
  { id: "sadik", label: "🎮 10 Oyun", test: () => stats.sudoku.games + stats.flappy.games >= 10 }
];

function renderStats() {
  const total = stats.sudoku.games + stats.flappy.games;
  document.getElementById("statsName").textContent = settings.playerName;
  document.getElementById("statsTotal").textContent = `${total} oyun oynandı`;

  const bests = stats.sudoku.bests;
  document.getElementById("statsBody").innerHTML = `
    <div class="stat-group">
      <h5>Sudoku</h5>
      <div class="stat-line"><span>Kazanılan</span><strong>${stats.sudoku.wins} / ${stats.sudoku.games}</strong></div>
      ${Object.entries(bests).map(([key, val]) => `
        <div class="stat-line"><span>${key.charAt(0).toUpperCase() + key.slice(1)} en iyi</span><strong>${val ? formatTime(val) : "—"}</strong></div>
      `).join("")}
    </div>
    <div class="stat-group">
      <h5>Kristal Uçuşu</h5>
      <div class="stat-line"><span>Rekor</span><strong>${stats.flappy.best}</strong></div>
      <div class="stat-line"><span>Toplam uçuş</span><strong>${stats.flappy.games}</strong></div>
      <div class="stat-line"><span>Geçilen kule</span><strong>${stats.flappy.obstacles}</strong></div>
    </div>
  `;

  document.getElementById("badgeRow").innerHTML = BADGES.map((badge) => `
    <span class="badge${badge.test() ? " is-earned" : ""}">${badge.label}</span>
  `).join("");
}

/* ------------------------------ arka plan yildizlari ------------------------------ */

const starHost = document.getElementById("bgStars");
for (let i = 0; i < 34; i += 1) {
  const star = document.createElement("span");
  star.className = "bg-star";
  star.style.left = `${Math.random() * 100}%`;
  star.style.top = `${Math.random() * 100}%`;
  star.style.animationDelay = `${Math.random() * 3.5}s`;
  star.style.animationDuration = `${2.6 + Math.random() * 2.6}s`;
  starHost.appendChild(star);
}

/* ------------------------------ baslangic ------------------------------ */

// Tarayici politikasi geregi muzik ilk kullanici etkilesiminde baslar.
window.addEventListener("pointerdown", () => {
  if (musicStarted) return;
  musicStarted = true;
  audio.syncMusic();
}, { once: false });

applyTheme();
syncAudioButtons();
syncSettingsUI();
refreshMenu();
