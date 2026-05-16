import { useState } from "react";
import axios from "axios";
import {
  MessageSquare,
  Phone,
  AppWindow,
  Bell,
  AlarmClock,
  CalendarClock,
  Search,
  Mail,
  Send,
  SlidersHorizontal,
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
} from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;

const ICONS = {
  send_sms: MessageSquare,
  make_call: Phone,
  open_app: AppWindow,
  read_notifications: Bell,
  set_alarm: AlarmClock,
  set_reminder: CalendarClock,
  web_search: Search,
  read_email: Mail,
  compose_email: Send,
  control_device: SlidersHorizontal,
  custom: Terminal,
};

const LABELS = {
  send_sms: "SEND SMS",
  make_call: "MAKE CALL",
  open_app: "OPEN APP",
  read_notifications: "READ NOTIFICATIONS",
  set_alarm: "SET ALARM",
  set_reminder: "SET REMINDER",
  web_search: "WEB SEARCH",
  read_email: "READ EMAIL",
  compose_email: "COMPOSE EMAIL",
  control_device: "DEVICE CONTROL",
  custom: "CUSTOM ACTION",
};

// Which action types support a real Twilio execution?
const EXECUTABLE = new Set(["send_sms", "make_call"]);

export const ActionCard = ({ action }) => {
  const [status, setStatus] = useState("READY"); // READY | RUNNING | DONE | FAILED
  const [resp, setResp] = useState(null);
  const [err, setErr] = useState(null);

  if (!action || typeof action !== "object") return null;
  const type = action.type || "custom";
  const Icon = ICONS[type] || Terminal;
  const label = LABELS[type] || type.toUpperCase().replace(/_/g, " ");
  const executable = EXECUTABLE.has(type);

  const params = Object.entries(action).filter(([k]) => k !== "type");

  const execute = async () => {
    setErr(null);
    setStatus("RUNNING");
    try {
      let url = "";
      let body = {};
      if (type === "send_sms") {
        url = `${API}/jarvis/twilio/sms`;
        body = { to: action.to, message: action.message };
      } else if (type === "make_call") {
        url = `${API}/jarvis/twilio/call`;
        body = { to: action.to, message: action.message };
      } else {
        return;
      }
      const r = await axios.post(url, body);
      setResp(r.data);
      setStatus("DONE");
    } catch (e) {
      const detail = e?.response?.data?.detail || e.message;
      setErr(detail);
      setStatus("FAILED");
    }
  };

  const statusColor =
    status === "DONE"
      ? "text-[#10b981]"
      : status === "FAILED"
      ? "text-[#ff3b30]"
      : status === "RUNNING"
      ? "text-white"
      : "text-neutral-500";

  return (
    <div
      data-testid={`action-card-${type}`}
      className="border border-[#222] bg-[#0a0a0a] mt-3 group hover:-translate-y-[2px] hover:border-[#ff3b30] transition-transform duration-100"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <Icon size={14} strokeWidth={1.5} className="text-[#ff3b30]" />
          <span className="font-mono text-[11px] tracking-[0.2em] text-white">
            {label}
          </span>
        </div>
        <span className={`font-mono text-[10px] tracking-[0.2em] ${statusColor}`}>
          {status}
        </span>
      </div>
      <div className="px-4 py-3 font-mono text-[12px] leading-relaxed">
        {params.length === 0 ? (
          <div className="text-neutral-500">// no parameters</div>
        ) : (
          params.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <span className="text-neutral-500 min-w-[88px]">{k}</span>
              <span className="text-white break-all">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))
        )}
      </div>

      {executable && (
        <div className="border-t border-[#1a1a1a] px-4 py-2 flex items-center justify-between gap-3">
          {err && (
            <span className="font-mono text-[10px] text-[#ff3b30] truncate max-w-[60%]" title={err}>
              {err}
            </span>
          )}
          {resp && status === "DONE" && (
            <span className="font-mono text-[10px] text-[#10b981] truncate max-w-[60%]">
              sid: {resp.sid} · {resp.status}
            </span>
          )}
          {!err && !resp && (
            <span className="font-mono text-[10px] text-neutral-500">
              Real Twilio · charges your account
            </span>
          )}
          <button
            data-testid={`execute-${type}`}
            onClick={execute}
            disabled={status === "RUNNING" || status === "DONE"}
            className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 border border-[#222] hover:border-[#ff3b30] hover:bg-[#ff3b30] hover:text-black font-mono text-[10px] tracking-[0.2em] text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-[#222] disabled:hover:text-white transition-colors"
          >
            {status === "RUNNING" ? (
              <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
            ) : status === "DONE" ? (
              <CheckCircle2 size={12} strokeWidth={1.5} />
            ) : status === "FAILED" ? (
              <XCircle size={12} strokeWidth={1.5} />
            ) : (
              <Zap size={12} strokeWidth={1.5} />
            )}
            {status === "DONE" ? "EXECUTED" : status === "FAILED" ? "RETRY" : "EXECUTE"}
          </button>
        </div>
      )}
    </div>
  );
};
