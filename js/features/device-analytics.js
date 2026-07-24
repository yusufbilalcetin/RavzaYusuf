/* =========================================================
   PROFESSIONAL DEVICE ANALYTICS CONSENT
   Cookie tarzi izin bandi; cihaz modeli sorulmaz.
   Firestore koleksiyonu: user_visits
   legacy-app.js icindeki IIFE'den ayrildi; davranis aynidir.
   ========================================================= */
import { db } from "../config/firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export function initDeviceAnalyticsConsent() {
  const VISITOR_KEY = "ravza_user_visitor_id";
  const SESSION_KEY = "ravza_user_session_id";
  const SESSION_LOGGED_KEY = "ravza_user_session_logged_at";
  const CONSENT_KEY = "ravza_device_analytics_consent";
  const LEGACY_CONSENT_KEY = "ravza_device_tracking_consent";
  const LEGACY_MODEL_KEY = "ravza_confirmed_device_model";
  const LEGACY_MODEL_NOTE_KEY = "ravza_confirmed_device_note";
  const SESSION_LOG_PREFIX = "visit_logged_";
  const MAX_SESSION_AGE = 1000 * 60 * 30;

  function uid(prefix = "id") {
    if (window.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getOrCreateVisitorId() {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = uid("visitor");
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  function getOrCreateSessionId() {
    const last = Number(sessionStorage.getItem(SESSION_LOGGED_KEY) || 0);
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id || Date.now() - last > MAX_SESSION_AGE) {
      id = uid("session");
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function normalizeScreenPair() {
    const sw = Number(window.screen?.width || window.innerWidth || 0);
    const sh = Number(window.screen?.height || window.innerHeight || 0);
    const width = Math.min(sw, sh);
    const height = Math.max(sw, sh);
    return `${width}x${height}`;
  }

  function getBrowserName(ua) {
    if (/Edg\//i.test(ua)) return "Microsoft Edge";
    if (/OPR\//i.test(ua)) return "Opera";
    if (/CriOS/i.test(ua)) return "Chrome iOS";
    if (/FxiOS/i.test(ua)) return "Firefox iOS";
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
    if (/Firefox\//i.test(ua)) return "Firefox";
    return "Bilinmeyen Tarayıcı";
  }

  function getOsName(ua, platform = navigator.platform || "") {
    if (/Windows NT/i.test(ua)) return "Windows";
    if (/iPhone/i.test(ua)) return "iOS";
    if (/iPad/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPadOS";
    if (/Android/i.test(ua)) return "Android";
    if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
    return platform || "Bilinmeyen OS";
  }

  function getAndroidModel(ua) {
    const match = ua.match(/Android[^;]*;\s*([^;)]+)\s*(?:Build|\))/i);
    if (!match) return "Android cihaz";
    return match[1].replace(/wv|Mobile|;|\)/gi, "").trim() || "Android cihaz";
  }

  function guessAppleModel(ua) {
    const pair = normalizeScreenPair();
    const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
    const iphone = /iPhone/i.test(ua);
    const ipad = /iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (ipad) return "iPad / iPadOS cihaz grubu";
    if (!iphone) return null;

    const map = {
      "440x956@3": "iPhone 16 Pro Max ekran grubu",
      "402x874@3": "iPhone 16 Pro ekran grubu",
      "430x932@3": "iPhone Plus / Pro Max ekran grubu",
      "393x852@3": "iPhone Pro ekran grubu",
      "390x844@3": "iPhone standart ekran grubu",
      "414x896@3": "iPhone Max ekran grubu",
      "414x896@2": "iPhone XR / 11 ekran grubu",
      "375x812@3": "iPhone X / mini / eski Pro ekran grubu",
      "375x667@2": "iPhone SE / 6 / 7 / 8 ekran grubu",
      "414x736@3": "iPhone Plus eski ekran grubu"
    };

    return map[`${pair}@${dpr}`] || `iPhone ekran grubu (${pair}, DPR ${dpr})`;
  }

  function getDeviceType(ua, highEntropy = {}) {
    const isTablet = /iPad|Tablet/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isTablet) return "Tablet";
    const isMobile = Boolean(highEntropy.mobile ?? /Mobi|Android|iPhone|iPod/i.test(ua));
    return isMobile ? "Mobil" : "Masaüstü";
  }

  async function getHighEntropyValues() {
    const highEntropy = {};
    if (navigator.userAgentData?.getHighEntropyValues) {
      try {
        Object.assign(highEntropy, await navigator.userAgentData.getHighEntropyValues([
          "platform",
          "platformVersion",
          "model",
          "mobile",
          "architecture",
          "bitness",
          "uaFullVersion",
          "fullVersionList"
        ]));
      } catch (error) {
        highEntropy.error = error?.message || String(error);
      }
    }
    return highEntropy;
  }

  async function collectRawDeviceInfo() {
    const ua = navigator.userAgent || "";
    const highEntropy = await getHighEntropyValues();
    const os = highEntropy.platform || getOsName(ua);
    const appleGuess = guessAppleModel(ua);
    const androidModel = /Android/i.test(ua) ? getAndroidModel(ua) : "";

    let automaticModel = highEntropy.model || appleGuess || androidModel || os || "Bilinmeyen cihaz";
    let modelAccuracy = "automatic";

    if (highEntropy.model) modelAccuracy = "browser-provided";
    else if (appleGuess) modelAccuracy = "estimated-screen-group";
    else if (androidModel) modelAccuracy = "user-agent-estimated";

    return {
      ua,
      highEntropy,
      os,
      browser: getBrowserName(ua),
      deviceType: getDeviceType(ua, highEntropy),
      automaticModel,
      modelAccuracy,
      screenText: `${window.screen?.width || "?"}×${window.screen?.height || "?"} / DPR ${window.devicePixelRatio || 1}`
    };
  }

  function getConsent() {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent) return consent;

    // Eski sürümden kalan izin varsa yeni sisteme taşı; model seçimi bilgilerini kullanma.
    const legacy = localStorage.getItem(LEGACY_CONSENT_KEY);
    if (legacy === "granted") {
      localStorage.setItem(CONSENT_KEY, "granted");
      localStorage.removeItem(LEGACY_MODEL_KEY);
      localStorage.removeItem(LEGACY_MODEL_NOTE_KEY);
      return "granted";
    }
    if (legacy === "denied") {
      localStorage.setItem(CONSENT_KEY, "denied");
      localStorage.removeItem(LEGACY_MODEL_KEY);
      localStorage.removeItem(LEGACY_MODEL_NOTE_KEY);
      return "denied";
    }

    return "unknown";
  }

  function setConsent(value) {
    localStorage.setItem(CONSENT_KEY, value);
    localStorage.removeItem(LEGACY_CONSENT_KEY);
    localStorage.removeItem(LEGACY_MODEL_KEY);
    localStorage.removeItem(LEGACY_MODEL_NOTE_KEY);
  }

  function injectPermissionBanner(raw) {
    return new Promise((resolve) => {
      const old = document.getElementById("devicePermissionModal");
      if (old) old.remove();

      const modal = document.createElement("div");
      modal.id = "devicePermissionModal";
      modal.className = "device-permission-modal device-cookie-style";
      modal.innerHTML = `
        <div class="device-permission-card" role="dialog" aria-modal="true" aria-labelledby="devicePermissionTitle">
          <div class="device-permission-head">
            <div class="device-permission-icon" aria-hidden="true">📱</div>
            <div class="device-permission-copy">
              <span class="device-permission-badge">CİHAZ ANALİZ İZNİ</span>
              <h3 id="devicePermissionTitle">Cihaz deneyimi izni</h3>
              <p>
                Bu siteyi hangi cihazlarda daha iyi çalıştırmamız gerektiğini anlamak için
                cihaz türü, işletim sistemi, tarayıcı ve ekran bilgilerini analiz etmek istiyoruz.
                Telefon modelini sana sormayız; izin verirsen teknik bilgiler kod ile otomatik analiz edilir.
              </p>
            </div>
          </div>

          <div class="device-detected-box" aria-label="Algılanan teknik cihaz özeti">
            <strong>Otomatik algılanan teknik özet</strong>
            <span>${raw.automaticModel || "Bilinmeyen cihaz"}</span>
            <small>${raw.deviceType || "-"} • ${raw.os || "-"} • ${raw.browser || "-"} • ${raw.screenText}</small>
          </div>

          <div class="device-permission-actions">
            <button type="button" class="device-btn device-btn-ghost" id="denyDeviceTrackingBtn">Reddet</button>
            <button type="button" class="device-btn device-btn-primary" id="allowDeviceTrackingBtn">İzin ver</button>
          </div>

          <p class="device-permission-note">
            İzin vermezsen hiçbir cihaz kaydı oluşturulmaz. Bu izin aynı tarayıcıda hatırlanır; istersen daha sonra tarayıcı verilerini temizleyebilirsin.
          </p>
        </div>
      `;

      document.body.appendChild(modal);
      document.body.classList.add("device-permission-open");

      modal.querySelector("#allowDeviceTrackingBtn").addEventListener("click", () => {
        setConsent("granted");
        close();
        resolve(true);
      });

      modal.querySelector("#denyDeviceTrackingBtn").addEventListener("click", () => {
        setConsent("denied");
        close();
        resolve(false);
      });

      function close() {
        document.body.classList.remove("device-permission-open");
        modal.classList.add("closing");
        setTimeout(() => modal.remove(), 180);
      }
    });
  }

  async function getConsentResult(raw) {
    const consent = getConsent();
    if (consent === "denied") return false;
    if (consent === "granted") return true;
    // Ana ekran ilk açılışta sadece görsel kalsın; açık izin yoksa cihaz analizi kapalıdır.
    setConsent("denied");
    return false;
  }

  async function collectDeviceInfo(raw) {
    return {
      visitorId: getOrCreateVisitorId(),
      sessionId: getOrCreateSessionId(),
      deviceModel: raw.automaticModel,
      automaticDeviceModel: raw.automaticModel,
      confirmedModel: "",
      modelAccuracy: raw.modelAccuracy,
      userPermission: "granted",
      permissionText: "Kullanıcı cihaz türü, işletim sistemi, tarayıcı ve ekran bilgilerinin analiz edilmesine izin verdi.",
      consentVersion: "device-analytics-v2-no-model-question",
      os: raw.os,
      browser: raw.browser,
      deviceType: raw.deviceType,
      userAgent: raw.ua,
      screen: {
        width: window.screen?.width || null,
        height: window.screen?.height || null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        colorDepth: window.screen?.colorDepth || null,
        orientation: screen.orientation?.type || "unknown"
      },
      capabilities: {
        touchPoints: navigator.maxTouchPoints || 0,
        standalone: Boolean(window.navigator.standalone),
        cookiesEnabled: navigator.cookieEnabled
      },
      language: navigator.language || "tr-TR",
      languages: navigator.languages || [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul",
      pagePath: location.pathname,
      pageTitle: document.title,
      referrer: document.referrer || "direct",
      highEntropy: raw.highEntropy,
      createdAt: serverTimestamp(),
      clientCreatedAt: new Date().toISOString()
    };
  }

  async function logVisitOncePerSession() {
    try {
      const sessionId = getOrCreateSessionId();
      const alreadyLogged = sessionStorage.getItem(`${SESSION_LOG_PREFIX}${sessionId}`);
      if (alreadyLogged) return;

      const raw = await collectRawDeviceInfo();
      const allowed = await getConsentResult(raw);
      if (!allowed) return;

      const payload = await collectDeviceInfo(raw);
      await addDoc(collection(db, "user_visits"), payload);
      sessionStorage.setItem(`${SESSION_LOG_PREFIX}${sessionId}`, "1");
      sessionStorage.setItem(SESSION_LOGGED_KEY, String(Date.now()));
    } catch (error) {
      console.warn("Kullanıcı cihaz bilgisi kaydedilemedi:", error);
    }
  }

  window.resetDeviceTrackingPermission = function resetDeviceTrackingPermission() {
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(LEGACY_CONSENT_KEY);
    localStorage.removeItem(LEGACY_MODEL_KEY);
    localStorage.removeItem(LEGACY_MODEL_NOTE_KEY);
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(SESSION_LOG_PREFIX)) sessionStorage.removeItem(key);
    });
    logVisitOncePerSession();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(logVisitOncePerSession, 700));
  } else {
    setTimeout(logVisitOncePerSession, 700);
  }
}
