import {
  MessageSquare,
  Phone,
  AppWindow,
  Bell,
  AlarmClock,
  Search,
  Mail,
  SlidersHorizontal,
} from "lucide-react";

const ITEMS = [
  { icon: MessageSquare, label: "SMS", id: "sms" },
  { icon: Phone, label: "CALLS", id: "calls" },
  { icon: AppWindow, label: "APPS", id: "apps" },
  { icon: Bell, label: "NOTIFY", id: "notify" },
  { icon: AlarmClock, label: "ALARMS", id: "alarms" },
  { icon: Search, label: "SEARCH", id: "search" },
  { icon: Mail, label: "EMAIL", id: "email" },
  { icon: SlidersHorizontal, label: "DEVICE", id: "device" },
];

export const CapabilityGrid = () => (
  <div
    data-testid="capability-grid"
    className="border border-[#222] bg-[#0a0a0a]"
  >
    <div className="px-5 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
      <span className="font-mono text-[10px] tracking-[0.25em] text-neutral-500">
        MODULES
      </span>
      <span className="font-mono text-[10px] tracking-[0.25em] text-[#ff3b30]">
        08&nbsp;ONLINE
      </span>
    </div>
    <div className="grid grid-cols-2">
      {ITEMS.map(({ icon: Icon, label, id }, i) => (
        <div
          key={id}
          data-testid={`capability-${id}`}
          className={`px-4 py-4 flex items-center gap-2 ${
            i % 2 === 0 ? "border-r border-[#1a1a1a]" : ""
          } ${i < ITEMS.length - 2 ? "border-b border-[#1a1a1a]" : ""}`}
        >
          <Icon size={13} strokeWidth={1.5} className="text-white" />
          <span className="font-mono text-[11px] tracking-[0.2em] text-white">
            {label}
          </span>
          <span className="ml-auto w-[6px] h-[6px] rounded-full bg-[#ff3b30]" />
        </div>
      ))}
    </div>
  </div>
);
