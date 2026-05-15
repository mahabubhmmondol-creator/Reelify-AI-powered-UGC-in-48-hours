import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@/App.css";
import axios from "axios";
import { Trash2, Volume2, VolumeX } from "lucide-react";

import { SystemStatus } from "./components/jarvis/SystemStatus";
import { CapabilityGrid } from "./components/jarvis/CapabilityGrid";
import { ConversationLog } from "./components/jarvis/ConversationLog";
import { InputBar } from "./components/jarvis/InputBar";
import { getRecognition, speak, cancelSpeak } from "./lib/voice";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const SESSION_ID = "karim-default";

function App() {
  const [messages, setMessages] = useState([]);
  const [state, setState] = useState("IDLE"); // IDLE | LISTENING | PROCESSING | SPEAKING
  const [interim, setInterim] = useState("");
  const [typedText, setTypedText] = useState("");
  const [lastJarvisId, setLastJarvisId] = useState(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const recRef = useRef(null);
  const micSupported = useMemo(() => !!getRecognition(), []);

  // ---------- Load history on mount ----------
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${API}/jarvis/history`, {
          params: { session_id: SESSION_ID },
        });
        setMessages(res.data || []);
      } catch (e) {
        console.error("history load failed", e);
      }
    };
    load();
    // warm up voices
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // ---------- Send to backend ----------
  const sendToJarvis = useCallback(
    async (text) => {
      const tempUserId = `tmp-${Date.now()}`;
      const userMsg = {
        id: tempUserId,
        session_id: SESSION_ID,
        role: "user",
        text,
        action: null,
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, userMsg]);
      setState("PROCESSING");

      try {
        const res = await axios.post(`${API}/jarvis/chat`, {
          text,
          session_id: SESSION_ID,
        });
        const { id, speak: spoken, action, timestamp } = res.data;
        const jarvisMsg = {
          id,
          session_id: SESSION_ID,
          role: "jarvis",
          text: spoken,
          action,
          timestamp,
        };
        setMessages((m) => [...m, jarvisMsg]);
        setLastJarvisId(id);

        // typewriter
        setTypedText("");
        const full = spoken || "";
        let i = 0;
        const tick = () => {
          i++;
          setTypedText(full.slice(0, i));
          if (i < full.length) {
            setTimeout(tick, 18);
          }
        };
        if (full.length > 0) tick();

        if (ttsEnabled && full) {
          setState("SPEAKING");
          speak(full, {
            onEnd: () => setState("IDLE"),
            onError: () => setState("IDLE"),
          });
        } else {
          setState("IDLE");
        }
      } catch (e) {
        console.error("chat failed", e);
        const errId = `err-${Date.now()}`;
        setMessages((m) => [
          ...m,
          {
            id: errId,
            session_id: SESSION_ID,
            role: "jarvis",
            text: "Channel disrupted, sir. Try again.",
            action: null,
            timestamp: new Date().toISOString(),
          },
        ]);
        setLastJarvisId(errId);
        setTypedText("Channel disrupted, sir. Try again.");
        setState("IDLE");
      }
    },
    [ttsEnabled]
  );

  // ---------- Microphone ----------
  const startMic = useCallback(() => {
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    setInterim("");
    setState("LISTENING");

    let finalText = "";
    rec.onresult = (event) => {
      let interimT = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimT += r[0].transcript;
      }
      setInterim(interimT || finalText);
    };
    rec.onerror = () => {
      setState("IDLE");
      setInterim("");
    };
    rec.onend = () => {
      const t = (finalText || interim || "").trim();
      setInterim("");
      if (t) {
        sendToJarvis(t);
      } else {
        setState("IDLE");
      }
    };
    try {
      rec.start();
    } catch (_) {
      setState("IDLE");
    }
  }, [interim, sendToJarvis]);

  const stopMic = useCallback(() => {
    try {
      recRef.current && recRef.current.stop();
    } catch (_) {}
  }, []);

  const handleToggleMic = () => {
    if (state === "LISTENING") stopMic();
    else if (state === "IDLE") startMic();
  };

  const handleCancelSpeak = () => {
    cancelSpeak();
    setState("IDLE");
  };

  const clearHistory = async () => {
    try {
      await axios.delete(`${API}/jarvis/history`, {
        params: { session_id: SESSION_ID },
      });
      setMessages([]);
      setLastJarvisId(null);
      setTypedText("");
    } catch (e) {
      console.error("clear failed", e);
    }
  };

  return (
    <div className="App min-h-screen bg-[#050505] text-white">
      <div className="min-h-screen grid-bg">
        <div className="max-w-[1480px] mx-auto px-4 lg:px-8 py-6">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="w-[8px] h-[8px] bg-[#ff3b30] dot-blink" />
              <span className="font-mono text-[10px] tracking-[0.3em] text-neutral-500">
                JARVIS&nbsp;//&nbsp;PERSONAL&nbsp;ASSISTANT
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid="toggle-tts-button"
                onClick={() => {
                  if (ttsEnabled) cancelSpeak();
                  setTtsEnabled((v) => !v);
                }}
                className="px-3 py-2 border border-[#222] hover:border-[#ff3b30] font-mono text-[10px] tracking-[0.2em] flex items-center gap-2"
              >
                {ttsEnabled ? <Volume2 size={12} strokeWidth={1.5} /> : <VolumeX size={12} strokeWidth={1.5} />}
                {ttsEnabled ? "VOICE ON" : "VOICE OFF"}
              </button>
              <button
                data-testid="clear-history-button"
                onClick={clearHistory}
                className="px-3 py-2 border border-[#222] hover:border-[#ff3b30] font-mono text-[10px] tracking-[0.2em] flex items-center gap-2"
              >
                <Trash2 size={12} strokeWidth={1.5} />
                CLEAR MEMORY
              </button>
            </div>
          </div>

          {/* Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Left column */}
            <div className="lg:col-span-1 space-y-4">
              <SystemStatus state={state} />
              <CapabilityGrid />
              <div className="border border-[#222] bg-[#0a0a0a] px-5 py-4">
                <div className="font-mono text-[10px] tracking-[0.25em] text-neutral-500 mb-2">
                  DIRECTIVE
                </div>
                <div className="font-mono text-[12px] leading-relaxed text-neutral-300">
                  Built exclusively for{" "}
                  <span className="text-white">Karim</span>. Calm, direct, loyal.
                  Confirms after acting, never before.
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="lg:col-span-3">
              <div className="border border-[#222] bg-[#0a0a0a] flex flex-col h-[calc(100vh-140px)] min-h-[560px] relative scanline overflow-hidden">
                <div className="px-5 py-3 border-b border-[#222] flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.25em] text-neutral-500">
                    INTERACTION&nbsp;LOG
                  </span>
                  <span
                    data-testid="msg-count"
                    className="font-mono text-[10px] tracking-[0.25em] text-neutral-500"
                  >
                    {messages.length.toString().padStart(3, "0")}&nbsp;ENTRIES
                  </span>
                </div>
                <ConversationLog
                  messages={messages}
                  typedText={typedText}
                  lastJarvisId={lastJarvisId}
                />
                <InputBar
                  state={state}
                  onSubmit={sendToJarvis}
                  onToggleMic={handleToggleMic}
                  micSupported={micSupported}
                  interimText={interim}
                  onCancelSpeak={handleCancelSpeak}
                />
              </div>
              {!micSupported && (
                <div className="mt-2 font-mono text-[10px] tracking-[0.2em] text-neutral-500">
                  // VOICE&nbsp;INPUT&nbsp;UNAVAILABLE&nbsp;IN&nbsp;THIS&nbsp;BROWSER&nbsp;— TYPE&nbsp;IS&nbsp;FINE
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
