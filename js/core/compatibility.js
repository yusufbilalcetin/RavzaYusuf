import { KONU_LISTESI } from "../../data/konu-listesi.js";
import { loadTopicHtml } from "./html-loader.js";
import { getAppScrollElement, getAppScrollTop } from "./app-shell-scroll.js";
import { loadQuiz } from "../services/quiz-service.js";
import { safeText } from "../utils/helpers.js";
import { formatPercent } from "../utils/format.js";
import { matchesSearchIndex, normalizeSearchText } from "../utils/search.js";
import { uiAlert, showToast } from "../ui/sheet.js";

const aliases = {
  unit6b: "ability",
  phrasalverbs: "phrasal"
};

function resolveTopicId(topicId) {
  return aliases[topicId] || topicId;
}

function getTopic(topicId) {
  const id = resolveTopicId(topicId);
  return KONU_LISTESI.find((topic) => topic.id === id);
}

function getLegacyTopic(topicId) {
  const id = resolveTopicId(topicId);
  return Array.isArray(window.TOPICS) ? window.TOPICS.find((topic) => topic.id === id) : null;
}

function syncLegacyTopic(topic, updates) {
  const legacyTopic = getLegacyTopic(topic.id);
  if (legacyTopic) Object.assign(legacyTopic, updates);
}

function studyKey(topicId) {
  return `eul_study_${resolveTopicId(topicId)}`;
}

function quizKey(topicId) {
  return `eul_quiz_${resolveTopicId(topicId)}`;
}

function isStudyDone(topicId) {
  return localStorage.getItem(studyKey(topicId)) === "true";
}

function isQuizDone(topicId) {
  return localStorage.getItem(quizKey(topicId)) === "true";
}

function setStudyDone(topicId, value) {
  localStorage.setItem(studyKey(topicId), value ? "true" : "false");
}

function setQuizDone(topicId, value) {
  localStorage.setItem(quizKey(topicId), value ? "true" : "false");
}

function difficultyLabel(topic) {
  if (topic.difficulty === "easy") return "Kolay";
  if (topic.difficulty === "medium") return "Orta";
  return "Zor";
}

function topicSearchIndex(topic) {
  return normalizeSearchText([
    topic.title,
    topic.subtitle,
    topic.unit,
    topic.category,
    ...(topic.keyPoints || []),
    ...(topic.searchAliases || [])
  ].join(" "));
}

const TOPIC_SEARCH_INDEXES = new Map(KONU_LISTESI.map((topic) => [topic.id, topicSearchIndex(topic)]));

async function openStudyTopic(topicId) {
  const topic = getTopic(topicId);
  if (!topic) return;

  await window.__routerNavigate?.("konu-detay");
  const container = document.getElementById("studyDetailContent");
  if (!container) return;

  let summaryHtml = "";
  try {
    summaryHtml = await loadTopicHtml(topic);
    syncLegacyTopic(topic, { summaryHtml });
  } catch (error) {
    console.error(error);
    container.innerHTML = '<div class="empty-grid">Konu içeriği yüklenemedi.</div>';
    return;
  }

  const done = isStudyDone(topic.id);
  const points = Array.isArray(topic.keyPoints) ? topic.keyPoints : [];

  container.innerHTML = `
    <div class="study-detail-panel">
      <section class="study-detail-hero">
        <div class="study-detail-top">
          <button class="ghost-btn detail-back-btn" onclick="navigate('calisma-merkezi')">← Çalışma Merkezine Dön</button>
          <div class="topic-meta detail-badges">
            <span class="unit-badge">${safeText(topic.unit)}</span>
            <span class="difficulty-chip ${safeText(topic.difficulty)}">${difficultyLabel(topic)}</span>
            <span class="status-chip ${done ? "done" : "waiting"}">${done ? "Tamamlandı" : "Çalışılıyor"}</span>
          </div>
        </div>
        <div class="study-detail-title-block">
          <h2 class="detail-title">${safeText(topic.title)}</h2>
          <p class="detail-subtitle">${safeText(topic.subtitle)}</p>
        </div>
      </section>

      <section class="study-detail-content-card">
        <div class="study-content">
          ${summaryHtml}
          <div class="content-card critical-card">
            <h3>Kritik noktalar</h3>
            <div class="keypoint-list">
              ${points.map((point) => `<div class="keypoint-item">${safeText(point)}</div>`).join("")}
            </div>
          </div>
        </div>
      </section>

      <div class="study-detail-actionbar">
        <button class="mark-btn ${done ? "done" : ""}" onclick="toggleStudyDone('${safeText(topic.id)}', true)">
          ${done ? "☑️ Tamamlandı" : "✅ Çalışmayı Bitirdim"}
        </button>
        <button class="secondary-btn detail-quiz-btn" onclick="openQuizTopic('${safeText(topic.id)}')">
          → İlgili Quize Geç
        </button>
      </div>
    </div>
  `;
}

