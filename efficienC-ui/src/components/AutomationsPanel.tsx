import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getScheduled, deleteScheduled, type ScheduledJob } from "../api";

const EASE: [number, number, number, number] = [0, 0, 0.2, 1];

function formatSpec(job: ScheduledJob): string {
  if (job.type === "timeout") {
    const d = new Date(job.spec);
    if (!isNaN(d.getTime())) {
      return `Once at ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} on ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    return job.spec;
  }
  // Parse cron: "30 21 * * *" → "Daily at 9:30 PM"
  const parts = job.spec.split(" ");
  if (parts.length === 5) {
    const [min, hr, , , dow] = parts;
    const h = parseInt(hr);
    const m = parseInt(min);
    if (!isNaN(h) && !isNaN(m)) {
      const timeStr = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
      if (dow === "*")   return `Daily at ${timeStr}`;
      if (dow === "1-5") return `Weekdays at ${timeStr}`;
      const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayName = DAY[parseInt(dow)];
      if (dayName) return `Every ${dayName} at ${timeStr}`;
    }
  }
  return job.spec;
}

export default function AutomationsPanel() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await getScheduled();
      setJobs(data);
    } catch {
      setError("Could not load scheduled jobs. Is the server running?");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const t = setInterval(() => fetchJobs(true), 5000);
    return () => clearInterval(t);
  }, [fetchJobs]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setError(null);
    try {
      await deleteScheduled(id);
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel automation. Restart the server and try again.");
      fetchJobs(true);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <motion.div
      key="automations-view"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[13px] font-semibold text-white/80">Automations</h3>
          <p className="text-[11px] text-white/25 mt-0.5">
            Scheduled tasks running in this session
          </p>
        </div>
        <button
          onClick={fetchJobs}
          className="p-1.5 rounded-lg text-white/20 hover:text-violet-400 hover:bg-violet-500/10 transition-colors duration-150"
          title="Refresh"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {/* Info note */}
      <div
        className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl mb-5 border border-amber-500/[0.12]"
        style={{ background: "rgba(251,191,36,0.04)" }}
      >
        <svg className="text-amber-400/60 flex-shrink-0 mt-0.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-[10px] text-amber-400/50 leading-relaxed">
          Jobs live in-memory. They reset on server restart. Use commands like{" "}
          <span className="text-amber-400/70 font-mono">"every day at 9pm remind me to study"</span>
          {" "}to schedule new ones.
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-[60px] rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-3">
            <svg className="text-red-400/60" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-[12px] text-red-400/60">{error}</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-14">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/[0.07]"
            style={{ background: "rgba(109,40,217,0.08)" }}
          >
            <svg className="text-violet-400/40" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <p className="text-[13px] text-white/30">No scheduled automations yet</p>
          <p className="text-[11px] text-white/15 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
            Try:{" "}
            <span className="text-white/25 font-mono">"remind me daily at 9 PM to review tasks"</span>
          </p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <div className="space-y-2">
            {jobs.map((job, i) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22, delay: i * 0.05, ease: EASE }}
                className="group flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200 hover:border-violet-500/20"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* Type icon */}
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
                  style={{ background: "rgba(109,40,217,0.12)" }}
                >
                  {job.type === "cron" ? (
                    <svg className="text-violet-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  ) : (
                    <svg className="text-sky-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-white/70 leading-snug truncate">{job.label}</p>
                  <p className="text-[10px] text-white/30 mt-0.5 font-mono">{formatSpec(job)}</p>
                </div>

                {/* Badge */}
                <span
                  className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full mt-0.5"
                  style={{
                    background: job.type === "cron" ? "rgba(109,40,217,0.15)" : "rgba(56,189,248,0.12)",
                    color: job.type === "cron" ? "#a78bfa" : "#7dd3fc",
                    border: `1px solid ${job.type === "cron" ? "rgba(139,92,246,0.2)" : "rgba(56,189,248,0.2)"}`,
                  }}
                >
                  {job.type === "cron" ? "Recurring" : "One-time"}
                </span>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(job.id)}
                  disabled={deleting === job.id}
                  title="Remove automation"
                  className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-red-500/15"
                  style={{ color: "rgba(248,113,113,0.6)" }}
                >
                  {deleting === job.id ? (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  ) : (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}
