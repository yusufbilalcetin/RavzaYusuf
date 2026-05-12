import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export const ADMIN_SECURITY_PATH = {
  collection: "admin_meta",
  docId: "security"
};

const SESSION_KEY = "ravza_admin_session";

export async function hashText(value) {
  const encoded = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hasAdminSession() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

export function setAdminSession() {
  sessionStorage.setItem(SESSION_KEY, "1");
}

export function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getFutureAuthNote() {
  return "Bu koruma sadece ön yüz tabanlıdır. Production aşamasında admin yazma izinlerini Firebase Auth + request.auth ile sınırlandır.";
}

function revealWorkspace(gate, app) {
  gate?.classList.add("hidden");
  app?.classList.remove("hidden");
}

function renderSetupTemplate(note) {
  return `
    <div class="guard-copy">
      <h2>Yönetici şifresi oluştur</h2>
      <p class="helper-copy">Bu çalışma alanı şu anda istemci taraflı bir kapı ile korunuyor. Şimdi bir şifre belirle, sonra Firebase Auth'a geçiş yap.</p>
      <p class="auth-note">${note}</p>
    </div>
    <form class="guard-form" data-mode="setup">
      <label class="guard-field">
        <span>Yeni şifre</span>
        <input type="password" name="passcode" autocomplete="new-password" placeholder="En az 6 karakterli bir şifre" required>
      </label>
      <label class="guard-field">
        <span>Şifre tekrar</span>
        <input type="password" name="confirmPasscode" autocomplete="new-password" placeholder="Aynı şifreyi tekrar yaz" required>
      </label>
      <button class="guard-button" type="submit">Şifreyi kaydet ve paneli aç</button>
      <p class="guard-message" data-auth-message></p>
    </form>
  `;
}

function renderLoginTemplate(note) {
  return `
    <div class="guard-copy">
      <h2>Yönetici girişi</h2>
      <p class="helper-copy">Öğrenci sayfaları yalnızca yayınlanmış içerikleri okur. Taslak çalışmak için aşağıdan şifreni gir.</p>
      <p class="auth-note">${note}</p>
    </div>
    <form class="guard-form" data-mode="login">
      <label class="guard-field">
        <span>Şifre</span>
        <input type="password" name="passcode" autocomplete="current-password" placeholder="Şifreni gir" required>
      </label>
      <button class="guard-button" type="submit">Paneli aç</button>
      <p class="guard-message" data-auth-message></p>
    </form>
  `;
}

export async function ensureAdminAccess({
  db,
  gateId = "authGate",
  appId = "adminApp",
  innerId = "authCardInner"
}) {
  const gate = document.getElementById(gateId);
  const app = document.getElementById(appId);
  const inner = document.getElementById(innerId);

  if (!gate || !app || !inner) {
    return false;
  }

  if (hasAdminSession()) {
    revealWorkspace(gate, app);
    return true;
  }

  const securityRef = doc(db, ADMIN_SECURITY_PATH.collection, ADMIN_SECURITY_PATH.docId);
  const securitySnap = await getDoc(securityRef);
  const security = securitySnap.exists() ? securitySnap.data() : null;
  const note = getFutureAuthNote();

  return new Promise((resolve) => {
    const setMessage = (message, isError = false) => {
      const target = inner.querySelector("[data-auth-message]");
      if (!target) return;
      target.textContent = message;
      target.style.color = isError ? "#c24172" : "#2448ff";
    };

    const mount = () => {
      inner.innerHTML = security?.passcodeHash ? renderLoginTemplate(note) : renderSetupTemplate(note);
      const form = inner.querySelector("form");
      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const passcode = String(formData.get("passcode") || "").trim();

        if (!passcode) {
          setMessage("Şifre boş bırakılamaz.", true);
          return;
        }

        if (form.dataset.mode === "setup") {
          const confirmPasscode = String(formData.get("confirmPasscode") || "").trim();
          if (passcode.length < 6) {
            setMessage("Şifre en az 6 karakter olmalı.", true);
            return;
          }
          if (passcode !== confirmPasscode) {
            setMessage("Şifreler birbiriyle eşleşmiyor.", true);
            return;
          }

          const passcodeHash = await hashText(passcode);
          await setDoc(securityRef, {
            passcodeHash,
            guardVersion: 1,
            note,
            updatedAt: serverTimestamp(),
            createdAt: security?.createdAt || serverTimestamp()
          }, { merge: true });
          setAdminSession();
          revealWorkspace(gate, app);
          resolve(true);
          return;
        }

        const passcodeHash = await hashText(passcode);
        if (passcodeHash !== security?.passcodeHash) {
          setMessage("Şifre hatalı.", true);
          return;
        }

        setAdminSession();
        revealWorkspace(gate, app);
        resolve(true);
      });
    };

    mount();
  });
}