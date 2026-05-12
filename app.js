(() => {
  "use strict";

  const truth = window.CodeMojiTruth;
  const VERSION = truth.version;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const $ = (id) => document.getElementById(id);

  const state = {
    screen: "boot",
    currentCapsule: null,
    currentSkin: "candy",
    outgoingSign: null,
    pattern: [],
    latestShareText: "",
    latestLink: "",
    unlockedPlain: "",
    resetTimer: null
  };

  const profileKey = `${truth.storagePrefix}profile`;

  function setStatus(message) {
    $("statusLine").textContent = message || "";
  }

  function setTitle(title, subtitle) {
    $("cardTitle").textContent = title;
    $("cardSubtitle").textContent = subtitle || "";
  }

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

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  function randomChoice(items) {
    return items[crypto.getRandomValues(new Uint32Array(1))[0] % items.length];
  }

  function pickSkin() {
    return randomChoice(truth.skins).code;
  }

  function applySkin(skinCode) {
    const safe = truth.skins.some((s) => s.code === skinCode) ? skinCode : "candy";
    state.currentSkin = safe;
    document.body.dataset.skin = safe;
  }

  function pickEmojiPassword() {
    const pool = truth.safeSymbolSet.slice();
    const picked = [];
    while (picked.length < 3 && pool.length) {
      const index = crypto.getRandomValues(new Uint32Array(1))[0] % pool.length;
      picked.push(pool.splice(index, 1)[0]);
    }
    return {
      codes: picked.map((x) => x.code).join(""),
      symbols: picked.map((x) => x.emoji).join(" "),
      words: picked.map((x) => x.word).join("-")
    };
  }

  function emojiPasswordFromCodes(codes) {
    const picked = String(codes || "")
      .split("")
      .map((code) => truth.safeSymbolSet.find((x) => x.code === code))
      .filter(Boolean);

    return {
      codes: picked.map((x) => x.code).join(""),
      symbols: picked.map((x) => x.emoji).join(" "),
      words: picked.map((x) => x.word).join("-")
    };
  }

  function getBaseUrl() {
    if (truth.publicBaseUrl) return truth.publicBaseUrl.replace(/#.*$/, "");
    return `${location.origin}${location.pathname}`.replace(/index\.html$/, "");
  }

  async function importAesKey(rawKeyBytes) {
    return crypto.subtle.importKey("raw", rawKeyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  async function deriveMessageKeyFromPattern(pattern, saltB64) {
    const salt = base64UrlToBytes(saltB64);
    const patternMaterial = pattern.join("-");
    const raw = await crypto.subtle.importKey("raw", encoder.encode(patternMaterial), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({
      name: "PBKDF2",
      salt,
      iterations: truth.limits.pbkdf2Iterations,
      hash: "SHA-256"
    }, raw, 256);
    return importAesKey(new Uint8Array(bits));
  }

  async function encryptWithPatternKey(plainText, pattern) {
    const salt = bytesToBase64Url(randomBytes(16));
    const iv = randomBytes(12);
    const key = await deriveMessageKeyFromPattern(pattern, salt);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plainText));
    return {
      salt,
      iv: bytesToBase64Url(iv),
      cipher: bytesToBase64Url(new Uint8Array(cipher))
    };
  }

  async function decryptCapsule(capsule, pattern) {
    const iv = base64UrlToBytes(capsule.iv);
    const cipher = base64UrlToBytes(capsule.c);

    if (capsule.k) {
      const legacyKey = await importAesKey(base64UrlToBytes(capsule.k));
      const legacyPlain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, legacyKey, cipher);
      return decoder.decode(legacyPlain);
    }

    const key = await deriveMessageKeyFromPattern(pattern, capsule.salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return decoder.decode(plain);
  }

  async function derivePatternVerifier(pattern, saltB64) {
    const salt = base64UrlToBytes(saltB64);
    const raw = await crypto.subtle.importKey("raw", encoder.encode(pattern.join("-")), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({
      name: "PBKDF2",
      salt,
      iterations: truth.limits.pbkdf2Iterations,
      hash: "SHA-256"
    }, raw, 192);
    return bytesToBase64Url(new Uint8Array(bits));
  }

  function getProfile() {
    try {
      const raw = localStorage.getItem(profileKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function hasProfile() {
    const p = getProfile();
    return Boolean(p && p.version === VERSION && p.salt && p.verifier);
  }

  async function saveProfile(pattern) {
    const salt = bytesToBase64Url(randomBytes(16));
    const verifier = await derivePatternVerifier(pattern, salt);
    localStorage.setItem(profileKey, JSON.stringify({
      version: VERSION,
      exists: true,
      salt,
      verifier,
      createdAt: new Date().toISOString(),
      skinPreference: state.currentSkin || "candy"
    }));
  }

  async function verifyPattern(pattern) {
    const profile = getProfile();
    if (!profile) return false;
    const verifier = await derivePatternVerifier(pattern, profile.salt);
    return verifier === profile.verifier;
  }

  function clearProfile() {
    localStorage.removeItem(profileKey);
  }

  function compactCapsule(capsule) {
    return [
      VERSION,
      capsule.skin || "candy",
      capsule.ep.codes,
      capsule.salt,
      capsule.iv,
      capsule.c
    ].join(".");
  }

  function capsuleToLink(capsule) {
    return `${getBaseUrl()}#${compactCapsule(capsule)}`;
  }

  function extractCapsuleFromText(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;

    const hash = text.includes("#") ? text.split("#").pop() : text;

    const cm8p = hash.match(/CM8P\.([a-z0-9-]+)\.([A-L]{3})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/i);
    if (cm8p) {
      return {
        v: "CM8P",
        type: "pattern-bound-capsule",
        skin: cm8p[1].toLowerCase(),
        ep: emojiPasswordFromCodes(cm8p[2].toUpperCase()),
        salt: cm8p[3],
        iv: cm8p[4],
        c: cm8p[5]
      };
    }

    const cm8 = hash.match(/CM8\.([a-z0-9-]+)\.([A-L]{3})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/i);
    if (cm8) {
      return {
        v: "CM8",
        type: "codemoji-capsule",
        skin: cm8[1].toLowerCase(),
        ep: emojiPasswordFromCodes(cm8[2].toUpperCase()),
        k: cm8[3],
        iv: cm8[4],
        c: cm8[5]
      };
    }

    const sm7 = hash.match(/SM7\.([A-L]{3})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/i);
    if (sm7) {
      return {
        v: "SM7",
        type: "legacy-capsule",
        skin: "candy",
        ep: emojiPasswordFromCodes(sm7[1].toUpperCase()),
        k: sm7[2],
        iv: sm7[3],
        c: sm7[4]
      };
    }

    return null;
  }

  function buildShareText(capsule) {
    const link = capsuleToLink(capsule);
    const template = truth.teaserTemplates.he;
    return template
      .replace("{emojiPassword}", capsule.ep.symbols)
      .replace("{emojiWords}", capsule.ep.words)
      .replace("{link}", link);
  }

  async function makeCapsule(message, pattern) {
    const encrypted = await encryptWithPatternKey(message, pattern);
    const ep = state.outgoingSign || pickEmojiPassword();
    const skin = state.currentSkin || pickSkin();
    return {
      v: VERSION,
      type: "pattern-bound-capsule",
      skin,
      ep,
      salt: encrypted.salt,
      iv: encrypted.iv,
      c: encrypted.c
    };
  }

  function clearDynamic() {
    $("dynamicArea").innerHTML = "";
    $("secondaryRow").innerHTML = "";
    $("primaryBtn").classList.remove("hidden");
    setStatus("");
  }

  function createButton(label, className, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className || "secondary-btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function resetPatternState() {
    state.pattern = [];
  }

  function renderPatternGrid() {
    const template = $("patternTemplate").content.cloneNode(true);
    const grid = template.querySelector("[data-pattern-grid]");
    const readout = template.querySelector("[data-pattern-readout]");

    function refresh() {
      const count = state.pattern.length;
      const min = truth.limits.minPatternPoints;
      readout.textContent = count < min
        ? `בחר/י לפחות ${min} נקודות — נבחרו ${count}`
        : `הסימן מוכן: ${state.pattern.join(" → ")}`;
    }

    for (let i = 1; i <= 9; i += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "pattern-dot";
      dot.textContent = String(i);
      dot.dataset.point = String(i);
      dot.addEventListener("click", () => {
        const idx = state.pattern.indexOf(i);
        if (idx >= 0) {
          state.pattern.splice(idx, 1);
          dot.classList.remove("selected");
        } else {
          state.pattern.push(i);
          dot.classList.add("selected");
        }
        refresh();
      });
      grid.appendChild(dot);
    }

    refresh();
    return template;
  }

  function showScreen(name) {
    state.screen = name;
    clearDynamic();

    if (name === "onboarding") return renderOnboarding();
    if (name === "compose") return renderCompose();
    if (name === "ready") return renderReady();
    if (name === "incoming") return renderIncoming();
    if (name === "read") return renderRead();
    if (name === "reply") return renderReply();
    if (name === "reset") return renderReset();
  }

  function renderOnboarding() {
    resetPatternState();
    const incoming = Boolean(state.currentCapsule);
    setTitle(
      incoming ? "קיבלת CodeMoji" : "בחר/י סימן קבוע",
      incoming
        ? "כדי לפתוח, בחר/י סימן קבוע שנשמר רק במכשיר הזה."
        : "הסימן הזה יפתח קודים במכשיר הזה. בלי חשבון ובלי הרשמה."
    );

    const area = $("dynamicArea");
    const note = document.createElement("div");
    note.className = "soft-box";
    note.textContent = "לא שומרים raw pattern. נשמר רק verifier מקומי.";
    area.appendChild(note);
    area.appendChild(renderPatternGrid());

    $("primaryBtn").textContent = incoming ? "שמור/י סימן ופתח/י" : "שמור/י סימן";
    $("primaryBtn").onclick = async () => {
      if (state.pattern.length < truth.limits.minPatternPoints) {
        setStatus("צריך לפחות 4 נקודות.");
        return;
      }
      await saveProfile(state.pattern);
      setStatus("הסימן נשמר במכשיר.");
      if (state.currentCapsule) {
        await unlockWithCurrentPattern(true);
      } else {
        showScreen("compose");
      }
    };
  }

  function renderCompose() {
    resetPatternState();
    state.outgoingSign = pickEmojiPassword();
    applySkin(pickSkin());

    setTitle("כתוב/י משהו קטן", "מסך אחד. פעולה אחת. שליחה מהירה.");
    const area = $("dynamicArea");

    const textarea = document.createElement("textarea");
    textarea.id = "messageInput";
    textarea.className = "message-input";
    textarea.maxLength = truth.limits.maxMessageChars;
    textarea.rows = 5;
    textarea.placeholder = "משהו קצר ומסקרן...";
    area.appendChild(textarea);

    const counter = document.createElement("div");
    counter.className = "counter";
    counter.textContent = `0/${truth.limits.maxMessageChars}`;
    area.appendChild(counter);

    textarea.addEventListener("input", () => {
      counter.textContent = `${textarea.value.length}/${truth.limits.maxMessageChars}`;
    });

    const sign = document.createElement("div");
    sign.className = "sign-card";
    sign.innerHTML = `
      <span>סימן לשליחה:</span>
      <strong dir="ltr">${state.outgoingSign.symbols}</strong>
      <small dir="ltr">${state.outgoingSign.words}</small>
    `;
    area.appendChild(sign);

    const skinRow = document.createElement("div");
    skinRow.className = "skin-row";
    for (const skin of truth.skins) {
      const b = createButton(skin.label, `skin-chip skin-${skin.code}`, () => {
        applySkin(skin.code);
        document.querySelectorAll(".skin-chip").forEach((el) => el.classList.remove("active"));
        b.classList.add("active");
      });
      if (skin.code === state.currentSkin) b.classList.add("active");
      skinRow.appendChild(b);
    }
    area.appendChild(skinRow);

    const patternNote = document.createElement("div");
    patternNote.className = "soft-box";
    patternNote.textContent = "Draw a shared 3x3 sign. This sign derives the encryption key.";
    area.appendChild(patternNote);
    area.appendChild(renderPatternGrid());

    $("primaryBtn").textContent = "צור/י קוד";
    $("primaryBtn").onclick = async () => {
      const message = textarea.value.trim();
      if (!message) {
        setStatus("כתוב/י הודעה קצרה לפני יצירת קוד.");
        return;
      }
      if (message.length > truth.limits.maxMessageChars) {
        setStatus(`עד ${truth.limits.maxMessageChars} תווים.`);
        return;
      }
      if (state.pattern.length < truth.limits.minPatternPoints) {
        setStatus("Draw a sign of at least 4 points.");
        return;
      }
      const capsule = await makeCapsule(message, state.pattern);
      state.latestShareText = buildShareText(capsule);
      state.latestLink = capsuleToLink(capsule);
      state.currentCapsule = capsule;
      showScreen("ready");
    };

    $("secondaryRow").appendChild(createButton("איפוס סימן", "ghost-btn", () => showScreen("reset")));
  }

  function renderReady() {
    setTitle("הקוד מוכן", "שלח/י, העתיק/י, או פתח/י תצוגה מקדימה.");
    const area = $("dynamicArea");

    const ready = document.createElement("div");
    ready.className = "ready-box";
    ready.innerHTML = `
      <div class="big-sign" dir="ltr">${state.currentCapsule.ep.symbols}</div>
      <div class="words" dir="ltr">${state.currentCapsule.ep.words}</div>
      <a class="pretty-link" href="${state.latestLink}">פתח/י את הקוד ✨</a>
      <textarea id="rawLinkBox" class="raw-link hidden" readonly>${state.latestShareText}</textarea>
    `;
    area.appendChild(ready);

    $("primaryBtn").textContent = "שלח/י בוואטסאפ";
    $("primaryBtn").onclick = () => openWhatsApp(state.latestShareText);

    $("secondaryRow").appendChild(createButton("Copy", "secondary-btn", async () => {
      const ok = await copyText(state.latestShareText);
      setStatus(ok ? "הקוד הועתק." : "הדפדפן חסם העתקה. הצגתי קישור ידני.");
      if (!ok) $("rawLinkBox").classList.remove("hidden");
    }));

    $("secondaryRow").appendChild(createButton("Share", "secondary-btn", async () => {
      const shared = await shareText(state.latestShareText);
      setStatus(shared ? "חלון השיתוף נפתח." : "שיתוף לא זמין כאן. הקוד הועתק.");
    }));

    $("secondaryRow").appendChild(createButton("Preview", "ghost-btn", () => {
      const cap = extractCapsuleFromText(state.latestLink);
      if (cap) {
        state.currentCapsule = cap;
        showScreen("incoming");
      }
    }));

    $("secondaryRow").appendChild(createButton("הצג קישור", "ghost-btn", () => {
      $("rawLinkBox").classList.toggle("hidden");
    }));
  }

  function renderIncoming() {
    resetPatternState();
    const capsule = state.currentCapsule;
    applySkin(capsule?.skin || "candy");

    setTitle("קיבלת CodeMoji", "צייר/י את הסימן שלך כדי לפתוח לקריאה.");
    const area = $("dynamicArea");

    const visible = document.createElement("div");
    visible.className = "sign-card incoming-sign";
    visible.innerHTML = `
      <span>הסימן שקיבלת:</span>
      <strong dir="ltr">${capsule.ep.symbols}</strong>
      <small dir="ltr">${capsule.ep.words}</small>
    `;
    area.appendChild(visible);
    area.appendChild(renderPatternGrid());

    $("primaryBtn").textContent = "פתח/י";
    $("primaryBtn").onclick = () => unlockWithCurrentPattern(false);

    $("secondaryRow").appendChild(createButton("שכחתי סימן", "ghost-btn", () => showScreen("reset")));
  }

  async function unlockWithCurrentPattern(profileJustCreated) {
    if (!state.currentCapsule) return;
    if (state.pattern.length < truth.limits.minPatternPoints) {
      setStatus("צריך לפחות 4 נקודות.");
      return;
    }

    if (!profileJustCreated && state.currentCapsule.v !== "CM8P") {
      const ok = await verifyPattern(state.pattern);
      if (!ok) {
        setStatus("הסימן לא תואם למכשיר הזה.");
        return;
      }
    }

    try {
      const plain = await decryptCapsule(state.currentCapsule, state.pattern);
      state.unlockedPlain = plain;
      showScreen("read");
    } catch {
      setStatus("הקוד לא נפתח. יכול להיות שהקישור נחתך.");
    }
  }

  function renderRead() {
    setTitle("נפתח", "ההודעה לקריאה בלבד. אפשר להשיב בקוד.");
    const area = $("dynamicArea");
    const msg = document.createElement("article");
    msg.className = "plain-message";
    msg.textContent = state.unlockedPlain || "";
    area.appendChild(msg);

    $("primaryBtn").textContent = "השב/י בקוד";
    $("primaryBtn").onclick = () => showScreen("reply");

    $("secondaryRow").appendChild(createButton("צור/י חדש", "secondary-btn", () => {
      state.currentCapsule = null;
      state.unlockedPlain = "";
      showScreen("compose");
    }));
  }

  function renderReply() {
    resetPatternState();
    state.outgoingSign = pickEmojiPassword();
    applySkin(pickSkin());

    setTitle("כתוב/י תשובה", "תשובה קצרה שחוזרת לאותו לופ.");
    const area = $("dynamicArea");

    const textarea = document.createElement("textarea");
    textarea.id = "replyInput";
    textarea.className = "message-input";
    textarea.maxLength = truth.limits.maxMessageChars;
    textarea.rows = 5;
    textarea.placeholder = "תשובה קצרה...";
    area.appendChild(textarea);

    const patternNote = document.createElement("div");
    patternNote.className = "soft-box";
    patternNote.textContent = "Draw a sign for the encrypted reply.";
    area.appendChild(patternNote);
    area.appendChild(renderPatternGrid());

    $("primaryBtn").textContent = "שלח/י חזרה";
    $("primaryBtn").onclick = async () => {
      const message = textarea.value.trim();
      if (!message) {
        setStatus("כתוב/י תשובה קצרה.");
        return;
      }
      if (state.pattern.length < truth.limits.minPatternPoints) {
        setStatus("Draw a sign of at least 4 points.");
        return;
      }
      const capsule = await makeCapsule(message, state.pattern);
      state.latestShareText = buildShareText(capsule);
      state.latestLink = capsuleToLink(capsule);
      state.currentCapsule = capsule;
      showScreen("ready");
    };

    $("secondaryRow").appendChild(createButton("חזרה", "ghost-btn", () => showScreen("read")));
  }

  function renderReset() {
    resetPatternState();
    setTitle("איפוס סימן", "איפוס ימחק את הסימן מהמכשיר הזה. קודים ישנים עלולים לא להיפתח.");
    const area = $("dynamicArea");

    const warning = document.createElement("div");
    warning.className = "danger-box";
    warning.textContent = "לחיצה ארוכה של 3 שניות תאפס את הסימן המקומי.";
    area.appendChild(warning);

    $("primaryBtn").textContent = "לחיצה ארוכה לאיפוס";
    $("primaryBtn").onpointerdown = () => {
      setStatus("מחזיק... 3 שניות");
      state.resetTimer = window.setTimeout(() => {
        clearProfile();
        setStatus("הסימן אופס. בחר/י סימן חדש.");
        $("primaryBtn").onpointerdown = null;
        $("primaryBtn").onpointerup = null;
        showScreen("onboarding");
      }, 3000);
    };
    $("primaryBtn").onpointerup = () => {
      if (state.resetTimer) window.clearTimeout(state.resetTimer);
      setStatus("האיפוס בוטל.");
    };
    $("primaryBtn").onpointerleave = $("primaryBtn").onpointerup;

    $("secondaryRow").appendChild(createButton("ביטול", "secondary-btn", () => {
      $("primaryBtn").onpointerdown = null;
      $("primaryBtn").onpointerup = null;
      $("primaryBtn").onpointerleave = null;
      if (state.currentCapsule) showScreen("incoming");
      else showScreen(hasProfile() ? "compose" : "onboarding");
    }));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
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
    try {
      window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
      setStatus("פותח WhatsApp...");
    } catch {
      copyText(text);
      setStatus("לא הצלחתי לפתוח WhatsApp. הקוד הועתק.");
    }
  }

  function parseIncomingOnLoad() {
    try {
      const capsule = extractCapsuleFromText(location.hash);
      if (capsule && (capsule.v === "CM8P" || capsule.v === "CM8" || capsule.v === "SM7")) {
        state.currentCapsule = capsule;
        applySkin(capsule.skin || "candy");
        if (capsule.v === "CM8P") showScreen("incoming");
        else if (!hasProfile()) showScreen("onboarding");
        else showScreen("incoming");
        return true;
      }
    } catch {
      setStatus("הקוד לא נפתח. יכול להיות שהקישור נחתך.");
    }
    return false;
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
        .catch(() => {});
    }
  }

  function boot() {
    applySkin("candy");
    $("settingsBtn").addEventListener("click", () => showScreen("reset"));
    const hasIncoming = parseIncomingOnLoad();
    if (!hasIncoming) showScreen("compose");
    registerServiceWorker();
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
