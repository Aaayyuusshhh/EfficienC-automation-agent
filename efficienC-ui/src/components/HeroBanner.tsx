import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import WeatherWidget from "./WeatherWidget";

type SystemStatus = "active" | "loading" | "error";
export type PresenceMode = "idle" | "listening" | "complete";
interface Props {
  backendStatus: SystemStatus;
  presenceMode?: PresenceMode;
}

const EASE: [number, number, number, number] = [0, 0, 0.2, 1];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

// ── AI presence line — mode-aware, premium tone ───────────────────────────────
const IDLE_LINES = [
  "Awaiting intent.",
  "Ready when you are.",
  "System standing by.",
] as const;

function AiPresenceLine({ mode }: { mode: PresenceMode }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (mode !== "idle") return;
    const t = setInterval(() => setIdx((i) => (i + 1) % IDLE_LINES.length), 7000);
    return () => clearInterval(t);
  }, [mode]);

  const text =
    mode === "listening" ? "Listening." :
    mode === "complete"  ? "Command recognized." :
    IDLE_LINES[idx];

  const lineKey = mode === "idle" ? `idle-${idx}` : mode;
  const isListening = mode === "listening";

  return (
    <div className="h-4 flex items-center" aria-hidden>
      <AnimatePresence mode="wait">
        <motion.span
          key={lineKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: isListening ? 0.8 : 0.68 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-[11px] tracking-wide select-none"
          style={{
            color: isListening ? "rgba(239,68,68,0.8)" : "rgba(255,255,255,0.68)",
            textShadow: isListening
              ? "0 0 18px rgba(239,68,68,0.4)"
              : "0 0 20px rgba(139,92,246,0.45)",
          }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ── Particles (minimal, decorative only) ─────────────────────────────────────
const PARTICLES = [
  { x: "16%", y: "28%", r: 1.5, delay: "0s",   dur: "4.5s" },
  { x: "74%", y: "60%", r: 1,   delay: "1.6s", dur: "5.2s" },
  { x: "54%", y: "15%", r: 1,   delay: "0.9s", dur: "3.8s" },
  { x: "89%", y: "42%", r: 1.5, delay: "2.4s", dur: "4.8s" },
  { x: "32%", y: "80%", r: 1,   delay: "1.2s", dur: "4.2s" },
] as const;

// ── Status dot config ─────────────────────────────────────────────────────────
const DOT_CFG = {
  cyan:   { color: "#06b6d4", halo: "rgba(6,182,212,0.5)",   label: "AI"      },
  green:  { color: "#22c55e", halo: "rgba(34,197,94,0.5)",   label: "Backend" },
  amber:  { color: "#f59e0b", halo: "rgba(245,158,11,0.5)",  label: "Backend" },
  red:    { color: "#ef4444", halo: "rgba(239,68,68,0.5)",   label: "Backend" },
  violet: { color: "#8b5cf6", halo: "rgba(139,92,246,0.5)",  label: "Voice"   },
} as const;
type DotKey = keyof typeof DOT_CFG;

// ── Live clock — dominant system clock ───────────────────────────────────────
function LiveClock({ now }: { now: Date }) {
  const raw  = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  // raw = "09:34 AM" → split into time part + ampm part
  const parts = raw.split(" ");
  const hhmm  = parts[0];  // "09:34"
  const ampm  = parts[1] ?? "";  // "AM" / "PM"
  const ss    = now.getSeconds().toString().padStart(2, "0");

  return (
    <div className="flex items-end gap-2 select-none">
      {/* ── HH:MM — large, dominant ── */}
      <div className="relative">
        {/* Soft radial glow behind digits */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 120% 180% at 50% 50%, rgba(6,182,212,0.12) 0%, rgba(139,92,246,0.08) 40%, transparent 70%)",
            filter: "blur(10px)",
            transform: "scale(1.5)",
          }}
        />
        <AnimatePresence mode="wait">
          <motion.span
            key={hhmm}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="relative font-mono tabular-nums font-bold leading-none tracking-tight"
            style={{
              fontSize: "clamp(28px, 4vw, 36px)",
              color: "rgba(255,255,255,0.82)",
              textShadow:
                "0 0 24px rgba(6,182,212,0.3), 0 0 48px rgba(139,92,246,0.18), 0 2px 4px rgba(0,0,0,0.5)",
            }}
          >
            {hhmm}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* ── AM/PM + seconds column ── */}
      <div className="flex flex-col items-start gap-1 pb-1">
        <span
          className="font-semibold tracking-[0.16em] uppercase leading-none"
          style={{ fontSize: "11px", color: "rgba(255,255,255,0.32)" }}
        >
          {ampm}
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={ss}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.2 }}
            className="font-mono tabular-nums leading-none"
            style={{ fontSize: "12px", color: "rgba(255,255,255,0.22)" }}
          >
            :{ss}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Status dot with pulse ring ────────────────────────────────────────────────
