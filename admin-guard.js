<<<<<<< ours
<<<<<<< ours
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

=======
>>>>>>> theirs
=======
>>>>>>> theirs
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

<<<<<<< ours
<<<<<<< ours
export function getFutureAuthNote() {
  return "This guard is front-end only. Move admin access to Firebase Auth and request.auth based Firestore rules before production.";
}

function revealWorkspace(gate, app) {
  gate?.classList.add("hidden");
  app?.classList.remove("hidden");
}

function renderSetupTemplate(note) {
  return `
    <div class="guard-copy">
      <h2>Create admin passcode</h2>
      <p class="helper-copy">This project is currently protected by a front-end draft workspace guard. Set a passcode now, then move to Firebase Auth later.</p>
      <p class="auth-note">${note}</p>
    </div>
    <form class="guard-form" data-mode="setup">
      <label class="guard-field">
        <span>New passcode</span>
        <input type="password" name="passcode" autocomplete="new-password" placeholder="Enter a secure passcode" required>
      </label>
      <label class="guard-field">
        <span>Repeat passcode</span>
        <input type="password" name="confirmPasscode" autocomplete="new-password" placeholder="Repeat passcode" required>
      </label>
      <button class="guard-button" type="submit">Save passcode and open workspace</button>
      <p class="guard-message" data-auth-message></p>
    </form>
  `;
}

function renderLoginTemplate(note) {
  return `
    <div class="guard-copy">
      <h2>Admin sign in</h2>
      <p class="helper-copy">Student pages only read published collections. Sign in to continue working on draft content.</p>
      <p class="auth-note">${note}</p>
    </div>
    <form class="guard-form" data-mode="login">
      <label class="guard-field">
        <span>Passcode</span>
        <input type="password" name="passcode" autocomplete="current-password" placeholder="Enter passcode" required>
      </label>
      <button class="guard-button" type="submit">Open draft workspace</button>
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
          setMessage("Passcode is required.", true);
          return;
        }

        if (form.dataset.mode === "setup") {
          const confirmPasscode = String(formData.get("confirmPasscode") || "").trim();
          if (passcode.length < 6) {
            setMessage("Use at least 6 characters for the admin passcode.", true);
            return;
          }
          if (passcode !== confirmPasscode) {
            setMessage("Passcodes do not match.", true);
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
          setMessage("Incorrect passcode.", true);
          return;
        }

        setAdminSession();
        revealWorkspace(gate, app);
        resolve(true);
      });
    };

    mount();
  });
=======
// Front-end guard only. Replace this later with Firebase Auth + request.auth rules.
export function getFutureAuthNote() {
  return "Bu koruma sadece ön yüz tabanlıdır. Production aşamasında admin yazma izinlerini request.auth ile sınırlandır.";
>>>>>>> theirs
=======
// Front-end guard only. Replace this later with Firebase Auth + request.auth rules.
export function getFutureAuthNote() {
  return "Bu koruma sadece ön yüz tabanlıdır. Production aşamasında admin yazma izinlerini request.auth ile sınırlandır.";
>>>>>>> theirs
}