async function openQuizTopic(topicId) {
  const topic = getTopic(topicId);
  if (!topic) return;

  await window.__routerNavigate?.("quiz-coz");
  const container = document.getElementById("quizDetailContent");
  if (!container) return;

  let questions = [];
  try {
    questions = await loadQuiz(topic.id);
    syncLegacyTopic(topic, { quiz: questions, quizCount: questions.length });
  } catch (error) {
    console.error(error);
    container.innerHTML = '<div class="empty-grid">Quiz soruları yüklenemedi.</div>';
    return;
  }

  const quizDone = isQuizDone(topic.id);
  const studyDone = isStudyDone(topic.id);
  const points = Array.isArray(topic.keyPoints) ? topic.keyPoints : [];

  container.innerHTML = `
    <div class="quiz-shell">
      <div class="quiz-hero">
        <div class="quiz-topbar">
          <button class="ghost-btn" onclick="navigate('quiz-merkezi')">← Quiz Merkezine Dön</button>
          <div class="topic-meta">
            <span class="unit-badge quiz-badge">${safeText(topic.unit)}</span>
            <span class="status-chip ${quizDone ? "done" : "ready"}">${quizDone ? "Daha önce çözüldü" : "Hazır"}</span>
          </div>
        </div>
        <h2 class="quiz-title">${safeText(topic.title)} Quiz</h2>
        <p class="quiz-subtitle">${questions.length} soruluk ayrı quiz alanı. Notlar çalışma merkezinde kaldı; burada sadece soru çözersin.</p>
      </div>

      <div class="quiz-layout">
        <div class="quiz-form">
          ${questions.map((q, index) => `
            <div class="question-card" data-question-index="${index}">
              <div class="question-meta">Soru ${index + 1}</div>
              <div class="question-title">${safeText(q.question)}</div>
              <div class="option-list">
                ${(q.options || []).map((option, optionIndex) => `
                  <label class="option-item">
                    <input type="radio" name="quiz-${safeText(topic.id)}-${index}" value="${optionIndex}">
                    ${safeText(option)}
                  </label>
                `).join("")}
              </div>
            </div>
          `).join("")}

          <div class="topic-actions">
            <button class="check-btn" onclick="submitTopicQuiz('${safeText(topic.id)}')">Cevapları Kontrol Et</button>
            <button class="ghost-btn" onclick="openStudyTopic('${safeText(topic.id)}')">Konuya Geri Dön</button>
          </div>

          <div id="quiz-result-${safeText(topic.id)}" class="quiz-result"></div>
        </div>

        <aside class="quiz-sidebar">
          <div class="side-card">
            <h3>Quiz notu</h3>
            <p>${studyDone ? "Bu konunun çalışma kısmı tamamlanmış görünüyor. Şimdi soru çözmeye hazırsın." : "Öneri: Önce konu anlatımını çalışıp sonra bu quiz'e gir. Böylece daha verimli olur."}</p>
            <div class="topic-actions" style="margin-top:14px">
              <button class="mark-btn ${quizDone ? "done" : ""}" onclick="toggleQuizDone('${safeText(topic.id)}', true)">${quizDone ? "☑️ Quiz Tamamlandı" : "✅ Quiz Bitti"}</button>
            </div>
          </div>
          <div class="side-card">
            <h3>Odak noktaları</h3>
            <ul>${points.map((point) => `<li>${safeText(point)}</li>`).join("")}</ul>
          </div>
        </aside>
      </div>
    </div>
  `;
}

