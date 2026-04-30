import { useState, useEffect, useCallback, useRef, type ReactElement } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CommandInput from "./components/CommandInput";
import TaskCard, { type Task } from "./components/TaskCard";
import ActivityFeed from "./components/ActivityFeed";
import ResponsePanel from "./components/ResponsePanel";
import Sidebar from "./components/Sidebar";
import RightPanel from "./components/RightPanel";
import HeroBanner, { type PresenceMode } from "./components/HeroBanner";
import AutomationsPanel from "./components/AutomationsPanel";
import SettingsPanel from "./components/SettingsPanel";
import NotificationToast, { type ToastNotification } from "./components/NotificationToast";
import * as api from "./api";
import type { ActionLog } from "./api";


function formatNotificationBody(label: string): string {
  const lower = label.toLowerCase().trim();
  if (lower === "reminder") return "It's time for your reminder";
  const hasVerb = /\b(call|message|text|email|meet|send|check|review|buy|do|go|complete|finish|attend|prepare|submit|start|open|close|read|write|fix|update)\b/i.test(lower);
  return hasVerb ? label.charAt(0).toUpperCase() + label.slice(1) : `Time to ${lower}`;
}

const EASE: [number, number, number, number] = [0, 0, 0.2, 1];

export default function App() {
  const [pending, setPending] = useState<Task[]>([]);
  const [completed, setCompleted] = useState<Task[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);

  // Tracks timestamp of last notification — catches all new system logs, not just logs[0]
  const lastNotifiedAtRef = useRef<number>(Date.now());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ActionLog | null>(null);
  const [lastExplanation, setLastExplanation] = useState<string | null>(null);
  const [lastSimulatedResult, setLastSimulatedResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState("tasks");
  const [presenceMode, setPresenceMode] = useState<PresenceMode>("idle");
  // Pre-fill command input from contextual follow-up chips
  const [fillRequest, setFillRequest] = useState<{ text: string; seq: number } | undefined>();
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  const handleFollowUp = useCallback((text: string) => {
    setFillRequest({ text, seq: Date.now() });
  }, []);

  // Request browser notification permission once on load
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Verify audio file is accessible
  useEffect(() => {
    fetch("/reminder.mp3")
      .then(res => console.log("🎵 Audio file status:", res.status, res.ok ? "OK" : "MISSING"))
      .catch(err => console.log("🎵 Audio file fetch failed:", err));
  }, []);

  // Unlock audio context on first user interaction — required by Chrome autoplay policy
  useEffect(() => {
    const unlock = async () => {
      try {
        const audio = new Audio("/reminder.mp3");
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        console.log("🔓 Audio unlocked");
      } catch (e) {
        console.log("🔓 Audio unlock failed:", e);
      }
      window.removeEventListener("click", unlock);
    };
    window.addEventListener("click", unlock);
    return () => window.removeEventListener("click", unlock);
  }, []);

  // ── In-app toast notification (SSE path) ─────────────────────────────────────

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const showCustomNotification = useCallback((label: string) => {
    lastNotifiedAtRef.current = Date.now();
    const body = formatNotificationBody(label);

    // Amplified playback via Web Audio gain node
    const playSound = () => {
      try {
        const audio = new Audio("/reminder.mp3");
        audio.volume = 1.0;
        audio.currentTime = 0;
        const ctx = audioCtxRef.current
          ?? new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        gain.gain.value = 1.5;
        source.connect(gain);
        gain.connect(ctx.destination);
        audio.play()
          .then(() => console.log("✅ SOUND PLAYED"))
          .catch((e) => console.log("❌ SOUND FAILED:", e));
      } catch {
        const audio = new Audio("/reminder.mp3");
        audio.volume = 1.0;
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    };

    // Play immediately, repeat once after 420ms for attention
    const playPattern = () => {
      playSound(); // 1st
      setTimeout(playSound, 420);  // 2nd

      setTimeout(() => {
        playSound();               // 3rd
        setTimeout(playSound, 420); // 4th
      }, 1200);

      setTimeout(() => {
        playSound();               // 5th
        setTimeout(playSound, 420); // 6th
      }, 2400);
    };

    playPattern();

    // Toast appears after first play has started
    setTimeout(() => {
      setNotifications(prev => [
        ...prev.slice(-2),
        { id: `notif-${Date.now()}`, body, timestamp: Date.now() },
      ]);
    }, 100);
  }, []);

  // ── SW / system notification (polling fallback only) ─────────────────────────

  const triggerNotification = useCallback((label: string) => {
    lastNotifiedAtRef.current = Date.now();
    const body = formatNotificationBody(label);
    const audio = new Audio("/reminder.mp3");
    audio.volume = 1.0;
    audio.currentTime = 0;
    audio.play().catch(() => { });
    setTimeout(() => {
      const swCtrl = "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
      if (swCtrl) {
        swCtrl.postMessage({ type: "SHOW_NOTIFICATION", title: "EfficienC Reminder", body });
      } else {
        new Notification("EfficienC Reminder", { body });
      }
    }, 120);
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async (): Promise<ActionLog[] | null> => {
    try {
      const [p, c, l] = await Promise.all([
        api.getTasks("pending"),
        api.getTasks("completed"),
        api.getLogs(),
      ]);
      setPending(p);
      setCompleted(c);
      setLogs(l);

      // Polling fallback — fires only if SSE missed the event (tab was closed, etc.)
      if (l.length > 0 && "Notification" in window && Notification.permission === "granted") {
        const cutoff = lastNotifiedAtRef.current;
        const fresh = l.filter(
          log => log.type === "system" &&
            log.status === "success" &&
            new Date(log.createdAt).getTime() > cutoff
        );
        if (fresh.length > 0) {
          const raw = fresh[0].title.replace(/^🔔\s*Reminder:\s*/i, "").trim();
          triggerNotification(raw);
        }
      }

      return l;
    } catch {
      setError("Could not load tasks. Is the server running?");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [triggerNotification]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ── SSE — instant notification when scheduler fires ───────────────────────
  useEffect(() => {
    if (!("EventSource" in window)) return;

    const es = new EventSource("http://localhost:5000/events");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "REMINDER_TRIGGER") {
          if (document.hidden) {
            triggerNotification(data.label); // system notification when tab is not visible
          } else {
            showCustomNotification(data.label); // premium in-app toast when tab is active
          }
          fetchTasks();
        }
      } catch { /* ignore malformed frames */ }
    };
    es.onerror = () => { };
    return () => es.close();
  }, [showCustomNotification, triggerNotification, fetchTasks]);

  // Periodic background refresh — picks up scheduler-triggered log events
  useEffect(() => {
    const t = setInterval(() => { fetchTasks(); }, 10_000);
    return () => clearInterval(t);
  }, [fetchTasks]);

  // Immediate poll when tab regains focus — bypasses browser throttling
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") fetchTasks(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchTasks]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCommand = async (command: string) => {
    setIsProcessing(true);
    setLastCommand(command);
    setLastResult(null);
    setLastExplanation(null);
    setLastSimulatedResult(null);
    setError(null);
    setPresenceMode("idle");
    try {
      const cmdResult = await api.sendCommand(command);
      const latestLogs = await fetchTasks();
      await new Promise((r) => setTimeout(r, 160));
      setPresenceMode("complete");
      setTimeout(() => setPresenceMode("idle"), 4000);
      if (latestLogs && latestLogs.length > 0) {
        setLastResult(latestLogs[0]);
      }
      if (cmdResult.simulated_result) setLastSimulatedResult(cmdResult.simulated_result);
      if (cmdResult.explanation) setLastExplanation(cmdResult.explanation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Command failed. Please try again.");
      setPresenceMode("idle");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = async (title: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      await api.completeTask(title);
      await fetchTasks();
    } catch {
      setError("Failed to complete task.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (title: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      await api.deleteTask(title);
      await fetchTasks();
    } catch {
      setError("Failed to delete task.");
    } finally {
      setIsProcessing(false);
    }
  };

  const backendStatus: "active" | "loading" | "error" =
    error ? "error" : isLoading ? "loading" : "active";

  const totalTasks = pending.length + completed.length;

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="h-screen bg-[#080e1c] bg-system-grid flex overflow-hidden"
      style={{ fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif" }}
    >
      {/* ── Background ambient blobs ── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute" style={{ top: "-15%", left: "-10%", width: "65%", height: "70%", background: "radial-gradient(ellipse at center, rgba(109,40,217,0.09) 0%, transparent 68%)" }} />
        <div className="absolute" style={{ bottom: "-12%", right: "-8%", width: "50%", height: "60%", background: "radial-gradient(ellipse at center, rgba(6,182,212,0.045) 0%, transparent 68%)" }} />
        <div className="absolute" style={{ bottom: "10%", left: "25%", right: "25%", height: "40%", background: "radial-gradient(ellipse at center, rgba(139,92,246,0.04) 0%, transparent 70%)" }} />
      </div>

      {/* Top edge glow line */}
      <div
        className="pointer-events-none fixed top-0 inset-x-0 h-[1px] z-50"
        style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.55), rgba(6,182,212,0.25), rgba(139,92,246,0.55), transparent)" }}
      />

      {/* ── Sidebar ── */}
      <Sidebar
        activeNav={activeNav}
        onNavChange={setActiveNav}
        pendingCount={pending.length}
      />

      {/* ── Center column ── */}
      <main className="flex-1 min-w-0 overflow-y-auto relative">

        {/* Ambient violet glow behind hero */}
        <div
          className="pointer-events-none absolute top-0 inset-x-0 h-96"
          style={{
            background:
              "radial-gradient(ellipse 70% 40% at 50% -5%, rgba(109,40,217,0.10) 0%, transparent 100%)",
          }}
        />

        <div className="relative max-w-[700px] mx-auto px-8 py-8">

          {/* ── Hero banner (always visible) ── */}
          <HeroBanner backendStatus={backendStatus} presenceMode={presenceMode} />

          {/* ── Command input (hero element — always visible) ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12, ease: EASE }}
            className="mb-5"
          >
            <CommandInput onSubmit={handleCommand} isProcessing={isProcessing} fillRequest={fillRequest} />

            <AnimatePresence>
              {isProcessing && lastCommand && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="mt-3 ml-1 flex items-center gap-2"
                >
                  <motion.span
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                    className="inline-block w-1 h-1 rounded-full bg-violet-400 flex-shrink-0"
                  />
                  <p className="text-[11px] text-white/25">
                    AI thinking…
                  </p>
                </motion.div>
              )}
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="mt-2.5 ml-1 flex items-start gap-2"
                >
                  {error.trimEnd().endsWith("?") ? (
                    // Clarification question — amber, neutral tone
                    <>
                      <span className="text-[10px] text-amber-400/60 flex-shrink-0 mt-px">◇</span>
                      <p className="text-[11px] text-amber-400/80">{error}</p>
                    </>
                  ) : (
                    // Hard error — red
                    <>
                      <span className="text-[10px] text-red-400/50 flex-shrink-0 mt-px">⚠</span>
                      <p className="text-[11px] text-red-400/70">{error}</p>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── Response panel ── */}
          <AnimatePresence>
            {lastResult && !isProcessing && (
              <motion.div
                key="response"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.25, delay: 0.25, ease: EASE }}
                className="mb-6"
              >
                <ResponsePanel result={lastResult} onFollowUp={handleFollowUp} explanation={lastExplanation ?? undefined} simulatedResult={lastSimulatedResult ?? undefined} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Tab content ── */}
          <AnimatePresence mode="wait">

            {/* Activity tab */}
            {activeNav === "activity" && (
              <motion.div
                key="activity-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                <PageHeader
                  title="Activity"
                  subtitle={`${logs.length} action${logs.length !== 1 ? "s" : ""} logged`}
                />
                {logs.length > 0 ? (
                  <ActivityFeed logs={logs} />
                ) : (
                  <EmptyHint
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    }
                    title="No activity yet."
                    subtitle="Actions will appear here once you start using the assistant."
                  />
                )}
              </motion.div>
            )}

            {/* Automations tab */}
            {activeNav === "automations" && (
              <motion.div
                key="automations-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                <AutomationsPanel />
              </motion.div>
            )}

            {/* Settings tab */}
            {activeNav === "settings" && (
              <motion.div
                key="settings-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                <PageHeader title="Settings" subtitle="Contacts, integrations & preferences" />
                <SettingsPanel />
              </motion.div>
            )}

            {/* Tasks tab (default) */}
            {activeNav === "tasks" && (
              <motion.div
                key="tasks-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                <PageHeader
                  title="Tasks"
                  subtitle={
                    isLoading
                      ? "Loading…"
                      : pending.length > 0
                        ? `${pending.length} active task${pending.length !== 1 ? "s" : ""} — type a command to manage them`
                        : "All caught up. Type a command to add a new task."
                  }
                />

                {/* Loading skeleton */}
                <AnimatePresence>
                  {isLoading && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-[46px] rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)", opacity: 1 - i * 0.2 }} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Active tasks */}
                <AnimatePresence>
                  {!isLoading && pending.length > 0 && (
                    <motion.section
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.28, delay: 0.08, ease: EASE }}
                      className="mb-6"
                    >
                      <SectionHeader label="Active" count={pending.length} accent="violet" />
                      <div className="space-y-1.5">
                        <AnimatePresence initial={false}>
                          {pending.map((task, i) => (
                            <TaskCard key={task.id} task={task} onComplete={handleComplete} onDelete={handleDelete} index={i} />
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>

                {/* Completed tasks */}
                <AnimatePresence>
                  {!isLoading && completed.length > 0 && (
                    <motion.section
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.28, delay: 0.14, ease: EASE }}
                      className="mb-6"
                    >
                      <SectionHeader label="Completed" count={completed.length} accent="emerald" />
                      <div className="space-y-1.5">
                        <AnimatePresence initial={false}>
                          {completed.map((task, i) => (
                            <TaskCard key={task.id} task={task} onComplete={handleComplete} onDelete={handleDelete} index={i} />
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>

                {/* Empty state */}
                <AnimatePresence>
                  {!isLoading && totalTasks === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                    >
                      <EmptyHint
                        icon={
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                          </svg>
                        }
                        title="No tasks yet."
                        subtitle="Type a command above to get started."
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* ── Right panel ── */}
      <RightPanel
        pending={pending}
        completed={completed}
        logs={logs}
        isLoading={isLoading}
        error={error}
      />

      {/* ── In-app notification toasts ── */}
      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />

    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="mb-5"
    >
      <h1 className="text-[18px] font-semibold text-white/80 tracking-tight leading-none mb-1">
        {title}
      </h1>
      <p className="text-[12px] text-white/25">{subtitle}</p>
    </motion.div>
  );
}

type SectionAccent = "violet" | "emerald";

const SECTION_ACCENT: Record<SectionAccent, string> = {
  violet: "rgba(139,92,246,0.5)",
  emerald: "rgba(52,211,153,0.5)",
};

function SectionHeader({ label, count, accent }: { label: string; count: number; accent: SectionAccent }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span
        className="w-1 h-3 rounded-full flex-shrink-0"
        style={{ background: SECTION_ACCENT[accent] }}
      />
      <span className="text-[10px] font-semibold text-white/20 uppercase tracking-widest">
        {label}
      </span>
      <span
        className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.2)",
        }}
      >
        {count}
      </span>
    </div>
  );
}

function EmptyHint({ icon, title, subtitle }: { icon: ReactElement; title: string; subtitle: string }) {
  return (
    <div className="text-center py-16">
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-3"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.2)",
        }}
      >
        {icon}
      </div>
      <p className="text-[13px] text-white/25">{title}</p>
      <p className="text-[11px] text-white/12 mt-1" style={{ color: "rgba(255,255,255,0.12)" }}>{subtitle}</p>
    </div>
  );
}
