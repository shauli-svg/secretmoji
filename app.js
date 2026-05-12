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
    unlockedPlain: "",
    isDrawing: false,
    audioCtx: null
  };

  // --- AUDIO & HAPTIC ENGINE (Gamefeel) ---
  function initAudio() {
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (state.audioCtx.state === "suspended") {
      state.audioCtx.resume();
    }
  }

  function playTone(freq, type, duration, vol=0.05) {
    if (!state.audioCtx) return;
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, state.audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, state.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    osc.start();
    osc.stop(state.audioCtx.currentTime + duration);
  }

  function soundTick() {
    playTone(800, "sine", 0.1, 0.02);
    if (navigator.vibrate) navigator.vibrate(8);
  }

  function soundFail() {
    playTone(150, "sawtooth", 0.15, 0.05);
    setTimeout(() => playTone(100, "sawtooth", 0.2, 0.05), 150);
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  }

  function soundSuccess() {
    playTone(600, "sine", 0.1, 0.03);
    setTimeout(() => playTone(1200, "sine", 0.4, 0.03), 100);
    if (navigator.vibrate) navigator.vibrate([15, 30, 20]);
  }

  // --- CRYPTO CORE (CM8P) ---
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

  async function importAesKey(rawKeyBytes) {
    return crypto.subtle.importKey("raw", rawKeyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  async function deriveMessageKeyFromPattern(pattern, saltB64) {
    const salt = base64UrlToBytes(saltB64);
    const patternMaterial = pattern.join("-");
    const raw = await crypto.subtle.importKey("raw", encoder.encode(patternMaterial), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({
      name: "PBKDF2", salt, iterations: truth.limits.pbkdf2Iterations, hash: "SHA-256"
    }, raw, 256);
    return importAesKey(new Uint8Array(bits));
  }

  async function encryptWithPatternKey(plainText, pattern) {
    const salt = bytesToBase64Url(randomBytes(16));
    const iv = randomBytes(12);
    const key = await deriveMessageKeyFromPattern(pattern, salt);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plainText));
    return { salt, iv: bytesToBase64Url(iv), cipher: bytesToBase64Url(new Uint8Array(cipher)) };
  }

  async function decryptCapsule(capsule, pattern) {
    const iv = base64UrlToBytes(capsule.iv);
    const cipher = base64UrlToBytes(capsule.c);
    const key = await deriveMessageKeyFromPattern(pattern, capsule.salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return decoder.decode(plain);
  }

  // --- CAPSULE PARSING ---
  function getBaseUrl() {
    if (truth.publicBaseUrl) return truth.publicBaseUrl.replace(/#.*$/, "");
    return `${location.origin}${location.pathname}`.replace(/index\.html$/, "");
  }

  function compactCapsule(capsule) {
    return [VERSION, capsule.skin || "candy", capsule.ep.codes, capsule.salt, capsule.iv, capsule.c].join(".");
  }

  function capsuleToLink(capsule) {
    return `${getBaseUrl()}#${compactCapsule(capsule)}`;
  }

  function emojiPasswordFromCodes(codes) {
    const picked = String(codes || "").split("").map((c) => truth.safeSymbolSet.find((x) => x.code === c)).filter(Boolean);
    return { codes: picked.map((x) => x.code).join(""), symbols: picked.map((x) => x.emoji).join(" "), words: picked.map((x) => x.word).join("-") };
  }

  function pickEmojiPassword() {
    const pool = truth.safeSymbolSet.slice();
    const picked = [];
    while (picked.length < 3 && pool.length) {
      const idx = crypto.getRandomValues(new Uint32Array(1))[0] % pool.length;
      picked.push(pool.splice(idx, 1)[0]);
    }
    return { codes: picked.map((x) => x.code).join(""), symbols: picked.map((x) => x.emoji).join(" "), words: picked.map((x) => x.word).join("-") };
  }

  function extractCapsuleFromText(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    const hash = text.includes("#") ? text.split("#").pop() : text;
    const cm8p = hash.match(/CM8P\.([a-z0-9-]+)\.([A-L]{3})\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/i);
    if (cm8p) return { v: "CM8P", skin: cm8p[1].toLowerCase(), ep: emojiPasswordFromCodes(cm8p[2].toUpperCase()), salt: cm8p[3], iv: cm8p[4], c: cm8p[5] };
    return null;
  }

  // --- UI HELPERS ---
  function applySkin(skinCode) {
    const safe = truth.skins.some((s) => s.code === skinCode) ? skinCode : "candy";
    state.currentSkin = safe;
    document.body.dataset.skin = safe;
  }

  function setStatus(msg) {
    const s = $("statusLine");
    if (s) s.textContent = msg || "";
  }

  function clearDynamic() {
    const area = $("dynamicArea");
    if (area) area.innerHTML = "";
    const btn = $("primaryBtn");
    if (btn) { btn.className = "hidden"; btn.onclick = null; }
    setStatus("");
  }

  function shareText(text) {
    const enc = encodeURIComponent(text);
    window.location.href = `https://wa.me/?text=${enc}`;
  }

  // --- MAGIC GESTURE GRID ---
  function renderGestureGrid(onPatternComplete) {
    const wrap = document.createElement("div");
    wrap.className = "pattern-wrap";
    const grid = document.createElement("div");
    grid.className = "pattern-grid";
    wrap.appendChild(grid);

    const dots = [];
    state.pattern = [];

    for (let i = 1; i <= 9; i++) {
      const dot = document.createElement("div");
      dot.className = "pattern-dot";
      dot.dataset.val = i;
      grid.appendChild(dot);
      dots.push({ el: dot, val: i });
    }

    function activateDot(el, val) {
      if (!state.pattern.includes(val)) {
        initAudio();
        state.pattern.push(val);
        el.classList.add("selected");
        soundTick();
      }
    }

    function handleMove(e) {
      if (!state.isDrawing) return;
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (target && target.classList.contains("pattern-dot")) {
        const val = parseInt(target.dataset.val, 10);
        activateDot(target, val);
      }
    }

    function handleEnd() {
      if (!state.isDrawing) return;
      state.isDrawing = false;
      if (state.pattern.length >= 4) {
        onPatternComplete([...state.pattern]);
      } else {
        state.pattern = [];
        dots.forEach(d => d.el.classList.remove("selected"));
      }
    }

    grid.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      initAudio();
      state.isDrawing = true;
      state.pattern = [];
      dots.forEach(d => d.el.classList.remove("selected"));
      if (e.target.classList.contains("pattern-dot")) {
        activateDot(e.target, parseInt(e.target.dataset.val, 10));
      }
    });

    grid.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    grid.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    return wrap;
  }

  // --- STATE MACHINE ---
  function showScreen(name) {
    state.screen = name;
    clearDynamic();
    
    if (name === "compose") renderCompose();
    if (name === "incomingLocked") renderIncomingLocked();
    if (name === "incomingOpen") renderIncomingOpen();
  }

  function renderCompose() {
    applySkin("candy");
    state.outgoingSign = pickEmojiPassword();
    const area = $("dynamicArea");

    const input = document.createElement("textarea");
    input.className = "message-input";
    input.placeholder = "\u05DB\u05EA\u05D5\u05D1 \u05DE\u05E9\u05D4\u05D5 \u05E7\u05E6\u05E8...";
    input.maxLength = truth.limits.maxMessageChars;
    area.appendChild(input);

    const sign = document.createElement("div");
    sign.style.textAlign = "center";
    sign.style.fontSize = "2rem";
    sign.style.marginBottom = "8px";
    sign.textContent = state.outgoingSign.symbols;
    area.appendChild(sign);

    const grid = renderGestureGrid((pattern) => {
      if (input.value.trim().length > 0) {
        $("primaryBtn").classList.remove("hidden");
      }
    });
    area.appendChild(grid);

    const btn = $("primaryBtn");
    btn.textContent = "\u05E9\u05DC\u05D7 \u05D1\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4";
    btn.onclick = async () => {
      const msg = input.value.trim();
      if (!msg || state.pattern.length < 4) return;
      btn.textContent = "...";
      soundSuccess();
      const cap = await encryptWithPatternKey(msg, state.pattern);
      const fullCapsule = { v: "CM8P", skin: state.currentSkin, ep: state.outgoingSign, salt: cap.salt, iv: cap.iv, c: cap.cipher };
      const link = capsuleToLink(fullCapsule);
      const text = `${truth.teaserTemplates.he.replace("{emojiPassword}", state.outgoingSign.symbols).replace("{emojiWords}", "").replace("{link}", link)}`;
      shareText(text);
      showScreen("compose");
    };
  }

  function renderIncomingLocked() {
    applySkin(state.currentCapsule.skin);
    const area = $("dynamicArea");

    const sign = document.createElement("div");
    sign.style.textAlign = "center";
    sign.style.fontSize = "2.8rem";
    sign.style.marginTop = "20px";
    sign.textContent = state.currentCapsule.ep.symbols;
    area.appendChild(sign);

    const grid = renderGestureGrid(async (pattern) => {
      setStatus("\u05E4\u05D5\u05EA\u05D7...");
      try {
        const plain = await decryptCapsule(state.currentCapsule, pattern);
        state.unlockedPlain = plain;
        soundSuccess();
        showScreen("incomingOpen");
      } catch {
        soundFail();
        setStatus("\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1");
        state.pattern = [];
        document.querySelectorAll(".pattern-dot").forEach(d => d.classList.remove("selected"));
      }
    });
    area.appendChild(grid);
  }

  function renderIncomingOpen() {
    const area = $("dynamicArea");
    const msg = document.createElement("div");
    msg.className = "message-input";
    msg.style.display = "flex";
    msg.style.alignItems = "center";
    msg.style.justifyContent = "center";
    msg.style.fontSize = "1.6rem";
    msg.textContent = state.unlockedPlain;
    area.appendChild(msg);

    const btn = $("primaryBtn");
    btn.classList.remove("hidden");
    btn.textContent = "\u05D4\u05E9\u05D1";
    btn.onclick = () => {
      state.currentCapsule = null;
      state.unlockedPlain = "";
      showScreen("compose");
    };
  }

  function boot() {
    document.body.addEventListener("pointerdown", initAudio, { once: true });
    const cap = extractCapsuleFromText(location.hash);
    if (cap) {
      state.currentCapsule = cap;
      showScreen("incomingLocked");
    } else {
      showScreen("compose");
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
