/* SecretMoji v5 — Mobile Popup Capsule
   Mobile-first PWA. No backend. No account. No official messenger integration.
   Incoming links go directly to a glass popup flow.
*/
(() => {
  "use strict";

  const truth = window.SecretMojiTruth;
  const VERSION = truth.version;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const $ = (id) => document.getElementById(id);

  const state = {
    outgoingPassword: null,
    currentCapsule: null,
    pattern: [],
    unlockedPlain: "",
    latestShareText: "",
    latestReplyText: ""
  };

  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  }

  function jsonToB64(obj) {
    return bytesToBase64Url(encoder.encode(JSON.stringify(obj)));
  }

  function b64ToJson(value) {
    return JSON.parse(decoder.decode(base64UrlToBytes(value)));
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function randomId(size = 8) {
    return bytesToBase64Url(randomBytes(size));
  }

  function pickEmojiPassword() {
    const pool = truth.safeEmojiSet.slice();
    const picked = [];
    while (picked.length < 3 && pool.length) {
      const index = crypto.getRandomValues(new Uint32Array(1))[0] % pool.length;
      picked.push(pool.splice(index, 1)[0]);
    }
    return {
      symbols: picked.map((x) => x.emoji).join(" "),
      words: picked.map((x) => x.word).join("-"),
      ids: picked.map((x) => x.word)
    };
  }

  function emojiPasswordFromCodes(codes) {
    const picked = String(codes || "")
      .split("")
      .map((code) => truth.safeEmojiSet.find((x) => x.code === code))
      .filter(Boolean);

    return {
      symbols: picked.map((x) => x.emoji).join(" "),
      words: picked.map((x) => x.word).join("-"),
      ids: picked.map((x) => x.word)
    };
  }

  function compactCapsule(capsule) {
    const codes = (capsule.ep?.ids || [])
      .map((id) => {
        const hit = truth.safeEmojiSet.find((x) => x.word === id || x.code === id);
        return hit ? hit.code : "";
      })
      .join("");

    return [VERSION, codes, capsule.k, capsule.iv, capsule.c].join(".");
  }
  function getBaseUrl() {
    if (truth.publicBaseUrl) return truth.publicBaseUrl.replace(/#.*$/, "");
    const clean = `${location.origin}${location.pathname}`.replace(/index\.html$/, "");
    return clean;
  }

  function capsuleToLink(capsule) {
    return `${getBaseUrl()}#${compactCapsule(capsule)}`;
  }

  function extractCapsuleFromText(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;

    const hash = text.includes("#") ? text.split("#").pop() : text;

    // v6 compact format:
    // SM5.<emojiCodes>.<key>.<iv>.<cipher>
    const compact = hash.match(/(SM5|SM7)\.([A-Za-z0-9]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
    if (compact) {
      return {
        v: VERSION,
        type: "first-capsule",
        ep: emojiPasswordFromCodes(compact[2]),
        k: compact[3],
        iv: compact[4],
        c: compact[5]
      };
    }

    // Legacy v5 JSON/base64 format support.
    const legacy = hash.match(/(?:SM5|SM7):([A-Za-z0-9_-]+)/);
    if (legacy) return b64ToJson(legacy[1]);

    return null;
  }

  async function importAesKey(rawKeyBytes) {
    return crypto.subtle.importKey("raw", rawKeyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  async function encryptWithRandomCapsuleKey(plainText) {
    const keyBytes = randomBytes(32);
    const iv = randomBytes(12);
    const key = await importAesKey(keyBytes);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plainText));
    return {
      key: bytesToBase64Url(keyBytes),
      iv: bytesToBase64Url(iv),
      cipher: bytesToBase64Url(new Uint8Array(cipher))
    };
  }

  async function decryptCapsule(capsule) {
    const key = await importAesKey(base64UrlToBytes(capsule.k));
    const iv = base64UrlToBytes(capsule.iv);
    const cipher = base64UrlToBytes(capsule.c);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return decoder.decode(plain);
  }

  async function deriveLocalPatternKey(pattern) {
    const salt = encoder.encode("secretmoji-local-pattern-v5");
    const raw = await crypto.subtle.importKey("raw", encoder.encode(pattern.join("-")), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: truth.limits.pbkdf2Iterations, hash: "SHA-256" }, raw, 128);
    return bytesToBase64Url(new Uint8Array(bits));
  }

  function buildShareText(capsule) {
    const link = capsuleToLink(capsule);
    const template = truth.teaserTemplates.he;
    return template
      .replace("{emojiPassword}", capsule.ep.symbols)
      .replace("{emojiWords}", capsule.ep.words)
      .replace("{link}", link);
  }

  async function makeCapsule(message) {
    const encrypted = await encryptWithRandomCapsuleKey(message);
    const emojiPassword = state.outgoingPassword || pickEmojiPassword();
    return {
      v: VERSION,
      type: "first-capsule",
      id: randomId(6),
      createdAt: new Date().toISOString(),
      ep: emojiPassword,
      k: encrypted.key,
      iv: encrypted.iv,
      c: encrypted.c
    };
  }

  function setStatus(id, message) {
    const el = $(id);
    if (el) el.textContent = message || "";
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  async function shareText(text) {
    if (navigator.share) {
      await navigator.share({ text });
      return true;
    }
    await copyText(text);
    return false;
  }

  function openWhatsApp(text) {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.location.href = url;
  }

  function refreshEmojiPassword() {
    state.outgoingPassword = pickEmojiPassword();
    $("emojiPassword").textContent = state.outgoingPassword.symbols;
    $("emojiPasswordWords").textContent = state.outgoingPassword.words;
  }

  function updateCounter() {
    $("charCount").textContent = String($("messageInput").value.length);
  }

  function renderPatternGrid() {
    const grid = $("unlockPattern");
    grid.innerHTML = "";
    state.pattern = [];
    for (let i = 1; i <= 9; i += 1) {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "pattern-dot";
      node.textContent = String(i);
      node.dataset.point = String(i);
      node.addEventListener("click", () => togglePatternPoint(i, node));
      grid.appendChild(node);
    }
    updatePatternReadout();
  }

  function togglePatternPoint(point, node) {
    const existing = state.pattern.indexOf(point);
    if (existing >= 0) {
      state.pattern.splice(existing, 1);
      node.classList.remove("selected");
    } else {
      state.pattern.push(point);
      node.classList.add("selected");
    }
    updatePatternReadout();
  }

  function updatePatternReadout() {
    const count = state.pattern.length;
    const min = truth.limits.minPatternPoints;
    $("patternReadout").textContent = count < min
      ? `בחר/י לפחות ${min} נקודות — נבחרו ${count}`
      : `התבנית מוכנה: ${state.pattern.join(" → ")}`;
  }

  function resetPattern() {
    state.pattern = [];
    document.querySelectorAll(".pattern-dot").forEach((el) => el.classList.remove("selected"));
    updatePatternReadout();
  }

  function showPopupView(name) {
    ["onboardingView", "messageView", "replyView"].forEach((id) => $(id).classList.add("hidden"));
    $(name).classList.remove("hidden");
  }

  function openPopupWithCapsule(capsule) {
    state.currentCapsule = capsule;
    $("mainApp").classList.add("soft-hidden");
    $("popupLayer").classList.remove("hidden");
    $("popupTitle").textContent = truth.onboardingCopy.firstTitle;
    $("incomingEmojiPassword").textContent = capsule.ep?.symbols || "";
    $("incomingEmojiWords").textContent = capsule.ep?.words || "";
    $("popupStatus").textContent = "";
    renderPatternGrid();
    showPopupView("onboardingView");
  }

  function closePopup() {
    $("popupLayer").classList.add("hidden");
    $("mainApp").classList.remove("soft-hidden");
    history.replaceState(null, "", location.pathname + location.search);
  }

  async function unlockCurrentCapsule() {
    if (!state.currentCapsule) return;
    if (state.pattern.length < truth.limits.minPatternPoints) {
      setStatus("popupStatus", "צריך תבנית קצרה כדי להיכנס למשחק.");
      return;
    }
    try {
      const localKey = await deriveLocalPatternKey(state.pattern);
      localStorage.setItem("secretmoji.localPattern.v5", localKey);
      const plain = await decryptCapsule(state.currentCapsule);
      state.unlockedPlain = plain;
      $("plainMessage").textContent = plain;
      setStatus("popupStatus", "הסימן נשמר במכשיר. ההודעה פתוחה לקריאה בלבד.");
      showPopupView("messageView");
    } catch (error) {
      setStatus("popupStatus", "לא הצלחתי לפתוח את הקפסולה. ייתכן שהקישור נחתך.");
    }
  }

  async function handleMakeCapsule() {
    const message = $("messageInput").value.trim();
    if (!message) {
      setStatus("shareStatus", "כתוב/י הודעה קצרה לפני יצירת קפסולה.");
      return;
    }
    if (message.length > truth.limits.maxMessageChars) {
      setStatus("shareStatus", `הודעה ארוכה מדי. עד ${truth.limits.maxMessageChars} תווים.`);
      return;
    }
    const capsule = await makeCapsule(message);
    const share = buildShareText(capsule);
    state.latestShareText = share;
    $("shareText").value = share;
    $("sharePanel").classList.remove("hidden");
    setStatus("shareStatus", "מוכן לשליחה. הטיזר מופיע לפני הקישור הארוך.");
  }

  async function handleReplyCapsule() {
    const message = $("replyInput").value.trim();
    if (!message) {
      setStatus("popupStatus", "כתוב/י תשובה קצרה.");
      return;
    }
    if (message.length > truth.limits.maxMessageChars) {
      setStatus("popupStatus", `תשובה ארוכה מדי. עד ${truth.limits.maxMessageChars} תווים.`);
      return;
    }
    const capsule = await makeCapsule(message);
    const share = buildShareText(capsule);
    state.latestReplyText = share;
    $("replyShareText").value = share;
    $("replyShareText").classList.remove("hidden");
    $("replyActions").classList.remove("hidden");
    setStatus("popupStatus", "התשובה מוכנה. אפשר לשלוח חזרה דרך WhatsApp / Share / Copy.");
  }

  function parseIncomingOnLoad() {
    try {
      const capsule = extractCapsuleFromText(location.hash);
      if (capsule && capsule.v === VERSION) {
        setTimeout(() => openPopupWithCapsule(capsule), 90);
      }
    } catch {
      // Ignore malformed hashes silently; manual paste remains available.
    }
  }

  function bindEvents() {
    $("messageInput").addEventListener("input", updateCounter);
    $("refreshEmojiPassword").addEventListener("click", refreshEmojiPassword);
    $("makeCapsuleBtn").addEventListener("click", handleMakeCapsule);
    $("copyBtn").addEventListener("click", async () => {
      await copyText(state.latestShareText || $("shareText").value);
      setStatus("shareStatus", "Copied.");
    });
    $("shareBtn").addEventListener("click", async () => {
      await shareText(state.latestShareText || $("shareText").value);
      setStatus("shareStatus", "Share opened, or copied if native share was unavailable.");
    });
    $("whatsappBtn").addEventListener("click", () => openWhatsApp(state.latestShareText || $("shareText").value));
    $("manualOpenBtn").addEventListener("click", () => {
      try {
        const capsule = extractCapsuleFromText($("manualCapsule").value);
        if (!capsule) throw new Error("No capsule");
        openPopupWithCapsule(capsule);
      } catch {
        setStatus("popupStatus", "לא זוהתה קפסולת SM5 תקינה.");
      }
    });
    $("closePopup").addEventListener("click", closePopup);
    $("unlockBtn").addEventListener("click", unlockCurrentCapsule);
    $("resetPatternBtn").addEventListener("click", resetPattern);
    $("replyBtn").addEventListener("click", () => showPopupView("replyView"));
    $("makeMineBtn").addEventListener("click", closePopup);
    $("makeReplyBtn").addEventListener("click", handleReplyCapsule);
    $("replyCopyBtn").addEventListener("click", async () => {
      await copyText(state.latestReplyText || $("replyShareText").value);
      setStatus("popupStatus", "Reply copied.");
    });
    $("replyShareBtn").addEventListener("click", async () => {
      await shareText(state.latestReplyText || $("replyShareText").value);
    });
    $("replyWhatsAppBtn").addEventListener("click", () => openWhatsApp(state.latestReplyText || $("replyShareText").value));

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const status = $("shareStatus");
        if (status && status.textContent.includes("WhatsApp")) status.textContent = "חזרת ל-SecretMoji.";
      }
    });
  }

  function registerServiceWorker() {
    // v6: during MVP iteration, service worker caching caused stale app.js/config.js.
    // Unregister all service workers so every mobile test receives the latest build.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
        .catch(() => {});
    }
  }

  function boot() {
    if ($("runtimeChip")) $("runtimeChip").textContent = "Simple mobile popup · " + VERSION;
    refreshEmojiPassword();
    updateCounter();
    bindEvents();
    parseIncomingOnLoad();
    registerServiceWorker();
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
