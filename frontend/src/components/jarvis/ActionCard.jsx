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
} from "lucide-react";

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

export const ActionCard = ({ action }) => {
  if (!action || typeof action !== "object") return null;
  const type = action.type || "custom";
  const Icon = ICONS[type] || Terminal;
  const label = LABELS[type] || type.toUpperCase().replace(/_/g, " ");

  // separate type from params
  const params = Object.entries(action).filter(([k]) => k !== "type");

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
        <span className="font-mono text-[10px] tracking-[0.2em] text-neutral-500">
          EXECUTED
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
    </div>
  );
};
