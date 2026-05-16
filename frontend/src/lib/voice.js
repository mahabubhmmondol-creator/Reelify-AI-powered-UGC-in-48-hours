// Browser Web Speech API + Sarvam TTS helpers

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// ---------------- SpeechRecognition (command mode) ----------------
export function getRecognition() {
  const SR =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "en-IN";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  return rec;
}

// ---------------- Wake-word continuous recognition ----------------
// Listens passively. On match, fires onWake() and keeps running.
const WAKE_PATTERNS = [
  /\bhey,?\s*jarvis\b/i,
  /\bjarvis\b/i,
  /\bজার্ভিস\b/i,
];

export function startWakeWord({ onWake, onError } = {}) {
  const SR =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) {
    onError && onError(new Error("no-speech-recognition"));
    return { stop: () => {} };
  }
  const rec = new SR();
  rec.lang = "en-IN";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let stopped = false;
  let triggered = false;

  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = (event.results[i][0].transcript || "").trim();
      if (!text) continue;
      if (WAKE_PATTERNS.some((re) => re.test(text))) {
        if (triggered) return;
        triggered = true;
        try { rec.stop(); } catch (e) { console.debug("wake stop noop", e); }
        onWake && onWake(text);
        return;
      }
    }
  };
  rec.onerror = (e) => {
    // Common "no-speech" / "aborted" are non-fatal; keep going via onend restart
    if (e && e.error && e.error !== "no-speech" && e.error !== "aborted") {
      console.warn("wake recognition error", e.error);
    }
  };
  rec.onend = () => {
    triggered = false;
    if (stopped) return;
    // auto-restart for true continuous listening
    try { rec.start(); } catch (e) { console.debug("wake restart noop", e); }
  };
  try {
    rec.start();
  } catch (e) {
    console.warn("wake start failed", e);
    onError && onError(e);
  }
  return {
    stop: () => {
      stopped = true;
      try { rec.stop(); } catch (e) { console.debug("wake stop noop", e); }
    },
  };
}

// ---------------- Browser fallback TTS ----------------
export function speakBrowser(text, { onStart, onEnd, onError } = {}) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onError && onError(new Error("no-tts"));
    return null;
  }
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    console.debug("speechSynthesis.cancel noop", e);
  }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.pitch = 0.85;
  u.volume = 1;
  u.onstart = () => onStart && onStart();
  u.onend = () => onEnd && onEnd();
  u.onerror = (e) => onError && onError(e);
  window.speechSynthesis.speak(u);
  return u;
}

// ---------------- Sarvam TTS (premium) ----------------
let _currentAudio = null;

export async function speakSarvam(
  text,
  { onStart, onEnd, onError, language = "en-IN", speaker = "anushka" } = {}
) {
  if (!text) {
    onError && onError(new Error("empty-text"));
    return null;
  }
  try {
    const r = await fetch(`${BACKEND}/api/jarvis/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language, speaker }),
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`tts ${r.status}: ${body}`);
    }
    const data = await r.json();
    return playAudioDataUrl(data.data_url, { onStart, onEnd, onError });
  } catch (e) {
    console.warn("Sarvam TTS failed, falling back to browser:", e.message);
    onError && onError(e);
    return speakBrowser(text, { onStart, onEnd });
  }
}

export function playAudioDataUrl(dataUrl, { onStart, onEnd, onError } = {}) {
  cancelSpeak();
  const a = new Audio(dataUrl);
  _currentAudio = a;
  a.onplay = () => onStart && onStart();
  a.onended = () => {
    if (_currentAudio === a) _currentAudio = null;
    onEnd && onEnd();
  };
  a.onerror = (e) => {
    if (_currentAudio === a) _currentAudio = null;
    onError && onError(e);
  };
  a.play().catch((e) => {
    console.warn("audio play blocked", e);
    onError && onError(e);
  });
  return a;
}

export function cancelSpeak() {
  try {
    if (_currentAudio) {
      _currentAudio.pause();
      _currentAudio.currentTime = 0;
      _currentAudio = null;
    }
  } catch (e) {
    console.debug("cancel audio noop", e);
  }
  try {
    window.speechSynthesis && window.speechSynthesis.cancel();
  } catch (e) {
    console.debug("cancelSpeak noop", e);
  }
}
