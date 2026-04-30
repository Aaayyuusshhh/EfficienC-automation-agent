import type { ReactElement } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ActionLog } from "../api";

const TYPE_ICON: Record<ActionLog["type"], ReactElement> = {
  task: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  email: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  meeting: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  system: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
    </svg>
  ),
};

const TYPE_STYLE: Record<ActionLog["type"], string> = {
  task:    "bg-violet-500/10 text-violet-400",
  email:   "bg-sky-500/10 text-sky-400",
  meeting: "bg-amber-500/10 text-amber-400",
  system:  "bg-slate-500/10 text-slate-400",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface DateGroup {
  label: string;
  items: ActionLog[];
}

function groupByDate(logs: ActionLog[]): DateGroup[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const buckets: Record<string, ActionLog[]> = {};

  for (const log of logs) {
    const d = new Date(log.createdAt);
    d.setHours(0, 0, 0, 0);
    const t = d.getTime();
    const key =
      t === todayStart.getTime()     ? "Today" :
      t === yesterdayStart.getTime() ? "Yesterday" :
                                       "Older";
    (buckets[key] ??= []).push(log);
  }

  return (["Today", "Yesterday", "Older"] as const)
    .filter((label) => buckets[label]?.length)
    .map((label) => ({ label, items: buckets[label] }));
}

interface Props {
  logs: ActionLog[];
}

export default function ActivityFeed({ logs }: Props) {
  if (logs.length === 0) return null;

  const groups = groupByDate(logs);

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-semibold text-[#475569] uppercase tracking-widest">
          Activity
        </span>
        <span className="text-[11px] text-[#334155] tabular-nums">{logs.length}</span>
      </div>

      <div className="bg-[#1e293b] border border-[#334155] rounded-2xl overflow-hidden">
        {groups.map((group, groupIdx) => (
          <div key={group.label}>
            {/* Date group header */}
            <div
              className={[
                "flex items-center gap-3 px-4 py-2",
                groupIdx > 0 ? "border-t border-[#1a2742]" : "",
              ].join(" ")}
            >
              <span className="text-[10px] font-medium text-[#2d3f55] uppercase tracking-widest flex-shrink-0">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-[#1a2742]" />
            </div>

            {/* Items within this group */}
            <div className="divide-y divide-[#1a2742]">
              <AnimatePresence initial={false}>
                {group.items.map((log, i) => (
                  <motion.div
                    key={log._id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.22,
                      delay: i * 0.03,
                      ease: [0, 0, 0.2, 1],
                    }}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    {/* Type icon + status dot */}
                    <div className="relative flex-shrink-0 mt-0.5">
                      <div className={["w-6 h-6 rounded-lg flex items-center justify-center", TYPE_STYLE[log.type]].join(" ")}>
                        {TYPE_ICON[log.type]}
                      </div>
                      <span
                        className={[
                          "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1e293b]",
                          log.status === "success" ? "bg-emerald-400" : "bg-red-400",
                        ].join(" ")}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#cbd5e1] leading-snug truncate">
                        {log.title}
                      </p>
                      {log.details && (
                        <p className="text-[11px] text-[#475569] mt-0.5 truncate">
                          {log.details}
                        </p>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="flex-shrink-0 text-[10px] text-[#2d3f55] mt-0.5 tabular-nums">
                      {timeAgo(log.createdAt)}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