async function submitTopicQuiz(topicId) {
  const topic = getTopic(topicId);
  if (!topic) return;

  let questions = getLegacyTopic(topic.id)?.quiz || [];
  if (!questions.length) {
    try {
      questions = await loadQuiz(topic.id);
      syncLegacyTopic(topic, { quiz: questions, quizCount: questions.length });
    } catch (error) {
      console.error(error);
      uiAlert("Quiz soruları yüklenemedi.", { title: "Quiz açılamadı" });
      return;
    }
  }

  let score = 0;
  const explanations = [];

  questions.forEach((question, questionIndex) => {
    const wrapper = document.querySelector(`#quizDetailContent .question-card[data-question-index="${questionIndex}"]`);
    if (!wrapper) return;

    const labels = wrapper.querySelectorAll(".option-item");
    labels.forEach((label) => label.classList.remove("correct", "wrong"));

    const selected = wrapper.querySelector(`input[name="quiz-${topic.id}-${questionIndex}"]:checked`);
    const correctIndex = question.answer;

    labels.forEach((label, labelIndex) => {
      const radio = label.querySelector("input");
      if (radio) radio.disabled = true;
      if (labelIndex === correctIndex) label.classList.add("correct");
    });

    if (selected && Number(selected.value) === correctIndex) {
      score += 1;
      explanations.push(`<li><strong>Soru ${questionIndex + 1}:</strong> Doğru. ${safeText(question.explanation)}</li>`);
    } else {
      selected?.closest(".option-item")?.classList.add("wrong");
      explanations.push(`<li><strong>Soru ${questionIndex + 1}:</strong> ${safeText(question.explanation)}</li>`);
    }
  });

  const resultEl = document.getElementById(`quiz-result-${topic.id}`);
  if (!resultEl) return;

  const percent = formatPercent(score, questions.length);
  setQuizDone(topic.id, true);

  resultEl.className = `quiz-result show ${score === questions.length ? "success" : "error"}`;
  resultEl.innerHTML = `
    <h3 class="result-title">Quiz Sonucu</h3>
    <p><strong>Puan:</strong> ${score}/${questions.length} · ${percent}%</p>
    <p>${score === questions.length ? "Harika! Bu quiz'i tamamen doğru çözdün." : "Quiz tamamlandı. Aşağıdaki açıklamaları gözden geçirip tekrar denemek istersen sayfayı yenileyebilirsin."}</p>
    <ul style="padding-left:18px; margin-top:8px; display:grid; gap:8px;">
      ${explanations.join("")}
    </ul>
  `;

  window.updateDashboardStats?.();
  window.renderQuizHub?.(document.getElementById("quizFilter")?.value || "");
  window.__saveProgressToFirebase?.();
}

function searchTopics(event) {
  if (event?.key && event.key !== "Enter") return;
  const input = document.getElementById("searchInput");
  if (!input) return;

  const query = normalizeSearchText(input.value);
  if (query.length < 2) return;

  const found = KONU_LISTESI.find((topic) => matchesSearchIndex(TOPIC_SEARCH_INDEXES.get(topic.id), query));
  if (found) {
    openStudyTopic(found.id);
    return;
  }

  if (query.includes("quiz")) window.navigate("quiz-merkezi");
  else if (query.includes("ezber") || query.includes("kelime") || query.includes("word")) window.navigate("ezber-merkezi");
  else if (query.includes("gap") || query.includes("fill") || query.includes("bosluk") || query.includes("boşluk")) window.navigate("bosluk-doldurma");
  else if (query.includes("sinav") || query.includes("sınav") || query.includes("exam")) window.navigate("sinav-merkezi");
  else window.navigate("calisma-merkezi");
}

function installAppShellScrollTopButton() {
  if (window.__APP_SHELL_SCROLL_TOP_INSTALLED__) return;
  window.__APP_SHELL_SCROLL_TOP_INSTALLED__ = true;

  const btn = document.getElementById("scrollTopBtn");
  const scroller = getAppScrollElement();
  if (!btn || !scroller) return;

  const update = () => {
    btn.classList.toggle("show", getAppScrollTop() > 300);
  };

  btn.addEventListener("click", () => {
    window.__scrollAppToTop?.("smooth");
  });

  scroller.addEventListener("scroll", update, { passive: true });
  window.addEventListener("scroll", update, { passive: true });
  update();
}

export function installCompatibility() {
  const legacyToggleStudyDone = window.toggleStudyDone;
  const legacyToggleQuizDone = window.toggleQuizDone;

  window.openStudyTopic = openStudyTopic;
  window.openQuizTopic = openQuizTopic;
  window.submitTopicQuiz = submitTopicQuiz;
  window.searchTopics = searchTopics;

  window.toggleStudyDone = (topicId, rerender = false) => {
    if (typeof legacyToggleStudyDone === "function") {
      legacyToggleStudyDone(topicId, false);
    } else {
      setStudyDone(topicId, !isStudyDone(topicId));
      window.updateDashboardStats?.();
      window.renderStudyHub?.(document.getElementById("studyFilter")?.value || "");
      window.__saveProgressToFirebase?.();
    }
    if (rerender) openStudyTopic(topicId);
  };

  window.toggleQuizDone = (topicId, rerender = false) => {
    if (typeof legacyToggleQuizDone === "function") {
      legacyToggleQuizDone(topicId, false);
    } else {
      setQuizDone(topicId, !isQuizDone(topicId));
      window.updateDashboardStats?.();
      window.renderQuizHub?.(document.getElementById("quizFilter")?.value || "");
      window.__saveProgressToFirebase?.();
    }
    if (rerender) openQuizTopic(topicId);
  };

  window.startTopicQuiz = window.openQuizTopic;
  window.startQuiz = window.openQuizTopic;
  window.markTopicDone = window.toggleStudyDone;
  window.checkAnswer = window.submitTopicQuiz;
  window.nextQuestion = window.nextMemoryPracticeQuestion || (() => {});
  window.previousQuestion = window.previousQuestion || (() => {});

  installAppShellScrollTopButton();
}
