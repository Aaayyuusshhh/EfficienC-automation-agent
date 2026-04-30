import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Task } from "./TaskCard";
import type { ActionLog } from "../api";
import { getScheduled } from "../api";

// ── Count-up animation — runs once on mount, then shows value directly ────────
function CountUp({ to, duration = 750 }: { to: number; duration?: number }) {
  const [displayed, setDisplayed] = useState(0);
  const didAnimate = useRef(false);

  useEffect(() => {
    if (didAnimate.current) {
      // After first mount: just snap to new value
      setDisplayed(to);
      return;
    }
    didAnimate.current = true;
    if (to === 0) return;

    const start = performance.now();
    const tick  = (now: number) => {
      const p     = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - p) ** 3; // ease-out cubic
      setDisplayed(Math.round(to * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [to, duration]);

  return <>{displayed}</>;
}

const EASE: [number, number, number, number] = [0, 0, 0.2, 1];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const LOG_ICON: Record<ActionLog["type"], string> = {
  task: "✓", email: "↗", meeting: "◈", system: "⚙",
};

const LOG_COLORS: Record<ActionLog["type"], { bg: string; text: string; glow: string }> = {
  task:    { bg: "rgba(109,40,217,0.14)",  text: "#a78bfa", glow: "rgba(139,92,246,0.3)"   },
  email:   { bg: "rgba(6,182,212,0.10)",   text: "#67e8f9", glow: "rgba(6,182,212,0.3)"    },
  meeting: { bg: "rgba(251,191,36,0.10)",  text: "#fcd34d", glow: "rgba(251,191,36,0.3)"   },
  system:  { bg: "rgba(148,163,184,0.08)", text: "#94a3b8", glow: "rgba(148,163,184,0.2)"  },
};

interface Props {
  pending: Task[];
  completed: Task[];
  logs: ActionLog[];
  isLoading: boolean;
  error: string | null;
}

export default function RightPanel({ pending, completed, logs, isLoading, error }: Props) {
  const todayCount = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return logs.filter((l) => new Date(l.createdAt) >= midnight).length;
  }, [logs]);

  const total      = pending.length + completed.length;
  const progress   = total === 0 ? 0 : Math.round((completed.length / total) * 100);
  const recentLogs = logs.slice(0, 5);

  const backendStatus: "active" | "loading" | "error" =
    error ? "error" : isLoading ? "loading" : "active";

  // Live automation status — poll every 5s so new jobs are reflected immediately
  const [jobCount, setJobCount] = useState<number | null>(null);
  useEffect(() => {
    const poll = () =>
      getScheduled()
        .then((jobs) => setJobCount(jobs.length))
        .catch(() => setJobCount(0));
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  const automationStatus: keyof typeof STATUS_CFG =
    jobCount === null ? "loading" :
    jobCount === 0    ? "idle"    : "running";

  return (
    <motion.aside
      initial={{ x: 16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
      className="w-[280px] flex-shrink-0 h-full relative overflow-hidden"
      style={{ borderLeft: "1px solid rgba(255,255,255,0.05)" }}
    >
      {/* ── Scan line ── */}
      <div
        className="absolute left-0 right-0 h-[1px] pointer-events-none z-20 animate-scan-line"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.5) 30%, rgba(139,92,246,0.6) 50%, rgba(6,182,212,0.5) 70%, transparent 100%)",
          top: "-2px",
        }}
      />

      {/* ── Background gradient overlay ── */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 110% 50% at 50% 0%, rgba(109,40,217,0.06) 0%, transparent 70%)",
        }}
      />

      {/* ── Periodic alive pulse — bottom glow that fires every ~10s ── */}
      <motion.div
        className="absolute inset-x-0 bottom-0 h-40 pointer-events-none z-0"
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 9 }}
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(109,40,217,0.10) 0%, transparent 70%)",
        }}
      />

      {/* ── Scrollable content ── */}
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="p-5 space-y-6">

          {/* ── Overview cards ── */}
          <section>
            <PanelTitle>Overview</PanelTitle>
            <div className="mt-3 space-y-2">
              <StatCard label="Active tasks"  value={pending.length}   accent="violet" delay={0.05} />
              <StatCard label="Completed"     value={completed.length} accent="cyan"   delay={0.10} />
              <StatCard label="Actions today" value={todayCount}       accent="green"  delay={0.15} />
            </div>
          </section>

          {/* ── Goal tracker ── */}
          <section>
            <PanelTitle>Today's Progress</PanelTitle>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.22, duration: 0.4, ease: EASE }}
              className="mt-3 flex items-center gap-5 px-1"
            >
              <CircularProgress progress={progress} />

              <div className="flex-1 min-w-0">
                <p
                  className="text-[24px] font-bold leading-none tabular-nums"
                  style={{
                    color: progress === 100 ? "#34d399" : "#c4b5fd",
                    textShadow: progress === 100
                      ? "0 0 16px rgba(52,211,153,0.55)"
                      : "0 0 16px rgba(139,92,246,0.55)",
                  }}
                >
                  {progress}%
                </p>
                <p className="text-[10px] mt-1 leading-snug" style={{ color: "rgba(255,255,255,0.32)" }}>
                  {total === 0 ? "No tasks yet" : `${completed.length} of ${total} done`}
                </p>
                <AnimatePresence>
                  {progress === 100 && total > 0 && (
                    <motion.p
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[10px] mt-1"
                      style={{ color: "rgba(52,211,153,0.65)" }}
                    >
                      All done
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </section>

          {/* ── System status ── */}
          <section>
            <PanelTitle>System</PanelTitle>
            <div
              className="mt-3 rounded-xl overflow-hidden divide-y divide-white/[0.03]"
              style={{
                border: "1px solid rgba(255,255,255,0.05)",
                background: "rgba(255,255,255,0.02)",
                backdropFilter: "blur(8px)",
              }}
            >
              <StatusRow label="AI Engine"   status="active"           accent="cyan"   />
              <StatusRow label="Backend"     status={backendStatus}    accent="green"  />
              <StatusRow label="Automations" status={automationStatus} accent="violet" />
            </div>
          </section>

          {/* ── Recent activity ── */}
          <section>
            <div className="flex items-center justify-between">
              <PanelTitle>Recent Activity</PanelTitle>
              {logs.length > 0 && (
                <span className="text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,0.12)" }}>
                  {logs.length} total
                </span>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              {recentLogs.length === 0 ? (
                <p className="text-[11px] px-1 py-4" style={{ color: "rgba(255,255,255,0.14)" }}>
                  No recent activity
                </p>
              ) : (
                recentLogs.map((log, i) => (
                  <motion.div
                    key={log._id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.12 + i * 0.05, ease: EASE }}
                  >
                    <LogPreviewItem log={log} isLatest={i === 0} />
                  </motion.div>
                ))
              )}
            </div>
          </section>

        </div>
      </div>
    </motion.aside>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[9px] font-semibold uppercase tracking-[0.2em]"
      style={{ color: "rgba(255,255,255,0.18)" }}>
      {children}
    </p>
  );
}

