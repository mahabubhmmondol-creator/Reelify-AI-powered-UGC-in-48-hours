import { useEffect, useRef } from "react";
import { ActionCard } from "./ActionCard";

const Line = ({ m, isLastJarvis, typedText }) => {
  if (m.role === "user") {
    return (
      <div
        data-testid="log-line-user"
        className="py-3 px-5 border-b border-[#111] flex gap-4 justify-end"
      >
        <div className="font-mono text-[10px] tracking-[0.25em] text-neutral-600 mt-1">
          KARIM
        </div>
        <div className="font-mono text-[13px] text-neutral-400 max-w-[80%] text-right">
          {m.text}
        </div>
      </div>
    );
  }
  // JARVIS
  const displayed = isLastJarvis && typedText !== undefined ? typedText : m.text;
  const stillTyping = isLastJarvis && typedText !== undefined && typedText.length < m.text.length;

  return (
    <div
      data-testid="log-line-jarvis"
      className="py-3 px-5 border-b border-[#111] flex gap-4"
    >
      <div className="font-mono text-[10px] tracking-[0.25em] mt-1 flex items-center gap-2">
        <span
          className="w-[6px] h-[6px] rounded-full"
          style={{ background: m.action ? "#ff3b30" : "#ffffff" }}
        />
        <span className="text-neutral-600">JARVIS</span>
      </div>
      <div className="flex-1 max-w-[85%]">
        <div className={`font-mono text-[13px] text-white leading-relaxed ${stillTyping ? "typewriter-caret" : ""}`}>
          {displayed}
        </div>
        {m.action && !stillTyping && <ActionCard action={m.action} />}
      </div>
    </div>
  );
};

export const ConversationLog = ({ messages, typedText, lastJarvisId }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages, typedText]);

  return (
    <div
      ref={ref}
      data-testid="conversation-log"
      className="flex-1 overflow-y-auto log-scroll relative"
    >
      {messages.length === 0 && (
        <div className="px-6 py-10 text-center">
          <div className="font-mono text-[10px] tracking-[0.3em] text-neutral-600 mb-3">
            BOOT&nbsp;SEQUENCE&nbsp;COMPLETE
          </div>
          <div
            className="font-black uppercase tracking-tighter text-2xl text-neutral-300"
            style={{ fontFamily: "Cabinet Grotesk" }}
          >
            At your service, sir.
          </div>
          <div className="font-mono text-[12px] text-neutral-500 mt-3 max-w-md mx-auto">
            Try: <span className="text-white">"Send Rakib an SMS that I'll be late."</span>
            <br />
            Or: <span className="text-white">"Set an alarm for 6:30 AM."</span>
          </div>
        </div>
      )}
      {messages.map((m) => (
        <Line
          key={m.id}
          m={m}
          isLastJarvis={m.id === lastJarvisId}
          typedText={m.id === lastJarvisId ? typedText : undefined}
        />
      ))}
    </div>
  );
};
