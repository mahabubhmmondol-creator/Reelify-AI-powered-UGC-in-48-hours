// Browser Web Speech API helpers — SpeechRecognition + SpeechSynthesis
export function getRecognition() {
  const SR =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "en-US";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  return rec;
}

export function speak(text, { onStart, onEnd, onError, voice } = {}) {
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
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voice ||
    voices.find((v) => /google uk english male|daniel|alex|microsoft guy/i.test(v.name)) ||
    voices.find((v) => /en-GB|en_GB/i.test(v.lang)) ||
    voices.find((v) => /en-US|en_US/i.test(v.lang));
  if (preferred) u.voice = preferred;
  u.onstart = () => onStart && onStart();
  u.onend = () => onEnd && onEnd();
  u.onerror = (e) => onError && onError(e);
  window.speechSynthesis.speak(u);
  return u;
}

export function cancelSpeak() {
  try {
    window.speechSynthesis && window.speechSynthesis.cancel();
  } catch (e) {
    console.debug("cancelSpeak noop", e);
  }
}
