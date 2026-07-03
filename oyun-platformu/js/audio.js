/**
 * Merkezi ses yoneticisi.
 * Tum efektler Web Audio API ile anlik uretilir (telifsiz, dosya gerektirmez).
 * Muzik: yavas donen akor pedleri + ara sira parildayan tiz notalar.
 */
export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicTimer = 0;
    this.musicStep = 0;
  }

  ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  }

  tone({ freq = 440, dur = 0.15, type = "sine", vol = 0.5, delay = 0, slide = 0, pan = 0 }) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    const level = vol * this.settings.sfxVol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = gain;
    if (pan && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      node = panner;
    }
    osc.connect(gain);
    node.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.4, delay = 0, filterFreq = 800, filterType = "lowpass" }) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    const level = vol * this.settings.sfxVol;
    gain.gain.setValueAtTime(Math.max(0.0001, level), t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  play(name) {
    if (!this.settings.sfx) return;
    switch (name) {
      case "click":
        this.tone({ freq: 660, dur: 0.07, type: "triangle", vol: 0.35 });
        break;
      case "nav":
        this.tone({ freq: 420, dur: 0.1, type: "sine", vol: 0.3, slide: 220 });
        break;
      case "start":
        [523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.14, type: "triangle", vol: 0.4, delay: i * 0.09 }));
        break;
      case "over":
        [392, 311, 233].forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: "triangle", vol: 0.4, delay: i * 0.14 }));
        break;
      case "win":
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.2, type: "triangle", vol: 0.42, delay: i * 0.1 }));
        break;
      case "record":
        [587, 740, 880, 1175].forEach((f, i) => this.tone({ freq: f, dur: 0.18, type: "square", vol: 0.2, delay: i * 0.11 }));
        break;
      case "error":
        this.tone({ freq: 190, dur: 0.2, type: "sawtooth", vol: 0.22, slide: -60 });
        break;
      case "score":
        this.tone({ freq: 880, dur: 0.09, type: "sine", vol: 0.4 });
        this.tone({ freq: 1175, dur: 0.1, type: "sine", vol: 0.35, delay: 0.06 });
        break;
      case "flap":
        this.noise({ dur: 0.08, vol: 0.16, filterFreq: 1600, filterType: "bandpass" });
        this.tone({ freq: 520, dur: 0.08, type: "sine", vol: 0.16, slide: 240 });
        break;
      case "crash":
        this.noise({ dur: 0.3, vol: 0.4, filterFreq: 420 });
        this.tone({ freq: 130, dur: 0.28, type: "sine", vol: 0.4, slide: -60 });
        break;
      case "place":
        this.tone({ freq: 540, dur: 0.06, type: "triangle", vol: 0.32 });
        break;
      case "good":
        this.tone({ freq: 740, dur: 0.1, type: "sine", vol: 0.32 });
        this.tone({ freq: 988, dur: 0.12, type: "sine", vol: 0.26, delay: 0.07 });
        break;
      case "select":
        this.tone({ freq: 480, dur: 0.04, type: "sine", vol: 0.16 });
        break;
      case "note":
        this.tone({ freq: 820, dur: 0.05, type: "triangle", vol: 0.2 });
        break;
      case "hint":
        [660, 880].forEach((f, i) => this.tone({ freq: f, dur: 0.12, type: "sine", vol: 0.3, delay: i * 0.08 }));
        break;
      default:
        break;
    }
  }

  /* ------------------------------ MUZIK ------------------------------ */

  startMusic() {
    if (!this.settings.music || !this.ensure()) return;
    if (this.musicTimer) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.settings.musicVol * 0.5;
    this.musicGain.connect(this.master);
    this.musicStep = 0;
    this.scheduleMusicBar();
    this.musicTimer = setInterval(() => this.scheduleMusicBar(), 3600);
  }

  scheduleMusicBar() {
    if (!this.ctx || !this.musicGain) return;
    const chords = [
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [196.0, 246.9, 293.7],
      [164.8, 207.7, 246.9]
    ];
    const chord = chords[this.musicStep % chords.length];
    const t0 = this.ctx.currentTime + 0.05;

    chord.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq * (i === 2 ? 1.002 : 1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.09, t0 + 1.2);
      gain.gain.linearRampToValueAtTime(0.0001, t0 + 3.6);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(t0);
      osc.stop(t0 + 3.8);
    });

    if (this.musicStep % 2 === 1) {
      const sparkle = this.ctx.createOscillator();
      const sGain = this.ctx.createGain();
      sparkle.type = "sine";
      sparkle.frequency.value = chord[Math.floor(Math.random() * 3)] * 4;
      const st = t0 + 1.4 + Math.random();
      sGain.gain.setValueAtTime(0.0001, st);
      sGain.gain.linearRampToValueAtTime(0.05, st + 0.05);
      sGain.gain.exponentialRampToValueAtTime(0.0001, st + 0.9);
      sparkle.connect(sGain);
      sGain.connect(this.musicGain);
      sparkle.start(st);
      sparkle.stop(st + 1);
    }

    this.musicStep += 1;
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = 0;
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
      this.musicGain = null;
    }
  }

  syncMusic() {
    if (this.settings.music) {
      this.stopMusic();
      this.startMusic();
    } else {
      this.stopMusic();
    }
  }

  updateMusicVolume() {
    if (this.musicGain) this.musicGain.gain.value = this.settings.musicVol * 0.5;
  }
}
