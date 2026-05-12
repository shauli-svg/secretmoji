(() => {
  "use strict";

  const truth = window.CodeMojiTruth;
  const VERSION = truth.version;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const $ = (id) => document.getElementById(id);

  const STATES = Object.freeze({
    BOOT: "boot",
    COMPOSE: "compose",
    COMPOSE_DRAWING: "composeDrawing",
    INCOMING_LOCKED: "incomingLocked",
    INCOMING_TRYING: "incomingTrying",
    INCOMING_OPEN: "incomingOpen",
    REPLY: "reply",
    SETTINGS: "settings",
    FALLBACK: "fallback"
  });

  const state = {
    route: STATES.BOOT,
    currentCapsule: null,
    currentSkin: "candy",
    outgoingSign: null,
    outgoingPattern: [],
    replyPattern: [],
    pattern: [],
    latestShareText: "",
    latestLink: "",
    unlockedPlain: "",
    composeDraft: "",
    replyDraft: "",
    hasHash: false,
    parseOk: false,
    lastDecryptStatus: "idle",
    resetTimer: null,
    audio: null
  };

  function debugReadback() {
    window.CodeMojiDebug = {
      version: VERSION,
      hasHash: state.hasHash,
      capsuleVersion: state.currentCapsule?.v || null,
      parseOk: state.parseOk,
      route: state.route,
      currentCapsuleExists: Boolean(state.currentCapsule),
      lastDecryptStatus: state.lastDecryptStatus
    };
  }

  function setStatus(message) {
    $("statusLine").textContent = message || "";
    debugReadback();
  }

  function setTitle(title, subtitle) {
    $("cardTitle").textContent = title;
    $("cardSubtitle").textContent = subtitle || "";
  }

  function card() {
    return $("appCard");
  }

  function setPrimaryVisible(visible) {
    $("primaryBtn").classList.toggle("hidden", !visible);
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
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
    $("primaryBtn").onclick = null;
    $("primaryBtn").onpointerdown = null;
    $("primaryBtn").onpointerup = null;
    $("primaryBtn").onpointerleave = null;
    $("primaryBtn").disabled = false;
    $("primaryBtn").classList.remove("hidden");
    card().className = "codemoji-card glass";
    card().dataset.route = state.route;
    setStatus("");
  }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function createButton(label, className, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className || "secondary-btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {}
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  function tone(kind) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!state.audio) state.audio = new AudioContext();
      const ctx = state.audio;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const map = {
        tick: [720, 0.035, 0.018],
        success: [920, 0.12, 0.032],
        fail: [180, 0.08, 0.025]
      };
      const [freq, duration, volume] = map[kind] || map.tick;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {}
  }

  function patternPointCenter(grid, dot) {
    const g = grid.getBoundingClientRect();
    const d = dot.getBoundingClientRect();
    return {
      x: d.left + d.width / 2 - g.left,
      y: d.top + d.height / 2 - g.top
    };
  }

  function renderPatternGrid(options = {}) {
    const wrap = createEl("div", "pattern-wrap");
    if (options.variant) wrap.dataset.variant = options.variant;

    const grid = createEl("div", "pattern-grid");
    grid.setAttribute("data-pattern-grid", "");
    grid.setAttribute("aria-label", "לוח ציור סימן 3 על 3");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("pattern-line-layer");
    svg.setAttribute("aria-hidden", "true");
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.classList.add("pattern-line");
    svg.appendChild(polyline);
    grid.appendChild(svg);

    const dots = new Map();
    let localPattern = [];
    let activePointerId = null;
    let currentPointer = null;
    let completed = false;

    const readout = createEl("div", "pattern-readout", options.initialText || "צייר/י סימן");

    function emitChange() {
      if (typeof options.onChange === "function") options.onChange(localPattern.slice());
    }

    function updateReadout() {
      const min = truth.limits.minPatternPoints;
      if (localPattern.length === 0) {
        readout.textContent = options.initialText || "צייר/י סימן";
      } else if (localPattern.length < min) {
        readout.textContent = `עוד ${min - localPattern.length}`;
      } else {
        readout.textContent = options.readyText || "מוכן";
      }
    }

    function updateLine() {
      const points = localPattern
        .map((point) => dots.get(point))
        .filter(Boolean)
        .map((dot) => patternPointCenter(grid, dot));

      if (currentPointer && points.length) points.push(currentPointer);
      polyline.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
    }

    function resetLocalPattern() {
      localPattern = [];
      completed = false;
      currentPointer = null;
      dots.forEach((dot) => dot.classList.remove("selected"));
      updateLine();
      updateReadout();
      emitChange();
    }

    function addPoint(point) {
      if (localPattern.includes(point)) return;
      localPattern.push(point);
      dots.get(point)?.classList.add("selected");
      vibrate(8);
      tone("tick");
      updateLine();
      updateReadout();
      emitChange();
    }

    function dotFromClient(x, y) {
      const el = document.elementFromPoint(x, y);
      const dot = el?.closest?.(".pattern-dot");
      if (dot && grid.contains(dot)) return dot;
      return null;
    }

    function start(e, point) {
      if (options.disabled) return;
      if (completed || !activePointerId) resetLocalPattern();
      activePointerId = e.pointerId;
      grid.setPointerCapture?.(activePointerId);
      grid.classList.add("drawing");
      addPoint(point);
      e.preventDefault();
    }

    function move(e) {
      if (activePointerId !== e.pointerId) return;
      const g = grid.getBoundingClientRect();
      currentPointer = { x: e.clientX - g.left, y: e.clientY - g.top };
      const dot = dotFromClient(e.clientX, e.clientY);
      if (dot) addPoint(Number(dot.dataset.point));
      updateLine();
      e.preventDefault();
    }

    function end(e) {
      if (activePointerId !== e.pointerId) return;
      activePointerId = null;
      currentPointer = null;
      grid.classList.remove("drawing");
      updateLine();
      completed = true;
      state.pattern = localPattern.slice();
      if (typeof options.onComplete === "function") options.onComplete(localPattern.slice());
      e.preventDefault();
    }

    for (let i = 1; i <= 9; i += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "pattern-dot";
      dot.dataset.point = String(i);
      dot.setAttribute("aria-label", `נקודה ${i}`);
      dot.addEventListener("pointerdown", (e) => start(e, i));
      dots.set(i, dot);
      grid.appendChild(dot);
    }

    grid.addEventListener("pointermove", move);
    grid.addEventListener("pointerup", end);
    grid.addEventListener("pointercancel", end);
    window.addEventListener("resize", updateLine);

    if (options.ghostTrace && !prefersReducedMotion()) {
      const ghost = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      ghost.classList.add("pattern-ghost-line");
      svg.appendChild(ghost);
      requestAnimationFrame(() => {
        const hint = options.ghostPattern || [1, 2, 3, 6];
        const points = hint
          .map((point) => dots.get(point))
          .filter(Boolean)
          .map((dot) => patternPointCenter(grid, dot));
        ghost.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
        grid.classList.add("show-ghost");
        window.setTimeout(() => {
          grid.classList.remove("show-ghost");
          window.setTimeout(() => ghost.remove(), 260);
        }, 900);
      });
    }

    updateReadout();
    wrap.appendChild(grid);
    wrap.appendChild(readout);
    return wrap;
  }

  function transition(next, patch = {}) {
    Object.assign(state, patch);
    state.route = next;
    debugReadback();
    render();
  }

  function render() {
    clearDynamic();
    if (state.route === STATES.COMPOSE) return renderCompose();
    if (state.route === STATES.INCOMING_LOCKED) return renderIncomingLocked();
    if (state.route === STATES.INCOMING_TRYING) return renderIncomingTrying();
    if (state.route === STATES.INCOMING_OPEN) return renderIncomingOpen();
    if (state.route === STATES.REPLY) return renderReply();
    if (state.route === STATES.SETTINGS) return renderSettings();
    if (state.route === STATES.FALLBACK) return renderFallback();
    return renderCompose();
  }

  function renderCompose() {
    state.currentCapsule = null;
    state.parseOk = false;
    state.lastDecryptStatus = "idle";
    state.outgoingSign ||= pickEmojiPassword();
    if (!state.currentSkin) applySkin(pickSkin());

    setTitle("כתוב/י פתק", "צייר/י סימן קטן ושלח/י.");
    const area = $("dynamicArea");

    const textarea = document.createElement("textarea");
    textarea.id = "messageInput";
    textarea.className = "message-input";
    textarea.maxLength = truth.limits.maxMessageChars;
    textarea.rows = 4;
    textarea.placeholder = "משהו קצר ומסקרן...";
    textarea.value = state.composeDraft || "";
    area.appendChild(textarea);

    const progress = createEl("div", "text-progress");
    const bar = createEl("span", "text-progress-bar");
    progress.appendChild(bar);
    area.appendChild(progress);

    const sign = createEl("div", "sign-card compact-sign");
    sign.innerHTML = `
      <span>סימן שיתוף</span>
      <strong dir="ltr">${state.outgoingSign.symbols}</strong>
      <small dir="ltr">${state.outgoingSign.words}</small>
    `;
    area.appendChild(sign);

    const skinRow = createEl("div", "skin-row");
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

    const hint = createEl("div", "micro-hint", "צייר/י את הסימן שהמקבל יכיר.");
    area.appendChild(hint);

    function updateValid() {
      state.composeDraft = textarea.value;
      const pct = Math.min(100, Math.round((textarea.value.length / truth.limits.maxMessageChars) * 100));
      bar.style.width = `${pct}%`;
      $("primaryBtn").disabled = !(textarea.value.trim() && state.outgoingPattern.length >= truth.limits.minPatternPoints);
      debugReadback();
    }

    area.appendChild(renderPatternGrid({
      variant: "compose",
      initialText: "צייר/י סימן",
      readyText: "סימן מוכן",
      onChange(pattern) {
        state.outgoingPattern = pattern;
        updateValid();
      },
      onComplete(pattern) {
        state.outgoingPattern = pattern;
        updateValid();
      }
    }));

    $("primaryBtn").textContent = "שלח ב־WhatsApp";
    $("primaryBtn").onclick = async () => {
      const message = textarea.value.trim();
      if (!message) return setStatus("כתוב/י הודעה.");
      if (state.outgoingPattern.length < truth.limits.minPatternPoints) return setStatus("צייר/י לפחות 4 נקודות.");
      try {
        const capsule = await makeCapsule(message, state.outgoingPattern);
        state.latestShareText = buildShareText(capsule);
        state.latestLink = capsuleToLink(capsule);
        state.currentCapsule = capsule;
        openWhatsApp(state.latestShareText);
      } catch {
        setStatus("לא הצלחתי ליצור קוד. נסה/י שוב.");
      }
    };

    $("secondaryRow").appendChild(createButton("חדש", "ghost-btn", () => {
      state.composeDraft = "";
      state.outgoingPattern = [];
      state.outgoingSign = pickEmojiPassword();
      applySkin(pickSkin());
      transition(STATES.COMPOSE);
    }));

    updateValid();
  }

  function renderIncomingLocked() {
    const capsule = state.currentCapsule;
    applySkin(capsule?.skin || "candy");
    setPrimaryVisible(false);
    setTitle("צייר/י לפתיחה", "");

    const area = $("dynamicArea");
    const visible = createEl("div", "sign-card incoming-sign compact-sign");
    visible.innerHTML = `
      <span>CodeMoji</span>
      <strong dir="ltr">${capsule?.ep?.symbols || ""}</strong>
      <small dir="ltr">${capsule?.ep?.words || ""}</small>
    `;
    area.appendChild(visible);

    area.appendChild(renderPatternGrid({
      variant: "incoming",
      ghostTrace: true,
      initialText: state.lastDecryptStatus === "fail" ? "נסה שוב" : "המחווה היא הכפתור",
      readyText: "פותח...",
      onComplete(pattern) {
        if (pattern.length < truth.limits.minPatternPoints) {
          setStatus("עוד קצת.");
          return;
        }
        unlockWithPattern(pattern);
      }
    }));
  }

  function renderIncomingTrying() {
    setPrimaryVisible(false);
    setTitle("פותח...", "");
    const area = $("dynamicArea");
    area.appendChild(createEl("div", "unlock-pulse", "✦"));
    setStatus("בודק את הסימן");
  }

  async function unlockWithPattern(pattern) {
    if (!state.currentCapsule) return transition(STATES.COMPOSE);
    state.pattern = pattern.slice();
    state.lastDecryptStatus = "trying";
    transition(STATES.INCOMING_TRYING);

    try {
      const plain = await decryptCapsule(state.currentCapsule, state.pattern);
      state.unlockedPlain = plain;
      state.lastDecryptStatus = "success";
      vibrate(28);
      tone("success");
      transition(STATES.INCOMING_OPEN);
    } catch {
      state.unlockedPlain = "";
      state.lastDecryptStatus = "fail";
      vibrate([12, 24, 12]);
      tone("fail");
      transition(STATES.INCOMING_LOCKED);
      card().classList.add("soft-shake");
      window.setTimeout(() => card().classList.remove("soft-shake"), 360);
      setStatus("נסה שוב");
    }
  }

  function renderIncomingOpen() {
    setTitle("נפתח", "");
    const area = $("dynamicArea");
    const msg = createEl("article", "plain-message reveal-message");
    msg.textContent = state.unlockedPlain || "";
    area.appendChild(msg);

    $("primaryBtn").textContent = "השב/י";
    $("primaryBtn").onclick = () => transition(STATES.REPLY, {
      replyDraft: "",
      replyPattern: [],
      outgoingPattern: [],
      outgoingSign: pickEmojiPassword()
    });
  }

  function renderReply() {
    state.outgoingSign ||= pickEmojiPassword();
    applySkin(state.currentSkin || pickSkin());
    setTitle("תשובה קטנה", "כתוב/י, צייר/י, שלח/י.");

    const area = $("dynamicArea");
    const textarea = document.createElement("textarea");
    textarea.id = "replyInput";
    textarea.className = "message-input";
    textarea.maxLength = truth.limits.maxMessageChars;
    textarea.rows = 4;
    textarea.placeholder = "תשובה קצרה...";
    textarea.value = state.replyDraft || "";
    area.appendChild(textarea);

    const progress = createEl("div", "text-progress");
    const bar = createEl("span", "text-progress-bar");
    progress.appendChild(bar);
    area.appendChild(progress);

    const sign = createEl("div", "sign-card compact-sign");
    sign.innerHTML = `
      <span>סימן שיתוף</span>
      <strong dir="ltr">${state.outgoingSign.symbols}</strong>
      <small dir="ltr">${state.outgoingSign.words}</small>
    `;
    area.appendChild(sign);

    const hint = createEl("div", "micro-hint", "צייר/י סימן לתשובה.");
    area.appendChild(hint);

    function updateValid() {
      state.replyDraft = textarea.value;
      const pct = Math.min(100, Math.round((textarea.value.length / truth.limits.maxMessageChars) * 100));
      bar.style.width = `${pct}%`;
      $("primaryBtn").disabled = !(textarea.value.trim() && state.replyPattern.length >= truth.limits.minPatternPoints);
    }

    area.appendChild(renderPatternGrid({
      variant: "reply",
      initialText: "צייר/י סימן",
      readyText: "סימן מוכן",
      onChange(pattern) {
        state.replyPattern = pattern;
        updateValid();
      },
      onComplete(pattern) {
        state.replyPattern = pattern;
        updateValid();
      }
    }));

    $("primaryBtn").textContent = "שלח ב־WhatsApp";
    $("primaryBtn").onclick = async () => {
      const message = textarea.value.trim();
      if (!message) return setStatus("כתוב/י תשובה.");
      if (state.replyPattern.length < truth.limits.minPatternPoints) return setStatus("צייר/י לפחות 4 נקודות.");
      try {
        const capsule = await makeCapsule(message, state.replyPattern);
        state.latestShareText = buildShareText(capsule);
        state.latestLink = capsuleToLink(capsule);
        state.currentCapsule = capsule;
        openWhatsApp(state.latestShareText);
      } catch {
        setStatus("לא הצלחתי ליצור תשובה. נסה/י שוב.");
      }
    };

    $("secondaryRow").appendChild(createButton("חזרה", "ghost-btn", () => transition(STATES.INCOMING_OPEN)));
    updateValid();
  }

  function renderSettings() {
    setTitle("אפשרויות", "");
    const area = $("dynamicArea");
    area.appendChild(createEl("div", "soft-box", "כאן נשארים רק דברים צדדיים. המסך הראשי נשאר נקי."));

    $("primaryBtn").textContent = "חזרה";
    $("primaryBtn").onclick = () => {
      if (state.currentCapsule && state.unlockedPlain) return transition(STATES.INCOMING_OPEN);
      if (state.currentCapsule) return transition(STATES.INCOMING_LOCKED);
      return transition(STATES.COMPOSE);
    };

    $("secondaryRow").appendChild(createButton("העתק קישור אחרון", "secondary-btn", async () => {
      if (!state.latestShareText) return setStatus("אין קישור אחרון.");
      const ok = await copyText(state.latestShareText);
      setStatus(ok ? "הועתק." : "העתקה נחסמה.");
    }));
  }

  function renderFallback() {
    setTitle("שיתוף", "");
    const area = $("dynamicArea");
    area.appendChild(createEl("div", "soft-box", "אם השיתוף לא נפתח, אפשר להעתיק ולשלוח ידנית."));

    $("primaryBtn").textContent = "העתק";
    $("primaryBtn").onclick = async () => {
      const ok = await copyText(state.latestShareText);
      setStatus(ok ? "הועתק." : "העתקה נחסמה.");
    };
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

  function openWhatsApp(text) {
    try {
      window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
      setStatus("פותח WhatsApp...");
      window.setTimeout(() => {
        if (state.latestShareText) transition(STATES.FALLBACK);
      }, 900);
    } catch {
      copyText(text);
      transition(STATES.FALLBACK);
      setStatus("השיתוף נחסם. אפשר להעתיק.");
    }
  }

  function bootFromLocation() {
    state.hasHash = Boolean(location.hash);
    state.parseOk = false;
    state.lastDecryptStatus = "idle";

    const capsule = extractCapsuleFromText(location.hash);
    if (capsule && (capsule.v === "CM8P" || capsule.v === "CM8" || capsule.v === "SM7")) {
      state.currentCapsule = capsule;
      state.parseOk = true;
      applySkin(capsule.skin || "candy");
      return transition(STATES.INCOMING_LOCKED);
    }

    state.currentCapsule = null;
    state.unlockedPlain = "";
    state.outgoingPattern = [];
    state.replyPattern = [];
    state.outgoingSign = pickEmojiPassword();
    applySkin(pickSkin());
    return transition(STATES.COMPOSE);
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
    $("settingsBtn").addEventListener("click", () => transition(STATES.SETTINGS));
    bootFromLocation();
    window.addEventListener("hashchange", bootFromLocation);
    registerServiceWorker();
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
