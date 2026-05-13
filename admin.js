import { db } from "./firebase-config.js";
import { DEFAULT_TOPICS, DEFAULT_QUIZZES, DEFAULT_EXAMS } from "./content-defaults.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const ADMIN_PASSWORD = "ravza2025";
const SESSION_KEY = "yusuf_ravza_admin_demo_session";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const data = {
  overviewStats: [
    { icon: "◎", value: "152", label: "Toplam Kullanıcı", growth: "Bu ay +18%" },
    { icon: "▣", value: "128", label: "Toplam İçerik", growth: "Bu ay +12%" },
    { icon: "?", value: "356", label: "Toplam Quiz", growth: "Bu ay +24%" },
    { icon: "☑", value: "64", label: "Toplam Sınav", growth: "Bu ay +9%" },
    { icon: "▤", value: "215", label: "Ezber Kartı", growth: "Bu ay +31%" }
  ],
  users: [
    { name: "Ravza Y.", email: "ravza@example.com", role: "Öğrenci", date: "8 May 2025", status: "Aktif" },
    { name: "Ayşe K.", email: "ayse@example.com", role: "Öğrenci", date: "7 May 2025", status: "Aktif" },
    { name: "Zeynep T.", email: "zeynep@example.com", role: "Öğrenci", date: "6 May 2025", status: "Aktif" },
    { name: "Emre A.", email: "emre@example.com", role: "Öğrenci", date: "5 May 2025", status: "Pasif" },
    { name: "Melisa D.", email: "melisa@example.com", role: "Öğrenci", date: "4 May 2025", status: "Aktif" }
  ],
  content: [
    { title: "Kelime Listesi", type: "Kelime", date: "8 May 2025", status: "Yayında" },
    { title: "Present Perfect Tense", type: "Dilbilgisi", date: "7 May 2025", status: "Yayında" },
    { title: "Soru Çözüm Stratejileri", type: "Strateji", date: "6 May 2025", status: "Taslak" },
    { title: "Okuma Parçası 1A", type: "Okuma", date: "5 May 2025", status: "Yayında" },
    { title: "Dinleme Metni 1A", type: "Dinleme", date: "4 May 2025", status: "Yayında" }
  ],
  quizzes: [
    { title: "Unit 1A - Kelime Quiz", category: "Kelime", questions: "20 soru", difficulty: "Kolay", date: "8 May 2025", status: "Yayında" },
    { title: "Present Perfect Tense Quiz", category: "Dilbilgisi", questions: "15 soru", difficulty: "Orta", date: "7 May 2025", status: "Yayında" },
    { title: "Çevre ve Kirlilik Quiz", category: "Okuma", questions: "25 soru", difficulty: "Orta", date: "6 May 2025", status: "Yayında" },
    { title: "İş Hayatı Kelimeleri Quiz", category: "Kelime", questions: "20 soru", difficulty: "Zor", date: "5 May 2025", status: "Taslak" },
    { title: "Sıfatlar ve Zarflar Quiz", category: "Dilbilgisi", questions: "18 soru", difficulty: "Kolay", date: "4 May 2025", status: "Yayında" }
  ],
  exams: [
    { title: "1A Genel Tekrar Sınavı", desc: "1A ünitesi genel tekrar sınavı", type: "Genel", duration: "90 dk", date: "8 May 2025 18:00", participants: 128, status: "Yayınlandı" },
    { title: "Unit 1A Vocabulary Test", desc: "Kelime odaklı mini ölçme", type: "Kelime", duration: "30 dk", date: "10 May 2025 14:00", participants: 96, status: "Yayınlandı" },
    { title: "Present Perfect Test", desc: "Konu performansı ölçümü", type: "Konu", duration: "45 dk", date: "12 May 2025 16:00", participants: 104, status: "Tamamlandı" },
    { title: "Okuma Comprehension 1A", desc: "Okuma becerisi sınavı", type: "Okuma", duration: "40 dk", date: "15 May 2025 17:00", participants: 87, status: "Planlandı" },
    { title: "Dinleme Testi 1A", desc: "Dinleme becerisi sınavı", type: "Dinleme", duration: "35 dk", date: "18 May 2025 15:00", participants: 72, status: "Planlandı" },
    { title: "Grammar Review 1A", desc: "Dilbilgisi tekrar sınavı", type: "Dilbilgisi", duration: "50 dk", date: "20 May 2025 18:00", participants: 65, status: "Taslak" }
  ],
  flashcards: [
    { title: "Present Perfect Kelimeleri", category: "Kelime", deck: "İngilizce - Temel", difficulty: "Orta", date: "8 May 2025", status: "Yayında" },
    { title: "Sıfatlar ve Zarflar", category: "Dilbilgisi", deck: "İngilizce - Dilbilgisi", difficulty: "Orta", date: "6 May 2025", status: "Yayında" },
    { title: "İngilizce Fiiller", category: "Kelime", deck: "İngilizce - Fiiller", difficulty: "Zor", date: "5 May 2025", status: "Yayında" },
    { title: "Mimari Terimler", category: "Genel", deck: "Mimarlık - Terimler", difficulty: "Zor", date: "3 May 2025", status: "Taslak" },
    { title: "Günlük Konuşma Kalıpları", category: "Konuşma", deck: "İngilizce - Konuşma", difficulty: "Kolay", date: "1 May 2025", status: "Yayında" },
    { title: "Okuma Anlama Kelimeleri", category: "Okuma", deck: "İngilizce - Okuma", difficulty: "Orta", date: "30 Nis 2025", status: "Yayında" },
    { title: "İleri Seviye Kelimeler", category: "Kelime", deck: "İngilizce - İleri", difficulty: "Zor", date: "28 Nis 2025", status: "Arşivlendi" },
    { title: "Akademik Kelimeler", category: "Kelime", deck: "İngilizce - Akademik", difficulty: "Zor", date: "25 Nis 2025", status: "Taslak" }
  ],
  popularContents: [
    { title: "Present Perfect Tense", views: "2.481" },
    { title: "Unit 1A Kelime Listesi", views: "2.218" },
    { title: "Okuma Parçası 1A", views: "1.842" },
    { title: "Grammar Review 1A", views: "1.637" },
    { title: "Dinleme Metni 1A", views: "1.204" }
  ],
  units: ["Unit 1A", "Unit 1B", "Unit 2A", "Unit 2B", "Unit 3A", "Unit 3B"],
  activeDecks: [
    { name: "İngilizce - Temel", cards: "56 kart", pct: 92 },
    { name: "İngilizce - Kelime", cards: "48 kart", pct: 88 },
    { name: "İngilizce - Dilbilgisi", cards: "36 kart", pct: 75 },
    { name: "İngilizce - Fiiller", cards: "28 kart", pct: 68 },
    { name: "İngilizce - Konuşma", cards: "24 kart", pct: 65 }
  ],
  studySeries: [
    { title: "Unit 1A Başlangıç Serisi", desc: "Kelime, grammar, quiz ve mini sınav akışı.", pct: 86 },
    { title: "Grammar Yoğun Tekrar", desc: "Zayıf konular için 7 günlük tekrar planı.", pct: 72 },
    { title: "Okuma Becerisi Kampı", desc: "Paragraf, soru kökü ve strateji çalışmaları.", pct: 64 },
    { title: "Sınav Öncesi Hızlı Seri", desc: "Son hafta kritik konu ve deneme planı.", pct: 91 },
    { title: "Kelime Ezber Rotası", desc: "Flashcard ve quiz destekli günlük liste.", pct: 78 },
    { title: "Dinleme Mini Planı", desc: "Kısa metinler, boşluk ve tekrar döngüsü.", pct: 58 }
  ],
  fillgaps: [
    { title: "Present Perfect Boşlukları", desc: "For/since ve yapı pratiği.", pct: 83 },
    { title: "Dependent Prepositions", desc: "Sık kullanılan edat kalıpları.", pct: 74 },
    { title: "Object Pronouns Practice", desc: "Cümle içinde doğru zamir seçimi.", pct: 88 },
    { title: "Reading Vocabulary Gaps", desc: "Okuma parçalarından kelime pratiği.", pct: 69 },
    { title: "Adjectives & Adverbs", desc: "Karşılaştırma ve zarf kullanımı.", pct: 81 },
    { title: "Listening Transcript Gaps", desc: "Dinleme metni boşluk tamamlama.", pct: 63 }
  ],
  notifications: [
    { icon: "!", title: "Yeni quiz paketi yayında", desc: "Unit 1A kelime quizleri kullanıcılara duyuruldu.", status: "Yayında" },
    { icon: "✦", title: "Haftalık hedef hatırlatması", desc: "Streak devamı için motivasyon bildirimi hazır.", status: "Planlandı" },
    { icon: "◎", title: "Sınav sonucu bildirimi", desc: "Sınav bitince başarı oranı bildirimi gönderilir.", status: "Taslak" }
  ],
  logs: [
    { icon: "✓", title: "Admin giriş yaptı", desc: "Demo oturum açıldı.", status: "Başarılı" },
    { icon: "▣", title: "İçerik yönetimi görüntülendi", desc: "Unit 1A içerikleri listelendi.", status: "Bilgi" },
    { icon: "?", title: "Quiz modalı hazırlandı", desc: "Yeni quiz demo formu açıldı.", status: "Bilgi" },
    { icon: "☑", title: "Sınav listesi render edildi", desc: "6 sınav demo tablosuna işlendi.", status: "Başarılı" }
  ]
};

