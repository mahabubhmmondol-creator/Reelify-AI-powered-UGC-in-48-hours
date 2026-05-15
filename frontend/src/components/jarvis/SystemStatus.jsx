import { Power, Activity, Cpu, Wifi } from "lucide-react";
import { Waveform } from "./Waveform";

const STATE_META = {
  IDLE: { label: "STANDBY", color: "#737373", dot: "#737373" },
  LISTENING: { label: "LISTENING", color: "#ff3b30", dot: "#ff3b30" },
  PROCESSING: { label: "PROCESSING", color: "#ffffff", dot: "#ffffff" },
  SPEAKING: { label: "SPEAKING", color: "#ff3b30", dot: "#ff3b30" },
};

export const SystemStatus = ({ state = "IDLE", model = "claude-sonnet-4-5" }) => {
  const meta = STATE_META[state] || STATE_META.IDLE;
  const active = state === "LISTENING" || state === "SPEAKING";

  return (
    <div
      data-testid="system-status"
      className="border border-[#222] bg-[#0a0a0a] relative overflow-hidden"
    >
      <div className="px-5 pt-5 pb-3 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Power size={14} strokeWidth={1.5} className="text-[#ff3b30]" />
            <span className="font-mono text-[10px] tracking-[0.25em] text-neutral-500">
              SYSTEM
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-[0.25em] text-neutral-500">
            v1.0
          </span>
        </div>
        <div className="mt-4 flex items-baseline gap-3">
          <h1
            className="font-black tracking-tighter uppercase text-5xl"
            style={{ fontFamily: "Cabinet Grotesk" }}
          >
            JARVIS
          </h1>
          <span className="font-mono text-[10px] tracking-[0.25em] text-neutral-500">
            FOR&nbsp;KARIM
          </span>
        </div>
      </div>

      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-[8px] h-[8px] rounded-full ${active ? "dot-blink" : ""}`}
            style={{ background: meta.dot }}
          />
          <span
            data-testid="state-label"
            className="font-mono text-[11px] tracking-[0.25em]"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
        <Waveform active={active} color={meta.color} bars={18} />
      </div>

      <div className="grid grid-cols-3 border-t border-[#1a1a1a]">
        <div className="px-4 py-3 border-r border-[#1a1a1a]">
          <div className="font-mono text-[9px] tracking-[0.25em] text-neutral-500 flex items-center gap-1">
            <Cpu size={11} strokeWidth={1.5} /> MODEL
          </div>
          <div className="font-mono text-[11px] mt-1 text-white truncate">
            {model}
          </div>
        </div>
        <div className="px-4 py-3 border-r border-[#1a1a1a]">
          <div className="font-mono text-[9px] tracking-[0.25em] text-neutral-500 flex items-center gap-1">
            <Wifi size={11} strokeWidth={1.5} /> NET
          </div>
          <div className="font-mono text-[11px] mt-1 text-white">SECURE</div>
        </div>
        <div className="px-4 py-3">
          <div className="font-mono text-[9px] tracking-[0.25em] text-neutral-500 flex items-center gap-1">
            <Activity size={11} strokeWidth={1.5} /> LOAD
          </div>
          <div className="font-mono text-[11px] mt-1 text-white">
            {state === "PROCESSING" ? "73%" : "12%"}
          </div>
        </div>
      </div>
    </div>
  );
};