type Accent = "violet" | "cyan" | "green";

const ACCENT: Record<Accent, { border: string; value: string; bg: string; glow: string }> = {
  violet: { border: "rgba(139,92,246,0.18)", value: "#a78bfa", bg: "rgba(109,40,217,0.07)",  glow: "rgba(139,92,246,0.15)" },
  cyan:   { border: "rgba(6,182,212,0.16)",  value: "#67e8f9", bg: "rgba(6,182,212,0.06)",   glow: "rgba(6,182,212,0.12)"  },
  green:  { border: "rgba(34,197,94,0.16)",  value: "#86efac", bg: "rgba(34,197,94,0.06)",   glow: "rgba(34,197,94,0.12)"  },
};

function StatCard({ label, value, accent, delay = 0 }: { label: string; value: number; accent: Accent; delay?: number }) {
  const s = ACCENT[accent];
  return (
    <motion.div
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay, ease: EASE }}
      whileHover={{ y: -2, boxShadow: `0 6px 24px rgba(0,0,0,0.35), 0 0 16px ${s.glow}` }}
      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-200"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: `0 2px 12px rgba(0,0,0,0.28), inset 0 1px 0 ${s.glow.replace("0.15", "0.25")}`,
        cursor: "default",
      }}
    >
      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.32)" }}>{label}</span>
      <span className="text-[22px] font-semibold tabular-nums leading-none"
        style={{ color: s.value, textShadow: `0 0 10px ${s.glow}` }}>
        <CountUp to={value} />
      </span>
    </motion.div>
  );
}

const STATUS_CFG = {
  active:   { dot: "#22c55e",                label: "Active",     color: "rgba(34,197,94,0.7)",    glow: "rgba(34,197,94,0.4)"    },
  loading:  { dot: "#f59e0b",                label: "Connecting", color: "rgba(245,158,11,0.7)",   glow: "rgba(245,158,11,0.4)"   },
  error:    { dot: "#ef4444",                label: "Error",      color: "rgba(239,68,68,0.7)",    glow: "rgba(239,68,68,0.4)"    },
  inactive: { dot: "rgba(255,255,255,0.12)", label: "Inactive",   color: "rgba(255,255,255,0.2)",  glow: "transparent"            },
  idle:     { dot: "#8b5cf6",                label: "Idle",       color: "rgba(139,92,246,0.65)",  glow: "rgba(139,92,246,0.35)"  },
  running:  { dot: "#22c55e",                label: "Running",    color: "rgba(34,197,94,0.75)",   glow: "rgba(34,197,94,0.45)"   },
} as const;