const realDataState = {
  loaded: false,
  loadingPromise: null,
  source: "Demo fallback"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "number") return new Date(value);
  if (value.seconds) return new Date(value.seconds * 1000);
  return null;
}

function formatDate(value, fallback = "-") {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

function formatDateOnly(value, fallback = "-") {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString("tr-TR", { dateStyle: "medium" });
}

function normalizeUnit(unit) {
  if (!unit) return "Unit";
  const text = String(unit);
  return text.toLocaleLowerCase("tr-TR").startsWith("unit") ? text : `Unit ${text}`;
}

function normalizeStatus(status) {
  const text = String(status || "").toLocaleLowerCase("tr-TR");
  if (text.includes("publish") || text.includes("yay")) return "Yayında";
  if (text.includes("draft") || text.includes("taslak")) return "Taslak";
  if (text.includes("archive") || text.includes("arşiv")) return "Arşivlendi";
  if (text.includes("plan")) return "Planlandı";
  if (text.includes("complete") || text.includes("tamam")) return "Tamamlandı";
  return status ? String(status) : "Yayında";
}

function normalizeCategory(category) {
  const text = String(category || "").toLocaleLowerCase("tr-TR");
  if (text.includes("vocab") || text.includes("word")) return "Kelime";
  if (text.includes("grammar")) return "Dilbilgisi";
  if (text.includes("reading")) return "Okuma";
  if (text.includes("listening")) return "Dinleme";
  if (text.includes("speaking")) return "Konuşma";
  if (text.includes("strategy")) return "Strateji";
  return category || "Genel";
}

function difficultyFromLevel(level) {
  const text = String(level || "").toLocaleLowerCase("tr-TR");
  if (text.includes("starter") || text.includes("easy") || text.includes("beginner")) return "Kolay";
  if (text.includes("pre") || text.includes("inter") || text.includes("medium") || text.includes("elementary")) return "Orta";
  if (text.includes("advanced") || text.includes("hard")) return "Zor";
  return "Orta";
}

function getQuestions(item) {
  if (Array.isArray(item?.questions)) return item.questions;
  if (Array.isArray(item?.quiz)) return item.quiz;
  return [];
}

function countTopicBlocks(topic) {
  if (Array.isArray(topic?.blocks)) return topic.blocks.length;
  if (topic?.summaryHtml) return Math.max(1, String(topic.summaryHtml).split("<div").length - 1);
  return 0;
}

function extractFlashcardsFromTopics(topics) {
  const rows = [];
  topics.forEach((topic) => {
    (topic.blocks || []).forEach((block) => {
      if (block?.type !== "flashcards") return;
      const cards = block.data?.cards || [];
      cards.forEach((card, index) => {
        rows.push({
          title: card.front || `${topic.title} Kart ${index + 1}`,
          category: normalizeCategory(topic.category),
          deck: topic.title || "Genel Deste",
          difficulty: difficultyFromLevel(topic.level || topic.difficulty),
          date: formatDateOnly(topic.updatedAt || topic.createdAt, "Kaynak seed"),
          status: normalizeStatus(topic.status || "published")
        });
      });
    });
  });
  return rows;
}

function summarizeDecks(flashcards) {
  const groups = new Map();
  flashcards.forEach((card) => {
    const current = groups.get(card.deck) || { name: card.deck, count: 0 };
    current.count += 1;
    groups.set(card.deck, current);
  });
  const max = Math.max(1, ...Array.from(groups.values()).map((item) => item.count));
  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((item) => ({ name: item.name, cards: `${item.count} kart`, pct: Math.max(12, Math.round((item.count / max) * 100)) }));
}

function countBy(list, getter) {
  return list.reduce((acc, item) => {
    const key = getter(item) || "Bilinmeyen";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function distributionRows(counts, palette) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => [label, String(value), palette[index % palette.length]]);
}

function buildUsersFromVisits(visits) {
  return visits.slice(0, 40).map((visit, index) => {
    const date = toDate(visit.createdAt || visit.clientCreatedAt);
    const isActive = date ? Date.now() - date.getTime() < 1000 * 60 * 60 * 24 * 14 : index < 5;
    const visitor = visit.deviceModel || visit.automaticDeviceModel || visit.os || `Ziyaretçi ${index + 1}`;
    return {
      name: visitor,
      email: visit.visitorId ? `${String(visit.visitorId).slice(0, 10)}@visitor.local` : "ziyaretci@local",
      role: "Öğrenci",
      date: formatDate(visit.createdAt || visit.clientCreatedAt, "-"),
      status: isActive ? "Aktif" : "Pasif"
    };
  });
}

function progressCounts(progress, topics, quizzes, exams) {
  const studyCompleted = progress?.studyCompleted || {};
  const quizAttempts = progress?.quizAttempts || {};
  const examAttempts = Array.isArray(progress?.examAttempts) ? progress.examAttempts : [];
  const memoryStats = progress?.memoryStats || {};
  const studyDone = Object.values(studyCompleted).filter(Boolean).length;
  const quizDone = Object.keys(quizAttempts).length;
  const bestExam = examAttempts.reduce((max, item) => Math.max(max, Number(item.score || item.percent || 0)), 0);
  const avgQuiz = Object.values(quizAttempts).reduce((sum, item) => sum + Number(item.bestScore || item.lastScore || 0), 0);
  return {
    studyDone,
    quizDone,
    bestExam,
    avgQuiz: quizDone ? Math.round(avgQuiz / quizDone) : 0,
    examAttempts: examAttempts.length,
    memoryKnown: Object.values(memoryStats).filter((item) => Number(item?.correct || 0) > 0).length,
    studyRate: topics.length ? Math.round((studyDone / topics.length) * 100) : 0,
    quizRate: quizzes.length ? Math.round((quizDone / quizzes.length) * 100) : 0,
    examRate: exams.length ? Math.round((examAttempts.length / exams.length) * 100) : 0
  };
}

function buildAdminData({ topics, quizzes, exams, visits = [], progress = null, fillgaps = [], source = "Yerel seed" }) {
  const safeTopics = (topics?.length ? topics : clone(DEFAULT_TOPICS)).sort((a, b) => (a.order || 0) - (b.order || 0));
  const safeQuizzes = (quizzes?.length ? quizzes : clone(DEFAULT_QUIZZES)).sort((a, b) => (a.order || 0) - (b.order || 0));
  const safeExams = (exams?.length ? exams : clone(DEFAULT_EXAMS)).sort((a, b) => (a.order || 0) - (b.order || 0));
  const counts = progressCounts(progress, safeTopics, safeQuizzes, safeExams);
  const flashcards = extractFlashcardsFromTopics(safeTopics);
  const users = buildUsersFromVisits(visits);
  const topicQuestionCount = safeTopics.reduce((sum, topic) => sum + getQuestions(topic).length, 0);
  const quizQuestionCount = safeQuizzes.reduce((sum, quiz) => sum + getQuestions(quiz).length, 0);
  const totalQuestions = topicQuestionCount + quizQuestionCount;
  const unitCounts = countBy(safeTopics, (topic) => normalizeUnit(topic.unit || topic.unitBadge));
  const categoryCounts = countBy(safeTopics, (topic) => normalizeCategory(topic.category));
  const quizCategoryCounts = countBy(safeQuizzes, (quiz) => normalizeCategory(quiz.category || safeTopics.find((topic) => topic.id === quiz.topicId)?.category));
  const examStatusCounts = countBy(safeExams, (exam) => normalizeStatus(exam.status || "published"));
  const cardCategoryCounts = countBy(flashcards, (card) => card.category);
  const activeUsers = users.filter((user) => user.status === "Aktif").length;
  const newThisMonth = visits.filter((visit) => {
    const date = toDate(visit.createdAt || visit.clientCreatedAt);
    const now = new Date();
    return date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;

  return {
    meta: { source, loadedAt: new Date().toISOString() },
    raw: { topics: safeTopics, quizzes: safeQuizzes, exams: safeExams, visits, progress, fillgaps },
    users,
    content: safeTopics.map((topic) => ({
      title: topic.title || topic.name || topic.id,
      type: normalizeCategory(topic.category),
      date: formatDateOnly(topic.updatedAt || topic.createdAt, "Kaynak seed"),
      status: normalizeStatus(topic.status || "published"),
      unit: normalizeUnit(topic.unit || topic.unitBadge),
      blocks: countTopicBlocks(topic)
    })),
    quizzes: safeQuizzes.map((quiz) => ({
      title: quiz.title || quiz.name || quiz.id,
      category: normalizeCategory(quiz.category || safeTopics.find((topic) => topic.id === quiz.topicId)?.category),
      questions: `${getQuestions(quiz).length} soru`,
      difficulty: difficultyFromLevel(quiz.level || quiz.difficulty || safeTopics.find((topic) => topic.id === quiz.topicId)?.level),
      date: formatDateOnly(quiz.updatedAt || quiz.createdAt, "Kaynak seed"),
      status: normalizeStatus(quiz.status || "published")
    })),
    exams: safeExams.map((exam) => ({
      title: exam.title || exam.name || exam.id,
      desc: exam.description || `${exam.questionCount || getQuestions(exam).length || 0} soruluk gerçek sınav kaydı`,
      type: exam.type === "mini" ? "Mini" : exam.type === "mid" ? "Orta" : exam.type === "full" ? "Genel" : (exam.type || "Genel"),
      duration: `${exam.durationMinutes || exam.duration || 0} dk`,
      date: formatDate(exam.publishedAt || exam.updatedAt || exam.createdAt, "Plan yok"),
      participants: visits.length,
      status: normalizeStatus(exam.status || "published")
    })),
    flashcards,
    popularContents: safeTopics.slice(0, 5).map((topic) => ({
      title: topic.title || topic.id,
      views: `${visits.filter((visit) => String(visit.pagePath || "").includes(topic.slug || topic.id)).length} görüntüleme`
    })),
    units: Object.keys(unitCounts),
    activeDecks: summarizeDecks(flashcards),
    studySeries: Object.entries(unitCounts).map(([unit, count]) => ({
      title: `${unit} Çalışma Serisi`,
      desc: `${count} gerçek konu, quiz ve tekrar akışı.`,
      pct: counts.studyRate || Math.min(100, Math.max(18, count * 12))
    })),
    fillgaps: (fillgaps || []).map((item) => ({
      title: item.title || item.name || item.id || "Boşluk doldurma",
      desc: item.description || `${(item.items || item.questions || []).length} gerçek boşluk`,
      pct: Number(item.completionRate || item.pct || 0) || 0
    })),
    notifications: [
      { icon: "✓", title: "Gerçek veri kaynağı bağlandı", desc: `${source} üzerinden admin verileri üretildi.`, status: "Başarılı" },
      { icon: "▣", title: "İçerik sayımı güncellendi", desc: `${safeTopics.length} konu, ${safeQuizzes.length} quiz, ${safeExams.length} sınav okundu.`, status: "Bilgi" },
      { icon: "◎", title: "Ziyaret kayıtları işlendi", desc: `${visits.length} gerçek ziyaret kaydı kullanıcı paneline aktarıldı.`, status: visits.length ? "Yayında" : "Taslak" }
    ],
    logs: [
      { icon: "↻", title: "Veri senkronizasyonu", desc: `${source} okundu.`, status: "Başarılı" },
      { icon: "◎", title: "Kullanıcılar eşlendi", desc: `${users.length} ziyaretçi kaydı tabloya dönüştürüldü.`, status: "Bilgi" },
      { icon: "▤", title: "Flashcard çıkarımı", desc: `${flashcards.length} kart topic bloklarından üretildi.`, status: "Bilgi" },
      { icon: "?", title: "Soru havuzu sayıldı", desc: `${totalQuestions} soru gerçek quiz/topic yapısından hesaplandı.`, status: "Başarılı" }
    ],
    overviewStats: [
      { icon: "◎", value: String(users.length), label: "Toplam Kullanıcı", growth: visits.length ? "user_visits" : "Kayıt yok" },
      { icon: "▣", value: String(safeTopics.length), label: "Toplam İçerik", growth: source },
      { icon: "?", value: String(safeQuizzes.length), label: "Toplam Quiz", growth: `${totalQuestions} soru` },
      { icon: "☑", value: String(safeExams.length), label: "Toplam Sınav", growth: `${counts.examAttempts} deneme` },
      { icon: "▤", value: String(flashcards.length), label: "Ezber Kartı", growth: "Topic bloklarından" }
    ],
    userStats: [
      { icon: "◎", value: String(users.length), label: "Toplam Kullanıcı", growth: "Ziyaret kayıtları" },
      { icon: "✓", value: String(activeUsers), label: "Aktif Kullanıcı", growth: "Son 14 gün" },
      { icon: "+", value: String(newThisMonth), label: "Yeni Bu Ay", growth: "user_visits" },
      { icon: "–", value: String(Math.max(0, users.length - activeUsers)), label: "Pasif Kullanıcı", growth: "Tahmini" }
    ],
    contentStats: [
      { icon: "▣", value: String(safeTopics.length), label: "Toplam İçerik", growth: `${Object.keys(unitCounts).length} ünite` },
      { icon: "U", value: String(Object.keys(unitCounts).length), label: "Ünite", growth: "Gerçek konu" },
      { icon: "K", value: String(safeTopics.length), label: "Konu", growth: `${safeTopics.reduce((sum, topic) => sum + countTopicBlocks(topic), 0)} blok` },
      { icon: "R", value: String(safeTopics.reduce((sum, topic) => sum + (topic.sourceRefs?.length || 0), 0)), label: "Kaynak", growth: "sourceRefs" }
    ],
    quizStats: [
      { icon: "?", value: String(safeQuizzes.length), label: "Toplam Quiz", growth: source },
      { icon: "Q", value: String(quizQuestionCount), label: "Toplam Soru", growth: "Quiz soruları" },
      { icon: "↗", value: `${Object.keys(quizCategoryCounts).length}`, label: "Kategori", growth: "Gerçek dağılım" },
      { icon: "%", value: `${counts.avgQuiz}%`, label: "Ortalama Başarı", growth: progress ? "progress/ravza" : "Veri yok" }
    ],
    examStats: [
      { icon: "☑", value: String(safeExams.length), label: "Toplam Sınav", growth: source },
      { icon: "✎", value: String(counts.examAttempts), label: "Yapılan Sınav", growth: "progress/ravza" },
      { icon: "✓", value: String(examStatusCounts.Tamamlandı || 0), label: "Tamamlanan", growth: "Sınav durumu" },
      { icon: "%", value: `${counts.bestExam}%`, label: "En İyi Puan", growth: "Gerçek deneme" }
    ],
    flashcardStats: [
      { icon: "▤", value: String(flashcards.length), label: "Toplam Kart", growth: "Topic blokları" },
      { icon: "◇", value: String(new Set(flashcards.map((card) => card.deck)).size), label: "Toplam Deste", growth: "Gerçek deste" },
      { icon: "✓", value: String(flashcards.filter((card) => card.status === "Yayında").length), label: "Aktif Kart", growth: "Yayında" },
      { icon: "%", value: `${counts.memoryKnown}%`, label: "Bilinen Kart", growth: progress ? "memoryStats" : "Veri yok" }
    ],
    reportStats: [
      { icon: "↗", value: String(visits.length), label: "Toplam Giriş", growth: "user_visits" },
      { icon: "%", value: `${counts.avgQuiz || counts.bestExam}%`, label: "Ortalama Başarı", growth: progress ? "progress" : "Veri yok" },
      { icon: "◷", value: `${safeTopics.reduce((sum, topic) => sum + Number(topic.estimatedMinutes || topic.time || 0), 0)} dk`, label: "Toplam Çalışma Süresi", growth: "Tahmini içerik" },
      { icon: "?", value: String(counts.quizDone), label: "Tamamlanan Quiz", growth: "progress/ravza" }
    ],
    contentDistribution: distributionRows(categoryCounts, ["#ff4f93", "#9d5cff", "#f59e0b", "#38bdf8", "#27d39b"]),
    examDistribution: distributionRows(examStatusCounts, ["#27d39b", "#38bdf8", "#f59e0b", "#8d7a85"]),
    cardDistribution: distributionRows(cardCategoryCounts, ["#ff4f93", "#9d5cff", "#f59e0b", "#38bdf8", "#27d39b"]),
    successLegend: [
      ["Çalışma", `${counts.studyRate}%`, "#27d39b"],
      ["Quiz", `${counts.quizRate}%`, "#ff4f93"],
      ["Sınav", `${counts.examRate}%`, "#f59e0b"],
      ["Ezber", `${counts.memoryKnown}%`, "#38bdf8"]
    ],
    topicBars: Object.entries(categoryCounts).slice(0, 5).map(([label, value]) => [label, Math.min(100, Math.max(18, value * 12))]),
    streakBars: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((day, index) => [day, progress?.studyStreak?.week?.[index] ? 92 : Math.max(18, 42 + index * 6)]),
    topQuizList: safeQuizzes.slice(0, 5).map((quiz) => ({ title: quiz.title || quiz.id, views: `${getQuestions(quiz).length} soru` })),
    upcomingExams: safeExams.slice(0, 3).map((exam, index) => [exam.title || exam.id, exam.publishedAt ? formatDate(exam.publishedAt) : `${index + 1} kayıt`])
  };
}

async function getCollectionData(name, options = {}) {
  try {
    const ref = options.orderBy
      ? query(collection(db, name), orderBy(options.orderBy, options.direction || "desc"), limit(options.limit || 250))
      : query(collection(db, name), limit(options.limit || 250));
    const snap = await getDocs(ref);
    return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    console.warn(`Admin veri kaynağı okunamadı: ${name}`, error);
    return [];
  }
}

async function getDocumentData(collectionName, docId) {
  try {
    const snap = await getDoc(doc(db, collectionName, docId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn(`Admin belge kaynağı okunamadı: ${collectionName}/${docId}`, error);
    return null;
  }
}

async function loadRealAdminData({ notify = false } = {}) {
  if (realDataState.loaded) {
    if (notify) showToast(`Gerçek veriler hazır: ${realDataState.source}`, "success");
    return Promise.resolve();
  }
  if (realDataState.loadingPromise) return realDataState.loadingPromise;
  realDataState.loadingPromise = (async () => {
    const localData = buildAdminData({
      topics: clone(DEFAULT_TOPICS),
      quizzes: clone(DEFAULT_QUIZZES),
      exams: clone(DEFAULT_EXAMS),
      source: "content-defaults.js"
    });
    Object.assign(data, localData);
    renderAll();

    const [
      publishedTopics,
      draftTopics,
      legacyPages,
      publishedQuizzes,
      draftQuizzes,
      legacyQuizzes,
      publishedExams,
      draftExams,
      visits,
      progress,
      fillGapA,
      fillGapB
    ] = await Promise.all([
      getCollectionData("portal_topics_published"),
      getCollectionData("portal_topics_draft"),
      getCollectionData("pages"),
      getCollectionData("portal_quizzes_published"),
      getCollectionData("portal_quizzes_draft"),
      getCollectionData("quizzes"),
      getCollectionData("portal_exams_published"),
      getCollectionData("portal_exams_draft"),
      getCollectionData("user_visits", { orderBy: "createdAt", direction: "desc", limit: 250 }),
      getDocumentData("progress", "ravza"),
      getCollectionData("fill_gap_exercises"),
      getCollectionData("fillgaps")
    ]);

    const topics = publishedTopics.length ? publishedTopics : (draftTopics.length ? draftTopics : (legacyPages.length ? legacyPages : clone(DEFAULT_TOPICS)));
    const quizzes = publishedQuizzes.length ? publishedQuizzes : (draftQuizzes.length ? draftQuizzes : (legacyQuizzes.length ? legacyQuizzes : clone(DEFAULT_QUIZZES)));
    const exams = publishedExams.length ? publishedExams : (draftExams.length ? draftExams : clone(DEFAULT_EXAMS));
    const fillgaps = fillGapA.length ? fillGapA : fillGapB;
    const source = publishedTopics.length || publishedQuizzes.length || publishedExams.length
      ? "Firestore published"
      : draftTopics.length || draftQuizzes.length || draftExams.length
        ? "Firestore draft"
        : legacyPages.length || legacyQuizzes.length || visits.length || progress
          ? "Firestore legacy/progress"
          : "content-defaults.js";

    Object.assign(data, buildAdminData({ topics, quizzes, exams, visits, progress, fillgaps, source }));
    realDataState.loaded = true;
    realDataState.source = source;
    renderAll();
    if (notify) showToast(`Gerçek veriler eşlendi: ${source}`, "success");
  })().catch((error) => {
    console.error(error);
    showToast("Gerçek veri okunamadı; yerel seed ile devam ediliyor.", "error");
  }).finally(() => {
    realDataState.loadingPromise = null;
  });
  return realDataState.loadingPromise;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function includesText(value, query) {
  return String(value ?? "").toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"));
}

function getInitials(name) {
  return String(name || "A")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR");
}

function badgeClass(value) {
  const text = String(value || "").toLocaleLowerCase("tr-TR");
  if (["yayında", "aktif", "tamamlandı", "yayınlandı", "başarılı", "kolay"].some((item) => text.includes(item))) return "green";
  if (["planlandı", "orta", "bilgi"].some((item) => text.includes(item))) return "orange";
  if (["taslak", "pasif", "arşivlendi"].some((item) => text.includes(item))) return "gray";
  if (["zor", "sil"].some((item) => text.includes(item))) return "red";
  if (["dilbilgisi", "genel", "konu"].some((item) => text.includes(item))) return "purple";
  if (["kelime", "konuşma"].some((item) => text.includes(item))) return "pink";
  if (["okuma"].some((item) => text.includes(item))) return "orange";
  if (["dinleme"].some((item) => text.includes(item))) return "blue";
  return "purple";
}

function badge(value) {
  return `<span class="badge ${badgeClass(value)}">${escapeHtml(value)}</span>`;
}

function actions(label) {
  return `
    <div class="row-actions">
      <button class="icon-action" type="button" data-demo-action="${escapeHtml(label)} görüntülendi" title="Görüntüle" aria-label="Görüntüle">⌕</button>
      <button class="icon-action" type="button" data-demo-action="${escapeHtml(label)} düzenleme demo modu açıldı" title="Düzenle" aria-label="Düzenle">✎</button>
      <button class="icon-action delete" type="button" data-delete="${escapeHtml(label)}" title="Sil" aria-label="Sil">×</button>
    </div>
  `;
}

function renderStats(selector, stats) {
  const target = $(selector);
  if (!target) return;
  target.innerHTML = stats.map((stat) => `
    <article class="stat-card">
      <span class="stat-icon">${escapeHtml(stat.icon)}</span>
      <div>
        <strong>${escapeHtml(stat.value)}</strong>
        <small>${escapeHtml(stat.label)}</small>
      </div>
      <em>${escapeHtml(stat.growth)}</em>
      <i class="spark" aria-hidden="true"></i>
    </article>
  `).join("");
}

function renderOverview() {
  renderStats("#overviewStats", data.overviewStats);
  $("#recentUsers").innerHTML = data.users.slice(0, 5).map((user) => `
    <div class="compact-item">
      <span class="compact-avatar">${escapeHtml(getInitials(user.name))}</span>
      <span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)} · ${escapeHtml(user.date)}</small></span>
      <i class="status-dot ${user.status === "Pasif" ? "passive" : ""}"></i>
    </div>
  `).join("") || `<div class="empty-state">Henüz gerçek kullanıcı/ziyaret kaydı yok.</div>`;

  renderLegend("#contentDistribution", data.contentDistribution || []);
  renderRankList("#popularContents", data.popularContents || []);
  const summary = data.systemSummary || [
    ["Toplam Giriş", data.reportStats?.[0]?.value || "0"],
    ["Ortalama Başarı Oranı", data.reportStats?.[1]?.value || "0%"],
    ["Toplam Çalışma Süresi", data.reportStats?.[2]?.value || "0 dk"],
    ["Aktif Kullanıcı", data.userStats?.[1]?.value || "0"]
  ];
  $("#systemSummary").innerHTML = summary.map(([label, value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderLegend(selector, rows) {
  const target = $(selector);
  if (!target) return;
  target.innerHTML = rows.map(([label, value, color]) => `
    <div class="legend-item" style="--legend-color:${color}">
      <i class="legend-color"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function renderRankList(selector, rows) {
  const target = $(selector);
  if (!target) return;
  target.innerHTML = rows.map((item, index) => `
    <div class="rank-item">
      <span class="rank-number">${index + 1}</span>
      <span><strong>${escapeHtml(item.title)}</strong><small>Popüler içerik</small></span>
      <span class="eye-count">⌕ ${escapeHtml(item.views)}</span>
    </div>
  `).join("");
}

function renderUsers() {
  const query = $("#userSearch")?.value.trim() || "";
  const role = $("#userRoleFilter")?.value || "";
  const status = $("#userStatusFilter")?.value || "";
  const rows = data.users.filter((user) => {
    const matchesSearch = !query || includesText(`${user.name} ${user.email}`, query);
    const matchesRole = !role || user.role === role;
    const matchesStatus = !status || user.status === status;
    return matchesSearch && matchesRole && matchesStatus;
  });

  renderStats("#userStats", data.userStats || []);

  $("#usersTable").innerHTML = rows.map((user) => `
    <tr>
      <td><div class="table-user"><span class="table-avatar">${escapeHtml(getInitials(user.name))}</span><strong>${escapeHtml(user.name)}</strong></div></td>
      <td>${escapeHtml(user.email)}</td>
      <td>${badge(user.role)}</td>
      <td>${escapeHtml(user.date)}</td>
      <td>${badge(user.status)}</td>
      <td>${actions(user.name)}</td>
    </tr>
  `).join("") || emptyRow(6);
}

function renderContent() {
  renderStats("#contentStats", data.contentStats || []);

  $("#unitList").innerHTML = (data.units || []).map((unit, index) => `
    <button class="unit-item ${index === 0 ? "active" : ""}" type="button" data-demo-action="${unit} seçildi">
      <strong>${escapeHtml(unit)}</strong><span>${index === 0 ? "Aktif" : "Seç"}</span>
    </button>
  `).join("") || `<div class="empty-state">Gerçek ünite kaydı bulunamadı.</div>`;

  $("#contentTable").innerHTML = (data.content || []).map((item) => `
    <tr>
      <td><div class="table-title"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.unit || "")}${item.blocks ? ` · ${item.blocks} blok` : ""}</small></div></td>
      <td>${badge(item.type)}</td>
      <td>${escapeHtml(item.date)}</td>
      <td>${badge(item.status)}</td>
      <td>${actions(item.title)}</td>
    </tr>
  `).join("") || emptyRow(5);
}

function renderQuiz() {
  const query = $("#quizSearch")?.value.trim() || "";
  const category = $("#quizCategoryFilter")?.value || "";
  const difficulty = $("#quizDifficultyFilter")?.value || "";
  const status = $("#quizStatusFilter")?.value || "";
  const rows = data.quizzes.filter((quiz) => {
    return (!query || includesText(quiz.title, query))
      && (!category || quiz.category === category)
      && (!difficulty || quiz.difficulty === difficulty)
      && (!status || quiz.status === status);
  });

  renderStats("#quizStats", data.quizStats || []);

  $("#quizTable").innerHTML = rows.map((quiz) => `
    <tr>
      <td><strong>${escapeHtml(quiz.title)}</strong></td>
      <td>${badge(quiz.category)}</td>
      <td>${escapeHtml(quiz.questions)}</td>
      <td>${badge(quiz.difficulty)}</td>
      <td>${escapeHtml(quiz.date)}</td>
      <td>${badge(quiz.status)}</td>
      <td>${actions(quiz.title)}</td>
    </tr>
  `).join("") || emptyRow(7);
}

function renderExams() {
  const query = $("#examSearch")?.value.trim() || "";
  const type = $("#examTypeFilter")?.value || "";
  const status = $("#examStatusFilter")?.value || "";
  const rows = data.exams.filter((exam) => {
    return (!query || includesText(`${exam.title} ${exam.desc}`, query))
      && (!type || exam.type === type)
      && (!status || exam.status === status);
  });

  renderStats("#examStats", data.examStats || []);

  $("#examTable").innerHTML = rows.map((exam) => `
    <tr>
      <td><div class="table-title"><strong>${escapeHtml(exam.title)}</strong><small>${escapeHtml(exam.desc)}</small></div></td>
      <td>${badge(exam.type)}</td>
      <td>${escapeHtml(exam.duration)}</td>
      <td>${escapeHtml(exam.date)}</td>
      <td>${escapeHtml(exam.participants)}</td>
      <td>${badge(exam.status)}</td>
      <td>${actions(exam.title)}</td>
    </tr>
  `).join("") || emptyRow(7);

  $("#upcomingExams").innerHTML = (data.upcomingExams || []).map(([title, remaining]) => `
    <div class="compact-item">
      <span class="compact-avatar">☑</span>
      <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(remaining)}</small></span>
      <i class="status-dot"></i>
    </div>
  `).join("") || `<div class="empty-state">Yaklaşan gerçek sınav kaydı yok.</div>`;

  renderLegend("#examDistribution", data.examDistribution || []);
}

function renderFlashcards() {
  const query = $("#cardSearch")?.value.trim() || "";
  const category = $("#cardCategoryFilter")?.value || "";
  const difficulty = $("#cardDifficultyFilter")?.value || "";
  const status = $("#cardStatusFilter")?.value || "";
  const rows = data.flashcards.filter((card) => {
    return (!query || includesText(card.title, query))
      && (!category || card.category === category)
      && (!difficulty || card.difficulty === difficulty)
      && (!status || card.status === status);
  });

  renderStats("#flashcardStats", data.flashcardStats || []);

  $("#flashcardTable").innerHTML = rows.map((card) => `
    <tr>
      <td><strong>${escapeHtml(card.title)}</strong></td>
      <td>${badge(card.category)}</td>
      <td>${escapeHtml(card.deck)}</td>
      <td>${badge(card.difficulty)}</td>
      <td>${escapeHtml(card.date)}</td>
      <td>${badge(card.status)}</td>
      <td>${actions(card.title)}</td>
    </tr>
  `).join("") || emptyRow(7);

  $("#activeDecks").innerHTML = (data.activeDecks || []).map((deck) => `
    <div class="deck-item">
      <div class="deck-row"><strong>${escapeHtml(deck.name)}</strong><small>${escapeHtml(deck.cards)} / %${deck.pct}</small></div>
      <div class="deck-progress"><i style="width:${deck.pct}%"></i></div>
    </div>
  `).join("") || `<div class="empty-state">Gerçek flashcard destesi bulunamadı.</div>`;

  renderLegend("#cardDistribution", data.cardDistribution || []);
}

function renderReports() {
  renderStats("#reportStats", data.reportStats || []);
  renderLegend("#successLegend", data.successLegend || []);

  $("#topicBars").innerHTML = (data.topicBars || []).map(([label, pct]) => `
    <div class="bar-item">
      <div class="bar-meta"><span>${escapeHtml(label)}</span><strong>%${pct}</strong></div>
      <div class="bar-track"><i style="width:${pct}%"></i></div>
    </div>
  `).join("") || `<div class="empty-state">Konu performansı için gerçek kayıt yok.</div>`;

  $("#streakBars").innerHTML = (data.streakBars || []).map(([day, pct]) => `<div class="streak-day"><i style="height:${pct}%"></i><span>${escapeHtml(day)}</span></div>`).join("");
  renderRankList("#topQuizList", data.topQuizList || []);
}

function renderCards(selector, rows) {
  const target = $(selector);
  if (!target) return;
  target.innerHTML = (rows || []).map((item) => `
    <article class="series-card">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.desc)}</p>
      <div class="progress-block">
        <div><span>İlerleme</span><strong>%${item.pct}</strong></div>
        <i><b style="width:${item.pct}%"></b></i>
      </div>
    </article>
  `).join("") || `<div class="empty-state">Bu bölüm için gerçek kayıt bulunamadı.</div>`;
}

function renderNotifications() {
  $("#notificationList").innerHTML = data.notifications.map((item) => `
    <div class="notification-item">
      <span class="notification-icon">${escapeHtml(item.icon)}</span>
      <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.desc)}</small></span>
      ${badge(item.status)}
    </div>
  `).join("");
}

function renderLogs() {
  $("#activityLogs").innerHTML = data.logs.map((item) => `
    <div class="log-item">
      <span class="log-icon">${escapeHtml(item.icon)}</span>
      <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.desc)}</small></span>
      ${badge(item.status)}
    </div>
  `).join("");
}

function emptyRow(columns) {
  return `<tr><td colspan="${columns}" class="empty-state">Sonuç bulunamadı.</td></tr>`;
}

function openMobileMenu() {
  $("#adminApp")?.classList.add("sidebar-open");
  $("#mobileMenuButton")?.setAttribute("aria-expanded", "true");
  document.body.classList.add("admin-no-scroll");
}

function closeMobileMenu() {
  $("#adminApp")?.classList.remove("sidebar-open");
  $("#mobileMenuButton")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("admin-no-scroll");
}

function activatePage(pageId, pushHash = true) {
  $$(".admin-nav-item").forEach((button) => button.classList.toggle("active", button.dataset.page === pageId));
  $$(".admin-section").forEach((section) => section.classList.toggle("active", section.dataset.page === pageId));
  closeMobileMenu();
  $("#globalSearch").value = "";
  clearGlobalSearch();
  if (pushHash) history.replaceState(null, "", `#${pageId}`);
}

function applyGlobalSearch() {
  const query = $("#globalSearch")?.value.trim() || "";
  const active = $(".admin-section.active");
  if (!active) return;
  const candidates = $$("tbody tr, .rank-item, .compact-item, .summary-item, .series-card, .theme-card, .notification-item, .log-item, .deck-item, .legend-item", active);
  candidates.forEach((node) => {
    const visible = !query || includesText(node.textContent, query);
    node.classList.toggle("is-hidden-by-search", !visible);
  });
}

function clearGlobalSearch() {
  $$(".is-hidden-by-search").forEach((node) => node.classList.remove("is-hidden-by-search"));
}

const modalConfig = {
  user: {
    kicker: "Kullanıcı",
    title: "Yeni Kullanıcı",
    fields: [
      ["Ad Soyad", "text", "Ravza Y."],
      ["E-posta", "email", "ravza@example.com"],
      ["Rol", "select", "Öğrenci", ["Öğrenci", "Yönetici"]],
      ["Durum", "select", "Aktif", ["Aktif", "Pasif"]]
    ]
  },
  quiz: {
    kicker: "Quiz",
    title: "Yeni Quiz",
    fields: [
      ["Quiz Başlığı", "text", "Unit 1A - Kelime Quiz"],
      ["Kategori", "select", "Kelime", ["Kelime", "Dilbilgisi", "Okuma"]],
      ["Zorluk", "select", "Orta", ["Kolay", "Orta", "Zor"]],
      ["Soru Sayısı", "number", "20"]
    ]
  },
  exam: {
    kicker: "Sınav",
    title: "Yeni Sınav",
    fields: [
      ["Sınav Adı", "text", "1A Genel Tekrar Sınavı"],
      ["Tür", "select", "Genel", ["Genel", "Kelime", "Konu", "Okuma", "Dinleme", "Dilbilgisi"]],
      ["Süre", "text", "90 dk"],
      ["Tarih", "datetime-local", ""]
    ]
  },
  card: {
    kicker: "Ezber Kartı",
    title: "Yeni Kart",
    fields: [
      ["Kart Başlığı", "text", "Present Perfect Kelimeleri"],
      ["Kategori", "select", "Kelime", ["Kelime", "Dilbilgisi", "Genel", "Konuşma", "Okuma"]],
      ["Deste", "text", "İngilizce - Temel"],
      ["Zorluk", "select", "Orta", ["Kolay", "Orta", "Zor"]]
    ]
  },
  content: {
    kicker: "İçerik",
    title: "Yeni İçerik",
    fields: [
      ["Konu Başlığı", "text", "Yeni Konu"],
      ["Tür", "select", "Kelime", ["Kelime", "Dilbilgisi", "Strateji", "Okuma", "Dinleme"]],
      ["Ünite", "select", "Unit 1A", data.units],
      ["Durum", "select", "Yayında", ["Yayında", "Taslak"]]
    ]
  },
  series: {
    kicker: "Çalışma Serisi",
    title: "Yeni Seri",
    fields: [
      ["Seri Adı", "text", "Yeni Çalışma Serisi"],
      ["Hedef", "text", "7 günlük çalışma planı"],
      ["Durum", "select", "Yayında", ["Yayında", "Taslak"]]
    ]
  },
  fillgap: {
    kicker: "Boşluk Doldurma",
    title: "Yeni Alıştırma",
    fields: [
      ["Alıştırma Başlığı", "text", "Present Perfect Boşlukları"],
      ["Kategori", "select", "Dilbilgisi", ["Kelime", "Dilbilgisi", "Okuma", "Dinleme"]],
      ["Boşluk Sayısı", "number", "12"]
    ]
  },
  notification: {
    kicker: "Bildirim",
    title: "Yeni Bildirim",
    fields: [
      ["Başlık", "text", "Yeni quiz yayında"],
      ["Hedef", "select", "Tüm kullanıcılar", ["Tüm kullanıcılar", "Aktif kullanıcılar", "Pasif kullanıcılar"]],
      ["Mesaj", "textarea", "Bugünkü çalışma hedefin hazır."]
    ]
  }
};

function openModal(type) {
  const config = modalConfig[type] || modalConfig.content;
  $("#modalKicker").textContent = config.kicker;
  $("#modalTitle").textContent = config.title;
  $("#modalForm").innerHTML = config.fields.map(([label, inputType, value, options]) => {
    if (inputType === "select") {
      return `
        <label>
          <span>${escapeHtml(label)}</span>
          <select>
            ${options.map((option) => `<option ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
        </label>
      `;
    }
    if (inputType === "textarea") {
      return `<label class="full"><span>${escapeHtml(label)}</span><textarea rows="4">${escapeHtml(value)}</textarea></label>`;
    }
    return `<label><span>${escapeHtml(label)}</span><input type="${inputType}" value="${escapeHtml(value)}"></label>`;
  }).join("") + `<button type="submit">Kaydet</button>`;
  $("#modalBackdrop").hidden = false;
  document.body.classList.add("admin-no-scroll");
}

function closeModal() {
  $("#modalBackdrop").hidden = true;
  document.body.classList.remove("admin-no-scroll");
}

function openConfirm(label) {
  $("#confirmText").textContent = `"${label}" kaydını silmek istediğine emin misin?`;
  $("#confirmDelete").dataset.deleteTarget = label;
  $("#confirmBackdrop").hidden = false;
  document.body.classList.add("admin-no-scroll");
}

function closeConfirm() {
  $("#confirmBackdrop").hidden = true;
  document.body.classList.remove("admin-no-scroll");
}

function showToast(message, type = "info") {
  const host = $("#toastHost");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  host.appendChild(toast);
  setTimeout(() => toast.classList.add("out"), 2500);
  setTimeout(() => toast.remove(), 2850);
}

function renderAll() {
  renderOverview();
  renderUsers();
  renderContent();
  renderQuiz();
  renderExams();
  renderFlashcards();
  renderReports();
  renderCards("#studySeriesGrid", data.studySeries);
  renderCards("#fillgapGrid", data.fillgaps);
  renderNotifications();
  renderLogs();
}

function bindEvents() {
  $("#adminLoginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#adminPasswordInput");
    const value = input.value.trim();
    if (value !== ADMIN_PASSWORD) {
      $("#loginMessage").textContent = "Şifre hatalı. Demo şifre: ravza2025";
      $("#loginMessage").classList.add("is-error");
      input.select();
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");
    revealAdmin();
    loadRealAdminData({ notify: true });
    showToast("Admin paneline hoş geldin.", "success");
  });

  $("#adminLogoutBtn")?.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  $$(".admin-nav-item").forEach((button) => {
    button.addEventListener("click", () => activatePage(button.dataset.page));
  });

  $("#mobileMenuButton")?.addEventListener("click", () => {
    if ($("#adminApp").classList.contains("sidebar-open")) closeMobileMenu();
    else openMobileMenu();
  });
  $("#adminBackdrop")?.addEventListener("click", closeMobileMenu);

  $("#globalSearch")?.addEventListener("input", applyGlobalSearch);

  ["userSearch", "userRoleFilter", "userStatusFilter"].forEach((id) => {
    $(`#${id}`)?.addEventListener("input", renderUsers);
    $(`#${id}`)?.addEventListener("change", renderUsers);
  });
  $("#userFilterButton")?.addEventListener("click", renderUsers);

  ["quizSearch", "quizCategoryFilter", "quizDifficultyFilter", "quizStatusFilter"].forEach((id) => {
    $(`#${id}`)?.addEventListener("input", renderQuiz);
    $(`#${id}`)?.addEventListener("change", renderQuiz);
  });

  ["examSearch", "examTypeFilter", "examStatusFilter", "examDateFilter"].forEach((id) => {
    $(`#${id}`)?.addEventListener("input", renderExams);
    $(`#${id}`)?.addEventListener("change", renderExams);
  });

  ["cardSearch", "cardCategoryFilter", "cardDifficultyFilter", "cardStatusFilter"].forEach((id) => {
    $(`#${id}`)?.addEventListener("input", renderFlashcards);
    $(`#${id}`)?.addEventListener("change", renderFlashcards);
  });

  document.addEventListener("click", (event) => {
    const modalButton = event.target.closest("[data-modal]");
    if (modalButton) {
      openModal(modalButton.dataset.modal);
      return;
    }

    const demoButton = event.target.closest("[data-demo-action]");
    if (demoButton) {
      showToast(demoButton.dataset.demoAction || "Demo işlem çalıştı.");
      return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) {
      openConfirm(deleteButton.dataset.delete);
    }
  });

  $("#modalClose")?.addEventListener("click", closeModal);
  $("#modalBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id === "modalBackdrop") closeModal();
  });
  $("#modalForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    closeModal();
    showToast("Demo mod: Değişiklik kaydedildi.", "success");
  });

  $("#confirmCancel")?.addEventListener("click", closeConfirm);
  $("#confirmBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id === "confirmBackdrop") closeConfirm();
  });
  $("#confirmDelete")?.addEventListener("click", () => {
    closeConfirm();
    showToast("Demo mod: Kayıt silindi.", "success");
  });

  $("#settingsForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("Demo mod: Değişiklik kaydedildi.", "success");
  });

  $$(".range-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".range-tabs button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      showToast(`${button.textContent.trim()} filtresi uygulandı.`);
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) closeMobileMenu();
  });
}

function revealAdmin() {
  $("#adminLogin")?.classList.add("hidden");
  $("#adminApp").hidden = false;
  document.body.classList.remove("admin-locked");
  const pageFromHash = location.hash.replace("#", "");
  const firstPage = pageFromHash && $(`.admin-section[data-page="${pageFromHash}"]`) ? pageFromHash : "overview";
  activatePage(firstPage, false);
}

async function init() {
  Object.assign(data, buildAdminData({
    topics: clone(DEFAULT_TOPICS),
    quizzes: clone(DEFAULT_QUIZZES),
    exams: clone(DEFAULT_EXAMS),
    source: "content-defaults.js"
  }));
  renderAll();
  bindEvents();
  const hasSession = sessionStorage.getItem(SESSION_KEY) === "1";
  if (hasSession) {
    revealAdmin();
  }
  await loadRealAdminData({ notify: hasSession });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
