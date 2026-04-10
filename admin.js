// admin.js
import { db } from "./firebase-config.js";
import { doc, getDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

let adminState = { general: {}, dashboard: {stats:[], cards:[]}, nav: [], pages: [], quizzes: {} };
let activePageIndex = null;

// 1. ARAYÜZ OLAYLARI (Tabs)
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.add('active');
    });
});

function setStatus(text, type="normal") {
    const badge = document.getElementById("status-badge");
    badge.innerText = text;
    badge.style.background = type === 'success' ? '#d1fae5' : type === 'error' ? '#fee2e2' : type === 'warning' ? '#fef3c7' : '#e2e8f0';
    badge.style.color = type === 'success' ? '#065f46' : type === 'error' ? '#991b1b' : type === 'warning' ? '#92400e' : '#475569';
}

// 2. VERİ YÜKLEME
async function initAdmin() {
    setStatus("Veriler Çekiliyor...", "warning");
    try {
        const [genSnap, dashSnap, navSnap, pagesSnap, quizSnap] = await Promise.all([
            getDoc(doc(db, "system", "general")),
            getDoc(doc(db, "system", "dashboard")),
            getDoc(doc(db, "system", "navigation")),
            getDocs(collection(db, "pages")),
            getDocs(collection(db, "quizzes"))
        ]);

        if (genSnap.exists()) adminState.general = genSnap.data();
        if (dashSnap.exists()) adminState.dashboard = dashSnap.data();
        if (navSnap.exists()) adminState.nav = navSnap.data().items || [];
        
        adminState.pages = [];
        pagesSnap.forEach(d => adminState.pages.push(d.data()));
        adminState.pages.sort((a,b) => (a.order||0) - (b.order||0));

        adminState.quizzes = {};
        quizSnap.forEach(d => adminState.quizzes[d.id] = d.data().questions || []);

        populateGeneralTab();
        populateDashTab();
        populatePagesList();
        setStatus("Veriler Yüklendi", "success");
        setTimeout(()=>setStatus("Bekliyor"), 3000);
    } catch (e) { console.error(e); setStatus("Yükleme Hatası", "error"); }
}

// 3. FORM DOLDURUCULAR (BINDING)
function populateGeneralTab() {
    const g = adminState.general;
    document.getElementById("g-title").value = g.siteTitle || "";
    document.getElementById("g-subtitle").value = g.siteSubtitle || "";
    document.getElementById("g-badge").value = g.topbarBadge || "";
    document.getElementById("g-footer").value = g.footerText || "";
    document.getElementById("g-heroTitle").value = g.heroTitle || "";
    document.getElementById("g-heroDesc").value = g.heroDesc || "";

    const t = g.themeTokens || {};
    document.getElementById("t-navy").value = t.navy || "#1a2850";
    document.getElementById("t-pink").value = t.pink || "#d4669c";
    document.getElementById("t-pink-bright").value = t["pink-bright"] || "#e879a0";
    document.getElementById("t-bg").value = t.bg || "#f5f4fb";
}

function populateDashTab() {
    const statCont = document.getElementById("stat-list-container");
    statCont.innerHTML = "";
    (adminState.dashboard.stats || []).forEach((s, i) => {
        statCont.innerHTML += `
        <div class="block-item form-grid">
            <button class="btn btn-danger block-actions" onclick="deleteStat(${i})">Sil</button>
            <div class="form-group"><label>Sayı/Değer</label><input type="text" value="${s.value}" onchange="adminState.dashboard.stats[${i}].value=this.value"></div>
            <div class="form-group"><label>Etiket</label><input type="text" value="${s.label}" onchange="adminState.dashboard.stats[${i}].label=this.value"></div>
        </div>`;
    });

    const cardCont = document.getElementById("dashcard-list-container");
    cardCont.innerHTML = "";
    (adminState.dashboard.cards || []).forEach((c, i) => {
        cardCont.innerHTML += `
        <div class="block-item form-grid">
            <button class="btn btn-danger block-actions" onclick="deleteCard(${i})">Sil</button>
            <div class="form-group"><label>Hedef Page ID</label><input type="text" value="${c.pageId}" onchange="adminState.dashboard.cards[${i}].pageId=this.value"></div>
            <div class="form-group"><label>İkon</label><input type="text" value="${c.icon}" onchange="adminState.dashboard.cards[${i}].icon=this.value"></div>
            <div class="form-group"><label>Başlık</label><input type="text" value="${c.title}" onchange="adminState.dashboard.cards[${i}].title=this.value"></div>
            <div class="form-group"><label>Açıklama</label><input type="text" value="${c.desc}" onchange="adminState.dashboard.cards[${i}].desc=this.value"></div>
        </div>`;
    });
}

