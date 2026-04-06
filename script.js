const ALL_TOPICS = [
  'adjectives','possessives','perfect','perfectcont',
  'conditionals12','conditionals3','modals','ability',
  'phrasal','verbpatterns','causative','passive','reported','auxiliaries'
];
const TOTAL = ALL_TOPICS.length;

function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
  const page = document.getElementById(pageId);
  const btn  = document.getElementById('nav-' + pageId);
  if (page) page.classList.add('active');
  if (btn)  btn.classList.add('active');
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  window.scrollTo(0, 0);
}

function toggleMenu() {
  document.getElementById('sidebar').classList.toggle('open');
}

function searchTopics() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (q.length < 2) return;
  const sections = document.querySelectorAll('.searchable');
  sections.forEach(sec => {
    if (sec.innerText.toLowerCase().includes(q)) { navigate(sec.id); }
  });
}

function markDone(topic) {
  const btn = document.querySelector('#' + topic + ' .mark-complete');
  if (!btn) return;
  const key   = 'eul_done_' + topic;
  const isDone = localStorage.getItem(key) === 'true';
  if (isDone) {
    localStorage.setItem(key, 'false');
    btn.classList.remove('done');
    btn.innerHTML = '✅ Tamamladım';
  } else {
    localStorage.setItem(key, 'true');
    btn.classList.add('done');
    btn.innerHTML = '☑️ Tamamlandı';
  }
  updateProgress();
}

function updateProgress() {
  const count = ALL_TOPICS.filter(t => localStorage.getItem('eul_done_' + t) === 'true').length;
  const pct   = (count / TOTAL) * 100;
  document.getElementById('main-progress').style.width = pct + '%';
  document.getElementById('progress-text').innerText   = count + '/' + TOTAL + ' Konu Tamamlandı';
}

function initProgress() {
  ALL_TOPICS.forEach(topic => {
    if (localStorage.getItem('eul_done_' + topic) === 'true') {
      const btn = document.querySelector('#' + topic + ' .mark-complete');
      if (btn) { btn.classList.add('done'); btn.innerHTML = '☑️ Tamamlandı'; }
    }
  });
  updateProgress();
}

function checkQuiz(quizId) {
  const container = document.getElementById(quizId);
  const questions = container.querySelectorAll('.question');
  let score = 0;

  questions.forEach(q => {
    const labels = q.querySelectorAll('label');
    labels.forEach(l => { l.style.background = ''; l.style.borderColor = ''; });

    const selected = q.querySelector('input[type="radio"]:checked');
    if (!selected) return;

    const lbl = selected.parentElement;
    if (selected.value === 'correct') {
      score++;
      lbl.style.background   = '#d1fae5';
      lbl.style.borderColor  = '#10b981';
    } else {
      lbl.style.background   = '#fee2e2';
      lbl.style.borderColor  = '#ef4444';
      const correct = q.querySelector('input[value="correct"]');
      if (correct) {
        correct.parentElement.style.background  = '#d1fae5';
        correct.parentElement.style.borderColor = '#10b981';
      }
    }
  });

  const res = container.querySelector('.quiz-result');
  res.classList.remove('success', 'error');
  if (score === questions.length) {
    res.innerHTML = '🎉 Mükemmel Ravza! Hepsini doğru yaptın (' + score + '/' + questions.length + ')! 💗';
    res.classList.add('success');
  } else {
    res.innerHTML = 'Biraz daha çalış 💪 Puanın: ' + score + '/' + questions.length + '. Yeşil olanlar doğru cevaplar.';
    res.classList.add('error');
  }
  res.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', initProgress);