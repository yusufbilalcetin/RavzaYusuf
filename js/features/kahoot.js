/* =========================================================
   RAVZA KAHOOT BOLUMU
   Tek kisilik kahoot akisi: kategoriler, quiz oynatma, istatistik.
   navigate('kahoot') ile ayri bolum olarak acilir.
   legacy-app.js icindeki IIFE'den ayrildi; davranis aynidir.
   ========================================================= */
import { safeParse } from "../utils/helpers.js";

export function initRavzaKahootModule({ topics }) {
  const STORAGE_KEY = "ravza_kahoot_stats_v2";
  const ACTIVE_KEY = "ravza_kahoot_active_category_v1";

  const CATEGORIES = [
    { id: "word", icon: "📖", title: "Kelime Quizleri", desc: "Kelime anlamı, definition ve örnek cümleleri hızlıca pekiştir.", count: 12, color: "purple" },
    { id: "grammar", icon: "🧩", title: "Dil Bilgisi Quizleri", desc: "Tense, pronoun, adjective ve preposition konularını çalış.", count: 9, color: "blue" },
    { id: "unit", icon: "🎓", title: "Ünite Quizleri", desc: "Üniteleri kapsayan konu bazlı yarışma quizleri çöz.", count: 8, color: "green" },
    { id: "mixed", icon: "🎯", title: "Karma Quizler", desc: "Farklı konulardan karışık, hızlı ve eğlenceli sorular.", count: 15, color: "orange" },
    { id: "favorite", icon: "⭐", title: "Favorilerim", desc: "Tekrar edilmesi gereken özel sorularını burada topla.", count: 6, color: "pink" }
  ];

  const FALLBACK_QUESTIONS = [
    {
      question: "Which word means 'kanıt' in Turkish?",
      options: ["Evidence", "Survey", "Nickname", "Scale"],
      answer: 0,
      explanation: "Evidence, bir iddiayı destekleyen kanıt veya bilgi anlamına gelir."
    },
    {
      question: "Choose the correct sentence.",
      options: ["She is a beautiful girl.", "She is beautiful girl.", "She a beautiful girl.", "She beautiful is girl."],
      answer: 0,
      explanation: "Tekil isimden önce article gerekir: a beautiful girl."
    },
    {
      question: "Which sentence uses Present Continuous for a future arrangement?",
      options: ["I meet him yesterday.", "I am meeting him tonight.", "I met him tomorrow.", "I meeting him now."],
      answer: 1,
      explanation: "Önceden ayarlanmış gelecek planlarında Present Continuous kullanılabilir."
    },
    {
      question: "Complete the sentence: I am tired ___ waiting.",
      options: ["of", "for", "at", "to"],
      answer: 0,
      explanation: "Doğru kullanım tired of şeklindedir."
    },
    {
      question: "Which one is an object pronoun?",
      options: ["she", "her", "herselfs", "they"],
      answer: 1,
      explanation: "Her, object pronoun olarak kullanılabilir."
    },
    {
      question: "What is the superlative form of bad?",
      options: ["baddest", "most bad", "worst", "worse"],
      answer: 2,
      explanation: "Bad kelimesinin superlative formu worst'tür."
    },
    {
      question: "Choose the correct dependent preposition: interested ___ science.",
      options: ["on", "in", "for", "at"],
      answer: 1,
      explanation: "Interested in doğru kullanımdır."
    },
    {
      question: "Complete: The flight ___ at 6.50 tomorrow morning.",
      options: ["leaves", "is leaving", "leave", "leaving"],
      answer: 0,
      explanation: "Timetable / schedule anlatırken Present Simple kullanılır."
    }
  ];

  let currentQuiz = null;

  function loadStats() {
    return safeParse(localStorage.getItem(STORAGE_KEY), {
      xp: 265,
      crystals: 18,
      bestScore: 0,
      played: []
    });
  }

  function saveStats(stats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCategory(categoryId) {
    return CATEGORIES.find((category) => category.id === categoryId) || CATEGORIES.find((category) => category.id === "mixed") || CATEGORIES[0];
  }

  function normalizeTopicQuestion(topic, quizItem, index) {
    if (!quizItem || !Array.isArray(quizItem.options) || quizItem.options.length < 2) return null;
    const answerIndex = Number.isInteger(quizItem.answer) ? quizItem.answer : 0;
    return {
      id: `${topic?.id || "topic"}-${index}`,
      question: quizItem.question || `${topic?.title || "Konu"} sorusu`,
      options: quizItem.options.slice(0, 4),
      answer: Math.max(0, Math.min(answerIndex, quizItem.options.length - 1)),
      explanation: quizItem.explanation || `${topic?.title || "Bu konu"} için kısa tekrar yap.`
    };
  }

  function buildQuestionPool(categoryId) {
    const pool = [];

    try {
      if (Array.isArray(topics)) {
        topics.forEach((topic) => {
          if (!Array.isArray(topic.quiz)) return;
          topic.quiz.forEach((quizItem, index) => {
            const normalized = normalizeTopicQuestion(topic, quizItem, index);
            if (normalized) pool.push(normalized);
          });
        });
      }
    } catch (_) {}

    const base = pool.length ? pool : FALLBACK_QUESTIONS;
    const sizeMap = { word: 6, grammar: 7, unit: 8, mixed: 8, favorite: 5 };
    const size = sizeMap[categoryId] || 8;

    const rotated = base.map((item, index) => ({ item, sort: (index * 17 + categoryId.length * 13) % 37 }))
      .sort((a, b) => a.sort - b.sort)
      .map((entry) => entry.item);

    return rotated.slice(0, size).map((question, index) => ({ ...question, no: index + 1 }));
  }

  function ensureMarkup() {
    const nav = document.querySelector(".nav-links");
    if (nav && !document.getElementById("nav-kahoot")) {
      const li = document.createElement("li");
      li.innerHTML = `
        <button onclick="navigate('kahoot')" id="nav-kahoot">
          <span class="nav-icon kahoot-nav-mark">K!</span>
          Kahoot
        </button>
      `;
      const ravzaLingo = document.getElementById("nav-ravzalingo")?.closest("li");
      const studyHub = document.getElementById("nav-studyhub")?.closest("li");

      if (ravzaLingo?.parentNode) ravzaLingo.parentNode.insertBefore(li, ravzaLingo.nextSibling);
      else if (studyHub?.parentNode) studyHub.parentNode.insertBefore(li, studyHub);
      else nav.appendChild(li);
    }

    if (!document.getElementById("kahoot")) {
      const section = document.createElement("section");
      section.id = "kahoot";
      section.className = "page kahoot-page";
      section.innerHTML = `<div id="kahootRoot" class="kahoot-root"></div>`;

      const ravzaPage = document.getElementById("ravzalingo");
      const studyPage = document.getElementById("studyhub");
      const wrapper = document.querySelector(".content-wrapper") || document.body;

      if (ravzaPage?.parentNode) ravzaPage.parentNode.insertBefore(section, ravzaPage.nextSibling);
      else if (studyPage?.parentNode) studyPage.parentNode.insertBefore(section, studyPage);
      else wrapper.appendChild(section);
    }
  }

  function setKahootActiveNav() {
    document.querySelectorAll(".nav-links button").forEach((button) => button.classList.remove("active"));
    document.getElementById("nav-kahoot")?.classList.add("active");
  }

  function root() {
    ensureMarkup();
    return document.getElementById("kahootRoot");
  }

  function categoryCardsHtml() {
    return CATEGORIES.map((category) => `
      <button class="kahoot-category-card ${category.color}" type="button" onclick="startKahootQuiz('${category.id}')">
        <span class="kahoot-category-icon">${category.icon}</span>
        <span class="kahoot-category-text">
          <strong>${escapeHtml(category.title)}</strong>
          <small>${escapeHtml(category.desc)}</small>
          <em>${category.count} Quiz</em>
        </span>
        <span class="kahoot-arrow">→</span>
      </button>
    `).join("");
  }

  function recentHtml(stats) {
    if (!stats.played.length) {
      return `<div class="kahoot-empty-mini">Henüz Kahoot oynanmadı. Bir kategori seçip yarışmaya başla.</div>`;
    }

    return stats.played.slice(0, 4).map((item) => `
      <button class="kahoot-recent-item" type="button" onclick="startKahootQuiz('${item.categoryId || "mixed"}')">
        <span class="kahoot-k-badge">K!</span>
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.questionCount} soru • ${escapeHtml(item.date)}</small>
        </span>
        <b>%${item.score}</b>
      </button>
    `).join("");
  }

  function renderHome() {
    const target = root();
    if (!target) return;
    const stats = loadStats();

    target.innerHTML = `
      <div class="kahoot-shell">
        <div class="kahoot-top-stats">
          <div><span>❤️</span><strong>5/5</strong><small>Enerji</small></div>
          <div><span>⚡</span><strong>${stats.xp}</strong><small>XP</small></div>
          <div><span>💎</span><strong>${stats.crystals}</strong><small>Kristal</small></div>
          <div><span>📊</span><strong>${Math.max(stats.bestScore || 0, 13)}%</strong><small>İlerleme</small></div>
        </div>

        <div class="kahoot-hero-card">
          <div class="kahoot-hero-copy">
            <div class="kahoot-title-line">
              <span class="kahoot-big-logo">K!</span>
              <div>
                <h1>Kahoot</h1>
                <h2>Eğlenceli quizlerle bilgini test et!</h2>
              </div>
            </div>
            <p>Kahoot tarzı canlı ve renkli quizlerle konuları pekiştir, yarış, puan topla ve liderlik tablosunda zirveye çık.</p>
            <div class="kahoot-hero-actions">
              <button class="kahoot-primary-btn" type="button" onclick="startKahootQuiz('mixed')">Hızlı Yarışma Başlat</button>
              <button class="kahoot-secondary-btn" type="button" onclick="startKahootQuiz('favorite')">Favorilerden Başla</button>
            </div>
          </div>

          <div class="kahoot-device-art" aria-hidden="true">
            <div class="kahoot-confetti c1"></div>
            <div class="kahoot-confetti c2"></div>
            <div class="kahoot-confetti c3"></div>
            <div class="kahoot-device">
              <strong>Kahoot!</strong>
              <div class="kahoot-mini-grid">
                <span class="red">▲</span><span class="blue">◆</span><span class="yellow">●</span><span class="green">■</span>
              </div>
            </div>
            <div class="kahoot-trophy">🏆</div>
          </div>
        </div>

        <div class="kahoot-section-head">
          <h3>Quiz Kategorileri</h3>
          <button class="kahoot-create-btn" type="button" onclick="openKahootCreateModal()">+ Yeni Kahoot Oluştur</button>
        </div>

        <div class="kahoot-category-grid">
          ${categoryCardsHtml()}
        </div>

        <div class="kahoot-bottom-grid">
          <div class="kahoot-panel kahoot-recent-panel">
            <div class="kahoot-panel-head"><h3>Son Oynadıkların</h3><span>⏱️</span></div>
            <div class="kahoot-recent-list">${recentHtml(stats)}</div>
          </div>

          <div class="kahoot-panel">
            <div class="kahoot-panel-head"><h3>Liderlik Tablosu</h3><button type="button" onclick="resetKahootStats()">Sıfırla</button></div>
            <div class="kahoot-leaderboard">
              <div><b>1</b><span>👑 Yusuf</span><strong>${Math.max(2450, stats.xp + 2100)} XP</strong></div>
              <div><b>2</b><span>💗 Ravza</span><strong>${Math.max(1890, stats.xp + 1500)} XP</strong></div>
              <div><b>3</b><span>⭐ A.</span><strong>1250 XP</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function startQuiz(categoryId = "mixed") {
    ensureMarkup();
    localStorage.setItem(ACTIVE_KEY, categoryId);
    const category = getCategory(categoryId);
    currentQuiz = {
      categoryId,
      category,
      questions: buildQuestionPool(categoryId),
      index: 0,
      selected: null,
      correct: 0,
      answers: [],
      startedAt: Date.now()
    };
    if (typeof window.navigate === "function") window.navigate("kahoot");
    renderQuiz();
  }

  function renderQuiz() {
    const target = root();
    if (!target || !currentQuiz) return;
    const q = currentQuiz.questions[currentQuiz.index];
    const total = currentQuiz.questions.length;
    const progress = Math.round(((currentQuiz.index) / total) * 100);
    const shapes = ["▲", "◆", "●", "■"];
    const colorClasses = ["red", "blue", "yellow", "green"];

    target.innerHTML = `
      <div class="kahoot-play-shell">
        <div class="kahoot-play-top">
          <button type="button" onclick="renderKahootHome()">← Kahoot Ana Sayfa</button>
          <div>
            <strong>${escapeHtml(currentQuiz.category.title)}</strong>
            <small>Soru ${currentQuiz.index + 1} / ${total}</small>
          </div>
          <span>${progress}%</span>
        </div>

        <div class="kahoot-progress"><span style="width:${Math.max(5, progress)}%"></span></div>

        <div class="kahoot-question-card">
          <div class="kahoot-question-meta">
            <span class="kahoot-k-badge">K!</span>
            <span>Canlı Quiz Modu</span>
          </div>
          <h2>${escapeHtml(q.question)}</h2>
        </div>

        <div class="kahoot-answer-grid">
          ${q.options.map((option, index) => `
            <button type="button" class="kahoot-answer ${colorClasses[index] || "blue"}" onclick="selectKahootAnswer(${index})">
              <span>${shapes[index] || "◆"}</span>
              <strong>${escapeHtml(option)}</strong>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function selectAnswer(index) {
    if (!currentQuiz) return;
    const q = currentQuiz.questions[currentQuiz.index];
    const isCorrect = index === q.answer;
    if (isCorrect) currentQuiz.correct += 1;
    currentQuiz.answers.push({
      question: q.question,
      selected: q.options[index],
      correct: q.options[q.answer],
      isCorrect,
      explanation: q.explanation || ""
    });
    renderFeedback(index, isCorrect);
  }

  function renderFeedback(selectedIndex, isCorrect) {
    const target = root();
    if (!target || !currentQuiz) return;
    const q = currentQuiz.questions[currentQuiz.index];
    const selectedText = q.options[selectedIndex];

    target.innerHTML = `
      <div class="kahoot-feedback-shell ${isCorrect ? "is-correct" : "is-wrong"}">
        <div class="kahoot-feedback-card">
          <span class="kahoot-feedback-icon">${isCorrect ? "✅" : "❌"}</span>
          <h2>${isCorrect ? "Doğru cevap!" : "Yanlış cevap"}</h2>
          <p><strong>Seçilen:</strong> ${escapeHtml(selectedText)}</p>
          <p><strong>Doğru cevap:</strong> ${escapeHtml(q.options[q.answer])}</p>
          <small>${escapeHtml(q.explanation || "Bu soruyu tekrar ederek konuyu pekiştirebilirsin.")}</small>
          <button type="button" onclick="nextKahootQuestion()">${currentQuiz.index + 1 >= currentQuiz.questions.length ? "Sonucu Gör" : "Sonraki Soru"}</button>
        </div>
      </div>
    `;
  }

  function nextQuestion() {
    if (!currentQuiz) return;
    currentQuiz.index += 1;
    if (currentQuiz.index >= currentQuiz.questions.length) renderResult();
    else renderQuiz();
  }

  function renderResult() {
    const target = root();
    if (!target || !currentQuiz) return;
    const total = currentQuiz.questions.length;
    const score = Math.round((currentQuiz.correct / total) * 100);
    const gainedXp = Math.max(10, currentQuiz.correct * 15);
    const stats = loadStats();
    stats.xp = (stats.xp || 0) + gainedXp;
    stats.crystals = (stats.crystals || 0) + Math.floor(gainedXp / 30);
    stats.bestScore = Math.max(stats.bestScore || 0, score);
    stats.played = [
      {
        title: currentQuiz.category.title,
        categoryId: currentQuiz.categoryId,
        score,
        questionCount: total,
        date: new Date().toLocaleDateString("tr-TR")
      },
      ...(stats.played || [])
    ].slice(0, 8);
    saveStats(stats);

    const review = currentQuiz.answers.map((answer, index) => `
      <div class="kahoot-review-item ${answer.isCorrect ? "ok" : "bad"}">
        <b>${index + 1}</b>
        <span>
          <strong>${escapeHtml(answer.question)}</strong>
          <small>Senin cevabın: ${escapeHtml(answer.selected)} • Doğru: ${escapeHtml(answer.correct)}</small>
        </span>
      </div>
    `).join("");

    target.innerHTML = `
      <div class="kahoot-result-shell">
        <div class="kahoot-result-card">
          <span class="kahoot-result-cup">🏆</span>
          <h2>Quiz Tamamlandı!</h2>
          <p>${escapeHtml(currentQuiz.category.title)} bölümünde skorun:</p>
          <strong class="kahoot-score">%${score}</strong>
          <div class="kahoot-result-stats">
            <div><b>${currentQuiz.correct}/${total}</b><small>Doğru</small></div>
            <div><b>+${gainedXp}</b><small>XP</small></div>
            <div><b>${stats.bestScore}%</b><small>En iyi</small></div>
          </div>
          <div class="kahoot-result-actions">
            <button type="button" onclick="startKahootQuiz('${currentQuiz.categoryId}')">Tekrar Oyna</button>
            <button type="button" onclick="renderKahootHome()">Kahoot Ana Sayfa</button>
          </div>
        </div>
        <div class="kahoot-panel kahoot-review-panel">
          <div class="kahoot-panel-head"><h3>Soru İncelemesi</h3><span>📝</span></div>
          ${review}
        </div>
      </div>
    `;
  }

  function openCreateModal() {
    ensureMarkup();
    const old = document.getElementById("kahootCreateModal");
    if (old) old.remove();
    const modal = document.createElement("div");
    modal.id = "kahootCreateModal";
    modal.className = "kahoot-modal-backdrop";
    modal.innerHTML = `
      <div class="kahoot-modal" role="dialog" aria-modal="true" aria-labelledby="kahootModalTitle">
        <button class="kahoot-modal-close" type="button" onclick="closeKahootCreateModal()">✕</button>
        <span class="kahoot-k-badge">K!</span>
        <h2 id="kahootModalTitle">Yeni Kahoot Oluştur</h2>
        <p>Bu panel şu an tasarım ve hazırlık alanı olarak eklendi. İstersen sonraki adımda buraya soru ekleme, kategori seçme ve Firebase kaydetme sistemi bağlanabilir.</p>
        <div class="kahoot-modal-fields">
          <input type="text" placeholder="Quiz adı: Unit 1A Kelime Yarışması">
          <input type="text" placeholder="Kategori: Kelime / Grammar / Karma">
          <textarea placeholder="Soru taslağı yaz..."></textarea>
        </div>
        <button type="button" onclick="closeKahootCreateModal()">Şimdilik Kapat</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function closeCreateModal() {
    document.getElementById("kahootCreateModal")?.remove();
  }

  function resetStats() {
    localStorage.removeItem(STORAGE_KEY);
    renderHome();
  }

  function hookNavigate() {
    if (window.__RAVZA_KAHOOT_NAV_HOOKED__) return;
    window.__RAVZA_KAHOOT_NAV_HOOKED__ = true;
    const originalNavigate = window.navigate;

    window.navigate = function kahootPatchedNavigate(pageId, ...args) {
      ensureMarkup();
      const result = typeof originalNavigate === "function" ? originalNavigate.call(this, pageId, ...args) : undefined;

      const isKahoot = pageId === "kahoot";
      document.documentElement.classList.toggle("is-kahoot-page", isKahoot);
      document.body.classList.toggle("is-kahoot-page", isKahoot);

      if (isKahoot) {
        setKahootActiveNav();
        if (!currentQuiz) renderHome();
      }
      return result;
    };
  }

  function init() {
    ensureMarkup();
    hookNavigate();
    if (location.hash === "#kahoot") {
      try { window.navigate("kahoot"); } catch (_) { renderHome(); }
    }
  }

  window.renderKahootHome = function () { currentQuiz = null; renderHome(); if (typeof window.navigate === "function") window.navigate("kahoot"); };
  window.startKahootQuiz = startQuiz;
  window.selectKahootAnswer = selectAnswer;
  window.nextKahootQuestion = nextQuestion;
  window.openKahootCreateModal = openCreateModal;
  window.closeKahootCreateModal = closeCreateModal;
  window.resetKahootStats = resetStats;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}