function StatusRow({
  label, status, accent,
}: {
  label: string;
  status: keyof typeof STATUS_CFG;
  accent: Accent;
}) {
  const s = STATUS_CFG[status];
  const a = ACCENT[accent];
  const isActive = status === "active" || status === "running";

  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 group transition-colors duration-150 hover:bg-white/[0.02]">
      <div className="flex items-center gap-2">
        <span className="text-[10px]" style={{ color: a.value, opacity: 0.5 }}>◆</span>
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.38)" }}>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <motion.span
          animate={isActive ? { scale: [1, 0.8, 1], opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: s.dot, boxShadow: `0 0 6px ${s.glow}` }}
        />
        <span className="text-[10px]" style={{ color: s.color }}>{s.label}</span>
      </div>
    </div>
  );
}

function LogPreviewItem({ log, isLatest }: { log: ActionLog; isLatest: boolean }) {
  const c = LOG_COLORS[log.type];
  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15 }}
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-default"
      style={{
        background: isLatest ? `${c.bg.replace("0.1", "0.14")}` : "rgba(255,255,255,0.022)",
        border: isLatest
          ? `1px solid ${c.glow.replace("0.3", "0.2")}`
          : "1px solid rgba(255,255,255,0.045)",
        backdropFilter: "blur(8px)",
        boxShadow: isLatest ? `0 0 12px ${c.glow.replace("0.3", "0.06")}` : "none",
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold mt-0.5"
        style={{
          background: c.bg,
          color: c.text,
          boxShadow: isLatest ? `0 0 8px ${c.glow}` : "none",
        }}
      >
        {LOG_ICON[log.type]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium leading-snug truncate" style={{ color: c.text }}>
          {log.title}
        </p>
        {log.details && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.18)" }}>
            {log.details}
          </p>
        )}
      </div>

      {/* Status + time */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0 mt-0.5">
        <motion.span
          animate={isLatest && log.status === "success" ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 1.5, repeat: 2, ease: "easeInOut" }}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: log.status === "success" ? "#22c55e" : "#ef4444",
            boxShadow: log.status === "success" ? "0 0 5px rgba(34,197,94,0.6)" : "0 0 5px rgba(239,68,68,0.6)",
          }}
        />
        <span className="text-[9px] tabular-nums" style={{ color: "rgba(255,255,255,0.14)" }}>
          {timeAgo(log.createdAt)}
        </span>
      </div>
    </motion.div>
  );
}

// ── Circular progress with glow ring ──────────────────────────────────────────

function CircularProgress({ progress }: { progress: number }) {
  const R = 26, C = 2 * Math.PI * R;
  const offset = C * (1 - progress / 100);
  const done = progress === 100;

  const arcGlow    = done ? "rgba(52,211,153,0.50)"  : "rgba(139,92,246,0.50)";
  const arcGlowFar = done ? "rgba(52,211,153,0.18)"  : "rgba(139,92,246,0.18)";
  const fillA      = done ? "rgba(52,211,153,0.20)"  : "rgba(139,92,246,0.22)";
  const fillB      = done ? "rgba(52,211,153,0.05)"  : "rgba(99,102,241,0.06)";

  return (
    <div className="relative flex-shrink-0 w-[62px] h-[62px]">

      {/* Circular glow — clipped to exact circle, no rectangular bleed */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ borderRadius: "50%", overflow: "hidden" }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: `radial-gradient(circle at center, ${fillA} 0%, ${fillB} 48%, transparent 68%)`,
          }}
        />
      </div>

      <svg width="62" height="62" viewBox="0 0 62 62" className="relative">
        {/* Track */}
        <circle cx="31" cy="31" r={R} stroke="rgba(255,255,255,0.05)" strokeWidth="4.5" fill="none" />
        {/* Progress arc */}
        <motion.circle
          cx="31" cy="31" r={R}
          stroke="url(#pgGrad)"
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            transformOrigin: "31px 31px",
            transform: "rotate(-90deg)",
            filter: `drop-shadow(0 0 4px ${arcGlow}) drop-shadow(0 0 9px ${arcGlowFar})`,
          }}
        />
        <defs>
          <linearGradient id="pgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={done ? "#34d399" : "#a78bfa"} />
            <stop offset="100%" stopColor={done ? "#6ee7b7" : "#6366f1"} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