// Global scope helpers for onclick attributes
window.deleteStat = (i) => { adminState.dashboard.stats.splice(i,1); populateDashTab(); };
window.deleteCard = (i) => { adminState.dashboard.cards.splice(i,1); populateDashTab(); };
document.getElementById("add-stat-btn").onclick = () => { if(!adminState.dashboard.stats) adminState.dashboard.stats=[]; adminState.dashboard.stats.push({value:"0", label:"Yeni"}); populateDashTab(); };
document.getElementById("add-dashcard-btn").onclick = () => { if(!adminState.dashboard.cards) adminState.dashboard.cards=[]; adminState.dashboard.cards.push({pageId:"", icon:"✨", title:"Yeni", desc:""}); populateDashTab(); };

// 4. SAYFA VE BLOK EDİTÖRÜ
function populatePagesList() {
    const list = document.getElementById("pages-list");
    list.innerHTML = "";
    adminState.pages.forEach((p, i) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${p.icon} ${p.title}</span> <span style="font-size:11px; color:#94a3b8">${p.id}</span>`;
        if (i === activePageIndex) li.classList.add("active");
        li.onclick = () => openPageEditor(i);
        list.appendChild(li);
    });
}

function openPageEditor(index) {
    saveCurrentPageEditorToState(); // Switch yapmadan önce aktif sayfayı RAM'e kaydet
    activePageIndex = index;
    populatePagesList();

    const page = adminState.pages[index];
    document.getElementById("p-id").value = page.id || "";
    document.getElementById("p-title").value = page.title || "";
    document.getElementById("p-icon").value = page.icon || "";
    document.getElementById("p-badge").value = page.unitBadge || "";
    document.getElementById("p-desc").value = page.desc || "";

    renderBlocksList(page.blocks || []);
    renderQuizList(adminState.quizzes[page.id] || []);

    document.getElementById("page-editor-panel").style.display = "block";
}

function renderBlocksList(blocks) {
    const cont = document.getElementById("blocks-container");
    cont.innerHTML = "";
    blocks.forEach((b, i) => {
        cont.innerHTML += `
        <div class="block-item q-block" data-index="${i}">
            <button class="btn btn-danger block-actions" onclick="removeBlock(${i})">X</button>
            <select class="b-type" onchange="updateBlockType(${i}, this.value)">
                <option value="paragraph" ${b.type==='paragraph'?'selected':''}>Paragraf</option>
                <option value="heading" ${b.type==='heading'?'selected':''}>Alt Başlık</option>
                <option value="info" ${b.type==='info'?'selected':''}>Bilgi Kutusu</option>
                <option value="warning" ${b.type==='warning'?'selected':''}>Uyarı Kutusu</option>
                <option value="formula" ${b.type==='formula'?'selected':''}>Formül / Kod</option>
                <option value="customHTML" ${b.type==='customHTML'?'selected':''}>Özel HTML (Tablo vb)</option>
            </select>
            <textarea class="form-group b-content" style="width:100%;" rows="3">${b.content}</textarea>
        </div>`;
    });
}

window.removeBlock = (i) => { adminState.pages[activePageIndex].blocks.splice(i,1); renderBlocksList(adminState.pages[activePageIndex].blocks); }
window.updateBlockType = (i, val) => { adminState.pages[activePageIndex].blocks[i].type = val; }
document.getElementById("add-block-btn").onclick = () => {
    if(activePageIndex===null)return;
    if(!adminState.pages[activePageIndex].blocks) adminState.pages[activePageIndex].blocks=[];
    adminState.pages[activePageIndex].blocks.push({type:'paragraph', content:'Yeni içerik...'});
    renderBlocksList(adminState.pages[activePageIndex].blocks);
};

function renderQuizList(qs) {
    const cont = document.getElementById("quiz-container");
    cont.innerHTML = "";
    qs.forEach((q, i) => {
        cont.innerHTML += `
        <div class="block-item q-item" style="background:#f0fdf4; border-color:#86efac;">
            <button class="btn btn-danger block-actions" onclick="removeQuiz(${i})">Sil</button>
            <div class="form-group"><label>Soru Metni</label><input type="text" class="q-q" value="${q.question}"></div>
            <div class="form-grid" style="margin-top:10px;">
                <div class="form-group"><label>A Şıkkı</label><input type="text" class="q-a" value="${q.a}"></div>
                <div class="form-group"><label>B Şıkkı</label><input type="text" class="q-b" value="${q.b}"></div>
                <div class="form-group full"><label>Doğru Cevap</label>
                    <select class="q-c"><option value="a" ${q.correct==='a'?'selected':''}>A Şıkkı</option><option value="b" ${q.correct==='b'?'selected':''}>B Şıkkı</option></select>
                </div>
            </div>
        </div>`;
    });
}

window.removeQuiz = (i) => { const pid = adminState.pages[activePageIndex].id; adminState.quizzes[pid].splice(i,1); renderQuizList(adminState.quizzes[pid]); }
document.getElementById("add-quiz-btn").onclick = () => {
    if(activePageIndex===null)return;
    const pid = adminState.pages[activePageIndex].id;
    if(!adminState.quizzes[pid]) adminState.quizzes[pid]=[];
    adminState.quizzes[pid].push({question:'Soru?', a:'Şık 1', b:'Şık 2', correct:'a'});
    renderQuizList(adminState.quizzes[pid]);
};

// 5. DURUMU RAM'E KAYDETME
function saveCurrentPageEditorToState() {
    if (activePageIndex === null || !adminState.pages[activePageIndex]) return;
    
    const p = adminState.pages[activePageIndex];
    const oldId = p.id;
    p.id = document.getElementById("p-id").value.trim();
    p.title = document.getElementById("p-title").value;
    p.icon = document.getElementById("p-icon").value;
    p.unitBadge = document.getElementById("p-badge").value;
    p.desc = document.getElementById("p-desc").value;

    // Eğer ID değiştiyse Quiz ID'sini de taşı
    if (oldId && oldId !== p.id && adminState.quizzes[oldId]) {
        adminState.quizzes[p.id] = adminState.quizzes[oldId];
        delete adminState.quizzes[oldId];
    }

    // Blokları topla
    const blocks = [];
    document.querySelectorAll('.q-block').forEach(el => {
        blocks.push({ type: el.querySelector('.b-type').value, content: el.querySelector('.b-content').value });
    });
    p.blocks = blocks;

    // Quizleri topla
    const qs = [];
    document.querySelectorAll('.q-item').forEach(el => {
        qs.push({ question: el.querySelector('.q-q').value, a: el.querySelector('.q-a').value, b: el.querySelector('.q-b').value, correct: el.querySelector('.q-c').value });
    });
    adminState.quizzes[p.id] = qs;
}

document.getElementById("add-page-btn").onclick = () => {
    saveCurrentPageEditorToState();
    const newId = "konu_" + Date.now();
    adminState.pages.push({ id: newId, title: "Yeni Konu", icon: "📄", order: adminState.pages.length, blocks: [] });
    openPageEditor(adminState.pages.length - 1);
};

document.getElementById("delete-page-btn").onclick = () => {
    if(activePageIndex !== null && confirm("Sayfayı silmek istediğine emin misin?")) {
        const pid = adminState.pages[activePageIndex].id;
        adminState.pages.splice(activePageIndex, 1);
        delete adminState.quizzes[pid];
        activePageIndex = null;
        document.getElementById("page-editor-panel").style.display = "none";
        populatePagesList();
    }
}

// 6. FIRESTORE'A BATCH YAZMA (TÜM SİSTEMİ KAYDET)
document.getElementById("btn-global-save").onclick = async () => {
    setStatus("Kaydediliyor...", "warning");
    saveCurrentPageEditorToState(); // Aktif ekranı state'e al

    // Genel verileri topla
    adminState.general.siteTitle = document.getElementById("g-title").value;
    adminState.general.siteSubtitle = document.getElementById("g-subtitle").value;
    adminState.general.topbarBadge = document.getElementById("g-badge").value;
    adminState.general.footerText = document.getElementById("g-footer").value;
    adminState.general.heroTitle = document.getElementById("g-heroTitle").value;
    adminState.general.heroDesc = document.getElementById("g-heroDesc").value;
    adminState.general.themeTokens = {
        navy: document.getElementById("t-navy").value,
        pink: document.getElementById("t-pink").value,
        "pink-bright": document.getElementById("t-pink-bright").value,
        bg: document.getElementById("t-bg").value
    };

    // Navigation'ı sayfalardan otomatik oluştur (Sıralamayı korur)
    adminState.nav = adminState.pages.map(p => ({ pageId: p.id, title: p.title, icon: p.icon, visible: true }));

    try {
        const batch = writeBatch(db);

        // System docs
        batch.set(doc(db, "system", "general"), adminState.general);
        batch.set(doc(db, "system", "dashboard"), adminState.dashboard);
        batch.set(doc(db, "system", "navigation"), { items: adminState.nav });

        // Eski pages ve quizzes klasörlerini temizlemek gerçekte bir cloud function gerektirir. 
        // İstemci tarafında üzerine yazarak güncelliyoruz. Silinen sayfalar veritabanında "çöp" kalabilir ancak siteye yansımaz.
        
        // Pages docs
        adminState.pages.forEach(p => {
            batch.set(doc(db, "pages", p.id), p);
        });

        // Quizzes docs
        Object.keys(adminState.quizzes).forEach(quizId => {
            batch.set(doc(db, "quizzes", quizId), { questions: adminState.quizzes[quizId] });
        });

        await batch.commit();
        setStatus("Tüm Değişiklikler Kaydedildi!", "success");
        setTimeout(()=>setStatus("Bekliyor"), 3000);

    } catch(e) {
        console.error(e);
        setStatus("Kayıt Hatası!", "error");
    }
};

// Başlat
document.addEventListener("DOMContentLoaded", initAdmin);