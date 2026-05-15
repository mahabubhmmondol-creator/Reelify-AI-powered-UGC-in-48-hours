import { useState } from "react";
import { Mic, MicOff, Send, Square } from "lucide-react";

export const InputBar = ({
  state,
  onSubmit,
  onToggleMic,
  micSupported,
  interimText,
  onCancelSpeak,
}) => {
  const [text, setText] = useState("");
  const listening = state === "LISTENING";
  const speaking = state === "SPEAKING";
  const processing = state === "PROCESSING";

  const submit = (e) => {
    e && e.preventDefault();
    const t = text.trim();
    if (!t || processing) return;
    onSubmit(t);
    setText("");
  };

  return (
    <div className="border-t border-[#222] bg-[#0a0a0a]">
      {interimText && listening && (
        <div className="px-5 py-2 font-mono text-[12px] text-[#ff3b30] border-b border-[#1a1a1a]">
          <span className="text-neutral-500 mr-2">&gt;</span>
          {interimText}
        </div>
      )}
      <form onSubmit={submit} className="flex items-stretch">
        <button
          type="button"
          data-testid="mic-toggle-button"
          onClick={onToggleMic}
          disabled={!micSupported}
          className={`px-5 flex items-center justify-center border-r border-[#222] transition-colors duration-100 ${
            listening
              ? "bg-[#ff3b30] text-black"
              : "bg-transparent text-white hover:bg-[#111]"
          } ${!micSupported ? "opacity-40 cursor-not-allowed" : ""}`}
          aria-label="Toggle microphone"
        >
          {listening ? <MicOff size={18} strokeWidth={1.5} /> : <Mic size={18} strokeWidth={1.5} />}
        </button>

        <input
          data-testid="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            processing
              ? "Processing…"
              : listening
              ? "Listening, sir…"
              : "Type a command, or press the mic."
          }
          disabled={processing}
          className="flex-1 bg-transparent px-5 py-5 font-mono text-[13px] text-white placeholder-neutral-600 focus:outline-none"
        />

        {speaking ? (
          <button
            type="button"
            data-testid="cancel-speak-button"
            onClick={onCancelSpeak}
            className="px-5 flex items-center justify-center border-l border-[#222] bg-transparent text-[#ff3b30] hover:bg-[#111]"
            aria-label="Stop speaking"
          >
            <Square size={16} strokeWidth={1.5} />
          </button>
        ) : (
          <button
            type="submit"
            data-testid="send-button"
            disabled={!text.trim() || processing}
            className="px-5 flex items-center justify-center border-l border-[#222] bg-transparent text-white hover:bg-[#111] disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={16} strokeWidth={1.5} />
          </button>
        )}
      </form>
    </div>
  );
};
