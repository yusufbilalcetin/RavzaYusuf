/* =========================================================
   RAVZA KAHOOT - COK CIHAZLI ODA + QR (FIRESTORE REALTIME)
   Tum canli oda durumu Firestore'da: kahootRooms/{roomId}
   (+ players, answers alt koleksiyonlari).
   QR ile baska cihazlardan katilim: ?page=kahoot&room=ROOM_ID&role=player
   legacy-app.js icindeki IIFE'den ayrildi; davranis aynidir.
   ========================================================= */
import { db } from "../config/firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export function initRavzaKahootRoomModule({ topics }) {
  if (window.__RAVZA_KAHOOT_ROOM_MODULE_READY__) return;
  window.__RAVZA_KAHOOT_ROOM_MODULE_READY__ = true;

  /*
    -------- FIRESTORE SECURITY RULES (geliştirme) --------
    match /kahootRooms/{roomId} {
      allow read, write: if true;
      match /players/{playerId} { allow read, write: if true; }
      match /answers/{answerId} { allow read, write: if true; }
    }
    Production'da `if true` KULLANMA.
    En azından roomPin doğrulaması veya App Check + auth ekle.
  */

  const QR_CDN = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
  const QR_CDN_FALLBACKS = [
    QR_CDN,
    "https://unpkg.com/qrcode@1.5.4/build/qrcode.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.4/qrcode.min.js"
  ];
  const ROOM_COLLECTION = "kahootRooms";
  const DEFAULT_QUESTION_TIME = 20;
  const DEFAULT_QUESTION_COUNT = 10;
  const MAX_QUESTION_POINTS = 1000;
  const COUNTDOWN_MS = 3000;

  const PLAYER_PROFILE_KEY = "ravzaKahootPlayerProfile_v2";
  const HOST_ID_KEY = "ravzaKahootHostId_v1";

  /* ---------- State (tab-local) ---------- */
  const state = {
    mode: null,         // "host" | "player" | null
    roomId: null,
    playerId: null,
    hostId: getOrCreateHostId(),
    roomData: null,
    playersData: [],
    answersData: [],
    unsubs: [],
    tickId: null,
    answeredForIndex: -1,
    joining: false,
    pendingError: null,
    lastRenderSig: null
  };

  /* ---------- HTML escape ---------- */
  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ---------- Persistent IDs (player & host) ---------- */
  function getOrCreateHostId() {
    try {
      let id = localStorage.getItem(HOST_ID_KEY);
      if (!id) {
        id = "h_" + Math.random().toString(36).slice(2, 12);
        localStorage.setItem(HOST_ID_KEY, id);
      }
      return id;
    } catch (_) {
      return "h_" + Math.random().toString(36).slice(2, 12);
    }
  }
  function getOrCreatePlayerId() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(PLAYER_PROFILE_KEY) || "null");
      if (stored?.id) return stored.id;
    } catch (_) {}
    return "p_" + Math.random().toString(36).slice(2, 12);
  }
  function savePlayerProfile(profile) {
    try { sessionStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(profile)); }
    catch (_) {}
  }
  function loadPlayerProfile() {
    try { return JSON.parse(sessionStorage.getItem(PLAYER_PROFILE_KEY) || "null"); }
    catch (_) { return null; }
  }

  function generateRoomId() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let id = "";
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }
  function generateRoomPin() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /* ---------- Public base URL ---------- */
  function getKahootPublicBaseUrl() {
    const fromWindow = (window.RAVZA_KAHOOT_PUBLIC_URL || "").trim();
    const meta = document.querySelector('meta[name="kahoot-public-url"]')?.content?.trim() || "";
    const explicit = fromWindow || meta;
    if (explicit) {
      return explicit.replace(/[?#].*$/, "").replace(/\/+$/, "") + "/";
    }
    const origin = window.location.origin || "";
    const path = window.location.pathname || "/";
    return `${origin}${path}`;
  }

  function isLocalEnvironment() {
    if (!window.location) return false;
    if (window.location.protocol === "file:") return true;
    const host = (window.location.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "" || host.endsWith(".local");
  }

  function hasPublicUrlOverride() {
    if ((window.RAVZA_KAHOOT_PUBLIC_URL || "").trim()) return true;
    const meta = document.querySelector('meta[name="kahoot-public-url"]')?.content?.trim() || "";
    return Boolean(meta);
  }

  function generateKahootJoinUrl(roomId, role) {
    const base = getKahootPublicBaseUrl();
    const cleanBase = String(base).split("?")[0].split("#")[0];
    return `${cleanBase}?page=kahoot&room=${encodeURIComponent(roomId)}&role=${encodeURIComponent(role || "player")}`;
  }

  /* ---------- QR rendering with bulletproof fallback ---------- */
  let qrLoadingPromise = null;

  function loadQrScriptOnce(src) {
    return new Promise((resolve) => {
      const existing = Array.from(document.scripts).find((script) => script.src === src);
      if (existing?.dataset.loaded === "true") {
        resolve(true);
        return;
      }
      if (existing && window.QRCode?.toCanvas) {
        existing.dataset.loaded = "true";
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve(true);
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  function ensureQrLibrary() {
    if (window.QRCode?.toCanvas) return Promise.resolve(true);
    if (qrLoadingPromise) return qrLoadingPromise;
    qrLoadingPromise = (async () => {
      for (const src of QR_CDN_FALLBACKS) {
        const loaded = await loadQrScriptOnce(src);
        if (loaded && window.QRCode?.toCanvas) return true;
      }
      return false;
    })();
    return qrLoadingPromise;
  }

  const LOCAL_QR_VERSION = 5;
  const LOCAL_QR_SIZE = 17 + LOCAL_QR_VERSION * 4;
  const LOCAL_QR_DATA_CODEWORDS = 108;
  const LOCAL_QR_ECC_CODEWORDS = 26;
  const LOCAL_QR_TOTAL_CODEWORDS = LOCAL_QR_DATA_CODEWORDS + LOCAL_QR_ECC_CODEWORDS;
  const QR_GF_EXP = (() => {
    const exp = new Array(512);
    let value = 1;
    for (let i = 0; i < 255; i++) {
      exp[i] = value;
      value <<= 1;
      if (value & 0x100) value ^= 0x11d;
    }
    for (let i = 255; i < exp.length; i++) exp[i] = exp[i - 255];
    return exp;
  })();
  const QR_GF_LOG = (() => {
    const log = new Array(256).fill(0);
    for (let i = 0; i < 255; i++) log[QR_GF_EXP[i]] = i;
    return log;
  })();

  function qrGfMultiply(a, b) {
    if (!a || !b) return 0;
    return QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]];
  }

  function qrGeneratorPolynomial(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= qrGfMultiply(poly[j], QR_GF_EXP[i]);
      }
      poly = next;
    }
    return poly.slice(1);
  }

  function qrReedSolomonRemainder(data, degree) {
    const generator = qrGeneratorPolynomial(degree);
    const result = new Array(degree).fill(0);
    data.forEach((byte) => {
      const factor = byte ^ result.shift();
      result.push(0);
      for (let i = 0; i < degree; i++) {
        result[i] ^= qrGfMultiply(generator[i], factor);
      }
    });
    return result;
  }

  function getQrUtf8Bytes(value) {
    if (window.TextEncoder) return Array.from(new TextEncoder().encode(value));
    return Array.from(unescape(encodeURIComponent(value))).map((ch) => ch.charCodeAt(0));
  }

  function buildQrDataCodewords(value) {
    const bytes = getQrUtf8Bytes(value);
    const bits = [];
    const pushBits = (num, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push((num >>> i) & 1);
    };
    pushBits(0x4, 4);
    pushBits(bytes.length, 8);
    bytes.forEach((byte) => pushBits(byte, 8));
    const maxBits = LOCAL_QR_DATA_CODEWORDS * 8;
    if (bits.length > maxBits) return null;
    for (let i = 0, count = Math.min(4, maxBits - bits.length); i < count; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
    }
    for (let pad = 0xec; codewords.length < LOCAL_QR_DATA_CODEWORDS; pad = pad === 0xec ? 0x11 : 0xec) {
      codewords.push(pad);
    }
    return codewords;
  }

  function qrFormatBits(mask) {
    const errorLevelLow = 1;
    const data = (errorLevelLow << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  function createLocalQrMatrix(value) {
    const dataCodewords = buildQrDataCodewords(value);
    if (!dataCodewords) return null;
    const size = LOCAL_QR_SIZE;
    const modules = Array.from({ length: size }, () => Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));
    const setFunction = (row, col, dark) => {
      if (row < 0 || row >= size || col < 0 || col >= size) return;
      modules[row][col] = !!dark;
      reserved[row][col] = true;
    };
    const drawFinder = (row, col) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = row + r;
          const cc = col + c;
          const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          const edge = r === 0 || r === 6 || c === 0 || c === 6;
          const center = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setFunction(rr, cc, inFinder && (edge || center));
        }
      }
    };
    const drawAlignment = (centerRow, centerCol) => {
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dist = Math.max(Math.abs(r), Math.abs(c));
          setFunction(centerRow + r, centerCol + c, dist === 2 || dist === 0);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) {
      setFunction(6, i, i % 2 === 0);
      setFunction(i, 6, i % 2 === 0);
    }
    drawAlignment(30, 30);

    const format = qrFormatBits(0);
    const getBit = (num, index) => ((num >>> index) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFunction(i, 8, getBit(format, i));
    setFunction(7, 8, getBit(format, 6));
    setFunction(8, 8, getBit(format, 7));
    setFunction(8, 7, getBit(format, 8));
    for (let i = 9; i < 15; i++) setFunction(8, 14 - i, getBit(format, i));
    for (let i = 0; i < 8; i++) setFunction(8, size - 1 - i, getBit(format, i));
    for (let i = 8; i < 15; i++) setFunction(size - 15 + i, 8, getBit(format, i));
    setFunction(size - 8, 8, true);

    const ecc = qrReedSolomonRemainder(dataCodewords, LOCAL_QR_ECC_CODEWORDS);
    const allCodewords = dataCodewords.concat(ecc);
    if (allCodewords.length !== LOCAL_QR_TOTAL_CODEWORDS) return null;
    const dataBits = [];
    allCodewords.forEach((byte) => {
      for (let i = 7; i >= 0; i--) dataBits.push((byte >>> i) & 1);
    });

    let bitIndex = 0;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (let j = 0; j < 2; j++) {
          const cc = col - j;
          if (reserved[row][cc]) continue;
          const bit = bitIndex < dataBits.length ? dataBits[bitIndex++] : 0;
          const masked = bit ^ (((row + cc) % 2 === 0) ? 1 : 0);
          modules[row][cc] = !!masked;
        }
      }
      upward = !upward;
    }
    return modules;
  }

  function drawKahootQrLocally(canvas, value) {
    try {
      const matrix = createLocalQrMatrix(value);
      if (!canvas || !matrix) return false;
      const width = 260;
      const ctx = canvas.getContext("2d");
      const size = matrix.length;
      const scale = Math.max(1, Math.floor(width / (size + 8)));
      const offset = Math.floor((width - size * scale) / 2);
      canvas.width = width;
      canvas.height = width;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, width);
      ctx.fillStyle = "#1a1330";
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (matrix[row][col]) ctx.fillRect(offset + col * scale, offset + row * scale, scale, scale);
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function renderKahootQRCode(canvas, joinUrl) {
    const fallbackBox = document.getElementById("kahootQrFallback");

    function showLinkFallback(message) {
      if (!fallbackBox) return;
      fallbackBox.hidden = false;
      fallbackBox.innerHTML = `
        <strong>${esc(message)}</strong>
        <span>Katılım linki:</span>
        <a href="${esc(joinUrl)}" target="_blank" rel="noopener">${esc(joinUrl)}</a>
      `;
    }

    function showImageFallback(message) {
      if (!fallbackBox) return;
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&format=svg&data=${encodeURIComponent(joinUrl)}`;
      fallbackBox.hidden = false;
      fallbackBox.innerHTML = `
        <img class="kahoot-qr-fallback-img" src="${esc(qrImageUrl)}" width="260" height="260" alt="Kahoot oda QR kodu">
        <span>${esc(message)}</span>
        <a href="${esc(joinUrl)}" target="_blank" rel="noopener">${esc(joinUrl)}</a>
      `;
      const image = fallbackBox.querySelector("img");
      image?.addEventListener("error", () => showLinkFallback("QR kod görseli yüklenemedi."));
    }

    function showLocalCanvas() {
      if (!canvas || !drawKahootQrLocally(canvas, joinUrl)) return false;
      canvas.style.display = "";
      if (fallbackBox) fallbackBox.hidden = true;
      return true;
    }

    try {
      if (!canvas) return;
      const ok = await ensureQrLibrary();
      if (!ok || !window.QRCode || typeof window.QRCode.toCanvas !== "function") {
        if (showLocalCanvas()) return;
        canvas.style.display = "none";
        showImageFallback("QR kod otomatik oluşturuldu.");
        return;
      }
      canvas.style.display = "";
      await window.QRCode.toCanvas(canvas, joinUrl, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#1a1330", light: "#ffffff" }
      });
      if (fallbackBox) fallbackBox.hidden = true;
    } catch (err) {
      console.error("[Kahoot] QR oluşturulamadı:", err);
      if (showLocalCanvas()) return;
      if (canvas) canvas.style.display = "none";
      showImageFallback("QR kod otomatik oluşturuldu.");
    }
  }

  /* ---------- Question pool (mevcut TOPICS'ten) ---------- */
  const FALLBACK_QS = [
    { question: "Which word means 'kanıt'?", options: ["Evidence", "Survey", "Nickname", "Scale"], answer: 0, explanation: "Evidence = kanıt" },
    { question: "Choose the correct sentence.", options: ["She is a beautiful girl.", "She is beautiful girl.", "She a beautiful girl.", "She beautiful is girl."], answer: 0, explanation: "Tekil sayılabilir isimden önce article gerekir." },
    { question: "I am tired ___ waiting.", options: ["of", "for", "at", "to"], answer: 0, explanation: "Doğru kullanım: tired of." },
    { question: "Object pronoun olan hangisidir?", options: ["she", "her", "herselfs", "they"], answer: 1, explanation: "Her, object pronoun olarak kullanılır." },
    { question: "Superlative of 'bad' is...", options: ["baddest", "most bad", "worst", "worse"], answer: 2, explanation: "bad → worse → worst." },
    { question: "Interested ___ science.", options: ["on", "in", "for", "at"], answer: 1, explanation: "Interested in doğru kullanımdır." },
    { question: "The flight ___ at 6.50 tomorrow morning.", options: ["leaves", "is leaving", "leave", "leaving"], answer: 0, explanation: "Timetable için Present Simple." },
    { question: "Present Continuous for future arrangement:", options: ["I meet him yesterday.", "I am meeting him tonight.", "I met him tomorrow.", "I meeting him now."], answer: 1, explanation: "Önceden ayarlanmış planlar için Present Continuous." },
    { question: "Comparative of 'good'?", options: ["gooder", "better", "best", "more good"], answer: 1, explanation: "good → better → best." },
    { question: "She ___ to school every day.", options: ["go", "goes", "going", "gone"], answer: 1, explanation: "Third person singular için -s eklenir." },
    { question: "Which is a possessive adjective?", options: ["me", "my", "mine", "I"], answer: 1, explanation: "my, possessive adjective'dir." },
    { question: "How long ___ you been here?", options: ["have", "has", "do", "are"], answer: 0, explanation: "Present Perfect ile 'have'." }
  ];

  function buildKahootQuestions(categoryId, count) {
    const target = Math.max(3, Math.min(30, count || DEFAULT_QUESTION_COUNT));
    const pool = [];
    try {
      const topicsRef = window.TOPICS || topics || null;
      if (Array.isArray(topicsRef)) {
        topicsRef.forEach((topic) => {
          if (!topic || !Array.isArray(topic.quiz)) return;
          topic.quiz.forEach((q, i) => {
            if (!q || !Array.isArray(q.options) || q.options.length < 2) return;
            const a = Number.isInteger(q.answer) ? q.answer : 0;
            pool.push({
              id: `${topic.id || "t"}-${i}`,
              question: String(q.question || "").trim() || `${topic.title || "Konu"} sorusu`,
              options: q.options.slice(0, 4).map(String),
              answer: Math.max(0, Math.min(a, q.options.length - 1)),
              explanation: q.explanation || ""
            });
          });
        });
      }
    } catch (_) {}
    const base = pool.length ? pool : FALLBACK_QS;
    const shuffled = base.map((q) => ({ q, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((e) => e.q);
    return shuffled.slice(0, target).map((q, i) => ({ ...q, no: i + 1 }));
  }

  function getCategoryTitle(categoryId) {
    const map = {
      word: "Kelime Quizleri",
      grammar: "Dil Bilgisi Quizleri",
      unit: "Ünite Quizleri",
      mixed: "Karma Quizler",
      favorite: "Favorilerim"
    };
    return map[categoryId] || "Karma Quizler";
  }

  /* ---------- DOM helpers ---------- */
  function root() {
    let el = document.getElementById("kahootRoot");
    if (!el) {
      const section = document.getElementById("kahoot");
      if (section) {
        el = document.createElement("div");
        el.id = "kahootRoot";
        el.className = "kahoot-root";
        section.appendChild(el);
      }
    }
    return el;
  }

  function gotoKahoot() {
    if (typeof window.navigate === "function") {
      try { window.navigate("kahoot"); return; } catch (_) {}
    }
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.getElementById("kahoot")?.classList.add("active");
  }

  /* ---------- Firestore subscriptions ---------- */
  function unsubscribeKahootListeners() {
    if (Array.isArray(state.unsubs)) {
      state.unsubs.forEach((unsub) => { try { unsub(); } catch (_) {} });
    }
    state.unsubs = [];
  }

  function subscribeHostRoom(roomId) {
    unsubscribeKahootListeners();
    const roomRef = doc(db, ROOM_COLLECTION, roomId);
    const playersRef = collection(db, ROOM_COLLECTION, roomId, "players");
    const answersRef = collection(db, ROOM_COLLECTION, roomId, "answers");

    state.unsubs.push(onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        state.roomData = null;
        renderKahootError("Oda bulunamadı veya silinmiş.");
        return;
      }
      state.roomData = snap.data();
      renderForCurrentMode();
    }, (err) => {
      console.error("[Kahoot] Room listen error:", err);
      renderKahootError("Oda dinlenemiyor: " + (err?.message || err));
    }));

    state.unsubs.push(onSnapshot(playersRef, (snap) => {
      state.playersData = snap.docs.map((d) => d.data()).sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));
      renderForCurrentMode();
    }, (err) => console.error("[Kahoot] Players listen error:", err)));

    state.unsubs.push(onSnapshot(answersRef, (snap) => {
      state.answersData = snap.docs.map((d) => d.data());
      renderForCurrentMode();
    }, (err) => console.error("[Kahoot] Answers listen error:", err)));
  }

  function subscribePlayerRoom(roomId, playerId) {
    unsubscribeKahootListeners();
    const roomRef = doc(db, ROOM_COLLECTION, roomId);
    const playerRef = doc(db, ROOM_COLLECTION, roomId, "players", playerId);

    state.unsubs.push(onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        state.roomData = null;
        renderKahootError("Oda kapatıldı veya silindi.");
        return;
      }
      state.roomData = snap.data();
      renderForCurrentMode();
    }, (err) => {
      console.error("[Kahoot] Player room listen error:", err);
      renderKahootError("Oda dinlenemiyor: " + (err?.message || err));
    }));

    state.unsubs.push(onSnapshot(playerRef, (snap) => {
      if (snap.exists()) state.playerData = snap.data();
      renderForCurrentMode();
    }, (err) => console.error("[Kahoot] Player listen error:", err)));
  }

  /* ---------- Host: Create / Start / Advance / Finish ---------- */
  async function createKahootRoom(opts) {
    const options = opts || {};
    const categoryId = options.categoryId || "mixed";
    const questionDuration = Math.max(8, Math.min(60, options.questionDuration || DEFAULT_QUESTION_TIME));
    const questionCount = Math.max(3, Math.min(30, options.questionCount || DEFAULT_QUESTION_COUNT));
    const hostName = (options.hostName || "Host").trim().slice(0, 24) || "Host";
    const title = `Ravza Kahoot • ${getCategoryTitle(categoryId)}`;
    const questions = buildKahootQuestions(categoryId, questionCount);

    let roomId = generateRoomId();
    let safety = 0;
    while (safety < 5) {
      const probe = await getDoc(doc(db, ROOM_COLLECTION, roomId));
      if (!probe.exists()) break;
      roomId = generateRoomId();
      safety += 1;
    }

    const roomData = {
      roomId,
      pin: generateRoomPin(),
      title,
      categoryId,
      categoryTitle: getCategoryTitle(categoryId),
      hostId: state.hostId,
      hostName,
      status: "waiting",
      currentQuestionIndex: 0,
      questionDuration,
      questions,
      countdownStartedAt: null,
      questionStartedAt: null,
      finishedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, ROOM_COLLECTION, roomId), roomData);

    state.mode = "host";
    state.roomId = roomId;
    state.playerId = null;
    state.roomData = roomData;
    state.playersData = [];
    state.answersData = [];
    state.lastRenderSig = null;
    subscribeHostRoom(roomId);
    return roomId;
  }

  async function hostStartGame() {
    if (!state.roomId) return;
    if (!state.playersData?.length) {
      alert("Önce en az 1 oyuncunun katılması lazım.");
      return;
    }
    const roomRef = doc(db, ROOM_COLLECTION, state.roomId);
    const now = Date.now();

    // Optimistic UI: ekranı HEMEN countdown'a çevir, server confirm beklenmesin
    if (state.roomData) {
      state.roomData = { ...state.roomData, status: "countdown", currentQuestionIndex: 0, countdownStartedAt: now };
      state.lastRenderSig = null;
      renderForCurrentMode();
    }

    try {
      await updateDoc(roomRef, {
        status: "countdown",
        currentQuestionIndex: 0,
        countdownStartedAt: now,
        updatedAt: Date.now()
      });
      setTimeout(async () => {
        const startedAt = Date.now();
        // Optimistic UI: host kendi ekranında hemen soru ekranına geçsin
        if (state.roomData) {
          state.roomData = { ...state.roomData, status: "playing", currentQuestionIndex: 0, questionStartedAt: startedAt };
          state.lastRenderSig = null;
          renderForCurrentMode();
        }
        try {
          await updateDoc(roomRef, {
            status: "playing",
            currentQuestionIndex: 0,
            questionStartedAt: startedAt,
            updatedAt: Date.now()
          });
        } catch (e) {
          console.error("[Kahoot] start game (phase 2) error:", e);
        }
      }, COUNTDOWN_MS);
    } catch (e) {
      console.error("[Kahoot] start game error:", e);
      alert("Oyun başlatılamadı: " + (e?.message || e));
    }
  }

  async function hostAdvanceQuestion() {
    if (!state.roomId || !state.roomData) return;
    const nextIndex = Number(state.roomData.currentQuestionIndex || 0) + 1;
    const total = (state.roomData.questions || []).length;
    const roomRef = doc(db, ROOM_COLLECTION, state.roomId);
    const now = Date.now();
    try {
      if (nextIndex >= total) {
        // Optimistic: hemen final ekranına geç
        state.roomData = { ...state.roomData, status: "finished", finishedAt: now };
        state.lastRenderSig = null;
        renderForCurrentMode();

        await updateDoc(roomRef, {
          status: "finished",
          finishedAt: now,
          updatedAt: Date.now()
        });
        return;
      }
      // Optimistic: hemen yeni soruya geç
      state.roomData = { ...state.roomData, currentQuestionIndex: nextIndex, status: "playing", questionStartedAt: now };
      state.lastRenderSig = null;
      state.answeredForIndex = -1;
      renderForCurrentMode();

      await updateDoc(roomRef, {
        currentQuestionIndex: nextIndex,
        status: "playing",
        questionStartedAt: now,
        updatedAt: Date.now()
      });
    } catch (e) {
      console.error("[Kahoot] advance error:", e);
    }
  }

  async function cancelKahootRoom() {
    if (!state.roomId) return;
    if (!confirm("Odayı kapatmak istediğine emin misin?")) return;
    try {
      await updateDoc(doc(db, ROOM_COLLECTION, state.roomId), {
        status: "finished",
        finishedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("[Kahoot] cancel error:", e);
    }
  }

  async function hostRefreshQR() {
    if (!state.roomId) return;
    try {
      await updateDoc(doc(db, ROOM_COLLECTION, state.roomId), {
        pin: generateRoomPin(),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("[Kahoot] refresh pin error:", e);
    }
  }

  async function hostPlayAgain() {
    const prev = state.roomData;
    if (!prev) return;
    leaveKahootHost(/* silent */ true);
    const roomId = await createKahootRoom({
      hostName: prev.hostName,
      categoryId: prev.categoryId,
      questionCount: (prev.questions || []).length,
      questionDuration: prev.questionDuration
    });
    renderForCurrentMode();
  }

  function leaveKahootHost(silent) {
    unsubscribeKahootListeners();
    stopTimerTick();
    state.mode = null;
    state.roomId = null;
    state.playerId = null;
    state.roomData = null;
    state.playersData = [];
    state.answersData = [];
    state.lastRenderSig = null;
    if (!silent) renderKahootHomeSafe();
  }

  /* ---------- Player: Join / Submit / Leave ---------- */
  async function joinKahootRoom(roomId, playerName) {
    const name = String(playerName || "").trim().slice(0, 20);
    if (!name) return { ok: false, error: "Lütfen bir isim yaz." };
    try {
      const roomRef = doc(db, ROOM_COLLECTION, roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return { ok: false, error: "Oda bulunamadı veya kapanmış." };
      const roomData = snap.data();
      if (roomData.status === "finished") return { ok: false, error: "Bu oda kapanmış. Host'tan yeni oda iste." };

      const playerId = getOrCreatePlayerId();

      // Optimistic: lokal state'i HEMEN güncelle, ekranı bekleme moduna al, sonra Firestore'a yaz
      savePlayerProfile({ id: playerId, name, roomId });
      state.mode = "player";
      state.roomId = roomId;
      state.playerId = playerId;
      state.answeredForIndex = -1;
      state.roomData = roomData;
      state.playerData = { playerId, name, score: 0, correctCount: 0, wrongCount: 0 };
      state.playersData = [state.playerData, ...(state.playersData || []).filter((p) => p.playerId !== playerId)];
      state.lastRenderSig = null;
      subscribePlayerRoom(roomId, playerId);
      renderForCurrentMode();

      // Arka planda Firestore write (await ETME — fire-and-forget gibi davran)
      setDoc(doc(db, ROOM_COLLECTION, roomId, "players", playerId), {
        playerId,
        name,
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        joinedAt: Date.now(),
        lastSeenAt: Date.now()
      }, { merge: true }).catch((e) => {
        console.error("[Kahoot] player write error:", e);
      });

      return { ok: true, playerId };
    } catch (e) {
      console.error("[Kahoot] join error:", e);
      return { ok: false, error: "Katılım hatası: " + (e?.message || e) };
    }
  }

  function calculateKahootScore(isCorrect, msUsed, questionDurationSec) {
    if (!isCorrect) return 0;
    const totalMs = Math.max(1000, (questionDurationSec || DEFAULT_QUESTION_TIME) * 1000);
    const elapsed = Math.max(0, Math.min(totalMs, msUsed || totalMs));
    const ratio = 1 - elapsed / totalMs;
    return Math.round(500 + (MAX_QUESTION_POINTS - 500) * ratio);
  }

  async function submitPlayerAnswer(optionIndex) {
    const roomId = state.roomId;
    const playerId = state.playerId;
    if (!roomId || !playerId) return;
    const room = state.roomData;
    if (!room || room.status !== "playing") return;
    const idx = Number(room.currentQuestionIndex || 0);
    if (state.answeredForIndex === idx) return;
    state.answeredForIndex = idx;

    const q = (room.questions || [])[idx];
    if (!q) return;
    const isCorrect = optionIndex === q.answer;
    const msUsed = Date.now() - (room.questionStartedAt || Date.now());
    const score = calculateKahootScore(isCorrect, msUsed, room.questionDuration);
    const answerId = `${playerId}_${idx}`;

    // Optimistic: feedback ekranını HEMEN göster, server confirm beklenmesin
    const optimisticAnswer = { playerId, questionIndex: idx, selectedIndex: optionIndex, isCorrect, score };
    state.answersData = [...(state.answersData || []).filter((a) => !(a.playerId === playerId && a.questionIndex === idx)), optimisticAnswer];
    if (state.playerData) {
      state.playerData = {
        ...state.playerData,
        score: (state.playerData.score || 0) + score,
        correctCount: (state.playerData.correctCount || 0) + (isCorrect ? 1 : 0),
        wrongCount: (state.playerData.wrongCount || 0) + (isCorrect ? 0 : 1)
      };
    }
    state.lastRenderSig = null;
    renderForCurrentMode();

    // Arka planda Firestore write
    try {
      setDoc(doc(db, ROOM_COLLECTION, roomId, "answers", answerId), {
        playerId,
        questionIndex: idx,
        selectedIndex: optionIndex,
        isCorrect,
        score,
        answeredAt: Date.now()
      }).catch((e) => console.error("[Kahoot] answer write error:", e));

      updateDoc(doc(db, ROOM_COLLECTION, roomId, "players", playerId), {
        score: increment(score),
        correctCount: increment(isCorrect ? 1 : 0),
        wrongCount: increment(isCorrect ? 0 : 1),
        lastSeenAt: Date.now()
      }).catch((e) => console.error("[Kahoot] player score write error:", e));
    } catch (e) {
      console.error("[Kahoot] submit answer error:", e);
    }
  }

  /* ---------- Render gate / Signature ---------- */
  function renderSignature() {
    const r = state.roomData;
    if (!r) return "none";
    const players = (state.playersData || [])
      .map((p) => `${p.playerId}:${p.name}:${p.score || 0}`).join("|");
    const answers = (state.answersData || [])
      .filter((a) => a.questionIndex === r.currentQuestionIndex)
      .map((a) => `${a.playerId}:${a.selectedIndex}`).join("|");
    let extra = "";
    if (r.status === "playing") {
      const elapsed = Math.floor((Date.now() - (r.questionStartedAt || Date.now())) / 1000);
      extra = `|t=${elapsed}`;
    } else if (r.status === "countdown") {
      const cd = Math.ceil(Math.max(0, COUNTDOWN_MS - (Date.now() - (r.countdownStartedAt || Date.now()))) / 1000);
      extra = `|c=${cd}`;
    }
    return `${state.mode}|${r.roomId}|${r.status}|${r.currentQuestionIndex}|${players}|${answers}${extra}`;
  }

  function renderForCurrentMode() {
    const sig = renderSignature();
    if (sig === state.lastRenderSig) return;
    state.lastRenderSig = sig;
    if (state.mode === "host") renderKahootHostRoom();
    else if (state.mode === "player") renderKahootPlayerForCurrentRoom();
  }

  function startTimerTick() {
    stopTimerTick();
    // 500ms → 120ms: timer/countdown anında güncellenir, signature check sayesinde gereksiz redraw yok
    state.tickId = setInterval(() => {
      if (!state.mode) return;
      renderForCurrentMode();
    }, 120);
  }
  function stopTimerTick() {
    if (state.tickId) { clearInterval(state.tickId); state.tickId = null; }
  }

  /* ---------- HOST RENDERS ---------- */
  function renderKahootHostRoom() {
    if (!state.roomData) return;
    const status = state.roomData.status;
    if (status === "waiting") return renderHostWaiting();
    if (status === "countdown") return renderHostCountdown();
    if (status === "playing") return renderHostPlaying();
    if (status === "finished") return renderHostFinal();
  }

  function renderHostWaiting() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const joinUrl = generateKahootJoinUrl(room.roomId, "player");
    const playerCount = state.playersData.length;
    const localWarn = (isLocalEnvironment() && !hasPublicUrlOverride())
      ? `<div class="kahoot-localhost-warning">
          ⚠️ <strong>Bu QR sadece public domain üzerinde başka cihazlardan çalışır.</strong>
          Site Vercel / Netlify / Firebase Hosting'e yüklendikten sonra QR gerçek telefonlardan açılır.
          Public URL'ini <code>index.html</code> içindeki <code>&lt;meta name="kahoot-public-url"&gt;</code> alanına yaz.
        </div>` : "";

    target.innerHTML = `
      <div class="kahoot-host-shell">
        <div class="kahoot-host-head">
          <button type="button" class="kahoot-secondary-btn" onclick="leaveKahootHost()">← Ana Sayfa</button>
          <div class="kahoot-host-title">
            <strong>Canlı Oda • ${esc(room.categoryTitle)}</strong>
            <small>${(room.questions || []).length} soru • Her soru ${room.questionDuration}s</small>
          </div>
          <button type="button" class="kahoot-secondary-btn" onclick="cancelKahootRoom()">Odayı Kapat</button>
        </div>

        ${localWarn}

        <div class="kahoot-host-grid">
          <div class="kahoot-host-info-card">
            <span class="kahoot-room-tag">QR KOD</span>
            <h2>Kahoot Odasına Katıl</h2>
            <p>Telefonun kamerasıyla QR kodu okut ve oyuna katıl.</p>

            <div class="kahoot-pin-block">
              <small>Oda PIN'i</small>
              <div class="kahoot-pin-value">${esc(room.pin)}</div>
              <div class="kahoot-room-code">Oda Kodu: <strong>${esc(room.roomId)}</strong></div>
            </div>

            <div class="kahoot-join-link-row">
              <input type="text" readonly value="${esc(joinUrl)}" id="kahootJoinUrlInput" aria-label="Katılım linki">
              <button type="button" class="kahoot-secondary-btn" onclick="copyKahootJoinLink()">📋 Kopyala</button>
            </div>

            <div class="kahoot-host-actions">
              <button type="button" class="kahoot-primary-btn kahoot-host-start" onclick="hostStartGame()" ${playerCount === 0 ? "disabled" : ""}>
                ▶ Oyunu Başlat (${playerCount})
              </button>
              <button type="button" class="kahoot-secondary-btn" onclick="hostRefreshQR()">🔄 PIN'i Yenile</button>
            </div>
            <small class="kahoot-host-hint">${playerCount === 0 ? "Henüz oyuncu yok — QR'ı okutturmayı bekliyoruz." : `${playerCount} oyuncu bağlandı, başlatabilirsin.`}</small>
          </div>

          <div class="kahoot-host-qr-card">
            <div class="kahoot-qr-stage">
              <div class="kahoot-qr-top-badge">
                <span>OYUNA KATIL!</span>
                <span class="kahoot-qr-bolt" aria-hidden="true">⚡</span>
              </div>

              <span class="kahoot-qr-sparkle s1" aria-hidden="true">✦</span>
              <span class="kahoot-qr-sparkle s2" aria-hidden="true">✧</span>
              <span class="kahoot-qr-sparkle s3" aria-hidden="true">✦</span>
              <span class="kahoot-qr-sparkle s4" aria-hidden="true">✧</span>
              <span class="kahoot-qr-confetti c1" aria-hidden="true"></span>
              <span class="kahoot-qr-confetti c2" aria-hidden="true"></span>
              <span class="kahoot-qr-confetti c3" aria-hidden="true"></span>
              <span class="kahoot-qr-confetti c4" aria-hidden="true"></span>

              <div class="kahoot-qr-panel">
                <canvas id="kahootQrCanvas" width="260" height="260" aria-label="Kahoot oda QR kodu"></canvas>
                <div id="kahootQrFallback" class="kahoot-qr-fallback" hidden></div>
                <div class="kahoot-qr-logo-badge" aria-hidden="true">
                  <span class="kahoot-qr-logo-text">K!</span>
                  <span class="kahoot-qr-logo-confetti lc1"></span>
                  <span class="kahoot-qr-logo-confetti lc2"></span>
                  <span class="kahoot-qr-logo-confetti lc3"></span>
                </div>
              </div>

              <p class="kahoot-qr-helper">📱 Telefonunla okut ve oyuna katıl</p>
              <p class="kahoot-qr-link">${esc(joinUrl)}</p>
            </div>
          </div>
        </div>

        <div class="kahoot-host-players">
          <div class="kahoot-host-players-head">
            <h3>Bekleyen Oyuncular</h3>
            <span class="kahoot-host-players-count">${playerCount}</span>
          </div>
          ${playerCount === 0
            ? `<div class="kahoot-empty-mini">Oyuncular katılınca burada görünecek.</div>`
            : `<div class="kahoot-players-grid">
                ${state.playersData.map((p) => `
                  <div class="kahoot-player-chip">
                    <span class="kahoot-player-chip-avatar">👤</span>
                    <strong>${esc(p.name)}</strong>
                    <small>katıldı</small>
                  </div>
                `).join("")}
              </div>`}
        </div>
      </div>
    `;

    const canvas = document.getElementById("kahootQrCanvas");
    renderKahootQRCode(canvas, joinUrl);
  }

  function renderHostCountdown() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const cd = Math.ceil(Math.max(0, COUNTDOWN_MS - (Date.now() - (room.countdownStartedAt || Date.now()))) / 1000);
    target.innerHTML = `
      <div class="kahoot-host-shell">
        <div class="kahoot-host-countdown">
          <p>Oyun başlıyor...</p>
          <div class="kahoot-countdown-num">${cd <= 0 ? "GO!" : cd}</div>
          <small>${state.playersData.length} oyuncu hazır</small>
        </div>
      </div>
    `;
  }

  function renderHostPlaying() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const idx = Number(room.currentQuestionIndex || 0);
    const q = (room.questions || [])[idx];
    if (!q) return;
    const totalPlayers = state.playersData.length;
    const answersForQ = state.answersData.filter((a) => a.questionIndex === idx);
    const answeredCount = answersForQ.length;
    const elapsed = (Date.now() - (room.questionStartedAt || Date.now())) / 1000;
    const remaining = Math.max(0, Math.round((room.questionDuration || DEFAULT_QUESTION_TIME) - elapsed));
    const sorted = [...state.playersData].sort((a, b) => (b.score || 0) - (a.score || 0));
    const colors = ["red", "blue", "yellow", "green"];
    const shapes = ["▲", "◆", "●", "■"];

    target.innerHTML = `
      <div class="kahoot-host-shell">
        <div class="kahoot-host-play-head">
          <div>
            <strong>Soru ${idx + 1} / ${(room.questions || []).length}</strong>
            <small>${esc(room.categoryTitle)}</small>
          </div>
          <div class="kahoot-timer-pill big">⏱ ${remaining}s</div>
          <div class="kahoot-host-answered">
            ${answeredCount}/${totalPlayers} <small>cevapladı</small>
          </div>
        </div>

        <div class="kahoot-question-card kahoot-host-q">
          <h2>${esc(q.question)}</h2>
        </div>

        <div class="kahoot-answer-grid kahoot-host-answers">
          ${q.options.map((opt, i) => {
            const count = answersForQ.filter((a) => a.selectedIndex === i).length;
            return `
              <div class="kahoot-answer ${colors[i] || "blue"} kahoot-host-answer-pill">
                <span>${shapes[i] || "◆"}</span>
                <strong>${esc(opt)}</strong>
                <em class="kahoot-host-answer-count">${count}</em>
              </div>
            `;
          }).join("")}
        </div>

        <div class="kahoot-host-controls">
          <button type="button" class="kahoot-primary-btn" onclick="hostAdvanceQuestion()">
            ${idx + 1 >= (room.questions || []).length ? "🏁 Bitir" : "Sonraki Soru →"}
          </button>
          <button type="button" class="kahoot-secondary-btn" onclick="cancelKahootRoom()">Oyunu Bitir</button>
        </div>

        <div class="kahoot-host-mini-lb">
          <h3>Anlık Sıralama</h3>
          ${sorted.slice(0, 5).map((p, i) => `
            <div class="kahoot-lb-row ${i === 0 ? "is-first" : ""}">
              <b>${i + 1}</b>
              <span>${i === 0 ? "👑 " : ""}${esc(p.name)}</span>
              <strong>${p.score || 0}</strong>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderHostFinal() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const sorted = [...state.playersData].sort((a, b) => (b.score || 0) - (a.score || 0));
    target.innerHTML = `
      <div class="kahoot-host-shell">
        <div class="kahoot-host-final">
          <span class="kahoot-result-cup">🏆</span>
          <h2>Oyun Tamamlandı</h2>
          <p>${esc(room.categoryTitle)} • ${(room.questions || []).length} soru</p>
          ${sorted.length >= 1 ? `<div class="kahoot-podium">
            ${sorted[1] ? `<div class="kahoot-podium-spot second"><div class="kahoot-podium-medal">🥈</div><strong>${esc(sorted[1].name)}</strong><span>${sorted[1].score || 0}</span></div>` : ""}
            <div class="kahoot-podium-spot first"><div class="kahoot-podium-medal">🥇</div><strong>${esc(sorted[0].name)}</strong><span>${sorted[0].score || 0}</span></div>
            ${sorted[2] ? `<div class="kahoot-podium-spot third"><div class="kahoot-podium-medal">🥉</div><strong>${esc(sorted[2].name)}</strong><span>${sorted[2].score || 0}</span></div>` : ""}
          </div>` : `<div class="kahoot-empty-mini">Skor kaydı bulunamadı.</div>`}
          ${renderLeaderboardHtml(sorted, null)}
          <div class="kahoot-host-final-actions">
            <button type="button" class="kahoot-primary-btn" onclick="hostPlayAgain()">🔁 Yeni Oda Aç</button>
            <button type="button" class="kahoot-secondary-btn" onclick="leaveKahootHost()">Ana Sayfa</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLeaderboardHtml(sortedPlayers, mePlayerId) {
    if (!sortedPlayers.length) return "";
    return `
      <div class="kahoot-leaderboard-final">
        <h3>Leaderboard</h3>
        ${sortedPlayers.slice(0, 10).map((p, i) => `
          <div class="kahoot-lb-row ${i === 0 ? "is-first" : ""} ${p.playerId === mePlayerId ? "is-me" : ""}">
            <b>${i + 1}</b>
            <span>${i === 0 ? "👑 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : ""}${esc(p.name)}</span>
            <strong>${p.score || 0}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  /* ---------- PLAYER RENDERS ---------- */
  function renderKahootPlayerForCurrentRoom() {
    if (!state.roomData) return;
    const status = state.roomData.status;
    if (status === "waiting") return renderPlayerWaiting();
    if (status === "countdown") return renderPlayerCountdown();
    if (status === "playing") return renderPlayerQuestion();
    if (status === "finished") return renderPlayerFinal();
  }

  function renderPlayerNameScreen(roomId, preRoomData) {
    const target = root(); if (!target) return;
    const profile = loadPlayerProfile();
    const prefillName = profile && profile.roomId === roomId && profile.name ? profile.name : "";
    const room = preRoomData || state.roomData;
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card">
          <span class="kahoot-k-badge">K!</span>
          <h2>Odaya Katıl</h2>
          ${room ? `<p>Oda: <strong>${esc(room.roomId)}</strong> • PIN: <strong>${esc(room.pin)}</strong></p>` : `<p>Oda: <strong>${esc(roomId)}</strong></p>`}
          <p class="kahoot-player-sub">Adını yaz ve oyuna başlamayı bekle.</p>
          <div class="kahoot-player-input-row">
            <input type="text" id="kahootPlayerName" maxlength="20" placeholder="Adın..." value="${esc(prefillName)}" autocomplete="off">
            <button type="button" class="kahoot-primary-btn" onclick="confirmKahootJoin()">Oyuna Katıl</button>
          </div>
          <div id="kahootJoinError" class="kahoot-player-error" role="alert" hidden></div>
        </div>
      </div>
    `;
    const input = document.getElementById("kahootPlayerName");
    setTimeout(() => input?.focus(), 60);
    input?.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmKahootJoin(); });
  }

  async function openKahootJoinMode(roomId) {
    state.mode = "player";
    state.roomId = roomId;
    state.playerId = null;
    state.lastRenderSig = null;
    gotoKahoot();
    // Önce oda var mı kontrol et
    try {
      const snap = await getDoc(doc(db, ROOM_COLLECTION, roomId));
      if (!snap.exists()) {
        renderKahootError("Oda bulunamadı veya oyun bitmiş olabilir.");
        return;
      }
      renderPlayerNameScreen(roomId, snap.data());
    } catch (e) {
      console.error("[Kahoot] open join mode error:", e);
      renderKahootError("Odaya ulaşılamadı: " + (e?.message || e));
    }
  }

  async function confirmKahootJoin() {
    if (state.joining) return;
    state.joining = true;
    setTimeout(() => { state.joining = false; }, 600);
    const name = document.getElementById("kahootPlayerName")?.value || "";
    const result = await joinKahootRoom(state.roomId, name);
    if (!result.ok) {
      const err = document.getElementById("kahootJoinError");
      if (err) { err.hidden = false; err.textContent = result.error; }
      return;
    }
    renderForCurrentMode();
  }

  function renderPlayerWaiting() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const me = state.playerData || (state.playersData.find((p) => p.playerId === state.playerId));
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card kahoot-player-wait">
          <span class="kahoot-k-badge">K!</span>
          <div class="kahoot-player-avatar">👤</div>
          <h2>${esc(me?.name || "Oyuncu")}</h2>
          <p>Odaya bağlandın! Host oyunu başlattığında ilk soru gelecek.</p>
          <div class="kahoot-player-loader"><span></span><span></span><span></span></div>
          <small>Oda: <strong>${esc(room.roomId)}</strong> • PIN: <strong>${esc(room.pin)}</strong></small>
        </div>
      </div>
    `;
  }

  function renderPlayerCountdown() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const cd = Math.ceil(Math.max(0, COUNTDOWN_MS - (Date.now() - (room.countdownStartedAt || Date.now()))) / 1000);
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card kahoot-player-count">
          <span class="kahoot-k-badge">K!</span>
          <p>Hazır ol...</p>
          <div class="kahoot-countdown-num">${cd <= 0 ? "GO!" : cd}</div>
        </div>
      </div>
    `;
  }

  function renderPlayerQuestion() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const idx = Number(room.currentQuestionIndex || 0);
    const q = (room.questions || [])[idx];
    if (!q) return;
    const me = state.playerData || state.playersData.find((p) => p.playerId === state.playerId);
    const myAnswer = state.answersData.find((a) => a.playerId === state.playerId && a.questionIndex === idx);
    const colors = ["red", "blue", "yellow", "green"];
    const shapes = ["▲", "◆", "●", "■"];
    const elapsed = (Date.now() - (room.questionStartedAt || Date.now())) / 1000;
    const remaining = Math.max(0, Math.round((room.questionDuration || DEFAULT_QUESTION_TIME) - elapsed));

    if (myAnswer) {
      target.innerHTML = `
        <div class="kahoot-player-shell">
          <div class="kahoot-player-card kahoot-player-locked ${myAnswer.isCorrect ? "is-correct" : "is-wrong"}">
            <span class="kahoot-feedback-icon">${myAnswer.isCorrect ? "✅" : "❌"}</span>
            <h2>${myAnswer.isCorrect ? "Süpersin!" : "Bir dahaki soruda yakalarsın"}</h2>
            <p><strong>+${myAnswer.score}</strong> puan kazandın</p>
            <small>Diğer oyuncular cevaplıyor... Host sonraki soruya geçecek.</small>
            <div class="kahoot-player-score-pill">Toplam: ${me?.score || 0} puan</div>
          </div>
        </div>
      `;
      return;
    }

    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-question">
          <div class="kahoot-player-qhead">
            <span>Soru ${idx + 1} / ${(room.questions || []).length}</span>
            <span class="kahoot-timer-pill">⏱ ${remaining}s</span>
          </div>
          <h2 class="kahoot-player-qtext">${esc(q.question)}</h2>
          <div class="kahoot-player-answer-grid">
            ${q.options.map((opt, i) => `
              <button type="button" class="kahoot-answer ${colors[i] || "blue"} kahoot-player-answer-btn" onclick="submitPlayerAnswer(${i})">
                <span>${shapes[i] || "◆"}</span>
                <strong>${esc(opt)}</strong>
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderPlayerFinal() {
    const target = root(); if (!target) return;
    const sorted = [...state.playersData].sort((a, b) => (b.score || 0) - (a.score || 0));
    const me = sorted.find((p) => p.playerId === state.playerId);
    const myRank = sorted.findIndex((p) => p.playerId === state.playerId) + 1;
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card kahoot-player-result">
          <span class="kahoot-result-cup">${myRank === 1 ? "🏆" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : "🎯"}</span>
          <h2>Oyun Bitti!</h2>
          <p><strong>${esc(me?.name || "Oyuncu")}</strong>${myRank > 0 ? ` • ${myRank}. sıra` : ""}</p>
          <div class="kahoot-score-big">${me?.score || 0}</div>
          <small>puan</small>
          ${renderLeaderboardHtml(sorted, state.playerId)}
          <button type="button" class="kahoot-primary-btn" onclick="leaveKahootHost()">Ana Sayfa</button>
        </div>
      </div>
    `;
  }

  function renderKahootError(message) {
    const target = root(); if (!target) return;
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card">
          <span class="kahoot-k-badge">K!</span>
          <h2>Bir Sorun Oluştu</h2>
          <p>${esc(message)}</p>
          <button type="button" class="kahoot-primary-btn" onclick="leaveKahootHost()">Ana Sayfa</button>
        </div>
      </div>
    `;
  }

  /* ---------- SETUP MODALS ---------- */
  function openKahootHostSetup() {
    closeKahootHostSetup();
    const modal = document.createElement("div");
    modal.id = "kahootRoomSetupModal";
    modal.className = "kahoot-modal-backdrop";
    modal.innerHTML = `
      <div class="kahoot-modal kahoot-setup-modal" role="dialog" aria-modal="true">
        <button class="kahoot-modal-close" type="button" onclick="closeKahootHostSetup()" aria-label="Kapat">✕</button>
        <span class="kahoot-k-badge">K!</span>
        <h2>Yeni Kahoot Odası</h2>
        <p>Hızlıca bir oda kur, QR ile arkadaşlarını davet et.</p>
        <div class="kahoot-setup-fields">
          <label class="kahoot-setup-label">Host Adı
            <input type="text" id="kahootHostName" maxlength="24" placeholder="Örn: Yusuf" value="">
          </label>
          <label class="kahoot-setup-label">Kategori
            <select id="kahootHostCategory">
              <option value="mixed">🎯 Karma Quizler</option>
              <option value="word">📖 Kelime Quizleri</option>
              <option value="grammar">🧩 Dil Bilgisi</option>
              <option value="unit">🎓 Ünite Quizleri</option>
              <option value="favorite">⭐ Favorilerim</option>
            </select>
          </label>
          <div class="kahoot-setup-row">
            <label class="kahoot-setup-label">Soru Sayısı
              <select id="kahootHostQCount">
                <option value="5">5 soru</option>
                <option value="10" selected>10 soru</option>
                <option value="15">15 soru</option>
                <option value="20">20 soru</option>
              </select>
            </label>
            <label class="kahoot-setup-label">Soru Süresi
              <select id="kahootHostQTime">
                <option value="10">10 sn</option>
                <option value="20" selected>20 sn</option>
                <option value="30">30 sn</option>
                <option value="45">45 sn</option>
              </select>
            </label>
          </div>
        </div>
        <div class="kahoot-setup-actions">
          <button type="button" class="kahoot-secondary-btn" onclick="closeKahootHostSetup()">Vazgeç</button>
          <button type="button" class="kahoot-primary-btn" id="kahootHostSetupConfirmBtn" onclick="confirmKahootHostSetup()">🎉 Odayı Aç</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById("kahootHostName")?.focus(), 80);
  }
  function closeKahootHostSetup() {
    document.getElementById("kahootRoomSetupModal")?.remove();
  }
  async function confirmKahootHostSetup() {
    const hostName = document.getElementById("kahootHostName")?.value?.trim() || "Host";
    const categoryId = document.getElementById("kahootHostCategory")?.value || "mixed";
    const questionCount = parseInt(document.getElementById("kahootHostQCount")?.value || "10", 10);
    const questionDuration = parseInt(document.getElementById("kahootHostQTime")?.value || "20", 10);
    const btn = document.getElementById("kahootHostSetupConfirmBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Oluşturuluyor..."; }
    try {
      await createKahootRoom({ hostName, categoryId, questionCount, questionDuration });
      closeKahootHostSetup();
      gotoKahoot();
      renderForCurrentMode();
    } catch (e) {
      console.error("[Kahoot] setup error:", e);
      if (btn) { btn.disabled = false; btn.textContent = "🎉 Odayı Aç"; }
      alert("Oda oluşturulamadı: " + (e?.message || e) + "\nFirebase Firestore'a erişim olduğundan emin ol.");
    }
  }

  function openKahootJoinPrompt() {
    const old = document.getElementById("kahootJoinModal");
    if (old) old.remove();
    const modal = document.createElement("div");
    modal.id = "kahootJoinModal";
    modal.className = "kahoot-modal-backdrop";
    modal.innerHTML = `
      <div class="kahoot-modal kahoot-join-modal" role="dialog" aria-modal="true">
        <button class="kahoot-modal-close" type="button" onclick="closeKahootJoinPrompt()" aria-label="Kapat">✕</button>
        <span class="kahoot-k-badge">K!</span>
        <h2>Oda Koduyla Katıl</h2>
        <p>Host'un sana verdiği 6 haneli kodu veya PIN'i yaz.</p>
        <div class="kahoot-setup-fields">
          <label class="kahoot-setup-label">Oda Kodu
            <input type="text" id="kahootJoinRoomCode" maxlength="6" placeholder="Örn: AB23CD" autocapitalize="characters" autocomplete="off">
          </label>
        </div>
        <div class="kahoot-setup-actions">
          <button type="button" class="kahoot-secondary-btn" onclick="closeKahootJoinPrompt()">Vazgeç</button>
          <button type="button" class="kahoot-primary-btn" onclick="confirmKahootJoinPrompt()">Devam</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById("kahootJoinRoomCode")?.focus(), 80);
  }
  function closeKahootJoinPrompt() {
    document.getElementById("kahootJoinModal")?.remove();
  }
  async function confirmKahootJoinPrompt() {
    const codeRaw = (document.getElementById("kahootJoinRoomCode")?.value || "").trim().toUpperCase();
    if (!codeRaw) return;
    try {
      // 1) doğrudan roomId dene
      const direct = await getDoc(doc(db, ROOM_COLLECTION, codeRaw));
      if (direct.exists()) {
        closeKahootJoinPrompt();
        openKahootJoinMode(codeRaw);
        return;
      }
      // 2) PIN ile arama (waiting/playing/countdown durumundakileri öncele)
      const qRef = query(collection(db, ROOM_COLLECTION), where("pin", "==", codeRaw));
      const found = await getDocs(qRef);
      if (!found.empty) {
        const room = found.docs[0].data();
        closeKahootJoinPrompt();
        openKahootJoinMode(room.roomId || found.docs[0].id);
        return;
      }
      alert("Bu kod ile aktif bir oda bulunamadı.");
    } catch (e) {
      console.error("[Kahoot] join prompt error:", e);
      alert("Hata: " + (e?.message || e));
    }
  }

  /* ---------- Copy link ---------- */
  function copyKahootJoinLink() {
    const input = document.getElementById("kahootJoinUrlInput");
    const url = input?.value || (state.roomId ? generateKahootJoinUrl(state.roomId, "player") : "");
    if (!url) return;
    const done = () => {
      const btn = document.querySelector(".kahoot-join-link-row .kahoot-secondary-btn");
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = "✓ Kopyalandı";
      setTimeout(() => { btn.textContent = original; }, 1400);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => {
        input?.select(); document.execCommand?.("copy"); done();
      });
    } else {
      input?.select(); document.execCommand?.("copy"); done();
    }
  }

  /* ---------- Home decoration + nav hook ---------- */
  function decorateKahootHome() {
    const r = root();
    if (!r) return;
    if (r.querySelector(".kahoot-room-launch-card")) return;
    const card = document.createElement("div");
    card.className = "kahoot-room-launch-card";
    card.innerHTML = `
      <div class="kahoot-room-launch-inner">
        <div class="kahoot-room-launch-copy">
          <span class="kahoot-room-tag">CANLI MOD • FIREBASE</span>
          <h2>QR ile Çok Cihazlı Kahoot Odası</h2>
          <p>Yeni oda oluştur, QR kodu göster — telefondan okutan herkes <strong>kendi cihazından</strong> aynı odaya katılır. Realtime Firestore ile çalışır; her oyuncu kendi telefonunda sorular, süre, hız puanı ve canlı leaderboard görür.</p>
          <div class="kahoot-room-launch-actions">
            <button type="button" class="kahoot-primary-btn" onclick="openKahootHostSetup()">+ Yeni Oda Oluştur</button>
            <button type="button" class="kahoot-secondary-btn" onclick="openKahootJoinPrompt()">Oda Koduyla Katıl</button>
          </div>
          ${(isLocalEnvironment() && !hasPublicUrlOverride())
            ? `<div class="kahoot-localhost-warning compact">
                ⚠️ Şu an local adres üzerindesin. QR ile başka telefonlardan katılım için
                siteyi public bir adrese (Vercel / Netlify / Firebase Hosting) yükle.
              </div>` : ""}
        </div>
        <div class="kahoot-room-launch-art" aria-hidden="true">
          <div class="kahoot-room-launch-qr-mock">
            <div class="kahoot-qr-corner tl"></div>
            <div class="kahoot-qr-corner tr"></div>
            <div class="kahoot-qr-corner bl"></div>
            <div class="kahoot-qr-center">K!</div>
          </div>
          <div class="kahoot-room-launch-floats">
            <span>🎮</span><span>📱</span><span>⚡</span>
          </div>
        </div>
      </div>
    `;
    const hero = r.querySelector(".kahoot-hero-card");
    if (hero && hero.nextSibling) hero.parentNode.insertBefore(card, hero.nextSibling);
    else r.insertBefore(card, r.firstChild);
  }

  function renderKahootHomeSafe() {
    if (typeof window.renderKahootHome === "function") {
      try { window.renderKahootHome(); } catch (_) {}
    }
    decorateKahootHome();
  }

  function hookNavigateForDecoration() {
    if (window.__RAVZA_KAHOOT_ROOM_NAV_HOOKED__) return;
    window.__RAVZA_KAHOOT_ROOM_NAV_HOOKED__ = true;
    const original = window.navigate;
    window.navigate = function patchedKahootRoomNav(pageId, ...args) {
      const res = typeof original === "function" ? original.call(this, pageId, ...args) : undefined;
      if (pageId === "kahoot") {
        setTimeout(() => {
          if (!state.mode) decorateKahootHome();
          else renderForCurrentMode();
        }, 30);
      }
      return res;
    };
  }

  /* ---------- URL Routing (?page=kahoot&room=XXX&role=player) ---------- */
  function handleInitialKahootRoute() {
    let page = null, room = null, role = null;
    try {
      const params = new URLSearchParams(window.location.search || "");
      page = params.get("page");
      room = params.get("room");
      role = params.get("role");
    } catch (_) {}

    if (!room && location.hash) {
      const hash = location.hash.replace(/^#/, "");
      if (hash.startsWith("kahoot")) {
        page = "kahoot";
        const q = hash.split("?")[1] || "";
        const hp = new URLSearchParams(q);
        room = hp.get("room");
        role = hp.get("role");
      }
    }

    if (page !== "kahoot" && !room) return;

    gotoKahoot();
    setTimeout(() => {
      if (room) {
        openKahootJoinMode(room);
      } else {
        renderKahootHomeSafe();
      }
    }, 100);
  }

  /* ---------- Init ---------- */
  function init() {
    hookNavigateForDecoration();
    startTimerTick();
    setTimeout(() => {
      if (document.getElementById("kahoot")?.classList.contains("active")) decorateKahootHome();
    }, 200);
    if (!window.__KAHOOT_INITIAL_ROUTE_DONE__) {
      window.__KAHOOT_INITIAL_ROUTE_DONE__ = true;
      handleInitialKahootRoute();
    }
  }

  /* ---------- Global API ---------- */
  window.openKahootHostSetup = openKahootHostSetup;
  window.closeKahootHostSetup = closeKahootHostSetup;
  window.confirmKahootHostSetup = confirmKahootHostSetup;
  window.openKahootJoinPrompt = openKahootJoinPrompt;
  window.closeKahootJoinPrompt = closeKahootJoinPrompt;
  window.confirmKahootJoinPrompt = confirmKahootJoinPrompt;
  window.openKahootJoinMode = openKahootJoinMode;
  window.confirmKahootJoin = confirmKahootJoin;
  window.submitPlayerAnswer = submitPlayerAnswer;
  window.hostStartGame = hostStartGame;
  window.hostAdvanceQuestion = hostAdvanceQuestion;
  window.hostRefreshQR = hostRefreshQR;
  window.copyKahootJoinLink = copyKahootJoinLink;
  window.cancelKahootRoom = cancelKahootRoom;
  window.hostPlayAgain = hostPlayAgain;
  window.leaveKahootHost = leaveKahootHost;
  window.generateKahootJoinUrl = generateKahootJoinUrl;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}