function StatusDot({ dotKey, pulse }: { dotKey: DotKey; pulse?: boolean }) {
  const { color, halo, label } = DOT_CFG[dotKey];
  return (
    <div className="flex items-center gap-2">
      {/* Dot + ring container */}
      <div className="relative w-3 h-3 flex items-center justify-center flex-shrink-0">
        {/* Expanding halo ring */}
        {pulse && (
          <span
            className="absolute inset-0 rounded-full animate-pulse-ring"
            style={{ background: color, transformOrigin: "center" }}
          />
        )}
        {/* Core dot */}
        <motion.span
          animate={pulse ? { scale: [1, 0.78, 1], opacity: [1, 0.7, 1] } : {}}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          className="relative w-2 h-2 rounded-full z-10"
          style={{
            background: color,
            boxShadow: `0 0 6px ${halo}, 0 0 12px ${halo.replace("0.5", "0.25")}`,
          }}
        />
      </div>
      <span
        className="font-medium leading-none tracking-wide"
        style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)" }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HeroBanner({ backendStatus, presenceMode = "idle" }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const backendDot: DotKey =
    backendStatus === "active"  ? "green" :
    backendStatus === "loading" ? "amber" : "red";

  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative rounded-2xl overflow-hidden mb-6"
      style={{
        background:
          "radial-gradient(ellipse 85% 70% at 15% 50%, rgba(109,40,217,0.20) 0%, transparent 55%)," +
          "linear-gradient(135deg, rgba(109,40,217,0.13) 0%, rgba(12,20,36,0.95) 38%, rgba(8,14,28,0.99) 100%)",
        border: "1px solid rgba(139,92,246,0.18)",
        boxShadow:
          "0 0 0 1px rgba(139,92,246,0.08) inset," +
          "0 1px 0 rgba(139,92,246,0.35) inset," +
          "0 0 64px rgba(109,40,217,0.10)," +
          "0 0 120px rgba(109,40,217,0.05)," +
          "0 16px 56px rgba(0,0,0,0.6)",
      }}
    >
      {/* ── Top edge glow line (cyan→violet→cyan) ── */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none z-10"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.5) 15%, rgba(139,92,246,0.85) 50%, rgba(6,182,212,0.5) 85%, transparent 100%)",
        }}
      />

      {/* ── Bottom edge subtle line ── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px pointer-events-none z-10"
        style={{
          background:
            "linear-gradient(90deg, transparent 20%, rgba(139,92,246,0.12) 50%, transparent 80%)",
        }}
      />

      {/* ── Pulsing background glow ── */}
      <motion.div
        className="absolute inset-0 pointer-events-none rounded-2xl"
        animate={{ opacity: [0.4, 0.75, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse 75% 55% at 20% 55%, rgba(109,40,217,0.18) 0%, transparent 65%)",
        }}
      />

      {/* ── Slow light sweep ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
        <div
          className="absolute top-0 bottom-0 w-[90px] animate-hero-sweep"
          style={{
            left: 0,
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.025), rgba(139,92,246,0.07), rgba(6,182,212,0.04), rgba(255,255,255,0.025), transparent)",
          }}
        />
      </div>

      {/* ── Floating particles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: p.x, top: p.y,
              width: p.r * 2, height: p.r * 2,
              background: i % 2 === 0 ? "#8b5cf6" : "#06b6d4",
              animationName: "particle-blink",
              animationDuration: p.dur,
              animationDelay: p.delay,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              opacity: 0.06,
            }}
          />
        ))}
      </div>

      {/* ── Corner ambient glows ── */}
      <div
        className="absolute top-0 left-0 w-64 h-40 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top left, rgba(109,40,217,0.25) 0%, transparent 65%)",
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-44 h-32 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at bottom right, rgba(6,182,212,0.09) 0%, transparent 65%)",
        }}
      />

      {/* ── Main content ── */}
      <div className="relative z-10 px-7 py-6 flex items-center justify-between gap-6">

        {/* Left: vertical stack with proper rhythm */}
        <div className="flex-1 min-w-0 space-y-0">

          {/* DATE — contextual, uppercase, premium tracking */}
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: EASE }}
            className="font-medium uppercase leading-none mb-3"
            style={{
              fontSize: "12px",
              letterSpacing: "0.2em",
              color: "rgba(139,92,246,0.55)",
            }}
          >
            {fmtDate(now)}
          </motion.p>

          {/* GREETING — dominant headline */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.45, ease: EASE }}
            className="relative mb-2"
          >
            {/* Breathing glow behind text */}
            <div
              className="absolute pointer-events-none animate-glow-breathe"
              style={{
                top: "50%", left: 0,
                width: "60%", height: "52px",
                transform: "translateY(-50%)",
                background: "rgba(109,40,217,0.3)",
                filter: "blur(24px)",
                borderRadius: "50%",
              }}
            />
            <h2
              className="relative font-semibold tracking-tight leading-none"
              style={{
                fontSize: "clamp(22px, 3.2vw, 28px)",
                color: "rgba(255,255,255,0.90)",
              }}
            >
              {getGreeting()},{" "}
              <span
                style={{
                  background: "linear-gradient(90deg, #c4b5fd 0%, #a78bfa 40%, #67e8f9 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 10px rgba(139,92,246,0.5))",
                }}
              >
                Aayush
              </span>
            </h2>
          </motion.div>

          {/* AI PRESENCE LINE — subtle rotating status */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.30 }}
            className="mb-3"
          >
            <AiPresenceLine mode={presenceMode} />
          </motion.div>

          {/* TIME — live system clock, visually dominant */}
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.36, duration: 0.4, ease: EASE }}
            className="mb-5"
          >
            <LiveClock now={now} />
          </motion.div>

          {/* STATUS ROW — breathing indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.44 }}
            className="flex items-center gap-6"
          >
            {/* Thin divider accent */}
            <div className="w-4 h-px flex-shrink-0"
              style={{ background: "rgba(139,92,246,0.3)" }} />

            <StatusDot dotKey="cyan"       pulse />
            <StatusDot dotKey={backendDot} pulse={backendStatus === "active"} />
            <StatusDot dotKey="violet"     pulse />
          </motion.div>
        </div>

        {/* Right: weather with floating aura */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5, ease: EASE }}
          className="relative flex-shrink-0"
        >
          {/* Glow aura around widget */}
          <div
            className="absolute pointer-events-none animate-glow-breathe"
            style={{
              inset: "-10px",
              borderRadius: "20px",
              background:
                "radial-gradient(ellipse at center, rgba(6,182,212,0.12) 0%, rgba(109,40,217,0.08) 50%, transparent 70%)",
              filter: "blur(8px)",
            }}
          />
          <WeatherWidget />
        </motion.div>

      </div>
    </motion.div>
  );
}
