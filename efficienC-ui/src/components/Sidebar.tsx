import type { ReactElement } from "react";
import { motion } from "framer-motion";

const EASE: [number, number, number, number] = [0, 0, 0.2, 1];

interface NavItem {
  id: string;
  label: string;
  icon: ReactElement;
  dot?: "violet" | "emerald" | "amber";
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "tasks",
    label: "Tasks",
    dot: "violet",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    id: "activity",
    label: "Activity",
    dot: "emerald",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    id: "automations",
    label: "Automations",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
      </svg>
    ),
  },
];

interface Props {
  activeNav: string;
  onNavChange: (id: string) => void;
  pendingCount?: number;
}

export default function Sidebar({ activeNav, onNavChange, pendingCount = 0 }: Props) {
  return (
    <motion.aside
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="w-[220px] flex-shrink-0 h-full flex flex-col"
      style={{
        borderRight: "1px solid rgba(255,255,255,0.05)",
        background: "linear-gradient(180deg, rgba(109,40,217,0.04) 0%, transparent 30%)",
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
              boxShadow: "0 0 20px rgba(124,58,237,0.4), 0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold tracking-tight leading-none" style={{ color: "rgba(255,255,255,0.92)" }}>
              EfficienC
            </p>
            <p className="text-[9.5px] mt-0.5 leading-tight" style={{ color: "rgba(255,255,255,0.38)" }}>
              Execution, without the effort.
            </p>
          </div>
        </div>
      </div>

      {/* Nav label */}
      <div className="px-5 pt-5 pb-2">
        <p className="text-[9px] font-semibold text-white/15 uppercase tracking-[0.18em]">
          Navigation
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={activeNav === item.id}
            onClick={() => onNavChange(item.id)}
            badge={item.id === "tasks" && pendingCount > 0 ? pendingCount : undefined}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {/* Model indicator */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "rgba(109,40,217,0.15)", border: "1px solid rgba(139,92,246,0.2)" }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-white/30 leading-none">Groq · Llama 3.3</p>
          </div>
        </div>

        {/* System online */}
        <div className="flex items-center gap-2">
          <motion.span
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
          />
          <span className="text-[10px] text-white/20 tracking-wide">System online</span>
        </div>
      </div>
    </motion.aside>
  );
}

function NavButton({
  item,
  isActive,
  onClick,
  badge,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ x: isActive ? 0 : 2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left relative overflow-hidden transition-all duration-150"
      style={
        isActive
          ? {
              background: "linear-gradient(90deg, rgba(109,40,217,0.18), rgba(109,40,217,0.06))",
              border: "1px solid rgba(139,92,246,0.2)",
              color: "#c4b5fd",
            }
          : {
              border: "1px solid transparent",
              color: "rgba(255,255,255,0.3)",
            }
      }
    >
      {/* Active left bar */}
      {isActive && (
        <motion.span
          layoutId="nav-active-bar"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
          style={{ background: "linear-gradient(180deg, #a78bfa, #7c3aed)" }}
          transition={{ duration: 0.22, ease: EASE }}
        />
      )}

      {/* Active glow */}
      {isActive && (
        <div
          className="absolute inset-0 pointer-events-none rounded-xl"
          style={{ boxShadow: "inset 0 0 20px rgba(109,40,217,0.08)" }}
        />
      )}

      <span className={`flex-shrink-0 pl-1 transition-colors duration-150 ${isActive ? "text-violet-300" : "text-white/30 group-hover:text-white/50"}`}>
        {item.icon}
      </span>
      <span className="text-[13px] font-medium leading-none flex-1">{item.label}</span>

      {/* Task count badge */}
      {badge !== undefined && (
        <span
          className="text-[9px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full"
          style={{
            background: isActive ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.07)",
            color: isActive ? "#c4b5fd" : "rgba(255,255,255,0.25)",
            border: isActive ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {badge}
        </span>
      )}
    </motion.button>
  );
}
