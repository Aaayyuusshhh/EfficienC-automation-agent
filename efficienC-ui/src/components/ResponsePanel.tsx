import { motion, AnimatePresence } from "framer-motion";
import type { ActionLog } from "../api";

const EASE: [number, number, number, number] = [0, 0, 0.2, 1];

// ── Natural message extraction ────────────────────────────────────────────────
function toNaturalMessage(log: ActionLog): string {
  if (log.status === "failed") {
    if (/contact not found/i.test(log.title))  return log.details || "Contact not found. Add them in Settings.";
    if (/failed to send/i.test(log.title))     return "Email failed to send. Check your email configuration.";
    if (/failed to schedule/i.test(log.title)) return "Couldn't schedule the meeting. Check that the contact exists.";
    return "Action could not be completed. Please try again.";
  }

  const colonIdx = log.title.indexOf(":");
  const hasColon = colonIdx !== -1;
  const subject  = hasColon ? log.title.slice(colonIdx + 1).trim() : log.title.trim();

  switch (log.type) {
    case "task": {
      if (/complet/i.test(log.title)) return `Task "${subject}" marked as complete.`;
      if (/delet|remov/i.test(log.title)) return `Task "${subject}" removed.`;
      if (log.details) {
        if (/^recurring:/i.test(log.details)) {
          const schedule = log.details.replace(/^recurring:\s*/i, "").trim();
          return `Recurring reminder set — "${subject}", repeats ${schedule}.`;
        }
        if (/^due:/i.test(log.details)) {
          try {
            const d = new Date(log.details.replace(/^due:\s*/i, "").trim());
            if (!isNaN(d.getTime())) {
              const t = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
              return `Task "${subject}" added, reminder at ${t}.`;
            }
          } catch { /* fall through */ }
        }
      }
      return `Task "${subject}" added successfully.`;
    }
    case "email":
      return hasColon ? `Email sent to ${subject}.` : "Email sent successfully.";
    case "meeting":
      return hasColon ? `Meeting scheduled — ${subject}.` : "Meeting scheduled.";
    case "system":
      return subject;
  }
}

// ── Contextual follow-up suggestions ─────────────────────────────────────────
function getFollowUps(log: ActionLog): string[] {
  if (log.status === "failed") return [];

  const title = log.title.toLowerCase();

  switch (log.type) {
    case "task":
      if (/complet/i.test(title)) return ["Show my remaining tasks"];
      if (/delet|remov/i.test(title)) return ["Show my tasks"];
      return ["Remind me about this daily at 9 PM", "Show all my tasks"];
    case "email":
      return ["Schedule a follow-up meeting", "Add a follow-up task"];
    case "meeting":
      return ["Send a message about the meeting", "Add a task for preparation"];
    default:
      return [];
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  result: ActionLog;
  onFollowUp?: (text: string) => void;
  explanation?: string;
  simulatedResult?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ResponsePanel({ result, onFollowUp, explanation, simulatedResult }: Props) {
  const isSuccess = result.status === "success";
  const followUps = onFollowUp ? getFollowUps(result) : [];

  const successColor = "rgba(34,197,94,";
  const failColor    = "rgba(239,68,68,";
  const accentColor  = isSuccess ? successColor : failColor;

  return (
    <div>
      {/* ── Result card with scale micro-feedback + glow pulse ── */}
      <motion.div
        initial={{ opacity: 0, y: 5, scale: 0.985 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: [0.985, 1.008, 1],
        }}
        transition={{
          opacity: { duration: 0.25, ease: EASE },
          y:       { duration: 0.25, ease: EASE },
          scale:   { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] },
        }}
      >
        {/* Glow pulse on mount */}
        <motion.div
          initial={{ boxShadow: `0 0 0px ${accentColor}0)` }}
          animate={{
            boxShadow: [
              `0 0 0px ${accentColor}0)`,
              `0 0 22px ${accentColor}0.14), 0 0 8px ${accentColor}0.08)`,
              `0 0 0px ${accentColor}0)`,
            ],
          }}
          transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
          className="rounded-xl px-4 py-3.5 flex items-start gap-3"
          style={{
            background: isSuccess
              ? "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(12,18,30,0.95))"
              : "linear-gradient(135deg, rgba(239,68,68,0.06), rgba(12,18,30,0.95))",
            border: `1px solid ${isSuccess ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"}`,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          {/* Status icon */}
          <div
            className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5"
            style={{
              background: isSuccess ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              color:      isSuccess ? "#4ade80"               : "#f87171",
            }}
          >
            {isSuccess ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] leading-snug" style={{ color: "rgba(226,232,240,0.92)" }}>
              {simulatedResult ?? toNaturalMessage(result)}
            </p>
            {result.details && (
              <p className="text-[11px] mt-1 truncate" style={{ color: "rgba(100,116,139,0.8)" }}>
                {result.details}
              </p>
            )}
            {explanation && (
              <p className="text-[10px] mt-1.5 italic" style={{ color: "rgba(255,255,255,0.28)" }}>
                {explanation}
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* ── Contextual follow-up chips ── */}
      <AnimatePresence>
        {followUps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, delay: 0.38, ease: EASE }}
            className="flex items-center gap-2 mt-3 flex-wrap"
          >
            {/* Label */}
            <span className="text-[10px] tracking-wide flex-shrink-0"
              style={{ color: "rgba(255,255,255,0.2)" }}>
              next →
            </span>

            {followUps.map((chip, i) => (
              <motion.button
                key={chip}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: 0.42 + i * 0.06, ease: EASE }}
                onClick={() => onFollowUp?.(chip)}
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-150"
                style={{
                  background: "rgba(109,40,217,0.08)",
                  border: "1px solid rgba(139,92,246,0.18)",
                  color: "rgba(196,181,253,0.7)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(109,40,217,0.16)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(196,181,253,0.95)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.32)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(109,40,217,0.08)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(196,181,253,0.7)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.18)";
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {chip}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
