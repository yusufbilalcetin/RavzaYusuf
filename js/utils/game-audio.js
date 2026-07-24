/**
 * Hafif oyun ses motoru. Tum efektler ve muzik Web Audio API ile aninda
 * uretilir; harici ses dosyasi gerektirmez (telif sorunu yok, ek yuk yok).
 */
export function createGameAudio({
  storageKey = "gameSoundOn",
  settingsKey = "",
  defaultSettings = {}
} = {}) {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let musicTimer = 0;
  let musicStep = 0;
  let settings = readStoredSettings(settingsKey, storageKey, defaultSettings);

  function clampVolume(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 70;
    return Math.max(0, Math.min(100, Math.round(amount)));
  }

  function persistSettings() {
    if (settingsKey) {
      try {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
      } catch (error) {
        /* depolama kullanilamiyor, sessizce yoksay */
      }
    }
    writeStoredEnabled(storageKey, settings.musicEnabled || settings.sfxEnabled);
  }

  function syncMasterGain() {
    if (master) master.gain.value = settings.masterVolume / 100;
  }

  function ensure(channel = "sfx") {
    if (settings.masterVolume <= 0) return false;
    if (channel === "music" && !settings.musicEnabled) return false;
    if (channel === "sfx" && !settings.sfxEnabled) return false;
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      ctx = new Ctx();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    syncMasterGain();
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function tone({ freq = 440, dur = 0.15, type = "sine", vol = 0.5, delay = 0, slide = 0 }, channel = "sfx") {
    if (!ensure(channel)) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.4, delay = 0, filterFreq = 800, filterType = "lowpass" }, channel = "sfx") {
    if (!ensure(channel)) return;
    const t0 = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) samples[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, vol), t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  const sfx = {
    flap() {
      noise({ dur: 0.08, vol: 0.18, filterFreq: 1500, filterType: "bandpass" });
      tone({ freq: 500, dur: 0.09, type: "sine", vol: 0.18, slide: 220 });
    },
    score() {
      tone({ freq: 880, dur: 0.09, type: "sine", vol: 0.4 });
      tone({ freq: 1175, dur: 0.1, type: "sine", vol: 0.35, delay: 0.06 });
    },
    crash() {
      noise({ dur: 0.3, vol: 0.4, filterFreq: 420 });
      tone({ freq: 130, dur: 0.28, type: "sine", vol: 0.4, slide: -60 });
    },
    click() {
      tone({ freq: 660, dur: 0.07, type: "triangle", vol: 0.3 });
    },
    purchase() {
      tone({ freq: 660, dur: 0.08, type: "triangle", vol: 0.35 });
      tone({ freq: 990, dur: 0.1, type: "triangle", vol: 0.3, delay: 0.07 });
      tone({ freq: 1320, dur: 0.12, type: "triangle", vol: 0.28, delay: 0.14 });
    },
    equip() {
      tone({ freq: 520, dur: 0.06, type: "sine", vol: 0.28 });
      tone({ freq: 780, dur: 0.09, type: "sine", vol: 0.26, delay: 0.05 });
    }
  };

  function scheduleMusicBar() {
    if (!ctx || !musicGain) return;
    const chords = [
      [261.6, 329.6, 392.0],
      [220.0, 277.2, 329.6],
      [246.9, 311.1, 370.0],
      [196.0, 246.9, 293.7]
    ];
    const chord = chords[musicStep % chords.length];
    const t0 = ctx.currentTime + 0.05;

    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq * (i === 2 ? 1.002 : 1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.05, t0 + 1.1);
      gain.gain.linearRampToValueAtTime(0.0001, t0 + 3.2);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(t0);
      osc.stop(t0 + 3.4);
    });

    musicStep += 1;
  }

  function startMusic() {
    if (!ensure("music") || musicTimer) return;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.32;
    musicGain.connect(master);
    musicStep = 0;
    scheduleMusicBar();
    musicTimer = setInterval(scheduleMusicBar, 3200);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = 0;
    }
    if (musicGain) {
      musicGain.disconnect();
      musicGain = null;
    }
  }

  function readStoredEnabled(key) {
    try {
      return localStorage.getItem(key) !== "0";
    } catch (error) {
      return true;
    }
  }

  function writeStoredEnabled(key, value) {
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch (error) {
      /* depolama kullanilamiyor, sessizce yoksay */
    }
  }

  function readStoredSettings(key, legacyKey, defaults = {}) {
    const fallback = {
      musicEnabled: true,
      sfxEnabled: true,
      masterVolume: 70,
      ...defaults
    };
    fallback.masterVolume = clampVolume(fallback.masterVolume);
    if (key) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (parsed && typeof parsed === "object") {
          return {
            musicEnabled: typeof parsed.musicEnabled === "boolean" ? parsed.musicEnabled : fallback.musicEnabled,
            sfxEnabled: typeof parsed.sfxEnabled === "boolean" ? parsed.sfxEnabled : fallback.sfxEnabled,
            masterVolume: clampVolume(parsed.masterVolume ?? fallback.masterVolume)
          };
        }
      } catch (error) {
        /* gecersiz kayit varsa varsayilanlara dus */
      }
    }
    const legacyEnabled = readStoredEnabled(legacyKey);
    return {
      ...fallback,
      musicEnabled: legacyEnabled && fallback.musicEnabled,
      sfxEnabled: legacyEnabled && fallback.sfxEnabled
    };
  }

  return {
    play(name) {
      if (!settings.sfxEnabled) return;
      sfx[name]?.();
    },
    startMusic,
    stopMusic,
    isEnabled() {
      return settings.musicEnabled || settings.sfxEnabled;
    },
    setEnabled(value) {
      settings.musicEnabled = Boolean(value);
      settings.sfxEnabled = Boolean(value);
      persistSettings();
      if (!settings.musicEnabled) stopMusic();
    },
    toggle() {
      const next = !this.isEnabled();
      settings.musicEnabled = next;
      settings.sfxEnabled = next;
      persistSettings();
      if (!next) stopMusic();
      return next;
    },
    getSettings() {
      return { ...settings };
    },
    setMusicEnabled(value) {
      settings.musicEnabled = Boolean(value);
      persistSettings();
      if (!settings.musicEnabled) stopMusic();
      return settings.musicEnabled;
    },
    toggleMusic() {
      return this.setMusicEnabled(!settings.musicEnabled);
    },
    setSfxEnabled(value) {
      settings.sfxEnabled = Boolean(value);
      persistSettings();
      return settings.sfxEnabled;
    },
    toggleSfx() {
      return this.setSfxEnabled(!settings.sfxEnabled);
    },
    setMasterVolume(value) {
      settings.masterVolume = clampVolume(value);
      syncMasterGain();
      persistSettings();
      return settings.masterVolume;
    }
  };
}
